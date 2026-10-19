# Morrowind character animation integration — v4 audit

Status: runtime gait selection, input-driven third-person facing, and native pose cross-fades are implemented on this branch. In-game visual validation remains outstanding; no claim is made that combat clips themselves have been replaced. The facing gate was hardened again in commit b63dfffc: it reads this render frame's movement axes and explicitly supplies view yaw during ordinary locomotion, while preserving seat/climb ownership.

> **Maintenance inventory:** see [MORROWIND-ANIMATION-MAINTENANCE.md](./MORROWIND-ANIMATION-MAINTENANCE.md) for the pack-by-pack inventory, current runtime boundaries, unresolved player/NPC selector requirements, and validation checklist. The inventory explicitly distinguishes assets present in the repository from assets actually consumed by the runtime.

## Working branch and asset source

- Code changes belong on [`morrowind.v4`](https://github.com/principialnostb/daggerfall-js-source/tree/morrowind.v4).
- The canonical uploaded mod/resource collection is [`Morrowind Textures` on `morrowind.v3`](https://github.com/principialnostb/daggerfall-js-source/tree/morrowind.v3/Morrowind%20Textures).
- At the audit baseline, the `Morrowind Textures` tree in `morrowind.v4` has the same Git tree SHA as the directory in `morrowind.v3` (`79a532e1e39d79e18e97d55ecc05d5892a8afec7`). Do not re-copy or regenerate the asset tree without first verifying a real difference. Git reuses identical tree/blob objects; a branch link is useful for documentation, but is not itself a runtime asset loader.
- Keep new application code and tests in `morrowind.v4`. Treat `morrowind.v3` as a read-only source of uploaded assets and reference implementations.

## Animation resources identified

The existing asset tree includes these candidates:

- `Morrowind Textures/Simply Walking/Simply Walking Purist Edition/meshes/xbase_anim.kf` — the male/standard skeleton animation set candidate.
- `Morrowind Textures/Simply Walking/Simply Walking Purist Edition/meshes/xbase_anim_female.kf` — female animation set candidate bundled alongside the standard set.
- `Morrowind Textures/Simply Walking/Feminine Walk Cycle/Meshes/xbase_anim_female.kf` — the internal female-walk component of the user-facing Simply Walking pack.
- `Morrowind Textures/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf` and `Xbase_anim_female.kf` — a broader animation overhaul candidate; do not select it as the default blindly because it can replace more than the walking cycle.
- `Morrowind Textures/Axel's Sexy Walk Fixed/Animation/axel fixed/female/WalkForward;.kf` — a narrow female walk clip candidate, with idle/run clips also present.

Reference mod pages:
- [Simply Walking (Remastered), Nexus Mods #49785](https://www.nexusmods.com/morrowind/mods/49785)
- [Female animation / walk reference, Nexus Mods #43129](https://www.nexusmods.com/morrowind/mods/43129)

The files above are source candidates, not proof of runtime compatibility. A NIF/KF can contain multiple animation groups and bone tracks; selecting a file based on its name alone is insufficient. Before enabling one, verify its skeleton/bone-name compatibility, text-key group names, loop markers, root motion, and whether it replaces only walking or also idle/run/combat groups.

## Selection principles

1. **Narrow scope first.** Prefer a walk-only female clip/set over a broad animation overhaul when the requested change is female walking. This reduces the chance of unintentionally changing idle, run, attack, or male animation.
2. **Preserve the standard baseline.** Standard remains the default and male characters must always resolve to the standard animation path, regardless of the female preference.
3. **Gender-gate at the animation resolver.** Apply the female choice only when the actor is explicitly identified as female. Do not alter the body mesh, skin, body proportions, clothing bindings, or shared skeleton geometry as a side effect.
4. **Do not mix incompatible tracks.** A replacement `.kf` must target the same bone-name namespace and compatible skeleton as the loaded model. Prefer a complete compatible female walk set where individual clip substitution would leave mismatched transitions.
5. **Keep transitions and timing correct.** Respect animation text keys (Start/Stop/Loop Start/Loop Stop), existing clip timing, and root-motion handling. Avoid hardcoded modulo loops that replay an intro or ignore a clip's authored loop window.
6. **Keep camera intent separate from locomotion.** While idle, mouse-look orbits the camera without turning the body. Any movement input—including backward movement—makes the body face the current aim/view while locomotion remains camera-relative, so holding S can walk backward while the camera sees the face. Run/combat also follow the aim. The gate must use the actual still/moving state, not merely whether the mouse moved.
7. **Persist only the preference.** Store the female-walk selection through the project's existing settings seam; do not create a parallel persistence mechanism. Apply changes live only if the animation system can safely rebind the active clip; otherwise explicitly mark the option as restart-required rather than pretending it hot-swaps.
8. **No false-positive controls.** A setting must have a real consumer and tests. Do not expose a UI toggle until it changes the selected female walk clip in the runtime.

## Existing code paths found during the audit

- `src/formats/morrowind/mwAnim.js`: reads text-key animation groups and per-bone tracks from inline NIF animation or external `.kf` files, samples tracks, and exposes `findAnimGroup`.
- `src/formats/morrowind/mwSkin.js` and `src/formats/morrowind/mwCharacter.js`: skeleton posing/skinning and character part assembly.
- `src/tools/mwViewer.js` / `mw-viewer.html`: currently a file-driven diagnostic mesh viewer. Its animation selector plays groups from the loaded NIF/KF; it is not, by itself, proof that a game-wide player/NPC setting has been wired.
- `src/systems/settings/settings.js`: the project's persisted settings store and live/stored/unavailable tier registry. New controls should follow its contract rather than adding an unrelated localStorage key.
- `src/player/mwCamera.js`, `src/player/motor.js`, and `src/player/moveAxes.js`: likely camera/movement investigation points. The exact turn gate must be traced through the live call sites before editing.

## Required verification before calling the feature complete

- Unit tests for default Standard selection, female-only override, male unaffected, and unknown/missing gender falling back safely.
- Tests for clip/group availability, case-insensitive group resolution, loop boundaries, and missing/invalid replacement assets.
- Regression checks for standing camera orbit, ordinary walking camera orbit, run turning, combat turning, and existing camera/Better Bodies behavior.
- Run the relevant tests, lint/type checks, and build. A passing unit suite cannot substitute for in-game visual verification of gait, foot sliding, clipping, and transitions.
- Record any test that could not be run (for example, no local game assets/runtime) instead of claiming it passed.


## Implementation update — viewer animation source selector

The Morrowind Mesh Viewer now has a persisted `female walk: Standard/Female` selector. When both standard and female `.kf` files are loaded into the viewer, filenames containing `female` are registered as the female source; other `.kf` files are the standard source. Selection is made per animation group:

- Female actor + Female preference + a group name containing `walk`: use the female source only if it contains that group.
- Otherwise use the standard source (male actors, idle, run, combat, and missing female groups).
- The setting does not modify meshes, textures, body proportions, or skeleton geometry.

This paragraph records the initial diagnostic-only stage. It is superseded by the MW-ANIM-1 gameplay integration below, which connects the setting to the third-person movement resolver.


## Implementation update — independent third-person body facing (MW-D40)

The exterior and dungeon hosts tell the player motor when body facing should follow the view. While idle in third person, body yaw stays latched so the camera can orbit around the character. Any movement input (W/A/S/D), running, or combat input resumes view-facing; because movement direction is still camera-relative, S can move backward while the model faces the aim. The movement motor must update standing as standing still rather than merely grounded; otherwise the host's view-facing gate never opens during ordinary walking. First-person frames keep the latch synchronized so entering third person does not inherit a stale angle. Climb-owned body yaw and seat/draw yaw still take precedence.

Regression coverage is in `test/player/bodyYawFacing.test.js`. In-game visual verification is still required for transitions between walking, running, attack, climbing, and mounted states.


## Runtime implementation — MW-ANIM-BLEND

A native JavaScript cross-fade now blends the third-person skeleton's previous raw local pose into the next sampled pose over 160 ms. It uses quaternion spherical interpolation for rotations and linear interpolation for translations/scales; the blend is applied before body morphs, neck/climb adjustments, skinning and attachments. It runs at the gameplay pose layer, not by executing the downloaded MWSE Lua script. This is the port-side implementation of Animation Blending's core visual behavior, so it can smooth transitions for existing walk, idle, run, jump and attack clips even when their source animation has not been replaced.

The facing gate is also input-driven in both exterior and dungeon hosts: W/A/S/D input makes the body follow the current aim, including S moving backward while the model faces the camera. With no movement input and no run/combat action, the body yaw remains latched while the camera orbits. The stale/derived `standing` flag is deliberately not used as the only movement signal.

**Important scope distinction:** blending does not create new attack keyframes. The current runtime loader still restricts Simply Walking and Feminine Walk Cycle to walk groups, so attack clips remain the original game clips. Morrowind Animation Overhaul (Nexus #60253) includes broader combat replacements, but its published permissions explicitly prohibit conversion to other games and asset reuse without permission; it is therefore not wired into this public port branch. A permission-cleared source or an author-approved conversion is needed before its attack clips can be integrated.

## Runtime implementation — MW-ANIM-1

The **Female Walk Style** choice is exposed through the Features/Mods choice control, with **Standard**, **Female**, and **Female 2** options. The gameplay consumer is `src/combat/fpArm.js`: it loads the bundled walk-only sources when the player rig is built, filters them at the movement resolver using the saved numeric choice (0/1/2), and re-picks a walk clip when that preference changes. The Morrowind Mesh Viewer remains a separate diagnostic consumer.

The loader parses the selected walk sources with the existing NIF/KF parser and adds only text keys/groups whose group name starts with `walk`. Text-key records can contain multiple newline-separated entries; the filter must retain a record when ANY line names a walk group (for example, a preceding `SoundGen: Left` line must not hide `WalkForward: Start`). That restriction is intentional: these packs cannot replace idle, running, weapon stances, attacks, jump, or death animations by accident. Missing files, failed HTTP loads, or packs without usable walk groups fall back to the game's existing sources. The choice does not change meshes, skeletons, Better Bodies, clothing, or camera/body-facing logic.

The `selectActorAnimSource` helper is a separate viewer selector; gameplay uses the source list and movement resolver in `fpArm.js`. Axel's pack contains idle and run files as well as `WalkForward;.kf`; Female 2 intentionally loads only that walk clip, and does not opt into Axel's idle/run clips.

Verification note: code and tests still require a local build and in-game visual check for gait, foot sliding, transitions, and archive/network failure behavior. A source filter bug was found during follow-up review: the first implementation examined only the text before the first colon in a key record, so records with a leading SoundGen line could lose their WalkForward marker and silently fall back to vanilla. The loader now checks every line in each text-key record. No visual gameplay claim is made by this commit.


### Live gait switching correction

The asset loader loads the standard source and both female-only walk candidates for a female rig. The movement resolver maps saved choice 0/1/2 to Standard/Female/Female 2 and filters replacement sources at walk-group selection, so idle/run/combat remain on the existing source priority.


## Current integration boundary (2026-10-19)

- The visible **Female Walk Style** selector offers **Standard**, **Female**, and **Female 2** in the Features/Mods interface.
- The gameplay rig loader resolves Standard/Female files from `Morrowind Textures/Simply Walking` and Axel's `WalkForward;.kf` from `Morrowind Textures/Axel's Sexy Walk Fixed/Animation/axel fixed/female`. It does not load Axel's idle/run files into the runtime walk source list.
- The `53779` Animation Blending download is an MWSE Lua plugin, not a browser JavaScript module. The port uses its own native pose cross-fade implementation; it does not execute the Lua script. That implementation still requires in-game verification.
- Nexus `60253` Morrowind Animation Overhaul explicitly disallows conversion to other games and asset use without permission. Its attack/combat KF files are therefore **not wired into this public port** without author permission. The currently integrated Simply Walking/Feminine Walk Cycle resources are walk-only; attacks remain the original game's clips.


### Body-facing regression follow-up (2026-10-19)

The v3 baseline passed the camera yaw directly into the third-person body renderer; MW-D40 introduced an idle-facing latch so the camera can orbit without turning a stationary actor. The latch must not preserve climb-release state after ordinary movement resumes. A stale `_bodyYaw` or `_bodyYawOff` could otherwise be returned again when movement ended, making the model appear locked to an old direction even though the camera and movement input had changed.

The 3D host must explicitly reproduce the global sprite lane's control rule: while movement, first-person look, running, or combat is active, pass the current view/aim yaw into the 3D body; while standing in third person, retain the last body yaw as the camera orbits. The sprite lane's billboard plane remains camera-facing, while the 3D Morrowind rig needs its own yaw value. To avoid a render/fixed-step timing gap, the host now considers both current-frame input axes and the motor's latest movement input when deciding whether the actor is moving. This code-level fix is covered by unit tests but still requires in-game verification.

Regression tests cover stale body yaw and climb-release offset cleanup, including the transition back to idle. These are source-level tests; a browser build and in-game check are still required to confirm the reported frozen-facing issue is gone in both exterior and dungeon scenes.


## Facing regression rollback — 2026-10-19

The v4 idle body-yaw latch was rolled back after the reported runtime symptom remained unchanged: the 3D model ignored view rotation even in first person and locomotion ran sideways/backwards. The previous latch changed the render-facing contract without proving that the separate camera/movement/rig paths were synchronized in every scene. Exterior and dungeon now use the v3 contract again: absent a climb/seat override, the rendered 3D body yaw follows `cam.yaw`. This deliberately restores the known original cursor/view-facing behavior rather than retaining a speculative idle-orbit feature. The `Female Walk Style` selector remains independent; it does not own or modify body yaw. The source-level regression test now checks the v3-facing contract. In-game confirmation is still required.

## Actor-specific walk controls update — 2026-10-19

The **Settings → Animations** page uses shared animation-family sub-pages, not actor-first navigation. The top-level families are **Ходьба / бег**, **Повороты / стойка / скрытность**, **Бой / атаки / блок**, **Магия / заклинания**, **Действия / взаимодействие**, **Прыжки / плавание / падения**, and **Получение урона / падение / смерть**. Inside each selected family, player controls are listed first, then NPC controls. Walking and running remain one locomotion family; the active walk packs only replace walk groups, so run stays vanilla until a separate compatible run source is wired. Walk sources persist independently through the existing mod-settings store, with **Vanilla first**:

- Player: Vanilla / Simply Walking / Axel's Sexy Walk Fixed.
- Male NPCs: Vanilla / Simply Walking.
- Female NPCs: Vanilla / Simply Walking / Axel's Sexy Walk Fixed.

**Simply Walking** is the one player-facing pack choice. Its male source is the Purist Edition KF; its female source is the internal Feminine Walk Cycle KF. The female component is not exposed as a separate pack. `Vanilla` preserves the game's/archive walk source. The previous `FemaleWalk` key is retained for compatibility, but the runtime reads `PlayerWalkSource`, `NpcMaleWalk`, and `NpcFemaleWalk`. Actor routing is implemented in `walkVariantForActor()` in `src/formats/morrowind/mwWalkAnimationAssets.js`; the shared rig's movement resolver supplies build identity and filters the sources accordingly. `Vanilla` excludes bundled walk-only sources while preserving archive animation groups. Remote player bodies follow the player selector; NPC bodies use the sex-specific NPC selector.

The actor mapping and Vanilla filter have regression assertions in `test/formats/morrowind/mwwalkassets.test.js`. This is code-level validation only: this environment did not run the complete test/lint/type/build pipeline or an in-game visual pass. In-game verification remains necessary for correct actor classification, foot sliding, clipping, and transitions.


## Animation settings navigation (ANIM-UI1, 2026-10-19)

Animation controls have a dedicated **Settings → Animations** tab. The first-level switchers are shared animation families; each selected family shows **Игрок** controls first and **NPC** controls second. Walking and running are grouped together as locomotion rather than split into separate categories. Only source choices backed by a runtime consumer are selectable; other families show Vanilla-only status until compatible sources are integrated.


## Animation settings taxonomy (2026-10-19)

The **Settings → Animations** tab groups controls by shared family: walk/run, turn/stance/sneak, combat/attacks/block, magic, actions/interactions, traversal (jump/swim/fall), and hit/death reactions. Within each family, player settings precede NPC settings. Only walk-source selectors are currently functional. Other sections explicitly state that no compatible source pack is integrated yet; they are not pretend controls.

Pack-to-category audit:
- **Simply Walking Purist Edition**: runtime intentionally imports only walk groups; assigned to walk/movement.
- **Simply Walking**: one user-facing pack; male characters use Purist Edition and female characters use the internal Feminine Walk Cycle source.
- **Axel's Sexy Walk Fixed**: runtime imports only `WalkForward;.kf`; its `Idle4`, `Idle5`, and `RunForward` files are present in the pack but deliberately not active.
- **Morrowind Animation Overhaul**: files include broader movement and combat groups, but are not wired into gameplay. The repository audit records a restriction on reusing/converting these assets without permission.
- **OpenMW Dynamic Actors (#54782)**: candidate reference, not a runtime animation provider in this port.
- **Animation Blending (#53779)**: MWSE Lua plugin is not executable in this browser runtime; pose blending is a separate native JS feature, not a clip category.

The UI taxonomy must remain visible even when a category has no active source. Add controls only when they have a real resolver and conflict policy; never represent an informational placeholder as a working selector.


## User-facing pack and category policy (2026-10-19)

- **Vanilla is always the first option** in every animation source selector. A category's selection is exclusive within that category; changing walk source must not affect combat, idle, jump, magic, or interaction groups.
- **Simply Walking is one user-facing pack**, not two independent options. Its contents are assigned by inspecting actual files and their animation groups: the male walk source is `Simply Walking Purist Edition/meshes/xbase_anim.kf`; the female walk source is `Feminine Walk Cycle/Meshes/xbase_anim_female.kf`. The latter is an internal component of the Simply Walking choice. It should not be exposed as a separate top-level pack when it is serving the same role within the combined pack.
- **Axel's Sexy Walk Fixed** is a separate alternative for female walking. Only `WalkForward;.kf` is loaded; idle/run files are not silently enabled by selecting a walk pack.
- Before combining or presenting any future packs, inspect their README/permissions and enumerate their actual KF/NIF animation groups and text keys. Assign each source to the animation families it really contains (walk, run, idle, combat, actions, etc.), verify skeleton/group compatibility, then expose one mutually exclusive selector per family. Do not infer scope from the mod title or directory name alone, and do not show a selector as functional until its runtime consumer exists.
- **Settings UI rule:** animation families are switchable sub-pages inside Settings → Animations. The chosen sub-page alone displays its controls; they are not a single long list with headings. Player and NPC families are independent. Informational/Vanilla-only categories must not pretend an unintegrated pack is selectable.
