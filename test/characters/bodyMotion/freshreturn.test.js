import { rotAxisAngle } from '../../../src/combat/climbRig.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseNif} from '../../../src/formats/morrowind/mwNifFile.js';
import {buildSkeleton, skeletonSpaceMatrices as sm, GRAPH_ROOT, injectSkeletonNodes} from '../../../src/formats/morrowind/mwSkin.js';
import {retailSkeleton} from '../../fixtures/mw/retailRig.mjs';
import {offWeaponBoneAddon} from '../../../src/combat/twoHands/mirrorRig.js';
import {createBodyMotion, sceneInput} from '../../../src/characters/bodyMotion/bodyMotion.js';
import {interpolateReturn, createFreshReturn, setReturnGoal, recoveryOffset, RETURN_BEATS, returnProgress, freshReturnEnabled} from '../../../src/characters/bodyMotion/freshReturn.js';
import {bodyOf} from '../../../src/characters/bodyMotion/bodyKit.js';
const nif=parseNif(retailSkeleton()), sk=buildSkeleton(nif);
injectSkeletonNodes(sk,offWeaponBoneAddon(sk,GRAPH_ROOT,sm,nif));
const body=bodyOf(sk,GRAPH_ROOT,sm);
const carry=(running)=>{const m=createBodyMotion();let pose;for(let i=0;i<180;i++){m.step(1/60,sceneInput({weapon:2,running,speed:running?8.1:0,forward:running?1:0}));pose=new Map();m.apply(sk,pose,GRAPH_ROOT,sm);}return pose;};
test('fresh return: endpoint and lower body remain fixed',()=>{
 const goal=carry(false), pose=new Map(goal), before=sm(sk,pose,GRAPH_ROOT);
 interpolateReturn(sk,pose,goal,goal,GRAPH_ROOT,sm,1);
 const after=sm(sk,pose,GRAPH_ROOT);
 for(const s of ['L','R']) assert.ok(Math.hypot(...after.get(body.bones[s].hand).t.map((x,i)=>x-before.get(body.bones[s].hand).t[i]))<0.01);
 for(const s of ['L','R'])for(const ref of [body.bones[s].thigh,body.bones[s].calf,body.bones[s].foot])assert.deepEqual(pose.get(ref),goal.get(ref));
});
test('fresh return: an explicit clock reaches its endpoint and resets without retaining an old strike',()=>{
 const layer=createFreshReturn({enabled:()=>true,seconds:.5}),from=carry(true),goal=carry(false);
 layer.step(1/60,true,true);layer.apply(sk,from,GRAPH_ROOT,sm);
 let pose;
 for(let i=0;i<32;i++){layer.step(1/60,false,true);pose=new Map(goal);setReturnGoal(pose,goal);layer.apply(sk,pose,GRAPH_ROOT,sm);}
 const m=sm(sk,pose,GRAPH_ROOT),g=sm(sk,goal,GRAPH_ROOT);
 assert.ok(Math.hypot(...m.get(body.bones.R.hand).t.map((x,i)=>x-g.get(body.bones.R.hand).t[i]))<0.01);
 layer.reset();pose=new Map(goal);layer.step(1/60,false,true);layer.apply(sk,pose,GRAPH_ROOT,sm);assert.deepEqual(pose,goal);
});


test('fresh return: authored beats lift the grip away from the torso and leave endpoints stationary',()=>{
 const f=[0,1,0],u=[0,0,1],arm=50;
 assert.deepEqual(recoveryOffset(0,f,u,arm),[0,0,0]);
 assert.deepEqual(recoveryOffset(1,f,u,arm),[0,0,0]);
 assert.equal(RETURN_BEATS.length,8);
 const h=1e-5;
 for(const end of [0,1]){const near=recoveryOffset(end===0?h:1-h,f,u,arm);assert.ok(Math.hypot(...near)/h<0.02,'endpoint velocity must be zero');}
 const mid=recoveryOffset(.4,f,u,arm);assert.ok(mid[1]>0&&mid[2]>0);
});


