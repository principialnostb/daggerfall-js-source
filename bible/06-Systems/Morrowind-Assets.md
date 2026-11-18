# Morrowind assets

An opt-in 3D layer. With the player's own Morrowind data attached, the game draws the first-person arms, hands and
weapons, and a third-person body, from it: `Morrowind.bsa`, the expansions' archives, the `.esm` masters, and any
loose `meshes/` or `textures/` a mod ships. None of it is in the repo (Morrowind is not freeware). The player attaches
it through the Features home's assets card (**Attach** and **Remove data**); it is kept in the browser's IndexedDB
(`morrowind` store). What OpenMW does, with cites, is in `02-Formats/Morrowind-Rules.md`.

## How it works

1. **Attach** (`src/scenes/dataSource.js` `storeMorrowindFiles`). Files matching `.bsa`, `.esm`, `.esp` or a loose
   asset extension are stored as the Blobs they arrived as, keyed by basename (archives, masters) or data-files path
   (loose). The attached files are the switch: attaching builds the body for the character in play, and every later
   character made or loaded while files are attached gets one. **Remove data** turns it off.
2. **Count** (`registerMorrowindData`): counts the set and stamps an attach fingerprint, built from names and sizes,
   that the rig's caches key on. Re-attaching a different file under the same name invalidates them.
3. **Open** (`loadMorrowindArchives`). Archives are ranked: one loose archive first, then Weapon Sheathing's vendored
   scabbards (`src/systems/weaponSheathingAssets.js`, fetched on first ask), then expansion and mod `.bsa` files, then
   `Morrowind.bsa`. `MwBsaFile.open(blob)` reads only the header and directory by range. An entry's bytes are read
   by range when a reader `load`s it and cached; a second load of an entry in flight joins the first. `get` stays
   synchronous and throws, by name, for an entry nobody loaded.
4. **Records**. One pass over each master (`extractArmRecords`) reads the races, body parts, armour, clothing, weapons
   and GMSTs. The result is kept in a derived store (`loadMorrowindArmRecords`) under a key naming the reader version,
   the file, its size and a stamp over its first and last 64 KB. A later boot reads it back without touching the
   master. A stale envelope is refused and re-extracted.
5. **Build** (`src/combat/fpArm.js` `buildFpArm`). Loads the skeleton, body parts, weapon and animations (NIF, KF),
   then the textures they name. Texture decoding (DDS to RGBA8) runs in a pool of module Workers
   (`src/formats/morrowind/mwTextureClient.js`, one fewer than the cores, at most `TEXTURE_WORKERS_MAX` 4), idle
   workers closing after `TEXTURE_IDLE_MS`. With no Worker, or `?texturethread=off`, the same decoder runs on the main
   thread. The build logs `[mw] arm built in N ms` with stage timings.
6. **Early start**. The world's boot knows which save it will restore, so `src/combat/weapon/weaponRig.js`
   `prebuildArmsForSave` starts the build from that snapshot during the world's own loading. When the restore's
   `autoBuildArms` arrives, `armsStandFor` counts a build under way for the same race, sex, face and form as
   standing, so no second body is queued. A different identity queues the right body.
7. **Swap**. A change of equipment rebuilds the pieces from the same caches.

The face match (`matchFaceFor`) picks the playable head and hair nearest the classic portrait, decoding only mip level
0. Garment colour probes are measured in the pool, eight at a time, each garment once.

