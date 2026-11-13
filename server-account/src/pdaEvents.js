// @ts-check
// World events: what is live now and what comes next, in every theatre - Dagon's Breach on each gate lane, the Sea
// Serpent, the Sky-Ketch at each station, the Abyss Dungeons, the Battlespire's open breaches and the seat battles.
// Times are the game's own pure clocks on real time, so they need no server. Places come from the relay's live facts,
// which hold only what the herald already posts; an Abyss Dungeon has no place until someone finds it. A linked player
// may ask to be told a few minutes before any of them begins.
import { text, select, button, STYLE, md, when, plural, divider } from './pdaUi.js';
import { frame, asOf } from './pdaFrame.js';
import { noticeCard } from './pdaNotices.js';
import { siegesLive } from './seatBattles.js';
import { GATE_LANES_OPEN, worldPixelOk } from '../../src/net/wire.js';
import { gateAt, gatePhase, gateBossOf, GATE_COLLAPSE_MS } from '../../src/net/gate/gateLaw.js';
import { serpentAt, serpentPhase, serpentBossOf, serpentRing, SERPENT_DIVE_MS } from '../../src/net/serpent/serpentLaw.js';
import { ketchVoyageAt, ketchVoyageOf, KT_THEATRES, KT_STATION_CITIES } from '../../src/net/ketch/ketchLaw.js';
import { HERALD_FAMILIES, heraldName } from '../../src/net/herald/heraldCard.js';
import { sdRegionName, sdProvinceName } from '../../src/net/superDungeon/sdHerald.js';
import { theatreName } from '../../src/world/worldWide/worldGrid.js';
import { PDA_LIVE_PATH } from '../../server/src/pdaRelayLaw.js';

/** How long before an event begins a reminder is sent, seconds. */
export const REMIND_LEAD_S = 10 * 60;
/** How long the relay's live facts are kept in this isolate, ms. */
export const LIVE_KEEP_MS = 30_000;
/** How long the service waits on the relay, ms. */
export const RELAY_ASK_MS = 1500;
/** How long a relay that did not answer is left alone, ms, so every press does not wait on it again. */
export const RELAY_AWAY_MS = 15_000;
/** Rows a list shows before it says how many more. */
export const EVENTS_SHOWN = 8;
/** How long after a Hollow is found a reminder of it may still go, seconds. */
const FOUND_FRESH_S = 15 * 60;

/** The Bay's name, as the herald says it. */
const BAY = 'the Iliac Bay';
/** A theatre's name: the Bay's, or its province's. @param {number} lane */
export const laneName = (lane) => (lane === 0 ? BAY : theatreName(lane) || BAY);

/**
 * Every reminder a player may ask for: a gate lane, the serpent, a Ketch station, the Abyss Dungeons.
 * @type {ReadonlyArray<{ key: string, label: string }>}
 */
export const REMINDERS = Object.freeze([
  ...GATE_LANES_OPEN.map((lane) => ({ key: `gate:${lane}`, label: `${HERALD_FAMILIES.gate.name} · ${laneName(lane)}` })),
  { key: 'serpent', label: HERALD_FAMILIES.serpent.name },
  ...KT_THEATRES.map((t) => ({ key: `ketch:${t}`, label: `${HERALD_FAMILIES.ketch.name} · ${KT_STATION_CITIES[t]}` })),
  { key: 'abyss', label: `${HERALD_FAMILIES.abyss.name} found` },
]);
const REMINDER_KEYS = new Set(REMINDERS.map((r) => r.key));

// ── The relay's live facts ─────────────────────────────────────────

