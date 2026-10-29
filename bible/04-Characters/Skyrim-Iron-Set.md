# Skyrim's Iron Set on the Morrowind Body - the import, what it taught, where it stands

(MW-HORN5, MW-IRON1..5, the owner, 2026-10-27, branch `equipment`; the bench it was judged on is
`04-Characters/Look-Bench.md`)

> "я хотел сделать буквально шлем довакина стальной из скайрим 5 и так медленно по частям аккуратно переносить сеты
> брони по частям и материалу ... как пилотный проект"

The owner's personal, non-commercial fork wears Skyrim's iron armour - helmet, heavy cuirass, pauldrons, gauntlets,
greaves, boots - as a second LOOK of Daggerfall's Steel pieces (`iron`, beside Mac's `plate`; the helm's `horned`),
picked per piece in the pack's look row. Every mesh and painting is read out of the owner's own Skyrim Special Edition
install and adapted here; nothing of Bethesda's is committed.

## 1. The rule - Skyrim's data is the player's

**A departure from the port's doctrine** ("mods a source of technique and not of assets" - Look-Bench's opening, and
Port-Doctrine's own-art line), the owner's, for his fork, and bounded the way ARENA2 is:

- the tools (`tools/skyrim/`) are committed; what they make is not. `.gitignore` holds every output -
  `src/assets/mw/source/Steel_Plate_Horned_Helm.*`, `src/assets/mw/meshes/steel_plate_helm_horned.nif`,
  `src/assets/mw/textures/steel_plate_helm_horned.dds`, `src/assets/mw/meshes/iron_*.nif`,
  `src/assets/mw/textures/iron_*.dds`, `src/assets/mw/looks/steel_plate_helm_horned.png`, `src/assets/mw/looks/iron_*.png`;
  the extracted sources go to `scratch/skyrim/` (ignored as all of scratch is);
- **only from the player's own install** - asked to find the models "somewhere", the work refused rips from the web
  (third-party copies of Bethesda's files); the install was the owner's to make (`D:\Steam\steamapps\common\Skyrim
  Special Edition`, `SKYRIM_PATH` overrides);
- a fresh checkout has no iron look and no horned helm: `PLAYER_MADE_STYLES` (`ownArmorModels.js`) marks them, the look
  row offers them only where their meshes are (`lookVariants.js:"const available = "`), and `ownArmorModelPaths` - the
  coverage walk's "every path ships" - leaves them out;
- not for DFO's own releases. The owner was told so when he asked; keep the fork's artefacts out of anything pushed
  upstream.

## 2. How to make it

```
SKYRIM_PATH="D:/Steam/steamapps/common/Skyrim Special Edition" node tools/skyrim/importIronHelmet.mjs
node tools/skyrim/importIronCuirass.mjs [--preview]     # the cuirass, skirt, pauldrons and the trousers (greaves)
node tools/skyrim/importIronLimbs.mjs [--preview]       # the gauntlets and boots - after the cuirass: they take its tone
```

Blender 5.2 (`BLENDER` overrides `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`) re-bakes each
painting; each import ends by redrawing the look pictures (`tools/lookThumbs.mjs`). Each writes its NIFs and DDSs into
`src/assets/mw/`, where the dev server serves them.

| piece | Skyrim mesh (female, weight 1) | ships as | painting |
|---|---|---|---|
| Steel Helm `horned` | `armor\iron\male\helmet.nif` | `steel_plate_helm_horned.nif` | `steel_plate_helm_horned.dds` 128 |
| Steel Cuirass `iron` | `armor\iron\f\cuirassheavy_1.nif` | `iron_cuirass.nif` + `iron_skirt.nif` | `iron_cuirass.dds` 256 |
| Steel Pauldrons `iron` | (the same, its Pauldron shape) | `iron_pauldron_left/right.nif` | `iron_cuirass.dds` |
| Steel Greaves `iron` | (the same, its trousers) | `iron_greave_left/right.nif` | `iron_cuirass.dds` |
| Steel Gauntlets `iron` | `armor\iron\f\gauntlets_1.nif` | `iron_gauntlet_left/right.nif` | `iron_gauntlets.dds` 256 |
| Steel Boots `iron` | `armor\iron\f\boots_1.nif` | `iron_boot_left/right.nif` | `iron_boots.dds` 128 |

## 3. Skyrim's files, as read here

- **BSA v105** (`tools/skyrim/bsa.mjs`): a 36-byte header, folder records of 24 bytes, each folder's name (a byte
  length, null-terminated) and its file records (hash, size, offset), then the file names block. Bit 30 of a size
  flips the archive's compression flag; with flag 0x100 a file starts with its own path; compressed data is the
  original size then an **LZ4 frame** (decoded here - Node has no LZ4). Meshes are in `Skyrim - Meshes0/1.bsa`,
  textures in `Skyrim - Textures0..8.bsa`, by lower-case backslashed path.
