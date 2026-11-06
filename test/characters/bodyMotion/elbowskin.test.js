import { skinLayout, writeSkinPalette, skinnedVertex } from '../../../src/formats/morrowind/mwGpuSkin.js';
import { assembleFirstPersonArm } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices as sm, GRAPH_ROOT, skinBatch } from '../../../src/formats/morrowind/mwSkin.js';
import { bindPart } from '../../../src/formats/morrowind/mwCharacter.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';
import { bindElbowSkin, poseElbowSkin } from '../../../src/characters/bodyMotion/elbowSkin.js';
import { createBodyMotion, sceneInput } from '../../../src/characters/bodyMotion/bodyMotion.js';
import { clearArms } from '../../../src/characters/bodyMotion/armClearance.js';
import { bodyOf, mul } from '../../../src/characters/bodyMotion/bodyKit.js';
const file = new URL('../../../Mods/Bodies/Better Bodies/Underwear/Data Files/Meshes/bb/bb_skinf_de.nif', import.meta.url);
const det = a => a[0]*(a[4]*a[8]-a[5]*a[7])-a[1]*(a[3]*a[8]-a[5]*a[6])+a[2]*(a[3]*a[7]-a[4]*a[6]);
const positions = (batch, sk, pose) => { const out = new Float32Array(batch.positions.length); skinBatch(batch, sk, pose, sm(sk, pose, GRAPH_ROOT), out, null); return out; };
test('elbow skin: real Better Bodies binding preserves ordinary poses and bounds influence count', {skip:!existsSync(file)}, () => {
 const sk=buildSkeleton(parseNif(retailSkeleton())),nif=parseNif(readFileSync(file));
 const original=bindPart(sk,nif),bound=bindElbowSkin(sk,bindPart(sk,nif));
 assert.ok(bound.skinned.some(b=>b.skin.bones.some(b=>/^DFO .* Elbow Skin$/.test(b.name))));
 for(let i=0;i<bound.skinned.length;i++){
  const batch=bound.skinned[i],a=positions(original.skinned[i],sk,new Map()),b=positions(batch,sk,new Map());
  assert.ok(Math.max(...a.map((v,j)=>Math.abs(v-b[j])))<0.0001,'identity helpers must preserve the actual skin');
  const sums=new Float64Array(a.length/3),old=new Float64Array(a.length/3),counts=new Uint8Array(a.length/3);
  for(const bone of batch.skin.bones)for(let k=0;k<bone.indices.length;k++){sums[bone.indices[k]]+=bone.weights[k];if(bone.weights[k]>0)counts[bone.indices[k]]++;}
  for(const bone of original.skinned[i].skin.bones)for(let k=0;k<bone.indices.length;k++)old[bone.indices[k]]+=bone.weights[k];
  assert.ok(Math.max(...sums.map((v,j)=>Math.abs(v-old[j])))<1e-7,'total skin weights stay unchanged');
  assert.ok(Math.max(...counts)<=4,'GPU influence budget');
 }
});
test('elbow skin: proximal twist relief reduces actual forearm volume loss without moving any original joint', {skip:!existsSync(file)}, () => {
 const sk=buildSkeleton(parseNif(retailSkeleton())),bound=bindElbowSkin(sk,bindPart(sk,parseNif(readFileSync(file)))),motion=createBodyMotion();
 let pose;
 for(let i=0;i<180;i++){motion.step(1/60,sceneInput({weapon:2,kind:'female'}));pose=new Map();const report=motion.apply(sk,pose,GRAPH_ROOT,sm);clearArms(sk,pose,GRAPH_ROOT,sm,{held:report?.armAnatomy});}
 const before=sm(sk,pose,GRAPH_ROOT),rest=sm(sk,new Map(),GRAPH_ROOT);
 poseElbowSkin(sk,pose,GRAPH_ROOT,sm);const after=sm(sk,pose,GRAPH_ROOT);
 const body=bodyOf(sk,GRAPH_ROOT,sm);
 for(const side of ['L','R'])for(const ref of [body.bones[side].upper,body.bones[side].fore,body.bones[side].hand])assert.deepEqual(after.get(ref),before.get(ref));
 const batch=bound.skinned.find(b=>b.name==='Tri Left Forearm');
 const volume=m=>{
  const rows=Array.from({length:batch.positions.length/3},()=>({a:Array(9).fill(0),r:Array(9).fill(0)}));
  for(const bone of batch.skin.bones){const a=mul(m.get(bone.ref).a,bone.invBind.a),r=mul(rest.get(bone.ref).a,bone.invBind.a);for(let k=0;k<bone.indices.length;k++){const row=rows[bone.indices[k]],w=bone.weights[k];for(let j=0;j<9;j++){row.a[j]+=a[j]*w;row.r[j]+=r[j]*w;}}}
  return Math.min(...rows.map(row=>det(row.a)/det(row.r)));
 };
 assert.ok(volume(after)>volume(before)+0.02,`volume retention ${volume(before)} -> ${volume(after)}`);
 const piece={kind:'skinned',slot:'forearm',batch,positions:batch.positions,indices:batch.indices};
 const layout=skinLayout([piece]);assert.equal(layout.ok,true);
 writeSkinPalette(layout,{skeleton:sk,pose,mats:after});
 const cpu=positions(batch,sk,pose);
 for(let v=0;v<cpu.length/3;v++){const gpu=skinnedVertex(layout,piece,v);for(let j=0;j<3;j++)assert.ok(Math.abs(gpu[j]-cpu[v*3+j])<0.0001,'GPU and CPU use the same helper deformation');}
 const ordinary=new Map();poseElbowSkin(sk,ordinary,GRAPH_ROOT,sm);
 for(const [ref,local] of ordinary)assert.deepEqual(local,sk.nodes.get(ref).rest,'no held ownership resets helpers to ordinary skin');
});


test('elbow skin: live player assembly binds the helpers before packing render pieces', {skip:!existsSync(file)}, async () => {
 const arm=await assembleFirstPersonArm({skeletonBytes:retailSkeleton(),parts:[{slot:'skin',bytes:readFileSync(file)}]});
 assert.equal(arm.ok,true);
 assert.ok(arm.pieces.some(p=>p.batch?.skin?.bones.some(b=>/^DFO .* Elbow Skin$/.test(b.name))));
});
