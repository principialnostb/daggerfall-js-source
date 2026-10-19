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
- `src/ui/appearanceEditor.js` now requests a dedicated preview rig from `fpArm.createAppearancePreviewRig()` and renders that rig's actual NIF assembly into the editor canvas. The preview is a separate `createFpArm({ playerAppearance: true })` instance with its own skeleton, assembled body/head/hair meshes and animation state. It shares renderer and asset/dependency references only; it does not read the live gameplay rig's screenshot or pose.
- The preview build copies the current player's race, sex, face and hair assembly options, then strips armor, clothing, weapons, torches and other equipment. The editor explicitly requests the body's base idle group instead of the weapon-derived portrait stance. Drag rotation and wheel/button zoom render the dedicated rig at the requested yaw/framing.
- Removed the previous face portrait cards and schematic hairstyle options: the 2D inventory portraits are not head presets, and fabricated face/hair selectors would misrepresent the available assets. The editor currently shows the actual head/hair assembled for the player; selectable presets should only be added once real alternative head/hair meshes are enumerated and wired to the builder.
- The editor has 19 persisted body controls grouped by anatomical region. Breast, breast projection, waist, abdomen, hip, buttock, shoulder, ribcage, arm, thigh, calf, limb length, leg spacing, body width, overall fullness and height now use localized vertex morphs in a shared whole-body coordinate frame; head size uses a head-bone scale. These are early generic transforms based on approximate body-height zones, not calibrated per race/sex/NIF. Visual QA is still required to confirm natural falloffs and fit with equipment.
- The equipment PaperDoll must not be substituted for the preview: it is not the live morphed 3D body.

### Body morph and underwear update (2026-10-19)

- [x] The Better Bodies resolver now supports the matching race/sex meshes and textures from both `Better Bodies/Nude` and `Better Bodies/Underwear`. The editor checkbox selects between these asset sets; the default is Nude.
- [x] The underwear preference is persisted separately from morph sliders. Toggling it through the editor requests a player-rig rebuild, and the editor rebuilds its isolated preview so the selected body variant is visible there too. When underwear is enabled, subsequent body builds (including after equipment changes) read the same preference.
- [x] Replaced the former fixed pelvis/chest/shoulder/thigh scale offsets with localized vertex morphs based on shared whole-body bounds. New controls cover ribcage width, breast volume/projection, abdomen volume, buttock volume/projection, arm thickness/length, thigh/calf thickness, leg length and leg spacing. Body width and height now use the same vertex deformation in the preview and world model rather than portrait-only scaling.
- [x] While any body morph is non-zero, the third-person body uses the CPU skinning path so the deformed vertices are actually uploaded to the world renderer. The ordinary GPU skinning path remains available when all morph values are reset.
- [x] The editor now uses compact settings-menu styling, filled range tracks with tactile handles, numeric value chips, and filters for anatomical control groups.
- [x] `better-bodies-preview.html` and `src/tools/paperdoll/betterBodiesPreview.js` are already present in `morrowind.v4`; the tool selects NIF mesh sections for UV inspection, not named anatomical bones. It is useful for inspecting source geometry, but it is not itself an anatomical morph editor.
- [ ] Run the game and validate that Nude/Underwear selection is correct for each supported race/sex, that equipment rebuilds preserve the preference, and that the local morph falloffs look natural on the actual NIF meshes.
- [ ] The anatomy zones use approximate whole-body coordinates. The new controls have distinct vertex transforms, but they still need visual calibration against each Better Bodies mesh and sex. Do not claim the sliders are fully production-calibrated until this QA is complete.

### Editor UI presentation update (2026-10-19)

- [x] Reworked `src/ui/appearanceEditor.js` toward the game's developer settings UI: restrained green-grey surfaces, compact sans-serif typography, square controls, filled range tracks, and high-contrast value chips. The preview and controls now share a visual system with restrained borders, spacing, typography, grouped control panels, clearer hierarchy, and consistent button states.
- [x] Expanded the preview column and canvas, added a responsive layout for narrow screens, and clarified the drag-to-rotate and zoom controls. The reset-view action resets both yaw and zoom; the body reset updates all displayed values and dispatches the shared morph-change event.
- [x] Kept the existing dedicated preview-rig pathway and real currently selected head/hair assembly. No 2D portrait cards or invented face/hair presets were added.
- [ ] Visual QA in the running game/browser is still required at desktop and mobile widths. The UI refresh does not by itself improve the underlying deformation algorithms.
- [ ] The preview requests the dedicated rig in neutral mode, bypassing the weapon-derived portrait stance, and asks for up to 1024 pixels of render height. Slider input rerenders the separate rig immediately. The 18 sliders now have distinct anatomical transforms and the preview supports clicking approximate body regions to filter the relevant controls; calibration remains outstanding.

