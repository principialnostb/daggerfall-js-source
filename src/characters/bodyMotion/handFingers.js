// @ts-check
// HAND-FINGERS (2026-11-06, the owner's screenshots and 22-13-15 recording: the fists' fingers half open like claws, a
// free hand's fingers stiff - "work on the fingers everywhere"). The body layer turns a hand and leaves its fingers to the
// clip; the fists' guard stands on the free walk (the worked gait), whose fingers are open (the knuckles 10 degrees, the
// middle joints 17), so a raised fist was a claw. The fingers are now the game's own: a fist is the hand-to-hand idle's
// (`idlehh`, the knuckles 93 degrees, the middle joints 113 - baked below, both hands, from the retail rig's bones); every
// other hand is the clip's fingers eased that share of the way to it - a loose fist, a relaxed hand, a hand closed on a
// hilt: walking and running a drawn blade stood in the free walk's open fingers (20 degrees - the hilt lay in an open
// palm, both hands of a two-hander's), standing in the stance's closed ones (77). A torch, a spell, a bow keep the clip's
// fingers. The port's own; Daggerfall Unity draws no articulated hand.

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

/** The share of the way to the fist each hand's fingers stand: `fist` a fist drawn, `hilt` a hand on a weapon (the
 *  one-handed stance's own 77 degrees), `grip` the hand on a shield's strap, `loose` the fists' free hand beside a
 *  shield, `relaxed` an empty hand; `ease` seconds a change takes. */
export const FINGERS = Object.freeze({ fist: 1, hilt: 0.85, grip: 0.8, loose: 0.6, relaxed: 0.35, ease: 0.12 });

/** The share each hand's fingers want for the motion word (bodyMotion.js motionWord's), or null where the clip keeps
 *  them (a held weapon, a torch, a spell, a bow, a pair, a hand busy in a recoil or a climb). */
export function fingerShares(word) {
  if (!word || !word.on || word.busy || word.equip || word.rifle || word.spell) return { L: null, R: null };
  const cls = carryClassOf(word), shield = !!word.shield;
  const left = word.torch || word.spellHand ? null : shield ? FINGERS.grip : FINGERS.relaxed;
  if (cls === 'fists') return { R: shield ? FINGERS.loose : FINGERS.fist, L: shield ? FINGERS.grip : FINGERS.fist };
  if (cls === 'one') return { R: FINGERS.hilt, L: left };
  if (cls === 'two' || cls === 'wide' || cls === 'spear' || cls === 'dual') return { R: FINGERS.hilt, L: FINGERS.hilt };
  if (cls === 'free') return { R: FINGERS.relaxed, L: left };
  return { L: null, R: null };
}

const nlerp = (a, b, w) => {
  const s = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const q = a.map((v, i) => v + (b[i] * s - v) * w), l = Math.hypot(...q) || 1;
  return q.map((v) => v / l);
};

/** The layer: each hand's share eased to what the word wants, laid on the posed fingers. */
export function createHandFingers() {
  const share = { L: 0, R: 0 }, want = { L: 0, R: 0 };
  return {
    step(dt, on, word) {
      const s = on ? fingerShares(word) : { L: null, R: null };
      for (const side of ['L', 'R']) {
        want[side] = s[side] ?? 0;
        share[side] = ease(share[side], want[side], FINGERS.ease, Math.max(0, dt));
        if (Math.abs(share[side] - want[side]) < 1e-3) share[side] = want[side];
      }
    },
    apply(skeleton, pose) {
      for (const side of ['L', 'R']) {
        const k = clamp01(share[side]);
        if (!(k > 1e-3)) continue;
        for (const [name, fist] of Object.entries(FIST)) {
          if (name[6] !== side.toLowerCase()) continue;
          const ref = skeleton.byName.get(name), node = ref != null ? skeleton.nodes.get(ref) : null;
          if (!node) continue;
          const cur = pose.get(ref) ?? node.rest;
          const q = nlerp(mat33ToQuat(Array.from(cur.rotation)), /** @type {number[]} */ ([...fist]), k);
          pose.set(ref, { ...cur, rotation: quatToMat33(q) });
        }
      }
    },
    status: () => ({ L: share.L, R: share.R }),
    reset() { share.L = share.R = want.L = want.R = 0; },
  };
}
