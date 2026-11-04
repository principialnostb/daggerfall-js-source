# First-Person Hands - Better Hands, the worn cuff, the fist's thumb, the empty part (BETTER-HANDS arc)

The record of the session (2026-10-24 to 2026-10-26, branch `hands-1st-person`, now `Dev`) in which the owner
played the Morrowind first-person arm round after round - bare hands, leather gloves, plate gauntlets, looking up,
down and along the arm - and asked for one thing: the new hand and the arm, and the glove on them, as one piece,
not a Frankenstein of replacers. It shipped in commits `ca1b8cdd57`..`f4f505ad9f` (the forearm armour under a
gauntlet), `0b156c9a03` ("hands 1st person geometry update") and `4d9dc4133c` (EMPTY-PART). Its sibling is
`05-Combat/Blow-Flow.md` (the blows). The earlier note `docs/Better-Hands-Forearm-Gauntlet-Seam.md` (2026-10-24) is
this page's first section, superseded here.

Reference: OpenMW's `NpcAnimation` (parts, slots, `reserveIndividualPart`) and Morrowind's own body parts. The mods
are carried as shipped files under `Mods/` - Robert's Bodies, Better Hands, Better Bodies, Robert's Bodies Based
Gauntlets. The geometry fits below are the port's own (a DEPARTURE in presentation: no mod or engine does them),
done at build time on private copies - never on the parsed meshes.

## 0. The setting - two choices

Settings -> Bodies -> First-person hands (`FirstPersonHands`, src/systems/modSettings.js:"FirstPersonHands:"): `Vanilla` or
`Better Hands` (default). The owner: "rename Robert's Bodies + Better Hands to just Better Hands, and remove the
Better Bodies switch". `firstPersonHandsSource(value)` (src/formats/morrowind/mwBetterBodiesPaths.js:"export function firstPersonHandsSource") answers
`better-hands` for 1 AND for 2 (a saved retired "Better Bodies" takes Better Hands), else `vanilla`. Vanilla is the
standard first-person arm from the player's archives (on the owner's install Better Bodies.esp is loaded, so it is
Better Bodies' arm there). The third person is untouched by this setting: it draws Better Bodies' body.

## 1. BETTER-HANDS - the bare arm

The first cut drew Robert's Bodies' first-person file and Better Hands' hand - but Robert's `.1st.nif` carries
HANDS ALONE, so the wrist, forearm and upper arm fell back to the RETAIL body parts in the retail skin, and the
wrist showed a skin seam (the owner: "different skin textures at the joint - the hand from one, the texture from
another"). Measured: Better Hands' textures and Robert's Bodies' are byte for byte the same files
(`bbr/<race>_<sex>.dds`).

Now (src/combat/fpArm.js:"let thumbReference"): the arm is the wrist, forearm and upper arm of Robert's Bodies' WHOLE-BODY mesh
(`Mods/Bodies/Robert's bodies/Data Files/Meshes/bbr/<race>_<sex>.nif` - `robertBodiesFirstPersonAssetPaths`'s
`bodyModelPath`, its glob src/formats/morrowind/mwBetterBodies.js:"const robertBodyModelUrls" takes every `bbr/*.nif`), in its own skin; the
hands are Better Hands' mesh in the same skin (its texture registered under a same-length private stem,
`textures/bbr/x<r>_<s>.dds`, as before). Better Bodies' own hand (`bb_hand<s>_<race>.nif`) is loaded too, never
drawn: it is the fist thumb's reference (section 4).

Measured seam: Better Hands' open rim stands at -0.94..-0.46 along the forearm (radius ~1.40), Robert's wrist runs
past it to +0.37 and wider (~1.58) - a lip round the hand's base. The arm part carries `cuffFit: 'skin'` and the hand
part `cuffFit: 'bareHand'`: the wrist is sat under the hand by CUFF-FIT (section 2) with `flare: false`, its end
buried in the hand and its end weights the hand's, so it turns with the hand.

The owner then: "the fingers are better now, leave them; the hand's mounting on the forearm improved too".

## 2. CUFF-FIT - the worn gauntlet's cuff sat on the donor hand

