# Morrowind character appearance: asset ownership and integration plan

Status: audit baseline for `morrowind.v4`, 2026-10-19. This document separates what the current code actually does from the intended next implementation. Do not treat the target order below as implemented until the matching code and in-game checks exist.

## Current runtime facts

### Faces and hair

- `src/formats/morrowind/mwFaceMatch.js` compares the character's portrait features with available head/hair texture and mesh features. The race/sex-specific candidate pools are assembled by the Morrowind character build path in `src/combat/fpArm.js`; the matcher itself does not choose a Better Bodies body.
- Improved face/head assets and Better Bodies are separate asset systems. A successful face match does not prove that the body, hands, or skin texture use the same race and sex.
- Face selection must remain scoped to the actor's actual race and sex. Do not use the player's race as a fallback for NPCs with their own race/sex metadata.

### Better Bodies assets present in the repository

Under `Morrowind Textures/Better Bodies/Nude/Data Files/`, the checked-in collection includes race-suffixed meshes and textures for these race keys:

| Key | Race |
| --- | --- |
| `br` | Breton |
| `de` | Dark Elf |
| `he` | High Elf |
| `im` | Imperial |
| `no` | Nord |
| `or` | Orc |
| `rg` | Redguard |
| `we` | Wood Elf |

For each key, the tree contains `bb_skinf_<key>.nif/.dds`, `bb_skinm_<key>.nif/.dds`, `bb_handf_<key>.nif/.dds`, and `bb_handm_<key>.nif/.dds`. These are available source assets, not proof that every variant is currently used by the game.

Implementation update (2026-10-19): `src/formats/morrowind/mwBetterBodies.js` now resolves the body NIF and DDS by race key + sex for all eight supported races, and `src/combat/fpArm.js` uses that pair for both third-person body assembly and first-person arm/hand slots. The texture adapter is keyed by texture basename and the downloaded bytes are cached by URL so concurrent NPC builds with different races do not share a mutable 'current skin'. Unsupported races (including Argonian/Khajiit, which have no Better Bodies files in this pack) fall back to the existing game body with an explicit diagnostic. This is source-level wiring; it has not yet been validated in-game across the race/sex matrix.

UV-edit caution: the checked-in UV-edit JSON was authored for the Nord female mesh and is currently applied only to that exact variant. Other female races and all male variants use their own checked-in NIF UVs without this custom edit. Do not copy the Nord correction indices to another mesh until mesh identity and UV layout have been verified; per-race visual inspection is still required.

### Body morphs and appearance editor

- `src/characters/bodyMorphs.js` stores normalized body-morph values for the player.
- `src/ui/appearanceEditor.js` now draws an editor-owned procedural mannequin directly on its own canvas; it no longer calls `fpArm.figure()` or reads the current gameplay rig's rendered image. Its proportions respond to the currently stored morph values, and it supports drag rotation plus wheel/button zoom.
- The procedural preview is a UI prototype, not the final Better Bodies mesh: it is assembled from simplified canvas shapes, so it cannot yet reproduce the actual NIF silhouette, skin UVs, face mesh, or hair mesh. Do not present it as a production-accurate 3D preview.
- The editor currently has twelve body controls grouped into basic proportions, torso/chest/waist, hips/buttocks, and limbs. The UI now exposes race and sex selectors, ten race/sex-specific face portrait choices, and six procedural hairstyle choices. Selected portrait is shown in the independent preview. These controls currently update the editor preview and emit `mw-appearance-identity-change`; the event is not yet connected to the saved player identity or live head/hair mesh rebuild. Hairstyle choices are schematic, not the actual Morrowind hair meshes.
- **Current morph implementation remains incomplete and needs calibration:** some sliders already affect the preview's real mesh/bones, but this is not yet a complete, production-quality body-morph system. Morphs are not race/sex-calibrated, not all controls correspond to true local volume edits, and visual influence has not been verified across the supported NIF set. The current renderer also applies `height` and `bodyWidth` as overall model scaling, which is not equivalent to a true anatomical morph.
- The equipment PaperDoll must not be substituted for the preview: it is not the live morphed 3D body.

## Target architecture

1. Resolve the actor identity first: actor type (player/NPC), race, sex, and special form (beast, werewolf, vampire, etc.). Preserve the current special-form exclusions unless a compatible asset set is explicitly implemented.
2. Resolve the base body and hand meshes by race + sex. Resolve their matching skin textures using the same race + sex key. If a specific asset is absent or fails to parse, log the exact requested path and use a deliberate fallback; never silently use the Nord female skin on another race.
3. Resolve the head and hair from the same actor's race/sex-compatible pools. The improved face matcher may choose among candidates inside that pool; it must not override the race/sex constraint.
4. Assemble the body and head on a compatible skeleton, apply body morphs, then compose clothing/armor using the existing slot-aware fit path. Equipment may hide covered skin slots, but it must not replace the selected race/sex identity.
5. The editor must own a separate preview scene and model instance, built from the selected race/sex body and skin with no clothing. The target is a real separately assembled Better Bodies NIF with race/sex-matched skin, the player's selected actual head and hair, and editor-applied morphs. The separate rig path is now implemented at source level; the full in-game visual and race/sex matrix still needs validation. Slider changes must update that preview immediately and update the player's stored morph state; they must not rebuild or borrow a screenshot of the live gameplay actor. Provide drag rotation, zoom in/out, reset, and a race selector. Keep the preview model at a useful close framing.
6. Apply the same race/sex resolution rules to player and NPC builds. Player editor choices do not globally change NPC identity.

## Intended ownership and precedence

This is the target contract, not a statement that all stages are implemented:

- **Actor identity** (race/sex/special form) determines which compatible asset pools may be considered.
- **Better Bodies** owns the eligible base body geometry, hands, and matching skin texture.
- **Improved Heads / face matching** owns the eligible head/hair choice within that actor's race/sex pool. It must not change the base body or skin race.
- **Body morph settings** alter body proportions on the selected compatible body; they do not choose another race's mesh or texture.
- **Clothing/armor** overlays the body through the existing slot/fit logic and hides only the skin slots it covers.
- **Animation packs** select animation groups only. They must not change body, face, race, or skin asset resolution.
- **Vanilla** remains the fallback when a replacement asset is missing, invalid, incompatible, or not permitted for redistribution.

## Required validation matrix

- [x] Resolver and live body/hand assembly select matching race/sex body NIF + skin DDS for all eight available Better Bodies race keys (source-level wiring only).
- [ ] All eight races × male/female: in-game body, hand, and texture rendering visually verified.
- [ ] Player and NPCs independently use their own race and sex.
- [ ] Head/hair candidates stay inside the same race/sex pool as the actor.
- [ ] Special forms do not accidentally inherit the ordinary humanoid Better Bodies body.
- [ ] UV coordinates are checked for each distinct mesh layout before corrections are shared.
- [ ] Bare-body preview matches the selected race/sex, changes live with every morph slider, and supports drag rotation and zoom.
- [ ] Clothing and armor still fit and cover the selected body correctly.
- [ ] Missing assets produce an explicit diagnostic and a documented fallback.
- [ ] Build/tests and in-game checks are recorded separately; source inspection alone is not visual validation.
