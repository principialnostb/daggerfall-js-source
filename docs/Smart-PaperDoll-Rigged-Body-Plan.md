# Smart PaperDoll: true multi-angle body plan

## Requirement clarified

The goal is not to wobble a front-facing paperdoll cutout. The result must behave like the game's existing third-person bodies: readable from front, profile, rear and elevated angles; full torso/hip/leg volume; armor that follows the body and remains rigid where appropriate; and the same movement/combat state changes as the existing player rig. Female secondary chest motion is an additional layer, not a substitute for body animation.

## Findings in the current codebase

### Existing third-person body is already a real animated 3D assembly

- `src/combat/fpArm.js` builds the third-person body in `buildTpBody()` using `tpSkeletonPath()`, `playerBodyRows()`, `resolveBodyParts()`, `composeWornArmor()`, and the Morrowind NIF/KF animation sources (`tpAnimSources()`). This assembly has real body parts, armor, weapon attachments and a skeleton.
- The same file's `drawThird()` draws the posed assembly and keeps the body's shadow and weapon state coherent.
- `src/render/characterSprite.js`'s `drawRigSpriteBox()` renders that posed 3D assembly from the current camera ray into a low-resolution render target, then composites the view-facing sprite. It therefore re-renders from the camera's azimuth as the player orbits the character; it is not a single front-facing texture rotated around a vertical axis.
- Animation state selection and pose evaluation live in the Morrowind animation path in `fpArm.js` and `src/formats/morrowind/mwFirstPerson.js`. They already cover movement, turning, jumps, weapon stance/attack and other transitions.
- `src/ui/paperDoll.js` produces one flattened RGBA image. By the time it reaches `paperDollVoxel.js`, semantic layer boundaries, material types, body-part masks, rear surfaces and skeleton weights have been lost.
- `src/characters/paperDollVoxel.js` currently extrudes each occupied image pixel by a constant 5.5 cm. This makes a shallow voxel relief, not a body volume. The side surfaces are edge colors from the front silhouette, and the back is a copy of the front. That cannot produce a credible rear silhouette, hip/glute volume, side armor plates or real joint articulation.

## Architectural conclusion

The correct reference is the existing third-person Morrowind rig plus the camera-dependent sprite capture, not the voxel extrusion.

A front-only paperdoll image does not contain enough information to recover the true rear appearance or hidden side geometry. A credible implementation must combine authored 3D shape with the PaperDoll's appearance data; it must not claim to infer accurate backside armor from a front image alone.

## Proposed implementation phases

1. **Keep the existing camera and animation pipeline as the source of truth.** Reuse the third-person rig's skeleton, clip selection, weapon attachment, body-part hiding, and camera-dependent `drawRigSpriteBox` rendering. Avoid creating a second independent walk/attack state machine.
2. **Separate shape from appearance.** The 3D rig supplies the body volume and joints. The PaperDoll supplies identity, dyes and equipped-item choices. Use the actual Morrowind armor/clothing meshes when available, so plate, cuirass, boots, gloves and robes have real rear and side geometry.
3. **Map appearance deliberately.** Build a layer/material resolver from the live PaperDoll equipment records. Preserve per-item texture/material identity and dye values instead of baking all layers into one image. For pieces without a compatible 3D asset, use a documented fallback: a fitted low-poly proxy with a generated front UV, side strips sampled from edge colors, and a conservative rear material—not a flat slab.
4. **Female secondary motion on the rig.** Inspect the selected skeleton and skin weights for a chest/spine/breast region. If the rig has suitable bones, add a bounded critically damped spring to the pose before skinning. If it does not, add a localized corrective deformation to the body mesh after skinning. Do not deform the whole torso or rigid cuirass. Outfit policy: soft cloth may follow the body; rigid armor remains attached to its authored bones.
5. **Reuse the combat animation timeline.** Add secondary motion to the already selected idle/walk/run/jump/attack/hit/death pose. Drive it from actual movement/animation phase and landing events, not solely from noisy frame-to-frame world-position deltas.
6. **Quality and safety gates.** Keep the current working PaperDoll draw as a selectable fallback until all races, genders, armor sets, camera azimuths and attacks pass. Test profile/rear/overhead views, weapon grip alignment, armor occlusion, shadows, frame-time and cache invalidation after equipment changes.

## Acceptance checklist

- Camera orbit produces a true new projection of the body, not a rotated front image.
- Back and side silhouettes have actual volume and authored or defensible material data.
- Arms and legs articulate independently with the existing walk/run/turn/jump clips.
- Attacks, block/cast, hit reaction and death remain in sync with weapon attachments.
- Armor pieces are not stretched by the chest spring.
- Female chest secondary motion is subtle, bounded, damped and different for idle, walk, run, jump and landing.
- First-person, third-person, both camera lanes, shadows and PaperDoll equipment refresh continue to work.
- Build, tests and browser verification pass before the PR is considered ready to merge.

## Status of the current animation branch

The procedural motion module in this branch is only a proof of concept on the extruded PaperDoll mesh. It does not meet the true multi-angle / full-body rig requirement above and must not be presented as the finished implementation. The next implementation step should be a rig-and-appearance bridge, not larger vertex offsets on the front-image extrusion.
