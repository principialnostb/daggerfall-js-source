// A town pixel's static batch keeps its triangles a second time, by grid column, and the near maps (the sun's first
// two cascades and the lamps' faces) draw only the columns they can see: each picture's sub-mesh spans the whole town,
// so a map that takes a sub-mesh draws the city. The far cascade keeps the merged run. Every map keeps the same depth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { EL_LANE } from '../../src/render/enhancedLighting.js';
import * as SB from '../../src/render/staticBatch.js'; // a namespace: on the base the columns are missing, and only their pins fail
import { spherePlanes, sphereInPlanes, subMeshVisible } from '../../src/render/bounds.js';
import { SHADOW_CASCADES } from '../../src/render/shadowPass.js';

const rd = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const LIGHT_DIR = new Float32Array([0.45, 0.8, 0.35]);
const TOWN = SB.TOWN_SHADOW_CELL ?? 32;
const FAR = SHADOW_CASCADES.length - 1;
const ALL = 0, STATIC = 1, LO = 3; // the replay filters a still record stands in (shadowPass.js REPLAY_*)
/** Six lamps [x, y, z, reach]: by the eye, by houses and between them. */
const LAMPS = new Float32Array([4, 3, -2, 12, -30, 3, 40, 14, 70, 3, -60, 10, 120, 4, 120, 16, -150, 3, -100, 12, 0, 3, -170, 14]);

/** A recording fake GL that keeps each drawElements with the program and the VAO it was made with. */
function recordingGl() {
  const draws = []; // [program, vao, count, byte offset]
  let ids = 0, program = null, vao = null;
  const consts = { TEXTURE0: 1000, DEPTH_BUFFER_BIT: 256, COLOR_BUFFER_BIT: 16384, READ_FRAMEBUFFER: 36008, DRAW_FRAMEBUFFER: 36009, FRAMEBUFFER: 36160 };
  const gl = new Proxy({}, {
    get(_, key) {
      if (key in consts) return consts[key];
      if (key === 'getProgramParameter' || key === 'getShaderParameter') return () => true;
      if (key === 'getUniformLocation') return (_program, name) => name;
      if (key === 'getAttribLocation') return () => 0;
      if (key === 'createShader' || key === 'createProgram' || key === 'createBuffer' || key === 'createVertexArray'
        || key === 'createTexture' || key === 'createFramebuffer' || key === 'createRenderbuffer') return () => ({ id: ++ids });
      if (key === 'getParameter') return () => new Float32Array(4);
      if (typeof key === 'string' && key.toUpperCase() === key) return 1;
      return (...args) => {
        if (key === 'useProgram') program = args[0];
        else if (key === 'bindVertexArray') vao = args[0];
        else if (key === 'drawElements') draws.push([program, vao, args[1], args[3]]);
      };
    },
  });
  return { draws, canvas: { getContext: () => gl, clientWidth: 320, clientHeight: 200, width: 320, height: 200 } };
}

/** The lane in the sun on a fake GL; `frame(draw, lamps)` runs one frame: the replays of the last frame's records,
 *  then this frame's draws. */
function stand() {
  const gl = recordingGl();
  const renderer = new Renderer(gl.canvas);
  renderer.setLightingLane(EL_LANE);
  for (let k = 0; k < 12; k++) renderer.textures.set(`300_${k}`, { id: `tex-${k}` });
  renderer.setLighting(new Float32Array([0.5, 0.5, 0.5]), 0.55, new Float32Array([1, 1, 1]));
  const frame = (draw, lamps) => {
    renderer.setPointLights(lamps, new Float32Array((lamps.length / 4) * 3).fill(1));
    renderer.beginFrame(I, I, LIGHT_DIR, WORLD_FRAME);
    draw();
    renderer.drawScreenQuad({ id: 'ui' }, { x: 0, y: 0, w: 10, h: 10 });
  };
  return { renderer, pass: renderer.shadows, draws: gl.draws, frame };
}

