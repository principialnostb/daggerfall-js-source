// The collider's query lists are scratch kept across queries. A query writes its list from the front and answers how
// many it wrote, its readers stop at that count, and the slots past it are let go. A list emptied with `length = 0`
// throws its storage away, so each query grew it again: 152 bytes a list a query.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Collider, wideCandidates } from '../../src/player/collider.js';
import { ALLOC_CHILD_ARGS } from '../allocChild.mjs';

/** A scene's faces as rectangles at a height, [bucket, x0, z0, x1, z1, y]: a slab a hundred metres wide (its faces
 *  wide, on the tree) under and over a room (fine cells), and a ring of tiles 20 m out. `apart` stands the room's
 *  floor and ceiling at far corners: its box still holds the middle, but no cell of it is near there. */
function sceneQuads(apart = false) {
  const q = [];
  for (const y of [0, 4]) q.push(['slab', -50, -50, 50, 50, y]);
  if (apart) q.push(['room', 10, 10, 11, 11, 0], ['room', -11, -11, -10, -10, 4]);
  else q.push(['room', -2, -2, 2, 2, 0], ['room', -2, -2, 2, 2, 4]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, x = Math.round(Math.cos(a) * 20), z = Math.round(Math.sin(a) * 20);
    q.push([`tile:${i}`, x - 0.5, z - 0.5, x + 0.5, z + 0.5, 0]);
  }
  return q;
}
/** The scene as a collider: each rectangle two triangles in its bucket. */
function scene(Collider, quads) {
  const c = new Collider(() => -100);
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const [key, x0, z0, x1, z1, y] of quads) {
    c.addMesh(key, new Float32Array([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1]), new Uint32Array([0, 1, 2, 0, 2, 3]), I);
  }
  return c;
}
let seed = 17;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };

test('a kept list is written from the front: the answer is its first n, and every slot past it is let go, whatever a longer answer left there (the list keeps the length that answer grew it to)', () => {
  const c = scene(Collider, sceneQuads());
  const kept = [];
  const fresh = (q) => { const out = []; c._near(...q, out); return out; };
  const big = [-60, 60, -60, 60], small = [-0.5, 0.5, -0.5, 0.5], none = [500, 501, 500, 501];
  const counts = [];
  for (const q of [big, small, big, none, small, big, big, small, none]) {
    const n = c._near(...q, kept);
    counts.push(n);
    assert.deepEqual(kept.slice(0, n), fresh(q), 'the same buckets as a fresh list, in the same order');
    for (let i = n; i < kept.length; i++) assert.equal(kept[i], null, `slot ${i} past the answer of ${n} holds nothing`);
  }
  assert.deepEqual(counts, [14, 2, 14, 0, 2, 14, 14, 2, 0], 'the answers run long and short in turn');
  assert.equal(kept.length, 14, 'the list keeps the length its longest answer grew it to');
});

test('a sphere query answers as a brute force over every face does, at random points whose lists run longer and shorter in turn', () => {
  for (const apart of [false, true]) {
    const quads = sceneQuads(apart), c = scene(Collider, quads);
    const d2 = ([, x0, z0, x1, z1, y], p) => Math.max(x0 - p[0], 0, p[0] - x1) ** 2 + (p[1] - y) ** 2 + Math.max(z0 - p[2], 0, p[2] - z1) ** 2;
    seed = 17;
    let asked = 0, touching = 0;
    for (let i = 0; i < 4000; i++) {
      const p = [(rnd() - 0.5) * 50, rnd() * 6 - 1, (rnd() - 0.5) * 50], r = [0.3, 1, 2.5][i % 3];
      const least = Math.sqrt(Math.min(...quads.map((q) => d2(q, p))));
      if (Math.abs(least - r) < 1e-4) continue;   // a point on the boundary is no verdict
      asked++;
      if (least < r) touching++;
      assert.equal(c.sphereOverlaps(p, r), least < r, `a sphere of ${r} at ${p.map((v) => v.toFixed(3))}`);
    }
    assert.ok(asked > 3900 && touching > 500 && asked - touching > 500, `both answers asked (${touching} of ${asked} touch)`);
    assert.equal(wideCandidates(c, 'slab', [0.3, 2, 0.3], 2), 4, 'a sphere between the slab\'s faces is handed all four');
    assert.equal(wideCandidates(c, 'slab', [0.3, 9, 0.3], 2), 0, 'and one above them none');
  }
});

