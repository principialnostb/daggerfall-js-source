import { movingStrikeGain } from '../../combat/movingStrike.js';
// @ts-check
// Shift the legs and pelvis under a standing blow while preserving the weapon clip on the upper body.

import { algebra, bodyOf, bodyTurn, transpose, mul, apply, clamp01, ease, smooth, at } from './bodyKit.js';
import { solveBody, swingWay } from './bodySolve.js';
import { kneePole } from './guardWalkBalance.js'; // CLIP-KNEE
import { rotationPart } from '../../combat/climbRig.js';
import { MW_WEAPON_TYPE } from '../../formats/morrowind/mwFirstPerson.js';
import { carryClassOf } from './carry.js';

const { add, sub, scale, len, norm, lerp3 } = algebra;

/**
 * THE KEY POSES, each blow its own, in shares of the leg (hip to ankle) and radians: `wind` the wind-up's (`back` the
 * hips behind the feet, `drop`, `yaw` the turn away - bodyKit.js bodyTurn's sense, + to the body's left - `pitch` +
 * the front down), `hit` the strike's (`fwd` the hips ahead, `drop`, `yaw` through the swing, `pitch`), `step` the lead
 * foot's step forward at the hit. A backhand's turns are the forehand's mirrored; a left hand's blow mirrors the turns
 * and leads with the right foot.
 */
export const BLOW_LEGS = Object.freeze({
  chop: Object.freeze({
    wind: { back: 0.035, drop: 0.015, yaw: -0.1, pitch: -0.06, side: 0.02 },
    hit: { fwd: 0.07, drop: 0.075, yaw: 0.1, pitch: 0.12, side: 0.015 },
    step: 0.15,
  }),
  slash: Object.freeze({
    wind: { back: 0.03, drop: 0.02, yaw: -0.24, pitch: 0, side: 0.04 },
    hit: { fwd: 0.045, drop: 0.065, yaw: 0.3, pitch: 0.04, side: 0.03 },
    step: 0,
  }),
  thrust: Object.freeze({
    wind: { back: 0.045, drop: 0.015, yaw: -0.2, pitch: -0.03, side: 0.03 },
    hit: { fwd: 0.1, drop: 0.055, yaw: 0.22, pitch: 0.07, side: 0.025 },
    step: 0.24,
  }),
});
/** The WEIGHT - `side` above, the hips over the
 *  back foot in the wind-up and over the lead one at the hit (shares of the leg) - and the PIVOT: each foot turns on its
 *  ball after the hips' turn by its share, the back foot's heel going out as a strike drives off it (BLOW_PIVOT; the feet
 *  stood toes fixed while the hips turned 17-22 degrees, the whole turn in the hip joints). `ball` the ball of the foot
 *  ahead of the ankle, in shares of the leg. */
export const BLOW_PIVOT = Object.freeze({ back: 0.6, lead: 0.2, ball: 0.14 });
/** A leg reaches at most `reach` of its length (never locked), the hips
 *  sinking up to `sink` of the leg to keep it so (0.96: the knee near 150 degrees, a stance's own); a step goes no further than `ahead` of the leg in front of its hip - the hip as it stood at the anchoring - and one with less than `least` of the leg of room is not taken. */
/** A blow struck MOVING -
 *  the stride's feet are the movement clip's (LOWER-BODY), each frame where it sets them, never anchored nor stepped -
 *  and over them the hips load and drive as standing, by `share`: dropped, turned and tipped through the swing, not sent
 *  forward or aside (that is the stride's own). Before it a moving blow's hips were the stride's alone, and a chop struck
 *  walking ended 0.35-0.6 m higher than standing. The body coming to a stand hands its hips over to the standing blow
 *  over `ease` seconds, the feet anchored where the stride has just set them. */
