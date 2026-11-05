// The Online door against a failing realm: which failures are waited out, what each says, the tiles kept on this device,
// and the popup a copy to offline raises.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realmMayClear, realmFailureText, askThroughBusy, realmIssuesText, realmMissingText, realmContactingText, realmOkText, REALM_BUSY_MAX_MS } from '../../src/systems/realmRetry.js';
import { realmBootRefusalText, realmRefusalText, createRealmSession, realmNotYoursText, realmIo, openRealmBoot, setRealmNotice, takeRealmNoticeEntry, takeRealmNotice } from '../../src/systems/realmSaves.js';
import { standService, sessionStorageOf } from '../accountDb.mjs';
import { SESSION_KEY, forgetSession } from '../../src/net/accountClient.js';
import { readRoster, keepRoster, rosterSaved, rosterDropped, forgetRoster, REALM_ROSTER_PREFIX } from '../../src/systems/realmRoster.js';
import { openRealmContact, withRealmContact, showRealmMessage, REALM_CANCELLED } from '../../src/ui/enhanced/realmContact.js';

const online = () => true;
const offline = () => false;

test('a 5xx, a 429 and no answer while online are waited out; a 4xx and a known offline device are not', () => {
  assert.equal(realmMayClear({ ok: false, error: 'server', status: 503 }, online), true);
  assert.equal(realmMayClear({ ok: false, error: 'boom', status: 500 }, online), true);
  assert.equal(realmMayClear({ ok: false, error: 'rate', status: 429 }, online), true);
  assert.equal(realmMayClear({ ok: false, error: 'offline' }, online), true);
  assert.equal(realmMayClear({ ok: false, error: 'offline' }, offline), false);
  assert.equal(realmMayClear({ ok: false, error: 'no-realm-character', status: 404 }, online), false);
  assert.equal(realmMayClear({ ok: false, error: 'auth', status: 401 }, online), false);
  assert.equal(realmMayClear({ ok: false, error: 'server' }, online), false, 'a body that would not read is no 5xx');
});

test('the owner’s words: busy, issues, missing, contacting and OK', () => {
  assert.equal(realmIssuesText(), 'Our servers are experiencing issues, please try again later...');
  assert.equal(realmMissingText(), 'Server cannot be found currently.');
  assert.equal(realmContactingText(), 'Contacting server...');
  assert.equal(realmOkText(), 'OK');
});

test('a refused Play: a 4xx says the server cannot be found, any other service failure says issues, a local refusal its own words', () => {
  assert.equal(realmBootRefusalText({ error: 'auth', status: 401 }), realmMissingText());
  assert.equal(realmBootRefusalText({ error: 'not-found', status: 404 }), realmMissingText());
  assert.equal(realmBootRefusalText({ error: 'server', status: 503 }), realmIssuesText(), 'a 5xx past the wait');
  assert.equal(realmBootRefusalText({ error: 'rate', status: 429 }), realmIssuesText(), 'a 429 past the wait');
  assert.equal(realmBootRefusalText({ error: 'offline' }), realmIssuesText());
  assert.equal(realmBootRefusalText({ error: 'signed-out' }), realmRefusalText('signed-out'));
  assert.equal(realmBootRefusalText({ error: 'private' }), realmRefusalText('private'));
});

test('a copy’s failure: every service failure says issues, a 4xx too; no room on the device keeps its words', () => {
  assert.equal(realmFailureText({ error: 'no-data', status: 404 }), realmIssuesText());
  assert.equal(realmFailureText({ error: 'server', status: 502 }), realmIssuesText());
  assert.equal(realmFailureText({ error: 'no-room' }), null);
});

/** A clock the waits move, so no test sleeps. */
function clock() {
  let t = 0;
  const waits = [];
  return { waits, now: () => t, wait: async (ms) => { waits.push(ms); t += ms; }, rand: () => 0.5 };
}

