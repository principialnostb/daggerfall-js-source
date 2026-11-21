// The shadow pass sends what cannot change once: a program's identity view and its sampler unit for the program's
// life, a flat record's wind when it differs from the last record's, the square viewport when its size changes, and a
// flat's lantern-facing right when its origin moves (a pixel's still flats share one). The reach test makes its sphere
// only for a live lantern, and the caster pick keeps its sorted few in two scratches. Each pin holds the picture first -
// every shadow draw under the viewport its target needs, the same answers as the walk it replaces - and then the count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { EL_LANE } from '../../src/render/enhancedLighting.js';
import { SHADOW_SUN_SIZE, SHADOW_POINT_SIZE, SHADOW_POINT_CASTERS, SHADOW_CASCADES, SHADOW_TUNING, spheresTouch, pickShadowCasters, SHADOW_CASTER_MAX_RANGE, CASTER_KEEP_RATIO, CASTER_KEEP_RATIO_STEADY, heldAt } from '../../src/render/shadowPass.js';
import { aabbOutside } from '../../src/render/frustum.js';

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const RIGHT = new Float32Array([1, 0, 0]), UP = new Float32Array([0, 1, 0]);
const LIGHT_DIR = new Float32Array([0.45, 0.8, 0.35]);

/** A recording fake GL that also holds the state a draw is made in (test/render/perfexta.test.js's). */
function recordingGl() {
  const calls = [];
  let ids = 0;
  const consts = { TEXTURE0: 1000, DEPTH_BUFFER_BIT: 256, COLOR_BUFFER_BIT: 16384, READ_FRAMEBUFFER: 36008, DRAW_FRAMEBUFFER: 36009, FRAMEBUFFER: 36160 };
  const gl = new Proxy({}, {
    get(_, k) {
      if (k in consts) return consts[k];
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'getUniformLocation') return (_p, n) => n;
      if (k === 'getAttribLocation') return () => 0;
      if (k === 'createShader' || k === 'createProgram' || k === 'createBuffer' || k === 'createVertexArray'
        || k === 'createTexture' || k === 'createFramebuffer' || k === 'createRenderbuffer') return () => ({ id: ++ids });
      if (k === 'getParameter') return () => new Float32Array(4);
      if (typeof k === 'string' && k.toUpperCase() === k) return 1;
      return (...args) => { calls.push([k, ...args.map((a) => (ArrayBuffer.isView(a) ? a.slice() : a))]); };
    },
  });
  const canvas = { getContext: () => gl, clientWidth: 320, clientHeight: 200, width: 320, height: 200 };
  return { gl, calls, canvas };
}
function stand({ sun = false } = {}) {
  const g = recordingGl();
  const r = new Renderer(g.canvas);
  r.setLightingLane(EL_LANE);
  const sp = r.shadows;
  for (const k of ['504_1', '504_2', '182_1']) r.textures.set(k, { id: `tex-${k}` });
  if (sun) r.setLighting(new Float32Array([0.5, 0.5, 0.5]), 0.55, new Float32Array([1, 1, 1]));
  else r.setLighting(new Float32Array([0.1, 0.1, 0.1]), 0);
  const frame = (draw, lights = new Float32Array(0)) => {
    r.setPointLights(lights, new Float32Array(Math.max(3, (lights.length / 4) * 3)).fill(1));
    g.calls.length = 0;
    r.beginFrame(I, I, LIGHT_DIR, WORLD_FRAME);
    const calls = g.calls.slice();
    draw();
    r.drawScreenQuad({ id: 'ui' }, { x: 0, y: 0, w: 10, h: 10 });
    return calls;
  };
  return { r, sp, g, frame };
}
/** The calls made while `program` was in use (useProgram tracked), by name. */
const under = (calls, program, name) => {
  let cur = null, out = [];
  for (const c of calls) {
    if (c[0] === 'useProgram') cur = c[1];
    else if (cur === program && c[0] === name) out.push(c);
  }
  return out;
};
/** The shadow draws (into the sun's and the lanterns' framebuffers) with the viewport each was made under. */
function shadowDraws(calls, sp) {
  const sun = new Set(sp.sunFbos), point = new Set(sp.pointFbos);
  let fb = null, vp = null;
  const out = [];
  for (const c of calls) {
    if (c[0] === 'bindFramebuffer' && (c[1] === 36160 || c[1] === 36009)) fb = c[2];
    else if (c[0] === 'viewport') vp = [c[3], c[4]];
    else if ((c[0] === 'drawElements' || c[0] === 'drawArrays') && (sun.has(fb) || point.has(fb))) out.push({ kind: sun.has(fb) ? 'sun' : 'point', vp });
  }
  return out;
}
/** The square viewports a frame's calls set at the pass's sizes: how many, and how many repeated the size just set. */
function squareViewports(calls) {
  let last = null, repeats = 0, squares = 0;
  for (const c of calls) {
    if (c[0] !== 'viewport') continue;
    const square = c[3] === c[4] && (c[3] === SHADOW_SUN_SIZE || c[3] === SHADOW_POINT_SIZE);
    if (square) { squares++; if (last === c[3]) repeats++; }
    last = square ? c[3] : null;
  }
  return { squares, repeats };
}

