// @ts-check
// HAND-FINGERS (2026-11-06, the owner's screenshots and 22-13-15 recording: the fists' fingers half open like claws; "fix
// the fingers, simply"). The body layer turns a hand and leaves its fingers to the clip, and every drawn stance walks the
// worked gait - the free walk, its fingers open: a raised fist was a claw, a hilt walked and ran in an open palm (both of
// a two-hander's). The fingers are now the game's own, two of its poses baked from the retail rig: a FIST, the
// hand-to-hand idle's (`idlehh`, the knuckles 88 degrees), and an OPEN hand, the plain idle's (`idle`, an empty hand at
// rest). A hand closed on something stands a share of the way to the fist (a hilt as the one-handed stance closes it
// standing, 77 degrees; a shield's strap); the fists drawn are fists; the free hand beside a shield is the open hand, as
// the free hand beside a sword is the walk's own. Every other hand keeps the clip's fingers. The port's own; Daggerfall
// Unity draws no articulated hand.

import { mat33ToQuat } from '../../combat/heldPose.js';
import { quatToMat33 } from '../../formats/morrowind/mwSkin.js';
import { ease, clamp01 } from './bodyKit.js';
import { carryClassOf } from './carry.js';

/** The hand-to-hand idle's fingers (quaternions, w first), each finger bone's local turn. */
export const FIST = Object.freeze({
  'bip01 l finger0': Object.freeze([0.706, -0.476, -0.2871, 0.4389]),
  'bip01 l finger01': Object.freeze([0.9607, 0, 0, -0.2777]),
  'bip01 l finger1': Object.freeze([0.724, -0.0126, -0.0271, 0.6891]),
  'bip01 l finger11': Object.freeze([0.5596, 0, 0, 0.8287]),
  'bip01 l finger2': Object.freeze([0.7147, -0.0046, -0.0064, 0.6994]),
  'bip01 l finger21': Object.freeze([0.5452, 0, 0, 0.8383]),
  'bip01 r finger0': Object.freeze([0.6681, 0.6024, 0.2666, 0.3459]),
  'bip01 r finger01': Object.freeze([0.9674, 0, 0, -0.2532]),
  'bip01 r finger1': Object.freeze([0.7256, 0.0123, 0.0277, 0.6875]),
  'bip01 r finger11': Object.freeze([0.555, 0, 0, 0.8319]),
  'bip01 r finger2': Object.freeze([0.7215, 0.0046, 0.0066, 0.6924]),
  'bip01 r finger21': Object.freeze([0.5601, 0, 0, 0.8284]),
});

/** The plain idle's fingers - an empty hand at rest (quaternions, w first). */
export const OPEN = Object.freeze({
  'bip01 l finger0': Object.freeze([0.6731, -0.7211, -0.0642, 0.1512]),
  'bip01 l finger01': Object.freeze([0.9869, 0, 0, -0.1615]),
  'bip01 l finger1': Object.freeze([0.9952, 0.0063, -0.0414, 0.0889]),
  'bip01 l finger11': Object.freeze([0.9894, 0, 0, 0.1454]),
  'bip01 l finger2': Object.freeze([0.9931, -0.0005, -0.0168, 0.1162]),
  'bip01 l finger21': Object.freeze([0.9417, 0, 0, 0.3365]),
  'bip01 r finger0': Object.freeze([0.6741, 0.7209, 0.0599, 0.1496]),
  'bip01 r finger01': Object.freeze([0.9875, 0, 0, -0.1579]),
  'bip01 r finger1': Object.freeze([0.9951, -0.0062, 0.0434, 0.0888]),
  'bip01 r finger11': Object.freeze([0.9894, 0, 0, 0.1454]),
  'bip01 r finger2': Object.freeze([0.9931, 0.0007, 0.0192, 0.1161]),
  'bip01 r finger21': Object.freeze([0.9417, 0, 0, 0.3364])
});

/** The share of the way to the FIST a hand closed on something stands: `fist` a fist drawn, `hilt` a hand on a weapon (the
 *  one-handed stance's own 77 degrees), `grip` the hand on a shield's strap; `ease` seconds a change takes. */
export const FINGERS = Object.freeze({ fist: 1, hilt: 0.85, grip: 0.8, ease: 0.12 });

/** Each hand's fingers for the motion word (bodyMotion.js motionWord's): { fist, open } shares, or null where the clip
 *  keeps them (an empty hand, a torch, a spell, a bow, a hand busy in a recoil or a climb). */
export function fingerShares(word) {
  if (!word || !word.on || word.busy || word.equip || word.rifle || word.spell) return { L: null, R: null };
  const cls = carryClassOf(word), shield = !!word.shield;
  const fist = (k) => ({ fist: k, open: 0 });
  const left = !word.torch && !word.spellHand && shield ? fist(FINGERS.grip) : null;
  // FIST-BESIDE-SHIELD: the right beside a shield is a free hand - open, as the free hand beside a sword
  if (cls === 'fists') return shield ? { R: { fist: 0, open: 1 }, L: fist(FINGERS.grip) } : { R: fist(FINGERS.fist), L: fist(FINGERS.fist) };
  if (cls === 'one') return { R: fist(FINGERS.hilt), L: left };
  if (cls === 'two' || cls === 'wide' || cls === 'spear' || cls === 'dual') return { R: fist(FINGERS.hilt), L: fist(FINGERS.hilt) };
  if (cls === 'free') return { R: null, L: left };
  return { L: null, R: null };
}

const nlerp = (a, b, w) => {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const q = a.map((v, i) => v + (b[i] * s - v) * w), l = Math.hypot(...q) || 1;
  return q.map((v) => v / l);
};

/** The layer: each hand's two shares eased to what the word wants, laid on the posed fingers - the open hand, then the fist. */
export function createHandFingers() {
  const share = { L: { fist: 0, open: 0 }, R: { fist: 0, open: 0 } };
  return {
    step(dt, on, word) {
      const s = on ? fingerShares(word) : { L: null, R: null };
      for (const side of ['L', 'R']) for (const key of ['fist', 'open']) {
        const want = s[side]?.[key] ?? 0;
        share[side][key] = ease(share[side][key], want, FINGERS.ease, Math.max(0, dt));
        if (Math.abs(share[side][key] - want) < 1e-3) share[side][key] = want;
      }
    },
    apply(skeleton, pose) {
      for (const side of ['L', 'R']) {
        const kf = clamp01(share[side].fist), ko = clamp01(share[side].open);
        if (!(kf > 1e-3 || ko > 1e-3)) continue;
        for (const name of Object.keys(FIST)) {
          if (name[6] !== side.toLowerCase()) continue;
          const ref = skeleton.byName.get(name), node = ref != null ? skeleton.nodes.get(ref) : null;
          if (!node) continue;
          const cur = pose.get(ref) ?? node.rest;
          let q = mat33ToQuat(Array.from(cur.rotation));
          if (ko > 1e-3) q = nlerp(q, /** @type {number[]} */ ([...OPEN[name]]), ko);
          if (kf > 1e-3) q = nlerp(q, /** @type {number[]} */ ([...FIST[name]]), kf);
          pose.set(ref, { ...cur, rotation: quatToMat33(q) });
        }
      }
    },
    status: () => ({ L: { ...share.L }, R: { ...share.R } }),
    reset() { for (const side of ['L', 'R']) share[side].fist = share[side].open = 0; },
  };
}
