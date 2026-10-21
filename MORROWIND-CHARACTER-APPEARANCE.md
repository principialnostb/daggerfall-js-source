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

Implementation update (2026-10-20): when Settings → Тела enables Seamless DMRA, female actors select the matching `Seamless DMRA body replacer/Meshes/bb/bb_skinf_<race>.nif` instead of the base Better Bodies female mesh. The base Better Bodies skin/underwear texture remains in use, and male geometry continues to use Better Bodies. Only one female body mesh is selected for an actor at a time.

Implementation update (2026-10-19): male Better Bodies bodies continue to use the matching race/sex NIF and DDS. Female actors share the Nord-female NIF geometry and its matching Nord DDS as the UV-matched base, for both Nude and Underwear sets. The NIF's texture stem is rewritten only in a private byte copy to a race-specific virtual texture name; the standard texture resolver/decoder loads the base DDS, then decoded female skin pixels are multiplied by a race-specific RGB tone while preserving authored UVs, alpha, and mip layout. Both the worker-preload and synchronous texture paths apply the same tone function. This is a first-pass race tint, not a claim of exact parity with the original game's race palettes; in-game checks are still needed for skin tone, seams, and first-person hands. Unsupported races (including Argonian/Khajiit, which have no Better Bodies files in this pack) retain the existing logged fallback.

UV-edit diagnostic (2026-10-19): application of `bb_skinf_no-uv-edits.json` has been temporarily disabled in the world/player body and first-person arm build paths. The JSON is retained unchanged as a comparison/rollback artifact. This experiment preserves the source UVs embedded in the selected NIF; it does not alter geometry or skeleton; female texture selection now uses the shared Nord DDS base with race tint applied after decode. In-game visual comparison is required before deciding whether to discard, revise, or reintroduce the edits.

### Body morphs and appearance editor

- `src/characters/bodyMorphs.js` stores normalized body-morph values for the player.
- `src/ui/appearanceEditor.js` now requests a dedicated preview rig from `fpArm.createAppearancePreviewRig()` and renders that rig's actual NIF assembly into the editor canvas. The preview is a separate `createFpArm({ playerAppearance: true })` instance with its own skeleton, assembled body/head/hair meshes and animation state. It shares renderer and asset/dependency references only; it does not read the live gameplay rig's screenshot or pose.
- The preview build copies the current player's race, sex, face and hair assembly options, then strips armor, clothing, weapons, torches and other equipment. The editor explicitly requests the body's base idle group instead of the weapon-derived portrait stance. Drag rotation and wheel/button zoom render the dedicated rig at the requested yaw/framing.
- Removed the previous face portrait cards and schematic hairstyle options: the 2D inventory portraits are not head presets, and fabricated face/hair selectors would misrepresent the available assets. The editor currently shows the actual head/hair assembled for the player; selectable presets should only be added once real alternative head/hair meshes are enumerated and wired to the builder.
- The editor has 19 persisted body controls grouped by anatomical region. Breast, breast projection, waist, abdomen, hip, buttock, shoulder, ribcage, arm, thigh, calf, limb length, leg spacing, body width, overall fullness and height now use localized vertex morphs in a shared whole-body coordinate frame; head size uses a head-bone scale. These are early generic transforms based on approximate body-height zones, not calibrated per race/sex/NIF. Visual QA is still required to confirm natural falloffs and fit with equipment.
- The equipment PaperDoll must not be substituted for the preview: it is not the live morphed 3D body.

### Shared female body baseline and isolated editor preview (2026-10-19)

- Female actors use the Nord-female Better Bodies NIF geometry and its matching Nord DDS base texture; this preserves the mesh's authored UV layout across races. Decoded skin pixels are tinted for the actor's race in the standard texture pipeline, with matching handling in texture preloading and synchronous decode.
- The NIF's embedded texture stem is rewritten in a private byte copy to a race-specific virtual texture name. The virtual path lets the existing resolver/texture cache keep race variants separate while all female bodies use the same Nord base DDS. Cached source NIF bytes are not mutated.
- The editor still owns a separate rig and animation/skeleton state. It does not borrow the live character's rendered screenshot. Its established portrait draw path and the 19 live morph controls are retained.
- The standalone HTML diagnostic remains intentionally nude, regardless of the saved in-game underwear preference. It is the geometry reference, not the live game renderer.
- The portrait renderer's horizontal framing margin was widened to avoid clipping fingertips when the skinned hand vertices extend beyond conservative posed range bounds. This is a source-level framing adjustment; confirm it visually in the running editor.
- Runtime visual QA remains necessary: verify the body is continuous, race-specific skin and face are correct, and every morph produces a visible, coherent change. No browser/game render or build/test run has been performed in this code-edit pass.

### Body selection and preview regression notes (2026-10-19)

