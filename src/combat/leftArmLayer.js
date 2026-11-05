// @ts-check
// LEFT-ARM (2026-10-26): THE LEFT ARM LAID OVER THE CLIP, BY WEIGHT. One layer for the arms the clip does not hold the
// way a body should - a shield's, a free hand's - sampled from another clip of the same rig and eased on and off, so a
// change of what holds the arm is a blend and never a frame's jump. combat/fpArm.js asks it each frame which plan
// stands (leftArmPlan), steps it (the clip it reads, its clock, its weight) and poses through its tracks and sampler.
//
//   'shield' - a one-hander and a shield: walking forward or back the left strafe's arm (the forward clips swing the
//              shield arm; the strafe holds it up), else the clip's own.
//   'guard'  - the fists behind a shield (combat/shieldGuard.js): moving forward or back the left strafe's arm; standing
//              the stance's own (the one-hander's idle lowers it - Mac: "let it lower"), and the strafe's arm again,
//              eased up, for a blow or a jump. In the first person the idle's arm holds it through a blow (the fists'
//              clip raised it across half the picture).
//   'free'   - a one-hander and no shield: walking, the bare walk's left arm (the player's walk source, PlayerWalkSource)
//              in place of the one-hander's.
// Departures from the reference, which plays each clip's own arms.

import { clamp01, ease } from '../characters/bodyMotion/bodyKit.js';
import { MW_WEAPON_TYPE } from '../formats/morrowind/mwFirstPerson.js';

/** The eases (seconds): the arm up quickly for a blow (its wind-up is a third of a second), down slower to the stance. */
export const LEFT_ARM_EASE = Object.freeze({ in: 0.08, out: 0.22 });

/** @type {readonly number[]} */
const ONE_HANDED = Object.freeze([MW_WEAPON_TYPE.ShortBladeOneHand, MW_WEAPON_TYPE.LongBladeOneHand, MW_WEAPON_TYPE.BluntOneHand, MW_WEAPON_TYPE.AxeOneHand]);
/** WHO HOLDS THE LEFT ARM: the drawn `type` (fpArm.js animWeaponType's), a `shield` worn, a pair in the hands (`dual`),
 *  and `free` - nothing else has the hand (drawn, no spell, no stone, no sheet, no lit light). The fists behind a shield
 *  in either view; the rest the third person's (the first person's arms are the clip's own).
 *  A one-hander and a shield in the first person too - its arm is laid only for a bash (leftArmPlan).
 *  @param {{ view?: string, type?: number, shield?: boolean, dual?: boolean, free?: boolean }} [o] */
export function leftArmModeOf({ view = 'third', type = MW_WEAPON_TYPE.None, shield = false, dual = false, free = true } = {}) {
  if (!free) return null;
  if (shield && type === MW_WEAPON_TYPE.HandToHand) return 'guard';
  if (shield) return 'shield';   // SHIELD-BASH: the first person's only for a bash (leftArmPlan)
  if (view !== 'third') return null;
  return !dual && ONE_HANDED.includes(type) ? 'free' : null;
}

/**
 * THE PLAN: which clip's left arm this frame wants, or null for the clip's own. `{ kind, base, stance, still }` - `kind`
 * 'movement' or 'stance' (the composer the host asks), `base` its bare base, `stance` 'drawn' (the stance the rig stands
 * in) or 'bare' (no weapon short group: the free walk), `still` held at one frame rather than kept on the stride.
 */
export function leftArmPlan({ mode = null, view = 'third', moving = false, base = null, attacking = false, jumping = false, bashing = false } = {}) {
  const b = String(base ?? '');
  const walkingStraight = moving && /(forward|back)$/.test(b) && !/^turn/.test(b);
  const strafeOf = walkingStraight ? b.replace(/(forward|back)$/, 'left') : null;
  // SHIELD-BASH: a one-hander's bash throws the shield from where the guard holds it, as the fists' does
  if (mode === 'shield' && bashing) return view === 'first' ? { kind: 'stance', base: 'idle', stance: 'drawn', still: true } : { kind: 'movement', base: 'walkleft', stance: 'drawn', still: true };
  if (mode === 'shield') return view === 'third' && strafeOf && !attacking ? { kind: 'movement', base: strafeOf, stance: 'drawn', still: false } : null;
  if (mode === 'guard') {
    if (view === 'first') return attacking || jumping ? { kind: 'stance', base: 'idle', stance: 'drawn', still: true } : null;
    if (strafeOf) return { kind: 'movement', base: strafeOf, stance: 'drawn', still: false };
    if (attacking || jumping) return { kind: 'movement', base: 'walkleft', stance: 'drawn', still: true };
    return null;
  }
  if (mode === 'free') {
    return moving && !attacking && b && !/^turn/.test(b) ? { kind: 'movement', base: b, stance: 'bare', still: false } : null;
  }
  return null;
}

/** The loop window of a clip state on its source's keys ("<group>: loop start/stop"), else its whole span. */
export function loopWindow(state, keys) {
  let start = state?.startTime ?? 0;
  let stop = state?.stopTime ?? 0;
  const group = String(state?.group ?? '').toLowerCase();
  if (!group) return { start, stop };
  for (const key of keys ?? []) {
    if (key.time < start || key.time > stop) continue;
    const text = String(key.text ?? '').toLowerCase();
    if (text === `${group}: loop start`) start = key.time;
    else if (text === `${group}: loop stop`) stop = key.time;
  }
  return stop > start ? { start, stop } : { start: state.startTime, stop: state.stopTime };
}

