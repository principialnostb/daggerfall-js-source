// @ts-check
// FIST-LEGS (ONE-FIGHTER, the owner, 2026-11-12: the fists' legs "about as the others' are" - "a fighting stance is a
// fighting stance"). A weapon's attack clip stands still below the waist, so BLOW-LEGS anchors its feet and drives its
// hips. The hand-to-hand clips walk their own legs - a foot 90 cm over the ground without leaving it - and anchored
// against that the thighs twisted (the repair of 2026-11-09 took the fists out of BLOW-LEGS). So while a standing
// punch plays, the lower body is HELD at the stance it stood in - the pelvis, the legs, the lower spine, as the clip
// last posed them with no blow on - and BLOW-LEGS takes the fists as it takes a blade. Above the waist the punch is
// the clip's own.
import { ease, clamp01 } from './bodyKit.js';
import { orthonormal } from '../../combat/climbRig.js';
import { carryClassOf } from './carry.js';
import { lowerBodyBones } from '../../combat/lowerBodyLayer.js';

/** Seconds: the hold taken up as a punch begins (`in`), let go once the blows are over (`out`, after `after`); `still`
 *  the pace under which the body stands. */
export const FIST_LEGS = Object.freeze({ in: 0.06, out: 0.3, after: 0.45, still: 0.3 });

const REFS = new WeakMap();
/** The lower body's bone refs on a skeleton (lowerBodyLayer.js's mask, by ref). */
function lowerRefs(skeleton) {
  let refs = REFS.get(skeleton);
  if (!refs) {
    const names = lowerBodyBones(skeleton);
    refs = [];
    for (const [ref, node] of skeleton.nodes) if (names.has(String(node?.name || '').toLowerCase())) refs.push(ref);
    REFS.set(skeleton, refs);
  }
  return refs;
}

const mixRot = (a, b, k) => {
  if (!a || !b || a.length !== b.length) return b ?? a;
  const m = a.map((v, i) => v + (b[i] - v) * k);
  if (m.length === 9) return orthonormal(m);
  const l = Math.hypot(...m) || 1; // a quaternion
  return m.map((v) => v / l);
};
const mixVec = (a, b, k) => (a && b ? a.map((v, i) => v + (b[i] - v) * k) : (b ?? a));

/** Do the fists stand to punch: drawn, on the ground, not travelling. */
export function fistsStand(word) {
  return (
    !!word?.on &&
    carryClassOf(word) === 'fists' &&
    !word.busy &&
    !word.swimming &&
    !word.levitating &&
    word.grounded !== false &&
    !(Number(word.speed) > FIST_LEGS.still)
  );
}

export function createFistLegs(config = FIST_LEGS) {
  let w = 0,
    since = Infinity,
    stance = null,
    taking = false,
    cached = null;
  const layer = {
    step(dt, on, word) {
      const d = Math.max(0, dt),
        stand = !!on && fistsStand(word);
      since = stand && word.blow ? 0 : since + d;
      const want = stand && since < config.after;
      taking = stand && !word.blow && !(w > 1e-3); // the stance is read only while nothing holds it
      w = ease(w, want ? 1 : 0, want ? config.in : config.out, d);
      if (!stand) {
        w = 0;
        stance = null;
      } else if (!want && w < 1e-3) w = 0;
    },
    weight: () => w,
    apply(skeleton, pose) {
      if (!skeleton?.nodes) return null;
      const refs = lowerRefs(skeleton);
      if (taking) {
        stance = new Map();
        for (const ref of refs) {
          const p = pose.get(ref) ?? skeleton.nodes.get(ref)?.rest;
          if (p)
            stance.set(ref, {
              rotation: p.rotation ? [...p.rotation] : null,
              translation: p.translation ? [...p.translation] : null,
              scale: p.scale,
            });
        }
        return null;
      }
      if (!(w > 1e-3) || !stance) return null;
      const k = clamp01(w);
      for (const ref of refs) {
        const held = stance.get(ref);
        if (!held) continue;
        const now = pose.get(ref) ?? skeleton.nodes.get(ref)?.rest;
        pose.set(ref, {
          rotation: mixRot(now?.rotation, held.rotation, k),
          translation: mixVec(now?.translation, held.translation, k),
          scale: now?.scale ?? held.scale,
        });
      }
      return { held: k };
    },
    slot(inner) {
      if (cached && cached.inner === inner) return cached.fn;
      cached = {
        inner,
        fn: (skeleton, pose, root, skelMats) => {
          layer.apply(skeleton, pose);
          return inner ? inner(skeleton, pose, root, skelMats) : null;
        },
      };
      return cached.fn;
    },
  };
  return layer;
}
