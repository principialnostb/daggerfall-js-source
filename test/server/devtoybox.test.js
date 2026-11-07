// The toybox's grant (server-account/src/devToybox.js): a developer's own game session sends a piece the window made, as
// a piece of the server's post, to their own account or another's. A non-developer and a guest are refused, a piece the
// item law finds is refused (a special effect's too), a bound piece is lawful, and a live character's record is never
// seized: the piece waits in the post and its own session claims it under its own lease.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standService } from '../accountDb.mjs';
import { seatRealm, recordOf } from '../realmSeat.mjs';
import { ROUTES, OPEN_ROUTES } from '../../server-account/src/service.js';
import { DEV_GRANT_PATH, DEV_GRANT_BATCH, DEV_GRANT_ACT, DEV_GRANT_BODY, devGrantSubject } from '../../server-account/src/devToybox.js';
import { POST_BATCH_RE, POST_BODY_MAX, POST_SENDER } from '../../src/net/postLaw.js';

const grant = (svc, who, body) => svc.call(DEV_GRANT_PATH, body, who.secret);
const posts = (svc, who) => svc.env.DB._raw.prepare('SELECT id, batch, sender, subject, body, item FROM server_post WHERE to_id = ?').all(who.id);
const audits = (svc) => svc.env.DB._raw.prepare('SELECT actor, act, target, detail, outcome FROM staff_audit WHERE act = ?').all(DEV_GRANT_ACT);
const LONGSWORD = { template: 120, material: 7 };

test('the route is listed behind a session, and its words fit the post', () => {
  assert.ok(ROUTES.has(DEV_GRANT_PATH) && !OPEN_ROUTES.has(DEV_GRANT_PATH));
  assert.match(DEV_GRANT_BATCH + 'a'.repeat(24), POST_BATCH_RE);
  assert.ok(DEV_GRANT_BODY.length <= POST_BODY_MAX);
  assert.ok(devGrantSubject('x'.repeat(200)).length <= 80);
});

test('a guest and a player who is not a developer are refused, and nothing is written', async () => {
  const svc = await standService({ DEVELOPER_HANDLES: 'Dev' });
  const g = await svc.guest();
  const ann = await svc.registered('Ann');
  assert.deepEqual(await grant(svc, g, { spec: LONGSWORD }), { status: 403, body: { error: 'not-developer' } });
  assert.deepEqual(await grant(svc, ann, { spec: LONGSWORD }), { status: 403, body: { error: 'not-developer' } });
  assert.equal(svc.env.DB._raw.prepare('SELECT COUNT(*) AS n FROM server_post').get().n, 0);
  assert.equal((await svc.call(DEV_GRANT_PATH, { spec: LONGSWORD })).status, 401, 'no session, no door');
});

test('an unlawful piece and a bad spec are refused and audited as failed', async () => {
  const svc = await standService({ DEVELOPER_HANDLES: 'Dev' });
  const dev = await svc.registered('Dev');
  // a power past the piece's own: an iron dagger holds far less than eleven of the dearest rows
  const r = await grant(svc, dev, { spec: { template: 113, material: 0, enchantments: [{ type: 'ExtraSpellPts', param: 0 }, { type: 'PotentVs', param: 0 }, { type: 'RegensHealth', param: 0 }] } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'toybox-unlawful');
  assert.ok(r.body.findings.includes('enchantments'), JSON.stringify(r.body));
  assert.deepEqual(await grant(svc, dev, { spec: { template: 120, material: 99 } }), { status: 400, body: { error: 'toybox-material' } });
  assert.deepEqual(await grant(svc, dev, { spec: { template: 78 } }), { status: 400, body: { error: 'toybox-template' } }, 'a drug is worn by nobody');
  assert.equal(posts(svc, dev).length, 0);
  const rows = audits(svc);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((a) => a.outcome === 'failed' && a.actor === dev.id));
});

