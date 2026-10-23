# Vanilla Animated cloak collision

## Current experiment

The 3D nearest-triangle contact redesign was reverted after reports of visible cloak deformation and worse penetration through both legs. The working branch keeps the prior Y-axis correction and wider body-sampling region, but closes a separate false-negative in the height-field lookup: collision samples are now checked against actual projected cloak triangles at their exact X/Z coordinates.

In `src/formats/morrowind/mwCloakFit.js`, the widened bounds apply to both the body-sample predicate and the early rejection of body pieces. The correction still moves the cloak along the prior Y axis, but the lookup now checks the actual projected cloak triangles at the body's exact `(x, z)` instead of rounding the body point to an integer grid cell first. The old raster could miss a point that was inside a triangle when its rounded grid point fell just outside the triangle; this is a false negative concentrated around triangle edges and narrow leg contacts.

A targeted pose-envelope addition now also fits the cloak against the right thigh held 55 degrees back, both with a straight knee and with the right calf bent 35 degrees. This specifically targets the reported combat stance; it is a static fit pose, not a new per-frame collision solver.

## What the source animation does

The two-handed carry stance is procedural, not a single thigh rotation. In `src/characters/bodyMotion/carry.js`, `CARRY.two.stand` puts the left foot 0.15 leg lengths forward and the right foot 0.09 leg lengths back, with the hips yawed -16 degrees. In `src/characters/bodyMotion/melee.js`, `MELEE.two.chop` shifts the hips and steps the lead foot forward through the overhead chop. So the 55-degree right-thigh fit poses are only a conservative static envelope; they are not a literal measurement of the attack clip.

## What this experiment tests

Previously, `cloakSheet` rasterized triangles onto integer X/Z points, then rounded each body sample before looking up a contact. A sample could be inside the actual triangle but round to a grid point outside it, losing the contact entirely. The new spatial buckets retain the triangles covering each unit cell and evaluate barycentric coordinates at the body's exact X/Z point. The existing Y-axis correction and folded-sheet front/back selection remain in place.

This addresses a concrete false-negative path, but is not a confirmed in-game fix. Edge-on projected triangles and very narrow folds can still be missed, and the extra triangle queries may affect fitting cost.

## Validation

Run the focused repository test suite or `npm test`, then validate in-game:
- walk and turn with the cloak equipped;
- inspect both legs, including knees and shins;
- test sword attacks and vertical movement;
- check for visual distortion and frame-time regressions.

Do not claim the clipping is fixed until these cases are checked. Back-slung weapons and scabbards remain independent of live cloak animation.
