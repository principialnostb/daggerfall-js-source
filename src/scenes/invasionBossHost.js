// @ts-check
// AN INVASION'S FOES IN THE FOE POOL: the pool (scenes/exteriorFoes.js) hands each frame's foe here first. A foe the
// cell owns (scenes/invasionField.js marks it `_inv`) is drawn where the cell says it walks: it decides nothing, strikes
// nothing on its own, and takes no blow here - my blow on it goes to the cell, which judges it, and only the cell's word
// kills it. Its boss's pose (systems/toybox/invasionRun.js invasionBossPose) holds it while it rises and lowers, raises
// and tips its billboard; its body waits out its fall before the corpse is laid.
import { invasionBossPose, isInvasionBossFoe, INVASION_FALL_MS } from '../systems/toybox/invasionRun.js';

/** A foe drawn this far from where the cell says it stands is set there at once (m); nearer than this it has arrived. */
export const INVASION_SNAP_M = 8;
export const INVASION_ARRIVE_M = 0.4;
/** The longest frame step a drawn foe takes (s). */
const STEP_MAX_S = 0.1;

/** Where my blow on a cell's foe goes: `(foe, damage, kind)`, the field's (scenes/invasionField.js). */
let _strike = /** @type {((foe: any, damage: number, kind: string) => void) | null} */ (null);
/** The field installs its door for my blows. @param {((foe: any, damage: number, kind: string) => void) | null} fn */
export function setInvasionStrike(fn) {
  _strike = typeof fn === 'function' ? fn : null;
}

/**
 * THE POOL'S INVASION FOES. `now()` the frame clock (ms).
 * @param {{ player?: any, now?: () => number, onHurt?: (n: number) => void }} deps
 */
