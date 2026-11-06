// HAND-FINGERS, FIST-BESIDE-SHIELD and FREE-HAND-REST (2026-11-06, bible/05-Combat/Motion-Doctrine.md; the owner's
// screenshots and 22-13-15 recording: the fists' fingers half open like claws, a hilt walked in an open hand, the fist
// beside a shield raised to the breast, the free hand hanging woodenly at rest).
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIST, FINGERS, fingerShares } from '../../../src/characters/bodyMotion/handFingers.js';
import { CARRY, FIST_BESIDE_SHIELD } from '../../../src/characters/bodyMotion/carry.js';
import { createBodyMotion, sceneInput } from '../../../src/characters/bodyMotion/bodyMotion.js';
import { createBodyWeight } from '../../../src/characters/bodyMotion/bodyWeight.js';
import { bodyOf } from '../../../src/characters/bodyMotion/bodyKit.js';
import { bodyFrames } from '../../../src/characters/bodyMotion/bodySolve.js';
import { clipStridePhase } from '../../../src/combat/movementContinuity.js';
import { createLowerBodyLayer, lowerBodyBones } from '../../../src/combat/lowerBodyLayer.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices as sm, accumRootRef, GRAPH_ROOT, injectSkeletonNodes } from '../../../src/formats/morrowind/mwSkin.js';
import { extractTracks, collectTextKeys, normalizeTextKeys, resetClip, sampleTrack, advanceClip, animVelocity } from '../../../src/formats/morrowind/mwAnim.js';
import { poseAssembly, MW_WEAPON_TYPE as T, MW_UNITS_PER_METER } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { mat33ToQuat } from '../../../src/combat/heldPose.js';
import { offWeaponBoneAddon } from '../../../src/combat/twoHands/mirrorRig.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';

test('HAND-FINGERS: each hand\'s fingers by what it holds - a fist, a hilt, a strap, a loose fist beside a shield, an empty hand relaxed; the clip\'s for a light, a spell, a bow, a busy body', () => {
  const at = (o) => fingerShares(sceneInput({ kind: 'female', ...o }));
  assert.deepEqual(at({ weapon: T.HandToHand }), { R: FINGERS.fist, L: FINGERS.fist });
  assert.deepEqual(at({ weapon: T.HandToHand, shield: true }), { R: FINGERS.loose, L: FINGERS.grip });
  assert.deepEqual(at({ weapon: T.LongBladeOneHand }), { R: FINGERS.hilt, L: FINGERS.relaxed });
  assert.deepEqual(at({ weapon: T.LongBladeOneHand, shield: true }), { R: FINGERS.hilt, L: FINGERS.grip });
  assert.deepEqual(at({ weapon: T.LongBladeOneHand, torch: true }), { R: FINGERS.hilt, L: null });
  assert.deepEqual(at({ weapon: T.LongBladeTwoHand }), { R: FINGERS.hilt, L: FINGERS.hilt });
  assert.deepEqual(at({ weapon: T.LongBladeOneHand, shown: false }), { R: FINGERS.relaxed, L: FINGERS.relaxed });
  assert.deepEqual(at({ weapon: T.MarksmanBow }), { R: null, L: null });
  assert.deepEqual(at({ weapon: T.HandToHand, busy: 'hit' }), { R: null, L: null });
  assert.ok(FINGERS.relaxed < FINGERS.loose && FINGERS.loose < FINGERS.grip && FINGERS.grip < FINGERS.hilt && FINGERS.hilt < FINGERS.fist);
});

const root = new URL('../../../', import.meta.url);
const KF = 'Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf';
const available = existsSync(new URL(KF, root));
const clips = () => { const nif = parseNif(readFileSync(new URL(KF, root))); return { keys: normalizeTextKeys(collectTextKeys(nif)), trackMap: extractTracks(nif) }; };

test('HAND-FINGERS: the fist is the hand-to-hand idle\'s own fingers, as the retail rig poses them', { skip: !available }, () => {
  const { keys, trackMap } = clips(), sk = buildSkeleton(parseNif(retailSkeleton()));
  const st = resetClip(keys, 'idlehh', { loopFallback: true }), pose = poseSkeleton(sk, trackMap, sampleTrack, (st.startTime + st.stopTime) / 2);
  for (const [name, q] of Object.entries(FIST)) {
    const got = mat33ToQuat(Array.from(pose.get(sk.byName.get(name)).rotation)), s = got.reduce((a, v, i) => a + v * q[i], 0) < 0 ? -1 : 1;
    assert.ok(got.every((v, i) => Math.abs(v * s - q[i]) < 2e-3), `${name}: ${got} against ${q}`);
  }
});

