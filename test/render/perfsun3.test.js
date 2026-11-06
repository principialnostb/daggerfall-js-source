// PERF-SUN3 (2026-10-09, Mac: "I want to continue working to increase performance across the board, especially for
// online"): THE SUN'S CASCADES SHARE ONE WALK (bible/07-Rendering/Performance-Online.md PERF-SUN3; PERF-NEXT item 1).
// Every cascade's replay walked every record and every flat of the frame; now one walk finds the far cascade's, and each
// nearer cascade's list is found from the next one out's (shadowPass.js _sunCandidates). These pins hold the cascades to
// the draws they made - every draw of every frame, its program, VAO, framebuffer, count and offset, in order, against
// the same pass with the walk off (SHADOW_TUNING.sunPrepass) - over random towns spread from the eye to past the far
// cascade, under four suns, steady and cadenced, about the camera and about a travel view's focus; hold the nesting the
// walk stands on (a sphere a cascade takes, the next one out takes, out to 120 km, at the travel view's scale too); and
// hold the saving by count. Never on a clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { EL_LANE } from '../../src/render/enhancedLighting.js';
import { SHADOW_TUNING, SHADOW_CASCADES, sunCascadeMatrices, sunAnchorFor, sunTexelWorld, SHADOW_SUN_DEPTH, SHADOW_SUN_SIZE } from '../../src/render/shadowPass.js';
import { spherePlanes, sphereInPlanes, recordVisible, batchVisible, boundsOf } from '../../src/render/bounds.js';

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const RIGHT = new Float32Array([1, 0, 0]), UP = new Float32Array([0, 1, 0]);
/** Four suns: the afternoon's, a low evening's, noon's, and one along z (sunCascadeMatrices' basis takes Y for up). */
const SUNS = [[0.45, 0.8, 0.35], [0.95, 0.15, 0.1], [0.05, 0.99, 0.05], [0.2, 0.3, 0.93]].map((d) => new Float32Array(d));
const LAST = SHADOW_CASCADES.length - 1;
/** AUDIT PERF-ON4 (sun lens, 3): the tuning as shipped, read before any pin sets it - every frame below puts it back. */
const SHIPPED = { ...SHADOW_TUNING };

/** perfshadow1.test.js's recording GL: every draw with the program, VAO and framebuffer it was made in. */
function recordingGl() {
  const draws = [];
  let ids = 0, prog = null, vao = null, fb = null;
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
      return (...args) => {
        if (k === 'useProgram') prog = args[0];
        else if (k === 'bindVertexArray') vao = args[0];
        else if (k === 'bindFramebuffer' && (args[0] === 36160 || args[0] === 36009)) fb = args[1];
        else if (k === 'drawElements' || k === 'drawArrays') draws.push([k, prog?.id, vao?.id, fb?.id, args[1], args[2], args[3]]);
      };
    },
  });
  return { draws, canvas: { getContext: () => gl, clientWidth: 320, clientHeight: 200, width: 320, height: 200 } };
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A view placing the camera at `e` (no turn): what the renderer reads its eye from. */
const viewAt = (e) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -e[0], -e[1], -e[2], 1]);

/**
 * A random town about the eye, built twice from one seed: woods (placed batches) and single flats in rings within each
 * cascade, across its edge and past the far one (to 2,000 units); walkers; a gib; a flat placed by a NaN; meshes with
 * sub-spheres near and far, one unbounded and one placed by a NaN; terrain near and far. `frame()` runs one frame -
 * the eye walking, under `sun`, about `focus` when one is given (the travel view: its cascades four times as wide) -
 * and answers its shadow draws and the pass's counts. `crowd` records more stand about the eye, a mesh or a flat each
 * (AUDIT PERF-ON4, sun lens 1): past the 64 a cascade's list starts with, so its growth is walked - a real town grows
 * them on its first frame, and the town above holds about seventeen records. `reach` is the near cascades' read reach
 * (SHADOW_TUNING.sunReach), off unless asked: these pins hold the walk to the sphere test alone, and the reach has its
 * own pins below.
 */
