// @ts-check
// THE ELTHERIC OCEAN IN THE JOURNAL: the sea's law, pure. A character's own ship is read from its save (its hull,
// refits, crew, hurts and the Carpenter's Stores in its hold) and sailed on the game's own Ocean (the isles, bands and
// Veilhaven of src/world/ethericSea.js). Fights are turn-based: each round both captains give orders (the helm, the
// shot, the hands, whether to brace) and the guns that bear fire by the game's own numbers (src/systems/naval/
// navalShips.js GUNS and HULL_BUILDS, fleet.js refits; pinned equal by test/server/sea_journal.test.js). What happens
// here pays Seals and is written in the captain's log; it never changes the save.
import {
  ETHER_BOX,
  VEIL_X,
  LEAGUE_PX,
  etherBandAt,
  etherDepthAt,
  etherHash,
  etherRng,
  islesNear,
  isleByKey,
  veilhaven,
  landfall,
  inEther,
} from '../../src/world/ethericSea.js';

// ── The ships ─────────────────────────────────────────────────────────

/** The guns, per ball: harm to hull, canvas and men, and seconds to reload (navalShips.js GUNS). */
export const SEA_GUNS = Object.freeze({
  long: Object.freeze({ hull: 14, sail: 3, crew: 1, reload: 9 }),
  swivel: Object.freeze({ hull: 5, sail: 2, crew: 2, reload: 4 }),
  heavy: Object.freeze({ hull: 30, sail: 4, crew: 2, reload: 12 }),
  chain: Object.freeze({ hull: 3, sail: 16, crew: 1, reload: 7 }),
});
/** A fire barrel dropped astern (navalShips.js BARREL; navalDamage.js): its blow, then its burning. */
export const SEA_BARREL = Object.freeze({ hull: 45, sail: 6, crew: 3, burn: 2.5, burnS: 12 });
/** Ships are tougher than a ball's raw harm (navalShips.js SHIP_TOUGHNESS); the numbers below already carry it. */
export const SHIP_TOUGHNESS = 1.6;

/**
 * Each hull as it fights (navalShips.js HULL_BUILDS and the player's battery weights): hull and canvas points, hands at
 * full, each battery's gun and count, and its way under sail in chart pixels a minute.
 */
export const SEA_HULLS = Object.freeze([
  Object.freeze({ hull: 0, name: 'Rowboat', hullHp: 96, sailHp: 0, crew: 0, broadside: null, bow: null, stern: null, ram: false, way: 6, tier: 0 }),
  Object.freeze({ hull: 1, name: 'Large Boat', hullHp: 240, sailHp: 96, crew: 0, broadside: Object.freeze({ gun: 'swivel', n: 3, weight: 1 }), bow: Object.freeze({ gun: 'swivel', n: 1 }), stern: null, ram: false, way: 14, tier: 1 }),
  Object.freeze({ hull: 2, name: 'Galleon', hullHp: 672, sailHp: 256, crew: 24, broadside: Object.freeze({ gun: 'long', n: 5, weight: 6 / 5 }), bow: Object.freeze({ gun: 'chain', n: 2 }), stern: Object.freeze({ gun: 'barrel', n: 1 }), ram: false, way: 12, tier: 2 }),
  Object.freeze({ hull: 3, name: 'Large Galley', hullHp: 832, sailHp: 144, crew: 60, broadside: Object.freeze({ gun: 'long', n: 4, weight: 1 }), bow: Object.freeze({ gun: 'heavy', n: 3 }), stern: null, ram: true, way: 10, tier: 3 }),
  Object.freeze({ hull: 4, name: 'Carrack', hullHp: 896, sailHp: 352, crew: 30, broadside: Object.freeze({ gun: 'long', n: 5, weight: 7 / 5 }), bow: Object.freeze({ gun: 'chain', n: 2 }), stern: Object.freeze({ gun: 'barrel', n: 1 }), ram: false, way: 13, tier: 4 }),
]);
/** The refit lines and what each tier adds (fleet.js UPGRADE_LINES `per`; the metal tiers past the shipwright's at half). */
export const REFIT_PER = Object.freeze({ hold: 0.2, rigging: 0.04, hull: 0.1, guns: 0.08 });
export const REFIT_BASE_TIERS = 3;
export const REFIT_TIERS = 12;
export const REFIT_ORE_PER = 0.5;
/** A refit line's multiple at a tier (fleet.js refitShare + 1). */
export function refitMul(/** @type {keyof typeof REFIT_PER} */ id, /** @type {unknown} */ tier) {
  const t = Math.max(0, Math.min(REFIT_TIERS, Number(tier) | 0));
  const share = Math.min(t, REFIT_BASE_TIERS) * REFIT_PER[id] + Math.max(0, t - REFIT_BASE_TIERS) * REFIT_PER[id] * REFIT_ORE_PER;
  return Math.round((1 + share) * 10000) / 10000;
}
/** Its refits as the sea reads them: cargo, speed, hull and guns multiples. @param {any} upgrades */
export const refitsOf = (upgrades) => ({
  cargo: refitMul('hold', upgrades?.hold),
  speed: refitMul('rigging', upgrades?.rigging),
  hull: refitMul('hull', upgrades?.hull),
  guns: refitMul('guns', upgrades?.guns),
});

