import { itemAppearanceKey } from './item/itemAppearanceKey.js';
import { clothingDisplayTemplate } from './item/clothingDisplay.js';
import { ITEM_TEMPLATES } from './item/itemTemplates.js';
// PAPERDOLL-LOOKS (BLOODBATH, 2026-11-08; bible/10-UI/Enhanced-Mod-Compatibility.md "2D card looks"): THE 2D LOOK OF A
// PIECE ON THE PLAYER'S OWN INVENTORY CARD - the paperdoll figure and the piece's icon in the player's lists. Local and
// cosmetic only: it never changes item.variant or item.templateIndex (shared with gameplay, the Wardrobe, 3D imports and
// the wire), never reaches a peer, and is not the Wardrobe's look (net/appearanceLaw.js), which is drawn first - a
// piece wearing a Wardrobe look is customised as the piece it is drawn as.
//
// DEPARTURE from DFU: Daggerfall Unity draws a piece's own record only (ItemHelper.GetItemImage); this picks another of
// the game's own records for it. Paperdoll Enhanced replaces the same records (it adds none), so the same choice works
// with the mod and without it.
//
// What a piece may wear:
// - armour 102-108: its template's styles inside its OWN material family (armorMaterials.js clampArmorVariant - the
//   owner's choice, 2026-11-08: "только своего материала"); a helm keeps its six;
// - clothing with styles: any of its template's styles;
// - weapons and shields: the record of another template of the same class and hands (PAPERDOLL_CLASSES below), so the
//   doll's either-hand record law still holds for the drawn picture.
// Choices that resolve to the same record as the piece's own, or as an earlier choice, are dropped: no duplicates.
import { getPref, setPref } from './uiPrefs.js';
import { getTemplate } from '../characters/paperdoll/paperdoll.js';
import { resolvePaperdollRecord } from '../characters/paperdoll/paperdollArt.js';
import { clampArmorVariant } from './armorMaterials.js';
import { getItemHands } from './equip.js';
import { drawnPiece } from '../net/appearanceLaw.js';
import { setPaperdollLookSource } from './paperdollLookSource.js';
import { hoodCapable, hoodUp } from './survival/temperature.js';   // HOOD-LOOKS: the one hood law (cloakState)
import { CLOTHING_DYES } from '../characters/dyes.js';   // GARMENT-DYES: the ten cloth dyes

export const PAPERDOLL_LOOKS_PREF = 'paperdollLooks';
/** The helmet-only store this module grew from; read for helms that have no entry in the new one. */
export const LEGACY_HELMET_PREF = 'helmetPaperdollLooks';

const ARMOR_TEMPLATES = new Set([102, 103, 104, 105, 106, 107, 108]);
const CLOTHING_GROUPS = new Set(['MensClothing', 'WomensClothing']);
/** A weapon's or shield's 2D class. The hands are read live (equip.js getItemHands) and join the class in the key. */
export const PAPERDOLL_CLASSES = Object.freeze({
  109: 'shield', 110: 'shield', 111: 'shield', 112: 'shield',
  113: 'blade', 114: 'blade', 116: 'blade', 117: 'blade', 118: 'blade', 119: 'blade', 120: 'blade', 121: 'blade',
  122: 'blade', 123: 'blade',
  115: 'hafted', 124: 'hafted', 125: 'hafted', 126: 'hafted', 127: 'hafted', 128: 'hafted',
  129: 'bow', 130: 'bow',
});

/** GARMENT-KINDS (BLOODBATH, 2026-11-08, the owner: "нет смысла ограничивать по цвету и форме вещи ... подобрать хотя бы
 *  где футболка где полное облачение"): A GARMENT'S 2D KIND, by what it covers. A garment may be drawn as any style of any
 *  garment of its kind on its own body's sheet (Daggerfall's men's 141-181 on archive 239, women's 182-216 on 235), its
 *  dye kept. Paperdoll Enhanced adds no record to choose (it repaints the same 111 clothing and 37 armour records, by dye
 *  and metal, women's archives alone - measured 2026-11-08), so the kinds are what widen the choice. */