/** The body layers as fpArm.js lays them (no left-arm layer: the motion and weight layers' own hands). */
function run(input, steps) {
  const { keys, trackMap } = clips(), source = { keys, trackMap };
  const n = parseNif(retailSkeleton()), sk = buildSkeleton(n);
  injectSkeletonNodes(sk, offWeaponBoneAddon(sk, GRAPH_ROOT, sm, n));
  const body = bodyOf(sk, GRAPH_ROOT, sm), lower = createLowerBodyLayer({ sampleTrack }), weight = createBodyWeight(), motion = createBodyMotion(undefined, lower);
  const assembly = { skeleton: sk, fns: { poseSkeleton, skelMats: sm }, pieces: [] }, accumRoot = accumRootRef(sk, trackMap), mask = lowerBodyBones(sk);
  const out = []; let z = 0, movement = null, group = null;
  for (const [frames, walking] of steps) for (let i = 0; i < frames; i++) {
    const want = walking ? 'walkforward' : 'idle1h';
    if (want !== group) { movement = resetClip(keys, want, { loopFallback: true, loopCount: Infinity }); group = want; }
    const dt = 1 / 60, speed = walking ? 2.5 : 0; z += speed * dt;
    const cam = { yaw: 0, move: { speed, running: false, forward: walking ? 1 : 0, strafe: 0, grounded: true, bodyYaw: 0, travel: [0, 0, z] } };
    const word = sceneInput({ kind: 'female', speed, forward: walking ? 1 : 0, travel: cam.move.travel, legPhase: clipStridePhase(movement, keys), ...input });
    const pace = walking ? animVelocity(keys, trackMap.get(sk.nodes.get(accumRoot).name.toLowerCase()), want) || 1 : 1;
    advanceClip(movement, keys, dt * (walking ? weight.moveRate(speed * MW_UNITS_PER_METER / pace, want) : 1));
    lower.stepRig(dt, true, null, null, null, null, movement, source, null, null);
    motion.step(dt, word); weight.stepRig(dt, true, cam, [], input.weapon, false, word, movement, source, pace);
    poseAssembly(assembly, { tracks: lower.tracks(trackMap, mask), sampleTrack: lower.sampler(sampleTrack), time: movement.time, accumRoot, skin: false, motion: weight.slot(motion.slot) });
    const M = assembly.mats, F = bodyFrames(body, M), c = M.get(body.chest).t;
    const local = (ref) => { const d = M.get(ref).t.map((v, j) => v - c[j]); return [F.right, F.fwd, F.up].map((a) => a.reduce((s, v, j) => s + v * d[j], 0) / body.arm); };
    const knuckle = (s) => { const p = (nm) => M.get(sk.byName.get(`bip01 ${s} ${nm}`)).t, u = p('finger1').map((v, j) => v - p('hand')[j]), w = p('finger11').map((v, j) => v - p('finger1')[j]); return Math.acos(u.reduce((a, v, j) => a + v * w[j], 0) / Math.hypot(...u) / Math.hypot(...w)) * 180 / Math.PI; };
    out.push({ L: local(body.bones.L.hand), R: local(body.bones.R.hand), fingersR: knuckle('r') });
  }
  return out;
}

test('HAND-FINGERS: walking, a one-hander\'s hilt is held in a closed hand, as the stance holds it standing (mutant: the free walk\'s open fingers, 20 degrees)', { skip: !available }, () => {
  const walk = run({ weapon: T.LongBladeOneHand }, [[60, false], [120, true]]).slice(-60);
  for (const f of walk) assert.ok(f.fingersR > 65, `the sword hand's knuckles at ${f.fingersR.toFixed(0)} degrees`);
});

test('FREE-HAND-REST: standing, a one-hander\'s free hand rests down by the side, lowered there smoothly from the walk (mutant: the stance\'s hand held before the belly)', { skip: !available }, () => {
  const frames = run({ weapon: T.LongBladeOneHand }, [[120, true], [90, false]]);
  const rest = frames.at(-1).L;
  assert.ok(rest[1] < 0.25 && rest[2] < -0.7, `the free hand at rest ${rest.map((v) => v.toFixed(2))}`);
  let worst = 0;
  for (let i = 121; i < frames.length; i++) worst = Math.max(worst, Math.hypot(...frames[i].L.map((v, j) => v - frames[i - 1].L[j])));
  assert.ok(worst < 0.06, `lowered smoothly: ${worst.toFixed(3)} arm lengths in a frame`);
});

test('FIST-BESIDE-SHIELD: the fists\' right arm beside a shield stands as the one-hander\'s free left arm does, mirrored - low by the hip, not raised to the breast (it stood 0.16 arm lengths above the chest bone)', { skip: !available }, () => {
  const fist = run({ weapon: T.HandToHand, shield: true }, [[150, false]]).at(-1).R;
  const free = run({ weapon: T.LongBladeOneHand }, [[150, false]]).at(-1).L;
  assert.ok(Math.abs(fist[0] + free[0]) < 0.08 && Math.abs(fist[1] - free[1]) < 0.08 && Math.abs(fist[2] - free[2]) < 0.08, `beside the shield ${fist.map((v) => v.toFixed(2))}, the free hand ${free.map((v) => v.toFixed(2))}`);
  assert.ok(fist[2] < -0.5, 'the fist is down by the hip');
  assert.ok(FIST_BESIDE_SHIELD.walk.R.swing > 0 && CARRY.fists.walk.R.swing < FIST_BESIDE_SHIELD.walk.R.swing, 'it swings with the stride as the guard does not');
});
