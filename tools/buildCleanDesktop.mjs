#!/usr/bin/env node
// Standalone EMC build: keep the catalog, import optional Mods resources later.
import { build } from 'vite';
import { parse } from 'acorn';
import { indexDfmodBytes } from '../src/systems/dfmodTextures.js';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function withoutBundledMods(source, mode = 'none') {
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const spans = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression'
      && node.callee.object?.type === 'MetaProperty' && node.callee.property?.name === 'glob') {
      const arg = node.arguments[0];
      const paths = arg?.type === 'ArrayExpression' ? arg.elements : [arg];
      if (paths.some(path => typeof path?.value === 'string' && /(^|\/)Mods\//.test(path.value))) {
        if (!paths.every(path => typeof path?.value === 'string' && /(^|\/)Mods\//.test(path.value))) throw new Error('Mixed optional and built-in glob: review before packaging.');
        const kept = mode === 'testers' ? paths.filter(path => !/High Resolution Better Body Female Textures|Westly's Faces Refurbished|Better Bodies 3\.2/i.test(path.value)) : [];
        if (kept.length !== paths.length) {
          if (!kept.length) spans.push([node.start, node.end, '{}']);
          else spans.push([arg.start, arg.end, JSON.stringify(kept.map(path => path.value))]);
        }
        return;
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(tree);
  for (const [start, end, value] of spans.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + value + source.slice(end);
  return source;
}

export function resourceBuildPlugin(mode, changed = () => {}) {
  return { name: `desktop-resources-${mode}`, enforce: 'pre', transform(source, id) {
    if (!id.endsWith('.js') || !source.includes('import.meta.glob') || !source.includes('Mods/')) return;
    const code = withoutBundledMods(source, mode);
    if (code !== source) { changed(); return { code, map: null }; }
  }, generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type !== 'asset') continue;
      for (const name of output.originalFileNames || []) {
        const path = name.replaceAll('\\', '/');
        if (!/(^|\/)Mods\//.test(path)) continue;
        if (mode === 'none' || /High Resolution Better Body Female Textures|Westly's Faces Refurbished|Better Bodies 3\.2/i.test(path)) this.error(`Forbidden resource emitted: ${path}`);
      }
    }
  } };
}

export function standaloneMain(source) {
  const replace = (needle, value) => {
    if (!source.includes(needle)) throw new Error(`Shell changed; missing: ${needle}`);
    source = source.replace(needle, value);
  };
  replace("'use strict';", "'use strict';\nconst CLEAN_STANDALONE = true;");
  replace("'Daggerfall JavaScript Mod'", "'Daggerfall JavaScript Clean'");
  replace('const updateChecksEnabled = () =>', 'const updateChecksEnabled = () => !CLEAN_STANDALONE &&');
  replace('function openGame() {', 'function openGame() {\n  if (CLEAN_STANDALONE) return;');
  replace('function askUpdater() {', 'function askUpdater() {\n  if (CLEAN_STANDALONE) return Promise.resolve(null);');
  replace('async function noticeCheck() {', 'async function noticeCheck() {\n  if (CLEAN_STANDALONE) return null;');
  replace('async function checkForUpdatesLoudly() {', "async function checkForUpdatesLoudly() {\n  if (CLEAN_STANDALONE) return tellBox({ type: 'info', message: 'Standalone build', detail: 'Updates are disabled in this build.' });");
  replace('async function reinstallFromLauncher() {', 'async function reinstallFromLauncher() {\n  if (CLEAN_STANDALONE) return;');
  replace('async function downloadChecked(url, dest, check) {', "async function downloadChecked(url, dest, check) {\n  if (CLEAN_STANDALONE) throw new Error('Updates are disabled in this build.');");
  return source;
}

async function main() {
  const testers = process.argv.includes('--with-resources');
  const releaseTag = `testers-${Date.now()}`;
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  process.chdir(root);
  const stage = join(root, '.proving-ground', `clean-desktop-${Date.now()}`);
  const app = join(stage, 'app');
  const output = join(root, 'app', testers ? 'release-testers' : 'release-clean', ...(testers ? [releaseTag] : []));
  mkdirSync(app, { recursive: true });
  const paperdollPath = process.env.PAPERDOLL_PATH || resolve(root, '../daggerfall-js-source/paperdoll enhanced.dfmod');
  const savesPath = process.env.TEST_SAVES_PATH || 'C:/Users/user/Desktop/Saves';
  let paperdollIndex;
  if (testers) {
    if (!existsSync(paperdollPath) || !existsSync(savesPath)) throw new Error('Set PAPERDOLL_PATH and TEST_SAVES_PATH to the test content.');
    paperdollIndex = await indexDfmodBytes(new Uint8Array(readFileSync(paperdollPath)));
    if (!/paperdoll.*enhanced/i.test(paperdollIndex.title || '') || !paperdollIndex.textures.length) throw new Error('Paperdoll Enhanced bundle index invalid.');
    console.log(`Bundled Paperdoll Enhanced: ${paperdollIndex.textures.length} textures`);
  }
  const content = { paperdoll: 'test-build/paperdoll-enhanced.dfmod', paperdollIndex: 'test-build/paperdoll-enhanced.index.json' };
  const contentPlugin = { name: 'test-build-content', enforce: 'pre', load(id) {
    if (testers && id.replaceAll('\\', '/').endsWith('/src/systems/testBuildContent.js')) return `export const TEST_BUILD_CONTENT = ${JSON.stringify(content)};`;
  } };
  const config = (await import('../vite.config.js')).default;
  let transformed = 0;
  await build({ ...config, configFile: false, root,
    plugins: [contentPlugin, resourceBuildPlugin(testers ? 'testers' : 'none', () => { transformed++; }), ...(config.plugins || [])],
    // Workers run without window; their browser-only resource imports must not leak into the output.
    worker: { ...config.worker, plugins: () => [resourceBuildPlugin('none'), ...(config.worker?.plugins?.() || [])] },
    build: { ...config.build, outDir: join(stage, 'dist') },
  });
  if (!transformed) throw new Error('No optional resource globs excluded; refusing to package.');
  if (testers) {
    const contentDir = join(stage, 'dist', 'test-build');
    mkdirSync(contentDir, {recursive:true});
    cpSync(paperdollPath, join(contentDir, 'paperdoll-enhanced.dfmod'));
    writeFileSync(join(contentDir, 'paperdoll-enhanced.index.json'), JSON.stringify(paperdollIndex));
    const saveDestination = join(app, 'test-build', 'Saves');
    for (const slot of readdirSync(savesPath, {withFileTypes:true})) {
      if (!slot.isDirectory() || !/^SAVE(?:0|[1-9][0-9]*)$/.test(slot.name)) continue;
      for (const name of ['SaveData.txt', 'SaveInfo.txt']) JSON.parse(readFileSync(join(savesPath, slot.name, name), 'utf8'));
      mkdirSync(join(saveDestination, slot.name), {recursive:true});
      for (const name of ['SaveData.txt', 'SaveInfo.txt', 'Screenshot.jpg']) if (existsSync(join(savesPath, slot.name, name))) cpSync(join(savesPath, slot.name, name), join(saveDestination, slot.name, name));
    }
    if (!existsSync(saveDestination)) throw new Error('No test saves were found.');
  }
  const originalApp = join(root, 'app');
  for (const name of ['preload.cjs', 'launcherPreload.cjs', 'launcher', 'lib']) cpSync(join(originalApp, name), join(app, name), { recursive: true });
  const mainSource = standaloneMain(readFileSync(join(originalApp, 'main.cjs'), 'utf8')).replace("'Daggerfall JavaScript Clean'", testers ? "'Daggerfall JavaScript Testers'" : "'Daggerfall JavaScript Clean'");
  const seededMain = testers ? mainSource.replace('// GPU-BACKEND (2026-10-26)', "require('./lib/testBuildContent.cjs').seedTestSaves(path.join(__dirname, 'test-build', 'Saves'), app.getPath('userData'));\n\n// GPU-BACKEND (2026-10-26)") : mainSource;
  if (testers && seededMain === mainSource) throw new Error('Test-save seeding seam changed.');
  writeFileSync(join(app, 'main.cjs'), seededMain);
  const pkg = JSON.parse(readFileSync(join(originalApp, 'package.json'), 'utf8'));
  pkg.name = testers ? 'dfo-online-test-build' : 'dfo-online-clean'; pkg.productName = testers ? 'DFO Online Test Build' : 'DFO Online Clean';
  pkg.build.appId = testers ? 'dev.daggerfalljs.app.testers' : 'dev.daggerfalljs.app.clean'; pkg.build.productName = pkg.productName;
  pkg.build.publish = null; delete pkg.build.afterPack;
  pkg.build.files = ['main.cjs', 'preload.cjs', 'launcherPreload.cjs', 'launcher/**', 'lib/**', { from: '../dist', to: 'dist' }];
  if (testers) pkg.build.files.push('test-build/**');
  pkg.build.icon = join(root, 'public/icons/icon-512.png');
  pkg.build.portable = { artifactName: 'DFO-Online-Clean-win-${arch}-portable.${ext}' };
  pkg.build.directories = { output };
  if (testers) {
    pkg.build.compression = 'maximum';
    pkg.build.nsisWeb = {
      oneClick: false, allowToChangeInstallationDirectory: true, perMachine: false,
      artifactName: 'DFO-Online-Test-Build-Setup.exe',
      appPackageUrl: `https://github.com/principialnostb/daggerfall-js-source/releases/download/${releaseTag}`,
    };
  }
  writeFileSync(join(app, 'package.json'), JSON.stringify(pkg, null, 2));
  cpSync(join(root, 'src/ui/menu/menuPad.js'), join(app, 'launcher/menuPad.js'));
  cpSync(join(root, 'src/assets/branding/dfo-online.png'), join(app, 'launcher/dfo-online.png'));
  const modules = join(originalApp, 'node_modules');
  if (!existsSync(modules)) throw new Error('Run npm ci --prefix app, then repeat npm run dist:clean.');
  symlinkSync(modules, join(app, 'node_modules'), 'junction');
  // Invoke the existing builder directly; never run the mod build's lifecycle hooks.
  execFileSync(process.execPath, [join(modules, 'electron-builder/cli.js'), '--win', testers ? 'nsis-web' : 'portable', '--x64', '--publish', 'never'], { cwd: app, stdio: 'inherit' });
  if (existsSync(join(output, 'win-unpacked/resources/app-update.yml'))) throw new Error('Unexpected updater metadata in standalone output.');
  if (testers) {
    const assets = readdirSync(join(output, 'nsis-web')).filter(name => name.endsWith('.exe') || name.endsWith('.nsis.7z')).map(name => 'nsis-web/' + name);
    if (assets.length !== 2) throw new Error('Expected one web installer and one application package.');
    const plan = { releaseTag, output, assets, packageUrl: pkg.build.nsisWeb.appPackageUrl + `/${pkg.name}-${pkg.version}-x64.nsis.7z`, updates: false };
    writeFileSync(join(output, 'publication.json'), JSON.stringify(plan, null, 2));
  }
  console.log(`Standalone build (${testers ? 'selected Mods included' : 'optional Mods excluded'}, updates disabled): ${output}`);
  for (const file of readdirSync(output)) if (file.endsWith('.exe')) console.log(join(output, file));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error); process.exitCode = 1; });
