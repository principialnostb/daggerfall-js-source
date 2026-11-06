// The dungeon level drawn depth first: ahead of the level's lit draw, its shadow cells in the view are drawn with the
// colour masked and the depth pushed back, and the lit draw after them is the one it was. A renderer is driven on a
// context that keeps GL's state as a driver would, beside a twin that draws the same level without asking; a small
// rasterizer replays both frames, so the picture and the depth are compared pixel by pixel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { EL_LANE } from '../../src/render/enhancedLighting.js';
import { StaticBatchBuilder, SHADOW_CELL_SIZE } from '../../src/render/staticBatch.js';
import { identity, lookAt, mirrorProjectionX, perspective } from '../../src/world/mat4.js';

const K = Object.freeze({
  DEPTH_TEST: 0x0b71, CULL_FACE: 0x0b44, BLEND: 0x0be2, POLYGON_OFFSET_FILL: 0x8037, SCISSOR_TEST: 0x0c11,
  STENCIL_TEST: 0x0b90, ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893, TRIANGLES: 4, UNSIGNED_INT: 0x1405,
  FLOAT: 0x1406, FRONT: 0x0404, BACK: 0x0405, FRONT_AND_BACK: 0x0408, CW: 0x0900, CCW: 0x0901, LESS: 0x0201,
  LEQUAL: 0x0203, TEXTURE0: 0x84c0, TEXTURE_2D: 0x0de1, DEPTH_BUFFER_BIT: 0x100, COLOR_BUFFER_BIT: 0x4000,
  VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30, FRAMEBUFFER: 0x8d40, DRAW_FRAMEBUFFER: 0x8ca9, READ_FRAMEBUFFER: 0x8ca8,
});
const COMPLETION_STATUS = 0x91b1;
const WIDTH = 48, HEIGHT = 32;
const DEPTH_ONE = 2 ** 24 - 1;

/** A GL context that keeps the state a driver keeps - the switches, the masks, the depth function, the offset, the
 *  culling, the bound program, vertex array and textures, each vertex array's element buffer and position buffer, the
 *  buffers' contents and every program's uniforms - and logs each draw with that state as it stood. */
