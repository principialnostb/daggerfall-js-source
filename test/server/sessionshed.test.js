// The session lookup's own shed (accounts.js resolveSession): a secret not in mintSecret's shape asks D1 nothing, a
// secret the primary did not know is refused from memory for SESSION_MISS_KEPT_S, and a replica's miss is never kept.
// And one address counted across isolates by Cloudflare's limiter (overAddressLimit, wrangler.toml ADDRESS_LIMIT).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1, standService } from '../accountDb.mjs';
import {
  createGuest, resolveSession, closeSession, mintSecret, SECRET_RE, SESSION_MISS_KEPT_S, SESSION_MISS_KEYS,
  overAddressLimit, ADDRESS_MAX,
} from '../../server-account/src/accounts.js';
import { DB_ROOT, DB_FIRST_PRIMARY } from '../../server-account/src/service.js';

const { subtle } = globalThis.crypto;
const rand = (b) => globalThis.crypto.getRandomValues(b);
const NOW = 1_790_000_000;

/** D1 with its statements counted. */
function counted(db) {
  const log = { statements: 0 };
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    log.statements++;
    return prepare(sql);
  };
  return log;
}

/** A replica session over `root`: its statements answered by `root`, and its lookup the replica's own. */
const replicaOf = (root, { firstPrimary = false } = {}) =>
  new Proxy(root, {
    get(target, key) {
      if (key === DB_ROOT) return target;
      if (key === DB_FIRST_PRIMARY) return firstPrimary;
      const v = Reflect.get(target, key);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });

test('every minted secret is in the shape the lookup accepts; nothing else is', () => {
  for (let i = 0; i < 200; i++) assert.match(mintSecret(rand), SECRET_RE);
  for (const bad of ['', 'x'.repeat(42), 'x'.repeat(44), `${'x'.repeat(42)}=`, `${'x'.repeat(42)}+`, 'x'.repeat(128)])
    assert.doesNotMatch(bad, SECRET_RE, JSON.stringify(bad));
});

test('a secret not in the minted shape is refused without a statement', async () => {
  const db = d1();
  const log = counted(db);
  for (const bad of ['x'.repeat(32), 'x'.repeat(128), 'SECRETSECRETSECRETSECRET', `${'x'.repeat(42)}.`])
    assert.equal(await resolveSession({ db, subtle, nowS: NOW }, bad), null);
  assert.equal(log.statements, 0);
});

test('a secret the primary did not know is refused from memory, until SESSION_MISS_KEPT_S has passed', async () => {
  const db = d1();
  const log = counted(db);
  const nobody = mintSecret(rand);
  assert.equal(await resolveSession({ db, subtle, nowS: NOW }, nobody), null);
  assert.equal(log.statements, 1, 'the first miss asks');
  assert.equal(await resolveSession({ db, subtle, nowS: NOW + SESSION_MISS_KEPT_S - 1 }, nobody), null);
  assert.equal(log.statements, 1, 'the kept miss asks nothing');
  assert.equal(await resolveSession({ db, subtle, nowS: NOW + SESSION_MISS_KEPT_S }, nobody), null);
  assert.equal(log.statements, 2, 'past its time it asks again');
});

test('a live session is never refused by a miss kept for another secret, nor by another database\'s', async () => {
  const a = d1(), b = d1();
  const made = await createGuest({ db: b, subtle, rand, nowS: NOW }, { deviceLabel: 'b' });
  assert.equal(await resolveSession({ db: a, subtle, nowS: NOW }, made.secret), null, 'database a has no such session');
  assert.ok(await resolveSession({ db: b, subtle, nowS: NOW }, made.secret), 'database b still resolves it');
  assert.equal(await resolveSession({ db: b, subtle, nowS: NOW }, mintSecret(rand)), null);
  assert.ok(await resolveSession({ db: b, subtle, nowS: NOW }, made.secret), 'and still after another secret missed');
});

test('a signed-out secret is refused, and its miss kept', async () => {
  const db = d1();
  const made = await createGuest({ db, subtle, rand, nowS: NOW }, { deviceLabel: 'x' });
  const who = await resolveSession({ db, subtle, nowS: NOW }, made.secret);
  await closeSession({ db }, who.session.id);
  const log = counted(db);
  assert.equal(await resolveSession({ db, subtle, nowS: NOW + 1 }, made.secret), null);
  assert.equal(await resolveSession({ db, subtle, nowS: NOW + 2 }, made.secret), null);
  assert.equal(log.statements, 1);
});

test('a replica\'s miss is never kept: the session may be one minted a moment ago', async () => {
  const root = d1();
  const log = counted(root);
  const secret = mintSecret(rand);
  const replica = replicaOf(root);
  assert.equal(await resolveSession({ db: replica, primary: root, subtle, nowS: NOW }, secret), null);
  assert.equal(await resolveSession({ db: replica, primary: root, subtle, nowS: NOW }, secret), null);
  assert.equal(log.statements, 2, 'each replica miss asked again');
  const fromPrimary = replicaOf(root, { firstPrimary: true });
  await resolveSession({ db: fromPrimary, primary: root, subtle, nowS: NOW }, secret);
  await resolveSession({ db: fromPrimary, primary: root, subtle, nowS: NOW }, secret);
  assert.equal(log.statements, 3, 'a session begun at the primary keeps its miss');
});

test('the kept misses are bounded: past SESSION_MISS_KEYS the oldest goes first', async () => {
  const db = d1();
  const first = mintSecret(rand);
  await resolveSession({ db, subtle, nowS: NOW }, first);
  for (let i = 0; i < SESSION_MISS_KEYS; i++) await resolveSession({ db, subtle, nowS: NOW }, mintSecret(rand));
  const log = counted(db);
  await resolveSession({ db, subtle, nowS: NOW }, first);
  assert.equal(log.statements, 1, 'the oldest was let go, so it asks');
});

test('the limiter refuses only when it says so; no limiter, no address, or a failing one refuses no one', async () => {
  const said = [];
  const limiter = (success) => ({ limit: async (o) => (said.push(o.key), { success }) });
  assert.equal(await overAddressLimit(limiter(false), '198.51.100.9'), true);
  assert.equal(await overAddressLimit(limiter(true), '198.51.100.9'), false);
  assert.deepEqual(said, ['198.51.100.9', '198.51.100.9'], 'keyed by the address');
  assert.equal(await overAddressLimit(undefined, '198.51.100.9'), false);
  assert.equal(await overAddressLimit(limiter(false), null), false, 'the relay comes through its binding with no address');
  assert.equal(await overAddressLimit({ limit: async () => { throw new Error('down'); } }, '198.51.100.9'), false);
});

test('an address the limiter refuses is answered 429 before any statement', async (t) => {
  t.mock.method(Date, 'now', () => 2_000_600_001 * 1000);
  const s = await standService();
  const log = counted(s.env.DB);
  s.env.ADDRESS_LIMIT = { limit: async ({ key }) => ({ success: key !== '198.51.100.10' }) };
  const init = (ip) => ({ method: 'GET', headers: { authorization: `Bearer ${mintSecret(rand)}`, 'cf-connecting-ip': ip } });
  const over = await s.fetch('https://accounts.invalid/v1/account', init('198.51.100.10'));
  assert.equal(over.status, 429);
  assert.equal((await over.json()).error, 'rate');
  assert.equal(log.statements, 0);
  assert.equal((await s.fetch('https://accounts.invalid/v1/account', init('198.51.100.11'))).status, 401, 'another address is asked');
});

test('the limiter\'s binding counts ADDRESS_MAX a minute', () => {
  const toml = readFileSync(new URL('../../server-account/wrangler.toml', import.meta.url), 'utf8');
  const block = /\[\[ratelimits\]\]\s*\nname = "ADDRESS_LIMIT"\s*\nnamespace_id = "\d+"\s*\nsimple = \{ limit = (\d+), period = (\d+) \}/.exec(toml);
  assert.ok(block, 'wrangler.toml binds ADDRESS_LIMIT');
  assert.equal(Number(block[1]), ADDRESS_MAX);
  assert.equal(Number(block[2]), 60);
});