### 2.1 The donor hand (Robert's Bodies Based Gauntlets)

A worn gauntlet's first-person hand is replaced by the donor's hand geometry: `isRobertGauntletFirstPersonAdd`
(src/combat/fpArm.js:"export function isRobertGauntletFirstPersonAdd") takes a dedicated hand part (never a wrist- or forearm-bound one), the worn item's
`NiSourceTexture` names are laid on the donor by index (a temporary UV fit - the mod ships an IRON gauntlet only, so
other materials' textures stretch on it). The owner chose to keep this donor ("I like how the gauntlet's hand is
made; the default ones, plate especially, are worse").

- `handShapesOnly: true` on the donor part: `isDonorCuffShape(batch)` (src/formats/morrowind/mwFirstPerson.js:"export function isDonorCuffShape")
  drops the donor's OWN cuff shape - a shape most of whose triangles ride the arm (Robert's "Tri Left Hand 2", 250 of
  440). Before, the donor's iron cuff and the worn cuff were drawn one inside the other - "they live apart".
- The worn gauntlet's own file is bound beside it as the cuff (`originalForearm`, `forearmShapesOnly: true`,
  src/combat/fpArm.js:"const originalForearm").

### 2.2 The cut - by WHERE, not by weights

`armWeightedTriangles` (src/formats/morrowind/mwFirstPerson.js:"export function armWeightedTriangles") kept a triangle only if all three corners rode
the forearm. A cuff's wrist end rides the hand as much as the arm, so retail's netch cuff lost a long V-shaped wedge
down its length (the owner: "a pale stripe on the leather glove in every pose") and the plates their wrist band
either side ("gaps on both sides of the hand-forearm joint"). Now each shape is kept whole beside its per-triangle
piece (`cuffWhole`, or `cuffWholes` for a shape with no all-arm triangle), and once a donor is bound
`fitCuffPieces` (src/formats/morrowind/mwFirstPerson.js:"function fitCuffPieces") cuts it with `trimToCuff` (src/formats/morrowind/mwCuffFit.js:"export function trimToCuff"):
every triangle whose centre lies short of the donor hand's start (`handStart`) plus `CUFF_FIT.bury` stays - cuff and
wrist band whole - and what the donor hand covers goes; a hand shape left with under `strayShare` (25%) of its
triangles is a stray and is dropped (netch's palm kept one triangle - a spike). With no donor bound (a test, a rig
without one) the per-triangle cut stands.

### 2.3 The fit

`fitCuffsToHand(cuffs, donors, ctx, frame, { flare, skins })` in `src/formats/morrowind/mwCuffFit.js`, in the rest
pose, about `wristFrame` (the forearm bone to the hand bone). `CUFF_FIT` (src/formats/morrowind/mwCuffFit.js:"export const CUFF_FIT"):
`reach 3, band 0.75, clearance 0.12, bury 0.8, slice 0.25, flare 1, bins 16, ringVerts 3, ringSpan 0.6,
girthSlice 0.5, girthGap 8, skinClearance 0.1, maxPush 1.2, strayShare 0.25`.