/** The relay's origin, read off the law door's address the service already holds. @param {any} env */
export function relayOrigin(env) {
  try {
    const u = new URL(String(env?.RELAY_LAW_URL ?? ''));
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * One call to the relay: through the RELAY service binding where the Worker has it (one Worker may not fetch another's
 * address on the same account), else the address. Answers the JSON, or null. Never throws.
 * @param {any} env @param {string} path @param {RequestInit} [init]
 */
export async function relayCall(env, path, init = {}) {
  const origin = relayOrigin(env);
  if (!origin) return null;
  const req = new Request(`${origin}${path}`, { ...init, signal: AbortSignal.timeout(RELAY_ASK_MS) });
  try {
    const res = typeof env.RELAY?.fetch === 'function' ? await env.RELAY.fetch(req) : await globalThis.fetch(req);
    if (!res?.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('[pda] the relay', /** @type {any} */ (e)?.message ?? e);
    return null;
  }
}

let liveHeld = { at: 0, body: /** @type {any} */ (null) };
/** Tests stand fresh isolates. */
export const _resetPdaEventsForTests = () => {
  liveHeld = { at: 0, body: null };
};

/** The relay's live facts, kept a little while: `{ gates, serpent, abyss, spire }`, or null when the relay is away. */
export async function liveFacts(/** @type {any} */ env, nowMs = Date.now()) {
  if (liveHeld.body && nowMs - liveHeld.at < LIVE_KEEP_MS) return liveHeld.body;
  if (!liveHeld.body && liveHeld.at && nowMs - liveHeld.at < RELAY_AWAY_MS) return null;
  const body = await relayCall(env, PDA_LIVE_PATH);
  liveHeld = body && typeof body === 'object' ? { at: nowMs, body } : { at: nowMs, body: null };
  return liveHeld.body;
}

// ── The events ─────────────────────────────────────────────────────

/**
 * An event as the PDA lists and maps it. `startAt`/`endAt` in seconds; `px`/`py` a world pixel when its place is known
 * exactly (fractions allowed), else only its theatre (`lane`); `station` a Ketch's city.
 * @typedef {{ key: string, family: keyof typeof HERALD_FAMILIES | 'siege', remind?: string, title: string, where: string, live: boolean, startAt: number|null, endAt: number|null, lane: number, px?: number, py?: number, station?: string }} WorldEvent
 */

const sec = (/** @type {number} */ ms) => Math.floor(ms / 1000);
const placeOf = (/** @type {unknown} */ pl) => heraldName(pl);

/** Each gate lane's breach: the one the clock is about, or the next once it has sealed for the night. */
function gates(nowMs, live) {
  /** @type {WorldEvent[]} */
  const out = [];
  for (const lane of GATE_LANES_OPEN) {
    let t = gateAt(nowMs, lane);
    const ph = gatePhase(t, nowMs);
    if (ph === 'closed' || ph === 'collapsing' || ph === 'gone') t = gateAt(t.wrathAt + GATE_COLLAPSE_MS + 1000, lane);
    const site = (live?.gates ?? []).find((g) => g?.lane === lane && g?.n === t.day);
    const pl = placeOf(site?.pl);
    const exact = site && worldPixelOk(site.px) && worldPixelOk(site.py);
    out.push({
      key: `gate:${lane}:${t.day}`,
      family: 'gate',
      remind: `gate:${lane}`,
      title: `${HERALD_FAMILIES.gate.name}: ${gateBossOf(t.day).name}`,
      where: pl ? `near ${pl}` : `in ${laneName(lane)}`,
      live: gatePhase(t, nowMs) === 'open',
      startAt: sec(t.openAt),
      endAt: sec(t.sealAt),
      lane,
      ...(exact ? { px: site.px + 0.5, py: site.py + 0.5 } : {}),
    });
  }
  return out;
}

/** The serpent the clock is about, or the next once it has dived. */
function serpent(nowMs, live) {
  let t = serpentAt(nowMs);
  const ph = serpentPhase(t, nowMs);
  if (ph === 'slain' || ph === 'sounding' || ph === 'gone') t = serpentAt(t.soundAt + SERPENT_DIVE_MS + 1000);
  const s = live?.serpent && live.serpent.d === t.day ? live.serpent : null;
  const ring = s && Number.isFinite(s.sx) && Number.isFinite(s.sz) ? serpentRing(t.day, s.sx, s.sz) : null;
  const pl = placeOf(s?.pl);
  const now = serpentPhase(t, nowMs);
  return /** @type {WorldEvent} */ ({
    key: `serpent:${t.day}`,
    family: 'serpent',
    remind: 'serpent',
    title: `${HERALD_FAMILIES.serpent.name}: ${serpentBossOf(t.day).name}`,
    where: pl ? `off ${pl}` : 'on the packet lanes',
    live: now === 'hunt' || now === 'late',
    startAt: sec(t.riseAt),
    endAt: sec(t.soundAt),
    lane: 0,
    ...(ring && worldPixelOk(Math.floor(ring.gx)) && worldPixelOk(Math.floor(ring.gy)) ? { px: ring.gx, py: ring.gy } : {}),
  });
}

/** Each Ketch station's voyage: boarding while the ship is docked, else its next arrival. */
function ketches(nowMs) {
  return KT_THEATRES.map((th) => {
    const at = ketchVoyageAt(nowMs, th);
    // weighing anchor, the ship takes no more crews: its next arrival is the news
    const v = at.phase === 'departing' ? { ...ketchVoyageOf(at.n + 1), phase: 'away' } : at;
    const city = KT_STATION_CITIES[th] ?? laneName(th);
    return /** @type {WorldEvent} */ ({
      key: `ketch:${v.n}`,
      family: 'ketch',
      remind: `ketch:${th}`,
      title: HERALD_FAMILIES.ketch.name,
      where: `over ${city}`,
      live: v.phase === 'docked',
      startAt: sec(v.at),
      endAt: sec(v.departAt),
      lane: th,
      station: city,
    });
  });
}

/** Each lane's Hollow as the herald tells it: risen somewhere, found in its region, or the next one's earliest rise. */
function hollows(nowMs, live) {
  /** @type {WorldEvent[]} */
  const out = [];
  for (const h of Array.isArray(live?.abyss) ? live.abyss : []) {
    if (!Number.isSafeInteger(h?.s) || !Number.isSafeInteger(h?.lane)) continue;
    const province = sdProvinceName(h.s);
    if (h.ph === 'risen') {
      out.push({
        key: `abyss:${h.s}:risen`,
        family: 'abyss',
        title: `${HERALD_FAMILIES.abyss.name} has risen`,
        where: `somewhere in ${province || BAY}, not yet found`,
        live: true,
        startAt: null,
        endAt: sec(h.until),
        lane: h.lane,
      });
    } else if (h.ph === 'found' || h.ph === 'fell') {
      const region = sdRegionName(h.r);
      out.push({
        key: `abyss:${h.s}:found`,
        family: 'abyss',
        remind: 'abyss',
        title: h.ph === 'fell' ? `${HERALD_FAMILIES.abyss.name}: the Hour is broken` : `${HERALD_FAMILIES.abyss.name} is open`,
        where: region ? `in the ${region} region` : `in ${province || BAY}`,
        live: h.ph === 'found',
        startAt: Number.isFinite(h.foundAt) ? sec(h.foundAt) : null,
        endAt: sec(h.until),
        lane: h.lane,
      });
    } else if (Number.isFinite(h.next) && h.next > nowMs) {
      out.push({
        key: `abyss:${h.s}:next`,
        family: 'abyss',
        title: `The next ${HERALD_FAMILIES.abyss.name}`,
        where: `may rise in ${province || BAY}`,
        live: false,
        startAt: sec(h.next),
        endAt: null,
        lane: h.lane,
      });
    }
  }
  return out;
}

/**
 * Every world event at `nowMs`, live first. The relay's facts may be null: times still stand, places do not.
 * @param {{ db: any }} ctx @param {any} env @param {number} nowMs @param {any} [live]
 * @returns {Promise<WorldEvent[]>}
 */
export async function worldEvents(ctx, env, nowMs, live) {
  const facts = live === undefined ? await liveFacts(env, nowMs) : live;
  /** @type {WorldEvent[]} */
  const list = [...gates(nowMs, facts), serpent(nowMs, facts), ...ketches(nowMs), ...hollows(nowMs, facts)];
  const spire = Number(facts?.spire) || 0;
  if (spire > 0)
    list.push({
      key: 'spire',
      family: 'spire',
      title: HERALD_FAMILIES.spire.name,
      where: `${plural(spire, 'breach', 'breaches')} open`,
      live: true,
      startAt: null,
      endAt: null,
      lane: 0,
    });
  try {
    const siege = await siegesLive(ctx.db, sec(nowMs));
    if (siege.live)
      list.push({
        key: 'siege',
        family: 'siege',
        title: 'A seat battle',
        where: 'under way or about to begin',
        live: true,
        startAt: null,
        endAt: siege.until,
        lane: 0,
      });
  } catch {
    /* no seats table: no battles */
  }
  return list;
}

/** An event's line: what, where, and when. @param {WorldEvent} e */
export function eventLine(e) {
  const t = e.live
    ? e.endAt
      ? `until ${when(e.endAt, 't')} (${when(e.endAt, 'R')})`
      : 'now'
    : e.startAt
      ? `${when(e.startAt, 'R')} · ${when(e.startAt, 't')}`
      : '';
  return `**${md(e.title, 80)}** ${md(e.where, 80)}${t ? `\n-# ${t}` : ''}`;
}

/** The lists: live now, and coming up soonest first. @param {WorldEvent[]} list @param {number} now seconds */
export function eventLists(list, now) {
  const live = list.filter((e) => e.live).sort((a, b) => (a.endAt ?? Infinity) - (b.endAt ?? Infinity));
  const next = list.filter((e) => !e.live && e.startAt && e.startAt > now).sort((a, b) => /** @type {number} */ (a.startAt) - /** @type {number} */ (b.startAt));
  return { live, next };
}

/** A list's text, bounded, with how many more there are. */
function listText(/** @type {WorldEvent[]} */ list, /** @type {string} */ head, /** @type {string} */ none) {
  const shown = list.slice(0, EVENTS_SHOWN).map(eventLine);
  const more = list.length - shown.length;
  return `**${head}**\n${shown.length ? shown.join('\n') : `-# ${none}`}${more > 0 ? `\n-# and ${more} more` : ''}`;
}

/** The reminders a Discord user asked for. */
async function remindersOf(/** @type {any} */ db, /** @type {string} */ discordId) {
  const r = await db.prepare('SELECT family FROM discord_reminders WHERE discord_id = ?1').bind(discordId).all();
  return new Set((r?.results ?? []).map((x) => String(x.family)));
}

/** @param {any} who @param {string} [said] */
async function eventsScreen(who, said = '') {
  const nowMs = who.ctx.nowS * 1000;
  const facts = await liveFacts(who.env, Date.now());
  const { live, next } = eventLists(await worldEvents(who.ctx, who.env, nowMs, facts), who.ctx.nowS);
  const parts = [
    ...(said ? [text(said), divider()] : []),
    text(listText(live, 'Live now', 'Nothing is live right now.')),
    text(listText(next, 'Coming up', 'Nothing is coming up.')),
    text(`${facts ? '' : '-# Places are not known right now. Times are exact.\n'}${asOf(who.ctx.nowS)}`),
    divider(),
  ];
  if (who.player) {
    const mine = await remindersOf(who.ctx.db, who.discordId);
    parts.push(
      text('**Reminders**\n-# A direct message ten minutes before each one you choose.'),
      select(
        'pda:events:remind',
        REMINDERS.map((r) => ({ label: r.label, value: r.key, default: mine.has(r.key) })),
        { placeholder: 'No reminders', min: 0, max: REMINDERS.length },
      ),
    );
  } else parts.push(text('-# Link your account to get reminders before events begin.'));
  return frame(who, 'events', parts, {
    actions: [button('Refresh', 'pda:events:refresh', { style: STYLE.PRIMARY }), button('Map', 'pda:map')],
  });
}

/** The card a reminder sends. @param {WorldEvent} e */
function reminderCard(e) {
  return {
    title: e.family === 'abyss' ? 'An Abyss Dungeon is open' : `${e.title} begins soon`,
    lines: [
      `**${md(e.title, 80)}** ${md(e.where, 80)}`,
      e.startAt && !e.live ? `Begins ${when(e.startAt, 'R')}, at ${when(e.startAt, 't')}.` : e.endAt ? `Open until ${when(e.endAt, 't')}.` : '',
    ].filter(Boolean),
    open: 'events',
    label: 'World events',
  };
}

export const eventsPda = {
  key: 'events',
  /** @param {any} who */
  screen: async (who) => eventsScreen(who),
  acts: {
    /** @param {any} who */
    refresh: async (who) => eventsScreen(who),
    /** The reminders chosen. @param {any} who @param {string[]} _a @param {string[]} values */
    async remind(who, _a, values) {
      if (!who.player) return eventsScreen(who, 'Link your account to get reminders.');
      const keep = [...new Set(values)].filter((v) => REMINDER_KEYS.has(v));
      const db = who.ctx.db;
      await db.batch([
        db.prepare('DELETE FROM discord_reminders WHERE discord_id = ?1').bind(who.discordId),
        ...keep.map((k) =>
          db
            .prepare('INSERT INTO discord_reminders (discord_id, family, at) VALUES (?1, ?2, ?3)')
            .bind(who.discordId, k, who.ctx.nowS),
        ),
      ]);
      return eventsScreen(
        who,
        keep.length ? `Saved. You will hear of ${plural(keep.length, 'kind')} of event.` : 'Saved. No reminders.',
      );
    },
  },
  /** The next event, or one live now. @param {any} who */
  async glance(who) {
    const { live, next } = eventLists(await worldEvents(who.ctx, who.env, who.ctx.nowS * 1000), who.ctx.nowS);
    const e = next[0];
    if (!e) return live.length ? `◷ **Events:** ${plural(live.length, 'event')} live now` : null;
    return `◷ **Next:** ${md(e.title, 60)} ${md(e.where, 60)}, ${when(/** @type {number} */ (e.startAt), 'R')}${live.length ? ` · ${live.length} live now` : ''}`;
  },
  /**
   * The minute: a reminder to everyone who asked for an event that begins within REMIND_LEAD_S, and for a Hollow just
   * found. One row a user and event, so a reminder goes once. Answers how many were queued.
   * @param {{ db: any, nowS: number }} ctx @param {any} env
   */
  async minute(ctx, env) {
    const families = new Set(
      ((await ctx.db.prepare('SELECT DISTINCT family FROM discord_reminders').all())?.results ?? []).map((r) =>
        String(r.family),
      ),
    );
    if (!families.size) return 0;
    const facts = families.has('abyss') ? await liveFacts(env, ctx.nowS * 1000) : null;
    const list = await worldEvents(ctx, env, ctx.nowS * 1000, facts);
    let n = 0;
    for (const e of list) {
      if (!e.remind || !families.has(e.remind)) continue;
      const due =
        e.family === 'abyss'
          ? e.live && e.startAt != null && ctx.nowS - e.startAt <= FOUND_FRESH_S
          : !e.live && e.startAt != null && e.startAt > ctx.nowS && e.startAt - ctx.nowS <= REMIND_LEAD_S;
      if (!due) continue;
      const r = await ctx.db
        .prepare(
          `INSERT OR IGNORE INTO discord_notices (discord_id, kind, ref, card, made_at)
           SELECT r.discord_id, 'events', ?1, ?2, ?3 FROM discord_reminders r JOIN discord_links l ON l.discord_id = r.discord_id
           WHERE r.family = ?4 AND l.dm_dead = 0`,
        )
        .bind(`${e.key}`, JSON.stringify(noticeCard(reminderCard(e))), ctx.nowS, e.remind)
        .run();
      n += Number(r?.meta?.changes ?? 0);
    }
    return n;
  },
  /** The hour: reminders of users no longer linked. @param {{ db: any }} ctx */
  async hour(ctx) {
    const r = await ctx.db
      .prepare('DELETE FROM discord_reminders WHERE discord_id NOT IN (SELECT discord_id FROM discord_links)')
      .run();
    return Number(r?.meta?.changes ?? 0);
  },
};

