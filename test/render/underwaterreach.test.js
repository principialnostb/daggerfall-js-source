// The copy of the frame under the water is taken only where the water can read it. These pins run the renderer and
// its air pass on a recording GL, and emulate the water shader's reads in single precision: every texel a fragment
// can read lies in the part copied, the part is smaller than the frame when the water is, and the one-row list, the
// sea and a later list that reads past the part copy all that they copied before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { EL_LANE } from '../../src/render/enhancedLighting.js';
import * as waterSurface from '../../src/render/waterSurface.js';
import { perspective, lookAt } from '../../src/world/mat4.js';

const WIDE = 1600,
  HIGH = 1000;
const LIGHT = new Float32Array([0.3, 0.8, 0.2]);
const UP = [0, 1, 0];
const PROJ = perspective(Math.PI / 3, WIDE / HIGH, 0.5, 3000);
/** The frame the pins draw in: its drawing buffer's size and the lens. */
const FRAME = { wide: WIDE, high: HIGH, proj: PROJ };
const WU = waterSurface.waterUniforms({ seconds: 3, wind: [6, 2] });
const f32 = Math.fround;
/** Each test sheet's box over its own grid: the reads are walked over the geometry the test built, not the box under test. */
const gridBox = new WeakMap();

/** A recording GL: every call kept, the constants the blits name, a drawing buffer the canvas's size unless `buffer`
 *  names a smaller one (a browser that caps it). */
function stand(size = FRAME, buffer = size) {
  const calls = [];
  let ids = 0;
  const named = { TEXTURE0: 1000, DEPTH_BUFFER_BIT: 256, COLOR_BUFFER_BIT: 16384, READ_FRAMEBUFFER: 36008, DRAW_FRAMEBUFFER: 36009, FRAMEBUFFER: 36160, NEAREST: 9728 };
  const gl = new Proxy({ drawingBufferWidth: buffer.wide, drawingBufferHeight: buffer.high }, {
    get(own, key) {
      if (key in own) return own[key];
      if (key in named) return named[key];
      if (key === 'getProgramParameter' || key === 'getShaderParameter' || key === 'checkFramebufferStatus') return () => true;
      if (key === 'getUniformLocation') return (_program, name) => ({ name });
      if (key === 'getAttribLocation') return () => 0;
      if (typeof key === 'string' && key.startsWith('create')) return () => ({ id: ++ids });
      if (key === 'getParameter') return () => new Float32Array(4);
      if (key === 'getExtension') return () => ({});
      if (typeof key === 'string' && key.toUpperCase() === key) return 1;
      return (...args) => { calls.push([key, ...args]); };
    },
  });
  const r = new Renderer({ getContext: () => gl, clientWidth: size.wide, clientHeight: size.high, width: size.wide, height: size.high });
  r.setLightingLane(EL_LANE);
  r.setAir(true);
  return { r, calls, blits: () => calls.filter((c) => c[0] === 'blitFramebuffer').map((c) => c.slice(1)) };
}

const translate = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
/** A bed's own sheet: a grid of `cells` x `cells` quads `size` across, every quad water. */
function bedSheet(r, cells, size) {
  const side = cells + 1, positions = new Float32Array(side * side * 3), indices = [];
  for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) positions.set([x * size, 0.3 * Math.sin(x + z), z * size], (z * side + x) * 3);
  for (let z = 0; z < cells; z++) for (let x = 0; x < cells; x++) {
    const at = z * side + x;
    indices.push(at, at + side, at + 1, at + 1, at + side, at + side + 1);
  }
  const sheet = r.createWaterSheet(new Uint32Array(indices), { positions, depths: new Float32Array(side * side).fill(1) });
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let at = 0; at < positions.length; at += 3) for (let axis = 0; axis < 3; axis++) {
    box[axis] = Math.min(box[axis], positions[at + axis]);
    box[axis + 3] = Math.max(box[axis + 3], positions[at + axis]);
  }
  gridBox.set(sheet, box);
  return { sheet, positions, indices };
}

