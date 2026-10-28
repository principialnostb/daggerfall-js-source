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
  let footError = 0, compression = 0;
  for (let i = 0; i < 90; i++) {
    const input = word({ running: true, travel: [0, 0, i / 8] });
    layer.stepRig(1 / 60, true, { move: { travel: input.travel, bodyYaw: 0, grounded: true } }, armour, input.mwType, false, input);
    const pose = new Map(), before = sm(sk, pose, GRAPH_ROOT);
    layer.slot(null)(sk, pose, GRAPH_ROOT, sm);
    const after = sm(sk, pose, GRAPH_ROOT);
    for (const name of ['bip01 l foot', 'bip01 r foot']) footError = Math.max(footError, dist(pos(before, name), pos(after, name)));
    compression = Math.max(compression, pos(before, 'bip01 pelvis')[2] - pos(after, 'bip01 pelvis')[2]);
    assert.ok(pos(after, 'bip01 pelvis')[2] <= pos(before, 'bip01 pelvis')[2] + 1e-6, 'the loaded support may compress, never lift');
    const grip = m => dist(pos(m, 'bip01 l hand'), pos(m, 'bip01 r hand'));
    assert.ok(Math.abs(grip(before) - grip(after)) < 0.001, 'both hands carried together');
    for (const matrix of after.values()) assert.ok([...matrix.a, ...matrix.t].every(Number.isFinite));
  }
  assert.ok(footError < 0.1, `two-bone IK error ${footError} rig units (limit about 1.4 mm)`);
  assert.ok(compression > 0.5, `the pelvis actually loads the support (${compression} rig units)`);
});
test('armoured movement: exclude light armour, non-bipeds, airborne and disabled bodies', () => {
  for (const [active, input, armour] of [[false, word(), 1], [true, word(), 0.2], [true, word({ kind: null }), 1], [true, word({ grounded: false }), 1]]) {
    const layer = createArmouredSword();
    for (let i = 0; i < 30; i++) layer.step(1 / 60, active, { ...input, running: true, travel: [0, 0, i / 8] }, armour);
    assert.deepEqual(layer.pose(), { pitch: 0, roll: 0, yaw: 0, drop: 0 });
  }
});
test('armoured sword: moving cuts turn with the blow, standing cuts keep their accepted hip layer', () => {
  const cut = { type: 'slash', section: 'release', progress: 1, hand: 'R', strength: 1 };
  const layer = createArmouredSword();
  for (let i = 0; i < 60; i++) layer.step(1 / 60, true, word({ travel: [0, 0, i / 15], blow: cut }), 1);
  assert.ok(layer.pose().yaw > 0.08);
  for (let i = 0; i < 120; i++) layer.step(1 / 60, true, word({ blow: cut }), 1);
  assert.ok(Math.abs(layer.pose().yaw) < 1e-6);
  layer.reset(); assert.deepEqual(layer.pose(), { pitch: 0, roll: 0, yaw: 0, drop: 0 });
});

test('armoured movement: sheathed plate still loads the support with the separate body-motion preference off', () => {
  const layer = createArmouredSword();
  const input = word({ shown: false, weapon: MW_WEAPON_TYPE.None, on: false });
  for (let i = 0; i < 10; i++) layer.step(1 / 60, true, input, 1);
  let peak = 0, compression = 0;
  for (let i = 0; i < 30; i++) {
    const p = layer.step(1 / 60, true, { ...input, travel: [0, 0, (i + 1) * 4.4 / 60] }, 1);
    peak = Math.max(peak, p.pitch); compression = Math.max(compression, p.drop);
  }
  assert.ok(peak > 0.06, 'at least 3.4 degrees of visible start effort');
  assert.ok(compression > 0.015, 'support compresses by over 1.5% of leg length');
});
