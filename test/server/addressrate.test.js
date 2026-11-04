// One address's ceiling across every route of the account service (accounts.js overAddressRate): counted in memory, asked
// before anything reaches D1, and blind to the relay's service binding, which carries no address.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standService } from '../accountDb.mjs';
import { overAddressRate, ADDRESS_MAX, ACCOUNT_MAX, ACCOUNT_WINDOW_S } from '../../server-account/src/accounts.js';

/** The Worker with its clock held, so no window turns under a test, and every statement it prepares counted. */
async function held(t, nowS) {
  t.mock.method(Date, 'now', () => nowS * 1000);
  const s = await standService();
  const prepare = s.env.DB.prepare.bind(s.env.DB);
  const log = { statements: 0 };
  s.env.DB.prepare = (sql) => {
    log.statements++;
    return prepare(sql);
  };
  return { ...s, log };
}

/** A request from an address, carrying a token nobody holds, long enough that the session lookup asks D1 about it. */
const junk = (ip) => ({
  method: 'GET',
  headers: { authorization: `Bearer ${'x'.repeat(32)}`, ...(ip ? { 'cf-connecting-ip': ip } : {}) },
});

test('the ceiling leaves room for several accounts flat out behind one router', () => {
  assert.ok(ADDRESS_MAX >= ACCOUNT_MAX * 5);
});

test('an address is refused past the ceiling; another is not, and the next window starts fresh', () => {
  const t = Math.floor(2_000_000_000 / ACCOUNT_WINDOW_S) * ACCOUNT_WINDOW_S + 1;
  for (let i = 0; i < ADDRESS_MAX; i++) assert.equal(overAddressRate('198.51.100.1', t), false, `call ${i + 1} within`);
  assert.equal(overAddressRate('198.51.100.1', t), true, 'the next over');
  assert.equal(overAddressRate('198.51.100.2', t), false, 'another address unaffected');
  assert.equal(overAddressRate('198.51.100.1', t + ACCOUNT_WINDOW_S), false, 'the next window starts fresh');
});

test('a request with no address is never counted, however many: the relay comes through its binding with none', () => {
  const t = 2_000_100_000;
  for (let i = 0; i < ADDRESS_MAX + 10; i++) assert.equal(overAddressRate(null, t), false);
  assert.equal(overAddressRate('', t), false);
});

test('an address over its ceiling is logged once a window, not once a request', (ctx) => {
  const warn = ctx.mock.method(console, 'warn', () => {});
  const t = Math.floor(2_000_200_000 / ACCOUNT_WINDOW_S) * ACCOUNT_WINDOW_S + 1;
  for (let i = 0; i < ADDRESS_MAX + 50; i++) overAddressRate('198.51.100.3', t);
  assert.equal(warn.mock.callCount(), 1);
  assert.ok(warn.mock.calls[0].arguments.includes('198.51.100.3'), 'the log names the address');
  for (let i = 0; i < ADDRESS_MAX + 1; i++) overAddressRate('198.51.100.3', t + ACCOUNT_WINDOW_S);
  assert.equal(warn.mock.callCount(), 2, 'the next window may log it again');
});

test('junk tokens past the ceiling cost D1 nothing: 429 before the session read, with CORS so a page can read it', async (t) => {
  const s = await held(t, 2_000_300_001);
  const ip = '198.51.100.4';
  const first = await s.fetch('https://accounts.invalid/v1/account', junk(ip));
  assert.equal(first.status, 401, 'within the ceiling a junk token is refused as ever');
  assert.ok(s.log.statements > 0, 'and that refusal read the session table');
  for (let i = 1; i < ADDRESS_MAX; i++) overAddressRate(ip, 2_000_300_001);
  s.log.statements = 0;
  const over = await s.fetch('https://accounts.invalid/v1/account', junk(ip));
  assert.equal(over.status, 429);
  assert.equal((await over.json()).error, 'rate');
  assert.ok(over.headers.get('access-control-allow-origin'), 'a refusal a browser can read');
  assert.equal(s.log.statements, 0, 'no statement');
});

test('the public siege read is under the ceiling too; another address and the relay still answer beside it', async (t) => {
  const s = await held(t, 2_000_400_001);
  const ip = '198.51.100.5';
  for (let i = 0; i < ADDRESS_MAX; i++) overAddressRate(ip, 2_000_400_001);
  const url = 'https://accounts.invalid/v1/seats/sieges/live';
  assert.equal((await s.fetch(url, { method: 'GET', headers: { 'cf-connecting-ip': ip } })).status, 429);
  assert.equal((await s.fetch(url, { method: 'GET', headers: { 'cf-connecting-ip': '198.51.100.6' } })).status, 200, 'another address');
  assert.equal((await s.fetch(url, { method: 'GET' })).status, 200, 'the relay: no address');
});

test('a preflight is never refused, so a browser still reads the 429 that follows it', async (t) => {
  const s = await held(t, 2_000_500_001);
  const ip = '198.51.100.7';
  for (let i = 0; i < ADDRESS_MAX + 1; i++) overAddressRate(ip, 2_000_500_001);
  const res = await s.fetch('https://accounts.invalid/v1/account', { method: 'OPTIONS', headers: { 'cf-connecting-ip': ip } });
  assert.equal(res.status, 204);
});
