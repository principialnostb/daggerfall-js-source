# Better Hands: first-person forearm armour and gauntlet seam

> SUPERSEDED (2026-10-26): the record is `bible/04-Characters/First-Person-Hands.md` - the cuff is now cut by position and fitted to the donor hand (CUFF-FIT), and a part naming no body part reserves its slot (EMPTY-PART). This note is kept as the first report.

## Status

This document records the observed regression and the intended rendering contract. The screenshot/report establishes that the missing region is bilateral, between the pauldron/elbow end and the gauntlet cuff; removing gauntlets restores the underlying arm in that region. The report does **not** establish that every armour set uses the same mesh or that a single slot-priority change is sufficient.

## Relevant implementation

- `src/formats/morrowind/mwItemMap.js` owns worn-item composition. `composeWornArmor()` arbitrates individual `ARMO_PART` slots and returns `adds`, third-person `shadows`, first-person `fpShadows`, `covers`, and diagnostic `notes`.
- The slot arbitration helper `claim(part, prio, add, under)` replaces a slot only when the incoming priority is strictly greater than the current priority. Equal-priority claims preserve the earlier claimant.
- `fpWornAdds()` selects parts whose bone lists intersect `FP_WORN_BONES`; the first-person path draws arm-bone parts rather than the complete third-person body.
- `src/characters/ownModels/ownArmorModels.js` declares shipped armour parts. Some gauntlets declare `hides: ['left/right wrist', 'left/right forearm']`. These are whole-slot declarations, not geometric clipping planes.
- `fpShadows` controls first-person skin suppression. It must not be confused with selection of armour meshes: hiding skin and suppressing another worn armour mesh are different operations.

## Observed behaviour

With Better Hands enabled, the armour covering the forearm/elbow-to-cuff region is absent on both arms, while the shoulder/pauldron and gauntlet are rendered. Removing the gauntlets makes the arm surface in the affected region appear. Other armour regions are reported to render correctly.

This points to an interaction between gauntlet slot occupancy/hidden-part declarations and first-person worn-part selection. It does not, by itself, prove whether the missing object is rejected by slot arbitration, omitted by first-person filtering, or occluded by the gauntlet mesh.

## Desired rendering contract

1. The gauntlet owns its cuff/wrist region and must render over that region.
2. Forearm armour remains visible from the elbow down to the gauntlet cuff.
3. Forearm armour must not protrude through or render over the gauntlet at the cuff.
4. Skin under both pieces remains hidden; no skin gap should be introduced as a side effect.
5. Left and right arms behave symmetrically.
6. Third-person equipment composition and unrelated armour slots must remain unchanged.

## Important geometry constraint

A slot such as `left forearm` is an indivisible arbitration unit in the current composer. Declaring that slot hidden can suppress the whole forearm part; it cannot mean “hide only the portion physically inside the cuff”. Slot priority alone also cannot cut triangles from a mesh.

Therefore, do not fix this by blindly adding/removing `forearm` from `hides` or by changing the global priority law. First establish whether the affected forearm armour mesh already terminates at the cuff. If it does, correct the per-slot claim/first-person selection so the forearm armour survives while the gauntlet owns wrist/hand. If it overlaps the cuff geometrically, the robust fix is a correctly fitted/trimmed forearm mesh (or an explicit supported clipping/segmentation mechanism), not a global shadow tweak.

## Implementation and verification plan

- Trace one failing loadout through `composeWornArmor()`: record the forearm slot's final claimant, `adds`, `shadows`, and `fpShadows`, both with and without gauntlets.
- Add regression tests for both arms: forearm armour + gauntlet, forearm armour without gauntlet, gauntlet without forearm armour, and pauldron + forearm armour + gauntlet.
- Assert that the forearm armour remains in first-person additions when equipped, while the gauntlet remains present and skin suppression remains correct.
- Visually inspect the cuff seam using the actual shipped/retail NIFs. Confirm no missing band, z-fighting, or armour triangles passing through the gauntlet.
- Run the relevant Morrowind format tests and the full test suite before merging.

## Non-goals

- Do not change skeleton/bone mappings without evidence; the arm itself appears when gauntlets are removed.
- Do not remove gauntlets from first-person rendering.
- Do not suppress the entire forearm slot merely to eliminate a possible mesh overlap.
- Do not claim the visual seam is fixed based only on a unit test; geometry must also be checked in-game.
