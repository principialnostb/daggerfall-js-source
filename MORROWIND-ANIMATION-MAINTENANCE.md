# Morrowind animation packs — maintainer map

Branch: `Dev`  
Last audited: 2026-10-19  
Primary integration note: [MORROWIND-ANIMATION-INTEGRATION.md](./MORROWIND-ANIMATION-INTEGRATION.md)

This document is the operational inventory: what is in the repository, what the browser runtime actually loads, what it deliberately does not load, and what remains unfinished. A file being present under `Morrowind Textures/` does **not** mean it is active.

## Runtime map

| Responsibility | Implementation | Current behavior |
|---|---|---|
| Discover bundled walk KF files | `src/formats/morrowind/mwWalkAnimationAssets.js` | Vite `import.meta.glob` includes Simply Walking and Axel's female files only. |
| Discover first-person animation packs | `loadFirstPersonAnimationAssets()` in `mwWalkAnimationAssets.js`, consumed by the actual first-person build in `fpArm.js` | ReAnimation v3 is loaded as the stance/weapon source; the third selector option adds OpenMW directional walk/run/sneak groups above it. |
| Discover OpenMW third-person/creature variants | `loadOpenMWDynamicThirdPersonAnimationAssets()` + `selectOpenMWDynamicAnimationVariants()` | Rig-folder matching, canonical group remapping, deterministic per-actor variant choice; user walk/run selectors keep priority. |
| Adapt hit/death reaction groups | `hitReactionTargetGroup()` and `remapAnimationGroupKeys()` in `mwWalkAnimationAssets.js`, consumed by `fpArm.js` | `HitReact`/`Stagger*` become `hit1..hitN`; `Death*` becomes `death1..deathN`; sources with no bound tracks are rejected. |
| Parse KF / bind tracks to the active skeleton | `src/combat/fpArm.js` + `src/formats/morrowind/mwAnim.js` | Replacement tracks are parsed against the current rig. A failed parse or incompatible source is skipped and the game/archive source remains available. |
| Restrict replacement to walk groups | `isWalkAnimationGroup`, `isWalkAnimationKey` in `mwWalkAnimationAssets.js`; source filtering in `fpArm.js` | Only groups beginning with `walk` and text-key records containing a walk-group line are copied into replacement sources. Idle, run, turn, sneak, combat, jump, and death groups are not imported from these walk packs. |
| Choose a clip while walking | `walkVariantForActor()` in `mwWalkAnimationAssets.js`, called from `src/combat/fpArm.js` | Player, male NPC, and female NPC settings are resolved independently. The preference is checked again on a walk-group change and can trigger a live re-pick. |
| UI / persisted mod setting | `src/ui/settings/settingsMap.js`, `src/systems/modSettings.js`, `src/systems/features.js` | Settings → Анимации separates broad families, then nested Ходьба / Бег selectors, then Игрок / NPC controls. Walking and running have independent selectors for the player; female NPCs also have an independent Axel run choice. Male NPC running remains Vanilla. |
| Animation cross-fade | gameplay pose layer described in `MORROWIND-ANIMATION-INTEGRATION.md`; regression tests include `test/formats/morrowind/mwposeblend.test.js` | Native JavaScript blending, not execution of the downloaded MWSE Lua plugin. It smooths pose changes; it does not supply new animation clips. |
| Camera/body facing | movement/body-facing host and `test/player/bodyYawFacing.test.js` | Separate concern from walk-source selection. Do not modify this while changing gait choices unless a regression proves the coupling. |

## Pack inventory and decisions

### Active walk candidates