function town(seed, { sun, steady, prepass, focus = false, crowd = 0, reach = false }) {
  const rand = rng(seed);
  const g = recordingGl();
  const r = new Renderer(g.canvas);
  r.setLightingLane(EL_LANE);
  for (const k of ['504_1', '504_2', '504_3', '182_1', '300_0']) r.textures.set(k, { id: `tex-${k}` });
  r.setLighting(new Float32Array([0.5, 0.5, 0.5]), 0.55, new Float32Array([1, 1, 1]));
  const batches = [];
  const ring = () => { const R = [6, 14, 40, 60, 230, 260, 700, 2000][Math.floor(rand() * 8)] * (focus ? 4 : 1); const a = rand() * Math.PI * 2, d = R * (0.6 + rand() * 0.5); return [Math.cos(a) * d, rand() * 6 - 3, Math.sin(a) * d]; };
  const scatter = (n, half) => Array.from({ length: n }, () => [(rand() * 2 - 1) * half, rand() * 3 - 1.5, (rand() * 2 - 1) * half]);
  for (let k = 0; k < 26; k++) {   // woods, pixel-wide and small
    const b = r.createBillboardBatch(504, 1 + (k % 3), { w: 0.5 + rand() * 4, h: (rand() < 0.1 ? -1 : 1) * (0.05 + rand() * 9) }, scatter(2 + Math.floor(rand() * 90), 5 + rand() * 300));
    b.sway = rand() < 0.4 ? 0 : rand() * 1.4;
    b.origin = ring();
    batches.push(b);
  }
  const walkers = [];
  for (let k = 0; k < 18; k++) {   // single flats - some walk
    const b = r.createBillboardBatch(k % 5 === 0 ? 182 : 504, k % 5 === 0 ? 1 : 2, { w: 0.2 + rand() * 1.5, h: 0.1 + rand() * 2.4 }, [[0, 0, 0]]);
    b.origin = ring();
    if (k % 3 === 0) walkers.push(b);
    batches.push(b);
  }
  const gib = r.createBillboardBatch(504, 3, { w: 0.8, h: 1.2 }, scatter(5, 3), { dynamic: true });
  gib.origin = [3, 1, -2];
  batches.push(gib);
  const lost = r.createBillboardBatch(504, 2, { w: 1, h: 2 }, [[0, 0, 0]]);
  lost.origin = [NaN, 0, 600];   // a sphere the planes never cull, NaN on one axis and far on another: every cascade takes it, as before
  batches.push(lost);
  const meshes = [];
  for (let m = 0; m < 10; m++) {
    const subs = [];
    let at = 0;
    for (let k = 0; k < 3 + Math.floor(rand() * 10); k++) {
      const prims = 1 + Math.floor(rand() * 30), c = ring();
      subs.push({ textureArchive: 300, textureRecord: 0, startIndex: at, primitiveCount: prims, _bounds: new Float32Array([c[0], c[1], c[2], 0.05 + rand() * 6]) });
      at += prims * 3;
    }
    const c = ring();
    meshes.push({ vao: { id: `vao-m${m}` }, buffers: [], bounds: new Float32Array([c[0], 2, c[2], m % 3 === 0 ? 700 : 0.1 + rand() * 30]), subMeshes: subs });
  }
  const loose = { vao: { id: 'vao-loose' }, buffers: [], bounds: null, subMeshes: [{ textureArchive: 300, textureRecord: 0, startIndex: 0, primitiveCount: 6 }] };   // no bounds: every replay draws it
  const nanAt = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, NaN, 0, 900, 1]);   // a mesh placed by a NaN, 900 off on z: its spheres cull nothing
  const tile = (x, z, s) => r.createTerrainSurface(new Float32Array([x, 0, z, x + s, 0, z, x + s, 0, z + s, x, 0, z + s, x + s / 2, 1, z + s / 2]), new Float32Array(15), new Uint32Array([0, 1, 4, 1, 2, 4, 2, 3, 4]));
  const tiles = [tile(-3, -3, 6.4), tile(30, 20, 6.4), tile(200, -150, 6.4), tile(1500, 900, 6.4)];
  const crowdMeshes = [], crowdFlats = [];
  for (let k = 0; k < crowd; k++) {
    const off = [(rand() * 2 - 1) * 5, rand() * 2, (rand() * 2 - 1) * 5];
    if (k % 2) crowdMeshes.push({ vao: { id: `vao-c${k}` }, buffers: [], off, bounds: new Float32Array(4), subMeshes: [{ textureArchive: 300, textureRecord: 0, startIndex: 0, primitiveCount: 2, _bounds: new Float32Array(4) }] });
    else { const b = r.createBillboardBatch(504, 1 + (k % 3), { w: 0.4, h: 0.5 + rand() * 2 }, [[0, 0, 0]]); b.off = off; crowdFlats.push(b); }
  }
  const wind = [9 * (rand() * 2 - 1), 9 * (rand() * 2 - 1), 3.7, 1];
  let t = 0;
  const frame = () => {
    SHADOW_TUNING.override = steady; SHADOW_TUNING.sunPrepass = prepass; SHADOW_TUNING.sunReach = reach;
    try {
      t++;
      for (const w of walkers) { w.origin = [w.origin[0] + Math.sin(t + w.size.w) * 0.7, w.origin[1], w.origin[2] + Math.cos(t * 0.7) * 0.7]; }
      gib.origin = [3 + t * 0.3, 1, -2];
      const eye = [t * 7.3, 1.6, -t * 4.1];   // walking: the anchor moves on as the eye leaves its hold
      if (focus) r.setFocus([eye[0] + 20, eye[1], eye[2] - 10], true);
      for (const m of crowdMeshes) { const c = [eye[0] + m.off[0], m.off[1], eye[2] + m.off[2], 0.6]; m.bounds.set(c); m.subMeshes[0]._bounds.set(c); }
      for (const b of crowdFlats) b.origin = [eye[0] + b.off[0], b.off[1], eye[2] + b.off[2]];
      g.draws.length = 0;
      r.beginFrame(I, viewAt(eye), sun, WORLD_FRAME);
      const shadow = g.draws.slice();
      const st = { ...r.shadows.stats };
      r.setFlatWind(wind);
      for (const m of meshes) r.drawMesh(m, I, null);
      r.drawMesh(loose, I, null); r.drawMesh(meshes[1], nanAt, null);
      for (const s of tiles) r.drawTerrain(s, I, {}, {}, 6.4);
      r.drawBillboards(batches, RIGHT, UP);
      for (const m of crowdMeshes) r.drawMesh(m, I, null);
      for (const b of crowdFlats) r.drawBillboards([b], RIGHT, UP);
      r.drawScreenQuad({ id: 'ui' }, { x: 0, y: 0, w: 10, h: 10 });
      return { shadow, st };
    } finally { SHADOW_TUNING.override = SHIPPED.override; SHADOW_TUNING.sunPrepass = SHIPPED.sunPrepass; SHADOW_TUNING.sunReach = SHIPPED.sunReach; }
  };
  return { r, frame, batches };
}

test('PERF-SUN3: the sun\'s cascades draw EXACTLY what they drew - every draw of every frame (program, VAO, framebuffer, count, offset), its order included, over random towns spread from the eye to past the far cascade (woods, single flats, walkers, a gib, a flat placed by a NaN, meshes with sub-spheres near and far, an unbounded mesh, one placed by a NaN, terrain), under four suns, steady and cadenced, about the camera and about a travel view\'s focus, the eye walking - against the same pass with the walk off (mutants: the far cascade\'s list found by the near planes; a nearer list found by the nearest planes; an unbounded record left out; a record\'s flats cut at its first one out; a cascade walking another one\'s list, or the far one the next one in\'s; the switch ignored; discard leaving the lists full; AUDIT PERF-ON4: a grown list losing what it held, a list that never grows)', () => {
  let compared = 0, sunDraws = 0, grown = 0;
  for (const seed of [31, 32, 33]) {
    for (const sun of SUNS) {
      for (const steady of [true, false]) {
        for (const focus of [false, true]) {
          const crowd = seed === 31 ? 0 : 70;   // two towns of three with every cascade's list past its first 64
          const a = town(seed, { sun, steady, prepass: true, focus, crowd }), b = town(seed, { sun, steady, prepass: false, focus, crowd });
          for (let f = 0; f < 5; f++) {
            const x = a.frame(), y = b.frame();
            const at = `seed ${seed}, sun [${[...sun]}], ${steady ? 'steady' : 'cadenced'}, ${focus ? 'focus' : 'camera'}, frame ${f}`;
            assert.deepEqual(x.shadow, y.shadow, `${at}: the same draws in the same order`);
            const keep = (s) => { const { culled, ...rest } = s; return rest; };   // `culled` counts the replays' own culls - the walk's are never asked
            assert.deepEqual(keep(x.st), keep(y.st), `${at}: the same cascades and draws counted`);
            compared += x.shadow.length; sunDraws += x.st.sunDraws;
            // AUDIT 637 B4's law for the cascades' lists: the frame's passes over, discard() has emptied them - none holds a batch past it
            assert.ok(a.r.shadows._sunCands.every((c) => c.n === 0 && c.bb.every((l) => !l || l.every((b) => b == null))), `${at}: no list holds a flat past the frame`);
          }
          if (crowd) { grown++; assert.ok(a.r.shadows._sunCands.every((c) => c.rec.length > 64), `every cascade's list grew past 64 (${a.r.shadows._sunCands.map((c) => c.rec.length)})`); }
        }
      }
    }
  }
  assert.ok(compared > 10000 && sunDraws > 5000, `the comparison drew something (${compared} draws, ${sunDraws} in the cascades)`);
  assert.ok(grown >= 16, `the lists grew in the crowded towns (${grown})`);
});

