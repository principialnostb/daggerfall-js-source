// The attack apology: its gift's law, the migration run over accounts that stand (the real Worker on node:sqlite)
// after the two earlier apologies, and the letter in the box naming its gift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { standService } from '../accountDb.mjs';
import { GIFTS, giftsOf, giftPiecesOf } from '../../src/net/giftLaw.js';
import { DDOS_POST, ddosPostSql, outagePostSql, maintenancePostSql } from '../../tools/sendServerPost.mjs';
import { postGiftWords } from '../../src/ui/enhanced/enhancedPost.js';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('Attack apology: `ddos` gives 500 Aurum and no armory piece; the letter names the Aurum', () => {
  assert.deepEqual(GIFTS.ddos, { aurum: 500, armory: [] });
  assert.deepEqual(giftsOf({ gifts: 'maintenance outage ddos' }), ['maintenance', 'outage', 'ddos']);
  assert.deepEqual(giftPiecesOf({ gifts: 'ddos' }), []);
  assert.deepEqual(postGiftWords('ddos'), ['500 Aurum']);
});

test('Attack apology: migration 0211 is the tool\'s own statement, to every registered account', () => {
  const mig = src('server-account/migrations/0211_ddos_apology.sql');
  assert.ok(mig.trimEnd().endsWith(ddosPostSql()), 'the tool\'s statement, as it prints it');
  assert.deepEqual([DDOS_POST.batch, DDOS_POST.gift, DDOS_POST.sender], ['ddos-apology', 'ddos', 'The DFO Team']);
  assert.match(DDOS_POST.body, /500 Aurum is on your account now/);
  assert.doesNotMatch(ddosPostSql(), /handle_lc IN/, 'no account left out');
});

test('Attack apology over the accounts that stand, after the two earlier apologies: 1200 each, MarioTheShiba 2200; a guest and an account made after none; run again, nothing doubles', async () => {
  const s = await standService({ AURUM_OPEN: 'on' });
  const raw = s.env.DB._raw;
  const a = await s.registered('Patient'), b = await s.seated('AlsoPatient'), mario = await s.registered('MarioTheShiba'), g = await s.guest();
  raw.exec(maintenancePostSql());
  raw.exec(outagePostSql());
  const give = () => raw.exec(ddosPostSql());
  give();
  give();   // run again: nothing doubles
  const later = await s.registered('Later');
  const balance = async (who) => (await (await s.fetch('https://accounts.invalid/v1/account', { headers: { authorization: `Bearer ${who.secret}` } })).json()).aurum?.balance;
  assert.equal(await balance(a), 1200);
  assert.equal(await balance(b), 1200);
  assert.equal(await balance(mario), 2200);
  assert.equal(await balance(later), 0, 'an account made after holds none');
  assert.equal(raw.prepare('SELECT gifts FROM players WHERE id = ?').get(a.id).gifts, 'maintenance outage ddos');
  assert.equal(raw.prepare('SELECT gifts FROM players WHERE id = ?').get(g.id).gifts, '', 'a guest holds none');
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM aurum_ledger WHERE kind = 'gift' AND ref = 'ddos'").get().n, 3, 'once an account');
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM server_post WHERE batch = 'ddos-apology'").get().n, 3, 'a letter each, once');
  const box = (await (await s.fetch('https://accounts.invalid/v1/post/box', { headers: { authorization: `Bearer ${a.secret}` } })).json()).post ?? [];
  const letter = box.find((p) => p.subject === DDOS_POST.subject);
  assert.deepEqual([letter?.gift, letter?.item, letter?.from], ['ddos', null, 'The DFO Team'], JSON.stringify(box));
});