**Weapon shape.** The weapon picker keeps the item's own shape (dagger, tanto, longsword, katana, mace...) within the
available material pool, falling back as before when no match exists. `src/formats/morrowind/mwFirstPerson.js`
`dfWeaponShape` maps Daggerfall's names onto Morrowind's: Wakazashi to wakizashi, and the two axes cross (a Battle Axe
is Morrowind's war axe shape). First-person preload, both weapon views and the item icon all pass the shape.

## Rules

- Nothing from Morrowind is in the repo; it comes only from the player's attached files.
- The attached files are the switch; there is no separate pref.
- A player's loose copy of a path outranks every archive, and expansions and mods outrank `Morrowind.bsa`.
- Every synchronous archive read is covered by an earlier `load`; `findLoaded` names a read that outran its load.
- The item icon is a two-phase read on a lazy archive: the first ask starts a load and returns null (the classic sprite
  stands), then the pack repaints.
- All four hosts share the weapon rig; none has its own Morrowind geometry.

## Code and tests

- `src/scenes/dataSource.js` - the store, `storeMorrowindFiles`, `loadMorrowindArchives`, `loadMorrowindArmRecords`
- `src/formats/morrowind/mwBsaFile.js` - range-read archive with lazy entry loads
- `src/formats/morrowind/mwFirstPerson.js` - `extractArmRecords`, `dfWeaponShape`
- `src/formats/morrowind/mwTextureClient.js`, `src/formats/morrowind/mwTextureWorker.js` - the decode pool
- `src/combat/fpArm.js` - `buildFpArm`, texture preload, face match
- `src/combat/weapon/weaponRig.js` - `prebuildArmsForSave`, `autoBuildArms`, `armsStandFor`
- `test/formats/morrowind/mwload_fparm.test.js` - every synchronous archive read has its covering load
- `test/formats/morrowind/mwload_records.test.js` - the one-pass records and their kept envelope
- `test/formats/morrowind/mwtexthread.test.js` - the decode pool and its fallback
- `test/systems/mwearly.test.js` - the early build and the single body

## Open

- Load times are not measured on retail data here (the container has no Morrowind). The `[mw] arm built` line on a
  real set is the measurement.
- The third-person body is built with the arm, not on the first switch to third person.
- The weapon shape fix chooses meshes; authored grip transforms and scale are not adjusted.

## Added on Dev (merged 2026-11-13)

## Bundled Morrowind visual packs (morrowind.v3)
The current implementation lives in `src/systems/bundledMorrowindMods.js`.
It discovers checked-in assets at build time with Vite's `import.meta.glob`,
converts each selected file into a canonical Morrowind Data Files key
(`textures/...`, `meshes/...`, or `icons/...`), and exposes the resulting
virtual archive to the existing Morrowind asset reader. It does not rewrite
NIFs or textures on disk.
### Runtime lookup and precedence
For an exact asset key, the effective precedence is:
1. **Player-attached loose Data Files** — highest priority; local user fixes win.
2. **Selected bundled visual packs** — the priority list below resolves collisions
   inside this virtual archive.
3. **Attached retail/mod BSA archives** — fallback when neither of the above
   provides the requested key, following the existing archive search order.
The pack priority is explicit in `Object.assign`, not dependent on glob/file
enumeration order. Later buckets win only when their normalized keys are
identical. A pack does not globally replace another pack: it supplies only the
files that were discovered and whose canonical paths match what a NIF or record
requests. Unmatched files are inert.
### Selected packs and why
| Order | Pack | What is enabled | Reason / constraint |
|---|---|---|---|
| 1 | Better Bodies — Nude | Textures under `Data Files/Textures` only | Safe fallback for the already-integrated Better Bodies body. The active body NIF and `bb_skinf_no-uv-edits.json` are not replaced here. |
| 2 | Intelligent Textures — `00 Core` | Standard loose textures only | Broad baseline for vanilla Morrowind textures. `01 Atlas Textures` is excluded because atlas textures require their matching atlas meshes/UVs; mixing only one side can scramble mapping. |
| 3 | Vurt's Better Clothes Retexture | Loose DDS/TGA texture paths | Broad texture override for paths it actually shares with the game. It is not allowed to override geometry merely because a pack contains it. |
| 4 | Better Clothes Retextured | Non-pants textures only; no NIFs | Targeted final override for its own exact non-pants texture paths, after Intelligent Textures/Vurt. Pants/trouser texture keys are held back so this pass cannot change the blue-pants control. Its mesh files are excluded because they can carry UV changes and could disturb the current working equipment/body fitting. |
| 5 | Better Morrowind Armor | Main `Data Files` NIF/DDS/TGA assets and its main ESP | Armor-specific mesh/texture set. This is a geometry pack, not just a texture overlay; it wins matching armor keys so its mesh/UVs stay paired with its textures. |
| 6 | Complete Armor Joints | Its `Data Files` assets and ESP | The selected compatibility add-on is loaded after the base armor pack. Other mutually exclusive BMA options are not auto-merged. |
| 7 | Westly's Fine Clothiers of Tamriel | Meshes, textures and `Westly_Presents_FCOT.esp` | Adds its own clothing/content rather than being treated as a universal replacement for standard pants. Its plugin is needed for the added item records. |
| 8 | Westly's Faces Refurbished | Data Files NIF/DDS/TGA assets | Separate head/hair visual layer. It wins exact matching head/hair paths, but its in-game face selection still requires a runtime check; path discovery alone does not prove every race/sex resolves to the intended head. |
### Deliberately excluded
- **High Resolution Better Body Female Textures** — disabled after the earlier in-game result looked blurry and did not establish a reliable visual improvement. It must not override the currently working Better Bodies skin. HD-BODY (2026-10-27, `04-Characters/Body-Editor.md` section 3): the blur was its skin on Better Bodies' mesh; it is now loaded as a pair, its own mesh with its own skin, behind the editor's test switch, and off by default.
- **Old Better Heads** — not discovered by this loader; the previous integration attempt could make the unhelmeted head disappear.
- **Intelligent Textures `01 Atlas Textures`** — excluded without the corresponding atlas meshes.
- **Better Clothes Retextured NIFs and pants textures** — excluded from this pass. NIFs can change UVs/geometry; pants textures are withheld to protect the blue-pants reference until its exact asset key is identified. Reconsider either only as a separate, measured change.
- **Alternative Better Morrowind Armor patches** — Chaos Heart, LeFemm/DeFemm, Snow Prince, no-Tribunal and HiRez compatibility variants are not merged automatically. They are alternatives, not additive packs; enabling several together can create incompatible mesh/texture/plugin combinations.
- **Seamless DMRA body replacement** — not enabled; it would compete with the current Better Bodies geometry.
- **Westly's Fine Clothiers is not used as a blanket standard-clothing replacer** — its extra clothing and its own assets are kept for their own keys/items.
### Pants, silhouette and the blue-pants control
A texture changes surface detail, not the outline of a trouser mesh. If pants look square, the cause can be the NIF silhouette, UV mapping, body intersection, or the fitting transform; a higher-resolution DDS alone cannot make the legs narrower. Therefore this selection does not add another general clothing-mesh override on top of the current fitting solution.
The currently good-looking blue pants are the visual control item. The new Better Clothes Retextured layer explicitly skips every texture path containing `pant` or `trouser`, so it cannot overwrite any candidate pants key. Existing Intelligent Textures/Vurt pants selection remains as before. Compare the same character, camera angle, distance and equipment before/after; once the actual blue-pants key is identified, a specific alternative can be tested deliberately rather than changing it as a side effect. Do not alter the camera/grounding fixes or the existing armor-fitting script as part of texture selection.
### Pants-to-body fitting (MW-BB-FIT2)
The existing triangle-BVH clearance fitter in `src/formats/morrowind/mwSkinTransfer.js`
moves a private clothing position buffer toward the measured body surface; it
does not rewrite the NIF, texture, UVs, or body mesh. The retail trouser pass
uses the groin, thigh, knee, and ankle surfaces, with the relevant slots
selected per panel.

The fitter now also receives the side of the clothing part (left/right). Each
body surface is tagged with the BODY slot and skeleton bone used to bind it.
When fitting a sided leg panel, the search keeps shared groin surfaces but
excludes the opposite thigh/calf. This prevents a baggy trouser vertex from
snapping to the other leg merely because that surface is closer. The new
`MW-FIT2` fixture pins this case, including preservation of the garment's UVs.
This is a geometry-fit improvement, not a claim of perfect cloth simulation:
it conforms the rest-pose mesh to the nearest selected surface, and does not
remesh the cloth or solve cloth folds. Validate in-game from front, side and
rear, at idle and while running. If a seam or crotch deforms badly, record the
exact clothing record/body slot and fix that region rather than globally
increasing clearance. Keep the blue pants as the unchanged visual control and
do not alter camera grounding or the existing armor-fitting rules.


### Retail trouser geometry

The retail trouser NIFs in the local Morrowind archive attach rigid
panels to the skeleton. The shared worn-body assembly now fits those panels
at rest, including both thighs, knees and ankles, and converts the fitted
positions back into each panel's attachment space. Side filtering keeps each
leg on its own body surfaces. The fit retains part of the authored volume
and rebuilds the normals. The NIF, UVs, material and attachment stay intact.
The selector uses the clothing record and original trouser model path.
Expensive Pants 6 and custom trouser models use posed clearance and skip the retail rest-pose conform pass.
Mod replacements should be evaluated as mesh/material pairs before selection.
The Common 1 A quilted trousers and Common 1 E hide trousers use a stronger
fit across the four panels. Their patterns match the front and rear views
from Bothway Garden. Check the panel joins in motion before extending the
stronger fit to other records.

DFU's `StaticNPC.SetLayoutData` keeps appearance as a billboard archive and
record. DFO's fitted wearable geometry is a departure for its 3D bodies.

### How to verify what actually wins
In the browser console, run:
```js
await inspectBundledMorrowindTextures()
```
The report lists discovered source-file count, selected canonical asset count, per-pack counts, bundled plugin names, and representative fetch status/size. It validates path selection and fetchability; it does **not** judge the rendered appearance or prove a head is selected correctly. For a specific texture, inspect the canonical key in `assetUrls` in the debugger and confirm the returned URL points into the intended pack. The final acceptance step is still an in-game visual check.
### Current confidence and future changes
This is a technically selective load order based on the pack layouts, path collisions, known mesh/UV dependencies and the prior in-game Better Bodies results. Binary DDS files have not been visually ranked side-by-side by this loader or documentation process, so the priority order is not a claim that every texture in one pack is artistically superior. Change one layer at a time and record the exact canonical key, winning pack, in-game result and whether the relevant mesh changed. Keep geometry/UV experiments separate from texture-only changes; this makes regressions attributable and preserves the current blue-pants reference.
