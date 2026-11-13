// The stream's nearest-first comparator answers the sign alone (-1, 0, 1): a sort over a difference of doubles boxed
// a number for every compare, and the snow's ground asks it of every built pixel every frame. The order is the
// difference's order to the entry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nearestFirstFrom } from '../../src/world/streamingWorld.js';

/** The comparator as it answered before: the difference. */
const oracleFrom = (current) => (a, b) => {
  const ca = Math.max(Math.abs(a.px - current.x), Math.abs(a.py - current.y));
  const cb = Math.max(Math.abs(b.px - current.x), Math.abs(b.py - current.y));
  if (ca !== cb) return ca - cb;
  return (a.px - current.x) ** 2 + (a.py - current.y) ** 2 - ((b.px - current.x) ** 2 + (b.py - current.y) ** 2);
};
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('the same order as the difference gave, over random grids about integer and fractional centres, and only -1, 0 or 1 answered (mutants: a tie broken, the Euclid arm dropped)', () => {
  const rand = rng(11);
  for (let n = 0; n < 200; n++) {
    const current = n % 2 ? { x: Math.floor(rand() * 1000), y: Math.floor(rand() * 500) } : { x: rand() * 1000, y: rand() * 500 };
    const pixels = [];
    const w = 3 + Math.floor(rand() * 9);
    for (let i = 0; i < w * w; i++) pixels.push({ px: Math.floor(current.x) + (i % w) - (w >> 1), py: Math.floor(current.y) + Math.floor(i / w) - (w >> 1), id: i });
    const got = pixels.slice().sort(nearestFirstFrom(current)).map((p) => p.id);
    const want = pixels.slice().sort(oracleFrom(current)).map((p) => p.id);
    assert.deepEqual(got, want, `grid ${n}`);
    const cmp = nearestFirstFrom(current);
    for (let i = 0; i < 40; i++) {
      const a = pixels[Math.floor(rand() * pixels.length)], b = pixels[Math.floor(rand() * pixels.length)];
      const v = cmp(a, b), o = oracleFrom(current)(a, b);
      assert.ok(v === -1 || v === 0 || v === 1, `a sign (${v})`);
      assert.equal(v, Math.sign(o), 'the difference\'s sign');
    }
  }
});