test('PERF-SUN3: THE CASCADES NEST - a sphere any cascade\'s float32 planes take, the next one out\'s take too: at every side of every cascade (the sphere just inside it), by the eye and thirty to a hundred and twenty kilometres out, under four suns, at the camera\'s scale and the travel view\'s; and a sphere NaN or infinite on an axis taken by a cascade is taken by the next - the premise the nearer lists are found from the next one out\'s on', () => {
  const vps = SHADOW_CASCADES.map(() => new Float32Array(16)), planes = SHADOW_CASCADES.map(() => new Float32Array(24));
  const rand = rng(7);
  let taken = 0;
  for (const eye of [[0, 2, 0], [-40, 3, 25], [3000, 40, -2500], [30000, 60, 30000], [120000, 10, -90000]]) {
    for (const sun of SUNS) {
      for (const scale of [1, 4]) {
        const anchor = [NaN, NaN, NaN];
        sunAnchorFor(eye, anchor, sun, sunTexelWorld(LAST, scale));
        sunCascadeMatrices(eye, sun, vps, anchor, scale);
        for (let c = 0; c <= LAST; c++) spherePlanes(vps[c], planes[c]);
        for (let c = 0; c < LAST; c++) {
          const P = planes[c], Q = planes[c + 1], R = SHADOW_CASCADES[c] * scale, D = SHADOW_SUN_DEPTH * scale;
          for (let n = 0; n < 400; n++) {
            const rad = [0, 0.01, 0.4, 3, 40][n % 5];
            // a point in the cascade's box (along its own planes' normals - the box's axes - about the eye), put on one of
            // its planes from inside (just taken), then a hair either way
            const u = (rand() * 2 - 1) * R, v = (rand() * 2 - 1) * R, w = (rand() * 2 - 1) * D;
            const q = [0, 1, 2].map((i) => eye[i] + u * P[i] + v * P[8 + i] + w * P[16 + i]);
            const k = n % 6, a = P[k * 4], b = P[k * 4 + 1], cc = P[k * 4 + 2], d = P[k * 4 + 3];
            const s = a * q[0] + b * q[1] + cc * q[2] + d + rad - (rand() * 2 - 1) * 1e-3;
            const p = [q[0] - s * a, q[1] - s * b, q[2] - s * cc];
            if (!sphereInPlanes(P, p[0], p[1], p[2], rad)) continue;
            taken++;
            assert.ok(sphereInPlanes(Q, p[0], p[1], p[2], rad), `cascade ${c} takes [${p}] r ${rad} (eye ${eye}, sun ${[...sun]}, scale ${scale}) and cascade ${c + 1} must`);
          }
          for (const p of [[NaN, 0, 0], [eye[0], NaN, eye[2]], [Infinity, eye[1], eye[2]], [-Infinity, Infinity, 0], [eye[0], eye[1], Infinity]]) {
            if (sphereInPlanes(P, p[0], p[1], p[2], 1)) assert.ok(sphereInPlanes(Q, p[0], p[1], p[2], 1), `cascade ${c} takes [${p}] and cascade ${c + 1} must`);
          }
        }
      }
    }
  }
  assert.ok(taken > 10000, `the cascades took spheres at their edges (${taken})`);
});

test('PERF-SUN3: a flat past the far cascade is asked by NO cascade\'s replay - a wood 2,000 units out is looked at once by the walk, where each of the three cascades looked at it before; a flat inside the near cascade is still asked by all three (mutants: the cascades walking every flat again; no list at all; AUDIT PERF-ON4: the walk shipped off)', () => {
  const run = (prepass) => {
    const { r, frame, batches } = town(41, { sun: SUNS[0], steady: true, prepass });
    const watch = (b) => {
      let reads = 0, on = false, conceal = b.conceal;
      Object.defineProperty(b, 'conceal', { get() { if (on) reads++; return conceal; }, set(v) { conceal = v; } });
      return { count: () => reads, set: (v) => { on = v; } };
    };
    const far = r.createBillboardBatch(504, 1, { w: 3, h: 7 }, Array.from({ length: 30 }, (_, i) => [i * 3, 0, (i % 7) * 4]));
    far.origin = [2000, 0, 2000];
    const near = r.createBillboardBatch(504, 2, { w: 1, h: 2 }, [[0, 0, 0]]);
    const farW = watch(far), nearW = watch(near);
    batches.push(far, near);
    const sp = r.shadows, render = sp.render.bind(sp);
    sp.render = (f) => { farW.set(true); nearW.set(true); try { return render(f); } finally { farW.set(false); nearW.set(false); } };
    let cascades = 0;
    for (let f = 0; f < 4; f++) {
      near.origin = [f * 7.3, 0.5, -f * 4.1];   // at the eye's foot as it walks
      cascades += frame().st.cascadesDrawn;
    }
    return { far: farW.count(), near: nearW.count(), cascades };
  };
  // AUDIT PERF-ON4 (sun lens, 3): the walk is what ships - the arm measured is the default, read before any pin set it
  assert.equal(SHIPPED.sunPrepass, true, 'SHADOW_TUNING.sunPrepass ships on');
  const base = run(false), now = run(SHIPPED.sunPrepass);
  assert.equal(now.cascades, base.cascades, 'the same cascades drawn');
  assert.ok(base.cascades >= 3 * 3, `the cascades were drawn (${base.cascades})`);
  assert.ok(base.far >= base.cascades - 3, `the base asked the far wood in every cascade's replay (${base.far} over ${base.cascades} cascades)`);
  assert.equal(now.far, 0, `now no cascade's replay asks it (${now.far})`);
  assert.equal(now.near, base.near, `the flat at the eye's foot is asked by every cascade still (${now.near}, the base ${base.near})`);
});