/** The Carpenter's Stores' template (navalStores.js): one mends a store's worth of hull and canvas. */
export const STORES_TEMPLATE = 1330;
/** What one store mends, in points (navalStores.js: 64 work points a store). */
export const STORE_WORK = 64;
/** The crew's posts (shipCrew.js) and what each lends the ship in the journal's fights. */
export const POSTS = Object.freeze({
  gunner: 'Guns reload faster',
  carpenter: 'Repairs more with each store',
  lookout: 'See farther at sea',
  bosun: 'Sail faster',
  cook: 'Keeps the crew fed',
  mate: 'Leads boarding attacks',
});
/** The shot a battery may load (shotKinds.js), each against round shot. */
export const SHOT = Object.freeze({
  round: Object.freeze({ hull: 1, sail: 1, crew: 1, reload: 1, fire: 0, label: 'Round shot' }),
  grape: Object.freeze({ hull: 0.2, sail: 1, crew: 4, reload: 1, fire: 0, label: 'Grapeshot' }),
  chain: Object.freeze({ hull: 1, sail: 4, crew: 1, reload: 1, fire: 0, label: 'Chain shot' }),
  heated: Object.freeze({ hull: 0.85, sail: 1, crew: 1, reload: 1.6, fire: 0.45, label: 'Heated shot' }),
});

/** An item's template and count, whichever spelling the save keeps. @param {any} it */
const itemTemplate = (it) => Number(it?.templateIndex ?? it?.TemplateIndex ?? it?.template ?? -1);
const itemCount = (/** @type {any} */ it) => Math.max(1, Number(it?.stackCount ?? it?.StackCount ?? 1) | 0);
const itemName = (/** @type {any} */ it) => String(it?.shortName ?? it?.name ?? it?.ShortName ?? 'goods').slice(0, 40);

/** Every ship of the character's fleet the journal may sail (a rowboat never fights), from the save. @param {any} save */
export function fleetOf(save) {
  const ships = save?.modData?.Fleet?.ships;
  return (Array.isArray(ships) ? ships : [])
    .filter((s) => Number.isInteger(s?.hull) && s.hull >= 1 && s.hull <= 4 && s.uid != null)
    .map((s) => ({ uid: String(s.uid), name: String(s.name || SEA_HULLS[s.hull].name).slice(0, 24), hull: s.hull, kind: SEA_HULLS[s.hull].name, upgrades: s.upgrades ?? {} }));
}

/**
 * A ship as the journal sails it, read from the save: its build and refits, its hurts and hands (NavalCombat's
 * record of it), its shot loads and fire barrels, the stores and cargo in its hold. Null for a ship not in the fleet.
 * @param {any} save @param {string} uid
 */
export function shipFromSave(save, uid) {
  const own = fleetOf(save).find((s) => s.uid === String(uid));
  if (!own) return null;
  const build = SEA_HULLS[own.hull];
  const refit = refitsOf(own.upgrades);
  const rec = save?.modData?.NavalCombat?.boats?.[own.uid] ?? null;
  const max = { hull: Math.round(build.hullHp * refit.hull), sail: Math.round(build.sailHp * refit.hull), crew: build.crew };
  const frac = (/** @type {any} */ v, /** @type {any} */ m) => (Number.isFinite(v) && Number.isFinite(m) && m > 0 ? Math.max(0, Math.min(1, v / m)) : 1);
  const hands = (Array.isArray(rec?.mates?.hands) ? rec.mates.hands : []).slice(0, 80).map((/** @type {any} */ h) => ({ name: String(h?.name ?? 'A hand').slice(0, 32), role: String(h?.role ?? '').slice(0, 16), fights: Number(h?.fights) || 0 }));
  const wrecked = rec?.state === 'wrecked';
  const boats = save?.modData?.['come-sail-away'];
  const placed = (Array.isArray(boats?.placedBoats) ? boats.placedBoats : []).find((b) => String(b?.UID ?? b?.uid) === own.uid);
  const items = [...(Array.isArray(placed?.Items) ? placed.Items : []), ...(Array.isArray(boats?.packedCargoes?.[own.uid]) ? boats.packedCargoes[own.uid] : [])];
  let stores = 0;
  /** @type {Map<string, number>} */
  const cargo = new Map();
  for (const it of items) {
    if (itemTemplate(it) === STORES_TEMPLATE) stores += itemCount(it);
    else cargo.set(itemName(it), (cargo.get(itemName(it)) ?? 0) + itemCount(it));
  }
  return {
    uid: own.uid,
    name: own.name,
    hull: own.hull,
    kind: build.name,
    refit,
    upgrades: own.upgrades,
    max,
    now: {
      hull: Math.max(1, Math.round(max.hull * (wrecked ? 0.25 : frac(rec?.hull, rec?.maxHull)))),
      sail: Math.round(max.sail * (wrecked ? 0 : frac(rec?.sail, rec?.maxSail))),
      crew: build.crew ? Math.min(build.crew, hands.length || (Number.isFinite(rec?.crew) ? rec.crew : build.crew)) : 0,
    },
    hands,
    barrels: Number.isFinite(rec?.barrels) ? Math.max(0, Math.min(8, rec.barrels | 0)) : build.stern?.gun === 'barrel' ? 4 : 0,
    loads: typeof rec?.loads === 'object' && rec?.loads ? rec.loads : {},
    stores: Math.min(99, stores),
    cargo: [...cargo.entries()].slice(0, 24).map(([name, n]) => ({ name, n })),
  };
}

// ── The sea ──────────────────────────────────────────────────────────

/** How far a captain sees, chart pixels; a lookout's eye adds to it. */
export const SIGHT_PX = 18;
export const LOOKOUT_PX = 6;
/** How near two ships must be to fight. */
export const HAIL_PX = 2.5;
/** How near an isle's centre a ship must lie to land. */
export const LANDING_PX = 3;
/** Veilhaven's peace: no fight within this many pixels of it, nor in the Veil itself. */
export const PEACE_PX = 12;
/** A captain not heard from in this long lies at anchor, and no rival may engage them. */
export const AWAKE_S = 300;

