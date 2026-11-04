> Historical initial audit. For the active accepted mesh and motion, read [implementation](Wolf-Pelt-Cloak-Implementation.md) and [Claude handoff](Equipment-Claude-Handoff.md). Old proposals below are not the active asset.

# Wolf Pelt Cloak: technical audit and first implementation plan

Date: 2026-10-28. Workspace: GTP-equipment. Status: audit followed by the first static candidate; see Wolf-Pelt-Cloak-Implementation.md.

## Visual target

The owner's two supplied concept sheets define the target, especially the first/classic variant:
- open neck, no raised collar or hood;
- a dense shoulder mantle, with the iron breastplate and diagonal strap visible from the front;
- a grey-brown pelt on the back, irregular edges, ending around the knees;
- three explicit appearances: grey wolf, white wolf, black wolf;
- no wolf head, hunting asymmetry, extra-long northern variant or short variant in the first release.

The sheets are visual references, not proof that any pictured mesh exists locally.

## Findings from the current code

1. Equipment composition already supports an independent cloak over armour.
   `src/formats/morrowind/mwItemMap.js`, `composeWornArmor`, calls `ownCloakFor` for clothing, adds a `cloak (...)` row and reserves no body/armour slots. It draws only the first equipped cloak.
2. `src/characters/ownModels/ownClothingModels.js`, `ownCloakFor`, resolves Casual/Formal Cloak to classic or Simply models. Current colour comes from clothing dye. A wolf appearance needs an explicit selection contract rather than silently replacing every grey cloak.
3. `src/systems/lookVariants.js` currently resolves armour only. A cloak chooser will need a small clothing branch; the existing armour choices should retain their current behavior. These choices are viewer preferences, not independent item properties or automatically synchronized multiplayer cosmetics.
4. `src/systems/ownMwAssets.js` already discovers NIF/DDS files under src/assets/mw through Vite. No new loader or renderer entrance is needed for an opaque skinned NIF.
5. `tools/bakeCloak.mjs`, `cloakRig`, and `tools/nifWrite.mjs` provide an existing export route to Morrowind NIF 4.0.0.2. The classic cloak deliberately weights every vertex to Bip01 Spine2. This is suitable as a static attachment reference, not as the final articulated pelt rig.
6. `tools/skyrim/` reads Skyrim BSA and SSE NIF and fits imported armour to the Morrowind/Better Bodies skeleton. Importing a mod cloak would still require inspecting its source geometry, skin bones and materials. The iron import is not a ready-made generic cloak importer.
7. `src/combat/fpArm.js` binds the composed cloak, calls `fitThirdPersonCloak`, and conditionally adds `createCloakPhysics`. Its frame loop advances the solver after posing. A wolf model must initially bypass secondary motion explicitly, including when the user has an animated cloak mode selected.
8. `src/formats/morrowind/mwCloakFit.js` fits a back sheet over body/armour across sample poses and adjusts stowed gear. Its assumptions need checking against a mantle wrapping over shoulders; front shoulder vertices must not be pushed as if they belong to the rear sheet.
9. `src/formats/morrowind/mwCloakPhysics.js` implements constrained vertex Verlet motion, damping, gait/turn/attack forcing and stowed-gear contact. Its pin region is inferred from the top 10-20 percent of mesh height. It does not implement a cloak bone-chain solver driven by measured actor acceleration. Existing fit/contact behavior does not demonstrate full dynamic collision with torso, arms and legs.
10. Simply Animated Cloaks includes local wolf cloak resources, but those are another design and are not evidence of a match to the supplied concept. No Pelts o Plenty or Winter Is Coming source mesh has been inspected in this audit.

## Static implementation proposal (next code stage)

- Author a separate Wolf Pelt Cloak asset instead of modifying the working classic mesh.
- Build two visual regions: a low open-neck mantle and a rear pelt. Keep both renderable in the ordinary NIF path; a single file may contain separate shapes.
- First establish the continuous pelt volume, shoulder clearance and jagged outer silhouette. Detailed layered fur follows after the basic fit is accepted.
- Fit against the same female Better Bodies character and the actual imported iron cuirass/pauldrons. Measure knee height on that skeleton; do not infer it from screen pixels. Male/race coverage requires separate validation.
- Initially bind to the chest using the proven bind transforms. Keep a clean back mesh with rows suitable for later chain weights; do not create unused physics bones yet.
- Supply grey, white and black textures with preserved value variation: white should retain dark roots, black should retain visible highlights.
- Add explicit wolf choices through the existing cloak equipment/appearance path, preserving classic and Simply defaults. Keep the visual selection separate from animation-mode selection.
- Review the assembled result front, rear and side on the iron set. Also inspect walk/run poses for static penetration, clearly labeling this stage as having no secondary motion.

## Later stages

- Add an isolated cloak-specific bone-chain solver with explicit mantle anchors, inertia from actor translation/rotation, time-based damping, fixed substeps and reset on teleport/equip.
- Add torso/hip/thigh collision proxies in the same coordinate space. Keep existing cloaks on their current path.
- Attach layered fur geometry/cards to the pelt's existing deformation. Verify alpha cutout, backfaces and shadows end to end before relying on cards; present NIF writing/renderer support must not be assumed from texture alpha alone.
- Validate idle, walk, run, abrupt stop, turn, jump, equip/remove and stowed gear; compare frame rates and measure cost before broadening coverage.

## External references

- Pelts o Plenty: https://www.nexusmods.com/skyrimspecialedition/mods/120726 . Its Skyrim motion depends on FSMP/XPMSSE; those runtimes cannot be reused by this browser game. Author/source credits must be retained if an imported asset is selected.
- Winter Is Coming: https://www.nexusmods.com/skyrim/mods/13486 . Visual reference for this plan; no model or texture copied.

## Validation status

Existing focused cloak tests are being run separately. The first static model is now generated and runtime binding is tested; no in-game visual acceptance has occurred. This record must not be interpreted as a completed implementation.

Baseline result: 25 tests, 16 passed, 9 failed before runtime changes. Command: node --test test/formats/morrowind/mwcloakphysics.test.js test/tooling/mwcloak1.test.js test/tooling/mwcloak2.test.js test/formats/morrowind/auditmwcloak.test.js . Failures include fit-pose/gear expectations, gait and shield motion assertions, and source-text contract checks. These are existing baseline failures; their causes have not all been diagnosed, and the new cloak must not be described as regression-free based on this run. Full local TAP log: %TEMP%/gtp-wolf-cloak-baseline.tap.
