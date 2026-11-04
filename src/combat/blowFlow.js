// @ts-check
// BLOW-FLOW (2026-10-26, Mac: "when the character stops striking the weapon snaps back to where it was - sharp,
// unnatural, instant"): the arm stays where its blow left it for BLOW_FLOW.hold seconds (the window a next blow
// continues the exchange from) and only then goes back to the stance - over BLOW_FLOW.exit seconds, blended
// (blowBlendSeconds), in the first person as in the third; a blow cut by the next is blended over BLOW_FLOW.chain, and
// the sections of one blow never (they are one clip).
//
// MW-PACE2 (2026-10-26, Mac: "the blows are jerky - many animations very fast, some at different speeds; better fewer
// blows, but smooth, calm and in step"): THE PLAYER'S ARM LEADS ITS OWN BLOW. MW-PACE1 fitted every section to
// Daggerfall's machine - a chop's 0.67 file seconds to its hit squeezed into two ticks (four times the clip's speed, up
// to twelve), the follow-through into what was left - so each blow ran at its own speed, each section at another, and
// the machine's next strike cut the last half-played. Under the player's own Morrowind arm (combat/weapon/weaponRig.js
// hands it `lead`), one blow plays at ONE speed from its wind-up to its follow-through's end: every attack type reaches
// its hit in the same time (calmHitSeconds - the machine's tick, the character's Speed, held to a calm band), the hit's
// damage waits for the arm's (combat/weapon/armLedBlow.js), and the machine starts no blow while the arm still throws
// one. Fewer blows, each whole. A peer's and a person's arm keep MW-PACE1: their damage is not theirs to hold.
// Departures from the reference's pace (each section at the record's speed) and from MW-PACE1's.

import { clamp01, smooth } from '../characters/bodyMotion/bodyKit.js';

/** The flow's seconds: THE SERIES' WINDOW (`hold`) - the player's blow held where it struck, the release's last frame,
 *  both views (Mac: "the window is a separate animation, not a pause at the end of the blow - it jerks"): the follow-
 *  through, Morrowind's weapon going back to the stance, is not played, and a next blow starts from the held pose; the
 *  return to the stance once the window is spent (`exit`, eased, the carry with it - bodyMotion.js blowReturn); a blow
 *  cut by the next; and a blow begun from the stance (`entry` - its wind-up's first frame is not the stance's pose: at
 *  once, the blade leapt across the picture in a frame, in both views and whatever AnimationBlendDuration says). */
export const BLOW_FLOW = Object.freeze({ hold: 0.55, thrustHold: 0.35, exit: 0.5, chain: 0.12, entry: 0.14, wait: 2 });
/** The window a blow holds where it struck: a thrust's the shorter - a jab's arm out straight comes back sooner than a
 *  cut ended low (Mac: "check the window after the one- and two-handers' thrusts"). */
export const holdFor = (attackType) => (attackType === 'thrust' ? BLOW_FLOW.thrustHold : BLOW_FLOW.hold);

/** SERIES-FLOW (Mac: "held or tapped, the blows should run as one series - the window only when the player stops"):
 *  Daggerfall's machine lets the next blow begin only at its strike's end - a second at Speed 50, 1.6 s for the fists'
 *  left - and the arm lands its blow in half that. While the player is still attacking (combat/weapon/attackSeries.js
 *  says so) the arm does not freeze for the rest: it carries on into the blow's follow-through, slowly - `drift` of it
 *  over the time the machine still takes - and the next blow takes it from wherever it stands (BLOW_FLOW.chain). It
 *  waits so at most BLOW_FLOW.wait seconds; the window and the stance are for a series that has ended. */
export const SERIES_DRIFT = 0.85;
/** The follow-through's base speed while a series waits on the machine: `drift` of its `span` (file seconds) over the
 *  `left` seconds of the machine's strike under recoverRate's braking profile (it covers SERIES_DRIFT of the span in
 *  about `left`), never faster than `rate` nor slower than a twentieth. */
export function driftRate(span, left, rate = 1) {
  const r = (Number.isFinite(span) && span > 0 ? span * SERIES_DRIFT : 0) / Math.max(0.05, Number.isFinite(left) ? left : 0.05);
  return Math.min(rate > 0 ? rate : 1, Math.max(0.05, r));
}

/** MW-PACE3 (Mac: "a toy fight - no sharpness; the two-hander's and the one-hander's overhead blows slow, a frozen
 *  last frame, the thrusts long"): a blow's sections at their OWN speeds, as a fighter moves - the wind-up a little
 *  quicker than the clip (`wind`), the release snapped (`release`), and after the hit the recovery with inertia: the
 *  follow-through starts at `recover` and brakes to `settle` of it, so the weapon eases back toward the stance and
 *  never stands on a still frame. All times the Speed factor (CALM's band, 1 at Speed 50). */
export const PACE = Object.freeze({ wind: 1.35, release: 2.2, recover: 1.4, settle: 0.25 });

/** The recovery's speed `p` (0..1) through the follow-through: an ended series brakes from PACE.recover x sf to its
 *  settle; a series still going plays its `base` (driftRate) from 1.5x down to 0.5x - quick off the hit, slow by
 *  the next blow - so the arm is still moving when the machine lets the next blow go. */
export function recoverRate(plan, p, series) {
  const q = Math.min(1, Math.max(0, Number.isFinite(p) ? p : 1));
  if (series && plan?.seriesBase > 0) return plan.seriesBase * (1.5 - q);
  const top = PACE.recover * (plan?.sf > 0 ? plan.sf : 1);
  return top * (1 - (1 - PACE.settle) * q);
}

