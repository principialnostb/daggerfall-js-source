// @ts-check
// THE TOYBOX'S SPECIAL EFFECTS, PURE: the port's own marks a piece carries beside Daggerfall's enchantments - a set's
// membership, a special move (a technique line, a Legendary's or a Gilded record's power) and the ladder's lines. Each
// is laid as the game's own doors lay it (lootRarity.js applyRarity and addTechniqueLine, aetheric.js mintAetheric,
// gilded.js mintGilded), so the card, the combat and the sets read the piece as they read a found one. The item law
// still judges the piece: what it refuses online is the developer's to keep offline.
// Not a DFU member: Daggerfall has none of these marks.
import {
  AFFIX_KINDS,
  AFFIX_IDS,
  AFFIX_RANGES,
  RARE_FLAVOURS,
  RARITIES,
  kindParams,
  legendariesFor,
  powerOf,
  powerFits,
  powerLine,
  rarityName,
  affixesWorth,
  affixLabel,
  rareEnchantWorth,
} from '../loot/lootRarity.js';
import { techniquesFor, techniqueById, techniqueBrief } from '../../combat/technique/techniqueRoster.js';
import { AETHERIC_RECORDS, aethericMaterial, mintAetheric } from '../aetheric.js';
import { GILDED_RECORDS, mintGilded } from '../gilded.js';
import { SIGIL_SETS, SET_STAGE_MAX, setById, setPieceKind } from '../sigil/sigilSets.js';
import { SIGIL_BANDS, SIGIL_POWER_MAX, SIGIL_STAGES, SIGIL_SET_IDS, sigilRank } from '../sigil/sigil.js';
import { SKILL_NAMES } from '../skills.js';
import { ENCHANTMENT_TYPES } from '../../formats/magicDef.js';
import { enchantmentName, enchantmentParamName } from '../enchantmentCatalogue.js';

/** The section's three lists, in the window's order. */
export const SPECIAL_SECTIONS = Object.freeze([
  Object.freeze({ id: 'sets', label: 'Set bonuses' }),
  Object.freeze({ id: 'moves', label: 'Special moves' }),
  Object.freeze({ id: 'effects', label: 'Special effects' }),
]);
/** The most special effects one piece takes. */
export const SPECIAL_MAX = 16;
/** The tiers a piece of no record may wear. */
export const SPECIAL_TIERS = Object.freeze(['magic', 'rare']);

/** The ladder's lines by the names a player reads on a card. */
const LINE_NAMES = Object.freeze({
  damage: 'Damage',
  armor: 'Armor',
  weight: 'Carrying capacity',
  stat: 'Attribute',
  resist: 'Resistance',
  skill: 'Skill',
  elemental: 'Elemental damage',
  leech: 'Life leech',
  thorns: 'Thorns',
  focus: 'Spell cost',
  slayer: 'Slayer',
  standing: 'Standing',
  warmth: 'Warmth',
  dry: 'Weatherproof',
  castSpeed: 'Casting speed',
  potency: 'Spell damage',
  wellspring: 'Wellspring',
});
const cap = (/** @type {string} */ word) => word.charAt(0).toUpperCase() + word.slice(1);
const STAGES = Object.freeze(SIGIL_STAGES.map((stage, i) => Object.freeze({ param: i, label: stage.name })));

/** @typedef {{ group: string, templateIndex: number }} Piece */
/** @typedef {{ kind: string, id: string, param?: any, value?: number }} SpecialEntry */

/** A param's name as a line's own label names it. @param {string} id @param {any} param */
function paramLabel(id, param) {
  if (id === 'skill') return SKILL_NAMES[param] ?? String(param);
  return cap(String(param));
}
/** A whole number in [lo, hi]. */
const intIn = (/** @type {unknown} */ value, /** @type {number} */ lo, /** @type {number} */ hi) =>
  Number.isSafeInteger(value) && /** @type {number} */ (value) >= lo && /** @type {number} */ (value) <= hi;

/** A Rare's enchantments for a group, those a door still draws. @param {string} group */
export function rareFlavoursFor(group) {
  const list = /** @type {any} */ (RARE_FLAVOURS)[group] ?? RARE_FLAVOURS.Jewellery;
  return list.filter((/** @type {any} */ flavour) => !flavour.retired);
}
/** A DFU row's name as the card says it. @param {{ type: number, param: number }} row */
export function rowName(row) {
  const key = Object.keys(ENCHANTMENT_TYPES).find((k) => /** @type {any} */ (ENCHANTMENT_TYPES)[k] === row.type);
  if (!key) return '';
  const param = enchantmentParamName(key, row.param);
  return param && param !== 'None' ? `${enchantmentName(key)}: ${param}` : enchantmentName(key);
}

