// The account card's Discord row and the flow behind it: a code asked for and shown with the minutes it has left, a
// link the account read reports, and unlinking - each through the service's own routes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discordRow, codeMinutesLeft } from '../../../src/ui/enhanced/discordRow.js';
import { AccountFlow } from '../../../src/ui/accountFlow.js';
import { SESSION_KEY, DEFAULT_ACCOUNT_SERVICE } from '../../../src/net/accountClient.js';

/** Elements as plain objects: a tag, a class, text and children. */
const el = (tag, cls = '', txt = '') => ({ tag, cls, text: txt, kids: [], append(...k) { this.kids.push(...k); } });
const act = (label, onclick, o = {}) => ({ tag: 'button', label, onclick, ...o });
const words = (n) => (n ? [n.text, n.label, ...(n.kids ?? []).map(words)].filter(Boolean).join(' | ') : '');

test('the row: none for a guest or a service without the PDA; Link Discord to begin; a live code with its minutes; Linked as a name with Unlink', () => {
  const flow = { account: { handle: 'Avel' }, discord: { linked: false, canLink: true }, discordCode: null, busy: false };
  assert.equal(discordRow({ flow: { ...flow, account: { handle: null } }, el, act }), null);
  assert.equal(discordRow({ flow: { ...flow, discord: null }, el, act }), null);
  assert.equal(discordRow({ flow: { ...flow, discord: { canLink: false } }, el, act }), null);
  assert.match(words(discordRow({ flow, el, act })), /Link Discord/);
  const now = 1_800_000_000_000;
  const live = discordRow({ flow: { ...flow, discordCode: { code: 'ABCD-EFGH', expiresAt: now / 1000 + 290 } }, el, act, nowMs: now });
  assert.match(words(live), /ABCD-EFGH/);
  assert.match(words(live), /5 more minutes/);
  assert.match(words(live), /New code/);
  const spent = discordRow({ flow: { ...flow, discordCode: { code: 'ABCD-EFGH', expiresAt: now / 1000 - 1 } }, el, act, nowMs: now });
  assert.match(words(spent), /Link Discord/, 'a spent code is not shown');
  const linked = discordRow({ flow: { ...flow, discord: { linked: true, canLink: true, name: 'avel' } }, el, act });
  assert.match(words(linked), /Linked as avel/);
  assert.match(words(linked), /Unlink/);
  assert.equal(codeMinutesLeft(now / 1000 + 61, now), 2);
  assert.equal(codeMinutesLeft(now / 1000 - 5, now), 0);
});

test('the flow: a code asked for is kept for the row, a link the next read reports clears it and says so, and unlinking asks the service', async () => {
  const calls = [];
  let linked = false;
  const accountRead = () => ({ account: { id: 'acct-aaaaaaaaaaaa', name: 'Avel', kind: 'linked', handle: 'Avel' }, devices: [], discord: { linked, name: linked ? 'avel' : null, linkedAt: linked ? 1 : null, canLink: true } });
  const fetch = async (url, init) => {
    const path = url.replace(DEFAULT_ACCOUNT_SERVICE, '').replace(/^https?:\/\/[^/]+/, '');
    calls.push(path);
    const body = path === '/v1/account' ? accountRead() : path === '/v1/discord/code' ? { ok: true, code: 'ABCD-EFGH', expiresAt: 1_900_000_000 } : path === '/v1/discord/unlink' ? { ok: true } : null;
    return { ok: !!body, status: body ? 200 : 404, json: async () => body ?? { error: 'not-found' } };
  };
  const m = new Map([[SESSION_KEY, JSON.stringify({ id: 'acct-aaaaaaaaaaaa', name: 'Avel', kind: 'linked', sessionId: 's', secret: 'sec' })]]);
  const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  const flow = AccountFlow({ io: { fetch }, storage });
  await flow.start();
  assert.equal(flow.stage, 'in');
  assert.deepEqual(flow.discord, { linked: false, name: null, linkedAt: null, canLink: true });
  assert.equal(await flow.askDiscordCode(), true);
  assert.deepEqual(flow.discordCode, { code: 'ABCD-EFGH', expiresAt: 1_900_000_000 });
  linked = true;
  assert.equal(await flow.refresh(), true);
  assert.equal(flow.discordCode, null);
  assert.match(flow.note, /Discord linked/);
  assert.equal(await flow.unlinkDiscord(), true);
  assert.equal(flow.discord.linked, false);
  assert.ok(calls.includes('/v1/discord/code') && calls.includes('/v1/discord/unlink'));
});

test('the card: while a code lives it asks the service now and then, so a link typed on another device shows; it stops when the card goes', async () => {
  const { accountCard } = await import('../../../src/ui/enhanced/enhancedAccount.js');
  let linked = false;
  const accountRead = () => ({ account: { id: 'acct-aaaaaaaaaaaa', name: 'Avel', kind: 'linked', handle: 'Avel' }, devices: [], discord: { linked, name: linked ? 'avel' : null, linkedAt: linked ? 1 : null, canLink: true } });
  const fetch = async (url) => {
    const path = url.replace(DEFAULT_ACCOUNT_SERVICE, '').replace(/^https?:\/\/[^/]+/, '');
    const body = path === '/v1/account' ? accountRead() : path === '/v1/discord/code' ? { ok: true, code: 'ABCD-EFGH', expiresAt: Math.floor(Date.now() / 1000) + 600 } : null;
    return { ok: !!body, status: body ? 200 : 404, json: async () => body ?? { error: 'not-found' } };
  };
  const m = new Map([[SESSION_KEY, JSON.stringify({ id: 'acct-aaaaaaaaaaaa', name: 'Avel', kind: 'linked', sessionId: 's', secret: 'sec' })]]);
  const flow = AccountFlow({ io: { fetch }, storage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) } });
  await flow.start();
  const ticks = [];
  let cleared = 0;
  const win = { addEventListener() {}, removeEventListener() {}, setInterval: (fn, ms) => { ticks.push({ fn, ms }); return 7; }, clearInterval: (h) => { if (h === 7) cleared++; } };
  const mk = (tag) => { const n = { tag, children: [], attrs: {}, append: (...k) => n.children.push(...k.filter(Boolean)), setAttribute: (k, v) => { n.attrs[k] = v; } }; return n; };
  const card = accountCard({ createElement: mk, defaultView: win }, flow);
  card.root.isConnected = true;
  assert.equal(ticks.length, 1);
  await ticks[0].fn();
  assert.equal(flow.discord.linked, false, 'no code, nothing asked');
  await flow.askDiscordCode();
  linked = true;
  ticks[0].fn();
  await new Promise((res) => setTimeout(res, 5));
  assert.equal(flow.discord.linked, true, 'the link typed in Discord shows');
  card.off();
  assert.equal(cleared, 1, 'the card lets its timer go');
});
