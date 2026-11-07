// @ts-check
// THE TOYBOX'S ITEM MAKER, PURE. A developer picks any piece a player can wear and sets the fields a piece really
// carries: its material, condition, weight, value, name, special effects (toyboxSpecial.js), enchantments, side effects
// and binding. The page, offline play and the account service all mint through buildToyboxItem, so a piece made in the
// window is the piece granted. Damage and armour are not fields: they come from the template and the material, and the window only shows them.
// The piece is made by the game's own producers (enemyEquipment.js weaponOfMaterial and armorOfMaterial, the item
// maker's applyEnchantments over pickEnchantment's rows), then asked of the item law, which has the last word.
// Not a DFU member: Daggerfall has no developer's item maker.
import { itemFindings, lawTemplate, templateGroups, CUSTOM_TEMPLATE_GROUPS, GOLD_INT_MAX } from '../item/itemLaw.js';
import { setItemFields, mintCondition, isAmmunition } from '../item/itemTemplates.js';
import { GROUP_TEMPLATE_INDICES } from '../item/itemTemplatesData.js';
import { weaponOfMaterial, armorOfMaterial } from '../../combat/enemyEquipment.js';
import { applyEnchantments, itemEnchantmentPower, totalEnchantmentCost, MAX_ENCHANTMENTS } from '../enchanting.js';
import {
  pickEnchantment,
  primaryPickerList,
  primaryPick,
  enchantmentName,
  enchantmentParamValues,
  enchantmentParamName,
  isPower,
  isSideEffect,
} from '../enchantmentCatalogue.js';
import { WEAPON_MATERIALS } from '../../characters/weapons.js';
import { ARMOR_MATERIAL, isShieldTemplate } from '../armorMaterials.js';
import { valuablePiece, mintItemId } from '../item/itemIds.js';
import { specialOf, mintSpecialRecord, laySpecial } from './toyboxSpecial.js';

/** The longest name the window takes (the post's own head bounds a name at 80). */
export const TOYBOX_NAME_MAX = 64;
/** The heaviest weight the window takes, kg. */
export const TOYBOX_WEIGHT_MAX = 1000;
/** The most rows the item maker keeps, forced rows included (applyEnchantments keeps eleven). */
export const TOYBOX_ROWS_MAX = MAX_ENCHANTMENTS + 1;

/** The window's sections, in its order: the groups a player wears pieces of. */
export const TOYBOX_SECTIONS = Object.freeze([
  Object.freeze({ id: 'weapons', label: 'Weapons', group: 'Weapons' }),
  Object.freeze({ id: 'armor', label: 'Armor', group: 'Armor' }),
  Object.freeze({ id: 'shields', label: 'Shields', group: 'Armor' }),
  Object.freeze({ id: 'jewellery', label: 'Jewellery', group: 'Jewellery' }),
  Object.freeze({ id: 'mens', label: "Men's clothing", group: 'MensClothing' }),
  Object.freeze({ id: 'womens', label: "Women's clothing", group: 'WomensClothing' }),
]);
const WEARABLE_GROUPS = new Set(/** @type {string[]} */ (TOYBOX_SECTIONS.map((section) => section.group)));

/** @typedef {ReadonlyArray<readonly [number, string]>} MaterialList */
/** A weapon's materials and an armour's, `[value, name]`, as the item list offers them. Chain2 is a classic save's alone.
 *  @type {MaterialList} */
export const TOYBOX_WEAPON_MATERIALS = Object.freeze(
  Object.entries(WEAPON_MATERIALS)
    .filter(([, value]) => value >= 0)
    .map(([name, value]) => /** @type {readonly [number, string]} */ (Object.freeze([value, name]))),
);
/** @type {MaterialList} */
export const TOYBOX_ARMOR_MATERIALS = Object.freeze(
  Object.entries(ARMOR_MATERIAL)
    .filter(([k, value]) => value >= 0 && k !== 'Chain2')
    .map(([name, value]) => /** @type {readonly [number, string]} */ (Object.freeze([value, name]))),
);
/** The materials a group takes, or null for a group with none. @param {string} group @returns {MaterialList | null} */
export const materialsOf = (group) =>
  group === 'Weapons' ? TOYBOX_WEAPON_MATERIALS : group === 'Armor' ? TOYBOX_ARMOR_MATERIALS : null;