/** The Aetheric record a set makes of this piece, or null. @param {Piece} piece @param {string} setId */
export const aethericRecordOf = (piece, setId) =>
  AETHERIC_RECORDS.find((rec) => rec.set === setId && rec.group === piece.group && rec.templateIndex === piece.templateIndex) ??
  null;
const gildedFor = (/** @type {Piece} */ piece) =>
  GILDED_RECORDS.filter((rec) => rec.group === piece.group && rec.templateIndex === piece.templateIndex);
const legendariesOf = (/** @type {Piece} */ piece) =>
  legendariesFor(piece).filter((rec) => {
    const power = powerOf(rec.id);
    return !power || powerFits(piece, power);
  });

/** The one key an entry holds: a line of a kind with params one a param, every other kind one a piece. */
const keyOf = (/** @type {SpecialEntry} */ entry) =>
  entry.kind === 'line' && entry.param !== undefined ? `line:${entry.id}:${entry.param}` : entry.kind === 'line' ? `line:${entry.id}` : entry.kind;

/** An entry read and checked for a piece, or null. @param {Piece} piece @param {any} raw @returns {SpecialEntry | null} */
function entryOf(piece, raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  const stage = raw.param == null ? 0 : raw.param;
  switch (raw.kind) {
    case 'line': {
      if (!AFFIX_IDS.includes(raw.id) || !AFFIX_KINDS[raw.id].groups.includes(piece.group)) return null;
      const params = kindParams(raw.id, piece);
      if (params ? !params.includes(raw.param) : raw.param != null) return null;
      if (!intIn(raw.value, 1, AFFIX_RANGES[raw.id].legendary[1])) return null;
      return { kind: 'line', id: raw.id, ...(params ? { param: raw.param } : {}), value: raw.value };
    }
    case 'technique':
      if (!techniquesFor(piece).includes(raw.id) || !intIn(raw.value, 1, AFFIX_RANGES.technique.legendary[1])) return null;
      return { kind: 'technique', id: raw.id, value: raw.value };
    case 'set':
      if (!setPieceKind(piece) || !SIGIL_SET_IDS.includes(raw.id) || !setById(raw.id) || !intIn(stage, 0, SET_STAGE_MAX)) return null;
      return { kind: 'set', id: raw.id, param: stage };
    case 'blow':
      if (setPieceKind(piece) !== 'weapon' || raw.id !== 'sigil' || !intIn(stage, 0, SET_STAGE_MAX)) return null;
      if (!intIn(raw.value, 1, SIGIL_POWER_MAX)) return null;
      return { kind: 'blow', id: 'sigil', param: stage, value: raw.value };
    case 'legendary':
      return legendariesOf(piece).some((rec) => rec.id === raw.id) ? { kind: 'legendary', id: raw.id } : null;
    case 'gilded':
      return gildedFor(piece).some((rec) => rec.id === raw.id) ? { kind: 'gilded', id: raw.id } : null;
    default:
      return null;
  }
}

/** The fixed record the entries make the piece, or null: a Legendary, a Gilded record, an Aetheric set's own piece.
 *  @param {Piece} piece @param {SpecialEntry[]} special */
export function specialRecord(piece, special) {
  for (const entry of special) {
    if (entry.kind === 'legendary') return { kind: 'legendary', rec: legendariesFor(piece).find((rec) => rec.id === entry.id) };
    if (entry.kind === 'gilded') return { kind: 'gilded', rec: gildedFor(piece).find((rec) => rec.id === entry.id) };
    const aetheric = entry.kind === 'set' ? aethericRecordOf(piece, entry.id) : null;
    if (aetheric) return { kind: 'aetheric', rec: aetheric };
  }
  return null;
}
/** The material a record fixes, or undefined. @param {Piece} piece @param {SpecialEntry[]} special */
export function specialMaterial(piece, special) {
  const found = specialRecord(piece, special);
  if (found?.kind === 'aetheric') return aethericMaterial(/** @type {any} */ (found.rec));
  if (found?.kind === 'gilded') return /** @type {any} */ (found.rec).material;
  return undefined;
}

