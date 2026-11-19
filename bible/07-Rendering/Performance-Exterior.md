# Performance: The Exterior Frame

The outdoors cost far more than interiors: a streamed town is thousands of flat batches, sixty lanterns a pixel at
night, shadow cascades, grass, clouds and water. This page holds the mechanisms that keep the exterior's render frame
cheap without changing the picture. The general laws and instruments are `Performance-Priority.md`.

## How it works

### Flats

- **Arenas.** A still billboard batch takes a range of quads in a shared arena: one VAO and one vertex buffer for
  thousands of batches, one index buffer for every arena (`src/render/renderer.js` `BB_ARENA_QUADS`, growing to
  `BB_ARENA_MAX_QUADS`). A draw names its range by index offset. A dynamic batch (gibs, blood) keeps its own buffers.
  A record's batches sit together in their arena.
- Every batch is born with every field it will carry, so its shape never changes.
- A flat's size and origin go up only when they change, in the draw and in the shadow replay.
- The far-flat rule is asked without minting an object (`src/world/flatDistance.js`).
- The renderer binds a VAO only when it differs from the one bound (`_bindVao`).

### Shadows (`src/render/shadowPass.js`)

- A flat batch reaches a shadow by its placements' bounds (`src/render/bounds.js`); a run of a static batch's
  sub-meshes is one depth draw.
