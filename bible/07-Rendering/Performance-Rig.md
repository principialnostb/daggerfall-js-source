# Performance: Bodies and Crowds

Many players gathered in one place (a gate, a square, a boss fight) is the frame's heaviest case: every player is a
body to pose and skin, a sprite or a name to draw, a pose to read off the wire, and a source of short-lived garbage. This
page holds the mechanisms that keep crowds cheap. The general laws are `Performance-Priority.md`; the exterior's render
frame is `Performance-Exterior.md`.

## How it works

### Morrowind bodies

- **Skin on the GPU** (`src/formats/morrowind/mwGpuSkin.js`). A built body's vertex stream is laid out and uploaded once
  (`skinLayout`, `packSkinStream`); a pose writes only the palette, one affine per bone and rigid placement
  (`writeSkinPalette`), and the character vertex shader blends. The law is the CPU skin's, entry for entry, so a body
  stands in the same place either way. It covers the player's third-person body, every peer's and the NPCs';
  the first-person arm keeps the CPU skin. `?gpuskin=off` is the bisect back (`src/combat/fpArm.js`).
- **Pose cadence** (`src/net/peer/peerBodies.js` `POSE_CADENCE`): a peer's body is re-posed every frame within 10 m,
  every second frame to 25 m, and every third beyond, still faster than the wire's pose rate. The rig's clocks step every
  frame; only the skin waits. A standing body's first step always poses.
- **Crowd budget.** At most `SKIN_BUDGET` (4) bodies are skinned in one frame; the rest keep last frame's skin and are
  owed the next. At most `BODIES_MAX` (8) bodies are built, within `BODY_RANGE` (120 m), handed between strangers with a
  dwell (`SWAP_DWELL_MS`) and a margin (`SWAP_MARGIN`) so they do not thrash.
- A look's stand-in is built once per look, not per frame, and skins are decided on the current view.

### Sprites, names and poses

- A peer's feet are asked of the scene once a sync, however many layers read them. A sync empties and refills its own
  id sets, and a class sprite builds its frame's key strings only when its record or frame moves
  (`src/net/remotePlayers.js`).
- A class sprite's whole archive is warmed at idle only once it has stood as its peer for some frames.
- A decoded sprite is turned in its own bytes (`src/formats/color32Order.js`). A peer's sprite art is decoded in the
  decode workers where the page has them, the door the player's own body takes. A worn-armour sprite's strips are
  decoded there too (`src/net/peer/peerRiders.js` `decodeUrl`).
- An Eye of the Beholder walker keeps its sprite answer while its table, view, frame and look hold. A look's outfit is
  read once for each list of items, and its warm signature only when the look changes. A kept answer carries its
  texture key, renderer key and look code, made once with it: the art store and the figure's batch take those and
  build none again. A rider's answer is new each frame, so its keys are made as it is drawn and kept nowhere
  (`src/net/peer/peerRiders.js`).
- Names move by their transform, each value compared with what the layer last wrote; a name with nobody to label keeps
  no label. Each name's writers are made once, and a number is compared before its string is built
  (`src/ui/nameLayer.js`). The name pass hands its view-projection product to the sight test, and the host's glass test
  projects the head with it (`src/net/remotePlayers.js` `namePoints`).
- The player's own pose asks the cast's wire fields of `dragonWireCast` once (`src/scenes/world.js`).
- Players past the peer range are neither stepped nor drawn, and **Players shown at once** can cap a crowd
  (`Performance-Priority.md`). A player the cap leaves undrawn takes their own foes and companions with them
  (`src/net/gate/gateCrowd.js` `crowdKinHidden`).

### Boss fights

A telegraph's quad is laid over only the ground its shape can draw on (`src/render/gate/gateTelegraph.js`), and a boss's
moving lights keep their identity, so their shadow cubes are not redrawn as new lights each frame
(`src/render/lightId.js`, `Enhanced-Lighting-Arc.md`).

### Ships in port

A ship's objects are made again only where one moved and only when read; a boat's plan is walked where it stands; a
still animation clip is posed once and a rope's bones are read off the frame's own walk
(`src/scenes/comeSailAway/comeSailAwayPool.js`, `src/world/unityAnimator.js`).

### Garbage and measurement

- The desktop app gives V8's young generation 32 MB (`--max-semi-space-size=32`, `app/main.cjs`), halving the sweeps a
  crowd's garbage causes. The browser build keeps the browser's own.
- The CPU meter splits the old `sim` span into its parts (the motor, activation and the rest), and the `hud` span is
  understood to include the vsync wait (`src/render/perfMeter.js`).

## Rules

- Picture-neutral unless the owner says otherwise: the cadence and budget never show a body more than a frame or two
  behind, and the wire is slower than either.
- A body's pose and skin answer the same law on CPU and GPU.

## Code and tests

- `src/formats/morrowind/mwGpuSkin.js` - the GPU skin
- `src/net/peer/peerBodies.js` - cadence, budget, body pool
- `src/combat/fpArm.js` - the rig, `?gpuskin=off`
- `src/net/remotePlayers.js`, `src/ui/nameLayer.js` - peers and names
- `src/net/peer/peerRiders.js` - the walkers' sprites and their art's decode
- `test/net/peer/wb9h_crowd_bodies.test.js` - the crowd's bodies
- `test/net/perfcrowd1.test.js` - names, peers and the crowd frame
- `test/net/peer/peerwalker_steady.test.js`, `test/net/peer/peerdecode.test.js` - a walker kept, its art decoded
- `test/net/remoteplayers_steady.test.js`, `test/net/namepass_steady.test.js`, `test/ui/namelayer_steady.test.js` - a
  steady sync and name pass build nothing again
- `test/systems/staffDragonArm.test.js` - the cast's wire fields asked once
- `test/systems/comeSailAway/perfsails3.test.js`, `test/systems/comeSailAway/perfsails4.test.js` - ships in port
- `test/net/gate/fb1013e_aoeperf.test.js` - the boss's telegraphs
- `tools/peerLab.mjs` - a crowd of peers, measured
