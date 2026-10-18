# Smart PaperDoll: rigged, camera-dependent character rendering

## Product requirement

Smart PaperDoll must retain the player's live appearance choices (race, gender, dyes, clothing, armor and texture overrides) while rendering a genuinely volumetric character. As the camera orbits, the silhouette and visible surfaces must be newly projected from the current view. Walking, turning, jumping, weapon actions, hit reactions and death must stay synchronized with the game's existing character animation. This is not a request to rotate a front-facing image or make a thin extrusion thicker.

## Audit findings

### Existing third-person renderer

- `src/combat/fpArm.js` builds the third-person Morrowind body through `buildTpBody()`, `tpSkeletonPath()`, `playerBodyRows()`, `resolveBodyParts()`, `composeWornArmor()`, and `tpAnimSources()`.
- The existing path owns the skeleton, animation selection, posed body, armor/clothing assembly, weapon attachments and combat transitions. Treat it as the source of truth; do not introduce a second movement/combat state machine.
- `src/render/characterSprite.js` includes `drawRigSpriteBox()`, which captures the posed 3D assembly into a low-resolution view-facing sprite from the current camera direction. Reuse this camera-dependent capture path rather than rotating one fixed portrait.
- `src/ui/paperDoll.js` composes the live appearance into one flattened RGBA image. It preserves the visible appearance, but loses the semantic layer boundaries, material identities, hidden surfaces and skin weights needed to reconstruct a complete 3D character by itself.
- `src/characters/paperDollVoxel.js` extrudes the flattened image by about 5.5 cm. The rear is a copy of the front, so it is a useful integration/prototype fallback but cannot meet the multi-angle volume requirement.

## Final architectural decisions

1. **One animation authority.** Reuse the existing third-person skeleton, animation clips/state selection, weapon attachments, body-part visibility, and pose timing. Smart PaperDoll must not maintain an independent walk/attack timeline.
2. **Geometry and appearance are separate inputs.** The rig/body/armor meshes provide volume and articulation. PaperDoll equipment and character state provide the appearance/equipment choices, dyes, textures and material overrides. The flattened composite may be retained for UI and as a fallback, not treated as sufficient 3D source data.
3. **Prefer authentic assets.** Use compatible existing body, clothing and armor meshes with their real rear/side geometry and material assignments. Where no suitable mesh exists, use a documented fitted proxy. Never claim a front-only image can reveal accurate hidden surfaces.
4. **Render from the live camera.** Feed the posed model into the existing low-resolution camera-dependent sprite capture on camera-orientation changes (or each view where required). Cache only derived captures/meshes with explicit invalidation on pose, equipment, race/gender, texture/dye, and renderer-context changes. A cache must not turn the 3D character into a fixed directional portrait.
5. **Secondary motion is a layer on the real pose.** Add subtle, damped female chest motion only after identifying suitable skeleton bones or localized skinned vertices. Apply it before final skinning/capture. Soft cloth may follow a supported body region; rigid cuirasses/plate armor must stay rigid and must not be deformed by the chest spring.
6. **Keep the current fallback until parity is demonstrated.** Existing PaperDoll rendering must remain selectable if asset mapping or rig capture is unavailable. Do not remove the fallback based only on unit tests.
7. **One active development branch.** `feature/smart-paperdoll-animation` is the canonical Smart PaperDoll work branch. New experiments and architecture findings belong there; do not create more topic branches. `feature/smart-paperdoll-fix` remains the historical integration baseline while the prototype is developed.

## Implementation sequence

### Phase A — inventory and bridge design
- Trace the existing body-build, armor composition, animation pose and sprite-capture APIs in source.
- Identify the minimal reusable API and the exact data required from the live PaperDoll equipment records.
- Define deterministic appearance-to-body/armor mapping and cache invalidation.
- Add small tests for mapping decisions and fallback behavior before replacing the render path.

### Phase B — first real rigged slice
- Build or reuse the existing third-person body assembly from the player's live race/gender and equipment state.
- Render the posed body through the existing camera-dependent sprite capture.
- Preserve weapon attachment, shadows, scale, camera lanes and existing fallback behavior.
- Make at least one complete outfit render credibly from front, profile and rear views before expanding coverage.

### Phase C — equipment coverage and motion
- Add real armor/clothing mappings incrementally; use fitted proxies only for unsupported items.
- Reuse idle/walk/run/turn/jump/attack/hit/death poses from the existing animation path.
- Add localized female chest secondary motion only for compatible body/outfit combinations. Rigid armor must remain undeformed.

### Phase D — verification
- Run targeted tests, lint/type checks, full tests and production build where supported.
- Test in browser/gameplay across camera azimuths including rear/profile and overhead, genders, races, armor/clothing, weapons, movement/combat, first/third person, Morrowind/EotB camera lanes, shadows and equipment refresh.
- Measure frame cost and cache invalidation; do not claim completion without recorded results.

## Acceptance checklist

- [ ] Orbiting the camera produces a new projection of a volumetric posed model.
- [ ] Rear and side surfaces use real mesh geometry or an explicitly documented fitted proxy.
- [ ] Existing animation states and weapon attachment remain synchronized.
- [ ] Appearance changes update the rig/materials without stale captures.
- [ ] Female secondary motion is subtle, damped and localized.
- [ ] Rigid armor is not stretched by secondary motion.
- [ ] Existing fallback remains functional.
- [ ] Tests, build and in-game/browser verification results are recorded.

## Current status

The current animation branch is a prototype on the shallow extruded composite. Its motion unit tests validate the math, not visual parity. The next production step is the appearance-to-existing-rig bridge and camera-dependent capture integration. No claim of full rigged implementation or completed gameplay validation should be made until those steps are implemented and tested.
