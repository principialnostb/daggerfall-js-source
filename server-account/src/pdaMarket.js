// @ts-check
// Market: the account's silver, the character's Stores, its listings and buy orders, and the market searched and
// traded from Discord. Every act is market.js's own (list, buy, cancel, order, fill, withdraw), as the account and the
// character, so the switches, the rates, the tax and the walls between silver and gold hold here unchanged.
// What moves the character's save stays in the game: crafted pieces, pieces from the pack, gold, auctions, collecting.
//
// In the game a board is the town the character stands in. From Discord the player chooses a region's board once
// (pda_boards) and the PDA lists, orders and buys there. Any of the world's regions may be chosen.
import { text, select, button, STYLE, md, when, plural, divider, ACCENT, modal, line, num } from './pdaUi.js';
import { frame, refusalText } from './pdaFrame.js';
import {
  marketOpenFor,
  marketRead,
  marketList,
  marketBuy,
  marketCancel,
  marketOrder,
  marketFill,
  marketUnorder,
} from './market.js';
import { marksOpenFor, balanceOf } from './marks.js';
import { mintId } from './accounts.js';
import { NOTICE_KINDS } from './pdaLink.js';
import { noticeBound, noticeStatement } from './pdaNotices.js';
import { REGION_NAMES } from '../../src/formats/mapsTables.js';
import { material, regionOk } from '../../src/net/nodeLaw.js';
import { minedMaterial } from '../../src/net/professionLaw.js';
import { templateByIndex } from '../../src/systems/item/itemTemplates.js';
import '../../src/systems/professions/profTemplates.js';
import {
  marketCatalogue,
  courierFee,
  MARKET_ID_RE,
  MARKET_UNITS_MAX,
  MARKET_PRICE_MAX,
  MARKET_ORDERS_MAX,
  MARKET_LISTING_S,
  MARKET_SHOWN,
} from '../../src/net/marketLaw.js';

/** Rows a page of the Stores, a search or the orders shows. */
export const MARKET_PAGE = 10;
/** Sales and fills the clock tells of in one minute, all users together. */
export const MARKET_NOTICES_A_MINUTE = 50;

const MARKET_WORDS = Object.freeze({
  'market-closed': 'The market is not open yet.',
  'market-gone': 'That is no longer on the market.',
  'market-own': 'That is your own. Cancel it from My listings instead.',
  'market-short': 'There are not that many left.',
  'market-rate': 'You have done too much at the market this hour. Try again later.',
  'market-no-road': 'The couriers do not know the road there yet. Buy it in the game.',
  'market-price-moved': 'Prices have changed since you looked. Look again.',
  'market-listings-max': 'You have as many listings up as this board allows. Cancel one first.',
  'market-orders-max': `You have ${MARKET_ORDERS_MAX} buy orders up already. Withdraw one first.`,
  'market-seller-frozen': 'That seller’s goods are on hold for now.',
  'market-seller-full': 'The seller cannot hold any more silver just now.',
  'market-order-full': 'The buyer’s Stores cannot hold that many more.',
  'market-courier-dear': 'The courier to that order’s region would cost all it pays. Fill more at once.',
  'market-taxed-out': 'Filled alone, that would pay you nothing once the tax is taken. Fill more at once.',
  'market-unyielded': 'Nothing produces that yet, so no one could fill an order for it.',
  'market-gold-goods': 'Goods bought with gold sell only for gold. Sell them in the game.',
  'market-drakes-goods': 'Goods bought with silver sell only for silver.',
  'market-gold-realm': 'Gold trades are made in the game.',
  'marks-short': 'You do not hold that much silver.',
  'marks-closed': 'Silver is not available yet.',
  'stores-short': 'Your Stores do not hold that many.',
  'stores-full': 'Your Stores have no room for that.',
  'bad-units': `Units are 1 to ${num(MARKET_UNITS_MAX)} at a time.`,
  'bad-price': `A price is 1 to ${num(MARKET_PRICE_MAX)} silver.`,
  'bad-material': 'The Stores do not keep that.',
  'bad-listing': 'That listing could not be read.',
  'bad-order': 'That order could not be read.',
  'bad-region': 'Choose your board first.',
  'prof-need-account': 'Register your account in the game first.',
  'prof-closed': 'Professions are not open yet.',
  'no-board': 'Choose the board you trade at first.',
  'no-material': 'No material has that name. Try fewer words.',
  'many-materials': 'More than one material has that name. Name it more exactly.',
  held: 'This character is on hold and cannot trade now.',
  law: 'This character is on hold and cannot trade now.',
});
const say = (/** @type {string} */ e) => refusalText(e, MARKET_WORDS);

/** A material key carried in a custom id, whose own colon would split it. */
const enc = (/** @type {string} */ k) => String(k).replaceAll(':', '~');
const dec = (/** @type {string} */ k) => String(k ?? '').replaceAll('~', ':');

