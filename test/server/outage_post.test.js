// The server issues apology: its gift's law, the migration run over accounts that stand (the real Worker on
// node:sqlite) after the maintenance apology, and the letter in the box naming its gift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { standService } from '../accountDb.mjs';
import { GIFTS, giftsOf, giftPiecesOf } from '../../src/net/giftLaw.js';
import { OUTAGE_POST, outagePostSql, maintenancePostSql } from '../../tools/sendServerPost.mjs';
import { postGiftWords } from '../../src/ui/enhanced/enhancedPost.js';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('Server issues apology: `outage` gives 200 Aurum and no armory piece; the letter names the Aurum', () => {
  assert.deepEqual(GIFTS.outage, { aurum: 200, armory: [] });
  assert.deepEqual(giftsOf({ gifts: 'maintenance outage' }), ['maintenance', 'outage']);
  assert.deepEqual(giftPiecesOf({ gifts: 'outage' }), []);
  assert.deepEqual(postGiftWords('outage'), ['200 Aurum']);
});

test('Server issues apology: migration 0210 is the tool\'s own statement, to every registered account', () => {
  const mig = src('server-account/migrations/0210_server_issues_apology.sql');
  assert.ok(mig.trimEnd().endsWith(outagePostSql()), 'the tool\'s statement, as it prints it');
  assert.deepEqual([OUTAGE_POST.batch, OUTAGE_POST.gift, OUTAGE_POST.sender], ['server-issues-apology', 'outage', 'The DFO Team']);
  assert.match(OUTAGE_POST.body, /200 Aurum is on your account now/);
  assert.doesNotMatch(outagePostSql(), /handle_lc IN/, 'no account left out');
});

test('Server issues apology over the accounts that stand, after the maintenance apology: 700 each, MarioTheShiba 1700; a guest and an account made after none; run again, nothing doubles', async () => {
  const s = await standService({ AURUM_OPEN: 'on' });
  const raw = s.env.DB._raw;
  const a = await s.registered('Patient'), b = await s.seated('AlsoPatient'), mario = await s.registered('MarioTheShiba'), g = await s.guest();
  raw.exec(maintenancePostSql());
  const give = () => raw.exec(outagePostSql());
  give();
  give();   // run again: nothing doubles
  const later = await s.registered('Later');
  const balance = async (who) => (await (await s.fetch('https://accounts.invalid/v1/account', { headers: { authorization: `Bearer ${who.secret}` } })).json()).aurum?.balance;
  assert.equal(await balance(a), 700);
  assert.equal(await balance(b), 700);
  assert.equal(await balance(mario), 1700);
  assert.equal(await balance(later), 0, 'an account made after holds none');
  assert.equal(raw.prepare('SELECT gifts FROM players WHERE id = ?').get(a.id).gifts, 'maintenance outage');
  assert.equal(raw.prepare('SELECT gifts FROM players WHERE id = ?').get(g.id).gifts, '', 'a guest holds none');
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM aurum_ledger WHERE kind = 'gift' AND ref = 'outage'").get().n, 3, 'once an account');
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM server_post WHERE batch = 'server-issues-apology'").get().n, 3, 'a letter each, once');
  const box = (await (await s.fetch('https://accounts.invalid/v1/post/box', { headers: { authorization: `Bearer ${a.secret}` } })).json()).post ?? [];
  const letter = box.find((p) => p.subject === OUTAGE_POST.subject);
  assert.deepEqual([letter?.gift, letter?.item, letter?.from], ['outage', null, 'The DFO Team'], JSON.stringify(box));
});
