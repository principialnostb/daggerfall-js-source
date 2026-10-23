# Draped cloth — animation-pose collision regression

Branch: `upstream-original-selector`

## Reported reproduction

- During the overhead two-handed sword attack, the cloak can pass through the pelvis and legs while remaining visually attached to the back/shoulder anchor.
- During walking, a leg occasionally passes through the cloak.
- Cloth deformation is also more pronounced than the intended old-school presentation.

## Checkpoint

The pre-investigation cloth solver is documented in [Cloth-Sim-Baseline.md](./Cloth-Sim-Baseline.md). That checkpoint describes the solver defaults and the limitations already known at the time. Keep it as the recovery reference; do not overwrite it with the new implementation.

## Initial code-path findings

- The preview calls `stepDrapeCloth` from `tools/neutral/viewer-template.html`.
- Cloak pins receive the aggregate torso lean and root offsets from `effectivePose()`.
- Leg capsules are built from the procedural walk-cycle parameters (`phase`, `motion`, and the walk profile). They are not derived from the active attack pose's actual leg transforms.
- The pelvis ellipsoid and height-indexed torso profile are also static approximations. Therefore the cloth's attachment transform and its collision volumes can disagree during an attack.
- The current solver resolves constraints before its final collision passes. Collision projection can alter edge lengths after constraints have finished, and the next frame can reintroduce penetration when the collider pose changes sharply.

## Intended correction

1. Make the collision proxy use the same current pose inputs as the character, including attack poses, rather than assuming the walking gait is the only articulated pose.
2. Keep the cloak's authored silhouette and its restrained secondary motion. Do not introduce per-attack cloth scripts.
3. Improve collision stability for fast pose changes and re-check body collision after constraint correction.
4. Add deterministic tests for abrupt articulated-pose changes as well as gait motion.

This note is a diagnostic checkpoint, not a claim that the runtime fix is complete. The live viewer still needs visual verification after the code changes.