/**
 * A SPEC'S SPECIAL EFFECTS READ AND CHECKED for its piece: `special` (each entry the piece may carry, no key twice, one
 * record at most), `tier` ('magic' or 'rare', for a piece of no record) and a Rare's `flavour` (its place in
 * rareFlavoursFor; absent, the Rare's own enchantment is the first maker row that is one of them). Answers `{ special, tier?, flavour? }` or `{ error: 'toybox-special' }`.
 * @param {Piece} piece @param {any} raw
 */
export function specialOf(piece, raw) {
  const list = raw?.special == null ? [] : raw.special;
  if (!Array.isArray(list) || list.length > SPECIAL_MAX) return { error: 'toybox-special' };
  /** @type {SpecialEntry[]} */
  const special = [];
  const keys = new Set();
  for (const item of list) {
    const entry = entryOf(piece, item);
    if (!entry || keys.has(keyOf(entry))) return { error: 'toybox-special' };
    keys.add(keyOf(entry));
    special.push(entry);
  }
  const records = special.filter((entry) => specialRecord(piece, [entry])).length;
  if (records > 1) return { error: 'toybox-special' };
  if (!special.length) return { special };
  const tier = raw.tier == null ? 'magic' : raw.tier;
  if (!SPECIAL_TIERS.includes(tier)) return { error: 'toybox-special' };
  if (tier !== 'rare') return { special, tier };
  if (raw.flavour == null) return { special, tier };
  const flavour = raw.flavour;
  if (!intIn(flavour, 0, rareFlavoursFor(piece.group).length - 1)) return { error: 'toybox-special' };
  return { special, tier, flavour };
}

/** The piece a record makes, minted whole by its own door, or null for a piece of none. @param {Piece} piece
 *  @param {SpecialEntry[]} special */
export function mintSpecialRecord(piece, special) {
  const found = specialRecord(piece, special);
  if (found?.kind === 'aetheric') return mintAetheric(/** @type {any} */ (found.rec));
  if (found?.kind === 'gilded') return mintGilded(/** @type {any} */ (found.rec));
  return null;
}

/**
 * LAYS THE ENTRIES ON A MADE PIECE, in place, as the ladder's doors lay them: a Legendary's record or the chosen tier
 * (its name, its lines, a Rare's or a Legendary's own enchantment ahead of the item maker's rows), the chosen lines after
 * a record's own, a technique line last, the sigil a set or a blow writes, and the price the lines add. A record's piece
 * comes minted (mintSpecialRecord); its lines are added after its own.
 * @param {any} item @param {Piece} piece @param {{ special: SpecialEntry[], tier?: string, flavour?: number }} chosen
 */
export function laySpecial(item, piece, { special, tier = 'magic', flavour = undefined }) {
  if (!special.length) return item;
  const found = specialRecord(piece, special);
  const lines = special
    .filter((entry) => entry.kind === 'line')
    .map((entry) => ({ id: entry.id, ...(entry.param !== undefined ? { param: entry.param } : {}), value: entry.value }));
  const technique = special.find((entry) => entry.kind === 'technique');
  const maker = Array.isArray(item.enchantments) ? item.enchantments : [];
  let own = null;
  let added = lines;
  if (found?.kind === 'legendary') {
    const rec = /** @type {any} */ (found.rec);
    item.rarity = 'legendary';
    item.legendary = rec.id;
    item.name = rec.name;
    const signature = rec.affixes.map((/** @type {any} */ line) => ({ ...line }));
    item.affixes = [...signature, ...lines];
    added = item.affixes;
    own = rec.enchantment ?? null;
  } else if (found) {
    item.affixes = [...(item.affixes ?? []), ...lines];
  } else {
    item.rarity = tier;
    item.affixes = lines;
    item.name = rarityName(item, tier, lines);
    if (tier === 'rare') own = flavour === undefined ? takeFlavour(maker, piece.group) : (rareFlavoursFor(piece.group)[flavour] ?? null);
  }
  if (technique) {
    const line = { id: 'technique', param: technique.id, value: technique.value };
    item.affixes.push(line);
    added = [...added, line];
  }
  if (own) item.enchantments = [{ type: own.type, param: own.param }, ...maker];
  const set = special.find((entry) => entry.kind === 'set');
  const blow = special.find((entry) => entry.kind === 'blow');
  if (set || blow) {
    const was = item.sigil ?? {};
    const stage = Math.max(set?.param ?? 0, blow?.param ?? 0);
    const power = blow ? blow.value : was.power;
    item.sigil = {
      ...(power !== undefined ? { power } : {}),
      ...(set ? { set: set.id } : {}),
      party: was.party ?? 1,
      xp: SIGIL_STAGES[stage].xp,
    };
  }
  const worth = affixesWorth(added, item) + (own ? rareEnchantWorth(item) : 0);
  item.value = (Number.isFinite(item.value) ? item.value : 0) + worth;
  item.isIdentified = true;
  return item;
}