test('PERF-SUN3 (AUDIT PERF-ON4, sun lens 1-2): EACH CASCADE\'S LIST IS EXACTLY WHAT ITS OWN SPHERE TEST TAKES - every record (in the records\' order) and every flat of it that recordVisible and batchVisible take on that cascade\'s planes, asked of the whole frame, and nothing else - over random towns crowded past the 64 a list starts with, four suns, steady and cadenced, the camera\'s scale and the travel view\'s (mutants: a nearer list found by the far planes; a solid put on a list untested, far or nearer; a nearer flat put on untested; a grown list losing what it held; a list that never grows)', () => {
  let lists = 0, entries = 0;
  for (const seed of [51, 52]) {
    for (const sun of SUNS) {
      for (const steady of [true, false]) {
        for (const focus of [false, true]) {
          const { r, frame } = town(seed, { sun, steady, prepass: true, focus, crowd: 90 });
          const sp = r.shadows, walk = sp._sunCandidates.bind(sp);
          let seen = null;
          sp._sunCandidates = (vps) => {
            const out = walk(vps);
            // the oracle: the whole frame's records asked by each cascade's own planes, as its replay asks them
            const planes = new Float32Array(24);
            seen = out.map((L, c) => {
              spherePlanes(vps[c], planes);
              const want = [];
              for (let i = 0; i < sp.count; i++) {
                const rec = sp.records[i];
                if (rec.kind !== 2) { if (recordVisible(planes, rec)) want.push([i, null]); continue; }   // 2: a billboard record (shadowPass.js REC_BB)
                const bb = rec.batches.filter((b) => b && batchVisible(planes, b));
                if (bb.length) want.push([i, bb]);
              }
              const got = Array.from({ length: L.n }, (_, t) => [L.rec[t], sp.records[L.rec[t]].kind === 2 ? L.bb[t].slice(0, L.bn ? L.bn[t] : L.bb[t].length) : null]);   // a slot's flats: its array up to its count
              return { c, want, got };
            });
            return out;
          };
          for (let f = 0; f < 4; f++) {
            seen = null;
            frame();
            if (f === 0) continue;   // a frame's shadows are cast from the records the frame before drew
            assert.ok(seen, 'the walk ran');
            for (const { c, want, got } of seen) {
              const at = `seed ${seed}, sun [${[...sun]}], ${steady ? 'steady' : 'cadenced'}, ${focus ? 'focus' : 'camera'}, frame ${f}, cascade ${c}`;
              assert.equal(got.length, want.length, `${at}: as many records`);
              for (let t = 0; t < want.length; t++) {
                assert.equal(got[t][0], want[t][0], `${at}: entry ${t} the record the cascade takes`);
                if (want[t][1]) { assert.equal(got[t][1].length, want[t][1].length, `${at}: entry ${t} its flats`); assert.ok(got[t][1].every((b, u) => b === want[t][1][u]), `${at}: entry ${t} the very flats, in order`); }
              }
              lists++; entries += want.length;
            }
          }
          assert.ok(sp._sunCands.every((c) => c.rec.length > 64), 'the lists grew');
        }
      }
    }
  }
  assert.ok(lists >= 3 * 16 * 3 && entries > lists * 40, `lists compared (${lists}, ${entries} entries)`);
});

test('LISTS KEPT: a cascade\'s list of a record\'s flats keeps its array from frame to frame - its count alone goes back to none, so its store is not handed back and grown again flat by flat - and holds no flat past the frame (mutants: a slot left holding its flats at discard)', () => {
  const { r, frame } = town(61, { sun: SUNS[0], steady: true, prepass: true, crowd: 90 });
  const sp = r.shadows, walk = sp._sunCandidates.bind(sp);
  let held = [];
  sp._sunCandidates = (vps) => {
    const out = walk(vps);
    held = [];
    for (const L of out) for (let t = 0; t < L.n; t++) { const n = L.bn ? L.bn[t] : L.bb[t].length; if (n > 0) held.push([L.bb[t], n]); }
    return out;
  };
  let lists = 0, kept = 0;
  for (let f = 0; f < 5; f++) {
    frame();
    for (const [list, n] of held) {
      lists++;
      assert.ok(list.every((b) => b == null), `frame ${f}: a list holds no flat past the frame`);
      if (list.length >= n) kept++;
    }
  }
  assert.ok(lists > 100, `lists of flats were filled (${lists})`);
  assert.equal(kept, lists, `every list kept its array, as long as the flats it held (${kept} of ${lists})`);
});

// ─── the near cascades' read reach ───────────────────────────────────────────────────────────────────────────────

/** The farthest a read of a near cascade reaches across the light from the eye, in that cascade's texels: SHADOW_GLSL
 *  takes cascade 0 or 1 only within 0.9 of its radius of the eye, moves the point 1.5 texels along its unit normal, and
 *  its kernel's texels stand within two of the point on each axis. */
const READ_TEXELS = 0.9 * SHADOW_SUN_SIZE / 2 + 1.5 + 2 * Math.SQRT2;
/** Point `p` through cascade matrix `vp`, in the map's texels [x, y]. */
const texelOf = (vp, p) => [
  ((vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12]) * 0.5 + 0.5) * SHADOW_SUN_SIZE,
  ((vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13]) * 0.5 + 0.5) * SHADOW_SUN_SIZE,
];
/** How far point `p` lies from triangle a b c in the map's plane: 0 inside it or on it, and 0 when anything is NaN. */
function triangleGap(p, a, b, c) {
  const side = (u, v) => (v[0] - u[0]) * (p[1] - u[1]) - (v[1] - u[1]) * (p[0] - u[0]);
  const s1 = side(a, b), s2 = side(b, c), s3 = side(c, a);
  if (!((s1 < 0 || s2 < 0 || s3 < 0) && (s1 > 0 || s2 > 0 || s3 > 0))) return 0;
  const edge = (u, v) => {
    const dx = v[0] - u[0], dy = v[1] - u[1], l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - u[0]) * dx + (p[1] - u[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - u[0] - t * dx, p[1] - u[1] - t * dy);
  };
  return Math.min(edge(a, b), edge(b, c), edge(c, a));
}
/** The cascade box's two axes across the light (X, Y) and the light's own (L), from cascade 0's matrix about `eye`. */
function boxAxes(eye, sun) {
  const vps = SHADOW_CASCADES.map(() => new Float32Array(16)), anchor = [NaN, NaN, NaN];
  sunAnchorFor(eye, anchor, sun, sunTexelWorld(LAST, 1));
  sunCascadeMatrices(eye, sun, vps, anchor, 1);
  const axis = (i) => { const v = [vps[0][i], vps[0][4 + i], vps[0][8 + i]], l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l); };
  const l = Math.hypot(sun[0], sun[1], sun[2]);
  return { X: axis(0), Y: axis(1), L: [sun[0] / l, sun[1] / l, sun[2] / l], vps };
}
/** A box mesh about local point `c` (half-extents `e`): its eight corners, its twelve triangles, and the mesh, whose
 *  bounds and one sub-mesh's are measured from those corners as an upload measures its vertices. */
function boxMesh(id, c, e) {
  const pos = new Float32Array(24);
  for (let v = 0; v < 8; v++) {
    pos[v * 3] = c[0] + (v & 1 ? e[0] : -e[0]); pos[v * 3 + 1] = c[1] + (v & 2 ? e[1] : -e[1]); pos[v * 3 + 2] = c[2] + (v & 4 ? e[2] : -e[2]);
  }
  const tri = new Uint32Array([0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3]);
  const mesh = { vao: { id }, buffers: [], bounds: boundsOf(pos), subMeshes: [{ textureArchive: 300, textureRecord: 0, startIndex: 0, primitiveCount: 12, _bounds: boundsOf(pos, tri, 0, 36) }] };
  return { mesh, pos, tri };
}
/** A turn drawn from `rand`: a unit quaternion's matrix, by rows. */
function turn(rand) {
  const q = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1], l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  const [x, y, z, w] = q.map((v) => v / l);
  return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
}
const mul3 = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
const ID3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
/** A model matrix (column-major) of linear part `A` (by rows), standing at `p`. */
const placed = (A, p) => new Float32Array([A[0][0], A[1][0], A[2][0], 0, A[0][1], A[1][1], A[2][1], 0, A[0][2], A[1][2], A[2][2], 0, p[0], p[1], p[2], 1]);

