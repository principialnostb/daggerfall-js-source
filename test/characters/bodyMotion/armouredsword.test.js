import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createArmouredSword, ARMOURED_SWORD } from '../../../src/characters/bodyMotion/armouredSword.js';
import { sceneInput } from '../../../src/characters/bodyMotion/bodyMotion.js';
import { MW_WEAPON_TYPE } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { createBodyWeight } from '../../../src/characters/bodyMotion/bodyWeight.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';

const word = (extra = {}) => sceneInput({ weapon: MW_WEAPON_TYPE.LongBladeTwoHand, travel: [0, 0, 0], ...extra });
test('armoured sword: a start loads the trunk, a stop brakes it, a steady walk has no added sway', () => {
  const layer = createArmouredSword();
  let z = 0;
  for (let i = 0; i < 10; i++) layer.step(1 / 60, true, word(), 1);
  let start = 0;
  for (let i = 0; i < 15; i++) { z += 4.4 / 60; start = Math.max(start, layer.step(1 / 60, true, word({ travel: [0, 0, z] }), 1).pitch); }
  assert.ok(start > 0.035 && start < ARMOURED_SWORD.maxPitch, 'a readable transient, not a one-frame twitch');
  for (let i = 0; i < 120; i++) { z += 4.4 / 60; layer.step(1 / 60, true, word({ travel: [0, 0, z] }), 1); }
  assert.ok(Math.abs(layer.pose().pitch) < 1e-6, 'no continuous procedural walk lean');
  let stop = 0;
  for (let i = 0; i < 15; i++) stop = Math.min(stop, layer.step(1 / 60, true, word({ travel: [0, 0, z] }), 1).pitch);
  assert.ok(stop < -0.01);
  let last = Math.abs(layer.pose().pitch);
  for (let i = 0; i < 90; i++) {
    const now = Math.abs(layer.step(1 / 60, true, word({ travel: [0, 0, z] }), 1).pitch);
    assert.ok(now <= last + 1e-10, 'settles without oscillating'); last = now;
  }
});
test('armoured sword: the composed rig keeps the stride feet and two-handed grip intact', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const sm = (skel, pose, root) => skeletonSpaceMatrices(skel, pose, root);
  const layer = createBodyWeight();
  const armour = [102, 103, 104, 105, 106, 107, 108].map(templateIndex => ({ kind: 'armor', templateIndex, material: 0x0200 }));
  const pos = (m, name) => m.get(sk.byName.get(name)).t;
  const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  for (let i = 0; i < 90; i++) {
    const input = word({ running: true, travel: [0, 0, i / 8] });
    layer.stepRig(1 / 60, true, { move: { travel: input.travel, bodyYaw: 0, grounded: true } }, armour, input.mwType, false, input);
    const pose = new Map(), before = sm(sk, pose, GRAPH_ROOT);
    layer.slot(null)(sk, pose, GRAPH_ROOT, sm);
    const after = sm(sk, pose, GRAPH_ROOT);
    for (const name of ['bip01 l foot', 'bip01 r foot', 'bip01 pelvis']) assert.ok(dist(pos(before, name), pos(after, name)) < 1e-6, `${name}: the locomotion owns its position`);
    const grip = m => dist(pos(m, 'bip01 l hand'), pos(m, 'bip01 r hand'));
    assert.ok(Math.abs(grip(before) - grip(after)) < 0.001, 'both hands carried together');
    for (const matrix of after.values()) assert.ok([...matrix.a, ...matrix.t].every(Number.isFinite));
  }
});
test('armoured sword: pilot excludes other weapons, light armour, airborne and disabled bodies', () => {
  for (const [active, input, armour] of [[false, word(), 1], [true, word(), 0.2], [true, word({ weapon: MW_WEAPON_TYPE.LongBladeOneHand }), 1], [true, word({ grounded: false }), 1]]) {
    const layer = createArmouredSword();
    for (let i = 0; i < 30; i++) layer.step(1 / 60, active, { ...input, running: true, travel: [0, 0, i / 8] }, armour);
    assert.deepEqual(layer.pose(), { pitch: 0, roll: 0, yaw: 0 });
  }
});
test('armoured sword: locomotion posture does not add a second attack amplitude over BLOW-LEGS', () => {
  const cut = { type: 'slash', section: 'release', progress: 1, hand: 'R', strength: 1 };
  const layer = createArmouredSword();
  for (let i = 0; i < 60; i++) layer.step(1 / 60, true, word({ travel: [0, 0, i / 15], blow: cut }), 1);
  assert.equal(layer.pose().yaw, 0);
  assert.ok(Math.abs(layer.pose().pitch) < 1e-6);
  for (let i = 0; i < 120; i++) layer.step(1 / 60, true, word({ blow: cut }), 1);
  assert.ok(Math.abs(layer.pose().yaw) < 1e-6);
  layer.reset(); assert.deepEqual(layer.pose(), { pitch: 0, roll: 0, yaw: 0 });
});
