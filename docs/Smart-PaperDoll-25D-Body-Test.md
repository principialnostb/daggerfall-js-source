# Smart PaperDoll: bare-body 2.5D test

## Baseline

This branch is based directly on `feature/smart-paperdoll-fix`, which retains the working third-person PaperDoll composite override. It deliberately does not build on the later animation branch that routed the setting to the standard rigged body and caused the visible fallback skin to remain.

## Current test scope

- Third person only, gated by `Graphics.SmartPaperDoll`.
- Uses the live transparent PaperDoll figure composite, but composes it as a **bare body**: the racial/gender body and head remain; clothing overlays, armor, and other equipment layers are omitted.
- Converts the RGBA figure into a shallow voxel/extruded mesh.
- Adds subtle deterministic secondary vertex motion from player movement and turning.
- If the composite or mesh cannot be drawn, the existing renderer fallback remains active.

## Important limitation

This is a 2.5D prototype, not a rigged 3D human. It extrudes the front PaperDoll silhouette and animates vertices; it does not yet have a real skeleton or independently modeled rear/side anatomy. A full camera orbit may reveal the limitations of the shallow extrusion. Do not treat the prototype as matching the built-in rigged character captures until verified in-game.

## Manual test

1. Run `npm.cmd run dev` on Windows PowerShell.
2. Enable `Graphics.SmartPaperDoll` and switch to third person.
3. Test first with the player's current equipment still on: the test renderer should intentionally show the bare body.
4. Rotate the camera through front, 45 degrees, side, rear, and full circle.
5. Test idle, walking, running, and turning in place.
6. Disable the setting and confirm the standard third-person body returns.
7. Capture screenshots or a short video of the same camera angles and movement.

## Validation status

Code changes have been committed to the branch, but the game and automated test suite have not been run in this environment. This PR is a test candidate, not a claim of verified visual correctness.
