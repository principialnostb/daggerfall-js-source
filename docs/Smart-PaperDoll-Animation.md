# Smart PaperDoll animation — design notes

## Branch and scope

`feature/smart-paperdoll-animation` is the single canonical work branch for Smart PaperDoll going forward. Keep future implementation, tests, and architecture decisions here; do not create additional Smart PaperDoll topic branches. The existing `feature/smart-paperdoll-fix` is the historical integration baseline.

## Findings from the existing renderer

- The live PaperDoll composite correctly follows race, gender, equipment, dyes and texture overrides, but it is a flattened RGBA image.
- `src/characters/paperDollVoxel.js` turns that composite into a shallow extrusion. It has no semantic body regions, skeleton, skin weights, real rear surfaces or material separation. The production `mwView` override no longer calls this module.
- The Morrowind player rig in `src/combat/fpArm.js` already has a real third-person skeleton, body/armor assembly, weapon attachments and movement/combat animation-state selection.
- `src/render/characterSprite.js` already supports camera-dependent low-resolution capture of a posed 3D rig. This is the mechanism behind the convincing multi-angle appearance of built-in third-person characters.

## Architecture decision

Reuse the existing third-person rig, pose evaluation, armor/body assembly and camera-dependent sprite capture. Bridge the live PaperDoll equipment/appearance state to real body and armor meshes/materials. Use fitted proxies only when no compatible 3D asset exists. Keep the current extrusion as a fallback/prototype, not as the final geometry. Full reasoning and acceptance criteria are in [Smart-PaperDoll-Rigged-Body-Plan.md](Smart-PaperDoll-Rigged-Body-Plan.md).

Female chest motion is a secondary layer on the existing pose. It must be localized to suitable body bones/vertices and must never deform rigid cuirasses or plate armor. Do not create a separate walk/attack state machine.

## Current prototype

`src/characters/paperDollMotion.js` currently adds deterministic gait bob, torso sway, breathing and a bounded female chest spring to the shallow voxel mesh. The associated unit tests cover motion math and data safety only. They do not establish visual quality, actual skeletal animation, true body volume, or gameplay parity.

## Next implementation steps

1. Trace and document the exact reusable APIs for third-person body construction, worn armor, pose evaluation and camera-dependent sprite capture.
2. Design the PaperDoll appearance/equipment-to-rig/material bridge without losing item identity, dyes or texture overrides.
3. Implement a minimal real-rig slice and preserve the existing fallback.
4. Add tests for appearance mapping, fallback, equipment changes and cache invalidation.
5. Validate camera orbit, rear/profile/overhead views, movement/combat states, armor rigidity, shadows, both camera lanes and performance in a real browser/game session.
6. Record lint, type-check, test and production-build results. Keep PR #3 draft until the first real rigged slice and validation evidence exist.

## Performance note

Avoid per-frame deformation/upload of a per-pixel extrusion as the long-term animation architecture. Prefer the existing skeletal pose and mesh pipeline; cache derived captures carefully and invalidate them when appearance, pose/view, equipment, or renderer resources change.
