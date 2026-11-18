import { build } from 'vite';
import { resourceBuildPlugin } from './tools/buildCleanDesktop.mjs';
import { build as bundleScript } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.cwd();
const publicBuild = process.env.DFO_TEST_PUBLIC === '1';
const kit = process.env.DFO_TEST_KIT;
const release = resolve(process.env.DFO_TEST_OUTPUT ?? 'app/release-13.11-test-medium');
const stage = join(release, 'stage');
const dist = join(stage, 'dist');
const bundle = {};
const textureKeys = ['IntelligentTextures', 'VurtsBetterClothes', 'BetterClothesRetextured',
  'BetterMorrowindArmor', 'CompleteArmorJoints', 'WestlysFineClothiers', 'WestlysFacesRefurbished'];
const defaults = {
  '/src/systems/uiPrefs.js': [['morrowindThirdPersonOnly: false,', 'morrowindThirdPersonOnly: true,'], ['modelCustomization: false,', 'modelCustomization: true,']],
  '/src/systems/charPixel.js': [['fp: 360, player: 0, npc: 0', 'fp: 360, player: 360, npc: 360']],
  '/src/systems/worldPixelConfig.js': [['objects:540', 'objects:360']],
};
const config = (await import('./vite.config.js')).default;
await build({ ...config, configFile: false, root, plugins: [{
  name: 'cosmetics-edition-defaults', enforce: 'pre',
  load(id) {
    if (id.replaceAll('\\', '/').endsWith('/src/systems/testBuildContent.js')) return 'export const TEST_BUILD_CONTENT = ' + JSON.stringify(bundle);
  },
  transform(source, id) {
    const path = id.replaceAll('\\', '/');
    const replace = (old, next) => {
      if (!source.includes(old)) throw new Error('Build default missing: ' + old);
      source = source.replace(old, next);
    };
    if (path.endsWith('/src/formats/morrowind/mwBetterBodies.js') || path.endsWith('/src/systems/bundledMorrowindMods.js')) {
      source = source.replaceAll('Mods/Bodies/High Resolution Better Body Female Textures/', 'Mods/ExcludedTexturePack/')
        .replaceAll('Mods/Bodies/Better Bodies 3.2 Beasts/', 'Mods/ExcludedBeastPack/');
    }
    if (path.endsWith('/src/ui/settings/settingsMap.js') || path.endsWith('/src/systems/features.js') || path.endsWith('/src/systems/enhancedModCatalog.js')) {
      source = source.split('\n').filter(line => !line.includes('mw-textures-high-resolution-bodies')).join('\n');
    }
    if (path.endsWith('/src/combat/fpArm.js')) replace("=== 2 && beast && !werewolf && !vampire", "=== 2 && false && beast && !werewolf && !vampire");
    if (path.endsWith('/src/scenes/dungeonPropPreviews.js')) replace('unbind: import.meta.env?.DEV ?', 'unbind: true ?');
    for (const [file, edits] of Object.entries(defaults)) if (path.endsWith(file)) for (const [old, next] of edits) replace(old, next);
    if (path.endsWith('/src/systems/modSettings.js')) for (const key of textureKeys) {
      replace(key + ': Object.freeze({\n        default: false', key + ': Object.freeze({\n        default: true');
      replace(key + 'Source: Object.freeze({\n        default: 1', key + 'Source: Object.freeze({\n        default: 2');
    }
    return source;
  },
}, ...(publicBuild ? [resourceBuildPlugin('none')] : []), ...config.plugins],
  worker: publicBuild ? { ...config.worker, plugins: () => [resourceBuildPlugin('none'), ...(config.worker?.plugins?.() || [])] } : config.worker,
  build: { ...config.build, outDir: dist } });
if (publicBuild) writeFileSync(join(stage, 'public-test-stage'), '13.11\n');

