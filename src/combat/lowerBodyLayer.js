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
import { nlerpQuat } from './leftArmLayer.js';

/** The eases (seconds): the legs handed to the stride as a blow begins mid-stride, and back to the clip's when the body
 *  stops under a blow. */
export const LOWER_BODY_EASE = Object.freeze({ in: 0.08, out: 0.12, swap: 0.15 });
/* LOWER-SWAP (2026-10-29, the proving ground: 91 of 132 single-frame leaps in the owner's recorded play were a movement
 * clip changed under a blow - walk to run, forward to a strafe - a foot 0.95 m in one frame): the legs' clip changed
 * while the layer holds them is crossed over `swap` seconds from where the last one stood (its clip held at its last
 * time), never taken at once. */

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

/** WHO OWNS THE LEGS THIS FRAME, when it is not the frame's winner: the movement, else the jump - and only while a blow
 *  (`action`) is the winner of a third-person frame. A recoil and a death move the whole body (they outrank movement in
 *  the reference) and leave the legs to their clip; `on` is the viewer's switch (MotionDoctrine). */
export function lowerBodyOwner({ on = true, third = false, action = false, hit = false, dead = false, movement = false, jump = false } = {}) {
  if (!on || !third || !action || hit || dead) return null;
  return movement ? 'movement' : jump ? 'jump' : null;
}

/** THE LAYER: the owner's tracks, its clock and the layer's weight. A withdrawn owner (the body stopped, the jump
 *  landed, the blow ended) keeps its last tracks and clock while the weight eases out, so the legs go back to the
 *  winner's from where they stood. */
export function createLowerBodyLayer({ sampleTrack }) {
  let trackMap = null; let clock = 0; let w = 0; let memo = null; let inner = sampleTrack;
  let key = null; let prev = null; let mix = 1; let swapT = 0;   // LOWER-SWAP: the clip the legs leave, held, and how far they have left it
  const blend = (a, b, t) => ({
    rotation: a.rotation && b.rotation ? nlerpQuat(a.rotation, b.rotation, t) : b.rotation ?? a.rotation,
    translation: a.translation && b.translation ? a.translation.map((v, i) => v + (b.translation[i] - v) * t) : b.translation ?? a.translation,
    scale: a.scale != null && b.scale != null ? a.scale + (b.scale - a.scale) * t : b.scale ?? a.scale,
  });
  const sampler = (track, time) => {
    if (!track || !track.__overlay) return inner(track, time);
    let o = inner(track.__overlay, clock);
    if (prev && mix < 1 && track.__prev) o = blend(inner(track.__prev, prev.clock), o, mix);
    const k = Math.min(1, Math.max(0, w));
    if (k >= 1 || !track.__base) return o;
    return blend(inner(track.__base, time), o, k);
  };
  const layer = {
    /** One frame, in the rig's own words: the switch (`on`), the view (`third`), the frame's clip states (`action`,
     *  `hit`, `dead`, `movement`, `jump`) and the track maps the movement's and the jump's clips pose from. */
    step(dt, { on = true, third = false, action = null, hit = null, dead = null, movement = null, movementTracks = null, jump = null, jumpTracks = null } = {}) {
      const owner = lowerBodyOwner({ on, third, action: !!action, hit: !!hit, dead: !!dead, movement: !!movement, jump: !!jump });
      const state = owner === 'movement' ? movement : jump;
      const tracks = owner === 'movement' ? movementTracks : jumpTracks;
      if (owner && state && tracks) {
        const next = `${state.group}|${state.startTime}`;
        if (key != null && next !== key && w > 1e-3) { prev = { map: trackMap, clock }; mix = 0; swapT = 0; memo = null; }
        key = next; trackMap = tracks; clock = state.time;
      }
      if (prev) { swapT += Math.max(0, dt); const u = Math.min(1, swapT / LOWER_BODY_EASE.swap); mix = u * u * (3 - 2 * u); if (u >= 1) { prev = null; mix = 1; memo = null; } }   // smoothstep: still at both ends
      const want = owner && trackMap ? 1 : 0;
      w = ease(w, want, want ? LOWER_BODY_EASE.in : LOWER_BODY_EASE.out, dt);
      if (want && w > 0.999) w = 1;   // whole: the stride's own bones, not a blend that never quite arrives
      if (!want && w < 1e-3) layer.reset();
      return w;
    },
    /** The rig's frame (combat/fpArm.js, positional so the host spends one line): `on` the switch in third person, the
     *  third-person build (its tracks stand in for a clip with no source of its own), the frame's clip states and the
     *  sources the movement and the jump play from. */
    stepRig(dt, on, built, action, hit, dead, movement, movementSource, jump, jumpSource) {
      const mapOf = (source) => source?.trackMap ?? built?.tracks ?? null;
      return layer.step(dt, { on, third: on, action, hit, dead, movement, movementTracks: mapOf(movementSource), jump, jumpTracks: mapOf(jumpSource) });
    },
    /** The tracks to pose with: `base` with the mask's bones overlaid while the layer has weight. */
    tracks(base, mask) {
      if (!(w > 0) || !trackMap || !mask || !mask.size) return base;
      if (!memo || memo.base !== base || memo.overlay !== trackMap || memo.mask !== mask || memo.prev !== prev) {
        const out = new Map(base ?? []);
        for (const [name, t] of trackMap) if (mask.has(name) && t) out.set(name, { __overlay: t, __base: base?.get(name) ?? null, __prev: prev?.map?.get(name) ?? null });
        memo = { base, overlay: trackMap, mask, prev, tracks: out };
      }
      return memo.tracks;
    },
    /** The sampler to pose with: the overlay's over `under` (the sampler the frame would use without this layer). */
    sampler(under) {
      if (!(w > 0) || !trackMap) return under;
      inner = under;
      return sampler;
    },
    weight: () => w,
    reset() { trackMap = null; clock = 0; w = 0; memo = null; inner = sampleTrack; key = null; prev = null; mix = 1; swapT = 0; },
  };
  return layer;
}
