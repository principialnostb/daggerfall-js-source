import { animatedCloaksEnabled } from '../systems/extraAppearance.js';
import { stepCloakPhysics } from '../formats/morrowind/mwCloakPhysics.js';
import { stepWolfPeltMotion } from '../formats/morrowind/mwWolfPeltMotion.js';
const clocks = new WeakMap();
// Apply the game's idle cloth solve after posing, before uploading the preview.
export function stepFittingCloth(rig, fitting, now = performance.now()) {
  if (!fitting || !animatedCloaksEnabled()) { clocks.delete(rig); return rig; }
  const previous = clocks.get(rig); clocks.set(rig, now);
  const dt = previous === undefined ? 1 / 60 : Math.max(0, Math.min(.05, (now - previous) / 1000));
  for (const piece of rig.arm.pieces) if (piece.clothPhysics) stepCloakPhysics(piece, dt, { gait: 0, turn: 0, attack: 0 });
  if (rig.arm.wolfPeltMotion) stepWolfPeltMotion(rig.arm.wolfPeltMotion, rig.arm, dt, { gait: 0, yaw: 0, attack: 0 });
  return rig;
}