/** The section a template stands in, or null for one a player does not wear. @param {number} i @param {string} group */
function sectionOf(i, group) {
  if (!WEARABLE_GROUPS.has(group)) return null;
  if (group === 'Weapons') return isAmmunition({ templateIndex: i }) ? null : 'weapons';
  if (group === 'Armor') return isShieldTemplate(i) ? 'shields' : 'armor';
  return TOYBOX_SECTIONS.find((section) => section.group === group)?.id ?? null;
}

let _catalogue = /** @type {any} */ (null);
/**
 * EVERY PIECE A PLAYER CAN WEAR, by section: `[{ id, label, items: [{ template, group, name }] }]`. The classic table's
 * rows first, then the port's own templates the law knows. Cached: the tables are fixed while the page lives.
 */
export function toyboxCatalogue() {
  if (_catalogue) return _catalogue;
  /** @type {Map<string, any[]>} */
  const by = new Map(TOYBOX_SECTIONS.map((section) => [section.id, []]));
  const seen = new Set();
  const add = (/** @type {number} */ i, /** @type {string} */ group) => {
    const key = `${group}:${i}`;
    const record = lawTemplate(i);
    const sec = record ? sectionOf(i, group) : null;
    if (!sec || seen.has(key) || !templateGroups(i).includes(group)) return;
    seen.add(key);
    by.get(sec)?.push(Object.freeze({ template: i, group, name: String(record.name ?? `#${i}`) }));
  };
  for (const section of TOYBOX_SECTIONS) for (const i of GROUP_TEMPLATE_INDICES[section.group] ?? []) add(i, section.group);
  for (const [group, list] of Object.entries(CUSTOM_TEMPLATE_GROUPS)) for (const i of list) add(i, group);
  _catalogue = Object.freeze(
    TOYBOX_SECTIONS.map((section) => Object.freeze({ id: section.id, label: section.label, items: Object.freeze(by.get(section.id) ?? []) })),
  );
  return _catalogue;
}

const intIn = (/** @type {unknown} */ value, /** @type {number} */ lo, /** @type {number} */ hi) =>
  Number.isSafeInteger(value) && /** @type {number} */ (value) >= lo && /** @type {number} */ (value) <= hi;
/** An enchantment row as a spec names it, or null. @param {any} e */
const rowOf = (e) => (e && typeof e.type === 'string' && Number.isInteger(e.param) ? { type: e.type, param: e.param } : null);

/**
 * A SPEC READ AND CHECKED: `{ template, group?, material?, condition?, weight?, value?, name?, enchantments?: [{ type,
 * param }], sideEffects?, special?, tier?, flavour?, bound? }` (special effects as specialOf reads them). An absent field
 * keeps what the producer mints. Answers `{ spec }` or `{ error }`: 'toybox-template' (no wearable template, or a group
 * it does not stand in), 'toybox-material', 'toybox-field' (a number or a name out of bounds), 'toybox-enchant' (a row
 * no power or side effect of the catalogue's, or too many), 'toybox-special' (an effect the piece cannot carry).
 * @param {any} raw
 */
