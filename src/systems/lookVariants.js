import { CLOAK_TEMPLATES, WOLF_CLOAK_LOOKS, CLOAK_LOOKS_PREF, wolfCloakModel } from '../characters/ownModels/wolfCloak.js';
// @ts-check
// LOOK-VARIANTS (2026-10-27, the owner: "выбирать вариации вещей визуального отображения прям через инвентарь когда вещь
// надета на персонажа"): THE LOOKS A WORN PIECE CAN WEAR, turned from the inventory's paperdoll - the wheel over the
// piece steps through them, and its tooltip names the one worn. A test bench for looks, before a look has a home of its
// own on the item: a look is the viewer's switch it always was (the Steel Helm's `mwSteelHelm`), so turning it here is
// throwing that switch, and the body is rebuilt as the settings tile rebuilds it (ui/enhanced/enhancedMenu.js TILE_AFTER).
import { getPref, setPref } from './uiPrefs.js';
import { ownArmorModelFor, STEEL_HELM_STYLES, STEEL_HELM_DEFAULT, CLASSIC_ARMOR_TEMPLATE, PLAYER_MADE_STYLES } from '../characters/ownModels/ownArmorModels.js';
import { OWN_MW_URLS } from './ownMwAssets.js';
import { isShieldTemplate, shieldLooksFor, shieldLookKey } from '../characters/ownModels/shieldLooks.js';

/** The looks' names as the tooltip says them. */
const LOOK_LABEL = Object.freeze({ closed: 'Closed', open: 'Open', horned: 'Horned', plate: 'Steel plate', iron: 'Iron', classic: 'Original', 'wolf-brown': 'Бурый волк', 'wolf-white': 'Белый волк', 'wolf-black': 'Чёрный волк' });

/** MW-IRON1: every own piece but the steel helm keeps its look here, by the piece's id (the helm's is its switch). */
export const ARMOR_LOOKS_PREF = 'mwArmorLooks';

/** MW-IRON1: a player-made look (PLAYER_MADE_STYLES) is offered in the browser only when its meshes are there - a
 *  checkout that never ran its import has none. Node offers every look. */
const IN_BROWSER = typeof window !== 'undefined';
const available = (styles, value) => !IN_BROWSER || !PLAYER_MADE_STYLES.includes(value) || (styles[value] ?? []).every((p) => `meshes/${p.model}`.toLowerCase() in OWN_MW_URLS);

/** A worn item's looks - { values, current, write(value) } - or null when it has one look. */
export function lookVariantsOf(item) {
  if (!item || typeof item.templateIndex !== 'number') return null;
  if (isShieldTemplate(item.templateIndex)) {
    const choices = shieldLooksFor(item).filter((c) => !IN_BROWSER || `meshes/${c.model}` in OWN_MW_URLS);
    if (!choices.length) return null;
    const values = ['classic', ...choices.map((c) => c.value)], key = shieldLookKey(item);
    const current = getPref(ARMOR_LOOKS_PREF)?.[key];
    return { values, current: values.includes(current) ? current : 'classic', write: (value) => setPref(ARMOR_LOOKS_PREF, { ...(getPref(ARMOR_LOOKS_PREF) ?? {}), [key]: value }) };
  }
  if (CLOAK_TEMPLATES.includes(item.templateIndex)) {
    const values = ['classic', ...WOLF_CLOAK_LOOKS.filter((look) => !IN_BROWSER || `meshes/${wolfCloakModel(look)}` in OWN_MW_URLS)];
    if (values.length < 2) return null;
    const stored = getPref(CLOAK_LOOKS_PREF)?.[item.templateIndex];
    const current = stored === 'wolf-grey' ? 'wolf-brown' : stored;
    return { values, current: values.includes(current) ? current : 'classic', write: (value) => setPref(CLOAK_LOOKS_PREF, { ...(getPref(CLOAK_LOOKS_PREF) ?? {}), [item.templateIndex]: value }) };
  }
  const own = ownArmorModelFor({ templateIndex: item.templateIndex, material: item.material ?? 0 });
  if (!own || !('styles' in own) || !own.styles) return null;
  const styles = own.styles;
  if (own.templateIndex === CLASSIC_ARMOR_TEMPLATE.Helm) {
    const v = getPref('mwSteelHelm'), values = STEEL_HELM_STYLES.filter((x) => available(styles, x));
    return values.length > 1 ? { values, current: values.includes(v) ? v : STEEL_HELM_DEFAULT, write: (x) => setPref('mwSteelHelm', x) } : null;
  }
  const looks = getPref(ARMOR_LOOKS_PREF) ?? {}, values = Object.keys(styles).filter((x) => available(styles, x));
  if (values.length < 2) return null;
  return { values, current: values.includes(looks[own.id]) ? looks[own.id] : values[0], write: (x) => setPref(ARMOR_LOOKS_PREF, { ...(getPref(ARMOR_LOOKS_PREF) ?? {}), [own.id]: x }) };
}

