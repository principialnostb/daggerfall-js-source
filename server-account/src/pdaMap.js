// @ts-check
// The map: Tamriel and the world events on it, as a worn-paper chart the service draws itself (journalMap.js) from the
// owner's own relief of Tamriel, never from a player's game files. An event whose place is known is an inked pin; one
// known only by its province is a dashed ring at the province's name, and the legend says which.
import { picture, text, button, STYLE, md, divider, loreName } from './pdaUi.js';
import { frame, asOf } from './pdaFrame.js';
import { worldEvents, liveFacts, eventLists, eventLine } from './pdaEvents.js';
import { fnvHex } from './pdaPng.js';
import { drawJournalMap, MAP_PX, CHART_W, CHART_H, PIN_INK, _resetJournalMapForTests } from './journalMap.js';
import { CITIES, provinceAt, provinceByKey } from '../../src/world/tamriel/tamrielGeography.js';
import { PICTURE_W, PICTURE_H, bayToPicture } from '../../src/world/tamriel/tamrielFrame.js';
import { PROVINCE_OF_ID } from '../../src/world/tamriel/tamrielLand.js';
import { HERALD_FAMILIES } from '../../src/net/herald/heraldCard.js';

/** Map pixels a picture unit. */
export const MAP_SCALE = MAP_PX;
export const IMAGE_W = CHART_W;
export const IMAGE_H = CHART_H;
/** Pins the map draws at most: every event live now, then the soonest. */
export const MAP_PINS_MAX = 12;
/** An event begins within this many seconds to be on the map. */
export const MAP_SOON_S = 3 * 3600;
/** The map's address on the service. */
export const MAP_PATH = '/v1/pda/map.png';
/** The ink a family's pin is drawn in, as 0xRRGGBB. */
export const pinInk = (/** @type {string} */ family) =>
  /** @type {Record<string, number>} */ (PIN_INK)[family] ?? PIN_INK.siege;

/** Where the Bay's two Ketch stations sit on our map: authored from the lore map, on their shores of the inlet. */
const BAY_STATIONS = Object.freeze({ Daggerfall: [64, 53], Sentinel: [62, 74] });
/** An event known only to be somewhere on the Bay is ringed here, in the inlet's water. */
const BAY_MARK = Object.freeze([78, 64]);

/**
 * Where an event goes on the map, in picture units: its own place when known and on its theatre's ground, else its
 * province's name (or the Bay's water). `exact` says which.
 * An event with no place at all (the Battlespire, a seat battle, a serpent not yet agreed on) is not pinned: null.
 * @param {import('./pdaEvents.js').WorldEvent} e
 * @returns {{ x: number, y: number, exact: boolean } | null}
 */
export function pinPlace(e) {
  if (e.family === 'spire' || e.family === 'siege') return null;
  if (Number.isFinite(e.px) && Number.isFinite(e.py)) {
    const [x, y] = bayToPicture(/** @type {number} */ (e.px), /** @type {number} */ (e.py));
    const onGrid = x >= 0 && y >= 0 && x < PICTURE_W && y < PICTURE_H;
    // a place past the Bay must stand in its own province; the serpent's sea and the Bay's own places need only the grid
    const ok = onGrid && (e.family === 'serpent' || e.lane === 0 || provinceAt(x, y)?.key === PROVINCE_OF_ID[/** @type {1} */ (e.lane)]);
    if (ok) return { x, y, exact: true };
  }
  if (e.station) {
    const city = CITIES.find((c) => c.name === e.station);
    const at = city?.at ?? /** @type {Record<string, readonly number[]>} */ (BAY_STATIONS)[e.station];
    if (at) return { x: at[0], y: at[1], exact: true };
  }
  if (e.family === 'serpent') return null;
  const prov = e.lane > 0 ? provinceByKey(PROVINCE_OF_ID[/** @type {1} */ (e.lane)]) : null;
  const at = prov?.label ?? BAY_MARK;
  return { x: at[0], y: at[1] + 6, exact: false };
}

/**
 * The events the map pins, numbered: every one live, then the soonest to begin within MAP_SOON_S.
 * @param {import('./pdaEvents.js').WorldEvent[]} list @param {number} nowS
 */
