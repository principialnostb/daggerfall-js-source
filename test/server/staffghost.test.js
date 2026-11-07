// The toybox's ghost, the relay's half (server/src/staffGhost.js), over the real Room (test/fakeRoom.mjs - a real
// signed token at a real hello). Only a developer may turn it on; while on, its pose and its presence reach developers
// and moderators alone; turning it off says its join again.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeRoom } from '../fakeRoom.mjs';
import { parseClient, validPose, poseChanged } from '../../src/net/wire.js';
import { ghostSees, ghostHides, ghostRoom, isGhost, GHOST_SEERS, GHOST_REFUSED } from '../../server/src/staffGhost.js';

const quiet = async (fn) => {
  const keep = { info: console.info, warn: console.warn, log: console.log };
  console.info = console.warn = console.log = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, keep);
  }
};
const P = { x: 1, y: 0, z: 1, yaw: 0, pitch: 0, mv: 0 };
const GHOST_ID = 'ghst-0001';
const ofT = (ws, t) => ws.sent.filter((f) => f.t === t);
const welcomeOf = (ws) => ws.sent.find((f) => f.t === 'welcome');
const naming = (ws, id = GHOST_ID) => ws.sent.filter((f) => JSON.stringify(f).includes(id));

/** A cell with a developer, a moderator and two players in it, all welcomed. */
async function cell(key = 'world:3,12') {
  const r = fakeRoom(key);
  const dev = r.connect();
  await r.hello(dev, GHOST_ID, P, { glyphs: ['dev'] });
  const mod = r.connect();
  await r.hello(mod, 'modr-0002', P, { glyphs: ['mod'] });
  const game = r.connect();
  await r.hello(game, 'game-0003', P);
  const other = r.connect();
  await r.hello(other, 'othr-0004', P, { glyphs: ['dm'] });
  return { r, dev, mod, game, other };
}

test('ghost: the law - who sees, which rooms keep it, the wire\'s frame and pose bit', () => {
  assert.deepEqual([...GHOST_SEERS], ['dev', 'mod']);
  assert.equal(ghostSees({ glyphs: ['dev'] }), true);
  assert.equal(ghostSees({ glyphs: ['mod', 'dm'] }), true);
  assert.equal(ghostSees({ glyphs: ['dm'] }), false);
  assert.equal(ghostSees({}), false);
  assert.equal(isGhost({ gh: 1 }), true);
  assert.equal(isGhost({ gh: true }), false);
  const g = { gh: 1 };
  assert.equal(ghostHides(g, { glyphs: [] }), true);
  assert.equal(ghostHides(g, { glyphs: ['mod'] }), false);
  assert.equal(ghostHides(g, g), false, 'never from itself');
  assert.equal(ghostRoom('world:3,12'), true);
  assert.equal(ghostRoom('chat:world'), false, 'a channel keeps its own roster');
  assert.deepEqual(parseClient('{"t":"ghost","on":true}', { hasHello: true }), { t: 'ghost', on: true });
  assert.ok(parseClient('{"t":"ghost","on":1}', { hasHello: true }).error);
  assert.ok(parseClient('{"t":"ghost","on":true}').error, 'never before hello');
  assert.equal(validPose({ ...P, gh: 1 }).gh, 1, 'the pose carries the ghost bit for the staff\'s veil');
  assert.equal('gh' in validPose(P), false, 'omitted off');
  assert.equal(poseChanged(validPose(P), validPose({ ...P, gh: 1 })), true, 'turning ghost is news at once');
});

test('ghost: a developer or a moderator may turn it on - a player is refused, never struck', async () => {
  await quiet(async () => {
    const { r, mod, game } = await cell();
    mod.sent.length = 0;
    await r.raw(mod, '{"t":"ghost","on":true}');
    assert.deepEqual(ofT(mod, 'ghost').at(-1), { t: 'ghost', on: true }, 'a moderator');
    assert.equal(isGhost(r.room._attach(mod)), true);
    for (const ws of [game]) {
      ws.sent.length = 0;
      await r.raw(ws, '{"t":"ghost","on":true}');
      assert.deepEqual(ofT(ws, 'ghost'), [{ t: 'ghost', on: false, no: GHOST_REFUSED }]);
      assert.equal(isGhost(r.room._attach(ws)), false);
      assert.equal(ws.closed, null);
    }
  });
});

