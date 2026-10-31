// @ts-check
// LOWER-BODY (2026-10-27, MOTION-DOCTRINE pilot step 1, bible/05-Combat/Motion-Doctrine.md section 5): THE LEGS UNDER A
// BLOW. The third-person frame poses one winning clip on every bone (combat/fpArm.js: action over movement over jump over
// idle), so a blow's attack clip took the pelvis and the legs - and a Morrowind attack clip stands still: the feet froze
// while the capsule travelled, and the body slid. The reference resolves priority per bone group (rule 26,
// bible/02-Formats/Morrowind-Rules.md): a weapon group plays at Priority_WeaponLowerBody on the lower body, below
// Priority_Movement and Priority_Jump, so while the actor moves its legs keep the movement clip and only its torso and
// arms strike. This layer is that vector's lower half, laid over the single winner as a weighted overlay (the LEFT-ARM
// layer's shape, combat/leftArmLayer.js): the lower body's bones answered by the movement's (or the jump's) clip at its
// own clock while a blow wins the frame. A port of the reference, not a departure; its eases are the doctrine's
// SHARPNESS (short, so the legs are handed over in a few frames and never snap).

import { ease } from '../characters/bodyMotion/bodyKit.js';
import { blendMaskBones } from '../formats/morrowind/mwFirstPerson.js';
import { nlerpQuat, loopWindow } from './leftArmLayer.js';
import { createLoopSeam } from './loopSeam.js';
import { advanceClip } from '../formats/morrowind/mwAnim.js';
import { movementPhaseTime } from './movementContinuity.js';
import { createDirectionalWalkSampler } from './directionalWalkSampler.js';

/** The eases (seconds): the legs handed to the stride as a blow begins mid-stride, and back to the clip's when the body
 *  stops under a blow. A moving upper-body attack keeps the existing lower owner. */
export const LOWER_BODY_EASE = Object.freeze({ in: 0.08, out: 0.12, swap: 0.15 });
/* LOWER-SWAP (2026-10-29, the proving ground: 91 of 132 single-frame leaps in the owner's recorded play were a movement
 * clip changed under a blow - walk to run, forward to a strafe - a foot 0.95 m in one frame): the legs' clip changed
 * while the layer holds them is crossed over `swap` seconds between their live clocks; GUARD-CONTINUITY transfers
 * the supporting-foot phase and advances the outgoing clip during that crossfade. */

/** @type {WeakMap<object, Set<string>>} */
const MASKS = new WeakMap();

/** RULE 25's LowerBody group on a skeleton: every bone not under "bip01 spine1" - the pelvis, the legs, the lower spine,
 *  a tail, the root (animation.cpp detectBlendMask's fallback). Empty for a skeleton with no "bip01 spine1" (a creature),
 *  so nothing is overlaid there. Memoised per skeleton. */
export function lowerBodyBones(skeleton) {
  if (!skeleton || !skeleton.nodes) return new Set();
  let mask = MASKS.get(skeleton);
  if (mask) return mask;
  const upper = blendMaskBones(skeleton, 'bip01 spine1');
  mask = new Set();
  if (upper.size) for (const node of skeleton.nodes.values()) {
    const name = String(node?.name || '').toLowerCase();
    if (name && !upper.has(name)) mask.add(name);
  }
  MASKS.set(skeleton, mask);
  return mask;
}

/** WHO OWNS THE LEGS THIS FRAME: movement, else jump, continuously across an upper-body attack.
 *  Movement keeps ownership when it is the frame's winner too. A recoil and a death move the whole body (they outrank movement in
 *  the reference) and leave the legs to their clip; `on` is the viewer's switch (MotionDoctrine). */
export function lowerBodyOwner({ on = true, third = false, action = false, hit = false, dead = false, movement = false, jump = false } = {}) {
  if (!on || !third || hit || dead || (!action && !movement && !jump)) return null;
  return movement ? 'movement' : jump ? 'jump' : null;
}

/** THE LAYER: the owner's tracks, its clock and the layer's weight. A withdrawn owner (the body stopped, the jump
 *  landed) keeps its last tracks and clock while the weight eases out, so the legs go back to the
 *  winner's from where they stood. */
