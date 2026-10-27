# The Body Editor - one nudity switch, sliders that hold the mesh, the gold editor, the beasts' own bodies

(NUDITY-SYNC, BODY-SHAPE, UV-EDITS-OFF, HD-BODY, EDITOR-B and BEASTS, Gleb, 2026-10-27, branch `equipment`)

> "у нас есть редактор персонажа ... пока он должен использовать better bodies из папки моды"

The Morrowind player's look is edited in `src/ui/appearanceEditor.js` and drawn on Better Bodies' whole-body meshes
(`Mods/Bodies/Better Bodies/{Underwear,Nude}`, one NIF of 19 "Tri *" shapes per race and sex). This page records the
work that made the editor's three promises true: the underwear switch shows what the body is painted with, the
sliders change the figure without tearing it, and the beasts get a body as good as the others'. Daggerfall Unity has no
counterpart (its player is a paperdoll); the departure is the Morrowind body itself (`04-Characters/Characters-Arc.md`).

## 1. NUDITY-SYNC - one switch, and the body is its own modesty

> "надо отключить вообще встроенную одежду которая надевается на персонажа когда отключена нагота и руководиться
> только логикой отрисовки модельки есть на ней отрисованное нижнее белье или моделька голая"

**One value.** The editor's «Нижнее бельё» and the settings' Show Nudity (`ChildGuard/PlayerNudity`, the paperdoll's
welds) are the same switch, underwear = !nudity (`bodyMorphs.js:"export function getUnderwearEnabled"`). The editor's
saved choice is the authority: on the first read it is written over a setting that disagrees, and a later change in
the settings screen is mirrored back into the editor's key - the last action wins and the two never read apart.

**Each variant its own skin name.** Textures resolve first-archive-wins, and the Better Bodies adapter is pushed last,
so `bb_skinf_no.dds` from the Underwear folder lost to the same name anywhere earlier - the nude mesh came up with the
underwear painted on. Every variant now has a name no other archive holds, the same length as the NIF's so the bytes
are rewritten in place (`mwBetterBodiesPaths.js:"export function betterBodiesTextureStem"`): `bu_` underwear, `bn_`
nude, `hu_`/`hn_`/`hh_` the HD pack's underwear, nude and body hair.

**No shirt over a Better Bodies body.** With Show Nudity off `composeWornModest` put the plainest shirt on a bare
woman - right for retail's body, which has no underwear of its own, wrong for Better Bodies, whose underwear skin IS
its modesty. `fpArm.js:"const ownModesty"` names the bodies that carry their own (Better Bodies on, not a werewolf or
a vampire, and for a beast only when Better Beasts has its body); both composes ask `bareChestShown()`.

## 2. BODY-SHAPE - the sliders, rebuilt on the mesh's own landmarks

> "грудь почему то настроена на спину, некоторые ползунки жопы и живота перепутаны друг с другом"

The old deform worked in the mesh's bounding box: the body's front was guessed (retail's `base_anim_female.nif` faces
+Y, Better Bodies' own skeleton -Y - the breasts grew on the back), the bands were fractions of the height (the
"breast" slider moved the belly), and each of the 19 shapes moved its own corners (the shoulders, hips and arms tore
apart at every seam). It is replaced by `src/characters/bodyShape.js`, run in `poseAssembly` after CPU skinning:

- **The frame from bones** (`bodyShape.js:"export function measureBodyFrame"`): heights from `bip01 neck`, `spine2`,
  `spine1`, `spine`, `pelvis`, the limbs' joints; the front from the toe bones, or - retail's skeleton has none - from
  the feet's vertices below the ankle. The torso's half-width and depth are the 90th percentile, so an arm hanging by
  the side does not widen the waist.
- **Regions from skin weights**, not from position: arm, hand, leg each side, and the tail (`TAIL_BONE`). A trunk
  slider moves `1 - arm - leg - tail` of a vertex, so a hand by the hip never follows the hips.
- **Seams welded** (`weldRegions`): the corners several shapes share take one weight and move as one. Measured on the
  retail skeleton, every slider at both ends, female and male, nude and underwear: the widest gap is 0.00.
- **Curves as spheres**: the breasts and the buttocks swell along the radius of a sphere set from the landmarks
  (projection and lift move the same sphere), a midline falloff keeping the cleavage and the cleft where they are.
- **Normals welded after the morph** (`bodyShape.js:"export function weldMorphedNormals"`): each shape re-lit its own
  edge, and a light line ran round the waist where the chest met the groin.

The 20 sliders (`bodyMorphs.js:"export const BODY_MORPH_FIELDS"`) each name what they visibly do, grouped chest,
waist, hips, legs, upper body, overall. Height, arm length and leg length are gone: the head, the hands and worn armour
hang from bones, so a vertex morph cannot lengthen them - that is the skeleton's scale, a change of its own. The storage
key moved to `-v2`: v1's values meant other things. While a morph is set the GPU skin path is skipped
(`thirdSkinReady`), since the morph runs on the CPU-skinned positions.

