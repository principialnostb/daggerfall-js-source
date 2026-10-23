# Cloaks: classic placement, secondary motion, and Simply Animated Cloaks

This note documents the current implementation contract. The classic cloak path is the reference; the Simply mesh is adapted to that path rather than given an unrelated placement system.

## Required behavior

- **Vanilla** selects the project's classic cloak mesh and keeps its existing bind, placement, and body-fit behavior unchanged.
- **Vanilla Animated** selects that same classic mesh and adds bounded secondary motion only after the normal body assembly and cloak fit. It must not change the mesh selection, texture, bind matrices, or base placement.
- **Вкл** selects the Simply Animated Cloaks asset and uses the existing NIF skinning/animation path. It must retain the mesh's authored texture and geometry. Any compatibility work belongs at the skin/transform binding boundary, not in arbitrary vertex offsets.
- If a mode cannot initialize its optional animation, keep the cloak visible with its normal placement and record a diagnostic. Do not silently change the user's selected mode or swap the model as an animation workaround.

## Existing code path

- `src/characters/ownModels/ownClothingModels.js` maps clothing dye to either a classic `cloak_<painting>.nif` or a Simply mesh.
- `src/combat/fpArm.js` assembles the third-person actor, then calls `fitThirdPersonCloak()`. The `Vanilla Animated` solver is attached after this fit so the initial fitted shape is its rest state.
- `src/formats/morrowind/mwCloakFit.js` handles cloak clearance and stowed gear relative to the cloak. It is not a substitute for correct NIF skin binding.
- `src/formats/morrowind/mwCloakPhysics.js` adds bounded Verlet motion to a mesh's already-bound positions. It is secondary motion, not the source of the cloak's attachment or its authored animation.
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
- [ ] Вкл: Simply model and texture remain selected; compare its shoulders/hem to the classic cloak in the same actor pose.
- [ ] Check idle, walk, run, torso turn, and both arm swings.
- [ ] Confirm missing skin bindings and unavailable physics are diagnostic-only failures, not silent model substitutions.
- [ ] Run the focused cloak tests and inspect in-game screenshots before declaring the placement correct.

## Current known limitation

The solver pins vertices by their current maximum Z range, not by an explicit shoulder seam or skin-weight boundary. That is a heuristic for secondary motion and may need to be replaced with a topology/skin-informed pin set if the classic mesh's upper edge visibly stretches. This limitation affects cloth motion; it must not be addressed by altering the base cloak placement.
