# Enhanced Water

Enhanced water replaces Daggerfall's flat, painted water tile with translucent water on the enhanced skin: a moving sheet
with weather-driven swell, a carved bed under it, depth that swallows light, Fresnel reflection of the sky, foam on the
shore, ripples from swimmers and boats, and a sea that reaches the horizon. The player sees it in rivers, ponds, moats
and the sea. The classic skin keeps DFU's flat tile. Where the water is for gameplay (feet, swimming, fishing, paths,
boats) does not change.

## How it works

### What Daggerfall draws

Water is record 0 of the terrain tileset, written by every producer of the 128x128 tilemap: the ocean by height
(`src/world/terrain/terrainTiles.js` `generateTileData`), shores by marching squares, rivers by the road painter, and a
town's ponds and moats by the RMB's ground tiles. The terrain pass draws it opaque and unmoving.

### The enhanced water (`src/render/waterSurface.js`)

- **The bed** (`src/world/water/waterBed.js`). A grid vertex is wet when every tile meeting it calls that corner water.
  Its distance to the bank (a 3-4 chamfer) sets its depth, a smoothstep to `BED_DEPTH` (4) over `BED_RAMP` (19.2). The
  ground is carved only past one cell from the bank (`SHELF_CHAMFER`), so the sheet's edge always lies on uncarved
  ground. The bed is drawn only; `heightAt` and the feet read the uncarved samples.
- **Settlement ponds** (`src/world/water/pondSites.js`, `src/world/water/pondCrossings.js`). In the streamed exterior an enclosed component of four or more tiles whose wet corners share one elevation gets a fitted bed, including along stone banks, streets and buildings. Compact ponds keep a detailed dry margin. Large or interlocking ponds replace only their wet tiles. Mesh spacing increases with the extent of the pond to bound the vertex count. At settlement crossings the kernel restores the stamped water before generating the bed. For paving baked into a block it reconstructs a water tile only when neighbouring tiles determine all four corners and the complete outline closes. A bank that ends in the middle of a block edge closes against the neighbouring dry plot.

A standalone grass puddle beside a fitted pond becomes turf when all four neighbouring edges are dry. A connected painted puddle keeps its original grade and water outline. The grass puddle distinguishes water from colours that also occur on the archive’s dry ground. A pond sharing a corner with it has its own water vertex at the lower elevation. Grass, dirt and stone approaches reuse the atlas transition matching each shared dry corner. Wading on painted puddles uses the turned water mask when the feet touch terrain. On a winding basin the turf finish fades into the surrounding material along the exposed edges of its footprint. The raw movement map and the rendering map receive the same shoreline.

  The mixed shore on record 34 follows the water votes of its neighbours at all four corners when the resulting basin closes. The grass and dirt shores sharing a dry corner use a common soil. A tree rooted inside a replacement town boulder is omitted using the height of its drawn triangles at the trunk.

  Roads, foundations and bridge decks reserve their footprint against bank planting. Where the excavation exposes a ground-storey wall or a yard fence, its lower edge limits the cut. Placed fence sections 41206–41208 follow their rotated rail line, including the single-post sections in Helbenar. The soil meets the wall and slopes back into the basin over a few metres. Rendering, wading and shore planting sample that fitted bed. Trees rooted in the water are excluded before the flat, its solid and its logging entry are registered (departure from DFU RMBLayout.AddNatureFlats). The dry approach retains its paving. Painted puddles outside the fitted banks, open coasts and pixel seams keep their existing treatment.

On a sloping bank the water stays below the lowest rim. Dry ground retains its original triangles. Wet ground descends from that local grade to the bed, subject to the same fence and foundation limits. The rendered mesh and movement queries sample the same profile.

A basin follows the wet edges shared by neighbouring tiles. Where an authored bank and a generated river disagree at a shared corner, both edges taper to land there once the basin closes. An authored shore can meet the dry terrain or the finished road beyond a town outline. A rectangular patch must contain exactly the water tiles belonging to its basin.

