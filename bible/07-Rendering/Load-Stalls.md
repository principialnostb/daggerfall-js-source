# LOAD-STALLS - the loads, the equip freezes, the stance and the card (2026-10-28)

(LOAD-STALL 1, the owner, 2026-10-28, branch `Dev`)

> "когда начали вводить подргузку новых моделей из модов, новых текстур, реплейсера тела и тд очень стало ухудшаться
> скорость работы ... одна глобальная проблема во всех аспектах"

The owner's list: a long boot to the preview; a long load of the 3D on entering the world; an equip that freezes the
game or shows the piece late and then freezes; a two-hander swung from the one-hand stance for a while after the
swap; the character editor's look not reaching the card (reopen it) nor the body in the game (re-equip something).

## 1. The one cause

Every change of what the body wears is a WHOLE BUILD. `setWorn` (`fpArm.js:"    setWorn(pieces) {"`) calls
`build`, which is `buildFpArm` - the same function the world's load runs: the ESM's records walked, the first-person
arm assembled from its NIFs, the third-person body assembled again (`buildTpBody`, a third time when an outfit did not
bind), every clip's report, the reach swept over every clip, the textures collected and the meshes uploaded. Its spans
are awaited between, but each span runs whole on the frame's thread - the freezes; the old body stands until the new
one is done - the late piece. DFU and OpenMW change a part in place (`NpcAnimation::updateParts` removes and adds the
parts whose slot moved); the port rebuilds the actor.

## 2. Phase 1 - what was fixed (LOAD-STALL 1)

- **STANCE-FIRST** - the swap of the hand is async (its meshes and pictures load), and a rebuild in flight holds it
  queued (`pendingWeapon`), while the game's weapon changes at once: a blow started in the gap was the new weapon's,
  thrown in the old stance. Two halves:
  - the pack handed the rig the worn table BEFORE the hand, so a weapon that bumps the shield started a whole
    rebuild carrying the OLD hand and queued the new one behind it for the length of that build; the hand now goes
    first (`enhancedInventory.js:"// STANCE-FIRST (the owner, 2026-10-28"`), as the frame's tick already did
    (`handArm` before `setWorn`);
  - the rig records the hand the game ASKED for (`wantKey`, every frame through `handArm`) and answers
    `handSettled` (`fpArm.js:"    handSettled() {"`); the swing and the shot wait while it is false
    (`weaponRig.js:"  function armCannotSwing() {"`) - DFU's own law for a swap, `equipCountdown`, held for the
    Morrowind arm's load. True with no standing arm, for the wolf and for a swap the rig refused.
- **APPLY-NOW** - the editor's Done saved the identity and said in a comment that the live body is not rebuilt from
  it; but every player build reads the saved identity (`build`, `playerAppearance`), so the body changed at the next
  equip. A changed identity (`appearanceEditor.js:"export function identityChanged(saved, next) {"`) now rebuilds the
  body at Done (`applyAppearanceIdentity`, not awaited - the old body stands until the new one), and both of the
  editor's events drop the pack's cached figure (its key - pieces, skeleton, yaw - moves with neither a morph nor a
  face).
- **BB-ONCE** - Better Bodies' bytes were handed out as a fresh copy every call
  (`fpArm.js:"async function loadBetterBodiesAssetBytes"`), so `parseNifOnce`'s identity memo never matched: the whole
  body NIF (and Robert's first-person arms and Better Hands' hands) were parsed again on every equip and every NPC
  build; and the skin's decoded picture was dropped from the memo on every build, decoded and uploaded again. Now one
  array per file, a stem rewrite on its own copy made once
  (`fpArm.js:"function preparedBetterBodiesBytes(url, rawBytes, fromStem, toStem) {"`), and the picture dropped only
  when the registered bytes moved. A latent defect goes with it: the rewrite wrote INTO the shared buffer, so a second
  race's body searched a stem the first had already rewritten.
- **LOAD-CLOCK** - the build's console line (`[mw] arm built in ...`) carried the third-person body inside `meshes`;
  it is its own span now, `third`.

