// @ts-check
// A CALLED DRAGON'S FIGHT WITH NO RELAY: the cell's half of server/src/dragonFights.js for one player on this machine, so
// the toybox's Dragon Attack runs offline as it runs online. It hears the host's `in` and `hit` (scenes/dragonHost.js),
// keeps the fight by the relay's own brain (net/bossSeam.js DRAGON_SEAM), steps it every DRAGON_TICK_MS and answers in
// the cell's words (net/wire.js validDragonOut's shapes) through `deliver`. Only a called dragon (dragonLaw.js
// dragonCalledOf) comes down offline: a hidden one is the relay's secret. Its receipt is unsigned and goes to `hoard`,
// which rolls the hoard into the pack with no claim; a tame is the account service's draw, so none comes offline.
import { DRAGON_SEAM } from '../../net/bossSeam.js';
import { DRAGON_TICK_MS, DRAGON_ADMIT_R, dragonResume, dragonEarnedBy } from '../../net/dragon/dragonBrain.js';
import {
  dragonAdmits,
  dragonHolds,
  dragonTimes,
  dragonLookOf,
  dragonSiteOk,
  dragonPlaceOf,
  DRAGON_NATIVE_PER_M,
} from '../../net/dragon/dragonLaw.js';
import { roostLeg } from '../../net/dragon/dragonBody.js';
import { mintDragonReceipt } from '../../net/dragon/dragonReceipt.js';
import { validDragonOut } from '../../net/wire.js';

/** The account a local fight names. */
export const LOCAL_DRAGON_ACCOUNT = 'local';
/** A fight is forgotten this long after its leaving, ms (the relay's DRAGON_KEEP_MS). */
const LOCAL_KEEP_MS = 2 * 60 * 60 * 1000;

/**
 * THE LOCAL CELL. `called()` the called omens this machine holds; `pose()` my feet in native units `{x, z, dd}` (null
 * unknown); `deliver(word)` a cell's word to the game; `hoard(receipt)` my receipt at the kill; `fell(eventId)` the
 * called event its dragon fell in; `now`, `rand` the clock and a uniform draw; `name()` my name.
 * @param {{ called: () => any[], pose: () => ({x: number, z: number, dd?: boolean}|null), deliver: (word: any) => void,
 *   hoard?: (receipt: string) => void, fell?: (eventId: string) => void, now?: () => number, rand?: () => number,
 *   name?: () => string }} deps
 */
