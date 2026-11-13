// The PDA's Market screen: silver, the Stores, a board chosen from any of the world's regions, a material listed, found,
// bought, cancelled; a buy order posted, filled and withdrawn - each through market.js's own acts - while pieces, gold
// and auctions are shown read only; and the clock's sale and fill notices, each told once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdaRig, screenText, customIds, assertScreenOk } from '../pdaRig.mjs';
import { marketNotices, materialName, materialsNamed } from '../../server-account/src/pdaMarket.js';
import { marketCatalogue } from '../../src/net/marketLaw.js';
import { REGION_NAMES } from '../../src/formats/mapsTables.js';

const ON = { PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on', BOARD_OPEN: 'on' };
/** A Bay region and a province past it. */
const BAY = 17;
const PROVINCE = REGION_NAMES.indexOf('Morrowind');

async function marketRig() {
  const r = await pdaRig(ON);
  const stock = (who, key, qty, origin = 'own') =>
    r.raw.prepare('INSERT OR REPLACE INTO prof_stores (player, char_id, material, origin, qty) VALUES (?, ?, ?, ?, ?)').run(who.id, who.character, key, origin, qty);
  const held = (who, key) => r.raw.prepare('SELECT COALESCE(SUM(qty), 0) AS n FROM prof_stores WHERE player = ? AND char_id = ? AND material = ?').get(who.id, who.character, key).n;
  const silver = (who) => r.raw.prepare('SELECT balance FROM marks WHERE account = ?').get(who.id)?.balance ?? 0;
  const board = (who, region) => r.choose(who, `pda:market:setboard:0`, [String(region)]);
  const trader = async (handle, { marks = 1000, region = BAY } = {}) => {
    const p = await r.linked(handle, { seated: true });
    if (marks) r.seedMarks(p, marks);
    await board(p, region);
    return p;
  };
  return { r, stock, held, silver, board, trader };
}

test('PDA market: names as the Stores say them, a name\'s search, every region of the world a board', () => {
  assert.equal(materialName('metal:iron'), 'Iron');
  assert.equal(materialName('p1:8'), 'Twigs (northern)');
  assert.equal(materialName('p2:8'), 'Twigs (southern)');
  assert.equal(materialName('food:meat'), 'Raw Meat');
  assert.deepEqual(materialsNamed('iron').map((c) => c.key), ['metal:iron'], 'an exact name first');
  assert.ok(materialsNamed('ore').length > 1);
  assert.deepEqual(materialsNamed(''), []);
  for (const c of marketCatalogue()) assert.ok(materialName(c.key) && !materialName(c.key).includes(':'), c.key);
  assert.equal(REGION_NAMES.length, 71);
  assert.ok(PROVINCE > 61, 'a province past the Bay');
});

test('PDA market: the front page, the board chooser holding all 71 regions, and every screen within Discord\'s bounds', async () => {
  const { r, stock } = await marketRig();
  const p = await r.linked('Arlo', { seated: true });
  r.seedMarks(p, 250);
  stock(p, 'metal:iron', 40);
  stock(p, 'metal:iron', 5, 'bought');
  const front = assertScreenOk(await r.press(p, 'pda:market'), 'front');
  const t = screenText(front);
  assert.match(t, /Silver:\*\* 250/);
  assert.match(t, /Board:\*\* not chosen yet/);
  assert.match(t, /Iron 45/);
  const chooser = assertScreenOk(await r.press(p, 'pda:market:board'), 'board');
  const regions = chooser.data.components[0].components.filter((c) => c.type === 1 && String(c.components[0].custom_id).startsWith('pda:market:setboard')).flatMap((row) => row.components[0].options.map((o) => Number(o.value)));
  assert.deepEqual([...regions].sort((a, b) => a - b), REGION_NAMES.map((_, i) => i), 'every region, the provinces too');
  assert.match(screenText(await r.choose(p, 'pda:market:setboard:2', [String(PROVINCE)])), /board of \*\*Morrowind\*\*/);
  assert.match(screenText(await r.press(p, 'pda:market')), /Board:\*\* Morrowind/);
  assert.match(screenText(await r.choose(p, 'pda:market:setboard:0', ['71'])), /Choose your board first/, 'no region 71');
  for (const id of ['pda:market:stores:0', 'pda:market:mine', 'pda:market:orders:0', 'pda:market:goods', 'pda:market:auctions', 'pda:market:board'])
    assertScreenOk(await r.press(p, id), id);
  assert.equal((await r.press(p, 'pda:market:search')).type, 9);
  assert.match(screenText(await r.press(p, 'pda:home')), /Market:\*\* 250 silver/);
});

test('PDA market: closed by its switches, and refused a character it does not have', async () => {
  const r = await pdaRig({ MARKS_OPEN: 'on' });
  const p = await r.linked('Bree', { seated: true });
  assert.match(screenText(await r.press(p, 'pda:market')), /market is not open yet/);
  assert.match(screenText(await r.press(p, 'pda:market:stores:0')), /market is not open yet/);
  const r2 = await pdaRig(ON);
  const none = await r2.linked('Dax');
  assert.match(screenText(await r2.press(none, 'pda:market')), /no online character/);
});

test('PDA market: a material listed from the Stores at a province\'s board, found by search, bought at the same board into the Stores, and the sale told once', async () => {
  const { r, stock, held, silver, trader } = await marketRig();
  const seller = await trader('Eda', { marks: 100, region: PROVINCE });
  const buyer = await trader('Fyn', { marks: 1000, region: PROVINCE });
  stock(seller, 'metal:iron', 30);
  const stores = assertScreenOk(await r.press(seller, 'pda:market:stores:0'), 'stores');
  assert.ok(customIds(stores).includes('pda:market:sell'));
  const form = await r.choose(seller, 'pda:market:sell', ['metal~iron']);
  assert.equal(form.type, 9);
  assert.equal(form.data.custom_id, 'pdam:market:list:metal~iron');
  const listed = assertScreenOk(await r.submit(seller, 'pdam:market:list:metal~iron', { units: '20', price: '7' }), 'listed');
  assert.match(screenText(listed), /Listed Iron ×20 at 7 silver at Morrowind/);
  assert.equal(held(seller, 'metal:iron'), 10);
  const id = r.raw.prepare('SELECT id FROM market_listings WHERE seller = ?').get(seller.id).id;
  // found by the buyer
  const found = assertScreenOk(await r.submit(buyer, 'pdam:market:search', { words: 'iron', where: ['here'] }), 'search');
  assert.match(screenText(found), /Iron ×20 at 7 silver · Morrowind/);
  const view = assertScreenOk(await r.choose(buyer, 'pda:market:listing', [id]), 'listing');
  assert.match(screenText(view), /At your board/);
  assert.ok(customIds(view).includes(`pda:market:buy:${id}`));
  assert.equal((await r.press(buyer, `pda:market:buy:${id}`)).type, 9);
  const bought = assertScreenOk(await r.submit(buyer, `pdam:market:buy:${id}`, { units: '5' }), 'bought');
  assert.match(screenText(bought), /Bought Iron ×5 for 35 silver\. It is in your Stores/);
  assert.equal(held(buyer, 'metal:iron'), 5);
  assert.equal(silver(buyer), 965);
  assert.ok(silver(seller) > 99, 'the seller paid, less the tax');
  // the seller is told once; a sale this second waits the minute
  r.raw.prepare('UPDATE discord_links SET sale_seen = 0').run();
  assert.equal(await marketNotices(r.ctx()), 0, 'a row of this second waits');
  r.raw.prepare('UPDATE market_sales SET at = at - 10').run();
  assert.equal(await marketNotices(r.ctx()), 1);
  await marketNotices(r.ctx());
  const told = r.raw.prepare("SELECT ref, card FROM discord_notices WHERE discord_id = ? AND kind = 'market'").all(seller.discordId);
  assert.equal(told.length, 1);
  assert.match(told[0].ref, /^sale:\d+$/);
  assert.match(told[0].card, /Iron ×5 for 34 silver/);
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM discord_notices WHERE discord_id = ? AND kind = 'market'").get(buyer.discordId).n, 0);
  // the seller's own listing offers Cancel, never Buy; cancelled, the units come home
  const mine = await r.choose(seller, 'pda:market:listing', [id]);
  assert.ok(customIds(mine).includes(`pda:market:cancel:${id}`));
  assert.ok(!customIds(mine).includes(`pda:market:buy:${id}`));
  assert.match(screenText(await r.submit(seller, `pdam:market:buy:${id}`, { units: '1' })), /That is your own/);
  assert.match(screenText(await r.press(seller, `pda:market:cancel:${id}`)), /Cancelled/);
  assert.equal(held(seller, 'metal:iron'), 25);
});

test('PDA market: a buy from another region needs a road the couriers know; the game\'s refusals are said in words', async () => {
  const { r, stock, trader } = await marketRig();
  const seller = await trader('Gil', { marks: 100, region: BAY });
  const buyer = await trader('Hana', { marks: 5, region: PROVINCE });
  stock(seller, 'metal:tin', 10);
  await r.submit(seller, 'pdam:market:list:metal~tin', { units: '10', price: '50' });
  const id = r.raw.prepare('SELECT id FROM market_listings WHERE seller = ?').get(seller.id).id;
  assert.match(screenText(await r.choose(buyer, 'pda:market:listing', [id])), /do not know the road there/);
  assert.match(screenText(await r.submit(buyer, `pdam:market:buy:${id}`, { units: '1' })), /do not know the road there/);
  // at the same board, short of silver
  await r.choose(buyer, 'pda:market:setboard:0', [String(BAY)]);
  assert.match(screenText(await r.submit(buyer, `pdam:market:buy:${id}`, { units: '1' })), /do not hold that much silver/);
  assert.match(screenText(await r.submit(buyer, `pdam:market:buy:${id}`, { units: 'lots' })), /Units are 1 to/);
  assert.match(screenText(await r.submit(seller, 'pdam:market:list:metal~tin', { units: '99', price: '1' })), /do not hold that many/);
  assert.match(screenText(await r.submit(seller, 'pdam:market:list:metal~iron', { units: '1', price: '0' })), /price is 1 to/);
});

test('PDA market: a buy order posted by name, filled from another\'s Stores at its board, told to the orderer once, and withdrawn', async () => {
  const { r, stock, held, silver, trader } = await marketRig();
  const orderer = await trader('Ines', { marks: 500, region: BAY });
  const filler = await trader('Joss', { marks: 0, region: BAY });
  stock(filler, 'metal:iron', 12);
  assert.equal((await r.press(orderer, 'pda:market:neworder')).type, 9);
  assert.match(screenText(await r.submit(orderer, 'pdam:market:order', { material: 'Iron', units: '10', price: '4' })), /order for Iron ×10 at 4 silver is up/);
  assert.equal(silver(orderer), 460, 'the whole held now');
  assert.match(screenText(await r.submit(orderer, 'pdam:market:order', { material: 'zzzz', units: '1', price: '1' })), /No material has that name/);
  assert.match(screenText(await r.submit(orderer, 'pdam:market:order', { material: 'ore', units: '1', price: '1' })), /More than one material/);
  const oid = r.raw.prepare('SELECT id FROM market_orders WHERE poster = ?').get(orderer.id).id;
  const list = assertScreenOk(await r.press(filler, 'pda:market:orders:0'), 'orders');
  assert.match(screenText(list), /Iron 10 wanted at 4 silver/);
  const view = assertScreenOk(await r.choose(filler, 'pda:market:order', [oid]), 'order');
  assert.match(screenText(view), /Your Stores hold 12/);
  assert.ok(customIds(view).includes(`pda:market:fill:${oid}`));
  assert.equal((await r.press(filler, `pda:market:fill:${oid}`)).type, 9);
  assert.match(screenText(await r.submit(filler, `pdam:market:fill:${oid}`, { units: '6' })), /Filled ×6 for \d+ silver/);
  assert.equal(held(filler, 'metal:iron'), 6);
  assert.equal(held(orderer, 'metal:iron'), 6);
  r.raw.prepare('UPDATE discord_links SET sale_seen = 0').run();
  r.raw.prepare('UPDATE market_fills SET at = at - 10').run();
  await marketNotices(r.ctx());
  await marketNotices(r.ctx());
  const told = r.raw.prepare("SELECT ref FROM discord_notices WHERE discord_id = ? AND kind = 'market'").all(orderer.discordId);
  assert.equal(told.length, 1);
  assert.match(told[0].ref, /^fill:\d+$/);
  // the orderer's own order offers Withdraw, never Fill
  const own = await r.choose(orderer, 'pda:market:order', [oid]);
  assert.ok(customIds(own).includes(`pda:market:unorder:${oid}`));
  assert.ok(!customIds(own).includes(`pda:market:fill:${oid}`));
  assert.match(screenText(await r.press(orderer, `pda:market:unorder:${oid}`)), /Withdrawn/);
  assert.equal(silver(orderer), 460 + 4 * 4, 'the four unfilled units come back');
  await r.press(orderer, `pda:market:unorder:${oid}`);
  assert.equal(silver(orderer), 460 + 4 * 4, 'withdrawn twice returns once');
});

test('PDA market: pieces from the pack and gold are read only - no Buy, and a forged Buy draws the listing, not a form', async () => {
  const { r, trader } = await marketRig();
  const seller = await trader('Kit', { marks: 0, region: BAY });
  const buyer = await trader('Lux', { marks: 100, region: BAY });
  r.raw
    .prepare(`INSERT INTO market_listings (id, seller, char_id, region, kind, units, own, price, fee, at, expires_at, rid, n, currency, item)
      VALUES ('goldgood0001', ?, ?, ?, 'item', 1, 1, 300, 3, ?, ?, 'rid-gold-0001', 'n1', 'gold', ?)`)
    .run(seller.id, seller.character, BAY, r.nowS(), r.nowS() + 3600, JSON.stringify({ name: 'Steel Longsword', group: 'Weapons' }));
  const view = assertScreenOk(await r.choose(buyer, 'pda:market:listing', ['goldgood0001']), 'gold listing');
  assert.match(screenText(view), /Traded in the game/);
  assert.ok(!customIds(view).some((id) => id.startsWith('pda:market:buy')));
  const forged = await r.press(buyer, 'pda:market:buy:goldgood0001');
  assert.notEqual(forged.type, 9, 'no form');
  assert.match(screenText(forged), /Traded in the game/);
  assert.match(screenText(await r.submit(buyer, 'pdam:market:buy:goldgood0001', { units: '1' })), /Traded in the game/);
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n, 0);
  for (const id of ['pda:market:goods', 'pda:market:auctions']) {
    const s = screenText(await r.press(buyer, id));
    assert.match(s, /in the game/);
  }
  assert.match(screenText(await r.press(buyer, 'pda:market:goods')), /Steel Longsword ×1 at 300 gold/);
});

test('PDA market: notices for a link that wants none move its mark and tell nothing', async () => {
  const { r, stock, trader } = await marketRig();
  const seller = await trader('Mae', { marks: 100, region: BAY });
  const buyer = await trader('Ned', { marks: 1000, region: BAY });
  stock(seller, 'metal:iron', 10);
  await r.submit(seller, 'pdam:market:list:metal~iron', { units: '10', price: '2' });
  const id = r.raw.prepare('SELECT id FROM market_listings WHERE seller = ?').get(seller.id).id;
  await r.submit(buyer, `pdam:market:buy:${id}`, { units: '2' });
  r.raw.prepare('UPDATE discord_links SET dm = 0, sale_seen = 0 WHERE discord_id = ?').run(seller.discordId);
  r.raw.prepare('UPDATE market_sales SET at = at - 10').run();
  await marketNotices(r.ctx());
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM discord_notices WHERE discord_id = ?').get(seller.discordId).n, 0);
  assert.ok(r.raw.prepare('SELECT sale_seen FROM discord_links WHERE discord_id = ?').get(seller.discordId).sale_seen > 0);
});