/** Whether a pixel lies in the peace: about Veilhaven or in the Veil. @param {number} x @param {number} y */
export function inPeace(x, y) {
  const h = veilhaven();
  return x >= VEIL_X || Math.hypot(x - h.px, y - h.py) <= PEACE_PX;
}
/** Where a ship sets sail from: off Veilhaven's harbour, as the game's own crossing lands. */
export const setSailAt = () => {
  const l = landfall();
  return { x: l.px, y: l.py };
};
/** The wind at a moment: its bearing (radians, the way it blows) swinging slowly through the day. @param {number} nowS */
export function windAt(nowS) {
  const h = nowS / 3600;
  const i = Math.floor(h);
  const a = (etherHash(i, 77) % 3600) / 3600, b = (etherHash(i + 1, 77) % 3600) / 3600;
  const t = h - i, s = t * t * (3 - 2 * t);
  let d = b - a;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return { bearing: (a + d * s) * Math.PI * 2, strength: 0.6 + ((etherHash(i, 78) % 100) / 100) * 0.4 };
}
/** Its way along a heading with this wind: before it is best, into it worst. */
export function windFactor(/** @type {number} */ heading, /** @type {{ bearing: number, strength: number }} */ wind) {
  const c = Math.cos(heading - wind.bearing);
  return Math.max(0.55, Math.min(1.18, 0.86 + c * 0.3 * wind.strength));
}
/** Its way in chart pixels a minute: its build, rigging, canvas, the bosun, the wind. @param {any} cap @param {number} heading @param {number} nowS */
export function wayOf(cap, heading, nowS) {
  const build = SEA_HULLS[cap.ship.hull];
  const canvas = cap.ship.max.sail ? 0.35 + 0.65 * (cap.sail / cap.ship.max.sail) : 1;
  const bosun = hasPost(cap, 'bosun') ? 1.08 : 1;
  return build.way * cap.ship.refit.speed * canvas * bosun * windFactor(heading, windAt(nowS));
}
/** Whether a post is filled among its hands. @param {any} cap @param {string} post */
export const hasPost = (cap, post) => Object.values(cap?.posts ?? {}).includes(post);

/** Where a captain is now: at rest, or along their course. @param {any} cap @param {number} nowS */
export function positionOf(cap, nowS) {
  if (cap.to_x == null || cap.to_y == null) return { x: cap.x, y: cap.y, moving: false, eta: 0 };
  const dx = cap.to_x - cap.x, dy = cap.to_y - cap.y;
  const dist = Math.hypot(dx, dy);
  const gone = ((nowS - cap.set_at) * cap.speed) / 60;
  if (!dist || gone >= dist) return { x: cap.to_x, y: cap.to_y, moving: false, eta: 0 };
  const k = gone / dist;
  return { x: cap.x + dx * k, y: cap.y + dy * k, moving: true, eta: Math.ceil(((dist - gone) / cap.speed) * 60) };
}
/** A course's end clamped inside the Ocean (and off its very edge). */
export function clampCourse(/** @type {number} */ x, /** @type {number} */ y) {
  return { x: Math.max(ETHER_BOX.x0 + 4, Math.min(ETHER_BOX.x1 - 1, x)), y: Math.max(ETHER_BOX.y0 + 4, Math.min(ETHER_BOX.y1 - 4, y)) };
}
/** Where a pixel lies in words: its band and depth, and the peace. */
export function watersOf(/** @type {number} */ x, /** @type {number} */ y) {
  const band = etherBandAt(x);
  return { band: band.id, bandName: band.name, leagues: Math.round(etherDepthAt(x) * 10) / 10, peace: inPeace(x, y), level: band.level, pirate: band.pirate };
}

// ── Raiders and legends: the ships the service sails ─────────────────

/** A raider's waters: one may lie in each RAIDER_CELL-pixel cell, for RAIDER_LIFE_S at a time. */
export const RAIDER_CELL = 6;
export const RAIDER_LIFE_S = 1200;
/** The raiders' classes, by the waters' level: their build, and the Seals one is worth. */
export const RAIDER_CLASSES = Object.freeze([
  Object.freeze({ id: 'sloop', name: 'Corsair sloop', hull: 1, tough: 1, seals: 15 }),
  Object.freeze({ id: 'brig', name: 'Pirate brigantine', hull: 2, tough: 0.8, seals: 25 }),
  Object.freeze({ id: 'galley', name: 'Raider galley', hull: 3, tough: 0.85, seals: 35 }),
  Object.freeze({ id: 'carrack', name: 'Black carrack', hull: 4, tough: 0.9, seals: 45 }),
]);
const RAIDER_HEADS = ['Grey', 'Salt', 'Black', 'Red', 'Hollow', 'Drowned', 'Bitter', 'Ashen', 'Pale', 'Iron', 'Crooked', 'Silent'];
const RAIDER_TAILS = ['Gull', 'Widow', 'Tide', 'Knife', 'Lantern', 'Wake', 'Fang', 'Crow', 'Maw', 'Reef', 'Shroud', 'Hook'];