export const BLOW_MOVE = Object.freeze({
  share: 0.7,
  fwd: 0.5,
  ease: 0.15,
  crouch: Object.freeze([0.015, 0.03]),
  lean: Object.freeze([0.07, 0.14]),
  dip: Object.freeze([0.01, 0.02]),
  run: 8,
  guardIn: 0.18,
  guardOut: 0.3,
  fade: Object.freeze([5.5, 7]),
});
/** A two-hander struck moving keeps its stride, without the standing lunge's depth and advance. */
export const GUARD_BLOW_MOVE = Object.freeze({
  share: 0.35,
  fwd: 0,
  crouch: Object.freeze([0.005, 0.008]),
  lean: Object.freeze([0.03, 0.05]),
  dip: Object.freeze([0.003, 0.006]),
});
// Ease the fighting crouch into a walk. Fade the leg correction as speed rises so a long running stride
// keeps its authored knee spacing and hip height.
export const LUNGE_GUARD = Object.freeze({ reach: 0.96, sink: 0.12, ahead: 0.45, least: 0.04 });
/** A step's lift at most this share of its own length. */
const STEP_LIFT = 0.3;
// Armoured-Twohand-Pilot.md: keep the owner's accepted overhead unchanged.
// Side cuts now have a small advancing step and more hip rotation; a thrust
// reaches from a narrower, less crouched support than the overhead.
export const SWORD_BLOW_KEYS = Object.freeze({
  chop: BLOW_LEGS.chop,
  slash: Object.freeze({
    wind: { back: 0.04, drop: 0.02, yaw: -0.3, pitch: -0.025, side: 0.04 },
    hit: { fwd: 0.065, drop: 0.065, yaw: 0.38, pitch: 0.055, side: 0.03 },
    step: 0.09,
  }),
  thrust: Object.freeze({
    wind: { back: 0.05, drop: 0.015, yaw: -0.16, pitch: -0.035, side: 0.03 },
    hit: { fwd: 0.12, drop: 0.045, yaw: 0.18, pitch: 0.08, side: 0.025 },
    step: 0.26,
  }),
});
// A straight punch steps in, a hook turns the hips, and an overhand drops the shoulder.
// The hand-to-hand clip already crouches, so the added hip drop is smaller than a sword strike.
export const FIST_BLOW_KEYS = Object.freeze({
  chop: Object.freeze({
    wind: { back: 0.045, drop: 0.02, yaw: -0.16, pitch: -0.07, side: 0.03 },
    hit: { fwd: 0.1, drop: 0.03, yaw: 0.2, pitch: 0.06, side: 0.02 },
    step: 0.2,
  }),
  slash: Object.freeze({
    wind: { back: 0.04, drop: 0.025, yaw: -0.32, pitch: -0.03, side: 0.045 },
    hit: { fwd: 0.075, drop: 0.045, yaw: 0.14, pitch: 0.06, side: 0.035 },
    step: 0.12,
  }),
  thrust: Object.freeze({
    wind: { back: 0.055, drop: 0.02, yaw: -0.2, pitch: -0.04, side: 0.03 },
    hit: { fwd: 0.14, drop: 0.04, yaw: 0.24, pitch: 0.06, side: 0.025 },
    step: 0.28,
  }),
});
/** Alternate the weight-bearing foot with the punching hand so chained strikes transfer weight through the
 * torso. */
export const PUNCH_CHAIN = Object.freeze({ lead: 0.6, early: 0.5 });
/** Keep a ready base between punches so the next wind-up starts from the planted stance. */
export const PUNCH_READY = Object.freeze({ seconds: 0.6, yaw: -0.2, pitch: -0.04, tau: 0.1 });
/** The
 *  hook's fist landed 45 cm past the centre line, the trunk and hips turned 45 degrees over the clip's own; the
 *  overhand's 30 cm under the head. At the hit the turn and the lean are now small: the wind-up still cocks the trunk,
 *  the fist lands on the line at the chin. */
export const FIST_TRUNK = Object.freeze({
  chop: Object.freeze({ wind: { yaw: -0.3, pitch: -0.1 }, hit: { yaw: 0.22, pitch: 0.06 } }),
  slash: Object.freeze({ wind: { yaw: -0.42, pitch: -0.02 }, hit: { yaw: 0.06, pitch: 0.06 } }),
  thrust: Object.freeze({ wind: { yaw: -0.3, pitch: -0.05 }, hit: { yaw: 0.28, pitch: 0.07 } }),
});
/** A punch's hips: blowPhase's, the drive begun inside the wind-up (PUNCH_CHAIN). */
export function punchPhase(section, progress) {
  const ph = blowPhase(section, progress);
  if (!ph) return ph;
  const p = clamp01(progress),
    C = PUNCH_CHAIN;
  if (section === 'windup')
    return { load: smooth(p / C.lead), drive: C.early * smooth((p - C.lead) / (1 - C.lead)), recover: 0 };
  if (section === 'release') return { ...ph, drive: C.early + (1 - C.early) * ph.drive };
  return ph;
}
export const BLOW_LEGS_TIME = Object.freeze({
  hold: 0.25,
  home: 0.55,
  step: 0.16,
  lift: 0.06,
  tau: 0.035,
  release: 0.25,
  leave: 0.45,
  in: 0.06,
  out: 0.12,
  heavy: 0.4,
  still: 0.3,
  after: 0.4,
  rest: 0.5,
});
/* With no blow to
 * follow the hips rose out of the lunge at `tau`, one frame, the knees snapping straight - they let go over `release`. */
