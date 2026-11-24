# Enhanced Environments

Enhanced environments is the one switch for the enhanced outdoors: a living sky with sun, moons and stars, volumetric
clouds that build with the weather and cast shadows, falling rain and snow that ease in and out, and grass that bends in
the wind. The player meets it as the **Enhanced environments** tile, a three-way choice: Off (Daggerfall's painted sky
and weather), Port sky, or Dynamic Skies.

## How it works

- The tile writes two stores through `src/world/outdoors.js` `outdoorsWrite`: the pref `enhancedEnvironments` and, while
  on, Dynamic Skies' `Enabled` mod setting. `OUTDOORS_DEFAULT` is `dynamic`. Turning the outdoors off leaves the mod's
  switch as it was, so turning them back on restores the same sky.
- `src/scenes/shared.js` composes the lane at mount: `enhancedLane` needs the enhanced skin, the pref on and no
  `?sky=classic`. Under it, `dynamicOn` picks Dynamic Skies or the port's own dome (`src/render/enhancedSky.js`). The
  sky pass is built once per scene, so a change takes effect when the world next loads.
- Parts that hang from the lane, each on its own page: the dome and Dynamic Skies (`Dynamic-Skies.md`), volumetric
  clouds and their shadows (`Volumetric-Clouds-Arc.md`, `src/render/cloudShadow.js`), the weather front and
  precipitation (`Weather-Arc.md`, `src/systems/weather/weatherFront.js`, `src/render/precipitation.js`), the ground's
  snow (`Biome-Precipitation.md`), and the grass (`src/render/labGrass.js`, `src/render/grassMeadow.js`).
- URL doors: `?sky=classic|enhanced|dynamic`, `?clouds=off`, `?grass=off`.
- Online the lane is forced on (`src/systems/features.js` row `enhanced-environments`).

## Rules

Laws for any change to this lane's shaders or GL:

1. A shader change is not gated by eslint, the node suite or a build, because none of them compiles GLSL. Every change
   that touches a shader runs `tools/bootProbe.mjs` and the world render gate.
2. `tools/worldRenderGate.mjs` boots the real exterior against ARENA2 and reads real pixels. It fails on a page error, a
   frame that never advances, a black or flat lower half, an unlit terrain band, or a black sky.
3. The upload law: an upload may create, fill and parameterise an object. It may not draw, bind a framebuffer, clear,
   change the pipeline, or leave a binding behind. New GL calls go through the renderer's bind shadow
   (`src/render/renderer.js` `_use`, `_bindVao`, `markForeignPass`) and its draw counter.
4. A report that cannot be reproduced here gets a URL kill switch, and is not fixed until Mac sees it fixed (Mac).
5. Every surface noise frequency is a whole number of cycles per tile, per axis, so a periodic noise does not seam.
6. The snowpack (`Biome-Precipitation.md`) lays snow where it fell and has not melted. It is drawn by blending each
   fragment toward its climate's winter tile in the cover's share. Tracks in snow are the Snowfall mod's surface
   (`src/systems/snowfall.js`), laid by the ground's cover.
7. The grass shaders are the prototype's (`grass-proto.html`) verbatim, sliced out and compared at test time; the game
   adds only where a blade may stand (grass tiles, not roads or water, not in winter) (Mac).

### Meadow undergrowth and turf

With Tamriel Lands enabled, on eligible grass surfaces throughout the world, meadow grasses grow as instanced solid meshes. Each blade has two triangular cross-sections, a central ridge and an opaque surface. Lanterns and the player’s torch shade each blade primarily by its outward bend, with a smaller contribution from the ridge faces. The nearest tuft has twelve blades. Six and three of those same blades form its middle and distant silhouettes. The short cover spreads low and the flowering tufts carry small polygonal heads. `src/render/villageGrass.js` builds the mesh and `src/render/labGrass.js` places it. DFU's `TerrainNature.LayoutNature` selects nature replacements and distant flats. The solid grass at all three distances is a local art direction for this prototype.

The regional meadow uses the three plants authored in `src/assets/grass/helbenar/Helbenar Shrubs.blend`. The meadow form spreads along low canes, the roadside form branches densely and the wall form climbs on upright leaders. Each shoot carries opaque leaves with a raised midrib and a separate underside. The Blender exporter in `tools/blender/helbenar_shrubs.py` writes three geometry levels per form and their shared botanical texture. The field batches shrub roots by form per visible cell and uses the Landscape pixelation pass. Mapped shrub record 504:1 and its winter archive 505 use these meshes throughout its native range. Their recorded roots are grouped in small cells to keep the classic distant picture beyond 60 metres. The Light grid controls both leaf colour and silhouette. A block covered at least halfway by foliage draws opaque at its nearest covered depth.

The meadow fills gaps between tufts with creeping clover, short swards, broadleaf rosettes and occasional pink flowers from the approved Blender study. The local patch pattern leaves openings between colonies. Cover uses eligible grass roots, checks clearance at its edges, and shares the grass pass, lighting, slope and Light pixel scale. Each form has two authored shapes and three geometry levels. The smallest plants retire individually over 16 to 32 metres.

The final lighting pass compares the visible depth with the depth saved before the grass draw. A nearer leaf keeps its colour across a foundation shadow. Grass and shrubs allow clearance around placed foundations and fence rails, including the town fabric’s yard edges. This local art departs from DFU's climate nature flats (StreamingWorld.UpdateTerrainNature).

The opaque blades and flower heads carry indexed pixel patterns in their local UVs. The Landscape pixelation setting groups the grass field, including meadow cards, smooth blades, pixel tufts and jungle ground cover, into screen blocks using the world's colour and depth compositor. Each block takes the mean grass colour and nearest grass depth if at least half of its samples contain grass. HD draws the original contours. Thin textured blades use the atlas mip chain across their projected width and height. Landscape pixelation applies Light to vegetation and Medium to pond surfaces and shoreline meshes. HD disables both. Existing profiles with any enabled landscape tier use this pairing.

## Code and tests

- `src/world/outdoors.js` - the three-way tile: `OUTDOORS_TIERS`, `outdoorsRead`, `outdoorsWrite`
- `src/scenes/shared.js` - `enhancedLane`, `dynamicOn`, the sky and cloud passes
- `src/systems/uiPrefs.js` - the `enhancedEnvironments` pref, migrated from the older `proceduralSky`
- `tools/worldRenderGate.mjs` - the world render gate; `tools/bootProbe.mjs` - the shader boot probe
- `test/tooling/doctrine.test.js` - holds the gate's checks and this page's naming of them