/**
 * A town of real shapes for the read reach, built twice from one seed. Each caster stands at a place set in the
 * light's own frame about the eye of the frame that replays it (the eye walks): along the box's two axes across the
 * light, up to 1.4 times cascade 0's, cascade 1's or the far one's radius (inside a box past its radius at the
 * corners), and along the light within the box's depth. Box meshes turned, stretched and turned again (sheared);
 * terrain tiles; woods and single flats, some swaying, some hung upside down; a mesh with no bounds, one placed by a
 * NaN, a flat placed by a NaN. `shapes` keeps what each draws: a mesh's or a tile's corners and triangles, a batch's
 * placements.
 */
function realTown(seed, { sun, steady, focus = false, reach }) {
  const rand = rng(seed);
  const g = recordingGl();
  const r = new Renderer(g.canvas);
  r.setLightingLane(EL_LANE);
  for (const key of ['504_1', '504_2', '504_3', '300_0']) r.textures.set(key, { id: `tex-${key}` });
  r.setLighting(new Float32Array([0.5, 0.5, 0.5]), 0.55, new Float32Array([1, 1, 1]));
  const { X, Y, L } = boxAxes([0, 0, 0], sun);
  const K = focus ? 4 : 1;
  const spot = () => { const S = [12, 12, 48, 48, 240][Math.floor(rand() * 5)] * K; return [(rand() * 2 - 1) * 1.4 * S, (rand() * 2 - 1) * 1.4 * S, (rand() * 2 - 1) * 100 * K, S / 12]; };
  const shapes = new Map(), meshes = [], tiles = [], flats = [], groups = [[], [], []];
  for (let m = 0; m < 24; m++) {
    const off = spot(), S = off[3];
    const box = boxMesh(`vao-real${m}`, [(rand() * 2 - 1) * S, (rand() * 2 - 1) * S, (rand() * 2 - 1) * S], [0.05 + rand() * 2 * S, 0.05 + rand() * 2 * S, 0.05 + rand() * 2 * S]);
    const A = mul3(mul3(turn(rand), [[0.3 + rand() * 2.2, 0, 0], [0, 0.3 + rand() * 2.2, 0], [0, 0, 0.3 + rand() * 2.2]]), turn(rand));
    shapes.set(box.mesh, box);
    meshes.push({ mesh: box.mesh, off, A, matrix: placed(A, [0, 0, 0]) });
  }
  const loose = { vao: { id: 'vao-loose' }, buffers: [], bounds: null, subMeshes: [{ textureArchive: 300, textureRecord: 0, startIndex: 0, primitiveCount: 6 }] };
  const nanAt = placed(ID3, [NaN, 0, 900]);
  for (let k = 0; k < 6; k++) {
    const s = (2 + rand() * 6) * K, pos = new Float32Array([0, 0, 0, s, 0, 0, s, 0, s, 0, 0, s, s / 2, 1, s / 2]), tri = new Uint32Array([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]);
    const surface = r.createTerrainSurface(pos, new Float32Array(15), tri);
    shapes.set(surface, { pos, tri });
    tiles.push({ surface, off: spot(), matrix: placed(ID3, [0, 0, 0]) });
  }
  for (let k = 0; k < 30; k++) {
    const off = spot(), S = off[3];
    const centers = k % 3 ? Array.from({ length: 2 + Math.floor(rand() * 30) }, () => [(rand() * 2 - 1) * 0.8 * S, rand() * 2 - 1, (rand() * 2 - 1) * 0.8 * S]) : [[0, 0, 0]];
    const b = r.createBillboardBatch(504, 1 + (k % 3), { w: 0.3 + rand() * 3, h: (rand() < 0.15 ? -1 : 1) * (0.2 + rand() * 9) }, centers);
    b.sway = rand() < 0.4 ? 0 : rand() * 1.4;
    shapes.set(b, { centers });
    flats.push({ b, off });
    groups[k % 3].push(b);
  }
  const lost = r.createBillboardBatch(504, 2, { w: 1, h: 2 }, [[0, 0, 0]]);
  lost.origin = [NaN, 0, 600];
  groups[0].push(lost);
  const wind = [9 * (rand() * 2 - 1), 9 * (rand() * 2 - 1), 3.7, 1];
  const eyeAt = (t) => [t * 7.3, 1.6, -t * 4.1];
  const focusAt = (t) => { const e = eyeAt(t); return [e[0] + 20, e[1], e[2] - 10]; };
  let t = 0;
  const frame = () => {
    SHADOW_TUNING.override = steady; SHADOW_TUNING.sunPrepass = true; SHADOW_TUNING.sunReach = reach;
    try {
      t++;
      if (focus) r.setFocus(focusAt(t), true);
      g.draws.length = 0;
      r.beginFrame(I, viewAt(eyeAt(t)), sun, WORLD_FRAME);
      const shadow = g.draws.slice();
      const e = focus ? focusAt(t + 1) : eyeAt(t + 1);   // the eye the next frame replays these records about
      const at = (o) => [0, 1, 2].map((i) => e[i] + o[0] * X[i] + o[1] * Y[i] + o[2] * L[i]);
      r.setFlatWind(wind);
      for (const m of meshes) { const p = at(m.off); m.matrix[12] = p[0]; m.matrix[13] = p[1]; m.matrix[14] = p[2]; r.drawMesh(m.mesh, m.matrix, null); }
      r.drawMesh(loose, I, null); r.drawMesh(meshes[0].mesh, nanAt, null);
      for (const s of tiles) { const p = at(s.off); s.matrix[12] = p[0]; s.matrix[13] = p[1]; s.matrix[14] = p[2]; r.drawTerrain(s.surface, s.matrix, {}, {}, 6.4); }
      for (const { b, off } of flats) b.origin = at(off);
      for (const grp of groups) r.drawBillboards(grp, RIGHT, UP);
      r.drawScreenQuad({ id: 'ui' }, { x: 0, y: 0, w: 10, h: 10 });
      return shadow;
    } finally { SHADOW_TUNING.override = SHIPPED.override; SHADOW_TUNING.sunPrepass = SHIPPED.sunPrepass; SHADOW_TUNING.sunReach = SHIPPED.sunReach; }
  };
  return { r, frame, shapes };
}

/** How near what record `rec` draws comes to texel `eye`, in texels: a mesh's or a tile's every triangle through the
 *  record's matrix, or flat batch `b`'s every card - upright through its base, along the sun's `right` - less the most
 *  the wind can lean its crown (BB_VS: WIND3's push at the gust's peak). -Infinity for a shape the town did not make. */
