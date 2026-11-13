# Cloaks: classic placement, secondary motion, and Simply Animated Cloaks

This note documents the current implementation contract. The classic cloak path is the reference; the Simply mesh is adapted to that path rather than given an unrelated placement system.

## Required behavior

- **Vanilla** selects the project's classic cloak mesh and keeps its existing bind, placement, and body-fit behavior unchanged.
- **Vanilla Animated** selects that same classic mesh and adds bounded secondary motion only after the normal body assembly and cloak fit. It must not change the mesh selection, texture, bind matrices, or base placement.
- **Вкл (Simply Animated)** selects the mod NIF, keeps the mod's skin binding/retarget path, and also receives bounded secondary motion after the normal fit. This solver supplements the authored skinned pose; it must never be used to disguise an incorrect rest-pose transform.
- **Вкл** selects the Simply Animated Cloaks asset and uses the existing NIF skinning/animation path. It must retain the mesh's authored texture and geometry. Any compatibility work belongs at the skin/transform binding boundary, not in arbitrary vertex offsets.
- If a mode cannot initialize its optional animation, keep the cloak visible with its normal placement and record a diagnostic. Do not silently change the user's selected mode or swap the model as an animation workaround.

## Existing code path

- `src/characters/ownModels/ownClothingModels.js` maps clothing dye to either a classic `cloak_<painting>.nif` or a Simply mesh.
- `src/combat/fpArm.js` assembles the third-person actor, then calls `fitThirdPersonCloak()`. The `Vanilla Animated` solver is attached after this fit so the initial fitted shape is its rest state.
- `src/formats/morrowind/mwCloakFit.js` handles cloak clearance and stowed gear relative to the cloak. It is not a substitute for correct NIF skin binding.
- `src/formats/morrowind/mwCloakPhysics.js` adds bounded Verlet motion to a mesh after it has been bound and fitted. Both animated modes can use it. It is secondary motion, not the source of the cloak's attachment or its authored animation.
- `src/formats/morrowind/mwFirstPerson.js` passes `retargetSkinToBone` into the NIF binding layer; `src/formats/morrowind/mwSkin.js` owns the skeleton-space math.

## Simply mesh adaptation

The Simply meshes have their own skin root (the inspected blue mesh uses `cloakbone`) and cannot be assumed to have the same bind frame as the classic cloak just because they occupy the same clothing slot. The current third-person assembly requests retargeting to `bip01 spine2` for these assets. Treat this as a compatibility hypothesis that must be verified against the classic path—not as proof that every transform now matches.

Do not fix a misplaced cloak by repeatedly changing arbitrary position/rotation constants. Compare, in order:

1. the NIF scene/root and shape transforms;
2. the skin instance's skeleton root and bone references/weights;
3. the runtime's bind matrices and the actor's chest-bone transform;
4. the final placed vertices in the same rest pose as the classic cloak.

The first divergence is the correction point. Preserve authored vertex positions and texture coordinates unless the source asset itself proves they are wrong.

## Validation checklist

- [ ] Vanilla: same model, texture, bind, and rest-pose placement as before this feature.
- [ ] Vanilla Animated: same rest-pose placement as Vanilla; only the hem moves over time.
- [ ] Вкл: Simply model and texture remain selected; confirm both the rest-pose transform and secondary motion; compare shoulders/hem to the classic cloak in the same actor pose.
- [ ] Check idle, walk, run, torso turn, and both arm swings.
- [ ] Confirm missing skin bindings and unavailable physics are diagnostic-only failures, not silent model substitutions.
- [ ] Run the focused cloak tests and inspect in-game screenshots before declaring the placement correct.

## CLOAK-CONTACT and SHIELD-SEAT (2026-11-12)

The owner, 2026-11-12: the animated cloak "stands very far from the back", gear slung on it "does not press
it", and it costs frames. Read offline on the steel body (1949 cloth points): the live contact pass refitted the
cloak to the whole body every frame, 14.4 ms, beside the cloth's own 2.2; standing still the cloth drifted 3.5 units
off its fit and stayed there; the stowed shield stood 9.3 units behind the cloak.

- The cloth met ten capsules on the live bones, in its own bind space; the per-frame refit is gone. (Replaced by
  CLOAK-BODY below.)
- Each free point goes a share of its way home to the fitted shape every frame
  (src/formats/morrowind/mwCloakPhysics.js:"const MEMORY = Object.freeze(").
- An animated cloak was fitted to four poses, a still one to eleven. (CLOAK-BODY below: both to eleven.)
- The stowed shield sat where half its points cleared the cloak (SHIELD-SINK below). It is no longer re-tied to the
  cloak every pose; the cloth under it is pressed in, four units at most. Its footprint is taken five times a second.

Read after: 1.1 ms a frame; 0.45 units off the fit standing; nothing through the cloak in any pose of the sweep; the
shield 1.7 units off the cloak. Seen in the lab on the woman in steel, standing and running. Open: slung weapons
(a greatsword, a bow) still stand clear at every point; the man, other shields and the Simply mesh are not yet seen.
All four hosts share fpArm. The port's own; OpenMW's pack swaps pre-bent meshes.
Test: test/formats/morrowind/cloakcontact.test.js.

## CLOAK-BODY and SHIELD-SINK (2026-11-13)

The owner, 2026-11-13: after CLOAK-CONTACT, legs and armour came through the cloak, the walk looked worse, and the
stowed shield sat wrong. Read offline on the steel body, moving: the capsules sat on the bones, thinner than the
plate, and met 0-2 of 1949 points a stride. A walk sent 30 edges through, a sprint 202 (8.8 units deep). The pinned
collar, fitted to four poses, took a pauldron on an arm swung back. Half the shield stood past the cloak, and the cloth
came through the rest. The press read the pressed cloth, so it changed every footprint (2.38, 0.38, 2.00 units).

- The cloth meets the worn pieces' own posed surface: their backmost y over each unit of the cloak's (x, z), in its
  bind space, rounded two units sideways (src/formats/morrowind/mwCloakColliders.js:"export function cloakColliders(").
  It costs 0.65 ms a frame.
- Every cloak is fitted to the eleven poses
  (src/formats/morrowind/mwCloakFit.js:"export const CLOAK_STILL_POSES = Object.freeze([...CLOAK_FIT_POSES,").
- The hem's shape memory is 0.015, not 0.035: the walk swing is 10.0 units again (8.6 before).
- Over an animated cloak the shield is drawn in to 1 unit off the body, the cloth pressed 4 units at most
  (src/formats/morrowind/mwCloakFit.js:"export const SHIELD_PRESS = 4;"). The press is read off the fitted cloth.

Read after: walk and stride 0 edges through, sprint 18 (0.3 units deep); standing 0.54 off the fit; the steel shield
4 units nearer than over a still cloak, 2.4 off the body, no cloth through it. Not yet seen in the game or the lab.
Test: test/formats/morrowind/cloakcontact.test.js.

## Current known limitation

The solver pins vertices by their current maximum Z range, not by an explicit shoulder seam or skin-weight boundary. That is a heuristic for secondary motion and may need to be replaced with a topology/skin-informed pin set if the classic mesh's upper edge visibly stretches. This limitation affects cloth motion; it must not be addressed by altering the base cloak placement.
