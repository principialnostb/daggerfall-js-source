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


### Morph-region root-cause investigation — 2026-10-21

**Status: investigation, not a verified fix.** The torso-width changes in commits `413383f` and `354cb37` are still heuristic adjustments. They have not been validated against the shipped Better Bodies NIFs and must not be treated as proof that the region classifier is correct.

#### Findings confirmed in source

- `poseAssembly()` first CPU-skins every body piece, then computes one bounding box from those **posed** vertex positions, estimates torso width from a height band (`nz = 0.53..0.75`), and passes that frame to `deformPlayerBodyGeometry()`. Therefore the region frame is animation-dependent: limb and torso positions can move before the classifier measures them.
- The regional masks are geometric guesses over normalized height and distance from the body centre. Shoulder, ribcage, breast, waist, abdomen, hip and buttock are overlapping height-based falloffs. `piece.slot` is used only to decide whether a piece is eligible for morphing; it does not identify the anatomical region of each vertex. A full-body `betterBodies` mesh can consequently be classified only by these approximate coordinates.
- The NIF pipeline already retains more useful source data: `piece.batch.positions` are the unposed mesh positions, and `piece.batch.skin.bones` contains each influence's bone name, vertex indices and weights. The flattener also preserves each NIF shape's name. These are potential inputs for a stable classifier and diagnostic report; they have not yet been used to prove region membership.
- The old editor's click-to-select logic (commit `3e6c6b0`) did **not** perform mesh picking or identify anatomical vertices. It converted the click into normalized canvas X/Y and selected a group using fixed screen thresholds. That logic was removed in commit `45d1541` as misleading. The `better-bodies-preview.html` page is a NIF-section/UV preview, not an anatomical segmentation implementation.
- The current regression tests use a synthetic Cartesian vertex cloud. The shoulder/waist isolation test checks three manually chosen vertices, so it can catch a narrow regression in those examples but cannot establish correct segmentation on an actual NIF. No real-mesh morph-displacement matrix or visual runtime validation has been recorded.

#### Consequence

Do not continue tuning global height thresholds or torso-width percentiles as the primary solution. First separate **classification** from **deformation** and make the result measurable.

#### Proposed investigation sequence

1. Add a diagnostic pass that reports each actual body shape/slot, vertex and triangle counts, bind-space bounds, available bone influences, and shape names for the selected race/sex/body variant.
2. For each morph control in isolation, measure the vertices that move and their displacement, grouped by source shape, skinning influences, and stable bind-space anatomical bands. Compare positive, negative and zero values. Include at least waist, abdomen, hips, thighs and knees in the report.
3. Compare the current post-skin classifier against a bind-space classifier. Use the authored shape/slot names and bone weights to distinguish trunk and limbs where the source data supports it; use skeleton-relative landmarks plus bind-space coordinates for subdivisions such as waist versus abdomen that bone weights alone cannot distinguish.
4. Replace overlapping guessed masks only after the report shows where they fail. Keep overall controls explicitly broad; make named controls use separately defined region weights with documented anchors and falloffs.
5. Add regression coverage using captured measurements from real Better Bodies NIF variants, not only a synthetic point cloud. Record source-level tests separately from build, browser-preview and in-game visual checks.

#### Implementation update — bone-weight gating (2026-10-21)

The production deformation path resolves each NiSkinData bone's skeleton reference to the actual NiNode name before building per-vertex region weights for trunk, shoulder, pelvis, arm, thigh and calf controls. NiSkinData bone records do not themselves guarantee a `name` field; relying on `bone.name` silently left the production path on approximate coordinate masks. The focused regression test now models the production shape (`ref` plus skeleton-node lookup) rather than supplying synthetic names directly. Coordinates still subdivide nearby trunk regions such as breast, ribcage, waist and abdomen; bone weights cannot distinguish those adjacent areas by themselves.

This is a partial correction, not proof that every slider is visually correct. The current shared bounds are still measured after skinning, and torso subdivisions still use overlapping height falloffs. The mapping must still be checked against actual Better Bodies NIF bone names; unknown names and missing refs must be measured from the shipped assets rather than guessed.

Validation required before calling this resolved: run the focused body-morph test and build, inspect bone-name coverage on actual assembled Better Bodies meshes, and measure each isolated slider's vertex displacement on real mesh data. A passing synthetic regression test is not visual or in-game validation.

**Validation status:** the production morph path has now been changed to use authored skin-weight regions where recognizable bone names are present. However, no automated test run, build, browser render, or in-game visual check has been performed in this pass. The torso-mask commits remain unverified, and the new bone-weight gating is also unverified against the actual Better Bodies assets.