## Target architecture

1. Resolve the actor identity first: actor type (player/NPC), race, sex, and special form (beast, werewolf, vampire, etc.). Preserve the current special-form exclusions unless a compatible asset set is explicitly implemented.
2. Resolve the base body and hand meshes by race + sex. Resolve their matching skin textures using the same race + sex key. If a specific asset is absent or fails to parse, log the exact requested path and use a deliberate fallback; never silently use the Nord female skin on another race.
3. Resolve the head and hair from the same actor's race/sex-compatible pools. The improved face matcher may choose among candidates inside that pool; it must not override the race/sex constraint.
4. Assemble the body and head on a compatible skeleton, apply body morphs, then compose clothing/armor using the existing slot-aware fit path. Equipment may hide covered skin slots, but it must not replace the selected race/sex identity.
5. The editor must own a separate preview scene and model instance, built from the selected race/sex body and skin with no clothing. The target is a real separately assembled Better Bodies NIF with race/sex-matched skin, the player's actual head and hair, and editor-applied morphs. The isolated rig path is implemented at source level; full in-game visual and race/sex matrix validation remains. Slider changes must update that preview immediately and update the player's stored morph state; they must not rebuild or borrow a screenshot of the live gameplay actor. Provide drag rotation, zoom in/out, and reset. Until real alternate head/hair meshes are selectable, do not show fake face/hair preset controls. Keep the preview model at a useful close framing.
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
- [x] Source-level: bare-body preview builds a separate NIF rig from the player's current race/sex/head/hair options, strips equipment, and supports drag rotation and zoom.
- [ ] In-game: verify the preview build succeeds on a real save, stands in a calm unarmed pose, and every slider produces a correct visible change across race/sex variants.
- [ ] Clothing and armor still fit and cover the selected body correctly.
- [ ] Missing assets produce an explicit diagnostic and a documented fallback.
- [ ] Build/tests and in-game checks are recorded separately; source inspection alone is not visual validation.


## Editor preview corrections — 2026-10-19

- The preview canvas now resizes its backing bitmap to the rendered viewport dimensions. Previously a fixed 900×1080 backing bitmap was stretched to the editor's responsive panel, which distorted the displayed character on common wide layouts and made the click-to-select body zones disagree with the visible figure.
- The appearance editor now uses the same restrained charcoal-and-brass visual language as the enhanced game UI: dark framed panels, warm gold focus states, square beveled controls, and serif headings instead of the previous green-tinted custom palette.
- `bb_skinf_no-uv-edits.json` from `morrowind.v3` is included by the Better Bodies asset resolver in `morrowind.v4`. It contains **UV texture-coordinate transforms per NIF mesh section**, not world-space/body vertex coordinates. It is useful for aligning the skin texture, but it cannot repair a skeletal bind or a body mesh whose parts are spatially displaced.
- These changes address the preview's CSS aspect-ratio distortion and the editor's visual mismatch. They do not constitute a verified fix for every possible NIF/skeleton alignment issue; that still requires a visual runtime check against the v3 preview and in-game character.

- The editor's neutral preview now poses the rig from the NIF skeleton's rest transforms rather than sampling the first frame of the idle animation. This avoids idle-clip offsets being mistaken for neutral anatomy. Runtime verification is still required for the complete race/sex matrix.


### Follow-up morph correctness fixes (2026-10-19)

- [x] Removed the second world-space width/height scale from `thirdModel()`. The same `bodyWidth` and `height` values were already applied to body vertices in `poseAssembly()`; applying them again to the actor transform doubled the effect and also scaled equipment/framing. The actor transform now applies only race scale, while the body morph remains geometry-owned like the preview.
- [x] Restricted leg-spacing deformation to the leg silhouette with separate upper/lower-leg falloff. The previous broad vertical threshold also moved the outer pelvis and could make this control appear to change overall body/hip scale.
- [x] Separated breast expansion from rear-surface movement: breast volume/projection now push the front chest surface and add lateral volume; buttock controls remain restricted to the rear-facing surface. This avoids the previous breast control moving both the front and back of the torso.
- [x] Applied a final brass-accent pass to the editor's slider tracks, handles, focus state, underwear toggle and primary action so the in-game settings palette is consistent across interactive controls as well as the frame.
- [ ] Build and in-game visual regression are still required. These source-level corrections have been committed, but no browser/game render was available in this pass; do not mark the coordinate/texture/underwear end-to-end checks complete until they are exercised in the running game.