/** P * V and the vertex, in the shader's single precision: `uProj * uView * world`. */
function viewProj32(proj, view) {
  const out = new Array(16);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum = f32(sum + f32(proj[k * 4 + row] * view[col * 4 + k]));
    out[col * 4 + row] = sum;
  }
  return out;
}
const apply32 = (m, x, y, z) => [0, 1, 2, 3].map((row) => f32(f32(f32(f32(m[row] * x) + f32(m[4 + row] * y)) + f32(m[8 + row] * z)) + m[12 + row]));

/**
 * Every texel the water shader can read for a sheet's fragments, each handed to `visit`: points across the sheet's
 * grid, lifted, heaved by the swell either way and projected as the vertex shader does; at each one's pixel the depth
 * at its own texel, and the look pushed to its farthest every way - the depth there, the colour's four texels there
 * and at the straight look.
 */
function readsOf(r, row, visit, size = FRAME) {
  const [sheet, model] = row, box = gridBox.get(sheet), view = r._view, eye = r._camPos, { wide, high } = size;
  const pv = viewProj32(r._proj, view), port = r._worldViewportPx ?? [0, 0, wide, high], heave = WU.swell;
  const texel = (v, size) => Math.min(size - 1, Math.max(0, v));
  const steps = 8;
  for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps; j++) for (let k = 0; k <= steps; k++) for (const lift of [-heave, 0, heave]) {
    const along = (lo, hi, s) => lo + ((hi - lo) * s) / steps;
    const local = [along(box[0], box[3], i), f32(along(box[1], box[4], j) + WU.lift), along(box[2], box[5], k)];
    const world = apply32(model, local[0], local[1], local[2]);
    world[1] = f32(world[1] + lift);
    const clip = apply32(pv, world[0], world[1], world[2]);
    if (clip[2] + clip[3] < 0) continue;   // clipped at the near plane
    const ndcX = clip[0] / clip[3], ndcY = clip[1] / clip[3];
    if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1) continue;   // outside the viewport: no fragment
    const px = Math.floor(port[0] + (ndcX + 1) * 0.5 * port[2]), py = Math.floor(port[1] + (ndcY + 1) * 0.5 * port[3]);
    const uv0x = f32((px + 0.5) / wide), uv0y = f32((py + 0.5) / high);
    visit(px, py);
    const dist = f32(Math.hypot(f32(eye[0] - world[0]), f32(eye[1] - world[1]), f32(eye[2] - world[2])));
    const most = f32(f32(f32(0.035) * f32(4)) / f32(1 + f32(dist * f32(0.02))));
    const linear = (u, v) => {
      const tx = Math.floor(u * wide - 0.5), ty = Math.floor(v * high - 0.5);
      for (const ox of [0, 1]) for (const oy of [0, 1]) visit(texel(tx + ox, wide), texel(ty + oy, high));
    };
    linear(uv0x, uv0y);
    for (const nx of [-1.000001, 0, 1.000001]) for (const nz of [-1.000001, 0, 1.000001]) {
      const u = Math.min(Math.max(f32(uv0x + f32(nx * most)), f32(0.001)), f32(0.999));
      const v = Math.min(Math.max(f32(uv0y + f32(nz * most)), f32(0.001)), f32(0.999));
      visit(texel(Math.floor(u * wide), wide), texel(Math.floor(v * high), high));
      linear(u, v);
    }
  }
}

/** One list drawn in a fresh world frame from `eye` toward `target`: the blits it made, and every read checked. */
function drawList(rowsOf, eye, target, port = null, size = FRAME) {
  const scene = stand(size);
  const rows = rowsOf(scene.r);
  if (port) scene.r.setWorldViewport(port);
  scene.r.beginFrame(size.proj, lookAt(eye, target, UP), LIGHT, WORLD_FRAME);
  scene.calls.length = 0;
  scene.r.drawWaterSurfaces(rows, rows.length, 6.4, WU);
  const blits = scene.blits();
  const part = blits.length === 1 ? blits[0].slice(0, 4) : [0, 0, 0, 0];
  let reads = 0, outside = null;
  for (const row of rows) readsOf(scene.r, row, (x, y) => {
    reads++;
    if (!outside && !(x >= part[0] && x < part[2] && y >= part[1] && y < part[3])) outside = [x, y];
  }, size);
  return { blits, part, reads, outside, scene, rows };
}

