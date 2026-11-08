import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { withoutBundledMods, standaloneMain } from '../../tools/buildCleanDesktop.mjs';

test('clean build excludes optional globs and preserves import patterns for EMC', () => {
 const source = `const files = modResourceGlob(['../../Mods/Test/**/*.dds'], import.meta.glob('../../Mods/Test/**/*.dds', {eager:true})); const own = import.meta.glob('../vendor/**/*.png');`;
 const result = withoutBundledMods(source);
 assert.ok(result.includes("modResourceGlob(['../../Mods/Test/**/*.dds'], {})"));
 assert.ok(result.includes("import.meta.glob('../vendor/**/*.png')"));
 assert.throws(() => withoutBundledMods("import.meta.glob(['../Mods/a/*', '../vendor/b/*'])"), /Mixed/);
});

test('standalone shell isolates storage and closes automatic and manual update paths', () => {
 const source = readFileSync(new URL('../../app/main.cjs', import.meta.url), 'utf8');
 const result = standaloneMain(source);
 parse(result, {ecmaVersion:'latest', sourceType:'script'});
 assert.ok(result.includes("'Daggerfall JavaScript Clean'"));
 assert.ok(result.includes('const updateChecksEnabled = () => !CLEAN_STANDALONE &&'));
 for (const signature of ['function openGame() {','function askUpdater() {','async function noticeCheck() {','async function checkForUpdatesLoudly() {','async function reinstallFromLauncher() {','async function downloadChecked(url, dest, check) {']) {
  assert.ok(result.includes(signature + '\n  if (CLEAN_STANDALONE)'), signature);
 }
 assert.throws(() => standaloneMain(''), /Shell changed/);
});


test('testers retain supported resources and exclude the three omitted packs', () => {
 const source = `console.log(import.meta.glob(['../Mods/Bodies/Better Bodies/**/*.nif','../Mods/Bodies/High Resolution Better Body Female Textures/**/*.dds',"../Mods/Textures/Westly's Faces Refurbished/**/*.nif",'../Mods/Bodies/Better Bodies 3.2 Beasts/**/*.nif'],{eager:true}));`;
 const result = withoutBundledMods(source, 'testers');
 assert.ok(result.includes('Better Bodies/**/*.nif'));
 assert.doesNotMatch(result, /High Resolution|Westly|Better Bodies 3\.2/);
});

test('real Vite builds filter both the main graph and the separate Worker graph', async () => {
 const { build } = await import('vite');
 const { resourceBuildPlugin } = await import('../../tools/buildCleanDesktop.mjs');
 const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
 const { tmpdir } = await import('node:os');
 const { join, resolve, sep } = await import('node:path');
 const parent = resolve(tmpdir());
 const root = mkdtempSync(join(parent, 'dfo-desktop-fixture-'));
 try {
  mkdirSync(join(root, 'Mods/Keep'), {recursive:true});
  mkdirSync(join(root, 'Mods/Bodies/High Resolution Better Body Female Textures'), {recursive:true});
  writeFileSync(join(root, 'Mods/Keep/keep.dds'), Buffer.alloc(100, 42));
  writeFileSync(join(root, 'Mods/Bodies/High Resolution Better Body Female Textures/excluded.dds'), Buffer.alloc(100, 43));
  writeFileSync(join(root, 'shared.js'), `export const files=typeof window!=='undefined'?import.meta.glob(['./Mods/Keep/*.dds','./Mods/Bodies/High Resolution Better Body Female Textures/*.dds'],{eager:true,query:'?url',import:'default'}):{};`);
  writeFileSync(join(root, 'main.js'), `import {files} from './shared.js'; console.log(files); new Worker(new URL('./worker.js',import.meta.url),{type:'module'});`);
  writeFileSync(join(root, 'worker.js'), `import {files} from './shared.js'; console.log(files);`);
  for (const mode of ['none', 'testers']) {
   const result = await build({root,configFile:false,logLevel:'silent',plugins:[resourceBuildPlugin(mode)],worker:{plugins:()=>[resourceBuildPlugin('none')]},build:{write:false,assetsInlineLimit:0,rollupOptions:{input:join(root,'main.js')}}});
   const names=result.output.map(item=>item.fileName);
   assert.equal(names.some(name=>name.endsWith('.dds')),mode==='testers');
   assert.ok(!names.some(name=>name.includes('excluded')));
   const worker=result.output.find(item=>/worker-.*\.js$/.test(item.fileName));
   assert.ok(worker);
   assert.doesNotMatch(String(worker.source ?? worker.code), /keep-|excluded-|\.dds/);
  }
 } finally {
  assert.ok(resolve(root).startsWith(parent+sep));
  assert.ok(root.includes('dfo-desktop-fixture-'));
  rmSync(root,{recursive:true,force:true});
 }
});
