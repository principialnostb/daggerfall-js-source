// A toybox event online: the developer's route on the account service (server-account/src/devEvents.js) - a developer
// alone, stored and audited, signed and taken by the hub's real law, a city past the Bay too - and the relay's half
// (server/src/staffEvents.js): the hub keeps its fields, and its cell counts no screen's word - an invasion's fight and
// ledger are the cell's own (test/server/invasion_relay.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  takeStaffEventOrder, takeStaffEventLaw, staffEventWord, staffBookInternal, staffTellInternal, staffCallInternal,
  SEV_INTERNAL_BOOK, SEV_INTERNAL_TELL, SEV_INTERNAL_CALL,
} from '../../server/src/staffEvents.js';
import { SOCIAL_ROOM, worldRoom, PIXEL_UNITS, SAFE_LAW_PATH } from '../../src/net/wire.js';
import { toyboxStaffEvent, INVASION_METER } from '../../src/net/staffEvent/toyboxEvent.js';
import { TOYBOX_EVENT_WAIT_MS } from '../../src/systems/toybox/toyboxLaw.js';
import { standService } from '../accountDb.mjs';
import { DEV_EVENT_PATH, DEV_EVENT_ACT } from '../../server-account/src/devEvents.js';
import { ROUTES } from '../../server-account/src/service.js';

const AT = Date.now();
const BAY = { rg: 17, loc: 0, px: 207, py: 213, nm: 'Daggerfall', ct: 1 };
const PAST = { rg: 64, loc: -1000123, px: 1450, py: -220, nm: 'Mournhold', ct: 1 };
const poseOn = (px, py) => ({ x: px * PIXEL_UNITS + PIXEL_UNITS / 2, z: (499 - py) * PIXEL_UNITS + PIXEL_UNITS / 2 });

function relay() {
  const rooms = new Map();
  const ROOMS = { idFromName: (n) => n, get: (n) => rooms.get(n) ?? room(n) };
  function room(key) {
    const store = new Map();
    const socks = new Map();
    const r = {
      key, env: { ROOMS }, junked: 0,
      state: { storage: { get: async (k) => structuredClone(store.get(k)), put: async (k, v) => { store.set(k, structuredClone(v)); }, delete: async (k) => store.delete(k) } },
      store, _all: () => socks.entries(), _send: (ws, s) => { ws.got.push(JSON.parse(s)); return true; }, _junk: () => { r.junked++; },
      join(id, extra = {}) { const ws = { got: [] }; socks.set(ws, { id, key, ...extra }); return { ws, a: socks.get(ws) }; },
      async fetch(req) {
        const p = new URL(req.url).pathname;
        return p === SEV_INTERNAL_BOOK ? staffBookInternal(r) : p === SEV_INTERNAL_TELL ? staffTellInternal(r, req) : p === SEV_INTERNAL_CALL ? staffCallInternal(r, req) : new Response('no', { status: 404 });
      },
    };
    rooms.set(key, r);
    return r;
  }
  return { hub: room(SOCIAL_ROOM), room: (k) => rooms.get(k) ?? room(k) };
}

test('TOYBOX RELAY: the hub keeps an invasion\'s fields; its cell counts no word of a screen, before it begins or after', async () => {
  const { ev } = /** @type {any} */ (toyboxStaffEvent({ kind: 'invasion', place: BAY, family: 'daedra', id: 'tb12cd34ef', at: AT, by: 'Dev' }));
  const R = relay();
  const elsewhere = R.hub.join('far-away', { tb: 1 });
  const older = R.hub.join('old-game');
  const r = await takeStaffEventOrder(R.hub, { o: 'sevent', s: 'acct', op: 'start', ev }, AT);
  assert.deepEqual([r.ok, r.l[0].tb, r.l[0].fm, r.l[0].go], [true, 1, 0, AT + TOYBOX_EVENT_WAIT_MS]);
  assert.deepEqual(elsewhere.ws.got.at(-1).l[0], ev, 'said to everyone online whose game reads it, whole');
  assert.deepEqual(older.ws.got.at(-1).l, [], 'a game whose hello did not say it reads a toybox event hears none: it would stand its monsters at once');
  const cell = R.room(worldRoom(ev.px, ev.py));
  const ann = cell.join('ann', { sub: 'acctA', name: 'Ann', pose: poseOn(ev.px, ev.py) });
  const w = (n, more = {}) => ({ k: 'w', id: ev.id, px: ev.px, py: ev.py, n, s: 1, bu: 0, bk: 0, fb: 0, h: n, ...more });
  // THE WAIT: a word before `go` is no word
  await staffEventWord(cell, ann.ws, ann.a, w(5), ev.go - 1);
  assert.equal(cell._sevLed?.get(ev.id), undefined, 'no ledger before it begins');
  assert.deepEqual(ann.ws.got, []);
  // begun: still no word of a screen counts - an invasion's ledger is its fight's (server/src/invasionFights.js)
  await staffEventWord(cell, ann.ws, ann.a, w(INVASION_METER, { bu: 1, bk: 1 }), ev.go + 60_000);
  assert.equal(cell._sevLed?.get(ev.id), undefined, 'no ledger of words');
  assert.deepEqual(ann.ws.got, []);
  assert.equal(elsewhere.ws.got.some((m) => m.k === 'tb' || m.k === 'end'), false, 'no moment and no end from a word');
});

