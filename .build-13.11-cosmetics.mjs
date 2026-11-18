import { build } from 'vite';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { indexDfmodBytes } from './src/systems/dfmodTextures.js';
const root = process.cwd();
const release = resolve('app/release-13.11-cosmetics');
const stage = join(release, 'stage');
const dist = join(stage, 'dist');
const paper = resolve('../daggerfall-js-source/Mods/Body/paperdoll enhanced.dfmod');
const bundle = { paperdoll: 'test-build/paperdoll-enhanced.dfmod', paperdollIndex: 'test-build/paperdoll-enhanced.index.json' };
const index = await indexDfmodBytes(new Uint8Array(readFileSync(paper)));
if (!index.textures.length) throw new Error('Paperdoll index is empty');
const textureKeys = ['HighResolutionBetterBodyFemaleTextures', 'IntelligentTextures', 'VurtsBetterClothes', 'BetterClothesRetextured',
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
    for (const [file, edits] of Object.entries(defaults)) if (path.endsWith(file)) for (const [old, next] of edits) replace(old, next);
    if (path.endsWith('/src/systems/modSettings.js')) for (const key of textureKeys) {
      replace(key + ': Object.freeze({\n        default: false', key + ': Object.freeze({\n        default: true');
      replace(key + 'Source: Object.freeze({\n        default: 1', key + 'Source: Object.freeze({\n        default: 2');
    }
    return source;
  },
}, ...config.plugins], build: { ...config.build, outDir: dist } });
const content = join(dist, 'test-build');
mkdirSync(content, { recursive: true });
cpSync(paper, join(dist, bundle.paperdoll));
writeFileSync(join(dist, bundle.paperdollIndex), JSON.stringify(index));
cpSync('app/release-13.11-test/stage/dist/private', join(dist, 'private'), { recursive: true });
for (const file of ['main.cjs','preload.cjs','launcherPreload.cjs','launcher','lib']) cpSync(join('app',file), join(stage,file), { recursive: true });
for (const [source, target] of [['src/ui/menu/menuPad.js','menuPad.js'],['src/assets/branding/dfo-online.png','dfo-online.png']]) cpSync(source, join(stage,'launcher',target));
const pkg = JSON.parse(readFileSync('app/package.json','utf8'));
writeFileSync(join(stage,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,main:pkg.main}));
writeFileSync(join(stage,'pinned-test-build.json'),JSON.stringify({release:'13.11-cosmetics'}));
const main = join(stage,'main.cjs');
const shell = readFileSync(main,'utf8');
if (!shell.includes("'DFO 13.11-test-build'")) throw new Error('Missing isolated profile anchor');
writeFileSync(main,shell.replace("'DFO 13.11-test-build'","'DFO 13.11-cosmetics'"));
const payload = join(release, 'client');
mkdirSync(join(payload,'resources'), {recursive:true});
const runtime = 'app/release-13.11-test/payload';
for (const name of readdirSync(runtime)) if (name !== 'resources') cpSync(join(runtime,name),join(payload,name),{recursive:true});
cpSync('app/release-13.11-test/stage/node_modules', join(stage,'node_modules'), {recursive:true});
const asar = await import('file:///C:/Users/user/AppData/Local/npm-cache/_npx/4b0e2640fe917ac8/node_modules/@electron/asar/lib/asar.js');
await asar.createPackage(stage, join(payload,'resources/app.asar'));
console.log('READY', join(payload,'DFO Online Mod.exe'), 'paperdoll textures:', index.textures.length);
