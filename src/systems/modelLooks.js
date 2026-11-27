import { enhancedAxeRecord } from '../characters/ownModels/enhancedBattleaxe.js';
import { itemAppearanceKey } from './item/itemAppearanceKey.js';
// Choose the 3D equipment record shown on the player's model independently of the 2D inventory appearance.
import { getPref, setPref } from './uiPrefs.js';
import { equipTableOf } from './equip.js';
import { customItemClass, rriNativeMaterialValue } from './roleplayRealismItems/rriItems.js';
import { familyOfNative } from './armorMaterials.js';
import { drawnPiece } from '../net/appearanceLaw.js';
import { setModelLookSource } from './modelLookSource.js';
import { armorRowOf, armorWeightOf, armorWeightOfMaterial, armorStemOf, armorSideOf, armorLookRecords, mwArmorRecords, mwClothingRecord, DF_CLOTHING_ROWS, CLOTHING_NAME, WEREWOLF_ROBE_ID } from '../formats/morrowind/mwItemMap.js';
import { dfWeaponToMw, pickWeaponRecord, dfWeaponShape, MW_WEAPON_TYPE } from '../formats/morrowind/mwFirstPerson.js';
import { WEAPONS } from '../characters/weapons.js';
import { materialName } from './item/itemInfo.js';

export const MODEL_LOOKS_PREF = 'mwRecordLooks';
const AMMO_TYPES = new Set([MW_WEAPON_TYPE.Arrow, MW_WEAPON_TYPE.Bolt, MW_WEAPON_TYPE.MarksmanThrown].filter((x) => x !== undefined));

/** The player whose pieces may wear a look - noted where the player's body is built (combat/weapon/weaponRig.js). */
let _player = null;
export function noteModelLookPlayer(entity) { if (entity) _player = entity; }

/** Whether a piece is the player's own: worn, carried, or the Wardrobe's drawn copy of one worn. */
export function isPlayersOwn(item) {
  if (!item || !_player) return false;
  let slots = null;
  try { slots = equipTableOf(_player); } catch { slots = null; }
  if (Array.isArray(slots) && slots.some((s) => s && (s === item || drawnPiece(s) === item))) return true;
  return Array.isArray(_player.items) && _player.items.includes(item);
}

const keyOf = (item, create = false) => { const p = drawnPiece(item), id = itemAppearanceKey(item, create); return id ? `${id}|${p.templateIndex}:${p.material ?? 0}` : null; };
/** Whether 3D customization is switched on (the EMC catalog's switch). */
export const modelCustomizationOn = () => getPref('modelCustomization') === true;

/** The record id the player chose for this piece, or null. Not checked against the archives: a resolver that does not
 *  hold it draws the piece as it always would. */
export function modelLookOf(item) {
  if (!modelCustomizationOn() || !item) return null;
  const key = keyOf(item);
  if (!key) return null;
  const id = getPref(MODEL_LOOKS_PREF)?.[key];
  return typeof id === 'string' && id ? id : null;
}

/** Choose a record (a choice's id) or null for the resolver's own. False when nothing changed. */
export function setModelLook(item, id) {
  if (!item) return false;
  const want = typeof id === 'string' && id ? id : null;
  const key = keyOf(item, true);
  if ((getPref(MODEL_LOOKS_PREF)?.[key] ?? null) === want) return false;
  const looks = { ...(getPref(MODEL_LOOKS_PREF) ?? {}) };
  if (want) looks[key] = want; else delete looks[key];
  setPref(MODEL_LOOKS_PREF, looks);
  return true;
}

/** Forget every 3D look (the 3D customization switch turned off). */
export const clearModelLooks = () => setPref(MODEL_LOOKS_PREF, {});

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const labelOf = (r) => (r.name && String(r.name).trim()) || r.id;

/**
 * Every record the piece may be drawn as besides its own, without duplicates: [{ id, label, models }].
 * @param {any} item a piece (its group, template, material, dye)
 * @param {{ armors?: any[], clothes?: any[], weapons?: any[] } | null} catalog the rig's records (fpArm modelCatalog)
 */
