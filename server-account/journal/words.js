// @ts-check
// The book's words for every refusal the journal's door and the sea can answer (server-account/src/journalDoor.js,
// seaJournal.js): one place, so a word the service learns to say without a sentence here turns a test red
// (test/server/journal_activity.test.js) rather than reaching a player as a code. Pure.

/** The sea's refusals. */
export const SEA_WORDS = Object.freeze({
  peace: 'You cannot fight near Veilhaven.',
  'too-far': 'Too far away. Sail closer first.',
  asleep: 'That captain is not online right now.',
  busy: 'That ship is already in a fight.',
  gone: 'That ship is no longer here.',
  'too-hurt': 'Your ship is too damaged to fight. Repair it first.',
  'no-isle': 'There is no island close enough to land on.',
  'no-way': 'You cannot walk there.',
  'done-today': 'You already did that here today.',
  'yard-busy': 'The shipyard is busy. Try again in a few minutes.',
  'no-stores': 'You have no Carpenter’s Stores left.',
  whole: 'Your ship needs no repairs.',
  'in-battle': 'You cannot do that during a fight.',
  'no-character': 'Your account has no online character yet.',
  'not-linked': 'Link your DFO Online account first.',
  'at-sea': 'You are already at sea.',
  'no-ship': 'That ship is not in your fleet, or it cannot fight.',
  'not-at-sea': 'Set sail first.',
  'no-battle': 'You are not in a fight.',
  'not-ashore': 'You are not on an island.',
  'not-there': 'Walk to it first.',
  mercy: 'That ship is too damaged to attack.',
  'own-ship': 'You cannot attack a ship of your own account.',
  cooldown: 'You fought that captain a few minutes ago. Try again later.',
  raced: 'Something changed just then. Try again.',
});

/** The door's refusals. */
export const DOOR_WORDS = Object.freeze({
  who: 'Discord did not tell us who you are. Close the journal and open it again.',
  ticket: 'Your sign-in has expired. Close the journal and open it again.',
  none: 'Discord did not tell us who you are. Close the journal and open it again.',
  'proxy-bad': 'Discord sent a sign-in we could not check. Close the journal and open it again.',
  'proxy-expired': 'Your Discord sign-in has expired. Close the journal and open it again.',
  'oauth-off': 'Signing in through Discord is not set up yet.',
  'oauth-refused': 'Discord did not sign you in. Try again.',
  rate: 'Too many requests. Wait a moment, then try again.',
  body: 'The journal sent a request the server could not read.',
  method: 'The journal sent a bad request. Reload it.',
  'not-found': 'That page does not exist.',
  'not-journal': 'That page does not exist.',
  offline: 'Cannot reach the server. Try again in a moment.',
});

/** A refusal's words: the sea's, the door's, or a plain fallback. @param {unknown} word */
export const wordsFor = (word) =>
  /** @type {Record<string, string>} */ (SEA_WORDS)[String(word)] ?? /** @type {Record<string, string>} */ (DOOR_WORDS)[String(word)] ?? 'That did not work. Try again.';
