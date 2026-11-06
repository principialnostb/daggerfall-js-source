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
import { isWalkVariantEnabled, isRunVariantEnabled } from '../formats/morrowind/mwWalkAnimationAssets.js';

/** SHIELD-STRAFE-SOURCE: the sources a strafe's walk is picked from, in the rig's order - as the movement filters them by
 *  the walk chosen (`preference`, the movement's `walk:<choice>` key; any other, the game's). */
export function strafeSources(sources, preference) {
  const m = /^(walk|run):(.*)$/.exec(String(preference ?? ''));
  const ok = m?.[1] === 'run' ? isRunVariantEnabled : isWalkVariantEnabled;   // SHIELD-RUN-AS-WALK: a run's strafe as a run picks it
  return (sources ?? []).filter((s) => ok(s, m?.[2] || 'vanilla'));
}

/** The eases (seconds): the arm up quickly for a blow (its wind-up is a third of a second), down slower to the stance. */
export const LEFT_ARM_EASE = Object.freeze({ in: 0.08, out: 0.22 });
/** ARM-FADE: seconds a layer's arm fades from the clip it leaves to the one it takes. */
export const ARM_FADE = 0.3;
/** The shield keeps the strafe's raised arm, with a quieter live stride around that pose. */
/** ARM-HOLD (2026-11-06, the owner's 21-46-18 recording: the shield shakes; the free arms want their own carriage, made of
 *  the movements the body already has): an arm a layer carries is HELD at its clip's mean pose and SWUNG by this share of
 *  the very walk the legs play, off that walk's mean - never by another clip's live swing (a strafe's arm, a one-hander's
 *  upper body: their own strides rocked the shield 14 to 19 degrees to the side). `shield` the shield's arm walking,
 *  running, backing and stepping aside; `free` a one-hander's free arm, its pose `freePose` of the way from the free
 *  walk's to the one-handed walk's (where the one-handed stance holds it standing), `freeRun` running; `upper` the armed upper body under a
 *  shield (CARRY-LOCOMOTION-COHERENCE's 0.55, the share of the chest's wave the owner kept). ARM-REST: standing, a free
 *  hand is the plain idle's arm on its own breath, laid `rest` over the one-handed stance's bent arm (`restRight` the
 *  right beside a shield, over the stance's armed one). FISTS-PUMP: the fists' guard walking is the hand-to-hand clip's
 *  guard held, swung by `fists` of the plain walk the legs play - the guard bobs with the stride. */
export const ARM_HOLD = Object.freeze({ shield: 0.1, free: 0.6, freeRun: 0.85, freePose: 0.45, upper: 0.55, rest: 0.5, restRight: 0.8, fists: 0.3 });

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
/** ARM-HOLD: a shield's arm moving - straight, the strafe's arm of that gait (SHIELD-RUN-AS-WALK), its trunk laid on the
 *  walk's (SHIELD-STRAFE-TRUNK, walking); to the side, the strafe's own, the legs' walk - each held at its mean and swung by
 *  ARM_HOLD.shield of the legs' walk. Null where the base is neither (a turn). */
function heldShield(b, strafeOf) {
  const held = { kind: 'movement', stance: 'drawn', still: false, rigOrder: true, sway: 0, hold: ARM_HOLD.shield };
  if (strafeOf) return /^walk/.test(b) ? { ...held, base: strafeOf, adapt: true } : { ...held, base: strafeOf };
  return /^(walk|run)(left|right)$/.test(b) ? { ...held, base: b } : null;
}