/** The look a worn item wears now, as the screens name it - or null when it has one. */
export function lookVariantLabel(item) {
  const l = lookVariantsOf(item);
  return l ? shieldLooksFor(item).find((c) => c.value === l.current)?.label ?? LOOK_LABEL[l.current] ?? l.current : null;
}

/** The tooltip's line for a worn item with looks, or null. */
export function lookVariantLine(item) {
  const l = lookVariantsOf(item);
  if (!l) return null;
  const at = l.values.indexOf(l.current);
  return `Look: ${lookVariantLabel(item)} (${at + 1}/${l.values.length}) - wheel to change`;
}

// LOOK-THUMBS (2026-10-27, the owner: "что б не текстовое название было а превьюшка предмета"): each look's picture,
// drawn by tools/lookThumbs.mjs as src/assets/mw/looks/<the look's first NIF>.png. Vite's glob is a table of URLs in the
// browser and undefined in node (systems/ownMwAssets.js's reason), so node sees none and the card names the look.
// The call must stay written as `import.meta.glob(` - Vite rewrites only that literal form; wrapped in a cast it is left
// undefined in the browser and throws as the module loads, taking the game with it.
const THUMBS = typeof window !== 'undefined'
  // @ts-ignore - Vite's compile-time macro, unknown to the checker
  ? import.meta.glob('../assets/mw/looks/*.png', { eager: true, query: '?url', import: 'default' })
  : {};
const THUMB_URL = new Map(Object.entries(THUMBS).map(([p, url]) => [p.slice(p.lastIndexOf('/') + 1).toLowerCase(), String(url)]));

/** A worn item's looks as the card offers them: [{ value, label, thumb (a URL or null), on }], or null with one look. */
export function lookChoices(item) {
  const l = lookVariantsOf(item);
  if (!l) return null;
  const own = ownArmorModelFor({ templateIndex: item.templateIndex, material: item.material ?? 0 });
  return l.values.map((value) => {
    const styles = own && 'styles' in own ? own.styles : null;
    const shield = shieldLooksFor(item).find((c) => c.value === value);
    const model = shield?.model ?? (CLOAK_TEMPLATES.includes(item.templateIndex) ? wolfCloakModel(value) ?? '' : styles?.[value]?.[0]?.model ?? '');
    return { value, label: shield?.label ?? LOOK_LABEL[value] ?? value, thumb: THUMB_URL.get(model.replace(/\.nif$/i, '.png').toLowerCase()) ?? null, on: value === l.current };
  });
}

/** Put a worn item in the look `value`; true when that changed it. */
export function setLookVariant(item, value) {
  const l = lookVariantsOf(item);
  if (!l || !l.values.includes(value) || value === l.current) return false;
  l.write(value);
  return true;
}

/** Step a worn item's look by `dir` (+1 / -1, wrapping); the new look, or null when it has one. */
export function stepLookVariant(item, dir) {
  const l = lookVariantsOf(item);
  if (!l || !dir) return null;
  const n = l.values.length, at = l.values.indexOf(l.current);
  const next = l.values[(((at + Math.sign(dir)) % n) + n) % n];
  l.write(next);
  return next;
}

/** Rebuild the player's Morrowind body after a look changed - the settings tile's way. */
export async function rebuildForLook(entity) {
  const { buildArmsFor } = await import('../combat/weapon/weaponRig.js');
  await buildArmsFor(entity);
}
