# Morrowind cloak clipping investigation

## Purpose and current status

This document records the investigation into the cloak clipping through the character's right leg during (1) a vertical two-handed sword strike, (2) normal walking, and (3) walking in combat stance. It is intended to preserve the reasoning and make later fixes reproducible.

**Current status: the geometry intersection is confirmed, but the root cause and the exact right-leg/animation-state relationship are not yet proven. No runtime animation, skinning, or collision formula has been changed as part of this diagnostic work.**

The current capture contains 361 frames and 1,444 mesh instances. The first-pass report compares cloak and captured leg/body meshes. The triangle report checked 340 eligible mesh pairs, recorded 48,780 triangle AABB candidates, and found 4,010 intersecting triangle-pair hits across 28 frame/mesh-pair rows. All 28 rows identify `daggerfall_cloak` and `war_misc_trsrs_02c` (the groin/trousers mesh).

Frames with high reported hit counts include frame 117 (448), 272 (388), 94 (334), 203 (332), and 317 (310). These are useful diagnostic samples, **not yet identified as the sword-strike or walking states**. The capture's `time` values jump/reset, so frame index is the reliable capture-order identifier until the time field's semantics are established.

The triangle report skipped 722 mesh entries for missing/empty triangle indices. Some rigid meshes may legitimately be unindexed, but the skipped entries mean the current report is not proof that every part of the leg, including the right boot, was checked.

## Investigation question

The visual bug report is specific: the cloak intersects the right leg during a vertical two-handed sword attack, with some clipping during normal walking and combat-stance walking. The aim is not merely to reduce a generic intersection count. The aim is to find and fix the responsible geometry/pose/update issue without damaging the other animation states.

## Diagnostic pipeline

### 1. Runtime capture

`tools/mwCloakAnimationProbe.mjs` opens the existing development server with the cloak probe enabled. The probe captures posed runtime geometry; it does not automatically enumerate animation clips or infer semantic labels such as "vertical attack". Record which action is being performed during each capture segment and capture screenshots/video where possible.

Capture instructions are in [README.txt](README.txt). Keep the cloak equipped throughout, and allow each action and its transitions to run for several seconds. Include idle as a baseline, normal walking, combat-stance walking, vertical two-handed attack (wind-up, active swing, recovery), starts/stops, and turns. A separate capture per state is acceptable and often easier to interpret than one long unlabeled capture.

### 2. First-pass screening

Run:

```sh
npm run mwcloak:analyze
```

This validates geometry/index data and reports AABB overlap, nearest-vertex distance, and large frame-to-frame vertex steps. These are screening signals only: AABBs can overlap without surfaces intersecting, and nearest vertices can be close without triangles crossing. A large frame-to-frame step can indicate a pose transition or a capture identity/time discontinuity, not necessarily a bug.

### 3. Triangle surface intersection test

Run:

```sh
npm run mwcloak:intersections
```

This tests indexed cloak/body triangle surfaces using a spatial broad phase, triangle AABB filtering, and a separating-axis test with coplanar in-plane axes. It is stronger evidence than AABB or vertex proximity alone. It still does not measure penetration depth, determine which mesh is inside the other, or reproduce the game's material/depth rendering. Results depend on valid triangle indices, coordinate consistency, and numerical tolerance.

### 4. Visual inspection of reported triangles

Generate a self-contained HTML viewer:

```sh
npm run mwcloak:visualize
```

By default, it uses the capture and report at `diagnostics/mw-cloak-probe/` and includes frames 117, 203, 272, and 317. Open `diagnostics/mw-cloak-probe/cloak-intersection-viewer.html` in a browser. The viewer draws three orthographic projections (XY, XZ, YZ), the cloak and body/trouser mesh outlines, and the example triangles reported as intersecting. Drag to pan and use the mouse wheel to zoom.

To choose other frames:

```sh
npm run mwcloak:visualize -- --frames 94,95,117,203,272,317
npm run mwcloak:visualize -- --frames all
npm run mwcloak:visualize -- path/to/mw-cloak-capture.json --report path/to/cloak-triangle-intersections.json --out path/to/viewer.html --frames 117,203
```