/** The six legends of the Ocean (etherShips.js), each sailing a deep water of their own. */
export const LEGENDS = Object.freeze([
  Object.freeze({ id: 'sorrow', name: 'Sorrow’s Wake', hull: 4, tough: 2.6, seals: 300, at: [2600, -5200] }),
  Object.freeze({ id: 'queen', name: 'The Drowned Queen', hull: 3, tough: 2.8, seals: 300, at: [1900, -4300] }),
  Object.freeze({ id: 'hunger', name: 'The Ninefold Hunger', hull: 4, tough: 3, seals: 320, at: [1400, -6400] }),
  Object.freeze({ id: 'lantern', name: 'The Lantern-Eater', hull: 2, tough: 3.2, seals: 300, at: [3400, -3300] }),
  Object.freeze({ id: 'regent', name: 'The Pale Regent', hull: 4, tough: 3.4, seals: 340, at: [900, -3600] }),
  Object.freeze({ id: 'starless', name: 'The Starless', hull: 4, tough: 3.8, seals: 400, at: [500, -5600] }),
]);
/** A legend sunk lies on the sea floor this long for the captain who sank it. */
export const LEGEND_REST_S = 30 * 86400;

/** The ship the service sails, as a fighting ship: build, toughness and hands. */
function aiShip(/** @type {number} */ hull, /** @type {number} */ tough, /** @type {number} */ level) {
  const build = SEA_HULLS[hull];
  const k = tough * (1 + level * 0.06);
  const max = { hull: Math.round(build.hullHp * k), sail: Math.round(build.sailHp * Math.min(k, 2)), crew: Math.max(build.crew, hull >= 2 ? 30 : 8) };
  return { uid: '', name: build.name, hull, kind: build.name, refit: { cargo: 1, speed: 1, hull: 1, guns: 1 + level * 0.04 + (tough > 2 ? 0.4 : 0) }, max, now: { ...max }, hands: [], barrels: build.stern?.gun === 'barrel' ? 4 : 0, loads: {}, stores: tough > 2 ? 4 : 0, cargo: [] };
}

/**
 * The raiders lying in wait near a pixel this window: one at most a cell, on the waters' pirate weight, none in the
 * peace. Each has an id that names its cell and window, so the same raider is everyone's.
 * @param {number} x @param {number} y @param {number} reach @param {number} nowS
 */
export function raidersNear(x, y, reach, nowS) {
  const win = Math.floor(nowS / RAIDER_LIFE_S);
  const out = [];
  const c0 = Math.floor((x - reach) / RAIDER_CELL), c1 = Math.floor((x + reach) / RAIDER_CELL);
  const r0 = Math.floor((y - reach) / RAIDER_CELL), r1 = Math.floor((y + reach) / RAIDER_CELL);
  for (let cy = r0; cy <= r1; cy++)
    for (let cx = c0; cx <= c1; cx++) {
      const rng = etherRng(etherHash(cx, cy, win, 9));
      const px = cx * RAIDER_CELL + 0.5 + rng() * (RAIDER_CELL - 1), py = cy * RAIDER_CELL + 0.5 + rng() * (RAIDER_CELL - 1);
      if (!inEther(px, py) || inPeace(px, py)) continue;
      const w = watersOf(px, py);
      if (!(rng() < Math.min(0.4, 0.07 * w.pirate))) continue;
      if (Math.hypot(px - x, py - y) > reach) continue;
      const cls = RAIDER_CLASSES[Math.min(RAIDER_CLASSES.length - 1, Math.floor(rng() * Math.min(4, 1 + w.level / 2.5)))];
      const name = `The ${RAIDER_HEADS[Math.floor(rng() * RAIDER_HEADS.length)]} ${RAIDER_TAILS[Math.floor(rng() * RAIDER_TAILS.length)]}`;
      out.push({ id: `r:${cx}:${cy}:${win}`, kind: 'raider', cls: cls.id, name, x: px, y: py, hull: cls.hull, level: w.level, seals: Math.round(cls.seals * (1 + (w.level - 1) * 0.18)), until: (win + 1) * RAIDER_LIFE_S });
    }
  return out;
}
/** The legends near a pixel. */
export function legendsNear(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ reach) {
  return LEGENDS.filter((l) => Math.hypot(l.at[0] - x, l.at[1] - y) <= reach).map((l) => ({ id: `l:${l.id}`, kind: 'legend', cls: l.id, name: l.name, x: l.at[0], y: l.at[1], hull: l.hull, level: 9, seals: l.seals }));
}
/** A foe the service sails, by its id, or null for one that is not there (gone, or never was). */
export function foeById(/** @type {string} */ id, /** @type {number} */ nowS) {
  const r = /^r:(-?\d+):(-?\d+):(\d+)$/.exec(id);
  if (r) {
    const [cx, cy, win] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (win !== Math.floor(nowS / RAIDER_LIFE_S)) return null;
    const c = (cx + 0.5) * RAIDER_CELL, cyy = (cy + 0.5) * RAIDER_CELL;
    const hit = raidersNear(c, cyy, RAIDER_CELL, nowS).find((x) => x.id === id) ?? null;
    if (!hit) return null;
    const cls = /** @type {any} */ (RAIDER_CLASSES.find((k) => k.id === hit.cls));
    return { ...hit, ship: aiShip(hit.hull, cls.tough, hit.level) };
  }
  const l = /^l:(\w+)$/.exec(id);
  const legend = l ? LEGENDS.find((x) => x.id === l[1]) : null;
  return legend ? { id, kind: 'legend', cls: legend.id, name: legend.name, x: legend.at[0], y: legend.at[1], hull: legend.hull, level: 9, seals: legend.seals, ship: aiShip(legend.hull, legend.tough, 9) } : null;
}

// ── The fight ────────────────────────────────────────────────────────

