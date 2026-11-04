#!/usr/bin/env node
// MOD-DESKTOP: the owner's game as a desktop app of its own, beside the official one, never turning into it.
// An install with the official appId replaces the official install, and its updater then replaces the build with
// Lattymoy's latest release. This script refuses a build that could do either, and refuses a dist without the mods.
//
//   npm run dist:mod                 # the web build, then the installer, into app/release-mod/
//   npm run dist:mod -- --skip-web   # the installer from the dist/ already built
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const MOD_APP_ID = 'dev.daggerfalljs.app.mod';
export const MOD_OWNER = 'principialnostb';
export const MOD_USER_DATA = 'Daggerfall JavaScript Mod';
/** Files only the owner's build carries: a dist without them is the official game. */
export const MOD_ASSETS = Object.freeze([/^wolf_pelt_brown-.*\.nif$/, /^Xbase_anim-.*\.kf$/]);
/** The official app.asar holds about 381 MB; the mods' files carry this one past 1 GB. */
export const MOD_ASAR_MIN = 1024 ** 3;

const fail = (why) => { console.error(`[dist:mod] STOP: ${why}`); process.exit(1); };
const step = (what) => console.log(`[dist:mod] ${what}`);

/** Why this checkout's app would not stand apart from the official one, or null. */
export function identityProblem(pkg, main) {
  if (pkg.build?.appId !== MOD_APP_ID) return `appId is ${pkg.build?.appId}: the installer would replace the official app`;
  if (!/Mod/.test(pkg.build?.productName ?? '')) return `productName is ${pkg.build?.productName}: it would install over the official folder`;
  const feeds = pkg.build?.publish ?? [];
  if (feeds.some((f) => f.owner !== MOD_OWNER)) return 'the updater reads another repository: the official release would replace this build';
  if (!main.includes(`'${MOD_USER_DATA}'`)) return 'the data folder is the official one: saves and the game store would be shared';
  if (/Lattymoy/.test(main)) return 'app/main.cjs still asks Lattymoy for releases';
  return null;
}

/** The mod files `names` lacks. */
export const missingAssets = (names) => MOD_ASSETS.filter((re) => !names.some((n) => re.test(n))).map(String);

function main() {
  const root = resolve(import.meta.dirname, '..');
  const app = join(root, 'app');
  const skipWeb = process.argv.includes('--skip-web');
  const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

  const problem = identityProblem(JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')), readFileSync(join(app, 'main.cjs'), 'utf8'));
  if (problem) fail(problem);
  if (existsSync(join(app, 'game-seed.json'))) fail('app/game-seed.json is present: the build would follow the official game channel');

  if (!skipWeb) { step('the web build'); run('npm run build', root); }
  const assets = join(root, 'dist', 'assets');
  if (!existsSync(assets)) fail('no dist/assets: run without --skip-web');
  const missing = missingAssets(readdirSync(assets));
  if (missing.length) fail(`dist has no mod files ${missing.join(', ')}: the local assets are missing or this is the official tree`);

  if (!existsSync(join(app, 'node_modules'))) { step('the shell\'s dependencies'); run('npm ci', app); }
  step('the installer');
  run('npx electron-builder --win nsis --publish never --config.directories.output=release-mod', app);

  const out = join(app, 'release-mod');
  const resources = join(out, 'win-unpacked', 'resources');
  const feed = readFileSync(join(resources, 'app-update.yml'), 'utf8');
  if (!feed.includes(`owner: ${MOD_OWNER}`)) fail(`the built updater does not read ${MOD_OWNER}`);
  const asar = statSync(join(resources, 'app.asar')).size;
  if (asar < MOD_ASAR_MIN) fail(`app.asar is ${Math.round(asar / 1024 ** 2)} MB: the mods did not go in`);
  step(`done: app.asar ${Math.round(asar / 1024 ** 2)} MB, updates from ${MOD_OWNER}`);
  for (const name of readdirSync(out)) if (name.endsWith('.exe')) step(join(out, name));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
