import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giantLeashStep } from '../../src/scenes/giantLeash.js';
import { GREATER_GIANT_CALL_AT } from '../../src/systems/wild/wildZone.js';

// A mask stand-in: wildInside reads it; we hand the step a mapAt that answers pixels the mask holds or not.
const giant = (feet, health = 100) => {
  const ai = { feet, fleeLeft: 0, fleeFrom: null, fled: null, flee(from, s, m) { this.fled = { from, s, m }; } };
  return { foe: { ai, entity: { health, maxHealth: 100 } } };
};

test('the zone giants: a step over the edge is put back where it last stood inside', () => {
  const s = giant([10, 0, 10]);
  // a one-cell zone: map pixel (0, 0) is inside it, every other pixel outside
  const mask = { width: 1, height: 1, inside: [1] };
  const at = (out) => ({ mask, now: 0, meOut: false, call: () => {}, goal: () => null, mapAt: () => (out ? [5, 5] : [0, 0]) });
  giantLeashStep([s], at(false));
  s.foe.ai.feet[0] = 99;
  giantLeashStep([s], at(true));
  assert.deepEqual(s.foe.ai.feet, [10, 0, 10]);
});

test('the zone giants: at half health a giant calls its kin once a life', () => {
  const s = giant([0, 0, 0], Math.floor(100 * GREATER_GIANT_CALL_AT));
  let calls = 0;
  const at = { mask: {}, now: 0, meOut: false, call: () => calls++, goal: () => null, mapAt: () => [0, 0] };
  giantLeashStep([s], at);
  giantLeashStep([s], at);
  assert.equal(calls, 1);
});

test('the zone giants: when I leave the zone a giant walks to its goal, and heals there', () => {
  const s = giant([0, 0, 0], 40);
  const at = (now, feet) => ({ mask: {}, now, meOut: true, call: () => {}, goal: () => [100, 0, 0], mapAt: () => feet });
  giantLeashStep([s], at(0, [0, 0]));
  assert.ok(s.retreat, 'a retreat began');
  assert.ok(s.foe.ai.fled, 'it walks');
  s.foe.ai.feet[0] = 95; // within reach of its goal
  giantLeashStep([s], at(1000, [0, 0]));
  assert.equal(s.retreat, null);
  assert.equal(s.foe.entity.health, 100);
});

test('the zone giants: a dead giant is left alone', () => {
  const s = giant([0, 0, 0], 0);
  let calls = 0;
  giantLeashStep([s], { mask: {}, now: 0, meOut: true, call: () => calls++, goal: () => [1, 0, 1], mapAt: () => [0, 0] });
  assert.equal(calls, 0);
  assert.equal(s.retreat, undefined);
});