/** Every replay of `pass`: its matrix, the cascade it draws (-1: a lamp's face), whether `mesh` stood in its records
 *  for it to take (the replay's filter and the record's stillness), and its draws of the mesh program, each
 *  [vao, count, byte offset]. */
function watchReplays(pass, draws, mesh) {
  const reps = [];
  const replay = pass.replay.bind(pass);
  pass.replay = (...args) => {
    const at = draws.length;
    const record = pass.records.slice(0, pass.count).find((r) => r.mesh === mesh);
    const filter = args[6] ?? ALL;
    const takes = !!record && (filter === ALL || (filter === STATIC || filter === LO) !== record.dynamic);
    const drew = replay(...args);
    const mine = draws.slice(at).filter((d) => d[0] === pass.programs.mesh.p).map((d) => [d[1], d[2], d[3]]);
    reps.push({ vp: Float32Array.from(args[1]), cascade: pass.sunVP.indexOf(args[1]), lamp: !!args[2], takes, mesh: mine });
    return drew;
  };
  return reps;
}

/** A box of half-sides (hx, hy, hz) about (x, y, z) in createMesh's CPU shape, one sub-mesh on picture 300_`record`. */
function box(x, y, z, hx, hy, hz, record) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (let i = 0; i < 8; i++) {
    positions.push(x + (i & 1 ? hx : -hx), y + (i & 2 ? hy : -hy), z + (i & 4 ? hz : -hz));
    normals.push(0, 1, 0);
    uvs.push(0, 0);
  }
  for (const [a, b, c, d] of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) indices.push(a, b, c, a, c, d);
  return {
    positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices),
    subMeshes: [{ textureArchive: 300, textureRecord: record, startIndex: 0, primitiveCount: 12 }],
  };
}
/** A deterministic generator (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** A town on a 400-unit square about the eye: houses and their roofs on twelve pictures in turn, so each picture's
 *  sub-mesh spans the town as a real pixel's does; three houses by the eye, across x = 0, and a tower across a corner
 *  of four columns. */
function townModels() {
  const rand = rng(3), out = [];
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 12; j++) {
      const x = -200 + i * 34 + rand() * 10, z = -200 + j * 34 + rand() * 10;
      const hx = 3 + rand() * 6, hy = 2 + rand() * 4, hz = 3 + rand() * 6;
      out.push(box(x, hy, z, hx, hy, hz, (i + j) % 8), box(x, 2 * hy + 1, z, hx + 0.5, 1, hz + 0.5, 8 + ((i * 3 + j) % 4)));
    }
  }
  out.push(box(0, 2.5, -7, 5, 2.5, 3, 1), box(0, 6, -7, 5.5, 1, 3.5, 9), box(-9, 3, 4, 3, 3, 3, 2));
  out.push(box(64, 30, 64, 4, 30, 4, 5));
  return out;
}
/** `models` merged as the pixel build merges them (finishSliced), the builder asked `opts`. */
async function merge(models, opts) {
  const builder = new SB.StaticBatchBuilder(opts);
  for (const model of models) builder.add(model, I, SB.keyResolver(null));
  return builder.finishSliced(() => {});
}
/** The town lit by its lamps for three frames in the sun, every replay watched. */
async function townFrames() {
  const merged = await merge(townModels(), { shadowColumns: TOWN });
  const { renderer, pass, draws, frame } = stand();
  const mesh = renderer.createMesh(merged, { bounds: merged.bounds });
  const reps = watchReplays(pass, draws, mesh);
  for (let k = 0; k < 3; k++) frame(() => renderer.drawMesh(mesh, I, null), LAMPS);
  return { merged, mesh, reps };
}