/** MW-PACE2's band: the hit `hitTicks` of the machine's ticks after the blow begins, never sooner than `min` seconds nor
 *  later than `max`; the one speed the blow plays at held to `rateMin`..`rateMax` times the clip's own. */
// (Mac: "the two-hander's blows too fast, jerky" at 2.2; "some blows fall out of the picture, too slow")
// `ref`: the clip seconds a typical blow takes to its hit (retail's chops and slashes, 0.53 to 0.87) - ONE SPEED for every
// blow, ref over calmHitSeconds, so a short jab lands sooner and a long chop later, all moving alike. Fitting each to the
// same hit time instead ran a thrust at 0.85-0.97x beside its weapon's chop at 1.45x, and ReAnimation's fists at 0.73x.
export const CALM = Object.freeze({ hitTicks: 5.5, min: 0.36, max: 0.55, ref: 0.67, rateMin: 1, rateMax: 1.5 });

/** When the player's blow lands, in seconds from its start: the same for every attack type, by the machine's tick. */
export function calmHitSeconds(step) {
  const s = Number.isFinite(step) && step > 0 ? step * CALM.hitTicks : CALM.max;
  return Math.min(CALM.max, Math.max(CALM.min, s));
}

/** The Speed factor: 1 at Speed 50's tick, faster for a quicker character, held to CALM's band. */
export const paceFactor = (step) => Math.min(CALM.rateMax, Math.max(CALM.rateMin, CALM.max / calmHitSeconds(step)));

/** MW-PACE2/3: the player's blow's plan (`lead`: the arm leads it) - the wind-up's `wind` file seconds at windRate,
 *  the release's `release` at relRate (MW-PACE3), landing at `hitAt`; the follow-through's speed is recoverRate's. */
export function calmBlowPlan(blow, wind, release) {
  const sf = paceFactor(blow?.step);
  const windRate = PACE.wind * sf, relRate = PACE.release * sf;
  const w = Number.isFinite(wind) && wind > 0 ? wind : 0, r = Number.isFinite(release) && release > 0 ? release : 0;
  return { seconds: blow?.seconds ?? 0, hitAt: w / windRate + r / relRate, clock: 0, rate: windRate, windRate, relRate, sf, seriesBase: 0, lead: true };
}

/** A pose's kind for the blend: a blow (its serial - the sections of one blow are one kind) or anything else. */
export const poseKindOf = (attacking, serial) => (attacking ? `blow:${serial}` : 'pose');

/** SECTION-SEAM (2026-10-28, Motion-Doctrine.md 7e, measured in the owner's game): the sections of one blow join where
 *  one stops and the next starts - but a pack's "small follow start" can sit 0.07 s past its "hit" (the shield's
 *  longsword: the blade 0.31 m, the shield's hand 0.16 m in one frame, every slash). A seam wider than `tolerance`
 *  file seconds is blended over `seconds`, from the pose shown. OpenMW plays the follow from its own key and leaps. */
export const SECTION_SEAM = Object.freeze({ tolerance: 0.01, seconds: 0.08 });
/** The file time a clip state shows - a reversed section's mirrored (MS1). */
const shownTime = (s) => (s.reversed ? s.startTime + s.stopTime - s.time : s.time);
/** The gap, in file seconds, between where `prev` stopped and where `next` starts - 0 when either is missing. */
export const sectionGap = (prev, next) => (prev && next && Number.isFinite(prev.time) && Number.isFinite(next.time) ? Math.abs(shownTime(prev) - shownTime(next)) : 0);

/** How long to blend a change of pose from `from` to `to` (poseKindOf's), or null for the view's own default; `prev` and
 *  `next` the clip states, for a seam inside one blow (SECTION_SEAM). */
export function blowBlendSeconds(from, to, prev = null, next = null) {
  const fromBlow = String(from ?? '').startsWith('blow:'), toBlow = String(to ?? '').startsWith('blow:');
  if (fromBlow && toBlow) return from !== to ? BLOW_FLOW.chain : sectionGap(prev, next) > SECTION_SEAM.tolerance ? SECTION_SEAM.seconds : 0;
  if (fromBlow) return BLOW_FLOW.exit;
  if (toBlow) return BLOW_FLOW.entry;
  return null;   // any other change: the view's own
}
/** The blend's weight at `elapsed` of `seconds` - eased, so the arm leaves its blow and arrives at the stance slowly. */
export const blendWeightAt = (elapsed, seconds) => (seconds > 0 ? smooth(clamp01(elapsed / seconds)) : 1);

/** Each of `n` in turn, per key - the next never the last while another is there. */
export function createVariantCycle() {
  const at = new Map();
  return {
    next(key, n) {
      if (!(n > 1)) return 0;
      const i = ((at.get(key) ?? -1) + 1) % n;
      at.set(key, i);
      return i;
    },
  };
}

/** SHIELD-BASH, the one-hander's: a thrust behind a shield is the sword's thrust and the shield's bash in turn (the bash
 *  every other time, so neither runs twice); the fists' thrust behind a shield is always the bash. */
export function bashesNow({ thrust = false, shield = false, fists = false, cycle = null } = {}) {
  if (!thrust || !shield) return false;
  return fists || (cycle ? cycle.next('shield-bash', 2) === 1 : false);
}