/** The ranges, near to far as a fight closes. */
export const RANGES = Object.freeze(['long', 'medium', 'short', 'grapple']);
export const RANGE_WORDS = Object.freeze({ long: 'Long range', medium: 'Medium range', short: 'Close range', grapple: 'Side by side' });
/** A gun's chance to strike at each range. */
export const HIT = Object.freeze({
  long: Object.freeze({ long: 0.35, medium: 0.6, short: 0.85, grapple: 0.95 }),
  swivel: Object.freeze({ long: 0, medium: 0.3, short: 0.8, grapple: 0.95 }),
  heavy: Object.freeze({ long: 0.4, medium: 0.65, short: 0.85, grapple: 0.95 }),
  chain: Object.freeze({ long: 0.25, medium: 0.55, short: 0.8, grapple: 0.9 }),
  barrel: Object.freeze({ long: 0, medium: 0, short: 0.6, grapple: 0.8 }),
});
/** A round's length, seconds of the guns' time. */
export const ROUND_S = 10;
/** How long a captain has to give a round's orders; then the last orders stand. */
export const ROUND_DUE_S = 45;
/** A fight that has not ended by then is broken off. */
export const ROUNDS_MAX = 24;
/** A ship strikes its colours at this share of its hull. */
export const STRIKE_AT = 0.25;
export const HELMS = Object.freeze(['close', 'hold', 'open', 'flee']);
export const HANDS = Object.freeze(['guns', 'sails', 'repair', 'board']);
/** What each helm brings to bear. */
const BEARS = Object.freeze({ close: ['bow'], hold: ['broadside'], open: ['broadside_half', 'stern'], flee: ['stern'] });

/** Orders as given, or the standing ones where a word is missing or wrong. @param {any} o @param {any} [last] */
export function ordersOf(o, last = null) {
  const pick = (/** @type {unknown} */ v, /** @type {readonly string[]} */ list, /** @type {string} */ dflt) => (typeof v === 'string' && list.includes(v) ? v : dflt);
  return {
    helm: pick(o?.helm, HELMS, last?.helm ?? 'hold'),
    shot: pick(o?.shot, Object.keys(SHOT), last?.shot ?? 'round'),
    hands: pick(o?.hands, HANDS, last?.hands ?? 'guns'),
    brace: o?.brace === true,
  };
}

/** The orders the service gives its own ship: close for its best guns, chain the canvas, board a broken foe. */
export function aiOrders(/** @type {any} */ me, /** @type {any} */ foe, /** @type {string} */ range, /** @type {() => number} */ rng) {
  const build = SEA_HULLS[me.ship.hull];
  const wantShort = build.broadside?.gun === 'swivel' || build.bow?.gun === 'heavy';
  const ri = RANGES.indexOf(range);
  const weak = me.hull / me.ship.max.hull < 0.4;
  const foeWeak = foe.hull / foe.ship.max.hull < 0.35;
  return ordersOf({
    helm: foeWeak && ri < 3 ? 'close' : wantShort && ri < 2 ? 'close' : ri >= 2 && !wantShort ? 'hold' : rng() < 0.5 ? 'hold' : 'close',
    shot: foe.sail > foe.ship.max.sail * 0.6 && rng() < 0.3 ? 'chain' : ri >= 2 && rng() < 0.4 ? 'grape' : 'round',
    hands: foeWeak && ri === 3 ? 'board' : weak && me.stores > 0 ? 'repair' : 'guns',
    brace: weak && rng() < 0.15,
  });
}

/** The balls a battery throws in a round, and what they do: harm to hull, canvas and men. */
function volley(/** @type {any} */ side, /** @type {any} */ bat, /** @type {number} */ share, /** @type {string} */ range, /** @type {any} */ o, /** @type {() => number} */ rng) {
  if (!bat || !share) return { hull: 0, sail: 0, crew: 0, balls: 0, fire: false };
  if (bat.gun === 'barrel') {
    if (side.barrels <= 0 || !(rng() < HIT.barrel[/** @type {'long'} */ (range)])) return { hull: 0, sail: 0, crew: 0, balls: 0, fire: false };
    side.barrels -= 1;
    return { hull: SEA_BARREL.hull, sail: SEA_BARREL.sail, crew: SEA_BARREL.crew, balls: 1, fire: true };
  }
  const g = SEA_GUNS[/** @type {'long'} */ (bat.gun)];
  const shot = SHOT[/** @type {'round'} */ (o.shot)];
  const maxCrew = side.ship.max.crew;
  const short = maxCrew ? Math.max(0, 1 - side.crew / maxCrew) : 0;
  const reload = g.reload * shot.reload * (1 + 0.8 * short) * (o.hands === 'guns' ? 0.8 : 1) * (hasPost(side, 'gunner') ? 0.9 : 1);
  const balls = bat.n * share * (ROUND_S / reload);
  const p = HIT[/** @type {'long'} */ (bat.gun)][/** @type {'long'} */ (range)];
  const roll = 0.85 + rng() * 0.3;
  const k = balls * p * roll * (side.ship.refit.guns ?? 1) * (bat.weight ?? 1);
  const fire = shot.fire > 0 && balls * p > 0 && rng() < shot.fire;
  return { hull: k * g.hull * shot.hull, sail: k * g.sail * shot.sail, crew: (balls * p * roll * g.crew * shot.crew) / 3.2, balls: Math.round(balls * p), fire };
}

/**
 * ONE ROUND. Both sides' orders met: the range moves by the helms and each ship's way, the guns that bear fire, the
 * hands mend or board, fires burn, and a ship strikes, flees or the fight runs on. Pure but for the draws.
 * @param {{ range: string, round: number, fled?: Record<string, number> }} fight
 * @param {{ a: any, b: any }} sides each `{ ship, hull, sail, crew, stores, barrels, posts, fire }`
 * @param {{ a: any, b: any }} orders @param {() => number} rng
 */
