# Texture packs and animation resources used by the Morrowind branch

The uploaded asset collection is maintained at [`Morrowind Textures` on `morrowind.v3`](https://github.com/principialnostb/daggerfall-js-source/tree/morrowind.v3/Morrowind%20Textures). The same directory tree is already present on `morrowind.v4` at the audit baseline and has the same Git tree SHA; verify changes before copying it again. Git object storage reuses identical trees/blobs, but a Markdown link alone does not make the files available to a runtime.

Working branch for implementation: [`Dev`](https://github.com/principialnostb/daggerfall-js-source/tree/Dev). Keep source assets in the existing tree and put runtime code, tests, and integration documentation in this branch.

## Current optional texture/equipment switches

- **Better Bodies** — default on; the player's body and first-person arms fall back to standard Morrowind meshes when switched off.
- **Intelligent Textures · 00 Core**, **Vurt's Better Clothes Retexture**, **Better Clothes Retextured**, **Better Morrowind Armor**, **Complete Armor Joints**, **Westly's Fine Clothiers of Tamriel**, and **Westly's Faces Refurbished** — individually selectable and default off. The settings-backed archive includes only enabled layers when the app starts; reload after changing these choices.
- **Complete Armor Joints** is an add-on: enabling it enables Better Morrowind Armor; disabling the base pack disables the joints add-on and shows a notice on the affected setting.
- Texture layers with overlapping paths intentionally coexist in a defined precedence order; they are not treated as mutually exclusive if they can safely complement each other.
- **Seamless DMRA**, the failed high-resolution Better Body female texture package, and atlas-only Intelligent Textures are not currently selectable replacements. DMRA is not wired into the player/NPC body resolver, the high-resolution texture attempt was unreliable, and atlas textures need their matching atlas meshes. Keeping them out of the active archive avoids silent geometry/UV conflicts.

## Animation source candidates

- [Simply Walking (Remastered)](https://www.nexusmods.com/morrowind/mods/49785) — standard walk set candidate. The repository contains `Simply Walking Purist Edition/meshes/xbase_anim.kf` and `xbase_anim_female.kf`.
- [Female walk reference](https://www.nexusmods.com/morrowind/mods/43129) — candidate for a female-only walk choice. The asset tree also contains `Simply Walking/Feminine Walk Cycle/Meshes/xbase_anim_female.kf`.
- `Morrowind Animation Overhaul` and `Axel's Sexy Walk Fixed` are present as additional reference candidates. They should not be activated by default without compatibility checks; broad replacements can change more than the intended female walking animation.

Selection, compatibility criteria, camera-turn behavior, and required tests are documented in [MORROWIND-ANIMATION-INTEGRATION.md](MORROWIND-ANIMATION-INTEGRATION.md). The Morrowind Mesh Viewer exposes a persisted Standard/Female source selector for walk groups; this is a diagnostic integration, not the in-game controller setting.

Keep downloaded mod archives outside the repository where possible and respect each author's permissions and redistribution requirements.
