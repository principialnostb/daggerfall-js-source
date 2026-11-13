// The renderer's frame records are kept and filled in place: the cutout pass's list, the world rect a host sets and
// the one its frame used, the window light's eye and the cloud deck's upload stamps. A host that read the canvas's
// client size this frame hands it on, and beginFrame does not ask the layout again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Renderer, CLOUD_SHADOW_UNIT } from '../../src/render/renderer.js';
import { perspective, lookAt, mirrorProjectionX } from '../../src/world/mat4.js';
import { ALLOC_CHILD_ARGS } from '../allocChild.mjs';

const R = new Float32Array([1, 0, 0]), UP = new Float32Array([0, 1, 0]), SUN = new Float32Array([0.3, 0.8, 0.2]);
const PROJ = mirrorProjectionX(perspective(Math.PI / 3, 1.6, 0.1, 400));
const VIEW = lookAt([0.37, 1.7, 9.1], [0, 1.2, -4], [0, 1, 0]);

/** A GL that answers every call and records it, and a canvas that counts the reads of its client size. */
function rig() {
  const calls = [];
  let ids = 0;
  const consts = { TEXTURE0: 33984, TEXTURE_2D: 3553, TEXTURE_2D_ARRAY: 35866 };
  const gl = new Proxy({}, {
    get(_, k) {
      if (k in consts) return consts[k];
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'getUniformLocation') return (_p, n) => n;
      if (k === 'getAttribLocation') return () => 0;
      if (typeof k === 'string' && k.startsWith('create')) return () => ({ id: ++ids });
      if (k === 'getParameter') return () => new Float32Array(4);
      if (typeof k === 'string' && k.toUpperCase() === k) return 1;
      return (...args) => { calls.push([k, ...args]); };
    },
  });
  const reads = { w: 0, h: 0 }, size = { w: 320, h: 200 };
  const canvas = {
    getContext: () => gl, width: 320, height: 200,
    get clientWidth() { reads.w++; return size.w; },
    get clientHeight() { reads.h++; return size.h; },
  };
  return { r: new Renderer(canvas), calls, canvas, reads, size };
}
/** Six flats over four pictures, each picture's texture in place. */
function flats(r) {
  const made = [];
  for (const [archive, record] of [[504, 9], [504, 10], [182, 2], [504, 9], [182, 2], [380, 0]]) {
    const key = `${archive}_${record}`;
    if (!r.textures.has(key)) r.textures.set(key, { id: key });
    made.push(r.createBillboardBatch(archive, record, { w: 1, h: 2 }, [[made.length, 0, -3]]));
  }
  return made;
}

test('the cutout pass keeps its list across frames: each pass is written from the front and read to its own count, every flat drawn in the key order, and no flat held past the draw', () => {
  const { r, calls } = rig();
  r._bbCullOff = true;
  const made = flats(r);
  const frame = (list) => {
    r.beginFrame(PROJ, VIEW, SUN);
    calls.length = 0;
    r.drawBillboards(list, R, UP);
    const bound = calls.filter((c) => c[0] === 'bindTexture' && typeof c[2]?.id === 'string').map((c) => c[2].id);
    return { bound, drawn: calls.filter((c) => c[0] === 'drawElements').length };
  };
  const kept = (label) => {
    assert.equal(r._bbOpaque.length, 6, `${label}: the list keeps the length its longest pass grew it to`);
    assert.ok(r._bbOpaque.every((b) => b === null), `${label}: and holds no flat past the draw`);
  };
  assert.deepEqual(frame(made), { bound: ['182_2', '380_0', '504_10', '504_9'], drawn: 6 }, 'one bind a key, in the string order');
  kept('six');
  assert.deepEqual(frame(made.slice(3)), { bound: ['182_2', '380_0', '504_9'], drawn: 3 }, 'a shorter pass reads only its own');
  kept('three');
  assert.deepEqual(frame([made[1], made[0]]), { bound: ['504_10', '504_9'], drawn: 2 });
  kept('two');
  assert.deepEqual(frame(made), { bound: ['182_2', '380_0', '504_10', '504_9'], drawn: 6 });
  kept('six again');
});