/** Herbs that grow in both lands share a name; those are told apart as the Stores tab tells them. */
const HERB_BOTH = (() => {
  const by = new Map();
  for (const c of marketCatalogue().filter((x) => x.family === 'herbs')) {
    const n = templateByIndex(c.templateIndex)?.name;
    if (n) by.set(n, (by.get(n) ?? 0) + 1);
  }
  return new Set([...by].filter(([, n]) => n > 1).map(([n]) => n));
})();
const FOOD_NAMES = Object.freeze({ meat: 'Raw Meat' });
/** A material's name as the Stores tab says it. */
export function materialName(/** @type {string} */ key) {
  const m = material(key);
  if (!m) return String(key ?? '');
  if (m.family === 'food') {
    const w = String(key).split(':')[1] ?? '';
    return /** @type {Record<string, string>} */ (FOOD_NAMES)[w] ?? `${w.charAt(0).toUpperCase()}${w.slice(1)}`;
  }
  const name = templateByIndex(m.templateIndex)?.name ?? minedMaterial(key)?.name ?? String(key);
  if (m.family === 'herbs' && HERB_BOTH.has(name)) return `${name} (${String(key).startsWith('p2:') ? 'southern' : 'northern'})`;
  return name;
}
/** Every material the market trades, with its name. */
const CATALOGUE = Object.freeze(marketCatalogue().map((c) => Object.freeze({ key: c.key, family: c.family, name: materialName(c.key) })));
/** The materials whose names hold every word. */
export function materialsNamed(/** @type {string} */ words) {
  const ws = String(words ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (!ws.length) return [];
  const exact = CATALOGUE.filter((c) => c.name.toLowerCase() === ws.join(' '));
  if (exact.length) return exact;
  return CATALOGUE.filter((c) => ws.every((w) => c.name.toLowerCase().includes(w) || c.family.startsWith(w)));
}

/** A region's name, any of the world's. */
const regionName = (/** @type {number} */ r) => REGION_NAMES[r] ?? `Region ${r}`;
/** The regions in name order, cut into menus of at most 24. */
const REGION_MENUS = (() => {
  const sorted = REGION_NAMES.map((n, i) => ({ n, i })).sort((a, b) => a.n.localeCompare(b.n));
  const out = [];
  for (let i = 0; i < sorted.length; i += 24) out.push(sorted.slice(i, i + 24));
  return out;
})();

/** The board the character trades at from Discord, or null. */
async function boardOf(/** @type {any} */ who) {
  if (!who.character) return null;
  const r = await who.ctx.db
    .prepare('SELECT region FROM pda_boards WHERE player_id = ?1 AND char_id = ?2')
    .bind(who.player.id, who.character.id)
    .first();
  return r && regionOk(Number(r.region)) ? Number(r.region) : null;
}

/** A fresh request id for an act. */
const ridOf = (/** @type {any} */ who) => mintId(who.ctx.rand);

/** The screen for a market that is not open to this account, or no character. Null when it is open. */
function closedScreen(/** @type {any} */ who) {
  if (!who.character) return frame(who, 'market', [text(refusalText('no-character'))]);
  if (!marketOpenFor(who.player, who.env)) return frame(who, 'market', [text(say('market-closed'))]);
  return null;
}

/** The Stores of the character: each material held, with how much of it came from where. */
async function storesOf(/** @type {any} */ who) {
  const rows =
    (
      await who.ctx.db
        .prepare('SELECT material, origin, qty FROM prof_stores WHERE player = ?1 AND char_id = ?2 AND qty > 0')
        .bind(who.player.id, who.character.id)
        .all()
    )?.results ?? [];
  const by = new Map();
  for (const r of rows) {
    const s = by.get(r.material) ?? { key: r.material, own: 0, bought: 0, gold: 0 };
    if (r.origin === 'own' || r.origin === 'bought' || r.origin === 'gold') s[r.origin] += Number(r.qty);
    by.set(r.material, s);
  }
  return [...by.values()]
    .filter((s) => material(s.key))
    .map((s) => ({ ...s, name: materialName(s.key), total: s.own + s.bought + s.gold }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

/** The market's front page. @param {any} who @param {string} [said] */
async function marketScreen(who, said = '') {
  const shut = closedScreen(who);
  if (shut) return shut;
  const board = await boardOf(who);
  const counts = await who.ctx.db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM market_listings WHERE seller = ?1 AND state = 'open' AND expires_at > ?2) AS listings,
        (SELECT COUNT(*) FROM market_orders WHERE poster = ?1 AND state = 'open' AND expires_at > ?2) AS orders`,
    )
    .bind(who.player.id, who.ctx.nowS)
    .first();
  const stores = await storesOf(who);
  const lines = [
    marksOpenFor(who.player, who.env) ? `**Silver:** ${num(await balanceOf(who.ctx.db, who.player.id))}` : '',
    `**Board:** ${board == null ? 'not chosen yet' : md(regionName(board), 40)}`,
    `**Yours:** ${plural(Number(counts?.listings) || 0, 'listing')} up · ${plural(Number(counts?.orders) || 0, 'buy order')} up`,
    stores.length
      ? `**Stores:** ${stores
          .slice(0, 6)
          .map((s) => `${md(s.name, 30)} ${num(s.total)}`)
          .join(' · ')}${stores.length > 6 ? ` · and ${stores.length - 6} more` : ''}`
      : '-# The Stores are empty.',
    '-# Crafted pieces, pieces from the pack, gold and auctions are traded in the game.',
  ].filter(Boolean);
  return frame(who, 'market', [...(said ? [text(said), divider()] : []), text(lines.join('\n'))], {
    actions: [
      button('Search', 'pda:market:search', { style: STYLE.PRIMARY }),
      button('Stores', 'pda:market:stores:0'),
      button('My listings', 'pda:market:mine'),
      button('Buy orders', 'pda:market:orders:0'),
      button('Board', 'pda:market:board'),
      button('Goods for gold', 'pda:market:goods'),
      button('Auctions', 'pda:market:auctions'),
    ],
  });
}

/** The board chooser: every region of the world, in menus by name. */
async function boardScreen(who, said = '') {
  const shut = closedScreen(who);
  if (shut) return shut;
  const board = await boardOf(who);
  return frame(
    who,
    'market',
    [
      ...(said ? [text(said), divider()] : []),
      text(
        `**Your board:** ${board == null ? 'not chosen yet' : md(regionName(board), 40)}\n-# You list, order and buy at this region’s board. A buy from another region comes by courier.`,
      ),
      ...REGION_MENUS.map((menu, i) =>
        select(
          `pda:market:setboard:${i}`,
          menu.map((r) => ({ label: r.n, value: String(r.i), default: r.i === board })),
          { placeholder: `Regions ${menu[0].n.charAt(0)} to ${menu[menu.length - 1].n.charAt(0)}…` },
        ),
      ),
    ],
    { title: 'Board', actions: [button('Back', 'pda:market')] },
  );
}