/* The stepped foot waits `rest` seconds after the last blow before it steps home - blows clicked one by one
 * stepped it out and home again each time, a hop on every blow. */
/* The layer came on the first still frame and took its anchors from it - the stride LOWER-BODY was still handing
 * back to the clip (its ease out, 0.12 s) - and held them through every blow the held button chained. It comes on now
 * only `after` seconds of standing, once the legs are the clip's own stance again - the stance the owner sees once the
 * button is let go. */

const smoothBack = (t) => 1 - (1 - clamp01(t)) ** 3; // the release's snap: fast out of the wind-up, settling into the hit

/** Where in its key poses a blow stands: the wind-up's load, the release's drive, the follow-through's recovery - each
 *  0..1 - read off the machine's section and that section's progress. */
export function blowPhase(section, progress) {
  const p = clamp01(Number(progress) || 0);
  if (section === 'windup') return { load: smooth(p), drive: 0, recover: 0 };
  if (section === 'release') return { load: 1, drive: smoothBack(p), recover: 0 };
  if (section === 'follow')
    return { load: 1, drive: 1, recover: smooth((p - BLOW_LEGS_TIME.hold) / (1 - BLOW_LEGS_TIME.hold)) };
  return null;
}

/** The pose the blow asks now (shares of the leg, radians), and whether its lead foot wants to be forward (true), home
 *  (false) or left where it stands (null - a wind-up does not step). */
export function blowLegsPose(blow, heavy = 0) {
  const keys = (blow?.fists ? FIST_BLOW_KEYS : blow?.sword ? SWORD_BLOW_KEYS : BLOW_LEGS)[blow?.type];
  const ph = keys ? (blow.fists ? punchPhase : blowPhase)(blow.section, blow.progress) : null; // A punch's hips lead
  if (!keys || !ph) return null;
  const k = (0.75 + 0.25 * clamp01(Number(blow.strength ?? 1))) * (1 + BLOW_LEGS_TIME.heavy * clamp01(heavy));
  const mirror = (blow.reversed ? -1 : 1) * (blow.hand === 'L' ? -1 : 1);
  const { wind: w, hit: h } = keys;
  const mix = (a, b) => ((1 - ph.drive) * a * ph.load + ph.drive * b) * (1 - ph.recover) * k;
  const fwd = mix(-w.back, h.fwd),
    drop = mix(w.drop, h.drop),
    yaw = mix(w.yaw, h.yaw) * mirror,
    pitch = mix(w.pitch, h.pitch);
  // The weight toward the back foot loading, the lead foot striking - the back foot the right for a right hand's
  // blow (x +), the left for a left hand's
  const back = blow.hand === 'L' ? -1 : 1,
    side = mix(w.side ?? 0, -(h.side ?? 0)) * back;
  const forward = !(keys.step > 0)
    ? false
    : blow.section === 'windup'
      ? blow.fists && ph.drive > 0.05
        ? true
        : null
      : blow.section === 'release' || clamp01(blow.progress) < BLOW_LEGS_TIME.home;
  // The drive's own envelope (0 loading, 1 at the hit, back to 0 recovered) - a moving blow's lean and dip ride it
  const drive = ph.drive * (1 - ph.recover);
  // The trunk's own turn, a beat behind the hips - on the blow's plain phases
  const tk = blow.fists ? FIST_TRUNK[blow.type] : null,
    tp = tk ? blowPhase(blow.section, blow.progress) : null;
  const tmix = (a, b) => ((1 - tp.drive) * a * tp.load + tp.drive * b) * (1 - tp.recover) * k;
  const trunk =
    tk && tp ? { yaw: tmix(tk.wind.yaw, tk.hit.yaw) * mirror, pitch: tmix(tk.wind.pitch, tk.hit.pitch) } : null;
  return {
    fwd,
    drop,
    yaw,
    pitch,
    side,
    drive,
    step: keys.step * k,
    lead: blow.hand === 'L' ? 'R' : 'L',
    forward,
    trunk,
  };
}

/** One foot's steps: planted at `off` (rig units from its anchor), or on its way from `from` to `to` - lifted, never
 *  slid. A new goal mid-step starts from where the foot is. */
