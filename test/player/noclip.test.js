// No-clip (player/noClip.js): the toybox's flight through the world - the motor's step without the collider, at
// NOCLIP_RUN_MULT times the player's own run, its staff power set beside /god and /fly.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PlayerMotor, FIXED_DT, runSpeed, runSpeedMult } from '../../src/player/motor.js';
import { Collider } from '../../src/player/collider.js';
import { noClipOn, noClipSpeed, noClipWay, registerNoClip } from '../../src/player/noClip.js';
import { setStaffPowers, staffPowers, staffFly } from '../../src/characters/playerEntity.js';
import { NOCLIP_RUN_MULT } from '../../src/systems/toybox/toyboxLaw.js';

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const still = (over = {}) => ({ forward: 0, strafe: 0, run: false, jump: false, up: false, down: false, ...over });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/** A floor at y 0 and a wall facing -z at z 1, from the floor to 3 m. */
function walled() {
  const col = new Collider(() => 0);
  col.addMesh('floor', [-40, 0, -40, 40, 0, -40, 40, 0, 40, -40, 0, 40], [0, 1, 2, 0, 2, 3], I);
  col.addMesh('wall', [-5, 0, 1, 5, 0, 1, 5, 3, 1, -5, 3, 1], [0, 1, 2, 0, 2, 3], I);
  return col;
}
function stood() {
  const m = new PlayerMotor(walled());
  m.spawn(0, 0.05, 0);
  for (let f = 0; f < 6; f++) m.update(FIXED_DT, still(), 0);
  return m;
}

test('no-clip: the staff power, off by default, implies flight and is the motor\'s one switch', () => {
  setStaffPowers({ god: false, fly: false, noclip: false });
  assert.equal(staffPowers().noclip, false);
  assert.equal(noClipOn(), false);
  assert.equal(staffFly(), false);
  setStaffPowers({ noclip: true });
  assert.equal(staffPowers().noclip, true);
  assert.equal(noClipOn(), true, 'playerEntity registers its power as the motor\'s source');
  assert.equal(staffFly(), true, 'no-clip flies as /fly does');
  setStaffPowers({ noclip: 'yes' });
  assert.equal(staffPowers().noclip, true, 'only a boolean moves the switch');
  setStaffPowers({ god: false, fly: false, noclip: false });
  assert.equal(noClipOn(), false, 'cleared with the other two');
});

test('no-clip: the pace is the run\'s times 1.5, and the way is the levitating motor\'s', () => {
  assert.equal(NOCLIP_RUN_MULT, 1.5);
  assert.equal(noClipSpeed(4), 6);
  assert.equal(noClipSpeed(NaN), 0);
  const fwd = noClipWay({ forward: 1 }, 0, 0);
  assert.ok(near(fwd[0], 0) && near(fwd[1], 0) && near(fwd[2], 1), 'yaw 0 forward is +z');
  const upPitch = noClipWay({ forward: 1 }, 0, Math.PI / 2);
  assert.ok(near(upPitch[1], 1), 'looking up flies up');
  assert.deepEqual(noClipWay({ up: true }, 0, 0).map((v) => Math.round(v * 1e6) / 1e6), [0, 1, 0]);
  assert.deepEqual(noClipWay({ down: true }, 0, 0).map((v) => Math.round(v * 1e6) / 1e6), [0, -1, 0]);
  const diag = noClipWay({ forward: 1, strafe: 1 }, 0, 0);
  assert.ok(near(Math.hypot(diag[0], diag[2]), 1), 'a diagonal is no faster');
});

test('no-clip: the motor walks into the wall without it, and through it with it, at 1.5x its run', () => {
  setStaffPowers({ noclip: false });
  const blocked = stood();
  for (let f = 0; f < 120; f++) blocked.update(FIXED_DT, still({ forward: 1 }), 0);
  assert.ok(blocked.pos[2] < 1, `the collider stops the body at the wall (z ${blocked.pos[2]})`);

  const m = stood();
  setStaffPowers({ noclip: true });
  try {
    const z0 = m.pos[2], y0 = m.pos[1];
    const steps = 60;
    for (let f = 0; f < steps; f++) m.update(FIXED_DT, still({ forward: 1 }), 0);
    const pace = runSpeed(m.stats.speed, m.stats.running) * runSpeedMult() * NOCLIP_RUN_MULT;
    assert.ok(m.pos[2] > 1, `through the wall (z ${m.pos[2]})`);
    assert.ok(near(m.pos[2] - z0, pace * FIXED_DT * steps, 1e-3), `at 1.5x the run (${m.pos[2] - z0} vs ${pace * FIXED_DT * steps})`);
    assert.ok(near(m.pos[1], y0), 'no gravity, no ground snap');
    // down through the floor, and nothing owed for the drop
    for (let f = 0; f < 60; f++) m.update(FIXED_DT, still({ down: true }), 0);
    assert.ok(m.pos[1] < -1, `through the floor (y ${m.pos[1]})`);
    assert.equal(m.falling, false);
    assert.equal(m.grounded, false);
    assert.equal(m.landedFallDistance, 0);
    // a swimmer's flag takes nothing over
    m.swimming = true;
    const yS = m.pos[1];
    for (let f = 0; f < 10; f++) m.update(FIXED_DT, still({ up: true }), 0);
    assert.ok(m.pos[1] > yS, 'the float key rises at the no-clip pace, water or not');
  } finally {
    setStaffPowers({ noclip: false });
  }
});

test('no-clip: a source that throws is off, and none registered is off', () => {
  registerNoClip(() => {
    throw new Error('x');
  });
  assert.equal(noClipOn(), false);
  registerNoClip(null);
  assert.equal(noClipOn(), false);
  registerNoClip(() => staffPowers().noclip);
});
