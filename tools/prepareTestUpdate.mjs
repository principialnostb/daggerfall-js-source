import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { gameFilesOf, gameSeed, judgeDelta, packGame } from '../scripts/desktopRelease.mjs';

const require = createRequire(new URL('../app/package.json', import.meta.url));
const asar = require('@electron/asar');
const { GAME_CHANNEL, GAME_FILES, parseManifestFile, readSeed } = require('../app/lib/gameChannel.cjs');
const { PART_SIZE, packPartName } = require('../app/lib/testBuildUpdates.cjs');
const baseVersion = '13.11.0';
const root = resolve(import.meta.dirname, '..');
const publicBuild = process.env.DFO_TEST_PUBLIC === '1';
const repository = publicBuild ? 'principialnostb/daggerfall-js-source' : 'principialnostb/dfo-13-11-test-releases';
function seedFiles(tree, prefix = '') {
  return Object.entries(tree).flatMap(([name, entry]) => {
    const path = prefix + name;
    if (entry.files) return seedFiles(entry.files, path + '/');
    if (entry.unpacked || entry.link || entry.integrity?.algorithm !== 'SHA256') {
      throw new Error('Unable to reuse archived file ' + path);
    }
    return [{ path, size: entry.size, sha256: entry.integrity.hash }];
  });
}

function shellId(folder) {
  const hash = createHash('sha256');
  for (const file of gameFilesOf(folder)) {
    hash.update(JSON.stringify([file, createHash('sha256').update(readFileSync(join(folder, file))).digest('hex')]));
  }
  return hash.digest('hex');
}

async function digest(file) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

async function split(file, out, name) {
  const size = statSync(file).size;
  const result = [];
  for (let offset = 0; offset < size; offset += PART_SIZE) {
    const part = name(offset / PART_SIZE);
    const target = join(out, part);
    await pipeline(createReadStream(file, { start: offset, end: Math.min(offset + PART_SIZE, size) - 1 }), createWriteStream(target, { flags: 'wx' }));
    result.push({ name: part, sha256: await digest(target) });
  }
  return result;
}

function checkReleaseFiles(files) {
  const matches = files.filter((file) => /(?:^|\/)(?:arena2\/|test-saves\/|iron_(?:boot|bracer|gauntlet|cuirass|greav|helm|pauldron)|steel_plate_helm_horned|skyrim_steel_battleaxe|shield_sky_|wolf_armor_)|\.(?:bsa|esm)$/i.test(file));
  if (matches.length) throw new Error('Local game data in release input: ' + matches.slice(0, 10).join(', '));
}

function stageShell(build, shellRoot) {
  for (const name of ['main.cjs', 'lib', 'launcher', 'launcherPreload.cjs', 'preload.cjs', 'private']) {
    cpSync(join(build, name), join(shellRoot, name), { recursive: true });
  }
  const lock = JSON.parse(readFileSync(join(root, 'app/package-lock.json'), 'utf8'));
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (!name.startsWith('node_modules/') || entry.dev || name.slice(13).includes('/node_modules/')) continue;
    const installed = join(root, 'app', name);
    if (entry.optional && !existsSync(installed)) continue;
    cpSync(installed, join(shellRoot, name), { recursive: true });
  }
  const pkg = JSON.parse(readFileSync(join(build, 'package.json'), 'utf8'));
  writeFileSync(join(shellRoot, 'package.json'), JSON.stringify({ ...pkg, version: baseVersion }));
  writeFileSync(join(shellRoot, 'test-update-build.json'), JSON.stringify({ repository, ...(publicBuild ? { public: true, clientId: process.env.DFO_TEST_GITHUB_CLIENT_ID } : {}) }));
  return shellId(shellRoot);
}

function requirePublicStage(build) {
  if (publicBuild && !existsSync(join(build, 'public-test-stage'))) throw new Error('Build a public stage without bundled EMC first');
}

function legacySeed(archive) {
  const marker = JSON.parse(asar.extractFile(archive, 'pinned-test-build.json'));
  if (marker.release !== '13.11-test-medium') throw new Error('Expected the issued 13.11-test-medium client');
  return seedFiles(asar.getRawHeader(archive).header.files.dist.files);
}

async function packPublicSeed(dist, work) {
  const input = join(work, 'public-seed');
  mkdirSync(input);
  cpSync(dist, join(input, 'dist'), { recursive: true });
  const archive = join(work, 'game-seed.asar');
  await asar.createPackage(input, archive);
  return archive;
}

