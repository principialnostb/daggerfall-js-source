# Draped cloth simulation — pre-tuning checkpoint

Checkpoint branch: `upstream-original-selector`.
Checkpoint purpose: record the exact pre-tuning behavior before reducing secondary motion and tightening body collision. This documentation commit does not change runtime code.

## Source of truth

- Solver: `src/characters/clothSim.js`
- Garment geometry and static body profile: `src/characters/pieces/draped.js`
- Headless regression tests: `test/characters/clothSim.test.js`

## Current solver order

1. Verlet integration for unpinned vertices.
2. Reposition pinned vertices relative to root translation and optional torso lean.
3. Solve structural and bending distance constraints.
4. Clamp solver displacement to the anti-pop limit.
5. Optionally apply the legacy bone-driven drape target to lower vertices.
6. Project free vertices against ground, articulated thigh/shin capsules, and a height-indexed elliptical body core. Collision passes repeat without re-solving constraints.

## Exact defaults in `stepCloth` at checkpoint

- Gravity: `gy = -0.8` (when caller does not supply it).
- Verlet damping: `damp = 0.90`.
- Collision standoff: `standoff = 0.030`.
- Distance constraint iterations: `iters = 6`.
- Maximum Verlet/constraint displacement: `maxStep = 0.018`.
- Collision projection passes: `collisionPasses = 6`.
- Ground plane: `groundY = 0.02`.
- Bone-driven drape default strength: `0.30` when the caller supplies `opts.bones` without an explicit strength.
- Static garment grid generation uses `STANDOFF = 0.038` in `pieces/draped.js`.

Callers may override these defaults; therefore these values alone do not guarantee restrained movement in the running preview.

## Known weaknesses to address

- The torso/pelvis is approximated by a height-indexed ellipse; it has no separate buttock volume and does not follow leg/root transforms as a full skinned body surface would.
- The leg capsule projection changes XZ while keeping Y fixed. This is intentionally intended to prevent cloth from climbing the legs, but its fallback direction is arbitrary when a vertex lies on the capsule axis, and the endpoint/cap behavior can be imperfect.
- Constraints are solved before collision. The final collision projection can therefore stretch nearby edges and reintroduce visible deformation; collisions are not followed by a restrained constraint repair pass.
- The anti-pop clamp limits motion, but does not limit cumulative shape change across frames.
- Existing tests check finite positions and approximate collider clearance in synthetic motion; they do not prove visual quality in the live character viewer or cover every body pose.

## Intended visual target

Keep the authored low-poly garment silhouette dominant. Motion should be a small, quickly settling lag on turns and steps, not visible flapping or rubber-like deformation. Avoid per-animation cloth scripts. Fixing body intersection takes priority over adding motion.

## Recovery

This is a documentation checkpoint, not a serialized copy of source code. The pre-tuning executable source is the version of `src/characters/clothSim.js` at the parent commit of this documentation change. Revert subsequent runtime changes to restore it.