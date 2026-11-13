// @ts-check
// ARMORY (2026-10-28; bible/04-Characters/Aura-Armory.md): THE AURA ARMORY IN THE PLAYER'S LANGUAGE - each slot's name,
// each piece's name and what it looks like, read through the text core where they are drawn (the account card, the shop,
// the Collections page, the chat's word of a find). The English is the service's too (net/armoryLaw.js ARMORY_NAME - a
// pin holds the two equal).
import { t } from '../systems/textManager.js';
import { armoryPieceOf } from '../net/armoryLaw.js';

/** Each slot's name. */
export const ARMORY_SLOT_TEXT = Object.freeze({
  head: () => t('armory.slot.head', 'Head'),
  torso: () => t('armory.slot.torso', 'Torso'),
  arms: () => t('armory.slot.arms', 'Arms'),
  legs: () => t('armory.slot.legs', 'Legs'),
  weapon: () => t('armory.slot.weapon', 'Weapon'),
});
/** PROFILE-SLOTS: each line's name - the set a whole line makes (the profile's Wear the whole set). */
export const ARMORY_LINE_TEXT = Object.freeze({
  dagonfire: () => t('armory.line.dagonfire', 'Dagonfire'),
  eternal: () => t('armory.line.eternal', 'Eternal'),
  guild: () => t('armory.line.guild', 'Guild'), // GUILD-SHOP
  crystal: () => t('armory.line.crystal', 'Crystal'), // THANKS-POST
  tidebound: () => t('armory.line.tidebound', 'Tidebound'), // the Courier's Cabinet's, bought with Seals in Discord
});
/** Each piece's name. */
export const ARMORY_TEXT = Object.freeze({
  burningcrown: () => t('armory.name.burningcrown', 'Crown of the Burning Door'),
  emberheart: () => t('armory.name.emberheart', 'Ember Heart'),
  ashbound: () => t('armory.name.ashbound', 'Ashbound Bracers'),
  cinderstride: () => t('armory.name.cinderstride', 'Cinderstride'),
  breachbrand: () => t('armory.name.breachbrand', 'Brand of the Breach'),
  eternalhalo: () => t('armory.name.eternalhalo', 'Eternal Halo'),
  eternalsigil: () => t('armory.name.eternalsigil', 'Eternal Sigil'),
  eternalarmlets: () => t('armory.name.eternalarmlets', 'Eternal Armlets'),
  eternalgreaves: () => t('armory.name.eternalgreaves', 'Eternal Greaves'),
  eternaledge: () => t('armory.name.eternaledge', 'Eternal Edge'),
  insigniaarmlet: () => t('armory.name.insigniaarmlet', 'Insignia Armlet'), // GUILD-SHOP
  crystalspurs: () => t('armory.name.crystalspurs', 'Crystal Spurs'), // THANKS-POST
  tidecirclet: () => t('armory.name.tidecirclet', 'Tidebound Circlet'),
  tidepearl: () => t('armory.name.tidepearl', 'Tidebound Pearl'),
  tidebracers: () => t('armory.name.tidebracers', 'Tidebound Bracers'),
  tidegreaves: () => t('armory.name.tidegreaves', 'Tidebound Greaves'),
  tideedge: () => t('armory.name.tideedge', 'Tidebound Edge'),
});
/** What each piece looks like, in a sentence or two. Every body piece floats a little way off the body. */
export const ARMORY_LOOK = Object.freeze({
  burningcrown: () =>
    t(
      'armory.look.burningcrown',
      'A crown of molten iron floats above your head, with horns of flame and a door of white fire at the front. Embers lift off the points.',
    ),
  emberheart: () =>
    t(
      'armory.look.emberheart',
      'A cracked coal floats in front of your chest and beats like a heart. Fire runs along its veins with every beat, and embers fall from it.',
    ),
  ashbound: () =>
    t(
      'armory.look.ashbound',
      'Loose rings of glowing iron chain float around your arms, from the shoulders to the wrists. Ash falls from them.',
    ),
  cinderstride: () =>
    t(
      'armory.look.cinderstride',
      'Rings of burning coal float around your shins, and low flames lick up from them. Each step leaves an ember on the ground that burns out.',
    ),
  breachbrand: () =>
    t('armory.look.breachbrand', 'Fire runs along the weapon from the grip to the point, and drips from the tip.'),
  eternalhalo: () =>
    t(
      'armory.look.eternalhalo',
      "A ring of blue-violet fire floats above your head, with runes around it and the Origin's spark at its front.",
    ),
  eternalsigil: () =>
    t(
      'armory.look.eternalsigil',
      "The Origin's dragon of light floats in front of your chest, around the spark, biting its own tail. A second one floats behind your back.",
    ),
  eternalarmlets: () =>
    t(
      'armory.look.eternalarmlets',
      'Engraved rings of blue-violet fire float around your upper arms and wrists and turn slowly. Flames lick up from them.',
    ),
  eternalgreaves: () =>
    t(
      'armory.look.eternalgreaves',
      "Rings of blue-violet fire with a lattice of light float around your shins. The top ring holds the Origin's spark. Sparks rise as you walk.",
    ),
  eternaledge: () =>
    t(
      'armory.look.eternaledge',
      "A blade of blue-violet light runs along the weapon's edge. Sparks trail from it when you swing.",
    ),
  insigniaarmlet: () =>
    t(
      'armory.look.insigniaarmlet',
      "A gilt shield with your guild's arms floats beside your left upper arm, in a glow of your guild's colors.",
    ), // GUILD-SHOP
  crystalspurs: () =>
    t(
      'armory.look.crystalspurs',
      'Small spurs of crystal float just off both arms and turn slowly, each a different size. Their colors shift from amethyst to aqua to rose.',
    ), // THANKS-POST
  tidecirclet: () =>
    t(
      'armory.look.tidecirclet',
      'Sea-glass beads float in a ring around your head, with a pearl at the front. Each bead drifts up and down, and drops of spray jump from the front.',
    ),
  tidepearl: () =>
    t(
      'armory.look.tidepearl',
      'A nautilus shell of pearl lines floats in front of your chest. Light runs along its spiral to the pearl at its center.',
    ),
  tidebracers: () =>
    t(
      'armory.look.tidebracers',
      'A stream of water coils around each arm without touching it and flows toward your hand. Foam shows on its ripples, and drops fall.',
    ),
  tidegreaves: () =>
    t(
      'armory.look.tidegreaves',
      'Lines of surf wash up a ring of water around your shins and fade. Drops run back down, and a ripple spreads where you step.',
    ),
  tideedge: () =>
    t(
      'armory.look.tideedge',
      'Water ripples along your weapon toward the point, with foam on its waves. Drops fall from its lower edge.',
    ),
});
/** A SET's name and look (the shop's Eternal Set, its five pieces at once). */
export const ARMORY_SET_TEXT = Object.freeze({ eternalset: () => t('armory.name.eternalset', 'The Eternal Set') });
export const ARMORY_SET_LOOK = Object.freeze({
  eternalset: () =>
    t(
      'armory.look.eternalset',
      'All five Eternal pieces at once: the Halo, the Sigil, the Armlets, the Greaves and the Edge.',
    ),
});
/** A piece's name - or a set's - by its key, or the key for one that is neither. */
export const armoryPieceName = (/** @type {string} */ key) =>
  (
    ARMORY_TEXT[/** @type {keyof typeof ARMORY_TEXT} */ (key)] ??
    ARMORY_SET_TEXT[/** @type {keyof typeof ARMORY_SET_TEXT} */ (key)]
  )?.() ?? key;
/** PROFILE-SLOTS: a line's name by its key. */
export const armoryLineName = (/** @type {string} */ line) =>
  ARMORY_LINE_TEXT[/** @type {keyof typeof ARMORY_LINE_TEXT} */ (line)]?.() ?? line;
/** A slot's name by its key. */
export const armorySlotName = (/** @type {string} */ slot) =>
  ARMORY_SLOT_TEXT[/** @type {keyof typeof ARMORY_SLOT_TEXT} */ (slot)]?.() ?? slot;
/** A piece's slot's name, or ''. */
export const armoryPieceSlotName = (/** @type {string} */ key) => {
  const p = armoryPieceOf(key);
  return p ? armorySlotName(p.slot) : '';
};