const area = (part) => Math.max(0, part[2] - part[0]) * Math.max(0, part[3] - part[1]);

test('the copy under a list of water rows is the part of the frame the rows can read: every texel a fragment reads, pushed by the waves to their farthest, lies in it, and it is less than the frame', () => {
  const cases = [
    ['a pond ahead', (r) => [[bedSheet(r, 4, 2.5).sheet, translate(0, 0, 0), null, null]], [5, 6, -30], [5, 0, 5]],
    ['a far lake', (r) => [[bedSheet(r, 8, 6.4).sheet, translate(-25, 0, 600), null, null]], [5, 12, -30], [5, 0, 600]],
    ['two pixels apart', (r) => [[bedSheet(r, 4, 2.5).sheet, translate(-40, 0, 40), null, null], [bedSheet(r, 4, 2.5).sheet, translate(40, 0, 60), null, null]], [0, 8, -20], [0, 0, 50]],
    ['a sheet turned and stretched', (r) => [[bedSheet(r, 4, 2.5).sheet, new Float32Array([1.6, 0, -0.9, 0, 0, 1, 0, 0, 0.9, 0, 1.6, 0, 12, -1, 30, 1]), null, null]], [0, 5, -10], [10, 0, 35]],
    ['under a docked bar', (r) => [[bedSheet(r, 4, 2.5).sheet, translate(0, 0, 0), null, null]], [5, 6, -30], [5, 0, 5], { x: 0, y: 0.2, w: 1, h: 0.8 }],
    ["half out of the view", (r) => [[bedSheet(r, 4, 2.5).sheet, translate(38, 0, 0), null, null]], [5, 6, -30], [5, 0, 5]],
    ['a swell close by', (r) => [[bedSheet(r, 4, 2.5).sheet, translate(0, 0, 2), null, null]], [5, 0.5, 0], [5, 0.45, 20]],
  ];
  for (const [name, rowsOf, eye, target, port] of cases) {
    const got = drawList(rowsOf, eye, target, port);
    assert.equal(got.blits.length, 1, `${name}: one copy`);
    assert.ok(got.reads > 0, `${name}: the water is in view`);
    assert.equal(got.outside, null, `${name}: a read at ${got.outside} lies outside the copy ${got.part}`);
    assert.ok(area(got.part) < WIDE * HIGH, `${name}: the copy is the part the water reads (${got.part}), not the frame's ${WIDE} x ${HIGH}`);
  }
  // a sheet the eye stands over, cut by the near plane: the cut's own corners bound it
  const under = drawList((r) => [[bedSheet(r, 8, 6.4).sheet, translate(-25, 0, -25), null, null]], [0, 3, 0], [0, -1, 40]);
  assert.ok(under.reads > 0, 'the sheet under the eye is in view');
  assert.equal(under.outside, null, `under the eye: a read at ${under.outside} lies outside the copy ${under.part}`);
  // the farther the water, the less the waves push the look: the far lake's copy is a sliver of the frame
  const far = drawList(cases[1][1], cases[1][2], cases[1][3]);
  assert.ok(area(far.part) < (WIDE * HIGH) / 4, `the far lake's copy ${far.part}`);
});

