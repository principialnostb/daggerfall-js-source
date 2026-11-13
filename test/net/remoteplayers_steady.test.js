// A steady frame of the other players' pass: the same peers, the same pictures. Its id sets are kept and emptied
// rather than made anew, its sweeps walk the live maps rather than a copy of their keys, and a class sprite's two key
// strings are built only when the record, the frame or the archive moves. What each frame draws, hears and keeps is
// pinned by the pass's own tests (slam7, slam15, peerrange, gf2_peeracts); these pin what a steady frame makes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RemotePlayers, lookKey } from '../../src/net/remotePlayers.js';

const look = (i) => ({ race: 'Nord', gender: 'male', faceIndex: 0, items: [{ templateIndex: i, group: 'Armor', equipSlot: 1 }] });
const peerAt = (i) => ({ id: `p${i}`, look: look(i), shown: { x: i * 2, y: 0, z: 0, yaw: 0, pitch: 0, mv: 0 } });
const toScene = (p) => [p.x, p.y, p.z];

function host() {
  const audio = { setLoop3d: () => null, moveLoop3d: () => {}, play3d: () => {}, playOneShot: () => {} };
  const rp = new RemotePlayers({
    renderer: { uploadTexture: () => {}, releaseTexture: () => {}, createBillboardBatch: () => ({}), destroyBillboardBatch: () => {} },
    deps: { audio }, compose: async () => ({ rgba: new Uint8Array(64).fill(255), width: 4, height: 4 }), now: () => 1000,
  });
  const frame = async (list, opts) => {
    rp.sync(list, toScene, opts);
    for (let k = 0; k < list.length * 2 + 30; k++) { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); }
  };
  return { rp, frame };
}

/** What `run` makes: the Sets it constructs, and the arrays it walks (a copied key list is one). */
function counted(run) {
  const RealSet = globalThis.Set;
  const arrayWalk = Array.prototype[Symbol.iterator];
  let sets = 0;
  const walked = [];
  globalThis.Set = class extends RealSet {
    constructor(...a) { super(...a); sets++; }
  };
  Array.prototype[Symbol.iterator] = function (...a) { walked.push(this); return arrayWalk.apply(this, a); };
  try { run(); } finally {
    globalThis.Set = RealSet;
    Array.prototype[Symbol.iterator] = arrayWalk;
  }
  return { sets, walked };
}
const idList = (a) => a.length > 0 && a.every((v) => typeof v === 'string' && /^p\d+$/.test(v));

test('a steady frame of the other players makes no Set and copies no key list, and keeps what it kept', async () => {
  const { rp, frame } = host();
  const crowd = Array.from({ length: 6 }, (_, i) => peerAt(i));
  crowd[5].shown.rd = 1;   // one in the saddle: their hooves are a kept loop, swept with the rest
  for (let f = 0; f < 4; f++) await frame(crowd, { room: crowd });
  assert.equal(rp._batches.size, 6, 'the fixture is real: six dolls drawn');
  assert.equal(rp._onFoot.size, 5, 'five ids seen on foot');
  assert.equal(rp._riding.size, 1, 'and one rider heard');
  const made = counted(() => rp.sync(crowd, toScene, { room: crowd }));
  assert.equal(made.sets, 0, 'no Set made by a steady frame');
  assert.deepEqual(made.walked.filter(idList), [], 'no copy of a map\'s keys walked');
  assert.ok(made.walked.includes(crowd), 'the peers handed in are walked, as ever');
  assert.deepEqual([...rp._wanted].sort(), crowd.map((p) => lookKey(p.look)).sort(), 'the wanted looks: this frame\'s six');
  assert.equal(rp._batches.size, 6);
  // the kept sets are emptied, never carried: a frame of two leaves two
  await frame(crowd.slice(0, 2), { room: crowd.slice(0, 2) });
  assert.deepEqual([...rp._wanted].sort(), crowd.slice(0, 2).map((p) => lookKey(p.look)).sort(), 'two looks wanted');
  assert.deepEqual([...rp._onFoot].sort(), ['p0', 'p1'], 'the departed four swept from the on-foot ids');
  assert.equal(rp._riding.size, 0, 'and the rider\'s hooves with them');
  assert.deepEqual([...rp._batches.keys()].sort(), ['p0', 'p1'], 'and their dolls dropped');
});

test('a class sprite builds its key strings when its record, frame or archive moves, never on a frame showing the same picture', () => {
  const asked = [];
  const renderer = { createBillboardBatch: (archive, record, size) => ({ archive, record, size }), destroyBillboardBatch() {}, textures: { has: (k) => { asked.push(k); return true; } } };
  const rp = new RemotePlayers({ renderer, deps: { fetchBytes: async () => null, palette: null, uploadRecordFrame: () => {} }, compose: async () => null });
  let built = 0;
  const frameOf = (n) => ({ [Symbol.toPrimitive]: () => { built++; return String(n); } });
  let out = { record: 1, frame: frameOf(0), flip: false };
  const mobileUnit = { update: () => out, heldPose: () => out, isPlayingOneShot: () => false, state: 'walk' };
  const tex = { archive: 400, getSize: () => ({ width: 40, height: 80 }), getScale: () => ({ width: 0, height: 0 }) };
  let bundle = { mobileUnit, archive: 400, tex };
  const peer = { id: 'p1', shown: null };
  const step = () => {
    peer.shown = { x: 2, y: 0, z: 3, yaw: 0, mv: 0, an: 0 };
    rp._shown = [];
    rp._syncMobilePeer(peer, bundle, toScene, 0.016, [0, 1.6, 0]);
    return rp._batches.get('p1');
  };
  let e = step();
  assert.equal(built, 1, 'the first frame builds its key');
  assert.equal(e.batch.record, '1#0');
  for (let i = 0; i < 5; i++) e = step();
  assert.equal(built, 1, 'five frames of the same picture build nothing');
  assert.deepEqual(asked, Array(6).fill('400_1#0'), 'and the renderer is asked of the same key each frame');
  assert.equal(e.batch.record, '1#0');
  out = { record: 1, frame: frameOf(1), flip: false };
  e = step();
  assert.equal(built, 2, 'a new frame: built again');
  assert.equal(e.batch.record, '1#1');
  assert.equal(asked.at(-1), '400_1#1');
  out = { record: 2, frame: out.frame, flip: false };
  e = step();
  assert.equal(built, 3, 'a new record: built again');
  assert.equal(e.batch.record, '2#1');
  assert.equal(asked.at(-1), '400_2#1');
  bundle = { mobileUnit, archive: 401, tex };
  e = step();
  assert.equal(built, 4, 'a new archive: built again');
  assert.equal(asked.at(-1), '401_2#1');
  step();
  assert.equal(asked.at(-1), '401_2#1');
  assert.equal(built, 4, 'and held');
});