/** The Stores, a page, with a menu to sell one. */
async function storesScreen(who, page = 0, said = '') {
  const shut = closedScreen(who);
  if (shut) return shut;
  const all = await storesOf(who);
  const pages = Math.max(1, Math.ceil(all.length / MARKET_PAGE));
  const p = Math.min(Math.max(0, page | 0), pages - 1);
  const shown = all.slice(p * MARKET_PAGE, (p + 1) * MARKET_PAGE);
  const lines = shown.map(
    (s) =>
      `· **${md(s.name, 30)}** ${num(s.total)}${s.bought || s.gold ? ` (${[s.own ? `${num(s.own)} gathered` : '', s.bought ? `${num(s.bought)} bought` : '', s.gold ? `${num(s.gold)} bought with gold` : ''].filter(Boolean).join(', ')})` : ''}`,
  );
  const sellable = shown.filter((s) => s.own + s.bought > 0);
  return frame(
    who,
    'market',
    [
      ...(said ? [text(said), divider()] : []),
      text(`**Stores of ${md(who.character.name, 40)}**${pages > 1 ? ` · page ${p + 1} of ${pages}` : ''}`),
      text(lines.join('\n') || '-# The Stores are empty.'),
      ...(sellable.length
        ? [
            select(
              'pda:market:sell',
              sellable.map((s) => ({ label: `Sell ${s.name}`, value: enc(s.key), description: `${num(s.own + s.bought)} may be sold for silver` })),
              { placeholder: 'Sell a material…' },
            ),
          ]
        : []),
    ],
    {
      title: 'Stores',
      actions: [
        ...(p > 0 ? [button('Previous', `pda:market:stores:${p - 1}`)] : []),
        ...(p < pages - 1 ? [button('Next', `pda:market:stores:${p + 1}`)] : []),
        button('Back', 'pda:market'),
      ],
    },
  );
}

/** A listing's line: what, how many, the price, where. */
const listingLine = (/** @type {any} */ l) =>
  `${l.kind === 'material' ? md(materialName(l.material), 30) : l.kind === 'item' ? md(l.item?.name ?? 'A piece', 30) : 'A crafted piece'} ×${num(l.units)} at ${num(l.price)} ${l.currency === 'gold' ? 'gold' : 'silver'} · ${md(regionName(l.region), 30)}`;

/** The account's listings and buy orders. */
async function mineScreen(who, said = '') {
  const shut = closedScreen(who);
  if (shut) return shut;
  const board = (await boardOf(who)) ?? 0;
  const r = await marketRead(who.ctx, who.player, who.env, { character: who.character.id, region: board, view: 'mine' });
  if ('error' in r) return marketScreen(who, say(r.error));
  const open = r.rows.filter((/** @type {any} */ l) => l.state === 'open').slice(0, 12);
  const done = r.rows.filter((/** @type {any} */ l) => l.state !== 'open').slice(0, 5);
  const orders = r.orders.filter((/** @type {any} */ o) => o.state === 'open').slice(0, 12);
  return frame(
    who,
    'market',
    [
      ...(said ? [text(said), divider()] : []),
      text(
        [
          '**Listings up**',
          open.length ? open.map((/** @type {any} */ l) => `· ${listingLine(l)} · ends ${when(l.expiresAt, 'R')}`).join('\n') : '-# None.',
          ...(done.length ? ['**Lately**', done.map((/** @type {any} */ l) => `-# ${listingLine(l)} · ${l.state}`).join('\n')] : []),
          '**Buy orders up**',
          orders.length
            ? orders.map((/** @type {any} */ o) => `· ${md(materialName(o.material), 30)} ${num(o.left)} of ${num(o.units)} at ${num(o.price)} silver · ${md(regionName(o.region), 30)}`).join('\n')
            : '-# None.',
        ].join('\n'),
      ),
      ...(open.length
        ? [select('pda:market:listing', open.map((/** @type {any} */ l) => ({ label: line(listingLine(l).replace(/\\/g, ''), 100), value: l.id })), { placeholder: 'Open a listing…' })]
        : []),
      ...(orders.length
        ? [
            select(
              'pda:market:order',
              orders.map((/** @type {any} */ o) => ({ label: `${materialName(o.material)} ×${o.left} at ${o.price}`, value: o.id })),
              { placeholder: 'Open a buy order…' },
            ),
          ]
        : []),
    ],
    { title: 'My listings', actions: [button('New buy order', 'pda:market:neworder'), button('Back', 'pda:market')] },
  );
}

