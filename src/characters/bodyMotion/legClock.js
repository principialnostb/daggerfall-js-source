// @ts-check
// LEG-CLOCK (2026-11-06, the owner's 19-47-18 recording: "one smooth, agreed picture" - the trunk, the arms and the
// legs). The legs drawn are the movement clip's (lowerBodyLayer.js, RUN-STRIDE's lengthening on them), while the body
// layer's gait (gait.js) counted its own stride from the ground crossed: walking it turned 3 strides to the clip's 3.5
// in two seconds, running 5 to 4.5, and the chest's counter-turn and every held arm's swing ride that count - half a
// stride off the feet within the second. THE CLIP'S FEET SET THE CLOCK instead:
//
// - the clip's own stride phase (movementContinuity.js clipStridePhase: its `soundgen` contacts, 0 at the left's) is
//   even and exact in its pace, but where in it a foot stands farthest forward is the clip's own (MAO's walk 0.04 of a
//   stride past its left contact, its run 0.22, its walk back 0.13 - a key is a sound, not a pose);
// - so the offset is measured, as the feet are posed: the left foot's lead over the right along the facing, in legs,
//   against the contact phase - a running average of lead x e^(-i 2 pi phase), whose angle is the offset (the stride's
//   own frequency survives the average, its double cancels) and whose size says the feet do swing fore and aft (a
//   strafe's do not: its legs cross, and the gait keeps its own clock there);
// - the gait's shown phase is then the contact phase plus that offset: 0 where the left foot stands farthest forward,
//   as gait.js counts it (its right arm forward, its chest turned left).
// The port's own; Daggerfall Unity draws no articulated body.

/** `tau` seconds the offset's average holds; `lock` the least average lead (legs) the feet must show before the clock
 *  is theirs; `fall` seconds its hold lets go in when the clip has no contacts. */
export const LEG_CLOCK = Object.freeze({ tau: 0.5, lock: 0.12, fall: 0.25 });

export function createLegClock() {
  let re = 0, im = 0;
  return {
    /** One posed frame: `lead` the left foot's lead over the right along the facing (legs), `phase` the clip's contact
     *  phase (or null), `dt` seconds since the last. */
    measure(lead, phase, dt) {
      const d = Math.max(0, Number(dt) || 0);
      if (!Number.isFinite(phase) || !Number.isFinite(lead)) {
        const k = Math.exp(-d / LEG_CLOCK.fall); re *= k; im *= k;
        return;
      }
      const k = 1 - Math.exp(-d / LEG_CLOCK.tau), a = -2 * Math.PI * phase;
      re += (lead * Math.cos(a) - re) * k;
      im += (lead * Math.sin(a) - im) * k;
    },
    /** The gait's phase for the clip's contact phase `phase`: 0 where the left foot leads most - or null while the feet
     *  have not shown how they swing. */
    phase(phase) {
      if (!Number.isFinite(phase) || 2 * Math.hypot(re, im) < LEG_CLOCK.lock) return null;
      const p = phase + Math.atan2(im, re) / (2 * Math.PI);
      return p - Math.floor(p);
    },
    reset() { re = 0; im = 0; },
  };
}
