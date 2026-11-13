# Replacements

The **Replacements** pane lets a player swap one of the game's pictures for a PNG of their own, or a CIF file for a
whole CIF of their own. It is a door of the title screen (beside Overhauls in the foot's box and on its rail,
`HOME_LINKS`, `SECTIONS_BOOT`, `SECTIONS_CLASSIC`) and a pane of the pause window's System tab, under Overhauls
(`SYSTEM_PANES`, `SECTIONS_PAUSE`).

## How it works

**The pane** (`src/ui/replacementsPane.js` `drawReplacementsPane`). Seven tabs on top: Player, Gear, Items, Magic,
Enemies, NPCs, World. The left column lists what the tab can replace, with a filter over the names and, above it,
**Only show replaced**: a toggle that keeps only the things the player replaced a picture of (the green rows), on
every tab, following each change, and says so when a tab has none (`paintList`, `isMine`). Picking a thing shows its
sections on the right (`itemSections`), each a viewer of its own: the thing's pictures, a weapon's first-person frames,
a paper doll's body and heads. A viewer shows its pictures one at a time, with arrows when it has more than one.

**Stepping through the pictures.** X in "Picture X of Y" is a box: a number from 1 to the count typed in it shows that
picture at once, and anything else is not taken (`pictureCounter`); the mouse wheel over the box steps through them,
held to 1 and the count. Under it, **Play** steps through them every `PLAY_FRAME_MS` (300 ms), round from the last to
the first, and reads **Pause** while it plays. Pause, an arrow, the number box, another thing or another tab stops it.
A frame of a swing is named under them (`partWords`: "Strike left, frame 3 of 5").

**Metals.** A weapon's or armour's pictures are drawn in its metal's colours from one picture, so the box asks which
metal (`metalRow`): All metals, or one. Every viewer follows it. A picture chosen for one metal is kept under its dye's
name (`233_12-0_Daedric`) and answers that metal alone; one chosen for All metals answers the rest. Silver's dye is
Unchanged, so a silver item's icon is the All metals one, as DFU's GetName has it.

**CIF sheets.** A sheet is a CIF's records and frames, named by the file the game asks them by (`CifSheet`,
`sheetPictures`). A weapon has two: its plain sheet and its enchanted one (`weaponSheet`), each Diverse Weapons' own
for the template while it is on (`LONGSWORD.CIF`, `LONGSWORDMAGIC.CIF`), else the classic one every weapon of its
kind shares (`WEAPON04.CIF`, `WEAPO104.CIF`, said under the heading). The hands and the werebeast's claws are
`WEAPON10.CIF` and `WEAPON11.CIF`, drawn as iron as the game draws them. Each element's casting hands are its
`FIRE00C6.CIF` and kin, and a race's heads are its `FACE*.CIF`. A frame is shown as an overhaul draws it, else the
classic frame in the metal's colours (`sheetOriginal`), and replaced by DFU's CIF name (`LONGSWORD.CIF_0-0_Daedric`).

**Load CIF.** A sheet's viewer names its CIF (`CIF file: WEAPON04.CIF`) beside **Load CIF** and **Clear CIF**
(`fileRow`). Load CIF takes a whole CIF and keeps it in place of the game's file (`chooseCifFile`), once it has the
game file's records and frame counts, each record in its shape (`cifRefusal`); a refusal is said in red above it.
Each frame's replacement then shows the copy's frame, in the metal's colours, under "From your WEAPON04.CIF". A frame
chosen as a PNG outranks the copy. The file is the classic one, so every weapon of its kind takes it. **Clear CIF**
forgets it.

**Redraws.** Only what changed is drawn again. The frame - the tabs, Import, Export and Clear All, the filter, the list's
and the box's places - is built once (`buildFrame`). A tab is lit on the press and its list and box read after
(`openTab`); a thing picked lights its row in place and draws the box (`pickItem`); the store's answer to a change
repaints the rows' marks, Export, Clear All and the picture shown (`keptChanged`); a refusal and the tools' line
change their own line. A step of Play or an arrow draws the picture alone (`showPicture`), the arrows, Play, Clear and Clear
Selected standing, so a press on them is never lost and Play's word changes on the press. A field typed in keeps the
keyboard and its caret when the menu draws the pane anew (`keepTyping`); a press elsewhere or a Tab lets it go.

- The upper picture is what the game draws without the player's replacement: an overhaul's where one covers it
  (labelled Overhaul), else the original. Under the label stands the picture's file name, the one Import reads
  (`pictureFileName`: `255_0-0.png`; `BODY00I0.IMG.png`; `WEAPON10.CIF_3-2.png`).
