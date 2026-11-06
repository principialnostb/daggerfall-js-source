// TRUNK-SKIN and LEG-CLOCK (2026-11-06, bible/05-Combat/Motion-Doctrine.md; the owner's 19-47-18 recording: running
// with a two-hander the shoulder sinks into the chest, and the trunk and the arms move apart from the legs).
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trunkRadius, trunkInside, TRUNK_PROFILE, LIMB } from '../../../src/characters/bodyMotion/trunkProfile.js';
import { wristPole, ARM_ANATOMY } from '../../../src/characters/bodyMotion/armAnatomy.js';
import { createLegClock, LEG_CLOCK } from '../../../src/characters/bodyMotion/legClock.js';
import { clipStridePhase } from '../../../src/combat/movementContinuity.js';
import { createGaitState, stepGait } from '../../../src/characters/bodyMotion/gait.js';
import { solveReach } from '../../../src/combat/climbRig.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices as sm, accumRootRef, GRAPH_ROOT, injectSkeletonNodes, skinBatch } from '../../../src/formats/morrowind/mwSkin.js';
import { extractTracks, collectTextKeys, normalizeTextKeys, resetClip, sampleTrack, advanceClip, animVelocity } from '../../../src/formats/morrowind/mwAnim.js';
import { poseAssembly, MW_WEAPON_TYPE, MW_UNITS_PER_METER } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { createLowerBodyLayer, lowerBodyBones } from '../../../src/combat/lowerBodyLayer.js';
import { guardMovementGroup } from '../../../src/combat/guardLocomotion.js';
import { createBodyWeight } from '../../../src/characters/bodyMotion/bodyWeight.js';
import { createBodyMotion, sceneInput } from '../../../src/characters/bodyMotion/bodyMotion.js';
import { bodyOf } from '../../../src/characters/bodyMotion/bodyKit.js';
import { bodyFrames } from '../../../src/characters/bodyMotion/bodySolve.js';
import { offWeaponBoneAddon } from '../../../src/combat/twoHands/mirrorRig.js';
import { bindPart } from '../../../src/formats/morrowind/mwCharacter.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';

const frac = (x) => x - Math.floor(x);
const near = (a, b) => Math.abs(frac(a - b + 0.5) - 0.5);

test('TRUNK-SKIN: the profile is the body\'s - a woman\'s breasts stand out in front, the shoulders\' seam is open', () => {
  // in front at the breasts' height (shoulder widths about the chest bone): the female trunk's skin further out
  const F = trunkRadius('female', 0, 0.5, -0.05), M = trunkRadius('male', 0, 0.5, -0.05);
  assert.ok(F > 0.55 && M > 0.4 && F > M + 0.08, `breasts ${F} against ${M}`);
  // the ellipse ARM-CLEARANCE measured stopped at 0.42 in front: the skin is past it
  assert.ok(F > 0.42 + 0.1);
  // beside the chest at the shoulders' height no trunk stands (the arm's own seam)
  assert.equal(trunkRadius('female', 0.5, 0, 0.15), 0);
  // above and below the baked slices, nothing
  assert.equal(trunkRadius('male', 0, 0.5, (TRUNK_PROFILE.male.z0 - 2) * TRUNK_PROFILE.DZ), 0);
  assert.equal(trunkRadius('male', 0, 0.5, 5), 0);
  // a point on the axis is inside by the trunk's radius and the limb's own thickness
  const inside = trunkInside('female', { right: [1, 0, 0], fwd: [0, 1, 0], up: [0, 0, 1] }, [0, 0, 0], 20);
  assert.ok(Math.abs(inside([0, 0, -1]) - (trunkRadius('female', 0, 0, -0.05) + LIMB.fore)) < 1e-9);
  assert.equal(inside([0, 40, -1]), 0);
});

