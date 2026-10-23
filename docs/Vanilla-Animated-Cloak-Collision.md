# Vanilla Animated cloak collision

## Current experiment

The 3D nearest-triangle contact redesign was reverted after reports of visible cloak deformation and worse penetration through both legs. The working branch now uses the previous X/Z height-field contact method again, with only the broad sampling region widened from 1 to 2 rig-space units around the cloak bounds.

In `src/formats/morrowind/mwCloakFit.js`, the widened bounds apply to both the body-sample predicate and the early rejection of body pieces. The collision method itself remains the prior `cloakSheet` lookup and Y-axis correction; this change deliberately avoids changing contact direction and geometry at the same time as the sampling area.

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
