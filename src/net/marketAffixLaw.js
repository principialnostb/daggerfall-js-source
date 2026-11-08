// @ts-check
// The Goods searched by affix: a line picked ("Strength", "Fire resistance", "Life leech") and the least value it must
// carry. The Goods filter sends `affixes` - `[{ id, param?, min? }]`, at most MARKET_AFFIX_MAX, all required - and the
// service reads each against the listed piece's own `affixes` (server-account/src/market.js, the goods view).
// Pure: both ends read it.

import { AFFIX_KINDS, AFFIX_RANGES, affixLabel } from '../systems/loot/lootRarity.js';

/** The most affix lines one search asks for, all of them required. */
export const MARKET_AFFIX_MAX = 3;

/** A line's key on the wire and in the list: its kind, or its kind and param ("stat:strength", "skill:9"). */
export const affixKeyOf = (/** @type {string} */ id, /** @type {any} */ param) => (param === undefined || param === null ? id : `${id}:${param}`);

/** A line's name, its number dropped: the tooltip's label of a value of one ("+1 Strength" -> "Strength"). */
function lineName(id, param) {
  const label = affixLabel(param === undefined ? { id, value: 1 } : { id, param, value: 1 });
  // a leech line's tail ("... on this weapon's own blows") is no list's word
  const bare = label.replace(/^[+-]?1%?\s*/, '').replace(/\s*\+1%$/, '').replace(/ on this weapon.*$/, '').trim();
  if (!bare) return '';
  const name = bare.charAt(0).toUpperCase() + bare.slice(1);
  // a skill's line and a technique's wear the bare name ("Axe", "Cleave") - said what they are, so a list reads plainly
  return id === 'skill' ? `${name} skill` : id === 'technique' ? `${name} technique` : name;
}

let lines = /** @type {ReadonlyArray<{ key: string, id: string, param: any, name: string }> | null} */ (null);
/** EVERY LINE A PIECE MAY CARRY, sorted by name - the filter's list. Built once. */
export function marketAffixLines() {
  if (lines) return lines;
  const out = [];
  for (const [id, k] of Object.entries(AFFIX_KINDS)) {
    for (const param of k.params ?? [undefined]) {
      const name = lineName(id, param);
      if (name) out.push(Object.freeze({ key: affixKeyOf(id, param), id, param: param ?? null, name }));
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  lines = Object.freeze(out);
  return lines;
}

/** A line named by its key, or null. */
export const marketAffixLine = (/** @type {unknown} */ key) => (typeof key === 'string' ? marketAffixLines().find((line) => line.key === key) ?? null : null);

/**
 * THE AFFIX LINES A READ ASKS FOR, as the service binds them: `[{ id, param, min }]` - each a known kind with a param it
 * takes (none where it takes none), its least value a whole number within the kind's range (1 for none or a bad one),
 * each line once, at most MARKET_AFFIX_MAX. Anything else is left out; nothing asked is [].
 * @param {unknown} raw
 * @returns {Array<{ id: string, param: string | number | null, min: number }>}
 */
export function marketAffixesOf(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const a of raw.slice(0, MARKET_AFFIX_MAX * 2)) {
    if (!a || typeof a !== 'object') continue;
    const { id, param = null, min = 1 } = /** @type {any} */ (a);
    if (typeof id !== 'string' || !Object.hasOwn(AFFIX_KINDS, id)) continue;
    const k = AFFIX_KINDS[id];
    if (k.params ? !k.params.includes(param) : param !== null) continue;
    const key = affixKeyOf(id, param);
    if (seen.has(key)) continue;
    seen.add(key);
    const top = AFFIX_RANGES[id].legendary[1];
    const least = Number.isInteger(min) && min >= 1 && min <= top ? min : 1;
    out.push({ id, param, min: least });
    if (out.length >= MARKET_AFFIX_MAX) break;
  }
  return out;
}