test('at a 4K frame\'s edge, a sheet far past where the push fades: the look held inside the copy\'s edge lands farther from its fragment than the push can move it, and the copy holds it', () => {
  const wide = 3840, high = 2160;
  const size = { wide, high, proj: perspective(Math.PI / 3, wide / high, 0.5, 200000) };
  // 50000 units off, the push moves a look half a texel; the edge clamp moves a look in the last column four
  const turn = 0.79839;   // the eye turned so the sheet falls in the frame's last column
  const eye = [0, 8, -50000], target = [Math.sin(turn) * 1000, 8, -50000 + Math.cos(turn) * 1000];
  const got = drawList((r) => [[bedSheet(r, 2, 1).sheet, translate(0, 0, 0), null, null]], eye, target, null, size);
  assert.equal(got.blits.length, 1, 'one copy');
  assert.ok(got.reads > 0, 'the sheet is in view');
  assert.ok(got.part[0] > wide - 16 && got.part[2] === wide, `a sliver at the frame's right edge (${got.part})`);
  assert.equal(got.outside, null, `a read at ${got.outside} lies outside the copy ${got.part}`);
});

test('on a small frame image, a retro world\'s or a render scale\'s under one, the far lake\'s reads lie in its copy: the edge term is under a texel there, and the margin holds the colour\'s second texel and the snap', () => {
  for (const [wide, high] of [[320, 200], [640, 400]]) {
    const size = { wide, high, proj: perspective(Math.PI / 3, wide / high, 0.5, 3000) };
    const got = drawList((r) => [[bedSheet(r, 8, 6.4).sheet, translate(-25, 0, 600), null, null]], [5, 12, -30], [5, 0, 600], null, size);
    assert.equal(got.blits.length, 1, `${wide} x ${high}: one copy`);
    assert.ok(got.reads > 0, `${wide} x ${high}: the lake is in view`);
    assert.equal(got.outside, null, `${wide} x ${high}: a read at ${got.outside} lies outside the copy ${got.part}`);
    assert.ok(area(got.part) < (wide * high) / 4, `${wide} x ${high}: a part of the frame (${got.part})`);
  }
});

test('water that cannot be seen is not copied: a sheet behind the eye or beside the view adds nothing, and a list of them copies no texel', () => {
  const behind = drawList((r) => [[bedSheet(r, 4, 2.5).sheet, translate(0, 0, -80), null, null]], [5, 6, -30], [5, 0, 5]);
  assert.equal(behind.reads, 0, 'nothing of it is in view');
  assert.deepEqual(behind.blits, [], 'no texel copied');
  assert.ok(behind.scene.r._underWater, 'the copy still stands for the frame, as it did');
  const both = drawList((r) => [[bedSheet(r, 4, 2.5).sheet, translate(0, 0, 0), null, null], [bedSheet(r, 4, 2.5).sheet, translate(400, 0, 0), null, null]], [5, 6, -30], [5, 0, 5]);
  const alone = drawList((r) => [[bedSheet(r, 4, 2.5).sheet, translate(0, 0, 0), null, null]], [5, 6, -30], [5, 0, 5]);
  assert.deepEqual(both.part, alone.part, 'a sheet far beside the view widens nothing');
});

