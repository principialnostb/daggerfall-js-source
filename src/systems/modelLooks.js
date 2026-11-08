import { noteModelDyePlayer } from './modelDye.js';
import { itemAppearanceKey } from './item/itemAppearanceKey.js';
// MODEL-LOOKS (BLOODBATH, 2026-11-08; bible/10-UI/Enhanced-Mod-Compatibility.md "3D looks"): THE 3D LOOK OF A PIECE ON
// THE PLAYER'S OWN BODY - the Morrowind record it is drawn as, chosen in the item card's 3D tab. Independent of the 2D
// card look (systems/paperdollLooks.js). Local only: it never changes the item, never rides the wire (net/remotePlayers.js
// composeLook reads the equip table, not this), and the resolvers answer it only for a piece the player holds - a peer or
// a townsperson in the same cuirass keeps its own (systems/modelLookSource.js).
//
// What a piece may be drawn as (the owner, 2026-11-08: "не ограничиваться сетом из скайрима и шлемами - на всю броню из
// своего семейства, оружие и одежду"):
// - armour 102-112: every Morrowind record of the same piece in its family's weight class (formats/morrowind/mwItemMap.js
//   armorWeightOf: leather -> light, chain -> medium, plate -> heavy), a pair (gauntlets) only when both sides exist;
// - clothing: every garment of the same Morrowind type (shirt, pants, shoes, skirt, robe); a cloak stays the port's own;
// - a weapon: every record of the same Morrowind weapon type (formats/morrowind/mwFirstPerson.js dfWeaponToMw), so its
//   animations and grip are the piece's own.
// Unenchanted records only; two records that draw the same mesh are one choice, and the one the resolver already picks
// is "Original". The port's own looks (the Skyrim set, the steel helm's styles, the shields, the wolf pelts) stay their
// own switches (systems/lookVariants.js); a chosen record stands over them.
import { getPref, setPref } from './uiPrefs.js';
import { equipTableOf } from './equip.js';
import { drawnPiece } from '../net/appearanceLaw.js';
import { setModelLookSource } from './modelLookSource.js';
import { armorRowOf, armorWeightOf, armorWeightOfMaterial, armorStemOf, armorSideOf, armorLookRecords, mwArmorRecords, mwClothingRecord, DF_CLOTHING_ROWS, CLOTHING_NAME, WEREWOLF_ROBE_ID } from '../formats/morrowind/mwItemMap.js';
import { dfWeaponToMw, pickWeaponRecord, dfWeaponShape, MW_WEAPON_TYPE } from '../formats/morrowind/mwFirstPerson.js';
import { WEAPONS } from '../characters/weapons.js';
import { materialName } from './item/itemInfo.js';

export const MODEL_LOOKS_PREF = 'mwRecordLooks';
const CLASSIC_ARMOR = new Set([102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112]);
const AMMO_TYPES = new Set([MW_WEAPON_TYPE.Arrow, MW_WEAPON_TYPE.Bolt, MW_WEAPON_TYPE.MarksmanThrown].filter((x) => x !== undefined));

/** The player whose pieces may wear a look - noted where the player's body is built (combat/weapon/weaponRig.js). */
let _player = null;
export function noteModelLookPlayer(entity) { if (entity) { _player = entity; noteModelDyePlayer(entity); } }

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
  if (piece.artifact) return [];
  const out = [];
  const seen = new Set();
  const names = new Set();
  const offer = (id, label, models, records) => {
    const print = models.slice().sort().join('|');
    // the same mesh twice, or the same name twice (a quest's copy of a set piece - "Ebony Closed Helm" and its guild's),
    // is one choice
    if (!print || seen.has(print) || names.has(label)) return;
    seen.add(print); names.add(label);
    out.push({ id, label, models, records });
  };
  if (piece.group === 'Armor' && CLASSIC_ARMOR.has(piece.templateIndex)) {
    const row = armorRowOf(piece.templateIndex);
    const weight = armorWeightOfMaterial(piece.material ?? 0);
    if (!row || !weight) return [];
    const own = mwArmorRecords(catalog.armors, piece.templateIndex, piece.material ?? 0).records;
    seen.add(own.map((r) => r.model).sort().join('|'));   // the resolver's own pick is "Original"
    if (own[0]) names.add(labelOf(own[0]).replace(/(left|right)/gi, '').replace(/\s+/g, ' ').trim());
    const stems = new Set();
    for (const r of (catalog.armors ?? []).slice().sort(byId)) {
      const id = String(r.id || '').toLowerCase();
      if (r.enchanted || armorWeightOf(id) !== weight) continue;
      if (!row.tokens.some((t) => id.includes(t)) || (row.not ?? []).some((n) => id.includes(n))) continue;
      if (row.sides && !armorSideOf(id)) continue;
      stems.add(armorStemOf(id));
    }
    for (const stem of stems) {
      const recs = armorLookRecords(catalog.armors, row, stem);
      if (!recs.length) continue;
      const isShield = piece.templateIndex >= 109;
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
    if (own) { seen.add(own.model); names.add(labelOf(own)); }
    for (const w of (catalog.weapons ?? []).filter((x) => x.type === type && !x.enchanted && x.model && !/^vfx_/.test(x.id)).sort(byId)) offer(w.id, labelOf(w), [w.model], [w]);
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
/** The resolver's own record AS A CHOICE: { id, label, records } or null. The owner, 2026-11-08 ("какие-то вариации
 *  вещей потерялись - как минимум вот такой шлем"): a piece the port draws with a model of its own (the steel helm's
 *  styles, the steel plate) never shows the Morrowind record it stands over, and the 3D tab, which led with "Original"
 *  only when no own look did, offered it nowhere - so it is offered beside the own looks, chosen like any record. */
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
  return 'clothing';
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
