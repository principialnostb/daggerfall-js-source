import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  json('package.json', { name: 'dfo-1311-test', productName: 'DFO 13.11', main: 'main.cjs', version,
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
    win: { icon: require.resolve('../public/icons/icon-512.png') },
    nsis: { artifactName: 'DFO-13.11-Setup.exe', oneClick: true, perMachine: false },
    publish: { provider: 'generic', url: 'https://github.com/' + settings.repository + '/releases/download/' + tag + '/' },
  } });
  for (const name of ['DFO-13.11-Setup.exe', 'DFO-13.11-Setup.exe.blockmap', 'latest.yml']) {
    cpSync(join(out, name), join(output, name));
  }
  return shell;
}
