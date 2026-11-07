// The grass field's sweep over its live cells runs through Map.forEach with one callback made with the field: the
// for-of over the map's entries made an entry array and an iterator result for every live cell every frame. The sweep
// frees the same cells in the same order: these pins hold it to a walk of the map with the field's own rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../src/render/labGrass.js';

const CELL = G.GRASS_CELL, SPAN = G.LAB_GRASS.span;
/** The field's own distance from the eye to a cell's nearest point (its grid origin at 0 here). */
const nearest = (cx, cz, ex, ez) => Math.hypot(Math.max(cx * CELL - ex, 0, ex - (cx + 1) * CELL), Math.max(cz * CELL - ez, 0, ez - (cz + 1) * CELL));

function stand() {
  const cleared = [];
  const R = { allocSlots() {}, clearSlot(s) { cleared.push(s); }, shiftSlots() {}, writeSlot() {} };
  const field = G.createGrassField(R, { keep: () => 0, clock: () => 0 });   // a clock that stands: the frame's budget never ends, so the field settles in a few frames
  return { field, cleared };
}
const settle = (field, ex, ez) => { for (let f = 0; f < 80; f++) field.update(ex, ez); };   // the cells inside the fade's start are placed while the eye stands; the rest wait for a step

test('a move frees exactly the live cells past the keep span, in the map\'s order, and keeps the rest (mutants: the sweep\'s inputs stale, the callback skipping the current entry, a cell freed inside the span)', () => {
  const { field, cleared } = stand();
  settle(field, 0, 0);
  assert.ok(field.live.size > 10, `a field stands (${field.live.size} cells)`);
  for (const [ex, ez] of [[200, 0], [900, 300], [-5000, -5000]]) {
    const held = [...field.live.entries()];
    const want = held.filter(([, h]) => nearest(h.cx, h.cz, ex, ez) > SPAN);
    const keep = held.filter(([, h]) => nearest(h.cx, h.cz, ex, ez) <= SPAN);
    cleared.length = 0;
    field.update(ex, ez);
    assert.deepEqual(cleared.slice(0, want.length), want.map(([, h]) => h.slot), `the freed slots, in the map's order (eye ${ex},${ez})`);
    for (const [key] of want) assert.ok(!field.live.has(key), `freed cell gone (${key})`);
    for (const [key, h] of keep) assert.equal(field.live.get(key), h, `kept cell kept (${key})`);
    settle(field, ex, ez);
  }
});
