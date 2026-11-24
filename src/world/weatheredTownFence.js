import { MeshBuilder } from './detStandIns.js';
import { FENCE_ART, WATERSIDE_ARCHIVE } from './townWatersideArt.js';

const FENCE_POST_ID = 41901;
export const isTownFence = id => (id >= 41204 && id <= 41208) || id === FENCE_POST_ID;

function faceNormal([a, b, c], original) {
  const [x, y, z] = b.map((v, i) => v - a[i]);
  const [u, v, w] = c.map((q, i) => q - a[i]);
  const n = [y * w - z * v, z * u - x * w, x * v - y * u];
  const length = Math.hypot(...n);
  if (length === 0) return original;
  const sign = n[0] * original[0] + n[1] * original[1] + n[2] * original[2] < 0 ? -1 : 1;
  return n.map(q => q * sign / length);
}

// ARCH3D 41204/41205 have a solid panel and 41206–41208 have two rails.
// Both put the post on the positive side of the seam at x=.005.
// The standalone post has its origin halfway up, at the fence ground line.
export function weatheredTownFence(id, model) {
  if (!isTownFence(id)) return model;
  const standalone = id === FENCE_POST_ID;
  const solidPanel = id < 41206;
  const { positions, normals, indices } = model, builder = new MeshBuilder();
  let near = Infinity, far = -Infinity, foot = Infinity, crown = -Infinity, first = Infinity, last = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];
    if (standalone || x > .005) {
      near = Math.min(near, z); far = Math.max(far, z);
      foot = Math.min(foot, y); crown = Math.max(crown, y);
    } else {
      first = Math.min(first, z); last = Math.max(last, z);
    }
  }
  if (far <= near || crown <= foot || (!standalone && last <= first)) return model;
  const postLength = far - near;
  const visibleFoot = standalone ? -.15 : foot;
  const postHeight = crown - visibleFoot;
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const normal = Array.from(normals.subarray(ia, ia + 3));
    const post = standalone || positions[ia] > .005;
    const end = post ? Math.abs(normal[1]) > .8 : !solidPanel && Math.abs(normal[2]) > .8;
    const points = [];
    for (let k = 0; k < 3; k++) {
      const j = indices[i + k] * 3;
      const [x, y, z] = [positions[j], positions[j + 1], positions[j + 2]];
      // Keep the highest corner and the feet. Ease one end of the rail's outer ridge inward.
      const shave = !standalone && post && y > crown - .08 ? .038 * (z - near) / postLength : 0;
      const taper = !solidPanel && !post && x < -.15 ? .022 * (z - first) / (last - first) : 0;
      points.push([x + taper, y - shave, z]);
    }
    const uv = ([x, y, z]) => {
      if (end && standalone) return [.5 + x / .45, .5 + (z - (near + far) / 2) / .43];
      if (end) return post ? [x / .45, (z - near) / .43] : [.5 + x / .39, .5 + y / .39];
      if (post) {
        const u = Math.abs(normal[0]) > .6 ? (z - near) / .41 : x / .41 + (standalone ? .5 : .29);
        const v = -(y - visibleFoot) / (postHeight + .045);
        return [u, v];
      }
      return [z / 1.75, (Math.abs(normal[1]) > .65 ? x : y) / .65];
    };
    const material = end ? FENCE_ART.end : post ? FENCE_ART.post : FENCE_ART.rail;
    builder.tri([WATERSIDE_ARCHIVE, material], ...points, faceNormal(points, normal), ...points.map(uv));
  }
  return { ...model, ...builder.build(), doors: model.doors };
}