function casterGap(rec, b, vp, eye, perUnit, right, shapes) {
  let gap = Infinity;
  if (rec.kind === 2) {
    const s = shapes.get(b);
    if (!s) return -Infinity;
    const o = b.origin, w = b.size.w / 2, h = b.size.h;
    const lean = b.sway > 0 ? Math.hypot(rec.flatWind[0], rec.flatWind[1]) * 1.3 * 0.0015 * b.sway * Math.abs(h) : 0;
    for (const q of s.centers) {
      const base = [Math.fround(q[0]) + o[0], Math.fround(q[1]) + o[1], Math.fround(q[2]) + o[2]];
      const lo = [base[0] - right[0] * w, base[1], base[2] - right[2] * w], hi = [base[0] + right[0] * w, base[1], base[2] + right[2] * w];
      const [p0, p1, p2, p3] = [lo, hi, [hi[0], hi[1] + h, hi[2]], [lo[0], lo[1] + h, lo[2]]].map((p) => texelOf(vp, p));
      gap = Math.min(gap, Math.min(triangleGap(eye, p0, p1, p2), triangleGap(eye, p0, p2, p3)) - lean * perUnit);
    }
    return gap;
  }
  const s = shapes.get(rec.kind === 0 ? rec.mesh : rec.surface);
  if (!s) return -Infinity;
  const m = rec.matrix, P = [];
  for (let v = 0; v < s.pos.length; v += 3) {
    const x = s.pos[v], y = s.pos[v + 1], z = s.pos[v + 2];
    P.push(texelOf(vp, [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]));
  }
  for (let t = 0; t < s.tri.length; t += 3) gap = Math.min(gap, triangleGap(eye, P[s.tri[t]], P[s.tri[t + 1]], P[s.tri[t + 2]]));
  return gap;
}

test('SUN-REACH: THE NEAR CASCADES LEAVE OUT ONLY WHAT NO READ CAN SEE - over random towns of real shapes (box meshes turned, stretched and sheared; terrain; woods and single flats, swaying and hung upside down; a mesh with no bounds, one and a flat placed by a NaN) set across each cascade\'s box and its corners about the eye that replays them, under four suns, steady and cadenced, about the camera and a travel view\'s focus: each near cascade\'s list is its sphere test\'s less some casters, and every triangle each of those draws lies past every texel a read of that cascade takes; the far cascade lists and draws all its box takes, exactly; the near ones\' draws are the ones they drew, in order, less some (mutants: the far cascade cut by a reach; a reach narrower than the reads; a caster placed by a NaN left out)', () => {
  assert.equal(SHIPPED.sunReach, true, 'SHADOW_TUNING.sunReach ships on');
  let lost = 0, frames = 0;
  const near = [0, 0];
  for (const seed of [71, 72]) {
    for (const sun of SUNS) {
      for (const steady of [true, false]) {
        for (const focus of [false, true]) {
          const a = realTown(seed, { sun, steady, focus, reach: true }), b = realTown(seed, { sun, steady, focus, reach: false });
          const sp = a.r.shadows, walk = sp._sunCandidates.bind(sp), render = sp.render.bind(sp);
          let f = null, at = '';
          sp.render = (fr) => { f = fr; return render(fr); };
          sp._sunCandidates = (vps) => {
            const out = walk(vps);
            const k = f.cascadeScale > 1 ? f.cascadeScale : 1, ld = f.lightDir, rl = Math.hypot(ld[2], ld[0]) || 1, right = [ld[2] / rl, 0, -ld[0] / rl];
            const planes = new Float32Array(24);
            for (let c = 0; c <= LAST; c++) {
              spherePlanes(vps[c], planes);
              const want = [];
              for (let i = 0; i < sp.count; i++) {
                const rec = sp.records[i];
                if (rec.kind !== 2) { if (recordVisible(planes, rec)) want.push([i, null]); continue; }
                const bb = rec.batches.filter((x) => x && batchVisible(planes, x));
                if (bb.length) want.push([i, bb]);
              }
              const L = out[c];
              const got = Array.from({ length: L.n }, (_, t) => [L.rec[t], sp.records[L.rec[t]].kind === 2 ? L.bb[t].slice(0, L.bn ? L.bn[t] : L.bb[t].length) : null]);
              const left = [];   // what the sphere test takes and the list leaves out: [record, flat or null]
              let p = 0;
              for (const [i, bb] of want) {
                if (p < got.length && got[p][0] === i) {
                  if (bb) {
                    let q = 0;
                    for (const x of bb) { if (q < got[p][1].length && got[p][1][q] === x) q++; else left.push([i, x]); }
                    assert.equal(q, got[p][1].length, `${at}, cascade ${c}: record ${i}'s flats are the sphere test's, in order`);
                  }
                  p++;
                } else if (bb) for (const x of bb) left.push([i, x]);
                else left.push([i, null]);
              }
              assert.equal(p, got.length, `${at}, cascade ${c}: every record listed is one the sphere test takes, in order`);
              if (c === LAST) { assert.equal(left.length, 0, `${at}: the far cascade lists all its box takes`); continue; }
              const eye = texelOf(vps[c], f.eye), perUnit = SHADOW_SUN_SIZE / (2 * SHADOW_CASCADES[c] * k);
              for (const [i, x] of left) {
                const gap = casterGap(sp.records[i], x, vps[c], eye, perUnit, right, a.shapes);
                assert.ok(gap > READ_TEXELS, `${at}, cascade ${c}: record ${i}, left out, draws ${gap} texels from the eye across the light - a read takes texels to ${READ_TEXELS}`);
              }
              lost += left.length;
            }
            return out;
          };
          const fa = sp.sunFbos.map((o) => o.id), fb = b.r.shadows.sunFbos.map((o) => o.id);
          for (let n = 0; n < 4; n++) {
            at = `seed ${seed}, sun [${[...sun]}], ${steady ? 'steady' : 'cadenced'}, ${focus ? 'focus' : 'camera'}, frame ${n}`;
            const x = a.frame(), y = b.frame();
            frames++;
            for (let c = 0; c <= LAST; c++) {
              const xs = x.filter((d) => d[3] === fa[c]).map((d) => d.join()), ys = y.filter((d) => d[3] === fb[c]).map((d) => d.join());
              if (c === LAST) { assert.deepEqual(xs, ys, `${at}: the far cascade draws exactly what it drew`); continue; }
              let q = 0;
              for (const d of ys) if (q < xs.length && xs[q] === d) q++;
              assert.equal(q, xs.length, `${at}, cascade ${c}: its draws are the ones it drew, in order, less some`);
              near[0] += xs.length; near[1] += ys.length;
            }
          }
        }
      }
    }
  }
  assert.ok(frames === 2 * 4 * 2 * 2 * 4, `every town walked (${frames} frames)`);
  assert.ok(lost > 150, `the near cascades left casters out (${lost})`);
  assert.ok(near[0] < near[1] && near[1] > 1000, `and drew less (${near[0]} draws, ${near[1]} with the reach off)`);
});