test('an ask a 500 refuses is asked again with growing waits until it lands', async () => {
  const c = clock();
  let asked = 0;
  let busy = 0;
  const r = await askThroughBusy(async () => (++asked < 4 ? { ok: false, error: 'server', status: 500 } : { ok: true }), { ...c, online, onBusy: () => { busy++; } });
  assert.equal(r.ok, true);
  assert.equal(asked, 4);
  assert.equal(busy, 1, 'the first wait is heard once');
  assert.ok(c.waits.every((ms, i) => i === 0 || ms >= c.waits[i - 1]), 'each wait at least the last');
});

test('an ask a 4xx refuses comes back at once', async () => {
  const c = clock();
  const r = await askThroughBusy(async () => ({ ok: false, error: 'no-realm-character', status: 404 }), { ...c, online });
  assert.equal(r.status, 404);
  assert.equal(c.waits.length, 0);
});

test('a realm busy for good is given up inside the bound', async () => {
  const c = clock();
  const r = await askThroughBusy(async () => ({ ok: false, error: 'server', status: 503 }), { ...c, online });
  assert.equal(r.status, 503);
  assert.ok(c.now() <= REALM_BUSY_MAX_MS);
});

/** A device's store. */
function store() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
const row = (id, level, extra = {}) => ({ id, name: `N${id}`, summary: { level, race: 'breton' }, bytes: 10, updatedAt: 1, ...extra });

test('the roster is kept per account, without the moment’s "Playing now"', () => {
  const s = store();
  assert.equal(readRoster(s, 'acct-a'), null, 'nothing kept: the door asks the realm');
  keepRoster(s, 'acct-a', { characters: [row('r1', 3, { playing: true })], max: 4 });
  const kept = readRoster(s, 'acct-a');
  assert.deepEqual(kept, { characters: [row('r1', 3)], max: 4 });
  assert.equal(readRoster(s, 'acct-b'), null, 'another account sees none of it');
  assert.equal(readRoster(s, null), null);
  assert.ok(s.m.has(`${REALM_ROSTER_PREFIX}acct-a`));
});

test('a save that lands brings its tile up to date; a delete drops it', () => {
  const s = store();
  keepRoster(s, 'acct-a', { characters: [row('r1', 3), row('r2', 9)], max: 4 });
  rosterSaved(s, 'acct-a', 'r1', { level: 4, face: 2 }, 5_000_000);
  const [r1, r2] = readRoster(s, 'acct-a').characters;
  assert.deepEqual(r1.summary, { level: 4, race: 'breton', face: 2 });
  assert.equal(r1.updatedAt, 5_000);
  assert.deepEqual(r2, row('r2', 9), 'the other tile stays');
  rosterDropped(s, 'acct-a', 'r2');
  assert.deepEqual(readRoster(s, 'acct-a').characters.map((r) => r.id), ['r1']);
});

test('a save that lands on a device that kept no roster keeps none', () => {
  const s = store();
  rosterSaved(s, 'acct-a', 'r1', { level: 4 });
  assert.equal(readRoster(s, 'acct-a'), null);
});

test('a realm session’s landed checkpoint writes the tile’s summary', async () => {
  const s = store();
  keepRoster(s, 'acct-a', { characters: [row('r1', 3)], max: 4 });
  const fetch = async () => new Response(JSON.stringify({ seq: 8 }), { status: 200, headers: { 'content-type': 'application/json' } });
  const io = { fetch, base: 'https://realm.test', secret: 'sec', storage: s, player: 'acct-a' };
  const session = createRealmSession({ io, id: 'r1', lease: 'L', seq: 7, later: () => () => {}, hidden: () => false, watchHidden: () => () => {}, now: () => 9_000_000 });
  const r = await session.checkpoint('{"name":"Nr1"}', { level: 5 });
  assert.equal(r.ok, true);
  assert.equal(readRoster(s, 'acct-a').characters[0].summary.level, 5);
  assert.equal(readRoster(s, 'acct-a').characters[0].updatedAt, 9_000);
});

