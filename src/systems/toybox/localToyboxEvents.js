// @ts-check
// A TOYBOX EVENT WITH NO RELAY: the hub's book and the place's cell for one player, on this machine, so the toybox's
// invasion and dragon attack run offline as they run online, after TOYBOX_EVENT_WAIT_OFFLINE_MS. Each one's fight is its
// own local cell's (systems/toybox/localInvasion.js, systems/dragon/localDragonFights.js); here it is the book's row,
// ended when its boss or its dragon falls. A word on an event keeps the same ledger by the staff event's law
// (net/staffEvent/staffEventLaw.js), heard through the host's sendRaid and answered with the relay's own frames
// (`{k:'ev'}`, `st`, `bd`, `rc`, `end`) through `deliver` (raidingParties.js raidRelayWord's `sev`).
import {
  validStaffEvent,
  validStaffEventIn,
  newStaffLedger,
  foldStaffWord,
  staffEventDone,
  staffEventLapsed,
  staffEventBegun,
  staffLedgerState,
  staffEventEarned,
  staffEventBoard,
  STAFF_EVENTS_MAX,
} from '../../net/staffEvent/staffEventLaw.js';
import { mintStaffReceipt } from '../../net/staffEvent/staffEventReceipt.js';
import { toyboxStaffEvent } from '../../net/staffEvent/toyboxEvent.js';
import { TOYBOX_EVENT_WAIT_OFFLINE_MS } from './toyboxLaw.js';
import { calledFell } from '../dragon/calledDragons.js';
import { invasionFell } from './localInvasion.js';
import { worldRoom, SOCIAL_ROOM } from '../../net/wire.js';

/** The account a local event's ledger and receipt name. */
export const LOCAL_ACCOUNT = 'local';
const ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * THE LOCAL RUNNER. `deliver(sev, room)` hands a frame to the game; `now()` its clock, ms; `rand()` a uniform draw;
 * `name()` the player's name (the board's).
 * @param {{ deliver: (sev: any, room: string) => any, now?: () => number, rand?: () => number, name?: () => string }} deps
 */
export function createLocalToyboxEvents({ deliver, now = Date.now, rand = Math.random, name = () => '' }) {
  /** @type {import('../../net/staffEvent/staffEventLaw.js').StaffEvent[]} */
  let book = [];
  /** @type {Map<string, any>} */
  const ledgers = new Map();
  /** @type {Promise<any>} */
  let chain = Promise.resolve();
  const send = (/** @type {any} */ sev, /** @type {string} */ room) => {
    try {
      deliver(sev, room);
    } catch (e) {
      console.warn('[toybox] local frame', /** @type {any} */ (e)?.message ?? e);
    }
  };
  const sayBook = () => send({ k: 'ev', l: book.map((e) => ({ ...e })) }, SOCIAL_ROOM);
  const mintId = () => `l${Array.from({ length: 9 }, () => ID_CHARS[Math.floor(rand() * 36) % 36]).join('')}`;

  /** @param {string} id @param {string} why */
  function end(id, why) {
    if (!book.some((e) => e.id === id)) return false;
    book = book.filter((e) => e.id !== id);
    ledgers.delete(id);
    send({ k: 'end', id, why }, SOCIAL_ROOM);
    sayBook();
    return true;
  }
  /** The reward at the boss's fall: the receipt, unsigned, and the board. @param {any} e @param {any} led */
  async function pay(e, led) {
    led.rw = 1;
    const nowS = Math.floor(now() / 1000);
    led.top = staffEventBoard(led, e);
    const cell = worldRoom(e.px, e.py);
    send({ k: 'bd', id: e.id, top: led.top }, cell);
    for (const { acct, rank } of staffEventEarned(led, e)) {
      const nonce = Math.floor(rand() * 0x100000000) >>> 0;
      const receipt = await mintStaffReceipt({ v: e.id, s: acct, c: nonce, r: rank, tb: e.tb }, null, {
        subtle: globalThis.crypto?.subtle,
        nowS,
      });
      if (acct === LOCAL_ACCOUNT) send({ k: 'rc', id: e.id, r: receipt }, cell);
    }
  }

  return {
    /**
     * STAGE ONE, as the developer's route does: `{ kind, city, family }`. `{ ok, event }` or `{ ok: false, error }`.
     * @param {{ kind: unknown, city: any, family?: unknown, by?: string }} spec
     */
    start(spec) {
      if (book.length >= STAFF_EVENTS_MAX) return { ok: false, error: 'event-full' };
      const made = toyboxStaffEvent({
        kind: spec?.kind,
        place: spec?.city,
        family: spec?.family,
        id: mintId(),
        at: now(),
        by: spec?.by ?? name() ?? '',
        wait: TOYBOX_EVENT_WAIT_OFFLINE_MS,
      });
      if ('error' in made) return { ok: false, error: `event-bad-${made.error}` };
      book = [...book, made.ev];
      sayBook();
      return { ok: true, event: made.ev };
    },
    /** Is this event one of mine? @param {unknown} id */
    holds: (id) => book.some((e) => e.id === id),
    /**
     * THE PLAYER'S WORD on an event of mine (validStaffEventIn's shape): folded into its ledger, the ledger said back,
     * its end said, its reward paid at the boss's fall. Answers whether it was mine to hear.
     * @param {any} word
     */
    word(word) {
      const w = validStaffEventIn(word);
      const e = w ? book.find((x) => x.id === w.id) : null;
      if (!w || !e) return false;
      const at = now();
      if (!staffEventBegun(e, at)) return true;
      let led = ledgers.get(e.id);
      if (!led) ledgers.set(e.id, (led = newStaffLedger(e, at)));
      foldStaffWord(led, e, LOCAL_ACCOUNT, name() ?? '', w, at);
      send({ ...staffLedgerState(led) }, worldRoom(e.px, e.py));
      const paying = led.bk === 1 && !led.rw;
      const done = staffEventDone(led, e);
      chain = chain
        .then(() => (paying ? pay(e, led) : null))
        .then(() => (done ? end(e.id, done) : null))
        .catch((err) => console.warn('[toybox] local reward', err?.message ?? err));
      return true;
    },
    /** A frame's tick: an event past its end is ended, a dragon attack whose dragon fell, and an invasion whose boss
     *  fell in this machine's own fight (localInvasion.js). */
    tick() {
      const at = now();
      for (const e of [...book]) {
        if (staffEventLapsed(e, at)) end(e.id, 'time');
        else if (calledFell(e.id)) end(e.id, 'done');
        else if (invasionFell(e.id)) end(e.id, 'boss');
      }
    },
    /** End one (the toybox's own word). @param {string} id */
    end: (id) => end(id, 'staff'),
    /** The book. */
    book: () => book.map((e) => validStaffEvent(e)),
    /** Every reward and end in flight, done (the tests' wait). */
    settled: () => chain,
  };
}
