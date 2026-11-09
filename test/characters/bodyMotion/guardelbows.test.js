// GUARD-ELBOWS (2026-11-07, src/characters/bodyMotion/guardElbows.js): the fists' guard keeps its elbows under its fists
// - each arm swung about its shoulder-to-wrist line, the fist where the clip holds it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardElbowShare, createGuardElbows, GUARD_ELBOWS } from '../../../src/characters/bodyMotion/guardElbows.js';
import { MW_WEAPON_TYPE as T } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices as sm, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';

const fists = { on: true, mwType: T.HandToHand, shown: true, hands: 'single' };

test('leaving the fist guard fades the elbow solve itself, including its pole', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton())), g = createGuardElbows();
  for (let i = 0; i < 120; i++) g.step(1 / 60, true, fists);
  const ref = sk.byName.get('bip01 l forearm');
  const original = sm(sk, new Map(), GRAPH_ROOT).get(ref).t;
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  let previous = null, lastResidual = null, finalJump = 0;
  for (let i = 0; i < 90; i++) {
    g.step(1 / 60, true, { ...fists, speed: 4, forward: 1 });
    const pose = new Map();
    g.apply(sk, pose, GRAPH_ROOT, sm);
    const elbow = sm(sk, pose, GRAPH_ROOT).get(ref).t;
    if (pose.size) lastResidual = distance(elbow, original);
    else if (previous) { finalJump = distance(previous, elbow); break; }
    previous = elbow;
  }
  assert.ok(lastResidual != null && lastResidual < 0.1, `the fading solve retained ${lastResidual} units of elbow displacement`);
  assert.ok(finalJump < 0.1, `the solver let go with a ${finalJump} unit jump`);
});

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