test('a kept list\'s gather, a wide-face count and a sphere query grow no list: handing faces and cells costs what handing none does, measured in a node of its own against a control that must show', () => {
  const href = (p) => JSON.stringify(new URL(`../../${p}`, import.meta.url).href);
  const script = `
    const { Collider, wideCandidates } = await import(${href('src/player/collider.js')});
    const sceneQuads = ${sceneQuads.toString()};
    const scene = ${scene.toString()};
    const cells = scene(Collider, sceneQuads()), apart = scene(Collider, sceneQuads(true)), kept = [];
    const P = [[0.3, 2, 0.3], [-0.6, 1.8, 0.2], [0.1, 2.2, -0.7]], FAR = [[0.3, 300, 0.3], [-0.6, 300, 0.2], [0.1, 300, -0.7]];
    let sink = null, k = 0;
    const fns = {
      near: () => { sink = cells._near(-600, 600, -600, 600, kept); },
      wide: () => { sink = wideCandidates(cells, 'slab', P[(k = (k + 1) % 3)], 2); },
      wideNone: () => { sink = wideCandidates(cells, 'slab', FAR[(k = (k + 1) % 3)], 2); },
      overlapCells: () => { sink = cells.sphereOverlaps(P[(k = (k + 1) % 3)], 1); },
      overlapApart: () => { sink = apart.sphereOverlaps(P[(k = (k + 1) % 3)], 1); },
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
    const handed = [];
    cells._near(-600, 600, -600, 600, handed);
    const out = { handed: handed.length, faces: P.map((p) => wideCandidates(cells, 'slab', p, 2)), none: FAR.map((p) => wideCandidates(cells, 'slab', p, 2)),
      touching: P.some((p) => cells.sphereOverlaps(p, 1) || apart.sphereOverlaps(p, 1)) };
    for (const name of Object.keys(fns)) out[name] = bytes(fns[name]);
    out.sunk = sink !== undefined;
    console.log(JSON.stringify(out));
  `;
  const run = spawnSync(process.execPath, [...ALLOC_CHILD_ARGS, '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const m = JSON.parse(run.stdout.trim().split('\n').pop());
  assert.ok(m.handed === 14 && m.faces.every((n) => n === 4) && m.none.every((n) => n === 0) && !m.touching, `queries with work in them (${m.handed} buckets, ${m.faces} faces)`);
  assert.ok(m.control >= 20, `the control made ${m.control.toFixed(2)} bytes a call: the measure is blind`);
  assert.ok(m.near < 16, `the whole walk into a kept list: ${m.near.toFixed(2)} bytes a query`);
  // A grid's key is a number past the small integers, boxed at each ask, and a call's number arguments may be boxed:
  // the pairs below make the same asks and calls, so their difference is what the lists alone make.
  assert.ok(m.wide - m.wideNone < 16, `four wide faces handed: ${m.wide.toFixed(2)} bytes a query, ${m.wideNone.toFixed(2)} with none`);
  assert.ok(m.overlapCells - m.overlapApart < 16, `a room's cells handed: ${m.overlapCells.toFixed(2)} bytes a query, ${m.overlapApart.toFixed(2)} with none near`);
});

test('the cell lists a sphere query took are let go once a later query takes fewer, so a torn-down bucket\'s cells are not held: a weak reference to each is cleared, in a node of its own (mutant: the slots past the count kept)', () => {
  const href = (p) => JSON.stringify(new URL(`../../${p}`, import.meta.url).href);
  const script = `
    const { Collider } = await import(${href('src/player/collider.js')});
    const scene = ${scene.toString()};
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const collider = scene(Collider, [['room', -2, -2, 2, 2, 0], ['room', -2, -2, 2, 2, 4], ['tile', 20.2, 0.2, 20.8, 0.8, 0]]);
    collider.sphereOverlaps([0.3, 2, 0.3], 1);
    const cells = [...collider._buckets.get('room').grid.values()].map((cell) => new WeakRef(cell));
    collider.removeBucket('room');
    const touched = collider.sphereOverlaps([20.5, 0.5, 0.5], 1);
    await tick();
    globalThis.gc(); globalThis.gc();
    await tick();
    console.log(JSON.stringify({ cells: cells.length, touched, held: cells.filter((ref) => ref.deref() !== undefined).length }));
  `;
  const run = spawnSync(process.execPath, [...ALLOC_CHILD_ARGS, '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const m = JSON.parse(run.stdout.trim().split('\n').pop());
  assert.equal(m.cells, 9, 'the room filed in nine cells, every one within the first query\'s reach');
  assert.equal(m.touched, true, 'the second query reached the tile, one cell of its own');
  assert.equal(m.held, 0, `${m.held} of the torn-down room's cell lists still held`);
});
