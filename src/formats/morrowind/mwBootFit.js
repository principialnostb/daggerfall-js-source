import { affineMul } from './mwAffine.js';
import { mat33Apply } from './mwNifMesh.js';
import { skinPost } from './mwSkin.js';
import { invert33 } from './mwSkinTransfer.js';
import { rebuildNormals } from './mwCloakPhysics.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const subtract = (a, b) => a.map((v, i) => v - b[i]);

// Sample the shaft in calf space. Requiring a full section skips low shoes,
// buckles and the raised plate in front of some boots.
function bootShaft(boots, calf, foot) {
  const inverse = invert33(calf.a);
  if (!inverse) return null;
  const height = mat33Apply(inverse, ...subtract(foot.t, calf.t))[0];
  if (height < 12) return null;
  const toCalf = (point) => mat33Apply(inverse, ...subtract(point, calf.t));
  const rings = Array.from({ length: 1 + Math.floor(height - 7) }, () => []);
  for (const piece of boots) {
    const local = Array.from({ length: piece.positions.length / 3 }, (_, i) => toCalf(piece.positions.subarray(i * 3, i * 3 + 3)));
    const indices = piece.indices;
    for (let i = 0; i < indices.length; i += 3) {
      for (let edge = 0; edge < 3; edge++) {
        const a = local[indices[i + edge]], b = local[indices[i + (edge + 1) % 3]];
        for (let x = Math.max(0, Math.ceil(Math.min(a[0], b[0]))); x < Math.min(rings.length, Math.max(a[0], b[0])); x++) {
          const t = (x - a[0]) / (b[0] - a[0]);
          const y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
          if (Math.hypot(y, z) < 11) rings[x].push([y, z]);
        }
      }
    }
  }
  const profiles = rings.map((ring) => {
    if (ring.length < 8) return null;
    const ys = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
    const [y0, y1, z0, z1] = [Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)];
    const cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const quadrants = new Set(ring.map(([y, z]) => Number(y > cy) * 2 + Number(z > cz)));
    if (quadrants.size < 4 || Math.hypot(cy, cz) > 4 || Math.min(y1 - y0, z1 - z0) < 4) return null;
    // Use the inner circumference, leaving room for the different skin
    // weights of the boot and trousers around the ankle in motion.
    return [cy, cz, (y1 - y0) * 0.32, (z1 - z0) * 0.32];
  });
  const top = profiles.findIndex((ring, i) => ring && profiles[i + 2] && profiles[i + 4]);
  if (top < 0) return null;
  return { calf, toCalf, profiles, top, bottom: height + 2 };
}

function cuffTarget(point, shafts) {
  let shaft = null, local = null, nearest = 12;
  for (const candidate of shafts) {
    const v = candidate.toCalf(point);
    const distance = Math.hypot(v[1], v[2]);
    if (v[0] >= candidate.top - 1.5 && v[0] <= candidate.bottom && distance < nearest) {
      shaft = candidate;
      local = v;
      nearest = distance;
    }
  }
  if (!shaft) return null;
  const [x, y, z] = local;
  let ring = Math.max(shaft.top, Math.min(Math.round(x), shaft.profiles.length - 1));
  while (!shaft.profiles[ring]) ring--;
  const [cy, cz, ry, rz] = shaft.profiles[ring];
  const radius = Math.hypot((y - cy) / ry, (z - cz) / rz);
  if (radius <= 1) return null;
  const blend = Math.min(1, (x - shaft.top + 1.5) / 2.5);
  const scale = 1 - blend * (1 - 1 / radius);
  return mat33Apply(shaft.calf.a, 0, cy + (y - cy) * scale - y, cz + (z - cz) * scale - z);
}

// Convert the measured displacement back into the garment's source space so
// the CPU and GPU use the same fitted geometry with the original UV and skin.
function sourceMatrices(piece, arm) {
  if (piece.kind !== 'skinned') return null;
  const { skin } = piece.batch;
  const matrices = new Float32Array(piece.batch.positions.length * 3);
  const post = skinPost(skin, arm.skeleton, arm.pose);
  for (const bone of skin.bones) {
    const at = arm.mats.get(bone.ref);
    if (!at) continue;
    const { a } = affineMul(post, affineMul(at, bone.invBind));
    for (let i = 0; i < bone.indices.length; i++) {
      const offset = bone.indices[i] * 9;
      for (let j = 0; j < 9; j++) matrices[offset + j] += bone.weights[i] * a[j];
    }
  }
  return matrices;
}

export function tuckTrouserCuffs(arm, wornAdds) {
  const trousers = new Set(wornAdds.filter((row) => row.legWear === 'trousers').map((row) => row.slot));
  if (!trousers.size) return false;
  const footwear = new Set(wornAdds.filter((row) => row.legWear === 'footwear').map((row) => row.slot));
  const boots = arm.pieces.filter((piece) => footwear.has(piece.slot));
  if (!boots.length) return false;
  const bone = (name) => arm.mats.get(arm.skeleton.byName.get(name));
  const shafts = ['l', 'r'].flatMap((side) => {
    const calf = bone(`bip01 ${side} calf`), foot = bone(`bip01 ${side} foot`);
    const shaft = calf && foot && bootShaft(boots, calf, foot);
    return shaft ? [shaft] : [];
  });
  if (!shafts.length) return false;
  let fitted = false;
  for (const piece of arm.pieces.filter((p) => trousers.has(p.slot))) {
    const targets = [];
    for (const v of new Set(piece.indices)) {
      const shift = cuffTarget(piece.positions.subarray(v * 3, v * 3 + 3), shafts);
      if (shift) targets.push([v, shift]);
    }
    if (!targets.length) continue;
    const skinned = piece.kind === 'skinned';
    const attachment = skinned ? null : arm.mats.get(piece.attachRef);
    const rigidInverse = attachment ? invert33(attachment.a) : null;
    if (!skinned && !rigidInverse) continue;
    const linear = skinned ? sourceMatrices(piece, arm) : null;
    const source = skinned ? piece.batch.positions : piece.source;
    const positions = source.slice();
    const originalNormals = skinned ? piece.batch.normals : piece.sourceNormals;
    const normals = originalNormals?.slice();
    for (const [v, shift] of targets) {
      const inverse = skinned ? invert33(linear.subarray(v * 9, v * 9 + 9)) : rigidInverse;
      if (!inverse) continue;
      const delta = mat33Apply(inverse, ...shift);
      for (let axis = 0; axis < 3; axis++) positions[v * 3 + axis] += delta[axis] * (piece.mirrored && axis === 0 ? -1 : 1);
    }
    if (normals) rebuildNormals(positions, piece.indices, normals, originalNormals);
    if (skinned) piece.batch = { ...piece.batch, positions, normals };
    else {
      piece.source = positions;
      piece.sourceNormals = normals;
    }
    fitted = true;
  }
  return fitted;
}