/** Just enough of a document for the popup. */
function fakeDoc() {
  const make = (tag) => {
    const n = { tag, className: '', textContent: '', children: [], attrs: {}, listeners: {}, removed: false, focused: false, parent: null };
    n.append = (...kids) => { for (const k of kids) { k.parent = n; n.children.push(k); } };
    n.setAttribute = (k, v) => { n.attrs[k] = v; };
    n.addEventListener = (type, fn) => { (n.listeners[type] ??= []).push(fn); };
    n.remove = () => { n.removed = true; if (n.parent) n.parent.children = n.parent.children.filter((c) => c !== n); };
    n.focus = () => { n.focused = true; };
    n.click = () => { for (const fn of n.listeners.click ?? []) fn({ stopPropagation() {} }); };
    return n;
  };
  const body = make('body');
  return { body, createElement: make };
}
const find = (n, pred) => (pred(n) ? n : n.children.map((c) => find(c, pred)).find(Boolean) ?? null);

test('the popup greys the screen under "Contacting server..." and goes when the act lands', async () => {
  const doc = fakeDoc();
  let release;
  const running = withRealmContact(() => new Promise((r) => { release = r; }), { doc });
  await new Promise((r) => { setImmediate(r); });
  const shell = doc.body.children[0];
  assert.equal(shell.className, 'dlg-shell', 'the decision box’s scrim');
  assert.equal(find(shell, (n) => n.className.startsWith('dlg-row')).textContent, 'Contacting server...');
  assert.equal(find(shell, (n) => n.tag === 'button').textContent, 'Cancel', 'only Cancel while it asks');
  release({ ok: true });
  assert.deepEqual(await running, { ok: true });
  assert.equal(doc.body.children.length, 0, 'gone once the act lands');
});

test('a failed act says the servers have issues, and OK closes the popup', async () => {
  const doc = fakeDoc();
  const running = withRealmContact(async () => ({ ok: false, error: 'server', status: 503 }), { doc });
  await new Promise((r) => { setImmediate(r); });
  const shell = doc.body.children[0];
  assert.equal(find(shell, (n) => n.className.startsWith('dlg-row')).textContent, realmIssuesText());
  const ok = find(shell, (n) => n.tag === 'button');
  assert.equal(ok.textContent, 'OK');
  assert.equal(ok.focused, true);
  ok.click();
  assert.equal((await running).ok, false);
  assert.equal(doc.body.children.length, 0);
});

test('a copy with no room on the device says so in the popup', async () => {
  const doc = fakeDoc();
  const running = withRealmContact(async () => ({ ok: false, error: 'no-room' }), { doc });
  await new Promise((r) => { setImmediate(r); });
  assert.equal(find(doc.body, (n) => n.className.startsWith('dlg-row')).textContent, realmRefusalText('no-room'));
  find(doc.body, (n) => n.tag === 'button').click();
  await running;
});

test('an act that throws is a failure of the service', async () => {
  const doc = fakeDoc();
  const running = withRealmContact(async () => { throw new Error('x'); }, { doc });
  await new Promise((r) => { setImmediate(r); });
  assert.equal(find(doc.body, (n) => n.className.startsWith('dlg-row')).textContent, realmIssuesText());
  find(doc.body, (n) => n.tag === 'button').click();
  await running;
  const popup = openRealmContact(doc);
  popup.close();
  assert.equal(doc.body.children.length, 0);
});

test('a character not the account\u2019s says so: the service\u2019s refusal and one of no realm shape alike', () => {
  assert.equal(realmNotYoursText(), 'This character does not belong to you.');
  assert.equal(realmBootRefusalText({ error: 'no-realm-character', status: 404 }), realmNotYoursText());
  assert.equal(realmBootRefusalText({ error: 'no-realm-character' }), realmNotYoursText());
});

