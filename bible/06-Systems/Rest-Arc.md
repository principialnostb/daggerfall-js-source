# Rest

Online, a rest is an act at a rest point, not hours on a dial. The player faces a lit fire, a bed or a laid Bedroll,
picks **Rest** on the loot plaque, holds still a few seconds, and wakes after one night. Offline, rest is DFU's rest
window, unchanged. The player meets it at campfires (their own, a dungeon's, a hearth), rented and owned beds, and the
R key.

## How it works

**Rest points.** A lit fire (a placed Campfire, a tent's fire, a dungeon's campfire, a world brazier or hearth), a bed
where DFU lets the player rest (a rented room, an owned house, a ship, a guild hall, a dungeon's bed), or a laid
Bedroll as the poor substitute. The R key rests at the point in reach, or says where one is needed. The rest window's
hours, "rest until healed" and loitering are gone online.

**The act** (`src/systems/rest/restAct.js`). The player holds still for `REST_CHANNEL_SECONDS` (6; a Bedroll 10). A
blow, a foe arriving, or the fire or Bedroll going interrupts it. The night is the timed rest's own `RestSession` run in
one step: the character's own clock moves eight hours, so every system that reads the character's time (spells,
diseases, needs, rooms, training, guild waits) sees a normal eight-hour rest. The resting encounter roll still rides
each sub-tick, and an ambush breaks the night at the hour it lands.

**The night interval.** A night passes at most once every 120 minutes of the character's clock, about ten real
minutes of play (`NIGHT_INTERVAL_MINUTES`). A rest inside it is a short rest: it heals and pays the sleep need, but no
clock moves, nothing ages and no encounter rolls. A fire is a place to recover, never a fast-forward button.

**What a night gives.** A night at a bed or a fire ends with full health, fatigue and magicka where the difficulty tier
prices it whole; a rough night on Hard keeps what its eight hours gave. A short rest heals in full where the tier
prices whole, otherwise half of what is missing.

**The Campfire** (template 541; `src/systems/survival/camp.js`, `src/scenes/camps.js`). Placed, rested at, cooked at
and picked back up. It holds 8 nights of fuel (`CAMPFIRE_USES`); a night its owner sleeps at it spends one, and
Firewood refuels it. Every new online character starts with one, and General Stores sell them. A Campfire left in a
dungeon comes back into the pack on leaving. It cannot be repaired.

**Dungeon fires** (`src/world/dungeon/dungeonFires.js`). Every dungeon stands permanent campfires by a deterministic
law: one by the entrance, one before the deepest reach, the rest spaced between, each on flat open floor clear of doors,
enemy and quest markers. They are the same on every client with nothing on the wire. They warm, cook, light and rest,
never burn out and cannot be picked up. Online, no wandering spawn stands within 15 m of one.

**Consumables** (`src/systems/rest/restItems.js`, templates 1700-1706): the Bedroll (10 nights), the Ember Jar (a fire
for one night), Firewood (refuels a Campfire), the Restorative Tonic, the Meditation Candle (magicka at the next
rest), Waking Salts (an hour awake) and the Sleeping Draught (a rough night slept as a bed's). They come from General
Stores and Alchemists, treasure piles and foes, online and offline.

**The party's night** (`src/systems/party/partyRestLaw.js`). Members within 15 m of a rester who sleeps a night are
carried into it and sleep the better of the rester's spot and their own. Nobody is carried in a tavern, temple or
guild hall. Members who press Rest together share one ambush roll. A member inside their own night interval gets a
short rest.

**Quest waits.** A rest never spends a quest's deadline online, and a quest's delay is cut short; the rule is on
`06-Systems/Quest-Arc.md`.

## Rules

- **Resting online is an act at a rest point, one night at a time** (Mac).
- **The Campfire is a reusable tool**; new players start with one, and shops sell more (Mac).
- **Dungeons get multiple strategic campfires** (Mac).
- **Consumables fill the gaps** where no fire stands (Mac).
- **A Field Cook's night at their own Campfire spends no fuel** (Mac; `camp.js` `fieldCookKeeps`).
- **Offline is untouched**: DFU's rest window and its ambushes.

## Daggerfall Unity

DFU's `DaggerfallRestWindow` rests by the hour, until healed, or loiters, and rolls an encounter each hour; the port
keeps it whole offline (`src/systems/rest/restSession.js`). Online the shared world clock cannot be moved by one
player, so the rest window would only fast-forward the character's own clock; the rest act bounds that to one night
per interval at a rest point. The night itself is DFU's session, so nothing it does is restated.

## Code and tests

- `src/systems/rest/restAct.js` - the act, the night, the short rest, the party marks
- `src/systems/rest/restSession.js`, `rest.js` - DFU's rest session and its rules
- `src/systems/rest/restItems.js`, `restItemRows.js` - the seven consumables
- `src/systems/survival/camp.js`, `src/scenes/camps.js` - the Campfire and placed camps
- `src/world/dungeon/dungeonFires.js` - the dungeon fire law; `tools/dungeonFireProbe.mjs` measures it on real data
- `src/systems/party/partyRestLaw.js` - the party's night
- `test/systems/rest/rest1_act.test.js`, `test/systems/rest/auditrestparty.test.js`,
  `test/systems/rest/fb1005_dungeonbeds.test.js`, `test/world/auditrest2_fires.test.js`

## Open

- Crafting recipes for the rest consumables (Bedroll, Firewood, the tonic, salts and draught) are not built.

## Added on Dev (merged 2026-11-13)

## HEARTH-3D - pixel-painted 3D campfire (2026-11-06)
The owner requested a 3D campfire with the game's pixel style. Reference read first: DFU `Assets/Scripts/Internal/DaggerfallBillboard.cs`, `SetMaterial`, `Update`, and `AnimateBillboard` (https://github.com/Interkarma/daggerfall-unity/blob/master/Assets/Scripts/Internal/DaggerfallBillboard.cs). DFU stands archive 210 as camera-facing light flats at 12 fps. Deliberate departure: `world/campfireModel.js` builds original faceted stones, bark-painted logs, ash and a sampled 3D flame volume with sixteen poses at 12 fps. Stone uses original 16px art and wood original 32px art; fire uses four original pixel-painted self-emissive palettes; no ARENA2 pixels or traced silhouette ship. HEARTH-FIT (2026-11-07, owner: integrate the art with the game and correct its excessive size): every exported/cached mesh is now 66% of its previous size, about 0.85 m across. The stone ring is flatter and narrower again, with no extra stones or logs. Bounds follow the same scale; deck transforms remain unit scale. The body stays visible when cold; flames do not cast shadows. HEARTH-VOLUME (2026-11-07, owner: detached tongues and a fire that reads from above): the flame has a 2.64 cm pixel contour after the common size correction in all three axes, with only exposed cell faces uploaded. Three staggered detached tongues curl upward, shrink and cool before disappearing; small sparks are separate. No flame plane faces the camera. Sixteen cached poses keep geometry allocation out of the frame loop. HEARTH-ART (2026-11-07, owner: artistic polish toward the supplied reference): a gold/amber main volume with small irregular cream pockets at its foot, a saturated orange middle and a red-orange outer volume share the same moving field. The body and opaque fire draw early. drawCampWorldFx and drawCampScene flush the transparent shells after the opaque world, ordered far-to-near within the pool, with depth testing and no depth writes. This keeps later buildings and terrain from erasing the orange edge. The two exterior hosts replace their existing magic effect call with the module helper after the opaque world and cutout grass, in walk and fly modes, without growing either host. Broad coherent paint patches and a joined foot replace the flat four-colour mass; smaller detached tongues remain. Three layers are cached per pose. HEARTH-ART II (2026-11-07, the owner's pasted Artistic Polish brief): the large tongue has a changing bent axis in two horizontal directions, a broad joined foot, and second/third-harmonic width and height motion. The runtime slightly varies pose cadence with an independent slow wave rather than allocating more frames. White is localized near the fuel; gold, amber, orange and deep red remain distinct under the existing tonemap. Detached fragments are smaller and follow the main tongue instead of occupying three equally prominent columns. Only stones exceeding the existing width/height thresholds shrink 12%; the ring and log count remain. Sixteen low char/ember pieces fill visible gaps between the five logs; the five logs extend 14% farther within the same stone ring. Stones are lower, individually proportioned and irregularly spaced; bark has wider grain and char has fine hot fissures. Only those fissures emit; cold camps use a non-emissive charcoal material view over the same body buffers. The existing point light sits at 0.46 m to shorten radial stone shadows. The 3D presentation scales its nominal 12 m reach to 6 m maximum, with two small, deterministic flicker waves (0.94 to 1 gain); legacy renderer adapters keep their existing light law. Paired light lists carry its warm colour. The globally shared exposure, tonemap and lighting shaders remain as shipped. The artist probe uses the same enhanced world frame and light; campfireGameProbe restores the real pool in the actual town, frame-syncs, and captures matching close three-quarter views on winter snow and an open summer grass tile read from the real location tilemap. Ground height is raycast instead of taken from the unstepped fly-mode player spawn. No game captures are tracked. Fire emission explicitly uses white rather than the renderer's window tint. The view bounds include the fragments up to 1.8 times CAMPFIRE_SCALE metres. Material study: the active Vanilla Enhanced base 302_3, 302_46 and 302_2 (stone, road, grass) and the player's TEXTURE.050/.054/.067 record 0 (wood) were rendered locally and measured. The wood samples average RGB 102/66/38, 90/66/45 and 89/66/41; the active ground samples average 72/72/73, 108/107/108 and 49/72/39. These are analysis, not copied texels. Stone paint uses 16px restrained grey planes, wood uses subdued longitudinal grain and less contrasted end grain; the original body paint now passes through the existing dfLook palette/grain treatment used by other authored props. Emissive flames keep their own ramp. The game probe confirms dfLookOn() and captures the camp beside an ordinary town NPC, produced by TownPopulation, at its normal size. Shader review: point falloff, sRGB decode, extended Reinhard and bloom stay unchanged; no global exposure correction compensates for the prop. Ground, stone and wood study images stay local and ignored. HEARTH-LIVE/GROUND (2026-11-07, owner: more natural flame movement, warmer colour and adaptation to relief): the main tongue alternates its bend in X and Z, with independent width/height terms; detached tongues follow their birth direction. A brighter golden middle and lower orange opacity recover the earlier lighter look without restoring cuboid fire. The five logs now have individually authored lengths, offsets and tapers; stones alternate five, six and seven sides. `world/campfireGround.js` samples a 3-by-3 grid over a 0.96 m footprint through the existing surfaceHit-first ray seam, including terrain and mesh surfaces. The body vertices follow the bilinear support heights, normals are recalculated, and the fire keeps its vertical matrix. Each camp owns one fitted body GPU mesh with a shared hot/cold material view, cached until its position or ground revision changes and released on removal or teardown. Flat sites share the common mesh. Missing samples retry at most once a second; boat camps retain their existing deck transform and bypass deformation. New placements refuse missing support or a spread above 0.36 m with the existing noGround text before the item leaves the pack. Existing saved/peer camps on unsupported sites retain the unfitted fallback rather than being deleted. No new fields enter the save or wire. HEARTH-FUEL/FINE (2026-11-07, owner: a wider fuel bed, Fine pixelization on everything except fire, and more yellow in the core): `scenes/campfirePixelBody.js` classifies the opaque body as an object; renderer-owned worldPixelLayer draws it through the existing charPixelLayer colour/depth target at the object preference (Fine, 540 rows, by default). The common pass now accepts an optional draw callback; its character default remains the same. Mesh projection is squeezed for the low target and restored afterwards. The pixel rectangle follows the fitted mesh bounds, so terrain adaptation is retained; HEARTH-FLAME-PIX (owner, 2026-11-07) also puts the opaque core, translucent middle/outer shells and their detached tongues on the same object dial via scenes/campfirePixelFlame.js. Shells blend through optional shared-pass opacity without writing world depth; HD retains direct translucency and character averaging remains unchanged. No global resolution or character preference is changed. The golden palette is brighter and the yellow middle extends farther upward, leaving the cream hottest pockets and orange edges distinct. Ground probes, slope normals, rotated sampling, resource ownership and preservation of a rejected item are tested; a synthetic slope render checks contact while town captures check the real surface seam. HEARTH-SNOW (2026-11-07, owner: use the existing footstep snow depression for the camp): scenes/campfireSnow.js registers live fire entries at mount, unregisters on unmount, and reads their current scene positions. snowfallHost calls it after the runtime frame and before surface sync. Once the local snow window is ready, three overlapping short segments press a bed under the stones/fuel through SnowfallRuntime._stampTrack, the same PersistentTrackField/local/mid/far rasterizer as walking. An occupied bed is re-pressed after refill, including a cold fire; removal stops maintenance and leaves normal refill/history ownership. Registration is rebuilt by the usual restore/peer stand path, so no camp save/wire fields change. Decks, hidden camps, indoor pools, disabled/ineligible snow, travel view and camps outside the local window do not stamp. This follows Dynamic Snow's DynamicSnowController.StampTrackSegment (vendor/snowfall/il/DynamicSnow.il.txt, IL_4a58..IL_4ad3) with a deliberate new user: a stationary camp, remaining snow zero in its core rather than a moving player's configured 0.18. THE FOUR HOSTS: exterior.js and world.js inherit this via existing camps/snowfallHost modules; worldModes.js and dungeonContext.js stamp no indoor snow. test/world/campfireSnow.test.js exercises the actual track rasterizer, maintenance and removal; tools/worldPixelProbe.mjs --snow checks late snow loading and all five pixel-control combinations in a real town.
`scenes/campfireVisual.js` owns a shared, reference-counted GPU cache per renderer, released by the camp pool's destroyAll; the pool can acquire it again after restoration. Camp state, fuel, cooking, lights, saves and wire records retain their existing law. Deck camps use the boat's rotation without its model scale.
Four hosts: `scenes/world.js`, `scenes/exterior.js`, `scenes/worldModes.js` and `scenes/dungeonContext.js` now inherit layout campfire replacement through the renderer. HEARTH-LAYOUT (2026-11-10): `render/campfireBillboards.js` replaces TEXTURE.210 record 1 with the shared 3D campfire in buildings, dungeons and outdoors throughout Tamriel. This includes REST3 fires and placed decor. Bowls, braziers, wall torches and model fireplaces keep their own appearance. Indoor kit placement remains forbidden. The original batch retains lights, interaction, animation, removal and classic fallback when Enhanced Campfire is disabled. Creation and movement retain base positions; current batch origins handle streaming shifts. Both batch teardown paths release the shared GPU lease. Tests: `test/world/campfireBillboards.test.js`; existing campfire geometry and renderer batch-shape tests. This extends the departure from DFU DaggerfallBillboard.SetMaterial/Update/AnimateBillboard above.