The coverage test stamps town layouts on level ground and checks each vertex that four original basin tiles agree is wet. It also samples the procedural town outlines and checks the finished terrain beside real roads in Bubyrydata and Berbaaqnia. See `test/world/terrain/pondcoverage.test.js`. With ARENA2_PATH set, `node tools/pondTerrainSweep.mjs` lists the settlements and coordinates where authored water falls outside the fitted bed on the generated terrain. The sweep exits with a failure on uncovered water. Add `--rivers` to include the Basic Roads rivers and streams.
  Submerged ground placements of town fountains, signposts, hanging signs and mountain ground sprouts are omitted from the flat groups and their cover bodies. Loose pole and rack sprites are also suppressed inside these basins, except on the surveyed reed deck. Their dry and elevated copies keep their authored placement.

- **Skyrim village pond** (`src/world/water/pondTerrain.js`). At map pixel (1551, -372), a 0.32 m grid follows the
  water corners of the surveyed settlement. The water sits 0.44 m below the street and the deepest floor is 1.55 m
  below the street. A curved channel crosses the diagonal shore tile between the two bowls. The ground descends from street grade along a single slope.

  Small indentations widen the cut in plan. `src/world/terrain/earthBank.js` measures the finish distance from that contour. The exposed earth follows the actual slope and height above
  water. The grass finish fades from the contour into the dry approach over 5.5 m. A seamless procedural tile supplies fine loam, matted grass, clustered grit and sparse fibres. Wet silt darkens at the foot of the bank.

  The soil projects vertically on cut faces where a narrow darker band picks out the roots. Grass tufts grow at breaks of slope. Their blades share a compact base, follow the ground at both root corners and bend outward above the bank. Each of the six uprights on a 3D reed rack samples the rendered floor triangle under its foot
  and extends 0.12 m into submerged ground.

  The reed deck keeps its authored height. Four small clumps of rushes and three pairs of stones follow the rendered shoreline. Each stone meets the slope along its footprint. The woodland-hills ground sprout is drawn on dry land. Its wet instances are omitted from the billboard batch, including when its seasonal picture changes.
  The Objects pixelation setting sizes the pond's reflection, ripple and refraction-direction samples in screen pixels.

  HD shades each fragment. The depth test and bank coverage use the original fragment in every tier. Blue-green
  scattering obscures the bed with distance through water, and the full-quality shore fades over 4.5 cm of depth.
  The shore mesh shares the terrain's lifetime and is drawn before refraction. The streamed exterior walks and seats its ground flora on these same triangles.

  This fordable pond departs from DFU `PlayerMotor.GetOnExteriorWaterMethod` by measuring the water at the feet. On foot, movement slows with immersion, reaching the character’s swimming pace at one metre. A water-walking effect supports the player on the sheet at their dry pace. Fixed exteriors, interiors and dungeons have no surveyed pond.

- **The bed's face** (`src/render/waterBedGlsl.js`). Under the enhanced water a ground water texel takes the climate's
  dirt darkened to silt. A shore record's painted water outside the sheet goes under the silt too, and the fringe beyond
  is wet mud (`src/world/puddleMask.js` `shoreWaterColours`, `SHORE_DRY_RATIO`).

- **The swell.** Three wave trains about the wind, at deep water's speed, their height the wind's from `SWELL_CALM`
  (0.05) to `SWELL_GALE` (0.34), faded over the bank. `swellAt` is the same sum on the CPU. The open sea takes the swell
  as slope only. On a transition tile the sheet fades its fallback optical depth towards the bank, so silt shows at
  the edge of small ponds without a carved bed. Full quality still uses the depth of submerged surfaces in the frame.
  At grassy banks a narrow strip of wet silt and a weaker sky reflection make that shallow water visible.

- **The body.** Beer-Lambert absorption (`WATER_ABSORB` 0.55, 0.30, 0.22 a unit), replaced by the water's own colour
  (the climate's water texel's mean) lit by the ground's light. On the lighting lane the frame's colour and depth are
  copied once a frame before the first water draw (`AirPass.snapshotUnderWater`), so the water refracts what lies under
  it. Only the part of the frame the water can read is copied (`waterRowsReach`, `Performance-Exterior.md`). On the
  classic lane the blend does the same sum. Schlick Fresnel over the sky (capped at 0.85), glints of sun,
  moon and lamps, the fog.

- **The shore.** Foam over the shallow band (`FOAM_DEPTH` 0.22), its edge riding the swell up the bank (`FOAM_RUNUP`),
  cut into lace by drifting noise; steep crests whiten in a strong wind. Come Sail Away's sprite breakers stand down
  under the enhanced water.

