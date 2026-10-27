# The Look Bench - pixelated bodies, looks from the pack, the camera round the body, the horned helm

(CHAR-PIX1, LOOK-VARIANTS, LOOK-AROUND and MW-HORN1, the owner, 2026-10-27, branch `equipment`)

> "давай тогда что бы не расходовать лимит предварительно внедрим тестовую подсистему для карточки персонажа в
> инвентаре ... и еще мне нужна какая то функция ... что бы я мог осматривать персонажа от 3го лица"

The owner's direction for the port's own armour: **design and geometry of our own, Daggerfall's look the law, mods a
source of technique and not of assets** (the Skyrim helm was the reference for a motif - a horned steel helm - never a
model to copy). Before a set could be judged, the bench had to exist: a body that sits in the game's pixels, a way to
switch a piece's look where it is worn, and a camera that can walk round the body. This page is the record of the
bench and of the first piece made on it, which is NOT finished (section 4).

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
(`ownArmorModels.js`); today that is the Steel Helm's (closed, open, horned). **A look is still the viewer's switch** it
always was (`mwSteelHelm`, the Steel Helm row, moved to the Bodies tab beside the cloaks): turning it on the item throws
that switch and rebuilds the body as the settings tile does - so every steel helm wears the same look, not each item
its own. A look of the item's own is the next step if the bench proves out.

- **The pack** (`enhancedInventory.js`): a worn piece with looks shows a **Style · <look>** button in its card (each
  press the next look, the card kept up) and a small gold gem in its worn panel's free corner, waking on hover
  (`.wornlook`, `enhancedPlusStyle.js`).
- **The classic inventory** (`nativeInventory.js`): the wheel over a worn piece on the paperdoll steps its look, and
  its tooltip says which (`Look: Horned (3/3) - wheel to change`).

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

## 4. MW-HORN1 - the horned steel helm (UNFINISHED)

> "вместо стального сета дефолтного попытаться сделать адаптацию как стальной сет с рогами"

The Steel Helm's third style, `horned` - and the first piece with **no export**: it is BUILT from numbers by
`bakeHornedHelm.mjs:"export function buildHelm"` (a skull with a raised crest, a riveted brow band, an angular face
plate keeled to a V with a nasal and painted eye slits, a neck guard in two stepped tiers, a leather lining, and a horn
each side in a riveted cup), painted by the same tool (256x256, coarse - flat tones, dark seams, light rivets, growth
rings), and skinned the closed helm's way (`PLATE_RIG` helm_closed - the head bone alone; it fills the hair slot and
hides the head). `node tools/bakeHornedHelm.mjs [--sheet]` writes `steel_plate_helm_horned.nif` and `.dds`.

**Where it stands - judged in the game and found wrong.** The owner: "он все равно очень огромный и выглядит инородно
абсолютно". Measured on his screenshots it is now the closed helm's size on the body (0.28 of the body's width against
0.30), so the trouble is not the scale but the piece:

1. **Its shape is a bucket** - a tall, near-cylindrical skull over flat plates - where the closed helm is low, round at
   the shoulders and closes on the neck in mail.
2. **Its surfaces are flat and lit like plastic**: large smooth faces under a smooth gradient, the seams and rivets too
   fine to survive the pixel pass. Morrowind's meshes carry their light and wear in the painting.
3. **It was iterated blind**: the first two passes were judged on an offline sheet that shows no head, which hid a size
   15% over the closed helm and horns near three heads wide. Lesson: **a piece is judged on the body in the game, beside
   the piece it replaces, from the front and the side** - LOOK-AROUND exists for that.

**Next** (the owner: continue in the next chat, "чисто пытаться реализовать корректно шлем"): the skull lower and closer
to the head; the neck guard closing on the neck as the closed helm's mail does; thinner horns; light and shadow painted
into the texture (a highlight up top, darker toward the rim); checked in the game after every change against the closed
helm, front and side. If built geometry cannot reach the retail meshes' finish, the fallback the owner was offered is a
Blender model (his or the team's) with the fitting, painting and bake done here, the way the steel and ebony sets came.

`scratch/helmCompare.mjs` (not shipped) draws the baked closed and horned helms from their NIF and DDS at one scale -
the check that caught the size.

## Files

`src/render/charPixelLayer.js`, `src/systems/charPixel.js`, `src/combat/fpArm.js` (drawThird and the viewmodel's dial),
`src/player/mwView.js`, `src/player/lookAround.js`, `src/player/lookFilter.js`, `src/scenes/world.js` (the
TogglePerspective step and the view's look), `src/systems/lookVariants.js`, `src/ui/enhanced/enhancedInventory.js`,
`src/ui/enhanced/enhancedPlusStyle.js`, `src/ui/native/nativeInventory.js`, `src/ui/item/itemScroller.js` (a tooltip's
extra line), `src/systems/features.js` (the three dials; the Steel Helm's third tier), `src/ui/settings/settingsMap.js`,
`src/characters/ownModels/ownArmorModels.js` (`horned`), `tools/bakeHornedHelm.mjs`, `locales/ru/Port_Strings.csv`.

## Tests

`test/formats/morrowind/mwfit1.test.js` holds the third style (closed, it hides the head);
`test/systems/features.test.js` lists the three dials. No test of its own yet for the pixel pass, the swing or the
looks - each is a pure module that can take one (`blockPixels`, `stepLookAround`/`takeLook`, `stepLookVariant`).
Failures met on this branch and NOT made by this work: the HOST-SPLIT ceiling on `createFpArm` (312 logical lines
over, from the branch's earlier `fpArm.js` work), CLIMB4's `createWorldModes` handle, MW-FIT1's pauldron row, MW-STEEL4's
export list, FT18's declared-pref count, ORG2 and the features list's other rows.
