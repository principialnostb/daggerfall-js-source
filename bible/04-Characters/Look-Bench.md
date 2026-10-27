# The Look Bench - pixelated bodies, looks from the pack, the camera round the body, the horned helm

(CHAR-PIX1, LOOK-VARIANTS, LOOK-THUMBS, LOOK-AROUND, LOOK-AROUND2 and MW-HORN1..5, the owner, 2026-10-27, branch
`equipment`; the iron set it led to: `04-Characters/Skyrim-Iron-Set.md`)

> "давай тогда что бы не расходовать лимит предварительно внедрим тестовую подсистему для карточки персонажа в
> инвентаре ... и еще мне нужна какая то функция ... что бы я мог осматривать персонажа от 3го лица"

The owner's direction for the port's own armour: **design and geometry of our own, Daggerfall's look the law, mods a
source of technique and not of assets** (the Skyrim helm was the reference for a motif - a horned steel helm - never a
model to copy). Before a set could be judged, the bench had to exist: a body that sits in the game's pixels, a way to
switch a piece's look where it is worn, and a camera that can walk round the body. This page is the record of the
bench and of the first piece made on it - the horned helm, finished in the end as Skyrim's own (section 4).

**The direction moved on the same day.** Four horned helms made here were judged foreign, and the owner asked for the
real one: for his personal, non-commercial fork the iron set is Skyrim's own meshes and paintings, read out of his own
install and never committed - a departure bounded as ARENA2 is (`04-Characters/Skyrim-Iron-Set.md`, section 1). Mac's
plate and the port's own models keep the opening rule.

## 1. CHAR-PIX1 - the Morrowind bodies, pixelated

> "в оригинале моделька персонажа немного пикселизируется как и у нпс ... сделай эту пикселизацию грамотно"

Daggerfall's people are sprites on its 320x200 frame. The Morrowind bodies left that look at MW-TP-MESH-ALL
(`fpArm.js`), because the old way to it - a picture pasted on a camera-facing card (`characterSprite.js`) - lost
the ground under the feet, popped where a distance switched it and shimmered as it re-rounded its size.

**The pass keeps the mesh and lowers its resolution** (`charPixelLayer.js:"export function drawPixelatedCharacters"`):
the body is drawn under the WORLD's own camera into a low colour + depth target (the clip space squeezed so each texel
is exactly one block of the screen), then written back block by block with each texel's colour AND depth
(`gl_FragDepth`). The perspective, the ground contact and the occlusion are the mesh's own; the blocks sit on a grid
locked to the screen, so a walking body slides under a still grid as a sprite did. The write-back covers the body's box
on the screen alone (a tenth more each side), not the screen.

- **Three dials** (`charPixel.js:"export const CHAR_PIXEL_TIERS"`, Bodies tab, section "Пикселизация"): the
  first-person hands (the viewmodel's own sprite pass, `fpArm.js` draw), the player's body (`mwView.js` passes
  `who: 'player'`), everyone else's (NPCs, foes, guards, other players - drawThird's default).
