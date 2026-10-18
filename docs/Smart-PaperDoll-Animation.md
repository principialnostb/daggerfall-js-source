# Smart PaperDoll animation — design notes

## Branch safety

This work is isolated on `feature/smart-paperdoll-animation`, based on the working `feature/smart-paperdoll-fix` branch. It does not modify the base branch.

## Findings from the existing renderer

- The Smart PaperDoll input is the live, flattened RGBA figure composed by `src/ui/paperDoll.js`. The composite correctly follows race, gender, equipment, dyes, and texture overrides.
- `src/characters/paperDollVoxel.js` converts that image to a shallow voxel/extruded mesh. It has positions, flat per-face colors, and normals, but no semantic body regions, skeleton, skin weights, or material separation.
- The Morrowind player rig in `src/combat/fpArm.js` has actual third-person animation sources and state selection for movement, jump, idle, weapon actions, recoil, and death. Those clips operate on a skeleton and rig-specific body meshes; they cannot simply be applied to a flattened PaperDoll image.
- The character renderer already supports updating a packed character vertex stream, which permits a small procedural-motion prototype without changing the shared character shader.

## Current slice

`src/characters/paperDollMotion.js` adds a deterministic motion state driven by changes in the player's world-space feet and yaw. It provides low-amplitude gait bob, torso sway, breathing, and a damped female-chest secondary-motion signal. `paperDollVoxel.js` applies this to the existing vertex stream before drawing; race/gender metadata is read from the live PaperDoll status. The motion functions are unit-tested in `test/characters/paperDollMotion.test.js`.

This is deliberately a first slice, not a claim that the result now matches a skinned Morrowind body. The chest signal deforms the visible torso region of the flattened figure; because the composite has lost layer/material semantics, it cannot yet distinguish exposed skin from a shirt, robe, or cuirass. The next pass should preserve layer masks or build a dedicated skinned body so secondary motion never makes rigid armor wobble.

## Recommended implementation order

1. **Verify the current slice in a real browser.** Check CPU/GPU cost, gait phase stability, yaw transitions, body scale, shadows, and appearance at close and distant camera distances. Keep the old fallback if the animated draw cannot update.
2. **Build a true volume.** Prefer a low-poly body proxy or a rigged mesh over increasing extrusion depth alone; a thicker silhouette is still a cardboard cutout from the side. Use the PaperDoll as a source of appearance/equipment data, not as the sole geometry source.
3. **Body animation.** Reuse existing third-person movement, turn, jump, idle, hit-recoil, and death state transitions where compatible. Match the Morrowind weapon group and attach points so attacks do not drift away from the held weapon.
4. **Secondary motion.** Add a damped spring to a dedicated chest/body region only when the selected body mesh and outfit support it. Keep the amplitude restrained and tune walk/run/jump/landing separately. Armor should remain rigid or follow a defined armor attachment.
5. **Validation.** Add deterministic tests for motion state, weapon/body alignment, outfit transitions, and camera lanes; run lint, types, tests, and production build; then compare the result in-game across races, genders, outfits, weapons, first/third person, and EotB/Morrowind camera lanes.

## Performance note

Per-frame vertex uploads can be expensive for a per-pixel voxel mesh. Measure the real mesh size and frame cost before increasing resolution or adding more deformation. A future rigged mesh or shader-side deformation is preferable for sustained animation.
