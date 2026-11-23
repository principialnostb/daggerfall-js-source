// @ts-check
// Read the clip's leg phase to keep torso and arm accents in time with the planted foot.

/** `tau` seconds the offset's average holds; `lock` the least average lead (legs) the feet must show before the clock
 *  is theirs; `fall` seconds its hold lets go in when the clip has no contacts. */
export const LEG_CLOCK = Object.freeze({ tau: 0.5, lock: 0.12, fall: 0.25 });

export function createLegClock() {
  let re = 0,
    im = 0;
  return {
    /** One posed frame: `lead` the left foot's lead over the right along the facing (legs), `phase` the clip's contact
     *  phase (or null), `dt` seconds since the last. */
    measure(lead, phase, dt) {
      const d = Math.max(0, Number(dt) || 0);
      if (!Number.isFinite(phase) || !Number.isFinite(lead)) {
        const k = Math.exp(-d / LEG_CLOCK.fall);
        re *= k;
        im *= k;
        return;
      }
      const k = 1 - Math.exp(-d / LEG_CLOCK.tau),
        a = -2 * Math.PI * phase;
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
    reset() {
      re = 0;
      im = 0;
    },
  };
}
