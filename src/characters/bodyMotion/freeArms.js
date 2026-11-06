// Free limbs follow the actual stride, with a relaxed wrist and no independent oscillator.
import { bodyOf, algebra, clamp, ease } from './bodyKit.js';
import { bodyFrames, solveBody } from './bodySolve.js';
import { armByAngles, carryClassOf } from './carry.js';
const { sub, dot, len, norm, scale } = algebra;
export function freeArmSides(word) {
  if (!word || word.busy || word.equip || word.rifle || word.spell || word.blow?.section) return [];
  const cls = carryClassOf(word), leftHeld = word.shield || word.torch || word.spellHand;
  if (cls === 'one' && !leftHeld) return ['L'];
  if (cls === 'free' && leftHeld) return ['R'];
  return [];
}
export function createFreeArms() {
  let word = null, dt = 0, frame = 0;
  const states = { L: { w: 0, swing: null, frame: -1 }, R: { w: 0, swing: null, frame: -1 } };
  return {
    step(delta, on, input) {
      dt = Math.max(0, delta); frame++; word = input;
      const sides = on && input?.on !== false && input?.grounded !== false && !input?.swimming && !input?.levitating && !input?.sneaking && !input?.climbing ? freeArmSides(input) : [];
      for (const side of ['L','R']) {
        const state = states[side];
        if (!sides.includes(side)) { state.w = 0; state.swing = null; }
        else state.w = ease(state.w, 1, 0.14, dt);
      }
    },
    apply(skeleton, pose, root, skelMats) {
      if (!word || !(states.L.w > 0 || states.R.w > 0)) return;
      const body = bodyOf(skeleton, root, skelMats); if (!body) return;
      const mats = skelMats(skeleton, pose, root), F = bodyFrames(body, mats); if (!F) return;
      const stride = clamp(dot(sub(mats.get(body.bones.L.foot).t, mats.get(body.bones.R.foot).t), F.fwd) / body.leg, -1, 1);
      const move = clamp((Number(word.speed) || 0) / 2, 0, 1), run = word.running ? move : 0;
      const requests = {};
      for (const side of ['L','R']) {
        const state = states[side]; if (!(state.w > 0)) continue;
        const goal = stride * (side === 'R' ? 1 : -1) * move;
        if (state.frame !== frame) { state.swing = state.swing == null ? goal : ease(state.swing, goal, 0.065, dt); state.frame = frame; }
        const b = body.bones[side], S = mats.get(b.upper).t, E = mats.get(b.fore).t, W = mats.get(b.hand).t;
        const arm = armByAngles(side, S, F, len(sub(E,S)), len(sub(W,E)), {
          flex: 5 + state.swing * (40 + 12 * run), abduct: 10, elbow: 18 + 42 * run + Math.max(0,state.swing) * 12, twist: 0,
        });
        const inward = scale(F.right, side === 'R' ? -1 : 1);
        const palm = norm(sub(inward, scale(arm.fore, dot(inward,arm.fore))));
        requests[side] = { at: arm.wrist, pole: arm.pole, fingers: arm.fore, palm, w: state.w };
      }
      solveBody(skeleton, pose, root, skelMats, { w: 1, arms: () => requests });
    },
    reset() { word = null; for (const state of Object.values(states)) { state.w = 0; state.swing = null; state.frame = -1; } },
  };
}
