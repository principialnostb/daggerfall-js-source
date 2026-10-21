# Texture packs and animation resources used by the Morrowind branch

The active asset tree on `Dev` is [`Mods`](https://github.com/principialnostb/daggerfall-js-source/tree/Dev/Mods), organized into `Animations`, `Textures`, and `Bodies`. The previous `Morrowind Textures` folder was moved, not deleted. Runtime Vite globs must use these new category paths; stale globs can leave packs present in Git but absent from the built application. The `morrowind.v3/Morrowind Textures` tree remains the historical source for comparing assets.

Working branch for implementation: [`Dev`](https://github.com/principialnostb/daggerfall-js-source/tree/Dev). Keep source assets in the existing tree and put runtime code, tests, and integration documentation in this branch.

## Current optional texture/equipment switches

- **Better Bodies** — default on; the player's body and first-person arms fall back to standard Morrowind meshes when switched off.
- **Intelligent Textures · 00 Core**, **Vurt's Better Clothes Retexture**, **Better Clothes Retextured**, **Better Morrowind Armor**, **Complete Armor Joints**, **Westly's Fine Clothiers of Tamriel**, and **Westly's Faces Refurbished** — individually selectable and default off. The settings-backed archive includes only enabled layers when the app starts; reload after changing these choices.
- **Complete Armor Joints** is an add-on: enabling it enables Better Morrowind Armor; disabling the base pack disables the joints add-on and shows a notice on the affected setting.
- Texture layers with overlapping paths intentionally coexist in a defined precedence order; they are not treated as mutually exclusive if they can safely complement each other.
- **Seamless DMRA** is now an optional female body-geometry variant under Settings → Тела. It selects its own female NIF in place of the base Better Bodies female mesh while retaining Better Bodies as the base skin and male-body source. The resolver never draws both female meshes at once. Its optional normal/specular maps are included in the bundled archive when the setting is enabled at startup.
- The failed high-resolution Better Body female texture package and atlas-only Intelligent Textures remain excluded: the former was unreliable, and the latter needs matching atlas meshes to avoid UV mismatches.

## Animation source candidates

- [Simply Walking (Remastered)](https://www.nexusmods.com/morrowind/mods/49785) — standard walk set candidate. The repository contains `Simply Walking Purist Edition/meshes/xbase_anim.kf` and `xbase_anim_female.kf`.
- [Female walk reference](https://www.nexusmods.com/morrowind/mods/43129) — candidate for a female-only walk choice. The asset tree also contains `Simply Walking/Feminine Walk Cycle/Meshes/xbase_anim_female.kf`.
- `Morrowind Animation Overhaul` and `Axel's Sexy Walk Fixed` are present as additional reference candidates. They should not be activated by default without compatibility checks; broad replacements can change more than the intended female walking animation.

Selection, compatibility criteria, camera-turn behavior, and required tests are documented in [MORROWIND-ANIMATION-INTEGRATION.md](MORROWIND-ANIMATION-INTEGRATION.md). The Morrowind Mesh Viewer exposes a persisted Standard/Female source selector for walk groups; this is a diagnostic integration, not the in-game controller setting.

Keep downloaded mod archives outside the repository where possible and respect each author's permissions and redistribution requirements.
