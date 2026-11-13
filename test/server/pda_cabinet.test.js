// The Courier's Cabinet: the catalogue's law (ids, prices, a set less what is held), the page in Discord's layout law,
// a ware bought once and only while the Seals hold it, written beside its spend and told by a letter in the game's
// mailbox; a second press of the same ware charges nothing; two wares bought at once never spend what is not there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdaRig, screenText, assertScreenOk, customIds } from '../pdaRig.mjs';
import { SEAL_WARES, SEAL_WARE_ID_RE, sealPrice, discordHeld, discordWareIds, withWare, holdsWare, TIDEBOUND_PIECES } from '../../src/net/discordShopLaw.js';
import { buyWare } from '../../server-account/src/pdaCabinet.js';
import { aurasHeld, armoryHeld, iconsHeld } from '../../server-account/src/titles.js';

const seals = (r, id, n, ref = `test:${Math.random()}`) =>
  r.raw.prepare("INSERT INTO exp_points (player_id, amount, why, ref, at) VALUES (?, ?, 'test', ?, 1)").run(id, n, ref);
const balance = (r, id) => r.raw.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM exp_points WHERE player_id = ?').get(id).n;

test('Cabinet law: every id well formed and once; a set costs less what is held of it, never below a fifth; held wares read back in order', () => {
  assert.equal(new Set(SEAL_WARES.map((w) => w.id)).size, SEAL_WARES.length);
  for (const w of SEAL_WARES) assert.match(w.id, SEAL_WARE_ID_RE, w.id);
  const set = SEAL_WARES.find((w) => w.codes.length === 5);
  assert.deepEqual(set.codes, [...TIDEBOUND_PIECES]);
  assert.equal(sealPrice({ discord_wares: '' }, set.id), set.seals);
  const two = { discord_wares: 'dc-armory-tidecirclet dc-armory-tidepearl' };
  assert.equal(sealPrice(two, set.id), set.seals - 1000);
  const four = { discord_wares: 'dc-armory-tidecirclet dc-armory-tidepearl dc-armory-tidebracers dc-armory-tidegreaves' };
  assert.equal(sealPrice(four, set.id), Math.ceil(set.seals / 5), 'never below a fifth');
  assert.equal(sealPrice({ discord_wares: 'dc-armory-tidebound' }, 'dc-armory-tideedge'), null, 'the set holds each piece');
  assert.deepEqual(discordHeld({ discord_wares: 'dc-armory-tidebound dc-aura-veilwake junk' }, 'armory'), [...TIDEBOUND_PIECES]);
  assert.deepEqual(discordWareIds({ discord_wares: 'junk dc-aura-veilwake dc-aura-veilwake' }), ['dc-aura-veilwake']);
  assert.equal(withWare('dc-aura-veilwake', 'dc-aura-eltherictide'), 'dc-aura-eltherictide dc-aura-veilwake', 'kept in the cabinet\'s order');
  assert.equal(holdsWare({ discord_wares: '' }, 'dc-aura-veilwake'), false);
});

