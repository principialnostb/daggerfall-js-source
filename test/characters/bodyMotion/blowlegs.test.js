// BLOW-LEGS (MOTION-DOCTRINE, bible/05-Combat/Motion-Doctrine.md 7f): a blow struck standing loads, drives and recovers
// with the whole body - the hips back and turned away, then forward, down and through; the lead foot steps (lifted,
// never slid) on a thrust and a chop and steps home; both feet stand where the stance put them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { blowPhase, blowLegsPose, createBlowLegs, BLOW_LEGS, BLOW_LEGS_TIME } from '../../../src/characters/bodyMotion/blowLegs.js';
import { bodyOf } from '../../../src/characters/bodyMotion/bodyKit.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';

const sm = (sk, pose, root) => skeletonSpaceMatrices(sk, pose, root);
const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const blow = (type, section, progress, extra = {}) => ({ type, section, progress, strength: 1, reversed: false, hand: 'R', ...extra });

test('sword pilot: preserve the overhead, give a side cut a step, mirror its effort for a backhand', () => {
  const hit = (type, extra = {}) => blowLegsPose(blow(type, 'release', 1, extra), 1);
  assert.deepEqual(hit('chop', { sword: true }), hit('chop'));
  const side = hit('slash', { sword: true });
  assert.ok(side.step > 0 && side.forward);
  assert.ok(side.yaw > hit('slash').yaw);
  assert.equal(hit('slash', { sword: true, reversed: true }).yaw, -side.yaw);
  assert.ok(hit('thrust', { sword: true }).drop < hit('chop', { sword: true }).drop);
});

test('BLOW-LEGS: the key poses - wound away, driven through, recovered; a backhand mirrored, a slash steps nowhere', () => {
  assert.equal(blowPhase('windup', 0).load, 0);
  assert.equal(blowPhase('release', 1).drive, 1);
  assert.equal(blowPhase('follow', BLOW_LEGS_TIME.hold).recover, 0, 'the hit held a while');
  assert.equal(blowPhase('follow', 1).recover, 1);
  assert.equal(blowPhase(null, 0.5), null);
  assert.ok(blowPhase('release', 0.3).drive > 0.6, 'the drive snaps out of the wind-up');
  const wound = blowLegsPose(blow('slash', 'windup', 1)), hit = blowLegsPose(blow('slash', 'release', 1)), home = blowLegsPose(blow('slash', 'follow', 1));
  assert.ok(wound.yaw < 0 && wound.fwd < 0, 'wound up: turned to the right, the weight back');
  assert.ok(hit.yaw > 0 && hit.fwd > 0 && hit.drop > wound.drop, 'struck: through the swing, forward and down');
  for (const k of ['fwd', 'drop', 'yaw', 'pitch']) assert.ok(Math.abs(home[k]) < 1e-9, `recovered: ${k}`);
  assert.ok(Math.abs(blowLegsPose(blow('slash', 'release', 1, { reversed: true })).yaw + hit.yaw) < 1e-9, 'a backhand turns the other way');
  assert.equal(blowLegsPose(blow('slash', 'release', 1, { hand: 'L' })).lead, 'R', 'a left hand\'s blow leads with the right foot');
  assert.equal(hit.forward, false, 'a slash steps nowhere');
  assert.equal(blowLegsPose(blow('thrust', 'windup', 0.5)).forward, null, 'a wind-up leaves the foot where it stands');
  assert.equal(blowLegsPose(blow('thrust', 'release', 0.1)).forward, true);
  assert.equal(blowLegsPose(blow('thrust', 'follow', 0.9)).forward, false, 'home late in the follow-through');
  assert.ok(blowLegsPose(blow('chop', 'release', 1), 1).drop > blowLegsPose(blow('chop', 'release', 1), 0).drop, 'a heavier body strikes deeper');
  assert.equal(blowLegsPose(blow('shoot', 'release', 1)), null, 'a shot is the arms\'');
  assert.ok(BLOW_LEGS.thrust.step > BLOW_LEGS.chop.step, 'the thrust the longest step');
});

