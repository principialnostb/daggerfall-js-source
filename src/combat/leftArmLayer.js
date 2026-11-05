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
import { isWalkVariantEnabled } from '../formats/morrowind/mwWalkAnimationAssets.js';

/** SHIELD-STRAFE-SOURCE: the sources a strafe's walk is picked from, in the rig's order - as the movement filters them by
 *  the walk chosen (`preference`, the movement's `walk:<choice>` key; any other, the game's). */
export function strafeSources(sources, preference) {
  const m = /^walk:(.*)$/.exec(String(preference ?? ''));
  return (sources ?? []).filter((s) => isWalkVariantEnabled(s, m?.[1] || 'vanilla'));
}

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
  if (mode === 'shield') {
    if (view !== 'third' || attacking || !moving || !b || /^turn/.test(b)) return null;
    // Restore all-animations' running side-arm on its live stride, riding the current trunk.
    if (/^run(forward|back)$/.test(b)) return { kind: 'movement', base: 'runleft', stance: 'drawn', still: false };
    if (/^run/.test(b)) return { kind: 'movement', base: 'walkleft', stance: 'drawn', still: true };
    // Keep the strafe's movement rather than averaging it into a rigid pose.
    return strafeOf ? { kind: 'movement', base: strafeOf, stance: 'drawn', still: false, rigOrder: true } : null;
  }
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

/** SHIELD-STRAFE-TRUNK: the arm's root, and the bones above it (Bip01 down) whose turns the arm rides. */
export const ARM_ROOT = 'bip01 l clavicle';
export const ARM_CHAIN = Object.freeze(['bip01', 'bip01 pelvis', 'bip01 spine', 'bip01 spine1', 'bip01 spine2', 'bip01 neck']);
const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
const qconj = (q) => [q[0], -q[1], -q[2], -q[3]];

/** The base's tracks with the mask's bones answered by the overlay's AND the base's own, for the weighted sampler.
 *  `adapt` (SHIELD-STRAFE-TRUNK): the arm's root carries both clips' trunks, to turn the arm as the overlay's trunk
 *  turned it. */
export function weightedOverlayTracks(base, overlay, bones, adapt = false) {
  const out = new Map(base ?? []);
  if (overlay && bones) {
    for (const [name, t] of overlay) if (bones.has(name) && t) out.set(name, { __overlay: t, __base: base?.get(name) ?? null });
  }
  const root = adapt ? out.get(ARM_ROOT) : null;
  const co = ARM_CHAIN.map((n) => overlay?.get(n)), cb = ARM_CHAIN.map((n) => base?.get(n));
  if (root?.__overlay && co.every(Boolean) && cb.every(Boolean)) out.set(ARM_ROOT, { ...root, __chainO: co, __chainB: cb });
  return out;
}

/** The sampler for weightedOverlayTracks: an overlaid bone at the overlay's clock, blended over the base's by weight. */
export function weightedOverlaySampler(sampleTrack, clock, weight, span = () => null) {
  const means = new WeakMap();
  /** SHIELD-STEADY: a track's turn and place averaged over `w` (the loop window), sixteen samples, the shorter way. */
  const meanOf = (tr, w) => {
    const hit = means.get(tr);
    if (hit && hit.start === w.start && hit.stop === w.stop) return hit.value;
    let q = null; const t = [0, 0, 0]; let n = 0, first = null;
    for (let i = 0; i < 16; i++) {
      const v = sampleTrack(tr, w.start + (w.stop - w.start) * (i + 0.5) / 16);
      if (!v) continue;
      first ??= v; n++;
      if (v.rotation) { const r = v.rotation, sgn = q && q[0] * r[0] + q[1] * r[1] + q[2] * r[2] + q[3] * r[3] < 0 ? -1 : 1; q = q ? q.map((x, j) => x + sgn * r[j]) : [...r]; }
      if (v.translation) for (let j = 0; j < 3; j++) t[j] += v.translation[j];
    }
    const l = q ? Math.hypot(...q) || 1 : 1;
    const value = n ? { ...first, rotation: q ? q.map((x) => x / l) : first.rotation, translation: first.translation ? t.map((x) => x / n) : first.translation } : null;
    means.set(tr, { start: w.start, stop: w.stop, value });
    return value;
  };
  const at = (tr, t) => { const w = span(); return w ? meanOf(tr, w) : sampleTrack(tr, t); };
  return (track, time) => {
    if (!track || !track.__overlay) return sampleTrack(track, time);
    let o = at(track.__overlay, clock());
    // SHIELD-STRAFE-TRUNK (the owner's video, 2026-11-05: walking forward the strafe's arm pointed the shield out from
    // the hip): the strafe turns its trunk to the way it goes; on a straight walk's trunk its arm, laid from the
    // collarbone down, pointed elsewhere. The root is turned by the overlay's trunk less the base's, so the arm stands to
    // the body as the strafe's does, the shoulder where the walk has it.
    if (track.__chainO && o.rotation) {
      const chain = (ts, t, read) => ts.reduce((q, tr) => { const r = read(tr, t)?.rotation; return r ? qmul(q, r) : q; }, [1, 0, 0, 0]);
      o = { ...o, rotation: qmul(qconj(chain(track.__chainB, time, sampleTrack)), qmul(chain(track.__chainO, clock(), at), o.rotation)) };
    }
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
  let state = null; let source = null; let group = null; let clock = 0; let w = 0; let memo = null; let steady = false;
  const sampler = weightedOverlaySampler(sampleTrack, () => clock, () => w, () => (steady && state && source ? loopWindow(state, source.keys) : null));
  const layer = {
    /** One frame: `plan` (leftArmPlan's), the rig's `sources` and `hasGroup`, the stance the rig stands in (`stance`,
     *  a weapon type), the movement playing (`movement`, its `movementSource`) for the stride's sync. */
    step(dt, { plan, sources, hasGroup, stance, movement = null, movementSource = null, walkPref = null }) {
      if (plan) {
        steady = !!plan.mean;   // SHIELD-STEADY
        const type = plan.stance === 'bare' ? MW_WEAPON_TYPE.None : stance;   // the bare group, no short group
        const composed = plan.kind === 'stance' ? composeStanceGroup(plan.base, type, hasGroup) : composeMovementGroup(plan.base, type, hasGroup);
        const key = composed?.group ? `${composed.group}${plan.rigOrder ? '|rig' : ''}` : null;
        if (key && key !== group) {
          const candidates = plan.rigOrder ? strafeSources(sources, walkPref)
            : movementSource ? [movementSource, ...(sources ?? []).filter((s) => s !== movementSource)] : (sources ?? []);
          const pick = pickAnimSource(candidates, composed.group, resetClip, { loopFallback: true, loopCount: Infinity });
          if (pick) {
            const fresh = !state;
            state = pick.state; source = pick.source; group = key; memo = null;
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
      // Source order chooses the raised arm; it must not cancel the walking trunk's own sway.
      if (!memo || memo.base !== base || memo.overlay !== source.trackMap || memo.mask !== mask) {
        memo = { base, overlay: source.trackMap, mask, tracks: weightedOverlayTracks(base, source.trackMap, mask) };
      }
      return memo.tracks;
    },
    /** The sampler to pose with while the layer has weight. */
    sampler: () => (w > 0 && state ? sampler : null),
    weight: () => w,
    group: () => group,
    reset() { state = null; source = null; group = null; clock = 0; w = 0; memo = null; steady = false; },
  };
  return layer;
}