test('Play on another account\u2019s character is refused by the service, and the door says it is not yours', async () => {
  const svc = await standService();
  const owner = await svc.seated('Boltamist');
  const other = await svc.seated('Prilla');
  const ioOf = (who) => realmIo({ fetch: svc.fetch, storage: { ...sessionStorageOf(SESSION_KEY, who), setItem() {}, removeItem() {} } });
  const theirs = await openRealmBoot({ io: ioOf(other), id: owner.character, wait: async () => {} });
  assert.deepEqual(theirs, { ok: false, error: 'no-realm-character', status: 404 }, 'the join is the owner\u2019s alone');
  assert.equal(realmBootRefusalText(theirs), realmNotYoursText());
  const mine = await openRealmBoot({ io: ioOf(owner), id: owner.character, wait: async () => {} });
  assert.equal(mine.ok, true, 'the owner plays it');
});

test('a refused Play\u2019s word rides the reload as a popup\u2019s, once; any other notice is the door\u2019s line', () => {
  const s = store();
  setRealmNotice(s, 'This character does not belong to you.', { popup: true });
  assert.deepEqual(takeRealmNoticeEntry(s), { text: 'This character does not belong to you.', popup: true });
  assert.equal(takeRealmNoticeEntry(s), null, 'taken once');
  setRealmNotice(s, 'You left the realm.');
  assert.deepEqual(takeRealmNoticeEntry(s), { text: 'You left the realm.', popup: false });
  setRealmNotice(s, 'a', { popup: true });
  setRealmNotice(s, 'b');
  assert.equal(takeRealmNotice(s), 'b');
  assert.equal(s.m.size, 0, 'nothing left behind');
});

test('the message popup says its words, and OK closes it', async () => {
  const doc = fakeDoc();
  const shown = showRealmMessage(doc, realmNotYoursText());
  assert.equal(find(doc.body, (n) => n.className.startsWith('dlg-row')).textContent, 'This character does not belong to you.');
  find(doc.body, (n) => n.tag === 'button').click();
  await shown;
  assert.equal(doc.body.children.length, 0);
});

test('signing out takes that account\u2019s kept tiles off the device, and no other account\u2019s', () => {
  const s = store();
  keepRoster(s, 'acct-a', { characters: [row('r1', 3)], max: 4 });
  keepRoster(s, 'acct-b', { characters: [row('r2', 5)], max: 4 });
  s.setItem(SESSION_KEY, JSON.stringify({ secret: 'sec-a', id: 'acct-a' }));
  forgetSession(s);
  assert.equal(readRoster(s, 'acct-a'), null, 'the signed-out account\u2019s tiles are gone');
  assert.ok(readRoster(s, 'acct-b'), 'another account\u2019s stay');
  assert.equal(s.getItem(SESSION_KEY), null);
  assert.equal(forgetRoster(s, null), false, 'no account, nothing to forget');
});

test('Cancel ends the act at once, closes the popup, and a late answer writes nothing', async () => {
  const doc = fakeDoc();
  let release;
  let wrote = false;
  const running = withRealmContact(async ({ cancelled }) => {
    await new Promise((r) => { release = r; });
    if (cancelled()) return { ok: false, error: 'cancelled' };
    wrote = true;
    return { ok: true };
  }, { doc });
  await new Promise((r) => { setImmediate(r); });
  find(doc.body, (n) => n.tag === 'button').click();
  assert.equal(await running, REALM_CANCELLED, 'answered without waiting for the realm');
  assert.equal(doc.body.children.length, 0, 'the popup is gone');
  release();
  await new Promise((r) => { setImmediate(r); });
  assert.equal(wrote, false, 'the copy is never written');
});

test('a busy realm is not asked again once the act is cancelled', async () => {
  const c = clock();
  let asked = 0;
  let cancelled = false;
  const r = await askThroughBusy(async () => { asked++; return { ok: false, error: 'server', status: 503 }; }, {
    ...c, online, cancelled: () => cancelled, wait: async (ms) => { await c.wait(ms); cancelled = true; },
  });
  assert.equal(r.status, 503);
  assert.equal(asked, 1, 'the wait it was in is its last');
});