test('every shadow draw is made under the viewport its target needs - the sun\'s cascades and a lantern\'s faces each in their own scene - and the pass sends the viewport only when its size changes (mutants: the tracker remembering across renders, a size compared by name)', () => {
  for (const [kind, lights] of [['sun', new Float32Array(0)], ['point', new Float32Array([0, 3, 0, 18])]]) {
    const { r, sp, frame } = stand({ sun: kind === 'sun' });
    const trees = r.createBillboardBatch(504, 1, { w: 3, h: 7 }, [[2, 0, 1], [-3, 0, 4], [6, 0, -2]]);
    trees.origin = [0, 0, 0]; trees.sway = 1;
    let drawn = 0;
    for (let f = 0; f < 6; f++) {
      const calls = frame(() => { r.setFlatWind([6, 2, 1, 1]); r.drawBillboards([trees], RIGHT, UP); }, lights);
      const draws = shadowDraws(calls, sp);
      drawn += draws.length;
      for (const d of draws) {
        assert.ok(d.vp, `${kind}: a viewport stood before the draw`);
        assert.deepEqual(d.vp, d.kind === 'sun' ? [SHADOW_SUN_SIZE, SHADOW_SUN_SIZE] : [SHADOW_POINT_SIZE, SHADOW_POINT_SIZE], `${kind} frame ${f}: a ${d.kind} draw under its own size`);
      }
      const { squares, repeats } = squareViewports(calls);
      assert.equal(repeats, 0, `${kind} frame ${f}: no viewport repeated the size just set (${repeats} of ${squares})`);
      if (f >= 2 && draws.length) assert.ok(squares <= 2, `${kind} frame ${f}: a viewport per size run, not per face or cascade (${squares})`);
    }
    assert.ok(drawn > 0, `${kind}: the pass drew the flats`);
  }
});

test('the flat program\'s identity view and sampler unit go up once in the pass\'s life, its wind once per change, and a frame replays the same draws either way (mutants: the view sent per switch, the wind compared by reference)', () => {
  const { r, sp, frame } = stand({ sun: true });
  const trees = r.createBillboardBatch(504, 1, { w: 3, h: 7 }, [[2, 0, 1], [-3, 0, 4]]);
  trees.origin = [0, 0, 0]; trees.sway = 1;
  const P = sp.programs.bb.p;
  const views = [], texes = [], winds = [], draws = [];
  for (let f = 0; f < 6; f++) {
    const calls = frame(() => { r.setFlatWind(f < 4 ? [6, 2, 1, 1] : [1, 0, 0.5, 1]); r.drawBillboards([trees], RIGHT, UP); });
    views.push(under(calls, P, 'uniformMatrix4fv').filter((c) => c[1] === 'uView').length);
    texes.push(under(calls, P, 'uniform1i').filter((c) => c[1] === 'uTex').length);
    winds.push(under(calls, P, 'uniform4fv').filter((c) => c[1] === 'uFlatWind').length);
    draws.push(shadowDraws(calls, sp).length);
  }
  assert.ok(draws[2] > 0, `the flats are replayed (${draws})`);
  assert.equal(views.reduce((a, b) => a + b, 0), 1, `the identity view once in six frames (${views})`);
  assert.equal(texes.reduce((a, b) => a + b, 0), 1, `the sampler unit once in six frames (${texes})`);
  assert.ok(winds[1] >= 1, `the first replay sends the wind (${winds})`);
  assert.equal(winds[2] + winds[3], 0, `the same wind is not sent again (${winds})`);
  assert.ok(winds[5] >= 1, `a changed wind is sent (${winds})`);
});