function drivenGl({ parallel = null } = {}) {
  const st = {
    caps: new Set(), colorMask: [true, true, true, true], depthMask: true, depthFunc: K.LESS, polygonOffset: [0, 0],
    cullFace: K.BACK, frontFace: K.CCW, viewport: [0, 0, WIDTH, HEIGHT], program: null, vao: null, arrayBuffer: null,
    unit: K.TEXTURE0, textures: new Map(), vaos: new Map(), data: new Map(), uniforms: new Map(), locations: new Map(),
    events: [], misplaced: 0,
  };
  let made = 0;
  const vaoOf = (vao) => {
    let held = st.vaos.get(vao);
    if (!held) st.vaos.set(vao, (held = { elements: null, attribs: new Map() }));
    return held;
  };
  const uniformsOf = (program) => {
    let held = st.uniforms.get(program);
    if (!held) st.uniforms.set(program, (held = new Map()));
    return held;
  };
  const send = (loc, values) => {
    if (!loc) return;
    if (loc.program !== st.program) st.misplaced++;   // GL would refuse it: a uniform goes to the bound program
    uniformsOf(loc.program).set(loc.name, Float32Array.from(values));
  };
  const snapshot = (fn, call) => {
    const vao = vaoOf(st.vao);
    return {
      kind: 'draw', fn, ...call, program: st.program, vao: st.vao, elements: vao.elements, positions: vao.attribs.get(0),
      caps: [...st.caps].sort((a, b) => a - b), colorMask: [...st.colorMask], depthMask: st.depthMask,
      depthFunc: st.depthFunc, polygonOffset: [...st.polygonOffset], cullFace: st.cullFace, frontFace: st.frontFace,
      viewport: [...st.viewport], tex0: st.textures.get(`${K.TEXTURE0}:${K.TEXTURE_2D}`) ?? null,
      uniforms: new Map(uniformsOf(st.program)),
    };
  };
  const methods = {
    enable: (cap) => st.caps.add(cap),
    disable: (cap) => st.caps.delete(cap),
    colorMask: (...mask) => { st.colorMask = mask.map(Boolean); },
    depthMask: (on) => { st.depthMask = !!on; },
    depthFunc: (fn) => { st.depthFunc = fn; },
    polygonOffset: (factor, units) => { st.polygonOffset = [factor, units]; },
    cullFace: (mode) => { st.cullFace = mode; },
    frontFace: (mode) => { st.frontFace = mode; },
    viewport: (...rect) => { st.viewport = rect; },
    useProgram: (program) => { st.program = program; },
    bindVertexArray: (vao) => { st.vao = vao; },
    bindBuffer: (target, buffer) => {
      if (target === K.ELEMENT_ARRAY_BUFFER) vaoOf(st.vao).elements = buffer;
      else if (target === K.ARRAY_BUFFER) st.arrayBuffer = buffer;
    },
    bufferData: (target, data) => {
      const buffer = target === K.ELEMENT_ARRAY_BUFFER ? vaoOf(st.vao).elements : target === K.ARRAY_BUFFER ? st.arrayBuffer : null;
      if (buffer && ArrayBuffer.isView(data)) st.data.set(buffer, data.slice());
    },
    vertexAttribPointer: (index) => vaoOf(st.vao).attribs.set(index, st.arrayBuffer),
    activeTexture: (unit) => { st.unit = unit; },
    bindTexture: (target, texture) => st.textures.set(`${st.unit}:${target}`, texture),
    getUniformLocation: (program, name) => {
      let names = st.locations.get(program);
      if (!names) st.locations.set(program, (names = new Map()));
      if (!names.has(name)) names.set(name, { program, name });
      return names.get(name);
    },
    uniformBlockBinding: () => {},
    createShader: (type) => ({ kind: 'shader', type, id: ++made }),
    shaderSource: (shader, src) => { shader.src = src; },
    attachShader: (program, shader) => { (program.shaders ??= []).push(shader); },
    getShaderParameter: () => true,
    getProgramParameter: (program, name) => (name === COMPLETION_STATUS && parallel ? parallel.done(program) : true),
    getExtension: (name) => (parallel && name === 'KHR_parallel_shader_compile' ? { COMPLETION_STATUS_KHR: COMPLETION_STATUS } : null),
    getParameter: () => new Float32Array(4),
    getAttribLocation: () => 0,
    isContextLost: () => false,
    clear: (mask) => st.events.push({ kind: 'clear', mask }),
    drawElements: (mode, count, type, offset) => st.events.push(snapshot('drawElements', { mode, count, type, offset })),
    drawArrays: (mode, first, count) => st.events.push(snapshot('drawArrays', { mode, first, count })),
  };
  const sizes = { drawingBufferWidth: WIDTH, drawingBufferHeight: HEIGHT };
  return new Proxy({}, {
    get(_, key) {
      if (key === 'state') return st;
      if (typeof key !== 'string') return undefined;
      if (key in K) return K[key];
      if (key in sizes) return sizes[key];
      if (key in methods) return methods[key];
      if (/^uniformMatrix/.test(key)) return (loc, _transpose, data) => send(loc, Array.from(data));
      if (/^uniform[1-4]/.test(key)) return (loc, ...args) => send(loc, args[0] && typeof args[0] === 'object' ? Array.from(args[0]) : args);
      if (/^create/.test(key)) return () => ({ kind: key.slice(6), id: ++made });
      if (key.toUpperCase() === key) return 1;
      return () => undefined;
    },
  });
}

const IDENTITY = identity();
const PROJ = mirrorProjectionX(perspective((70 * Math.PI) / 180, WIDTH / HEIGHT, 0.1, 500));
const VIEW = lookAt([0, 1.5, 0], [0, 1.5, -1], [0, 1, 0]);
const SUN = new Float32Array([0, -1, 0]);

