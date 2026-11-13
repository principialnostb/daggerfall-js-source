// @ts-check
// POSE-LAB (LAB2, bible/05-Combat/Proving-Ground.md): the one seam the Animation Lab edits a body through. A tool sets
// globalThis.__mwPoseAssemblyEdit; the game never does, so a player's pose costs one typeof and nothing else. The tool
// may turn a bone in `pose` and give a piece a `labFit` - an affine in the rig's space laid over where the piece stands.

const tool = () => /** @type {any} */ (globalThis).__mwPoseAssemblyEdit;

/** Is a tool editing poses in this page. */
export const poseLabOn = () => typeof tool() === 'function';

/** The tool's edit of this pose, after every layer and before the matrices are made of it. */
export function editPose(assembly, pose) {
  if (poseLabOn()) tool()(assembly, pose);
}

/** `fit` after `at`: the piece where it stood, then moved by its fit. A fresh affine. */
export function fitOver(fit, at) {
  const a = new Float32Array(9), f = fit.a, b = at.a;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) a[r * 3 + c] = f[r * 3] * b[c] + f[r * 3 + 1] * b[3 + c] + f[r * 3 + 2] * b[6 + c];
  return { a, t: [0, 1, 2].map((r) => f[r * 3] * at.t[0] + f[r * 3 + 1] * at.t[1] + f[r * 3 + 2] * at.t[2] + fit.t[r]) };
}

/** THE CPU SKIN'S HALF: each fitted piece's posed vertices and normals moved by its fit (the palette's half is
 *  mwGpuSkin.js fitEntries - the same affine over the same placement, so both skins stand a piece in one place). */
export function fitPieces(pieces) {
  if (!poseLabOn()) return;
  for (const p of pieces) {
    const fit = p.labFit;
    if (!fit || !p.positions) continue;
    const a = fit.a, t = fit.t, pos = p.positions;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      pos[i] = a[0] * x + a[1] * y + a[2] * z + t[0];
      pos[i + 1] = a[3] * x + a[4] * y + a[5] * z + t[1];
      pos[i + 2] = a[6] * x + a[7] * y + a[8] * z + t[2];
    }
    const n = p.normals;
    if (!n || n.length !== pos.length) continue;
    for (let i = 0; i < n.length; i += 3) {
      const x = n[i], y = n[i + 1], z = n[i + 2];
      const u = a[0] * x + a[1] * y + a[2] * z, v = a[3] * x + a[4] * y + a[5] * z, w = a[6] * x + a[7] * y + a[8] * z;
      const l = Math.hypot(u, v, w) || 1;
      n[i] = u / l; n[i + 1] = v / l; n[i + 2] = w / l;
    }
  }
}