test('fresh return: freezes its destination instead of chasing a new goal each frame',()=>{
 const layer=createFreshReturn({enabled:()=>true}), from=carry(true), goal=carry(false), moving=carry(true);
 layer.step(1/60,true,true);layer.apply(sk,from,GRAPH_ROOT,sm);
 let pose;
 for(let i=0;i<32;i++){layer.step(1/60,false,true);pose=new Map(goal);setReturnGoal(pose,i===0?goal:moving);layer.apply(sk,pose,GRAPH_ROOT,sm);}
 const m=sm(sk,pose,GRAPH_ROOT), g=sm(sk,goal,GRAPH_ROOT);
 assert.ok(Math.hypot(...m.get(body.bones.R.hand).t.map((v,i)=>v-g.get(body.bones.R.hand).t[i]))<0.01);
 assert.equal(layer.status().mode,'carry');
});

test('fresh return: interruption starts at the last shown return, not a stale attack pose',()=>{
 const layer=createFreshReturn({enabled:()=>true}), from=carry(true),goal=carry(false);
 layer.step(1/60,true,true);layer.apply(sk,from,GRAPH_ROOT,sm);
 let pose;
 for(let i=0;i<12;i++){layer.step(1/60,false,true);pose=new Map(goal);setReturnGoal(pose,goal);layer.apply(sk,pose,GRAPH_ROOT,sm);}
 const last=sm(sk,pose,GRAPH_ROOT);
 layer.step(1/60,true,true);pose=new Map(goal);
 for(const side of ['L','R'])for(const ref of [body.bones[side].upper,body.bones[side].fore,body.bones[side].hand])pose.set(ref,from.get(ref));
 layer.apply(sk,pose,GRAPH_ROOT,sm);
 const next=sm(sk,pose,GRAPH_ROOT);
 assert.equal(layer.status().mode,'interrupt');
 assert.ok(Math.hypot(...next.get(body.bones.R.hand).t.map((v,i)=>v-last.get(body.bones.R.hand).t[i]))<0.01);
 layer.step(1/60,false,false);assert.equal(layer.status().mode,'off');
});


test('fresh return: opt-in runtime suppresses the competing old arm return; opt-out retains it',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'location');
 try {
  for(const enabled of [true,false]){
   Object.defineProperty(globalThis,'location',{configurable:true,value:{search:enabled?'?fresh2hReturn=1':'?fresh2hReturn=0'}});
   const m=createBodyMotion();
   for(let i=0;i<180;i++){m.step(1/60,sceneInput({weapon:2}));m.apply(sk,new Map(),GRAPH_ROOT,sm);}
   for(let i=0;i<30;i++){m.step(1/60,sceneInput({weapon:2,blow:{type:'slash',section:'follow',progress:1,strength:1,hand:'R'}}));m.apply(sk,new Map(),GRAPH_ROOT,sm);}
   m.step(1/60,sceneInput({weapon:2}));const report=m.apply(sk,new Map(),GRAPH_ROOT,sm);
   assert.ok(report);
   if(enabled)assert.equal(report.reach.L,null,'old intermediate arm solver must yield ownership');
   else assert.notEqual(report.reach.L,null,'comparison route must retain old behaviour');
  }
 } finally {if(descriptor)Object.defineProperty(globalThis,'location',descriptor);else delete globalThis.location;}
});


test('fresh return: endpoint ownership bridge never exposes raw arms before steady carry resumes',()=>{
 const layer=createFreshReturn({enabled:()=>true}),from=carry(true),goal=carry(false);
 layer.step(1/60,true,true);layer.apply(sk,from,GRAPH_ROOT,sm);
 for(let i=0;i<36;i++){
  layer.step(1/60,false,true);const pose=new Map(goal);
  for(const side of ['L','R'])for(const ref of [body.bones[side].upper,body.bones[side].fore,body.bones[side].hand])pose.set(ref,from.get(ref));
  setReturnGoal(pose,goal);layer.apply(sk,pose,GRAPH_ROOT,sm);
  if(i>=31){const actual=sm(sk,pose,GRAPH_ROOT),expected=sm(sk,goal,GRAPH_ROOT);assert.ok(Math.hypot(...actual.get(body.bones.R.hand).t.map((v,j)=>v-expected.get(body.bones.R.hand).t[j]))<0.01);}
 }
 const steady=new Map(goal);layer.step(1/60,false,true);layer.apply(sk,steady,GRAPH_ROOT,sm);assert.equal(layer.status().hasTarget,false);
 const actual=sm(sk,steady,GRAPH_ROOT),expected=sm(sk,goal,GRAPH_ROOT);assert.ok(Math.hypot(...actual.get(body.bones.R.hand).t.map((v,i)=>v-expected.get(body.bones.R.hand).t[i]))<0.01);
});