`test/combat/loadstall1.test.js`; PX25's pin (`fparm.test.js`) holds the new order.

Not measured in the real game: the owner's data is not in this browser. The console line is the A/B.

## 3. Phase 2 - the sweep (LOAD-STALL 2)

The owner after phase 1: "основные баги пофикшены ... но все еще огромные задержки перед манипуляциями с внешностью
текстурами и предметами". Measured, not guessed: `node tools/mwBuildProbe.mjs` builds the player's body in Node on the
real data - the retail `.bsa`/`.esm` off `MORROWIND_DATA` (default the owner's Steam install), the mods' packs through
Vite's SSR transform so their globs resolve as in the game - bare and then in five worn sets, and prints each build's
span line and its longest synchronous stretch (an interval timer the build starves).

| a rebuild (an equip), Nord male | before | after |
|---|---|---|
| retail arms: build / longest freeze | 500-750 ms / the same | 10-30 ms / 9-30 ms |
| Better Bodies + Better Hands, a cuirass, greaves, boots | ~3 s (the sweep) / the same | 30-80 ms / 26-41 ms |
| the same, a NEW arm (gauntlets, pauldrons) | ~3 s / the same | 35-60 ms, then the sweep ~3 s beside the frames in slices of 8-15 ms |
| the first build (the world's load) | the sweep's ~3.8 s inside it | the sweep after it, beside the frames |

The CPU profile named the cost: **`clipUnionBounds`, 74% of every build** - PX27's reach sweep posing the whole
first-person arm (skeleton, skin, normals) at nine samples of every clip of every source, 2,079 poses on a retail rig,
on Robert's whole-body arm mesh with the animation packs. Three changes:

- **Remembered by the arm** (`REACH_CACHE`): the union depends on the skeleton, the idle source's tracks, the samples
  and the first-person pieces alone (`fpArm.js:"export function armShapeKey(pieces) {"` - each piece's slot, part,
  batch, sizes and a few bind-pose floats), so a cuirass, greaves, boots, a helm or a cloak - none of them the arm -
  answer it from the memo. One generation, the newest 32 arms.
- **Owed to the frames, on a shadow**: an arm not yet swept stands on its idle's reach and the build returns
  `sweepLater`; the rig runs it after it installs the body (`createFpArm`'s build) and lands the reach only on the rig it
  measured, while its pieces stand (a swapped hand resets the reach itself), through the held sheet's floor. The sweep
  poses a SHADOW (`mwFirstPerson.js:"export function sweepShadowOf(assembly) {"`: the skeleton and the pieces' bind data,
  its own outputs, no normals) - the frame's crossfade reads the arm's last raw pose (`fpBlend`), so a sweep beside the
  frames must never pose the arm itself - in slices (`clipUnionBoundsSliced`, 6 ms, a macrotask between). A test's deps
  carry no generation: there the sweep stands inside the build as it always has.
- **The editor's preview** never draws first person: built with `reachSweep: false` (MWNPC3's door), no sweep at all.

Beside it: the load order's records (thousands of rows, five ways) joined once a generation (`ESM_MERGE_CACHE`), not at
every equip; and `poseAssembly` reads the page's `mwcloakprobe` query once - it parsed `location.search` at every pose
of every body, every frame.

`test/combat/loadstall2.test.js`. Not measured in the game itself: the GPU upload of the new meshes and textures and the
pack's figure are outside the probe.

## 4. What is left, in order

1. **A part changed in place** (OpenMW's `updateParts`): a worn change rebinds the slots that moved onto the standing
   skeletons - the swap `setWeapon` already does for the hand - instead of assembling both bodies again. After phase 2
   a rebuild is tens of milliseconds, so this is worth doing only if the game shows the upload or the assembly.
2. **The NIF parse and flatten in the workers**, for the first build of a body (the world's load) and a new piece.
3. **The body morphs on the GPU**: any active slider drops the third-person body to CPU skinning every frame
   (`thirdSkinReady`); the morph belongs in the skin's vertex stream.
4. **The boot**: the player's loose files are read from the store one after another, whole (`_openMorrowindArchives`);
   the player's body is built after the world, not beside it.
