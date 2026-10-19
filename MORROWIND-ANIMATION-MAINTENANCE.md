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
| Choose a clip while walking | movement resolver in `src/combat/fpArm.js` | Current `morrowind-animation/FemaleWalk` setting selects Standard/Female/Female 2. The preference is checked again on a walk-group change and can trigger a live re-pick. |
| UI / persisted mod setting | `src/systems/modSettings.js`, `src/systems/features.js` | One Mods-page choice named “Female Walk Style”; values are Standard, Female, Female 2. |
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

   Role: alternate female walk source currently exposed as the old “Female” option. It is not the same as the Purist Edition female base file. This is the option that should be removed from the final player-facing choices if the agreed UX is one source per pack and the Axel option is renamed to “Female”.

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

## Current UX limitation and required next implementation

The current UI now exposes a **player walk-source choice** with pack-specific labels: Standard, Feminine Walk Cycle, and Axel's Sexy Walk Fixed. The numeric values remain 0/1/2 so saved settings keep their meaning. This is functional for the player walk resolver, but it does **not yet meet** the requested final controls:

- a player-only selector listing each walk pack/source separately (the current selector is one mutually-exclusive choice, intentionally preventing conflicting simultaneous gait overrides);
- independent NPC male and NPC female selectors;
- an unambiguous per-pack state (“Disabled / Standard / Female”) where applicable;
- a single deterministic source resolution when more than one pack is enabled.

Do not add decorative settings without consumers. The next implementation must first trace whether the actor's identity (local player, remote player, male NPC, female NPC) reaches the movement animation resolver. Add that identity explicitly if necessary, then select the setting for that actor class. Settings must be persisted using the existing `modSetting` / mod-settings store, not a new ad-hoc localStorage key. The resolver must choose exactly one winning source for a given actor and walk group; it must never blend two different authored gait clips together simply because two toggles are enabled.

Recommended final resolution contract:

- **Player:** explicit walk source choice, with the selected pack shown by name. “Standard” means the Purist Edition base walk. The Axel option should be labelled “Female” only if the runtime uses its female `WalkForward` clip; do not relabel the Feminine Walk Cycle and Axel source identically.
- **Male NPCs:** Standard = current Purist Edition male walk unless in-game testing shows that the original archive gait is the better baseline.
- **Female NPCs:** Standard = current Purist Edition female walk; Female = Axel's Sexy Walk Fixed, per the requested NPC behavior. Remove the old Feminine Walk Cycle option from the NPC-facing selector if that is the chosen mapping.
- **Fallback:** if a chosen source is absent, fails to fetch/parse, or lacks the requested group, fall back to the next explicitly ranked valid source and log the chosen source once. Never leave the actor with a missing movement clip.

These actor-specific controls are **not marked complete** until the identity reaches the runtime consumer, the setting changes the source actually played, tests cover each actor class and fallback, and an in-game check confirms the gait. This is intentionally stated plainly so future maintenance does not mistake the current global choice for the requested separated design.

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