export function createLowerBodyLayer({ sampleTrack }) {
  let trackMap = null; let clock = 0; let w = 0; let memo = null; let inner = sampleTrack;
  let key = null; let prev = null; let mix = 1; let swapT = 0;
  let clipState = null; let clipSource = null; let clipSampler = sampleTrack; let lastRate = 1;
  const ownership = { weight: 0 };
  const seams = createLoopSeam({ sampleTrack, loopWindow });
  const walking = createDirectionalWalkSampler({ loopWindow });
  const blend = (a, b, t) => ({
    rotation: a.rotation && b.rotation ? nlerpQuat(a.rotation, b.rotation, t) : b.rotation ?? a.rotation,
    translation: a.translation && b.translation ? a.translation.map((v, i) => v + (b.translation[i] - v) * t) : b.translation ?? a.translation,
    scale: a.scale != null && b.scale != null ? a.scale + (b.scale - a.scale) * t : b.scale ?? a.scale,
  });
  const sampler = (track, time) => {
    if (!track || !track.__overlay) return inner(track, time);
    // Process each clip at its OWN clock before mixing. The outer filter's time belongs to the weapon.
    let o = clipSampler(track.__overlay, clock);
    if (prev && mix < 1 && track.__prev) o = blend(prev.sample(track.__prev, prev.state.time), o, mix);
    const k = Math.min(1, Math.max(0, w));
    if (k >= 1 || !track.__base) return o;
    return blend(inner(track.__base, time), o, k);
  };
  const layer = {
    /** Movement owns its lower bones continuously, including while the upper attack enters and leaves. */
    step(dt, { on = true, third = false, action = null, hit = null, dead = null, movement = null, movementTracks = null, movementSource = null, jump = null, jumpTracks = null, jumpSource = null } = {}) {
      if (!on || !third || hit || dead) { layer.reset(); return 0; }
      const owner = lowerBodyOwner({ on, third, action: !!action, hit: !!hit, dead: !!dead, movement: !!movement, jump: !!jump });
      const state = owner === 'movement' ? movement : jump;
      const tracks = owner === 'movement' ? movementTracks : jumpTracks;
      const source = owner === 'movement' ? movementSource : jumpSource;
      if (owner && state && tracks) {
        const next = `${state.group}|${state.startTime}`;
        const changed = key != null && (next !== key || tracks !== trackMap);
        if (changed && w > 1e-3) {
          prev = { map: trackMap, state: { ...clipState, time: clock }, source: clipSource, sample: clipSampler, rate: lastRate };
          mix = 0; swapT = 0; memo = null;
        }
        if (!changed && clipState && dt > 0) {
          const win = loopWindow(state, source?.keys), span = win.stop - win.start;
          let delta = state.time - clock;
          if (delta < 0 && span > 0) delta += span;
          if (delta >= 0) lastRate = Math.min(10, delta / dt);
        }
        if (prev?.state?.playing && Array.isArray(prev.source?.keys)) {
          advanceClip(prev.state, prev.source.keys, Math.max(0, dt) * prev.rate);
        }
        if (changed && prev && source?.keys && prev.source?.keys) {
          const time = movementPhaseTime(prev.state, prev.source.keys, state, source.keys);
          if (time != null) state.time = time;
        }
        key = next; trackMap = tracks; clock = state.time; clipState = { ...state }; clipSource = source;
        clipSampler = Array.isArray(source?.keys) ? walking.sampler(seams.sampler(sampleTrack, state, source, true), state, source) : sampleTrack;
      }
      if (prev) {
        swapT += Math.max(0, dt); const u = Math.min(1, swapT / LOWER_BODY_EASE.swap); mix = u * u * (3 - 2 * u);
        if (u >= 1) { prev = null; mix = 1; memo = null; }
      }
      const want = owner && trackMap ? 1 : 0;
      w = ease(w, want, want ? LOWER_BODY_EASE.in : LOWER_BODY_EASE.out, dt);
      if (want && w > 0.999) w = 1;
      ownership.weight = w;
      if (!want && w < 1e-3) layer.reset();
      return w;
    },
    stepRig(dt, on, built, action, hit, dead, movement, movementSource, jump, jumpSource) {
      const sourceOf = (source) => source ?? (built ? { trackMap: built.tracks, keys: built.keys } : null);
      const move = sourceOf(movementSource), airborne = sourceOf(jumpSource);
      return layer.step(dt, { on, third: on, action, hit, dead, movement, movementTracks: move?.trackMap, movementSource: move,
        jump, jumpTracks: airborne?.trackMap, jumpSource: airborne });
    },
    tracks(base, mask) {
      if (!(w > 0) || !trackMap || !mask || !mask.size) return base;
      if (!memo || memo.base !== base || memo.overlay !== trackMap || memo.mask !== mask || memo.prev !== prev) {
        const out = new Map(base ?? []);
        for (const [name, t] of trackMap) if (mask.has(name) && t) out.set(name, {
          __overlay: t, __base: base?.get(name) ?? null, __prev: prev?.map?.get(name) ?? null, __poseOwner: ownership,
        });
        memo = { base, overlay: trackMap, mask, prev, tracks: out };
      }
      return memo.tracks;
    },
    sampler(under) {
      if (!(w > 0) || !trackMap) return under;
      inner = under;
      return sampler;
    },
    weight: () => w,
    reset() {
      trackMap = null; clock = 0; w = 0; memo = null; inner = sampleTrack; key = null; prev = null; mix = 1; swapT = 0;
      clipState = null; clipSource = null; clipSampler = sampleTrack; lastRate = 1; ownership.weight = 0;
    },
  };
  return layer;
}