test('where the rows cannot be bounded, or the list is the one-row door, the whole frame is copied as before; the sea takes its own whole copy', () => {
  const whole = [0, 0, WIDE, HIGH, 0, 0, WIDE, HIGH, 16384 | 256, 9728];
  const one = stand();
  const { sheet } = bedSheet(one.r, 4, 2.5);
  one.r.beginFrame(PROJ, lookAt([5, 6, -30], [5, 0, 5], UP), LIGHT, WORLD_FRAME);
  one.calls.length = 0;
  one.r.drawWaterSurface(sheet, translate(0, 0, 0), null, null, 6.4, WU);
  assert.deepEqual(one.blits(), [whole], 'the town\'s and the lab\'s one surface: the whole frame');
  const bare = stand();
  bare.r.beginFrame(PROJ, lookAt([5, 6, -30], [5, 0, 5], UP), LIGHT, WORLD_FRAME);
  bare.calls.length = 0;
  bare.r.drawWaterSurfaces([[{ vao: { id: 'v' }, indexCount: 6 }, translate(0, 0, 0), null, null]], 1, 6.4, WU);
  assert.deepEqual(bare.blits(), [whole], 'a sheet with no box: the whole frame');
  const lens = stand();
  const { sheet: lensSheet } = bedSheet(lens.r, 4, 2.5);
  lens.r.beginFrame(PROJ, lookAt([5, 6, -30], [5, 0, 5], UP), LIGHT, WORLD_FRAME);
  lens.calls.length = 0;
  lens.r.drawWaterSurfaces([[lensSheet, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0.01, 0, 0, 0, 1]), null, null]], 1, 6.4, WU);
  assert.deepEqual(lens.blits(), [whole], 'a matrix that is not affine: the whole frame');
  const capped = stand(FRAME, { wide: WIDE / 2, high: HIGH / 2 });
  const { sheet: cappedSheet } = bedSheet(capped.r, 4, 2.5);
  capped.r.beginFrame(PROJ, lookAt([5, 6, -30], [5, 0, 5], UP), LIGHT, WORLD_FRAME);
  capped.calls.length = 0;
  capped.r.drawWaterSurfaces([[cappedSheet, translate(0, 0, 0), null, null]], 1, 6.4, WU);
  assert.deepEqual(capped.blits(), [whole], 'a drawing buffer under the canvas and no world rect, so the draws\' viewport is not known: the whole frame');
  const sea = stand();
  sea.r.beginFrame(PROJ, lookAt([5, 6, -30], [5, 0, 5], UP), LIGHT, WORLD_FRAME);
  sea.calls.length = 0;
  sea.r.drawSeaSurfaces([{ h: { surface: { vao: { id: 'sea' }, count: 6 } }, model: translate(0, 0, 0) }], 0, WU, [0.1, 0.2, 0.3], null);
  assert.deepEqual(sea.blits(), [whole], 'the sea: the whole frame');
});

test('a later list of the same frame that reads past the part copied takes the rest of the frame once, as it stands: the part and the rest tile the frame, and the frame block takes the copy as it was taken', () => {
  const scene = stand();
  const near = [[bedSheet(scene.r, 4, 2.5).sheet, translate(0, 0, 0), null, null]];
  const wide = [[bedSheet(scene.r, 4, 2.5).sheet, translate(-30, 0, 10), null, null]];
  scene.r.beginFrame(PROJ, lookAt([5, 6, -30], [5, 0, 5], UP), LIGHT, WORLD_FRAME);
  scene.calls.length = 0;
  scene.r.drawWaterSurfaces(near, 1, 6.4, WU);
  scene.r.drawWaterSurfaces(near, 1, 6.4, WU);
  const first = scene.blits();
  assert.equal(first.length, 1, 'the same list again: no second copy');
  scene.r.drawWaterSurfaces(wide, 1, 6.4, WU);
  scene.r.drawWaterSurfaces(wide, 1, 6.4, WU);
  const all = scene.blits();
  const cover = new Uint8Array(WIDE * HIGH);
  for (const [x0, y0, x1, y1, dx0, dy0, dx1, dy1] of all) {
    assert.deepEqual([dx0, dy0, dx1, dy1], [x0, y0, x1, y1], 'each texel to its own place');
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cover[y * WIDE + x]++;
  }
  assert.ok(all.length > 1 && all.length <= 5, `the part, then the rest in at most four bands (${all.length})`);
  assert.ok(cover.every((count) => count === 1), 'every texel of the frame copied exactly once');
  assert.equal(scene.r.captureUnderWater(), scene.r._underWater, 'a frame block\'s call: the copy as taken');
});

