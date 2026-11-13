// The frame-neutral lines of the hosts and passes measured by tools/frameProbe.mjs, held as source law: each is a cost
// the frame paid for a value that could not change, made cheaper without a line of the host's own scope (HOST-SPLIT).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostText } from '../hostText.mjs';

const world = hostText('src/scenes/world.js');
const renderer = hostText('src/render/renderer.js');
const grass = hostText('src/render/labGrass.js');
const clock = hostText('src/systems/frameClock.js');
const shadow = hostText('src/render/shadowPass.js');
const once = (text, needle, where) => assert.equal(text.split(needle).length - 1, 1, `${where}: ${needle.slice(0, 60)} stands once`);

test('the world host\'s three frame lines read their helpers from outside its scope: the frozen empty gate list, the pixel sort by sign, the harbour sounding\'s one vector (mutants: an empty array minted a pixel a frame, a difference comparator, a vector a tile ask)', () => {
  once(world, 'for (const g of p.cityGates ?? NO_GATES) {', 'the city gates');
  once(world, '_pixelOrder.sort(byDist2);', 'the pixel order');
  once(world, 'csaTileMapIndexAtXZ(x, z, corner[0], corner[2], t.tileMap)', 'the water test');
  const boot = world.indexOf('export async function bootWorld(');
  for (const decl of ['const NO_GATES = Object.freeze([]);', 'const byDist2 = (a, b) => (a._dist2 < b._dist2 ? -1 : a._dist2 > b._dist2 ? 1 : 0);', 'const _navalTile = [0, 0, 0];']) {
    const at = world.indexOf(decl);
    assert.ok(at > 0 && at < boot, `${decl.slice(0, 30)} stands before bootWorld, outside the host's scope`);
  }
  assert.equal(world.split('p.cityGates ?? []').length - 1, 1, 'the one empty array left is the unload path, no frame\'s');
  assert.ok(!world.includes('csaTileMapIndexAtPosition([x, 0, z]'), 'no vector a tile ask');
});

test('the billboard pass walks its lists by index and sorts the blended phase by sign; the grass sweeps its live cells through Map.forEach; the frame clock trims in place; the shadow pass sends a program\'s view once and the viewport when it changes (mutants: a for-of back, a difference comparator, a slice)', () => {
  assert.equal(renderer.split('for (let batchIndex = 0, batchCount = batches.length; batchIndex < batchCount; batchIndex++)').length - 1, 2, 'both walks of the batches by index');
  once(renderer, 'for (let batchIndex = 0, batchCount = opaqueCount; batchIndex < batchCount; batchIndex++) drawOne(opaque[batchIndex]);', 'the opaque phase');
  assert.ok(!renderer.includes('blended.sort((a, b) => d2(b) - d2(a))'), 'the blended sort by sign');
  once(grass, 'live.forEach(sweepHeld);', 'the grass sweep');
  assert.ok(!grass.includes('for (const [key, held] of live)'), 'no entry walk a frame');
  once(clock, 'samples.splice(0, i);', 'the clock\'s trim');
  assert.ok(!clock.includes('samples.slice(i)'), 'no copy a frame');
  once(shadow, 'if (!prog.viewUp) { gl.uniformMatrix4fv(prog.view, false, this._identityView); prog.viewUp = true; }', 'the view once');
  once(shadow, 'if (!P.bb.texUp) { gl.uniform1i(P.bb.tex, 0); P.bb.texUp = true; }', 'the sampler once');
  assert.equal(shadow.split('this._viewport(').length - 1, 6, 'every square viewport through the tracker (three sizes, six sites)');
  assert.ok(!/gl\.viewport\(0, 0, (SHADOW_LO_SIZE|SHADOW_SUN_SIZE|SHADOW_POINT_SIZE|S), /.test(shadow), 'no raw square viewport in the pass');
});
