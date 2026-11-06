import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { collectTextKeys, normalizeTextKeys, extractTracks, resetClip, sampleTrack, advanceClip, animVelocity } from '../../src/formats/morrowind/mwAnim.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices as sm, accumRootRef, GRAPH_ROOT } from '../../src/formats/morrowind/mwSkin.js';
import { retailSkeleton } from '../fixtures/mw/retailRig.mjs';
import { createLeftArmLayer, leftArmPlan } from '../../src/combat/leftArmLayer.js';
import { pickAnimSource, composeMovementGroup, composeStanceGroup, blendMaskBones, MW_WEAPON_TYPE, MW_UNITS_PER_METER } from '../../src/formats/morrowind/mwFirstPerson.js';
import { armedUpperPlan } from '../../src/combat/guardLocomotion.js';
import { createLowerBodyLayer, lowerBodyBones, upperBodyBones } from '../../src/combat/lowerBodyLayer.js';
import { createBodyMotion, sceneInput } from '../../src/characters/bodyMotion/bodyMotion.js';
import { createBodyWeight } from '../../src/characters/bodyMotion/bodyWeight.js';
import { bodyOf } from '../../src/characters/bodyMotion/bodyKit.js';

const nif = parseNif(readFileSync(new URL('../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf', import.meta.url)));
const keys = normalizeTextKeys(collectTextKeys(nif)), trackMap = extractTracks(nif);
const source = { name: 'MAO', keys, trackMap, groupSet: new Set(keys.map((k) => k.text.split(':')[0])) };
const type = MW_WEAPON_TYPE.LongBladeOneHand;
const deps = { pickAnimSource, resetClip, composeMovementGroup, composeStanceGroup, sampleTrack };
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

function rig(base, previous, torsoSway = 0.55) {
  const sk = buildSkeleton(parseNif(retailSkeleton())), body = bodyOf(sk, GRAPH_ROOT, sm);
  const left = createLeftArmLayer(deps), upper = createLeftArmLayer(deps), lower = createLowerBodyLayer({ sampleTrack });
  const motion = createBodyMotion(), weight = createBodyWeight(), state = resetClip(keys, base, { loopFallback: true, loopCount: Infinity });
  const mask = blendMaskBones(sk), accumRoot = accumRootRef(sk, trackMap);
  const pace = animVelocity(keys, trackMap.get(sk.nodes.get(accumRoot).name.toLowerCase()), base);
  return { sk, mask, body, step(f) {
    const dt = 1 / 60, speed = 4.4;
    advanceClip(state, keys, dt * 1.36);
    const cam = { yaw: 0, move: { speed, forward: base === 'walkback' ? -1 : 1, running: false, grounded: true, bodyYaw: 0, travel: [0, 0, f * speed * dt] } };
    const word = sceneInput({ weapon: type, shield: true, speed, forward: cam.move.forward });
    let plan = leftArmPlan({ mode: 'shield', moving: true, base });
    if (previous) plan = { ...plan, adapt: false, sway: 1 };
    const input = { sources: [source], hasGroup: (g) => source.groupSet.has(g), stance: type, movement: state, movementSource: source };
    left.step(dt, { ...input, plan });
    upper.step(dt, { ...input, plan: { ...armedUpperPlan({ on: true, shield: true, type, base, moving: true }), sway: torsoSway } });
    lower.stepRig(dt, true, null, null, null, null, state, source, null, null);
    motion.step(dt, word); weight.stepRig(dt, true, cam, [], type, false, word, state, source, pace);
    const tracks = lower.tracks(left.tracks(upper.tracks(trackMap, upperBodyBones(sk)), mask), lowerBodyBones(sk));
    const pose = poseSkeleton(sk, tracks, lower.sampler(left.sampler(upper.sampler())), state.time, { accumRoot });
    weight.slot(motion.slot)(sk, pose, GRAPH_ROOT, sm);
    return { pose, mats: sm(sk, pose, GRAPH_ROOT) };
  } };
}

test('SHIELD-WALK: real layered guard walks keep the strafe arm alive with less swing, without changing the legs or weapon arm', () => {
  for (const base of ['walkforward', 'walkback']) {
    const before = rig(base, true), after = rig(base, false), samples = [[], []];
    for (let f = 0; f < 300; f++) {
      const old = before.step(f), now = after.step(f);
      for (const [ref, node] of after.sk.nodes) {
        if (!after.mask.has(node.name.toLowerCase())) assert.deepEqual(now.pose.get(ref), old.pose.get(ref), `${base}: changed ${node.name}`);
      }
      if (f < 180) continue;
      for (const [index, frame, r] of [[0, old, before], [1, now, after]]) {
        const hand = frame.mats.get(r.body.bones.L.hand), chest = frame.mats.get(r.body.chest);
        samples[index].push({ position: hand.t.map((v, i) => v - chest.t[i]), turn: hand.a });
      }
    }
    const range = (rows) => {
      let angle = 0, travel = 0;
      for (let i = 0; i < rows.length; i++) for (let j = 0; j < i; j++) {
        travel = Math.max(travel, distance(rows[i].position, rows[j].position));
        const dot = rows[i].turn.reduce((sum, x, k) => sum + x * rows[j].turn[k], 0);
        angle = Math.max(angle, Math.acos(Math.max(-1, Math.min(1, (dot - 1) / 2))));
      }
      return { angle, travel };
    };
    const old = range(samples[0]), now = range(samples[1]);
    assert.ok(now.angle < old.angle * 0.9, `${base}: shield rotation ${now.angle} was ${old.angle}`);
    assert.ok(now.travel < old.travel, `${base}: shield travel ${now.travel} was ${old.travel}`);
    assert.ok(now.angle > 0.03 && now.travel > 1, `${base}: the arm must remain animated`);
  }
});

test('SHIELD-WALK: running, lateral movement, attacks and first person keep their existing plans', () => {
  for (const base of ['runforward', 'runback']) assert.deepEqual(leftArmPlan({ mode: 'shield', moving: true, base }),
    { kind: 'movement', base: 'runleft', stance: 'drawn', still: false, rigOrder: true });
  for (const base of ['walkleft', 'walkright', 'runleft', 'runright']) assert.equal(leftArmPlan({ mode: 'shield', moving: true, base }), null);
  for (const extra of [{ attacking: true }, { view: 'first' }, { moving: false }]) assert.equal(leftArmPlan({ mode: 'shield', moving: true, base: 'walkforward', ...extra }), null);
});


test('SHIELD-COHERENCE: quieter live torso reduces the armed clip wave without changing the stride',()=>{
 for(const base of ['walkforward','walkback']){
  const old=rig(base,false,1),calm=rig(base,false,.55),rows=[[],[]];
  for(let f=0;f<300;f++){
   const a=old.step(f),b=calm.step(f);
   if(f<120)continue;
   const chest=old.body.chest;rows[0].push(a.mats.get(chest).a);rows[1].push(b.mats.get(chest).a);
   for(const side of ['L','R'])for(const key of ['thigh','calf','foot'])assert.deepEqual(a.mats.get(old.body.bones[side][key]),b.mats.get(calm.body.bones[side][key]));
  }
  const wave=xs=>{const mean=Array.from({length:9},(_,j)=>xs.reduce((sum,x)=>sum+x[j],0)/xs.length);return Math.sqrt(xs.reduce((sum,x)=>sum+x.reduce((s,v,j)=>s+(v-mean[j])**2,0),0)/xs.length);};
  const before=wave(rows[0]),after=wave(rows[1]);
  assert.ok(after<before*.8&&after>before*.2,base+' keeps a quieter living torso: '+before+' -> '+after);
 }
});
