import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createTestPaperdollPack} from '../../src/systems/testBuildPaperdoll.js';
const {seedTestSaves}=createRequire(import.meta.url)('../../app/lib/testBuildContent.cjs');

test('test saves are installed once without replacing existing slots or undoing player deletions',()=>{
 const parent=resolve(tmpdir());const root=mkdtempSync(join(parent,'dfo-test-content-'));
 try {
  const source=join(root,'source');const profile=join(root,'profile');
  mkdirSync(join(source,'SAVE2'),{recursive:true});
  writeFileSync(join(source,'SAVE2/SaveData.txt'),JSON.stringify({v:1,name:'test'}));
  writeFileSync(join(source,'SAVE2/SaveInfo.txt'),JSON.stringify({saveVersion:1}));
  seedTestSaves(source,profile);
  assert.equal(JSON.parse(readFileSync(join(profile,'Saves/SAVE2/SaveData.txt'),'utf8')).name,'test');
  writeFileSync(join(profile,'Saves/SAVE2/SaveData.txt'),'existing player save');
  seedTestSaves(source,profile);
  assert.equal(readFileSync(join(profile,'Saves/SAVE2/SaveData.txt'),'utf8'),'existing player save');
  rmSync(join(profile,'Saves/SAVE2'),{recursive:true});
  seedTestSaves(source,profile);
  assert.equal(existsSync(join(profile,'Saves/SAVE2')),false);
  const other=join(root,'other');mkdirSync(join(other,'Saves/SAVE2'),{recursive:true});
  writeFileSync(join(other,'Saves/SAVE2/SaveData.txt'),'keep');
  seedTestSaves(source,other);
  assert.equal(readFileSync(join(other,'Saves/SAVE2/SaveData.txt'),'utf8'),'keep');
 } finally {assert.ok(resolve(root).startsWith(parent+sep));rmSync(root,{recursive:true,force:true});}
});

test('Paperdoll Enhanced registers as an enabled shipped mod and loads its blob lazily once',async()=>{
 let loads=0;const opened=[];const blob=new Blob(['bundle']);
 const index={title:'Paperdoll Enhanced',textures:[['BODY00I0.IMG',2,2]]};
 const pack=createTestPaperdollPack(index,async()=>{loads++;return blob;},async(source,options)=>{opened.push([source,options]);return {close(){}};});
 assert.equal(pack.on,true);assert.equal(pack.index,index);assert.equal(loads,0);
 await pack.open();await pack.open();
 assert.equal(loads,1);assert.equal(opened[0][0],blob);assert.deepEqual(opened[0][1].knownTextures,index.textures);
});


test('other Vanilla Enhanced menu reads retain the registered test-build Paperdoll',async()=>{
 const {installVanillaEnhancedPack}=await import('../../src/systems/vanillaEnhanced/vanillaEnhancedPack.js');
 const {attachedDfmods}=await import('../../src/systems/dfmodTextures.js');
 const pack=createTestPaperdollPack({title:'Paperdoll Enhanced',textures:[],arrays:[],deps:[]},async()=>new Blob());
 try {
  installVanillaEnhancedPack([pack]);
  installVanillaEnhancedPack();
  assert.ok(attachedDfmods().some(mod=>mod.key===pack.key&&mod.shipped&&mod.enabled));
 } finally {installVanillaEnhancedPack([]);}
});
