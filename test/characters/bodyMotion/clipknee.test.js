// CLIP-KNEE: a foot solved where the clip already has it keeps the clip's knee - the layer on or off, one leg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices as sm, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';
import { bodyOf, mul } from '../../../src/characters/bodyMotion/bodyKit.js';
import { solveBody } from '../../../src/characters/bodyMotion/bodySolve.js';
import { kneePole } from '../../../src/characters/bodyMotion/guardWalkBalance.js';
import { rotAxisAngle } from '../../../src/combat/climbRig.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const len = (a) => Math.hypot(...a);
const sub = (a, b) => a.map((v, i) => v - b[i]);

test('CLIP-KNEE: a bent leg lifted behind, its foot asked where it stands with the clip knee as the pole, keeps its knee', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton())), body = bodyOf(sk, GRAPH_ROOT, sm), b = body.bones.L;
  const bent = new Map();
  for (const [ref, turn] of [[b.thigh, 0.4], [b.calf, -1.4]]) {
    const node = sk.nodes.get(ref);
    bent.set(ref, { rotation: mul(node.rest.rotation, rotAxisAngle([0, 0, 1], turn)), translation: node.rest.translation, scale: node.rest.scale });
  }
  const mats = sm(sk, bent, GRAPH_ROOT), hip = mats.get(b.thigh).t, knee = mats.get(b.calf).t, ankle = mats.get(b.foot).t;
  assert.ok(len(sub(ankle, hip)) < 0.95 * (len(sub(knee, hip)) + len(sub(ankle, knee))), 'the leg is bent');
  const solve = (pole) => {
    const pose = new Map(bent);
    solveBody(sk, pose, GRAPH_ROOT, sm, { w: 1, legsOnly: true, feet: { L: { at: [...ankle], toe: [0, 0, -1], up: [0, 1, 0], w: 1, stance: true, pole } } });
    return sm(sk, pose, GRAPH_ROOT).get(b.calf).t;
  };
  const length = len(sub(knee, hip)) + len(sub(ankle, knee));
  const kept = solve(kneePole(hip, knee, [0, 0, -1], length)), toesAlone = solve(undefined);
  assert.ok(dist(toesAlone, knee) > 3, `without it the knee went ${dist(toesAlone, knee).toFixed(1)} units elsewhere`);
  assert.ok(dist(kept, knee) < 1, `the clip knee moved ${dist(kept, knee).toFixed(1)} units`);
});


test('LEG-RELEASE: a vanishing foot layer also releases the knee plane', () => {
 const sk=buildSkeleton(parseNif(retailSkeleton())),body=bodyOf(sk,GRAPH_ROOT,sm),b=body.bones.L,bent=new Map();
 for(const [ref,turn]of [[b.thigh,.4],[b.calf,-1.4]]){const r=sk.nodes.get(ref).rest;bent.set(ref,{...r,rotation:mul(r.rotation,rotAxisAngle([0,0,1],turn))});}
 const before=sm(sk,bent,GRAPH_ROOT),ankle=before.get(b.foot).t,knee=before.get(b.calf).t;
 const pose=new Map(bent);solveBody(sk,pose,GRAPH_ROOT,sm,{w:1e-5,legsOnly:true,feet:{L:{at:[...ankle],pole:[1,0,0],w:1}}});
 assert.ok(dist(sm(sk,pose,GRAPH_ROOT).get(b.calf).t,knee)<.01,'a nearly absent layer cannot rotate the whole knee plane');
});


test('TRUNK-RETURN: external arm ownership retains the same trunk turn as an empty arm request',()=>{
 const sk=buildSkeleton(parseNif(retailSkeleton())),body=bodyOf(sk,GRAPH_ROOT,sm);
 const expected=new Map(),actual=new Map(),plan={w:.7,trunk:{yaw:.3,pitch:.15},arms:()=>({})};
 solveBody(sk,expected,GRAPH_ROOT,sm,plan);
 solveBody(sk,actual,GRAPH_ROOT,sm,{...plan,arms:()=>null,externalArms:true});
 const a=sm(sk,actual,GRAPH_ROOT).get(body.chest),e=sm(sk,expected,GRAPH_ROOT).get(body.chest);
 a.a.forEach((v,i)=>assert.ok(Math.abs(v-e.a[i])<1e-6,'the trunk cannot lose its lean while the new return owns the hands'));
});
