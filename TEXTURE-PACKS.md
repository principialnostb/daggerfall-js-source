# Texture packs and animation resources used by the Morrowind branch

The uploaded asset collection is maintained at [`Morrowind Textures` on `morrowind.v3`](https://github.com/principialnostb/daggerfall-js-source/tree/morrowind.v3/Morrowind%20Textures). The same directory tree is already present on `morrowind.v4` at the audit baseline and has the same Git tree SHA; verify changes before copying it again. Git object storage reuses identical trees/blobs, but a Markdown link alone does not make the files available to a runtime.

Working branch for implementation: [`morrowind.v4`](https://github.com/principialnostb/daggerfall-js-source/tree/morrowind.v4). Keep source assets in the existing tree and put runtime code, tests, and integration documentation in the working branch.

## Animation source candidates

- [Simply Walking (Remastered)](https://www.nexusmods.com/morrowind/mods/49785) — standard walk set candidate. The repository contains `Simply Walking Purist Edition/meshes/xbase_anim.kf` and `xbase_anim_female.kf`.
- [Female walk reference](https://www.nexusmods.com/morrowind/mods/43129) — candidate for a female-only walk choice. The asset tree also contains `Simply Walking/Feminine Walk Cycle/Meshes/xbase_anim_female.kf`.
- `Morrowind Animation Overhaul` and `Axel's Sexy Walk Fixed` are present as additional reference candidates. They should not be activated by default without compatibility checks; broad replacements can change more than the intended female walking animation.

Selection, compatibility criteria, camera-turn behavior, and required tests are documented in [MORROWIND-ANIMATION-INTEGRATION.md](MORROWIND-ANIMATION-INTEGRATION.md). The Morrowind Mesh Viewer exposes a persisted Standard/Female source selector for walk groups; this is a diagnostic integration, not the in-game controller setting.

Keep downloaded mod archives outside the repository where possible and respect each author's permissions and redistribution requirements.