- **NIF 20.2.0.7, user 12, BS 100** (`tools/skyrim/sseNif.mjs`): the header's export strings, block types and sizes and
  the string table; a BSTriShape's vertex descriptor carries its attribute flags at bit 44 (vertex, UV, normal, tangent,
  colour, skin, eye) and its size in the low nibble - SSE's positions are full floats, UVs half floats, normals bytes.
  **A skinned shape keeps its vertices in its NiSkinPartition** (the shape's data size is 0); the partition's own
  triangle copy indexes the shared list, and the vertex's bone indices are the skin instance's, not the partition's. A
  **BSDynamicTriShape** (a head) keeps its positions after the shape as Vector4s. NiSkinData's per-bone weights are
  absent (`has vertex weights` 0) - the weights are the vertices' own.
- **Skin and skeleton conventions**: a skin transform maps the skin's space to the bone's (`v_bone = R v + t`), so a
  bone's bind position is `-R^T t`; the skeleton's nodes compose `world = parent.R * local.R`, `t = parent.t +
  parent.R * local.t` (both row-major as stored). An armour shape's skin space is the world (overall transform
  identity); **a body shape's is not** (`femalebody`'s overall is (0, 1.55, -120.34) - its world is the vertex plus the
  shape's translation). Read from one armour's skin, the shapes must not be mixed: the body inside a cuirass has its own.
- **Skyrim's frame is Morrowind's**: Z up, +Y forward, the right +X; a female character from foot to neck 0..113, the
  pelvis at 68.9, arms down about 25 degrees. Morrowind's female bind (the vendored `xbase_anim_female`, the plate's
  scene frame by `plateBind`): pelvis 76.4, neck 114.3, arms level (a T-pose), shoulders narrower (11.7 against 13.0).
  **The bones point along different local axes** (a Skyrim thigh runs down its Z, a Morrowind one down its X), so no
  bone frame carries across.
- **A body armour is the whole body in Skyrim**: no greaves slot - the heavy cuirass holds the trousers to the ankles,
  its aprons hang on their own physics bones (`SkirtFBone`, `SkirtBBone`), and the body under it is a shape of its own.
  The helmet is open under the mask for the wearer's chin; a dark see-through card (`shades`) sits behind its eyes.

## 4. Carrying it onto the Morrowind body