test('fresh return: one smooth arc has no former phase-stop acceleration seams',()=>{
 const sample=t=>recoveryOffset(t,[0,1,0],[0,0,1],50);
 const h=1e-5;
 const acceleration=t=>{const a=sample(t-h),b=sample(t),c=sample(t+h);return b.map((v,i)=>(a[i]-2*v+c[i])/(h*h));};
 for(const t of [.22,.6]){
  const left=acceleration(t-2*h),right=acceleration(t+2*h);
  assert.ok(Math.hypot(...left.map((v,i)=>v-right[i]))<0.2,'acceleration changes continuously across old phase boundaries');
 }
 for(const t of [0,1]){
  const near=t===0?h:1-h;
  assert.ok(Math.abs(returnProgress(near)-t)/h<1e-5,'orientation easing starts/stops without a speed jump');
 }
});

test('fresh return: sparse pose sampling and repeated draws do not alter animation time',()=>{
 const from=carry(true),goal=carry(false);
 const run=sparse=>{
  const layer=createFreshReturn({enabled:()=>true});layer.step(1/60,true,true);layer.apply(sk,from,GRAPH_ROOT,sm);
  let pose;
  for(let i=0;i<16;i++){
   layer.step(1/60,false,true);
   if(!sparse||i%4===0||i===15){pose=new Map(goal);setReturnGoal(pose,goal);layer.apply(sk,pose,GRAPH_ROOT,sm);}
  }
  const before=layer.status().age;layer.apply(sk,pose,GRAPH_ROOT,sm);assert.equal(layer.status().age,before,'rendering cannot advance the clock');
  return {age:before,m:sm(sk,pose,GRAPH_ROOT)};
 };
 const full=run(false),sparse=run(true);assert.equal(full.age,sparse.age);
 for(const side of ['L','R'])assert.ok(Math.hypot(...full.m.get(body.bones[side].hand).t.map((v,i)=>v-sparse.m.get(body.bones[side].hand).t[i]))<0.01);
});


test('fresh return: normal browser URL enables the replacement; only explicit zero opts out',()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'location');
 try {
  for(const [search,expected] of [['',true],['?world=1',true],['?fresh2hReturn=1',true],['?fresh2hReturn=0',false]]){
   Object.defineProperty(globalThis,'location',{configurable:true,value:{search}});assert.equal(freshReturnEnabled(),expected);
  }
 } finally {if(old)Object.defineProperty(globalThis,'location',old);else delete globalThis.location;}
});


test('fresh return: releasing a frozen endpoint joins the current carry without a one-frame snap',()=>{
 for(const hz of [30,60,120]){
  const layer=createFreshReturn({enabled:()=>true}),from=carry(true),goal=carry(false),live=new Map(goal),different=carry(true);
  for(const side of ['L','R'])for(const ref of [body.bones[side].upper,body.bones[side].fore,body.bones[side].hand])live.set(ref,different.get(ref));
  layer.step(1/hz,true,true);layer.apply(sk,new Map(from),GRAPH_ROOT,sm);
  let pose;
  for(let i=0;i<hz;i++){layer.step(1/hz,false,true);pose=new Map(goal);setReturnGoal(pose,goal);layer.apply(sk,pose,GRAPH_ROOT,sm);}
  const before=sm(sk,pose,GRAPH_ROOT);
  layer.step(1/hz,false,true);pose=new Map(live);layer.apply(sk,pose,GRAPH_ROOT,sm);
  const after=sm(sk,pose,GRAPH_ROOT);
  for(const side of ['L','R'])assert.ok(Math.hypot(...after.get(body.bones[side].hand).t.map((v,i)=>v-before.get(body.bones[side].hand).t[i]))<0.01,'handoff starts at the last visible hands');
  for(let i=0;i<hz/3;i++){layer.step(1/hz,false,true);pose=new Map(live);layer.apply(sk,pose,GRAPH_ROOT,sm);}
  const end=sm(sk,pose,GRAPH_ROOT),expected=sm(sk,live,GRAPH_ROOT);
  for(const side of ['L','R'])assert.ok(Math.hypot(...end.get(body.bones[side].hand).t.map((v,i)=>v-expected.get(body.bones[side].hand).t[i]))<0.01);
  assert.equal(layer.status().mode,'carry');
 }
});


