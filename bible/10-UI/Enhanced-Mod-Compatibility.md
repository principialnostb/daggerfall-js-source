# Enhanced Mod Compatibility

Current maintenance rules, dependency matrix, attribution and visual conventions: [EMC-Maintenance.md](EMC-Maintenance.md).

The owner requested the catalog on 2026-11-07. It replaces the animation, body and texture tabs with Compatibility and Pixelation. This is a deliberate redesign of the enhanced interface, rather than DFU’s native mod-window layout. [DFU’s ModManager](https://github.com/Interkarma/daggerfall-unity/blob/master/Assets/Game/Addons/ModSupport/ModManager.cs), particularly Awake, SortMods and GetAllModsWithContributes, remains the reference for enabled resources and dependency order; existing .dfmod ordering is unchanged.

`src/systems/enhancedModProfile.js` preserves each controlled setting’s effective value on first read, including Vanilla’s existing mod-backed behavior. It does not reinterpret Vanilla as original game data. Morrowind People, Billboard Look and texture settings are excluded. No animation timing, mesh deformation or overlay order is changed by this menu.

`src/systems/enhancedModResources.js` stores user-supplied folders in a separate IndexedDB database. The current build’s assets remain the fallback. Imported files override identical paths; existing loader patterns still control which files are consumed. Group switches take effect after restart. A failed import leaves the previous stored source intact. This first implementation validates paths and file headers; rig compatibility still belongs to the existing runtime parsers.

The inventory option now gates the inventory’s model figure and model icons, while keeping world models and first-person arms. Paperdoll Enhanced uses the existing .dfmod store. Pixelation labels change without changing their numeric resolution. Campfire presentation can be disabled on the next restart.

Validation is in `test/systems/enhancedModResources.test.js`. Full visual comparison and complete author/source metadata are required before release. The hit-reaction provider has its own resource card and follows the saved profile. Texture cards replace the legacy three-way source controls with resource action buttons; existing saved source values remain compatible. Each of the eight texture cards shows only Nexus search and folder attachment when disconnected, or enable/disable through its existing Source setting and removal when connected. Nested Complete Armor Joints files belong to the add-on rather than its parent armor pack. This extends the deliberate browser resource-manager departure from DFU ModManager.GetAllModsWithContributes described above; runtime overlay order remains unchanged.

## Existing resource connections

The catalog treats resources already resolved by the build as connected, even when they were not imported through the new IndexedDB store. They receive the same reselect and remove actions as a new import. Removing them records a persistent disconnection; source files on disk stay intact. The loaders suppress disconnected resources after restart. Selecting a new source clears that disconnection. File counts deduplicate paths shared by several loader views.

## Inventory mode priority

The inventory mode takes priority over saved 2D face and helmet appearances. In 3D mode the attached rig supplies the figure and item icons. In 2D mode both fall back to the paperdoll and classic item pictures. Saved 2D appearance choices are kept for switching back. The face picker appears with the 2D figure. `test/systems/inventoryPresentation.test.js` covers the mode transition and both rendering consumers.

## Renderer flags and inactive paperdoll controls

The inventory mode also writes the renderer’s existing morrowind3dPaperDoll and morrowind3dInventoryIcons preferences. Previously the catalog changed only its own gate, while the renderer still refused 3D output. Paperdoll Enhanced and BLOODBATH’s helmet customization now share the inventory section. Their controls are disabled in 3D mode, with an explanation; their saved choices remain intact.

Group switches also gate the effective body and animation settings through `src/systems/enhancedModRuntime.js`, without overwriting the saved standard profile. The menu rebuilds the local character through the existing seam. Restart remains necessary for all cached actors and source tables. `test/systems/enhancedModRuntime.test.js` checks the real setting consumers when groups are disabled and restored.

## Resource-aware caches

Active groups, removed sources and imported source revisions now participate in decoded model and inventory cache identities. Byte resources and saved appearance preferences are retained. Disabled bodies do not apply the editor’s stored identity or morphs. An asynchronous build that finishes under an obsolete resource profile queues a replacement instead of installing its result.

The walk loader now checks the animation group before admitting MAO and other movement packs. Animation blending and motion adjustments follow that switch. The replacement archive filters disabled providers instead of retaining their skins behind a cached archive. Cloth replacement follows the body group. These gates affect mod contributions; ordinary Morrowind animations remain available as the fallback. Existing NPC assemblies still require an area reload or restart to be rebuilt.

## Helmet customization choices

Disabling paperdoll customization clears saved 2D helmet choices and invalidates the composed paperdoll. Re-enabling starts from the original helmet art. BLOODBATH’s separate 3D customization switch exposes the model tab. The helmet card shows only enabled customization modes: one tab spans its width, two tabs split it equally. Tests in `test/systems/helmetPaperdollLooks.test.js` cover reset and mode availability.

## Portraits follow the active character

Portraits and the 2D paperdoll now read a shared active appearance identity. With the body group disabled, the editor override is ignored and the character’s actual race, sex and face are used. The editor’s saved identity is retained for re-enabling. Portrait and composite cache keys include the active appearance profile. A portrait rendered under an obsolete profile is rejected. `test/systems/activeAppearance.test.js` covers disabling, restoring, unchanged gameplay identity and obsolete asynchronous results.

## Shield integration and 2D portrait customization

Shield bashes were generated by code over the animation clip, rather than loaded exclusively from a mod archive. The animation group now gates bash selection, the bash pose, the recovery overlay, the hand-to-hand shield stance and the auxiliary left-arm plan. Selected replacement shield meshes follow the body group; the stored look is retained. Existing motion-doctrine gates cover the upper-body, lower-body and shield-set adjustments. The base shield item remains equipped.

Inventory face selection belongs to paperdoll customization. Disabling it hides the face picker and ignores the saved 2D face selection. The selection is preserved for re-enabling, unlike the explicit reset of 2D helmet customization. Item customization indicators disappear when both customization modules are disabled. Model-look selectors require 3D customization.

`test/systems/shieldModGates.test.js` checks real bash/stance/layer decisions, replacement shield selection and 2D face application. This does not certify all combat timing as identical to an unmodified Morrowind installation: the browser port’s attack clock and damage synchronization remain separate runtime systems. Archive animation providers and procedural pose adjustments must both be checked when comparing the running game.

## Optional equipment appearances

Three compact controls under 3D customization manage extra armor, weapons and cloaks. The current lists contain iron armor, the two-handed steel battleaxe and three wolf-pelt colors. Each requires 3D customization and the body group. Extra cloaks also require the cloak-animation switch; the combat-animation group is not required. Disabling a control preserves its saved item choices while returning to standard models. Re-enabling restores available choices. The animation switch selects only Vanilla Animated.

When the EMC body group is unavailable, character rendering returns to the supplied original’s drawBodyPicture path and MW_ARM_PIXEL first-person step. It no longer treats an unavailable custom pixelation control as an explicit HD selection. Tests in `test/systems/extraAppearance.test.js` cover dependencies and reversible armor selection. Visual verification in game remains necessary.

## Pixelation control availability

The first-person hand, player-body and NPC pixelation controls now use the shared tile state to enforce their EMC prerequisite. The earlier check lived in featureRow, which the segmented controls did not use. Unavailable tiles are greyed, their bars are disabled, and their notice names the body group. A stale click handler also refuses writes after the group is disabled. Saved pixelation choices are retained. Decor remains independent. `test/systems/pixelationAvailability.test.js` exercises the actual control states before and after resource connection and group toggling.

## Cloak dependency correction

Cloak animation requires 3D customization and its own enabled switch. It does not require replacement bodies or combat animation packs: Vanilla Animated simulates a standard cloak too. The previous extra body/animation group gates incorrectly suppressed that path. Additional armor and cloak appearances require the complete connected, enabled body/hand group. Additional cloaks also require active cloak animation. UI controls and runtime model selection now use the same prerequisite functions, with missing conditions listed beside disabled controls. Saved switches and appearance choices are retained.

`test/systems/cloakDependencies.test.js` checks a standard animated cloak with the body and combat-animation groups off, and verifies that new armor/cloaks remain blocked until all body resources are connected. The simulation tests remain separate from visual validation on the player’s equipped mesh.

## Catalog language and visual hierarchy

The catalog has its own persisted RU/EN choice in the section navigation. Provider descriptions now explain their actual contribution to this build. Authors and BLOODBATH integration are separate styled fields. Gold headings, warm highlighted integration credits and subdued body text follow the existing game panels. Connection, enable/disable and removal actions use distinct muted colors.

Prerequisites use green checkmarks and red crosses with text labels; color is not the only cue. This applies to resource groups and extra armor, weapon and cloak controls. Equipment headings name TESO 5 armor and weapon sets and list the currently implemented iron armor and steel battleaxe. Their source note requires a Skyrim SE install path. This text does not introduce a directory picker: the current import remains the owner’s local Skyrim tools.

`test/systems/emcLanguage.test.js` verifies English provider/group descriptions, translated readiness labels and restoring Russian without changing resource IDs or gameplay preferences.

## 2D card looks for every piece (PAPERDOLL-LOOKS)

The owner extended the 2D customization past the helm on 2026-11-08, covering armour, weapons, clothing, plain 2D and Paperdoll Enhanced. It changes the player's own inventory card only - the paperdoll figure and the piece's list icon - never the world, a peer or the item. The 3D look stays the separate model choice. Daggerfall Unity draws a piece's own record only (ItemHelper.GetItemImage); choosing another of the game's records for it is a departure. It is not the Wardrobe (`bible/04-Characters/Wardrobe.md`): that look is drawn first, and a piece wearing one is customised as the piece it is drawn as.

`src/systems/paperdollLooks.js` decides what a piece may wear. Armour 102-108 takes the styles of its own material family (`clampArmorVariant`), the owner's choice: a plate cuirass 1-3, plate greaves 2-5, a helm its six. Clothing with styles takes any style of its template, its dye kept. A weapon or shield takes another template's record of its class and hands (blades, hafted, bows, shields; `getItemHands` joins the key), so the doll's either-hand record law still holds. Artifacts and gilded pieces keep their own art. A choice that resolves to the piece's own record or to an earlier one is dropped. Choices live in the `paperdollLooks` pref per template and material; the old `helmetPaperdollLooks` entries still read. Turning paperdoll customization off clears both.

`src/ui/enhanced/paperdollAppearancePicker.js` is the picker for every piece, the helm's included. Each choice is drawn by the doll's own law onto a clear panel (`src/ui/paperDoll.js` paperdollLayerPixels), and compares choices in that shared frame. Each thumbnail crops to its own visible pixels so that small shirts and full outfits remain readable with Paperdoll Enhanced and without it. This changes thumbnail scale only. A choice whose pixels equal an earlier card's (the original first) is dropped. The picker shows while the inventory is in 2D mode and paperdoll customization is on. The list icons read the look through `itemTemplates.js` setPaperdollLookSource, because a direct import there cycles through `paperdoll.js` and `equip.js`.

Tests: `test/systems/paperdollLooks.test.js`, and `test/systems/helmetPaperdollLooks.test.js` for the helm's five other styles (its own appears once, as Original). Not yet checked in the running game.

## 3D looks for every piece (MODEL-LOOKS)

On 2026-11-08 the owner asked for the same per-piece system in 3D, independent of the 2D card look. It covers armour across its family, weapons and clothing, with vanilla Morrowind models plus the Skyrim set when connected. It changes the player's own body and 3D icons only. It never touches the item or the wire (`net/remotePlayers.js` composeLook reads the equip table), and a peer or townsperson in the same piece keeps its own. Choosing a record other than the one the resolver picks is a departure from DFU, which has no 3D look.

`src/systems/modelLooks.js` offers the Morrowind records a piece may be drawn as:
- Armour 102-112 takes every record of the same piece in its family's weight class (`mwItemMap.js` armorWeightOf: leather is light, chain medium, plate heavy). A pair is offered only when both sides exist.
- Clothing takes every garment of its Morrowind type. Cloaks stay the port's own.
- A weapon takes every record of its Morrowind weapon type, so its animations and grip are its own.

Only unenchanted records are offered. Two records drawing the same meshes are one choice, numbered when their names repeat. The resolver's own pick is "Original". Choices live in the `mwRecordLooks` pref per template and material, behind the 3D customization switch.

Several resolvers read the look through the leaf door `src/systems/modelLookSource.js`: `mwArmorRecords` (pick), `mwClothingRecord` (recordId), `pickWeaponRecord` (pick), `dfWornEquipment` (a piece's `mwRecord`), and `fpArm.js` weaponPartPaths, resolveWeaponParts, fpWeaponKey and the icon's record. The registered reader answers only for a piece the player holds (isPlayersOwn: worn, carried, or the Wardrobe's drawn copy of one worn; the player is noted in `weaponRig.js` armBuildOptsOf). A chosen record stands over the port's own model. A record the archives lack falls back to the resolver's pick. `createFpArm` gained `modelCatalog()` and in-place reads in its icon resolution: four logical lines on a host already past its ceiling.

The card's 3D tab is ONE row (`src/ui/enhanced/modelLookRow.js`; the owner, the same day: no split into old and new). The port's own looks come first, then every Morrowind record, paged three at a time; "Original" leads only when the piece has no own look. Choosing an own look puts a chosen record down. The right-click menu lists the card's actions only, never its appearance tabs.

The cards' pictures are drawn as the own looks' baked ones are (`tools/lookThumbs.mjs`): three-quarter view, lit, tight frame, supersampled. They are drawn at runtime from the player's own archives by `src/render/lookThumbRaster.js` (pure) and `src/render/mwLookThumb.js`. A worn piece is drawn as worn: every BODY part its record names, on `base_anim.nif` at rest. A skinned shape is blended by its bones (`skinBatch`, bound by name as `bindPart` binds); a rigid one is placed at its bone, the left mirrored (rule 13). So boots stand as a pair and gauntlets are both hands. A pauldron draws its shoulder and upper arm. A weapon and a shield draw their ground mesh, the blade on the diagonal and the shield stood up. `fpArm.js` loadFromArchives and preloadArmTextures are exported for it, with no new lines.

Tests: `test/systems/modelLooks.test.js`. The `fparm.test.js` MW-D38 pin now admits the `pick` beside the material. Not yet checked in the running game.

The own looks' baked pictures are pairs too (LOOK-THUMBS-PAIRS). `tools/lookThumbs.mjs` draws through the same raster, both halves of a pair, with `closePair` moving the left beside the right; a half held out level (a hand at the bind) is turned down about its middle. Re-run `node tools/lookThumbs.mjs` after changing a model; the steel plate's pictures are committed, the Skyrim set's stay local. Beside own looks with no "classic" of their own, the 3D tab also offers the Morrowind record they stand over (`modelLookOwnChoice`). Without it the steel helm's vanilla Morrowind helmet could not be chosen at all.

HOOD-LOOKS (2026-11-08): a cloak's and plain robes' styles are hood-up and hood-down pictures (`temperature.js` HOODED_CLOAK_VARIANTS, HOODED_ROBES). The 2D card offers a hooded garment only the styles drawn as it is worn now (`hoodUp`, the one hood law), and keeps one saved choice for each state. Raising the hood shows the hood-up choice, lowering it the other. The Casual Cloak has two of each; the Formal Cloak and plain robes have one picture per state, so they get no 2D choice.


## Pixelation presentation and catalog language (2026-11-08)

`src/ui/enhanced/pixelationPresentation.js` owns the four bilingual cards, their descriptions, readiness indicators and the shared EMC / Pixelation RU/EN picker. Both pages use the saved `emcLanguage` preference. The three character controls retain the existing bodies-group gate; decor stays independent. Disabled controls preserve saved levels and leave the existing built-in renderer fallback intact. No renderer or numeric tier values change in this presentation update. The catalog also translates the expanded per-item 2D and 3D customization descriptions, including local-only appearance, material/weight/type limits and cloak hood states. This updates the existing custom menu design, not a DFU window or mechanic.

GARMENT-KINDS (2026-11-08). Measured that day: Paperdoll Enhanced adds no record to choose. It repaints the same records, 109 of the 111 clothing and all 37 armour, once per dye and metal, on the women's archives alone (235-238, 245-248). So the 2D choice is the game's own records with or without it.

To widen it, a garment is now offered every style of every garment of its kind on its own sheet: men's 141-181, women's 182-216 (`paperdollLooks.js` GARMENT_KINDS: top, full outfit, legs, feet, cloak, sash). Its dye is kept and the hood rule holds. Records two garments share are one card. A shirt has about sixty choices, so the picker shows two rows of three when more than nine.

The doll layers and lines a garment as the one it is drawn as: a shirt drawn as a robe goes over the cuirass. `composeDoll` applies 2D looks to the player's own doll alone (`entity.isPlayer` and not a peer); a peer's doll had been drawn in this viewer's choices since the helmet picker.

MOD-BOOSTS (2026-11-08). The owner asked to mark which mods improve the 2D and 3D customization while saying both work without them. Under each feature's description is one line: "Works without mods · enhanced by:" followed by a chip per mod. A chip is lit when that mod is connected and on, and its hover says what the mod adds. 2D: Paperdoll Enhanced. 3D: the bodies-and-hands group, and the additional looks below (`enhancedModCatalog.js` boosts, `.emc-boosts` and `.emc-chip` in `enhancedStyle.js`).

Fixes of 2026-11-08 (the owner: "6 in a row, many duplicate textures, one colour, what you put on is not always what goes on"):
- A card's id was the style alone. With `{ t, v }` looks every garment's style 0 shared one id, so their cards showed one picture and the card pressed was not the look worn. The id is now template and style (`lookId`), labels read "Long Shirt 2", and the vanilla records themselves are all distinct (a shirt's 62 choices are 62 different pictures, measured).
- The picker is three cards a page again.
- GARMENT-DYES: a garment's colour is chosen apart from its shape, from a row of Daggerfall's ten cloth dyes above the cards (`setPaperdollDye`, `d` beside the shape in the same entry). The doll, the list icon and the cards wear it, and Paperdoll Enhanced's pictures follow because the mod paints every record in every dye. With the shape choices, a shirt now has 62 shapes × 10 colours.


## Textures and optional-enhancement presentation (2026-11-08)

The eight texture source tiles retain their existing state objects, handlers, locks and drawers; `src/ui/enhanced/texturePresentation.js` adds bilingual descriptions, known application requirements and the catalog card styling. The third displayed source label is This pack; its index and saved value remain 2. Original and Vanilla retain their existing meaning. This is a presentation change and introduces no new resource import or dependency enforcement.

Optional enhancement rows show explicit In use / Not in use states and a note that the base feature works without them. Their status is distinct from the required dependency list. A malformed CSS pseudo-element glyph was replaced by ordinary DOM text. The documented maintenance contract lives in EMC-Maintenance.md.


## Clothing fit and colours (2026-11-08)

The display identity can change gender without changing the gameplay item. Matching clothing templates now resolve on the displayed body's sheet, for both the doll and its icons (`clothingDisplayTemplate`). The picker includes that sheet's variants. An open card updates its dye and reloads its pictures in place; obsolete asynchronous pictures cannot replace a newer colour. Custom indexed clothing dyes can use the dominant palette band when no blue cloth band exists. Native item dyes retain DFU's band law. The palette uses square framed chips.

The 3D clothing row adds local record colours, an authored-colour reset and name order for long lists. `modelDye.js` recolours the dominant cloth hue while preserving secondary hues, transparency and shading. Original textures remain intact; copied mipmaps are cached by source and dye. The player's private texture hanger applies these copies. Peers and NPCs do not use this path. Thumbnail textures use the same colour operation. A Chromium probe with real ARENA2 clothing verifies that choosing a dye updates the retained picker images and selects one chip. Automatic grouping of records by geometry and texture design remains open; different texture designs must not disappear under a mesh-only comparison. Live visual verification with the owner's mod combination remains open.

Tests: `test/systems/modelDye.test.js`, `test/systems/paperdollLooks.test.js`, `test/systems/modelLooks.test.js`, and the real ARENA2 checks in `test/formats/paperdollart.test.js`.


## Readable thumbnails and adjacent fitting (2026-11-08)

The owner's follow-up asks for readable thumbnails, vanilla and Paperdoll Enhanced support, and a nearby character view while choosing 3D looks. `appearanceFigure.js` opens a floating view from the 3D tab, using the live rig's `figure` with `force` so 2D inventory mode does not hide it. The view turns by dragging or Front/Back buttons, and starts behind the body for cloaks. Build notifications repaint it. The Wardrobe body preview also forces its explicit 3D view when inventory mode is 2D. Switching tabs or closing the card releases the panel, frame request and subscription.

The 2D cloak lining now resolves the same display sheet and custom dye as its outside. The 3D cloak palette uses the actual cloak slot IDs for classic and fur models. Texture filtering distinguishes body skin from cloth files with `_skins` in their names. `clothReplacementDye.js` compares a mod's requested colour to another dye's pixels. Identical pictures use the cloth hue operation; distinct authored colour variants remain intact. The doll and both icon doors share this rule.

The custom indexed dye handles the red band's unaligned start at 0xef, including sashes and sandals; ordinary native dyes retain DFU's exact law. Regression coverage is in `paperdollLooks.test.js` and `modelDye.test.js`. This extends the existing local customization departure from `ItemHelper.GetItemImage` and `ImageProcessing.ChangeDye` recorded in Ledger A.


Browser validation: all 198 declared clothing variants and 128 resolved armour/weapon images were rendered with vanilla art and with the owner's Paperdoll Enhanced bundle enabled. The clothing contact sheets were visually inspected. Neither pass had a blank picture. Every variant changed between red and green after the sash, sandals and identical-colour Eodoric fixes. The UI probe verifies forced 3D display in 2D inventory mode, back-first cloak fitting, turning, and cleanup on tab or card close. These probes run locally from `scratch/`; their game-art contact sheets are not shipped.


## Compact appearance layout (2026-11-08)

The owner supplied a compact card as the size reference. Choice cards return to 76px height; tightly cropped 2D art gets more internal space around it than 3D art. Pagination fills the same height as the cards. The picker suppresses the generic settings panel's left pseudo-element, which crossed the first choice. Search is removed and the catalog/name order remains. The fitting panel explicitly resets the inventory shell's opacity, inset and backdrop styles. A browser check must load both ENHANCED_CSS and PLUS_CSS: testing the appearance fragment alone missed the inherited opacity of zero.


## Fitting follows the item card (2026-11-08)

The fitting panel mounts after the inventory's deferred card placement. Mutation and resize observers follow the card without waiting for a character turn or repeating GPU renders. Its width and height match the item card within viewport limits. Observer subscriptions and pending layout frames are released on close. Choosing 3D carries that tab to other item cards. The close control is 24px. Visible-pixel cropping and a mild display brightness adjustment improve the character's size and contrast without changing its textures.

The panel renders the inventory's active fpArm instance with `figure({ force: true })`. It does not construct a separate vanilla body: enabled body providers, including Better Bodies, identity, proportions and equipment follow the same built rig as the player. Build notifications refresh the picture after the active profile changes.


## Fixed fitting stage (2026-11-08)

The owner replaced card-sized fitting with a fixed 300 by 600px stage, limited by the viewport. Its border meets the item card without a gap. The header stretches across the panel, with a small framed close button at the right. Fitting requests `stableFrame`; `figureFraming.js` frames the body and ignores carried weapons when choosing scale. Per-angle alpha cropping is removed. A long weapon can extend beyond the stage instead of shrinking the body. Other figure callers keep the existing portrait framing and padding. `test/systems/figureFraming.test.js` checks a full turn with a long sword and the unchanged ordinary framing.


## Animated and pixelated fitting (2026-11-08)

The owner removed the catalog/name menu entirely. Cloak thumbnails now resolve the actual own cloak mesh, including each fur look, rather than the unrelated Morrowind clothing row. Thumbnail cache identities include model paths as well as record IDs.

The open fitting panel renders at 30Hz when Animated Cloaks is enabled and cancels that loop on close. `fittingCloth.js` calls the game's existing idle cloth and fur solvers after the preview pose and before mesh upload. Disabled animation performs no extra cloth steps or periodic renders. The player rig and its active body provider remain the source.

`previewPixelation.js` uses the existing `charPixelRows('player')` and screen-height block calculation for item thumbnails and the character canvas. Raster resolution accounts for each preview's displayed height; enlargement uses nearest pixels. Off retains full resolution. Baked own-model pictures go through the same presentation rule. `test/systems/fittingPresentation.test.js` covers resolution and the real cloak solver's enabled/disabled paths. This extends the local appearance UI design; native DFU readers and gameplay animation rules remain unchanged.


Validation for this follow-up: browser probes confirm repeated renders without pointer input, cessation when animation is disabled, and cleanup when the card closes. The real idle cloth solver and resolution calculations pass the focused tests. Runtime thumbnail rendering was also checked against the local classic grey, brown fur and white fur NIFs and textures; each resolves its own mesh and produces the corresponding cloak picture.


## Cloth-independent fitting camera (2026-11-08)

The owner's recording showed the whole figure shifting while the cloak moved. Stable framing excluded carried weapons but still folded animated cloth into the body bounds. `figureFraming.js` now excludes cloak slots through the shared `isCloakSlot` rule and other simulated cloth ranges. The solver keeps moving the cloth; only camera measurement ignores it. Ordinary portrait framing is unchanged. The regression in `test/systems/figureFraming.test.js` varies classic cloak, fur cloak and simulated attachment bounds over 30 frames at 12 viewing angles. It failed before the fix and passes with the camera center and scale equal to the body-only frame.

## Appearance belongs to one item (2026-11-08)

The owner requires a choice for one shirt or pair of pants to leave matching copies alone. Both 2D shape/dye and 3D record, own-model style and dye now use a persistent cosmetic item identity (`itemAppearanceKey.js`). Existing service UIDs are reused; ordinary items acquire `localLookId`, which survives the existing save/restore field copying. Gameplay material, template and native dye stay unchanged. Preferences remain local.

Ambiguous legacy template-wide 2D/record choices and record-wide dyes are ignored: they cannot identify the selected copy. Choose those appearances again on the intended item. Older own-model settings remain defaults; choosing an inventory appearance writes only that item's override. Picker and model-icon caches distinguish instance styles. Renderer dyes resolve the equipped instance rather than another carried copy of the same record.

This extends the deliberately redesigned local appearance UI documented above, rather than changing DFU's item image readers or native inventory rules. `test/systems/itemAppearanceInstances.test.js` checks independently minted matching shirts/pants, save copies, 3D records, own styles and equipped-instance dyes.
