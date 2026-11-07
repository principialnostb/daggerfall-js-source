// @ts-check
// THE TOYBOX'S LAW: a developer's own tools, opened by /toybox. One copy for the page, the account service and the
// relay, so it imports nothing. A developer is the `dev` glyph the account service signs (titles.js glyphsOf); every
// door that acts for the toybox asks the service or the relay again, never this page's word alone.

/** The glyph that opens the toybox: the Developer's (the Staff Panel's Admin). */
export const TOYBOX_GLYPH = 'dev';
/** Whether a player wearing `glyphs` may open the toybox. @param {unknown} glyphs */
export const mayToybox = (glyphs) => Array.isArray(glyphs) && glyphs.includes(TOYBOX_GLYPH);

/** The toybox's options in the window's order. `toggle` options stay lit while on. */
export const TOYBOX_OPTIONS = Object.freeze([
  Object.freeze({ id: 'invincible', label: 'Invincible', toggle: true }),
  Object.freeze({ id: 'noclip', label: 'No-Clip', toggle: true }),
  Object.freeze({ id: 'ghost', label: 'Ghost', toggle: true }),
  Object.freeze({ id: 'teleport', label: 'Teleport', toggle: false }),
  Object.freeze({ id: 'summon', label: 'Summon', toggle: false }),
  Object.freeze({ id: 'item', label: 'Create Item', toggle: false }),
  Object.freeze({ id: 'invasion', label: 'Invasion', toggle: false }),
  Object.freeze({ id: 'dragon', label: 'Dragon Attack', toggle: false }),
]);
/** The options that need another player, the relay or the account service, so offline play greys them out. */
export const TOYBOX_ONLINE_ONLY = Object.freeze(['summon']);

/** `/toybox` typed in the chat (or the offline command bar), or null for any other line. @param {unknown} text */
export function parseToyboxCommand(text) {
  const match = /^\/toybox(?:\s+(\S.*))?$/i.exec(String(text ?? '').trim());
  if (!match) return null;
  return match[1] ? { error: '/toybox takes nothing after it.' } : { cmd: 'toybox' };
}

/** No-Clip's pace: running's, times this. */
export const NOCLIP_RUN_MULT = 1.5;
/** How see-through a ghost looks on their own screen (1 is solid). */
export const GHOST_SELF_ALPHA = 0.45;
/** The first relay that keeps a ghost (server/src/staffGhost.js): an older one closes a socket that sends the frame. */
export const GHOST_RELAY_MIN = 304;
/** Whether the relay named `version` (its welcome's `world<N>`) keeps a ghost. @param {unknown} version */
export const relaySupportsGhost = (version) => {
  const match = /^world(\d+)$/.exec(typeof version === 'string' ? version : '');
  return !!match && Number(match[1]) >= GHOST_RELAY_MIN;
};

/** The wait between an event's staging and its start, ms: the map shows its mark and a countdown meanwhile. */
export const TOYBOX_EVENT_WAIT_MS = 10 * 60 * 1000;
/** The same wait offline: one developer alone, with nobody else to gather. */
export const TOYBOX_EVENT_WAIT_OFFLINE_MS = 60 * 1000;
/** An invasion's waves before its boss rises. */
export const INVASION_WAVES = 10;
/** The boss's third phase, a share of its health left: from here, waves come one after another until it falls. */
export const INVASION_PHASE3_AT = 1 / 3;
/** The least level the invasion is tuned for (it says so; it never refuses anyone). */
export const INVASION_LEVEL = 30;

/** THE FAMILIES an invasion brings, in the dropdown's order. `kinds` are MobileTypes numbers (characters/mobile/
 *  mobileTypes.js, held equal by test/systems/toyboxlaw.test.js); `boss` is the kind that rises after the tenth wave. */
export const INVASION_FAMILIES = Object.freeze([
  // Frost and Fire Daedra, Daedroth, Seducer and the four atronachs; the Daedra Lord rises
  Object.freeze({ id: 'daedra', label: 'Daedra', kinds: Object.freeze([25, 26, 27, 29, 35, 36, 37, 38]), boss: 31 }),
  // Skeletal Warrior, Zombie, Ghost, Mummy, Wraith and Vampire; the Ancient Lich rises
  Object.freeze({ id: 'undead', label: 'Undead', kinds: Object.freeze([15, 17, 18, 19, 23, 28]), boss: 33 }),
  // Werewolf and Wereboar; a Werewolf rises
  Object.freeze({ id: 'werewolves', label: 'Werewolves', kinds: Object.freeze([9, 14]), boss: 9 }),
  // Orc, Orc Sergeant and Orc Shaman; the Orc Warlord rises
  Object.freeze({ id: 'orcs', label: 'Orcs', kinds: Object.freeze([7, 12, 21]), boss: 24 }),
  // Warrior, Knight, Barbarian, Archer, Rogue, Battlemage and Spellsword; a Knight rises
  Object.freeze({ id: 'humans', label: 'Humans', kinds: Object.freeze([144, 145, 143, 141, 136, 130, 129]), boss: 145 }),
]);
/** A family by its id, or null. @param {unknown} id */
export const invasionFamily = (id) => INVASION_FAMILIES.find((family) => family.id === id) ?? null;

/** The Dwarven Dragon's kind (characters/dwarvenDragon.js), named in a dragon attack's event. */
export const DRAGON_ATTACK_KIND = 512;
/** How long a dragon attack's event stands once it begins, ms: the world dragon's stay (net/dragon/dragonLaw.js
 *  DRAGON_STAY_MS, held equal by test/systems/toyboxlaw.test.js). The event ends the moment its dragon leaves; its
 *  climb away is drawn from the kept omen (scenes/dragonHost.js CALLED_KEPT_MS). */
export const DRAGON_ATTACK_RUN_MS = 40 * 60 * 1000;