The body is the player's default: **Better Bodies' Dunmer woman** (`modSettings.js` BetterBodiesSource 2,
`Mods/Bodies/Better Bodies/Nude/.../bb_skinf_de.nif`), put at the female bind by `tools/skyrim/mwBody.mjs` - each
vertex the weighted sum over its bones of bind times skin transform (a single bone's answer is off by up to 9 units).

`tools/skyrim/retarget.mjs`:

- **SLICES** for the trunk (`trunkCarry`): height mapped through landmarks (knee, pelvis, the bust's apex, the neck),
  each slice's width and depth scaled from Skyrim's body to Better Bodies'. The profile's reach is +-3: a thin slice on
  these low-poly bodies reads a false waist (a flaring belt became a blade).
- **SKIN** for the trunk (`retarget.mjs:"export function skinCarry"`): a point keeps its distance off the skin -
  measured on Skyrim's body from the slice's axis along its own level direction, laid off Better Bodies' the same way.
  Previewed as B against the worn slices (A): the belt snug, the waist shaped. The owner has not chosen yet; the
  import's default is A (`trunk: 'slices'`).
- **SEGMENTS** for limbs (`segmentCarry`): each bone a segment origin->child; its frame the segment and the world's
  forward (the foot's off the world's side, since it runs forward); lengthwise scaled to the Morrowind bone, across by
  `k`. A hand and its fingers ride the hand's segment WHOLE, scaled by the HANDS' measured length (`handsRatio`:
  Better Bodies 13.32 against Skyrim's `femalehands_1` 15.37 - the bones alone said +8% and made a fist a third too
  big); a foot and its toe ride the foot's.
- **The helmet** rides with THE HEAD IT WAS MADE FOR (`importIronHelmet.mjs` `headFit`): Skyrim's `malehead.nif` nose tip
  and crown put on the Morrowind head's (`SCENE_BODY.head`), shrunk to 0.9, set 1.0 ahead (a Dunmer woman's cheeks
  stood through the mask at 0.88 and 0.3), then raised by `HELM_LIFT` like Mac's open helm.
- **FIT** (`fitOver`): every vertex under the skin pushed out by a margin - a number, or by the part and the point it
  is over - the push smoothed over the mesh. Margins now: 0.35 the cuirass and pauldrons, 0.6 the skirt and trousers
  and the gauntlets over the forearm, 1.0 everything below the knee's top (`KNEE_TOP` 52).

**Weights.** The cuirass and pauldrons keep Skyrim's, mapped to the bones they stand for (`mwBoneOf`: the skirt's bones
to the pelvis, a twist bone to its arm, the pauldron's bone to the clavicle); the gauntlets too (`limbBoneOf`: thumb to
thumb, index and middle to Finger1, ring and little to Finger2, a third joint to its second). **The boots and the
trousers are weighted the plate's way** (`PLATE_RIG` through `pieceRig`): Skyrim weights a heel partly to the calf, and
Morrowind's standing pose turns the foot off the calf as the bind does not - the iron boots floated until they were
weighted as Mac's.

