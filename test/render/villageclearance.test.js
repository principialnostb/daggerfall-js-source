import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VillagePlantClearance } from '../../src/world/tamriel/villagePlantClearance.js';
import { villageGrassAt } from '../../src/world/tamriel/helbernar.js';
import { trs } from '../../src/world/mat4.js';

test('Helbenar places grass by the house footprint and the turned rail, including the width of the tuft', () => {
  const mask = new VillagePlantClearance();
  mask.add(6, 6, 12, 9);
  mask.add(6, 9, 8, 14);
  const accepts = (x, z) => villageGrassAt(8, x / 6.4, z / 6.4, false, null, mask);
  assert.equal(accepts(7, 12), false);
  assert.equal(accepts(8.7, 12), false);
  assert.equal(accepts(9, 12), true);
  const m = trs(24, 0, 24, 0, 45, 0);
  mask.addFence([-0.12, 0, -5, 0.12, 1, 5], m);
  const x = 24 + m[8] * 4,
    z = 24 + m[10] * 4;
  assert.equal(accepts(x, z), false);
  assert.equal(accepts(x + 0.75 * m[0], z + 0.75 * m[2]), false);
  assert.equal(accepts(x + 1.2 * m[0], z + 1.2 * m[2]), true);
});