/** The triangles a replay's draws of `vao` cover, each by its first index in the buffer that VAO reads. */
const drawnStarts = (rep, vao) => rep.mesh.filter((d) => d[0] === vao).flatMap(([, count, offset]) => Array.from({ length: count / 3 }, (_, t) => offset / 4 + t * 3));
/** The triangles of a range ({ startIndex, primitiveCount }), each by its first index. */
const rangeStarts = (range) => Array.from({ length: range.primitiveCount }, (_, t) => range.startIndex + t * 3);
const ascending = (list) => [...list].sort((a, b) => a - b);
const touches = (planes, sphere) => sphereInPlanes(planes, sphere[0], sphere[1], sphere[2], sphere[3]);
/** What the sub-mesh path draws in the volume `planes`: the visible sub-meshes' triangles, in runs that meet. */
function bySubMesh(planes, mesh) {
  const record = { bounded: true, subSpheres: Float32Array.from(mesh.subMeshes.flatMap((sub) => [...sub._bounds])) };
  const starts = [];
  let draws = 0, runEnd = -1;
  if (!touches(planes, mesh.bounds)) return { starts, draws };
  mesh.subMeshes.forEach((sub, k) => {
    if (!subMeshVisible(planes, record, k)) return;
    starts.push(...rangeStarts(sub));
    if (sub.startIndex !== runEnd) draws++;
    runEnd = sub.startIndex + sub.primitiveCount * 3;
  });
  return { starts, draws };
}

/** Vertex `vertex` of `positions` in clip space through `vp`: [x, y, z, w]. */
function clipOf(vp, positions, vertex) {
  const x = positions[vertex * 3], y = positions[vertex * 3 + 1], z = positions[vertex * 3 + 2];
  return [0, 1, 2, 3].map((row) => vp[row] * x + vp[4 + row] * y + vp[8 + row] * z + vp[12 + row]);
}
/** Is the triangle at `start` in `index` wholly outside one of the volume's six clip planes? GL's clipping then leaves
 *  none of it to write a texel, whatever the map's size. */
function outsideOnePlane(vp, positions, index, start) {
  const corners = [0, 1, 2].map((k) => clipOf(vp, positions, index[start + k]));
  const beyond = (axis, side) => corners.every((corner) => side * corner[axis] > corner[3]);
  return beyond(0, 1) || beyond(0, -1) || beyond(1, 1) || beyond(1, -1) || beyond(2, 1) || beyond(2, -1);
}
/** A clip-space polygon cut to the near plane (z >= -w), as GL clips it. */
function clipNear(polygon) {
  const out = [];
  for (let k = 0; k < polygon.length; k++) {
    const a = polygon[k], b = polygon[(k + 1) % polygon.length];
    const inA = a[2] + a[3], inB = b[2] + b[3];
    if (inA >= 0) out.push(a);
    if (inA >= 0 !== inB >= 0) out.push(a.map((value, i) => value + ((b[i] - value) * inA) / (inA - inB)));
  }
  return out;
}
/** One screen triangle's fragments: each texel whose centre it covers keeps the lesser depth; past the far plane none. */
function fill(map, size, a, b, c) {
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (!(Math.abs(area) > 0)) return;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(size - 1, Math.floor(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(size - 1, Math.floor(Math.max(a[1], b[1], c[1])));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const sx = px + 0.5, sy = py + 0.5;
      const wa = ((b[0] - sx) * (c[1] - sy) - (b[1] - sy) * (c[0] - sx)) / area;
      const wb = ((c[0] - sx) * (a[1] - sy) - (c[1] - sy) * (a[0] - sx)) / area;
      const wc = 1 - wa - wb;
      if (wa < 0 || wb < 0 || wc < 0) continue;
      const depth = wa * a[2] + wb * b[2] + wc * c[2];
      if (depth > 1) continue;
      if (depth < map[py * size + px]) map[py * size + px] = depth;
    }
  }
}
/** The depth a size-square map keeps of the triangles `starts` names in `index`: each texel the least NDC depth over
 *  the triangles covering its centre, Infinity where none does. */
