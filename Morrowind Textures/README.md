# Morrowind texture and animation assets

This branch receives only runtime assets needed for the current integration; it does not copy the entire `morrowind.v3` mod archive.

## Bundled in v4

- **Better Bodies — Nude texture set**: fallback textures for the already-integrated Better Bodies body. The experimental high-resolution female replacement is intentionally excluded because it produced a blurry result.
- **Better Morrowind Armor — base Data Files** and **Complete Armor Joints — Data Files**: only the main package and its matching joints patch are included. Alternative compatibility patches and DeFemm variants are excluded to avoid conflicting mesh/ESP combinations.
- **Better Clothes Retextured — 18 top-level shirt texture overrides**: only direct game texture keys for shirts are included (about 24 MB); pants/trousers and the pack's alternate meshes are not selected, so the existing body/equipment geometry and armor-fitting logic remain untouched.

The runtime loader in `src/systems/bundledMorrowindMods.js` maps these files to archive paths referenced by Morrowind NIFs. The loader still needs a browser/build smoke test to confirm actual texture fetches and in-game material selection; a file being present in the archive does not by itself prove the final GPU material uses it.

## Kept on the source branch, not copied wholesale

The full source archive remains on [`morrowind.v3/Morrowind Textures`](https://github.com/principialnostb/daggerfall-js-source/tree/morrowind.v3/Morrowind%20Textures). Large packs such as Intelligent Textures, Vurt's Better Clothes Retexture, and Westly's Faces Refurbished / Fine Clothiers are not copied wholesale into v4: the current broad globs would otherwise add hundreds of megabytes (or multiple gigabytes) to a checkout/build. These should be brought over as curated path subsets after validating the actual model/texture keys they override. Head meshes and head textures must be integrated together; enabling only one side risks invisible heads.

## Animation mod compatibility

- [Morrowind Animation Overhaul](https://www.nexusmods.com/morrowind/mods/60253)
- [Animation Blending](https://www.nexusmods.com/morrowind/mods/53779) — its MWSE Lua scripts are reference material, not directly executable in this browser renderer.
- [Simply Walking (Remastered)](https://www.nexusmods.com/morrowind/mods/49785)
- [Female animation option candidate](https://www.nexusmods.com/morrowind/mods/43129)

KF files are not enabled merely by copying them: the runtime must select/load the correct external animation sequence, respect its bone-name mapping and clip groups, and switch only the player's female walk cycle without changing NPC animation or the already-fixed camera/grounding behavior. That integration remains a separate implementation step.
