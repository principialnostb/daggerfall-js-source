// A WALKER STANDING STILL IS NOT BUILT AGAIN. The walker layer keeps each walker's sprite answer while its table, its
// view, its frame and every value of its look hold; it reads a look's outfit from its items once a list; and it asks a
// look's warm signature only when the look changes. Each answer is the one the layer built before, so the picture is
// the same. A rider's answer is new every frame, so the art store keeps nothing for it. Driven through the real walker
// and rider layers over a fake renderer, as the layered walkers' own pins are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPeerWalkers, createPeerRiders, createEotbArt } from '../../../src/net/peer/peerRiders.js';
import { frameTime } from '../../../src/player/eyeOfTheBeholder/eotbBillboard.js';

/** The art store over a fake renderer, every sprite answer it is asked for kept in `asked`. */
function rig() {
  const renderer = {
    uploadTexture() {},
    createBillboardBatch: (archive, record, size) => ({ archive, record, size, origin: null }),
    destroyBillboardBatch() {},
  };
  const art = createEotbArt({ renderer, urlFor: (k) => `u:${k}`, decode: async () => ({ width: 50, height: 110, colors: new Uint32Array(50 * 110) }) });
  const asked = [];
  const ensure = art.ensure;
  art.ensure = (s) => { asked.push(s); return ensure(s); };
  return { art, asked };
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const toScene = (p) => [p.x, p.y, p.z];
const pose = (o = {}) => ({ x: 4, y: 0, z: 9, yaw: 0, pitch: 0, mv: 0, wd: 0, an: 0, sr: 0, cn: 0, ar: 0, ...o });
const cuirass = (material = 0x0201) => [{ templateIndex: 102, group: 'Armor', material, equipSlot: 18 }];
const LONGSWORD = { templateIndex: 120, group: 'Weapons', equipSlot: 19, material: 1 };
const walker = (look, o) => ({ id: 'w', look, shown: pose(o) });

test('a walker standing still keeps its sprite answer while its table, view, frame and look hold, and is asked again when one changes (mutants: the answer never kept; kept past a new view)', async () => {
  const { art, asked } = rig();
  const w = createPeerWalkers({ art, layeredAll: () => true });
  const look = { gender: 'male', lg: 2, items: cuirass() };
  const frame = (o = {}, eye = [4, 1, 20], dt = 0, lk = look) => { const n = asked.length; w.sync([walker(lk, o)], toScene, { eye, dt }); return asked.slice(n); };
  const [first] = frame();
  await settle();
  const [again] = frame();
  assert.equal(again, first, 'the same answer, not built again');
  assert.match(first.rec, /^lp[0-6]l@0_/, 'the plate cuirass it wears, empty-handed');
  const [aside] = frame({}, [20, 1, 9]);
  assert.notEqual(aside, first);
  assert.notEqual(aside.view, first.view, 'seen from aside: another view');
  const [back] = frame();
  assert.notEqual(back, aside);
  assert.deepEqual(back, first, 'seen from before again: the answer it had, built again');
  const [chain] = frame({}, [4, 1, 20], 0, { gender: 'male', lg: 2, items: cuirass(0x0100) });
  assert.match(chain.rec, /^lcl@0_/, 'a new look: its own answer');
  const [walking] = frame({ mv: 1 }, [4, 1, 20], 0.5, { gender: 'male', lg: 2, items: cuirass(0x0100) });
  assert.notEqual(walking, chain);
  assert.notEqual(walking.key, chain.key, 'a step: another frame of the walk');
});

test('a set walker is asked again the frame its walk steps, and the frame it draws its weapon at a stand - its view and look the same (mutants: kept past a new frame; kept past a new table)', async () => {
  const { art, asked } = rig();
  const w = createPeerWalkers({ art, layeredAll: () => false });
  const look = { eo: 0 };
  const frame = (o, dt) => { const n = asked.length; w.sync([walker(look, o)], toScene, { eye: [4, 1, 20], dt }); return asked.slice(n); };
  const [walk0] = frame({ mv: 1 }, 0);
  await settle();
  assert.equal(frame({ mv: 1 }, 0)[0], walk0, 'the fixture is real: a frame that moves nothing keeps the answer');
  const [walk1] = frame({ mv: 1 }, frameTime(false));
  assert.notEqual(walk1, walk0, 'a step of the walk: a new answer');
  assert.equal(walk1.view, walk0.view, 'seen from the same side');
  assert.deepEqual([walk0.frame, walk1.frame], [0, 1], 'the next frame of the walk');
  assert.notEqual(walk1.key, walk0.key, 'its own picture');
  const [idle] = frame({}, 0);
  assert.equal(frame({}, 0)[0], idle, 'standing, sheathed: kept');
  const [ready] = frame({ wd: 1 }, 0);
  assert.notEqual(ready, idle, 'the weapon drawn at a stand: a new answer');
  assert.deepEqual([ready.view, ready.frame], [idle.view, idle.frame], 'the same view, the same frame');
  assert.notEqual(ready.record, idle.record, 'the ready stance\'s own picture');
});

test('a look\'s outfit is read from its items once a list, however many frames it stands; a new list is read again (mutants: the outfit read every frame)', async () => {
  const { art } = rig();
  const w = createPeerWalkers({ art, layeredAll: () => true });
  let walks = 0;
  const items = new Proxy(cuirass(), { get(t, k, r) { if (k === Symbol.iterator) walks++; return Reflect.get(t, k, r); } });
  const look = { gender: 'male', lg: 2, items };
  const frame = (lk = look) => w.sync([walker(lk)], toScene, { eye: [4, 1, 20], dt: 1 / 60 });
  frame();
  const once = walks;
  assert.ok(once >= 1, 'read on its first frame');
  for (let i = 0; i < 5; i++) frame();
  assert.equal(walks, once, 'five frames more walk the list no more');
  frame({ gender: 'male', lg: 2, items: cuirass(0x0100) });
  await settle();
  frame({ gender: 'male', lg: 2, items: cuirass(0x0100) });
  assert.match(w.walkers.get('w').batch.record, /^lcl@0_/, 'a new list: its own outfit drawn');
});

test('a kept answer\'s keys are made once: five steady frames of a worn-armour walker split and replace no key and read no record to build one (mutants: the keys made every frame; the texture key or the batch key built again)', async () => {
  const renderer = {
    textures: { has: () => true },
    uploadTexture() {},
    createBillboardBatch: (archive, record, size) => ({ archive, record, size, origin: null }),
    destroyBillboardBatch() {},
  };
  const art = createEotbArt({ renderer, urlFor: (k) => `u:${k}`, decode: async () => ({ width: 50, height: 110, colors: new Uint32Array(50 * 110) }) });
  const w = createPeerWalkers({ art, layeredAll: () => true });
  const look = { gender: 'male', lg: 2, items: cuirass() };
  const frame = () => w.sync([walker(look)], toScene, { eye: [4, 1, 20], dt: 0 });
  frame();
  await settle();
  frame();
  assert.match(w.walkers.get('w').batchKey ?? '', /:lp[0-6]l@0_/, 'the fixture is real: the walker stands in its plate, its picture up');
  const kept = w.walkers.get('w').asked.sprite, rec = kept.rec;
  let recReads = 0;
  Object.defineProperty(kept, 'rec', { get() { recReads++; return rec; }, enumerable: true });
  const { split, replace } = String.prototype;
  const calls = { split: 0, replace: 0 };
  String.prototype.split = function (...a) { calls.split++; return split.apply(this, a); };
  String.prototype.replace = function (...a) { calls.replace++; return replace.apply(this, a); };
  try { for (let i = 0; i < 5; i++) frame(); } finally { String.prototype.split = split; String.prototype.replace = replace; }
  assert.deepEqual(calls, { split: 0, replace: 0 }, 'its look\'s code and its renderer key kept with its answer');
  assert.equal(recReads, 0, 'its texture key and its batch key taken from its keys, never built from its record again');
});

test('a rider\'s answer is new every frame, and the art store keeps no record for it: twenty steady frames of ten riders write no WeakMap (mutant: every answer\'s keys kept)', async () => {
  const renderer = {
    textures: { has: () => true },
    uploadTexture() {},
    createBillboardBatch: (archive, record, size) => ({ archive, record, size, origin: null }),
    destroyBillboardBatch() {},
  };
  const art = createEotbArt({ renderer, urlFor: (k) => `u:${k}`, decode: async () => ({ width: 50, height: 110, colors: new Uint32Array(50 * 110) }) });
  const asked = [];
  const ensure = art.ensure;
  art.ensure = (s, keys) => { asked.push(s); return ensure(s, keys); };
  const riders = createPeerRiders({ art });
  const peers = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, shown: pose({ x: i * 3, yaw: i * 0.7, rd: 1 }) }));
  const frame = () => { riders.sync(peers, toScene, { eye: [4, 1, 20], dt: 0 }); riders.settle(); };
  frame();
  await settle();
  frame();
  assert.equal(peers.filter((p) => riders.isRiding(p.id)).length, 10, 'the fixture is real: ten riders in the saddle, their pictures up');
  const n = asked.length;
  frame();
  assert.equal(asked.length - n, 10, 'one ask a rider');
  assert.ok(asked[n] !== asked[n - 10] && asked[n].key === asked[n - 10].key, 'a new answer for the same picture');
  const { set } = WeakMap.prototype;
  let writes = 0;
  WeakMap.prototype.set = function (...a) { writes++; return set.apply(this, a); };
  try { for (let i = 0; i < 20; i++) frame(); } finally { WeakMap.prototype.set = set; }
  assert.equal(writes, 0, 'nothing kept for an answer asked once');
});

test('a walker with its weapon drawn asks its look\'s warm signature only when the look changes (mutants: asked every frame)', async () => {
  const { art } = rig();
  const w = createPeerWalkers({ art, layeredAll: () => true });
  const look = { gender: 'male', lg: 2, items: [...cuirass(), LONGSWORD] };
  const frame = () => w.sync([walker(look, { wd: 1 })], toScene, { eye: [4, 1, 20], dt: 0 });
  frame();
  await settle();
  frame();
  const join = Array.prototype.join;
  let joins = 0;
  Array.prototype.join = function (...a) { joins++; return join.apply(this, a); };
  try { for (let i = 0; i < 5; i++) frame(); } finally { Array.prototype.join = join; }
  assert.equal(joins, 0, 'five frames of the same look join no signature');
});