**UV-EDITS-OFF** (`fpArm.js:"const uvEdits = []"`): `bb_skinf_no-uv-edits.json` was cut to fit the HD female skin onto
Better Bodies' mesh, which it never fits. On Better Bodies' own skins it slid the bra to the waist and broke the legs'
texture at every shape's edge ("stockings" at the thighs and knees). Measured live with and without it; it stays
loadable and is not read.

## 3. HD-BODY - the high-resolution female skin, as a test

`Morrowind-Assets.md` excluded the HD pack after a blurry first try. The cause was a skin without its mesh: the pack's
chest and groin are its own topology. It is now a pair - its mesh and its 2048 px skin, both or neither
(`mwBetterBodies.js:"export function betterBodiesAssetUrls"`) - behind the editor's «HD-кожа · тест» switch
(`HighResolutionBetterBodyFemaleTexturesSource` 2), women only. Checked on one race; it scales to the rest by
the same glob when the owner judges it in play.

## 4. EDITOR-B - dark gold, three columns, figure presets

The owner chose B of the drawn designs ("тёмное золото с пресетами фигуры"; then "редактор прикольный. пойдет"). Three
columns: the look (sex, race, face, hair, the switches) with the figure presets; the model; the body's zones as tabs,
one at a time (`appearanceEditor.js:"const GROUPS = ["`). Four presets (`appearanceEditor.js:"const PRESETS = ["`) -
hourglass, athletic, curvy, slender - set the whole draft, a slider's touch unmarks them, «Сбросить» returns every
slider to 0. Breakpoints at 1100 px and 860 px (one column).

## 5. BEASTS - Better Bodies 3.2's Argonians and Khajiit

> "давай наверное зверей добавим все таки, они щас самое слабое место думаю"

The beasts kept retail's body under a Better Bodies head - the weakest look in the editor. Better Bodies 3.2's
"Better Beasts" ships a whole body per race and sex, `bb_n_<race>_<f|m>_skins.nif`: torso, legs, arms, hands, the tail
and the digitigrade feet, skinned for retail's `base_animkna.nif` as it stands. Only what the beasts use is carried, in
`Mods/Bodies/Better Bodies 3.2 Beasts/` (8 meshes, 16 skins, 2.6 MB of the 37 MB archive):

- `Underwear/Meshes/bb/` is the smoothed mesh, `Nude/Meshes/bb/` the anatomical one - the switch picks the mesh,
  since **no underwear is painted on scale or fur**. The pack's male Argonian is the same mesh in both.
- Its skins carry retail's own names (`TX_B_N_Argonian_F_F` ...), so retail's, cut for retail's mesh, answered first.
  Each is renamed in the NIF to `b3` + the rest of its name, same length, matched in any case
  (`fpArm.js:"function rewriteTextureStemCaseless"`) - the NIFs write `TX_B_N_` and `Tx_B_N_` alike.
- `mwBetterBodies.js:"export function betterBeastsAssetUrls"` returns the mesh and every skin of the race and sex;
  `fpArm.js` loads them on Better Bodies 2, never for a werewolf or a vampire, and falls back to retail's body naming
  the reason when one is missing.
- The tail is its own region (section 2): the hips and buttocks leave it where it stands. On the Khajiit's 511 seams no
  slider opens one.

## Not done

- **The beasts' first-person hands** are still retail's: the pack's `bb_n_<race>_<sex>_hds.1st.nif` are not carried.
- **Worn armour and clothing are not morphed** - a slider shapes the bare body, a cuirass keeps its own shape.
- **Curvybody** (in `Mods/Bodies`, unpacked) is not tried; the other archives there (the 3.2 `.7z`, Body Options, MEL
  Hair) are sources, not loaded.
- **The HD skin** is checked on one race only (section 3).

## Files

`src/characters/bodyMorphs.js` (the fields, the one nudity switch), `src/characters/bodyShape.js` (the deform),
`src/formats/morrowind/mwFirstPerson.js` (`poseAssembly` runs it), `src/formats/morrowind/mwBetterBodies.js` and
`mwBetterBodiesPaths.js` (the variants, HD, the beasts), `src/combat/fpArm.js` (the loads, the modesty),
`src/ui/appearanceEditor.js` (the editor), `Mods/Bodies/Better Bodies 3.2 Beasts/`.

## Tests

`test/formats/morrowind/bodyMorphs.test.js` drives the deform over fixtures shaped like Better Bodies' mesh: every
slider moves the body; the breasts swell the front and not the back or the belly; the waist leaves the chest and hips;
the buttocks push back and never forward; skin weights keep the limbs and the trunk apart; the frame's heights come
from the bones and its front from the feet when no toes are named; a seam's corner moves as one and its normal is one;
the tail is no slider's; the nudity switch and Show Nudity are one value; every skin variant's name is unique and as
long as the NIF's; the beast's mesh by race, sex and underwear and all its skins.
`test/formats/nudeflats.test.js` pins `ownModesty` and `bareChestShown`. Failures in `fparm`,
`better_bodies_first_person`, `nudeflats` and `mwnpc_audit` that were on the branch before this work are not made by it
(16 now, 17 before).