/** The first maker row that is one of a Rare's own enchantments, taken out of `rows` as the Rare's own; null for none.
 *  A found Rare carries one, and the item law asks for it. @param {any[]} rows @param {string} group */
function takeFlavour(rows, group) {
  const same = (/** @type {any} */ row, /** @type {any} */ flavour) =>
    (typeof row.type === 'string' ? /** @type {any} */ (ENCHANTMENT_TYPES)[row.type] : row.type) === flavour.type && row.param === flavour.param;
  const at = rows.findIndex((row) => rareFlavoursFor(group).some((flavour) => same(row, flavour)));
  if (at < 0) return null;
  const [row] = rows.splice(at, 1);
  const flavour = rareFlavoursFor(group).find((one) => same(row, one));
  return flavour ? { type: flavour.type, param: flavour.param } : null;
}

/** A line's words with its value: the card's label. @param {string} id @param {any} param @param {number | string} value */
const lineWords = (id, param, value) => /** @type {any} */ (AFFIX_KINDS)[id].label({ id, param, value });
/** What a set does: its role and the tiers it wakes. @param {any} set */
const setWords = (set) => `${set.role}. ${set.tiers.map((/** @type {any} */ tier) => `${tier.at}: ${tier.name}`).join(', ')}.`;

/**
 * WHAT THE ADD BUTTON LISTS for a piece, beside the entries it already holds: `[{ section, kind, id, name, does, params,
 * band, max }]` - `params` the settings a row picks among (or null), `band` the value's band per tier and `max` its
 * most (or null for an entry that takes no value). Each is the game's own: the sets a piece counts in, its family's
 * techniques, the Legendary and Gilded records it may be, the lines its group carries.
 * @param {Piece} piece @param {SpecialEntry[]} held
 */
export function specialChoices(piece, held = []) {
  const keys = new Set(held.map(keyOf));
  const recordHeld = held.some((entry) => specialRecord(piece, [entry]));
  const out = [];
  if (setPieceKind(piece) && !keys.has('set')) {
    for (const id of SIGIL_SET_IDS) {
      const set = /** @type {any} */ (SIGIL_SETS)[id];
      const rec = aethericRecordOf(piece, id);
      if (!set || (rec && recordHeld)) continue;
      const does = rec ? `Makes this piece ${rec.name}. ${setWords(set)}` : setWords(set);
      out.push({ section: 'sets', kind: 'set', id, name: set.name, does, params: STAGES, band: null, max: null });
    }
  }
  if (!keys.has('technique')) {
    for (const id of techniquesFor(piece)) {
      const band = AFFIX_RANGES.technique;
      out.push({ section: 'moves', kind: 'technique', id, name: techniqueById(id)?.name ?? id, does: techniqueBrief(id, band.magic[0]), params: null, band, max: band.legendary[1] });
    }
  }
  if (!recordHeld) {
    for (const rec of legendariesOf(piece)) {
      const power = powerOf(rec.id);
      out.push({ section: 'moves', kind: 'legendary', id: rec.id, name: power?.name ? `${power.name} (${rec.name})` : rec.name, does: power?.text ?? rec.lore ?? '', params: null, band: null, max: null });
    }
    for (const rec of gildedFor(piece)) {
      out.push({ section: 'moves', kind: 'gilded', id: rec.id, name: `${rec.power.name} (${rec.name})`, does: rec.power.text, params: null, band: null, max: null });
    }
  }
  for (const id of AFFIX_IDS) {
    const kind = /** @type {any} */ (AFFIX_KINDS)[id];
    if (!kind.groups.includes(piece.group)) continue;
    const all = kindParams(id, piece);
    const free = all ? all.filter((param) => !keys.has(`line:${id}:${param}`)) : null;
    if (free ? !free.length : keys.has(`line:${id}`)) continue;
    const band = /** @type {any} */ (AFFIX_RANGES)[id];
    const params = free ? free.map((param) => ({ param, label: paramLabel(id, param) })) : null;
    const does = lineWords(id, free?.[0], `${band.rare[0]}-${band.rare[1]}`);
    out.push({ section: 'effects', kind: 'line', id, name: LINE_NAMES[/** @type {keyof typeof LINE_NAMES} */ (id)] ?? id, does, params, band, max: band.legendary[1] });
  }
  if (setPieceKind(piece) === 'weapon' && !keys.has('blow')) {
    const does = `+${SIGIL_BANDS.magic[0]}-${SIGIL_POWER_MAX}% damage at Ascendant, as it grows with Renown. Works online only.`;
    out.push({ section: 'effects', kind: 'blow', id: 'sigil', name: 'Sigil', does, params: STAGES, band: SIGIL_BANDS, max: SIGIL_POWER_MAX });
  }
  return out;
}

