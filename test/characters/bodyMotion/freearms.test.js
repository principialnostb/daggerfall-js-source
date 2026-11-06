import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices as sm, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { extractTracks, collectTextKeys, normalizeTextKeys, resetClip, sampleTrack } from '../../../src/formats/morrowind/mwAnim.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';
import { createFreeArms, freeArmSides } from '../../../src/characters/bodyMotion/freeArms.js';
import { sceneInput } from '../../../src/characters/bodyMotion/bodyMotion.js';
import { bodyOf } from '../../../src/characters/bodyMotion/bodyKit.js';
test('free arms: equipment ownership excludes occupied, two-handed, attack and busy limbs',()=>{
 assert.deepEqual(freeArmSides(sceneInput({weapon:1})),['L']);
 assert.deepEqual(freeArmSides(sceneInput({weapon:1,shield:true})),[]);
 assert.deepEqual(freeArmSides(sceneInput({weapon:2})),[]);
 assert.deepEqual(freeArmSides({shown:false,shield:true}),['R']);
 assert.deepEqual(freeArmSides({shown:false,torch:true}),['R']);
 assert.deepEqual(freeArmSides({shown:false}),[]);
 assert.deepEqual(freeArmSides({...sceneInput({weapon:1}),blow:{section:'release'}}),[]);
 assert.deepEqual(freeArmSides({...sceneInput({weapon:1}),busy:'seat'}),[]);
});
test('free arms: real gait drives either free side while every occupied joint and leg keeps its pose',()=>{
 const nif=parseNif(readFileSync(new URL('../../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf',import.meta.url)));
 const tracks=extractTracks(nif),keys=normalizeTextKeys(collectTextKeys(nif));
 const sk=buildSkeleton(parseNif(retailSkeleton())),body=bodyOf(sk,GRAPH_ROOT,sm);
 for(const side of ['L','R'])for(const group of ['walkforward','walkback','runforward','runback']){
  const layer=createFreeArms(),state=resetClip(keys,group,{loopFallback:true});assert.equal(state.ok,true);
  const running=group.startsWith('run'),word=side==='L'?sceneInput({weapon:1,speed:running?8.1:4.4,running}):{shown:false,torch:true,speed:running?8.1:4.4,running,grounded:true};
  const positions=[];
  for(let i=0;i<120;i++){
   const t=state.startTime+(state.stopTime-state.startTime)*(i%60)/60;
   const pose=poseSkeleton(sk,tracks,sampleTrack,t),before=sm(sk,pose,GRAPH_ROOT);
   layer.step(1/60,true,word);layer.apply(sk,pose,GRAPH_ROOT,sm);const after=sm(sk,pose,GRAPH_ROOT);
   for(const s of ['L','R'])for(const key of ['thigh','calf','foot'])assert.deepEqual(after.get(body.bones[s][key]),before.get(body.bones[s][key]));
   const other=side==='L'?'R':'L';for(const key of ['upper','fore','hand'])assert.deepEqual(after.get(body.bones[other][key]),before.get(body.bones[other][key]));
   if(i>=60){const p=after.get(body.bones[side].hand).t,S=after.get(body.bones[side].upper).t;positions.push(p.map((v,j)=>v-S[j]));}
  }
  const travel=Math.max(...positions.map(p=>Math.hypot(...p.map((v,j)=>v-positions[0][j]))));assert.ok(travel>2,group+' keeps a live free arm');
  layer.step(1/60,true,sceneInput({weapon:2}));const occupied=poseSkeleton(sk,tracks,sampleTrack,state.startTime),copy=new Map(occupied);layer.apply(sk,occupied,GRAPH_ROOT,sm);assert.deepEqual(occupied,copy,'new occupied grip is immediately left alone');
 }
});
