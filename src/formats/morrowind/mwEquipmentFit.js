import { deformPlayerBodyGeometry, isMorphedBodySlot, measureBodyFrame, weldMorphedNormals } from '../../characters/bodyShape.js';
import { boundsOf } from '../../render/bounds.js';
import { rebuildNormals } from './mwCloakPhysics.js';
import { equipmentBoneSide, fitGarmentToSurfaces, garmentFitSurfaces } from './mwSkinTransfer.js';

// Departure from DFU PaperDoll.Refresh: equipment fits the wearer's posed 3D surface.
// Body sections remain available to the fit even when a garment covers them.
export function configureEquipmentFit(pieces, part, sources) {
  for (const piece of pieces) {
    piece.morphSlot = part.morphSlot;
    if (!sources.length || !piece.indices?.length) continue;
    const side = equipmentBoneSide(piece.bone);
    if (part.fitMode === 'rigid') {
      const donors = sources.filter((source) => {
        const donorSide = equipmentBoneSide(source.fitBone);
        return !side || !donorSide || side === donorSide;
      });
      if (donors.length) piece.rigidBodySources = donors;
    } else {
      piece.bodyClearance = {
        sources, side, clearance: 0.24,
        maxDistance: part.fitMode === 'drape' ? 2.5 : 6,
        ...((part.morphSlot === 'groin' || part.morphSlot === 'upperleg') && part.trouserEase != null
          ? { maxClearance: 0.75 } : {}),
      };
    }
  }
}

export function poseEquipmentMorph(pieces, morph, ctx) {
  const skin = pieces.filter((p) => isMorphedBodySlot(p.slot) && p.positions?.length);
  const worn = pieces.filter((p) => (p.morphSlot || p.rigidBodySources || p.bodyClearance) && p.positions?.length);
  const donors = new Map();
  for (const piece of worn) {
    for (const batch of piece.rigidBodySources ?? piece.bodyClearance?.sources ?? []) {
      if (!donors.has(batch)) donors.set(batch, poseDonor(batch, ctx));
    }
  }
  const bare = [...skin, ...[...donors.values()].filter((p) => isMorphedBodySlot(p.slot))];
  const frame = measureBodyFrame(bare.length ? bare : worn, ctx.skeleton, ctx.mats);
  if (!frame) return;
  for (const p of skin) deformPlayerBodyGeometry(p, morph, frame, ctx.skeleton);
  for (const p of worn) if (!p.rigidBodySources && p.morphSlot) deformPlayerBodyGeometry(p, morph, frame, ctx.skeleton);
  weldMorphedNormals(skin, frame);
  fitMorphedEquipment(worn, morph, frame, ctx, donors);
}

function poseDonor(batch, { skeleton, pose, mats, skinBatch }) {
  const positions = new Float32Array(batch.positions.length);
  skinBatch(batch, skeleton, pose, mats, positions, null);
  return { slot: batch.fitSlot, batch, positions };
}

export function fitMorphedEquipment(pieces, morph, frame, ctx, donors = new Map()) {
  const surfacesByBatch = new Map();
  const deformed = new Map();
  function getDonor(batch) {
    if (!donors.has(batch)) donors.set(batch, poseDonor(batch, ctx));
    if (!deformed.has(batch)) {
      const donor = donors.get(batch);
      const morphed = { ...donor, positions: donor.positions.slice() };
      deformPlayerBodyGeometry(morphed, morph, frame, ctx.skeleton);
      deformed.set(batch, morphed);
    }
    return deformed.get(batch);
  }
  for (const piece of pieces) {
    if (piece.rigidBodySources) {
      fitRigidPiece(piece, donors, getDonor);
      continue;
    }
    const fit = piece.bodyClearance;
    if (!fit) continue;
    const surfaces = fit.sources.flatMap((batch) => {
      if (!surfacesByBatch.has(batch)) {
        surfacesByBatch.set(batch, garmentFitSurfaces([batch], (_, positions) => positions.set(getDonor(batch).positions)));
      }
      return surfacesByBatch.get(batch);
    });
    const fitted = fitGarmentToSurfaces(piece, surfaces, fit);
    if (fitted === piece) continue;
    piece.positions.set(fitted.positions);
    if (piece.normals) rebuildNormals(piece.positions, piece.indices, piece.normals, piece.normals.slice(), piece.mirrored ? -1 : 1);
  }
}

function fitRigidPiece(piece, donors, getDonor) {
  const sources = piece.rigidBodySources;
  const length = sources.reduce((sum, batch) => sum + batch.positions.length, 0);
  const body = new Float32Array(length);
  let offset = 0;
  for (const batch of sources) {
    const morphed = getDonor(batch);
    body.set(donors.get(batch).positions, offset);
    offset += morphed.positions.length;
  }
  const before = boundsOf(body);
  offset = 0;
  for (const batch of sources) {
    const { positions } = getDonor(batch);
    body.set(positions, offset);
    offset += positions.length;
  }
  const after = boundsOf(body);
  // A uniform scale and translation keep the plate's silhouette and normals.
  const scale = before[3] > 1e-5 ? Math.max(1, after[3] / before[3]) : 1;
  for (let i = 0; i < piece.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      piece.positions[i + axis] = after[axis] + (piece.positions[i + axis] - before[axis]) * scale;
    }
  }
}
