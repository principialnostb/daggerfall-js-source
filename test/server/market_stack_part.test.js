// A stack from the pack listed `each` and bought a few at a time: the buyer's part comes as its own piece, the rest stays
// up at the same price each, and a cancel gives back what is left. Through the real Worker (test/accountDb.mjs).
import '../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { standService, T0 } from '../accountDb.mjs';
import { seatRealm } from '../realmSeat.mjs';
import { validLootList, generateRandomLoot, LOOT_MATRICES } from '../../src/systems/loot/loot.js';
import { seededRng } from '../../src/systems/wind/wind.js';
import { patronCap, patronWorth } from '../../src/net/patronLaw.js';
import { itemWorth } from '../../src/systems/item/itemLaw.js';

let _now = T0;
const realNow = Date.now;
Date.now = () => _now * 1000;
test.after(() => { Date.now = realNow; });
let _rid = 0;
const rid = () => `st-${String(++_rid).padStart(6, '0')}`;
const DF = 17;
const HUBS = { [DF]: [207, 212] };

async function market() {
  const s = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on', BOARD_OPEN: 'on' });
  const raw = s.env.DB._raw;
  const record = (who) => {
    const row = raw.prepare('SELECT obj, seq FROM realm_characters WHERE id = ?').get(who.character);
    return JSON.parse(new TextDecoder().decode(s.env.SAVES._map.get(row.obj)));
  };
  const seated = async (handle, save) => {
    const who = await s.registered(handle);
    const R = await seatRealm(s.env, who.secret, handle, { name: handle, level: 5, items: [], goldPieces: 0, ...save });
    who.character = R.id;
    who.at = R.at;
    return who;
  };
  // a stack of 100 creature ingredients (Wraith Essence), as a loot roll gives them
  const piece = generateRandomLoot(LOOT_MATRICES.C, { level: 10, gender: 'male' }, seededRng(3)).find((it) => it.group === 'CreatureIngredients1');
  assert.ok(piece, 'a loot roll gives an ingredient');
  const eve = await seated('Eve', { items: [JSON.parse(JSON.stringify({ ...piece, stackCount: 100 }))] });
  const tom = await seated('Tom', { goldPieces: 5000 });
  const list = (extra = {}) => s.call('/v1/market/list', { character: eve.character, region: DF, kind: 'item', item: validLootList([record(eve).items[0]])[0], pick: 0, price: 3,
    hubs: HUBS, rid: rid(), currency: 'gold', realm: eve.at(), ...extra }, eve.secret);
  const buy = (listing, units, max) => s.call('/v1/market/buy', { character: tom.character, region: DF, listing, units, max, hubs: HUBS, rid: rid(), realm: tom.at(), landed: true }, tom.secret);
  const row = (id) => raw.prepare('SELECT units, own, bought, state, item FROM market_listings WHERE id = ?').get(id);
  return { ...s, raw, eve, tom, record, list, buy, row };
}

test('MARKET-STACK a stack listed each is bought a few at a time: 1 of 100 for 3 gold, 99 left at 3 each, the part its own piece; the rest whole; a cancel gives back what is left (mutants: the units forced to 1; the stack left unwritten; the part keeping the stack\'s id)', async () => {
  const s = await market();
  const l = await s.list({ each: true });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  const id = l.body.listing.id;
  assert.deepEqual([l.body.listing.units, l.body.listing.listed, l.body.listing.price], [100, 100, 3], 'every arrow up, at 3 each');
  const stamp = async () => (await s.call('/v1/market/stamp', {}, s.tom.secret)).body.stamp.goods;
  const before = await stamp();
  const one = await s.buy(id, 1, 3);
  assert.equal(one.status, 200, JSON.stringify(one.body));
  assert.notEqual(await stamp(), before, 'a part bought moves the Goods mark');
  assert.deepEqual([one.body.sale.units, one.body.sale.total], [1, 3]);
  const left = s.row(id);
  assert.deepEqual([Number(left.own) + Number(left.bought), left.state, JSON.parse(left.item).stackCount], [99, 'open', 99], '99 left, the stack\'s record says 99');
  const got = s.raw.prepare('SELECT item FROM market_deliveries WHERE id = ?').get(one.body.delivery.id);
  const part = JSON.parse(got.item);
  assert.equal(part.stackCount, 1, 'the part is one arrow');
  assert.notEqual(part.uid, JSON.parse(left.item).uid, 'its own piece, never the stack\'s id');
  const more = await s.buy(id, 40, 120);
  assert.equal(more.status, 200, JSON.stringify(more.body));
  assert.equal(JSON.parse(s.row(id).item).stackCount, 59);
  const short = await s.buy(id, 60, 180);
  assert.equal(short.body.error, 'market-short', 'never more than is left');
  const cancel = await s.call('/v1/market/cancel', { character: s.eve.character, listing: id, rid: rid() }, s.eve.secret);
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  const back = s.raw.prepare("SELECT item FROM market_deliveries WHERE player = ? AND why = 'returned'").get(s.eve.id);
  assert.equal(JSON.parse(back.item).stackCount, 59, 'what is left comes back');
});

