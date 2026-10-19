# Morrowind settings: segmented content controls

## Purpose

The settings screen uses `src/ui/settings/settingsMap.js` as its single taxonomy. Each tab is a broad domain; sections group related features; `label:` rows introduce narrower clip groups inside a section. The map is total and disjoint: every settings key, feature, port row, and screen-owned card must appear exactly once. `test/systems/org2_options.test.js` pins that contract.

The new dedicated tabs are:

- **Анимации** — grouped by broad family and narrower clip group.
- **Текстуры** — pack access and texture/overhaul entry points.
- **Тела** — Morrowind body rendering switches.

## Animation selector boundaries

Walking and running are independent preferences in `MOD_SETTINGS['morrowind-animation']`:

- `PlayerWalkSource`, `NpcMaleWalk`, `NpcFemaleWalk` select walking sources.
- `PlayerRunSource`, `NpcFemaleRun` select running sources.
- Male NPC running currently remains Vanilla because no compatible replacement run asset is connected.

The loader marks each bundled source with `animationFamily: 'walk' | 'run'`. The movement resolver chooses the appropriate preference from the current group, and the gates only filter their own family. Therefore selecting Axel for running does not disable or override the chosen walking source, and selecting a walk pack does not claim the RunForward group. Missing or unsupported clips fall back to the game's/archive source.

The currently bundled external run candidate is Axel's female `RunForward;` clip. The selector does not imply that every race, sex, stance, or weapon-specific group has a replacement; groups absent from the selected pack continue to use the archive source.

## Future pack integration

Before exposing a new choice in the UI:

1. Add the pack's resource candidates to the loader and record their clip family.
2. Verify NIF/KF skeleton binding, group names, text keys, loop windows, and compatibility with the player/NPC rig.
3. Add an independent persisted setting only for the family the pack really replaces.
4. Add a Features row and place it in the matching subsection in `settingsMap.js`.
5. Add tests proving that the selector filters only its family and leaves every other family on its current source.
6. Keep unsupported families visibly Vanilla until a compatible source is wired. Do not show a functional-looking selector that changes nothing.

The posture, attacks, blocking, magic, actions, special movement, damage, and death groups are segmented in the interface, but remain Vanilla information cards until compatible replacement sources are integrated. This is intentional and must not be described as completed runtime pack support.