### Additional static audit findings — 2026-10-21

**Confirmed: two pairs of controls are not functionally independent in the current deformation formula.**

- `breastSize` and `breastProjection` are added into the same scalar expression, then applied to the same `breastZone * front` mask and the same Y axis. Their only difference is the coefficient (0.15 vs 0.20). No separate lateral-volume term exists in this implementation. Therefore the two controls are mathematically interchangeable up to scale; they cannot independently express breast volume versus projection.
- `buttockSize` and `buttockProjection` have the same problem: both are summed into one scalar and applied to the same rear mask on the same Y axis, with only different coefficients (0.15 vs 0.19). They cannot independently express volume versus projection.
- This is a concrete semantic defect in the current formulas, not a visual guess. It does not alone explain every incorrectly placed zone or prove which build was used during a particular manual test.

**Confirmed: regression coverage does not establish correctness on the shipped body meshes.**

- `test/formats/morrowind/bodyMorphs.test.js` mostly uses a synthetic Cartesian point cloud and broad hand-authored bounds. The general test asserts only that some vertex changes; shoulder/waist isolation checks three selected points without real skin weights; the bone-resolution test uses a synthetic skeleton map and four synthetic vertices.
- No checked-in test currently records per-control displacement on an actual assembled Better Bodies NIF across its source shapes and skin influences. The tests therefore cannot detect wrong anatomical membership on the real mesh.

**Confirmed: the tracked repository contains two buildable project trees that are not equivalent.**

- Root `src/formats/morrowind/mwFirstPerson.js` has a different morph implementation from `morrowind.v4/src/formats/morrowind/mwFirstPerson.js`. The root version resolves each skin influence's `ref` through the actual skeleton and applies bone-region weights; the nested copy has the older signature without the skeleton argument and lacks that gating.
- The root `test/formats/morrowind/bodyMorphs.test.js` exists, but the equivalent `morrowind.v4/test/formats/morrowind/bodyMorphs.test.js` does not. Both trees have package/build configuration, so launching Vite from the nested directory would run the nested snapshot rather than root `Dev`.
- This is a high-priority execution-path hypothesis for “code changes do not affect the result”, but it is not yet proven to be the cause of a specific manual run. Before further diagnosis, record the exact working directory, served URL/build, and commit/source tree being tested.

**Preview clarification.** The only tracked `better-bodies-preview.html` is a NIF mesh-section/UV and static equipment-fit preview; it does not implement anatomical zone picking. The prior screen-coordinate click grouping described above was not real mesh segmentation and was removed. The anatomical preview described in earlier discussion is not present in the current tracked HTML files and must be located or recreated as a separate diagnostic before it can serve as an oracle.

**Validation status:** static source inspection only. No repository test suite, build, browser render, or in-game run was executed during this audit. Do not modify deformation formulas until the active build path is verified and real-mesh per-control displacement is measured.


### Morph independence correction — 2026-10-21

The production vertex-morph formula now gives `breastSize` and `buttockSize` a lateral-volume component in X in addition to their existing front/rear depth component in Y. The corresponding `breastProjection` and `buttockProjection` controls remain depth-only. This removes the confirmed mathematical aliasing where each size/projection pair previously drove the same axis through the same mask with only different coefficients.

Focused synthetic regression tests now assert that each size control changes lateral width, each projection control does not, and all four still change depth. These tests verify formula-channel separation only; they do not prove correct anatomical masks or natural results on actual Better Bodies NIF meshes. Actual-mesh per-control displacement and visual inspection remain required. No claim of a passing test run or in-game validation is made by this source change alone.


### Morph isolation correction — 2026-10-21

A source audit of the root runtime (`src/formats/morrowind/mwFirstPerson.js`) found that torso and limb controls still used height/shape falloffs without consistently gating every region by the NIF's authored skin influences. In particular, ribcage/breast/waist/abdomen masks could include pelvis-weighted vertices, and leg length could move pelvis vertices because it used only the global height coordinate.

The root runtime now excludes pelvis/hip bones from the trunk influence set, gates ribcage/breast/waist/abdomen zones by trunk weights, and gates leg-length displacement by thigh/calf weights. Focused regression tests were added for ribcage-versus-pelvis isolation and leg-length-versus-pelvis isolation. This is a targeted correction, not proof that all anatomical zones are calibrated on retail Better Bodies meshes.

**Important source-of-truth note:** the repository contains a second copy under `morrowind.v4/src/`. It is not byte-identical to the root runtime; the root test suite imports `src/`. Do not assume a fix in one copy changes the other. Before any release or merge, explicitly establish which tree the target build consumes and either sync the intended patch or document the snapshot boundary.

