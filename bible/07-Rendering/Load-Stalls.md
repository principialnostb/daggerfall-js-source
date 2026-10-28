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

## 3. What is left, in order

1. **A part changed in place** (OpenMW's `updateParts`): a worn change rebinds the slots that moved onto the standing
   skeletons - the swap `setWeapon` already does for the hand - and keeps the skeleton, the clips, their reports, the
   reach and the textures. The skin rows a piece shadows are the hard half (a gauntlet hides the hand's skin): they are
   rebound with the piece. A whole build stays the answer for a race, a sex, a form.
2. **No freeze**: the build's spans cut into slices of a few milliseconds (a yield between parts), the NIF parse and
   flatten moved to the texture pool's workers, the new body swapped in on one frame.
3. **The body morphs on the GPU**: any active slider drops the third-person body to CPU skinning every frame
   (`thirdSkinReady`); the morph belongs in the skin's vertex stream.
4. **The boot**: the player's loose files are read from the store one after another, whole (`_openMorrowindArchives`);
   the player's body is built after the world, not beside it.