export const GARMENT_KINDS = Object.freeze({
  top: ['Straps', 'Challenger Straps', 'Champion Straps', 'Armbands', 'Fancy Armbands', 'Eodoric', 'Formal Eodoric', 'Short Tunic',
    'Formal Tunic', 'Reversible Tunic', 'Open Tunic', 'Short Shirt', 'Long Shirt', 'Vest', 'Brassiere', 'Formal Brassiere', 'Peasant Blouse'],
  full: ['Kimono', 'Toga', 'Dwynnen Surcoat', 'Anticlere Surcoat', 'Plain Robes', 'Priest Robes', 'Priestess Robes', 'Evening Gown',
    'Day Gown', 'Casual Dress', 'Strapless Dress', 'Khajiit Suit'],
  legs: ['Casual Pants', 'Breeches', 'Loincloth', 'Tights', 'Short Skirt', 'Long Skirt', 'Wrap'],
  feet: ['Shoes', 'Sandals', 'Boots', 'Tall Boots'],
  cloak: ['Casual Cloak', 'Formal Cloak'],
  sash: ['Sash'],
});
const KIND_OF_NAME = new Map(Object.entries(GARMENT_KINDS).flatMap(([kind, names]) => names.map((n) => [n, kind])));
const CLOTHING_TEMPLATES = Array.from({ length: 216 - 141 + 1 }, (_, i) => 141 + i);
/** A garment template's kind, or null. */
export const garmentKindOf = (templateIndex) => KIND_OF_NAME.get(getTemplate(templateIndex)?.name) ?? null;
/** The garments of a kind drawn on the same sheet as this one, own first. */
const garmentsLike = (piece) => {
  const kind = garmentKindOf(piece.templateIndex), sheet = getTemplate(piece.templateIndex)?.playerTextureArchive;
  return kind ? [piece.templateIndex, ...CLOTHING_TEMPLATES.filter((x) => x !== piece.templateIndex && garmentKindOf(x) === kind && getTemplate(x)?.playerTextureArchive === sheet)] : [];
};
const stylesOf = (t) => Math.max(1, getTemplate(t)?.variants ?? 0);

const groupOf = (t) => (t >= 109 && t <= 112 ? 'Armor' : 'Weapons');
const classKey = (t) => `${PAPERDOLL_CLASSES[t]}:${getItemHands({ group: groupOf(t), templateIndex: t })}`;
// HOOD-LOOKS (BLOODBATH, 2026-11-08, the owner: "учитывался какой плащ поднят капюшон или нет ... а то там щас всё
// вперемешку"): a cloak's and plain robes' styles are hood-up and hood-down pictures (temperature.js
// HOODED_CLOAK_VARIANTS, HOODED_ROBES' variant 1). A garment that carries a hood is offered only the styles drawn as it is
// worn now, and keeps one choice for each - raising the hood shows the hood-up choice, lowering it the other.
const hoodKey = (piece) => (hoodCapable(piece) ? (hoodUp(piece) ? ':hood' : ':bare') : '');
const storeKey = (item, create = false) => {
  const id = itemAppearanceKey(item, create), piece = drawnPiece(item);
  return id ? `${id}|${piece.templateIndex}:${piece.material ?? 0}${hoodKey(piece)}` : null;
};

/** How a piece is customised: 'variant' (a style of its own template), 'template' (another template's record) or null. */
export function paperdollLookMode(item) {
  if (!item || typeof item !== 'object') return null;
  const piece = drawnPiece(item);
  if (piece.artifact || piece.rarity === 'gilded') return null;   // their own art is the point of them
  const t = getTemplate(piece.templateIndex);
  if (!t) return null;
  if (piece.group === 'Armor' && ARMOR_TEMPLATES.has(piece.templateIndex)) return (t.variants ?? 0) > 1 ? 'variant' : null;
  if (CLOTHING_GROUPS.has(piece.group)) return garmentsLike(piece).reduce((n, x) => n + stylesOf(x), 0) > 1 ? 'garment' : null;
  if (Object.hasOwn(PAPERDOLL_CLASSES, piece.templateIndex) && piece.group === groupOf(piece.templateIndex)) return 'template';
  return null;
}

/** The style a variant-mode piece draws by default (its own, through SetVariant's clamp for armour). */
function naturalVariant(piece, t) {
  const n = t.variants ?? 0;
  if (piece.group === 'Armor') return clampArmorVariant(piece.templateIndex, piece.material ?? 0, piece.variant ?? 0);
  return Math.max(0, Math.min(piece.variant ?? 0, n - 1));
}