**Validation status:** source and regression tests were updated, but the test suite and in-game/browser visual validation have not been executed in this pass. Do not mark the slider problem resolved until the focused test passes and each control is measured on actual supported NIF body meshes.


### Preview refresh regression found on 2026-10-21

- The appearance editor defined a debounced `schedulePreviewRigRebuild()` because the preview rig can retain assembled/cached mesh state, but neither the slider `input` handler nor the reset handler called it. Both handlers only redrew the existing rig. This meant the documented cache invalidation path was dead code, so slider changes could redraw stale assembled geometry even while draft values and labels changed.
- `src/ui/appearanceEditor.js` now schedules the debounced preview-rig rebuild after slider input and after resetting all morphs. This is a targeted preview invalidation fix, not proof that anatomical masks are correctly calibrated for every Better Bodies NIF.
- Remaining verification: run the body-morph unit tests and visually test each slider against the real preview rig. Existing synthetic vertex-cloud tests only prove that formulas move selected artificial vertices; they do not validate the shipped NIF's skin influence mapping or anatomical locality. Do not describe the editor as fixed until that validation is complete.


### Body-morph diagnostic observations — 2026-10-21

The following is a record of observed behavior on the currently tested character model, **not a claim that the morphs are anatomically correct or fixed**. Effects may vary by mesh, race, sex, pose, and build path. Use these observations to name controls by their visible result and to guide real-mesh diagnostics.

| Existing control | Observed effect on the model | UI label / interpretation |
| --- | --- | --- |
| `shoulderWidth` | Changes ribcage width rather than only the shoulder span. | Upper torso width |
| `ribcageWidth` | Changes the lower torso below the ribcage, including its lateral sides. | Lower torso width |
| `breastSize` | Changes the abdomen's shape/protrusion. | Abdomen bulge |
| `breastProjection` | Also changes the abdomen's shape/protrusion. | Abdomen forward projection |
| `waistWidth` | Changes the groin region and the outer sides of the upper thighs near the groin. | Groin and upper-thigh width |
| `abdomenVolume` | Deforms the buttocks and groin region at the same time. | Abdomen, buttocks and groin deformation |
| `hipWidth` | No visible change observed. | No effect observed; keep marked as such until investigated |
| `buttockSize` | Slightly changes the lower part of the buttocks. | Lower-buttock shape (weak effect) |
| `buttockProjection` | Appears to affect buttock projection, but the change is barely visible. | Buttock rear projection (barely visible) |
| `armThickness` | Changes apparent arm width in a frontal view; does not visibly add depth/volume. | Arm width, front view |
| `armLength` | No visible change observed. | No effect observed; keep marked as such until investigated |
| `thighThickness` | Changes vertical-plane spacing between the knees rather than thigh thickness. | Knee spacing via thigh control |
| `calfThickness` | Also changes vertical-plane spacing between the knees rather than calf thickness. | Knee spacing via calf control |
| `legLength` | Changes the lower-leg/calf length, not the thigh length. | Lower-leg length |
| `legGap` | Moves knees and feet together, changing their separation in the vertical plane. | Knee and foot spacing |
| `height` | Raises the torso while the head remains at its original static position. | Torso height (head stays fixed) |
| `bodyWidth` | Observed to behave as intended. | Body width |
| `bodyFullness` | Controls front-to-back body thickness in a side view. | Body thickness, side view |

#### UI follow-up — 2026-10-21

- [x] Face and hairstyle selectors now use the same compact label/select treatment as sex and race instead of visually separate, differently styled cards.
- [x] Body sliders and anatomical group filters are collapsed by default behind **«Расширенные параметры тела»**.
- [x] The expanded section displays a clear notice: **«Функция находится в разработке»**, with a warning that morph effects are not fully calibrated and may deform the model.
- [x] Slider captions were revised to describe the observed visible effect rather than repeat the legacy/internal parameter name.
- [ ] Run the editor in the actual game/browser to verify the selector layout at desktop and mobile sizes, expansion/collapse behavior, keyboard accessibility, and that all controls remain usable.
- [ ] Measure each control's vertex displacement on actual assembled Better Bodies meshes and compare the same test across supported race/sex variants. In particular, investigate controls with no effect and controls whose observed effect differs from their intended anatomical region.

These observations are diagnostic input only. Do not infer from a control's UI caption that the underlying geometry behavior has been corrected. No build, test suite, browser render, or in-game visual validation was performed as part of this UI/documentation change.
