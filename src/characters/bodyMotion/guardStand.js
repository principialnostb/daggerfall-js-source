// @ts-check
// GUARD-STAND (ONE-FIGHTER, the owner, 2026-11-12: "one-handed, a shield, the fists are doubtful ... stops are wooden";
// bible/05-Combat/Motion-Doctrine.md): measured in the game, the two-hander stands as it walks (hips 0.92 of the leg over
// the ankle), while a one-hander, a shield and the fists stand up straight at every stop (0.96-0.97) and sink 8 cm at
// every start. A drawn stance weapon now stands at the two-hander's level: the hips lowered, the feet where the clip
// put them, the knees yielding. Only ever lower; a stance already as low is left alone.
import { bodyOf, algebra, at, apply, ease, clamp01 } from './bodyKit.js';
import { rotationPart } from '../../combat/climbRig.js';
import { solveBody } from './bodySolve.js';
import { kneePole } from './guardWalkBalance.js';
import { guardStance } from './guardStance.js';
import { carryClassOf } from './carry.js'; // FIST-STANCE: the fists stand on the two-hander's wide feet
import { MW_WEAPON_TYPE } from '../../formats/morrowind/mwFirstPerson.js';
const { add, sub, scale, len, norm } = algebra;

/** `level`: the hips' height over the lower ankle, in legs - the two-hander's own stand, on its wide feet. `narrow`: the
 *  same HEIGHT on a one-hander's and the fists' closer feet (measured: 0.92 there stood them 2 cm over the two-hander).
 *  `ease` seconds in and out. */
export const GUARD_STAND = Object.freeze({ level: 0.92, narrow: 0.9, ease: 0.22, reach: 0.97 });
/** STAND-LIFE (the owner, 2026-11-12: the fists' stand "very wooden and strange"; read in the lab: the hips and the chest
 *  of a one-hander and the fists moved 0 cm in four seconds, the two-hander's 0.5): the lowered hips breathe `breath` of
 *  a leg down and up every `breathS` seconds and shift `sway` of a leg from foot to foot every `swayS`. The feet stay. */
export const STAND_LIFE = Object.freeze({ breath: 0.008, breathS: 3.1, sway: 0.014, swayS: 5.3 });
/** FIST-BOUNCE (the owner, 2026-11-13: the fists "worse than everything else"): the fists stand on the two-hander's legs,
 *  which hardly move, and wait in the guard between punches. A boxer is never still: the knees give `breath` of a leg
 *  every `breathS` seconds and the weight goes from foot to foot every `swayS`. Quiet while a punch is thrown (`quiet`
 *  seconds in and out): the blow's own hips have the body then. */
export const FIST_BOUNCE = Object.freeze({ breath: 0.014, breathS: 0.72, sway: 0.016, swayS: 2.3, quiet: 0.12 });
const WIDE = Object.freeze([MW_WEAPON_TYPE.LongBladeTwoHand, MW_WEAPON_TYPE.BluntTwoClose, MW_WEAPON_TYPE.AxeTwoHand]);

/** Does this body stand in the stance: a stance weapon drawn (empty hands drawn are fists), on the ground, not travelling. */
export function guardStands(word) {
  return (
    !!word?.on &&
    !!word.shown &&
    guardStance(word.mwType === MW_WEAPON_TYPE.None ? MW_WEAPON_TYPE.HandToHand : word.mwType) &&
    !word.busy &&
    !word.swimming &&
    !word.levitating &&
    !word.spell &&
    word.grounded !== false &&
    !word.running &&
    !(word.speed > 0.1)
  );
}

export function createGuardStand(config = GUARD_STAND) {
  let w = 0,
    cached = null,
    level = Number(config.level),
    t = 0,
    wide = false,
    fists = false,
    calm = 0;
  const layer = {
    step(dt, on, word) {
      const active = !!on && guardStands(word);
      if (active) {
        fists = carryClassOf(word) === 'fists';
        wide = WIDE.includes(word.mwType) || fists;
        level = wide ? config.level : (config.narrow ?? config.level);
      }
      t += Math.max(0, dt);
      calm = ease(calm, active && fists && !word.blow ? 1 : 0, FIST_BOUNCE.quiet, Math.max(0, dt)); // FIST-BOUNCE
      w = ease(w, active ? 1 : 0, config.ease, Math.max(0, dt));
      if (!active && w < 1e-3) w = 0;
    },
    weight: () => w,
    apply(skeleton, pose, root, skelMats) {
      if (!(w > 1e-3)) return null;
      const body = bodyOf(skeleton, root, skelMats);
      if (!body?.footAxes) return null;
      const mats = skelMats(skeleton, pose, root, [body.bones.L.foot, body.bones.R.foot]);
      const mid = scale(add(at(mats, body.bones.L.thigh), at(mats, body.bones.R.thigh)), 0.5);
      const floor = Math.min(at(mats, body.bones.L.foot)[2], at(mats, body.bones.R.foot)[2]);
      const drop = Math.max(0, mid[2] - (floor + level * body.leg)) * clamp01(w);
      const bounce = fists ? clamp01(w) * calm : 0; // FIST-BOUNCE: on the two-hander's legs there is nothing to lower
      if (drop < 1e-4 && !(bounce > 1e-3)) return null;
      // STAND-LIFE: the narrow stands only - the two-hander's breathes already
      const L = { ...(fists ? FIST_BOUNCE : STAND_LIFE), .../** @type {any} */ (globalThis.__standLife ?? {}) },
        live = fists ? bounce : wide ? 0 : clamp01(w) * clamp01(drop / (0.02 * body.leg));
      const breath = live * L.breath * body.leg * 0.5 * (1 - Math.cos((2 * Math.PI * t) / L.breathS));
      const side = scale(
        norm(sub(at(mats, body.bones.R.thigh), at(mats, body.bones.L.thigh))),
        live * L.sway * body.leg * Math.sin((2 * Math.PI * t) / L.swayS),
      );
      const feet = {};
      for (const side of ['L', 'R']) {
        const b = body.bones[side],
          hip = at(mats, b.thigh),
          knee = at(mats, b.calf),
          ankle = at(mats, b.foot);
        const R = rotationPart(mats.get(b.foot).a),
          axes = body.footAxes[side];
        feet[side] = {
          at: [...ankle],
          toe: norm(apply(R, axes.fwd)),
          up: norm(apply(R, axes.up)),
          pole: kneePole(hip, knee, apply(R, axes.fwd), len(sub(knee, hip)) + len(sub(ankle, knee))),
          stance: true,
          w: 1,
        };
      }
      return solveBody(skeleton, pose, root, skelMats, {
        w: 1,
        hip: { at: [mid[0] + side[0], mid[1] + side[1], mid[2] - drop - breath], keepTurn: true },
        feet,
        legsOnly: true,
      });
    },
    slot(inner) {
      if (cached && cached.inner === inner) return cached.fn;
      cached = {
        inner,
        fn: (skeleton, pose, root, skelMats) => {
          layer.apply(skeleton, pose, root, skelMats);
          return inner ? inner(skeleton, pose, root, skelMats) : null;
        },
      };
      return cached.fn;
    },
  };
  return layer;
}