- The lower picture is the player's replacement, or None. **Choose** opens the file picker beside it.
- A refused file is said in red above Choose. **Clear**, at the top of the box by the thing's name, removes every
  replacement of the thing: each picture, each metal, its sheets' frames and their CIF files. **Clear Selected**, under
  the pictures, removes the picture shown alone. The overhaul's or the original picture draws again.
- In the list, a thing an overhaul changed is blue and a thing the player replaced is green.

**Overhauls.** Whatever the game draws over an original picture is an overhaul, and the pane shows it as the upper
picture. A TEXTURE picture's is the texture door's below the player (the port's own art, a loose pack, an attached
mod: `pictureBelowPlayer`). A weapon's, the hands' and the claws' frames are the weapon mods' and attached mods'
(`customWeaponImage`). A casting hand's and a head's record is an attached mod's (`dfmodCifRciImage`). An IMG is the
worn UI pack's, else an attached mod's (`imgOverhaul`). A spell icon is cut from the overhaul's sheet
(`overhaulIconSheet`). The list marks the same blue (`picturesCoveredBelowPlayer`, `namesOverhauled`: any frame of a
CIF an attached mod carries, `hasDfmodCifRciFile`, and Diverse Weapons' sheets).

**Clear All**, beside Import and Export and asleep until a picture is replaced, asks on the menu's own Yes/No card ("This will
clear all replacements you have made in the game, are you sure?") and Yes forgets every replacement
(`replacementStore.js` `clearAllReplacements`).

**Import** (`src/systems/replacements/replacementImport.js` `importReplacementZip`), in the bar with the tabs,
takes a zip. Every PNG in it named as DFU names a loose file, in any folder, is held to the same rules against the
original it names: a texture's `{archive}_{record}-{frame}[_{Dye}].png` (`112366/112366_0-0.png`), a CIF frame's
`{FILE}_{record}-{frame}[_{Metal}].png` (`LONGSWORD.CIF_0-0_Daedric.png`) or an IMG's `{FILE}.png`
(`BODY00I0.IMG.png`). A spell icon is `ICON00I0.IMG_{index}.png`, and a painting of the port's own is its name (`PORT_PAINTINGS`:
`held-map.png`, `climb-grip.png`, `climb-reach.png`). A CIF named as one
of the game's (`WEAPON04.CIF`) is held to Load CIF's rule and kept whole. All are kept in one registration.

The line under the tabs says how many pictures and CIF files were imported, and how many matched nothing in the game,
were out of shape, were too big to read, would not read as PNG, or were CIF files of another shape. A name for another
texture map is passed over; of two files with one name, the first stands. The zip is read by `src/scenes/dataSource.js`
`readZipEntries`, which inflates only those files.

**Export** (`src/systems/replacements/replacementExport.js` `exportReplacementZip`), beside Import and asleep until a
picture is replaced, first asks where to save, on the system's own save dialog while the press still counts as the
player's (`src/ui/saveFileAs.js` `askSaveTarget`, the File System Access API's `showSaveFilePicker`). A browser
without the dialog downloads the file to where its settings say. Export then writes every kept replacement into one
stored zip, `dfo-replacements-{date}.zip`, each file under the name Import reads, in DFU's folders (`exportEntryName`:
`Textures/`, `Textures/CifRci/` and `Textures/Img/`, then `Port/` and `Files/` for the port's own). Import keeps such a
zip back whole. A write that fails is aborted and leaves the file on disk as it was; the line says so in red.

**Hostile files** (`src/systems/replacements/replacementSafety.js`). Import, Choose and Load CIF read nothing they
cannot bound, and keep nothing they have not checked:

- A zip past 1 GB is refused before it is opened, and so is one whose files say they inflate past 1 GB together or
  number more than 20,000 (`MAX_ZIP_BYTES`, `MAX_ZIP_FILES`). A file may hold 64 MB (`MAX_FILE_BYTES`), and a chosen
  one past it is refused by its size before a byte is read. A deflated file is stopped as it inflates past what it
  said (`readZipEntries`).
- A name in a zip is matched only when it is plain: a letter or digit, then up to 95 letters, digits, dots, dashes and
  underscores (`isPlainName`). Its folders are dropped. It never becomes a path, markup or a key looked up on an
  object's prototype.
- A PNG is walked chunk by chunk (`cleanPng`): the signature, one IHDR first with a depth its colour type allows, a
  palette where it needs one, an IDAT and an IEND, each chunk whole with a true CRC. An unknown critical chunk refuses
  it. It is kept rebuilt from the chunks that draw it, so text, metadata, an animation and bytes after its end are
  dropped. Markup named `.png` is not a PNG. The browser must then decode it. Export checks each picture again.
