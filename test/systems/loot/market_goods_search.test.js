import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standService, T0 } from '../../accountDb.mjs';
import { goodsWordsOf } from '../../../server-account/src/market.js';
import { marketAffixLines, marketAffixesOf, MARKET_AFFIX_MAX } from '../../../src/net/marketAffixLaw.js';

// the Goods view searched by the pieces' own names - every word, read without spaces, hyphens
// and apostrophes, bound as data; the count and the page both narrowed (mutants: one word enough; the spaces kept; the
// search unread; spliced into the SQL)
test('MARKET-SEARCH Goods by name: every word in the piece\'s name, "shortbow" finds a Short Bow, the count narrowed, a quote is data', async () => {
  assert.deepEqual(goodsWordsOf('  Short BOW '), ['short', 'bow']);
  assert.deepEqual(goodsWordsOf("dai-katana o'neil"), ['daikatana', 'oneil']);
  assert.deepEqual(goodsWordsOf('a b c d e f g h'), ['a', 'b', 'c', 'd', 'e', 'f'], 'six words at most');
  for (const q of [null, 42, {}, [], '   ']) assert.deepEqual(goodsWordsOf(q), [], JSON.stringify(q));
  const realNow = Date.now;
  Date.now = () => T0 * 1000;
  try {
    const service = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on', BOARD_OPEN: 'on' });
    const buyer = await service.registered('Buyer');
    const db = service.env.DB._raw;
    db.prepare('INSERT INTO players (id, handle, handle_lc, guest_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)')
      .run('fixture-seller', 'Seller', 'seller', 'Fixture Seller', T0 - 10000, T0);
    const insert = db.prepare(`INSERT INTO market_listings (id, seller, char_id, region, kind, units, price, fee, at, expires_at, rid, n, currency, item)
      VALUES (?, 'fixture-seller', 'char-seller', 17, 'item', 1, ?, 1, ?, ?, ?, '', 'gold', ?)`);
    const piece = (name, group = 'Weapons') => JSON.stringify({ group, name, templateIndex: 120, material: 1, flags: 0, value: 60, maxCondition: 2400, currentCondition: 2400 });
    const withAffixes = (name, affixes) => JSON.stringify({ ...JSON.parse(piece(name)), rarity: 'rare', affixes });
    insert.run('bow', 10, T0, T0 + 86400, 'r1', piece('Iron Short Bow'));
    insert.run('sword', 20, T0, T0 + 86400, 'r2', withAffixes('Steel Longsword', [{ id: 'stat', param: 'strength', value: 8 }, { id: 'leech', value: 5 }]));
    insert.run('dai', 30, T0, T0 + 86400, 'r3', withAffixes('Ebony Dai-katana', [{ id: 'stat', param: 'strength', value: 3 }, { id: 'skill', param: 29, value: 12 }]));
    insert.run('broken', 5, T0, T0 + 86400, 'r4', '{bad');
    const read = (find, extra = {}) => service.call('/v1/market/read', { character: buyer.character, region: 17, view: 'goods', hubs: { 17: [207, 212] }, ...(find === undefined ? {} : { find }), ...extra }, buyer.secret);
    const ids = async (find, extra) => { const r = await read(find, extra); assert.equal(r.status, 200, JSON.stringify(r.body)); return [r.body.rows.map((x) => x.id).sort(), r.body.total]; };
    assert.deepEqual(await ids(undefined), [['bow', 'dai', 'sword'], 3], 'no search: every piece');
    assert.deepEqual(await ids('bow'), [['bow'], 1]);
    assert.deepEqual(await ids('SHORTBOW'), [['bow'], 1], 'its spaces dropped');
    assert.deepEqual(await ids('daikatana'), [['dai'], 1], 'its hyphen dropped');
    assert.deepEqual(await ids('iron bow'), [['bow'], 1]);
    assert.deepEqual(await ids('iron sword'), [[], 0], 'every word');
    assert.deepEqual(await ids("' OR 1=1 --"), [[], 0], 'the words are data');
    assert.deepEqual(await ids(42), [['bow', 'dai', 'sword'], 3], 'no string: no search');
    // by affix - its kind and param, at least its value, every line asked; a skill's param a number
    const by = (affixes, find) => ids(find, { affixes });
    assert.deepEqual(await by([{ id: 'stat', param: 'strength' }]), [['dai', 'sword'], 2]);
    assert.deepEqual(await by([{ id: 'stat', param: 'strength', min: 5 }]), [['sword'], 1], 'at least its value');
    assert.deepEqual(await by([{ id: 'stat', param: 'agility' }]), [[], 0], 'its param');
    assert.deepEqual(await by([{ id: 'leech' }]), [['sword'], 1], 'a kind with no param');
    assert.deepEqual(await by([{ id: 'skill', param: 29, min: 10 }]), [['dai'], 1], 'a skill\'s number');
    assert.deepEqual(await by([{ id: 'stat', param: 'strength' }, { id: 'leech' }]), [['sword'], 1], 'every line');
    assert.deepEqual(await by([{ id: 'stat', param: 'strength' }], 'ebony'), [['dai'], 1], 'with the words');
    assert.deepEqual(await by([{ id: 'constructor' }, { id: "x' OR 1=1 --" }, 'stat', null]), [['bow', 'dai', 'sword'], 3], 'an unknown line is no filter');
  } finally { Date.now = realNow; }
});