/** One listing: its goods, price and road, with Buy or Cancel where the PDA may do it. */
async function listingScreen(who, id, said = '') {
  const shut = closedScreen(who);
  if (shut) return shut;
  if (!MARKET_ID_RE.test(String(id))) return marketScreen(who, say('bad-listing'));
  const l = await who.ctx.db
    .prepare('SELECT id, seller, kind, material, item, region, own, bought, price, currency, state, expires_at FROM market_listings WHERE id = ?1')
    .bind(id)
    .first();
  if (!l || l.state !== 'open' || Number(l.expires_at) <= who.ctx.nowS) return marketScreen(who, say('market-gone'));
  const mine = l.seller === who.player.id;
  const left = Number(l.own) + Number(l.bought);
  const board = await boardOf(who);
  let item = null;
  try {
    item = l.kind === 'item' ? JSON.parse(l.item) : null;
  } catch {
    item = null;
  }
  const view = { ...l, units: left, price: Number(l.price), region: Number(l.region), item };
  const silver = l.currency !== 'gold';
  const pdaMay = l.kind === 'material' && silver;
  let road = '';
  if (pdaMay && !mine && board != null) {
    if (board === Number(l.region)) road = 'At your board: it goes straight into your Stores.';
    else {
      const q = await quoteOf(who, l, board);
      road = q ? `By courier to ${md(regionName(board), 30)}: ${num(q.courier)} silver for all, about ${Math.max(1, Math.round(q.seconds / 60))} min.` : say('market-no-road');
    }
  }
  const lines = [
    `## ${listingLine(view)}`,
    `-# Ends ${when(l.expires_at, 'R')}${mine ? ' · yours' : ''}`,
    ...(road ? [road] : []),
    ...(!pdaMay ? ['-# Traded in the game: it changes a character’s pack or gold.'] : []),
    ...(pdaMay && !mine && board == null ? [say('no-board')] : []),
  ];
  return frame(who, 'market', [...(said ? [text(said), divider()] : []), text(lines.join('\n'))], {
    title: 'Listing',
    actions: [
      ...(pdaMay && !mine && board != null ? [button('Buy', `pda:market:buy:${l.id}`, { style: STYLE.SUCCESS })] : []),
      ...(mine && l.kind === 'material' ? [button('Cancel listing', `pda:market:cancel:${l.id}`, { style: STYLE.DANGER })] : []),
      ...(pdaMay && !mine && board == null ? [button('Choose board', 'pda:market:board')] : []),
      button('Back', 'pda:market'),
    ],
  });
}

/** The courier for a listing's units to the board, as the market quotes it - or null where it knows no road. */
async function quoteOf(who, l, board, units = null) {
  const r = await marketRead(who.ctx, who.player, who.env, {
    character: who.character.id,
    region: board,
    view: 'materials',
    material: l.material,
  });
  if ('error' in r) return null;
  const row = r.rows.find((/** @type {any} */ x) => x.id === l.id);
  if (!row?.road) return null;
  if (units == null) return row.road;
  return { ...row.road, courier: row.road.road > 0 ? courierFee(units, row.road.road) : 0 };
}

/** A search's answer: the cheapest material listings for silver whose names hold the words. */
async function searchScreen(who, words, here, said = '') {
  const shut = closedScreen(who);
  if (shut) return shut;
  const board = await boardOf(who);
  if (here && board == null) return boardScreen(who, say('no-board'));
  const keys = String(words ?? '').trim() ? materialsNamed(words).map((c) => c.key) : null;
  if (keys && !keys.length) return marketScreen(who, say('no-material'));
  const r = await marketRead(who.ctx, who.player, who.env, {
    character: who.character.id,
    region: board ?? 0,
    view: 'materials',
    ...(keys ? { materials: keys.slice(0, 120) } : {}),
  });
  if ('error' in r) return marketScreen(who, say(r.error));
  const rows = r.rows
    .filter((/** @type {any} */ l) => !here || l.region === board)
    .sort((/** @type {any} */ a, /** @type {any} */ b) => a.price - b.price)
    .slice(0, MARKET_PAGE);
  const lines = rows.map((/** @type {any} */ l) => `· ${listingLine(l)}${l.mine ? ' · yours' : ''}`);
  return frame(
    who,
    'market',
    [
      ...(said ? [text(said), divider()] : []),
      text(
        `**${words ? `“${md(words, 40)}”` : 'Everything'}** · ${here ? md(regionName(/** @type {number} */ (board)), 30) : 'all regions'} · cheapest first`,
      ),
      text(lines.join('\n') || '-# Nothing is listed for silver.'),
      ...(rows.length
        ? [select('pda:market:listing', rows.map((/** @type {any} */ l) => ({ label: line(listingLine(l).replace(/\\/g, ''), 100), value: l.id })), { placeholder: 'Open a listing…' })]
        : []),
    ],
    { title: 'Search', actions: [button('Search again', 'pda:market:search', { style: STYLE.PRIMARY }), button('Back', 'pda:market')] },
  );
}

