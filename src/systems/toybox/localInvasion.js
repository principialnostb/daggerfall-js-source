// @ts-check
// AN INVASION'S FIGHT WITH NO RELAY: the cell's half of server/src/invasionFights.js for one player on this machine, so
// the toybox's invasion runs offline as it runs online. It hears the field's `in` and `hit` (scenes/invasionField.js),
// keeps the fight by the relay's own brain (net/bossSeam.js INVASION_SEAM), steps it every INVASION_TICK_MS and answers
// in the cell's own words through `deliver`. The event's ledger goes out as the relay's staff frames through `sev`: the
// place's meter, the boss's moments, and at the fall the board and an unsigned receipt the game rolls into the pack.
import { INVASION_SEAM } from '../../net/bossSeam.js';
import { INVASION_TICK_MS, INVASION_NATIVE_PER_M, invasionResume } from '../../net/invasion/invasionBrain.js';
import { validInvasionIn, validInvasionOut } from '../../net/invasion/invasionWire.js';
import {
  staffEventBegun,
  staffEventLapsed,
  staffLedgerState,
  staffEventEarned,
  staffEventBoard,
  TB_INVASION,
} from '../../net/staffEvent/staffEventLaw.js';
import { mintStaffReceipt } from '../../net/staffEvent/staffEventReceipt.js';
import { mapPixelOfWire, worldRoom, SOCIAL_ROOM } from '../../net/wire.js';

/** The account a local fight names (the local runner's, systems/toybox/localToyboxEvents.js LOCAL_ACCOUNT). */
export const LOCAL_INVASION_ACCOUNT = 'local';

/** The invasions whose boss fell here, by id (the local runner ends their rows). */
let _fell = new Set();
/** Did this event's boss fall in this machine's own fight? @param {unknown} id */
export const invasionFell = (id) => typeof id === 'string' && _fell.has(id);
/** Test seam. */
export function _resetLocalInvasions() {
  _fell = new Set();
}

/**
 * THE LOCAL CELL. `events()` the staff events this machine holds; `pose()` my feet in native units `{x, z, dd}` (null
 * unknown); `deliver(word)` a cell's word to the field; `sev(frame, room)` a staff frame to the game; `now`, `rand` the
 * clock and a uniform draw; `name()` my name.
 * @param {{ events: () => any[], pose: () => ({x: number, z: number, dd?: boolean}|null), deliver: (word: any) => void,
 *   sev: (frame: any, room: string) => void, now?: () => number, rand?: () => number, name?: () => string }} deps
 */
