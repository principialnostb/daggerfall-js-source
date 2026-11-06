// GUARD-ELBOWS (2026-11-07, src/characters/bodyMotion/guardElbows.js): the fists' guard keeps its elbows under its fists
// - each arm swung about its shoulder-to-wrist line, the fist where the clip holds it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardElbowShare, createGuardElbows, GUARD_ELBOWS } from '../../../src/characters/bodyMotion/guardElbows.js';
import { MW_WEAPON_TYPE as T } from '../../../src/formats/morrowind/mwFirstPerson.js';

const fists = { on: true, mwType: T.HandToHand, shown: true, hands: 'single' };

test('GUARD-ELBOWS: the fists drawn tuck their elbows; a blow, a shield, a weapon or a sheathed hand do not (mutant: always, or never)', () => {
  assert.equal(guardElbowShare(fists), 1);
  assert.equal(guardElbowShare({ ...fists, blow: { type: 'chop', section: 'windup' } }), 0, 'a blow is the blow\'s arms');
  assert.equal(guardElbowShare({ ...fists, shield: true }), 0, 'beside a shield the right is a free hand');
  assert.equal(guardElbowShare({ ...fists, mwType: T.LongBladeOneHand }), 0);
  assert.equal(guardElbowShare({ ...fists, shown: false }), 0);
  assert.equal(guardElbowShare(null), 0);
});

test('GUARD-ELBOWS: the tuck eases in and lets go over its seconds, never in a frame', () => {
  const g = createGuardElbows();
  g.step(1 / 60, true, fists);
  assert.ok(g.status() > 0 && g.status() < 0.3, `a frame in: ${g.status()}`);
  for (let i = 0; i < 120; i++) g.step(1 / 60, true, fists);
  assert.equal(g.status(), 1);
  g.step(1 / 60, true, { ...fists, blow: { section: 'release' } });
  assert.ok(g.status() > 0.7, 'a blow lets it go eased');
  assert.ok(GUARD_ELBOWS.tuck > 0 && GUARD_ELBOWS.tuck < 1 && GUARD_ELBOWS.max <= 0.9);
});
