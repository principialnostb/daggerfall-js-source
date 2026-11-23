// @ts-check
// Hold the melee hit until the visible arm reaches contact. If the rig disappears or its clip has no
// release, deliver the hit after the timeout or immediately when the arm stops leading.
/** The ceilings: a held blow goes after `max` seconds if the arm is no longer throwing it, and after `cap` regardless. */
export const ARM_LED_HIT = Object.freeze({ max: 1.2, cap: 3 });

export function createArmLedBlow() {
  let held = false;
  let age = 0;
  return {
    /** The machine's events this frame, with its melee 'hit' held for the arm while `leads`; answers the events to hand
     *  on and whether a held hit went this frame. `takeHit` / `busy` are the arm's (fpArm.takeBlowHit, fpArm.blowBusy). */
    step(evs, dt, { leads = false, takeHit = () => false, busy = () => false } = {}) {
      if (!leads) {
        if (!held) return { evs, fired: false };
        held = false;
        return { evs: [...evs, 'hit'], fired: true };
      }
      const out = [];
      for (const ev of evs) {
        if (ev === 'hit') { held = true; age = 0; continue; }
        out.push(ev);
      }
      if (!held) return { evs: out, fired: false };
      age += dt;
      if (takeHit() || (age >= ARM_LED_HIT.max && !busy()) || age >= ARM_LED_HIT.cap) {
        held = false;
        out.push('hit');
        return { evs: out, fired: true };
      }
      return { evs: out, fired: false };
    },
    /** A hit is held for the arm (the machine is between blows, the blow still to land). */
    holding: () => held,
    reset() { held = false; age = 0; },
  };
}
