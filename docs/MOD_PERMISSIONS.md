# Mod permissions (checked 2026-11-01, paraphrased from each mod's Nexus page or readme)

Check each page before acting. This is not legal advice. Pack list and status: `PR-Asset-Manifest.md`.

## Open question for the maintainers and the authors

The fork's owner regards the Morrowind body lane as a Morrowind modification, because it reads the player's own Morrowind files. Against that: DFO Online is a browser reimplementation of Daggerfall on its own WebGL2 engine, it does not run on OpenMW, and it plays without Morrowind (`bible/Home.md`). Whether a "no conversion to other games" term reaches it is for each author to say. Even if it does not, the upload and asset-use terms still apply.

| Mod | Upload | Modify | Conversion | Asset use | Sold mods | Third-party material | Status |
|---|---|---|---|---|---|---|---|
| OpenMW Dynamic Animations (taitechnic) | yes, credit | yes, credit | yes, credit | yes, credit | yes | credited in `PR-Asset-Manifest.md` | allowed |
| ReAnimation v3 (Max Yari) | no | yes, credit | no | yes, credit; prefers staying a dependency, limited parts only if that is impossible, not whole | no | parts from MCAR (SVNR): ask that author too | external dependency, ask |
| Morrowind Animation Overhaul (Parsoma) | no | ask first | no | ask first | no | not stated | external dependency, ask |
| Better Hands (Robert, Bahamut, Westly, Moranar) | yes, credit | yes | no | yes | no | derives from Robert's Bodies | carried, ask about conversion |
| Robert's Bodies (readme) | use anywhere | - | - | yes, credit | - | not checked | carried, credit required |
| Better Bodies (Psychodog Studios) | not found | not found | not found | not found | not found | several authors | carried, unconfirmed: maintainers to clear |



## Delivery: bring your own files

DFO Online gives these mods separate technical support and claims no ownership of them. Players and testers fetch the originals from the authors' pages. Only OpenMW Dynamic Animations is carried, as its terms allow with credit. The table's "carried" words for the others are superseded: their files are not in this branch.

**Built:** Mods & Files lists the six packs. A player attaches a folder or a .zip; the game recognises the pack by its files, keeps them in the browser (IndexedDB store `attached-mods`, `src/systems/supportedMods.js`) and hands them to the existing loaders as URLs after a reload. Each pack has on/off and Remove. A missing pack falls back to the game's own files. **Limits:** .7z and .rar must be unpacked first. No version check. The Better Bodies link has not been confirmed to open.

## Installing for testers

Unpack each original archive so these paths exist, then run `npm run dev`:

- `Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/`
- `Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/xbase_anim.kf`
- `Mods/Bodies/Better Hands/Meshes/b/`
- `Mods/Bodies/Robert's bodies/Data Files/Meshes/bbr/`
- `Mods/Bodies/Better Bodies/Nude/Data Files/Meshes/bb/`

## Links

- OpenMW Dynamic Animations: https://www.nexusmods.com/morrowind/mods/57633
- ReAnimation v3: https://www.nexusmods.com/morrowind/mods/52596
- MCAR, used by ReAnimation: https://www.nexusmods.com/morrowind/mods/48628
- Morrowind Animation Overhaul: https://www.nexusmods.com/morrowind/mods/60253
- Better Hands: https://www.nexusmods.com/morrowind/mods/52552
- Better Bodies: https://en.uesp.net/wiki/Morrowind_Mod:Better_Bodies
- Robert's bodies: terms in `Mods/Bodies/Robert's bodies/ReadMeEng.txt`

The Skyrim iron armour and the axe are held out of this PR: their code is dormant and `tools/skyrim/` is removed.