- **A town's columns.** Each texture's sub-mesh spans the whole town pixel, so a map that takes one draws the city. The
  pixel's static batch also keeps its triangles by 32-unit ground column in a second index buffer
  (`src/render/staticBatch.js` `shadowColumnSteps`, made in the merge's own slices). The sun's two near cascades and
  the lanterns' faces draw only the columns their volume touches. The far cascade draws the merged run: its box takes
  so many columns that their draws would outnumber the sub-meshes'. A batch with a cutout picture, or glass under a
  window sun, draws its sub-meshes. Every map keeps the same depth either way.
- Every lantern's static signature is folded in one walk; a lantern's six faces share one walk; the sun's cascades share
  one walk.
- **The near cascades' read reach.** A surface reads cascade 0 or 1 only within nine tenths of that cascade's radius of
  the eye. So the walk leaves out of those two cascades a caster whose bound lies wholly past the radius across the
  light (`_sunReachFor`). A mesh's bound is its sphere through its matrix's largest stretch (`stretchBound`). A flat's
  bound takes its quad and the wind's lean. A rig, a mesh whose vertices were written again and a flat with its own
  scale are always kept. The far cascade keeps every caster its box takes: with Steady shadows off, its map is held a
  frame and read about the next frame's eye. The reach check is off by default, so the near cascades keep every caster
  their boxes take; `window.__DF_SHADOW_TUNING.sunReach = true` in the console turns it on for an A/B.
- A candidate list keeps its arrays from frame to frame. A slot counts its flats, and `discard()` sets them to null and
  the counts to zero.
- A recorded mesh's matrix scale is computed once; the lanterns' face matrices and cube walk are made in place.
- The placed batches' volume answers are kept, and the cheapest skip runs first.
- A live face that holds the cache is left alone: only the faces a mover touches are copied.
- A lamp whose movers did not change keeps the faces it drew. Each slot keeps every value its dynamic faces read of each
  mover a face takes (its place, sphere, size, picture, pose and wind, and the card's turn), with the lamp's place and far
  and the frame's mip maps. The faces are drawn again only when one of these changed, or the cache did. A batch that
  rewrites its own corners, a solid, and a placed wood with a tree in the lamp's cube have no such values, so a lamp that
  one of them reaches redraws as before.
- A lamp that meets a flat that moved or changed its look, on two frames running, stops reading the values there and
  redraws: its movers are walking on. The first still frame reads them all again, and the frame after holds.
- The lo tier signs every lamp that may read a lo map in one walk a frame; each lamp's answer is the one its own walk
  gives.
- The sun's 3x3 shadow kernel is read in four taps.
- A program's identity view and the flat program's sampler unit go up once in the pass's life; a flat record's wind goes
  up when it differs from the last record's; the square viewport is sent when its size changes; a flat's lantern-facing
  right is made once per origin a face, since a pixel's still flats share one.
- The reach test makes a box's sphere only for a live lantern: by day the sun's planes alone are asked.
- The caster pick keeps its sorted few in two scratches: a pair was minted for every light in reach every frame.

### The draw order and the shaders

- **Ground last.** The visible pixels' ground is drawn after every opaque mesh, so ground fragments under buildings and trees fail
  the depth test instead of being shaded in full.
- Every visible pixel's water is one call.
- The copy of the frame under that water is only the part the water can read (`src/render/waterSurface.js`
  `waterRowsReach`). Each sheet's box goes through its matrix, the lift and the swell, is cut at the near plane and is
  projected. The part is then widened by the push's own bound at the box's nearest distance to the eye, and by the
  edge the look is held inside. A later list that reads past the part takes the rest of the frame as it then stands,
  so a frame draws one list (`test/render/underwaterreach.test.js` holds the hosts to their two call sites). The
  one-surface door and the sea copy the whole frame. With no air pass, a list asks no copy.
- The air pass's emitter programs send a uniform only when it differs from what the program holds
  (`src/render/airPass.js` `heldMoved`). The identity view and the sampler units go up once in a program's life; the
  view-projection, the depth's terms and a flat record's wind go up when they change.
- A sky told to hide its clouds skips computing them (the dome's deck at cover 0, Dynamic Skies' sheets under the
  volumetric clouds); the resolve skips images that were not drawn (`src/render/airPass.js`).

### The stream

- The stream build's slices run in their own animation frame, and the build slice is what the frame left
  (`src/systems/frameClock.js`); the FPS counter sees it. A pixel's publish tail breathes. Only the shadow columns'
  spheres are measured in one piece, by `createMesh` at upload.
- Grid promotions are built on the terrain worker (`src/world/terrain/terrainGenClient.js`, `generatePixelTerrain`).
- The grass field's slot count is swept once; the field survives the floating-origin shift; its rim is placed a slice a
  frame, each cell by a deadline set from the eye's own step, so cells are placed before the eye reaches them
  (`src/render/labGrass.js` `createGrassField`).
- A collider cell's key is a number (`src/player/collider.js`).
- The grass field sweeps its live cells through `Map.forEach` with one callback made with the field: no entry array or
  iterator result a cell a frame.

### The town

- The town loop mints no frame's worth of garbage: people, plaques and flats update in place. A pixel without gates
  reads a frozen empty list; the pixel walk's order is sorted by a comparator that answers a sign; the billboard pass
  walks its lists by index.
- The frame's lists and records are kept and refilled in place: the pixel walk's list, the player's light, the street's
  two pools and the still-tracker's last position (`src/scenes/frameKept.js`). A person's record key is made once a
  pair (`src/scenes/townScratch.js` `recordFrameKey`). The collider's query lists and the billboard pass's cutout list
  are written from the front and read to their count, and the slots past it are let go (`src/player/collider.js`
  `letGoPast`; `src/render/renderer.js` `drawBillboards`). The renderer's world rect and window-light eye are records
  filled in place.
- The collider's buckets that stand still (doors, levers, static models) are filed on a coarse grid, so a ray or a
  sphere asks only the buckets under its own box; moving and oversized buckets are asked by every query. One visited set
  is cleared per bucket, and the marks' stamp starts a new epoch on wrap (`src/player/collider.js`).

## Measuring a fixed view online

`tools/onlineFrameProbe.mjs` runs against local services. Set `PIXEL=1549,-375` for Skyrim or use the
default Knightstale start. Use `POV=compare` for first, third and first person in one session, `YAW` in degrees
and `PEERS=0,2,0` to compare
a clear view with a small crowd. Set `BROWSER_CHANNEL=chrome ANGLE=d3d11 W=1920 H=952` to use the reported
backend and viewport. The output records the map pixel, camera mode, heading, GPU and shadow counters.
Use HEAP=0 to capture the WebGL census and CPU profiles without heap sampling. Compare two views from one session
with node tools/frameAb.mjs --runs online0-first online0-third and the same OUT directory. The table includes local
character pose, character pixelation and fixture depth readback. The online clock advances between runs. Compare
matching daylight, weather and resolution.
With a fresh test save, `CLOAK=1` equips a cloak and enables the desktop character presentation settings.
`SHADOW_BOUNDS_AB=1` with `POV=compare` adds an unbounded shadow sample and measures time to the first body draw.

## Rules

- Picture-neutral: every mechanism here draws the same pixels.
- A shader that multiplies its answer by nothing does not compute the answer.
- The render scale (`Rendering.md`) is the per-pixel lever for a weak GPU; this page is the CPU and draw-count side.

## Code and tests

- `src/render/renderer.js` - arenas, flats, `_bindVao`
- `src/render/shadowPass.js`, `src/render/bounds.js` - the shadow walks
- `src/render/labGrass.js` - the grass field
- `src/player/collider.js` - broad phase and rays
- `test/render/perfexta.test.js`, `test/render/perfextb.test.js`, `test/render/perfextd.test.js` - the shadow, flat and
  shader slices
- `test/render/perfarena.test.js`, `test/render/perfvol.test.js`, `test/render/perfalloc1.test.js` - arenas and walks
- `test/render/underwaterreach.test.js` - the copy under the water; `test/render/airemitonce.test.js` - the emitters'
  uniforms
- `test/render/fb1021b_grass.test.js` - the grass rim's deadlines
- `test/render/towncells.test.js` - the town's shadow columns: what each map draws, the slices, the same depth
- `test/render/shadowonce.test.js`, `test/render/grasssweep.test.js`, `test/scenes/frameneutral.test.js` - what the pass
  sends once, the grass sweep, the frame-neutral lines
- `test/render/perfsun3.test.js`, `test/render/audit637_shadow.test.js` - the sun's walk and its read reach, the
  candidate lists kept
- `test/render/moverhold.test.js`, `test/render/lotier_walk.test.js` - the movers' kept faces, against a twin that redraws
  them, and the lo tier's one walk
- `test/player/fb0930_frame.test.js` - the ray marks' epoch
- `tools/grassMoveProbe.mjs` - the grass field under a moving eye