test('Cabinet: the page holds Discord\'s law; a ware bought spends its Seals once, is the account\'s, and posts a letter; a short balance buys nothing', async () => {
  const r = await pdaRig();
  const p = await r.linked('Wren', { seated: true });
  const front = assertScreenOk(await r.press(p, 'pda:cabinet'), 'cabinet');
  assert.match(screenText(front), /Seals:\*\* 0/);
  const auras = assertScreenOk(await r.press(p, 'pda:cabinet:kind:aura'), 'auras');
  assert.match(screenText(auras), /Eltheric Tide/);
  assert.ok(customIds(auras).includes('pda:cabinet:ware:dc-aura-veilwake'));
  const close = assertScreenOk(await r.press(p, 'pda:cabinet:ware:dc-aura-veilwake'), 'ware');
  assert.ok(!customIds(close).includes('pda:cabinet:buy:dc-aura-veilwake'), 'no buy press while the Seals fall short');
  assert.equal((await buyWare(r.ctx(), p.id, 'dc-aura-veilwake')).error, 'seals');
  assert.equal(r.raw.prepare('SELECT discord_wares FROM players WHERE id = ?').get(p.id).discord_wares, '', 'a short balance grants nothing');
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM exp_points WHERE player_id = ? AND why = 'cabinet'").get(p.id).n, 0, 'and spends nothing');
  seals(r, p.id, 2000);
  const ready = assertScreenOk(await r.press(p, 'pda:cabinet:ware:dc-aura-veilwake'), 'ware');
  assert.ok(customIds(ready).includes('pda:cabinet:buy:dc-aura-veilwake'));
  const bought = assertScreenOk(await r.press(p, 'pda:cabinet:buy:dc-aura-veilwake'), 'bought');
  assert.match(screenText(bought), /You bought Veilwake/);
  assert.equal(balance(r, p.id), 500);
  assert.equal(r.raw.prepare('SELECT discord_wares FROM players WHERE id = ?').get(p.id).discord_wares, 'dc-aura-veilwake');
  const letter = r.raw.prepare("SELECT subject, body FROM server_post WHERE to_id = ? AND batch LIKE 'cabinet:%'").all(p.id);
  assert.equal(letter.length, 1);
  assert.match(letter[0].subject, /From the Courier: Veilwake/);
  assert.equal((await buyWare(r.ctx(), p.id, 'dc-aura-veilwake')).error, 'owned');
  assert.equal(balance(r, p.id), 500, 'a second press charges nothing');
  assert.match(screenText(await r.press(p, 'pda:cabinet:buy:dc-aura-veilwake')), /already own that/);
});

test('Cabinet: two wares bought at once never spend Seals that are not there; the set bought over a piece costs the rest', async () => {
  const r = await pdaRig();
  const p = await r.linked('Odo', { seated: true });
  seals(r, p.id, 1900);
  const [a, b] = await Promise.all([buyWare(r.ctx(), p.id, 'dc-aura-eltherictide'), buyWare(r.ctx(), p.id, 'dc-aura-veilwake')]);
  const wins = [a, b].filter((x) => x.ok).length;
  assert.ok(wins <= 1, 'the balance held one of the two at most');
  assert.ok(balance(r, p.id) >= 0, 'never below nothing');
  seals(r, p.id, 3000);
  assert.ok((await buyWare(r.ctx(), p.id, 'dc-armory-tidecirclet')).ok);
  const before = balance(r, p.id);
  const set = await buyWare(r.ctx(), p.id, 'dc-armory-tidebound');
  assert.ok(set.ok);
  assert.equal(before - balance(r, p.id), 2000 - 500, 'the set less the piece held');
  assert.deepEqual(discordHeld(r.raw.prepare('SELECT discord_wares FROM players WHERE id = ?').get(p.id), 'armory'), [...TIDEBOUND_PIECES]);
});

test('Cabinet to the game: a ware bought in Discord is the account\'s in the service\'s own reads, the ones the game wears from', async () => {
  const r = await pdaRig();
  const p = await r.linked('Ysolde', { seated: true });
  const row = () => r.raw.prepare('SELECT * FROM players WHERE id = ?').get(p.id);
  assert.ok(!aurasHeld(row(), r.env).includes('eltherictide'));
  seals(r, p.id, 5000);
  assert.ok((await buyWare(r.ctx(), p.id, 'dc-aura-eltherictide')).ok);
  assert.ok((await buyWare(r.ctx(), p.id, 'dc-armory-tidebound')).ok);
  assert.ok((await buyWare(r.ctx(), p.id, 'dc-icon-courier')).ok);
  assert.ok(aurasHeld(row(), r.env).includes('eltherictide'), 'the aura is held');
  for (const k of TIDEBOUND_PIECES) assert.ok(armoryHeld(row(), r.env).includes(k), `${k} is held`);
  assert.ok(iconsHeld(row(), r.env).includes('courier'), 'the portrait is held');
});
