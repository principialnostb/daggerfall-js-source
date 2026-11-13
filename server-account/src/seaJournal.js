// @ts-check
// The Eltheric Ocean in the journal's Activity: the routes under /v1/journal/sea/ (journalDoor.js answers them as the
// player Discord vouches for). A captain is a character at sea here, its ship read from its save when it sets sail
// and kept in sea_captains; fights are rows of sea_battles, resolved a round at a time when both captains have given
// orders or the round's time is up, whoever asks first; the log is sea_log, and Seals are the exp_points ledger. The
// law is seaJournalLaw.js. Nothing here writes a realm record.
import * as L from './seaJournalLaw.js';
import { getRealmBlob, realmSaveTextOf } from './realm.js';
import { etherHash, etherRng, VEIL_X, BANDS } from '../../src/world/ethericSea.js';
import { queueNotice } from './pdaNotices.js';
import { wantsDm } from './pdaLink.js';

/** The longest course one order sets, chart pixels: a captain sails on by giving another. */
export const COURSE_MAX_PX = 120;
/** How far round a captain the sea is searched for others: sight, and the farthest a course reaches. */
const NEAR_BOX = L.SIGHT_PX + L.LOOKOUT_PX + COURSE_MAX_PX;
/** Lines of the log kept in a fight's state, newest last. */
const FIGHT_LOG_MAX = 40;
/** The share of its complement a ship's hands mend to once a fight is over (navalDamage.js: half, with no hits). */
export const CREW_MEND_SHARE = 0.5;
/** Two captains who fought may not fight again for this long. */
export const PAIR_REST_S = 15 * 60;
/** A captain unheard from this long is laid up at Veilhaven; one laid up and unheard from this long is forgotten. */
export const LAY_UP_S = 7 * 86400;
export const FORGET_S = 180 * 86400;
/** A ship under this share of its hull may not be engaged by a rival: a beaten captain gets home unharried. */
export const MERCY_SHARE = 0.4;
/** Whether a captain is out on the sea (at sea, ashore on an isle, or fighting), not laid up. @param {any} me */
const outAtSea = (me) => !!me && me.state !== 'home';
/** An ended fight is shown to its captains this long, or until they have seen it. */
export const SEEN_FIGHT_S = 600;
/** The harbour's yard mends a ship whole, at most once in this long. */
export const YARD_EVERY_S = 600;
const dayOf = (/** @type {number} */ s) => Math.floor(s / 86400);