/** A drawable choice's identity: two choices with one identity draw the same record. */
const drawnIdentity = (piece, look) => {
  if (CLOTHING_GROUPS.has(piece.group)) {   // a garment is the record it draws on its sheet
    const tpl = getTemplate(look.t ?? piece.templateIndex);
    return `g${tpl?.playerTextureArchive}:${resolvePaperdollRecord(tpl, Math.min(look.v ?? 0, Math.max(0, (tpl?.variants ?? 0) - 1)))}`;
  }
  if (look.v !== undefined) {
    return `v${piece.group === 'Armor' ? clampArmorVariant(piece.templateIndex, piece.material ?? 0, look.v) : look.v}`;
  }
  return `t${getTemplate(look.t)?.playerTextureRecord}:${look.t}`;
};

/** Every look the piece may wear besides its own, in order, without duplicates: `{ v }` (a style of its own),
 *  `{ t }` (another weapon's or shield's record) or `{ t, v }` (a style of another garment of its kind). */
export function paperdollLookChoices(item, identity = undefined) {
  const mode = paperdollLookMode(item);
  if (!mode) return [];
  const original = drawnPiece(item);
  const display = clothingDisplayTemplate(getTemplate(original.templateIndex), identity?.gender, ITEM_TEMPLATES);
  const piece = display && CLOTHING_GROUPS.has(original.group) ? { ...original, templateIndex: display.index } : original;
  const t = getTemplate(piece.templateIndex);
  const seen = new Set();
  const out = [];
  const own = mode === 'template' ? { t: piece.templateIndex } : { v: naturalVariant(piece, t) };
  seen.add(drawnIdentity(piece, own));
  const hooded = hoodUp(piece);   // HOOD-LOOKS: a style drawn hood up only while the hood is up, never on a garment that has none
  const candidates = mode === 'variant'
    ? Array.from({ length: t.variants }, (_, v) => ({ v }))
    : mode === 'garment'
      ? garmentsLike(piece).flatMap((x) => Array.from({ length: stylesOf(x) }, (_, v) => (x === piece.templateIndex ? { v } : { t: x, v })))
        .filter((l) => hoodUp({ ...piece, templateIndex: l.t ?? piece.templateIndex, variant: l.v }) === hooded)
      : Object.keys(PAPERDOLL_CLASSES).map(Number).filter((x) => classKey(x) === classKey(piece.templateIndex)).map((x) => ({ t: x }));
  for (const look of candidates) {
    const id = drawnIdentity(piece, look);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(piece.templateIndex !== original.templateIndex && look.t === undefined ? { t: piece.templateIndex, ...look } : look);
  }
  return out;
}

const allBodyChoices = (item) => [...paperdollLookChoices(item), ...paperdollLookChoices(item, { gender: 'male' }), ...paperdollLookChoices(item, { gender: 'female' })];
const sameLook = (a, b) => !!a && !!b && a.v === b.v && a.t === b.t;
const validLook = (raw) => !!raw && typeof raw === 'object' && (Number.isInteger(raw.v) || Number.isInteger(raw.t));
const storedLook = (look) => (look.t !== undefined && look.v !== undefined ? { t: look.t, v: look.v } : look.v !== undefined ? { v: look.v } : { t: look.t });
/** GARMENT-DYES (BLOODBATH, 2026-11-08, the owner: "лишь 1 цвет представлен"): a garment's 2D colour is chosen apart from
 *  its shape - one of Daggerfall's ten cloth dyes, kept beside the shape in the same entry (`d`). Paperdoll Enhanced paints
 *  every record in every one of them, so its pictures follow too. */
const validDye = (d) => Number.isInteger(d) && CLOTHING_DYES.includes(d);
const shapeOf = (look) => (look && (look.t !== undefined || look.v !== undefined) ? look : null);

/** Whether paperdoll customization is switched on (the EMC catalog's switch). */
export const paperdollCustomizationOn = () => getPref('paperdollCustomization') !== false;

/** The look the player chose for this piece, still one of its choices, or null (its own). */
export function paperdollLookOf(item) {
  if (!paperdollCustomizationOn()) return null;
  const mode = paperdollLookMode(item);
  if (!mode) return null;
  const piece = drawnPiece(item);
  const key = storeKey(item);
  if (!key) return null;
  let raw = getPref(PAPERDOLL_LOOKS_PREF)?.[key];
  if (!raw || typeof raw !== 'object') return null;
  const shape = validLook(raw) ? allBodyChoices(item).find((c) => sameLook(c, raw)) ?? null : null;
  const dye = CLOTHING_GROUPS.has(piece.group) && validDye(raw.d) ? raw.d : null;
  if (dye === null) return shape;
  return { ...(shape ?? {}), d: dye };
}