test('MARKET-AFFIX law: every line a piece may carry named once, plainly; a read\'s lines known, each once, at most three, the least value in range (mutants: a bad param taken; a repeat kept; the cap unread)', () => {
  const lines = marketAffixLines();
  assert.equal(new Set(lines.map((l) => l.key)).size, lines.length, 'each line once');
  assert.ok(lines.every((l) => l.name && !/^[+-]?\d/.test(l.name)), 'no number in a name');
  const named = Object.fromEntries(lines.map((l) => [l.key, l.name]));
  assert.deepEqual([named['stat:strength'], named['resist:fire'], named.leech, named['skill:29']], ['Strength', 'Fire resistance', 'Life leech', 'Long Blade skill']);
  assert.deepEqual(marketAffixesOf([{ id: 'stat', param: 'strength', min: 5 }, { id: 'stat', param: 'strength' }, { id: 'stat', param: 'x' }, { id: 'leech', param: 'x' }, { id: 'leech', min: 9999 }]),
    [{ id: 'stat', param: 'strength', min: 5 }, { id: 'leech', param: null, min: 1 }]);
  const many = lines.slice(0, 6).map((l) => ({ id: l.id, param: l.param }));
  assert.equal(marketAffixesOf(many).length, MARKET_AFFIX_MAX);
  for (const raw of [null, 'stat', {}, [null, 1, 'x']]) assert.deepEqual(marketAffixesOf(raw), []);
});

// each view's change mark: a new piece and a closed one move the Goods mark alone, a read moves none (mutants: one mark
// for all; the count or the newest id dropped)
test('MARKET-STAMP a piece listed or closed moves the Goods mark and no other view\'s; a read moves nothing', async () => {
  const realNow = Date.now;
  Date.now = () => T0 * 1000;
  try {
    const service = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on', BOARD_OPEN: 'on' });
    const buyer = await service.registered('Buyer');
    const db = service.env.DB._raw;
    db.prepare('INSERT INTO players (id, handle, handle_lc, guest_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)')
      .run('fixture-seller', 'Seller', 'seller', 'Fixture Seller', T0 - 10000, T0);
    const stamp = async () => { const r = await service.call('/v1/market/stamp', {}, buyer.secret); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.stamp; };
    const s0 = await stamp();
    for (const v of ['materials', 'crafted', 'goods', 'auctions', 'orders', 'mine', 'history']) assert.equal(typeof s0[v], 'string', v);
    await service.call('/v1/market/read', { character: buyer.character, region: 17, view: 'goods', hubs: { 17: [207, 212] } }, buyer.secret);
    assert.deepEqual(await stamp(), s0, 'a read moves nothing');
    db.prepare(`INSERT INTO market_listings (id, seller, char_id, region, kind, units, price, fee, at, expires_at, rid, n, currency, item)
      VALUES ('x1', 'fixture-seller', 'char-seller', 17, 'item', 1, 5, 1, ?, ?, 'r1', '', 'gold', '{}')`).run(T0, T0 + 86400);
    const s1 = await stamp();
    assert.notEqual(s1.goods, s0.goods, 'a new piece');
    assert.equal(s1.materials, s0.materials, 'Materials untouched');
    assert.equal(s1.orders, s0.orders, 'Orders untouched');
    assert.notEqual(s1.mine, s0.mine, 'My listings moves with any');
    db.prepare(`UPDATE market_listings SET state = 'cancelled', closed_at = ? WHERE id = 'x1'`).run(T0 + 5);
    assert.notEqual((await stamp()).goods, s1.goods, 'a piece closed');
  } finally {
    Date.now = realNow;
  }
});