function depthMap(vp, positions, index, starts, size) {
  const map = new Float64Array(size * size).fill(Infinity);
  for (const start of starts) {
    const polygon = clipNear([0, 1, 2].map((k) => clipOf(vp, positions, index[start + k])));
    if (polygon.length < 3) continue;
    const screen = polygon.map(([x, y, z, w]) => [((x / w) * 0.5 + 0.5) * size, ((y / w) * 0.5 + 0.5) * size, z / w]);
    for (let k = 1; k + 1 < screen.length; k++) fill(map, size, screen[0], screen[k], screen[k + 1]);
  }
  return map;
}

test('a town batch keeps its triangles again by grid column: the same triangles, the columns tiling the second buffer in order, each triangle in the column of its centroid and in the merge\'s order, the columns z then x and each the whole height; the straight merge makes the same; none asked, none built; the pixel build\'s merge and its re-skin ask for them (mutants: the columns never built; x before z)', async () => {
  assert.equal(typeof SB.shadowColumnSteps, 'function', 'a builder of the columns');
  const merged = await merge(townModels(), { shadowColumns: TOWN });
  assert.ok(merged.shadowIndices instanceof Uint32Array && merged.shadowCells?.length > 1, 'the town batch carries its shadow columns');
  const tris = merged.indices.length / 3;
  const order = new Map();
  for (let t = 0; t < tris; t++) order.set(`${merged.indices[t * 3]},${merged.indices[t * 3 + 1]},${merged.indices[t * 3 + 2]}`, t);
  const P = merged.positions, ix = merged.shadowIndices;
  const sum = (t, axis) => P[ix[t * 3] * 3 + axis] + P[ix[t * 3 + 1] * 3 + axis] + P[ix[t * 3 + 2] * 3 + axis];
  const columnOf = (t) => [Math.floor(sum(t, 0) / (3 * TOWN)), Math.floor(sum(t, 2) / (3 * TOWN))];
  const seen = new Set();
  let at = 0, lastRank = -Infinity, tallest = 0;
  for (const cell of merged.shadowCells) {
    assert.equal(cell.startIndex, at, 'the columns tile the buffer in order');
    assert.ok(cell.primitiveCount > 0, 'no column is empty');
    const first = cell.startIndex / 3, column = columnOf(first);
    const rank = column[1] * 10000 + column[0];
    assert.ok(rank > lastRank, 'the columns run z, then x');
    lastRank = rank;
    let previous = -1, low = Infinity, high = -Infinity;
    for (let t = first; t < first + cell.primitiveCount; t++) {
      assert.deepEqual(columnOf(t), column, 'every triangle of a column has its centroid in it');
      const was = order.get(`${ix[t * 3]},${ix[t * 3 + 1]},${ix[t * 3 + 2]}`);
      assert.ok(was !== undefined && !seen.has(was), 'a triangle of the merge, once');
      seen.add(was);
      assert.ok(was > previous, 'in the merge\'s order');
      previous = was;
      low = Math.min(low, sum(t, 1) / 3);
      high = Math.max(high, sum(t, 1) / 3);
    }
    tallest = Math.max(tallest, high - low);
    at += cell.primitiveCount * 3;
  }
  assert.equal(at, merged.indices.length, 'every index');
  assert.equal(seen.size, tris, 'every triangle');
  assert.ok(tallest > 40, `a column holds the whole height (the tower's ${tallest.toFixed(1)} units)`);
  const builder = new SB.StaticBatchBuilder({ shadowColumns: TOWN });
  for (const model of townModels()) builder.add(model, I, SB.keyResolver(null));
  const straight = builder.finish();
  assert.ok(Buffer.from(straight.shadowIndices.buffer).equals(Buffer.from(merged.shadowIndices.buffer)), 'the straight merge: the same buffer');
  assert.deepEqual(straight.shadowCells, merged.shadowCells, 'and the same columns');
  assert.equal((await merge(townModels(), {})).shadowIndices, undefined, 'none asked, none built');
  const build = rd('src/scenes/pixelBuild.js');
  assert.equal(build.split('new StaticBatchBuilder({ windows: windowKeys(renderer), shadowColumns: TOWN_SHADOW_CELL })').length - 1, 2, 'the pixel build\'s merge and its re-skin ask for the columns');
});