test('a part is the copy of one frame\'s lists: the sea after them takes a whole copy of its own, and the next frame a part of its own', () => {
  const whole = [0, 0, WIDE, HIGH, 0, 0, WIDE, HIGH, 16384 | 256, 9728];
  const scene = stand();
  const rows = [[bedSheet(scene.r, 4, 2.5).sheet, translate(0, 0, 0), null, null]];
  const view = lookAt([5, 6, -30], [5, 0, 5], UP);
  scene.r.beginFrame(PROJ, view, LIGHT, WORLD_FRAME);
  scene.calls.length = 0;
  scene.r.drawWaterSurfaces(rows, 1, 6.4, WU);
  const first = scene.blits();
  assert.equal(first.length, 1);
  assert.ok(area(first[0]) < WIDE * HIGH, `the list: a part (${first[0].slice(0, 4)})`);
  scene.calls.length = 0;
  scene.r.drawSeaSurfaces([{ h: { surface: { vao: { id: 'sea' }, count: 6 } }, model: translate(0, 0, 0) }], 0, WU, [0.1, 0.2, 0.3], null);
  assert.deepEqual(scene.blits(), [whole], 'the sea after the list: the whole frame as it stands, no band filled');
  scene.r.beginFrame(PROJ, view, LIGHT, WORLD_FRAME);
  scene.calls.length = 0;
  scene.r.drawWaterSurfaces(rows, 1, 6.4, WU);
  assert.deepEqual(scene.blits(), first, 'the next frame: a part of its own again');
});

test('with the air pass let go after a list took its part, a later list of the frame asks no copy and draws on the one that stands', () => {
  const scene = stand();
  const near = [[bedSheet(scene.r, 4, 2.5).sheet, translate(0, 0, 0), null, null]];
  const wide = [[bedSheet(scene.r, 4, 2.5).sheet, translate(-30, 0, 10), null, null]];
  scene.r.beginFrame(PROJ, lookAt([5, 6, -30], [5, 0, 5], UP), LIGHT, WORLD_FRAME);
  scene.r.drawWaterSurfaces(near, 1, 6.4, WU);
  const taken = scene.r._underWater;
  assert.ok(taken?.part, 'a part taken');
  scene.r.setAir(false);
  scene.calls.length = 0;
  scene.r.drawWaterSurfaces(wide, 1, 6.4, WU);
  scene.r.drawWaterSurface(near[0][0], near[0][1], null, null, 6.4, WU);
  assert.deepEqual(scene.blits(), [], 'no copy without the air pass');
  assert.equal(scene.r._underWater, taken, 'the copy that stands, as the frame block took it before');
});

test('the hosts hand the renderer one water list a frame on the frame image: the world\'s water pass, and the view out\'s, which runs with no air pass', () => {
  const root = fileURLToPath(new URL('../../src/', import.meta.url));
  const sites = [];
  for (const name of readdirSync(root, { recursive: true }).map(String)) {
    const path = name.split(sep).join('/');
    if (!path.endsWith('.js') || path === 'render/renderer.js') continue;
    const text = readFileSync(join(root, name), 'utf8');
    if (!text.includes('drawWaterSurfaces(')) continue;
    for (const call of text.matchAll(/\b\w+\??\.drawWaterSurfaces\([^)]*\)/g)) sites.push(`${path}: ${call[0]}`);
  }
  // a second list after other draws on one frame image would read the rest of a part as the frame then stands
  assert.deepEqual(sites.sort(), ['scenes/world.js: r.drawWaterSurfaces(_waterRows, n, 6.4, _waterU)', 'scenes/world.js: renderer.drawWaterSurfaces(_waterRows, n, 6.4, wu)'], 'a new water list: see what the copy under the water holds for it');
});

