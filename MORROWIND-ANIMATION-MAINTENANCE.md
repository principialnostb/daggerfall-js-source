# Morrowind animation packs — maintainer map

Branch: `morrowind.v4`  
Last audited: 2026-10-19  
Primary integration note: [MORROWIND-ANIMATION-INTEGRATION.md](./MORROWIND-ANIMATION-INTEGRATION.md)

This document is the operational inventory: what is in the repository, what the browser runtime actually loads, what it deliberately does not load, and what remains unfinished. A file being present under `Morrowind Textures/` does **not** mean it is active.

## Runtime map

| Responsibility | Implementation | Current behavior |
|---|---|---|
| Discover bundled walk KF files | `src/formats/morrowind/mwWalkAnimationAssets.js` | Vite `import.meta.glob` includes Simply Walking and Axel's female files only. |
| Parse KF / bind tracks to the active skeleton | `src/combat/fpArm.js` + `src/formats/morrowind/mwAnim.js` | Replacement tracks are parsed against the current rig. A failed parse or incompatible source is skipped and the game/archive source remains available. |
| Restrict replacement to walk groups | `isWalkAnimationGroup`, `isWalkAnimationKey` in `mwWalkAnimationAssets.js`; source filtering in `fpArm.js` | Only groups beginning with `walk` and text-key records containing a walk-group line are copied into replacement sources. Idle, run, turn, sneak, combat, jump, and death groups are not imported from these walk packs. |
| Choose a clip while walking | `walkVariantForActor()` in `mwWalkAnimationAssets.js`, called from `src/combat/fpArm.js` | Player, male NPC, and female NPC settings are resolved independently. The preference is checked again on a walk-group change and can trigger a live re-pick. |
| UI / persisted mod setting | `src/ui/settings/settingsMap.js`, `src/systems/modSettings.js`, `src/systems/features.js` | Settings → Animations separates actor groups and responsibilities. Current implemented category: Игрок · Бег / ходьба, then NPC · Бег / ходьба. Each actor has its own source selector. |
| Animation cross-fade | gameplay pose layer described in `MORROWIND-ANIMATION-INTEGRATION.md`; regression tests include `test/formats/morrowind/mwposeblend.test.js` | Native JavaScript blending, not execution of the downloaded MWSE Lua plugin. It smooths pose changes; it does not supply new animation clips. |
| Camera/body facing | movement/body-facing host and `test/player/bodyYawFacing.test.js` | Separate concern from walk-source selection. Do not modify this while changing gait choices unless a regression proves the coupling. |

## Pack inventory and decisions

### Active walk candidates

