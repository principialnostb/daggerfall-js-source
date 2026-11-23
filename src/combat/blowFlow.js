import { modGroupEnabled } from '../systems/enhancedModResources.js';
// @ts-check
// The next strike can start during the hold. When it expires, blend the hands back toward their carry pose.

import { clamp01, smooth } from '../characters/bodyMotion/bodyKit.js';

/** Hold the end of the release long enough for a chained blow, then ease back into the carry pose. */
export const BLOW_FLOW = Object.freeze({ hold: 0.55, thrustHold: 0.35, exit: 0.5, chain: 0.12, entry: 0.14, wait: 2 });
/** A thrust returns sooner than a cut. Both views use the same opening for the next blow. */
/** The punch's timing keeps the hand moving through contact while allowing the recovery to finish. */
export const FIST_PACE = Object.freeze({ wind: 1.7, release: 2.9, recover: 2.4, settle: 0.6, hold: 0.05, exit: 0.17, entry: 0.08 });
export const holdFor = (attackType, fists = false) => (fists ? FIST_PACE.hold : attackType === 'thrust' ? BLOW_FLOW.thrustHold : BLOW_FLOW.hold);

/** A held or renewed press continues the series from the previous blow's finish. */
export const SERIES_DRIFT = 0.85;
/** The follow-through's base speed while a series waits on the machine: `drift` of its `span` (file seconds) over the
 *  `left` seconds of the machine's strike under recoverRate's braking profile (it covers SERIES_DRIFT of the span in
 *  about `left`), never faster than `rate` nor slower than a twentieth. */
export function driftRate(span, left, rate = 1) {
  const r = (Number.isFinite(span) && span > 0 ? span * SERIES_DRIFT : 0) / Math.max(0.05, Number.isFinite(left) ? left : 0.05);
  return Math.min(rate > 0 ? rate : 1, Math.max(0.05, r));
}

/** Wind-up and release rates scale separately so a long overhead clip can still strike sharply. */
export const PACE = Object.freeze({ wind: 1.35, release: 2.2, recover: 1.4, settle: 0.25 });

/** The recovery's speed `p` (0..1) through the follow-through: an ended series brakes from PACE.recover x sf to its
 *  settle; a series still going plays its `base` (driftRate) from 1.5x down to 0.5x - quick off the hit, slow by
 *  the next blow - so the arm is still moving when the machine lets the next blow go. */
export function recoverRate(plan, p, series) {
  const q = Math.min(1, Math.max(0, Number.isFinite(p) ? p : 1));
  const pace = plan?.fists ? FIST_PACE : PACE;   // FIST-SNAP
  const top = pace.recover * (plan?.sf > 0 ? plan.sf : 1);
  const lone = top * (1 - (1 - pace.settle) * q);
  // 
  // a series' follow-through is never slower than a lone blow's at the same point - an arm done early waits in the stance
  // BLOW-STYLE 'Прежний' (`plan.flow`): the series flows at the machine's pace, never under BLOW_STYLE.floor of a lone blow
  if (series && plan?.seriesBase > 0) return Math.max(lone * (plan.flow ? BLOW_STYLE.floor : 1), plan.seriesBase * (1.5 - q));
  return lone;
}

/** MW-PACE2's band: the hit `hitTicks` of the machine's ticks after the blow begins, never sooner than `min` seconds nor
 *  later than `max`; the one speed the blow plays at held to `rateMin`..`rateMax` times the clip's own. */
// Scale the clip's measured duration against its reference duration to keep two-handed blows consistent.
export const CALM = Object.freeze({ hitTicks: 5.5, min: 0.36, max: 0.55, ref: 0.67, rateMin: 1, rateMax: 1.5 });

/** When the player's blow lands, in seconds from its start: the same for every attack type, by the machine's tick. */
export function calmHitSeconds(step) {
  const s = Number.isFinite(step) && step > 0 ? step * CALM.hitTicks : CALM.max;
  return Math.min(CALM.max, Math.max(CALM.min, s));
}

/** The Speed factor: 1 at Speed 50's tick, faster for a quicker character, held to CALM's band. */
export const paceFactor = (step) => Math.min(CALM.rateMax, Math.max(CALM.rateMin, CALM.max / calmHitSeconds(step)));

/** A blow plan reports clip time and playback rates for the wind-up, release and recovery. */
export function calmBlowPlan(blow, wind, release, fists = false) {
  const sf = paceFactor(blow?.step), pace = fists ? FIST_PACE : PACE;   // FIST-SNAP
  const windRate = pace.wind * sf, relRate = pace.release * sf;
  const w = Number.isFinite(wind) && wind > 0 ? wind : 0, r = Number.isFinite(release) && release > 0 ? release : 0;
  return { seconds: blow?.seconds ?? 0, hitAt: w / windRate + r / relRate, clock: 0, rate: windRate, windRate, relRate, sf, seriesBase: 0, lead: true, fists: !!fists };
}

/** A pose's kind for the blend: a blow (its serial - the sections of one blow are one kind) or anything else. */
export const poseKindOf = (attacking, serial) => (attacking ? `blow:${serial}` : 'pose');

/** The sections of one blow join where
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
export function blowBlendSeconds(from, to, prev = null, next = null, fists = false) {
  const fromBlow = String(from ?? '').startsWith('blow:'), toBlow = String(to ?? '').startsWith('blow:');
  if (fromBlow && toBlow) return from !== to ? BLOW_FLOW.chain : sectionGap(prev, next) > SECTION_SEAM.tolerance ? SECTION_SEAM.seconds : 0;
  if (fromBlow) return fists ? FIST_PACE.exit : BLOW_FLOW.exit;   // The fist is taken back, not let down
  if (toBlow) return fists ? FIST_PACE.entry : BLOW_FLOW.entry;
  return null;   // any other change: the view's own
}
/** The Animations tab's choice
 *  (BlowStyle) - 0 'Прежний', the series as SERIES-FLOW had it (a click a series, the follow-through flowing into the
 *  next blow) held to `floor` of a lone blow's speed; 1 'Текущий', SERIES-PACE and SERIES-OWN-PRESS. */
export const BLOW_STYLE = Object.freeze({ floor: 0.6 });
export const flowStyle = (choice) => Number(choice) === 0;
/** The blend's weight at `elapsed` of `seconds` - eased, so the arm leaves its blow and arrives at the stance slowly. */
export const blendWeightAt = (elapsed, seconds) => (seconds > 0 ? smooth(clamp01(elapsed / seconds)) : 1);
/** A stop blends from a frozen
 *  stride, and a linear blend slowed the legs from 10 cm a frame to 1.3, then halted them at once. Out of a gait the
 *  blend leaves the stride fast and settles slowly: 1 - (1 - p)^power. */
export const STOP_EASE = Object.freeze({ power: 3 });
const GAIT = /^(?:walk|run|sneak|swim)/i;
export const stopsMoving = (from, to) => GAIT.test(String(from?.group ?? '')) && !GAIT.test(String(to?.group ?? ''));
export const stopWeightAt = (elapsed, seconds) => (seconds > 0 ? 1 - (1 - clamp01(elapsed / seconds)) ** STOP_EASE.power : 1);

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
  if (!modGroupEnabled('animations')) return false;
  if (!thrust || !shield) return false;
  return fists || (cycle ? cycle.next('shield-bash', 2) === 1 : false);
}
