# Morrowind mod migration and integration audit

Audit date: 2026-10-21  
Target branch: `Dev`  
Asset baseline: `morrowind.v3`  
Scope: verify the `Morrowind Textures` → `Mods/{Animations,Textures,Bodies}` migration, then distinguish repository presence from runtime integration.

## Findings

### 1. The old mod payloads survived the folder migration intact

For every one of the 13 existing mod directories, the Git tree SHA in `morrowind.v3/Morrowind Textures/` is identical to the SHA of its destination directory on `Dev`. Git tree SHA equality means the directory contents and their relative paths are identical, not merely that the folder names match.

| Existing pack | Destination on `Dev` | Tree SHA verified |
|---|---|---|
| Animation Blending | `Mods/Animations/Animation Blending` | `5f5e1679bda52de9dd9b850e58514f3d65e62881` |
| Axel's Sexy Walk Fixed | `Mods/Animations/Axel's Sexy Walk Fixed` | `f541e140e7d743cf53676f0f468aeef7512b1a29` |
| Morrowind Animation Overhaul | `Mods/Animations/Morrowind Animation Overhaul` | `f70d149d7bd8e3105cf04246b6935680b51098de` |
| Simply Walking | `Mods/Animations/Simply Walking` | `071f92dc072dd9f8630517d9919af615a340e332` |
| Better Clothes Retextured | `Mods/Textures/Better Clothes Retextured` | `38388cab58957cb1d3e29d500f45345105f21327` |
| Better Morrowind Armor | `Mods/Textures/Better Morrowind Armor` | `3517f00252e9783585c8cb175f3e68937da5ea63` |
| Intelligent Textures | `Mods/Textures/Intelligent Textures` | `8de038ec66e538c7dccab9cc50b90eab22edbcce` |
| Vurt's Better Clothes Retexture | `Mods/Textures/Vurt's Better Clothes Retexture` | `43c2a78aada70b00404cdd1b5d24866e1c2294d2` |
| Westly's Faces Refurbished | `Mods/Textures/Westly's Faces Refurbished` | `e373aeb424205d6b75ca86439fd52ca0b8f24c2f` |
| Westly's Fine Clothiers of Tamriel | `Mods/Textures/Westly's Fine Clothiers of Tamriel` | `f754138f7aceef8302ce6c1776253df0c6ca4aa3` |
| Better Bodies | `Mods/Bodies/Better Bodies` | `9b40b202c31772db9d6d9f640b9e5ccd17c56abc` |
| High Resolution Better Body Female Textures | `Mods/Bodies/High Resolution Better Body Female Textures` | `7c6bab8464683f36a068a6224a5aca51a061e3f9` |
| Seamless DMRA body replacer | `Mods/Bodies/Seamless DMRA body replacer` | `d4c378131dc4290d37527c1be687e079383a9745` |

**Migration result:** no old pack payload needs to be recopied from `morrowind.v3`; doing so would be redundant and risks introducing accidental differences.

### 2. The three requested animation packs are present, but presence is not runtime integration

| Pack | Repository payload | Current runtime status |
|---|---|---|
| ReAnimation v3 | `Mods/Animations/ReAnimation v3 - Complete - first-person animation pack` (297 tree entries) | Not connected to the browser gameplay resolver. The pack contains first-person KF clips, YAML animation metadata, and OpenMW Lua/API scripts. The Lua scripts and OpenMW script registration cannot run in this JavaScript port; compatible clip selection and attack-group mapping must be ported explicitly. |
| OpenMW Dynamic Animations | `Mods/Animations/OpenMW Dynamic Animations` (301 tree entries) | Not connected to the browser gameplay resolver. The pack contains KF/YAML sources plus an OpenMW Lua script. Its NPC walk-style logic, speed cap, and configuration are behavior, not just asset files, and need an explicit JavaScript port. |
| Hit Reactions Animated v2 | `Mods/Animations/Hit Reactions Animated v2 -- OpenMW` (475 tree entries) | Animation assets and per-clip YAML files are present, along with `HitReactionsAnimated.omwscripts` and Lua scripts. The gameplay hit/stagger/death event selector is not wired to these assets. Enabling the files wholesale would not implement the pack's behavior. |

The current `src/formats/morrowind/mwWalkAnimationAssets.js` glob includes only Simply Walking and Axel's female locomotion clips. This is deliberate: those sources are filtered by animation family and actor preference. The new packs cover other families and must not be added to that walk-only glob as a shortcut.

### 3. Existing animation integration boundaries

- **Simply Walking**: walk-only source selection is wired into the gameplay resolver; vanilla remains the fallback.
- **Axel's Sexy Walk Fixed**: female walk and run sources are wired separately; idle clips are not wired.
- **Animation Blending**: the checked-in MWSE Lua plugin is not executed. The port's native JavaScript pose cross-fade is a separate implementation.
- **Morrowind Animation Overhaul**: its broad combat/locomotion assets are not enabled as a gameplay source. Keep this exclusion until reuse/conversion permission is confirmed and group-level conflicts are audited.

A future animation integration must preserve deterministic source resolution: one selected source per actor and animation family, stable tie-breaking, safe fallback when a clip is missing, and no accidental replacement of unrelated groups.

### 4. Textures: the directory migration is verified; runtime replacement still needs a separate test

All six existing texture-pack directories have matching tree SHAs between the old and new locations. Their contents were not lost or changed by the category move.

That does **not** by itself prove that the renderer consumes those loose files. `src/formats/morrowind/mwTexture.js` implements Morrowind's resource-path normalization and `.tga` → `.dds` correction, but path correction is not a mod overlay/priority registry. The runtime needs a tested virtual-file lookup that maps the nested pack paths to their game-relative resource names and resolves collisions deterministically. The same question applies to body packs' `Data Files/Meshes` and `Data Files/Textures`: their files being present does not prove that the character assembler sees them.

Texture validation still required:
1. Build a normalized index for supported loose texture/mesh assets under `Mods/Textures` and `Mods/Bodies` without flattening away game-relative paths.
2. Define and test conflict priority between packs, including case-insensitive paths and duplicate filenames.
3. Resolve the authored NIF texture path using the same normalized VFS key as the index, including `.tga` references resolving to `.dds` files.
4. Test a known texture from each pack in the actual character/world renderer and confirm the fallback path remains intact when a mod file is absent or invalid.
5. For bodies, separately verify mesh selection, skin textures, skeleton binding, and clothing compatibility; a texture-only override must not silently replace a mesh.

Until those runtime checks pass, report the texture packs as **preserved in the repository, runtime activation not yet verified**, rather than claiming they are integrated.

## Next implementation sequence

1. Add a shared, normalized loose-resource overlay for `Mods/Textures` and `Mods/Bodies`, with explicit deterministic precedence and regression tests.
2. Port each new animation pack by family rather than importing its OpenMW Lua runtime: ReAnimation first-person attack groups; Dynamic Animations locomotion variants; Hit Reactions hit/stagger/death groups.
3. Add per-family settings only when the corresponding runtime consumer exists; preserve vanilla as the first/default option.
4. Run the relevant tests, lint, type check and build. In-game visual validation remains a separate required step.
