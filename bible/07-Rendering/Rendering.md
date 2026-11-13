# Rendering

The renderer draws the world in WebGL2: terrain, buildings, flats, characters, water, sky and effects, from
Daggerfall's own data. Presentation is ours (Port-Doctrine): DFU is the reference for what is drawn and with which
numbers, and the renderer is our own code. The player sees it as every frame of the game; the **Graphics** settings
(view distance, grass, ground sharpness, render scale, frame rate cap) and the enhanced rows tune it.

## How it works

### The renderer (`src/render/renderer.js`)

- One `Renderer` per page (`src/main.js`), built once and shared by every scene. The hosts issue every world draw
  themselves, in their own order, from their own culled lists; there is no scene graph.
- **Programs.** Lit solid meshes; Y-locked billboards expanded in the vertex shader (flats, sprites, trees); characters;
  and one tilemap pass, `drawTerrain`, for all ground, exterior blocks and terrain alike. A terrain program has a clip
  variant for pixels Deep Waters' cap patched.
- **Textures** are per (archive, record), uploaded bottom-up as `getColor32` emits them (GL's own texel order),
  REPEAT-wrapped because DFU's UVs run negative, NEAREST because indexed colour means hard pixels. Alpha-0 texels are
  cutouts and are discarded.
- **Classic lighting** happens in display space, on palette bytes: ambient plus the sun's `N.L` (defaults reproduce
  `0.45 + 0.55 * diffuse`), up to 16 point lights with a `(1 - d/range)^2` falloff, a moonlight term on the
  normal-bearing programs (zero by default, so interiors, dungeons and the classic sky are untouched), Better
  Ambience's trilight, emission added after the light, and fog in four modes (`src/render/fogGlsl.js` `FOG_GLSL`).
- **The lighting lane** replaces the world fragment shaders with linear-light ones (`Enhanced-Lighting-Arc.md`).
- **Handedness.** The scene is DFU's left-handed frame (x east, y up, z north). The projection is mirrored once
  (`src/world/mat4.js` `mirrorProjectionX`), and every other consumer, audio included, keeps scene coordinates.
- **State.** The renderer keeps a bind shadow (`_use`, `_bindVao`) and resets it at `beginFrame` and at
  `markForeignPass`, which every pass that changes programs behind its back calls. `renderer.stats` counts draws and
  binds per frame. `src/render/contract.js` types the renderer's contract.

### The frame

- **Smooth motion.** The motor steps at a fixed rate and the camera reads an interpolated eye (`src/player/motor.js`
  `eyeAt(alpha)`); a recentre shifts the previous position with the current one, so no frame lerps across the floating
  origin.
- **Culling.** Pure plane extraction and box tests (`src/render/frustum.js`); every pixel's terrain, placement and
  billboard batch is tested. `?cull=off` is the escape hatch.
- **Batching.** A streamed pixel's static RMB models are one mesh with one sub-mesh per texture
  (`src/render/staticBatch.js`); a dungeon level and an interior room batch the same way. A streamed pixel's batch also
  keeps its triangles by ground column for the near shadow maps (`Performance-Exterior.md`).
- **Depth first.** A dungeon level is one mesh drawn a texture at a time, so a pixel can be lit once for each wall
  drawn over it. Its shadow cells in the view are drawn first, with colour off and depth pushed a little back
  (`src/render/depthPrepass.js`). The lit draw after them is unchanged. On a GPU that tests depth before shading, a
  hidden wall then fails the test before it is lit. This runs only when no lit fragment can be discarded: no cutout
  picture, dissolve, automap slice, view-out pane or glass cut to the view out. It is off by default; `?prepass` or
  `?prepass=on` turns it on for an A/B on real hardware. The pass adds a draw for each run of cells in the view, and
  program and vertex-array binds, so compare the two by GPU time, not by the draw and bind counts.
- **Order.** Opaque meshes first, then the ground (so hidden ground fails the depth test), then the sky passes and the
  far ring at the far plane, shading only the pixels nothing nearer claimed. Water, flats, grass and falling weather
  compose after them.
- **The stream** builds pixel terrain on a worker (`src/world/terrain/terrainGenClient.js`, `generatePixelTerrain`);
  the worker gets its own copy of WOODS.WLD's bytes. `?terrainthread=off` runs the same kernel on the main thread. GL uploads,
  layout, collider and the pixel's publish stay on the main thread and breathe between frames.