test('TRUNK-SKIN: the held wrist\'s ease never folds the elbow into the trunk (mutant: the wrist eased through it)', () => {
  // the arm along +y; the preferred elbow out to +x; fingers along +x ask the elbow round to -x - the trunk's side
  const S = [0, 0, 0], W = [0, 14, 0], up = 10, fore = 10, fingers = [1, 0, 0.2], pole = [1, 0, 0];
  const elbowOf = (p) => solveReach(S, up, fore, W, p, 0.999).mid;
  const inside = (mid) => Math.max(0, -mid[0]) / 20;   // the trunk is all of x < 0, in shoulder widths of 20
  const free = elbowOf(wristPole(S, W, fingers, up, fore, pole, 1));
  const kept = elbowOf(wristPole(S, W, fingers, up, fore, pole, 1, inside));
  assert.ok(free[0] < -3, `unguarded the wrist's ease swings the elbow into the trunk (${free[0]})`);
  assert.ok(inside(kept) <= inside(elbowOf(pole)) + ARM_ANATOMY.trunkGive + 1e-9, `guarded it stops at the trunk's give (${kept[0]})`);
  assert.ok(kept[0] < elbowOf(pole)[0] - 1e-6, 'it still eases the wrist as far as the trunk allows');
});

test('LEG-CLOCK: the clip\'s contact phase, even between its contacts, 0 at the left\'s', () => {
  const keys = [{ time: 0, text: 'walkforward: start' }, { time: 0, text: 'walkforward: loop start' }, { time: 0.2, text: 'soundgen: left' },
    { time: 0.7, text: 'soundgen: right' }, { time: 1, text: 'walkforward: loop stop' }, { time: 1, text: 'walkforward: stop' }];
  const st = (time) => ({ group: 'walkforward', startTime: 0, stopTime: 1, loopStart: 0, loopStop: 1, time });
  const at = (t) => clipStridePhase({ ...resetClip(keys, 'walkforward', { loopFallback: true }), time: t }, keys);
  assert.ok(near(at(0.2), 0) < 1e-9 && near(at(0.45), 0.25) < 1e-9 && near(at(0.7), 0.5) < 1e-9 && near(at(0.1), 0.9) < 1e-9);
  assert.equal(clipStridePhase(st(0.5), keys.filter((k) => !k.text.startsWith('soundgen'))), null, 'no contacts, no clock');
});

test('LEG-CLOCK: the offset is measured off the feet; feet that do not swing fore and aft leave the gait its own clock', () => {
  for (const offset of [0, 0.22, 0.6]) {
    const clock = createLegClock(); let p = 0;
    for (let i = 0; i < 180; i++) { p = frac(p + 1.4 / 60); clock.measure(0.4 * Math.cos(2 * Math.PI * (p + offset)), p, 1 / 60); }
    assert.ok(near(clock.phase(p), frac(p + offset)) < 0.03, `offset ${offset}: ${clock.phase(p)} for ${frac(p + offset)}`);
  }
  const strafe = createLegClock(); let p = 0;
  for (let i = 0; i < 180; i++) { p = frac(p + 1.4 / 60); strafe.measure(0.02 * Math.cos(2 * Math.PI * p), p, 1 / 60); }
  assert.equal(strafe.phase(p), null, `a lead under ${LEG_CLOCK.lock} legs keeps no clock`);
  const lost = createLegClock(); lost.measure(0.4, 0, 1); for (let i = 0; i < 120; i++) lost.measure(NaN, null, 1 / 60);
  assert.equal(lost.phase(0), null, 'a clip without contacts lets the clock go');
});

test('LEG-CLOCK: the gait\'s shown stride eases onto the legs\' phase and keeps it (mutant: the gait\'s own count)', () => {
  const body = bodyOf(buildSkeleton(parseNif(retailSkeleton())), GRAPH_ROOT, sm);
  const s = createGaitState(); let z = 0, legs = 0.3;
  const input = (legPhase) => ({ speed: 2.5, forward: 1, running: false, grounded: true, yaw: 0, travel: [0, 0, z], legM: 0.85, unitsPerM: MW_UNITS_PER_METER, unitsPerMz: MW_UNITS_PER_METER, legPhase });
  for (let i = 0; i < 120; i++) { z += 2.5 / 60; legs = frac(legs + 1.7 / 60); stepGait(s, input(legs), body, 1 / 60); }
  assert.ok(near(s.shown, legs) < 0.03, `shown ${s.shown} on the legs' ${legs}`);
  // let go: the gait's own clock again, eased - never a leap in a frame
  let prev = s.shown;
  for (let i = 0; i < 60; i++) { z += 2.5 / 60; stepGait(s, input(null), body, 1 / 60); assert.ok(near(s.shown, prev) < 0.08, `a frame's leap ${near(s.shown, prev)}`); prev = s.shown; }
});