export function mapPins(list, nowS) {
  const { live, next } = eventLists(list, nowS);
  const placed = [...live, ...next.filter((e) => /** @type {number} */ (e.startAt) - nowS <= MAP_SOON_S)]
    .map((e) => ({ e, p: pinPlace(e) }))
    .filter((x) => x.p)
    .slice(0, MAP_PINS_MAX);
  const used = new Map();
  return placed.map(({ e, p: place }, i) => {
    const p = /** @type {{ x: number, y: number, exact: boolean }} */ (place);
    // rings that share a place are walked apart, so each stays readable
    const k = `${Math.round(p.x)},${Math.round(p.y)}`;
    const n = used.get(k) ?? 0;
    used.set(k, n + 1);
    return { n: i + 1, e, x: p.x + n * 6, y: p.y, exact: p.exact, live: e.live };
  });
}

/** The map's state as a short word: the same pins, the same picture, the same address. */
export const mapKey = (/** @type {ReturnType<typeof mapPins>} */ pins) =>
  fnvHex(JSON.stringify(pins.map((p) => [p.n, p.e.family, p.exact, p.live, Math.round(p.x * 10), Math.round(p.y * 10)])));

/** The map with its pins, as PNG bytes. @param {ReturnType<typeof mapPins>} pins */
export const drawMap = (pins) => drawJournalMap(pins);

/** Maps drawn, by state, newest last: one drawing serves every viewer of the same moment. */
const drawn = new Map();
const DRAWN_MAX = 4;
/** Tests stand fresh isolates. */
export const _resetPdaMapForTests = () => {
  drawn.clear();
  _resetJournalMapForTests();
};
/** The PNG for these pins, drawn once. */
export async function mapBytes(/** @type {ReturnType<typeof mapPins>} */ pins) {
  const key = mapKey(pins);
  if (!drawn.has(key)) {
    if (drawn.size >= DRAWN_MAX) drawn.delete(drawn.keys().next().value);
    drawn.set(key, await drawMap(pins));
  }
  return { key, bytes: drawn.get(key) };
}

const familyName = (/** @type {string} */ f) =>
  /** @type {Record<string, { name: string }>} */ (HERALD_FAMILIES)[f]?.name ?? 'Seat battle';

/** @param {any} who */
async function mapScreen(who) {
  const facts = await liveFacts(who.env, Date.now());
  const pins = mapPins(await worldEvents(who.ctx, who.env, who.ctx.nowS * 1000, facts), who.ctx.nowS);
  const key = mapKey(pins);
  const legend = pins.map(
    (p) => `**${p.n}** ${p.exact ? '●' : '○'} ${loreName(eventLine(p.e)).replace(/\n-# /, ' · ')}${p.exact ? '' : ' (its province)'}`,
  );
  const families = [...new Set(pins.map((p) => p.e.family))].map(familyName).join(', ');
  const parts = [
    ...(who.origin ? [picture(`${who.origin}${MAP_PATH}?v=${key}`, 'Tamriel, with the world events pinned')] : [text('-# The map cannot be drawn here.')]),
    text(legend.length ? legend.join('\n').slice(0, 2400) : '-# No events are live or coming in the next three hours.'),
    text(
      `-# ● its place · ○ its province${families ? ` · ${md(families, 200)}` : ''}${facts ? '' : ' · places not known right now'}\n${asOf(who.ctx.nowS)}`,
    ),
  ];
  return frame(who, 'map', [...parts, divider()], {
    actions: [button('Refresh', 'pda:map:refresh', { style: STYLE.PRIMARY }), button('Events', 'pda:events')],
  });
}

export const mapPda = {
  key: 'map',
  /** @param {any} who */
  screen: async (who) => mapScreen(who),
  acts: {
    /** @param {any} who */
    refresh: async (who) => mapScreen(who),
  },
  routes: {
    [MAP_PATH]: {
      method: /** @type {'GET'} */ ('GET'),
      open: true,
      /** The picture Discord fetches: the map as it stands now, whatever `v` the address carried. */
      handle: async (/** @type {any} */ ctx, /** @type {any} */ env) => {
        const nowS = Number(ctx?.nowS) || Math.floor(Date.now() / 1000);
        const pins = mapPins(await worldEvents(ctx, env, nowS * 1000), nowS);
        try {
          const { bytes } = await mapBytes(pins);
          return new Response(bytes, {
            status: 200,
            headers: {
              'content-type': 'image/png',
              'cache-control': 'public, max-age=120',
              'access-control-allow-origin': '*',
              'x-content-type-options': 'nosniff',
            },
          });
        } catch (e) {
          console.warn('[pda] the map', /** @type {any} */ (e)?.message ?? e);
          return { status: 503, json: { error: 'map-unavailable' } };
        }
      },
    },
  },
};