- **Compiles** start at boot and are queued so no pass waits on its program (`Performance-Priority.md`).

### Distance

- **View distance.** Land view distance (`landViewDistance`, default 5; DFU's 3 on All off) sets the streamed grid.
  The fog's end scales with the live terrain distance over DFU's 2400 rows (Dynamic Skies' authored rows install
  verbatim). Outer-ring chunks build at a coarser stride; ghost rows give true central-difference normals at chunk edges.
- **Past the grid:** the middle ring (`src/render/midRing.js`), the far province ring of real heights with its own
  projection (`src/render/farRing.js`), the far field to the horizon (`src/render/farField.js`), trees carried a ring
  past the grid (`src/render/farTrees.js`, `src/render/farFlora.js`), landmark silhouettes
  (`src/render/farLandmarks.js`), and one haze law for every surface past the grid's fog (`src/render/horizonHaze.js`).
  A just-built pixel's tint eases in (`src/render/pixelFade.js`).

### The ground

Both terrain programs (classic and lane) are built from shared GLSL chunks, each the twin of a CPU module:

- **Ecotone** (`src/render/ecotoneGlsl.js`, `src/world/ecotone.js`): where two climates meet, a wandering, patchy border
  replaces the map pixel's straight edge; the neighbour's ground comes in as islands that grow toward the seam.
- **Roads** blend into their ground (`src/render/roadEdgeGlsl.js`); **coasts** blend their kinds and cut the sea on a
  wandering line (`src/render/groundEdgeGlsl.js`, `Water-Arc.md`).
- **Snow** lies by the snowpack's cover (`src/render/snowCoverGlsl.js`, `Biome-Precipitation.md`); a steep face over the
  snow cap's line is bare rock (`src/render/snowCapGlsl.js`).
- **The water bed** under enhanced water (`src/render/waterBedGlsl.js`).
- **Filtering.** The ground's tile array is mipped on both lanes, as DFU mips terrain. **Ground sharpness**
  (`groundSharpness`): Off (point over the chain), Default (4x anisotropy), Maximum.

### Wind, grass and the sky

- **Wind** (`src/systems/wind/wind.js`, `windDrive.js`) is its own model in game minutes: a calm a day, a front at each
  weather change that rises over a three-hour lead, holds and rolls away, and gusts shaped by strength. One drift
  integral drives the clouds, shadows, grass, rain and windmills. Enhanced only.
- **Wisps** show the wind as faint streaks (`src/render/windWisps.js`); flats sway with it, or by Windfall's law while
  that mod is on (`Windfall.md`).
- **Grass** (`grassDensity`: Full, Half, Quarter, Off; style `grassStyle`, the meadow by default): the prototype's
  instanced field (`src/render/labGrass.js`), with the pixel-tuft style (`src/render/grassPixelArt.js`) and the owner's
  meadow sprites (`src/render/grassMeadow.js`). Grass dims at night.
- **Skies:** the classic painted panorama (`src/render/skyRenderer.js`); the port's dome (`src/render/enhancedSky.js`);
  Dynamic Skies; volumetric clouds; the aurora (`Dynamic-Skies.md`, `Volumetric-Clouds-Arc.md`, `Skyrim-Aurora.md`).

### Picture size and pace

- **Render scale** (`renderScale`: 100, 85, 75, 67 or 50%) draws the world into an image and presents it linear; it
  shares the retro image, and Retro Mode wins when both are on (`Retro-Mode.md`). The classic skin stays at 100%.
- **Frame rate cap** is DFU's `Video/TargetFrameRate`, applied when 30 or more and VSync is off, as DFU does
  (`src/systems/frameCap.js`).

## Rules

- A shader change is gated by `tools/bootProbe.mjs` and `tools/worldRenderGate.mjs`, not by lint or the node suite
  (`Enhanced-Environments-Arc.md`).
- An upload creates, fills and parameterises; it never draws or leaves a binding behind. Every foreign pass calls
  `markForeignPass`.
- A GLSL block shared by several programs lives in one leaf module and is interpolated, never copied.
- The classic lane keeps DFU's numbers; enhanced looks sit behind their switches.

## Daggerfall Unity

DFU draws through Unity: materials, a billboard batch, terrain tile arrays, Unity's lights and its own linear pipeline,
and interpolated transforms over a fixed simulation step. Departures: our own WebGL2 renderer with display-space classic
lighting (its falloff a recorded equivalence to Unity's point light); the fixed step's camera interpolated by hand; the
far rings, horizon haze and ecotone, which DFU does not draw.

## Code and tests

Core: `src/render/renderer.js`, `src/render/contract.js`, `src/render/glProgram.js`, `src/render/renderTarget.js`,
`src/render/frustum.js`, `src/render/bounds.js`, `src/render/staticBatch.js`, `src/render/depthPrepass.js`,
`src/render/billboardKey.js`, `src/render/flatAnimation.js` (DFU's animated flats), `src/render/windowEmission.js`,
`src/render/fogGlsl.js`, `src/render/orderedDither.js`, `src/render/perfMeter.js`, `src/render/glRelease.js`,
`src/render/gpuTrail.js` (the desktop app's crash trail).

Compile scheduling: `src/render/bootPrograms.js`, `src/render/warmPrograms.js`, `src/render/playPrograms.js`,
`src/render/mountPrograms.js`, `src/render/idleTurn.js`.

Lighting and post: `src/render/enhancedLighting.js`, `src/render/shadowPass.js`, `src/render/classicShadowLane.js`,
`src/render/airPass.js`, `src/render/lightClusters.js`, `src/render/lightId.js`, `src/render/cloudShadow.js`,
`src/render/retroPass.js`.

Ground, water and distance: the GLSL chunks above, `src/render/waterSurface.js`, `src/render/underwaterFog.js`,
`src/render/deepWatersRender.js`, `src/render/oceanHolesRender.js`, `src/render/columnGlsl.js`, the far modules above.

Sky and weather: `src/render/skyRenderer.js`, `src/render/enhancedSky.js`, `src/render/dynamicSkiesRenderer.js`,
`src/render/volumetricClouds.js`, `src/render/cloudNoise.js`, `src/render/cloudsArrival.js`, `src/render/auroraPass.js`,
`src/render/precipitation.js`, `src/render/rainCurtains.js`, `src/render/dryFall.js`, `src/render/lightningBolts.js`,
`src/render/windWisps.js`, `src/render/heatHaze.js`, `src/render/sunbabySkyRenderer.js`.

Characters: `src/render/characterMesh.js`, `src/render/characterSprite.js`, `src/render/skinPalette.js`,
`src/render/portraitRenderer.js`, `src/render/characterStage.js`.

Effects and events: `src/render/spellImpactFx.js`, `src/render/vfxGpu.js`, `src/render/killFx.js`,
`src/render/foeTelegraph.js`, `src/render/telegraphStyle.js`, `src/render/weaponGlowGlsl.js`, `src/render/auraRing.js`,
`src/render/auraPixel.js`, `src/render/armoryPass.js`; the gate (`src/render/gate/`), the Elite Gates (`src/render/eliteGates/`), the Super
dungeon (`src/render/superDungeon/`), the Starfall (`src/render/starfall/`), the dragon (`src/render/dragon/`), the
Sky-Ketch (`src/render/ketch/`), and the event passes (`src/render/rocketPass.js`, `src/render/newEraPass.js`,
`src/render/riteSmoke.js`, `src/render/serpentRender.js`, `src/render/deadlands.js`, `src/render/courtCrystals.js`,
`src/render/spoilsGlow.js`).

World pieces: `src/render/labGrass.js`, `src/render/grassPixelArt.js`, `src/render/grassMeadow.js`,
`src/render/lowPolyTreesRender.js`, `src/render/realWindows.js`, `src/render/windowLight.js`, `src/render/bannerPass.js`,
`src/render/shipFlagPass.js`, `src/render/navalRender.js`, `src/render/comeSailAwayRender.js`,
`src/render/ambientLifePass.js`, `src/render/nodeGlow.js`, `src/render/nodeGlint.js`, `src/render/npcMarkPass.js`,
`src/render/partyPingDraw.js`, `src/render/poiGizmoPass.js`, `src/render/meshAlpha.js`, the card tables
(`src/render/cardTableDraw.js`, `src/render/iliacTableDraw.js`, `src/render/gambitTableDraw.js`).

**The auras in Daggerfall's pixels** (`src/render/auraPixel.js`). Every aura look is answered at the middle of its
texel, a Daggerfall flat's pixel at most (`GLOBAL_SCALE`, 2.5 cm) and half of it at least, a power of two to a unit of
its surface. The ground and the strips measure it off the screen's derivatives. A card is at least 32 texels a side, the
cloth 256 each way, a wing's strand 64 along it and none across. A texel no bigger than the screen's pixel is answered
per pixel. A look's own line widths are at least a texel (`auraPx`), so a fine line is never lost between texels.

The light is cut to ten levels, the squares of tenths, its hue kept, by the ordered dither weighed in light so its mean
holds. A look that covers keeps its colour and has its cover cut to tenths. The Crystal Resonance's squares are its own
pixels and are never resampled. Aura Armory pieces take the levels alone. The passes set `uPixel` to 1; a probe's
`pixel = false` reads the designs per pixel and `'levels'` the levels without the snap (`PIXEL=1 node
tools/auraProbe.mjs` reads every design with the law on). No aura floats its third draw's cards over a rider: a horse,
a cart, a wagon's bench, a dragon, an Admin's /dragon (`src/scenes/auraHost.js` peerMounted). Pinned by
`test/render/aurapixel.test.js` and `test/render/auditaurapixel.test.js`.

Tests: `test/render/glstate.test.js` (every uniform declared where used), `test/render/boot2.test.js` (the entry's
static reach), `test/render/shadermount.test.js`, `test/render/perfface.test.js`, `test/render/retro1.test.js`,
`test/render/depthprepass.test.js` (the level drawn depth first, replayed pixel by pixel beside a twin drawn without).

## Open

- Character meshes draw with back-face culling off, because the rig's faces have inconsistent winding
  (`drawCharacter`); a stronger key light shows their back faces.

## Added on Dev (merged 2026-11-13)

- `campfireBillboards.js` - shared solid campfire and torch replacement, batch movement and resource ownership (HEARTH-LAYOUT, TORCH-3D).
- `treasurePiles.js` - solid dungeon loot and chains, shared mesh ownership, and per-prop pixel profiles (TREASURE-3D, DUNGEON-PROPS-3D).
- `charPixelLayer.js` - CHAR-PIX1 (2026-10-27, the owner: "сделай эту пикселизацию грамотно"; `04-Characters/Look-Bench.md`): the Morrowind bodies pixelated in place - drawn under the world's camera into a low colour + depth target, written back block by block with each texel's depth, on a grid locked to the screen. CHAR-PIX-AVG (2026-11-07, the owner: grey and white pixels on a black bra): a block was one point of the texture, so a fine-grained one (the underwear's fur hem, its grey stitching) gave a light grain the whole never shows; the low target is now drawn up to four times finer each way (src/render/charPixelLayer.js:"export const PIX_SUB_MAX = 4;") and a block is the mean of the body texels it holds, taken where the body covers half of it, at its nearest depth. Tests: test/render/charpixavg.test.js.
- `worldPixelLayer.js` - WORLD-PIX (2026-11-07, owner: separate world and object controls which do not conflict). The Pixelation tab has two more HD/Fine/Soft/Retro/Classic preferences, using CHAR_PIXEL_TIERS: ground and buildings default HD; objects and decor default Fine. The same charPixelLayer pass retains CHAR-PIX-AVG colour averaging, coverage and nearest depth. Opaque drawMesh defaults to environment; classic 41xxx furniture and campfire bodies explicitly choose objects, while campfire flame meshes bypass the generic mesh hook and use campfirePixelFlame at the object tier, so core, translucent shells and detached tongues share the object grid exactly once. Terrain and snow use environment; generic translucent meshes, sprite/UI targets, sky, billboards and character draws bypass these controls. HEARTH-FLAME-PIX (owner, 2026-11-07): the campfire shell is the explicit transparent exception. The shared pass accepts optional write-back opacity (default one, unchanged for characters): each shell records its colour/nearest depth into the isolated target, then blends once per block with world-depth writes disabled and prior blend/depth-mask state restored. HD keeps the original direct translucent draw; CHAR-PIX-AVG averaging/coverage remains unchanged. Merged geometry follows its batch category; this is not an all-screen filter. Each draw takes exactly one category, and an active-pass guard prevents recursion; HD and a one-pixel block bypass the offscreen target. Target allocation selects texture unit zero so world data masks cannot be overwritten; binding caches are invalidated before drawing into the target and caches/projection stamps again afterwards. Snow temporarily leaves its batching bracket for each isolated target: the standalone draw cleans polygon offset and generic vertex channels before pixel depth write-back, then the outer bracket is restored. No character preference changes. At 1080 render height Fine is 2 pixels and Classic 5; at 540 Fine is 1, which explains a subtle close-up result. DFU reference remains DaggerfallBillboard.SetMaterial/Update/AnimateBillboard (Rest-Arc HEARTH-3D); independently adjustable resolution for original 3D props is our deliberate presentation departure, not DFU parity. All four hosts (exterior.js, world.js, worldModes.js, dungeonContext.js) inherit the renderer seam without added host behaviour. Tests: test/world/worldPixel.test.js, test/world/campfirePixelBody.test.js and test/render/charpixavg.test.js. tools/worldPixelProbe.mjs captures real town geometry at 1440x1080 with HD, Fine, Classic and both controls enabled; captures stay ignored under scratch/world-pixel/. The --snow variant also verifies HEARTH-SNOW's footstep-based support bed after late snow loading.
## TORCH-3D (2026-11-11)
The owner requested the campfire approach for wall and floor torches in Dev.
Archive 210 records 6, 16, 17, 18 and 20 now draw original solid shafts,
metal cups, collars and cage prongs, with the campfire's sixteen volumetric
flame poses narrowed to the cup. The original record art was inspected from
the local freeware data to distinguish torches from candles and lanterns.
DFU reference: `DaggerfallBillboard.Update`, `SetMaterial` and `AnimateBillboard`
(Assets/Scripts/Internal/DaggerfallBillboard.cs). Fixed geometry deliberately
replaces camera-facing art; placement, point lights and the 12 fps fire cadence
remain shared. This follows the existing enhancedCampfire preference.
The renderer seam covers exterior.js, world.js, worldModes.js and
dungeonContext.js without growing those hosts, throughout Tamriel.
`src/world/torchModel.js` owns the variants; `src/scenes/torchVisual.js` owns
shared GPU leases and frees meshes, textures and emission on the last release.
Dungeon and interior batches fit wall fixtures to the nearest vertical face
of the static collider at collar height. The bracket spans from that face to
the collar, and the flame clears the stone even if the sprite pivot was
embedded. The shaft leans 18 degrees out about its collar, and the flame
rises vertically from the shifted cup. Floor poles keep their 3D bodies. A wall fixture without a verified wall
keeps its original sprite, including exterior batches without a wall probe. A probe against the static colliders of twelve original
dungeons fitted 831 of 866 wall torches. The menu uses the existing saved preference key.
`test/world/torch3d.test.js` checks selection and shared resource lifecycle;
`tools/torchProbe.mjs` renders local front/back views using the game renderer.
## FIXTURE-3D (2026-11-11)
The owner requested the remaining dungeon lights. Archive 210 now has original
3D art for all thirty records, including braziers, candles, chandeliers,
hanging lanterns and floor posts. Unlit records keep dark materials.
This extends the departure from DFU DaggerfallBillboard.SetMaterial and
AnimateBillboard recorded above. Light positions, ranges and gameplay use
the authored flats. The shared switch is called 3D Light Fixtures.
Dungeon and interior placement reuse the static collider to bridge short
gaps between a hanging fixture and its ceiling. Exterior.js and world.js
inherit the geometry through the renderer and use authored suspension
lengths. WorldModes.js inherits the interior and dungeon placement.
There is no province gate. The fixture draw culls against the view before
creating a mesh or drawing its flames. The shared visual lease frees the
fixture meshes and materials with the last user.
The art revision leaves candles and floor lamps as they were. Braziers use
dark forged bowls with a recessed coal bed and rolled rims. Chandeliers use
iron hoops, candle cups and shaped straps. Unlit fixtures have no flame or
emissive material.
The reference art pass adds bent claws, ribs and rivets to both braziers. The
pedestal also carries inlaid marks and torn cloth. Chandeliers have wax runs.
The owner approved Blender model 03 as the shared pendant lamp. Records 8,
11, 12, 13, 22 and 24–27 use the same mesh and its five authored textures.
The packed GLB geometry keeps its UVs and is scaled to the authored flat
height. Linked chain geometry replaces the rigid shank. A measured ceiling
gap adds links below the original socket, so the socket stays at the ceiling.
Record 12 uses a dark pane and omits the flame. Lit lamps use the shared animated candle flame and draw a separate
translucent pane over it. The renderer shares one GPU mesh
across these records and releases it with the last fixture user. Chandeliers
retain their wheel and candle geometry. The record selector is the seam
for adding distinct lamp variants later.
## TREASURE-3D
The separate 3D Loot card controls the dungeon pile presentation through
`enhancedTreasurePiles`, enabled by default. It takes effect on the next draw
and is independent of 3D Light Fixtures and static dungeon props. Turning
it off draws the existing sprite batches, preserving pickup and saved loot.
Scene-authored dungeon treasure uses eleven owner-selected solid props. Random
piles keep approved rolls and deterministically remap the others. Fixed
placements use their authored record,
and its billboard still owns the pickup, visibility and save state. Other
records keep their sprites. This changes only the presentation of DFU
GameObjectHelper.CreateLootContainer and its DaggerfallBillboard.
DungeonContext opts in both initial placement and restore. WorldModes
inherits dungeon presentation. World and Exterior share the renderer
but their unmarked piles keep their existing presentation. The renderer
shares mesh and paint resources across marked batches and releases them
when the batches retire. No ARENA2 art is included in the solid props.
Sacks have uneven gathered cloth, a double cord wrap, a knot with two
loose ends, and stitches following a fold. The tall sack and the shorter
sacks in mixed piles use distinct proportions. The pile appearance is
stable by dungeon and placement in offline and online play. Treasure paint
uses 16px tiles and the blades use narrow bevels on a flat silhouette. Vessel tops
use planar UVs to keep pixel blocks from stretching across the lid. Large
projected treasure bounds increase object pixel size according to the pile
profile. Weapon piles keep their established response. Coin piles cap growth
earlier and chests use a coarser grid up close with a denser wood texture.
Small piles use the selected tier directly and HD still bypasses the pass.
## DUNGEON-PROPS-3D
- **Burials.** Wooden coffins have joined inner and outer walls, solid rims and thick lids. Stone sarcophagi preserve the original lid poses and ankh. Open cavities place the skeleton on its back and fit nearby treasure where space permits.
- **Furniture and storage.** Tables, seats, chests and crates use distinct plank, grain and end-grain treatments. Closed storage chests keep their searchable identity. Open loot chests show their contents.
- **Cells and devices.** Standing cages have solid bars, doors and plank decks. Torture devices use distinct frames, stone or iron surfaces, and solid fittings. Blood marks are part of the material.
- **Sprite replacements.** Chains, remains, suspended cages, furnishings and cave props retain the authored placement role. Morrowind remains use the player's attached assets. Floor stains stay flat.
- **Pixelation.** Classic prop families have fixed object profiles. Stone burial shells and their skeletons share a fixed 1.5 multiplier. Loot uses its own bounded footprint profile.
- **Review in game.** In a local Dev offline dungeon, press backquote (ё) to open the spawner. Choose a family and place a model or a part of the family. Camera mode uses Alt+Shift+Enter for the selected prop. Previews are scene-owned and clear together with their collision.
- **Scope.** The reviewed furniture is wired in DungeonContext. WorldModes and the standalone dungeon draw it through the shared renderer. Exterior, World and Interior keep their existing furniture. Burial placement departs from DFU RDBLayout.AddModels and AssignFixedTreasure by fitting the visible shell and treasure to the cavity. Sprite replacements depart from RDBLayout.AddFlats.
- **Open review.** Burial accessories, unclassified furniture and storage, banners, statues, columns and the miscellaneous RDB group retain their original models. Moving instances, loot clearance and camera-motion review remain open where listed in the audit.
The [dungeon decor audit](../../docs/Dungeon-3D-Decor-Audit.md) tracks model IDs, example RDB blocks and visual acceptance.