export function createLocalDragonFights({
  called,
  pose,
  deliver,
  hoard = () => {},
  fell = () => {},
  now = Date.now,
  rand = Math.random,
  name = () => '',
}) {
  /** @type {Map<string, any>} */
  const fights = new Map();
  let beatAt = -Infinity;
  const say = (/** @type {any} */ word) => {
    const checked = validDragonOut(word);
    if (!checked) return;
    try {
      deliver(checked);
    } catch (e) {
      console.warn('[dragon] local word', /** @type {any} */ (e)?.message ?? e);
    }
  };
  const fan = (/** @type {any} */ fight, /** @type {any[]} */ frames) => {
    for (const frame of frames) say({ ...frame, w: fight.w, sx: fight.sx, sz: fight.sz });
  };
  /** A native point in a fight's site frame, metres. */
  const frameOf = (/** @type {any} */ fight, /** @type {any} */ point) => ({
    x: (point.x - fight.sx) / DRAGON_NATIVE_PER_M,
    z: (point.z - fight.sz) / DRAGON_NATIVE_PER_M,
  });
  const omenOf = (/** @type {any} */ word) =>
    (called() ?? []).find((omen) => omen.ev === word.ev && omen.w === word.w && dragonSiteOk(omen, word.sx, word.sz)) ??
    null;

  /** My `in`: the fight born at its first, joined, and its whole state said. @param {any} word */
  function joinIn(word) {
    const omen = omenOf(word),
      id = `${word.w}@${word.ev}`,
      at = now();
    let fight = fights.get(id) ?? null;
    const me = pose();
    if (!me || me.dd) return;
    if (Math.hypot((me.x - word.sx) / DRAGON_NATIVE_PER_M, (me.z - word.sz) / DRAGON_NATIVE_PER_M) > DRAGON_ADMIT_R) {
      say({ k: 'no', m: 'far' });
      return;
    }
    if (!omen || !dragonHolds(omen, at)) {
      say(fight ? DRAGON_SEAM.stateOf(fight) : { k: 'no', m: 'gone' });
      return;
    }
    if (!fight) {
      if (!dragonAdmits(omen, at)) {
        say({ k: 'no', m: 'gone' });
        return;
      }
      fight = DRAGON_SEAM.new({
        w: omen.w,
        b: dragonLookOf(omen),
        sx: word.sx,
        sz: word.sz,
        now: at,
        leaveAt: dragonTimes(omen).leaveAt,
        roost: roostLeg(omen),
      });
      fight.ev = omen.ev;
      fights.set(id, fight);
    } else fan(fight, dragonResume(fight, at));
    const joined = DRAGON_SEAM.join(fight, LOCAL_DRAGON_ACCOUNT, name() ?? '', word.lv, at, null, {
      admits: dragonAdmits(omen, at),
    });
    say(DRAGON_SEAM.stateOf(fight));
    if (!joined) say({ k: 'no', m: fight.fell ? 'slain' : 'gone' });
  }
  /** The kill, said once: the fall said, its event told, my receipt minted unsigned and handed to the hoard.
   *  @param {any} fight @param {number} at */
  async function kill(fight, at) {
    if (fight.said) return;
    fight.said = true;
    const place = dragonPlaceOf(fight.sx, fight.sz);
    const { at: fellAt, top, n: count, dm: chart } = fight.fell;
    fan(fight, [
      { k: 'mv', legs: fight.legs },
      { k: 'fell', at: fellAt, top, n: count, ...(chart ? { dm: chart } : {}) },
    ]);
    try {
      fell(fight.ev);
    } catch (e) {
      console.warn('[dragon] local end', /** @type {any} */ (e)?.message ?? e);
    }
    if (!DRAGON_SEAM.earned(fight, LOCAL_DRAGON_ACCOUNT)) return;
    const mine = fight.players[LOCAL_DRAGON_ACCOUNT];
    const receipt = await mintDragonReceipt(
      {
        q: fight.w,
        ...(place >= 0 ? { p: place } : {}),
        b: fight.b,
        s: LOCAL_DRAGON_ACCOUNT,
        c: Math.floor(rand() * 0x100000000) >>> 0,
        x: dragonEarnedBy(fight, LOCAL_DRAGON_ACCOUNT),
        l: mine.lv,
      },
      null,
      { subtle: /** @type {any} */ (globalThis.crypto?.subtle), nowS: Math.floor(at / 1000) },
    );
    hoard(receipt);
  }
  /** @type {Promise<any>} */
  let chain = Promise.resolve();
  const settle = (/** @type {any} */ fight, /** @type {number} */ at) => {
    if (fight.fell && !fight.said)
      chain = chain.then(() => kill(fight, at)).catch((e) => console.warn('[dragon] local kill', e?.message ?? e));
  };

  return {
    /** A word of mine to the cell (the host's `online.send`): answers whether it was taken. @param {any} word */
    send(word) {
      if (word?.k === 'ask') return true; // a hidden omen is the relay's: none comes offline
      if (word?.k === 'in') {
        if (typeof word.ev === 'string') joinIn(word);
        return true;
      }
      if (word?.k !== 'hit') return false;
      const me = pose(),
        at = now();
      for (const fight of fights.values()) {
        if (!fight.players[LOCAL_DRAGON_ACCOUNT] || fight.fell || fight.gone) continue;
        fan(fight, dragonResume(fight, at));
        DRAGON_SEAM.hit(fight, LOCAL_DRAGON_ACCOUNT, word.d, word.r, me && !me.dd ? frameOf(fight, me) : null, at);
        settle(fight, at);
      }
      return true;
    },
    /** A frame's beat: each live fight stepped over my body, a kill said, an old fight forgotten. */
    tick() {
      const at = now();
      if (at - beatAt < DRAGON_TICK_MS) return;
      beatAt = at;
      const me = pose();
      for (const [id, fight] of [...fights]) {
        if (at >= fight.leaveAt + LOCAL_KEEP_MS) {
          fights.delete(id);
          continue;
        }
        if (fight.fell || fight.gone) continue;
        const spot = me ? frameOf(fight, me) : null;
        const bodies = spot ? [{ sub: LOCAL_DRAGON_ACCOUNT, x: spot.x, z: spot.z, dead: !!me?.dd }] : [];
        fan(fight, DRAGON_SEAM.step(fight, at, bodies, rand));
        settle(fight, at);
      }
    },
    /** Test seams: the fights, and every kill in flight done. */
    _fights: () => fights,
    settled: () => chain,
  };
}