1. **Simply Walking — Purist Edition**  
   Files:
   - `Mods/Animations/Simply Walking/Simply Walking Purist Edition/meshes/xbase_anim.kf`
   - `Mods/Animations/Simply Walking/Simply Walking Purist Edition/meshes/xbase_anim_female.kf`

   Role: the male walking source inside the user-facing Simply Walking pack. The bundled female KF is not selected as the public female walk variant; the runtime uses Feminine Walk Cycle for women. This remains a walk-only source, not a wholesale replacement of the skeleton's animation library.

   Reference: [Nexus Mods #49785 — Simply Walking (Remastered)](https://www.nexusmods.com/morrowind/mods/49785). The asset directory identifies the selected variant as “Purist Edition”; do not silently swap in the weapon-sheathing or run-inclusive variants without a deliberate review.

2. **Simply Walking — Feminine Walk Cycle**  
   File: `Mods/Animations/Simply Walking/Feminine Walk Cycle/Meshes/xbase_anim_female.kf`

   Role: the internal female-walk component of the single user-facing **Simply Walking** pack. It is not shown as a separate pack choice. The player and female-NPC selectors both resolve to this source when **Simply Walking** is selected.

3. **Axel's Sexy Walk Fixed**  
   File used by runtime: `Mods/Animations/Axel's Sexy Walk Fixed/Animation/axel fixed/female/WalkForward;.kf`

   Role: alternate female locomotion. `WalkForward;.kf` is filtered to walk groups and `RunForward;.kf` to run groups, controlled by the independent run selector. `Idle4;.kf` and `Idle5;.kf` remain unconnected until the gameplay idle resolver is audited for whether it requests those optional groups.

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

## First-person, OpenMW Dynamic Animations, and hit-reaction providers

These providers are connected to the gameplay source lists in `src/combat/fpArm.js`; they are not merely present in the asset tree.

- **First-person source selector:** Vanilla / ReAnimation v3 / OpenMW Dynamic Animations / ReAnimation v3 + OpenMW Dynamic Animations. ReAnimation clips are loaded on the actual first-person build after archive sources and their group prefixes are normalized. The combined option adds directional walk/run/sneak clips as a higher-priority overlay for those movement groups.
- **OpenMW Dynamic Animations (third person):** a separate Settings control enables rig-matched KF sources for standard male, female, beast, race-specific and supported creature folders. The adapter maps authored variant names (for example, `walkforward_base15`) to the canonical group requested by the JavaScript animation state machine. A deterministic per-actor hash selects variants; the default `base15` forward gait is preferred where present. Explicit walk/run selectors are appended later and retain priority for their own groups.
- **Hit Reactions Animated v2:** the loader first selects the active skeleton family. The runtime remaps `HitReact` and `Stagger*` clips into `hit1..hitN`, and `Death*` clips into `death1..deathN`, which are the groups the current combat state machine requests. Its YAML transition rules are translated into JavaScript: hit entry sine-out/0.1 s, stagger/death entry sine-out/0.08 s, generic HitReact exit sine-out/0.25 s, and stagger recovery cubic-out/0.5 s. Clip sources with parse errors, no usable text keys, or no tracks bound to the active rig are rejected and archive sources remain available.

The original OpenMW Lua controllers and YAML files are reference inputs, not executable plugins in the browser. Their clip-source behavior is ported into JavaScript; this does not mean OpenMW's entire original NPC-by-NPC profile database or every transition rule is executed byte-for-byte. In-game visual validation is required to verify foot timing, root motion, attack sections, death poses, and skeleton-specific track coverage.

Regression coverage is in `test/formats/morrowind/mwwalkassets.test.js`, `test/systems/org2_options.test.js`, and `test/systems/features.test.js`. Full `npm test` and build have not been run in this environment.

## Animation settings home — taxonomy scaffold in v4

The Settings screen has a dedicated **Animations** tab (`src/ui/settings/settingsMap.js`), separate from `Mods & files`. The top-level switchers are shared animation families, not actor-specific lists: **Ходьба / бег**, **Повороты / стойка / скрытность**, **Бой / атаки / блок**, **Магия / заклинания**, **Действия / взаимодействие**, **Прыжки / плавание / падения**, and **Получение урона / падение / смерть**. Inside **Передвижение**, **Ходьба** and **Бег** are separate nested selectors. Each opens actor-specific controls for **Игрок** and **NPC**. Simply Walking changes only walk groups; Axel's `WalkForward;.kf` and `RunForward;.kf` are wired to separate persisted settings. The female NPC run selector is independent; male NPC running remains Vanilla because no compatible male run replacement is bundled. Families without an integrated source show a disabled Vanilla-only choice rather than a fake selector.

## Actor-specific selectors — implemented in v4

The Animations page exposes three independent persisted controls, with **Vanilla first**:

- **Игрок · Ходьба** — Vanilla / Simply Walking / Axel's Sexy Walk Fixed.
- **NPC · Ходьба (men)** — Vanilla / Simply Walking.
- **NPC · Ходьба (women)** — Vanilla / Simply Walking / Axel's Sexy Walk Fixed.

The setting keys live in `src/systems/modSettings.js`; the three controls are declared in `src/systems/features.js`. The old `FemaleWalk` key remains declared for compatibility, but the gameplay resolver no longer reads it. The option-order migration translates saved values from the former selectors once, preserving existing Standard/Vanilla/Axel choices.

Actor routing is centralized in `walkVariantForActor()` in `src/formats/morrowind/mwWalkAnimationAssets.js` and consumed by the movement resolver in `src/combat/fpArm.js`:

- local player and peer/player bodies (`playerAppearance` or `ownHeads`) use `PlayerWalkSource`;
- female NPC bodies use `NpcFemaleWalk`;
- male NPC bodies use `NpcMaleWalk`;
- `Vanilla` excludes bundled walk-only sources while leaving archive sources and all non-walk groups available.

The choices are mutually exclusive per actor and category, rather than independent pack toggles. That is intentional: two gait packs must not compete for the same group. Simply Walking resolves by actor sex: Purist Edition for male characters; for female characters, the dedicated Feminine Walk Cycle source has priority, with the Purist female KF available as a fallback if it cannot provide a usable group. Axel's Sexy Walk Fixed is a separate female-only alternative. All three actor-specific settings now declare Vanilla as their default; existing saved selections are intentionally preserved. The same internal pack structure is used consistently for player and female NPCs. **Vanilla** means keep the game's/archive walk source; it is a source choice, not a global animation-off switch.

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
- **Simply Walking is one user-facing pack**, not two independent options. Its male source is `Simply Walking Purist Edition/meshes/xbase_anim.kf`. Female source candidates are `Simply Walking Purist Edition/meshes/xbase_anim_female.kf` and `Feminine Walk Cycle/Meshes/xbase_anim_female.kf`; both are inspected by the same runtime KF parser and filtered to walk groups only. The dedicated Feminine Walk Cycle is tried last (therefore wins when it has a valid requested group), while the Purist female KF is retained as a fallback. The player never needs to know that the combined pack contains these internal sources.
- **Axel's Sexy Walk Fixed** is a separate alternative for female locomotion. `WalkForward;.kf` is admitted only for walk groups and `RunForward;.kf` only for run groups. Each has its own independent setting, so changing walking does not change running and vice versa; neither source can override idle, turn, combat, jump, or spell groups. The bundled `Idle4;.kf` and `Idle5;.kf` are still not wired because the gameplay idle resolver must be checked for whether it requests those exact optional groups before a selector can honestly claim to control them.
- Before combining or presenting any future packs, inspect their README/permissions and enumerate their actual KF/NIF animation groups and text keys. Assign each source to the animation families it really contains (walk, run, idle, combat, actions, etc.), verify skeleton/group compatibility, then expose one mutually exclusive selector per family. Do not infer scope from the mod title or directory name alone, and do not show a selector as functional until its runtime consumer exists.
- **Settings UI rule:** animation families are switchable sub-pages inside Settings → Animations. The chosen sub-page alone displays its controls; they are not a single long list with headings. Player and NPC families are independent. Informational/Vanilla-only categories must not pretend an unintegrated pack is selectable.


## UI taxonomy rule (ANIM-UI5)

- Do not split **walking** and **running** into separate top-level settings families when the pack/runtime group model treats them as locomotion together. The shared family is **Ходьба / бег**.
- Family buttons are the first level. Inside the selected family, render the **Игрок** controls first, then the **NPC** controls. Do not create separate player-vs-NPC family button rows.
- Within each actor group, each animation family has one mutually exclusive source selector; **Vanilla is always option zero / first**. Vanilla means the original game/archive source for that family, not globally disabling animation.
- **Simply Walking** is one player-facing pack. Its files are assigned by inspecting their actual KF groups: Purist Edition supplies the male walk source; Feminine Walk Cycle supplies the female walk source. Do not expose Feminine Walk Cycle as a separate top-level pack choice when it is the female component of Simply Walking.
- Before defining or combining any future UI family, inspect the actual KF/NIF files, text keys and README/permissions. Establish which animation groups each file contains, then map them to families. Never infer the family structure from a mod title alone.


## First-person movement hands (ANIM-HANDS1)

The Morrowind first-person mesh is also the source of the player's visible hands while running and jumping. The weapon draw gate in `src/combat/weapon/weaponRig.js` previously admitted that mesh for a weapon, spell, climb, or a sufficiently weighted run-hand pump, but not for a jump clip or a run clip whose custom pump had not crossed its threshold. That meant the rig could already have a valid movement pose and still never be drawn while unarmed. The gate now accepts `fpArm.movementPosed()`, which is true for an active first-person run clip or jump clip (while respecting death, held-map and climbing states). This keeps the current character's own Morrowind/Better Bodies hand geometry and lets the existing pose drive it; it does not substitute the classic Daggerfall hand sprite.

This is a source-level correction only. Run, jump, strike, held-map, climb and equipped-weapon transitions still need an in-game visual pass. Do not mark the hand visibility issue verified until tested in first person with an empty hand and with the current skin.


## Default source policy — 2026-10-19

Fresh installs now start with `Vanilla` for the player, male NPCs, and female NPCs. This is implemented by `default: 0` on `PlayerWalkSource`, `NpcMaleWalk`, and `NpcFemaleWalk` in `src/systems/modSettings.js`; the first option is Vanilla. A previously saved player choice is not silently overwritten by changing a declared default. If a Simply Walking choice appears visually identical to Vanilla, inspect the browser console for `[Morrowind animations]` diagnostics and compare the chosen KF path/group. The loader now tries both female files under the same Simply Walking choice; source-level validation does not replace an in-game comparison.


### Axel locomotion follow-up (2026-10-19)

The runtime now loads the checked-in `RunForward;.kf` as part of Axel's single locomotion choice. The movement resolver applies the same actor-specific selection to both `walk*` and `run*` groups. Simply Walking is still walk-only, so choosing it does not replace running; selecting Vanilla restores both original walk and run groups. This is intentional because Simply Walking does not ship a verified run replacement in the active runtime mapping. The Axel run clip is source-wired but has not yet been visually validated in-game.


## Asset-root migration — 2026-10-21

- Runtime walk asset globs now point to `Mods/Animations/Simply Walking` and `Mods/Animations/Axel's Sexy Walk Fixed`.
- Morrowind Animation Overhaul remains excluded from runtime discovery pending explicit permission; presence in the repository does not activate it.
- ReAnimation v3 and Hit Reactions Animated v2 are currently staged source assets, not active runtime providers. Their clips must not be routed into the live resolver solely by filename or folder order. ReAnimation targets first-person animation groups; Hit Reactions targets third-person reaction/death groups and needs its own actor/group-scoped provider path.
- OpenMW Dynamic Animations is reference material and its MWSE/OpenMW behavior is not executed by the browser runtime.
- Verification status after the folder move: the paths in the runtime glob have been corrected at source level. Full test/lint/build and in-game visual checks have not yet been run in this environment.


## New pack integration audit (2026-10-21)

| Source | Repository assets | Intended runtime family | Integration boundary |
|---|---|---|---|
| [ReAnimation v3 — Complete (#52596)](https://www.nexusmods.com/morrowind/mods/52596?tab=files) | `Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/` | First-person combat/weapon clips | Must be resolved by the first-person clip provider and bound against the first-person rig. Never add to the third-person walk provider. The staged files are not proof of active playback. |
| [OpenMW Dynamic Animations (#57633)](https://www.nexusmods.com/morrowind/mods/57633?tab=files) | `Mods/Animations/OpenMW Dynamic Animations/` | Explicitly selected locomotion/idle/race-specific clips, one family at a time | Its OpenMW Lua/config logic is not executed by this browser port. Only verified KF clips can be integrated; do not claim full mod parity. Race-specific files require a deterministic actor/race mapping. |
| [Hit Reactions Animated — OpenMW (#56594)](https://www.nexusmods.com/morrowind/mods/56594?tab=files) | `Mods/Animations/Hit Reactions Animated v2 -- OpenMW/` | Third-person hit reactions (and only separately verified additional groups) | Requires a distinct actor/group-scoped provider. Filter parsed text-key groups; never replace the actor's whole animation source or let a reaction pack override locomotion/combat/death by accident. |

### Required implementation order

1. Inventory each staged KF/NIF's parsed group names, text-key intervals, and referenced bone names using the existing animation parser.
2. Add a deterministic source registry with explicit family, rig, actor/race eligibility, and source priority. Sort discovered assets; do not use glob order as priority.
3. Integrate ReAnimation v3 through the first-person clip resolver; add tests that prove third-person clips remain untouched and unsupported groups fall back to archive sources.
4. Integrate Hit Reactions through a third-person reaction-only resolver, with actor initialization guards and tests proving unrelated groups remain unchanged.
5. Evaluate OpenMW Dynamic Animations clip-by-clip. Port a behavior only when its required Lua selection logic can be represented natively and tested; preserve a documented Vanilla fallback.
6. Run targeted animation tests, lint, types, and build. In-game visual validation remains a separate required check.

**Status update (2026-10-21):** `FirstPersonSource` and `HitReactionSource` have visible rows in Settings → Анимации. ReAnimation v3 and OpenMW Dynamic Animations are mutually exclusive first-person providers, and are admitted only for the compatible `xbase_anim.1st.nif` rig; OpenMW clips are further restricted by the explicit directional locomotion filename/group map. Female and beast first-person rigs retain archive animations rather than attempting to bind clips authored for another skeleton. Hit Reactions Animated v2 is scoped to the active third-person skeleton folder (`xbase_anim`, `xbase_anim_female`, or `xbase_animkna`) and then filtered to reaction/death groups. All discovered paths are sorted before source construction. OpenMW Lua controllers and YAML blend rules are not executed. Automated test/build and in-game validation remain outstanding.
