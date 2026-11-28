import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AFFINE_IDENTITY } from '../../../src/formats/morrowind/mwAffine.js';
import { fitThighPlates, fitTrousersUnderGreaves, tuckTrouserCuffs } from '../../../src/formats/morrowind/mwBootFit.js';

function tube(slot, top, bottom, radius) {
  const positions = Float32Array.from([top, bottom].flatMap((x) => Array.from({ length: 8 }, (_, i) => {
    const angle = i * Math.PI / 4;
    return [x, radius * Math.cos(angle), radius * Math.sin(angle)];
  }).flat()));
  const indices = Uint16Array.from(Array.from({ length: 8 }, (_, i) => {
    const next = (i + 1) % 8;
    return [i, next, next + 8, i, next + 8, i + 8];
  }).flat());
  return { slot, kind: 'rigid', attachRef: 'calf', source: positions, positions, indices };
}

function rig(boot, pants) {
  return {
    pieces: [boot, pants],
    skeleton: { byName: new Map([['bip01 l calf', 'calf'], ['bip01 l foot', 'foot']]) },
    mats: new Map([['calf', AFFINE_IDENTITY], ['foot', { ...AFFINE_IDENTITY, t: [36, 0, 0] }]]),
  };
}

const worn = [{ slot: 'boot', legWear: 'footwear' }, { slot: 'pants', legWear: 'trousers' }];

test('trouser cuffs tuck into the shaft in the source mesh and keep their silhouette above it', () => {
  const boot = tube('boot', 12, 36, 5);
  const pants = tube('pants', 4, 30, 6);
  const original = pants.source;
  assert.equal(tuckTrouserCuffs(rig(boot, pants), worn), true);
  assert.deepEqual(pants.source.slice(0, 24), original.slice(0, 24));
  assert.deepEqual([...pants.source.slice(24, 27)].map((x) => +x.toFixed(2)), [30, 3.2, 0]);
  assert.equal(original[25], 6, 'shared NIF source remains intact');
});

test('low shoes and missing boots do not tuck trousers', () => {
  const pants = tube('pants', 4, 30, 6);
  assert.equal(tuckTrouserCuffs(rig(tube('boot', 31, 36, 5), pants), worn), false);
  assert.equal(tuckTrouserCuffs({ pieces: [pants] }, worn), false);
});

test('pose-only cuff fitting follows the current shaft without editing shared source vertices', () => {
  const boot = tube('boot', 12, 36, 5);
  const pants = tube('pants', 4, 30, 6);
  pants.positions = pants.source.slice();
  boot.positions = boot.source.map((value, i) => i % 3 === 0 ? value : value * 0.8);
  assert.equal(tuckTrouserCuffs(rig(boot, pants), worn, { poseOnly: true }), true);
  assert.equal(pants.positions[25].toFixed(2), '2.56');
  assert.equal(pants.source[25], 6);
  assert.equal(pants.positions[1], 6);
});

test('the rim of an open thigh plate clears the knee and leaves its upper edge in place', () => {
  const plate = tube('right upper leg (plate)', 4, 28, 4);
  const knee = tube('knee', 18, 34, 6);
  const arm = {
    pieces: [plate, knee],
    skeleton: { byName: new Map([['bip01 r thigh', 'thigh'], ['bip01 r calf', 'calf']]) },
    mats: new Map([['thigh', AFFINE_IDENTITY], ['calf', { ...AFFINE_IDENTITY, t: [36, 0, 0] }]]),
  };
  plate.attachRef = 'thigh';
  const original = plate.source;
  assert.equal(fitThighPlates(arm, [{ slot: plate.slot, legWear: 'thighPlate' }]), true);
  assert.deepEqual(plate.source.slice(0, 24), original.slice(0, 24));
  assert.equal(plate.source[25].toFixed(2), '6.90');
  assert.equal(original[25], 4);
  assert.equal(knee.source[25], 6);
});

test('a single trouser mesh fits beneath a bound greave while its uncovered waist stays in place', () => {
  const plate = tube('right upper leg (steel)', 9, 28, 5);
  const pants = tube('groin (whole trousers)', 0, 24, 7);
  plate.attachRef = pants.attachRef = 'thigh';
  const arm = {
    pieces: [plate, pants],
    skeleton: { byName: new Map([['bip01 r thigh', 'thigh'], ['bip01 r calf', 'calf']]) },
    mats: new Map([['thigh', AFFINE_IDENTITY], ['calf', { ...AFFINE_IDENTITY, t: [36, 0, 0] }]]),
  };
  const rows = [
    { slot: plate.slot, partName: 'right upper leg', piece: { kind: 'armor' } },
    { slot: pants.slot, legWear: 'trousers' },
  ];
  const original = pants.source;
  assert.equal(fitTrousersUnderGreaves(arm, rows), true);
  assert.deepEqual(pants.source.slice(0, 24), original.slice(0, 24));
  assert.ok(pants.source[25] > 4 && pants.source[25] <= 4.35, 'the cloth fits inside the plate with clearance');
  assert.equal(original[25], 7);
  assert.equal(plate.source[25], 5);
  arm.pieces.shift();
  assert.equal(fitTrousersUnderGreaves(arm, rows), false, 'an unresolved plate leaves clothing intact');
});
