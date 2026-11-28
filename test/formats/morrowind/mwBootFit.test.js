import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AFFINE_IDENTITY } from '../../../src/formats/morrowind/mwAffine.js';
import { tuckTrouserCuffs } from '../../../src/formats/morrowind/mwBootFit.js';

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