1. **Simply Walking — Purist Edition**  
   Files:
   - `Morrowind Textures/Simply Walking/Simply Walking Purist Edition/meshes/xbase_anim.kf`
   - `Morrowind Textures/Simply Walking/Simply Walking Purist Edition/meshes/xbase_anim_female.kf`

   Role: current Standard source for male and female biped rigs. It is a walk-animation source in this port, not a wholesale replacement of the skeleton's entire animation library. The runtime filters out non-walk groups even if the KF contains them.

   Reference: [Nexus Mods #49785 — Simply Walking (Remastered)](https://www.nexusmods.com/morrowind/mods/49785). The asset directory identifies the selected variant as “Purist Edition”; do not silently swap in the weapon-sheathing or run-inclusive variants without a deliberate review.

2. **Simply Walking — Feminine Walk Cycle**  
   File: `Morrowind Textures/Simply Walking/Feminine Walk Cycle/Meshes/xbase_anim_female.kf`

   Role: alternate female walk source exposed as its own **Feminine Walk Cycle** option for the player. It is not the same as the Purist Edition female base file. It is intentionally kept as a separate player choice because the player selector lists each walk source by its actual pack name; the female-NPC selector does not expose this option.

3. **Axel's Sexy Walk Fixed**  
   File used by runtime: `Morrowind Textures/Axel's Sexy Walk Fixed/Animation/axel fixed/female/WalkForward;.kf`

   Role: alternate female `WalkForward` clip. The pack also contains `Idle4;.kf`, `Idle5;.kf`, and `RunForward;.kf`; those are intentionally **not** loaded by the walk loader. This is a deliberate isolation boundary, not an omission to “fix” by loading every file.

   Reference: the user has confirmed this walk is visibly connected and working in-game.

### Present but not integrated as gameplay animation sources

4. **Animation Blending**  
   The checked-in folder contains an MWSE Lua plugin under `Data Files/MWSE/mods/animationBlending/`. The browser port does not execute MWSE Lua. The relevant behavior is separately implemented in native JavaScript. Keep the original Lua files as reference/source material only; do not describe them as a running plugin.

5. **Morrowind Animation Overhaul**  
   Contains broad animation replacement assets (including walk/run/turn/sneak/combat families). It is **not** selected by the runtime loader. Do not add it to the public port just because files exist: the current integration notes record a permission restriction on reusing/converting its assets. It would also overlap multiple animation families, so it must not be combined casually with walk-only packs.

6. **OpenMW Dynamic Actors (Nexus #54782)**  
   Not implemented. It is not an animation source in the current browser runtime and must not be counted as an active feature.

## Non-walk packs and conflict rules

Walk-only source filtering is the key isolation boundary. In the current code, Simply Walking and Axel's files cannot replace idle/run/combat clips through the walk-source list. The following areas are separate and should remain separate unless code proves otherwise:

- **Animation Blending:** transition interpolation over the pose; not a clip provider.
- **Camera/body yaw and locomotion direction:** movement-facing policy; not a walk clip.
- **Weapon stance and attacks:** resolved through the original game/archive animation sources; the walk pack must not take ownership of those groups.
- **Idle, run, turn, sneak, jump, death, spells, combat:** no replacement should be inferred from a pack's folder name. Check the loader's explicit group filter and its call sites.

A broad KF can contain tracks for many bones and text keys for several groups. Never enable it wholesale as a walk replacement. Confirm group names, key timing, skeleton binding, loop markers, and root-motion behavior before integrating any additional group family.

## Animation settings home — taxonomy scaffold in v4

The Settings screen has a dedicated **Animations** tab (`src/ui/settings/settingsMap.js`), separate from `Mods & files`. The taxonomy is grouped by actor and responsibility: movement, posture/turn/sneak, combat/attacks/block, magic, actions/interactions, traversal, and damage/death reactions. NPC categories are separate from player categories. The walk source selectors are live; the remaining categories are explicitly marked **Пак пока не подключён** until a source is legally reusable, validated against the rig, and wired to a category-specific runtime resolver. Informational rows are not toggles and cannot change gameplay.

## Actor-specific selectors — implemented in v4

The Animations page exposes three independent persisted controls:

- **Игрок · Бег / ходьба** — Standard / Feminine Walk Cycle / Axel's Sexy Walk Fixed / Vanilla.
- **NPC · Бег / ходьба (men)** — Standard / Vanilla.
- **NPC · Бег / ходьба (women)** — Standard / Female (Axel) / Vanilla.

The setting keys live in `src/systems/modSettings.js`; the three controls are declared in `src/systems/features.js`. The old `FemaleWalk` key remains declared so its stored data is not silently redefined, but the gameplay resolver no longer reads it and no automatic migration has been added. After this change, choose the desired value in the player walk selector; new choices are read through the existing `modSetting` store.

Actor routing is centralized in `walkVariantForActor()` in `src/formats/morrowind/mwWalkAnimationAssets.js` and consumed by the movement resolver in `src/combat/fpArm.js`:

- local player and peer/player bodies (`playerAppearance` or `ownHeads`) use `PlayerWalkSource`;
- female NPC bodies use `NpcFemaleWalk`;
- male NPC bodies use `NpcMaleWalk`;
- `Vanilla` excludes bundled walk-only sources while leaving archive sources and all non-walk groups available.

The choices are mutually exclusive per actor and category, rather than independent pack toggles. That is intentional: two gait packs must not compete for the same group. Standard is Simply Walking Purist Edition; the player can additionally choose the Feminine Walk Cycle or Axel's clip, while female NPCs can choose Axel's clip. The Feminine Walk Cycle is not offered as an NPC option. **Vanilla** means keep the game's/archive walk source; it is a source choice, not a global animation-off switch.

Automated coverage for the pure actor/source mapping and the Vanilla filter is in `test/formats/morrowind/mwwalkassets.test.js`. This source-level wiring is implemented, but **in-game validation is still outstanding**: confirm that the NPC build path's `female` / `ownHeads` metadata is correct for every population, and visually check gait, foot sliding, and transitions. Do not call the feature fully verified until that check is performed. This environment has not run the repository's full test/lint/type/build commands.

## Validation checklist for every animation change

- [ ] Confirm the exact source file and its license/permission status.
- [ ] Confirm the KF binds to the target skeleton and exposes the requested group/key names.
- [ ] Confirm the loader admits only the intended groups.
- [ ] Confirm one deterministic source wins per actor and group.
- [ ] Confirm switching settings causes a real re-pick (not merely a changed label).
- [ ] Test male NPC, female NPC, and player separately.
- [ ] Test idle → walk → run → turn → combat → jump transitions.
- [ ] Test forward, backward, and strafing movement; check foot sliding and orientation.
- [ ] Run `npm test`, relevant Morrowind animation tests, lint, type checks, and build where a local checkout is available.
- [ ] Record in-game checks separately from automated test results.


## MW-TP-MESH-ALL — Morrowind third-person representation

The Morrowind actor pass now draws the posed skinned mesh at every camera distance and pitch for non-concealed actors. The prior distance/pitch LOD changed between a perspective mesh and a camera-facing sprite. That representation switch could make legs jump in depth near the threshold, distort the apparent body when viewing from below/above, and expose the finite sprite render-target resolution at distance. Mounted horse/rider pairs are drawn as two world meshes in the same frame (horse first, grounded rider second) instead of a single camera-facing sprite. Concealment remains on the sprite compositor because its dissolve/fade effect is implemented there; that path is effect-driven, not camera-distance-driven.

This intentionally trades some GPU work for stable perspective, leg placement, and non-pixelated Morrowind models. Validate crowded scenes and mounted NPCs in the browser before considering a separate performance LOD; any future LOD must preserve a stable representation across camera pitch and distance and must not collapse the horse/rider pair into a low-resolution card.


## User-facing pack and category policy (2026-10-19)

- **Vanilla is always the first option** in every animation source selector. A category's selection is exclusive within that category; changing walk source must not affect combat, idle, jump, magic, or interaction groups.
- **Simply Walking is one user-facing pack**, not two independent options. Its contents are assigned by inspecting actual files and their animation groups: the male walk source is `Simply Walking Purist Edition/meshes/xbase_anim.kf`; the female walk source is `Feminine Walk Cycle/Meshes/xbase_anim_female.kf`. The latter is an internal component of the Simply Walking choice. It should not be exposed as a separate top-level pack when it is serving the same role within the combined pack.
- **Axel's Sexy Walk Fixed** is a separate alternative for female walking. Only `WalkForward;.kf` is loaded; idle/run files are not silently enabled by selecting a walk pack.
- Before combining or presenting any future packs, inspect their README/permissions and enumerate their actual KF/NIF animation groups and text keys. Assign each source to the animation families it really contains (walk, run, idle, combat, actions, etc.), verify skeleton/group compatibility, then expose one mutually exclusive selector per family. Do not infer scope from the mod title or directory name alone, and do not show a selector as functional until its runtime consumer exists.
- **Settings UI rule:** animation families are switchable sub-pages inside Settings → Animations. The chosen sub-page alone displays its controls; they are not a single long list with headings. Player and NPC families are independent. Informational/Vanilla-only categories must not pretend an unintegrated pack is selectable.