test('a flat\'s lantern-facing right is made and sent once per origin a face: two swaying batches in one face at one origin cost one right a replay, at two origins two (mutants: the origin compared on one axis, the card\'s right not forgotten)', () => {
  const rights = (apart) => {
    const { r, sp, frame } = stand();
    const a = r.createBillboardBatch(504, 1, { w: 3, h: 7 }, [[2, 0, 1]]);
    const b = r.createBillboardBatch(504, 2, { w: 3, h: 7 }, [[2.5, 0, 1.2]]);
    a.sway = 1; b.sway = 1;
    a.origin = [0, 0, 0]; b.origin = [apart, 0, 0];
    const P = sp.programs.bb.p;
    const lantern = new Float32Array([0, 3, 0, 18]);
    let n = 0, drawn = 0;
    for (let f = 0; f < 6; f++) {
      const calls = frame(() => { r.setFlatWind([6, 2, 1, 1]); r.drawBillboards([a, b], RIGHT, UP); }, lantern);
      if (f >= 1) { n += under(calls, P, 'uniform3fv').filter((c) => c[1] === 'uRight').length; drawn += shadowDraws(calls, sp).filter((d) => d.kind === 'point').length; }
    }
    return { n, drawn };
  };
  const same = rights(0), apart = rights(0.4);
  assert.ok(same.drawn > 0 && same.drawn === apart.drawn, `the lantern faces draw both batches alike (${same.drawn} against ${apart.drawn})`);
  assert.ok(same.n > 0, 'a right is sent');
  assert.equal(apart.n, 2 * same.n, `two origins cost twice the rights of one (${same.n} against ${apart.n})`);
});

test('reaches answers as the walk did - the sphere, every live lantern, then the sun\'s planes - over random boxes near and far, by day and by night (mutants: a lantern skipped, the sphere kept across boxes)', () => {
  const { r, sp, frame } = stand({ sun: true });
  const trees = r.createBillboardBatch(504, 1, { w: 3, h: 7 }, [[2, 0, 1]]);
  trees.origin = [0, 0, 0];
  const oracle = (box, ox, oy, oz) => {
    const pp = sp.pointParams;
    const cx = (box[0] + box[3]) * 0.5 + ox, cy = (box[1] + box[4]) * 0.5 + oy, cz = (box[2] + box[5]) * 0.5 + oz;
    const rad = Math.hypot(box[3] - box[0], box[4] - box[1], box[5] - box[2]) * 0.5;
    for (let k = 0; k < SHADOW_POINT_CASTERS; k++) {
      const far = pp[k * 4 + 3];
      if (far > 0 && spheresTouch(cx, cy, cz, rad, pp[k * 4], pp[k * 4 + 1], pp[k * 4 + 2], far)) return true;
    }
    if (sp.sunParams[3] > 0) {
      sp._ensureSunPlanes();
      for (let c = 0; c < SHADOW_CASCADES.length; c++) if (!aabbOutside(sp._sunPlanes[c], box, ox, oy, oz)) return true;
    }
    return false;
  };
  let seed = 3;
  const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) / 16777216; };
  for (const lights of [new Float32Array(0), new Float32Array([0, 3, 0, 18, 40, 2, -10, 12])]) {
    for (let f = 0; f < 3; f++) frame(() => r.drawBillboards([trees], RIGHT, UP), lights);
    let reached = 0;
    for (let n = 0; n < 400; n++) {
      const spread = n % 2 ? 3000 : 200;
      const x = (rand() - 0.5) * spread, y = rand() * 20, z = (rand() - 0.5) * spread, s = 1 + rand() * 30;
      const box = [x, y, z, x + s, y + s * 0.5, z + s];
      const ox = (rand() - 0.5) * 50, oy = (rand() - 0.5) * 5, oz = (rand() - 0.5) * 50;
      const want = oracle(box, ox, oy, oz);
      assert.equal(sp.reaches(box, ox, oy, oz), want, `box ${n} with ${lights.length / 4} lanterns`);
      if (want) reached++;
    }
    assert.ok(reached > 0 && reached < 400, `both answers met (${reached} of 400)`);
  }
});