test('fresh return: chest joins the last shown strike instead of snapping under otherwise smooth hands',()=>{
 const layer=createFreshReturn({enabled:()=>true}),from=carry(false),goal=new Map(from);
 const chest=goal.get(body.chest)??sk.nodes.get(body.chest).rest;
 goal.set(body.chest,{...chest,rotation:rotAxisAngle([0,0,1],.3)});
 layer.step(1/60,true,true);layer.apply(sk,new Map(from),GRAPH_ROOT,sm);
 const old=sm(sk,from,GRAPH_ROOT).get(body.chest);
 layer.step(1/60,false,true);let pose=new Map(goal);setReturnGoal(pose,goal);layer.apply(sk,pose,GRAPH_ROOT,sm);
 const first=sm(sk,pose,GRAPH_ROOT).get(body.chest);
 for(let j=0;j<9;j++)assert.ok(Math.abs(first.a[j]-old.a[j])<1e-5,'first return chest matches the last shown strike');
 for(const side of ['L','R'])for(const ref of [body.bones[side].thigh,body.bones[side].calf,body.bones[side].foot])assert.deepEqual(pose.get(ref),goal.get(ref));
 for(let i=0;i<32;i++){layer.step(1/60,false,true);pose=new Map(goal);setReturnGoal(pose,goal);layer.apply(sk,pose,GRAPH_ROOT,sm);}
 const end=sm(sk,pose,GRAPH_ROOT).get(body.chest),expected=sm(sk,goal,GRAPH_ROOT).get(body.chest);
 for(let j=0;j<9;j++)assert.ok(Math.abs(end.a[j]-expected.a[j])<1e-5);
});


test('fresh return: untracked spine locals use skeleton rest at both ends',()=>{
 const layer=createFreshReturn({enabled:()=>true}),from=carry(false),goal=new Map(from),ref=body.trunk[0];
 from.set(ref,{...sk.nodes.get(ref).rest,rotation:rotAxisAngle([1,0,0],.4)});goal.delete(ref);
 layer.step(1/60,true,true);layer.apply(sk,new Map(from),GRAPH_ROOT,sm);
 let pose;
 for(let i=0;i<31;i++){layer.step(1/60,false,true);pose=new Map(goal);setReturnGoal(pose,goal);layer.apply(sk,pose,GRAPH_ROOT,sm);}
 const actual=pose.get(ref)??sk.nodes.get(ref).rest,expected=sk.nodes.get(ref).rest;
 for(let j=0;j<9;j++)assert.ok(Math.abs(actual.rotation[j]-expected.rotation[j])<1e-5);
});


test('fresh return: explicitly live carry follows a stand-to-run change through the return and ownership bridge',()=>{
 const layer=createFreshReturn({enabled:()=>true}),from=carry(false),running=carry(true);
 layer.step(1/60,true,true);layer.apply(sk,new Map(from),GRAPH_ROOT,sm);
 let pose;
 for(let i=0;i<35;i++){
  layer.step(1/60,false,true);const goal=i<10?from:running;pose=new Map(goal);setReturnGoal(pose,goal,true);layer.apply(sk,pose,GRAPH_ROOT,sm);
  if(i>=31){const actual=sm(sk,pose,GRAPH_ROOT),expected=sm(sk,running,GRAPH_ROOT);for(const side of ['L','R'])assert.ok(Math.hypot(...actual.get(body.bones[side].hand).t.map((v,j)=>v-expected.get(body.bones[side].hand).t[j]))<0.01,'running hands must not return to a frozen standing endpoint');}
 }
});
