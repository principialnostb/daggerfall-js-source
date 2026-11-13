// @ts-check
// THE COURIER'S CABINET: the cosmetics bought in Discord with Seals, the currency the journal's games pay, so every
// minigame shares one shop. Seals are earned by play in Discord alone, are never sold for money, never traded and
// never turned into Aurum, gold or items. Every ware is cosmetic and is the account's at once: the game reads it off
// the account row (`players.discord_wares`) as it reads the shop's.
// Pure. It imports the sea's name alone, from its one home (world/ethericSea.js). Neither the relay's graph nor the
// token's holds this module, so neither grows by it.

import { ETHER_WORD } from '../world/ethericSea.js';

/** What the currency is called where a player reads it. */
export const SEALS_WORD = 'Seals';
/** The kinds a ware may be: what the game draws it as. */
export const SEAL_KINDS = Object.freeze(['aura', 'title', 'glyph', 'icon', 'armory']);
/** A ware's id: `dc-<kind>-<key>`. Never renamed or reused: a stored id is a sale that happened. */
export const SEAL_WARE_ID_RE = /^dc-(aura|title|glyph|icon|armory)-[a-z]{3,16}$/;

const ware = (
  /** @type {string} */ id,
  /** @type {string} */ kind,
  /** @type {string[]} */ codes,
  /** @type {string} */ name,
  /** @type {number} */ seals,
  /** @type {string} */ look,
) => Object.freeze({ id, kind, codes: Object.freeze(codes), name, seals, look });

/** The Tidebound line's five pieces, in the armory's slot order. */
export const TIDEBOUND_PIECES = Object.freeze(['tidecirclet', 'tidepearl', 'tidebracers', 'tidegreaves', 'tideedge']);

/**
 * EVERY WARE, in the cabinet's order. `codes` are the game's own keys for what the ware gives: an aura's, a title's, a
 * glyph's, a portrait's, or the armory pieces (a set gives its line's every piece).
 */
export const SEAL_WARES = Object.freeze([
  ware(
    'dc-aura-eltherictide',
    'aura',
    ['eltherictide'],
    `${ETHER_WORD} Tide`,
    1800,
    'Rings of sea-green light spread slowly around your feet.',
  ),
  ware(
    'dc-aura-veilwake',
    'aura',
    ['veilwake'],
    'Veilwake',
    1500,
    'A pale blue mist surrounds you and trails behind you as you move.',
  ),
  ware(
    'dc-title-veilcourier',
    'title',
    ['veilcourier'],
    'Courier of the Veil',
    900,
    'Your name on a glowing sea-green plate.',
  ),
  ware('dc-glyph-waxseal', 'glyph', ['waxseal'], 'Courier’s Seal', 600, 'A red wax seal next to your name.'),
  ware(
    'dc-icon-courier',
    'icon',
    ['courier'],
    'The Courier',
    400,
    'A sealed letter and a quill, as your profile picture.',
  ),
  ware(
    'dc-icon-tidecompass',
    'icon',
    ['tidecompass'],
    'Tide Compass',
    400,
    'A compass over ocean waves, as your profile picture.',
  ),
  ware(
    'dc-armory-tidecirclet',
    'armory',
    ['tidecirclet'],
    'Tidebound Circlet',
    500,
    'Sea-glass beads that float around your head, with spray that jumps from the front.',
  ),
  ware(
    'dc-armory-tidepearl',
    'armory',
    ['tidepearl'],
    'Tidebound Pearl',
    500,
    'A nautilus shell that floats in front of your chest. Light runs along its spiral to a pearl.',
  ),
  ware(
    'dc-armory-tidebracers',
    'armory',
    ['tidebracers'],
    'Tidebound Bracers',
    500,
    'A stream of water that coils around each arm without touching it.',
  ),
  ware(
    'dc-armory-tidegreaves',
    'armory',
    ['tidegreaves'],
    'Tidebound Greaves',
    500,
    'Surf that washes up a ring of water around your shins, and ripples where you step.',
  ),
  ware(
    'dc-armory-tideedge',
    'armory',
    ['tideedge'],
    'Tidebound Edge',
    500,
    'Water that ripples along your weapon and drips from it.',
  ),
  ware(
    'dc-armory-tidebound',
    'armory',
    [...TIDEBOUND_PIECES],
    'The Tidebound Set',
    2000,
    'All five Tidebound pieces, for less than buying them one at a time.',
  ),
]);

/** A ware by its id, or null. */
export const sealWareOf = (/** @type {unknown} */ id) =>
  typeof id === 'string' ? (SEAL_WARES.find((w) => w.id === id) ?? null) : null;

/** The cabinet's ware ids an account row holds (`players.discord_wares`, ids space-separated); unknown ids are not read. */
export function discordWareIds(/** @type {any} */ row) {
  const text = typeof row?.discord_wares === 'string' ? row.discord_wares : '';
  /** @type {string[]} */
  const out = [];
  for (const id of text.split(' ')) if (sealWareOf(id) && !out.includes(id)) out.push(id);
  return out;
}

/** The game's keys of one kind an account row holds from the cabinet: a set gives every piece of its line. */
export function discordHeld(/** @type {any} */ row, /** @type {string} */ kind) {
  /** @type {string[]} */
  const out = [];
  for (const id of discordWareIds(row)) {
    const w = /** @type {NonNullable<ReturnType<typeof sealWareOf>>} */ (sealWareOf(id));
    if (w.kind === kind) for (const c of w.codes) if (!out.includes(c)) out.push(c);
  }
  return out;
}

/** Whether a row holds every key a ware gives (a set held whole, or each of its pieces bought apart). */
export const holdsWare = (/** @type {any} */ row, /** @type {unknown} */ id) => {
  const w = sealWareOf(id);
  if (!w) return false;
  const held = discordHeld(row, w.kind);
  return w.codes.every((c) => held.includes(c));
};

/**
 * What a ware costs this account: its price, less what it already holds of a set (each piece at its own price), never
 * below a fifth of the set. Null when it is held whole already.
 * @param {any} row @param {unknown} id
 */
export function sealPrice(row, id) {
  const w = sealWareOf(id);
  if (!w || holdsWare(row, id)) return null;
  if (w.codes.length < 2) return w.seals;
  const held = discordHeld(row, w.kind);
  const credit = SEAL_WARES.filter(
    (x) => x.codes.length === 1 && w.codes.includes(x.codes[0]) && held.includes(x.codes[0]),
  ).reduce((n, x) => n + x.seals, 0);
  return Math.max(Math.ceil(w.seals / 5), w.seals - credit);
}

/** The row's ware text with one more id, kept in the cabinet's order. */
export function withWare(/** @type {unknown} */ text, /** @type {string} */ id) {
  const have = new Set(
    String(text ?? '')
      .split(' ')
      .filter((x) => sealWareOf(x)),
  );
  have.add(id);
  return SEAL_WARES.map((w) => w.id)
    .filter((x) => have.has(x))
    .join(' ');
}