The report currently stores at most the first 100 example triangle pairs per frame/mesh pair, even when the total hit count is much larger. The viewer highlights those examples; it does not claim to draw every hit. Projected overlap in a 2D view alone is not proof of 3D intersection; the highlights come from the 3D triangle test. This viewer is a geometry diagnostic, not a replica of the game's camera, materials, normals, lighting, or depth buffer.

## Animation-source audit after visual review

The visual review confirms that the generated geometry view matches the user's reported clipping pattern. The two suspected states are walking (likely using a third-person animation-mod source) and the standard vertical two-handed sword attack. This is useful state-level evidence, but the capture still does not attach semantic animation names to each frame.

The runtime source code has a relevant selection path in `src/formats/morrowind/mwWalkAnimationAssets.js` and its consumer in `src/combat/fpArm.js`:

- When the `OpenMWDynamicAnimations` mod setting is enabled, `loadOpenMWDynamicThirdPersonAnimationAssets()` loads eligible KF files matching the active rig folder.
- `selectOpenMWDynamicAnimationVariants()` groups compatible candidates by canonical animation group. For `walkforward`, it explicitly prefers `WalkForward_base15;.kf`, then `WalkForward_mw15;.kf`, then `WalkForward_base13;.kf`, `WalkForward_base11;.kf`, and `WalkForward_dirn15;.kf` if earlier choices are unavailable.
- The files live under `Mods/Animations/OpenMW Dynamic Animations/animations/xbase_anim/` for the standard third-person rig. Their accompanying YAML files describe blending rules; the KF carries the actual animation tracks.
- This establishes the runtime's candidate/selection policy, **not which clip was active in the user's exact capture**. That requires the effective setting, rig path, and runtime animation-selection diagnostics for the same reproduction.
- The OpenMW dynamic third-person loader maps canonical locomotion groups (walk/run/sneak/swim variants), idle, arm poses, and a limited set of other groups. Its group mapper does not map an ordinary sword-attack group. The vertical attack is therefore expected to remain on the existing archive/game source unless another source path supplies it; verify this in runtime diagnostics rather than assuming it.

Useful source links:
- [Animation asset discovery and variant selection](../../src/formats/morrowind/mwWalkAnimationAssets.js)
- [Animation runtime consumer](../../src/combat/fpArm.js)
- [OpenMW Dynamic Animations walk-forward candidates](../../Mods/Animations/OpenMW%20Dynamic%20Animations/animations/xbase_anim/)

### Updated working hypotheses

1. **Walking:** a third-person OpenMW Dynamic Animations gait may be responsible for the modified leg/hip pose. Compare the selected walk KF against the baseline walk in the same rig and inspect the lower-body tracks and root/hip motion.
2. **Vertical attack:** likely a separate stock/archive attack clip, based on the current dynamic third-person group's mapper. Check the actual selected source and compare the cloak/leg relationship through wind-up, active swing, and recovery.
3. **Shared cause remains plausible:** both states could expose a common cloak skinning, bind-pose, or update-order issue. Do not assume that the walking mod is the root cause of the attack clipping.

The next data point should be the exact runtime-selected animation group/source and rig path for each repro state. Then create short, separately labeled captures for idle, ordinary walk, combat walk, and vertical attack. Keep the existing raw capture and reports as historical evidence; do not overwrite them without saving a copy.

## What the existing evidence does and does not say

### Established

- The captured cloak surface intersects the indexed `war_misc_trsrs_02c` groin/trousers surface in multiple frames.
- The largest reported groups are worth inspecting first.
- At least one pair of cloak/body surfaces has genuine triangle-surface intersections according to the current geometric test.

### Not established yet

- Which reported frame corresponds to vertical sword attack, normal walk, or combat-stance walk.
- Whether the user's visible right-leg clipping is exactly the same issue as the measured groin/trousers intersections.
- Whether the cause is mesh shape/origin, skin weights, bone transforms, update order, attachment transforms, or an interaction between them.
- Whether the boot/right-leg surfaces intersect. Mesh entries without valid triangle indices cannot be assessed by the current triangle test.
- Whether the number of intersecting triangle pairs maps directly to visual severity. One geometric area can generate many triangle-pair hits.

## Root-cause workflow

Follow this sequence before changing runtime behavior:

1. **Label reproducible states.** Capture each target action separately or record exact start/end frame ranges. Include a screenshot of the worst visible pose. Keep frame index as the canonical identifier; do not use the current `time` field as a monotonic clock.
2. **Confirm the right-leg mesh inventory.** Review the captured `legs` slots for the right thigh/shin/boot and identify which have positions and usable triangle indices. Investigate why indices are absent before interpreting a missing intersection as a clean result.
3. **Inspect geometry in the viewer.** Compare attack and walking states with idle/reference poses. Check whether the cloak is displaced as a whole, only its lower/right edge is wrong, or the body mesh changes unexpectedly.
4. **Trace the asset and transform path.** Identify the cloak asset, its skeleton/bone bindings and weights, the right-leg bones, and any attachment/root transforms. Compare the same frame's cloak and body coordinate spaces; ensure both sets of positions are in the same world/model space before treating a hit as meaningful.
5. **Check update order.** Verify whether the cloak is skinned after the relevant bones have reached the final pose for the frame, and whether the body and cloak use consistent animation time and transforms. Do not assume update order is wrong merely because clipping exists.
6. **Form one falsifiable hypothesis at a time.** Examples: incorrect cloak weights around a specific bone; a mesh/attachment transform mismatch; a pose update one frame behind; or source geometry that physically intersects in the intended pose. Record the expected observation before editing.
7. **Make the smallest targeted fix.** Prefer a fix that addresses the demonstrated cause. Avoid arbitrary global offsets or changing collision/animation formulas without evidence; those often trade one pose's clipping for another.
8. **Re-capture and compare.** Repeat the same states and camera/equipment setup. Run both analyses and inspect before/after geometry. Confirm improvement in the attack, normal walk, and combat walk, and regression-test idle, turns, starts/stops, and recovery.
9. **Document the final change.** Record the cause, the code/assets changed, why the fix addresses the cause, commands used, and before/after evidence. If no cause is proven, mark the investigation as unresolved rather than presenting a speculative fix as confirmed.

## Reproducibility and report hygiene

- Keep the raw `mw-cloak-capture.json` associated with the reports generated from it. If the capture changes, regenerate both reports and the viewer.
- Do not compare frame numbers across different captures as if they refer to the same animation pose.
- Do not infer world units from the screening threshold; the coordinate scale has not been established.
- Treat the JSON reports as measurements from a particular capture, not permanent truths about every animation.
- Preserve a copy of the original reports before running a new capture if you need a historical comparison.
- Avoid uploading unrelated save files or personal data.

## Files in this diagnostic workflow

- `tools/mwCloakAnimationProbe.mjs`: opens the runtime probe in the running dev server/browser.
- `diagnostics/mw-cloak-probe/diagnose_cloak_capture.py`: geometry/index validation and first-pass proximity screening.
- `diagnostics/mw-cloak-probe/diagnose_cloak_triangle_intersections.py`: indexed triangle-surface intersection test.
- `diagnostics/mw-cloak-probe/visualize_cloak_intersections.py`: generates the standalone three-projection viewer.
- `diagnostics/mw-cloak-probe/cloak-diagnostic-report.json/.html`: first-pass screening output.
- `diagnostics/mw-cloak-probe/cloak-triangle-intersections.json/.html`: triangle-test output.
- `diagnostics/mw-cloak-probe/cloak-intersection-viewer.html`: generated visualization.
- `diagnostics/mw-cloak-probe/mw-cloak-capture.json`: raw runtime capture; regenerate reports/viewer whenever this changes.

## Visual confirmation from the reporter

The reporter inspected the generated `cloak-intersection-viewer.html` and confirmed that the displayed geometry matches the originally reported cloak-through-right-leg problem. This validates that the capture/viewer is useful for investigating the visible symptom, but it does not by itself identify which animation state each numbered frame represents or prove the implementation-level root cause.

This distinction matters because the measured triangle report currently names the cloak and the groin/trousers mesh. The next pass must trace the right thigh/calf/boot geometry and identify the exact attack/walk/combat-walk frames before changing the fit algorithm. Existing pose-envelope fitting in `src/formats/morrowind/mwCloakFit.js` is a static bind-time fit; do not assume that its presence guarantees clearance in every live pose. Compare the captured posed geometry against the fit inputs and verify whether the live cloak/body transforms agree.
