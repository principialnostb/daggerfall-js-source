// The affix search on Crafted and Auctions: a made piece carries lines only as a Master's work, read off its record, so a
// line asked keeps the Master's works that carry it at least at the value asked, and the count and pages are theirs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standService, T0 } from '../accountDb.mjs';
import { recipeById, MASTERWORK } from '../../src/net/recipeLaw.js';
import { rollMasterLines, masterRecordLines } from '../../src/net/masterLaw.js';
import { mintProductRecord, MINT_V_MASTER } from '../../src/net/productRecord.js';
import { affixesCarried } from '../../src/net/marketAffixLaw.js';

const SWORD = 'longsword:daedric';

test('MARKET-AFFIX the law: every line asked carried, its param and at least its value (mutants: one line enough; the param ignored; the value ignored)', () => {
  const lines = [{ id: 'damage', value: 20 }, { id: 'stat', param: 'strength', value: 10 }];
  assert.equal(affixesCarried(lines, [{ id: 'stat', param: 'strength', min: 10 }]), true);
  assert.equal(affixesCarried(lines, [{ id: 'stat', param: 'strength', min: 11 }]), false, 'under the value');
  assert.equal(affixesCarried(lines, [{ id: 'stat', param: 'luck', min: 1 }]), false, 'another param');
  assert.equal(affixesCarried(lines, [{ id: 'damage', param: null, min: 1 }, { id: 'stat', param: 'luck', min: 1 }]), false, 'every line');
  assert.equal(affixesCarried(null, [{ id: 'damage', param: null, min: 1 }]), false, 'a plain piece carries none');
  assert.equal(affixesCarried(null, []), true, 'nothing asked');
});

test('MARKET-AFFIX Crafted and Auctions: a line asked keeps the Master\'s works carrying it, the plain pieces out, the count theirs (mutants: the sift unread; the count the unsifted one)', async () => {
  const real = Date.now;
  Date.now = () => T0 * 1000;
  try {
    const s = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on', BOARD_OPEN: 'on' });
    const buyer = await s.registered('Buyer'), db = s.env.DB._raw;
    db.prepare('INSERT INTO players(id,handle,handle_lc,guest_name,created_at,last_seen) VALUES(?,?,?,?,?,?)').run('sell0', 'Seller', 'seller', 'Fixture', T0, T0);
    const r = recipeById(SWORD);
    const product = db.prepare('INSERT INTO products(provenance,owner,char_id,maker,recipe,template,material,quality,seed,record,made_at,listed) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)');
    const made = async (i, master) => {
      const pv = i.toString(16).padStart(16, '0'), seed = 1000 + i;
      const lines = master ? rollMasterLines(r, ['damage', 'stat:strength', 'elemental:fire'], seed) : null;
      const rec = await mintProductRecord({ p: pv, s: 'sell0', h: 'cs0000', r: SWORD, q: MASTERWORK, m: 'Mac', c: seed, ...(lines ? { v: MINT_V_MASTER, l: masterRecordLines(lines), a: true } : {}) }, null, { nowS: T0 });
      product.run(pv, 'sell0', 'cs0000', 'Mac', SWORD, r.templateIndex, r.material ?? 0, MASTERWORK, seed, rec, T0);
      return { pv, lines };
    };
    const listing = db.prepare("INSERT INTO market_listings(id,seller,char_id,region,kind,provenance,units,own,price,wear,fee,at,expires_at,rid,n) VALUES(?,?,?,17,'piece',?,1,1,?,1000,1,?,?,?,'')");
    const auction = db.prepare("INSERT INTO market_auctions(id,seller,char_id,region,provenance,wear,opening,high,bids,fee,at,ends_at,rid,n) VALUES(?,?,?,17,?,1000,?,NULL,0,1,?,?,?,'')");
    let strength = 0;
    for (let i = 0; i < 6; i++) {
      const { pv, lines } = await made(i, i % 2 === 0);
      if (i < 4) listing.run(`p${i}`, 'sell0', 'cs0000', pv, 10 + i, T0 - i, T0 + 86400, `r${i}`);
      else auction.run(`a${i}`, 'sell0', 'cs0000', pv, 50, T0 - i, T0 + 7200, `ra${i}`);
      if (lines && i < 4) strength = Math.max(strength, lines.find((a) => a.id === 'stat').value);
    }
    const read = async (view, affixes) => {
      const b = await s.call('/v1/market/read', { character: buyer.character, region: 17, view, hubs: { 17: [207, 212] }, ...(affixes ? { affixes } : {}) }, buyer.secret);
      assert.equal(b.status, 200, JSON.stringify(b.body));
      return b.body;
    };
    assert.equal((await read('crafted')).total, 4, 'unsifted, every piece');
    const asked = await read('crafted', [{ id: 'stat', param: 'strength', min: 1 }]);
    assert.deepEqual([asked.total, asked.rows.map((x) => x.id).sort()], [2, ['p0', 'p2']], 'the two Master\'s works');
    assert.equal((await read('crafted', [{ id: 'stat', param: 'strength', min: strength + 1 }])).total, 0, 'past the best value, none');
    assert.equal((await read('crafted', [{ id: 'stat', param: 'luck', min: 1 }])).total, 0, 'a line none carries');
    const auctions = await read('auctions', [{ id: 'damage', min: 1 }]);
    assert.deepEqual([auctions.total, auctions.rows.map((x) => x.id)], [1, ['a4']]);
    assert.equal((await read('auctions')).total, 2);
  } finally {
    Date.now = real;
  }
});
