// HAND-FINGERS and FISTS-GUARD (2026-11-06, bible/05-Combat/Motion-Doctrine.md; the owner's
// screenshots and 22-13-15 recording: the fists' fingers half open like claws, a hilt walked in an open hand, the fist
// beside a shield raised to the breast, the free hand hanging woodenly at rest).
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIST, FINGERS, fingerShares } from '../../../src/characters/bodyMotion/handFingers.js';
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

test("HAND-FINGERS: a hand closed on something stands toward the game's fist - a fist, a hilt, a strap; the free hand beside a shield is the game's open hand; every other hand keeps the clip's fingers", () => {
  const at = (o) => fingerShares(sceneInput({ kind: 'female', ...o }));
  const fist = (k) => ({ fist: k, open: 0 });
  assert.deepEqual(at({ weapon: T.None, shown: true }), { R: fist(FINGERS.fist), L: fist(FINGERS.fist) }, 'the fists drawn');
  assert.deepEqual(at({ weapon: T.None, shown: true, shield: true }), { R: { fist: 0, open: 1 }, L: fist(FINGERS.grip) }, 'beside a shield the right is a free hand');
  assert.deepEqual(at({ weapon: T.LongBladeOneHand }), { R: fist(FINGERS.hilt), L: null });
  assert.deepEqual(at({ weapon: T.LongBladeOneHand, shield: true }), { R: fist(FINGERS.hilt), L: fist(FINGERS.grip) });
  assert.deepEqual(at({ weapon: T.LongBladeOneHand, torch: true }), { R: fist(FINGERS.hilt), L: null });
  assert.deepEqual(at({ weapon: T.LongBladeTwoHand }), { R: fist(FINGERS.hilt), L: fist(FINGERS.hilt) });
  assert.deepEqual(at({ weapon: T.LongBladeOneHand, shown: false }), { R: null, L: null }, "empty hands, the clip's");
  assert.deepEqual(at({ weapon: T.MarksmanBow }), { R: null, L: null });
  assert.deepEqual(at({ weapon: T.None, shown: true, busy: 'hit' }), { R: null, L: null });
  assert.ok(FINGERS.grip < FINGERS.hilt && FINGERS.hilt < FINGERS.fist);
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

test('FISTS-GUARD: the fists drawn walk, run and step on the worked gait and the stance\'s walk, as the weapons do (mutant: the hand-to-hand clips, whose walk-to-run change threw the fists half an arm in a frame)', async () => {
  const { guardMovementGroup } = await import('../../../src/combat/guardLocomotion.js');
  const { guardWalks } = await import('../../../src/characters/bodyMotion/guardWalkPose.js');
  const has = () => true;
  for (const base of ['walkforward', 'runforward', 'walkback', 'walkleft']) assert.equal(guardMovementGroup(base, T.HandToHand, has, true).group, base);
  assert.equal(guardMovementGroup('walkforward', T.HandToHand, has, false).group, 'walkforwardhh', 'off, the reference\'s own');
  assert.ok(guardWalks(sceneInput({ weapon: T.None, shown: true, speed: 2.5, forward: 1 }), 'walkforward'), 'the stance\'s walk for the empty hands drawn');
  assert.ok(!guardWalks(sceneInput({ weapon: T.None, shown: false, speed: 2.5, forward: 1 }), 'walkforward'), 'never for the hands sheathed');
});