test('SUN-REACH: in cascade 0\'s box but past its radius across the light, a caster is left out of cascade 0 and drawn by cascades 1 and 2 - a mesh and a flat at the box\'s corner; a mesh at cascade 1\'s corner is drawn by the far cascade alone; one inside the radius is drawn by all three; a swaying flat whose lean reaches back inside is kept, one past its lean too is left out; a mesh sheared so its corner reaches into the reads while its sphere by its longest column lies past is kept; with the reach off every one is drawn as before (mutants: the lean left out; a sheared mesh bounded by its longest column; the reach\'s off switch ignored)', () => {
  const sun = SUNS[0], E = [3, 1.6, -2];
  const { X, Y, L, vps } = boxAxes(E, sun);
  const R0 = 12 + 1e-5 * (Math.abs(E[0]) + Math.abs(E[1]) + Math.abs(E[2]) + 2 * SHADOW_SUN_DEPTH);   // cascade 0's reach with its float slack
  const d45 = (D) => [0, 1, 2].map((i) => E[i] + (D / Math.SQRT2) * (X[i] + Y[i]));   // D across the light, on the box's diagonal
  const wind = [9, 9, 3.7, 1], lean = Math.hypot(9, 9) * 1.3 * 0.0015 * 1.4 * 8, half = Math.hypot(1, 8) / 2;
  // the sheared mesh: its two columns across the light nearly one way, so its corner toward the eye reaches twice its half-width
  const Q = [0, 1, 2].map((i) => (X[i] + Y[i]) / Math.SQRT2), P = [0, 1, 2].map((i) => (X[i] - Y[i]) / Math.SQRT2);
  const v = [0, 1, 2].map((i) => Math.cos(0.1) * Q[i] + Math.sin(0.1) * P[i]);
  const shear = [[Q[0], v[0], L[0]], [Q[1], v[1], L[1]], [Q[2], v[2], L[2]]];
  const run = (reach) => {
    const g = recordingGl();
    const r = new Renderer(g.canvas);
    r.setLightingLane(EL_LANE);
    for (const key of ['504_1', '300_0']) r.textures.set(key, { id: `tex-${key}` });
    r.setLighting(new Float32Array([0.5, 0.5, 0.5]), 0.55, new Float32Array([1, 1, 1]));
    const solids = {
      corner: { s: boxMesh('vao-corner', [0, 0, 0], [0.5, 0.5, 0.5]), m: placed(ID3, d45(15.5)) },
      inside: { s: boxMesh('vao-inside', [0, 0, 0], [0.5, 0.5, 0.5]), m: placed(ID3, d45(9.9)) },
      corner1: { s: boxMesh('vao-corner1', [0, 0, 0], [0.5, 0.5, 0.5]), m: placed(ID3, d45(62)) },
      sheared: { s: boxMesh('vao-sheared', [0, 0, 0], [4, 4, 0.1]), m: placed(shear, d45(18.2)) },
    };
    const flat = (D, w, h, sway) => { const b = r.createBillboardBatch(504, 1, { w, h }, [[0, 0, 0]]); const p = d45(D); b.origin = [p[0], p[1] - h / 2, p[2]]; b.sway = sway; return b; };   // its card's centre D off
    const flats = { corner: flat(15.5, 1, 2, 0), inside: flat(9, 1, 2, 0), leanIn: flat(R0 + half + lean / 2, 1, 8, 1.4), leanOut: flat(R0 + half + lean + 0.05, 1, 8, 1.4) };
    const frame = () => {
      SHADOW_TUNING.override = true; SHADOW_TUNING.sunPrepass = true; SHADOW_TUNING.sunReach = reach;
      try {
        g.draws.length = 0;
        r.beginFrame(I, viewAt(E), sun, WORLD_FRAME);
        const shadow = g.draws.slice();
        r.setFlatWind(wind);
        for (const o of Object.values(solids)) r.drawMesh(o.s.mesh, o.m, null);
        r.drawBillboards(Object.values(flats), RIGHT, UP);
        r.drawScreenQuad({ id: 'ui' }, { x: 0, y: 0, w: 10, h: 10 });
        return shadow;
      } finally { SHADOW_TUNING.override = SHIPPED.override; SHADOW_TUNING.sunPrepass = SHIPPED.sunPrepass; SHADOW_TUNING.sunReach = SHIPPED.sunReach; }
    };
    frame();
    const shadow = frame(), fbs = r.shadows.sunFbos.map((o) => o.id);
    return {
      solid: (name, c) => shadow.some((d) => d[3] === fbs[c] && d[2] === `vao-${name}`),
      flat: (name, c) => shadow.some((d) => d[3] === fbs[c] && d[2] === flats[name].vao.id && d[6] === (flats[name]._ibOff | 0)),
      solids, flats,
    };
  };
  const on = run(true), off = run(false);
  const SOLIDS = { corner: [false, true, true], inside: [true, true, true], corner1: [false, false, true], sheared: [true, true, true] };
  const FLATS = { corner: [false, true, true], inside: [true, true, true], leanIn: [true, true, true], leanOut: [false, true, true] };
  for (let c = 0; c <= LAST; c++) {
    for (const [name, want] of Object.entries(SOLIDS)) {
      assert.equal(off.solid(name, c), name === 'corner1' ? c > 0 : true, `the reach off: the ${name} mesh in cascade ${c} as its box takes it`);
      assert.equal(on.solid(name, c), want[c], `the ${name} mesh in cascade ${c}`);
    }
    for (const [name, want] of Object.entries(FLATS)) {
      assert.equal(off.flat(name, c), true, `the reach off: the ${name} flat in cascade ${c}`);
      assert.equal(on.flat(name, c), want[c], `the ${name} flat in cascade ${c}`);
    }
  }
  // what the reach decided, against cascade 0's reads: the corner mesh left out draws nothing they take; the sheared one kept draws into them
  const eye = texelOf(vps[0], E), gapOf = (o) => casterGap({ kind: 0, mesh: o.s.mesh, matrix: o.m }, null, vps[0], eye, 0, null, new Map([[o.s.mesh, o.s]]));
  assert.ok(gapOf(on.solids.corner) > READ_TEXELS, `the corner mesh stands past every read of cascade 0 (${gapOf(on.solids.corner)} texels)`);
  assert.ok(gapOf(on.solids.sheared) < READ_TEXELS - 30, `the sheared mesh's corner stands inside cascade 0's reads (${gapOf(on.solids.sheared)} texels)`);
});