test('the columns\' edges: a centroid on a line is the next column\'s and one short of it this one\'s; a triangle whose centroid is not finite goes in a last cell of its own; nothing finite, or a grid past the most, builds none; each pass yields every range of triangles, and the new buffer once (mutants: the last cell dropped)', () => {
  assert.equal(typeof SB.shadowColumnSteps, 'function', 'a builder of the columns');
  const run = (positions, indices, range) => {
    const steps = SB.shadowColumnSteps(new Float32Array(positions), new Uint32Array(indices), TOWN, range);
    let yields = 0;
    for (let step = steps.next(); ; step = steps.next()) {
      if (step.done) return { ...step.value, yields };
      yields++;
    }
  };
  // a quad across x = 32 (centroids at 32.33 and 31.67), and a triangle standing on the line itself
  const quad = run([31, 0, 0, 33, 0, 0, 33, 0, 1, 31, 0, 1, 32, 0, 0, 32, 1, 0, 32, 0, 1], [0, 1, 2, 0, 2, 3, 4, 5, 6]);
  assert.deepEqual(quad.cells, [{ startIndex: 0, primitiveCount: 1 }, { startIndex: 3, primitiveCount: 2 }]);
  assert.deepEqual([...quad.indices], [0, 2, 3, 0, 1, 2, 4, 5, 6], 'the short one first; the one past and the one on the line the next column\'s');
  // a corner that is not a number: its triangle last, in a cell of its own
  const lost = run([0, 0, 0, 1, 0, 0, 0, 0, 1, NaN, 0, 0, 40, 0, 0, 41, 0, 0, 40, 0, 1], [1, 3, 2, 0, 1, 2, 4, 5, 6]);
  assert.deepEqual(lost.cells, [{ startIndex: 0, primitiveCount: 1 }, { startIndex: 3, primitiveCount: 1 }, { startIndex: 6, primitiveCount: 1 }]);
  assert.deepEqual([...lost.indices], [0, 1, 2, 4, 5, 6, 1, 3, 2]);
  assert.equal(run([NaN, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2]).cells, undefined, 'no finite centroid: none');
  assert.equal(run([], []).cells, undefined, 'nothing: none');
  assert.equal(run([0, 0, 0, 1, 0, 0, 0, 0, 1, 1e7, 0, 0, 1e7 + 1, 0, 0, 1e7, 0, 1], [0, 1, 2, 3, 4, 5]).cells, undefined, 'a grid past the most: none');
  // five triangles in ranges of two: three yields a pass, three passes, and the buffer's
  const positions = [], indices = [];
  for (let t = 0; t < 5; t++) {
    positions.push(t * 50, 0, 0, t * 50 + 1, 0, 0, t * 50, 0, 1);
    indices.push(t * 3, t * 3 + 1, t * 3 + 2);
  }
  const five = run(positions, indices, 2);
  assert.equal(five.cells.length, 5, 'five columns');
  assert.equal(five.yields, 3 * Math.ceil(5 / 2) + 1, 'a yield every range in each pass, and one for the buffer');
});