export function modelLookChoices(item, catalog) {
  if (!item || !catalog) return [];
  const piece = drawnPiece(item);
  if (piece.artifact && piece.group !== 'Armor') return [];
  const out = [];
  const seen = new Set();
  const offer = (id, label, models, records) => {
    const print = models.slice().sort().join('|');
    // Records with the same display name can still use distinct meshes.
    if (!print || seen.has(print)) return;
    seen.add(print);
    out.push({ id, label, models, records });
  };
  if (piece.group === 'Armor') {
    const row = armorRowOf(piece.templateIndex);
    const weight = customItemClass(piece.templateIndex)?.group === 'Armor'
      ? ['light', 'medium', 'heavy'][familyOfNative(rriNativeMaterialValue(piece))]
      : armorWeightOfMaterial(piece.material ?? 0);
    if (!row || !weight) return [];
    const own = mwArmorRecords(catalog.armors, piece.templateIndex, piece.material ?? 0).records;
    seen.add(own.map((r) => r.model).sort().join('|'));   // the resolver's own pick is "Original"
    const stems = new Set();
    for (const r of (catalog.armors ?? []).slice().sort(byId)) {
      const id = String(r.id || '').toLowerCase();
      if (armorWeightOf(id) !== weight) continue;
      if (!row.tokens.some((t) => id.includes(t)) || (row.not ?? []).some((n) => id.includes(n))) continue;
      if (row.sides && !armorSideOf(id)) continue;
      stems.add(armorStemOf(id));
    }
    for (const stem of stems) {
      const recs = armorLookRecords(catalog.armors, row, stem);
      if (!recs.length) continue;
      const isShield = modelLookKind(piece) === 'shield';
      if (!isShield && !recs.every((r) => r.parts?.length)) continue;   // a worn piece needs body parts to dress
      offer(stem, labelOf(recs[0]).replace(/\b(left|right)\b/gi, '').replace(/\s+/g, ' ').trim(), recs.map((r) => r.model), recs);
    }
    return numberRepeats(out);
  }
  if (piece.group === 'MensClothing' || piece.group === 'WomensClothing') {
    const name = CLOTHING_NAME[piece.templateIndex];
    const row = DF_CLOTHING_ROWS[name];
    if (!row || /cloak/i.test(name)) return [];   // a cloak is the port's own model (ownClothingModels.js)
    const own = mwClothingRecord(catalog.clothes, name, { dye: piece.dye ?? 0 }).record;
    if (own) seen.add(clothingPrint(own));
    for (const c of (catalog.clothes ?? []).filter((x) => x.type === row.type && !x.enchanted && x.model && x.id !== WEREWOLF_ROBE_ID).sort(byId)) {
      const print = clothingPrint(c);
      if (seen.has(print)) continue;
      seen.add(print);
      out.push({ id: c.id, label: labelOf(c), models: [c.model], records: [c] });
    }
    return numberRepeats(out);
  }
  if (piece.group === 'Weapons') {
    const type = dfWeaponToMw(piece, WEAPONS);
    if (type === MW_WEAPON_TYPE.None || AMMO_TYPES.has(type)) return [];
    const own = pickWeaponRecord(catalog.weapons, type, materialName(piece), { shape: dfWeaponShape(piece, WEAPONS) });
    if (own) seen.add(enhancedAxeRecord(own).model);
    for (const w of (catalog.weapons ?? []).filter((x) => x.type === type && !x.enchanted && x.model && !/^vfx_/.test(x.id)).sort(byId)) offer(w.id, labelOf(w), [enhancedAxeRecord(w).model], [enhancedAxeRecord(w)]);
    return numberRepeats(out);
  }
  return [];
}
/** The records the resolver draws the piece as by itself - "Original"'s picture. */
export function modelLookOwnRecords(item, catalog) {
  if (!item || !catalog) return [];
  const piece = drawnPiece(item);
  if (piece.group === 'Armor') return mwArmorRecords(catalog.armors, piece.templateIndex, piece.material ?? 0).records;
  if (piece.group === 'MensClothing' || piece.group === 'WomensClothing') {
    const r = mwClothingRecord(catalog.clothes, CLOTHING_NAME[piece.templateIndex], { dye: piece.dye ?? 0 }).record;
    return r ? [r] : [];
  }
  if (piece.group === 'Weapons') {
    const type = dfWeaponToMw(piece, WEAPONS);
    const r = type === MW_WEAPON_TYPE.None ? null : pickWeaponRecord(catalog.weapons, type, materialName(piece), { shape: dfWeaponShape(piece, WEAPONS) });
    return r ? [r] : [];
  }
  return [];
}
/** Include the record resolved by the normal equipment path so the original model remains a selectable look. */
export function modelLookOwnChoice(item, catalog) {
  const recs = modelLookOwnRecords(item, catalog);
  if (!recs.length) return null;
  const p = drawnPiece(item);
  const id = p.group === 'Armor' ? armorStemOf(recs[0].id) : recs[0].id;
  return { id, label: labelOf(recs[0]).replace(/(left|right)/gi, '').replace(/\s+/g, ' ').trim(), records: recs };
}

/** The picture kind of a piece for render/mwLookThumb.js. */
export function modelLookKind(item) {
  const p = drawnPiece(item);
  if (p.group === 'Weapons') return 'weapon';
  if (p.group === 'Armor') return p.templateIndex >= 109 && p.templateIndex <= 112 ? 'shield' : 'armor';
  return p.group === 'MensClothing' || p.group === 'WomensClothing' ? 'clothing' : null;
}

/** Two choices of one name (Morrowind's twelve "Common Pants", one a colour) are told apart by a number. */
function numberRepeats(list) {
  const count = new Map();
  for (const c of list) count.set(c.label, (count.get(c.label) ?? 0) + 1);
  const at = new Map();
  return list.map((c) => {
    if (count.get(c.label) < 2) return c;
    const n = (at.get(c.label) ?? 0) + 1;
    at.set(c.label, n);
    return { ...c, label: `${c.label} ${n}` };
  });
}
/** A garment is what its body parts draw (its ground mesh only when it names none). */
function clothingPrint(c) {
  const parts = (c.parts ?? []).map((p) => `${p.part}:${p.male ?? ''}:${p.female ?? ''}`).sort().join(',');
  return parts || c.model;
}

// The resolvers read the look through the leaf door - for the player's own pieces alone.
setModelLookSource((item) => { const id = modelLookOf(item); return id && isPlayersOwn(item) ? id : null; });   // the cheap ask first