/** The open buy orders of every board, dearest first, a page of MARKET_PAGE out of the market's own pages. */
async function ordersScreen(who, page = 0, said = '') {
  const shut = closedScreen(who);
  if (shut) return shut;
  const board = (await boardOf(who)) ?? 0;
  const read = (/** @type {number} */ p) =>
    marketRead(who.ctx, who.player, who.env, { character: who.character.id, region: board, view: 'orders', page: Math.floor((p * MARKET_PAGE) / MARKET_SHOWN) });
  let p = Math.max(0, page | 0);
  let r = await read(p);
  if ('error' in r) return marketScreen(who, say(r.error));
  const pages = Math.max(1, Math.ceil((Number(r.total) || 0) / MARKET_PAGE));
  if (p > pages - 1) {
    p = pages - 1;
    r = await read(p);
    if ('error' in r) return marketScreen(who, say(r.error));
  }
  const offset = p * MARKET_PAGE - Math.floor((p * MARKET_PAGE) / MARKET_SHOWN) * MARKET_SHOWN;
  const rows = r.orders.slice(offset, offset + MARKET_PAGE);
  return frame(
    who,
    'market',
    [
      ...(said ? [text(said), divider()] : []),
      text(
        `${pages > 1 ? `-# Page ${p + 1} of ${pages}\n` : ''}${
          rows
            .map((/** @type {any} */ o) => `· ${md(materialName(o.material), 30)} ${num(o.left)} wanted at ${num(o.price)} silver · ${md(regionName(o.region), 30)}${o.mine ? ' · yours' : ''}`)
            .join('\n') || '-# No buy orders are up.'
        }`,
      ),
      ...(rows.length
        ? [
            select(
              'pda:market:order',
              rows.map((/** @type {any} */ o) => ({ label: `${materialName(o.material)} ×${o.left} at ${o.price}`, value: o.id, description: line(regionName(o.region), 60) })),
              { placeholder: 'Open a buy order…' },
            ),
          ]
        : []),
    ],
    {
      title: 'Buy orders',
      actions: [
        ...(p > 0 ? [button('Previous', `pda:market:orders:${p - 1}`)] : []),
        ...(p < pages - 1 ? [button('Next', `pda:market:orders:${p + 1}`)] : []),
        button('New buy order', 'pda:market:neworder'),
        button('Back', 'pda:market'),
      ],
    },
  );
}

/** One buy order: what it wants, with Fill or Withdraw. */
async function orderScreen(who, id, said = '') {
  const shut = closedScreen(who);
  if (shut) return shut;
  if (!MARKET_ID_RE.test(String(id))) return ordersScreen(who, 0, say('bad-order'));
  const o = await who.ctx.db.prepare('SELECT * FROM market_orders WHERE id = ?1').bind(id).first();
  if (!o || o.state !== 'open' || Number(o.expires_at) <= who.ctx.nowS) return ordersScreen(who, 0, say('market-gone'));
  const mine = o.poster === who.player.id;
  const held = (await storesOf(who)).find((s) => s.key === o.material);
  const may = held ? held.own + held.bought : 0;
  const board = await boardOf(who);
  return frame(
    who,
    'market',
    [
      ...(said ? [text(said), divider()] : []),
      text(
        [
          `## ${md(materialName(o.material), 30)} ×${num(o.left_units)} at ${num(o.price)} silver`,
          `-# ${md(regionName(Number(o.region)), 30)} · ends ${when(o.expires_at, 'R')}${mine ? ' · yours' : ''}`,
          ...(!mine ? [may ? `Your Stores hold ${num(may)} you may sell.` : '-# Your Stores hold none of it.'] : []),
          ...(!mine && may && board == null ? [say('no-board')] : []),
        ].join('\n'),
      ),
    ],
    {
      title: 'Buy order',
      actions: [
        ...(!mine && may && board != null ? [button('Fill', `pda:market:fill:${o.id}`, { style: STYLE.SUCCESS })] : []),
        ...(mine ? [button('Withdraw', `pda:market:unorder:${o.id}`, { style: STYLE.DANGER })] : []),
        button('Back', 'pda:market:orders:0'),
      ],
    },
  );
}

/** Pieces from the pack listed for gold, read only. */
async function goodsScreen(who) {
  const shut = closedScreen(who);
  if (shut) return shut;
  const r = await marketRead(who.ctx, who.player, who.env, { character: who.character.id, region: (await boardOf(who)) ?? 0, view: 'goods' });
  if ('error' in r) return marketScreen(who, say(r.error));
  const rows = r.rows.slice(0, 12);
  return frame(
    who,
    'market',
    [
      text(rows.map((/** @type {any} */ l) => `· ${listingLine(l)}`).join('\n') || '-# No goods are listed.'),
      text('-# Goods are bought with a character’s gold, in the game.'),
    ],
    { title: 'Goods for gold', actions: [button('Back', 'pda:market')] },
  );
}

/** Open auctions, ending soonest first, read only. */
async function auctionsScreen(who) {
  const shut = closedScreen(who);
  if (shut) return shut;
  const r = await marketRead(who.ctx, who.player, who.env, { character: who.character.id, region: (await boardOf(who)) ?? 0, view: 'auctions' });
  if ('error' in r) return marketScreen(who, say(r.error));
  const rows = r.rows.slice(0, 12);
  return frame(
    who,
    'market',
    [
      text(
        rows
          .map(
            (/** @type {any} */ a) =>
              `· ${md(a.piece?.recipe ?? 'A Masterwork', 30)} · ${a.high == null ? `opens at ${num(a.opening)}` : `${num(a.high)} high`} silver · ends ${when(a.endsAt, 'R')}${a.leading ? ' · you lead' : ''}`,
          )
          .join('\n') || '-# No auctions are open.',
      ),
      text('-# Bids are made in the game.'),
    ],
    { title: 'Auctions', actions: [button('Back', 'pda:market')] },
  );
}