test('the air pass copies the part it is asked for, all of the frame for none, and the rest of it when asked to fill', () => {
  const scene = stand();
  scene.r.beginFrame(PROJ, lookAt([5, 6, -30], [5, 0, 5], UP), LIGHT, WORLD_FRAME);
  const air = scene.r._air;
  air.snapshotUnderWater(null);   // the copy's images made, on the first
  scene.calls.length = 0;
  const image = air.snapshotUnderWater(new Int32Array([10, 20, 110, 70]));
  assert.deepEqual(scene.blits(), [[10, 20, 110, 70, 10, 20, 110, 70, 16384 | 256, 9728]], 'the part alone');
  assert.deepEqual([...image.part], [10, 20, 110, 70]);
  const binds = scene.calls.filter((c) => c[0] === 'bindFramebuffer').map((c) => c[1]);
  assert.deepEqual(binds, [36008, 36009, 36160], 'read the frame, draw the copy, the frame bound again');
  scene.calls.length = 0;
  air.fillUnderWater();
  assert.deepEqual(scene.blits().map((b) => b.slice(0, 4)), [[0, 0, WIDE, 20], [0, 70, WIDE, HIGH], [0, 20, 10, 70], [110, 20, WIDE, 70]], 'the four bands round the part');
  assert.equal(image.part, null, 'the whole frame copied');
  scene.calls.length = 0;
  air.snapshotUnderWater(new Int32Array([0, 0, 0, 0]));
  assert.deepEqual(scene.blits(), [], 'an empty part: no texel');
  air.fillUnderWater();
  assert.deepEqual(scene.blits().map((b) => b.slice(0, 4)), [[0, 0, WIDE, HIGH]], 'filled from nothing: the frame');
  scene.calls.length = 0;
  air.snapshotUnderWater(null);
  assert.deepEqual(scene.blits().map((b) => b.slice(0, 4)), [[0, 0, WIDE, HIGH]], 'none named: the frame');
});

test('a sheet\'s box is its water quads\' own, or the cube round the ground it rides; the reach of rows that cannot be bounded is none', () => {
  const positions = new Float32Array([0, 0, 0, 10, 5, 0, 0, -2, 10, 10, 1, 10, 50, 50, 50]);
  assert.deepEqual([...waterSurface.waterSheetBox(new Uint32Array([0, 2, 1, 1, 2, 3]), positions)], [0, -2, 0, 10, 5, 10], 'the quads\' vertices, not the grid\'s last');
  assert.deepEqual([...waterSurface.waterSheetBox(new Uint32Array([0, 1, 2]), null, new Float32Array([1, 2, 3, 4]))], [-3, -2, -1, 5, 6, 7]);
  assert.equal(waterSurface.waterSheetBox(new Uint32Array(0), positions), null);
  assert.equal(waterSurface.waterSheetBox(new Uint32Array([0, 1, 2])), null);
  assert.equal(waterSurface.waterReachHolds(null, [0, 0, 5, 5]), true, 'the whole frame holds any reach');
  assert.equal(waterSurface.waterReachHolds([0, 0, 5, 5], null), false, 'a part holds no whole frame');
  assert.equal(waterSurface.waterReachHolds([0, 0, 5, 5], [6, 6, 6, 9]), true, 'an empty reach is held');
  assert.equal(waterSurface.waterReachHolds([0, 0, 5, 5], [1, 1, 6, 4]), false);
  assert.equal(waterSurface.waterReachHolds([0, 0, 5, 5], [1, 1, 5, 5]), true);
  // the shader's own bound: its text is written from the constants the reach reads
  const fs = waterSurface.waterSurfaceFs('');
  const { REFRACT_STRENGTH, REFRACT_PATH_MAX, REFRACT_FADE, REFRACT_EDGE } = waterSurface;
  assert.ok(fs.includes(`vec2 push = n.xz * (${REFRACT_STRENGTH.toFixed(4)} * clamp(path, 0.0, ${REFRACT_PATH_MAX.toFixed(1)})) / (1.0 + dist * ${REFRACT_FADE.toFixed(2)});`));
  assert.ok(fs.includes(`vec2 uv = clamp(uv0 + push, vec2(${REFRACT_EDGE.toFixed(3)}), vec2(${(1 - REFRACT_EDGE).toFixed(3)}));`));
  assert.ok(fs.includes('vec3 n = normalize(vec3(-g.x, 1.0, -g.y));'), 'the normal\'s up is one: its x and z are under one');
  assert.equal((fs.match(/textureLod\(uScene(Depth)?,/g) ?? []).length, 3, 'three reads of the copy: the depth here, the depth and the colour of the look');
});
