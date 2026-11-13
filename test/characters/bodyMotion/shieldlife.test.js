// SHIELD-LIFE: the held shield answers a start, a stop, a stride, a strafe and a turn - within small bounds, and settles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShieldSet, SHIELD_LIFE } from '../../../src/characters/bodyMotion/shieldSet.js';

const run = (set, frames, gait, on = true) => { let peak = 0; for (let f = 0; f < frames; f++) { set.step(1 / 60, on, { phase: (f / 40) % 1, ...gait }); peak = Math.max(peak, Math.abs(set.life().spring)); } return peak; };

test('SHIELD-LIFE: a start dips the shield, a stop carries it, each within the bound, and it settles standing', () => {
  const set = createShieldSet();
  run(set, 60, { move: 0, dir: [0, 1] });
  assert.ok(Math.abs(set.life().spring) < 1e-6, 'still while standing');
  set.step(1 / 60, true, { move: 1, dir: [0, 1], phase: 0 });
  set.step(1 / 60, true, { move: 1, dir: [0, 1], phase: 0 });
  assert.ok(set.life().spring < -0.05, 'a start dips it');
  const peak = run(set, 30, { move: 1, dir: [0, 1] });
  assert.ok(peak > 0.5 && peak <= SHIELD_LIFE.max, `the start moved it ${peak.toFixed(2)} degrees`);
  run(set, 120, { move: 1, dir: [0, 1] });
  set.step(1 / 60, true, { move: 0, dir: [0, 1], phase: 0 });
  set.step(1 / 60, true, { move: 0, dir: [0, 1], phase: 0 });
  assert.ok(set.life().spring > 0.05, 'a stop carries it up');
  run(set, 180, { move: 0, dir: [0, 1] });
  assert.ok(Math.abs(set.life().spring) < 0.05 && set.life().bob === 0, 'settled');
});

test('SHIELD-LIFE: the stride bobs it, a strafe leans it, a turn turns it - bounded - and nothing is laid with no shield', () => {
  const set = createShieldSet();
  let bob = 0;
  for (let f = 0; f < 80; f++) { set.step(1 / 60, true, { move: 1, dir: [1, 0], phase: (f / 40) % 1, yawRate: 9 }); bob = Math.max(bob, Math.abs(set.life().bob)); }
  const life = set.life();
  assert.ok(bob > 1 && bob <= SHIELD_LIFE.bob + 1e-9);
  assert.ok(Math.abs(life.lean - SHIELD_LIFE.lean) < 0.1 && Math.abs(life.turn - SHIELD_LIFE.turnMax) < 0.1);
  run(set, 120, { move: 1, dir: [1, 0] }, false);
  assert.equal(set.life().held, 0);
  assert.equal(set.apply({ nodes: new Map() }, new Map(), null, () => new Map()), null);
});