/** One wall of 4-unit squares facing the camera (it looks down -z), all in the picture `key`. */
function wall(builder, key, x0, x1, y0, y1, z) {
  for (let x = x0; x < x1; x += 4) {
    for (let y = y0; y < y1; y += 4) {
      builder.add({
        positions: new Float32Array([x, y, z, x + 4, y, z, x + 4, y + 4, z, x, y + 4, z]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), uvs: new Float32Array(8),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]), subMeshes: [{ textureArchive: 0, textureRecord: 0, startIndex: 0, primitiveCount: 2 }],
      }, IDENTITY, () => key);
    }
  }
}

/** A level the shape of a dungeon's: one mesh, one sub-mesh a picture, and the pictures laid far to near, so the lit
 *  draw in picture order shades the far walls first and the near ones over them. */
function level() {
  const builder = new StaticBatchBuilder({ shadowCell: SHADOW_CELL_SIZE });
  wall(builder, '0_0', -56, 56, -36, 40, -60);   // the far wall, drawn first: most of the view
  wall(builder, '1_0', -12, 28, -6, 10, -40);
  wall(builder, '2_0', -28, 4, 0, 8, -20);   // the nearest, drawn last, and past the view's left edge
  wall(builder, '0_0', 8, 16, 0, 4, -30);   // the far wall's picture, nearer than the middle one
  wall(builder, '1_0', 300, 308, 0, 4, -60);   // off to the side: out of the view
  wall(builder, '2_0', -8, 8, 0, 8, 30);   // behind the camera
  return builder.finish();
}

/** A renderer, its context and the level's mesh - asked to be drawn depth first, or not (the twin) - drawn under the
 *  texture remap `remap`. */
function rig({ ask = true, lane = null, parallel = null, remap = null } = {}) {
  const gl = drivenGl({ parallel });
  const canvas = { getContext: () => gl, clientWidth: WIDTH, clientHeight: HEIGHT, width: WIDTH, height: HEIGHT };
  const r = new Renderer(canvas);
  if (lane) r.setLightingLane(lane);
  for (const key of ['0_0', '1_0', '2_0']) r.textures.set(key, { id: `picture ${key}` });
  const model = level();
  const mesh = r.createMesh(model, ask ? { prepass: true } : {});
  return { r, gl, st: gl.state, model, mesh, remap };
}

/** One frame: its begin, `between` (the host's other work), then the level's draw under `t.remap`. Answers what the
 *  draw did. */
function frame(t, between = null, { proj = PROJ, view = VIEW } = {}) {
  t.r.beginFrame(proj, view, SUN, WORLD_FRAME);
  between?.(t);
  const from = t.st.events.length;
  t.r.drawMesh(t.mesh, IDENTITY, t.remap);
  return t.st.events.slice(from);
}

const laid = (t, events) => events.filter((e) => e.kind === 'draw' && e.vao === t.mesh.shadowVao);
const lit = (t, events) => events.filter((e) => e.kind === 'draw' && e.vao === t.mesh.vao);

/** The key a picture is kept under, so two renderers' pictures compare. */
const keyOf = (r, tex) => {
  for (const [key, held] of r.textures) if (held === tex) return key;
  return tex ? 'not kept' : null;
};

/** The lit draws as a twin can be compared with: every object named by its part, every value kept. */
function litView(t, events) {
  return lit(t, events).map((d) => ({
    program: d.program === t.r.program ? 'the mesh program' : 'another',
    elements: d.elements === t.mesh.buffers[3] ? 'the level' : 'another',
    fn: d.fn, mode: d.mode, count: d.count, type: d.type, offset: d.offset, caps: d.caps, colorMask: d.colorMask,
    depthMask: d.depthMask, depthFunc: d.depthFunc, polygonOffset: d.polygonOffset, cullFace: d.cullFace,
    frontFace: d.frontFace, viewport: d.viewport, tex0: keyOf(t.r, d.tex0),
    uniforms: Object.fromEntries([...d.uniforms].map(([name, v]) => [name, [...v]])),
  }));
}