export function resolveRound(fight, sides, orders, rng) {
  const A = sides.a, B = sides.b;
  const oa = ordersOf(orders.a), ob = ordersOf(orders.b);
  /** @type {string[]} */
  const said = [];
  const nameOf = (/** @type {any} */ s) => s.name;
  // the helms: who closes, who opens, and whose way carries it
  const way = (/** @type {any} */ s, /** @type {any} */ o) => SEA_HULLS[s.ship.hull].way * s.ship.refit.speed * (s.ship.max.sail ? 0.35 + 0.65 * (s.sail / s.ship.max.sail) : 1) * (o.hands === 'sails' ? 1.2 : 1);
  const intent = (/** @type {any} */ o) => (o.helm === 'close' ? 1 : o.helm === 'open' || o.helm === 'flee' ? -1 : 0);
  const wa = way(A, oa), wb = way(B, ob);
  const net = (intent(oa) * wa + intent(ob) * wb) / Math.max(wa, wb, 1);
  let ri = RANGES.indexOf(fight.range);
  const step = net > 0.5 ? 1 : net < -0.5 ? -1 : 0;
  ri = Math.max(0, Math.min(3, ri + step));
  const range = RANGES[ri];
  if (range !== fight.range) said.push(`The ships move to ${RANGE_WORDS[/** @type {'long'} */ (range)].toLowerCase()}.`);
  // the guns that bear, and a rake where one lies beam-on to the other's bow
  const fireOf = (/** @type {any} */ me, /** @type {any} */ o, /** @type {any} */ them, /** @type {any} */ to) => {
    if (o.brace) return { hull: 0, sail: 0, crew: 0, balls: 0, fire: false, rake: false };
    const build = SEA_HULLS[me.ship.hull];
    const total = { hull: 0, sail: 0, crew: 0, balls: 0, fire: false, rake: false };
    // alongside, there is no closing further: the broadside bears for any helm but running
    const bears = range === 'grapple' && (o.helm === 'close' || o.helm === 'hold') ? ['broadside', 'bow'] : /** @type {Record<string, string[]>} */ (BEARS)[o.helm];
    for (const b of bears) {
      const bat = b === 'bow' ? build.bow : b === 'stern' ? build.stern : build.broadside;
      const v = volley(me, bat, b === 'broadside_half' ? 0.5 : 1, range, o, rng);
      total.hull += v.hull;
      total.sail += v.sail;
      total.crew += v.crew;
      total.balls += v.balls;
      total.fire ||= v.fire;
    }
    if (o.helm === 'hold' && to.helm === 'close' && (range === 'short' || range === 'medium')) {
      total.rake = true;
      total.hull *= 1.5;
      total.crew *= 1.5;
    }
    void them;
    return total;
  };
  const hitB = fireOf(A, oa, B, ob), hitA = fireOf(B, ob, A, oa);
  const land = (/** @type {any} */ s, /** @type {any} */ o, /** @type {any} */ h, /** @type {string} */ by) => {
    const k = o.brace ? 0.5 : 1;
    const dh = Math.round(h.hull * k), ds = Math.round(h.sail * k), dc = Math.round(h.crew);
    s.hull = Math.max(0, s.hull - dh);
    s.sail = Math.max(0, s.sail - ds);
    s.crew = Math.max(0, s.crew - Math.min(dc, s.crew));
    if (h.fire && !s.fire) s.fire = 2;
    if (h.balls) said.push(`${by} fires${h.rake ? ' along the length of the other ship' : ''}. ${h.balls} ${h.balls === 1 ? 'shot hits' : 'shots hit'} ${nameOf(s)}: ${dh} hull${ds ? `, ${ds} sails` : ''}${dc ? `, ${dc} crew` : ''}.`);
    else if (!o.brace && (h.hull || h.sail)) said.push(`${by} misses.`);
    return { hull: dh, sail: ds, crew: dc };
  };
  const toB = land(B, ob, hitB, nameOf(A));
  const toA = land(A, oa, hitA, nameOf(B));
  // fires burn, and the hands' work
  for (const [s, o] of /** @type {[any, any][]} */ ([[A, oa], [B, ob]])) {
    if (s.fire > 0) {
      const burn = Math.round(SEA_BARREL.burn * ROUND_S * (o.hands === 'repair' ? 0.4 : 1));
      s.hull = Math.max(0, s.hull - burn);
      s.fire -= 1;
      said.push(`Fire on ${nameOf(s)}: ${burn} hull damage.`);
    }
    if (o.hands === 'repair') {
      const carp = hasPost(s, 'carpenter') ? 1.25 : 1;
      const room = s.ship.max.hull - s.hull, roomS = s.ship.max.sail - s.sail;
      if (s.stores > 0 && room + roomS > 0) {
        s.stores -= 1;
        const work = STORE_WORK * carp * 1.4;
        const mh = Math.min(room, Math.round(work * 0.7)), ms = Math.min(roomS, Math.round(work * 0.3));
        s.hull += mh;
        s.sail += ms;
        said.push(`${nameOf(s)} uses a Carpenter’s Store: ${mh} hull${ms ? ` and ${ms} sails` : ''} repaired.`);
      } else if (room > 0) {
        const mh = Math.min(room, Math.round(s.ship.max.hull * 0.016 * ROUND_S * 0.125 * carp));
        s.hull += mh;
        if (mh) said.push(`${nameOf(s)}'s crew patches ${mh} hull.`);
      }
    }
    if (o.hands === 'sails' && s.ship.max.sail) s.sail = Math.min(s.ship.max.sail, s.sail + Math.round(s.ship.max.sail * 0.03));
  }
  // boarding, alongside
  /** @type {string | null} */
  let winner = null;
  /** @type {string} */
  let why = '';
  const struck = (/** @type {any} */ s) => s.hull <= s.ship.max.hull * STRIKE_AT;
  if (range === 'grapple') {
    for (const [me, them, o, key] of /** @type {[any, any, any, string][]} */ ([[A, B, oa, 'a'], [B, A, ob, 'b']])) {
      if (winner || o.hands !== 'board') continue;
      const ours = Math.max(1, me.crew) * (hasPost(me, 'mate') ? 1.15 : 1);
      const theirs = Math.max(0.5, them.crew) * (struck(them) ? 0.5 : 1);
      if (rng() < ours / (ours + theirs)) {
        winner = key;
        why = 'boarded';
        said.push(`${nameOf(me)} boards ${nameOf(them)} and captures it.`);
      } else {
        const lost = Math.min(me.crew, Math.ceil(me.crew * 0.12));
        me.crew -= lost;
        said.push(`${nameOf(me)}'s boarding attack fails${lost ? `: ${lost} crew lost` : ''}.`);
      }
    }
  }
  if (!winner) {
    const sa = struck(A), sb = struck(B);
    if (sa && sb) {
      winner = A.hull / A.ship.max.hull >= B.hull / B.ship.max.hull ? 'a' : 'b';
      why = 'struck';
    } else if (sa || sb) {
      winner = sa ? 'b' : 'a';
      why = 'struck';
    }
    if (winner) said.push(`${nameOf(winner === 'a' ? B : A)} surrenders.`);
  }
  // fleeing: at long range, the faster runs clear
  const fled = { ...(fight.fled ?? {}) };
  let escaped = null;
  if (!winner) {
    for (const [key, o, mine, theirs] of /** @type {[string, any, number, number][]} */ ([['a', oa, wa, wb], ['b', ob, wb, wa]])) {
      fled[key] = o.helm === 'flee' ? (fled[key] ?? 0) + 1 : 0;
      if (o.helm === 'flee' && range === 'long' && (mine > theirs * 1.05 || fled[key] >= 3)) escaped = key;
    }
    if (escaped) said.push(`${nameOf(escaped === 'a' ? A : B)} escapes.`);
  }
  const round = fight.round + 1;
  const over = winner ? 'won' : escaped ? 'fled' : round > ROUNDS_MAX ? 'parted' : null;
  if (over === 'parted') said.push('Night falls. The fight ends in a draw.');
  return { range, round, fled, said, winner, why, escaped, over, hurts: { a: toA, b: toB } };
}

