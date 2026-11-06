// Presentation-only twist distribution for Better Bodies' continuous elbow skin.
// The source NIF, ordinary binding, joint transforms and equipment remain intact.
import { injectSkeletonNodes } from '../../formats/morrowind/mwSkin.js';
import { bodyOf, algebra, apply, mul, transpose, turnOf, at, clamp } from './bodyKit.js';
import { rotAxisAngle } from '../../combat/climbRig.js';
import { heldPoseAnatomy } from './armAnatomy.js';
const { sub, dot, cross, norm, len } = algebra;
const identity = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
const helpers = new WeakMap();
const helperName = side => `DFO ${side} Elbow Skin`;
function helper(skeleton, side, fore) {
  let refs = helpers.get(skeleton);
  if (!refs) { refs = {}; helpers.set(skeleton, refs); }
  if (refs[side] != null) return refs[side];
  const name = helperName(side);
  injectSkeletonNodes(skeleton, { roots: [0], records: [
    { type: 'NiNode', name: skeleton.nodes.get(fore).name, children: [1], extra: -1 },
    { type: 'NiNode', name, rotation: identity(), translation: [0, 0, 0], scale: 1, children: [], extra: 2 },
    { type: 'NiStringExtraData', string: 'BONE', next: -1 },
  ] });
  refs[side] = skeleton.byName.get(name.toLowerCase());
  return refs[side];
}

/** Split only skin forearm influences. A proximal helper follows the elbow's
 * bend plane; the original forearm still carries the hand and distal skin.
 * Identity helper locals reproduce the original mesh in every ordinary pose. */
export function bindElbowSkin(skeleton, bound) {
  for (const batch of bound.skinned) {
    if (!/bb[\\/]bb_skin/i.test(batch.material?.textureFile ?? '')) continue;
    if (!/^Tri (Left|Right) (Upper Arm|Forearm|Wrist|Hand)$/i.test(batch.name)) continue;
    const side = /Left/i.test(batch.name) ? 'L' : 'R';
    const fore = skeleton.byName.get(`bip01 ${side.toLowerCase()} forearm`);
    const hand = skeleton.byName.get(`bip01 ${side.toLowerCase()} hand`);
    if (fore == null || hand == null) continue;
    const source = batch.skin.bones.find(b => b.ref === fore);
    if (!source) continue;
    const axis = skeleton.nodes.get(hand).rest.translation, length2 = dot(axis, axis);
    if (length2 < 1e-6) continue;
    const indices = [], weights = [], original = Array.from(source.weights);
    const counts = new Uint8Array(batch.positions.length / 3);
    for (const b of batch.skin.bones) for (let k = 0; k < b.indices.length; k++) if (b.weights[k] > 0) counts[b.indices[k]]++;
    for (let k = 0; k < source.indices.length; k++) {
      const v = source.indices[k], p = batch.positions.slice(v * 3, v * 3 + 3);
      const local = apply(source.invBind.a, p).map((x, i) => x + source.invBind.t[i]);
      // All twist is excluded at the crease, then introduced along the forearm.
      const t = clamp(dot(local, axis) / length2 / 0.65, 0, 1);
      const share = 1 - t * t * (3 - 2 * t);
      if (share < 1e-6 || counts[v] >= 4) continue;
      indices.push(v); weights.push(original[k] * share); original[k] *= 1 - share;
    }
    if (!indices.length) continue;
    const ref = helper(skeleton, side, fore);
    batch.skin = { ...batch.skin, bones: batch.skin.bones.map(b => b === source ? { ...b, weights: Float32Array.from(original) } : b).concat({
      ...source, name: helperName(side), ref, indices: Uint16Array.from(indices), weights: Float32Array.from(weights),
    }) };
  }
  return bound;
}

/** Called after the final return solve: this changes skin palettes only. */
export function poseElbowSkin(skeleton, pose, root, skelMats) {
  const refs = helpers.get(skeleton);
  if (!refs) return;
  const body = bodyOf(skeleton, root, skelMats);
  if (!body) return;
  const weight = heldPoseAnatomy(pose)?.weight ?? 0;
  const mats = skelMats(skeleton, pose, root, [body.bones.L.hand, body.bones.R.hand]);
  for (const side of ['L', 'R']) {
    if (refs[side] == null) continue;
    const b = body.bones[side], fore = turnOf(mats, b.fore);
    const axis = norm(sub(at(mats, b.hand), at(mats, b.fore)));
    const upperHinge = apply(turnOf(mats, b.upper), body.armHinge[side].upper);
    const plane = sub(upperHinge, axis.map(x => x * dot(upperHinge, axis)));
    let rotation = identity();
    if (weight > 0 && len(plane) > 1e-5) {
      const hinge = apply(fore, body.armHinge[side].fore), desired = norm(plane);
      const angle = Math.atan2(dot(axis, cross(hinge, desired)), dot(hinge, desired));
      rotation = mul(mul(transpose(fore), rotAxisAngle(axis, angle * weight)), fore);
    }
    pose.set(refs[side], { rotation, translation: [0, 0, 0], scale: 1 });
  }
}