export function toyboxSpecOf(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'toybox-template' };
  const template = raw.template;
  if (!Number.isInteger(template) || !lawTemplate(template)) return { error: 'toybox-template' };
  const groups = templateGroups(template).filter((candidate) => sectionOf(template, candidate));
  const group = raw.group === undefined || raw.group === null ? groups[0] : raw.group;
  if (!group || !groups.includes(group)) return { error: 'toybox-template' };
  const mats = materialsOf(group);
  let material;
  if (raw.material !== undefined && raw.material !== null) {
    if (!mats || !mats.some(([value]) => value === raw.material)) return { error: 'toybox-material' };
    material = raw.material;
  } else material = mats ? mats[0][0] : undefined;
  /** @type {any} */
  const spec = { template, group, ...(material !== undefined ? { material } : {}) };
  if (raw.condition != null) {
    if (!intIn(raw.condition, 0, GOLD_INT_MAX)) return { error: 'toybox-field' };
    spec.condition = raw.condition;
  }
  if (raw.weight != null) {
    if (typeof raw.weight !== 'number' || !Number.isFinite(raw.weight) || raw.weight < 0 || raw.weight > TOYBOX_WEIGHT_MAX)
      return { error: 'toybox-field' };
    spec.weight = Math.round(raw.weight * 100) / 100;
  }
  if (raw.value != null) {
    if (!intIn(raw.value, 0, GOLD_INT_MAX)) return { error: 'toybox-field' };
    spec.value = raw.value;
  }
  if (raw.name != null) {
    const name = typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim() : '';
    if (!name || name.length > TOYBOX_NAME_MAX) return { error: 'toybox-field' };
    spec.name = name;
  }
  if (raw.bound != null && typeof raw.bound !== 'boolean') return { error: 'toybox-field' };
  if (raw.bound === true) spec.bound = true;
  for (const [k, ok] of /** @type {const} */ ([
    ['enchantments', isPower],
    ['sideEffects', isSideEffect],
  ])) {
    const list = raw[k] == null ? [] : raw[k];
    if (!Array.isArray(list) || list.length > TOYBOX_ROWS_MAX) return { error: 'toybox-enchant' };
    const rows = list.map(rowOf);
    if (rows.some((row) => !row || !ok(row.type) || !enchantmentParamValues(row.type).includes(row.param)))
      return { error: 'toybox-enchant' };
    spec[k] = rows;
  }
  const special = specialOf({ group, templateIndex: template }, raw);
  if ('error' in special) return special;
  Object.assign(spec, special);
  return { spec };
}

/** The item maker's rows for a spec's choices, forced rows with them, or null when a bound soul finds no room.
 *  @param {{ type: string, param: number }[]} enchantments @param {{ type: string, param: number }[]} sideEffects */
function makerRows(enchantments, sideEffects) {
  /** @type {any[]} */
  const powers = [];
  /** @type {any[]} */
  const sides = [];
  for (const [list, own] of /** @type {const} */ ([
    [enchantments, powers],
    [sideEffects, sides],
  ])) {
    for (const e of list) {
      const pick = pickEnchantment(e.type, e.param, { powers, sideEffects: sides });
      if (!pick || pick.kind !== 'add') return null;
      own.push(pick.settings);
      powers.push(...pick.powers);
      sides.push(...pick.sideEffects);
    }
  }
  return { powers, sides };
}

/**
 * THE PIECE A SPEC MAKES: `{ item, findings, baseFindings, cost, power }` - `findings` the item law's (online, any
 * refuses the grant), `baseFindings` its findings on the piece made without its special effects (offline, any refuses
 * it), `cost` its chosen enchantments' against the item's `power` - or `{ error }` (toyboxSpecOf's words). `rand` mints
 * a valuable piece's ledger id, as the staff gift does.
 * @param {any} raw @param {{ rand?: (b: Uint8Array<ArrayBuffer>) => Uint8Array }} [o]
 */
export function buildToyboxItem(raw, { rand = undefined } = {}) {
  const read = toyboxSpecOf(raw);
  if (!('spec' in read)) return read;
  const spec = read.spec;
  const made = makeItem(spec, rand);
  if ('error' in made) return made;
  const base = spec.special.length ? makeItem({ ...spec, special: [] }, undefined) : made;
  const baseFindings = 'error' in base ? made.findings : base.findings;
  return { ...made, baseFindings };
}

/** The piece a checked spec makes, and the law's findings on it. @param {any} spec @param {any} rand */
function makeItem(spec, rand) {
  const piece = { group: spec.group, templateIndex: spec.template };
  /** @type {any} */
  let item = mintSpecialRecord(piece, spec.special);
  if (item) item.isIdentified = true;
  else if (spec.group === 'Weapons') item = weaponOfMaterial(spec.template, spec.material);
  else if (spec.group === 'Armor') item = armorOfMaterial(spec.template, spec.material);
  else item = mintCondition(setItemFields({ group: spec.group, templateIndex: spec.template }));
  const power = itemEnchantmentPower(item, lawTemplate);
  const rows = makerRows(spec.enchantments, spec.sideEffects);
  if (!rows) return { error: 'toybox-enchant' };
  const all = [...rows.powers, ...rows.sides];
  if (all.length > TOYBOX_ROWS_MAX) return { error: 'toybox-enchant' };
  if (all.length) applyEnchantments(item, all);
  laySpecial(item, piece, spec);
  if (spec.name !== undefined) item.name = spec.name;
  if (spec.value !== undefined) item.value = spec.value;
  if (spec.weight !== undefined) item.weightInKg = spec.weight;
  if (spec.condition !== undefined) item.currentCondition = Math.min(spec.condition, item.maxCondition ?? 0);
  if (spec.bound) item.bound = true;
  if (valuablePiece(item)) item.uid = mintItemId(rand);
  return { item, findings: itemFindings(item), cost: totalEnchantmentCost(rows.powers, rows.sides), power };
}