- A picture with a side past 16,384 pixels or more than 134 million pixels is refused before it is decoded, and so is
  a CIF whose records are, alone or together (`isTooBig`). A plain CIF stops at 64 records, as DFU's array does
  (`src/formats/cifRciFile.js`), and a record's size below 0 refuses it.
- A kept file's own name is made plain before it is stored (`safeFileName`). The pane writes every name as text
  (`textContent`), never as markup.

**What a file must be** (`src/systems/replacements/replacementRules.js`). A whole PNG (`cleanPng`) that follows an
original: the classic record's size or the overhaul picture's, or bigger in the same proportions
(`followsOriginal`). `SHAPE_ALLOWANCE` lets 2% stand: proportions within 2% of the original's, each side at most 2%
short, as a stretch that small does not show at the original's size. A picture so small that one pixel is more than
2% follows when one scale of the original rounds to both sides. Anything else is refused with the reason and the sizes
accepted. The browser must also decode it.

**Big pictures.** A picture is kept at any size up to what any device holds (`MAX_PICTURE_SIDE`, 16,384 pixels a
side, and `MAX_PICTURE_PIXELS`, 512 MB once read). The renderer shrinks every texture past what the device takes, in
its proportions, as it uploads it (`src/render/renderer.js` `uploadTexture`, `textureLimit`: the device's
MAX_TEXTURE_SIZE; `src/formats/resample.js` `fitToTextureLimit`). A player's own picture, a mod's and a pack's alike.

**A bigger picture** is drawn at its original's size with more detail. The store keeps the size it is drawn at
(`drawWidth`, `drawHeight`, `drawnSize`), and the texture door hands it on as the picture's `box`, which a mod-only
archive measures its records by. Walls, ground and billboards are drawn at the classic record's size whatever the
picture's. The weapon in hand and the casting hands draw a frame, or a CIF copy's record, into the classic record's
box. The paper doll fits a picture to the record's box, composed at four times the classic size while the player has
doll pictures. A bigger spell icon raises the icon sheet's scale (`composeIconSheet`). The player's body is box-filtered
down to the original's size.

**The catalog** (`src/systems/replacements/replacementCatalog.js`).
- **Player**: each race's paper doll (its four bodies, its men's and women's heads and its backdrop); the curses' (the
  werewolf's and wereboar's body and head, the vampire's sixteen heads by race and sex, and its backdrop); the hands,
  the werebeast's claws and the mounts (`MRED00I0.CFA`, `MRED01I0.CFA`) in first person; the climbing hands' fist and
  reaching arm (`public/art/climb-grip.png`, `climb-reach.png`, a left hand the game mirrors for the right); the
  enhanced skin's held map (`public/art/held-map.png`, whose paper must stay where it is); and the third-person body's
  looks from the body sprites the game ships (`eotbSpriteKeys`).
- **Gear**: every item template that can be equipped (the equip table finds it a slot, `getEquipSlot`), a mod's own
  rows too (`customTemplateRows`): its inventory pictures, for both sexes, every race's body and every variant
  (`inventoryItemImage`), and a weapon's two sheets. The port's guns list every picture they have and their
  first-person strip (`portGuns`). The artifacts are MAGIC.DEF's (`artifactItems`): a man's and a woman's icon
  (TEXTURE.432 and .433) and a weapon's own sheet (`EBONYBLADE.CIF`). Templates that share a name are told apart: men's
  or women's, then a cut number (`nameApart`: "Long Shirt (men's, cut 2)").
- **Items**: every other template with an inventory picture - ingredients, drugs, books, religious items, furniture,
  deeds, transport, the arrow, the wand, the guns' pellet and the artifacts that cannot be equipped
  (`inventoryItems`).
- **Magic**: the 69 spell icons of `ICON00I0.IMG`, each element's casting hands, and each element's missile and burst
  (TEXTURE.375 to 379).
- **Enemies**: every row of `ENEMY_BASICS`, both sexes' archives, and Daggerfall Enemy Expansion's own, read from its
  tables (`expansionEnemies`) with its pictures put on the texture door, as a game's load does: its fifty enemies, and
  the two classic classes it draws in pictures of its own (`ClassicClassBase.mdb.csv`: archives 1507-1508 and
  1519-1520), each beside the classic one and named for the mod ("Barbarian (Daggerfall Enemy Expansion)"). Every one
  of its 58 archives is listed, the troll's corpse with the troll.
- **NPCs**: the conversation's faces (`TFAC00I0.RCI`), the special and the children's (`FACES.CIF`, `KIDS00I0.CIF`),
  the townsfolk by race and sex, the town guard, and every standing person of the NPC flat archives, named by
  FLATS.CFG.