export function createInvasionBossHost({ now = () => performance.now() } = {}) {
  /** @type {Map<any, () => void>} the bodies whose corpse waits out their fall */
  const falls = new Map();

  /** Its pose, read once a frame (the first read of a frame keeps it for the rest). @param {any} foe @param {number} time */
  const poseOf = (foe, time) => {
    if (foe._tbPoseAt !== time) {
      foe._tbPose = invasionBossPose(foe, time);
      foe._tbPoseAt = time;
    }
    return foe._tbPose;
  };

  /** A cell's foe, one frame: walked toward where the cell says it stands (or set there, far off), its swing and its
   *  hurt played as the field marked them, its frame drawn. @param {any} foe @param {number[]|null} playerFeet
   *  @param {number[]|null} eye @param {number} time */
  function drive(foe, playerFeet, eye, time) {
    const link = foe._inv;
    const motor = foe.ai;
    const dt = Math.min(STEP_MAX_S, Math.max(0, (time - (link.t ?? time)) / 1000));
    link.t = time;
    if (isInvasionBossFoe(foe) && poseOf(foe, time).holds) {
      motor.holdFrame?.();
      if (foe.mobile?.heldPose) foe._mout = foe.mobile.heldPose('idle', 0, motor.yaw, motor.feet, eye ?? motor.feet);
      return true;
    }
    const goal = link.goal;
    if (goal) {
      const gap = Math.hypot(goal[0] - motor.feet[0], goal[2] - motor.feet[2]);
      if (gap > INVASION_SNAP_M) {
        motor.feet[0] = goal[0];
        motor.feet[2] = goal[2];
        if (Number.isFinite(goal[1])) motor.feet[1] = goal[1];
        motor.walkGoal = null;
      } else if (gap > INVASION_ARRIVE_M) {
        const was = motor.walkGoal;
        if (!was || Math.hypot(was[0] - goal[0], was[2] - goal[2]) > 0.3) motor.walkTo?.([goal[0], motor.feet[1], goal[2]]);
      }
    }
    if (motor.walkGoal && typeof motor.update === 'function') motor.update(dt, playerFeet);
    else motor.moving = false;
    if (link.face) {
      motor.yaw = Math.atan2(link.face[0] - motor.feet[0], link.face[2] - motor.feet[2]);
      link.face = null;
    }
    const striking = !!link.strike;
    const hurting = !!link.hurt;
    link.strike = false;
    link.hurt = false;
    if (foe.mobile?.update)
      foe._mout = foe.mobile.update(dt, { moving: !!motor.moving, striking, rangedStriking: false, hurting, casting: false, hold: false }, motor.yaw, motor.feet, eye ?? motor.feet);
    return true;
  }

  return {
    /** Is it an invasion's boss still rising (it takes no blow)? @param {any} foe */
    rising: (foe) => isInvasionBossFoe(foe) && !foe.dead && poseOf(foe, now()).holds,

    /**
     * THE DAMAGE DOOR'S QUESTION: does this blow stop here? A cell's foe takes none in the pool - my own blow (`mine`) goes
     * to the cell to be judged - unless the cell's word is killing it; a rising boss takes none either.
     * @param {any} foe @param {number} damage @param {string} kind @param {boolean} mine
     */
    takes(foe, damage, kind, mine) {
      if (foe?._inv) {
        if (foe._inv.dying) return false;
        if (mine && damage > 0) _strike?.(foe, damage, kind);
        return true;
      }
      return isInvasionBossFoe(foe) && !foe.dead && poseOf(foe, now()).holds;
    },

    /**
     * Its frame, before the pool steps it: a cell's foe driven here, answering true (the pool must not step it).
     * @param {any} foe @param {number[]|null} playerFeet @param {number[]|null} eye
     */
    frame(foe, playerFeet, eye) {
      if (!foe?._inv || !foe.ai) return false;
      return drive(foe, playerFeet, eye, now());
    },

    /** Is its dead body still falling - drawn as it was, its corpse not yet laid? @param {any} foe */
    falling: (foe) => falls.has(foe) && !!foe.batch,

    /**
     * Its billboard as its pose draws it, after the pool set the batch's origin: lowered or raised by `dy`, tipped
     * over by `tilt`, sideways to `eye` so the fall reads. @param {any} foe @param {number[]|null} eye
     */
    dress(foe, eye) {
      const batch = foe.batch;
      if (!batch || !isInvasionBossFoe(foe)) return;
      const pose = poseOf(foe, now());
      const drawnAt = batch.origin;
      if (pose.dy && drawnAt) {
        const drawn = (foe._tbDrawn ??= [0, 0, 0]);
        drawn[0] = drawnAt[0];
        drawn[1] = drawnAt[1] + pose.dy;
        drawn[2] = drawnAt[2];
        batch.origin = drawn;
      }
      if (!(pose.tilt > 0)) {
        batch.tip = undefined;
        return;
      }
      const feet = foe.ai?.feet ?? drawnAt ?? [0, 0, 0];
      const dx = feet[0] - (eye?.[0] ?? feet[0] - 1),
        dz = feet[2] - (eye?.[2] ?? feet[2]);
      const len = Math.hypot(dx, dz) || 1;
      batch.tip = [-dz / len, dx / len, pose.tilt];
    },

    /** Does the pool keep its live batch at its death (an invasion's boss, drawn through its fall)? @param {any} foe */
    keeps: (foe) => isInvasionBossFoe(foe) && !!foe.batch,

    /**
     * Its death: `mint()` lays its corpse now - or, for a body the pool kept (`keeps`), after its fall, `free()` (its
     * batch freed) first. @param {any} foe @param {() => void} mint @param {() => void} free
     */
    lay(foe, mint, free) {
      if (!isInvasionBossFoe(foe) || !foe.batch) return mint();
      const time = now();
      foe._tbPose = invasionBossPose(foe, time); // its fall starts now, whatever this frame read before its death
      foe._tbPoseAt = time;
      falls.set(foe, () => {
        free();
        mint();
      });
    },

    /** Once a frame: a fall done lays its corpse; a body the pool freed meanwhile lays none. */
    tick() {
      const time = now();
      for (const [foe, lay] of falls) {
        if (!foe.batch) falls.delete(foe);
        else if (time - (foe._tbFellAt ?? time) >= INVASION_FALL_MS) {
          falls.delete(foe);
          lay();
        }
      }
    },
  };
}