test('special effects: a lawful set piece is sent; a set mark the law refuses is refused online', async () => {
  const svc = await standService({ DEVELOPER_HANDLES: 'Dev' });
  const dev = await svc.registered('Dev');
  const line = { kind: 'line', id: 'damage', value: 8 };
  const ok = await grant(svc, dev, { spec: { ...LONGSWORD, special: [line, { kind: 'set', id: 'malacath' }] } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual([ok.body.item.rarity, ok.body.item.sigil.set], ['magic', 'malacath']);
  const r = await grant(svc, dev, { spec: { ...LONGSWORD, special: [line, { kind: 'set', id: 'ruhn' }] } });
  assert.deepEqual([r.status, r.body.error, r.body.findings], [400, 'toybox-unlawful', ['sigil']]);
  assert.deepEqual(await grant(svc, dev, { spec: { template: 135, special: [line] } }), { status: 400, body: { error: 'toybox-special' } });
});

test('to the developer themselves: a bound piece is lawful, sent as their post, and claimed into the record they play under its own lease', async () => {
  const svc = await standService({ DEVELOPER_HANDLES: 'Dev' });
  const dev = await svc.registered('Dev');
  const R = await seatRealm(svc.env, dev.secret, 'Dev', { name: 'Dev', level: 10, goldPieces: 5, items: [] });
  const was = R.at();
  const r = await grant(svc, dev, { spec: { ...LONGSWORD, bound: true, name: 'Toy Blade', value: 7 }, to: '' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.ok, true);
  assert.deepEqual(r.body.to, { account: dev.id, name: 'Dev', self: true });
  assert.equal(r.body.playing, true, 'the developer is playing now');
  assert.equal(r.body.item.bound, true);
  assert.equal(r.body.item.name, 'Toy Blade');
  assert.deepEqual(R.at(), was, 'the record is never seized: its lease and sequence stand');
  const [p] = posts(svc, dev);
  assert.deepEqual([p.id, p.batch, p.sender, p.subject], [r.body.post, DEV_GRANT_BATCH + r.body.post, POST_SENDER, 'A gift: Toy Blade']);
  const c = await svc.call('/v1/post/claim', { id: r.body.post, character: R.id, realm: R.at() }, dev.secret);
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.deepEqual(recordOf(svc.env, R.id).items, [r.body.item], 'the piece in the record');
  const [a] = audits(svc);
  assert.equal(a.outcome, 'ok');
  assert.equal(a.target, dev.id);
  assert.equal(JSON.parse(a.detail).post, r.body.post);
});

test('to another account: one playing now and one away each find it waiting in their post; a guest, an unknown handle and a junk name are refused', async () => {
  const svc = await standService({ DEVELOPER_HANDLES: 'Dev' });
  const dev = await svc.registered('Dev');
  const ann = await svc.registered('Ann'), bob = await svc.registered('Bob');
  const A = await seatRealm(svc.env, ann.secret, 'Ann');
  const annWas = A.at();
  const live = await grant(svc, dev, { spec: { template: 135 }, to: 'ann' });
  assert.equal(live.status, 200, JSON.stringify(live.body));
  assert.deepEqual([live.body.to.self, live.body.to.account, live.body.playing], [false, ann.id, true]);
  assert.deepEqual(A.at(), annWas, 'a live record is never seized');
  assert.equal(posts(svc, ann).length, 1);
  const away = await grant(svc, dev, { spec: { template: 102, material: 0x0209 }, to: 'Bob' });
  assert.equal(away.status, 200);
  assert.deepEqual([away.body.to.account, away.body.playing], [bob.id, false]);
  assert.equal(JSON.parse(posts(svc, bob)[0].item).material, 0x0209);
  assert.equal(posts(svc, dev).length, 0, 'nothing for the developer');
  const g = await svc.guest();
  assert.deepEqual(await grant(svc, dev, { spec: LONGSWORD, to: g.name }), { status: 400, body: { error: 'dev-target-guest' } });
  assert.deepEqual(await grant(svc, dev, { spec: LONGSWORD, to: 'Nobody' }), { status: 404, body: { error: 'no-player' } });
  assert.deepEqual(await grant(svc, dev, { spec: LONGSWORD, to: 42 }), { status: 400, body: { error: 'body' } });
});
