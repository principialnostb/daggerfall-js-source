# Morrowind settings: segmented content controls

## Purpose

The settings screen uses `src/ui/settings/settingsMap.js` as its single taxonomy. Each tab is a broad domain and sections group related features. Animation sections support nested `group:` selectors: for example, `Анимации → Передвижение → Ходьба/Бег → Игрок/NPC`. Selecting a clip group shows only its controls; adding a future clip family means adding a new group and its actor-scoped controls to the same map. The map is total and disjoint: every settings key, feature, port row, and screen-owned card must appear exactly once. `test/systems/org2_options.test.js` pins that contract.

The new dedicated tabs are:

- **Анимации** — grouped by broad family and narrower clip group.
- **Текстуры** — pack access and texture/overhaul entry points.
- **Тела** — Morrowind body rendering switches; Better Bodies is enabled by default.

The `morrowind-textures` settings vendor owns independent switches for the optional texture/equipment layers. They default off (Vanilla); Better Bodies is the default-on base body system; Seamless DMRA is an optional female-geometry variant selected instead of the base female mesh. The browser's bundled archive is built from saved choices at startup, so changing an optional texture pack requires a page/game reload.

## Animation selector boundaries

Walking and running are independent preferences in `MOD_SETTINGS['morrowind-animation']`:

- `PlayerWalkSource`, `NpcMaleWalk`, `NpcFemaleWalk` select walking sources.
- `PlayerRunSource`, `NpcFemaleRun` select running sources.
- Male NPC running remains Vanilla because no compatible male replacement run asset is connected. Player and female-NPC run choices are independent of their walk choices; Axel is available only on female rigs.

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

The posture, attacks, blocking, magic, actions, special movement, damage, and death groups remain Vanilla information cards until compatible replacement sources are integrated. Running is independently visible and has separate Игрок/NPC cards; it remains Vanilla until a compatible run source is connected. This is intentional and must not be described as completed runtime pack support.
