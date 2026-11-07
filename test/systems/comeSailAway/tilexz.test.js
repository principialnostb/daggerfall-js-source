// tileMapIndexAtXZ is tileMapIndexAtPosition's arithmetic for a caller that holds the numbers and no vector: a
// harbour's sounding asks it thousands of times a frame. One body, two doors - the pin holds them to the bit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tileMapIndexAtPosition, tileMapIndexAtXZ } from '../../../src/systems/comeSailAway/comeSailAway.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('the two doors answer the same index for random points over random terrains, the empty map included (mutants: an operand swapped, the corner read from the wrong axis)', () => {
  const rand = rng(7);
  const map = new Uint8Array(128 * 128);
  for (let i = 0; i < map.length; i++) map[i] = Math.floor(rand() * 256);
  for (let n = 0; n < 2000; n++) {
    const tp = [(rand() - 0.5) * 20000, (rand() - 0.5) * 100, (rand() - 0.5) * 20000];
    const pos = [tp[0] + (rand() * 1.2 - 0.1) * 819.2, rand() * 50, tp[2] + (rand() * 1.2 - 0.1) * 819.2];
    const terrain = { tileMap: map, position: tp };
    assert.equal(tileMapIndexAtXZ(pos[0], pos[2], tp[0], tp[2], map), tileMapIndexAtPosition(pos, terrain), `point ${n}`);
  }
  assert.equal(tileMapIndexAtXZ(1, 2, 0, 0, null), -1);
  assert.equal(tileMapIndexAtXZ(1, 2, 0, 0, new Uint8Array(0)), -1);
  assert.equal(tileMapIndexAtPosition([1, 0, 2], { tileMap: null, get position() { throw new Error('read'); } }), -1, 'no map: the corner is never read');
});