export function createLocalInvasion({ events, pose, deliver, sev, now = Date.now, rand = Math.random, name = () => '' }) {
  /** @type {Map<string, any>} */
  const fights = new Map();
  let beatAt = -Infinity;
  /** @type {Promise<any>} */
  let chain = Promise.resolve();
  const say = (/** @type {any} */ word) => {
    const checked = validInvasionOut(word);
    if (!checked) return;
    try {
      deliver(checked);
    } catch (e) {
      console.warn('[inv] local word', /** @type {any} */ (e)?.message ?? e);
    }
  };
  const sayStaff = (/** @type {any} */ frame, /** @type {string} */ room) => {
    try {
      sev(frame, room);
    } catch (e) {
      console.warn('[inv] local frame', /** @type {any} */ (e)?.message ?? e);
    }
  };
  const eventOf = (/** @type {string} */ id) => (events() ?? []).find((event) => event?.id === id) ?? null;
  const frameOf = (/** @type {any} */ fight, /** @type {any} */ feet) => ({
    x: (feet.x - fight.sx) / INVASION_NATIVE_PER_M,
    z: (feet.z - fight.sz) / INVASION_NATIVE_PER_M,
  });

  /** The ledger said as the relay says it; its moments to the screen once each; at the fall the reward. */
  function settle(/** @type {any} */ fight, /** @type {any} */ event) {
    const led = fight.led;
    const mark = `${led.n}|${led.bu}|${led.bk}`;
    if (mark === fight.keptMark) return;
    const before = fight.keptMark ?? '0|0|0';
    fight.keptMark = mark;
    const cell = worldRoom(event.px, event.py);
    sayStaff(staffLedgerState(led), cell);
    if (led.bu && before.split('|')[1] !== '1') sayStaff({ k: 'tb', id: event.id, s: 'boss' }, SOCIAL_ROOM);
    if (!led.bk || led.rw) return;
    led.rw = 1;
    led.top = staffEventBoard(led, event);
    chain = chain
      .then(async () => {
        sayStaff({ k: 'bd', id: event.id, top: led.top }, cell);
        const mine = staffEventEarned(led, event).find((row) => row.acct === LOCAL_INVASION_ACCOUNT);
        if (mine) {
          const receipt = await mintStaffReceipt(
            { v: event.id, s: LOCAL_INVASION_ACCOUNT, c: Math.floor(rand() * 0x100000000) >>> 0, r: mine.rank, tb: event.tb },
            null,
            { subtle: /** @type {any} */ (globalThis.crypto?.subtle), nowS: Math.floor(now() / 1000) },
          );
          sayStaff({ k: 'rc', id: event.id, r: receipt }, cell);
        }
        sayStaff({ k: 'tb', id: event.id, s: 'won' }, SOCIAL_ROOM);
        _fell.add(event.id);
      })
      .catch((e) => console.warn('[inv] local reward', e?.message ?? e));
  }

  return {
    /** A word of mine to the cell (the field's send): answers whether it was taken. @param {any} word */
    send(word) {
      const msg = validInvasionIn(word);
      if (!msg) return false;
      const event = eventOf(msg.id);
      const at = now();
      if (!event || event.tb !== TB_INVASION || !staffEventBegun(event, at) || staffEventLapsed(event, at)) {
        say({ k: 'no', id: msg.id, m: 'gone' });
        return true;
      }
      let fight = fights.get(event.id) ?? null;
      const me = pose();
      const feet = me && !me.dd ? me : null;
      if (fight) for (const said of invasionResume(fight, at)) say(said);
      if (msg.k === 'in') {
        const [px, py] = feet ? mapPixelOfWire(feet.x, feet.z) : [-1, -1];
        if (px !== event.px || py !== event.py) {
          say(fight ? INVASION_SEAM.stateOf(fight) : { k: 'no', id: event.id, m: 'far' });
          return true;
        }
        if (!fight && feet) {
          fight = INVASION_SEAM.new({ ev: event, sx: Math.round(feet.x), sz: Math.round(feet.z), now: at });
          fights.set(event.id, fight);
        }
        INVASION_SEAM.join(fight, LOCAL_INVASION_ACCOUNT, name() ?? '', msg.lv, at);
        say(INVASION_SEAM.stateOf(fight));
        return true;
      }
      if (!fight?.players?.[LOCAL_INVASION_ACCOUNT] || fight.fell) return true;
      INVASION_SEAM.hit(fight, LOCAL_INVASION_ACCOUNT, msg.d, msg.r, feet ? frameOf(fight, feet) : null, at, null, { i: msg.i });
      if (fight.fell) {
        settle(fight, event);
        say(INVASION_SEAM.stateOf(fight));
      }
      return true;
    },
    /** A frame's beat: each live fight stepped over my body, its ledger said; a fight whose event is gone forgotten. */
    tick() {
      const at = now();
      if (at - beatAt < INVASION_TICK_MS) return;
      beatAt = at;
      const me = pose();
      for (const [id, fight] of [...fights]) {
        const event = eventOf(id);
        if (!event) {
          fights.delete(id);
          continue;
        }
        if (fight.fell) continue;
        const bodies = me ? [{ sub: LOCAL_INVASION_ACCOUNT, ...frameOf(fight, me), dead: !!me.dd }] : [];
        for (const said of INVASION_SEAM.step(fight, at, bodies, rand)) say(said);
        settle(fight, event);
      }
    },
    /** Test seams: the fights, and every reward in flight done. */
    _fights: () => fights,
    settled: () => chain,
  };
}