/** The Seals a fight pays the side that won it: a rival's ship by its size, a raider or legend by its own worth. */
export function sealsForWin(/** @type {any} */ foe) {
  if (foe?.kind === 'raider' || foe?.kind === 'legend') return foe.seals;
  return 40 + 15 * (SEA_HULLS[foe?.ship?.hull ?? 1]?.tier ?? 1);
}
/** Seals the sea pays an account a day, at most. */
export const SEA_SEALS_A_DAY = 400;
/** A rival beaten more than once a day pays only the first time. */
export const RIVAL_PAYS_A_DAY = 1;

// ── Ashore ───────────────────────────────────────────────────────────

/** An isle's ground as the journal walks it: a grid of tiles grown from its seed, the things on it, and the landing. */
export const ISLE_W = 30;
export const ISLE_H = 20;
/** Tiles: ` ` deep water, `~` shallows, `.` sand, `,` grass, `T` trees, `^` rock, `#` paving, `H` house, `D` dock. */
export const WALKABLE = Object.freeze(new Set(['.', ',', '#', 'D']));

/** What each kind of isle is called where a player reads it. */
export const ISLE_WORDS = Object.freeze({ port: 'a port', ruin: 'an island with a ruin', wild: 'a wild island', rock: 'a rocky island' });
/** The spots an isle offers, by its kind, and what a visit to each does. */
export const SPOTS = Object.freeze({
  harbour: 'Harbourmaster: repair your ship and refill your crew',
  tavern: 'Tavern: hear rumors',
  board: 'Notice board: today’s bounties',
  ruin: 'Ruin: search it',
  good: 'Beach: gather goods',
  lookout: 'Lookout: see farther for ten minutes',
  cairn: 'Cairn: add a stone',
});

/**
 * The isle's ground: its tiles (rows of characters), where a landing party comes ashore, and its spots. The same for
 * everyone, from the isle's seed.
 * @param {any} isle from ethericSea.js
 */
