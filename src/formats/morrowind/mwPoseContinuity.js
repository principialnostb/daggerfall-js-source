// @ts-check
/** A clocked bone group already owns its transition. A whole-body weapon fade must not freeze it again. */
export function preserveOwnedPose(pose, sampled, skeleton, tracks) {
  for (const [ref, node] of skeleton.nodes) {
    if (tracks?.get(String(node.name ?? '').toLowerCase())?.__poseOwner?.weight >= 0.999 && sampled.has(ref)) {
      pose.set(ref, sampled.get(ref));
    }
  }
  return pose;
}