// ---- the real body: MAO's clips on the retail rig, Better Bodies' woman as the skin ----
const root = new URL('../../../', import.meta.url);
const KF = 'Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf';
const SKIN = 'Mods/Bodies/Better Bodies/Underwear/Data Files/Meshes/bb/bb_skinf_de.nif';
const available = existsSync(new URL(KF, root)) && existsSync(new URL(SKIN, root));

function realRun(weapon, group, frames = 240) {
  const nif = parseNif(readFileSync(new URL(KF, root)));
  const keys = normalizeTextKeys(collectTextKeys(nif)), trackMap = extractTracks(nif), source = { keys, trackMap };
  const n = parseNif(retailSkeleton()), sk = buildSkeleton(n);
  injectSkeletonNodes(sk, offWeaponBoneAddon(sk, GRAPH_ROOT, sm, n));
  const body = bodyOf(sk, GRAPH_ROOT, sm), lower = createLowerBodyLayer({ sampleTrack }), weight = createBodyWeight(), motion = createBodyMotion(undefined, lower);   // fpArm.js's wiring
  const assembly = { skeleton: sk, fns: { poseSkeleton, skelMats: sm }, pieces: [] }, accumRoot = accumRootRef(sk, trackMap), mask = lowerBodyBones(sk);
  const has = (g) => keys.some((k) => k.text.toLowerCase() === `${g}: start`);
  const want = guardMovementGroup(group, weapon, has, true)?.group ?? group;
  const movement = resetClip(keys, want, { loopFallback: true, loopCount: Infinity });
  const running = group.startsWith('run'), speed = running ? 8.1 : 2.5, fwd = group.includes('back') ? -1 : 1;
  const animSpeed = animVelocity(keys, trackMap.get(sk.nodes.get(accumRoot).name.toLowerCase()), want) || 1;
  const out = []; let z = 0;
  for (let i = 0; i < frames; i++) {
    const dt = 1 / 60; z += fwd * speed * dt;
    const cam = { yaw: 0, move: { speed, running, forward: fwd, strafe: 0, grounded: true, bodyYaw: 0, travel: [0, 0, z] } };
    const word = sceneInput({ kind: 'female', weapon, running, forward: fwd, speed, travel: cam.move.travel });
    advanceClip(movement, keys, dt * weight.moveRate(speed * MW_UNITS_PER_METER / animSpeed, want));
    lower.stepRig(dt, true, null, null, null, null, movement, source, null, null);
    motion.step(dt, word);
    weight.stepRig(dt, true, cam, [], weapon, false, word, movement, source, animSpeed);
    poseAssembly(assembly, { tracks: lower.tracks(trackMap, mask), sampleTrack: lower.sampler(sampleTrack), time: movement.time, accumRoot, skin: false, motion: weight.slot(motion.slot) });
    out.push({ pose: new Map(assembly.pose), mats: assembly.mats, phase: motion.stride().phase });
  }
  return { sk, body, frames: out };
}

/** How deep (rig units) each arm's skin stands in the posed Better Bodies trunk - its Tri Chest on the spine, as a
 *  polar profile about the chest bone: probe of 2026-11-06, the same measure the recording's fault was found by. */