- **Steps in rows per screen height**, not pixels, so a window or a render scale changes nothing: HD (the mesh, 0),
  Fine 540, Soft 360, Retro 270, Classic 200 (Daggerfall's own frame). At 1080p a block is 2, 3, 4 and 5 pixels.
- **Defaults**: the hands Soft (360 - MW_ARM_PIXEL's 3 on a 1080p screen, what they had), the bodies HD.
- **The bug that hid the body** (fixed): the renderer's front face is CW for its life (`renderer.js` frontFace), so the
  write-back's full-screen triangle was culled as a back; the pass turns culling off for its one draw.

Known: the hands' HD is not quite HD on a screen wider than 1024 (the viewmodel's sprite target, CHAR_SPRITE_RT_SIZE);
a rider and horse write back over the whole viewport (one picture, no box); the tier labels are English in every
language. Considered and left for later: a "like a sprite" step that holds a body's height in texels, so a near body
is chunkier and a far one finer - Daggerfall's own behaviour, which a screen-locked grid does not have.

## 2. LOOK-VARIANTS - a worn piece's looks, turned where it is worn

> "выбирать вариации вещей визуального отображения прям через инвентарь когда вещь надета на персонажа"

`lookVariants.js:"export function lookVariantsOf"` answers a worn item's looks from its own model's `styles`
(`ownArmorModels.js`): the Steel Helm's (closed, open, horned) and, since MW-IRON1-3, the Steel Cuirass's, Pauldrons',
Gauntlets', Greaves' and Boots' (plate, iron). **The helm's look is still the viewer's switch** it always was
(`mwSteelHelm`, the Steel Helm row, moved to the Bodies tab beside the cloaks); **every other piece's is its own**, by the
piece's id in the `mwArmorLooks` pref - the same for every item of that piece, not each item's own. Turning a look
writes it and rebuilds the body as the settings tile does; `composeWornArmor` reads both (`helmStyle`, `looks`).

- **The pack** (`enhancedInventory.js`): a worn piece with looks showed a **Style · <look>** button in its card (each
  press the next look, the card kept up - LOOK-THUMBS made it a row of pictures, below) and a small gold gem in its worn panel's free corner, waking on hover
  (`.wornlook`, `enhancedPlusStyle.js`).
- **The classic inventory** (`nativeInventory.js`): the wheel over a worn piece on the paperdoll steps its look, and
  its tooltip says which (`Look: Horned (3/3) - wheel to change`).

**LOOK-THUMBS - a look is its picture** (the owner: "что б не текстовое название было а превьюшка предмета, я думаю
так гораздо удобнее ориентироваться будет с развитием системы"). The pack's Style button became a row of framed
pictures, one per look, the worn one lit in gold; a pick wears it (`lookVariants.js:"export function lookChoices"`,
`setLookVariant`). `node tools/lookThumbs.mjs` draws them from the looks' own NIFs and DDSs - three-quarters on, lit
from above in front, 96x96 - into `src/assets/mw/looks/<the look's NIF>.png`; a look with no picture yet shows its
name. The horned helm's picture is Skyrim's and ignored by git, drawn by its import. The classic inventory's wheel is
unchanged. `test/systems/lookthumbs.test.js`.

## 3. LOOK-AROUND - OpenMW's preview mode

> "он вертится вместе с прицелом и направить я тебя не смогу никак и оценить кроме как сзади"

`mwCamera.js` left the reference's preview mode out for want of a binding; it is here
(`lookAround.js:"export function stepLookAround"`), on the binding the reference uses, TogglePerspective
(camera.lua:86-111): **tapped, it switches the view; held past 0.25 s in third person, the mouse swings the camera round
the body** while the body stands as it stood (`lookFilter.js` add hands the mouse to the swing). The swing is laid on
the third-person eye (`mwView.js`) and the view follows the eye's `look` (`world.js`'s exterior view now reads it, as
`worldModes.js` already did). **Departures**: the switch fires on the RELEASE (the reference's own, so a hold is not
also a tap), and the release eases the camera home in about a third of a second rather than cutting. The old
`dungeon.js` scene does not have it. The default binding is Mouse4; every letter is spent.

**LOOK-AROUND2 - the hold is a switch** (the owner: "не на удержание кнопки чуть подержал активировалось и крути
верти делай че хочешь, потом снова подержал отключилось"). A further departure: held past 0.25 s the key turns the
swing ON and it stays on after the release; the next hold turns it off and the camera eases home. A tap still switches
the view, but not while the swing is on, and leaving third person ends the swing. `test/player/lookaround2.test.js`.

## 4. MW-HORN1..5 - the horned steel helm, and why it is Skyrim's

> "вместо стального сета дефолтного попытаться сделать адаптацию как стальной сет с рогами", then: "я хотел сделать
> буквально шлем довакина стальной из скайрим 5 ... как пилотный проект"

The Steel Helm's third style, `horned` - the pilot for carrying Skyrim's armour into the owner's fork. Four ways of
MAKING it here were judged in the game and failed; the fifth took the real one. Each failure taught the next:

1. **MW-HORN1, built from numbers** (a skull, crest, brow band, face plate, neck guard, horns - painted from flat tones):
   "огромный и инородный". Judged on an offline sheet with no head, it hid a size 15% over the closed helm and horns
   near three heads wide; brought to size, it was still a BUCKET under PLASTIC light, its rivets too fine for the pixel
   pass. Lesson: **judge a piece on the body in the game, beside the piece it replaces, front and side** - LOOK-AROUND
   exists for that.
2. **MW-HORN2, Mac's closed helm with horns added**: "качество стало гораздо лучше" - the set's own steel and shape sat
   at once - but the pilot was the whole helm, not horns on Mac's.
3. **MW-HORN3, a replica built by eye** (plates with thickness, the light baked per texel from each plate's normal):
   "слабо похож ... огромные проблемы с величиной текстурой ... инородности" - near white beside the dark set, a 256
   picture finer than the set's 128s, a box with a cross for a face.
4. **MW-HORN4, made in Blender** (`tools/blender/hornedHelm.py`: modelled in Blender's frame, which is the scene's; a
   bevelled, riveted copy baked onto the low mesh; `-- preview` renders it beside the closed helm on the set's
   cuirass): "совсем не так ... прям полностью мимо" - a skull's face, a bell's proportions. **The preview lied about
   size**: 0.4 of the shoulders against the game's 0.6. Making the famous design from numbers was given up.
5. **MW-HORN5, Skyrim's own iron helmet from the owner's install** - judged right: the face under the mask, the eyes
   in the holes, the size beside the closed helm 1:1. How it is read, fitted with the head it was made for, opened
   under the mask and kept out of the repository: `04-Characters/Skyrim-Iron-Set.md`.

`tools/bakeHornedHelm.mjs` bakes the helm's NIF from `Steel_Plate_Horned_Helm.fbx` (now the import's output, ignored by
git); `tools/blender/hornedHelm.py`'s `build` writes the same files and is the own-made fallback.

## 5. The iron set

The helm's way carried the rest of Skyrim's iron set - the cuirass, pauldrons, gauntlets, greaves (Skyrim's trousers)
and boots - as the Steel pieces' `iron` look, picked per piece in the look row (`mwArmorLooks`). Everything about it -
the rule that keeps Bethesda's files out of git, Skyrim's formats, the carry onto Better Bodies, the fit, what each
piece hides and why, the painting, what was learned and what is still open - is `04-Characters/Skyrim-Iron-Set.md`.

## Files

`src/render/charPixelLayer.js`, `src/systems/charPixel.js`, `src/combat/fpArm.js` (drawThird and the viewmodel's dial),
`src/player/mwView.js`, `src/player/lookAround.js` (LOOK-AROUND2's switch), `src/player/lookFilter.js`,
`src/scenes/world.js` (the TogglePerspective step and the view's look), `src/systems/lookVariants.js` (the looks, their
pictures, `mwArmorLooks`), `src/ui/enhanced/enhancedInventory.js` (the look row), `src/ui/enhanced/enhancedPlusStyle.js`
(`.look-row`, `.look-pick`), `src/ui/native/nativeInventory.js`, `src/ui/item/itemScroller.js` (a tooltip's extra line),
`src/systems/features.js` (the three dials; the Steel Helm's third tier), `src/ui/settings/settingsMap.js`,
`src/characters/ownModels/ownArmorModels.js` (`horned`, the iron looks), `tools/lookThumbs.mjs` and
`src/assets/mw/looks/` (Mac's looks' pictures; the player-made ones ignored), `tools/bakeHornedHelm.mjs`,
`tools/blender/hornedHelm.py`, `.claude/launch.json` (the dev server, port 5199), `locales/ru/Port_Strings.csv`. The
Skyrim tools: `04-Characters/Skyrim-Iron-Set.md`.

## Tests

`test/formats/morrowind/mwfit1.test.js` holds the third style (the horned helm leaves the head);
`test/systems/features.test.js` lists the three dials; `test/player/lookaround2.test.js` the hold that switches the swing;
`test/systems/lookthumbs.test.js` the looks, their pictures and every iron piece's hides. No test of its own yet for the
pixel pass (`blockPixels` can take one).
Failures met on this branch and NOT made by this work: the HOST-SPLIT ceiling on `createFpArm` (over from the branch's
earlier `fpArm.js` work), CLIMB4's `createWorldModes` handle, MW-FIT1's pauldron row, MW-STEEL1's two rows, MW-STEEL4's
export list, MW-BRIG2, MW-EBONY1, FT18's declared-pref count, ORG2, doctrine's two raster rows (the capes), and the
features list's other rows.