await bundleScript({ entryPoints: ['server/src/index.js'], outfile: join(dist,'private/relay.mjs'), bundle: true, format: 'esm', platform: 'neutral' });
await bundleScript({ entryPoints: ['app/lib/privateHost.mjs'], outfile: join(stage,'private/host.mjs'), bundle: true, format: 'esm', platform: 'node', external: ['miniflare'] });
for (const file of ['main.cjs','preload.cjs','launcherPreload.cjs','launcher','lib']) cpSync(join('app',file), join(stage,file), { recursive: true });
for (const [source, target] of [['src/ui/menu/menuPad.js','menuPad.js'],['src/ui/plus/gauntletArt.js','gauntletArt.js'],['src/assets/branding/dfo-online.png','dfo-online.png']]) cpSync(source, join(stage,'launcher',target));
if (publicBuild) {
  const page = join(stage, 'launcher/index.html');
  const html = readFileSync(page, 'utf8');
  if (!html.includes('<title>DFO Online</title>')) throw new Error('Launcher title missing');
  writeFileSync(page, html.replace('<title>DFO Online</title>', '<title>DFO Test Build</title>'));
  cpSync(join(stage, 'launcher'), join(dist, 'desktop-launcher'), { recursive: true });
}
const pkg = JSON.parse(readFileSync('app/package.json','utf8'));
writeFileSync(join(stage,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,main:pkg.main}));
writeFileSync(join(stage,'pinned-test-build.json'),JSON.stringify({release:'13.11-test-medium'}));
const main = join(stage,'main.cjs');
const shell = readFileSync(main,'utf8');
if (!shell.includes("'DFO 13.11-test-build'")) throw new Error('Missing isolated profile anchor');
if (process.argv.includes('--stage-for-updates')) process.exit(0);
const saveSeed = "C:/Users/user/Desktop/Saves";
for (const slot of ['SAVE0', 'SAVE2']) {
  mkdirSync(join(stage,'test-saves',slot),{recursive:true});
  for (const file of ['SaveData.txt','SaveInfo.txt'])
    cpSync(join(saveSeed,slot,file),join(stage,'test-saves',slot,file));
}
const seedBoot = "  if (PINNED_TEST_BUILD) require('./lib/testBuildContent.cjs').seedTestSaves(path.join(__dirname, 'test-saves'), app.getPath('userData'));\n";
const ready = "  protocol.handle('dagger', handleDagger);";
if (!shell.includes(ready)) throw new Error('Missing boot anchor');
writeFileSync(main,shell.replace("'DFO 13.11-test-build'","'DFO 13.11-test-medium'").replace(ready,seedBoot+ready));
const payload = join(release, 'client');
mkdirSync(join(payload,'resources'), {recursive:true});
const runtime = join(kit,'runtime');
for (const name of readdirSync(runtime)) if (name !== 'resources') cpSync(join(runtime,name),join(payload,name),{recursive:true});
cpSync(join(kit,'node_modules'), join(stage,'node_modules'), {recursive:true});
const asar = await import('file:///C:/Users/user/AppData/Local/npm-cache/_npx/4b0e2640fe917ac8/node_modules/@electron/asar/lib/asar.js');
{
  const source = process.env.DFO_PRIVATE_MODULES ?? resolve('app/node_modules');
  const lock = JSON.parse(readFileSync('app/package-lock.json', 'utf8'));
  const installed = JSON.parse(readFileSync(join(source, 'miniflare/package.json'), 'utf8'));
  if (installed.version !== lock.packages['node_modules/miniflare'].version) {
    throw new Error('Install the desktop lock-file dependencies before packaging');
  }
  for (const name of readdirSync(source)) {
    if (name.startsWith('.') || name === 'wrangler' || name === 'esbuild') continue;
    cpSync(join(source,name), join(stage,'node_modules',name), { recursive: true });
  }
}
await asar.createPackageWithOptions(stage, join(payload,'resources/app.asar'), {
  unpackDir: 'node_modules/{workerd,@cloudflare/workerd-*}',
});
console.log('READY', join(payload,'DFO Online Mod.exe'));