/** The form a material is listed with. */
const listForm = (/** @type {string} */ key, /** @type {number} */ may) =>
  modal(`pdam:market:list:${enc(key)}`, `Sell ${line(materialName(key), 30)}`, [
    { id: 'units', label: 'Units', hint: `You may sell up to ${num(may)}`, max: 5, value: String(Math.min(may, 10)) },
    { id: 'price', label: 'Price a unit, in silver', hint: `Listed for ${MARKET_LISTING_S / 3600} hours. A small fee is taken now.`, max: 7 },
  ]);

/** A whole number from a form, or NaN. */
const whole = (/** @type {unknown} */ v) => (/^\s*\d{1,9}\s*$/.test(String(v ?? '')) ? Number(String(v).trim()) : NaN);

export const marketPda = {
  key: 'market',
  /** @param {any} who */
  screen: async (who) => marketScreen(who),
  acts: {
    /** @param {any} who */
    board: async (who) => boardScreen(who),
    /** The board chosen. @param {any} who @param {string[]} _a @param {string[]} values */
    async setboard(who, _a, values) {
      const shut = closedScreen(who);
      if (shut) return shut;
      const r = Number(values[0]);
      if (!Number.isInteger(r) || !regionOk(r)) return boardScreen(who, say('bad-region'));
      await who.ctx.db
        .prepare(
          'INSERT INTO pda_boards (player_id, char_id, region, at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (player_id, char_id) DO UPDATE SET region = excluded.region, at = excluded.at',
        )
        .bind(who.player.id, who.character.id, r, who.ctx.nowS)
        .run();
      return marketScreen(who, `You trade at the board of **${md(regionName(r), 40)}**.`);
    },
    /** @param {any} who @param {string[]} args */
    stores: async (who, args) => storesScreen(who, Number(args[0]) || 0),
    /** A material chosen to sell: its form. @param {any} who @param {string[]} args @param {string[]} values */
    async sell(who, args, values) {
      const shut = closedScreen(who);
      if (shut) return shut;
      const key = dec(values[0] ?? args[0]);
      const s = (await storesOf(who)).find((x) => x.key === key);
      if (!s || s.own + s.bought < 1) return storesScreen(who, 0, say('stores-short'));
      if ((await boardOf(who)) == null) return boardScreen(who, say('no-board'));
      return listForm(key, s.own + s.bought);
    },
    /** @param {any} who */
    mine: async (who) => mineScreen(who),
    /** @param {any} who @param {string[]} args @param {string[]} values */
    listing: async (who, args, values) => listingScreen(who, String(values[0] ?? args[0] ?? '')),
    /** The buy form. @param {any} who @param {string[]} args */
    async buy(who, args) {
      const shut = closedScreen(who);
      if (shut) return shut;
      const l = MARKET_ID_RE.test(String(args[0]))
        ? await who.ctx.db.prepare("SELECT id, material, own, bought, price, kind, currency FROM market_listings WHERE id = ?1 AND state = 'open'").bind(args[0]).first()
        : null;
      if (!l) return marketScreen(who, say('market-gone'));
      if (l.kind !== 'material' || l.currency === 'gold') return listingScreen(who, l.id);
      const left = Number(l.own) + Number(l.bought);
      return modal(`pdam:market:buy:${l.id}`, `Buy ${line(materialName(l.material), 34)}`, [
        { id: 'units', label: 'Units', hint: `${num(left)} left at ${num(l.price)} silver each`, max: 5, value: String(Math.min(left, 1)) },
      ]);
    },
    /** @param {any} who @param {string[]} args */
    async cancel(who, args) {
      const shut = closedScreen(who);
      if (shut) return shut;
      const r = await marketCancel(who.ctx, who.player, who.env, { character: who.character.id, listing: args[0], rid: ridOf(who) });
      return mineScreen(who, 'error' in r ? say(r.error) : 'Cancelled. The units are back in your Stores.');
    },
    /** The search form. */
    search: async () =>
      modal('pdam:market:search', 'Search the market', [
        { id: 'words', label: 'Material', hint: 'Its name, or part of it. Empty finds everything.', required: false, max: 40 },
        {
          id: 'where',
          label: 'Where',
          options: [
            { label: 'Every region', value: 'all', default: true },
            { label: 'My board’s region only', value: 'here' },
          ],
        },
      ]),
    /** @param {any} who @param {string[]} args */
    orders: async (who, args) => ordersScreen(who, Number(args[0]) || 0),
    /** @param {any} who @param {string[]} args @param {string[]} values */
    order: async (who, args, values) => orderScreen(who, String(values[0] ?? args[0] ?? '')),
    /** The fill form. @param {any} who @param {string[]} args */
    async fill(who, args) {
      const shut = closedScreen(who);
      if (shut) return shut;
      const o = MARKET_ID_RE.test(String(args[0])) ? await who.ctx.db.prepare("SELECT id, material, left_units, price FROM market_orders WHERE id = ?1 AND state = 'open'").bind(args[0]).first() : null;
      if (!o) return ordersScreen(who, 0, say('market-gone'));
      return modal(`pdam:market:fill:${o.id}`, `Fill: ${line(materialName(o.material), 36)}`, [
        { id: 'units', label: 'Units', hint: `${num(o.left_units)} wanted at ${num(o.price)} silver each, less the tax`, max: 5 },
      ]);
    },
    /** @param {any} who @param {string[]} args */
    async unorder(who, args) {
      const shut = closedScreen(who);
      if (shut) return shut;
      const r = await marketUnorder(who.ctx, who.player, who.env, { order: args[0], rid: ridOf(who) });
      return mineScreen(who, 'error' in r ? say(r.error) : 'Withdrawn. What it held is back with you.');
    },
    /** The new buy order form. @param {any} who */
    async neworder(who) {
      const shut = closedScreen(who);
      if (shut) return shut;
      if ((await boardOf(who)) == null) return boardScreen(who, say('no-board'));
      return modal('pdam:market:order', 'New buy order', [
        { id: 'material', label: 'Material', hint: 'Its name, as the Stores say it', max: 40 },
        { id: 'units', label: 'Units', max: 5 },
        { id: 'price', label: 'Price a unit, in silver', hint: 'The whole is held from your silver now', max: 7 },
      ]);
    },
    /** @param {any} who */
    goods: async (who) => goodsScreen(who),
    /** @param {any} who */
    auctions: async (who) => auctionsScreen(who),
  },
  forms: {
    /** A material listed at the board. @param {any} who @param {Record<string, string>} values @param {string[]} args */
    async list(who, values, args) {
      const shut = closedScreen(who);
      if (shut) return shut;
      const board = await boardOf(who);
      if (board == null) return boardScreen(who, say('no-board'));
      const key = dec(args[0]);
      const r = await marketList(who.ctx, who.player, who.env, {
        character: who.character.id,
        region: board,
        kind: 'material',
        material: key,
        units: whole(values.units),
        price: whole(values.price),
        rid: ridOf(who),
        currency: 'marks',
      });
      if ('error' in r) return storesScreen(who, 0, say(r.error));
      return mineScreen(who, `Listed ${md(materialName(key), 30)} ×${num(r.listing.units)} at ${num(r.listing.price)} silver at ${md(regionName(board), 30)}.`);
    },
    /** A listing bought, its courier quoted as the market quotes it. @param {any} who @param {Record<string, string>} values @param {string[]} args */
    async buy(who, values, args) {
      const shut = closedScreen(who);
      if (shut) return shut;
      const board = await boardOf(who);
      if (board == null) return boardScreen(who, say('no-board'));
      const units = whole(values.units);
      const l = MARKET_ID_RE.test(String(args[0]))
        ? await who.ctx.db.prepare('SELECT id, material, region, price, kind, currency, state FROM market_listings WHERE id = ?1').bind(args[0]).first()
        : null;
      if (!l || l.state !== 'open') return marketScreen(who, say('market-gone'));
      if (l.kind !== 'material' || l.currency === 'gold') return listingScreen(who, l.id);
      if (!Number.isSafeInteger(units) || units < 1) return listingScreen(who, l.id, say('bad-units'));
      const here = Number(l.region) === board;
      const road = here ? { courier: 0 } : await quoteOf(who, l, board, units);
      if (!road) return listingScreen(who, l.id, say('market-no-road'));
      const r = await marketBuy(who.ctx, who.player, who.env, {
        character: who.character.id,
        region: board,
        listing: l.id,
        units,
        max: units * Number(l.price) + road.courier,
        rid: ridOf(who),
      });
      if ('error' in r) return listingScreen(who, l.id, say(r.error));
      const s = r.sale;
      return marketScreen(
        who,
        `Bought ${md(materialName(l.material), 30)} ×${num(s.units)} for ${num(s.total + s.courier)} silver. ${s.here ? 'It is in your Stores.' : `It arrives ${when(s.arrivesAt, 'R')}.`}`,
      );
    },
    /** @param {any} who @param {Record<string, string>} values */
    async search(who, values) {
      return searchScreen(who, String(values.words ?? '').trim(), values.where === 'here');
    },
    /** An order filled from the Stores. @param {any} who @param {Record<string, string>} values @param {string[]} args */
    async fill(who, values, args) {
      const shut = closedScreen(who);
      if (shut) return shut;
      const board = await boardOf(who);
      if (board == null) return boardScreen(who, say('no-board'));
      const r = await marketFill(who.ctx, who.player, who.env, {
        character: who.character.id,
        region: board,
        order: args[0],
        units: whole(values.units),
        rid: ridOf(who),
      });
      if ('error' in r) return orderScreen(who, args[0], say(r.error));
      return ordersScreen(who, 0, `Filled ×${num(r.fill.units)} for ${num(r.fill.pay)} silver.`);
    },
    /** A buy order posted at the board. @param {any} who @param {Record<string, string>} values */
    async order(who, values) {
      const shut = closedScreen(who);
      if (shut) return shut;
      const board = await boardOf(who);
      if (board == null) return boardScreen(who, say('no-board'));
      const found = materialsNamed(values.material);
      if (!found.length) return mineScreen(who, say('no-material'));
      if (found.length > 1)
        return mineScreen(who, `${say('many-materials')} -# ${found.slice(0, 6).map((c) => md(c.name, 30)).join(', ')}`);
      const r = await marketOrder(who.ctx, who.player, who.env, {
        character: who.character.id,
        region: board,
        material: found[0].key,
        units: whole(values.units),
        price: whole(values.price),
        rid: ridOf(who),
      });
      if ('error' in r) return mineScreen(who, say(r.error));
      return mineScreen(who, `Your order for ${md(found[0].name, 30)} ×${num(r.order.units)} at ${num(r.order.price)} silver is up.`);
    },
  },
  /** @param {any} who */
  async glance(who) {
    if (!marketOpenFor(who.player, who.env)) return null;
    const n = await who.ctx.db
      .prepare(
        `SELECT (SELECT balance FROM marks WHERE account = ?1) AS silver,
          (SELECT COUNT(*) FROM market_listings WHERE seller = ?1 AND state = 'open' AND expires_at > ?2) AS listings`,
      )
      .bind(who.player.id, who.ctx.nowS)
      .first();
    return `⚖ **Market:** ${num(Number(n?.silver) || 0)} silver · ${plural(Number(n?.listings) || 0, 'listing')} up`;
  },
  minute: async (/** @type {any} */ ctx) => marketNotices(ctx),
};

