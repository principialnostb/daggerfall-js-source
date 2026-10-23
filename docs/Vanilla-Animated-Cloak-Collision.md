# Vanilla Animated cloak collision

This note documents the in-progress 3D contact redesign in `src/formats/morrowind/mwCloakFit.js`.

## Why the old method was insufficient

The previous live contact pass treated the cloak as a height field keyed by rig-space `(x, z)`. That representation loses contact information when the cloth folds, turns edge-on, or overlaps itself, and it can miss a body triangle that intersects the sheet away from sampled vertices and edges. The visible symptom was intermittent leg geometry passing through the cloak during walking and sword attacks.

## Current approach

- Build a uniform 3D spatial grid over the posed cloak triangles.
- For each body sample, query nearby triangle candidates and compute the closest point on the actual 3D triangles, including face, edge, and vertex regions. Degenerate triangles fall back to segment distance.
- Use the contact vector from the cloak surface toward the body to choose the direction in which the cloak must move away; ease neighboring vertices in XYZ rather than only along Y.
- Expand broad-phase bounds in all three axes, not only X/Z.
- Stamp candidate triangles during grid queries to avoid allocating a fresh de-duplication set for every sample.
- Keep the back-slung weapon/scabbard excluded from dynamic cloak following. Their rest-pose clearance is still handled by `fitStowedGear`.

The helper is in `src/formats/morrowind/mwCloakContact3d.js`; its focused unit tests are in `test/mwCloakContact3d.test.js`.

## Verification and known limits

Run the focused tests with:

```sh
node --test test/mwCloakContact3d.test.js
```

These tests cover closest-point regions, degenerate triangles, grid candidate de-duplication, nearest-candidate selection, and invalid grid cell size.

This is an incremental geometric redesign, not a claim that all in-game clipping is eliminated. Contact side selection at near-zero distance still uses a deterministic normal fallback; pose-side stability and triangle/triangle intersection coverage require in-game validation. Do not enable dense triangle-interior sampling on every animation frame without profiling: the live path is performance-sensitive. Validate both walking and vertical sword strikes, and check frame time as well as visible penetration.