function skinDepth(run) {
  const { sk, body } = run, part = bindPart(sk, parseNif(readFileSync(new URL(SKIN, root))));
  const pick = (name) => part.skinned.find((b) => b.name === name);
  const share = (bt, re) => { const w = new Float32Array(bt.positions.length / 3); for (const bone of bt.skin.bones) if (bone.ref != null && re.test(sk.nodes.get(bone.ref).name)) bone.indices.forEach((v, k) => { w[v] += bone.weights[k]; }); return w; };
  const chest = pick('Tri Chest'), trunkW = share(chest, /spine|pelvis|neck/i);
  const arms = { L: ['Tri Left Upper Arm', 'Tri Left Forearm'].map(pick), R: ['Tri Right Upper Arm', 'Tri Right Forearm'].map(pick) };
  const NA = 36, SL = 1.5, worst = { L: 0, R: 0 };
  for (const { pose, mats } of run.frames.slice(60)) {
    const F = bodyFrames(body, mats), c = mats.get(body.chest).t;
    const polar = (x, y, z) => { const d = [x - c[0], y - c[1], z - c[2]], u = d[0] * F.right[0] + d[1] * F.right[1] + d[2] * F.right[2], v = d[0] * F.fwd[0] + d[1] * F.fwd[1] + d[2] * F.fwd[2], h = d[0] * F.up[0] + d[1] * F.up[1] + d[2] * F.up[2]; return [Math.floor(h / SL), Math.hypot(u, v), ((Math.floor((Math.atan2(v, u) + Math.PI) / (2 * Math.PI) * NA) % NA) + NA) % NA]; };
    const P = new Float32Array(chest.positions.length); skinBatch(chest, sk, pose, mats, P, new Float32Array(P.length));
    const prof = new Map();
    for (let v = 0; v < P.length / 3; v++) if (trunkW[v] >= 0.7) { const [s, r, a] = polar(P[3 * v], P[3 * v + 1], P[3 * v + 2]); if (!(prof.get(s * NA + a) >= r)) prof.set(s * NA + a, r); }
    for (const side of ['L', 'R']) for (const bt of arms[side]) {
      const w = share(bt, /upperarm|forearm|hand/i), Q = new Float32Array(bt.positions.length); skinBatch(bt, sk, pose, mats, Q, new Float32Array(Q.length));
      for (let v = 0; v < Q.length / 3; v++) {
        if (w[v] < 0.9) continue;
        const [s, r, a] = polar(Q[3 * v], Q[3 * v + 1], Q[3 * v + 2]), rs = [a - 1, a, a + 1].map((x) => prof.get(s * NA + ((x + NA) % NA)));
        if (rs.every((x) => x != null)) worst[side] = Math.max(worst[side], Math.min(...rs) - r);
      }
    }
  }
  return worst;
}

test('TRUNK-SKIN: running with a two-hander the right arm stays out of a woman\'s chest (it folded 9.8 units in, then 10.4 back)', { skip: !available }, () => {
  for (const group of ['runforward', 'runback']) {
    const depth = skinDepth(realRun(MW_WEAPON_TYPE.LongBladeTwoHand, group));
    assert.ok(depth.R < 3.5, `${group}: the right arm ${depth.R.toFixed(2)} units into the trunk`);
  }
});

test('LEG-CLOCK: the gait the trunk and the held arms ride keeps the clip\'s feet, walking and running', { skip: !available }, () => {
  for (const group of ['walkforward', 'runforward', 'walkback']) {
    const run = realRun(MW_WEAPON_TYPE.LongBladeOneHand, group), { body } = run;
    // the left foot's lead along the facing against cos(2 pi phase): their best offset, over the last second
    const tail = run.frames.slice(-60).map(({ mats, phase }) => {
      const F = bodyFrames(body, mats), l = mats.get(body.bones.L.foot).t, r = mats.get(body.bones.R.foot).t;
      return { lead: ((l[0] - r[0]) * F.fwd[0] + (l[1] - r[1]) * F.fwd[1] + (l[2] - r[2]) * F.fwd[2]) / body.leg, phase };
    });
    let best = null;
    for (let k = 0; k < 72; k++) { const off = k / 72, c = tail.reduce((sum, f) => sum + f.lead * Math.cos(2 * Math.PI * (f.phase + off)), 0); if (!best || c > best.c) best = { c, off }; }
    assert.ok(near(best.off, 0) < 0.08, `${group}: the gait ${best.off.toFixed(2)} of a stride off the feet`);
  }
});

test('FREE-ARM-CLIP: a one-hander\'s free left arm is the free walk\'s own, as an empty-handed body\'s (mutant: an invented swing)', { skip: !available }, () => {
  for (const group of ['walkforward', 'runforward']) {
    const one = realRun(MW_WEAPON_TYPE.LongBladeOneHand, group, 120), none = realRun(MW_WEAPON_TYPE.None, group, 120);
    const L = one.body.bones.L;
    for (let i = 60; i < 120; i++) for (const ref of [L.fore, L.hand]) {
      const a = one.frames[i].mats.get(ref).t, b = none.frames[i].mats.get(ref).t, c1 = one.frames[i].mats.get(L.upper).t, c2 = none.frames[i].mats.get(L.upper).t;
      const d = Math.hypot(...a.map((v, j) => (v - c1[j]) - (b[j] - c2[j])));
      assert.ok(d < 0.5, `${group} frame ${i}: the free arm ${d.toFixed(2)} units off the empty-handed body's`);
    }
  }
});