export function isleGround(isle) {
  const rng = etherRng(etherHash(isle.cx, isle.cy, 31));
  const cx = ISLE_W / 2, cy = ISLE_H / 2;
  const size = isle.kind === 'rock' ? 0.45 : isle.kind === 'port' ? 0.7 : Math.min(0.92, 0.5 + isle.r * 0.16);
  const phase = rng() * 6.28, wob = 0.12 + rng() * 0.1;
  /** @type {string[][]} */
  const g = [];
  for (let y = 0; y < ISLE_H; y++) {
    const row = [];
    for (let x = 0; x < ISLE_W; x++) {
      const dx = (x - cx + 0.5) / (ISLE_W / 2), dy = (y - cy + 0.5) / (ISLE_H / 2);
      const ang = Math.atan2(dy, dx);
      const edge = size * (1 + wob * Math.sin(ang * 3 + phase) + wob * 0.6 * Math.sin(ang * 5 + phase * 1.7));
      const d = Math.hypot(dx, dy) / edge;
      const n = etherHash(isle.cx, isle.cy, x, y) % 100;
      let t = ' ';
      if (d < 1.18) t = '~';
      if (d < 1) t = '.';
      if (d < 0.78) t = ',';
      if (d < 0.62 && n < (isle.kind === 'wild' ? 34 : isle.kind === 'ruin' ? 22 : 14)) t = 'T';
      if (d < 0.5 && n > 90 - isle.peak / 2) t = '^';
      if (isle.kind === 'rock' && d < 0.8 && n > 45) t = '^';
      row.push(t);
    }
    g.push(row);
  }
  // the landing: the southernmost sand nearest the isle's middle, with a dock at a port
  let land = [Math.floor(cx), ISLE_H - 2];
  outer: for (let y = ISLE_H - 1; y >= 0; y--) {
    let best = -1;
    for (let x = 0; x < ISLE_W; x++) if (g[y][x] === '.' && (best < 0 || Math.abs(x - cx) < Math.abs(best - cx))) best = x;
    if (best >= 0) {
      land = [best, y];
      break outer;
    }
  }
  /** @type {{ x: number, y: number, kind: string }[]} */
  const spots = [];
  const place = (/** @type {string} */ kind, /** @type {number} */ want) => {
    for (let tries = 0; tries < 400; tries++) {
      const x = Math.floor(rng() * ISLE_W), y = Math.floor(rng() * ISLE_H);
      const t = g[y][x];
      const dist = Math.hypot(x - land[0], y - land[1]);
      if ((t === ',' || t === '.') && dist >= want && !spots.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) < 4)) {
        g[y][x] = '#';
        spots.push({ x, y, kind });
        return;
      }
    }
  };
  if (isle.kind === 'port') {
    if (land[1] + 1 < ISLE_H) g[land[1] + 1][land[0]] = 'D';
    for (let k = 0; k < 7; k++) {
      const x = Math.floor(cx - 4 + rng() * 8), y = Math.floor(cy - 3 + rng() * 5);
      if (g[y][x] === ',' || g[y][x] === 'T') g[y][x] = 'H';
    }
    place('harbour', 1);
    place('tavern', 4);
    place('board', 4);
  } else if (isle.kind === 'ruin') place('ruin', 6);
  else if (isle.kind === 'wild') place('good', 3);
  else place('lookout', 3);
  place('cairn', 5);
  // a paved way from the landing to each spot, so every spot is reached
  for (const s of spots) {
    let [x, y] = land;
    while (x !== s.x || y !== s.y) {
      if (x !== s.x && (rng() < 0.6 || y === s.y)) x += Math.sign(s.x - x);
      else y += Math.sign(s.y - y);
      if (!WALKABLE.has(g[y][x])) g[y][x] = isle.kind === 'port' ? '#' : g[y][x] === 'T' || g[y][x] === '^' ? ',' : g[y][x] === '~' || g[y][x] === ' ' ? '.' : g[y][x];
    }
  }
  return { w: ISLE_W, h: ISLE_H, tiles: g.map((r) => r.join('')), land, spots, kind: isle.kind, name: isle.name, good: isle.good ?? null, words: ISLE_WORDS[/** @type {'port'} */ (isle.kind)] };
}

/** The steps from one tile to another over walkable ground (breadth first), or null when none reach it. */
export function walkPath(/** @type {{ tiles: string[], w: number, h: number }} */ ground, /** @type {number[]} */ from, /** @type {number[]} */ to) {
  const ok = (/** @type {number} */ x, /** @type {number} */ y) => x >= 0 && y >= 0 && x < ground.w && y < ground.h && WALKABLE.has(ground.tiles[y][x]);
  if (!ok(to[0], to[1]) || !ok(from[0], from[1])) return null;
  const key = (/** @type {number} */ x, /** @type {number} */ y) => y * ground.w + x;
  /** @type {Map<number, number>} */
  const prev = new Map([[key(from[0], from[1]), -1]]);
  const q = [from];
  while (q.length) {
    const [x, y] = /** @type {number[]} */ (q.shift());
    if (x === to[0] && y === to[1]) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (ok(nx, ny) && !prev.has(key(nx, ny))) {
        prev.set(key(nx, ny), key(x, y));
        q.push([nx, ny]);
      }
    }
  }
  if (!prev.has(key(to[0], to[1]))) return null;
  const path = [];
  for (let k = key(to[0], to[1]); k !== -1; k = /** @type {number} */ (prev.get(k))) path.unshift([k % ground.w, Math.floor(k / ground.w)]);
  return path;
}

/** The isle a ship may land on from where it lies, or null. */
export function isleToLand(/** @type {number} */ x, /** @type {number} */ y) {
  return islesNear(x, y, LANDING_PX).find((i) => Math.hypot(i.px - x, i.py - y) <= LANDING_PX + i.r) ?? null;
}
export { isleByKey, islesNear, veilhaven, LEAGUE_PX, ETHER_BOX };

/**
 * The day's three bounties at sea, the same for every captain that UTC day: what each asks and the Seals it pays.
 * @param {number} day UTC day number
 */
export function seaBounties(day) {
  const rng = etherRng(etherHash(day, 4242));
  const bands = ['shallows', 'reaches', 'deep'];
  const band = bands[Math.floor(rng() * bands.length)];
  const names = { shallows: 'the Shallows', reaches: 'the Reaches', deep: 'the Deep Aether' };
  const third = rng() < 0.5 ? 'ruin' : 'good';
  return [
    { n: 0, kind: 'raider', band, count: 2, seals: 40, words: `Sink two raiders in ${/** @type {Record<string, string>} */ (names)[band]}.` },
    { n: 1, kind: 'landfall', band: null, count: 3, seals: 25, words: 'Land on three islands.' },
    { n: 2, kind: third, band: null, count: 1, seals: 30, words: third === 'ruin' ? 'Search a ruin.' : 'Gather goods on a wild island.' },
  ];
}
