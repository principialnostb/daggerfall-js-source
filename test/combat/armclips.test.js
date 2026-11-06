// ARM-REST, ARM-SIDES, ARM-FADE and FISTS-ARMS (2026-11-06, bible/05-Combat/Motion-Doctrine.md; the owner: every free arm
// "as the free hand beside a sword" - the game's own movements, not angles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLeftArmLayer, leftArmPlan, mirrorMask, ARM_HOLD, ARM_FADE } from '../../src/combat/leftArmLayer.js';
import { armedUpperPlan } from '../../src/combat/guardLocomotion.js';
import { pickAnimSource, composeMovementGroup, composeStanceGroup, MW_WEAPON_TYPE as T } from '../../src/formats/morrowind/mwFirstPerson.js';
import { resetClip } from '../../src/formats/morrowind/mwAnim.js';

test('ARM-REST: standing, the free hand beside a sword is the plain idle\'s arm on its own clock, laid half over the stance\'s bent one (mutant: the stance\'s arm held, or a straight row)', () => {
  assert.deepEqual(leftArmPlan({ mode: 'free', moving: false }), { kind: 'stance', base: 'idle', stance: 'bare', still: false, sway: 1, w: ARM_HOLD.rest });
  assert.equal(leftArmPlan({ mode: 'free', moving: false, attacking: true }), null, 'a blow keeps its clip');
  assert.equal(leftArmPlan({ mode: 'free', moving: false, jumping: true }), null);
  assert.ok(ARM_HOLD.rest > 0.2 && ARM_HOLD.rest < 0.8, 'between the stance\'s bend and the plain idle\'s hang');
});

test('FISTS-ARMS: the fists\' arms are the hand-to-hand clips\' on the stride; beside a shield the right is a free hand under the armed trunk, standing the plain idle\'s (mutant: the carry\'s rows)', () => {
  const at = (o) => armedUpperPlan({ on: true, ...o });
  assert.deepEqual(at({ type: T.HandToHand, base: 'runforward', moving: true }), { kind: 'movement', base: 'runforward', stance: 'drawn', type: T.HandToHand, still: false, side: 'both', sway: 0, hold: ARM_HOLD.fists });
  assert.ok(ARM_HOLD.fists > 0.1 && ARM_HOLD.fists < 0.6, 'FISTS-PUMP: the guard bobs with the stride, held');
  assert.equal(at({ type: T.HandToHand, moving: false }), null, 'standing, the hand-to-hand idle is the body\'s own');
  assert.deepEqual(at({ type: T.HandToHand, shield: true, base: 'walkforward', moving: true }),
    { kind: 'movement', base: 'walkforward', stance: 'drawn', type: T.LongBladeOneHand, still: false, rigOrder: true, sway: 0, hold: ARM_HOLD.upper, freeSide: 'R' });
  assert.deepEqual(at({ type: T.HandToHand, shield: true, moving: false }), { kind: 'stance', base: 'idle', stance: 'bare', still: false, side: 'R', sway: 1, w: ARM_HOLD.restRight });
  assert.equal(at({ type: T.HandToHand, base: 'runforward', moving: true, attacking: true }), null, 'a blow keeps its own arms');
  assert.ok(at({ type: T.LongBladeOneHand, shield: true, base: 'walkforward', moving: true }).hold === ARM_HOLD.upper, 'a weapon\'s shield keeps its armed trunk');
});

// a clip whose arm bones answer their own name and the clip's time - enough to see whose arm, on whose clock
const clip = (group, len = 1) => ({ keys: [{ time: 0, text: `${group}: start` }, { time: 0, text: `${group}: loop start` }, { time: len, text: `${group}: loop stop` }, { time: len, text: `${group}: stop` }] });
const sampleTrack = (tr, time) => ({ rotation: [1, 0, 0, 0], translation: [tr.id, time, 0], scale: 1 });
const deps = { pickAnimSource, resetClip, composeMovementGroup, composeStanceGroup, sampleTrack };
const L = 'bip01 l forearm', R = 'bip01 r forearm';
const source = (groups, id) => {
  const keys = groups.flatMap((g) => clip(g).keys);
  return { name: 'pack', keys, groupSet: new Set(groups), trackMap: new Map([[L, { id: id + 1 }], [R, { id: id + 2 }]]) };
};

test('ARM-SIDES: a plan\'s side lays the right arm\'s bones from the left arm\'s mask, or both', () => {
  assert.deepEqual([...mirrorMask(new Set(['bip01 l clavicle', 'bip01 l forearm', 'weapon bone left']))], ['bip01 r clavicle', 'bip01 r forearm', 'weapon bone right']);
  const src = source(['idle'], 10), layer = createLeftArmLayer(deps);
  for (let i = 0; i < 60; i++) layer.step(1 / 60, { plan: { kind: 'stance', base: 'idle', stance: 'bare', still: false, side: 'R' }, sources: [src], hasGroup: () => true, stance: T.None });
  const tracks = layer.tracks(new Map([[L, { id: 1 }], [R, { id: 2 }]]), new Set([L]));
  assert.ok(tracks.get(R).__overlay && !tracks.get(L).__overlay, 'the right arm the layer\'s, the left the base\'s');
});

test('ARM-REST / ARM-FADE: standing the arm runs on its clip\'s own clock (a breath, not a held pose); a clip changed under the arm fades over ARM_FADE, never a leap', () => {
  const src = source(['idle', 'walkforward'], 10), layer = createLeftArmLayer(deps), base = new Map([[L, { id: 1 }]]), mask = new Set([L]);
  const idle = { kind: 'stance', base: 'idle', stance: 'bare', still: false };
  const seen = [];
  for (let i = 0; i < 30; i++) { layer.step(1 / 60, { plan: idle, sources: [src], hasGroup: () => true, stance: T.None }); seen.push(layer.sampler()(layer.tracks(base, mask).get(L), 0).translation[1]); }
  assert.ok(seen.at(-1) > seen[10] + 0.1, `the idle's own clock runs: ${seen[10]} then ${seen.at(-1)}`);
  // the clips differ in their tracks' ids: the fade shows as the id moving through the between, never in a frame
  const two = { name: 'pack', keys: src.keys, groupSet: src.groupSet, trackMap: src.trackMap };
  const walkSrc = { ...two, trackMap: new Map([[L, { id: 50 }]]) };
  const walk = { kind: 'movement', base: 'walkforward', stance: 'bare', still: false };
  const ids = [];
  for (let i = 0; i < 40; i++) { layer.step(1 / 60, { plan: walk, sources: [walkSrc], hasGroup: () => true, stance: T.None }); ids.push(layer.sampler()(layer.tracks(base, mask).get(L), 0).translation[0]); }
  let leap = 0;
  for (let i = 1; i < ids.length; i++) leap = Math.max(leap, Math.abs(ids[i] - ids[i - 1]));
  assert.ok(ids.at(-1) === 50 && leap < (50 - 11) * (1 / 60 / ARM_FADE) * 1.5, `the walk's arm faded in (largest step ${leap.toFixed(2)})`);
});
