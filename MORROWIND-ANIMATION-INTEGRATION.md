# Morrowind character animation integration — v4 audit

Status: audit baseline and implementation criteria. This document does not claim that the runtime animation changes below are already implemented.

## Working branch and asset source

- Code changes belong on [`morrowind.v4`](https://github.com/principialnostb/daggerfall-js-source/tree/morrowind.v4).
- The canonical uploaded mod/resource collection is [`Morrowind Textures` on `morrowind.v3`](https://github.com/principialnostb/daggerfall-js-source/tree/morrowind.v3/Morrowind%20Textures).
- At the audit baseline, the `Morrowind Textures` tree in `morrowind.v4` has the same Git tree SHA as the directory in `morrowind.v3` (`79a532e1e39d79e18e97d55ecc05d5892a8afec7`). Do not re-copy or regenerate the asset tree without first verifying a real difference. Git reuses identical tree/blob objects; a branch link is useful for documentation, but is not itself a runtime asset loader.
- Keep new application code and tests in `morrowind.v4`. Treat `morrowind.v3` as a read-only source of uploaded assets and reference implementations.

## Animation resources identified

The existing asset tree includes these candidates:

- `Morrowind Textures/Simply Walking/Simply Walking Purist Edition/meshes/xbase_anim.kf` — the male/standard skeleton animation set candidate.
- `Morrowind Textures/Simply Walking/Simply Walking Purist Edition/meshes/xbase_anim_female.kf` — female animation set candidate bundled alongside the standard set.
- `Morrowind Textures/Simply Walking/Feminine Walk Cycle/Meshes/xbase_anim_female.kf` — a separate female-walk candidate.
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
6. **Keep camera intent separate from locomotion.** Ordinary standing and walk states should allow orbiting the camera without forcing the actor's body to turn. Run/combat states should retain the current mouse-driven turn behavior. The gate must use the actual movement/combat state, not merely whether the mouse moved.
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

This is a working **viewer-level diagnostic selector**, not yet a claim that the gameplay actor controller has been wired to the preference. The reviewed code paths do not establish a connected third-person gameplay animation loop or the requested mouse-turn state gate. Those gameplay changes must be integrated at the actual controller/renderer seam rather than faked in this viewer.


## Implementation update — independent third-person body facing (MW-D40)

The exterior and dungeon hosts now tell the player motor when body facing should follow the view. While standing or ordinary walking, the body yaw is latched and the camera can orbit without turning the body. First-person frames keep the latch synchronized so entering third person does not inherit a stale angle. Running, held attack input, or a non-idle exterior weapon animation resumes view-facing; climb-owned body yaw and seat/draw yaw still take precedence. This changes orientation only; it does not rewrite movement input or animation clips.

Regression coverage is in `test/player/bodyYawFacing.test.js`. In-game visual verification is still required for transitions between walking, running, attack, climbing, and mounted states.