/** A whole blow struck standing over the rest pose: each frame's pelvis and feet. */
function strike(type, opts = {}) {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const body = bodyOf(sk, GRAPH_ROOT, sm);
  const legs = createBlowLegs();
  const names = { pelvis: body.bones.pelvis, L: body.bones.L.foot, R: body.bones.R.foot };
  const frames = [];
  const run = (section, n, word = {}) => {
    for (let i = 0; i <= n; i++) {
      legs.step(1 / 60, true, { on: true, grounded: true, speed: 0, ...word, blow: section ? blow(type, section, i / n, opts) : null }, 0);
      const pose = new Map();
      legs.apply(sk, pose, GRAPH_ROOT, sm);
      const m = sm(sk, pose, GRAPH_ROOT);
      frames.push({ section, air: legs.status().air, ...Object.fromEntries(Object.entries(names).map(([k, r]) => [k, [...m.get(r).t]])) });
    }
  };
  run('windup', 20); run('release', 12); run('follow', 30); run(null, 30);
  return { frames, body, legs };
}
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('BLOW-LEGS: a standing thrust steps its lead foot forward and home - lifted, never slid - the back foot planted', () => {
  const { frames, body } = strike('thrust');
  const start = frames[0];
  const far = Math.max(...frames.map((f) => f.L[1] - start.L[1]));
  assert.ok(far > BLOW_LEGS.thrust.step * body.leg * 0.9, `the lead foot stepped ${far.toFixed(1)} units`);
  assert.ok(Math.max(...frames.map((f) => f.L[2] - start.L[2])) > BLOW_LEGS_TIME.lift * body.leg * 0.5, 'lifted on its way');
  for (let i = 1; i < frames.length; i++) {
    if (!frames[i].air.L && !frames[i - 1].air.L) assert.ok(d(frames[i].L, frames[i - 1].L) < 0.3, `frame ${i}: a planted foot slid ${d(frames[i].L, frames[i - 1].L).toFixed(2)}`);
    assert.ok(d(frames[i].R, start.R) < 0.5, `frame ${i}: the back foot left its place`);
    assert.ok(d(frames[i].pelvis, frames[i - 1].pelvis) < body.leg * 0.06, `frame ${i}: the hips leapt`);
  }
  assert.ok(d(frames[frames.length - 1].L, start.L) < 0.5, 'home again');
  const low = Math.min(...frames.map((f) => f.pelvis[2]));
  assert.ok(start.pelvis[2] - low > 0.04 * body.leg, 'the hips drop into the hit');
});

test('BLOW-LEGS: a slash keeps both feet where they stand and turns the hips through; the body set moving gives the legs back', () => {
  const { frames } = strike('slash');
  const start = frames[0];
  for (const f of frames) { assert.ok(d(f.L, start.L) < 0.5); assert.ok(d(f.R, start.R) < 0.5); }
  const legs = createBlowLegs();
  for (let i = 0; i < 30; i++) legs.step(1 / 60, true, { on: true, grounded: true, speed: 0, blow: blow('chop', 'release', 0.5) }, 0);
  assert.ok(legs.weight() > 0.99);
  for (let i = 0; i < 60; i++) legs.step(1 / 60, true, { on: true, grounded: true, speed: 3, blow: blow('chop', 'release', 0.5) }, 0);
  assert.ok(legs.weight() < 0.01, 'moving: the stride\'s (LOWER-BODY)');
  for (let i = 0; i < 60; i++) legs.step(1 / 60, false, { on: true, grounded: true, speed: 0, blow: blow('chop', 'release', 0.5) }, 0);
  assert.ok(legs.weight() < 0.01, 'switched off');
});

test('BLOW-LEGS: wired - the motion word to the weight layer, the hips and feet before the elbows\' clearance', () => {
  const bw = rd('src/characters/bodyMotion/bodyWeight.js');
  assert.match(bw, /legs\.step\(dt, active, word, weight\);/);
  assert.match(bw, /if \(clearOn\) legs\.apply\(skeleton, pose, rootRef, skelMats\);[^\n]*\n\s+if \(clearOn\) clearArms\(/);
  assert.match(rd('src/combat/fpArm.js'), /thirdBuilt\?\.mwType, dead, motion\.word\(\)\);/);
  assert.match(rd('src/characters/bodyMotion/bodyMotion.js'), /word: \(\) => input,/);
});
