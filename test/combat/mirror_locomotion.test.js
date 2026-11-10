import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{parseNif}from'../../src/formats/morrowind/mwNifFile.js';
import{buildSkeleton,poseSkeleton,skeletonSpaceMatrices as matrices,GRAPH_ROOT}from'../../src/formats/morrowind/mwSkin.js';
import{mat33Mul}from'../../src/formats/morrowind/mwNifMesh.js';
import{rotAxisAngle}from'../../src/combat/climbRig.js';
import{applyMirrorRig}from'../../src/combat/twoHands/mirrorRig.js';
import{lowerBodyBones,withMirrorLocomotion}from'../../src/combat/lowerBodyLayer.js';
const rig=()=>buildSkeleton(parseNif(readFileSync(new URL('../../vendor/weapon-sheathing/Data Files/Animations/xbase_anim_female/xbase_anim_sh.nif',import.meta.url))));
function stride(sk,phase=0){const p=poseSkeleton(sk,null,null,0);for(const[name,angle]of [['bip01 l thigh',0.4+phase],['bip01 r thigh',-0.2-phase],['bip01 r upperarm',0.7]]){const r=sk.byName.get(name),v=p.get(r);p.set(r,{...v,rotation:mat33Mul(rotAxisAngle([0,0,1],angle),v.rotation)});}return p;}
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
test('whole-body mirroring preserves the locomotion-owned female feet and still mirrors the strike',()=>{
 const sk=rig(),source=stride(sk),a=matrices(sk,source,GRAPH_ROOT),free=new Map(source),kept=new Map(source);
 applyMirrorRig(sk,free,GRAPH_ROOT,matrices,{full:true});
 const req=withMirrorLocomotion({full:true},1,sk);applyMirrorRig(sk,kept,GRAPH_ROOT,matrices,req);
 const f=matrices(sk,free,GRAPH_ROOT),k=matrices(sk,kept,GRAPH_ROOT),foot=sk.byName.get('bip01 l foot'),hand=sk.byName.get('bip01 l hand');
 assert.ok(distance(a.get(foot).t,f.get(foot).t)>1,'unprotected mirror exchanges an asymmetric stride');
 for(const name of lowerBodyBones(sk))assert.deepEqual(kept.get(sk.byName.get(name)),source.get(sk.byName.get(name)),name);
 assert.ok(distance(a.get(foot).t,k.get(foot).t)<1e-5,'the actual foot world position belongs to locomotion');
 assert.ok(distance(a.get(hand).t,k.get(hand).t)>1,'the upper-body strike is still mirrored');
 const standing={full:true};assert.equal(withMirrorLocomotion(standing,0,sk),standing,'standing/native whole-body blows are unchanged');
});
test('locomotion protection survives mirror changes and stores the actually drawn legs in its carry',()=>{
 const sk=rig(),state={};
 for(let i=0;i<20;i++){const source=stride(sk,i*0.015),p=new Map(source),req=withMirrorLocomotion({full:i%4<2,carry:{key:i%4<2?'left':'none',dt:1/60,tau:0.06,state}},1,sk);applyMirrorRig(sk,p,GRAPH_ROOT,matrices,req);
  for(const name of lowerBodyBones(sk)){const ref=sk.byName.get(name);assert.deepEqual(p.get(ref),source.get(ref),name+' frame '+i);if(state.last)assert.deepEqual(state.last.get(ref),p.get(ref),'carry must remember the protected pose');}
 }
});
test('partial lower ownership fades between valid rotations instead of switching the mirror at a threshold',()=>{
 const sk=rig(),source=stride(sk),ref=sk.byName.get('bip01 l thigh'),samples=[];
 for(const weight of [0,0.25,0.5,0.75,1]){const p=new Map(source);applyMirrorRig(sk,p,GRAPH_ROOT,matrices,withMirrorLocomotion({full:true},weight,sk));samples.push(p.get(ref));const r=p.get(ref).rotation;for(let row=0;row<3;row++)assert.ok(Math.abs(Math.hypot(...r.slice(row*3,row*3+3))-1)<1e-5);}
 assert.deepEqual(samples[4],source.get(ref));assert.notDeepEqual(samples[0],samples[4]);for(let i=1;i<4;i++)assert.notDeepEqual(samples[i],samples[i-1]);
});
