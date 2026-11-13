// @ts-check
// THE LOOKS A WEAPON'S GLOW WEARS, and the spec a drawer takes for one: the looks' codes, the Aura Armory's weapon
// pieces and their colours. A leaf, so a stage that draws one look (the shop's blade, the journal's Cabinet in
// Discord) reads it without the rules that choose a look for a weapon in the hand. systems/weaponGlow.js holds those
// rules and hands all of this on.
import { GLOW_SPRITE_WINDOW, GLOW_TIDE } from '../render/weaponGlowGlsl.js'; // the sprite's search window and the skins' own - a leaf with no imports
import { armoryKitPieces } from '../net/armoryLaw.js';

/** The looks, by the code the shaders read (`uGlowLook`): 0 is none. */
export const GLOW_LOOKS = Object.freeze(['none', 'fire', 'frost', 'shock', 'arcane', 'brand', 'edge', 'gilded']); // the Aura Armory's two weapon pieces, then the Gilded rung's look last
export const GLOW_CODE = Object.freeze(Object.fromEntries(GLOW_LOOKS.map((k, i) => [k, i])));
/** A look drawn in another's code with a pattern of its own: the Tidebound Edge is the edge's code, and its skin
 *  (GLOW_SKIN, the shaders' `uGlowSkin`) draws its own water there - a swell running toward the tip, drops falling off
 *  it. So no code passes the field key's 8: a skin keys its field by a bit of its own (weaponGlowGlsl.js glowFieldKey). */
export const GLOW_SKINS = Object.freeze({ tide: 'edge' });
/** Each skin's number as the shaders read it; 0 is a look's own pattern. */
export const GLOW_SKIN = Object.freeze({ tide: GLOW_TIDE.skin });

/** Law 7's one strength. */
export const ARMORY_LEVEL = 2;
/** THE WEAPON PIECE'S LOOK - law 7. A weapon in a player's hand wears the Aura Armory's weapon piece their kit holds: the
 *  Brand of the Breach a molten fire running down it, the Eternal Edge a blue-violet line with a light running along it,
 *  the Tidebound Edge a swell of sea-glass water running toward the tip and dripping off it. */
export const ARMORY_GLOW = Object.freeze({ breachbrand: 'brand', eternaledge: 'edge', tideedge: 'tide' });
/** The look of a kit's weapon piece, or null where it holds none. Pure. */
export function armoryKitLook(/** @type {unknown} */ kit) {
  const key = armoryKitPieces(kit).weapon;
  return key ? (ARMORY_GLOW[/** @type {keyof typeof ARMORY_GLOW} */ (key)] ?? null) : null;
}
/** The look of a kit whose ONLY piece is a weapon's - the shop's stage for it is the blade's (render/weaponPiecePreview.js),
 *  since the body pass draws no weapon piece; null for any other kit. Pure. */
export const armoryWeaponStage = (/** @type {unknown} */ kit) =>
  Object.entries(armoryKitPieces(kit)).every(([s, k]) => s === 'weapon' || !k) ? armoryKitLook(kit) : null;

/** The Aura Armory's weapon looks' colours, four stops each, dark to hot, linear 0..1 RGB (systems/weaponGlow.js
 *  GLOW_RAMPS holds them with the elements'). */
export const ARMORY_RAMPS = Object.freeze({
  // the Brand's coal-dark crimson to a molten gold, darker than fire's; the Edge's Genesis blues and violets
  brand: Object.freeze([
    [0.3, 0.02, 0.01],
    [0.75, 0.14, 0.03],
    [1.0, 0.45, 0.08],
    [1.0, 0.82, 0.45],
  ]),
  edge: Object.freeze([
    [0.247, 0.388, 1.0],
    [0.561, 0.357, 1.0],
    [0.839, 0.722, 1.0],
    [0.957, 0.933, 1.0],
  ]),
  // the Tidebound Edge: the sea-glass teal (#2aa198) into the pearl (#f2fbff)
  tide: Object.freeze([
    [0.165, 0.631, 0.596],
    [0.435, 0.827, 0.78],
    [0.91, 1.0, 0.973],
    [0.949, 0.984, 1.0],
  ]),
});

/**
 * A look at a level as a drawer takes it - `{ look, code, skin, level, word, ramp, win }` (`skin` its pattern in its
 * code's, `word` the wire's, `ramp` the twelve floats frozen, `win` the sprite's search window) - frozen whole. Pure.
 * @param {string} look @param {number} level @param {ReadonlyArray<ReadonlyArray<number>>} ramp
 */
export function lookSpec(look, level, ramp) {
  return Object.freeze({
    look,
    code: GLOW_CODE[/** @type {keyof typeof GLOW_CODE} */ (GLOW_SKINS[/** @type {keyof typeof GLOW_SKINS} */ (look)] ?? look)],
    skin: GLOW_SKIN[/** @type {keyof typeof GLOW_SKIN} */ (look)] ?? 0,
    level,
    word: `${look}${level}`,
    ramp: Object.freeze(ramp.flat()),
    win: GLOW_SPRITE_WINDOW[/** @type {keyof typeof GLOW_SPRITE_WINDOW} */ (look)],
  });
}
/** An Aura Armory weapon look's spec at its one strength, as systems/weaponGlow.js glowSpec answers it; null for any
 *  other look. Pure. */
export const armoryGlowSpec = (/** @type {unknown} */ look) =>
  typeof look === 'string' && Object.hasOwn(ARMORY_RAMPS, look)
    ? lookSpec(look, ARMORY_LEVEL, ARMORY_RAMPS[/** @type {keyof typeof ARMORY_RAMPS} */ (look)])
    : null;