// ═══ THE ACCOUNT SERVICE ═══
const RELAY = 'https://relay.example' + SAFE_LAW_PATH;
async function stand() {
  const s = await standService({ DEVELOPER_HANDLES: 'SirMcMobdon', RELAY_LAW_URL: RELAY });
  const R = relay();
  R.hub._loadKey = async () => {};
  R.hub._verifyKey = s.identityPublic;
  const door = { pushed: 0, strip: false };
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) !== RELAY) return real(url, init);
    door.pushed++;
    const said = await takeStaffEventLaw(R.hub, JSON.parse(init.body).order, Date.now());
    // an older relay: it keeps the event and drops the fields its law does not know
    if (door.strip && said.l) said.l = said.l.map(({ tb, fm, go, ...e }) => e);
    return Response.json(said.ok ? said : { ...said, error: 'not taken' }, { status: said.ok ? 200 : 409 });
  };
  const dev = await s.registered('SirMcMobdon');
  const player = await s.registered('Asynian');
  return { ...s, R, door, dev, player, raw: s.env.DB._raw, restore: () => { globalThis.fetch = real; } };
}

test('TOYBOX ROUTE: a developer\'s game session stages an invasion and a dragon attack past the Bay; anyone else is refused; each written down; an old relay\'s is ended', async () => {
  const s = await stand();
  try {
    assert.ok(ROUTES.has(DEV_EVENT_PATH));
    // not a developer: refused, nothing pushed
    const no = await s.call(DEV_EVENT_PATH, { kind: 'invasion', city: BAY, family: 'orcs' }, s.player.secret);
    assert.deepEqual([no.status, no.body], [403, { error: 'not-developer' }]);
    assert.equal(s.door.pushed, 0);
    // an invasion at a Bay city
    let r = await s.call(DEV_EVENT_PATH, { kind: 'invasion', city: BAY, family: 'orcs' }, s.dev.secret);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.event.tb, r.body.event.fm, r.body.event.go - r.body.event.at], [1, 3, TOYBOX_EVENT_WAIT_MS]);
    assert.ok(s.R.hub._sevBook.some((e) => e.id === r.body.event.id && e.tb === 1), 'the hub\'s own law took it, its fields kept');
    // a dragon attack at a city past the Bay
    r = await s.call(DEV_EVENT_PATH, { kind: 'dragon', city: PAST }, s.dev.secret);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual([r.body.event.tb, r.body.event.loc, r.body.event.mt], [2, PAST.loc, [512]]);
    // refusals by name, before the relay is asked
    const before = s.door.pushed;
    r = await s.call(DEV_EVENT_PATH, { kind: 'invasion', city: BAY, family: 'gnomes' }, s.dev.secret);
    assert.deepEqual([r.status, r.body], [400, { error: 'event-bad-family' }]);
    r = await s.call(DEV_EVENT_PATH, { kind: 'dragon', city: { ...PAST, rg: 17 } }, s.dev.secret);
    assert.deepEqual([r.status, r.body], [400, { error: 'event-bad-town' }]);
    assert.equal(s.door.pushed, before);
    // the rows and the audit
    const rows = s.raw.prepare("SELECT state FROM staff_events WHERE state = 'live'").all();
    assert.equal(rows.length, 2);
    const audit = s.raw.prepare('SELECT outcome FROM staff_audit WHERE act = ?').all(DEV_EVENT_ACT).map((x) => x.outcome);
    assert.deepEqual(audit, ['ok', 'ok', 'failed', 'failed']);
    // an older relay drops the fields: the event is ended there and the developer told
    s.door.strip = true;
    r = await s.call(DEV_EVENT_PATH, { kind: 'dragon', city: BAY }, s.dev.secret);
    assert.deepEqual([r.status, r.body], [409, { error: 'event-relay-old' }]);
    assert.equal(s.R.hub._sevBook.length, 2, 'ended at the hub');
  } finally {
    s.restore();
  }
});
