// @ts-check
// THE HOVER LAW: every body piece of the Aura Armory floats a small gap off the part it belongs to and never touches it.
// A slot's gap is measured from the body's own reach round the line a piece hangs on (ARMORY_BODY); each piece, side and
// ring bobs on a phase of its own, so nothing bobs in step; a piece trails its wearer's motion a little; a loose ring's
// tilt turns slowly round its limb; and a ring fades out on its side toward the body, where an arm or a shin stands
// closer to the torso or the other leg than the gap. The pass (armoryPass.js) places every piece by it. Each law is in JS
// for the placing and the tests, and the ring's fade and a pattern's turn in GLSL too; the tests hold the two to each
// other. Every rate is whole over the auras' clock. Not a DFU member.
import { AURA_CLOCK_PERIOD } from './auraRing.js';

const TAU = 2 * Math.PI;

/** THE GAP a slot's pieces keep from the body (m, at the body's scale), and how high they bob (m, either way). */
export const ARMORY_HOVER = Object.freeze({
  head: Object.freeze({ gap: 0.07, bob: 0.012 }),
  torso: Object.freeze({ gap: 0.07, bob: 0.01 }),
  arms: Object.freeze({ gap: 0.06, bob: 0.008 }),
  legs: Object.freeze({ gap: 0.05, bob: 0.008 }),
});
/** THE BODY'S REACH a gap is measured from (m, at its scale): round the head's middle, round an upper arm's line, a
 *  forearm's, an ankle's (a boot's) and a shin's; and the back behind the chest's face. */
export const ARMORY_BODY = Object.freeze({ head: 0.11, upper: 0.06, fore: 0.05, ankle: 0.088, shin: 0.07, back: 0.22 });
/** The rates (Hz), each whole over the auras' clock: each slot's bob, and how fast a loose ring's tilt turns round its
 *  limb - the crown's sway, the Ashbound's chain rings, the Eternal rings, the Cinderstride's. A crystal spur's own
 *  spin, and its sway round the arm. */
export const ARMORY_HOVER_HZ = Object.freeze({
  head: 1 / 5,
  torso: 1 / 4,
  arms: 1 / 3,
  legs: 1 / 4,
  crown: 1 / 12,
  chain: 1 / 20,
  eternal: 1 / 10,
  cinder: 1 / 15,
  spin: 1 / 8,
  sway: 1 / 6,
});
/** THE LAG: a piece trails its wearer's motion by `s` seconds of it, at most `share` of its slot's gap. */
export const ARMORY_LAG = Object.freeze({ s: 0.008, share: 0.45 });
/** A RING OPEN TOWARD THE BODY: lit where its surface's cosine to the body is under `from`, gone past `to`. */
export const ARMORY_OPEN = Object.freeze({ from: 0.3, to: 0.72 });

const fract = (/** @type {number} */ x) => x - Math.floor(x);
const smooth = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ x) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
/** @typedef {'head'|'torso'|'arms'|'legs'} HoverSlot */

/** A piece's own phase (0..1) for its side or ring `k`: a hash of both, mixed through, so two parts a character apart
 *  bob nowhere near in step. Pure. */