export function leftArmPlan({ mode = null, view = 'third', moving = false, base = null, attacking = false, jumping = false, bashing = false } = {}) {
  const b = String(base ?? '');
  const walkingStraight = moving && /(forward|back)$/.test(b) && !/^turn/.test(b);
  const strafeOf = walkingStraight ? b.replace(/(forward|back)$/, 'left') : null;
  // SHIELD-BASH: a one-hander's bash throws the shield from where the guard holds it, as the fists' does
  if (mode === 'shield' && bashing) return view === 'first' ? { kind: 'stance', base: 'idle', stance: 'drawn', still: true } : { kind: 'movement', base: 'walkleft', stance: 'drawn', still: true };
  if (mode === 'shield') {
    if (view !== 'third' || attacking || !moving || !b || /^turn/.test(b)) return null;
    // SHIELD-RUN-AS-WALK (the owner, 2026-11-05: the run's shield - how it is held, how the arm sways - as the walk's,
    // worked out): straight, the strafe's arm of that gait, live, from the very clip a strafe of it plays; to the side,
    // the strafe's own arm
    return heldShield(b, strafeOf);
  }
  if (mode === 'guard') {
    if (view === 'first') return attacking || jumping ? { kind: 'stance', base: 'idle', stance: 'drawn', still: true } : null;
    // ARM-HOLD (the owner, 2026-11-06: a shield with no weapon still rocked walking - the fists' guard had kept the strafe's
    // live arm, 25.6 degrees to the side a stride walking, 27.2 backing, 14.9 running): the shield held as a weapon's is
    if (strafeOf) return heldShield(b, strafeOf);
    if (attacking || jumping) return { kind: 'movement', base: 'walkleft', stance: 'drawn', still: true };
    return moving ? heldShield(b, null) : null;
  }
  if (mode === 'free') {
    if (attacking) return null;
    // ARM-REST (the owner, 2026-11-06: standing the free hand "a stick", "a small bend at the elbow"): standing, the plain
    // idle's own arm, on its breath, laid ARM_HOLD.rest over the one-handed stance's bent one
    if (!moving) return jumping ? null : { kind: 'stance', base: 'idle', stance: 'bare', still: false, sway: 1, w: ARM_HOLD.rest };
    return b && !/^turn/.test(b) ? { kind: 'movement', base: b, stance: 'drawn', still: false, sway: 0, hold: /^run/.test(b) ? ARM_HOLD.freeRun : ARM_HOLD.free, pose: ARM_HOLD.freePose } : null;
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
export function weightedOverlayTracks(base, overlay, bones, adapt = false, owner = null) {
  const out = new Map(base ?? []);
  if (overlay && bones) {
    for (const [name, t] of overlay) if (bones.has(name) && t) {
      // ARM-HOLD: the movement clip's own track under any layer's wrapper - the walk the legs are on
      let raw = base?.get(name) ?? null;
      while (raw && raw.__overlay) raw = raw.__base;
      out.set(name, { __overlay: t, __base: base?.get(name) ?? null, __raw: raw, __owner: owner, __name: name });
    }
  }
  const root = adapt ? out.get(ARM_ROOT) : null;
  const co = ARM_CHAIN.map((n) => overlay?.get(n)), cb = ARM_CHAIN.map((n) => base?.get(n));
  if (root?.__overlay && co.every(Boolean) && cb.every(Boolean)) out.set(ARM_ROOT, { ...root, __chainO: co, __chainB: cb });
  return out;
}

/** The sampler for weightedOverlayTracks: an overlaid bone at the overlay's clock, blended over the base's by weight.
 *  LAYER-STACK: with an `owner`, only that layer's wrappers are its own - another's go to `sampleTrack`, the layer under. */
export function weightedOverlaySampler(sampleTrack, clock, weight, span = () => null, owner = null, sway = () => 0, adaptation = () => 1, hold = () => 0, baseSpan = () => null, poseShare = /** @type {(track?: any) => number} */ (() => 1)) {
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
  const at = (tr, t) => {
    const window = span();
    if (!window) return sampleTrack(tr, t);
    const mean = meanOf(tr, window), k = clamp01(sway());
    if (!mean || !(k > 0)) return mean;
    const live = sampleTrack(tr, t);
    if (!live || k >= 1) return live ?? mean;
    return {
      rotation: mean.rotation && live.rotation ? nlerpQuat(mean.rotation, live.rotation, k) : live.rotation ?? mean.rotation,
      translation: mean.translation && live.translation ? mean.translation.map((x, i) => x + (live.translation[i] - x) * k) : live.translation ?? mean.translation,
      scale: live.scale,
    };
  };
  /** ARM-HOLD: `track`'s overlay held at its mean - `poseShare` of the way from the walk's own mean to it - and the walk the
   *  legs are on (its `__raw` movement track) moving it by `k` of its own swing off that walk's mean. */
  const held = (track, time, k) => {
    const ow = span(), bw = baseSpan(), raw = track.__raw;
    if (!ow || !bw || !raw) return null;
    const mb = meanOf(raw, bw), live = sampleTrack(raw, time), mo0 = meanOf(track.__overlay, ow), p = clamp01(poseShare(track));
    if (!mo0 || !mb || !live) return null;
    const mo = p >= 1 ? mo0 : {
      ...mo0,
      rotation: mo0.rotation && mb.rotation ? nlerpQuat(mb.rotation, mo0.rotation, p) : mo0.rotation,
      translation: mo0.translation && mb.translation ? mb.translation.map((x, i) => x + (mo0.translation[i] - x) * p) : mo0.translation,
    };
    const dev = mb.rotation && live.rotation ? qmul(live.rotation, qconj(mb.rotation)) : null;
    return {
      ...mo,
      rotation: mo.rotation && dev ? qmul(nlerpQuat([1, 0, 0, 0], dev, k), mo.rotation) : mo.rotation,
      translation: mo.translation && mb.translation && live.translation ? mo.translation.map((x, i) => x + (live.translation[i] - mb.translation[i]) * k) : mo.translation,
    };
  };
  return (track, time) => {
    if (!track || !track.__overlay || (owner && track.__owner !== owner)) return sampleTrack(track, time);
    const kh = clamp01(hold());
    let o = (kh > 0 ? held(track, time, kh) : null) ?? at(track.__overlay, clock());
    if (kh > 0 && track.__chainO && o.rotation) {
      // ARM-HOLD: the trunks' difference at their means - the live difference of two clips' trunks rocked the shield 16
      // degrees a stride walking; held, the arm rides the walk's own trunk, the legs' clip
      const ow = span(), bw = baseSpan();
      const rawB = track.__chainB.map((t) => { let r = t; while (r && r.__overlay) r = r.__base; return r; });
      const chain = (ts, w) => ts.reduce((q, tr) => { const r = meanOf(tr, w)?.rotation; return r ? qmul(q, r) : q; }, [1, 0, 0, 0]);
      if (ow && bw && rawB.every(Boolean)) {
        const adapted = qmul(qconj(chain(rawB, bw)), qmul(chain(track.__chainO, ow), o.rotation));
        o = { ...o, rotation: nlerpQuat(o.rotation, adapted, clamp01(adaptation())) };
      }
      return blendBase(track, time, o);
    }
    // SHIELD-STRAFE-TRUNK (the owner's video, 2026-11-05: walking forward the strafe's arm pointed the shield out from
    // the hip): the strafe turns its trunk to the way it goes; on a straight walk's trunk its arm, laid from the
    // collarbone down, pointed elsewhere. The root is turned by the overlay's trunk less the base's, so the arm stands to
    // the body as the strafe's does, the shoulder where the walk has it.
    if (track.__chainO && o.rotation) {
      const chain = (ts, t, read) => ts.reduce((q, tr) => { const r = read(tr, t)?.rotation; return r ? qmul(q, r) : q; }, [1, 0, 0, 0]);
      const adapted = qmul(qconj(chain(track.__chainB, time, sampleTrack)), qmul(chain(track.__chainO, clock(), at), o.rotation));
      o = { ...o, rotation: nlerpQuat(o.rotation, adapted, clamp01(adaptation())) };
    }
    return blendBase(track, time, o);
  };
  function blendBase(track, time, o) {
    const w = clamp01(weight());
    if (w >= 1 || !track.__base) return o;
    return mixPose(sampleTrack(track.__base, time), o, w);
  }
}

/** One bone's pose `w` of the way from `b` to `o` (turn, place, scale). */
export function mixPose(b, o, w) {
  if (!b) return o;
  if (!o) return b;
  const mix = (x, y) => (x && y ? x.map((v, i) => v + (y[i] - v) * w) : (w < 0.5 ? x : y) ?? x ?? y);
  return {
    rotation: b.rotation && o.rotation ? nlerpQuat(b.rotation, o.rotation, w) : (w < 0.5 ? b.rotation : o.rotation) ?? b.rotation ?? o.rotation,
    translation: mix(b.translation, o.translation),
    scale: b.scale != null && o.scale != null ? b.scale + (o.scale - b.scale) * w : b.scale ?? o.scale,
  };
}

/** ARM-SIDES: a plan's `freeSide` - that arm a free hand under the layer's held clip: its pose the legs' own walk's (the
 *  held pose's share 0 for its bones), swung by the layer's hold. */
const FREE_ARM = Object.freeze({ L: /^bip01 l (?:clavicle|upperarm|forearm|hand|finger)/, R: /^bip01 r (?:clavicle|upperarm|forearm|hand|finger)/ });

/** ARM-SIDES: the arm's bones of the other side - the left arm's mask, mirrored by name (`bip01 l ...` to `bip01 r ...`). */
const mirrored = new WeakMap();
export function mirrorMask(mask) {
  let out = mirrored.get(mask);
  if (!out) { out = new Set([...mask].map((n) => n.replace(/^bip01 l /, 'bip01 r ').replace(/^(.*) left$/, '$1 right'))); mirrored.set(mask, out); }
  return out;
}
const both = new WeakMap();
const bothMask = (mask) => { let out = both.get(mask); if (!out) { out = new Set([...mask, ...mirrorMask(mask)]); both.set(mask, out); } return out; };

/**
 * THE LAYER: its clip, its clock and its weight. `deps` the rig's own doors - pickAnimSource, resetClip, the two
 * composers (composeMovementGroup, composeStanceGroup) and sampleTrack. A plan withdrawn keeps the last clip and clock
 * while the weight eases out, so the arm goes back to the clip's from where it stood.
 */
export function createLeftArmLayer({ pickAnimSource, resetClip, composeMovementGroup, composeStanceGroup, sampleTrack }) {
  // The layer's configuration - its clip, its clock and how it lays the clip's arm - as one record, so a clip changed
  // under a moving arm can fade from the last (ARM-FADE) rather than leap.
  const fresh = () => ({ state: null, source: null, group: null, clock: 0, steady: false, sway: 1, adapt: 0, hold: 0, baseWin: null, pose: 1, side: 'L', freeSide: null });
  let cur = fresh(), w = 0, memo = null, old = null, oldTracks = null, fade = 1;
  // LAYER-STACK (SHIELD-RUN-LEGS): two of these layers stack - the armed upper body under the shield's arm; each samples
  // its own wrappers and hands the rest to the layer under it (`under`, set by sampler(inner))
  const owner = {}; let under = sampleTrack;
  const below = (tr, t) => under(tr, t);
  const overlayOf = (c) => weightedOverlaySampler(below, () => c.clock, () => 1, () => ((c.steady || c.sway < 1 || c.hold > 0) && c.state && c.source ? loopWindow(c.state, c.source.keys) : null), owner, () => c.steady ? 0 : c.sway, () => c.adapt, () => c.hold, () => c.baseWin, (track) => (c.freeSide && FREE_ARM[c.freeSide].test(track?.__name ?? '') ? 0 : c.pose));
  let curOverlay = overlayOf(cur), oldOverlay = null;
  const sampler = (track, time) => {
    if (!track || !track.__overlay || track.__owner !== owner) return below(track, time);
    let o = curOverlay(track, time);
    if (old && fade < 1) {
      const was = oldTracks?.get(track.__name);
      if (was && was.__overlay) o = mixPose(oldOverlay(was, time), o, fade);
    }
    const k = clamp01(w);
    return k >= 1 || !track.__base ? o : mixPose(below(track.__base, time), o, k);
  };
  const layer = {
    /** One frame: `plan` (leftArmPlan's), the rig's `sources` and `hasGroup`, the stance the rig stands in (`stance`,
     *  a weapon type), the movement playing (`movement`, its `movementSource`) for the stride's sync. */
    step(dt, { plan, sources, hasGroup, stance, movement = null, movementSource = null, walkPref = null }) {
      if (old && fade < 1) { fade = Math.min(1, fade + Math.max(0, dt) / ARM_FADE); if (fade >= 1) { old = null; oldTracks = null; oldOverlay = null; } }
      if (plan) {
        const c = cur;
        c.steady = !!plan.mean;
        const swing = clamp01(plan.sway ?? 1);
        c.sway = ease(c.sway, swing, LEFT_ARM_EASE.in, dt);
        if (Math.abs(c.sway - swing) < 1e-3) c.sway = swing;
        const target = plan.adapt ? 1 : 0;
        c.adapt = ease(c.adapt, target, target ? LEFT_ARM_EASE.in : LEFT_ARM_EASE.out, dt);
        if (Math.abs(c.adapt - target) < 1e-3) c.adapt = target;
        const keep = clamp01(plan.hold ?? 0);
        c.hold = ease(c.hold, keep, LEFT_ARM_EASE.in, dt);
        if (Math.abs(c.hold - keep) < 1e-3) c.hold = keep;
        c.baseWin = movement && movementSource ? loopWindow(movement, movementSource.keys) : null;
        c.pose = clamp01(plan.pose ?? 1);
        c.freeSide = plan.freeSide ?? null;
        const type = plan.stance === 'bare' ? MW_WEAPON_TYPE.None : plan.type ?? stance;   // the bare group, no short group
        const composed = plan.kind === 'stance' ? composeStanceGroup(plan.base, type, hasGroup) : composeMovementGroup(plan.base, type, hasGroup);
        const side = plan.side ?? 'L';
        const key = composed?.group ? `${composed.group}${plan.rigOrder ? '|rig' : ''}|${side}` : null;
        if (key && key !== c.group) {
          const candidates = plan.rigOrder ? strafeSources(sources, walkPref)
            : movementSource ? [movementSource, ...(sources ?? []).filter((s) => s !== movementSource)] : (sources ?? []);
          const pick = pickAnimSource(candidates, composed.group, resetClip, { loopFallback: true, loopCount: Infinity });
          if (pick) {
            const first = !c.state;
            // ARM-FADE (the owner, 2026-11-06: one arm, every state, as the free hand beside a sword): a clip changed while
            // the layer holds the arm - a walk to a stand, a stand to a walk - fades from the last clip's arm
            if (!first && w > 0.01 && memo) { old = { ...c }; oldTracks = memo.tracks; oldOverlay = overlayOf(old); fade = 0; }
            cur = { ...c, state: pick.state, source: pick.source, group: key, side };
            curOverlay = overlayOf(cur);
            memo = null;
            if (first || plan.still) cur.clock = loopWindow(cur.state, cur.source.keys).start;
          }
        }
        const n = cur;
        if (n.state && !plan.still && movement && movementSource) n.clock = strideTime(movement, movementSource.keys, n.state, n.source.keys);
        else if (n.state && !plan.still) {
          // ARM-REST: standing, the clip's arm on its own clock - an idle's breath, not a pose held still
          const win = loopWindow(n.state, n.source.keys), span = win.stop - win.start;
          if (span > 0) n.clock = win.start + ((((n.clock - win.start) + Math.max(0, dt)) % span) + span) % span;
        }
      }
      const want = plan && cur.state ? clamp01(plan.w ?? 1) : 0;
      w = ease(w, want, want ? LEFT_ARM_EASE.in : LEFT_ARM_EASE.out, dt);
      if (Math.abs(w - want) < 1e-3) w = want;
      if (!want && w < 1e-3) layer.reset();
      return w;
    },
    /** The tracks to pose with: the base's, the mask's bones overlaid while the layer has weight - the mask the host hands
     *  is the left arm's; a plan's `side` 'R' lays the right arm's, 'both' both (ARM-SIDES). */
    tracks(base, mask) {
      if (!(w > 0) || !cur.state || !cur.source || !mask || !mask.size) return base;
      const bones = cur.side === 'R' ? mirrorMask(mask) : cur.side === 'both' ? bothMask(mask) : mask;
      // A straight shield walk inherits the strafe's arm orientation, including its trunk frame.
      if (!memo || memo.base !== base || memo.overlay !== cur.source.trackMap || memo.mask !== bones || memo.adapt !== (cur.adapt > 0)) {
        memo = { base, overlay: cur.source.trackMap, mask: bones, adapt: cur.adapt > 0, tracks: weightedOverlayTracks(base, cur.source.trackMap, bones, cur.adapt > 0, owner) };
      }
      return memo.tracks;
    },
    /** The sampler to pose with while the layer has weight; `inner` the sampler of the layer under it (LAYER-STACK) -
     *  answered as it is while this layer has none. */
    sampler(inner = null) { under = inner ?? sampleTrack; return w > 0 && cur.state ? sampler : inner; },
    weight: () => w,
    group: () => cur.group?.split('|')[0] ?? null,
    reset() { cur = fresh(); curOverlay = overlayOf(cur); w = 0; memo = null; old = null; oldTracks = null; oldOverlay = null; fade = 1; },
  };
  return layer;
}