test('the cloud deck\'s upload stamps are forgotten by a new stamp each frame: a program uploads the deck once a frame, as it did when the stamps were a new record each frame', () => {
  const { r, calls } = rig();
  r._bbCullOff = true;
  const made = flats(r);
  const uploads = (fn) => { calls.length = 0; fn(); return calls.filter((c) => c[0] === 'uniform1i' && c[1] === 'uCloudShadowMap' && c[2] === CLOUD_SHADOW_UNIT).length; };
  r.beginFrame(PROJ, VIEW, SUN);
  assert.equal(uploads(() => r.drawBillboards(made, R, UP)), 1, 'the frame\'s first pass uploads the deck');
  assert.equal(uploads(() => r.drawBillboards(made, R, UP)), 0, 'its second does not');
  r.beginFrame(PROJ, VIEW, SUN);
  assert.equal(uploads(() => r.drawBillboards(made, R, UP)), 1, 'a new frame uploads it again');
  r.markForeignPass();
  assert.equal(uploads(() => r.drawBillboards(made, R, UP)), 1, 'and so does a foreign pass');
  r.beginFrame(PROJ, VIEW, SUN);
  r.beginFrame(PROJ, VIEW, SUN);
  assert.equal(uploads(() => r.drawBillboards(made, R, UP)), 1, 'two frames in a row: once');
  const before = r._csUploaded;
  r.beginFrame(PROJ, VIEW, SUN);
  assert.equal(r._csUploaded, before, 'beginFrame keeps the record: the stamp moves instead');
});

test('the world rect is a record kept and filled in place: the frame reads the rect its host set this frame, a copy handed out keeps its own, and the full canvas is no rect', () => {
  const { r } = rig();
  const docked = { x: 0, y: 0.25, w: 1, h: 0.75 };
  r.setWorldViewport(docked);
  const pending = r._worldViewportPending;
  docked.y = 0.5;   // the host's object is its own: the renderer took its fields
  r.beginFrame(PROJ, VIEW, SUN);
  const first = r.worldViewportRect, record = r._worldViewportFrame;
  assert.deepEqual(first, { x: 0, y: 0.25, w: 1, h: 0.75 });
  assert.deepEqual(r.worldViewportPx, [0, 50, 320, 150]);
  r.setWorldViewport({ x: 0, y: 0.1, w: 1, h: 0.9 });
  assert.equal(r._worldViewportPending, pending, 'the pending rect is one record, filled again');
  r.beginFrame(PROJ, VIEW, SUN);
  assert.deepEqual(r.worldViewportRect, { x: 0, y: 0.1, w: 1, h: 0.9 });
  assert.deepEqual(r.worldViewportPx, [0, 20, 320, 180]);
  assert.deepEqual(first, { x: 0, y: 0.25, w: 1, h: 0.75 }, 'the copy handed out last frame is its reader\'s own');
  assert.equal(r._worldViewportFrame, record, 'the frame\'s rect is one record, filled again');
  r.setWorldViewport({ x: 0, y: 0, w: 1, h: 1 });
  r.beginFrame(PROJ, VIEW, SUN);
  assert.equal(r.worldViewportRect, null, 'the full canvas');
  assert.equal(r.worldViewportPx, null);
  r.setWorldViewport(docked);
  r.beginFrame(PROJ, VIEW, SUN);
  assert.deepEqual(r.worldViewportRect, { x: 0, y: 0.5, w: 1, h: 0.75 });
  r.beginFrame(PROJ, VIEW, SUN);
  assert.equal(r.worldViewportRect, null, 'a frame no host set a rect for is the full canvas');
});

test('the window light\'s eye is one array filled in place: sunFor is asked with the camera\'s place each frame, to the bit', () => {
  const { r } = rig();
  const asked = [];
  r._wlKindOf = () => 'inside';
  r._wlFrame = () => false;
  r._beginLane = () => {};
  r._shadows = {};
  r._wl.sunFor = (eye) => { asked.push([eye, [...eye]]); return null; };
  const views = [VIEW, lookAt([-3.3, 2.1, 0.7], [1, 1, 1], [0, 1, 0]), lookAt([1e4 + 0.1, 30, -2e4], [1e4, 29, -2e4 + 5], [0, 1, 0])];
  for (const v of views) r.beginFrame(PROJ, v, SUN);
  assert.equal(asked.length, views.length, 'asked once a frame');
  views.forEach((v, i) => {
    const want = [-(v[0] * v[12] + v[1] * v[13] + v[2] * v[14]), -(v[4] * v[12] + v[5] * v[13] + v[6] * v[14]), -(v[8] * v[12] + v[9] * v[13] + v[10] * v[14])];
    assert.deepEqual(asked[i][1], want, `frame ${i}: the camera's place from the view`);
  });
  assert.ok(asked.every(([eye]) => eye === asked[0][0]), 'one array, filled again each frame');
});