- **The ripples** (`src/world/water/waterRipples.js`). A damped wave equation (`RIPPLE_DAMPING` 0.975) on a 96-cell grid
  48 units round the camera at 30 Hz, stirred by the player and every boat afloat. Uploaded only when it moved.

- **The open sea.** Iliac Puddle No More's surface sheets (Deep Waters) are drawn by the same program from above; its own
  underside from below.

- **The horizon.** One haze law for every surface past the streamed grid's fog (`src/render/horizonHaze.js`
  `HORIZON_HAZE_GLSL`): the world fog's ramp capped at the far ring's hold. The streamed sea holds it too, and the far
  ring's sea shares the water's own look (`SEA_LOOK_GLSL`), so the sea runs on continuously to the horizon. Ring cells
  inside the streamed rect fill the sea past the world's far plane, only those the eye can see.

- **The coast** (`src/world/terrain/groundEdge.js`, `src/render/groundEdgeGlsl.js`). A transition tile draws its two
  kinds' base records across a soft rim. On marching-square shores the water, silt and bank follow the existing
  swimming contour. Three octaves of noise vary the blend around it. Deep Waters' sea is cut on a wandering line
  instead of whole tiles. `?coastedges=off` restores the tile edges.

- **Town puddles are dry** (`src/world/puddleDry.js`). A one-tile patch of water, or one made only of shallow-water art,
  takes the ground its dry neighbours stand on. It runs where a block is served (`src/formats/blocksFile.js`
  `getBlock`), so every reader of the ground sees one ground, on both skins. Moats, ponds and docks stay.

## Rules

- Real translucent water with proper waves and shoreline interaction, replacing the old water (Mac). The waves are
  modest and the weather's: calm lakes and rivers, a sea swell that grows in a storm.
- The new water is the enhanced skin's; the classic skin draws DFU's tile.
- Drawn only: every reader of water as play keeps DFU's line (`WATER_MASK_TABLE`): the feet, swimming, fishing,
  climbing, the townsfolk's paths, Deep Waters' swim, the boats' `WaterLevel`.
- Puddles are removed from town layouts, puddles only, on both skins (Mac).
- Shores blend on both edges, the water's and the beach's (the owner).
- A look is judged on shots of the real game (`tools/waterLookProbe.mjs`), not the lab.
- Switches: **Enhanced water** (`enhancedWater`, on by default, the player's own online; `?water=off`), takes effect
  when the world next loads; **Water quality** (`waterQuality`): Full, or Simple, which takes no frame copy and keeps no
  ripple field.

## Daggerfall Unity

DFU draws water as an opaque terrain tile, and classic palette-cycled it. Departures, enhanced skin only: the moving
sheet, bed, body and shore above; the coast's wandering blend (DFU's tiles have straight edges); and, on both skins,
dry town puddles.

## Code and tests

- `src/render/waterSurface.js` - the water program, swell, body, foam, open sea
- `src/world/water/waterBed.js`, `src/render/waterBedGlsl.js` - the bed and its face
- `src/world/water/waterRipples.js` - the ripple field
- `src/world/water/waterCorners.js` - the draw's corner table and `WATER_MASK_TABLE`
- `src/render/horizonHaze.js`, `src/render/farRing.js` - the horizon and the ring's sea
- `src/world/terrain/groundEdge.js`, `src/render/groundEdgeGlsl.js` - the coast
- `src/world/puddleDry.js`, `src/world/puddleMask.js` - dry puddles, shore water colours
- `test/render/waternext.test.js`, `test/world/terrain/waterbed.test.js`, `test/world/water/waterripples.test.js` - the
  surface, bed and ripples
- `test/render/farsea1.test.js`, `test/world/shoresilt.test.js`, `test/world/water/bankflush.test.js`,
  `test/render/coastlook.test.js`, `test/world/puddledry.test.js`

## Open

- Past 0.85 of the fog's end the sea holds at the ring's haze while streamed land goes to solid fog, so far land can
  read as a pale flat shape against the sea. A sea that reads farther would want its own hold; that is Mac's call.
- A small pond is shallow by the bed's law and reads clear over its silt.
- The cost on a real GPU is not measured here.
