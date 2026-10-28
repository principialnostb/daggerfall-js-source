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

## 4. Phase 3 - the player first, and the dev server's boot (LOAD-STALL 3)

The owner after phase 2: the armour "реально заметные улучшения", but a weapon "иногда 5-10 секунд", and the body
still slow to appear on entering the world. The probe's live-rig mode (`node tools/mwBuildProbe.mjs --weapons`: one
`createFpArm` build, then each hand through `setWeapon`) answered every swap in 14-130 ms - so the seconds were not the
swap's own work but its WAITING, and only where other bodies were built beside it.

- **The texture pool's queue, the player's jobs first.** Every decode was posted at once to the least-busy worker,
  whose message queue is first come first served; a town's NPC bodies (one build at a time through `BODY_BUILD_GATE`,
  dozens of pictures each) stood ahead of the player's sword. A worker now holds ONE job and the rest wait on the page's
  side in two lines (`mwTextureClient.js:"const waiting = { urgent: [], normal: [] };"`); the player's rig (createFpArm's
  `playerAppearance` - the live body and the editor's preview) marks its builds and its five swaps `urgent`.
- **The body queue waits for the player** (`characters/playerBuildHold.js`): `pumpGate` starts no peer's or NPC's body
  while the player's rig is busy (`rigBusy`, registered by the page's rig), asking again every 50 ms - their work had
  taken the frame's thread between the player's own steps.
- **The loose files opened, not read** (`dataSource.js:"export function makeLazyLooseArchive(names, read) {"`): every
  stored loose file was read whole, one after another, before the first body - a Data Files folder attached whole is
  thousands. Names now, bytes on load, the `.bsa`'s MW-LOAD doors.
- **The dev server's URL globs** (`scripts/devLazyUrlGlobs.mjs`, `systems/devGlobUrls.js`): an eager
  `import.meta.glob(..., { eager: true, query: '?url' })` is a module request per file on the dev server, hoisted above
  the module's code - the Eye of the Beholder's sprites and layered armour (~12,400 pictures, imported at boot) and the
  bundled packs (7,410). On the dev server alone each is rewritten into a lazy glob whose keys make the same URLs (a
  file's `?url` there is its path from the root), the lines kept; the build is untouched. Measured in the page (warm
  server): the two modules 8.0 s and 6.7 s with 19,816 requests -> 0.56 s and 0.53 s with 40.

`test/combat/loadstall3.test.js`; `test/scenes/mwd40_loosefiles.test.js` (the lazy archive). Not measured in the game
itself: the queue's gain is a town's, where the probe has no NPCs.

## 5. WEAPON-FIRST - a weapon's first equip

The owner after phase 3 (on `npm run dev`): the loads "гораздо быстрее", but a weapon's FIRST equip "может достигать и
30 секунд, а может и вовсе не прогрузиться", and one equipped before comes quickly. What a first swap has and a second
lacks is the weapon's own files - its meshes out of the archives, its pictures decoded. The probe (`--weapons`, and
`--prewarm`) answers a first swap in 20-55 ms in Node, cold or warmed: the seconds are the browser's (the store's reads,
the workers, the queues), and the swap now says where in its own line.

- **Asked again, not given up** (`fpArm.js:"export function swapRetryDue(token, key, now = mwNow()) {"`): a failed swap
  kept the hand's key in `weaponFailed` and the frame door never asked it again for the rig's life - the hand that
  never loads. It is asked again `SWAP_RETRY_MAX` (3) times, `SWAP_RETRY_MS` (1.5 s) further apart each time, and the
  count clears when it lands.
- **Warmed before the click** (`prewarmWeapons`): when the player's rig stands (`weaponRig.js`'s `buildArmsFor`) and
  when the pack refreshes, each carried weapon's meshes are read and its pictures decoded beside the frames, once a
  weapon a rig, in the pool's ordinary line - a click's own swap goes ahead of it.
- **The swap's line**: `[mw] weapon swap <name> in N ms - archives, meshes, textures, third` beside the build's.

`test/combat/weaponfirst.test.js`.

**LOAD-STALL 4 - the reads, the player's first.** The owner's line came back the same day: `[mw] weapon swap Claymore in
102187 ms - archives 203, meshes 36508, textures 65357, third 118` (the next, Longsword: 1,471 ms). A minute and a half
of waiting for a few files: every archive read went out at once - the street's bodies' meshes and pictures, the
warm-up's, the sword's - into the browser's six connections to the dev server (the packs' files) and its own line for
the store (the `.bsa` ranges, the loose files). Every read now goes through one queue
(`fpArm.js:"export function archiveRead(read, urgent = false) {"`): at most four ordinary reads at once and six in all,
so an urgent read always finds a place, and the urgent line is served first. The player's builds (`urgent`) and the
rig's swaps (`playerAppearance`) mark theirs - sixteen reads of `loadFromArchives` - and everything else (the NPCs',
the portraits', the icons', the warm-up's) waits in the ordinary line. The pictures' `<img>` loads (the Eye of the
Beholder's sprites) still share the connections outside it. Not measured in the game.

## 6. What is left, in order

1. **A part changed in place** (OpenMW's `updateParts`): a worn change rebinds the slots that moved onto the standing
   skeletons - the swap `setWeapon` already does for the hand - instead of assembling both bodies again. After phase 2
   a rebuild is tens of milliseconds, so this is worth doing only if the game shows the upload or the assembly.
2. **The NIF parse and flatten in the workers**, for the first build of a body (the world's load) and a new piece.
3. **The body morphs on the GPU**: any active slider drops the third-person body to CPU skinning every frame
   (`thirdSkinReady`); the morph belongs in the skin's vertex stream.
4. **The dev server's content globs**: the rewrite covers every eager `?url` glob in `src/` (twenty modules, the walk
   animations', Better Bodies', the footsteps' among them); the eager `?raw` and JSON globs (the sky presets, the
   locales) carry their files' CONTENT and cannot be made URLs - none is at the boot's scale.