/** The overlay's time on the same stride phase as the movement's (an intro kept as an intro), so the arm walks in step. */
export function strideTime(movement, movementKeys, overlay, overlayKeys) {
  if (!movement || !overlay) return overlay?.startTime ?? 0;
  const baseLoop = loopWindow(movement, movementKeys);
  const overlayLoop = loopWindow(overlay, overlayKeys);
  const time = movement.time;
  if (time < baseLoop.start && baseLoop.start > movement.startTime) {
    const baseIntro = baseLoop.start - movement.startTime;
    const overlayIntro = Math.max(0, overlayLoop.start - overlay.startTime);
    const progress = baseIntro > 0 ? clamp01((time - movement.startTime) / baseIntro) : 0;
    return overlay.startTime + progress * overlayIntro;
  }
  const baseSpan = baseLoop.stop - baseLoop.start;
  const overlaySpan = overlayLoop.stop - overlayLoop.start;
  if (!(baseSpan > 0) || !(overlaySpan > 0)) return overlay.startTime;
  const phase = (((time - baseLoop.start) % baseSpan) + baseSpan) % baseSpan / baseSpan;
  return overlayLoop.start + phase * overlaySpan;
}

/** A quaternion (any order of its four) blended toward another by `w`, the shorter way, normalised. */
export function nlerpQuat(a, b, w) {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const q = [0, 1, 2, 3].map((i) => a[i] + (b[i] * s - a[i]) * w);
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return q.map((v) => v / l);
}

/** The base's tracks with the mask's bones answered by the overlay's AND the base's own, for the weighted sampler. */
export function weightedOverlayTracks(base, overlay, bones) {
  const out = new Map(base ?? []);
  if (overlay && bones) {
    for (const [name, t] of overlay) if (bones.has(name) && t) out.set(name, { __overlay: t, __base: base?.get(name) ?? null });
  }
  return out;
}

/** The sampler for weightedOverlayTracks: an overlaid bone at the overlay's clock, blended over the base's by weight. */
export function weightedOverlaySampler(sampleTrack, clock, weight) {
  return (track, time) => {
    if (!track || !track.__overlay) return sampleTrack(track, time);
    const o = sampleTrack(track.__overlay, clock());
    const w = clamp01(weight());
    if (w >= 1 || !track.__base) return o;
    const b = sampleTrack(track.__base, time);
    const mix = (x, y) => (x && y ? x.map((v, i) => v + (y[i] - v) * w) : (w < 0.5 ? x : y) ?? x ?? y);
    return {
      rotation: b.rotation && o.rotation ? nlerpQuat(b.rotation, o.rotation, w) : (w < 0.5 ? b.rotation : o.rotation) ?? b.rotation ?? o.rotation,
      translation: mix(b.translation, o.translation),
      scale: b.scale != null && o.scale != null ? b.scale + (o.scale - b.scale) * w : b.scale ?? o.scale,
    };
  };
}

/**
 * THE LAYER: its clip, its clock and its weight. `deps` the rig's own doors - pickAnimSource, resetClip, the two
 * composers (composeMovementGroup, composeStanceGroup) and sampleTrack. A plan withdrawn keeps the last clip and clock
 * while the weight eases out, so the arm goes back to the clip's from where it stood.
 */
export function createLeftArmLayer({ pickAnimSource, resetClip, composeMovementGroup, composeStanceGroup, sampleTrack }) {
  let state = null; let source = null; let group = null; let clock = 0; let w = 0; let memo = null;
  const sampler = weightedOverlaySampler(sampleTrack, () => clock, () => w);
  const layer = {
    /** One frame: `plan` (leftArmPlan's), the rig's `sources` and `hasGroup`, the stance the rig stands in (`stance`,
     *  a weapon type), the movement playing (`movement`, its `movementSource`) for the stride's sync. */
    step(dt, { plan, sources, hasGroup, stance, movement = null, movementSource = null }) {
      if (plan) {
        const type = plan.stance === 'bare' ? MW_WEAPON_TYPE.None : stance;   // the bare group, no short group
        const composed = plan.kind === 'stance' ? composeStanceGroup(plan.base, type, hasGroup) : composeMovementGroup(plan.base, type, hasGroup);
        if (composed?.group && composed.group !== group) {
          const candidates = movementSource ? [movementSource, ...(sources ?? []).filter((s) => s !== movementSource)] : (sources ?? []);
          const pick = pickAnimSource(candidates, composed.group, resetClip, { loopFallback: true, loopCount: Infinity });
          if (pick) {
            const fresh = !state;
            state = pick.state; source = pick.source; group = composed.group; memo = null;
            if (fresh || plan.still) clock = loopWindow(state, source.keys).start;
          }
        }
        if (state && !plan.still && movement && movementSource) clock = strideTime(movement, movementSource.keys, state, source.keys);
      }
      const want = plan && state ? 1 : 0;
      w = ease(w, want, want ? LEFT_ARM_EASE.in : LEFT_ARM_EASE.out, dt);
      if (!want && w < 1e-3) layer.reset();
      return w;
    },
    /** The tracks to pose with: the base's, the mask's bones overlaid while the layer has weight. */
    tracks(base, mask) {
      if (!(w > 0) || !state || !source || !mask || !mask.size) return base;
      if (!memo || memo.base !== base || memo.overlay !== source.trackMap || memo.mask !== mask) {
        memo = { base, overlay: source.trackMap, mask, tracks: weightedOverlayTracks(base, source.trackMap, mask) };
      }
      return memo.tracks;
    },
    /** The sampler to pose with while the layer has weight. */
    sampler: () => (w > 0 && state ? sampler : null),
    weight: () => w,
    group: () => group,
    reset() { state = null; source = null; group = null; clock = 0; w = 0; memo = null; },
  };
  return layer;
}