**The cut** (`importIronCuirass.mjs` `pieceOf`), by the bones a triangle hangs on: the Pauldron shape's arm-held
triangles are the pauldrons by side, its spine-held strap and buckle the cuirass's; the trunk the cuirass; the pelvis
and thighs the skirt (belt, plates, the trousers' thighs, the satchel); the skirt's own bones the APRONS, kept in the
skirt (`flaps: true` - without them the front between the thigh plates is a hole); the calves the trousers, worn as
the greaves. Skyrim's body inside is dropped.

## 5. What each piece hides - measured, not copied

Coverage is measured by casting each body vertex's normal at the worn armour: OPEN where it meets none within 10-12,
CLOSE where it meets it nearer than 0.5 (skin the armour, bent on other weights, lets through as the body moves).
A part that hides what it does not cover leaves a hole; a part that covers tightly what it leaves drawn lets it through.

| piece | hides | shows (covers, `showsSkin`) | the measure |
|---|---|---|---|
| iron cuirass | - | the chest (open at the neck: 84 of 518 open, all above z 112) | no modesty shirt under it (`covers`) |
| iron skirt | groin, both thighs | - | with the cuirass: groin 2/155 open, thighs 0/138 |
| iron pauldrons | - | - | ride the shoulder alone; the upper arm drawn |
| iron gauntlets | wrists | the forearm drawn inside the cuff | hidden, the cuff showed hollow at the elbow |
| iron greaves (trousers) | - (`showsSkin`) | - | hidden thighs by the skirt still win (`hiddenUnder`) |
| iron boots | ankles (the foot by its slot) | the knee drawn | the knee: 86/136 above the boot top |
| horned helm | the hair (its slot) | the head - open under the mask | as Mac's open helm |

`composeWornArmor` (`mwItemMap.js`) learned two words for it: `showsSkin` - the slot occupied, its skin still drawn,
the slot counted as covered; and `hiddenUnder` - a showing part's slot that another part hides is hidden after all.

## 6. Painting

`tools/skyrim/bakePainting.py` (and the helm's `adaptIronHelmet.py`): the mesh as worn wears the diffuse and its normal
map; Cycles bakes COMBINED at 1024 - a key from above and in front, level across (mirrored halves share texels), a
dim grey sky, roughness 0.35 for a sheen on the edges - and scales to the set's size. `finishPainting` then gives back
the detail the squeeze lost (an unsharp mask) and brings the tone to ONE reference: Mac's cuirass for the iron
cuirass (mean 48.3 against 47.8, the spread a little over), **the iron cuirass for every other iron piece** (Mac's boots
are much brighter than his cuirass, and toned to them the iron boots came out light). Sizes are the set's: 256 the
cuirass and gauntlets, 128 the boots and the helm - the owner's bar ("+- одинаковую планку качества держать").

## 7. What was learned

- **Judge on the body, in the game.** Every offline sheet lied about something - size first: the Blender preview put
  the Skyrim helm at 0.4 of the shoulders where the game showed 0.6. Each change was sent to the owner to look at,
  front and side (LOOK-AROUND); the dev server (`.claude/launch.json` "dev", port 5199) can load the modules but has
  no game data.
- **Building a famous design from numbers failed four times** (Look-Bench section 4): a bucket, plastic light, a box
  with a cross, a skull. The real asset, adapted, passed at once.
- **Measure what is hidden.** A slot's rule (a cuirass hides the chest, a boot the knee) is the plate's, not every
  armour's; Skyrim's pieces are open and short in other places.
- **Skyrim's weights are for Skyrim's joints.** Keep them where the bones agree (trunk, arms, fingers mapped); weight the
  plate's way where a Morrowind pose turns a joint the bind does not (the foot).
- **Per-piece tone, not per-slot**: one reference for the set.
- **Vite's glob must be written literally** - `import.meta.glob(` cast to quiet the type checker was left undefined in
  the browser and stopped the game (`lookVariants.js` THUMBS; the checker is told to skip the one line instead).

## 8. Where it stands

Judged in the game and kept: the horned helm (the face shows, the eyes), the cuirass and pauldrons ("кираса даже села
и наплечники"), the gauntlets and boots after MW-IRON4. **Open**:

- **The cuirass's trunk**: the belt and hips read shapeless ("бесформенно будто"); the skin carry (B) is ready, the
  owner to choose. The aprons stay.
- **One body**: every mesh is fitted to the woman (the owner's character); a man wears the same.
- **The knee** is drawn and the armour stands 1.0 off it; 36 of its 136 vertices still graze a rim.
- **A whole-set switch** was offered (pick `iron` once for every steel piece) and not yet asked for. The owner's
  question whether the cuirass should hide any greaves was answered no - the greaves have their own iron look.
- **Male variant, other races' bodies, other Skyrim sets** - the tools take another mesh path; the body, the margins
  and the hides must be measured again.

## Files

`tools/skyrim/bsa.mjs`, `sseNif.mjs`, `mwBody.mjs`, `retarget.mjs`, `importIronHelmet.mjs`, `adaptIronHelmet.py`,
`importIronCuirass.mjs`, `importIronLimbs.mjs`, `bakePainting.py`; `tools/bakeHornedHelm.mjs`, `tools/lookThumbs.mjs`;
`src/characters/ownModels/ownArmorModels.js` (`IRON`, `PLAYER_MADE_STYLES`, `part`'s `showsSkin`, `ownArmorParts`'s
`looks`), `src/formats/morrowind/mwItemMap.js` (`looks`, `showsSkin`, `hiddenUnder`), `src/combat/fpArm.js` (the four
compose calls pass `looks`), `src/systems/lookVariants.js` (`mwArmorLooks`, `lookChoices`, `setLookVariant`).

## Tests

`test/systems/lookthumbs.test.js` (the looks and their pictures; the iron cuirass's open chest and no modesty shirt; the
gauntlets' wrist and drawn forearm; the boots' ankle and drawn knee; the trousers showing; the skirt hiding the groin
and thighs over them); `test/formats/morrowind/mwfit1.test.js` (the horned helm leaves the head).

## Equipment worktree handoff (2026-10-29)

The local fork adds cosmetic inventory faces, independent 2D helmet art, the accepted heavy wolf pelt and secondary motion, and a strict shield appearance catalogue. The complete handoff, local-asset reproduction paths and validation limits are in [Equipment-Claude-Handoff](../../docs/Equipment-Claude-Handoff.md). The generated Skyrim/Pelts meshes and textures remain local and ignored; the existing iron set import policy above is unchanged.

## 9. Steel double-bladed battleaxe (MW-SKY-AXE, 2026-10-29)

The owner requested Skyrim's double axe for third and first person and clarified: the STEEL double-bladed axe. `node tools/skyrim/importBattleaxe.mjs`
reads `meshes/weapons/steel/1stpersonsteelbattleaxe.nif` from the same local Skyrim SE install. Its detailed
1351-vertex, 1734-triangle shape is used in BOTH views; blood decal overlays are excluded. The diffuse and normal
map are baked through `bakePainting.py` into a 512px painting with a full mip chain. Outputs
`src/assets/mw/meshes/skyrim_steel_battleaxe.nif` and `src/assets/mw/textures/skyrim_steel_battleaxe.dds` are ignored.

DFU reference: `ItemEnums.Weapons.War_Axe` (128), `WeaponMaterialTypes.Steel` (1), and
`DaggerfallUnityItem.GetWeaponSkillUsed` (Axes). Source:
https://github.com/Interkarma/daggerfall-unity/blob/master/Assets/Scripts/Game/Items/DaggerfallUnityItem.cs
The departure is presentation only: the existing Skyrim local-asset rule now covers this requested weapon;
combat, material and equip laws stay intact. Daggerfall's War Axe is the TWO-handed item; Battle Axe is one-handed.
`localWeaponModels.js` offers this as an OPT-IN skin for War Axes of every material, only when BOTH local files
are present. The inventory card offers Original and Skyrim · Steel Battleaxe, including unequipped axes.
Original is the default; selection is stored in `mwWeaponLooks` by template and material, separate from item data.
Choosing Original restores normal Morrowind resolution. A clean checkout has no Skyrim option. No generated Skyrim data is committed or added to the required asset census.

The handle axis stays +Y in Weapon Bone space. The initial size pass (superseded by MW-SKY-AXE-FIT below) gave the axe
100 MW units (~1.43m) overall, close to Skyrim's original 98.70 units. The previous retail Morrowind length of
56.24 units was too short. The pommel stays at -20.130182 (the measured MW lower-hand reach), with the head
extending to +79.869818; both the shaft and head retain Skyrim's proportions. Relative-size check against retail
Morrowind's actual meshes: iron claymore 115.22, iron longsword 69.10, steel battleaxe 56.73 units. The skin's
100 units are 0.868 of the claymore and 1.447 of the longsword: deliberately shorter than the largest sword,
with the much broader head of a battleaxe. The owner's worn comparison screenshots (2026-10-29) guide acceptance;
this is a relative weapon scale, not a claim that a physical metre measurement proves the in-game look.
The detailed source is retained
for close first-person viewing. `ownWeaponModelFor` feeds the existing shared weapon resolver/preload and icon
paths, so world.js, exterior.js, worldModes.js and dungeonContext.js require no new host logic.

Validation: `test/systems/skyrimBattleaxe.test.js` checks material/type scope, partial-install fallback, parsed
local mesh topology, dimensions, and painting mip chain. A Chromium/Vite probe also verified real URL availability,
preloading, resolveWeaponParts (type 8, no notes), and successful weapon-bone assembly. Types and lint pass.
The broader bible gates expose unresolved references/records outside this slice. Final hand placement, idle framing and attack arcs require
in-game visual acceptance; measured dimensions and offline renders alone do not certify them.


### First-person framing correction (MW-SKY-AXE-FP, 2026-10-29) — superseded by MW-SKY-AXE-FIT

The owner's live report confirmed that the full-size axe leaves only its handle in the first-person frame.
`localWeaponModels.js` now supplies a separate firstPersonAttitude: scale 0.55, a ten-degree inward/forward
turn (Rz(-10) * Rx(10)), and 12 units along the rotated handle toward the pommel. This preserves the shaft's
intersection with the grip origin. It is presentation for the close camera, not a physical-size change.
`resolveWeaponParts` applies it ONLY with firstPerson: true; both the first-person build and live weapon swap
pass that flag. Third-person build/swap, holsters and icons retain the 100-unit full-size mesh.
The real retail first-person idle2c camera projection test verifies the reported failure (zero head vertices
in frame before) and all head vertices in frame after at three idle samples, at 60-degree vertical FOV, 16:9.
This is a camera projection check; it does not certify the owner's alternate animation pack or every attack frame.


### Relative calibration (MW-SKY-AXE-FIT, 2026-10-29)

The owner rejected the existing size coefficients as a reference. Re-measure the COMPLETE meshes (every batch),
not just their first shaft batch. Retail iron longsword length 69.0963, iron claymore 115.2155, iron warhammer
60.0087 / head width 28.7101, steel battleaxe 56.7262 / head width 30.9172 MW units.
The detailed Skyrim source has Y span 98.69747 and X span 35.46468 before import.
Match the steel battleaxe's head width uniformly, preserving Skyrim's blade/shaft proportions: length 86.04195,
head width 30.91720. Anchor the pommel at the retail axe's -19.54190, giving tip +66.50005.
This is 74.68% of the claymore's length and 143.38% of the warhammer's, rather than a sword-length target.
`battleaxeFit.js` owns these measures; `importBattleaxe.mjs` uses them for the local ignored NIF.

First person keeps that SAME scale and orientation. Slide along the handle by -29.31571 units so the head's tip
has the retail axe's +37.18434 reach. Both fists remain on the straight wooden shaft; the extra handle continues
below the frame. This is a deliberate close-camera grip change, not a claim that both views grasp the same marked
point on the handle. It replaces the 0.55 scale, ten-degree turns and twelve-unit slide above.
At 60-degree vertical FOV the head's projected edges are compared with the retail steel axe on the SAME rig/clip,
over three idle phases and 4:3, 16:9 and 21:9, for retail and locally installed ReAnimation idle2c.
Some head clipping is inherited from the reference framing; forcing every head vertex on screen is not the criterion.
DFU reference: FPSWeapon.UpdateWeapon and GetWeaponRect place a 2D sprite; this continues the existing deliberate
3D presentation departure, without changing combat. All four hosts use the existing resolver; none grows.
Numerical projection is not visual acceptance of the body, attack arcs or custom Weapon Widget transforms.


### Diagonal first-person ready placement (MW-SKY-AXE-READY, 2026-10-29)

The owner accepted the diagonal shaft and two-hand relationship in the concept, rejected its oversized visible
forearms, and asked to try the position in the game with the existing hands and weapon. `axeViewPlacement.js`
rigidly places the whole first-person arm pass in lens space: X -20, Y -11, Z -28 degrees, then [8, 20, -14.5]
rig units. These are presentation judgements from the retail rig's projected hands/head, not physical dimensions.
Existing meshes, gauntlets, shaft dimensions, relative grip, clips, clocks and FOV are retained. Third person,
icons and holsters are untouched. The arm pass's recorded view includes the placement for projection/picking.
The placement eases in/out over game time (0.12 s), only for the local Skyrim battleaxe while held; stone,
sheet, death, spell, seat and saddle release it. Changing to another weapon clears it immediately.
DFU reference: FPSWeapon.GetWeaponRect moves the weapon sprite; this is the established 3D lane's presentation
departure. world.js, exterior.js, worldModes.js and dungeonContext.js share this existing arm seam; none grows.
This is an in-game trial of placement, not a new attack-animation set or owner-approved visual result.


MW-SKY-AXE-WIDE (owner correction, 2026-10-29): the short retail axe is NOT the grip/framing target.
The ready pose now uses the existing climb IK on the existing hand bones, with a 24-unit axial wrist separation,
a shaft directed diagonally right/up and forward (45-degree Y over -25-degree X), and the upper wrist at
eye + [7,28,-11] rig units. The existing arm pass moves 15 units forward in lens space for modest hand coverage.
The first-person mesh slides only -10 units along its unchanged shaft instead of the short-axe -29.31571 reach;
a 90-degree turn ABOUT the shaft presents the blade face. Mesh dimensions and third person are retained.
The ready grip eases away during attacks, returning ownership to the existing attack clips, and resumes afterwards.
This supersedes the preceding rigid-only placement and its angles/offsets. In-game visual acceptance remains open.


MW-SKY-AXE-ARMS (owner feedback, 2026-10-29): grip spacing is accepted; the shoulders/cuffs read unlike other weapons.
Remove the forced outward elbow poles and inherit the source clip's elbow plane; keep shrug at zero and retain
the original clavicle/upper-arm attachment points. Lower the wrist pair by 5 rig units (upper wrist eye+[7,28,-16]),
preserving the 24-unit axial spacing and shaft direction. Remove the first-person mesh's quarter-turn about its
shaft: the cutting edge now faces the player rather than presenting the broad blade face. Mesh, dimensions,
shaft slide, third person and attack clocks remain unchanged. Real-rig checks now retain the source shoulder anchors.
This is the next visual iteration; the owner's in-game judgement remains the acceptance criterion.


MW-SKY-AXE-MOD-MOTION (2026-10-29): the owner reports excess shoulder/forearm visibility and movement unlike
the selected improved first-person mod. Read ReAnimation's x1hMovement, x2cMovement and x2wMovement: each owns
walk/run in four directions. The prior fixed eye-relative wrist target suppressed the mod's translation, while
the extra 15-unit camera separation exposed arms behind the hands. Remove that camera separation entirely:
the first-person lens is now the same lens as the other weapons. Ready-grip placement adds the source clip's
eye-relative right-wrist delta from its selected idle source; rotations already follow the posed clip.
Reference sampling uses built.tracks/built.clip, independently of the moving frame, and retains it across steps.
Upper wrist baseline is eye+[7,28,-16], retaining the lower cuff position from ARMS, with the accepted 24-unit grip and edge-facing attitude.
This supersedes the preceding camera offset and fixed wrist target. No custom walk/run oscillator is added.
Third person, attack clocks, FOV, meshes and Skyrim dimensions are unchanged. All four hosts use the common arm seam.


MW-SKY-AXE-IDLE-REFERENCE (2026-10-29): the owner's live screenshot contradicted the isolated renderer.
buildFpArm's initial idle is explicitly sheathed (animWeaponType(mwType, true)); using built.clip/built.tracks
as the drawn-hand reference introduced a large constant offset. Select idle2c through pickAnimSource over
built.sources, using the same reverse-priority source law as playback. Cache against sources and build tracks.
The regression now supplies a real bare starting idle plus the ReAnimation weapon idle, and pins the absolute
drawn wrist location as well as movement deltas; the old movement-only checks could not detect a constant offset.
The isolated pose renderer is not a substitute for the owner's runtime screenshot.

Final edge-of-frame adjustment for this iteration: wrist baseline eye+[7,28,-11], diagonal Y turn 50 degrees
(over the retained -25-degree X turn), and lower grip slid two units toward the upper hand (22-unit separation).
This puts only the lower knuckle area at the screen bottom; the new absolute-position regression checks that
band with the real sheathed build reference and ReAnimation drawn idle. It supersedes the 24-unit/45-degree
ready values above; the accepted mesh dimensions and cutting-edge orientation are unchanged.


MW-SKY-AXE-STEADY (2026-10-29): after the owner accepted placement, the recorded walking/running still read as
excessive waving. The long shaft amplifies the inherited wrist rotation. While locomotion is active, keep 45%
of the right hand's source rotation from the drawn idle, applying the same correction to both hand orientations,
the shaft axis and the lower grip. Preserve the source wrist translation and gait timing; no new oscillator,
head/shaft deformation or camera motion. Fade the angular correction on/off in 0.12 s game time; do not damp
idle breathing, draw/sheath or attack clips. Accepted placement, 22-unit grip and cutting-edge attitude stay.
The correction lives in axeViewPlacement.js; createFpArm only passes its existing movement-state flag and does not grow.
This is a visual tuning judgement, not a DFU combat-law change (reference remains FPSWeapon's sprite presentation).
All four hosts keep their existing shared first-person seam. In-game owner review remains the visual acceptance.