export function armoryPhase(/** @type {string} */ key, k = 0) {
  let h = 2166136261;
  for (const c of `${key}:${k}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** A slot's bob at the clock `t` for phase `ph`: how far up (m, at the body's scale). Pure. */
export const armoryBob = (/** @type {HoverSlot} */ slot, /** @type {number} */ ph, /** @type {number} */ t) =>
  ARMORY_HOVER[slot].bob * Math.sin(TAU * (t * ARMORY_HOVER_HZ[slot] + ph));
/** How far a slot's piece trails a wearer moving at `vel` (m/s): [x, z] in metres, at most its share of the gap. Pure. */
export function armoryLag(/** @type {HoverSlot} */ slot, /** @type {ArrayLike<number>|null|undefined} */ vel, s = 1) {
  const vx = Number.isFinite(vel?.[0]) ? /** @type {number} */ (vel?.[0]) : 0;
  const vz = Number.isFinite(vel?.[2]) ? /** @type {number} */ (vel?.[2]) : 0;
  const most = ARMORY_LAG.share * ARMORY_HOVER[slot].gap * s, len = Math.hypot(vx, vz) * ARMORY_LAG.s;
  const k = len > most ? most / len : 1;
  return [-vx * ARMORY_LAG.s * k, -vz * ARMORY_LAG.s * k];
}
/** WHERE A PART FLOATS from its rest: [x, y, z] (m) - its bob up and its lag behind the motion. Pure. */
export function armoryHoverAt(
  /** @type {HoverSlot} */ slot,
  /** @type {number} */ ph,
  /** @type {number} */ t,
  /** @type {ArrayLike<number>|null|undefined} */ vel,
  s = 1,
) {
  const [x, z] = armoryLag(slot, vel, s);
  return [x, armoryBob(slot, ph, t) * s, z];
}
/** A LOOSE RING'S AXIS: the limb's way `d` tipped `tilt` (rad) toward a side that turns round it at `hz`, from the
 *  ring's phase - `ref` the way that side starts from (the body's forward). A unit vector. Pure. */
export function armoryRingAxis(
  /** @type {ArrayLike<number>} */ d,
  /** @type {ArrayLike<number>} */ ref,
  /** @type {number} */ tilt,
  /** @type {number} */ hz,
  /** @type {number} */ ph,
  /** @type {number} */ t,
) {
  const along = ref[0] * d[0] + ref[1] * d[1] + ref[2] * d[2];
  let e1 = [ref[0] - d[0] * along, ref[1] - d[1] * along, ref[2] - d[2] * along], l = Math.hypot(e1[0], e1[1], e1[2]);
  if (!(l > 1e-6)) {
    e1 = Math.abs(d[1]) < 0.9 ? [-d[2], 0, d[0]] : [1, 0, 0];
    l = Math.hypot(e1[0], e1[1], e1[2]);
  }
  e1 = [e1[0] / l, e1[1] / l, e1[2] / l];
  const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
  const a = TAU * (t * hz + ph), c = Math.cos(tilt), s = Math.sin(tilt);
  const w = [0, 1, 2].map((i) => e1[i] * Math.cos(a) + e2[i] * Math.sin(a));
  const out = [0, 1, 2].map((i) => d[i] * c + w[i] * s), n = Math.hypot(out[0], out[1], out[2]) || 1;
  return [out[0] / n, out[1] / n, out[2] / n];
}
/** The way from a limb's line toward the body - `toward` (the chest, the hips) less its part along the limb `d` - a
 *  unit vector, or none (0) where the body stands on the line. Pure. */
export function armoryInward(/** @type {ArrayLike<number>} */ from, /** @type {ArrayLike<number>} */ toward, /** @type {ArrayLike<number>} */ d) {
  const v = [toward[0] - from[0], toward[1] - from[1], toward[2] - from[2]], k = v[0] * d[0] + v[1] * d[1] + v[2] * d[2];
  const p = [v[0] - d[0] * k, v[1] - d[1] * k, v[2] - d[2] * k], l = Math.hypot(p[0], p[1], p[2]);
  return l > 1e-6 ? [p[0] / l, p[1] / l, p[2] / l] : [0, 0, 0];
}
/** A ring's light at a point whose surface's cosine to the body is `c`: whole away from it, none facing it. Pure. */
export const armoryOpen = (/** @type {number} */ c) => 1 - smooth(ARMORY_OPEN.from, ARMORY_OPEN.to, c);
/** A pattern at `u` round its ring, turned at `hz` turns a second by the clock `t`: its new `u`. Pure. */
export const armorySpin = (/** @type {number} */ u, /** @type {number} */ hz, /** @type {number} */ t) => fract(u - t * hz);
/** Every rate whole over the auras' clock, so nothing jumps at its wrap. Pure. */
export const armoryHoverWhole = () =>
  Object.values(ARMORY_HOVER_HZ).every((r) => {
    const n = r * AURA_CLOCK_PERIOD;
    return n > 0 && Math.abs(n - Math.round(n)) < 1e-9;
  });

/** A number as GLSL writes a float. */
const g = (/** @type {number} */ x) => {
  const s = String(+x.toFixed(6));
  return /[.e]/.test(s) ? s : `${s}.0`;
};
/** THE LAW IN GLSL (after the pass's shared uniforms, `uTime` among them): a ring's fade toward the body, and a pattern
 *  turned round its ring, its rate given as its whole period (s) so the GPU divides by it exactly. */
export const ARMORY_HOVER_GLSL = `
float armoryOpen(float c) { return 1.0 - smoothstep(${g(ARMORY_OPEN.from)}, ${g(ARMORY_OPEN.to)}, c); }
float armorySpin(float u, float per) { return fract(u - uTime / per); }
`;
/** A rate (Hz) as the period GLSL's armorySpin takes. */
export const armorySpinPer = (/** @type {number} */ hz) => g(Math.round(1 / hz));
