// FP-INERTIA (MOTION-DOCTRINE, bible/05-Combat/Motion-Doctrine.md): the first-person viewmodel lags a turn and a glance,
// sways against a start, dips on a landing - heavier slower and deeper - and rests exactly on the lens when nothing moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFpInertia, fpInertiaMatrix, FP_INERTIA } from '../../src/combat/fpInertia.js';
import { MW_WEAPON_TYPE } from '../../src/formats/morrowind/mwFirstPerson.js';

const PLATE = [102, 103, 104, 105, 106, 107, 108].map((templateIndex) => ({ kind: 'armor', templateIndex, material: 0x0200 }));
const frame = (layer, cam, extra = {}) => layer.step(1 / 60, { active: true, cam, ...extra });
const still = (yaw = 0, pitch = 0, z = 0, grounded = true, jumping = false) => ({ yaw, pitch, move: { travel: [0, 0, z], bodyYaw: 0, grounded, jumping } });

test('FP-INERTIA: a turn to the right swings the arms LEFT (+ about up) and they come back when the turn stops', () => {
  const layer = createFpInertia();
  let yaw = 0, peak = 0;
  for (let i = 0; i < 20; i++) { yaw += 3 / 60; peak = Math.max(peak, frame(layer, still(yaw)).yaw); }
  assert.ok(peak > 0.03, `a 3 rad/s turn lags the arms ${peak} rad`);
  for (let i = 0; i < 90; i++) frame(layer, still(yaw));
  assert.ok(Math.abs(layer.pose().yaw) < 1e-3, 'and they settle back on the lens');
});

test('FP-INERTIA: a glance up leaves the arms low; a start leaves them back toward the eye', () => {
  const look = createFpInertia();
  let p = 0, low = 0;
  for (let i = 0; i < 15; i++) { p += 2 / 60; low = Math.min(low, frame(look, still(0, p)).pitch); }
  assert.ok(low < -0.02, `the glance up pitches them down (${low})`);
  const run = createFpInertia();
  let z = 0, back = 0;
  for (let i = 0; i < 30; i++) { z += (i > 3 ? 6 : 0) / 60; back = Math.max(back, frame(run, still(0, 0, z)).z); }
  assert.ok(back > 0.01 && back <= FP_INERTIA.move.maxMove + 1e-6, `a start leaves them ${back} m back`);
});

test('FP-INERTIA: a landing dips the arms, longer aloft deeper', () => {
  const dipAfter = (air) => {
    const layer = createFpInertia();
    frame(layer, still());
    for (let i = 0; i < Math.round(air * 60); i++) frame(layer, still(0, 0, 0, false));
    let low = 0;
    for (let i = 0; i < 30; i++) low = Math.min(low, frame(layer, still()).y);
    return low;
  };
  const short = dipAfter(0.2), long = dipAfter(0.8);
  assert.ok(long < short && long < -0.01, `a long fall dips ${long} m, a hop ${short}`);
});

test('FP-INERTIA: heavier lags deeper and settles slower - plate and a two-hander against bare hands', () => {
  const lag = (armor, mwType) => {
    const layer = createFpInertia();
    let yaw = 0, peak = 0, at = 0;
    for (let i = 0; i < 40; i++) { if (i < 10) yaw += 3 / 60; const v = frame(layer, still(yaw), { armor, mwType }).yaw; if (v > peak) { peak = v; at = i; } }
    return { peak, at };
  };
  const light = lag([], MW_WEAPON_TYPE.None), heavy = lag(PLATE, MW_WEAPON_TYPE.LongBladeTwoHand);
  assert.ok(heavy.peak > light.peak, `deeper: ${heavy.peak} > ${light.peak}`);
  assert.ok(heavy.at >= light.at, `and no quicker: frame ${heavy.at} vs ${light.at}`);
});

test('FP-INERTIA: at rest the lens is the lens (no matrix is laid); the matrix is a rotation about the shoulder plus the move', () => {
  const layer = createFpInertia();
  const lens = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  assert.equal(layer.view(lens, 70), lens);
  const M = fpInertiaMatrix({ yaw: 0.1 }, 1, [0, 0, 0]);
  const fwd = [M[8] * -1, M[9] * -1, M[10] * -1];   // the eye's -Z carried by M
  assert.ok(fwd[0] < 0, 'a + yaw turns the forward point to the left');
  const pivot = [0.2, -0.3, 0.1], P = fpInertiaMatrix({ yaw: 0.3, pitch: 0.2, roll: 0.1 }, 1, pivot);
  const at = (m, v) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r]);
  assert.ok(Math.hypot(...at(P, pivot).map((v, i) => v - pivot[i])) < 1e-6, 'the shoulder stays where it is');
  const T = fpInertiaMatrix({ x: 0.01, y: -0.02, z: 0.03 }, 70);
  assert.deepEqual([T[12], T[13], T[14]].map((v) => +v.toFixed(4)), [0.7, -1.4, 2.1], 'the move in rig units');
});

test('FP-INERTIA: switched off it eases home, and the rig lays it in front of the lens behind the MotionDoctrine switch', () => {
  const layer = createFpInertia();
  let yaw = 0;
  for (let i = 0; i < 10; i++) { yaw += 3 / 60; frame(layer, still(yaw)); }
  for (let i = 0; i < 120; i++) layer.step(1 / 60, { active: false, cam: still(yaw) });
  assert.equal(layer.pose().yaw, 0);
  const src = readFileSync(new URL('../../src/combat/fpArm.js', import.meta.url), 'utf8');
  assert.match(src, /fpInertia\.stepRig\(dt, modSetting\('morrowind-animation', 'MotionDoctrine'\) !== 0 && viewMode === 'first', cam, lastBuildOpts\?\.armor, built\?\.mwType, dead\)/);
  assert.match(src, /const view = fpInertia\.view\(gunFeel \? multiply\(armKickMatrix\(gunFeel, MW_UNITS_PER_METER\), lens, new Float32Array\(16\)\) : lens, MW_UNITS_PER_METER\);/);
});