test('a host that read the canvas\'s client size this frame hands it on: beginFrame sizes the canvas by it and asks the layout nothing; a frame handed none asks the layout, as before', () => {
  const { r, canvas, reads, size } = rig();
  r.setWorldViewport(null, 640, 400);
  r.beginFrame(PROJ, VIEW, SUN);
  assert.deepEqual([reads.w, reads.h, canvas.width, canvas.height], [0, 0, 640, 400], 'the size handed on, the layout unasked');
  r.beginFrame(PROJ, VIEW, SUN);
  assert.deepEqual([reads.w, reads.h, canvas.width, canvas.height], [1, 1, 320, 200], 'taken once: the next frame asks the layout');
  r.setWorldViewport({ x: 0, y: 0.25, w: 1, h: 0.75 });
  r.beginFrame(PROJ, VIEW, SUN);
  assert.deepEqual([reads.w, reads.h], [2, 2], 'a rect with no size: the layout asked');
  size.w = 800; size.h = 500;
  r.setWorldViewport({ x: 0, y: 0.25, w: 1, h: 0.75 }, 800, 500);
  r.beginFrame(PROJ, VIEW, SUN);
  assert.deepEqual([reads.w, reads.h, canvas.width, canvas.height], [2, 2, 800, 500]);
  assert.deepEqual(r.worldViewportPx, [0, 125, 800, 375], 'the rect laid on the size handed on');
});

test('setting the world rect makes nothing: measured in a node of its own against a control that must show', () => {
  const href = JSON.stringify(new URL('../../src/render/renderer.js', import.meta.url).href);
  const script = `
    const { Renderer } = await import(${href});
    const set = Renderer.prototype.setWorldViewport;
    const self = { _wvPending: { x: 0, y: 0, w: 1, h: 1 }, _worldViewportPending: null, _wvClientW: -1, _wvClientH: -1 };
    const rects = [{ x: 0, y: 0.25, w: 1, h: 0.75 }, { x: 0, y: 0.3125, w: 1, h: 0.6875 }, { x: 0, y: 0, w: 1, h: 1 }];
    let sink = null, k = 0;
    const fns = {
      docked: () => { set.call(self, rects[(k = (k + 1) & 1)], 1280, 720); sink = self._worldViewportPending; },
      full: () => { set.call(self, rects[2], 1280, 720); sink = self._worldViewportPending; },
      control: () => { sink = { a: k, b: [k] }; },
    };
    const bytes = (fn) => {
      let least = Infinity;
      for (let r = 0; r < 5; r++) {
        for (let f = 0; f < 2000; f++) fn();
        globalThis.gc(); globalThis.gc();
        const h0 = process.memoryUsage().heapUsed;
        for (let f = 0; f < 2000; f++) fn();
        least = Math.min(least, (process.memoryUsage().heapUsed - h0) / 2000);
      }
      return least;
    };
    const out = {};
    for (const name of Object.keys(fns)) out[name] = bytes(fns[name]);
    set.call(self, rects[0], 1280, 720);
    out.rect = self._worldViewportPending && { ...self._worldViewportPending };
    out.sunk = sink !== undefined;
    console.log(JSON.stringify(out));
  `;
  const run = spawnSync(process.execPath, [...ALLOC_CHILD_ARGS, '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const m = JSON.parse(run.stdout.trim().split('\n').pop());
  assert.deepEqual(m.rect, { x: 0, y: 0.25, w: 1, h: 0.75 }, 'the rect taken');
  assert.ok(m.control >= 20, `the control made ${m.control.toFixed(2)} bytes a call: the measure is blind`);
  assert.ok(m.docked < 16 && m.full < 16, `a docked rect: ${m.docked.toFixed(2)} bytes a frame; the full canvas: ${m.full.toFixed(2)}`);
});