/**
 * The clock's news of the market: each sale of a linked account's listings, each fill of its buy orders and each of
 * its auctions sold, since the link's mark. Rows from the last two seconds wait a minute, so a row written in the
 * mark's own second is never passed over. Links that want no market news have their mark moved too.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function marketNotices(ctx) {
  const { db, nowS } = ctx;
  const upTo = nowS - 2;
  const sales =
    (
      await db
        .prepare(
          `SELECT d.discord_id, d.dm, s.rowid AS rn, s.kind, s.material, s.units, s.total, s.tax, s.tithe, s.fee, s.currency, s.at, l.item
           FROM discord_links d JOIN market_sales s ON s.seller = d.player_id AND s.at > d.sale_seen AND s.at <= ?1
           LEFT JOIN market_listings l ON l.id = s.listing
           WHERE d.dm_dead = 0 ORDER BY s.at LIMIT ?2`,
        )
        .bind(upTo, MARKET_NOTICES_A_MINUTE)
        .all()
    )?.results ?? [];
  const fills =
    (
      await db
        .prepare(
          `SELECT d.discord_id, d.dm, f.rowid AS rn, f.material, f.units, f.price, f.at FROM discord_links d
           JOIN market_fills f ON f.poster = d.player_id AND f.at > d.sale_seen AND f.at <= ?1
           WHERE d.dm_dead = 0 ORDER BY f.at LIMIT ?2`,
        )
        .bind(upTo, MARKET_NOTICES_A_MINUTE)
        .all()
    )?.results ?? [];
  const auctions =
    (
      await db
        .prepare(
          `SELECT d.discord_id, d.dm, a.id, a.high, a.closed_at AS at FROM discord_links d
           JOIN market_auctions a ON a.seller = d.player_id AND a.state = 'sold' AND a.closed_at > d.sale_seen AND a.closed_at <= ?1
           WHERE d.dm_dead = 0 ORDER BY a.closed_at LIMIT ?2`,
        )
        .bind(upTo, MARKET_NOTICES_A_MINUTE)
        .all()
    )?.results ?? [];
  const page = MARKET_NOTICES_A_MINUTE;
  const bound = noticeBound(upTo, [
    { rows: sales, limit: page, at: (r) => Number(r.at) },
    { rows: fills, limit: page, at: (r) => Number(r.at) },
    { rows: auctions, limit: page, at: (r) => Number(r.at) },
  ]);
  const kept = (/** @type {any[]} */ list) => list.filter((r) => Number(r.at) <= bound);
  const st = [];
  const marks = new Map();
  const mark = (/** @type {string} */ id, /** @type {number} */ at) => marks.set(id, Math.max(marks.get(id) ?? 0, at));
  const wants = (/** @type {any} */ row) => (Number(row.dm) & NOTICE_KINDS.market.bit) !== 0;
  for (const s of kept(sales)) {
    mark(s.discord_id, Number(s.at));
    if (!wants(s)) continue;
    let item = null;
    try {
      item = s.kind === 'item' && s.item ? JSON.parse(s.item) : null;
    } catch {
      item = null;
    }
    const what = s.kind === 'material' ? materialName(s.material) : s.kind === 'item' ? item?.name ?? 'A piece' : 'A crafted piece';
    const gold = s.currency === 'gold';
    const got = Math.max(0, Number(s.total) - Number(s.tax) - Number(s.tithe) - Number(s.fee || 0));
    st.push(
      noticeStatement(
        db,
        s.discord_id,
        'market',
        `sale:${s.rn}`,
        {
          title: 'Sold',
          lines: [
            `${md(what, 40)} ×${num(s.units)} for ${num(got)} ${gold ? 'gold' : 'silver'}.`,
            ...(gold ? ['-# Collect the gold in the game, at a market board.'] : []),
          ],
          open: 'market',
          accent: ACCENT.GOOD,
        },
        nowS,
      ),
    );
  }
  for (const f of kept(fills)) {
    mark(f.discord_id, Number(f.at));
    if (!wants(f)) continue;
    st.push(
      noticeStatement(
        db,
        f.discord_id,
        'market',
        `fill:${f.rn}`,
        {
          title: 'Your buy order was filled',
          lines: [`${md(materialName(f.material), 40)} ×${num(f.units)} at ${num(f.price)} silver. They are in your Stores.`],
          open: 'market',
          accent: ACCENT.GOOD,
        },
        nowS,
      ),
    );
  }
  for (const a of kept(auctions)) {
    mark(a.discord_id, Number(a.at));
    if (!wants(a)) continue;
    st.push(
      noticeStatement(
        db,
        a.discord_id,
        'market',
        `auction:${a.id}`,
        { title: 'Your auction sold', lines: [`The winning bid was ${num(a.high)} silver.`], open: 'market', accent: ACCENT.GOOD },
        nowS,
      ),
    );
  }
  for (const [id, at] of marks)
    st.push(db.prepare('UPDATE discord_links SET sale_seen = MAX(sale_seen, ?1) WHERE discord_id = ?2').bind(at, id));
  if (st.length) await db.batch(st);
  return kept(sales).length + kept(fills).length + kept(auctions).length;
}

export const _marketWords = MARKET_WORDS;