test('the columns are made in the merge\'s slices: the sliced merge breathes three times more for every range of a town\'s triangles, and once for the new buffer', async () => {
  const many = Array.from({ length: 720 }, (_, k) => box((k % 30) * 13 - 190, 2, Math.floor(k / 30) * 15 - 180, 3, 2, 3, k % 12));
  const breaths = async (opts) => {
    const builder = new SB.StaticBatchBuilder(opts);
    for (const model of many) builder.add(model, I, SB.keyResolver(null));
    let count = 0;
    const merged = await builder.finishSliced(() => { count++; });
    return { count, merged };
  };
  const columns = await breaths({ shadowColumns: TOWN }), none = await breaths({});
  const tris = none.merged.indices.length / 3;
  assert.ok(tris > 8192, `a town past one range (${tris} triangles)`);
  assert.equal(columns.count - none.count, 3 * Math.ceil(tris / SB.SHADOW_COLUMN_RANGE) + 1, 'three passes a range, and the buffer');
});

test('the near maps draw the columns they can see: the first two cascades and every lamp face draw, from the columns\' buffer, exactly the triangles of the columns their volume touches, each once; the far cascade draws the visible sub-meshes as before; a near map draws a fraction of the sub-meshes\' triangles (mutants: the replay by sub-mesh; the far cascade by column)', async (t) => {
  const { mesh, reps } = await townFrames();
  assert.ok(mesh.shadowVao && mesh.shadowCells?.length > 1, 'the town\'s mesh carries its columns');
  const tally = new Map();
  for (const rep of reps) {
    if (!rep.takes) {
      assert.equal(rep.mesh.length, 0, 'a replay the town does not stand in draws none of it');
      continue;
    }
    const planes = spherePlanes(rep.vp);
    const subs = bySubMesh(planes, mesh);
    const kind = rep.cascade === FAR ? 'the far cascade' : rep.cascade >= 0 ? `cascade ${rep.cascade}` : 'a lamp face';
    if (rep.cascade === FAR) {
      assert.equal(rep.mesh.filter((d) => d[0] !== mesh.vao).length, 0, 'the far cascade draws the merged run, never the columns');
      assert.deepEqual(ascending(drawnStarts(rep, mesh.vao)), ascending(subs.starts), 'the visible sub-meshes\' triangles');
    } else {
      assert.equal(rep.mesh.filter((d) => d[0] !== mesh.shadowVao).length, 0, `${kind} draws the columns, never the sub-meshes`);
      const want = touches(planes, mesh.bounds) ? mesh.shadowCells.flatMap((cell) => (touches(planes, cell._bounds) ? rangeStarts(cell) : [])) : [];
      assert.deepEqual(ascending(drawnStarts(rep, mesh.shadowVao)), ascending(want), `${kind}: the triangles of the columns it touches, each once`);
    }
    const row = tally.get(kind) ?? { maps: 0, triangles: 0, draws: 0, subTriangles: 0, subDraws: 0 };
    row.maps++;
    row.triangles += rep.mesh.reduce((n, d) => n + d[1] / 3, 0);
    row.draws += rep.mesh.length;
    row.subTriangles += subs.starts.length;
    row.subDraws += subs.draws;
    tally.set(kind, row);
  }
  for (const [kind, row] of tally) {
    const each = (n) => (n / row.maps).toFixed(1);
    t.diagnostic(`${kind}, ${row.maps} maps: ${each(row.triangles)} triangles in ${each(row.draws)} draws a map; by sub-mesh ${each(row.subTriangles)} in ${each(row.subDraws)}`);
  }
  for (const kind of ['cascade 0', 'cascade 1', 'a lamp face']) {
    const row = tally.get(kind);
    assert.ok(row?.maps > 0, `${kind} replayed`);
    assert.ok(row.triangles * 4 < row.subTriangles, `${kind} draws under a quarter of the sub-meshes' triangles (${row.triangles} of ${row.subTriangles})`);
  }
  assert.ok(tally.get('the far cascade')?.maps > 0, 'the far cascade replayed');
});