test('pickShadowCasters answers the walk it replaces to the entry - the nearest `max` lanterns in range, nearest first, a held caster at its kept ratio, a carried light skipped - over random lights (mutants: a tie broken, the full pick\'s last kept, the pair minted back)', () => {
  const oracle = (lights, eye, max, carried, held, heldN) => {
    const n = lights.length >> 2;
    const picked = [];
    for (let i = 0; i < n; i++) {
      if (carried && carried[i]) continue;
      const dx = lights[i * 4] - eye[0], dy = lights[i * 4 + 1] - eye[1], dz = lights[i * 4 + 2] - eye[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) * (held && heldAt(held, heldN, lights, i) ? (SHADOW_TUNING.steady ? CASTER_KEEP_RATIO_STEADY : CASTER_KEEP_RATIO) : 1);
      if (!(lights[i * 4 + 3] > 0) || lights[i * 4 + 3] > SHADOW_CASTER_MAX_RANGE) continue;
      if (picked.length === max && d >= picked[max - 1][1]) continue;
      let at = picked.length;
      while (at > 0 && picked[at - 1][1] > d) at--;
      picked.splice(at, 0, [i, d]);
      if (picked.length > max) picked.pop();
    }
    return picked.map((p) => p[0]);
  };
  let seed = 9;
  const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) / 16777216; };
  for (let n = 0; n < 300; n++) {
    const count = Math.floor(rand() * 70);
    const lights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      lights[i * 4] = (rand() - 0.5) * 200; lights[i * 4 + 1] = rand() * 10; lights[i * 4 + 2] = (rand() - 0.5) * 200;
      lights[i * 4 + 3] = rand() < 0.1 ? 0 : rand() < 0.1 ? SHADOW_CASTER_MAX_RANGE + 5 : 4 + Math.floor(rand() * 4) * 4;   // ranges repeat, so distances tie
    }
    if (count > 1 && rand() < 0.5) { lights[4] = lights[0]; lights[5] = lights[1]; lights[6] = lights[2]; }   // a tie at the top
    const eye = [(rand() - 0.5) * 50, 2, (rand() - 0.5) * 50];
    const max = 1 + Math.floor(rand() * 16);
    const carried = rand() < 0.5 ? Array.from({ length: count }, () => rand() < 0.1) : null;
    const heldN = Math.floor(rand() * 4);
    const held = new Float32Array(16 * 4);
    for (let h = 0; h < heldN; h++) { const i = Math.floor(rand() * Math.max(1, count)); held[h * 4] = lights[i * 4]; held[h * 4 + 1] = lights[i * 4 + 1]; held[h * 4 + 2] = lights[i * 4 + 2]; }
    assert.deepEqual(pickShadowCasters(lights, eye, max, carried, held, heldN), oracle(lights, eye, max, carried, held, heldN), `pick ${n}`);
  }
  assert.deepEqual(pickShadowCasters(new Float32Array([0, 0, 0, 10]), [0, 0, 0], 0), [], 'no slots: no casters');
});

test('an unbounded rig follows the uploaded pose at shadow replay, including a change after recording', () => {
  const {sp} = stand({sun:true});
  const mesh = {posedShadowBox:{minX:0,minY:0,minZ:0,maxX:1,maxY:1,maxZ:1}};
  sp.recordCharacter(mesh,I);
  const r = sp.records[0];
  mesh.posedShadowBox = {minX:-4,minY:2,minZ:2,maxX:2,maxY:8,maxZ:4};
  sp._refreshPosedCasters();
  assert.equal(r.bounded,true);
  assert.deepEqual([...r.sphere.slice(0,3)],[-1,5,3]);
  assert.ok(r.sphere[3] >= Math.sqrt(19) && r.sphere[3] < 4.36);
  mesh.posedShadowBox = null;
  sp._refreshPosedCasters();
  assert.equal(r.bounded,false);
  sp.discard();
  assert.equal(sp._posedCasters.length,0);
});

test('a caster with an explicit world sphere keeps the caller’s bound', () => {
  const {sp} = stand({sun:true});
  sp.recordCharacter({posedShadowBox:{}}, I, [2,3,4,5]);
  sp._refreshPosedCasters();
  assert.deepEqual([...sp.records[0].sphere], [2,3,4,5]);
});
