# Own Armour Models: Steel Plate, Ebony Plate, Brigandine

The port ships its own worn armour for the Morrowind body, made for the game by Mac: a full steel plate set with a
helm two ways, a full ebony plate set, and a brigandine for Roleplay & Realism: Items' metal jerkin. The player sees
them on their own body, on other players and on NPCs who wear those pieces, whenever Morrowind's data is attached.

## How it works

- **The table.** `OWN_MW_ARMOR` (`src/characters/ownModels/ownArmorModels.js`) stands where a Morrowind ARMO and its
  BODY records would: for each piece, the Morrowind parts it fills and the mesh for each. `ownArmorModelFor` keys on
  the item's template and material; every other piece resolves through the player's own Morrowind records.
  `composeWornArmor` (`src/formats/morrowind/mwItemMap.js`) wears them on the ordinary path, so the priority law and
  the skin shadows apply as for retail armour.
- **Steel plate.** Daggerfall's seven classic pieces in Steel: cuirass with a plate skirt, gauntlets, greaves, two
  pauldrons, helm and boots. The helm comes closed (visor and plume) or open (a nasal helm, the face showing),
  chosen by `ownArmorParts` from the Steel Helm setting.
- **Ebony plate.** The same seven pieces in Ebony, filling and hiding what their steel twins do. One helm, closed.
- **Brigandine.** Roleplay & Realism: Items' Jerkin (`RRI_JERKIN_TEMPLATE`) in any plate metal
  (`BRIGANDINE_METALS`) wears one brigandine mesh, baked once a metal with that metal's painting
  (`brigandine_<metal>.nif`). It is worn as a cuirass. Leather and fur jerkins keep the retail cuirass.
- **Rigging.** The steel and ebony meshes ship skinned to Morrowind's bones, weighted at bake time, and bind exactly
  as retail armour does. The brigandine is skinned at bind time from the body under it (`skinFrom`,
  `src/formats/morrowind/mwSkinTransfer.js`) and moved onto the wearer's chest first (`fitTo`).
- **What a piece covers** (`hides`). A gauntlet hides the wrist and forearm, a boot the ankle and knee, a pauldron the
  upper arm to the elbow, a closed helm the head. Their skin is not drawn. The open helm shows the face and keeps the
  head.
- **Shipping.** The meshes and textures ship under `meshes/` and `textures/` through `src/systems/ownMwAssets.js`.

## Rules

- Steel plate replaces Steel only. Silver and Elven keep retail's steel; every Roleplay & Realism piece but the
  brigandine keeps retail's (Mac).
- Ebony plate replaces Ebony only. Mithril and Adamantium keep the Morrowind ebony they map to (Mac).
- Every brigandine metal wears its own painting, one a metal (Mac). Steel's is red.
- The steel plate ships skinned, as retail armour does (Mac).
- The Steel Helm setting (`steel-helm`, pref `mwSteelHelm`, `closed` by default, Combat group) is the viewer's: it
  changes how this machine draws every steel helm and never reaches the wire (Mac).
- The doctrine records the source files and baked assets as SUPPLIED (`test/tooling/doctrine.test.js`).

## Daggerfall Unity

DFU draws armour only on the paperdoll and the classic sprites; it has no Morrowind body. These models are the
port's own, worn on the Morrowind body that the port draws when the player attaches Morrowind's data.

## Code and tests

- `src/characters/ownModels/ownArmorModels.js` - the table, the helm styles
- `src/formats/morrowind/mwItemMap.js` `composeWornArmor` - wears an own piece on the body
- `src/formats/morrowind/mwSkinTransfer.js` - the brigandine's bind-time skin
- `tools/bakeSteelPlate.mjs`, `tools/bakeEbonyPlate.mjs`, `tools/bakeBrigandine.mjs` - the bakes;
  `tools/fbxStrip.mjs`, `tools/skinWeights.mjs`, `tools/nifWrite.mjs` - their helpers
- `test/formats/morrowind/mwsteel4.test.js`, `mwbrig2.test.js`, `mwbrig3.test.js`, `mwbrig4.test.js`,
  `mwfit1.test.js` - the rig, the brigandine's skin and fit, every metal, what the plate covers

## Open

- Seen in game only from Mac's screenshots: no retail data is in the tree. The open helm's face from the front is
  still to be looked at.
- The weights are geometric, not painted. A bad fold in play is fixed in the bake's rig table and a re-bake.
- Women and beasts wear plate fitted on a man, skinned to their own bones; beast feet are not kept out of boots.
- Ground and icon pictures of these pieces still resolve to retail meshes.
- Whether the geometry and paintings are Mac's own work or carry a licence is Mac's to confirm.

## Added on Dev (merged 2026-11-13)

## Clothing under the plate

In the shared local and peer outfit composer, the explicit full-slot coverage of a worn
plate can reserve a lower-priority cloth panel (mwItemMap.js:"const coversClothing =").
An overlapping armour panel keeps its mesh. A meshless retail leg reservation keeps an existing cloth panel. A named leg model missing from the archives cannot replace cloth. A hidden slot only inherits explicit coverage when the armour part that provides it is present. This extends DFO's 3D clothes composition beyond DFU's
paper-doll images
([ItemHelper.GetItemImage](https://github.com/Interkarma/daggerfall-unity/blob/master/Assets/Scripts/Game/Items/ItemHelper.cs)).

## Rigid breastplate shell (2026-11-09)
Fist-series geometry diagnostics found adjacent shell vertices carried by different clavicle and spine bones.
Those bones turn independently during a punch, stretching the metal plate. The first cuirass shape now follows
`Bip01 Spine2` as one shell; the second shape, the separate waist band, retains its articulated joint weights
(tools/bakeSteelPlate.mjs:"export function pieceRig"). The NIF is regenerated from the committed
source, not corrected at runtime. Other pieces and source geometry are unchanged.
This is the port's own armour rig, continuing MW-STEEL4's departure from DFU's sprite presentation. OpenMW's
[`RigGeometry::cull`](https://github.com/OpenMW/openmw/blob/master/components/sceneutil/riggeometry.cpp) remains the
skinning reference: inverse bind times animated bone, weighted then post-transformed.
No change to that law or weight normalization is made. The regression in test/formats/morrowind/mwsteel4.test.js
turns spine and shoulder bones independently and measures every shell triangle edge; the byte-for-byte bake check
in test/tooling/mwsteel1.test.js also passes. This does not certify the underlying body or every other garment.
**THE ROW IS GONE (2026-10-27, the owner: "the same helms open, closed, horned still hang in the settings ... remove
what is no longer current").** A helm's look is turned on the worn piece in the inventory (LOOK-VARIANTS,
`04-Characters/Look-Bench.md` section 2), which writes the same pref, `mwSteelHelm`, and rebuilds the body itself
(lookVariants.js rebuildForLook); the `steel-helm` Features row, its place on the Bodies tab and its TILE_AFTER step are
removed, and an unset pref is the closed helm. The paragraph below records the switch as it was built.
