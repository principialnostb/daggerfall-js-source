// @ts-check
// The Discord game on top of revenant errands: three contracts a day, one encounter on each errand's road, the points
// both earn, and what points buy. Points buy the PDA's own looks and titles and nothing in the game: no Aurum, no
// Marks, no gold, no items, since nothing a player earns outside the seated game may be power. The haul stays the game's
// own, drawn when the revenant comes back. Pure: every draw is a hash of the account, the day or the errand's seed.
import { REMOTE_PLACES, REMOTE_VENTURES, remotePlace } from '../../src/systems/revenant/revenantRemoteLaw.js';

/** A 32-bit hash of a string (FNV-1a). */
export function hash32(/** @type {string} */ s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
/** A stream of numbers in [0, 1) from a seed (mulberry32). */
export function stream(/** @type {number} */ seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (/** @type {any[]} */ list, /** @type {() => number} */ roll) => list[Math.min(list.length - 1, Math.floor(roll() * list.length))];

/** Points an errand earns for each day of its road, when it comes back. */
export const POINTS_A_DAY = 5;
/** Contracts a day, each kind once, and what each pays. */
export const CONTRACT_REWARD = Object.freeze({ scout: 10, venture: 15, veteran: 25 });
export const CONTRACTS_A_DAY = 3;
/** The UTC day of a wall second. */
export const utcDayOf = (/** @type {number} */ s) => Math.floor(s / 86400);

/** @typedef {{ n: number, kind: 'scout'|'venture'|'veteran', place: string, venture: string|null, rank: number, reward: number, words: string }} Contract */
/**
 * The day's three contracts of an account, the same three every time that day is asked: `n` each one's place, what it
 * asks, what it pays and its words. @param {string} playerId @param {number} day @returns {Contract[]}
 */
export function dayContracts(playerId, day) {
  const roll = stream(hash32(`contracts:${playerId}:${day}`));
  const scout = pick(REMOTE_PLACES, roll);
  const others = REMOTE_PLACES.filter((p) => p.key !== scout.key);
  const vPlace = pick(others, roll);
  const venture = pick(Object.keys(REMOTE_VENTURES), roll);
  const rank = 2 + Math.floor(roll() * 3);
  const far = REMOTE_PLACES.filter((p) => p.danger >= 3 && p.key !== vPlace.key);
  const vet = pick(far.length ? far : others, roll);
  return [
    { n: 0, kind: 'scout', place: scout.key, venture: null, rank: 1, reward: CONTRACT_REWARD.scout, words: `Send any companion to ${scout.name}.` },
    {
      n: 1,
      kind: 'venture',
      place: vPlace.key,
      venture,
      rank: 1,
      reward: CONTRACT_REWARD.venture,
      words: `${REMOTE_VENTURES[/** @type {keyof typeof REMOTE_VENTURES} */ (venture)].label} in ${vPlace.name}.`,
    },
    { n: 2, kind: 'veteran', place: vet.key, venture: null, rank, reward: CONTRACT_REWARD.veteran, words: `Send a companion of rank ${rank} or more to ${vet.name}.` },
  ];
}
/** Whether an errand meets a contract. @param {Contract} c @param {{ place: string, venture: string, rank: number }} e */
export const contractMet = (c, e) =>
  c.place === e.place && (c.venture == null || c.venture === e.venture) && (Number(e.rank) || 1) >= c.rank;
/** The best contract an errand meets of those still open (`taken` the numbers already served), or null. */
export function contractFor(/** @type {Contract[]} */ list, /** @type {Set<number>} */ taken, /** @type {any} */ e) {
  return list.filter((c) => !taken.has(c.n) && contractMet(c, e)).sort((a, b) => b.reward - a.reward)[0] ?? null;
}

/** How likely a choice turns out well, by its risk, and what it pays either way. */
export const RISK = Object.freeze([
  Object.freeze({ chance: 1, good: 4, poor: 4 }),
  Object.freeze({ chance: 0.7, good: 8, poor: 2 }),
  Object.freeze({ chance: 0.45, good: 12, poor: 2 }),
]);

/**
 * The encounters, each with its scene and its choices. `{name}` is the revenant, `{city}` the errand's city or province.
 * Each choice's `good` and `poor` say how it went, after the revenant's name.
 */
export const ENCOUNTERS = Object.freeze({
  toll: {
    scene: '{name} meets a toll-keeper on the road to {city}.',
    choices: [
      { label: 'Pay the toll', risk: 0, good: 'paid the toll and went on its way', poor: 'paid the toll and went on its way' },
      { label: 'Talk its way past', risk: 1, good: 'talked its way past the toll-keeper', poor: 'was turned back and took the long road' },
      { label: 'Force the gate', risk: 2, good: 'forced the gate, and nobody followed', poor: 'forced the gate and was chased for a day' },
    ],
  },
  shrine: {
    scene: 'A wayside shrine stands near {city}, its offering bowl full.',
    choices: [
      { label: 'Leave an offering', risk: 0, good: 'left an offering at a wayside shrine', poor: 'left an offering at a wayside shrine' },
      { label: 'Keep watch by it', risk: 1, good: 'kept watch and saw pilgrims safely past', poor: 'kept a cold watch that nobody needed' },
      { label: 'Take the offering', risk: 2, good: 'took a shrine’s offering, and nothing came of it', poor: 'took a shrine’s offering and was cursed for it' },
    ],
  },
  ambush: {
    scene: 'Bandits lie in wait in the hills before {city}.',
    choices: [
      { label: 'Pay them off', risk: 0, good: 'paid off a band of robbers', poor: 'paid off a band of robbers' },
      { label: 'Slip past them', risk: 1, good: 'slipped past an ambush unseen', poor: 'was seen slipping past an ambush and had to run' },
      { label: 'Fight them', risk: 2, good: 'scattered a band of robbers', poor: 'fought robbers in the hills and came off worse' },
    ],
  },
  wagon: {
    scene: 'A merchant’s wagon is stuck fast in the mud near {city}.',
    choices: [
      { label: 'Help the merchant', risk: 0, good: 'helped a merchant free a stuck wagon', poor: 'helped a merchant free a stuck wagon' },
      { label: 'Trade for news', risk: 1, good: 'traded help for good news of the road', poor: 'traded help for news that was wrong' },
    ],
  },
  ruin: {
    scene: 'An old ruin breaks the skyline near {city}.',
    choices: [
      { label: 'Pass it by', risk: 0, good: 'left an old ruin to its ghosts', poor: 'left an old ruin to its ghosts' },
      { label: 'Map it', risk: 1, good: 'mapped an old ruin for those who come after', poor: 'lost a day mapping a ruin that was not there' },
      { label: 'Search it', risk: 2, good: 'searched an old ruin and came out whole', poor: 'searched an old ruin and woke what slept there' },
    ],
  },
  storm: {
    scene: 'A storm closes in on the road to {city}.',
    choices: [
      { label: 'Wait at an inn', risk: 0, good: 'sat out a storm at an inn', poor: 'sat out a storm at an inn' },
      { label: 'Shelter in a cave', risk: 1, good: 'found a dry cave to wait out a storm', poor: 'shared a cave with a bear through a storm' },
      { label: 'Push on', risk: 2, good: 'pushed through a storm and made good time', poor: 'pushed into a storm and lost the road' },
    ],
  },
  rival: {
    scene: 'Another sworn revenant bars the road near {city}.',
    choices: [
      { label: 'Go around', risk: 0, good: 'went around a rival on the road', poor: 'went around a rival on the road' },
      { label: 'Share a fire', risk: 1, good: 'shared a fire and stories with a rival', poor: 'shared a fire with a rival who stole its boots' },
      { label: 'Duel it', risk: 2, good: 'beat a rival revenant in a duel', poor: 'lost a duel to a rival revenant' },
    ],
  },
});
export const ENCOUNTER_KEYS = Object.freeze(Object.keys(ENCOUNTERS));
/** An errand's encounter, by its seed. */
export const encounterOf = (/** @type {number} */ seed) => ENCOUNTER_KEYS[hash32(`enc:${seed >>> 0}`) % ENCOUNTER_KEYS.length];
/** The encounter's scene, in words. */
export function encounterScene(/** @type {string} */ kind, /** @type {string} */ name, /** @type {string} */ city) {
  const e = ENCOUNTERS[/** @type {keyof typeof ENCOUNTERS} */ (kind)];
  return e ? e.scene.replace('{name}', name).replace('{city}', city) : '';
}
/**
 * How a choice turned out, drawn on the errand's seed: `{ good, words, points }`. No choice made: nothing earned.
 * @param {string} kind @param {number|null} choice @param {number} seed
 */
export function encounterOutcome(kind, choice, seed) {
  const e = ENCOUNTERS[/** @type {keyof typeof ENCOUNTERS} */ (kind)];
  const c = e && Number.isInteger(choice) ? e.choices[/** @type {number} */ (choice)] : null;
  if (!c) return { good: false, words: 'kept its head down on the road', points: 0 };
  const r = RISK[c.risk] ?? RISK[0];
  const good = stream(hash32(`outcome:${seed >>> 0}:${choice}`))() < r.chance;
  return { good, words: good ? c.good : c.poor, points: good ? r.good : r.poor };
}

/** What points buy: frames for the PDA and titles for the profile card. Amber is every player's own. */
export const THEMES = Object.freeze([
  Object.freeze({ key: 'theme:amber', label: 'Amber frame', cost: 0, accent: 0xc9a227 }),
  Object.freeze({ key: 'theme:crimson', label: 'Crimson frame', cost: 60, accent: 0xb03a2e }),
  Object.freeze({ key: 'theme:azure', label: 'Azure frame', cost: 60, accent: 0x3a7bd5 }),
  Object.freeze({ key: 'theme:verdant', label: 'Verdant frame', cost: 60, accent: 0x3fa65a }),
  Object.freeze({ key: 'theme:violet', label: 'Violet frame', cost: 90, accent: 0x8e5cc4 }),
  Object.freeze({ key: 'theme:ember', label: 'Ember frame', cost: 90, accent: 0xe8743b }),
  Object.freeze({ key: 'theme:ivory', label: 'Ivory frame', cost: 120, accent: 0xd8d2c4 }),
  Object.freeze({ key: 'theme:obsidian', label: 'Obsidian frame', cost: 150, accent: 0x34303a }),
]);
export const TITLES = Object.freeze([
  Object.freeze({ key: 'title:pathfinder', label: 'Pathfinder', cost: 80 }),
  Object.freeze({ key: 'title:wayfarer', label: 'Wayfarer', cost: 120 }),
  Object.freeze({ key: 'title:quartermaster', label: 'Quartermaster', cost: 200 }),
  Object.freeze({ key: 'title:far-strider', label: 'Far-Strider', cost: 300 }),
  Object.freeze({ key: 'title:oathkeeper', label: 'Oathkeeper', cost: 400 }),
]);
/** A thing in the shop by its key, or null. */
export const wareOf = (/** @type {unknown} */ key) =>
  [...THEMES, ...TITLES].find((w) => w.key === key) ?? null;

/** An errand's report: where it went, what it met, that it is back. */
export function errandReport(/** @type {any} */ row, /** @type {string} */ city) {
  const p = remotePlace(row.place);
  const v = REMOTE_VENTURES[/** @type {keyof typeof REMOTE_VENTURES} */ (row.venture)];
  const where = city && p && city !== p.name ? `${city}, in ${p.name}` : (p?.name ?? row.place);
  const lines = [`${row.name} went to ${where}${v ? ` (${v.label})` : ''}.`];
  if (row.enc_kind) lines.push(`On the road it ${encounterOutcome(row.enc_kind, row.enc_choice ?? null, row.seed).words}.`);
  lines.push('It is back. Its haul waits for you in the game.');
  return lines.join(' ');
}