/**
 * WHICH SPECIAL EFFECTS THE LAW REFUSES ONLINE, one word a spec's entry: true where the piece made without it is spared
 * a finding the piece made with it has. Every entry false for a piece the law takes, or a spec that makes none.
 * @param {any} raw @returns {boolean[]}
 */
export function toyboxSpecialRefused(raw) {
  const read = toyboxSpecOf(raw);
  if (!('spec' in read)) return [];
  const spec = read.spec;
  const made = makeItem(spec, undefined);
  if ('error' in made || !made.findings.length) return spec.special.map(() => false);
  return spec.special.map((/** @type {any} */ _, /** @type {number} */ i) => {
    const without = makeItem({ ...spec, special: spec.special.filter((/** @type {any} */ _entry, /** @type {number} */ k) => k !== i) }, undefined);
    return !('error' in without) && made.findings.some((/** @type {string} */ code) => !without.findings.includes(code));
  });
}

/** One choice as the window lists it: an effect's name and the settings it may take now. */
function choiceOf(/** @type {string} */ type, /** @type {any} */ pick) {
  const params =
    pick?.kind === 'add'
      ? [{ param: pick.settings.param, label: enchantmentParamName(type, pick.settings.param) }]
      : (pick?.options ?? []).map((/** @type {any} */ option) => ({ param: option.param, label: option.label }));
  return { type, name: enchantmentName(type), params };
}

/**
 * WHAT THE ADD BUTTON LISTS for a piece: every power (`selectingPowers`) or side effect the item maker would offer it,
 * given the rows already chosen - `[{ type, name, params: [{ param, label }] }]`. An item the producers cannot make lists
 * nothing. @param {any} raw the spec @param {boolean} selectingPowers
 */
export function toyboxEnchantChoices(raw, selectingPowers) {
  const read = toyboxSpecOf({ ...raw, enchantments: [], sideEffects: [] });
  if (!('spec' in read)) return [];
  const item = { group: read.spec.group, templateIndex: read.spec.template };
  const powers = (raw?.enchantments ?? []).map(rowOf).filter(Boolean);
  const sideEffects = (raw?.sideEffects ?? []).map(rowOf).filter(Boolean);
  return primaryPickerList(selectingPowers, { item, powers, sideEffects }).map((type) =>
    choiceOf(type, primaryPick(type, { powers, sideEffects, selectingPowers })),
  );
}

/**
 * THE SETTINGS ONE CHOSEN ROW MAY CHANGE TO: its own, and every other the item maker offers beside the other rows.
 * @param {any} raw the spec @param {boolean} power whether the row is a power @param {number} at its place in its list
 * @returns {{ param: number, label: string }[]}
 */
export function toyboxParamChoices(raw, power, at) {
  const list = (power ? raw?.enchantments : raw?.sideEffects) ?? [];
  const row = rowOf(list[at]);
  if (!row) return [];
  const others = list.filter((/** @type {any} */ _entry, /** @type {number} */ i) => i !== at).map(rowOf).filter(Boolean);
  const powers = power ? others : (raw?.enchantments ?? []).map(rowOf).filter(Boolean);
  const sideEffects = power ? (raw?.sideEffects ?? []).map(rowOf).filter(Boolean) : others;
  const params = choiceOf(row.type, primaryPick(row.type, { powers, sideEffects, selectingPowers: power })).params;
  if (!params.some((choice) => choice.param === row.param))
    params.unshift({ param: row.param, label: enchantmentParamName(row.type, row.param) });
  return params;
}