test('SUN-REACH: WHAT THE BOUND CANNOT READ IS KEPT - each caster here stands past cascade 0\'s radius by the bound the walk would take without its keep, while what it draws reaches into the reads: a mesh whose vertices were written again after its record, a flat drawn larger than the size it was born at, a flat with a scale of its own; and, 100,000 units out, a mesh past the radius but within the float slack. Each is drawn by all three cascades, as with the reach off, and its twin past what the bound keeps is left out of cascade 0 (mutants: a rebaked mesh bounded by its recorded sphere; a single flat bounded by its stored radius; a self-scaled flat cut; the float slack dropped)', () => {
  const sun = SUNS[0], rl = Math.hypot(sun[2], sun[0]), right = [sun[2] / rl, 0, -sun[0] / rl];   // the sun replay's flat basis
  /** The casters `put` makes about eye `E`, recorded one frame and replayed the next, `after` run between: the
   *  cascades that draw each in the replay, and cascade 0's matrix. */
  const run = (E, reach, put) => {
    const g = recordingGl();
    const r = new Renderer(g.canvas);
    r.setLightingLane(EL_LANE);
    for (const key of ['504_1', '300_0']) r.textures.set(key, { id: `tex-${key}` });
    r.setLighting(new Float32Array([0.5, 0.5, 0.5]), 0.55, new Float32Array([1, 1, 1]));
    const { X, Y, vps } = boxAxes(E, sun);
    const d45 = (D) => [0, 1, 2].map((i) => E[i] + (D / Math.SQRT2) * (X[i] + Y[i]));   // D across the light, on the box's diagonal
    const { solids = {}, flats = {}, after = () => {} } = put(r, d45);
    const frame = () => {
      SHADOW_TUNING.override = true; SHADOW_TUNING.sunPrepass = true; SHADOW_TUNING.sunReach = reach;
      try {
        g.draws.length = 0;
        r.beginFrame(I, viewAt(E), sun, WORLD_FRAME);
        const shadow = g.draws.slice();
        for (const o of Object.values(solids)) r.drawMesh(o.mesh, o.matrix, null);
        if (Object.keys(flats).length) r.drawBillboards(Object.values(flats), RIGHT, UP);
        r.drawScreenQuad({ id: 'ui' }, { x: 0, y: 0, w: 10, h: 10 });
        return shadow;
      } finally { SHADOW_TUNING.override = SHIPPED.override; SHADOW_TUNING.sunPrepass = SHIPPED.sunPrepass; SHADOW_TUNING.sunReach = SHIPPED.sunReach; }
    };
    frame();
    after();
    const shadow = frame(), fbs = r.shadows.sunFbos.map((o) => o.id);
    const cascades = (hit) => SHADOW_CASCADES.map((_, c) => shadow.some((d) => d[3] === fbs[c] && hit(d)));
    const drawn = {};
    for (const [name, o] of Object.entries(solids)) drawn[name] = cascades((d) => d[2] === o.mesh.vao.id);
    for (const [name, b] of Object.entries(flats)) drawn[name] = cascades((d) => d[2] === b.vao.id && d[6] === (b._ibOff | 0));
    return { drawn, vp: vps[0], solids, flats };
  };
  const box = (id, d45, D) => { const s = boxMesh(id, [0, 0, 0], [0.5, 0.5, 0.5]); s.mesh.triIndices = s.tri; return { ...s, matrix: placed(ID3, d45(D)) }; };
  /** A single flat born at size `born` and drawn at `drawn`, its card's centre D off. */
  const flat = (r, d45, D, born, drawn, opts) => {
    const b = r.createBillboardBatch(504, 1, born, [[0, 0, 0]], opts);
    b.size = drawn;
    const p = d45(D);
    b.origin = [p[0], p[1] - drawn.h / 2, p[2]];
    return b;
  };
  let moved = null;
  const near = (r, d45) => {
    // a sail baked again between its record and its replay: recorded 15.5 off, past the radius, then written 5.6 nearer
    // the eye; its twin is not baked again
    const rebaked = box('vao-rebaked', d45, 15.5), unbaked = box('vao-unbaked', d45, 15.5);
    const to = d45(9.9), from = d45(15.5);
    moved = rebaked.pos.map((v, i) => v + to[i % 3] - from[i % 3]);
    return {
      solids: { rebaked, unbaked },
      flats: {
        grown: flat(r, d45, 13.2, { w: 1, h: 1 }, { w: 5, h: 7 }),   // a mobile pool's: born one by one, drawn larger
        small: flat(r, d45, 13.2, { w: 1, h: 1 }, { w: 1, h: 1 }),
        scaled: flat(r, d45, 13.6, { w: 2, h: 2 }, { w: 2, h: 2 }, { scales: [4] }),   // its card four times the batch's size
        unscaled: flat(r, d45, 13.6, { w: 2, h: 2 }, { w: 2, h: 2 }),
      },
      after: () => r.updateMeshVertices(rebaked.mesh, moved, new Float32Array(moved.length)),
    };
  };
  const E = [3, 1.6, -2];
  const on = run(E, true, near), off = run(E, false, near);
  const WANT = { rebaked: [true, true, true], unbaked: [false, true, true], grown: [true, true, true], small: [false, true, true], scaled: [true, true, true], unscaled: [false, true, true] };
  for (const [name, want] of Object.entries(WANT)) {
    assert.deepEqual(off.drawn[name], [true, true, true], `the reach off: the ${name} caster in every cascade`);
    assert.deepEqual(on.drawn[name], want, `the ${name} caster, cascade by cascade`);
  }
  // what each keep holds: the caster it keeps draws into cascade 0's reads
  const eye = texelOf(on.vp, E);
  const meshGap = (o, pos) => casterGap({ kind: 0, mesh: o.mesh, matrix: o.matrix }, null, on.vp, eye, 0, null, new Map([[o.mesh, { pos, tri: o.tri }]]));
  const cardGap = (b, size) => { const card = { origin: b.origin, size, sway: 0 }; return casterGap({ kind: 2, flatWind: [0, 0, 0, 0] }, card, on.vp, eye, 0, right, new Map([[card, { centers: [[0, 0, 0]] }]])); };
  assert.ok(meshGap(on.solids.rebaked, on.solids.rebaked.pos) > READ_TEXELS, 'where the sail was recorded, it draws past every read');
  assert.ok(meshGap(on.solids.rebaked, moved) < READ_TEXELS - 30, `baked again, it draws into the reads (${meshGap(on.solids.rebaked, moved)} texels)`);
  assert.ok(cardGap(on.flats.grown, on.flats.grown.size) < READ_TEXELS - 30, `the grown card draws into the reads (${cardGap(on.flats.grown, on.flats.grown.size)} texels)`);
  assert.ok(cardGap(on.flats.scaled, { w: 8, h: 8 }) < READ_TEXELS - 30, `the scaled card draws into the reads (${cardGap(on.flats.scaled, { w: 8, h: 8 })} texels)`);
  // 100,000 units out the slack is two units: a mesh within it, past the radius, is kept; one past it too is left out
  const FAR = [1e5 + 3, 1.6, -1e5 - 2], rad = Math.sqrt(0.75);
  const slack = 1e-5 * (Math.abs(FAR[0]) + Math.abs(FAR[1]) + Math.abs(FAR[2]) + 2 * SHADOW_SUN_DEPTH);
  assert.ok(slack > 1.5, `the float slack out there (${slack})`);
  const far = (r, d45) => ({ solids: { inSlack: box('vao-in-slack', d45, 12 + rad + slack / 2), pastSlack: box('vao-past-slack', d45, 12 + rad + slack + 0.3) } });
  const farOn = run(FAR, true, far), farOff = run(FAR, false, far);
  for (const [name, want] of Object.entries({ inSlack: [true, true, true], pastSlack: [false, true, true] })) {
    assert.deepEqual(farOff.drawn[name], [true, true, true], `100,000 units out, the reach off: the ${name} mesh in every cascade`);
    assert.deepEqual(farOn.drawn[name], want, `100,000 units out: the ${name} mesh, cascade by cascade`);
  }
});