/** The state a frame leaves behind it. */
const leftBehind = (t) => ({
  caps: [...t.st.caps].sort((a, b) => a - b), colorMask: t.st.colorMask, depthMask: t.st.depthMask,
  depthFunc: t.st.depthFunc, polygonOffset: t.st.polygonOffset, cullFace: t.st.cullFace, frontFace: t.st.frontFace,
  program: t.st.program === t.r.program ? 'the mesh program' : 'another', vao: t.st.vao === t.mesh.vao ? 'the level' : 'another',
});

const apply = (m, x, y, z, w) => [0, 1, 2, 3].map((row) => m[row] * x + m[4 + row] * y + m[8 + row] * z + m[12 + row] * w);
const times = (a, b) => {
  const out = new Float64Array(16);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
  return out;
};

/** A replay of the frame's triangle draws by GL's rules: clip, the viewport, culling by winding, the polygon offset
 *  (the slope and a 24-bit step), a 24-bit depth test, the depth and colour masks. A fragment that passes the depth test
 *  is one the fragment stage runs for, counted by the draw's part; the colour is the picture on unit 0. */
function rasterize(t, events) {
  const depth = new Float64Array(WIDTH * HEIGHT).fill(DEPTH_ONE);
  const picture = new Array(WIDTH * HEIGHT).fill('clear');
  const shaded = { lit: 0, laid: 0 };
  for (const d of events) {
    if (d.kind !== 'draw' || d.fn !== 'drawElements' || d.mode !== K.TRIANGLES) continue;
    const positions = t.st.data.get(d.positions), indices = t.st.data.get(d.elements);
    const model = d.uniforms.get('uModel'), viewProj = times(d.uniforms.get('uProj'), d.uniforms.get('uView'));
    const offsetOn = d.caps.includes(K.POLYGON_OFFSET_FILL), cullOn = d.caps.includes(K.CULL_FACE);
    const testOn = d.caps.includes(K.DEPTH_TEST), colourOn = d.colorMask.some(Boolean);
    const part = d.vao === t.mesh.shadowVao ? 'laid' : 'lit';
    const [vx, vy, vw, vh] = d.viewport;
    for (let k = d.offset / 4; k < d.offset / 4 + d.count; k += 3) {
      const corners = [];
      for (let c = 0; c < 3; c++) {
        const at = indices[k + c] * 3;
        const world = apply(model, positions[at], positions[at + 1], positions[at + 2], 1);
        const clip = apply(viewProj, world[0], world[1], world[2], world[3]);
        if (!(clip[3] > 0)) break;
        corners.push([((clip[0] / clip[3] + 1) * vw) / 2 + vx, ((clip[1] / clip[3] + 1) * vh) / 2 + vy, (clip[2] / clip[3] + 1) / 2]);
      }
      if (corners.length !== 3) continue;
      const [a, b, c] = corners;
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (area === 0) continue;
      const front = d.frontFace === K.CW ? area < 0 : area > 0;
      if (cullOn && (d.cullFace === K.FRONT_AND_BACK || (d.cullFace === K.BACK) !== front)) continue;
      let push = 0;
      if (offsetOn) {
        const slopeX = ((b[2] - a[2]) * (c[1] - a[1]) - (c[2] - a[2]) * (b[1] - a[1])) / area;
        const slopeY = ((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / area;
        push = Math.max(Math.abs(slopeX), Math.abs(slopeY)) * d.polygonOffset[0] + d.polygonOffset[1] * 2 ** -24;
      }
      const left = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), right = Math.min(WIDTH - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const low = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), high = Math.min(HEIGHT - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let py = low; py <= high; py++) {
        for (let px = left; px <= right; px++) {
          const sx = px + 0.5, sy = py + 0.5;
          const ea = (c[0] - b[0]) * (sy - b[1]) - (c[1] - b[1]) * (sx - b[0]);
          const eb = (a[0] - c[0]) * (sy - c[1]) - (a[1] - c[1]) * (sx - c[0]);
          const ec = (b[0] - a[0]) * (sy - a[1]) - (b[1] - a[1]) * (sx - a[0]);
          if (!((ea > 0 && eb > 0 && ec > 0) || (ea < 0 && eb < 0 && ec < 0))) continue;
          const z = Math.min(1, Math.max(0, (ea * a[2] + eb * b[2] + ec * c[2]) / (ea + eb + ec) + push));
          const q = Math.round(z * DEPTH_ONE), at = py * WIDTH + px;
          if (testOn && !(d.depthFunc === K.LEQUAL ? q <= depth[at] : q < depth[at])) continue;
          if (d.depthMask) depth[at] = q;
          if (colourOn) picture[at] = d.tex0?.id ?? 'no picture';
          shaded[part]++;
        }
      }
    }
  }
  return { depth, picture, shaded, covered: depth.filter((q) => q < DEPTH_ONE).length };
}

const shaderOf = (program, type) => program.shaders.find((s) => s.type === type).src;
/** One opaque texel, as an upload takes a picture. */
const pixel = () => ({ width: 1, height: 1, colors: new Uint8Array([200, 100, 50, 255]) });

test('the level drawn depth first: ahead of its lit draw, the cells in the view on the cells\' vertex array, colour masked, depth pushed back and placed by the matrices the lit program holds; the lit draws and the state left are the twin\'s, in both lanes (mutants: the mask, the offset or the matrices dropped; a state left set)', () => {
  for (const lane of [null, EL_LANE]) {
    const t = rig({ lane }), twin = rig({ ask: false, lane });
    for (let n = 0; n < 2; n++) {
      const got = frame(t), want = frame(twin);
      assert.deepEqual(litView(t, got), litView(twin, want), 'the lit draws are the twin\'s, call for call');
      assert.deepEqual(leftBehind(t), leftBehind(twin), 'and so is the state they leave');
      assert.equal(t.st.misplaced, twin.st.misplaced, 'no uniform sent to a program not bound');
      assert.ok(got.every((e) => e.kind !== 'draw' || e.vao === t.mesh.vao || e.vao === t.mesh.shadowVao), 'the level\'s draw draws the level alone');
      if (n === 0) { assert.equal(laid(t, got).length, 0, 'the first frame: no texture stamped yet, nothing laid'); continue; }
      const cells = laid(t, got);
      assert.ok(cells.length > 0, 'the second frame lays the level\'s depth');
      const firstLit = got.indexOf(lit(t, got)[0]);
      assert.ok(cells.every((d) => got.indexOf(d) < firstLit), 'all of it before the first lit draw');
      const litDraw = lit(t, got)[0];
      assert.ok(litDraw.depthMask && litDraw.depthFunc === K.LESS && litDraw.caps.includes(K.DEPTH_TEST) && !litDraw.caps.includes(K.BLEND), 'the lit draw: depth tested LESS and written, no blend');
      for (const d of cells) {
        assert.notEqual(d.program, t.r.program, 'on a program of its own');
        assert.equal(d.elements, t.mesh.buffers[4], 'the cells\' index buffer');
        assert.equal(d.positions, litDraw.positions, 'over the lit draw\'s own positions');
        assert.deepEqual(d.colorMask, [false, false, false, false], 'no colour written');
        assert.ok(d.caps.includes(K.POLYGON_OFFSET_FILL) && d.polygonOffset[0] > 0 && d.polygonOffset[1] > 0, `pushed back: ${d.polygonOffset}`);
        assert.deepEqual([d.depthMask, d.depthFunc, d.caps.includes(K.DEPTH_TEST), d.caps.includes(K.BLEND)], [true, litDraw.depthFunc, true, false], 'depth tested and written, as the lit draw is');
        assert.deepEqual([d.cullFace, d.frontFace, d.caps.includes(K.CULL_FACE)], [litDraw.cullFace, litDraw.frontFace, litDraw.caps.includes(K.CULL_FACE)], 'culled as the lit draw is');
        for (const name of ['uProj', 'uView', 'uModel']) assert.deepEqual([...d.uniforms.get(name)], [...litDraw.uniforms.get(name)], `${name} bit for bit the lit program's`);
      }
      assert.equal(t.r.stats.draws - twin.r.stats.draws, cells.length, 'each counted');
    }
  }
});

test('the level drawn depth first lays the cells in the view: whole cells, each once, every one with a corner inside the view, none of the walls far off to the side or behind, and neighbours as one draw (mutants: no cull; a cell cut; neighbours drawn apart)', () => {
  const t = rig();
  frame(t);
  const cells = laid(t, frame(t));
  const viewProj = times(PROJ, VIEW);
  const corners = (cell) => {
    const out = [];
    for (let k = cell.startIndex; k < cell.startIndex + cell.primitiveCount * 3; k++) {
      const at = t.model.shadowIndices[k] * 3;
      out.push([t.model.positions[at], t.model.positions[at + 1], t.model.positions[at + 2]]);
    }
    return out;
  };
  const inside = ([x, y, z]) => {
    const q = apply(viewProj, x, y, z, 1);
    return Math.abs(q[0]) <= q[3] && Math.abs(q[1]) <= q[3] && Math.abs(q[2]) <= q[3];
  };
  const farOff = ([x, , z]) => x > 200 || z > 0;   // the wall off to the side and the one behind the camera
  const drawn = new Set();
  for (const d of cells) for (let k = d.offset / 4; k < d.offset / 4 + d.count; k++) drawn.add(k);
  assert.equal(drawn.size, cells.reduce((sum, d) => sum + d.count, 0), 'no index laid twice');
  let seen = 0, off = 0;
  for (const cell of t.mesh.shadowCells) {
    const span = [];
    for (let k = cell.startIndex; k < cell.startIndex + cell.primitiveCount * 3; k++) span.push(drawn.has(k));
    assert.ok(span.every((x) => x) || span.every((x) => !x), 'a cell is laid whole or not at all');
    const at = corners(cell);
    if (at.some(inside)) { seen++; assert.ok(span[0], 'a cell with a corner in the view is laid'); }
    if (at.every(farOff)) { off++; assert.ok(!span[0], 'a cell far out of the view is not'); }
  }
  assert.ok(seen > 0 && off > 0, `the fixture has both: ${seen} cells in the view, ${off} far out of it`);
  for (let i = 1; i < cells.length; i++) assert.notEqual(cells[i].offset / 4, cells[i - 1].offset / 4 + cells[i - 1].count, 'neighbours are one draw');
  assert.ok(cells.length > 1, 'the walls out of the view split the cells into runs');
});

test('the level drawn depth first keeps the picture and the depth: both frames replayed give the same pixels and the same 24-bit depth, and each covered pixel is shaded once where the twin shaded up to three (mutants: the offset dropped, so the lit draw fails its own depth; the mask left off)', (ctx) => {
  for (const lane of [null, EL_LANE]) {
    const t = rig({ lane }), twin = rig({ ask: false, lane });
    frame(t); frame(twin);
    const got = rasterize(t, frame(t)), want = rasterize(twin, frame(twin));
    assert.deepEqual(got.picture, want.picture, 'the same picture, pixel for pixel');
    assert.deepEqual([...got.depth], [...want.depth], 'the same depth for every pass after');
    assert.equal(new Set(want.picture).size, 4, 'the twin\'s picture shows the three walls and the clear');
    assert.ok(want.covered > (WIDTH * HEIGHT) / 2, `the level covers most of the view (${want.covered} of ${WIDTH * HEIGHT})`);
    assert.equal(got.shaded.lit, got.covered, 'drawn depth first, each covered pixel is shaded once');
    assert.ok(want.shaded.lit > got.shaded.lit, 'the twin shades the hidden walls too');
    ctx.diagnostic(`${lane ? 'lane' : 'classic'}: lit fragments shaded ${want.shaded.lit} -> ${got.shaded.lit} over ${got.covered} covered pixels, ${got.shaded.laid} depth fragments laid`);
  }
});

test('the depth-first program is the lit program\'s own vertex stage, beside a stage with no discard that reads every output of it', () => {
  for (const lane of [null, EL_LANE]) {
    const t = rig({ lane });
    frame(t);
    const program = laid(t, frame(t))[0]?.program;
    assert.ok(program, 'laid');
    const vs = shaderOf(program, K.VERTEX_SHADER), fs = shaderOf(program, K.FRAGMENT_SHADER);
    assert.equal(vs, shaderOf(t.r.program, K.VERTEX_SHADER), 'the same source the lit program compiled');
    assert.doesNotMatch(fs, /\bdiscard\b/, 'nothing can stop the depth test running first');
    const outs = [...vs.matchAll(/^out \w+ (\w+);/gm)].map((m) => m[1]).sort();
    const ins = [...fs.matchAll(/^in \w+ (\w+);/gm)].map((m) => m[1]).sort();
    assert.deepEqual(ins, outs, 'every output of the vertex stage taken in');
    const body = fs.slice(fs.indexOf('void main()'));
    for (const name of outs) assert.match(body, new RegExp(`\\b${name}\\b`), `${name} read, so it is not linked away`);
  }
});

test('the level is not drawn depth first where its lit draw could discard, skip a picture or be placed by other matrices - unasked, the first frame, a dissolve, the automap\'s slice or mode, a cutout, glass cut to the view out, the view out and its pane, a picture let go, a remap of its own, ?prepass=off, a lane put in after the frame began, a mesh let go - and each frame draws as its twin (mutants: each check dropped)', () => {
  const own = new Map([['0_0', '0_0']]);   // a remap under which every picture stays its own
  const cases = [
    ['unasked', { ask: false }, [null]],
    ['a dissolve', {}, [(t) => t.r.setDissolve(0.5), (t) => t.r.setDissolve(0.5)], [(t) => t.r.setDissolve(1)]],
    ['the automap slice', {}, [(t) => t.r.setClipY(3), (t) => t.r.setClipY(3)], [(t) => t.r.setClipY(null)]],
    ['an automap mode', {}, [(t) => t.r.setAutomapMode(1), (t) => t.r.setAutomapMode(1)], [(t) => t.r.setAutomapMode(0)]],
    ['a cutout', {}, [(t) => t.r._markCutout(t.r.textures.get('1_0')), null]],
    ['glass cut to the view out', {}, [(t) => t.r.uploadGlassMask(2, 0, pixel()), (t) => { t.r._rw.live = true; }], [(t) => { t.r._rw.live = false; }]],
    ['the view out', {}, [(t) => { t.r._rwOutside = {}; }, (t) => { t.r._rwOutside = {}; }], [(t) => { t.r._rwOutside = null; }]],
    ['the view out\'s pane', {}, [(t) => { t.r._rwPaneOn = true; }], [(t) => { t.r._rwPaneOn = false; }]],
    ['a picture let go', {}, [(t) => t.r.evictTexture('1_0'), null], [(t) => t.r.uploadTexture(1, 0, pixel()), null]],
    // stamped under one remap and drawn under another, which sends a picture to one not kept: the lit draw skips it
    ['a remap of its own', { remap: own }, [(t) => { t.remap = new Map([['1_0', 'not kept']]); }], [(t) => { t.remap = own; }]],
    ['?prepass=off', {}, [(t) => { globalThis.location = { search: '?prepass=off' }; }], [(t) => { delete globalThis.location; }]],
    ['a lane put in after the frame began', {}, [(t) => t.r.setLightingLane(EL_LANE)], [null]],
    ['a mesh let go', {}, [(t) => t.r.destroyMesh(t.mesh)]],
  ];
  try {
    for (const [name, opts, off, back = []] of cases) {
      const t = rig(opts), twin = rig({ ...opts, ask: false });
      frame(t); frame(twin);   // stamped
      for (const step of off) {
        const got = frame(t, step), want = frame(twin, step);
        assert.equal(laid(t, got).length, 0, `${name}: nothing laid`);
        assert.deepEqual(litView(t, got), litView(twin, want), `${name}: the lit draws are the twin's`);
        assert.deepEqual(leftBehind(t), leftBehind(twin), `${name}: the state left is the twin's`);
      }
      if (!back.length) continue;
      for (const step of back) {
        const got = frame(t, step), want = frame(twin, step);
        assert.deepEqual(litView(t, got), litView(twin, want), `${name}, after: the lit draws are the twin's`);
      }
      assert.ok(laid(t, frame(t)).length > 0, `${name}: laid again once it is over`);
      frame(twin);
    }
  } finally {
    delete globalThis.location;
  }
});

test('glass that cannot be cut keeps the level drawn depth first: an interior\'s glass with no view out is drawn whole (mutant: any glass stops it)', () => {
  const t = rig(), twin = rig({ ask: false });
  for (const s of [t, twin]) { frame(s); s.r.uploadGlassMask(2, 0, pixel()); frame(s); }
  const got = frame(t), want = frame(twin);
  assert.ok(t.mesh.subMeshes.some((sm) => sm._evWin), 'a sub-mesh is glass');
  assert.ok(laid(t, got).length > 0, 'laid');
  assert.deepEqual(litView(t, got), litView(twin, want));
});

test('the depth draw is placed by what the lit program was given: host arrays changed after the frame began, and a panel frame between with a view of its own, place both draws alike, lay the cells the lit program sees and keep the picture (mutants: the matrices or the cull read from the host\'s arrays, or from the frame\'s own after a panel)', () => {
  const scratch = Float32Array.from(PROJ), scratchView = Float32Array.from(VIEW);
  const changed = (t) => { scratch[0] *= 1.5; scratch[5] *= 1.5; scratchView[12] += 3; };   // the host reuses its arrays once they are sent
  const panelView = lookAt([1, 2, 1], [0, 1.5, -1], [0, 1, 0]);
  const panel = (t) => {
    t.r.beginPanelFrame(times(PROJ, IDENTITY).map((v, i) => (i === 0 ? v * 2 : v)), panelView, SUN, { x: 0, y: 0, w: WIDTH, h: HEIGHT });
    t.r.endPanelFrame();
  };
  const reset = () => { scratch.set(PROJ); scratchView.set(VIEW); };
  const runs = (cells) => cells.map((d) => [d.offset, d.count]);
  const still = rig();
  frame(still);
  const plain = runs(laid(still, frame(still)));
  for (const [name, between, proj, view] of [['host arrays changed', changed, scratch, scratchView], ['a panel frame between', panel, PROJ, VIEW]]) {
    const t = rig(), twin = rig({ ask: false });
    reset(); frame(t, between, { proj, view });
    reset(); frame(twin, between, { proj, view });
    reset(); const got = frame(t, between, { proj, view });
    reset(); const want = frame(twin, between, { proj, view });
    const cells = laid(t, got), litDraw = lit(t, got)[0];
    assert.ok(cells.length > 0, `${name}: laid`);
    for (const uniform of ['uProj', 'uView']) assert.deepEqual([...cells[0].uniforms.get(uniform)], [...litDraw.uniforms.get(uniform)], `${name}: ${uniform} as the lit program holds it`);
    assert.deepEqual(rasterize(t, got).picture, rasterize(twin, want).picture, `${name}: the twin's picture`);
    if (between === changed) assert.deepEqual(runs(cells), plain, `${name}: the cells the frame's own matrices see, as with the arrays left alone`);
  }
});

test('a compile in flight lays nothing: the depth program is started, and drawn from the first frame the driver says it is done (mutant: a frame waits on the link)', async () => {
  const depthFs = (await import('../../src/render/depthPrepass.js').catch(() => null))?.DEPTH_FIRST_FS ?? 'none here';
  const parallel = { ready: false, done(program) { return this.ready || !program.shaders?.some((s) => s.src === depthFs); } };
  const t = rig({ parallel }), twin = rig({ ask: false, parallel });
  frame(t); frame(twin);
  const got = frame(t), want = frame(twin);
  assert.equal(laid(t, got).length, 0, 'not done: nothing laid');
  assert.deepEqual(litView(t, got), litView(twin, want), 'and the lit draws are the twin\'s');
  parallel.ready = true;
  assert.ok(laid(t, frame(t)).length > 0, 'done: laid');
});
