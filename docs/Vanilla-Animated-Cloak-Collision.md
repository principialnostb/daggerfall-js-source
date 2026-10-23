# Vanilla Animated cloak collision

## Current experiment

The 3D nearest-triangle contact redesign was reverted after reports of visible cloak deformation and worse penetration through both legs. The working branch now uses the previous X/Z height-field contact method again, with only the broad sampling region widened from 1 to 2 rig-space units around the cloak bounds.

In `src/formats/morrowind/mwCloakFit.js`, the widened bounds apply to both the body-sample predicate and the early rejection of body pieces. The correction still moves the cloak along the prior Y axis, but the lookup now checks the actual projected cloak triangles at the body's exact `(x, z)` instead of rounding the body point to an integer grid cell first. The old raster could miss a point that was inside a triangle when its rounded grid point fell just outside the triangle; this is a false negative concentrated around triangle edges and narrow leg contacts.

A targeted pose-envelope addition now also fits the cloak against the right thigh held 55 degrees back, both with a straight knee and with the right calf bent 35 degrees. This specifically targets the reported combat stance; it is a static fit pose, not a new per-frame collision solver.

## What this experiment tests

The working hypothesis is that leg contact samples were being discarded by the narrow X/Z broad-phase region. Widening that region should allow more leg samples to be considered without introducing the 3D solver's changed contact direction.

This is a hypothesis, not a confirmed fix. The old height-field method can still miss contacts when the cloak folds, turns edge-on, or overlaps itself.

## Validation

Run the focused repository test suite or `npm test`, then validate in-game:
- walk and turn with the cloak equipped;
- inspect both legs, including knees and shins;
- test sword attacks and vertical movement;
- check for visual distortion and frame-time regressions.

Do not claim the clipping is fixed until these cases are checked. Back-slung weapons and scabbards remain independent of live cloak animation.
