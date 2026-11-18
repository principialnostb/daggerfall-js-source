import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// A distinct NSIS product keeps the 13.11 updater away from the main desktop channel.
export async function buildTestShell({ build, work, output, version, stageShell, gameSeed, require }) {
  const projectDir = join(work, 'desktop');
  mkdirSync(projectDir);
  const shell = createHash('sha256').update(stageShell(build, projectDir)).update(version).digest('hex');
  const json = (name, obj) => writeFileSync(join(projectDir, name), JSON.stringify(obj));
  const settings = JSON.parse(readFileSync(join(projectDir, 'test-update-build.json')));
  json('test-update-build.json', { ...settings, nsis: true });
  const pkg = require('./package.json');
  json('package.json', { name: 'dfo-1311-test', productName: 'DFO Test Build', main: 'main.cjs', version,
    description: 'DFO test launcher', author: pkg.author, dependencies: pkg.dependencies });
  // The game store needs a valid seed entry. First launch stages the actual game through its file channel.
  const seed = join(work, 'seed');
  const dist = join(seed, 'dist');
  mkdirSync(join(dist, 'play'), { recursive: true });
  writeFileSync(join(dist, 'play/index.html'), 'Game download pending.');
  json('game-seed.json', gameSeed(dist, { version: '13.11.0', shell }));
  const archive = join(work, 'game-seed.asar');
  await require('@electron/asar').createPackage(seed, archive);
  const { build: pack, Platform, Arch } = require('electron-builder');
  const out = join(work, 'installer');
  const tag = 'dfo-1311-v' + version;
  await pack({ projectDir, targets: Platform.WINDOWS.createTarget('nsis', Arch.x64), publish: 'never', config: {
    appId: 'dev.dfo.test1311', electronVersion: require('electron/package.json').version,
    directories: { output: out }, npmRebuild: false,
    extraResources: [{ from: archive, to: 'game-seed.asar' }],
    asarUnpack: ['**/node_modules/workerd/**', '**/node_modules/@cloudflare/workerd-*/**'],
    win: { icon: require.resolve('./test-build.ico') },
    nsis: { include: require.resolve('../tools/testMasterDestination.nsh'), artifactName: 'DFO-Test-Build-Client.exe', oneClick: true, perMachine: false },
    publish: { provider: 'generic', url: 'https://github.com/' + settings.repository + '/releases/download/' + tag + '/' },
  } });
  for (const name of ['DFO-Test-Build-Client.exe', 'DFO-Test-Build-Client.exe.blockmap', 'latest.yml']) {
    cpSync(join(out, name), join(output, name));
  }
  const client = 'DFO-Test-Build-Client.exe';
  const hash = createHash('sha256').update(readFileSync(join(out, client))).digest('hex');
  const config = join(work, 'setup.txt');
  writeFileSync(config, ['public:' + settings.repository, tag, client + ' ' + hash].join('\n'));
  const master = join(output, 'DFO-Test-Build-Setup.exe');
  execFileSync(join(process.env.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo', '/codepage:65001',
    '/target:winexe', '/reference:System.IO.Compression.dll', '/reference:System.IO.Compression.FileSystem.dll',
    '/reference:System.Web.Extensions.dll', '/reference:System.Drawing.dll', '/out:' + master,
    '/resource:' + config + ',setup.txt', require.resolve('../tools/testUpdateSetup.cs')]);
  cpSync(master, join(output, 'DFO-13.11-Setup.exe')); // Existing clients request this exact name.
  return shell;
}
