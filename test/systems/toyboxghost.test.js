// The toybox's ghost, this screen's half (systems/toybox/toyboxGhost.js): the switch, the send through the host's
// dep, the alpha my own body and arms are drawn at, the veils - and the online session's ghost frame behind the relay's
// version gate, said again at every hello and in every pose.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ghostOn, setGhost, ghostAlpha, setGhostSend, ghostSelfVeil, ghostPeerVeil, GHOST_PEER_ALPHA } from '../../src/systems/toybox/toyboxGhost.js';
import { GHOST_SELF_ALPHA, GHOST_RELAY_MIN, relaySupportsGhost } from '../../src/systems/toybox/toyboxLaw.js';
import { CONCEAL_MODE } from '../../src/systems/combatVisuals.js';
import { OnlineSession } from '../../src/net/online.js';
import { fakeSocketClass } from '../fakeSocket.mjs';

test('ghost (client): off by default; on, my own look is see-through and the send is told; offline it is the look alone', () => {
  setGhostSend(null);
  setGhost(false);
  assert.equal(ghostOn(), false);
  assert.equal(ghostAlpha(), 1);
  assert.equal(ghostSelfVeil(), null);
  assert.equal(setGhost(true), true, 'offline: the look alone');
  assert.equal(ghostAlpha(), GHOST_SELF_ALPHA);
  assert.ok(GHOST_SELF_ALPHA > 0 && GHOST_SELF_ALPHA < 1);
  const said = [];
  setGhostSend((on) => said.push(on));
  setGhost(false);
  setGhost(true);
  assert.deepEqual(said, [false, true]);
  assert.equal(setGhost('yes'), false, 'only true turns it on');
  setGhostSend(() => {
    throw new Error('down');
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(setGhost(true), true, 'a send that throws leaves the look on');
  } finally {
    console.warn = warn;
  }
  setGhostSend(null);
  setGhost(false);
});

test('ghost (client): the veils are the plain blend - mine at GHOST_SELF_ALPHA, a ghost peer\'s off its pose bit', () => {
  setGhost(true);
  const v = ghostSelfVeil();
  assert.equal(v.mode, CONCEAL_MODE.reveal, 'the opacity alone, no shimmer');
  assert.equal(v.alpha, GHOST_SELF_ALPHA);
  setGhost(false);
  assert.equal(ghostPeerVeil({ gh: 1 }).mode, CONCEAL_MODE.reveal);
  assert.equal(ghostPeerVeil({ gh: 1 }).alpha, GHOST_PEER_ALPHA);
  assert.equal(ghostPeerVeil({}), null);
  assert.equal(ghostPeerVeil(null), null);
});

test('ghost (client): the relay gate', () => {
  assert.equal(relaySupportsGhost(`world${GHOST_RELAY_MIN}`), true);
  assert.equal(relaySupportsGhost(`world${GHOST_RELAY_MIN - 1}`), false);
  assert.equal(relaySupportsGhost('nonsense'), false);
  assert.equal(relaySupportsGhost(undefined), false);
});

/** A session with its room's socket open and welcomed by a relay named `v`. */
function welcomed(v) {
  const { FakeWS, sockets } = fakeSocketClass();
  const s = new OnlineSession({ url: 'wss://relay.test', name: 'Mac', id: 'mac-0001', secret: 'secret-of-mac-0001', WebSocketImpl: FakeWS, now: () => 1000 });
  const pose = { x: 1, y: 2, z: 3, yaw: 0, pitch: 0, mv: 0 };
  s.join('world:2,12', pose);
  sockets[0].open();
  sockets[0].receive({ t: 'welcome', id: 'mac-0001', peers: [], host: null, world: null, v });
  return { s, ws: sockets[0], pose };
}
const ghostFrames = (ws) => ws.sent.filter((f) => f.startsWith('{"t":"ghost"')).map((f) => JSON.parse(f));

test('ghost (client): sendGhost goes to a relay that keeps it, never to an older one - and every hello and pose says it', () => {
  const { s, ws } = welcomed(`world${GHOST_RELAY_MIN}`);
  assert.equal(s.ghostOk, true);
  assert.equal(s.sendGhost(true), true);
  assert.deepEqual(ghostFrames(ws), [{ t: 'ghost', on: true }]);
  assert.equal(s.ghostAsked(), true);
  assert.equal(s._helloFrame().gh, 1, 'a reconnect or a crossing says it at its hello');
  const answers = [];
  s.onGhost = (a) => answers.push(a);
  ws.receive({ t: 'ghost', on: true });
  assert.deepEqual(answers, [{ on: true, no: null }]);
  s.sendPose({ x: 5, y: 2, z: 3, yaw: 0, pitch: 0, mv: 1 });
  const poses = ws.sent.filter((f) => f.startsWith('{"t":"pose"')).map((f) => JSON.parse(f));
  assert.ok(poses.length && poses.at(-1).p.gh === 1, 'the pose carries the bit the staff veil it by');
  // a new welcome on the same socket (a relay's word again) says it again
  ws.receive({ t: 'welcome', id: 'mac-0001', peers: [], host: null, world: null, v: `world${GHOST_RELAY_MIN}` });
  assert.equal(ghostFrames(ws).length, 2);
  s.sendGhost(false);
  assert.deepEqual(ghostFrames(ws).at(-1), { t: 'ghost', on: false });
  assert.equal('gh' in s._helloFrame(), false);

  const old = welcomed(`world${GHOST_RELAY_MIN - 1}`);
  assert.equal(old.s.ghostOk, false);
  assert.equal(old.s.sendGhost(true), false, 'an older relay closes on the frame: nothing sent');
  assert.deepEqual(ghostFrames(old.ws), []);
  assert.equal(old.s._helloFrame().gh, 1, 'the hello field an older relay ignores');
});