async function prepare(legacyPath, buildPath, outputPath, version, mode, reusablePath) {
  if (!/^13\.11\.[1-9]\d*$/.test(version ?? '')) throw new Error('Expected a release version 13.11.<positive patch>');
  const legacy = resolve(legacyPath);
  const build = resolve(buildPath);
  const output = resolve(outputPath);
  if (existsSync(output)) throw new Error('Choose an unused output directory');
  const oldArchive = join(legacy, 'client/resources/app.asar');
  const dist = join(build, 'dist');
  requirePublicStage(build);
  if (publicBuild && mode === '--reuse-assets') throw new Error('Public builds require a verified public seed and a fresh game pack');
  let reusedPublicSeed;
  if (mode === '--reuse-public-seed') {
    if (!publicBuild || !reusablePath || !/^[a-f0-9]{64}$/.test(process.env.DFO_TEST_PUBLIC_SEED_SHA ?? '')) {
      throw new Error('Supply a previously published public seed and its SHA-256');
    }
    reusedPublicSeed = resolve(reusablePath);
    if (await digest(reusedPublicSeed) !== process.env.DFO_TEST_PUBLIC_SEED_SHA) throw new Error('Public seed checksum differs from the published seed');
  }
  const files = reusedPublicSeed ? seedFiles(asar.getRawHeader(reusedPublicSeed).header.files.dist.files)
    : publicBuild ? gameSeed(dist, { version: baseVersion, shell: 'a'.repeat(64) }).files : legacySeed(oldArchive);
  checkReleaseFiles(files.map((f) => f.path));
  checkReleaseFiles(gameFilesOf(dist));
  mkdirSync(output, { recursive: true });
  const work = mkdtempSync(join(output, 'work-'));
  const shellRoot = join(work, 'shell');
  const client = join(work, 'client');
  mkdirSync(shellRoot);
  mkdirSync(join(client, 'resources'), { recursive: true });

  const shell = stageShell(build, shellRoot);
  writeFileSync(join(shellRoot, 'game-seed.json'), JSON.stringify(readSeed({ channel: GAME_CHANNEL, version: baseVersion, shell, files })));
  for (const name of readdirSync(join(legacy, 'client'))) {
    if (name !== 'resources') cpSync(join(legacy, 'client', name), join(client, name), { recursive: true });
  }
  await asar.createPackageWithOptions(shellRoot, join(client, 'resources/app.asar'), {
    unpackDir: 'node_modules/{workerd,@cloudflare/workerd-*}',
  });
  if (mode === '--local') {
    if (publicBuild) cpSync(reusedPublicSeed ?? await packPublicSeed(dist, work), join(client, 'resources/game-seed.asar'));
    else cpSync(oldArchive, join(client, 'resources/game-seed.asar'));
    console.log(join(client, 'DFO Online Mod.exe'));
    return;
  }

  const sevenZip = join(root, 'app/node_modules', '7zip-bin/win/x64/7za.exe');
  const zip = 'DFO-13.11-shell.zip';
  execFileSync(sevenZip, ['a', '-tzip', '-ssw', join(output, zip), '*'], { cwd: client, stdio: 'inherit' });

  const reusable = mode === '--reuse-assets' ? resolve(reusablePath) : null;
  const seedArchive = reusedPublicSeed ?? (publicBuild ? await packPublicSeed(dist, work) : await packSeed(legacy, files, work, output, reusable));
  const seed = await seedParts(seedArchive, output);
  await packReleaseGame(dist, work, output, { version, shell }, reusable);
  const tag = 'dfo-1311-v' + version;
  const lines = [publicBuild ? 'public:' + repository : repository, tag, zip + ' ' + await digest(join(output, zip)), publicBuild ? '-' : await digest(oldArchive), await digest(seedArchive), ...seed.map((p) => p.name + ' ' + p.sha256)];
  const config = join(work, 'setup.txt');
  writeFileSync(config, lines.join('\n'));
  const compiler = join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  execFileSync(compiler, ['/nologo', '/codepage:65001', '/target:winexe', '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll', '/reference:System.Web.Extensions.dll', '/reference:System.Drawing.dll', '/out:' + join(output, 'DFO-13.11-Setup.exe'), '/resource:' + config + ',setup.txt', join(root, 'tools/testUpdateSetup.cs')], { stdio: 'inherit' });
  console.log(tag, output);
}

async function packSeed(legacy, files, work, output, reusable) {
  if (reusable) {
    const previousWork = readdirSync(reusable).find((name) => name.startsWith('work-'));
    const archive = join(reusable, previousWork, 'game-seed.asar');
    const existing = seedFiles(asar.getRawHeader(archive).header.files.dist.files);
    const expected = new Map(files.map((file) => [file.path, file.sha256]));
    if (existing.length !== files.length || existing.some((file) => expected.get(file.path) !== file.sha256)) {
      throw new Error('Reusable seed differs from the original client');
    }
    for (const part of readdirSync(reusable).filter((name) => /^DFO-13\.11-seed\.\d+$/.test(name))) {
      linkSync(join(reusable, part), join(output, part));
    }
    return archive;
  }
  // Copy only dist. The issued archive also holds personal test saves.
  const seedSource = join(work, 'seed');
  mkdirSync(seedSource);
  const legacyDist = join(legacy, 'stage/dist');
  for (const file of files) {
    const source = join(legacyDist, file.path);
    const bytes = readFileSync(source);
    if (bytes.length !== file.size || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
      throw new Error('Issued assets differ from the local stage: ' + file.path);
    }
  }
  cpSync(legacyDist, join(seedSource, 'dist'), { recursive: true });
  if (gameFilesOf(join(seedSource, 'dist')).length !== files.length) throw new Error('Unexpected file in the seed stage');
  const seedArchive = join(work, 'game-seed.asar');
  await asar.createPackage(seedSource, seedArchive);
  return seedArchive;
}

