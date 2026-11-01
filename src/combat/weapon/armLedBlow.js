// @ts-check
// MW-PACE2 (combat/blowFlow.js): THE PLAYER'S MELEE HIT WAITS FOR ITS ARM, as MW-D42's shot waits for the bow's release.
// Under the player's own Morrowind arm (either view) the arm plays each blow at one calm speed, so its blade reaches
// "<type> hit" later than Daggerfall's machine reaches its hit frame - the machine's 'hit' event is held here until the
// arm says its blow has landed (fpArm.takeBlowHit), and the rig starts no blow while the arm still throws one
// (fpArm.blowBusy, combat/weapon/weaponRig.js armCannotSwing). NEVER-TRAPS, as the bow's: a hit whose arm never lands it
// (a build lost mid-blow, a clip with no release) goes late, never never - after `max` seconds once the arm is free, or
// at `cap` whatever it does - and a hit held when the arm stops leading is let go at once.

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