- **World**: every other TEXTURE archive (`CLASSIC_TEXTURE_ARCHIVES`), named from the climate tables
  (`worldArchiveName`), every picture the port paints in code, and every archive the port's own art stands in for
  that no other tab lists (`standInArchives`) - read again as a game's load registers more. The painted pictures are
  a set an archive: the studio's eight (`src/systems/studioArt/studioSlots.js` `STUDIO_SETS`: the wagons, the
  galleon, the carrack, the large boat, the towns' hangings, the yards, the port, the LeFay monument) and the port's
  own fifteen (`src/systems/replacements/paintedArt.js` `PAINTED_SETS`: Starfall's stars, the Brass Fissures, the
  guild halls' materials, the Abyss and its remnants, Dagon's Breach and its Burning Court, the Elite Breach's four bands,
  the Sky-Ketch, the figureheads, blood and the Ghostfence). Each preview is painted when asked.

The originals are read from the player's own TEXTURE, CIF, RCI, CFA and IMG files
(`src/systems/replacements/classicRecords.js`). A thing that is the port's or a mod's own, with no picture of the
game's under it, shows its art as its Original, and its row is not blue. A picture the port builds in code (the Weir
Key's, a mod's frame rebuilt from a classic record) is built for the pane from the player's own records where no
game's pipeline is up (`deriveContext`, handed to `textureReplacement.js` `pictureBelowPlayer`), so it shows and takes
a replacement on the title screen too.

**The store** (`src/systems/replacements/replacementStore.js`). Each replacement is kept in this browser's own
IndexedDB database (`dfo-replacements`), never uploaded, by kind: `texture` (a TEXTURE record's frame and dye),
`picture` (a picture the game asks by name) and `file` (a whole CIF). A browser that refuses IndexedDB keeps them for
the tab. Every change, and every boot (`src/scenes/dataSource.js` `registerTextureStore`), hands them to the doors
that draw them: textures to the texture door, pictures and files to `src/systems/replacements/playerPictures.js`.

**The order.** From least to greatest: Original, Overhauls, Replacements, Morrowind.
- `src/systems/textureReplacement.js` `setPlayerReplacements` is a tier above the loose files, the port's own art and
  the mods. It answers with Replace Game Artwork off; one for a dye answers that dye, one for none every other.
- `playerPictures.js` answers a picture by name, a CIF frame's metal first and then every metal, and a CIF copy by its
  file. The weapon in hand asks it before the mods (`weaponFrames.js` `weaponFrameImage`, `src/combat/fpsWeapon.js`
  `loadFpsWeaponArt`); with a copy of the file, the mods are not asked. Weapon Widget leaves a player's frame to the
  classic art (`playerDrawsWeaponFrame`).
- The classic IMG and CIF readers ask one door, the player's picture then their copy then a mod's
  (`src/systems/replacements/ownOrMod.js`): the paper doll and the curses' art (`src/ui/paperDoll.js`), the
  conversation's portrait (`src/ui/native/nativeTalk.js`), the escort faces (`src/ui/hud/hudEscortFaces.js`), the party
  panel (`src/ui/partyPanel.js`) and the mounts (`src/systems/riding.js`, as painted, over the coat's tint).
- The guns draw the player's strip at the strip's own size (`playerStrip`; `src/combat/thunderlockArt.js`,
  `src/combat/gun/pistoletArt.js`).
- The casting hands (`src/combat/fpsSpellCasting.js` `loadSpellCastArt`), the spell icons on both skins
  (`src/ui/spell/spellIcons.js`, `src/ui/enhanced/enhancedArt.js`), the held map (`src/ui/heldMap.js`) and the
  climbing hands (`src/combat/climbHands.js`, loaded again on a change) ask it first.
  The casting hands then ask an attached mod's record, as DFU's TryImportCifRci does. The doll leaves out the worn
  pack's backdrop under a backdrop of the player's own.
- The spell icons on both skins draw an overhaul's sheet where one draws it (the worn pack's, else an attached mod's
  `ICON00I0.IMG`), with the player's icons laid over it (`src/systems/replacements/spellIconSheet.js`).
- The ground's tile set lays the player's tiles over itself (`src/systems/dfmodTextures.js` `dfmodGroundLayers`).
- The player's body draws a replaced frame (`eotbSprite.js` `decodeSprite`).
- A picture the port paints is replaced as any picture is, by its archive and record. The studio's sets already ask
  the texture door (`studioArt.js` `paintedReplacement`). The rest go up through the renderer, which asks
  `src/render/paintedOverride.js` before it puts one up: the player's picture goes up top-down in the painted one's
  place, and its glow is the player's own pixels wherever the painted glow map is lit, at the player's size
  (`paintedArt.js` `glowFrom`). One not decoded yet goes up painted, and the player's replaces it when it lands.
- Not replaceable: the portal skins and the title plates, which are bought with Aurum; the Elite Breach's warnings and
  crumbling, drawn per key; the oak, the land props and the grass, which keep textures of their own; the portal's
  and the card table's art, kept under names rather than numbers; and pictures drawn for one player (heraldry, a ship's
  livery, a horse's coat).
- A frame a mod lights (Daggerfall Enemy Expansion's Will-o'-wisp and Hell Hound) glows from the player's own picture
  once replaced, never from the mod's map, which was painted for the mod's picture; a frame the mod does not light
  stays unlit (`src/scenes/dataPipeline.js` `uploadRecordFrame`), as DFU lights a frame with no map of its own.
- **Nothing bought with Aurum is replaced.** The shop's wares are drawn in code (shaders, SVG, paintings made at run
  time), and none is a picture the pane lists. The one meeting place is the mount looks, which dye the horse's own
  pictures: a horse that wears one draws the game's horse, never the player's, in first person (`src/systems/riding.js`
  `loadRidingArt`) and on horseback, a peer's too (`eotbBody.js`, a decode of its own; `horseCoats.js`
  `wearsMountLook`). A plain horse still draws the player's. The riding items say so (`itemNotes` `mountLook`).