- The Better Bodies resolver now chooses the female geometry baseline globally, not just in the editor. Male bodies remain race-specific. Unsupported races or unavailable assets retain the existing logged fallback path.
- The underwear preference defaults to enabled and is read whenever a body rig is built. The editor checkbox rebuilds its isolated preview immediately; it does not currently force an immediate rebuild of the already-running world rig. The saved choice applies to subsequent body builds, including equipment-triggered rebuilds.
- Runtime visual verification is still required: confirm the 3D figure appears, that Nude/Underwear selection is correct, and that sliders update the preview and player without distortion.

### Body morph and underwear update (2026-10-19)

- [x] The Better Bodies resolver supports both `Better Bodies/Nude` and `Better Bodies/Underwear`. Female actors share the Nord-female geometry and matching Nord DDS base from the selected asset folder; the decoded skin is tinted for the actor's race. The saved underwear preference defaults to enabled, and explicitly turning it off selects the fully nude asset set.
- [x] The underwear preference is persisted separately from morph sliders. Toggling the checkbox rebuilds the editor's isolated preview so the selected variant is visible there. Subsequent world-body builds read the saved preference; the current live world rig is not force-rebuilt immediately by the checkbox.
- [x] Replaced the former fixed pelvis/chest/shoulder/thigh scale offsets with localized vertex morphs based on shared whole-body bounds. New controls cover ribcage width, breast volume/projection, abdomen volume, buttock volume/projection, arm thickness/length, thigh/calf thickness, leg length and leg spacing. Body width and height now use the same vertex deformation in the preview and world model rather than portrait-only scaling.
- [x] While any body morph is non-zero, the third-person body uses the CPU skinning path so the deformed vertices are actually uploaded to the world renderer. The ordinary GPU skinning path remains available when all morph values are reset.
- [x] The editor now uses compact settings-menu styling, filled range tracks with tactile handles, numeric value chips, and filters for anatomical control groups.
- [x] `better-bodies-preview.html` and `src/tools/paperdoll/betterBodiesPreview.js` are already present in `morrowind.v4`; the tool selects NIF mesh sections for UV inspection, not named anatomical bones. It is useful for inspecting source geometry, but it is not itself an anatomical morph editor.
- [ ] Run the game and validate that Nude/Underwear selection is correct for each supported race/sex, that equipment rebuilds preserve the preference, and that the local morph falloffs look natural on the actual NIF meshes.
- [ ] The anatomy zones use approximate whole-body coordinates. The new controls have distinct vertex transforms, but they still need visual calibration against each Better Bodies mesh and sex. Do not claim the sliders are fully production-calibrated until this QA is complete.

### Editor UI presentation update (2026-10-19)

- [x] Reworked `src/ui/appearanceEditor.js` toward the shipped Enhanced settings skin: blue-black/stone surfaces, bone text, brass accents, condensed data typography and display-serif headings. The preview and controls share the same palette tokens and consistent focus/hover states.
- [x] Expanded the preview column and canvas, added a responsive layout for narrow screens, and clarified the drag-to-rotate and zoom controls. The reset-view action resets both yaw and zoom; the body reset updates all displayed values and dispatches the shared morph-change event.
- [x] Kept the existing dedicated preview-rig pathway and real currently selected head/hair assembly. No 2D portrait cards or invented face/hair presets were added.
- [ ] Visual QA in the running game/browser is still required at desktop and mobile widths. The UI refresh does not by itself improve the underlying deformation algorithms.
- [x] Restored the editor's first working dedicated-rig draw path: it renders the rig's established portrait pose at the original zoom-scaled height instead of forcing the later `neutral: true` path. This is scoped to `src/ui/appearanceEditor.js`; no world/NPC body or Better Bodies gameplay selection was reverted. Slider input still calls `setBodyMorph`, emits `mw-body-morph-change`, and redraws the dedicated rig immediately.
- [ ] Verify in the running game that the restored pose no longer shows the disconnected body and that all 19 sliders produce visible, anatomically coherent changes. This source change is not a claim that the shared body deformation itself is fixed.

## Target architecture

1. Resolve the actor identity first: actor type (player/NPC), race, sex, and special form (beast, werewolf, vampire, etc.). Preserve the current special-form exclusions unless a compatible asset set is explicitly implemented.
2. Resolve the base body by actor identity. Male bodies use race + sex geometry; female bodies use the Nord-female geometry selected as the visual baseline, with the DDS still selected by the actor's race. Use the corresponding Nude/Underwear folder according to the saved preference. Never silently use the Nord female skin on another race.
3. Resolve the head and hair from the same actor's race/sex-compatible pools. The improved face matcher may choose among candidates inside that pool; it must not override the race/sex constraint.
4. Assemble the body and head on a compatible skeleton, apply body morphs, then compose clothing/armor using the existing slot-aware fit path. Equipment may hide covered skin slots, but it must not replace the selected race/sex identity.
5. The editor owns a separate preview rig and model instance, built from the shared Nord-female geometry and the player's race-specific skin when the player is female, with no clothing or equipment. It uses the player's actual current head and hair and applies the same body-morph state to the preview and player. Slider changes update the preview immediately; they must not borrow a screenshot or animation pose from the live gameplay actor. Drag rotation, zoom and reset are implemented. Until real alternate head/hair meshes are selectable, do not show fake face/hair preset controls. Keep the preview model at a useful close framing. Full in-game visual and race/sex matrix validation remains outstanding.
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