function createFoot() {
  let off = [0, 0, 0],
    from = null,
    to = null,
    t = 0,
    height = 0;
  const now = () => {
    if (!to) return off;
    const p = lerp3(from, to, smooth(t));
    return [p[0], p[1], p[2] + Math.sin(Math.PI * clamp01(t)) * height];
  };
  return {
    /** A null goal lets an existing step finish. Advance the foot with elapsed frame time and use lift only while it
     * travels. */
    goal(goal, dt, lift) {
      if (to) {
        t += dt / BLOW_LEGS_TIME.step;
        if (t >= 1) {
          off = to;
          from = to = null;
          t = 0;
        }
      }
      if (goal && len(sub(goal, to ?? off)) > 0.5) {
        from = now();
        to = goal;
        t = 0;
        height = Math.min(lift, STEP_LIFT * len(sub(to, from)));
      }
      return now();
    },
    air: () => !!to,
    /** Where the foot stands or is going (its offset). */
    goingTo: () => to ?? off,
    reset() {
      off = [0, 0, 0];
      from = to = null;
      t = 0;
    },
  };
}

/** A running attacker who stops still has a foot in flight. Finish that step before settling into the planted
 * stance. */
export const BLOW_SETTLE = Object.freeze({ apart: 0.25, lifted: 0.04, split: 0.05 });
export function settleOffsets(anchor, hips, leg, moved = false) {
  const along = Math.abs(anchor.L.at[1] - anchor.R.at[1]),
    up = Math.abs(anchor.L.at[2] - anchor.R.at[2]);
  // Two feet planted far apart are the guard's own fighting stance, not a stride - a body the layer finds
  // standing (it waits BLOW_LEGS_TIME.after) keeps it; only a foot still in the air is stepped down (or, `moved`, any pair)
  if (!(up > BLOW_SETTLE.lifted * leg) && !(moved && along > BLOW_SETTLE.apart * leg)) return null;
  const planted = anchor.L.at[2] <= anchor.R.at[2] ? 'L' : 'R';
  const mid = (hips.L[1] + hips.R[1]) / 2;
  const off = {};
  for (const s of ['L', 'R']) {
    const goal = [hips[s][0], mid + (s === 'L' ? 1 : -1) * BLOW_SETTLE.split * leg, anchor[planted].at[2]];
    off[s] = sub(goal, anchor[s].at);
  }
  const first = len(off.L) >= len(off.R) ? 'L' : 'R';
  return { off, order: [first, first === 'L' ? 'R' : 'L'], toe: anchor[planted].toe, up: anchor[planted].up };
}

/** The stride's back foot, found more than `behind` of the leg behind its hip, stepped in to `to` behind it
 *  (the other foot kept, no foot turned) - or null. As settleOffsets' answer, for the feet's own stepping. Pure. */
export const TRAILING_FOOT = Object.freeze({ behind: 0.3, to: 0.18 });
export function trailingStep(anchor, hips, leg) {
  const back = (s) => hips[s][1] - anchor[s].at[1];
  const s = back('L') >= back('R') ? 'L' : 'R',
    o = s === 'L' ? 'R' : 'L';
  if (!(back(s) > TRAILING_FOOT.behind * leg)) return null;
  return {
    off: { [s]: [0, back(s) - TRAILING_FOOT.to * leg, 0], [o]: [0, 0, 0] },
    order: [s, o],
    toe: null,
    up: null,
    done: false,
  };
}

/** THE LAYER. `step` each frame with the motion word (bodyMotion.js motionWord's) and the body's weight; `apply` in the
 *  third-person motion slot (bodyWeight.js's), after the carry and before the elbows' clearance. */