async function seedParts(archive, output) {
  const names = readdirSync(output).filter((name) => /^DFO-13\.11-seed\.\d+$/.test(name));
  if (!names.length) return split(archive, output, (index) => 'DFO-13.11-seed.' + (index + 1));
  const expected = Math.ceil(statSync(archive).size / PART_SIZE);
  if (names.length !== expected) throw new Error('Reusable seed is missing one or more split files');
  const parts = [];
  for (let index = 0; index < expected; index++) {
    const name = 'DFO-13.11-seed.' + (index + 1);
    parts.push({ name, sha256: await digest(join(output, name)) });
  }
  return parts;
}

async function packReleaseGame(dist, work, output, { version, shell }, reusable) {
  if (reusable) {
    const old = parseManifestFile(readFileSync(join(reusable, GAME_FILES.manifest)));
    const next = gameSeed(dist, { version, shell });
    const expected = new Map(next.files.map((file) => [file.path, file.sha256]));
    if (old.files.length !== next.files.length || old.files.some((file) => expected.get(file.path) !== file.sha256)) {
      throw new Error('Reusable pack differs from the staged game');
    }
    for (let offset = 0; offset < old.pack.size; offset += PART_SIZE) {
      const name = packPartName(offset / PART_SIZE);
      linkSync(join(reusable, name), join(output, name));
    }
    writeFileSync(join(output, GAME_FILES.manifest), gzipSync(Buffer.from(JSON.stringify({ ...old, version, shell }))));
    return;
  }
  packGame(dist, work, { version, shell });
  await split(join(work, GAME_FILES.pack), output, packPartName);
  cpSync(join(work, GAME_FILES.manifest), join(output, GAME_FILES.manifest));
}

function previousShell(previous, build, work) {
  const base = process.env.DFO_TEST_PREVIOUS_SOURCE;
  if (publicBuild && /^[a-f0-9]{40}$/.test(base ?? '')) {
    execFileSync('git', ['merge-base', '--is-ancestor', base, 'HEAD'], { cwd: root });
    const inputs = ['app', '.build-13.11-test-medium.mjs', 'tools/testUpdateSetup.cs', 'tools/buildTestShell.mjs', 'public/icons/icon-512.png',
      ':(exclude)app/launcher/**'];
    const changed = execFileSync('git', ['diff', '--name-only', base, 'HEAD', '--', ...inputs], { cwd: root, encoding: 'utf8' });
    if (changed.trim()) return null;
    return previous.shell;
  }
  const shellRoot = join(work, 'shell');
  mkdirSync(shellRoot);
  const shell = stageShell(build, shellRoot);
  if (publicBuild && shell !== previous.shell) return null;
  if (shell !== previous.shell) throw new Error('The desktop shell has changed. Prepare a full setup for this release.');
  return shell;
}


async function packOnly(buildPath, outputPath, version, previousPath) {
  if (!/^13\.11\.[1-9]\d*$/.test(version ?? '')) throw new Error('Expected a release version 13.11.<positive patch>');
  const build = resolve(buildPath);
  const output = resolve(outputPath);
  const previous = parseManifestFile(readFileSync(previousPath));
  requirePublicStage(build);
  checkReleaseFiles(gameFilesOf(join(build, 'dist')));
  mkdirSync(output);
  const work = mkdtempSync(join(resolve(output, '..'), 'pack-'));
  let shell = previousShell(previous, build, work);
  if (shell === null) {
    const { buildTestShell } = await import('./buildTestShell.mjs');
    shell = await buildTestShell({ build, work, output, version, stageShell, gameSeed, require });
  }
  const manifest = packGame(join(build, 'dist'), work, { version, shell, cacheDir: process.env.DFO_PACK_CACHE });
  const delta = judgeDelta(previous, manifest);
  if (delta.problems.length) throw new Error(delta.problems.join('\n'));
  console.log(delta.said);
  await split(join(work, GAME_FILES.pack), output, packPartName);
  cpSync(join(work, GAME_FILES.manifest), join(output, GAME_FILES.manifest));
}

const [first, ...args] = process.argv.slice(2);
if (first === '--game-only') await packOnly(...args);
else await prepare(first, ...args);