test('MARKET-STACK a stack listed without `each` (an older tab) sells whole, as before (mutant: every stack split)', async () => {
  const s = await market();
  const l = await s.list({ price: 300 });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  assert.deepEqual([l.body.listing.units, l.body.listing.price], [1, 300]);
  const b = await s.buy(l.body.listing.id, 5, 300);
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(b.body.sale.units, 1, 'whole');
  assert.equal(JSON.parse(s.raw.prepare('SELECT item FROM market_deliveries WHERE id = ?').get(b.body.delivery.id).item).stackCount, 100);
});

test('MARKET-STACK a trader\'s stall: a stack listed each is bought in part at the stall, and a patron buys what is left whole at its price each (mutants: the stall\'s units forced to 1; the patron paying one unit\'s price)', async () => {
  const s = await market();
  const MAP = 1001, KEY = 4242, VENDOR = { map: MAP, id: 'trader1' };
  s.raw.prepare(`INSERT INTO homes (map_id, building_key, player, char_id, owner_name, region, entry, price, bought_at) VALUES (?, ?, ?, ?, ?, ?, 'public', 1000, ?)`)
    .run(MAP, KEY, s.eve.id, s.eve.character, 'Eve', DF, _now);
  s.raw.prepare(`INSERT INTO home_decor (map_id, building_key, id, model, flat_archive, flat_record, place, placed_at, item, paid, yard) VALUES (?, ?, ?, NULL, 182, 3, ?, ?, NULL, 0, 0)`)
    .run(MAP, KEY, VENDOR.id, JSON.stringify({ pos: [1, 0, 1], rot: [0, 0, 0], scale: 1, light: null, storage: false, paid: 0, station: 'vendor' }), _now);
  const each = Math.max(1, Math.floor(patronCap(patronWorth({ ...s.record(s.eve).items[0], stackCount: 1 }, itemWorth)) * 0.45));
  const l = await s.list({ each: true, vendor: VENDOR, price: each });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  const id = l.body.listing.id;
  assert.equal(l.body.listing.units, 100);
  const b = await s.call('/v1/market/buy', { character: s.tom.character, region: DF, listing: id, units: 30, max: 30 * each, hubs: HUBS, rid: rid(), realm: s.tom.at(), vendor: VENDOR, landed: true }, s.tom.secret);
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.deepEqual([b.body.sale.units, b.body.sale.total], [30, 30 * each]);
  assert.equal(JSON.parse(s.row(id).item).stackCount, 70);
  let sale = null;
  for (let i = 0; i < 15 && !sale; i++) {
    _now += 40 * 3600;
    await s.call('/v1/market/vendor', { vendor: VENDOR }, s.eve.secret);
    sale = s.raw.prepare('SELECT price FROM market_patron_sales WHERE listing = ?').get(id);
  }
  assert.ok(sale, 'a patron bought what was left');
  assert.equal(Number(sale.price), 70 * each, 'the 70 left, at their price each');
  assert.equal(s.row(id).state, 'sold');
});