/** The dye a garment is drawn in on the card: the chosen one, else its own (null for no garment). */
export function paperdollDyeOf(item) {
  const piece = item ? drawnPiece(item) : null;
  if (!piece || !CLOTHING_GROUPS.has(piece.group)) return null;
  const d = paperdollLookOf(item)?.d;
  return validDye(d) ? d : Number.isInteger(piece.dye) ? piece.dye : Number.isInteger(piece.dyeColor) ? piece.dyeColor : 0;
}

/** Choose a garment's 2D dye (one of the ten) or null for its own; its chosen shape is kept. False when nothing changed. */
export function setPaperdollDye(item, d) {
  const piece = item ? drawnPiece(item) : null;
  if (!piece || !CLOTHING_GROUPS.has(piece.group) || !paperdollCustomizationOn()) return false;
  const own = Number.isInteger(piece.dye) ? piece.dye : Number.isInteger(piece.dyeColor) ? piece.dyeColor : 0;
  const want = d === null || d === own ? null : d;
  if (want !== null && !validDye(want)) return false;
  const key = storeKey(item, true);
  const looks = { ...(getPref(PAPERDOLL_LOOKS_PREF) ?? {}) };
  const raw = looks[key] && typeof looks[key] === 'object' ? looks[key] : {};
  if ((validDye(raw.d) ? raw.d : null) === want) return false;
  const next = { ...raw };
  if (want === null) delete next.d; else next.d = want;
  if (Object.keys(next).length) looks[key] = next; else delete looks[key];
  setPref(PAPERDOLL_LOOKS_PREF, looks);
  return true;
}

/** Choose a look (one of paperdollLookChoices) or null for the piece's own. False when nothing changed or it is no choice. */
export function setPaperdollLook(item, look) {
  if (!paperdollLookMode(item)) return false;
  look = shapeOf(look);
  if (look !== null && !allBodyChoices(item).some((c) => sameLook(c, look))) return false;
  const now = shapeOf(paperdollLookOf(item));
  if (sameLook(now, look) || (look === null && now === null)) return false;
  const key = storeKey(item, true);
  const looks = { ...(getPref(PAPERDOLL_LOOKS_PREF) ?? {}) };
  const dye = looks[key] && validDye(looks[key].d) ? { d: looks[key].d } : {};   // GARMENT-DYES: the colour stays when the shape changes
  if (look === null && !Object.keys(dye).length) delete looks[key];
  else looks[key] = { ...(look ? storedLook(look) : {}), ...dye };
  setPref(PAPERDOLL_LOOKS_PREF, looks);
  if (drawnPiece(item).templateIndex === 107) {   // the legacy helmet entry must not resurrect a cleared choice
    const legacy = { ...(getPref(LEGACY_HELMET_PREF) ?? {}) };
    if (Object.hasOwn(legacy, key)) { delete legacy[key]; setPref(LEGACY_HELMET_PREF, legacy); }
  }
  return true;
}

/** What a piece draws under a look: the template whose record it takes, and the style asked of it (undefined = its own). */
export function lookedPiece(piece, look) {
  if (!look) return { piece, variant: undefined };
  if (look.t !== undefined) return { piece: { ...piece, templateIndex: look.t, variant: look.v ?? 0 }, variant: look.v ?? 0 };   // a garment's style rides its template
  return { piece, variant: look.v };
}

/** Turning customization off forgets every choice; turning it on starts from the game's own art. */
export function clearPaperdollLooks() {
  setPref(PAPERDOLL_LOOKS_PREF, {});
  setPref(LEGACY_HELMET_PREF, {});
}

/** A stable string of every saved choice - for composite and portrait cache keys. */
export const paperdollLooksKey = () => `${JSON.stringify(getPref(PAPERDOLL_LOOKS_PREF) ?? {})}|${JSON.stringify(getPref(LEGACY_HELMET_PREF) ?? {})}`;

// The list icons read the look through a leaf door (systems/paperdollLookSource.js): a direct import would cycle.
setPaperdollLookSource(paperdollLookOf);