/** The character's latest save, read-only. */
async function saveOf(/** @type {any} */ ctx, /** @type {string} */ playerId, /** @type {string} */ charId) {
  const got = await getRealmBlob(ctx, playerId, charId);
  if (!got?.object) return null;
  try {
    const t = await realmSaveTextOf(got.object);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

/** A captain row read into the object the law takes. @param {any} r */
function captainOf(r) {
  if (!r) return null;
  /** @type {any} */
  let cfg = {};
  try {
    cfg = JSON.parse(r.loads || '{}') ?? {};
  } catch {
    cfg = {};
  }
  return { ...r, ship: JSON.parse(r.ship), posts: cfg.posts ?? {}, shot: cfg.shot ?? 'round', cfg };
}
const captainRow = (/** @type {any} */ db, /** @type {string} */ charId) => db.prepare('SELECT * FROM sea_captains WHERE char_id = ?1').bind(charId).first();

/** The Seals an account holds (every earning less every spend). */
export async function sealsOf(/** @type {any} */ db, /** @type {string} */ playerId) {
  const r = await db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM exp_points WHERE player_id = ?1').bind(playerId).first();
  return Number(r?.n) || 0;
}
/** Seals the sea paid an account today. */
async function seaToday(/** @type {any} */ db, /** @type {string} */ playerId, /** @type {number} */ nowS) {
  const r = await db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM exp_points WHERE player_id = ?1 AND why = 'sea' AND at >= ?2").bind(playerId, dayOf(nowS) * 86400).first();
  return Number(r?.n) || 0;
}
/**
 * Seals paid once for a deed (`ref` unique), within the day's ceiling. Answers what was paid.
 * @param {any} db @param {string} playerId @param {number} amount @param {string} ref @param {number} nowS
 */
async function paySeals(db, playerId, amount, ref, nowS, { capped = true } = {}) {
  const want = Math.max(0, Math.round(amount));
  if (!want) return 0;
  // the day's room is read and spent in the one statement, so payments at the same moment never pass the ceiling
  const today = "(SELECT COALESCE(SUM(amount), 0) FROM exp_points WHERE player_id = ?1 AND why = 'sea' AND at >= ?5)";
  const sql = capped
    ? `INSERT OR IGNORE INTO exp_points (player_id, amount, why, ref, at) SELECT ?1, MIN(?2, ?6 - ${today}), 'sea', ?3, ?4 WHERE ?6 - ${today} > 0`
    : "INSERT OR IGNORE INTO exp_points (player_id, amount, why, ref, at) SELECT ?1, ?2, 'sea', ?3, ?4 WHERE ?5 >= 0 AND ?6 >= 0";
  const r = await db.prepare(sql).bind(playerId, want, ref, nowS, dayOf(nowS) * 86400, L.SEA_SEALS_A_DAY).run();
  if (!Number(r?.meta?.changes)) return 0;
  const got = await db.prepare('SELECT amount FROM exp_points WHERE player_id = ?1 AND ref = ?2').bind(playerId, ref).first();
  return Number(got?.amount) || 0;
}
/** A line in a captain's log. */
/**
 * A captain's settings changed without losing another request's change: read, changed by `fn`, written only over
 * what was read, and tried again when another write came first. `fn` answers false to leave them as they are (a
 * thing done once a day, done already). Answers whether `fn` went ahead.
 * @param {any} ctx @param {string} charId @param {(cfg: any) => boolean} fn
 */
async function mutateCfg(ctx, charId, fn) {
  for (let tries = 0; tries < 4; tries++) {
    const row = await ctx.db.prepare('SELECT loads FROM sea_captains WHERE char_id = ?1').bind(charId).first();
    if (!row) return false;
    const was = String(row.loads ?? '');
    /** @type {any} */
    let cfg = {};
    try {
      cfg = JSON.parse(was || '{}') ?? {};
    } catch {
      cfg = {};
    }
    if (!fn(cfg)) return false;
    const r = await ctx.db.prepare('UPDATE sea_captains SET loads = ?2 WHERE char_id = ?1 AND loads = ?3').bind(charId, JSON.stringify(cfg), was).run();
    if (Number(r?.meta?.changes)) return true;
  }
  return false;
}
const logLine = (/** @type {any} */ db, /** @type {string} */ charId, /** @type {string} */ kind, /** @type {string} */ words, /** @type {number} */ seals, /** @type {number} */ nowS) =>
  db.prepare('INSERT INTO sea_log (char_id, at, kind, words, seals) VALUES (?1, ?2, ?3, ?4, ?5)').bind(charId, nowS, kind, String(words).slice(0, 300), seals | 0);

// ── Reading the sea ──────────────────────────────────────────────────

/** Others in sight of a captain: captains awake or at anchor, raiders and legends, isles. @param {any} ctx @param {any} me @param {any} at */
async function seaNear(ctx, me, at) {
  const sight = L.SIGHT_PX + (L.hasPost(me, 'lookout') ? L.LOOKOUT_PX : 0) + (me.cfg?.watchUntil > ctx.nowS ? 22 : 0);
  const rows = await ctx.db
    .prepare("SELECT * FROM sea_captains WHERE x BETWEEN ?1 AND ?2 AND y BETWEEN ?3 AND ?4 AND char_id != ?5 AND seen_at > ?6 AND state != 'home' ORDER BY seen_at DESC LIMIT 60")
    .bind(at.x - NEAR_BOX, at.x + NEAR_BOX, at.y - NEAR_BOX, at.y + NEAR_BOX, me.char_id, ctx.nowS - 86400)
    .all();
  const captains = [];
  for (const r of rows?.results ?? []) {
    const c = /** @type {any} */ (captainOf(r));
    const p = L.positionOf(c, ctx.nowS);
    if (Math.hypot(p.x - at.x, p.y - at.y) > sight) continue;
    captains.push({
      id: c.char_id,
      name: c.name,
      ship: c.ship.name,
      kind: c.ship.kind,
      hull: c.ship.hull,
      hp: Math.round((c.hull / c.ship.max.hull) * 100),
      x: p.x,
      y: p.y,
      to: p.moving ? { x: c.to_x, y: c.to_y } : null,
      awake: c.seen_at > ctx.nowS - L.AWAKE_S,
      state: c.state,
      peace: L.inPeace(p.x, p.y),
      dist: Math.hypot(p.x - at.x, p.y - at.y),
    });
  }
  const sunk = new Set(me.cfg?.sunk ?? []);
  const rested = me.cfg?.legends ?? {};
  const foes = [...L.raidersNear(at.x, at.y, sight, ctx.nowS), ...L.legendsNear(at.x, at.y, sight)]
    .filter((f) => !sunk.has(f.id) && !(f.kind === 'legend' && rested[f.id] > ctx.nowS - L.LEGEND_REST_S))
    .map((f) => ({ ...f, dist: Math.hypot(f.x - at.x, f.y - at.y) }));
  const isles = L.islesNear(at.x, at.y, sight + 6).map((i) => ({ key: i.key, name: i.name, kind: i.kind, x: i.px, y: i.py, r: i.r, band: i.band, good: i.good, haven: i.haven }));
  return { sight, captains, foes, isles };
}

/** A fight's view for one of its sides. @param {any} b @param {string} side @param {any} me @param {any} foe */
function fightView(b, side, me, foe) {
  const st = JSON.parse(b.state);
  const twin = me.ship.name === foe.ship.name;
  const sideOf = (/** @type {any} */ s) => ({ name: s.name, label: twin ? `${s.ship.name} (${s.name})` : s.ship.name, ship: s.ship.name, kind: s.ship.kind, hull: s.ship.hull, now: { hull: s.hull, sail: s.sail, crew: s.crew }, max: s.ship.max, stores: s.stores, barrels: s.barrels, fire: !!s.fire });
  return {
    id: b.id,
    round: b.round,
    range: st.range,
    due: b.due_at,
    mine: side,
    given: !!(side === 'a' ? b.orders_a : b.orders_b),
    last: st.last?.[side] ?? null,
    me: sideOf(me),
    // the other ship's stores and fire barrels are its own captain's to know
    foe: { ...sideOf(foe), stores: null, barrels: null, kind_of: foe.kind_of ?? 'captain', seals: foe.seals ?? null },
    log: st.log ?? [],
    over: b.ended_at ? { winner: b.winner, mine: !!b.winner && b.winner === (side === 'a' ? b.a : b.b), why: st.why ?? '' } : null,
  };
}

// ── The fight's sides, read and written ──────────────────────────────

/** The two sides of a fight as the law takes them. */
async function sidesOf(/** @type {any} */ ctx, /** @type {any} */ b) {
  const a = captainOf(await captainRow(ctx.db, b.a));
  /** @type {any} */
  let bs = null;
  if (b.foe) {
    const f = JSON.parse(b.foe);
    bs = { ...f, kind_of: f.kind, posts: {}, cfg: {} };
  } else bs = captainOf(await captainRow(ctx.db, b.b));
  return { a, b: bs };
}
const sideState = (/** @type {any} */ s, /** @type {boolean} */ twin = false) => ({ name: twin ? `${s.ship.name} (${s.name})` : s.ship.name, ship: s.ship, hull: s.hull, sail: s.sail, crew: s.crew, stores: s.stores, barrels: s.barrels, posts: s.posts, fire: s.fire ?? 0 });

/**
 * A fight's round resolved, where both have given orders or its time is up. Guarded on the round, so two asks at once
 * resolve it once. Answers whether it moved.
 * @param {any} ctx @param {any} b the fight's row
 */
export async function resolveFight(ctx, b) {
  if (!b || b.ended_at) return false;
  const AI = !!b.foe;
  if (!((b.orders_a && (b.orders_b || AI)) || ctx.nowS >= b.due_at)) return false;
  const st = JSON.parse(b.state);
  const sides = await sidesOf(ctx, b);
  if (!sides.a || !sides.b) return false;
  const twin = sides.a.ship.name === sides.b.ship.name;
  const A = { ...sideState(sides.a, twin), fire: st.fire?.a ?? 0 };
  const B = { ...sideState(sides.b, twin), fire: st.fire?.b ?? 0 };
  const rng = etherRng(etherHash(b.seed, b.round));
  const oa = L.ordersOf(b.orders_a ? JSON.parse(b.orders_a) : null, st.last?.a);
  const ob = AI ? L.aiOrders(B, A, st.range, rng) : L.ordersOf(b.orders_b ? JSON.parse(b.orders_b) : null, st.last?.b);
  const r = L.resolveRound({ range: st.range, round: b.round, fled: st.fled }, { a: A, b: B }, { a: oa, b: ob }, rng);
  const log = [...(st.log ?? []), `Round ${b.round}`, ...r.said].slice(-FIGHT_LOG_MAX);
  const next = { range: r.range, fled: r.fled, last: { a: oa, b: ob }, log, fire: { a: A.fire, b: B.fire }, why: r.why };
  const ended = !!r.over;
  const winner = r.winner === 'a' ? b.a : r.winner === 'b' ? (AI ? `foe:${JSON.parse(b.foe).id}` : b.b) : null;
  const half = (/** @type {any} */ s) => Math.round((s?.ship?.max?.crew ?? 0) * CREW_MEND_SHARE);
  // one batch: the round moves (guarded on its number), then each captain's hurts only beside it (changes() of the
  // statement before), then, once the fight is over, both captains back at sea. A failure lands none of it.
  const batch = [
    ctx.db
      .prepare('UPDATE sea_battles SET round = ?2, state = ?3, orders_a = NULL, orders_b = NULL, due_at = ?4, ended_at = ?5, winner = ?6, foe = ?7 WHERE id = ?1 AND round = ?8 AND ended_at IS NULL')
      .bind(b.id, r.round, JSON.stringify(next), ctx.nowS + L.ROUND_DUE_S, ended ? ctx.nowS : null, winner, AI ? JSON.stringify({ ...JSON.parse(b.foe), hull: B.hull, sail: B.sail, crew: B.crew, stores: B.stores, barrels: B.barrels }) : null, b.round),
    ctx.db
      .prepare('UPDATE sea_captains SET hull = ?2, sail = ?3, crew = ?4, stores = ?5, barrels = ?6, hurt_at = ?7 WHERE char_id = ?1 AND changes() = 1')
      .bind(b.a, A.hull, A.sail, A.crew, A.stores, A.barrels, ctx.nowS),
  ];
  if (!AI)
    batch.push(
      ctx.db
        .prepare('UPDATE sea_captains SET hull = ?2, sail = ?3, crew = ?4, stores = ?5, barrels = ?6, hurt_at = ?7 WHERE char_id = ?1 AND changes() = 1')
        .bind(b.b, B.hull, B.sail, B.crew, B.stores, B.barrels, ctx.nowS),
    );
  if (ended)
    for (const [c, side] of /** @type {[string, any][]} */ (AI ? [[b.a, sides.a]] : [[b.a, sides.a], [b.b, sides.b]]))
      batch.push(
        ctx.db
          .prepare("UPDATE sea_captains SET state = 'sea', crew = MAX(crew, ?3) WHERE char_id = ?1 AND battle = ?2 AND EXISTS (SELECT 1 FROM sea_battles WHERE id = ?2 AND ended_at IS NOT NULL)")
          .bind(c, b.id, half(side)),
      );
  const done = await ctx.db.batch(batch);
  if (!Number(done?.[0]?.meta?.changes)) return false;
  if (ended) await endFight(ctx, b, sides, r, { A, B });
  return true;
}

/** A fight ended: both captains back at sea, the winner paid and logged, the loser's log told. */
async function endFight(/** @type {any} */ ctx, /** @type {any} */ b, /** @type {any} */ sides, /** @type {any} */ r, /** @type {any} */ now) {
  const AI = !!b.foe;
  const foe = AI ? JSON.parse(b.foe) : null;
  const caps = AI ? [b.a] : [b.a, b.b];
  // the captains are back at sea already (resolveFight's batch); each keeps the fight's id until they have seen its end
  const day = dayOf(ctx.nowS);
  const words = (/** @type {string} */ who, /** @type {string} */ them) =>
    r.over === 'won' ? (r.why === 'boarded' ? `${who} boarded and captured ${them}.` : `${them} surrendered to ${who}.`) : r.over === 'fled' ? `${who} and ${them} fought until one ship escaped.` : `${who} and ${them} fought to a draw.`;
  const A = sides.a, B = sides.b;
  if (r.over !== 'won') {
    for (const c of caps) await logLine(ctx.db, c, 'parted', words(A.name, B.name), 0, ctx.nowS).run();
    return;
  }
  const winSide = r.winner === 'a' ? A : B;
  const loseSide = r.winner === 'a' ? B : A;
  if (AI) {
    if (r.winner !== 'a') {
      await logLine(ctx.db, b.a, 'struck', `${foe.name} defeated ${A.ship.name}. Repair your ship before the next fight.`, 0, ctx.nowS).run();
      return;
    }
    const me = /** @type {any} */ (captainOf(await captainRow(ctx.db, b.a)));
    await mutateCfg(ctx, b.a, (cfg) => {
      cfg.sunk = [...(cfg.sunk ?? []), foe.id].slice(-60);
      if (foe.kind === 'legend') cfg.legends = { ...(cfg.legends ?? {}), [foe.id]: ctx.nowS };
      return true;
    });
    // a raider's id names its window; a legend pays again once its rest is over, and stands outside the day's ceiling
    const legend = foe.kind === 'legend';
    const ref = legend ? `sea:foe:${b.a}:${foe.id}:${Math.floor(ctx.nowS / L.LEGEND_REST_S)}` : `sea:foe:${b.a}:${foe.id}`;
    const paid = await paySeals(ctx.db, me.player_id, L.sealsForWin(foe), ref, ctx.nowS, { capped: !legend });
    const band = L.watersOf(foe.x, foe.y);
    await ctx.db.batch([
      ctx.db.prepare('UPDATE sea_captains SET wins = wins + 1 WHERE char_id = ?1').bind(b.a),
      // the band is in the line's kind, never read from its words (which carry a ship's name the save chose)
      logLine(ctx.db, b.a, legend ? 'legend' : `sank:${band.band}`, `${words(A.ship.name, foe.name)} (${band.bandName})`, paid, ctx.nowS),
    ]);
    await payBounties(ctx, b.a, me.player_id);
    return;
  }
  const winId = r.winner === 'a' ? b.a : b.b, loseId = r.winner === 'a' ? b.b : b.a;
  const winRow = /** @type {any} */ (captainOf(await captainRow(ctx.db, winId)));
  const paid = await paySeals(ctx.db, winRow.player_id, L.sealsForWin({ ship: loseSide.ship }), `sea:rival:${winId}:${loseId}:${day}`, ctx.nowS);
  await ctx.db.batch([
    ctx.db.prepare('UPDATE sea_captains SET wins = wins + 1 WHERE char_id = ?1').bind(winId),
    ctx.db.prepare('UPDATE sea_captains SET losses = losses + 1 WHERE char_id = ?1').bind(loseId),
    logLine(ctx.db, winId, 'duel', words(winSide.ship.name, loseSide.ship.name), paid, ctx.nowS),
    logLine(ctx.db, loseId, 'struck', words(winSide.ship.name, loseSide.ship.name), 0, ctx.nowS),
  ]);
  void now;
}

/** The day's bounties a captain has met and not been paid for, paid. */
async function payBounties(/** @type {any} */ ctx, /** @type {string} */ charId, /** @type {string} */ playerId) {
  const day = dayOf(ctx.nowS);
  for (const bty of await bountiesOf(ctx, charId, playerId)) {
    if (bty.done && !bty.paid) {
      const paid = await paySeals(ctx.db, playerId, bty.seals, `sea:bounty:${charId}:${day}:${bty.n}`, ctx.nowS);
      if (paid) await logLine(ctx.db, charId, 'bounty', `Bounty complete: ${bty.words}`, paid, ctx.nowS).run();
    }
  }
}
/** The day's bounties and how far a captain has come with each: the log counted by kind, the paid ones by their refs. */
async function bountiesOf(/** @type {any} */ ctx, /** @type {string} */ charId, /** @type {string} */ playerId) {
  const day = dayOf(ctx.nowS);
  const list = L.seaBounties(day);
  const refs = list.map((b) => `sea:bounty:${charId}:${day}:${b.n}`);
  const [rows, paidRows] = await Promise.all([
    ctx.db.prepare('SELECT kind, COUNT(*) AS n FROM sea_log WHERE char_id = ?1 AND at >= ?2 GROUP BY kind').bind(charId, day * 86400).all(),
    ctx.db.prepare('SELECT ref FROM exp_points WHERE player_id = ?1 AND ref IN (?2, ?3, ?4)').bind(playerId, ...refs).all(),
  ]);
  const counts = new Map((rows?.results ?? []).map((/** @type {any} */ r) => [String(r.kind), Number(r.n) || 0]));
  const paid = new Set((paidRows?.results ?? []).map((/** @type {any} */ r) => String(r.ref)));
  return list.map((b, i) => {
    const have = b.kind === 'raider' ? (counts.get(`sank:${b.band}`) ?? 0) : (counts.get(b.kind) ?? 0);
    return { ...b, have: Math.min(have, b.count), done: have >= b.count, paid: paid.has(refs[i]) };
  });
}

/** Every fight overdue, resolved: the clock's sweep, so a fight runs on when neither side asks. */
export async function seaMinute(/** @type {any} */ ctx) {
  const rows = await ctx.db.prepare('SELECT * FROM sea_battles WHERE ended_at IS NULL AND due_at <= ?1 ORDER BY due_at LIMIT 12').bind(ctx.nowS).all();
  let n = 0;
  for (const b of rows?.results ?? []) {
    try {
      if (await resolveFight(ctx, b)) n++;
      // a fight that cannot resolve (a side is gone) is ended, so it never holds the sweep's places again
      else if (b.due_at <= ctx.nowS - L.ROUND_DUE_S) await ctx.db.prepare("UPDATE sea_battles SET ended_at = ?2, winner = NULL WHERE id = ?1 AND ended_at IS NULL AND round = ?3").bind(b.id, ctx.nowS, b.round).run();
    } catch (e) {
      console.warn('[sea] a fight could not resolve', /** @type {any} */ (e)?.message ?? e);
    }
  }
  await ctx.db.batch([
    // a captain held in a fight that has ended or is gone goes back to sea
    ctx.db.prepare("UPDATE sea_captains SET state = 'sea' WHERE state = 'battle' AND NOT EXISTS (SELECT 1 FROM sea_battles WHERE sea_battles.id = sea_captains.battle AND ended_at IS NULL)"),
    // a captain unheard from for a week is laid up at Veilhaven, keeping their record; one laid up for half a year goes
    ctx.db.prepare("UPDATE sea_captains SET state = 'home', to_x = NULL, to_y = NULL, isle = NULL WHERE seen_at < ?1 AND state IN ('sea', 'ashore')").bind(ctx.nowS - LAY_UP_S),
    ctx.db.prepare("DELETE FROM sea_captains WHERE seen_at < ?1 AND state = 'home'").bind(ctx.nowS - FORGET_S),
    // old fights and log lines go: a month of fights, three of the log
    ctx.db.prepare('DELETE FROM sea_battles WHERE ended_at IS NOT NULL AND ended_at < ?1').bind(ctx.nowS - 30 * 86400),
    ctx.db.prepare('DELETE FROM sea_log WHERE at < ?1').bind(ctx.nowS - 90 * 86400),
  ]);
  return n;
}

// ── The routes ───────────────────────────────────────────────────────

/** The captain the journal's character is, kept awake by the asking. @param {any} ctx @param {any} who */
async function meOf(ctx, who) {
  const charId = String(who.character?.id ?? '');
  if (!charId) return { error: 'no-character', status: 409 };
  const row = await captainRow(ctx.db, charId);
  if (row && row.seen_at < ctx.nowS - 20) await ctx.db.prepare('UPDATE sea_captains SET seen_at = ?2 WHERE char_id = ?1').bind(charId, ctx.nowS).run();
  return { charId, me: captainOf(row) };
}

/** What the chart draws by: the Ocean's frame, its bands, the Veil and the peace, the reaches of hail and landing. */
const chartFacts = () => {
  const h = L.veilhaven();
  return {
    box: L.ETHER_BOX,
    veilX: VEIL_X,
    leaguePx: L.LEAGUE_PX,
    bands: BANDS.map((b) => ({ id: b.id, name: b.name, from: b.from })),
    haven: { x: h.px, y: h.py, name: h.name },
    peace: L.PEACE_PX,
    hail: L.HAIL_PX,
    landing: L.LANDING_PX,
    courseMax: COURSE_MAX_PX,
    roundDue: L.ROUND_DUE_S,
    shot: Object.fromEntries(Object.entries(L.SHOT).map(([k, v]) => [k, v.label])),
    posts: L.POSTS,
    spots: L.SPOTS,
  };
};

/** The whole sea as one captain sees it. */
async function stateFor(/** @type {any} */ ctx, /** @type {any} */ who, /** @type {any} */ body) {
  const got = await meOf(ctx, who);
  if ('error' in got) return got;
  let { me } = got;
  const full = body?.full === '1' || body?.full === true;
  /** @type {any} */
  const out = { now: ctx.nowS, wind: L.windAt(ctx.nowS), character: who.character?.name ?? '', facts: chartFacts() };
  if (!outAtSea(me)) {
    const save = await saveOf(ctx, who.player.id, got.charId);
    out.fleet = L.fleetOf(save).map((s) => ({ ...s, ship: L.shipFromSave(save, s.uid) }));
    out.seals = await sealsOf(ctx.db, who.player.id);
    out.haven = L.setSailAt();
    return out;
  }
  // a fight under way: resolved if its round is due, then read; an ended one shown until seen
  if (me.battle) {
    const b = await ctx.db.prepare('SELECT * FROM sea_battles WHERE id = ?1').bind(me.battle).first();
    if (b && (await resolveFight(ctx, b))) me = captainOf(await captainRow(ctx.db, got.charId));
    const b2 = await ctx.db.prepare('SELECT * FROM sea_battles WHERE id = ?1').bind(me.battle).first();
    if (!b2 || (b2.ended_at && b2.ended_at < ctx.nowS - SEEN_FIGHT_S)) {
      // a fight gone or long over lets its captain go, whatever state a failure left them in
      await ctx.db.prepare("UPDATE sea_captains SET battle = NULL, state = CASE WHEN state = 'battle' THEN 'sea' ELSE state END WHERE char_id = ?1").bind(got.charId).run();
      me = { ...me, battle: null, state: me.state === 'battle' ? 'sea' : me.state };
    } else {
      if (b2.ended_at && me.state === 'battle') {
        await ctx.db.prepare("UPDATE sea_captains SET state = 'sea' WHERE char_id = ?1 AND state = 'battle'").bind(got.charId).run();
        me = { ...me, state: 'sea' };
      }
      const sides = await sidesOf(ctx, b2);
      const mine = b2.a === got.charId ? 'a' : 'b';
      out.battle = fightView(b2, mine, mine === 'a' ? sides.a : sides.b, mine === 'a' ? sides.b : sides.a);
    }
  }
  const at = L.positionOf(me, ctx.nowS);
  out.captain = {
    id: me.char_id,
    name: me.name,
    ship: me.ship,
    now: { hull: me.hull, sail: me.sail, crew: me.crew },
    stores: me.stores,
    barrels: me.barrels,
    posts: me.posts,
    shot: me.shot,
    state: me.state,
    at,
    to: at.moving ? { x: me.to_x, y: me.to_y } : null,
    way: me.speed,
    waters: L.watersOf(at.x, at.y),
    wins: me.wins,
    losses: me.losses,
    isle: me.isle,
    ix: me.ix,
    iy: me.iy,
    yardAt: me.cfg?.yardAt ?? 0,
    watchUntil: me.cfg?.watchUntil ?? 0,
  };
  if (me.state === 'ashore' && me.isle) {
    const isle = L.isleByKey(me.isle);
    if (isle) out.ground = { ...L.isleGround(isle), key: isle.key, band: isle.band, done: me.cfg?.done?.[isle.key] ?? {} };
  }
  out.near = await seaNear(ctx, me, at);
  out.landable = me.state === 'sea' ? (L.isleToLand(at.x, at.y)?.key ?? null) : null;
  if (full) {
    const log = await ctx.db.prepare('SELECT at, kind, words, seals FROM sea_log WHERE char_id = ?1 ORDER BY id DESC LIMIT 14').bind(me.char_id).all();
    out.log = log?.results ?? [];
    out.seals = await sealsOf(ctx.db, who.player.id);
    out.today = { sea: await seaToday(ctx.db, who.player.id, ctx.nowS), cap: L.SEA_SEALS_A_DAY };
    out.bounties = await bountiesOf(ctx, me.char_id, who.player.id);
  }
  return out;
}

/** Set sail in a ship of the fleet, off Veilhaven. */
async function setSail(/** @type {any} */ ctx, /** @type {any} */ who, /** @type {any} */ body) {
  const got = await meOf(ctx, who);
  if ('error' in got) return got;
  if (outAtSea(got.me)) return { error: 'at-sea', status: 409 };
  const save = await saveOf(ctx, who.player.id, got.charId);
  const ship = L.shipFromSave(save, String(body?.uid ?? ''));
  if (!ship) return { error: 'no-ship', status: 404 };
  const at = L.setSailAt();
  const posts = {};
  for (const h of ship.hands) if (h.role && Object.hasOwn(L.POSTS, h.role.toLowerCase())) /** @type {any} */ (posts)[h.name] = h.role.toLowerCase();
  // a captain laid up before sails again with their record: the raiders they sank, the legends' rest, the isles walked
  const kept = got.me?.cfg ?? {};
  const cfg = JSON.stringify({ ...kept, posts, shot: kept.shot ?? 'round', watchUntil: 0 });
  await ctx.db
    .prepare(
      `INSERT INTO sea_captains (char_id, player_id, name, ship, x, y, hull, sail, crew, stores, barrels, loads, state, seen_at, set_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'sea', ?13, ?13)
       ON CONFLICT (char_id) DO UPDATE SET name = excluded.name, ship = excluded.ship, x = excluded.x, y = excluded.y, to_x = NULL, to_y = NULL,
         hull = excluded.hull, sail = excluded.sail, crew = excluded.crew, stores = excluded.stores, barrels = excluded.barrels,
         loads = excluded.loads, state = 'sea', isle = NULL, battle = NULL, seen_at = excluded.seen_at, set_at = excluded.set_at
       WHERE sea_captains.state = 'home'`,
    )
    .bind(got.charId, who.player.id, String(who.character?.name ?? 'A captain').slice(0, 40), JSON.stringify(ship), at.x, at.y, ship.now.hull, ship.now.sail, ship.now.crew, ship.stores, ship.barrels, cfg, ctx.nowS)
    .run();
  await logLine(ctx.db, got.charId, 'sail', `${ship.name} set sail from Veilhaven.`, 0, ctx.nowS).run();
  return stateFor(ctx, who, { full: true });
}

/** A course set (or the anchor let go when no place is given). */
async function steer(/** @type {any} */ ctx, /** @type {any} */ who, /** @type {any} */ body) {
  const got = await meOf(ctx, who);
  if ('error' in got) return got;
  const me = got.me;
  if (!outAtSea(me)) return { error: 'not-at-sea', status: 409 };
  if (me.state !== 'sea') return { error: me.state === 'battle' ? 'in-battle' : 'ashore', status: 409 };
  const at = L.positionOf(me, ctx.nowS);
  if (body?.x == null || body?.y == null) {
    await ctx.db.prepare('UPDATE sea_captains SET x = ?2, y = ?3, to_x = NULL, to_y = NULL, set_at = ?4 WHERE char_id = ?1').bind(me.char_id, at.x, at.y, ctx.nowS).run();
    return stateFor(ctx, who, {});
  }
  const to = L.clampCourse(Number(body.x), Number(body.y));
  if (!Number.isFinite(to.x) || !Number.isFinite(to.y)) return { error: 'body', status: 400 };
  await setCourse(ctx, me, at, to);
  return stateFor(ctx, who, {});
}

/** A course laid from where the ship is now, no longer than one leg, at the speed the wind gives that heading. */
function setCourse(/** @type {any} */ ctx, /** @type {any} */ me, /** @type {{ x: number, y: number }} */ at, /** @type {{ x: number, y: number }} */ goal) {
  let to = goal;
  const d = Math.hypot(to.x - at.x, to.y - at.y);
  if (d > COURSE_MAX_PX) to = { x: at.x + ((to.x - at.x) / d) * COURSE_MAX_PX, y: at.y + ((to.y - at.y) / d) * COURSE_MAX_PX };
  const speed = L.wayOf(me, Math.atan2(to.y - at.y, to.x - at.x), ctx.nowS);
  return ctx.db
    .prepare("UPDATE sea_captains SET x = ?2, y = ?3, to_x = ?4, to_y = ?5, set_at = ?6, speed = ?7 WHERE char_id = ?1 AND state = 'sea'")
    .bind(me.char_id, at.x, at.y, to.x, to.y, ctx.nowS, speed)
    .run();
}

/** Run out the guns on a rival in hail, or a raider or legend. */
async function engage(/** @type {any} */ ctx, /** @type {any} */ who, /** @type {any} */ body) {
  const got = await meOf(ctx, who);
  if ('error' in got) return got;
  const me = got.me;
  if (!outAtSea(me)) return { error: 'not-at-sea', status: 409 };
  if (me.state !== 'sea') return { error: me.state === 'battle' ? 'in-battle' : 'ashore', status: 409 };
  if (me.hull < me.ship.max.hull * 0.4) return { error: 'too-hurt', status: 409 };
  const at = L.positionOf(me, ctx.nowS);
  if (L.inPeace(at.x, at.y)) return { error: 'peace', status: 409 };
  const target = String(body?.target ?? '');
  const id = `f${ctx.nowS.toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  const seed = etherHash(ctx.nowS, target.length, Math.floor(Math.random() * 1e9));
  const state = JSON.stringify({ range: 'long', fled: {}, last: {}, log: [], fire: { a: 0, b: 0 } });
  const stop = (/** @type {string} */ c, /** @type {any} */ p) => ctx.db.prepare("UPDATE sea_captains SET x = ?2, y = ?3, to_x = NULL, to_y = NULL, set_at = ?4, state = 'battle', battle = ?5 WHERE char_id = ?1 AND state = 'sea'").bind(c, p.x, p.y, ctx.nowS, id);
  if (/^[rl]:/.test(target)) {
    const foe = L.foeById(target, ctx.nowS);
    if (!foe || (me.cfg?.sunk ?? []).includes(foe.id)) return { error: 'gone', status: 404 };
    if (foe.kind === 'legend' && (me.cfg?.legends?.[foe.id] ?? 0) > ctx.nowS - L.LEGEND_REST_S) return { error: 'gone', status: 404 };
    if (Math.hypot(foe.x - at.x, foe.y - at.y) > L.HAIL_PX + 1) return { error: 'too-far', status: 409 };
    const foeRow = { id: foe.id, kind: foe.kind, name: foe.name, x: foe.x, y: foe.y, seals: foe.seals, ship: { ...foe.ship, name: foe.name }, hull: foe.ship.max.hull, sail: foe.ship.max.sail, crew: foe.ship.max.crew, stores: foe.ship.stores, barrels: foe.ship.barrels };
    const r = await ctx.db.batch([
      stop(me.char_id, at),
      // the fight is written only beside the captain's stop, so no fight is left with nobody in it
      ctx.db
        .prepare('INSERT INTO sea_battles (id, a, b, foe, round, state, due_at, began_at, seed) SELECT ?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, ?8 WHERE (SELECT battle FROM sea_captains WHERE char_id = ?2) = ?1')
        .bind(id, me.char_id, foe.id, JSON.stringify(foeRow), state, ctx.nowS + L.ROUND_DUE_S, ctx.nowS, seed),
    ]);
    if (!Number(r?.[1]?.meta?.changes)) return { error: 'busy', status: 409 };
    await logLine(ctx.db, me.char_id, 'engage', `${me.ship.name} attacked ${foe.name}.`, 0, ctx.nowS).run();
    return stateFor(ctx, who, { full: true });
  }
  const rival = captainOf(await captainRow(ctx.db, target));
  if (!rival || rival.char_id === me.char_id) return { error: 'gone', status: 404 };
  // a duel is between two players: never against another character of one's own account
  if (rival.player_id === me.player_id) return { error: 'own-ship', status: 409 };
  const rp = L.positionOf(rival, ctx.nowS);
  if (rival.state !== 'sea' || rival.seen_at < ctx.nowS - L.AWAKE_S) return { error: 'asleep', status: 409 };
  if (rival.hull < rival.ship.max.hull * MERCY_SHARE) return { error: 'mercy', status: 409 };
  if (L.inPeace(rp.x, rp.y)) return { error: 'peace', status: 409 };
  if (Math.hypot(rp.x - at.x, rp.y - at.y) > L.HAIL_PX) return { error: 'too-far', status: 409 };
  // the same two captains fight again only after a while: no captain is caught in fight after fight by one rival
  const recent = await ctx.db
    .prepare('SELECT 1 FROM sea_battles WHERE ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)) AND began_at > ?3 LIMIT 1')
    .bind(me.char_id, rival.char_id, ctx.nowS - PAIR_REST_S)
    .first();
  if (recent) return { error: 'cooldown', status: 409 };
  // both ships stopped and both in the fight, or neither: a captain caught by another fight first is not taken twice,
  // and the one stopped for a fight that never began is let go in the same batch
  const r = await ctx.db.batch([
    stop(me.char_id, at),
    stop(rival.char_id, rp),
    ctx.db.prepare("INSERT INTO sea_battles (id, a, b, foe, round, state, due_at, began_at, seed) SELECT ?1, ?2, ?3, NULL, 1, ?4, ?5, ?6, ?7 WHERE (SELECT COUNT(*) FROM sea_captains WHERE char_id IN (?2, ?3) AND battle = ?1) = 2").bind(id, me.char_id, rival.char_id, state, ctx.nowS + L.ROUND_DUE_S, ctx.nowS, seed),
    ctx.db.prepare("UPDATE sea_captains SET state = 'sea', battle = NULL WHERE battle = ?1 AND state = 'battle' AND NOT EXISTS (SELECT 1 FROM sea_battles WHERE id = ?1)").bind(id),
  ]);
  if (!Number(r?.[2]?.meta?.changes)) return { error: 'busy', status: 409 };
  await ctx.db.batch([
    logLine(ctx.db, me.char_id, 'engage', `${me.ship.name} attacked ${rival.ship.name} (${rival.name}).`, 0, ctx.nowS),
    logLine(ctx.db, rival.char_id, 'engage', `${me.ship.name} (${me.name}) attacked ${rival.ship.name}.`, 0, ctx.nowS),
  ]);
  // the one engaged may not have the chart open: the courier tells them, so their orders are theirs and not the last ones
  const link = await ctx.db.prepare('SELECT discord_id, dm, dm_dead FROM discord_links WHERE player_id = ?1').bind(rival.player_id).first();
  if (link && wantsDm(link, 'sea'))
    await queueNotice(ctx.db, String(link.discord_id), 'sea', `engaged:${id}`, {
      title: `${me.ship.name} attacked ${rival.ship.name}`,
      lines: [`${me.name} attacked your ship on the Eltheric Ocean. You have ${L.ROUND_DUE_S} seconds each round to choose orders, or your last orders are used.`],
      open: 'sea',
      label: 'To the ship',
    }, ctx.nowS);
  return stateFor(ctx, who, { full: true });
}

/** A round's orders given; the round resolved at once where the other side has given theirs. */
async function giveOrders(/** @type {any} */ ctx, /** @type {any} */ who, /** @type {any} */ body) {
  const got = await meOf(ctx, who);
  if ('error' in got) return got;
  const me = got.me;
  if (!me?.battle) return { error: 'no-battle', status: 409 };
  const b = await ctx.db.prepare('SELECT * FROM sea_battles WHERE id = ?1').bind(me.battle).first();
  if (!b || b.ended_at) return stateFor(ctx, who, { full: true });
  if (Number(body?.round) && Number(body.round) !== b.round) return stateFor(ctx, who, {});
  const o = JSON.stringify(L.ordersOf(body));
  const col = b.a === me.char_id ? 'orders_a' : 'orders_b';
  await ctx.db.prepare(`UPDATE sea_battles SET ${col} = ?2 WHERE id = ?1 AND round = ?3 AND ended_at IS NULL`).bind(b.id, o, b.round).run();
  const b2 = await ctx.db.prepare('SELECT * FROM sea_battles WHERE id = ?1').bind(b.id).first();
  await resolveFight(ctx, b2);
  return stateFor(ctx, who, { full: true });
}

/** Ashore: land on the isle in reach, walk its ground, visit its spots, and go back aboard. */
async function ashore(/** @type {any} */ ctx, /** @type {any} */ who, /** @type {any} */ body, /** @type {string} */ act) {
  const got = await meOf(ctx, who);
  if ('error' in got) return got;
  const me = got.me;
  if (!outAtSea(me)) return { error: 'not-at-sea', status: 409 };
  const cfg = { ...me.cfg, posts: me.posts, shot: me.shot };
  if (act === 'land') {
    if (me.state !== 'sea') return { error: me.state, status: 409 };
    const at = L.positionOf(me, ctx.nowS);
    const isle = L.isleToLand(at.x, at.y);
    if (!isle) return { error: 'no-isle', status: 409 };
    const ground = L.isleGround(isle);
    const day = dayOf(ctx.nowS);
    const walked = { ...(cfg.walked ?? {}) };
    const first = !Object.hasOwn(walked, isle.key);
    const today = walked[isle.key] !== day;
    walked[isle.key] = day;
    const keys = Object.keys(walked);
    if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete walked[k];
    cfg.walked = walked;
    const r = await ctx.db.prepare("UPDATE sea_captains SET x = ?2, y = ?3, to_x = NULL, to_y = NULL, state = 'ashore', isle = ?4, ix = ?5, iy = ?6, loads = ?7 WHERE char_id = ?1 AND state = 'sea' AND loads IS ?8").bind(me.char_id, at.x, at.y, isle.key, ground.land[0], ground.land[1], JSON.stringify(cfg), me.loads ?? null).run();
    // a landing raced by a fight or another tab changed nothing: it neither pays nor writes the log
    if (!Number(r?.meta?.changes)) return { error: 'raced', status: 409 };
    const paid = first ? await paySeals(ctx.db, me.player_id, 5, `sea:isle:${me.char_id}:${isle.key}`, ctx.nowS) : 0;
    if (today) await logLine(ctx.db, me.char_id, 'landfall', `Landed on ${isle.name}, ${ground.words}.`, paid, ctx.nowS).run();
    await payBounties(ctx, me.char_id, me.player_id);
    return stateFor(ctx, who, { full: true });
  }
  if (me.state !== 'ashore' || !me.isle) return { error: 'not-ashore', status: 409 };
  const isle = /** @type {any} */ (L.isleByKey(me.isle));
  const ground = L.isleGround(isle);
  if (act === 'embark') {
    await ctx.db.prepare("UPDATE sea_captains SET state = 'sea', isle = NULL, ix = NULL, iy = NULL, set_at = ?2 WHERE char_id = ?1 AND state = 'ashore'").bind(me.char_id, ctx.nowS).run();
    return stateFor(ctx, who, { full: true });
  }
  if (act === 'walk') {
    const to = [Number(body?.x) | 0, Number(body?.y) | 0];
    const path = L.walkPath(ground, [me.ix, me.iy], to);
    if (!path) return { error: 'no-way', status: 409 };
    await ctx.db.prepare('UPDATE sea_captains SET ix = ?2, iy = ?3 WHERE char_id = ?1').bind(me.char_id, to[0], to[1]).run();
    return { ...(await stateFor(ctx, who, {})), path };
  }
  // a spot visited: the walker must stand on it or beside it
  const spot = ground.spots.find((s) => Math.abs(s.x - me.ix) + Math.abs(s.y - me.iy) <= 1 && s.kind === String(body?.spot ?? ''));
  if (!spot) return { error: 'not-there', status: 409 };
  const day = dayOf(ctx.nowS);
  /** A spot done once a day: marks the settings `c`, false when it was done today already. @param {string} k */
  const onceToday = (k) => (/** @type {any} */ c) => {
    const done = { ...(c.done ?? {}) };
    const here = { ...(done[isle.key] ?? {}) };
    if (here[k] === day) return false;
    here[k] = day;
    done[isle.key] = here;
    const keys = Object.keys(done);
    if (keys.length > 200) for (const k2 of keys.slice(0, keys.length - 200)) delete done[k2];
    c.done = done;
    return true;
  };
  // the visit's mark is checked here for a quick answer, then again as it is written, so two tabs never both count
  /** @type {((c: any) => boolean) | null} */
  let mark = null;
  const once = (/** @type {string} */ k) => (mark = onceToday(k))({ ...cfg });
  const rng = etherRng(etherHash(isle.cx, isle.cy, day, spot.kind.length));
  const band = L.watersOf(isle.px, isle.py);
  /** @type {string} */
  let words = '';
  let seals = 0;
  /** @type {any} */
  let ship = null;
  if (spot.kind === 'harbour') {
    if ((cfg.yardAt ?? 0) > ctx.nowS - YARD_EVERY_S) return { error: 'yard-busy', status: 409, until: cfg.yardAt + YARD_EVERY_S };
    mark = (c) => {
      if ((c.yardAt ?? 0) > ctx.nowS - YARD_EVERY_S) return false;
      c.yardAt = ctx.nowS;
      return true;
    };
    // the yard reads the ship again from the save as it stands now: its refits, its hands, the stores in its hold
    const save = await saveOf(ctx, who.player.id, me.char_id);
    ship = L.shipFromSave(save, me.ship.uid) ?? me.ship;
    words = `The shipyard at ${isle.name} repaired ${ship.name} and refilled the crew.`;
  } else if (spot.kind === 'tavern') {
    if (!once('tavern')) return { error: 'done-today', status: 409 };
    const legend = L.LEGENDS[Math.floor(rng() * L.LEGENDS.length)];
    const dir = legend.at[0] < isle.px ? 'west' : 'east';
    const tales = [
      `A sailor says ${legend.name} was seen ${dir} of here, in the Deep Aether.`,
      'People say pirates are busy in the Reaches this week.',
      `An old sailor tells stories about ${legend.name} and the captains who hunted it.`,
      'They say the Veil was loud last night, and nobody sailed until morning.',
    ];
    words = tales[Math.floor(rng() * tales.length)];
  } else if (spot.kind === 'board') {
    words = 'The notice board lists today’s bounties.';
  } else if (spot.kind === 'ruin') {
    if (!once('ruin')) return { error: 'done-today', status: 409 };
    seals = Math.round(10 + rng() * 12 * band.level ** 0.5);
    const finds = ['an old bronze seal', 'a page from a sunken ship’s log', 'a map scratched on slate', 'an Ayleid lamp', 'a coin from an unknown kingdom'];
    words = `In the ruin on ${isle.name} you found ${finds[Math.floor(rng() * finds.length)]}.`;
  } else if (spot.kind === 'good') {
    if (!once('good')) return { error: 'done-today', status: 409 };
    seals = Math.round(8 + rng() * 10 * band.level ** 0.5);
    words = `You gathered ${isle.good ?? 'driftwood'} on the beach of ${isle.name}.`;
  } else if (spot.kind === 'lookout') {
    mark = (c) => {
      c.watchUntil = ctx.nowS + 600;
      return true;
    };
    words = `From the lookout on ${isle.name}, you can see farther for ten minutes.`;
  } else if (spot.kind === 'cairn') {
    if (!once('cairn')) return { error: 'done-today', status: 409 };
    words = `You added a stone to the cairn on ${isle.name}.`;
  }
  if (mark && !(await mutateCfg(ctx, me.char_id, mark))) return { error: spot.kind === 'harbour' ? 'yard-busy' : 'done-today', status: 409 };
  const paid = seals ? await paySeals(ctx.db, me.player_id, seals, `sea:${spot.kind}:${me.char_id}:${isle.key}:${day}`, ctx.nowS) : 0;
  /** @type {any[]} */
  const st = [];
  if (ship) st.push(ctx.db.prepare("UPDATE sea_captains SET ship = ?2, hull = ?3, sail = ?4, crew = ?5, stores = ?6, barrels = ?7 WHERE char_id = ?1 AND state = 'ashore'").bind(me.char_id, JSON.stringify(ship), ship.max.hull, ship.max.sail, ship.max.crew, ship.stores, ship.barrels));
  st.push(logLine(ctx.db, me.char_id, spot.kind, words, paid, ctx.nowS));
  await ctx.db.batch(st);
  await payBounties(ctx, me.char_id, me.player_id);
  return { ...(await stateFor(ctx, who, { full: true })), said: words, paid };
}

/** The ship managed: its hands' posts, the shot it loads, a store spent mending it. */
async function manage(/** @type {any} */ ctx, /** @type {any} */ who, /** @type {any} */ body) {
  const got = await meOf(ctx, who);
  if ('error' in got) return got;
  const me = got.me;
  if (!outAtSea(me)) return { error: 'not-at-sea', status: 409 };
  /** @type {Record<string, string> | null} */
  let posts = null;
  /** @type {string | null} */
  let shot = null;
  if (body?.posts && typeof body.posts === 'object') {
    const names = new Set(me.ship.hands.map((/** @type {any} */ h) => h.name));
    /** @type {Record<string, string>} */
    const chosen = {};
    const used = new Set();
    for (const [name, post] of Object.entries(body.posts).slice(0, 12)) {
      if (names.has(name) && typeof post === 'string' && Object.hasOwn(L.POSTS, post) && !used.has(post)) {
        chosen[name] = post;
        used.add(post);
      }
    }
    posts = chosen;
  }
  if (typeof body?.shot === 'string' && Object.hasOwn(L.SHOT, body.shot)) shot = body.shot;
  if (body?.mend === true) {
    if (me.state === 'battle') return { error: 'in-battle', status: 409 };
    if (me.stores <= 0) return { error: 'no-stores', status: 409 };
  }
  // posts and shot are written over the settings as they stand, so a visit's mark made meanwhile is kept
  if (posts || shot)
    await mutateCfg(ctx, me.char_id, (c) => {
      if (posts) c.posts = posts;
      if (shot) c.shot = shot;
      return true;
    });
  if (body?.mend === true) {
    const carp = Object.values(posts ?? me.posts).includes('carpenter') ? 1.25 : 1;
    const work = Math.round(L.STORE_WORK * carp * 2);
    const mh = Math.min(me.ship.max.hull - me.hull, Math.round(work * 0.7)), ms = Math.min(me.ship.max.sail - me.sail, Math.round(work * 0.3));
    if (mh + ms <= 0) return { error: 'whole', status: 409 };
    // the store is spent only on a ship still short of whole and not fighting; the repair never passes the ship's most
    const r = await ctx.db.batch([
      ctx.db
        .prepare("UPDATE sea_captains SET hull = MIN(?4, hull + ?2), sail = MIN(?5, sail + ?3), stores = stores - 1 WHERE char_id = ?1 AND stores > 0 AND state != 'battle' AND (hull < ?4 OR sail < ?5)")
        .bind(me.char_id, mh, ms, me.ship.max.hull, me.ship.max.sail),
      ctx.db
        .prepare('INSERT INTO sea_log (char_id, at, kind, words, seals) SELECT ?1, ?2, ?3, ?4, 0 WHERE changes() = 1')
        .bind(me.char_id, ctx.nowS, 'mend', `Used a Carpenter’s Store: ${mh} hull${ms ? ` and ${ms} sails` : ''} repaired.`),
    ]);
    if (!Number(r?.[0]?.meta?.changes)) return { error: 'raced', status: 409 };
  }
  return stateFor(ctx, who, { full: true });
}

/**
 * Go home. Within Veilhaven's peace, or ashore, the voyage ends (the record and log stay). Out on open water the ship
 * sails for Veilhaven instead: going home is never a way out of a rival closing in.
 */
async function leave(/** @type {any} */ ctx, /** @type {any} */ who) {
  const got = await meOf(ctx, who);
  if ('error' in got) return got;
  const me = got.me;
  if (!outAtSea(me)) return stateFor(ctx, who, {});
  if (me.state === 'battle') return { error: 'in-battle', status: 409 };
  const at = L.positionOf(me, ctx.nowS);
  if (me.state === 'sea' && !L.inPeace(at.x, at.y)) {
    await setCourse(ctx, me, at, L.setSailAt());
    return { ...(await stateFor(ctx, who, {})), said: 'Sailing back to Veilhaven. You can leave the sea when you get there.' };
  }
  const r = await ctx.db.batch([
    ctx.db.prepare("UPDATE sea_captains SET state = 'home', to_x = NULL, to_y = NULL, isle = NULL, battle = NULL WHERE char_id = ?1 AND state IN ('sea', 'ashore')").bind(me.char_id),
    ctx.db.prepare('INSERT INTO sea_log (char_id, at, kind, words, seals) SELECT ?1, ?2, ?3, ?4, 0 WHERE changes() = 1').bind(me.char_id, ctx.nowS, 'home', `${me.ship.name} returned to Veilhaven.`),
  ]);
  if (!Number(r?.[0]?.meta?.changes)) return { error: 'raced', status: 409 };
  return stateFor(ctx, who, {});
}

/** A fight's end seen: its view is put away. */
async function ack(/** @type {any} */ ctx, /** @type {any} */ who) {
  const got = await meOf(ctx, who);
  if ('error' in got) return got;
  if (got.me) await ctx.db.prepare("UPDATE sea_captains SET battle = NULL WHERE char_id = ?1 AND state != 'battle'").bind(got.charId).run();
  return stateFor(ctx, who, { full: true });
}

/** The sea as the journal's Discord page reads it: the whole state, the log and bounties with it. @param {any} ctx @param {any} who */
export const seaLedger = (ctx, who) => stateFor(ctx, who, { full: true });

/** The sea's routes, by their path under /v1/journal/. */
const ROUTES = Object.freeze({
  'sea/state': { method: 'GET', handle: stateFor },
  'sea/sail': { method: 'POST', handle: setSail },
  'sea/course': { method: 'POST', handle: steer },
  'sea/engage': { method: 'POST', handle: engage },
  'sea/orders': { method: 'POST', handle: giveOrders },
  'sea/land': { method: 'POST', handle: (/** @type {any} */ c, /** @type {any} */ w, /** @type {any} */ b) => ashore(c, w, b, 'land') },
  'sea/walk': { method: 'POST', handle: (/** @type {any} */ c, /** @type {any} */ w, /** @type {any} */ b) => ashore(c, w, b, 'walk') },
  'sea/visit': { method: 'POST', handle: (/** @type {any} */ c, /** @type {any} */ w, /** @type {any} */ b) => ashore(c, w, b, 'visit') },
  'sea/embark': { method: 'POST', handle: (/** @type {any} */ c, /** @type {any} */ w, /** @type {any} */ b) => ashore(c, w, b, 'embark') },
  'sea/manage': { method: 'POST', handle: manage },
  'sea/home': { method: 'POST', handle: leave },
  'sea/ack': { method: 'POST', handle: ack },
});
/** @returns {Readonly<Record<string, { method: string, handle: (ctx: any, env: any, who: any, body: any) => Promise<any> }>>} */
export const seaRoutes = () =>
  /** @type {any} */ (Object.fromEntries(Object.entries(ROUTES).map(([k, r]) => [k, { method: r.method, handle: (/** @type {any} */ ctx, /** @type {any} */ _env, /** @type {any} */ who, /** @type {any} */ body) => r.handle(ctx, who, body) }])));