test('a batch with cells takes its merged run in the far cascade: a level\'s cells under the sun draw by cell in the near cascades and by sub-mesh in the far one, its visible sub-meshes\' triangles (mutants: the far cascade by cell)', () => {
  const builder = new SB.StaticBatchBuilder({ shadowCell: SB.SHADOW_CELL_SIZE });
  for (const model of townModels()) builder.add(model, I, SB.keyResolver(null));
  const merged = builder.finish();
  const { renderer, pass, draws, frame } = stand();
  const mesh = renderer.createMesh(merged);
  assert.ok(mesh.shadowVao, 'a mesh with cells');
  const reps = watchReplays(pass, draws, mesh);
  for (let k = 0; k < 3; k++) frame(() => renderer.drawMesh(mesh, I, null), new Float32Array(0));
  const sun = reps.filter((rep) => rep.takes && rep.cascade >= 0);
  assert.ok(sun.some((rep) => rep.cascade === FAR), 'the far cascade replayed');
  for (const rep of sun) {
    const vaos = [...new Set(rep.mesh.map((d) => d[0]))];
    if (rep.cascade === FAR) {
      assert.deepEqual(vaos, [mesh.vao], 'the far cascade draws the merged run');
      assert.deepEqual(ascending(drawnStarts(rep, mesh.vao)), ascending(bySubMesh(spherePlanes(rep.vp), mesh).starts), 'its visible sub-meshes\' triangles');
    } else if (vaos.length) assert.deepEqual(vaos, [mesh.shadowVao], `cascade ${rep.cascade} draws by cell`);
  }
  assert.ok(sun.some((rep) => rep.cascade < FAR && rep.mesh.length > 0), 'a near cascade drew its cells');
});

test('every map keeps the same depth: in each replay of the lit town, a triangle the replay left out lies wholly outside one of the map\'s clip planes, so it could write no texel, and the depth its drawn triangles leave is, texel for texel, the depth the sub-meshes\' path leaves', async (t) => {
  const { merged, mesh, reps } = await townFrames();
  assert.ok(merged.shadowIndices && mesh.shadowVao, 'the town\'s mesh carries its columns');
  const P = merged.positions, tris = merged.indices.length / 3;
  const inMerge = new Map();
  for (let k = 0; k < tris; k++) inMerge.set(`${merged.indices[k * 3]},${merged.indices[k * 3 + 1]},${merged.indices[k * 3 + 2]}`, k);
  const ofColumn = Int32Array.from({ length: tris }, (_, k) => inMerge.get(`${merged.shadowIndices[k * 3]},${merged.shadowIndices[k * 3 + 1]},${merged.shadowIndices[k * 3 + 2]}`));
  let maps = 0, fromColumns = 0, left = 0, covered = 0;
  for (const rep of reps) {
    if (!rep.takes) continue;
    const columns = rep.mesh.some((d) => d[0] === mesh.shadowVao);
    const index = columns ? merged.shadowIndices : merged.indices;
    const drawn = drawnStarts(rep, columns ? mesh.shadowVao : mesh.vao);
    const kept = new Uint8Array(tris);
    for (const start of drawn) kept[columns ? ofColumn[start / 3] : start / 3] = 1;
    for (let k = 0; k < tris; k++) {
      if (kept[k]) continue;
      assert.ok(outsideOnePlane(rep.vp, P, merged.indices, k * 3), 'a triangle left out writes no texel');
      left++;
    }
    const size = rep.lamp ? 48 : 96;
    const map = depthMap(rep.vp, P, index, drawn, size);
    assert.deepEqual(map, depthMap(rep.vp, P, merged.indices, bySubMesh(spherePlanes(rep.vp), mesh).starts, size), 'the same depth, texel for texel');
    maps++;
    if (columns) fromColumns++;
    covered += map.filter(Number.isFinite).length;
  }
  t.diagnostic(`${maps} maps, ${fromColumns} drawn from the columns; ${left} triangles left out; ${covered} texels covered`);
  assert.ok(fromColumns > 10, `maps drawn from the columns (${fromColumns})`);
  assert.ok(left > 1000 && covered > 1000, 'triangles left out, and texels written');
});