- The donor's girth (`wristRing`): its start `a0` and its radius by angle (16 bins) slice by slice (0.25 apart).
- The cuff's END is its last RING (`cuffEnd`, src/formats/morrowind/mwCuffFit.js:"export function cuffEnd"): the farthest point with 3 of
  its vertices within 0.6 behind it - not its farthest vertex. Retail's netch cuff ends in a ring of seven 2 units
  short of the wrist, one tongue vertex alone reaching it; taking the tongue left a gap (the owner's screenshot).
- `fitPoint` (src/formats/morrowind/mwCuffFit.js:"export function fitPoint"): the end ring goes `bury` (0.8) INTO the hand, `clearance`
  under the hand's surface there; where the hand begins it stands `clearance` outside; it fades back to the cuff's
  own shape over `reach` (3) towards the elbow. The draw along the arm is spread EVENLY from the cuff's far end to
  its own (`aStart`), never over the last reach alone - the netch cuff drawn 1.9 at its end tore its texture (the
  owner: "a small texture gap from the hand to the forearm"). A cuff ending up the arm (more than `reach` short) is
  never drawn down it; a FLARE (daedric, indoril: past the hand's start by more than `flare`) keeps its width and is
  only pushed out of the hand (the arm's own skin passes `flare: false`).
- Why buried, not sat round: a low-poly cuff's end sat just outside the hand left gaps at each of its few corners,
  and the forearm's skin showed through them.
- The end takes the donor wrist's bones and weights (the nearest donor vertex's, blended by the fit's weight), a
  donor bone the cuff lacks bound so it places at rest as the cuff's own lead bone does - so the cuff turns with the
  hand. Measured: a 40-degree twist moved the seam 0.37 before, 0.08-0.11 after.
- Every moved vertex is solved back to bind space through its new skin by measured affines
  (`mwSkinTransfer.js` `measureAffines`, `invert33`, `influencesOf` - exported for this), and its normal the same way.
- CLEAR OF THE ARM (`armGirth`, `clearOfArm` - src/formats/morrowind/mwCuffFit.js:"export function armGirth", src/formats/morrowind/mwCuffFit.js:"export function clearOfArm"): the cuff is kept
  `skinClearance` outside the arm's own skin under it (the `skin` pieces of that side) - its FACES as well as its
  vertices: a vertex is set out so the chord to its neighbours clears the skin (divided by cos of half the angle to
  them; retail's netch has seven to a ring). The skin's girth is read between its rings only, never past its last
  ring (the cuff's end is buried in the hand there). Measured: skin poking through the netch cuff 21 -> 13 vertices,
  steel 24 -> 7 (the rest is the cuff's own taper into the arm at the elbow, authored so).

## 3. EMPTY-PART - a reference that names no body part

The owner, third person: "the leather gloves still have a problem on the outer side of the arm". Retail's netch
leather gauntlet names its wrist with no model (INDX 9). OpenMW's `NpcAnimation::addPartGroup` RESERVES such a slot
(`reserveIndividualPart`), so the skin under it is not drawn; the port skipped it, and the fuller Better Bodies (third
person) / Robert's (first person) wrist came out through the leather cuff. Now `composeRefs` claims the slot with no
mesh (src/formats/morrowind/mwItemMap.js:"if (!id) { notes.push"); a NAMED part no BODY record carries still keeps its skin (MW-D29's
never-traps law, unchanged). Verified on `Morrowind.esm`: the leather (netch) gauntlets now hide `hand` and `wrist`;
the port's own steel gauntlets already hid wrist and forearm. Every test that composes worn armour (27 files) was run
with and without the change: no new failure.

## 4. THUMB-FIST - the clenched fist's thumb

The owner: "Robert's hands are better everywhere - fingers, where they sit, how the hand meets the arm - all but the
THUMB IN A CLENCHED FIST, with gauntlets and without". Then, after a first cut: "copying the vanilla thumb whole does
not fit - correct Robert's own; it is too long, with a strange bend".

- First cut (rejected): Better Hands' thumb vertices projected onto Better Bodies' thumb surface in the fist pose
  (with welds and smoothing against folds) - the shape was BB's, the owner found it odd.
- Now (`src/formats/morrowind/mwThumbFist.js`): measured in each thumb bone's own frame (the meshes share the
  skeleton), the two thumbs are the same length (tip 2.08 vs 2.04), but Better Hands' flesh rides 0.4-0.5 off each
  phalanx's axis, the base bulkier. `thumbMoves(hand, reference, pose)` (src/formats/morrowind/mwThumbFist.js:"export function thumbMoves") is,
  per thumb bone (Finger0, Finger01, Finger02), how far the hand's flesh centre stands from the reference's in that
  bone's frame - never out along the bone (never longer). `movedThumb` moves each vertex by its thumb bones' moves
  weighted as its skin weights them (the joints stay closed), in the fist pose, solved back to bind positions. Shape,
  texture and skin stay Robert's.
- The fist pose is the first frame of `FIST_GROUP` (`idlehh`) from the rig's own sources (ReAnimation's where it
  is installed). `prepareThumbFist(arm, { referenceBytes, handBytes, fist })` (src/formats/morrowind/mwThumbFist.js:"export function prepareThumbFist")
  binds Better Bodies' hand (and Better Hands' hand when a gauntlet hides the bare one) privately and gives the
  bare hand and the donor gauntlet hand their `fistPositions`.
- `createThumbFist(pieces)` (src/formats/morrowind/mwThumbFist.js:"export function createThumbFist") eases each piece between its authored and
  its fist positions over `THUMB_FIST.ease` (0.25 s), each piece on its own copy of the batch; the frame steps it by
  the fists' stance (`animWeaponType(...) === HandToHand`, src/combat/fpArm.js:"built.thumbFist?.step"). Only the fists: the owner
  saw no thumb defect in any other animation.

## 5. Earlier in the session

- The forearm armour under a gauntlet (2026-10-24/25, `docs/Better-Hands-Forearm-Gauntlet-Seam.md`): substituting
  the donor hands had dropped the vanilla armour on the forearm; `forearmShapesOnly` keeps each gauntlet side's
  forearm shapes (section 2.2 now cuts them by position).
- The `?url` import (`bb_skinf_no-uv-edits.json?url`) made every test importing the arm fail under `node --test`;
  it is behind the same `IN_BROWSER` gate as the asset globs (src/formats/morrowind/mwBetterBodies.js:"const betterBodiesFemaleUvEditsUrl").

## 6. How this was checked - the method (repeat it)

The in-game browser view could not be driven here, so every geometric claim was checked OFF-GAME on the owner's
own data, then confirmed by the owner in game:

- The owner's Morrowind is at `D:\Steam\steamapps\common\Morrowind\Data Files` (Morrowind.bsa, Morrowind.esm,
  Better Bodies.esp). `parseBsaIndex` (mwFirstPerson.js) reads the BSA; `armorRecords`/`bodyParts` the ESM.
- Scratch scripts assembled the exact build (`assembleFirstPersonArm` on `meshes/xbase_anim.1st.nif`, or
  `meshes/base_anim.nif` for the third person; the same parts and flags the game passes), posed it with
  `clipReport` + `poseAssembly` on `xbase_anim.1st.kf` (`idlehh: start` for the fist), and measured in the wrist
  frame: rims, girths, seam drift under a turned hand bone, skin vertices outside the cuff.
- A small software rasterizer (pngjs, flat-shaded, z-buffered, one colour per part: arm grey, hand orange, cuff blue)
  rendered the assembled meshes to PNG from any angle - it found the netch cuff's V-gap and the third-person wrist
  poking through, which numbers alone had missed.
- Mutants were run in a COPY of the tree (scripts could not write `src/combat/fpArm.js` in the sandbox).

## 7. Tests and mutants

- `test/formats/morrowind/cufffit.test.js` - the ring, the fit, the bury, the spread draw, flares, the skin's girth
  and chords, the cut by position, the wiring pins (synthetic tubes on a two-bone stub skeleton).
- `test/formats/morrowind/thumbfist.test.js` - thumb bones, centres in the bone frame, the moves (never longer, never
  the palm), the moved thumb (shape kept), the gauntlet following, the ease, the wiring and the setting.
- `test/formats/morrowind/better_bodies_first_person.test.js`, `robert_bodies_first_person.test.js` - the sources and
  paths; `fparm.test.js` MW-D29 - the empty part.
- Mutant records, all killed when written: `tools/mutants/cufffit.json` (19), `thumbfist.json` (7), `emptypart.json` (1).

## 8. Open, for later sessions

- The donor gauntlet is the iron one for every material (the mod ships no other); textures stretch on it.
- The thumb is fitted in the fists' stance's first frame only; a fist animation that bends the thumb far from it is
  untested.
- The third person still draws Better Bodies' body (its own provider); its gauntlets get EMPTY-PART but not CUFF-FIT.
- Branches: `Dev` is the integration branch (the owner, 2026-10-26); `body`, `animated-cloaks` and `all-animations`
  were set to the same commit as `Dev` to start their own directions from.