- [x] Source-level resolver selects a race-specific DDS for all eight Better Bodies race keys; male bodies use race-specific geometry and female bodies use shared Nord-female geometry (source-level wiring only).
- [ ] All eight races × male/female: in-game body, hand, and texture rendering visually verified.
- [ ] Player and NPCs independently use their own race and sex.
- [ ] Head/hair candidates stay inside the same race/sex pool as the actor.
- [ ] Special forms do not accidentally inherit the ordinary humanoid Better Bodies body.
- [ ] UV coordinates are checked for each distinct mesh layout before corrections are shared.
- [x] Source-level: bare-body preview builds a separate NIF rig from the player's current race/sex/head/hair options, strips equipment, and supports drag rotation and zoom.
- [ ] In-game: verify the Better Bodies preview build succeeds on a real save, stands in a calm unarmed pose, and every slider produces a correct visible change across race/sex variants.
- [ ] Clothing and armor still fit and cover the selected body correctly.
- [ ] Missing assets produce an explicit diagnostic and a documented fallback.
- [ ] Build/tests and in-game checks are recorded separately; source inspection alone is not visual validation.


## Editor preview corrections — 2026-10-19

- The preview canvas now resizes its backing bitmap to the rendered viewport dimensions. Previously a fixed 900×1080 backing bitmap was stretched to the editor's responsive panel, which distorted the displayed character on common wide layouts and made the click-to-select body zones disagree with the visible figure.
- The appearance editor now uses the same restrained charcoal-and-brass visual language as the enhanced game UI: dark framed panels, warm gold focus states, square beveled controls, and serif headings instead of the previous green-tinted custom palette.
- `bb_skinf_no-uv-edits.json` from `morrowind.v3` remains in the repository as a diagnostic reference. It contains **UV texture-coordinate transforms per NIF mesh section**, not world-space/body vertex coordinates. As of the current diagnostic commit, runtime application is disabled so the original NIF UVs can be compared against the previously observed clean Dark Elf body. Do not delete or reapply the JSON until the in-game comparison identifies whether these transforms cause the defects.
- These changes address the preview's CSS aspect-ratio distortion and the editor's visual mismatch. They do not constitute a verified fix for every possible NIF/skeleton alignment issue; that still requires a visual runtime check against the v3 preview and in-game character.

- The editor no longer forces the later neutral-preview path; it uses the earlier dedicated-rig portrait pose that preceded the neutral-mode change. The body morph controls remain live and redraw the preview after each input. Runtime verification is still required for the complete race/sex matrix.


### Follow-up morph correctness fixes (2026-10-19)

- [x] Removed the second world-space width/height scale from `thirdModel()`. The same `bodyWidth` and `height` values were already applied to body vertices in `poseAssembly()`; applying them again to the actor transform doubled the effect and also scaled equipment/framing. The actor transform now applies only race scale, while the body morph remains geometry-owned like the preview.
- [x] Restricted leg-spacing deformation to the leg silhouette with separate upper/lower-leg falloff. The previous broad vertical threshold also moved the outer pelvis and could make this control appear to change overall body/hip scale.
- [x] Separated breast expansion from rear-surface movement: breast volume/projection now push the front chest surface and add lateral volume; buttock controls remain restricted to the rear-facing surface. This avoids the previous breast control moving both the front and back of the torso.
- [x] Applied a final brass-accent pass to the editor's slider tracks, handles, focus state, underwear toggle and primary action so the in-game settings palette is consistent across interactive controls as well as the frame.
- [ ] Build and in-game visual regression are still required. These source-level corrections have been committed, but no browser/game render was available in this pass; do not mark the coordinate/texture/underwear end-to-end checks complete until they are exercised in the running game.

### Morph regression audit — 2026-10-21

- Confirmed a concrete double-application defect: `bodyWidth` and `height` already deform body vertices in `poseAssembly()`, but the third-person actor transform and the editor portrait transform also applied the same scale. This made those controls scale the whole assembled model a second time, including attached geometry/framing. Removed the duplicate transform scaling; these controls now have one owner, the body-vertex morph pass.
- Exported the geometry-deformation function so it can be exercised directly by regression tests with synthetic vertex clouds. This verifies that every regional geometry control changes vertex data under representative anatomy bounds; `headScale` remains a separate skeleton-bone transform and is tested through pose-level behavior.
- This source-level fix does not substitute for visual QA against the actual Better Bodies NIFs. The existing morphs are procedural vertex deformations, not authored morph targets in Better Bodies. Region weights and falloffs still require visual calibration on supported race/sex meshes and clothing.