/** The settings one held entry may change to: its own and every one no other entry holds. @param {Piece} piece
 *  @param {SpecialEntry[]} held @param {number} at */
export function specialParams(piece, held, at) {
  const entry = held[at];
  if (!entry) return null;
  if (entry.kind === 'set' || entry.kind === 'blow') return STAGES;
  if (entry.kind !== 'line') return null;
  const all = kindParams(entry.id, piece);
  if (!all) return null;
  const taken = new Set(held.filter((_, i) => i !== at).map(keyOf));
  return all.filter((param) => !taken.has(`line:${entry.id}:${param}`)).map((param) => ({ param, label: paramLabel(entry.id, param) }));
}

/** One held entry as its row names it: `{ name, does, band, max }`. @param {Piece} piece @param {SpecialEntry} entry */
export function specialView(piece, entry) {
  switch (entry.kind) {
    case 'line': {
      const band = /** @type {any} */ (AFFIX_RANGES)[entry.id];
      return { name: LINE_NAMES[/** @type {keyof typeof LINE_NAMES} */ (entry.id)] ?? entry.id, does: affixLabel(entry), band, max: band.legendary[1] };
    }
    case 'technique':
      return { name: techniqueById(entry.id)?.name ?? entry.id, does: techniqueBrief(entry.id, entry.value ?? 0), band: AFFIX_RANGES.technique, max: AFFIX_RANGES.technique.legendary[1] };
    case 'blow':
      return { name: 'Sigil', does: `+${entry.value}% damage at Ascendant. Works online only.`, band: SIGIL_BANDS, max: SIGIL_POWER_MAX };
    case 'set': {
      const set = setById(entry.id);
      const rec = aethericRecordOf(piece, entry.id);
      const does = `${rec ? `Makes this piece ${rec.name}. ` : ''}Sets only work online.`;
      return { name: set?.name ?? entry.id, does, band: null, max: null };
    }
    default: {
      const found = specialRecord(piece, [entry]);
      const power = powerOf(entry.id);
      return { name: power?.name ? `${power.name} (${/** @type {any} */ (found?.rec)?.name ?? entry.id})` : entry.id, does: power?.text ?? '', band: null, max: null };
    }
  }
}

/** The tier whose band a held entry's value is read against. @param {Piece} piece @param {SpecialEntry[]} special
 *  @param {string} [tier] */
export function specialBandTier(piece, special, tier = 'magic') {
  return specialRecord(piece, special) ? 'legendary' : tier;
}

/** THE STATS' LINES for a piece's special effects, as its card would say them: its tier, its lines, its own
 *  enchantment, its power and its sigil. [] for a piece of no tier. @param {any} item */
export function specialLines(item) {
  const tier = /** @type {any} */ (RARITIES)[item?.rarity];
  if (!tier || item.rarity === 'common' || item.rarity === 'artifact') return [];
  const out = [`Tier: ${tier.label}`];
  for (const line of item.affixes ?? []) {
    const label = affixLabel(line);
    if (label) out.push(label);
  }
  const own = Array.isArray(item.enchantments) ? item.enchantments.find((row) => row && row.enchantCost === undefined) : null;
  if (own) out.push(`Enchantment: ${rowName(own)}`);
  const power = powerOf(item.legendary ?? item.gilded ?? null);
  if (power) out.push(powerLine(power));
  const set = setById(item.sigil?.set);
  if (set) out.push(`Set: ${set.name} (${SIGIL_STAGES[sigilRank(item.sigil)].name})`);
  if (item.sigil?.power !== undefined) out.push(`Sigil: +${item.sigil.power}% at Ascendant`);
  return out;
}
