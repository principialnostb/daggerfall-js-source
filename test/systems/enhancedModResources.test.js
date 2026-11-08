import test from 'node:test';
import assert from 'node:assert/strict';
import { globPattern, modResourceGlob, normalizeModFiles, modPackState, resourceConnectionState } from '../../src/systems/enhancedModResources.js';
import { MOD_PACKS } from '../../src/systems/enhancedModCatalog.js';
test('runtime glob admits exactly the same subtrees and brace extensions',()=>{
 const re=globPattern('../../../Mods/Animations/Test/**/*.{kf,KF}');
 assert.ok(re.test('../../../Mods/Animations/Test/a.kf'));
 assert.ok(re.test('../../../Mods/Animations/Test/sub/a.KF'));
 assert.equal(re.test('../../../Mods/Animations/Test/a.nif'),false);
 assert.equal(re.test('../../../Mods/Animations/Other/a.kf'),false);
});
test('without imports the existing resources and ordering stay intact',()=>{
 const assets={'../../../Mods/Bodies/Better Bodies/Nude/Data Files/Meshes/a.nif':'first','../../../Mods/Bodies/Better Bodies/Underwear/Data Files/Meshes/a.nif':'second'};
 assert.deepEqual(modResourceGlob('../../../Mods/Bodies/Better Bodies/**/*.nif',assets),assets);
 assert.deepEqual(Object.keys(modResourceGlob('../../../Mods/Bodies/Better Bodies/**/*.nif',assets)),Object.keys(assets));
});
test('folder normalization preserves the mod package layout and rejects unrelated files',()=>{
 const pack=MOD_PACKS.find(p=>p.id==='bb');
 const file={webkitRelativePath:'Better Bodies/Nude/Data Files/Meshes/bb/a.nif'};
 assert.equal(normalizeModFiles(pack,[file])[0].path,'Mods/Bodies/Better Bodies/Nude/Data Files/Meshes/bb/a.nif');
 assert.throws(()=>normalizeModFiles(pack,[{webkitRelativePath:'Better Bodies/readme.txt'}]));
});

test('existing build resources are connected and repeated loader views do not inflate the file count',()=>{
 const source={'../../../Mods/Animations/Hit Reactions Animated v2 -- OpenMW/Animations/hit.kf':'url'};
 modResourceGlob('../../../Mods/Animations/Hit Reactions Animated v2 -- OpenMW/**/*.kf',source);
 modResourceGlob('../../../Mods/Animations/Hit Reactions Animated v2 -- OpenMW/**/*.kf',source);
 const state=modPackState('reactions');
 assert.equal(state.connected,true);
 assert.equal(state.imported,false);
 assert.equal(state.count,1);
 assert.equal(modPackState('not-installed').connected,false);
});
test('disconnected build resources are absent; user imports take precedence when connected',()=>{
 assert.deepEqual(resourceConnectionState({bundledCount:115,removed:true}),{connected:false,count:0});
 assert.deepEqual(resourceConnectionState({bundledCount:115}),{connected:true,count:115});
 assert.deepEqual(resourceConnectionState({bundledCount:115,importedCount:98}),{connected:true,count:98});
});


test('nested texture add-on resources belong to their own card', async()=>{
 const { packForPath } = await import('../../src/systems/enhancedModCatalog.js');
 const base='../../Mods/Textures/Better Morrowind Armor/';
 assert.equal(packForPath(base+'Data Files/Textures/armor.dds').id,'texture-better-armor');
 assert.equal(packForPath(base+'Complete Armor Joints/Data Files/Textures/joint.dds').id,'texture-armor-joints');
 modResourceGlob('../../Mods/Textures/Better Morrowind Armor/**/*.dds',{
  [base+'Data Files/Textures/armor.dds']:'base',
  [base+'Complete Armor Joints/Data Files/Textures/joint.dds']:'addon',
 });
 assert.equal(modPackState('texture-better-armor').count,1);
 assert.equal(modPackState('texture-armor-joints').count,1);
});