export function createBlowLegs() {
  let w = 0;
  let want = null;
  let pose = { fwd: 0, drop: 0, yaw: 0, pitch: 0, side: 0 };
  let anchor = null;
  let lastDt = 0;
  // The share of a blow's turn the hips do not take moving (all of it at a run) - laid on the spine above
  // them, so a blow swings as wide walking and running as standing and the stride's legs are left alone
  let trunk = { yaw: 0, pitch: 0 };
  let fistSince = Infinity,
    fistSide = 1; // Seconds since the last punch, and its side
  // A lead foot stepped out stays out through a series (the blow's own follow-through sent it home, and the
  // next blow's drive out again - forward, back, forward); it goes home once the blows stop, the layer held on for it
  let stepped = false;
  let planting = false; // Only a body standing has its feet anchored
  let stand = 1;
  let fromMove = false; // The feet about to be anchored were the stride's
  let guardTravel = false;
  let guard = 0; // How far the stride is sunk into a fighting walk   // BLOW-MOVE: how far the blow is the standing one (0 struck moving: the stride's feet, a share of the hips)
  let sinceBlow = Infinity; // Seconds since the last blow
  let leave = 0; // How far the anchored feet have gone back to the clip's stance
  /** @type {null | { off: Record<string, number[]>, order: string[], toe: number[], up: number[], done?: boolean }} */
  let settle = null; // STOP-UNDER-A-BLOW
  let still = Infinity; // Seconds since the body last moved
  const feet = { L: createFoot(), R: createFoot() };
  const layer = {
    /** One frame: `on` the switch in third person, `word` the motion word, `heavy` the body's weight (0..1). */
    step(dt, on, word, heavy = 0) {
      lastDt = Math.max(0, dt);
      guardTravel = !!word?.shown && word.mwType === MW_WEAPON_TYPE.LongBladeTwoHand; // the claymore's moving blow; a one-hander's legs keep BLOW_MOVE (its keys crossed a one-hander's feet)
      const movingKeys = guardTravel ? GUARD_BLOW_MOVE : BLOW_MOVE;
      still = word && Number(word.speed) > BLOW_LEGS_TIME.still ? 0 : still + Math.max(0, dt);
      const grounded =
        !!word && word.on !== false && !word.busy && word.grounded !== false && !word.swimming && !word.levitating;
      const standing = grounded && still >= BLOW_LEGS_TIME.after;
      // The fists strike on these legs too - their clip's own held at the stance (fistLegs.js)
      const fists = carryClassOf(word ?? {}) === 'fists';
      // A fading standing blow can survive the start of locomotion. Its old foot
      // anchors must not survive with it: a new blow would pull the stride back
      // toward that stance as the layer's weight rises again.
      if (!standing) {
        anchor = null;
        settle = null;
        stepped = false;
        fromMove = true;
        feet.L.reset();
        feet.R.reset();
      }
      // Running is a motor mode, not the 5.5..7 m/s speed band. Never re-solve
      // a running stride toward the attack's feet or pole, including any tail left by a walking blow.
      const struck =
        on && grounded && word.blow
          ? blowLegsPose(
              { ...word.blow, sword: word.shown && word.mwType === MW_WEAPON_TYPE.LongBladeTwoHand, fists },
              heavy,
            )
          : null;
      const trunkTau = struck ? BLOW_LEGS_TIME.tau : BLOW_LEGS_TIME.release; // The trunk lets go as the hips do
      const gain = movingStrikeGain(word, standing);
      // A punch's trunk is its own keys', standing and moving
      if (fists) {
        if (word.blow) {
          fistSince = 0;
          fistSide = (word.blow.reversed ? -1 : 1) * (word.blow.hand === 'L' ? -1 : 1);
        } else fistSince += Math.max(0, dt);
        const ready = !struck && on && grounded && fistSince < PUNCH_READY.seconds; // PUNCH-READY
        const to =
          struck?.trunk ??
          (ready ? { yaw: PUNCH_READY.yaw * fistSide, pitch: PUNCH_READY.pitch } : { yaw: 0, pitch: 0 });
        const tau = struck ? trunkTau : ready ? PUNCH_READY.tau : BLOW_LEGS_TIME.release;
        trunk = { yaw: ease(trunk.yaw, to.yaw, tau, dt), pitch: ease(trunk.pitch, to.pitch, tau, dt) };
      }
      const toTrunk = (yaw, pitch) => {
        trunk = fists
          ? trunk
          : {
              yaw: ease(trunk.yaw, yaw * gain.yaw, trunkTau, dt),
              pitch: ease(trunk.pitch, pitch * gain.pitch, trunkTau, dt),
            };
      };
      if (grounded && word.running && !standing) {
        clearLegs();
        toTrunk(struck?.yaw ?? 0, struck?.pitch ?? 0);
        return 0;
      }
      const asked = standing ? struck : null;
      // Struck moving (or in the stop's first `after` seconds) - a share of the hips over the stride's own feet
      const runFade =
        1 - smooth(((Number(word?.speed) || 0) - BLOW_MOVE.fade[0]) / (BLOW_MOVE.fade[1] - BLOW_MOVE.fade[0]));
      const moving = struck && !standing && runFade > 1e-3 ? struck : null;
      if (moving && w < 1e-3) stand = 0; // a layer that comes on moving starts on the stride's feet
      stand = ease(stand, standing ? 1 : 0, BLOW_MOVE.ease, dt);
      if (moving && stand < 1e-3) stand = 0;
      guard = ease(guard, moving ? runFade : 0, moving ? BLOW_MOVE.guardIn : BLOW_MOVE.guardOut, dt);
      // Within a blow the stepped foot stays out (home only past the blows); out of them, home - the layer on
      if (asked) want = asked.forward === false && stepped ? { ...asked, forward: null } : asked;
      sinceBlow = asked ? 0 : sinceBlow + Math.max(0, dt);
      const homing = !asked && on && standing && stepped && !!want;
      if (homing) want = { ...want, forward: sinceBlow >= BLOW_LEGS_TIME.rest ? false : null };
      // After a moving blow the layer stays on while the hips rise out of the crouch (cut at its own ease out, 0.12 s,
      // they rose 10 cm in it)
      const rising = !struck && grounded && !standing && guard > 0.02;
      planting = !!(asked || homing);
      // Past `rest`, a standing body's feet go back to the clip's stance over `leave`
      leave = asked
        ? ease(leave, 0, BLOW_LEGS_TIME.in, dt)
        : anchor && standing && sinceBlow >= BLOW_LEGS_TIME.rest
          ? Math.min(1, leave + dt / BLOW_LEGS_TIME.leave)
          : leave;
      const on1 = !(leave >= 1 && !asked) && (asked || homing || moving || rising || (!!anchor && standing));
      w = ease(w, on1 ? 1 : 0, on1 ? BLOW_LEGS_TIME.in : BLOW_LEGS_TIME.out, dt);
      if (on1 && w > 0.999) w = 1;
      const k = movingKeys.share + (1 - movingKeys.share) * stand; // the hips' share: moving, standing, between
      const src = asked ?? moving;
      // Read by the body's speed, walk to run
      const v = clamp01((Number(word?.speed) || 0) / BLOW_MOVE.run),
        by = (pair) => pair[0] + (pair[1] - pair[0]) * v;
      const m = 1 - stand,
        drv = src?.drive ?? 0,
        fadeK = stand + m * runFade; // The moving share, gone at a run
      const crouch = by(movingKeys.crouch) * guard;
      const goal = src
        ? {
            fwd: src.fwd * (stand + movingKeys.fwd * m) * fadeK,
            drop: (src.drop * k + by(movingKeys.dip) * drv * m) * fadeK + crouch,
            yaw: src.yaw * k * fadeK,
            pitch: (src.pitch * k + by(movingKeys.lean) * drv * m) * fadeK,
            side: src.side * stand,
          }
        : { fwd: 0, drop: crouch, yaw: 0, pitch: 0, side: 0 };
      const to = (k) => ease(pose[k], goal[k], src ? BLOW_LEGS_TIME.tau : BLOW_LEGS_TIME.release, dt); // LEGS-RELEASE
      pose = { fwd: to('fwd'), drop: to('drop'), yaw: to('yaw'), pitch: to('pitch'), side: to('side') };
      const hips = src ? k * fadeK : 0; // What the hips took of the standing turn
      toTrunk(struck ? struck.yaw * (1 - hips) : 0, struck ? struck.pitch * (1 - hips) : 0);
      if (!on1 && w < 1e-3) clearLegs();
      return w;
    },
    weight: () => w,
    /** The turn for the spine (bodyWeight.js lays it with leanTrunk, before `apply`). */
    trunkTurn: () => trunk,
    /** The layer's own word, for the rig's status. */
    status: () => ({
      w,
      fwd: pose.fwd,
      drop: pose.drop,
      yaw: pose.yaw,
      pitch: pose.pitch,
      air: { L: feet.L.air(), R: feet.R.air() },
      anchored: !!anchor,
    }),
    /** THE POSE over the clip's: the hips moved and turned, the feet set on their anchors (the lead one stepping). */
    apply(skeleton, pose0, rootRef, skelMats) {
      if (!(w > 1e-3)) return null;
      const body = bodyOf(skeleton, rootRef, skelMats);
      const pelvis = body?.bones?.pelvis;
      if (!body || pelvis == null) return null;
      let mats = skelMats(skeleton, pose0, rootRef);
      const leg = body.leg;
      // The stride's feet, where its clip sets them this frame
      const clipFeet = {};
      for (const s of ['L', 'R']) {
        const ref = body.bones[s].foot,
          ax = body.footAxes[s],
          R = rotationPart(mats.get(ref).a);
        const hip = at(mats, body.bones[s].thigh),
          knee = at(mats, body.bones[s].calf),
          toe = ax ? norm(apply(R, ax.fwd)) : [0, 1, 0];
        // The stride's foot solved with a pole of the toes alone put the knee elsewhere than the clip, and each
        // frame the layer let go it went back - the clip's own knee now steers the solve
        clipFeet[s] = {
          at: [...at(mats, ref)],
          toe,
          up: ax ? norm(apply(R, ax.up)) : [0, 0, 1],
          w: 1,
          stance: true,
          reach: len(sub(at(mats, ref), hip)) / leg,
          pole: kneePole(hip, knee, toe, len(sub(knee, hip)) + len(sub(at(mats, ref), knee))),
        };
      }
      if (stand < 1e-3) {
        anchor = null;
        settle = null;
        stepped = false;
        fromMove = true;
        feet.L.reset();
        feet.R.reset();
      }
      // the anchors: where the stance stood the feet when the layer came on - the clip's own slides are not followed
      // Rising out of a moving blow's crouch, still walking, `stand` climbed and the feet
      // were anchored - pinned for 91 frames, 32 cm off the stride; the owner's deformed legs and lagging knees
      if (planting && !anchor) {
        anchor = {};
        for (const s of ['L', 'R']) {
          const ref = body.bones[s].foot,
            ax = body.footAxes[s],
            R = rotationPart(mats.get(ref).a);
          anchor[s] = {
            at: [...at(mats, ref)],
            toe: ax ? norm(apply(R, ax.fwd)) : [0, 1, 0],
            up: ax ? norm(apply(R, ax.up)) : [0, 0, 1],
            reach: len(sub(at(mats, ref), at(mats, body.bones[s].thigh))) / leg,
            hipY: at(mats, body.bones[s].thigh)[1],
          };
        }
        // A stride found here is stepped into a stance
        settle = settleOffsets(anchor, { L: at(mats, body.bones.L.thigh), R: at(mats, body.bones.R.thigh) }, body.leg);
        // Stopped out
        // of a blow struck moving, the stride's back foot is anchored where it last stood - it steps in, alone, to a guard's
        // depth behind its hip; the other foot and every stance's own turn are left as they are
        if (!settle && fromMove)
          settle = trailingStep(anchor, { L: at(mats, body.bones.L.thigh), R: at(mats, body.bones.R.thigh) }, body.leg);
        fromMove = false;
      }
      // the feet: home on their anchors, the lead one stepping forward on a thrust's and a chop's drive
      const lift = BLOW_LEGS_TIME.lift * leg;
      const plan = { w, feet: {} };
      if (!anchor)
        Object.assign(plan.feet, clipFeet); // Struck moving - the stride's feet whole
      else {
        // The second foot waits for the first to land in the stance
        const waits = settle && !settle.done ? settle.order[1] : null;
        for (const s of ['L', 'R']) {
          const lead = want && want.lead === s;
          const home = settle ? settle.off[s] : [0, 0, 0];
          // A step out of a wide stance goes no further than a lunge reaches - the foot at most `ahead` of the
          // leg in front of its hip (a thrust's quarter-leg step from a guard already a third of a leg deep threw the foot
          // 48 cm out and the leg straight)
          // The room is the anchoring's (read off the moving hips each frame, the goal crept and the step began again)
          const room = Math.max(0, LUNGE_GUARD.ahead * leg - (anchor[s].at[1] + home[1] - anchor[s].hipY));
          const reach = Math.min(want?.step ?? 0, room / leg) * leg,
            out = reach >= LUNGE_GUARD.least * leg;
          const fwdGoal =
            s === waits
              ? null
              : lead
                ? want.forward != null
                  ? want.forward
                    ? out
                      ? add(home, [0, reach, 0])
                      : null
                    : home
                  : settle && !settle.done
                    ? home
                    : null
                : home;
          const off = feet[s].goal(fwdGoal, lastDt, lift);
          if (settle && s === settle.order[0] && !feet[s].air() && len(sub(off, home)) < 0.5) settle.done = true;
          if (lead && want.forward === true) stepped = true;
          if (lead && want.forward === false && !feet[s].air() && len(sub(feet[s].goingTo(), home)) < 0.5)
            stepped = false;
          const turned = settle && settle.toe && s !== waits; // a foot sent to the stance turns to the planted one's toe
          const toe = turned ? settle.toe : anchor[s].toe;
          // The foot turned on its ball after the hips - the back foot most, its heel going out
          const turn = pose.yaw * w * (want && want.lead === s ? BLOW_PIVOT.lead : BLOW_PIVOT.back);
          const flat = norm([toe[0], toe[1], 0]),
            ball = scale(flat, BLOW_PIVOT.ball * leg);
          const Rz = bodyTurn(turn, 0, 0);
          const foot = add(anchor[s].at, off);
          const planted = {
            at: add(add(foot, ball), apply(Rz, scale(ball, -1))),
            toe: apply(Rz, toe),
            up: turned ? settle.up : anchor[s].up,
            w: 1,
            stance: !feet[s].air(),
          };
          // Coming to a stand, the anchored feet taken over from the stride's as the blow becomes the standing one
          plan.feet[s] =
            stand >= 1
              ? planted
              : {
                  ...planted,
                  at: lerp3(clipFeet[s].at, planted.at, stand),
                  toe: norm(lerp3(clipFeet[s].toe, planted.toe, stand)),
                };
        }
        // The anchored feet eased onto the clip's, the knee's way along its arc to the clip's own
        const back = smooth(leave);
        if (back > 0) {
          for (const s of ['L', 'R']) {
            const f = plan.feet[s],
              c = clipFeet[s],
              flat = [f.toe[0], f.toe[1], 0],
              own = norm(add(flat, [(s === 'R' ? 1 : -1) * 0.12, 0, 0.02]));
            const at3 = lerp3(f.at, c.at, back),
              pole = swingWay(own, c.pole, sub(at3, at(mats, body.bones[s].thigh)), back);
            plan.feet[s] = {
              ...f,
              at: at3,
              toe: norm(lerp3(f.toe, c.toe, back)),
              up: norm(lerp3(f.up, c.up, back)),
              pole,
            };
          }
        }
      }
      // the hips: turned about their own joint and moved, additively over the clip's
      const node = skeleton.nodes.get(pelvis);
      const local = pose0.get(pelvis) ?? node.rest;
      const parent = mats.get(node.parent);
      const P = parent ? rotationPart(parent.a) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const sp = parent ? Math.hypot(parent.a[0], parent.a[3], parent.a[6]) || 1 : 1;
      const T = bodyTurn(pose.yaw * w, 0, pose.pitch * w);
      const dv = scale([pose.side * leg, pose.fwd * leg, -pose.drop * leg], w);
      // The hips sent back and over
      // the back foot pulled the leg set out ahead straight - 100% of its length, the knee locked and then snapping bent
      // again; a leg that would reach past `reach` of itself has the hips lowered instead, as a body sinks into a deep stance
      const pelvisAt = at(mats, pelvis);
      let sink = 0;
      for (const sd of ['L', 'R']) {
        const f = plan.feet[sd];
        if (!f) continue; // a stepping foot too: the hips settling back as it sets off straightened the leg for a frame
        const hip = add(add(pelvisAt, dv), apply(T, sub(at(mats, body.bones[sd].thigh), pelvisAt)));
        // never straighter than the stance stood it, nor than `reach` - the clip's own stance is left as it is
        const d = sub(hip, f.at),
          h = Math.hypot(d[0], d[1]),
          R = Math.max(LUNGE_GUARD.reach, (anchor ? anchor[sd].reach : clipFeet[sd].reach) ?? 0) * leg;
        if (d[2] > 0 && h < R && Math.hypot(h, d[2]) > R) sink = Math.max(sink, d[2] - Math.sqrt(R * R - h * h));
      }
      // The standing reach guard must not sink a travelling stride into a lunge.
      if (planting || !guardTravel) dv[2] -= Math.min(sink, LUNGE_GUARD.sink * leg);
      const lv = scale(apply(transpose(P), dv), 1 / sp);
      pose0.set(pelvis, {
        rotation: mul(transpose(P), mul(T, mul(P, local.rotation))),
        translation: [local.translation[0] + lv[0], local.translation[1] + lv[1], local.translation[2] + lv[2]],
        scale: local.scale,
      });
      lastDt = 0; // a frame's clocks spent once
      return solveBody(skeleton, pose0, rootRef, skelMats, plan);
    },
    reset() {
      clearLegs();
      trunk = { yaw: 0, pitch: 0 };
    },
  };
  function clearLegs() {
    w = 0;
    leave = 0;
    planting = false;
    stand = 1;
    guard = 0;
    fromMove = false;
    want = null;
    anchor = null;
    settle = null;
    stepped = false;
    sinceBlow = Infinity;
    pose = { fwd: 0, drop: 0, yaw: 0, pitch: 0, side: 0 };
    feet.L.reset();
    feet.R.reset();
  }
  return layer;
}