- A Morrowind model outranks a replacement. The pane says so where one draws the thing (`itemNotes`), and says when
  Layered Gearing draws the player on foot instead.

The weapon in hand, the casting hands, the paper doll and the classic spell icons load their art again when the
player's pictures change (`playerPicturesGeneration`). Other pictures show when the game next loads them: a new area,
or a reload for the player's body.

## Rules

- Original < Overhauls < Replacements < Morrowind (the owner).
- A replacement keeps the original's proportions, at its size or bigger, within a small allowance; a refusal says why
  in red above Choose (the owner).
- No picture is refused for its size below what a device can read: the game shrinks one past what a device takes as
  it loads it (the owner).
- Blue marks an overhaul's change and green the player's; replacing an overhauled thing shows the overhaul as its
  original (the owner).
- Clear falls back to the overhaul or the original, whichever the player wears (the owner).
- Import is protected from hostile files (the owner): nothing is read past a bound, among them a picture past 16,384
  pixels a side or 134 million in all, which no device can read; a name is never a path; and a PNG is kept only
  rebuilt from its checked chunks.
- Export asks where to save on the system's save dialog (the owner).
- Anything bought with Aurum cannot be replaced (the owner): a mount look always dyes the game's own horse.

## Daggerfall Unity

DFU reads replacements as loose files named `{archive:000}_{record}-{frame}.png` (`TextureReplacement.GetName`),
`{FILE}_{record}-{frame}[_{Metal}].png` (`GetNameCifRci`) and `{FILE}.png` for an IMG (`TryImportImage`), behind its
asset-injection setting, with no size check. The pane is ours. Its tier departs from DFU: it is ungated, it answers
every dye with one picture, and it refuses a size the game would stretch. A spell icon of its own, a whole CIF in place
of the game's, the held map and the climbing hands are the port's own, and so are Export and Import's checks.

## Code and tests

- `src/ui/replacementsPane.js` - the pane
- `src/systems/replacements/` - the catalog, the rules, the store, the player's tiers, Import, Export and the checks
- `src/ui/saveFileAs.js` - the save dialog, or a download
- `test/systems/replacements_tier.test.js` - the rules, the store and the tier's order
- `test/systems/replacements_named.test.js` - pictures by name, CIF copies, the icon sheet and the readers that ask
- `test/ui/replacements_pane.test.js` - the catalog against the player's ARENA2 and the pane driven
- `test/systems/replacements_import.test.js` - Import over a zip built in the test
- `test/systems/replacements_export.test.js` - Export's names, a zip Import keeps back whole, and the save dialog
- `test/systems/replacements_safety.test.js` - hostile PNGs, names, zips and CIFs
- `test/systems/replacements_aurum.test.js` - a mount look over the game's own horse
- `test/systems/replacements_dex.test.js` - Daggerfall Enemy Expansion's every archive listed, its redrawn classes, and
  a lit frame replaced
- `test/systems/replacements_painted.test.js` - the painted sets, their previews and sizes, and the renderer putting the
  player's picture and glow up in a painted one's place
- `test/replacementFixtures.mjs` - the tests' PNGs and zips