test('ghost: on, its pose and presence reach developers and moderators alone; the rest hear a leave and nothing after', async () => {
  await quiet(async () => {
    const { r, dev, mod, game, other } = await cell();
    for (const ws of [mod, game, other]) ws.sent.length = 0;
    await r.raw(dev, '{"t":"ghost","on":true}');
    assert.deepEqual(ofT(dev, 'ghost').at(-1), { t: 'ghost', on: true });
    assert.equal(isGhost(r.room._attach(dev)), true);
    for (const ws of [game, other]) assert.deepEqual(ofT(ws, 'leave'), [{ t: 'leave', id: GHOST_ID }], 'a player is told it left');
    assert.equal(ofT(mod, 'leave').length, 0, 'a moderator is told nothing');
    for (const ws of [mod, game, other]) ws.sent.length = 0;
    await r.pose(dev, { ...P, x: 2, gh: 1 });
    assert.ok(ofT(mod, 'pose').some((f) => f.id === GHOST_ID && f.p.gh === 1), 'the moderator hears it, veiled');
    for (const ws of [game, other]) assert.deepEqual(naming(ws), [], 'a player hears nothing of it');
    // asked for by id, it answers no one who cannot see it
    await r.raw(game, JSON.stringify({ t: 'who', id: GHOST_ID }));
    assert.deepEqual(naming(game), []);
    // a newcomer: a player's who-is-here leaves it out; a developer's names it
    const late = r.connect();
    await r.hello(late, 'late-0005', P);
    assert.deepEqual(welcomeOf(late).peers.map((p) => p.id).sort(), ['game-0003', 'modr-0002', 'othr-0004']);
    const dev2 = r.connect();
    await r.hello(dev2, 'dev2-0006', P, { glyphs: ['dev'] });
    assert.ok(welcomeOf(dev2).peers.some((p) => p.id === GHOST_ID), 'a developer\'s welcome names the ghost');
    // the ghost still hears the room
    dev.sent.length = 0;
    await r.pose(game, { ...P, x: 3 });
    assert.ok(ofT(dev, 'pose').some((f) => f.id === 'game-0003'));
  });
});

test('ghost: turning it off says its join to the rest, and its poses reach everyone again', async () => {
  await quiet(async () => {
    const { r, dev, mod, game } = await cell();
    await r.raw(dev, '{"t":"ghost","on":true}');
    await r.pose(dev, { ...P, x: 4 });
    for (const ws of [mod, game]) ws.sent.length = 0;
    await r.raw(dev, '{"t":"ghost","on":false}');
    assert.deepEqual(ofT(dev, 'ghost').at(-1), { t: 'ghost', on: false });
    const j = ofT(game, 'join');
    assert.equal(j.length, 1);
    assert.equal(j[0].id, GHOST_ID);
    assert.equal(j[0].pose?.x, 4, 'standing where it stands');
    assert.equal(ofT(mod, 'join').length, 0, 'a moderator saw it all along');
    game.sent.length = 0;
    await r.pose(dev, { ...P, x: 5 });
    assert.ok(ofT(game, 'pose').some((f) => f.id === GHOST_ID));
    // off again is nothing new
    game.sent.length = 0;
    await r.raw(dev, '{"t":"ghost","on":false}');
    assert.equal(ofT(game, 'join').length, 0);
  });
});

test('ghost: a hello that carries it is a ghost from its first frame - a crossing or a reconnect never shows it', async () => {
  await quiet(async () => {
    const r = fakeRoom('world:3,13');
    const game = r.connect();
    await r.hello(game, 'game-0003', P);
    const mod = r.connect();
    await r.hello(mod, 'modr-0002', P, { glyphs: ['mod'] });
    const dev = r.connect();
    await r.hello(dev, GHOST_ID, P, { glyphs: ['dev'], gh: 1 });
    assert.equal(isGhost(r.room._attach(dev)), true);
    assert.deepEqual(naming(game), [], 'no join to a player');
    assert.ok(ofT(mod, 'join').some((f) => f.id === GHOST_ID), 'the moderator is told it came');
    // a player's `gh` is nobody's word
    const r2 = fakeRoom('world:3,14');
    const p = r2.connect();
    await r2.hello(p, 'pret-0007', P, { gh: 1 });
    assert.equal(isGhost(r2.room._attach(p)), false);
  });
});

test('ghost: a channel answers the frame and keeps no ghost', async () => {
  await quiet(async () => {
    const r = fakeRoom('chat:world');
    const dev = r.connect();
    await r.hello(dev, GHOST_ID, null, { glyphs: ['dev'] });
    await r.raw(dev, '{"t":"ghost","on":true}');
    assert.deepEqual(ofT(dev, 'ghost').at(-1), { t: 'ghost', on: false });
    assert.equal(isGhost(r.room._attach(dev)), false);
  });
});
