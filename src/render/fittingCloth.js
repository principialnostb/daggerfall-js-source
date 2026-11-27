import { foldPieceBounds } from '../formats/morrowind/mwFirstPerson.js';
import { animatedCloaksEnabled } from '../systems/extraAppearance.js';
import { createCloakPhysics, stepCloakPhysics } from '../formats/morrowind/mwCloakPhysics.js';
import { createWolfPeltMotion, stepWolfPeltMotion } from '../formats/morrowind/mwWolfPeltMotion.js';

const sessions = new WeakMap();

function fittingSession(arm) {
  const cloth = [];
  const pieces = arm.pieces.map(piece => {
    const layer = arm.wolfPeltMotion?.layers.find(l => l.piece === piece);
    if (!layer && !piece.clothPhysics) return piece;
    // Share the portrait's posed output, but keep the editable bind stream and
    // Verlet history private. World and inventory can draw on the same frame.
    const base = layer?.base ?? piece.clothPhysics.base;
    const normals = layer?.normals ?? piece.clothPhysics?.baseNormals;
    const copy = { ...piece, batch: { ...piece.batch, positions: base.slice(), normals: normals?.slice() } };
    if (piece.clothPhysics) { copy.clothPhysics = createCloakPhysics(copy); cloth.push(copy); }
    return copy;
  });
  return { source: arm.pieces, arm: { ...arm, pieces }, cloth,
    wolf: arm.wolfPeltMotion ? createWolfPeltMotion(pieces) : null, last: null };
}

export function stepFittingCloth(rig, fitting, now = performance.now()) {
  const arm = rig.arm;
  if (!fitting || !animatedCloaksEnabled()) return rig;
  let session = sessions.get(rig);
  if (!session || session.source !== arm.pieces) {
    session = fittingSession(arm);
    sessions.set(rig, session);
  }
  const dt = session.last == null ? 1/60 : Math.max(0, Math.min(.05, (now-session.last)/1000));
  session.last = now;
  const preview = session.arm;
  preview.pose = arm.pose; preview.mats = arm.mats; preview.cpuSkinned = arm.cpuSkinned;
  for (const piece of session.cloth) {
    stepCloakPhysics(piece, dt, { gait: 0 });
    if (arm.cpuSkinned && arm.mats) {
      arm.fns.skinBatch(piece.batch, arm.skeleton, arm.pose, arm.mats, piece.positions, piece.normals);
      foldPieceBounds([piece]);
    }
  }
  if (session.wolf) stepWolfPeltMotion(session.wolf, preview, dt, {}, arm.wolfPeltUnderSlots);
  return rig;
}
