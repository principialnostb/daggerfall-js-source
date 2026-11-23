// A punch is thrown and taken back quicker than a weapon's blow; how often it is thrown is not this module's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calmBlowPlan, recoverRate, holdFor, PACE, FIST_PACE, BLOW_FLOW } from '../../src/combat/blowFlow.js';

test('FIST-SNAP: a punch lands sooner, its fist is out a fifth as long, and its recovery never crawls - a weapon is as it was', () => {
  const blow = { seconds: 1, step: 0.18 };
  const sword = calmBlowPlan(blow, 0.4, 0.2), fist = calmBlowPlan(blow, 0.4, 0.2, true);
  assert.equal(sword.fists, false);
  assert.equal(fist.fists, true);
  assert.equal(sword.seconds, fist.seconds, 'the machine keeps the cadence');
  assert.ok(fist.hitAt < sword.hitAt * 0.82, `a punch lands at ${fist.hitAt.toFixed(3)} s, a weapon at ${sword.hitAt.toFixed(3)}`);
  assert.ok(Math.abs(sword.windRate / sword.sf - PACE.wind) < 1e-9 && Math.abs(fist.relRate / fist.sf - FIST_PACE.release) < 1e-9);
  assert.ok(recoverRate(fist, 1, false) > 2 * recoverRate(sword, 1, false), 'the fist still coming home at the end');
  assert.ok(recoverRate(fist, 0, false) > recoverRate(sword, 0, false));
  assert.equal(holdFor('chop'), BLOW_FLOW.hold);
  assert.equal(holdFor('thrust'), BLOW_FLOW.thrustHold);
  assert.equal(holdFor('chop', true), FIST_PACE.hold);
  assert.ok(FIST_PACE.hold < BLOW_FLOW.hold / 4);
});
