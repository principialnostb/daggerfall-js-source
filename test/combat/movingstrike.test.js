import { createLoopSeam } from '../../src/combat/loopSeam.js';
import { loopWindow } from '../../src/combat/leftArmLayer.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { collectTextKeys, normalizeTextKeys, extractTracks, resetClip, sampleTrack } from '../../src/formats/morrowind/mwAnim.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices as sm, GRAPH_ROOT } from '../../src/formats/morrowind/mwSkin.js';
import { createLowerBodyLayer, lowerBodyBones } from '../../src/combat/lowerBodyLayer.js';
import { retailSkeleton } from '../fixtures/mw/retailRig.mjs';
const file=new URL('../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf',import.meta.url);
const error=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
test('moving strikes: real one/two-hand clips retain the standing upper strike turn while legs keep every stride', {skip:!existsSync(file)},()=>{
 const nif=parseNif(readFileSync(file)),keys=normalizeTextKeys(collectTextKeys(nif)),tracks=extractTracks(nif),source={keys,trackMap:tracks};
 const sk=buildSkeleton(parseNif(retailSkeleton())),mask=lowerBodyBones(sk),weapon=sk.byName.get('weapon bone');
 let lost=0;
 for(const group of ['weapononehand','weapontwohand','weapontwowide'])for(const type of ['slash','chop','thrust']){
  const action=resetClip(keys,group,{start:type+' start',stop:type+' small follow stop'});assert.equal(action.ok,true,group+' '+type);
  for(const move of ['walkforward','runforward','walkback','runback']){
   const state=resetClip(keys,move,{loopFallback:true});assert.equal(state.ok,true,move);
   const layer=createLowerBodyLayer({sampleTrack});
   for(let i=0;i<90;i++)layer.step(1/60,{third:true,movement:state,movementTracks:tracks,movementSource:source});
   for(let f=0;f<=24;f++){
    const time=action.startTime+(action.stopTime-action.startTime)*f/24;state.time=state.startTime+(state.stopTime-state.startTime)*f/24;
    layer.step(1/60,{third:true,action,strike:false,movement:state,movementTracks:tracks,movementSource:source});
    const wrapped=layer.tracks(tracks,mask),sample=layer.sampler(sampleTrack);
    const old=poseSkeleton(sk,wrapped,sample,time),oldM=sm(sk,old,GRAPH_ROOT);
    layer.step(0,{third:true,action,strike:true,movement:state,movementTracks:tracks,movementSource:source});
    const pose=poseSkeleton(sk,layer.tracks(tracks,mask),layer.sampler(sampleTrack),time),m=sm(sk,pose,GRAPH_ROOT);
    const standing=sm(sk,poseSkeleton(sk,tracks,sampleTrack,time),GRAPH_ROOT);
    lost=Math.max(lost,error(oldM.get(weapon).a,standing.get(weapon).a));
    assert.ok(error(m.get(weapon).a,standing.get(weapon).a)<0.0001,group+' '+type+' '+move+' retains authored weapon rotation');
    for(const [ref,node] of sk.nodes)if(mask.has(node.name.toLowerCase()))assert.deepEqual(pose.get(ref),old.get(ref),'stride local unchanged: '+node.name);
   }
  }
 }
 assert.ok(lost>.02,'the real baseline reproduces a lost turn');
});

import { createBlowLegs, blowLegsPose } from '../../src/characters/bodyMotion/blowLegs.js';
import { MW_WEAPON_TYPE as W } from '../../src/formats/morrowind/mwFirstPerson.js';
test('moving strikes: running one/two-hand trunk gains are independent of the untouched legs and standing keys',()=>{
 for(const type of [W.ShortBladeOneHand,W.LongBladeOneHand,W.BluntOneHand,W.AxeOneHand,W.LongBladeTwoHand,W.BluntTwoClose,W.BluntTwoWide,W.SpearTwoWide,W.AxeTwoHand]){
  const one=[W.ShortBladeOneHand,W.LongBladeOneHand,W.BluntOneHand,W.AxeOneHand].includes(type);
  const word={shown:true,mwType:type,speed:8.1,running:true,grounded:true,blow:{type:'slash',section:'release',progress:1,strength:1,hand:'R'}};
  const layer=createBlowLegs(),key=blowLegsPose({...word.blow,sword:type===W.LongBladeTwoHand},0);
  for(let i=0;i<180;i++)layer.step(1/60,true,word,0);
  const trunk=layer.trunkTurn();assert.ok(Math.abs(trunk.yaw-key.yaw*(one?1.2:1.25))<1e-6);assert.ok(Math.abs(trunk.pitch-key.pitch*(one?1.1:1.15))<1e-6);
  assert.equal(layer.weight(),0,'running legs remain owned by the stride');
  const still=createBlowLegs();for(let i=0;i<180;i++)still.step(1/60,true,{...word,speed:0,running:false},0);
  assert.ok(Math.abs(still.trunkTurn().yaw)<1e-6,'standing keeps its existing hip-driven turn');
  assert.ok(Math.abs(still.status().yaw-key.yaw)<1e-6,'standing amplitude unchanged');
 }
});


test('moving strikes: actual loop seam/smoothing stack accepts the procedural spine track at movement loop endpoints', {skip:!existsSync(file)},()=>{
 const nif=parseNif(readFileSync(file)),keys=normalizeTextKeys(collectTextKeys(nif)),trackMap=extractTracks(nif),source={keys,trackMap};
 const sk=buildSkeleton(parseNif(retailSkeleton())),mask=lowerBodyBones(sk);
 const layer=createLowerBodyLayer({sampleTrack}),seams=createLoopSeam({sampleTrack,loopWindow});
 for(const group of ['walkforward','runforward','walkback','runback']){
  const movement=resetClip(keys,group,{loopFallback:true});
  for(let i=0;i<90;i++)layer.step(1/60,{third:true,movement,movementTracks:trackMap,movementSource:source});
  const window=loopWindow(movement,keys);
  for(const time of [window.start,window.stop-.001,window.stop]){
   movement.time=time;layer.step(0,{third:true,movement,movementTracks:trackMap,movementSource:source});
   const wrapped=layer.tracks(trackMap,mask),sample=seams.sampler(layer.sampler(sampleTrack),movement,source,true);
   const pose=poseSkeleton(sk,wrapped,sample,time);
   for(const local of pose.values())assert.ok([...local.rotation,...local.translation].every(Number.isFinite));
  }
 }
});
