// @ts-check
// AN INVASION'S BLOWS: every blow a stamp on the ground (the gate's shapes, net/eliteGates/egShape.js) laid with its
// wind-up and judged on each struck player's own machine. The boss has three phases, cut where the gate's are, the third
// where the invasion's endless waves begin. Each phase adds a heavy blow to its turn: the slam, then the cleave and the
// charge, then the stomp. All are physical. Pure; the brain (invasionBrain.js) lays them.
import { shDisc, shCone, shLaneAt, shRing, egStampOk, egFloorWindup } from '../eliteGates/egShape.js';
import { INVASION_PHASE3_AT } from '../../systems/toybox/toyboxLaw.js';

/** The blows by wire number. */
export const INVASION_BLOW = Object.freeze({ swing: 0, slam: 1, cleave: 2, charge: 3, stomp: 4 });
/** The boss's phases: its second at the gate's first mark (gateBrain.js PHASE_AT, held equal by the invasion's tests -
 *  the wire reads this file and must not bring the gate's brain), its third where the endless waves begin. */
export const INVASION_PHASE_AT = Object.freeze([0.66, INVASION_PHASE3_AT]);
export const INVASION_PHASES = 3;
/** The phase of a boss with `health` of `most` left (1..3). @param {number} health @param {number} most */
export const invasionPhaseOf = (health, most) => {
  const frac = most > 0 ? health / most : 1;
  return frac <= INVASION_PHASE_AT[1] ? 3 : frac <= INVASION_PHASE_AT[0] ? 2 : 1;
};

/** Its slam: wound up this long, a disc this wide about its feet, this share of a struck player's maximum health. It
 *  throws a heavy blow only while a fighter stands within INVASION_SLAM_NEAR_M of it. */
export const INVASION_SLAM_EVERY_MS = 11000;
export const INVASION_SLAM_WINDUP_MS = 1800;
export const INVASION_SLAM_RADIUS_M = 7;
export const INVASION_SLAM_SHARE = 0.45;
export const INVASION_SLAM_NEAR_M = 40;
/** The heavy blows: the phase each comes in at, its wind-up (ms), its share, its shape's numbers (m, degrees). The charge
 *  carries the boss down its lane over `dash` ms as it lands. */
export const INVASION_HEAVY = Object.freeze({
  slam: Object.freeze({ a: INVASION_BLOW.slam, ph: 1, windup: INVASION_SLAM_WINDUP_MS, share: INVASION_SLAM_SHARE, r: INVASION_SLAM_RADIUS_M }),
  cleave: Object.freeze({ a: INVASION_BLOW.cleave, ph: 2, windup: 1500, share: 0.35, r: 11, arc: 110 }),
  charge: Object.freeze({ a: INVASION_BLOW.charge, ph: 2, windup: 1700, share: 0.4, len: 24, w: 4, dash: 900 }),
  stomp: Object.freeze({ a: INVASION_BLOW.stomp, ph: 3, windup: 2100, share: 0.4, r0: 4, r1: 15 }),
});
/** A heavy blow this often, by phase (ms); the third phase's wind-ups this much shorter, never under the gate's floor. */
export const INVASION_HEAVY_EVERY_MS = Object.freeze([INVASION_SLAM_EVERY_MS, 8500, 6500]);
export const INVASION_PHASE3_WINDUP_X = 0.85;
/** A charge is thrown only at a mark at least this far off (m). */
export const INVASION_CHARGE_FROM_M = 6;
/** Its swing between heavy blows, and a wave foe's: each a disc about the striker's feet. */
export const INVASION_BOSS_SWING = Object.freeze({ windup: 1100, recover: 900, r: 4.5, share: 0.2 });
export const INVASION_FOE_SWING = Object.freeze({ windup: 800, recover: 900, r: 2.2, share: 0.06 });
/** A stamp's coordinates are bounded at this (m from the site): past the arena and the ring a wave rises on. */
export const INVASION_STAMP_BOUND = 400;

/**
 * THE HEAVY BLOW the boss throws now, or null: one its phase allows that fits how far its mark stands (`gap`, m), never
 * the last one twice while another fits. @param {number} phase @param {number} gap @param {string|null} last
 * @param {() => number} rng
 */
export function invasionHeavyPick(phase, gap, last, rng) {
  const fits = Object.entries(INVASION_HEAVY).filter(([key, kit]) => {
    if (kit.ph > phase) return false;
    if (key === 'cleave') return gap <= INVASION_HEAVY.cleave.r;
    if (key === 'charge') return gap >= INVASION_CHARGE_FROM_M && gap <= INVASION_HEAVY.charge.len;
    return true;
  });
  const fresh = fits.length > 1 ? fits.filter(([key]) => key !== last) : fits;
  if (!fresh.length) return null;
  return fresh[Math.floor(rng() * fresh.length) % fresh.length][0];
}

/**
 * A heavy blow's stamp, thrown from (x, z) facing `yaw` (egShape's: 0 toward +z), and its wind-up in phase `phase`.
 * Null when the shape would leave the frame. @param {string} key @param {number} x @param {number} z @param {number} yaw
 * @param {number} phase @returns {{ st: any[], wu: number } | null}
 */
export function invasionHeavyStamp(key, x, z, yaw, phase) {
  const kit = /** @type {any} */ (INVASION_HEAVY)[key];
  if (!kit) return null;
  const stamp =
    key === 'cleave'
      ? shCone(x, z, yaw, kit.r, kit.arc)
      : key === 'charge'
        ? shLaneAt(x, z, yaw, kit.len, kit.w)
        : key === 'stomp'
          ? shRing(x, z, kit.r0, kit.r1)
          : shDisc(x, z, kit.r);
  if (!egStampOk(stamp, INVASION_STAMP_BOUND)) return null;
  const windup = Math.round(kit.windup * (phase >= 3 ? INVASION_PHASE3_WINDUP_X : 1));
  return { st: stamp, wu: egFloorWindup(windup, [stamp]) };
}

/** A swing's stamp: a disc about the striker's feet. @param {number} x @param {number} z @param {number} radius */
export const invasionSwingStamp = (x, z, radius) => shDisc(x, z, radius);
