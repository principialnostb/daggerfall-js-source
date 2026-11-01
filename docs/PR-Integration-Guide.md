# test-PR: integration guide (for developers and for Claude)

Built from the fork's `source-code-mod`, squashed over Lattymoy `main` with no fork history (that history carries Morrowind data).

## What ships

| Item | Code | How it works |
|---|---|---|
| Iron look on steel pieces, open/closed helm | `systems/lookVariants.js`, `ownArmorModels.js` | A per-piece look stored in prefs. A look whose meshes are absent is not offered. |
| Skyrim axe switch | `ownModels/localWeaponModels.js`, `combat/weapon/axeViewPlacement.js` | Same rule. |
| Portraits and 2D helm looks | `systems/inventoryFace.js`, `systems/helmetPaperdollLooks.js`, `ui/enhanced/helmetAppearancePicker.js` | Cosmetic prefs, never written to the item. |
| THIRD PERSON control | `ui/enhanced/enhancedMenu.js`, `combat/weapon/weaponRig.js` (`morrowindThirdPersonOnly`) | Morrowind body in third person, classic first person. |
| Bodies and hands | `formats/morrowind/mwBetterBodies.js`, `mwThumbFist.js`, `mwCuffFit.js` | Selected by `MW_STOCK`; falls back to the game's own when files are absent. |
| Walk, run, stance legs | `bodyMotion/travelStride.js`, `stride.js`, `guardStride.js`, `combat/lowerBodyLayer.js`, `loopSeam.js`, `idleSettle.js` | Layers over the clip; never replace it. |
| First-person blows | `combat/blowFlow.js`, `fpInertia.js`, `hitResponse.js`, `weapon/attackSeries.js` | Blow timing and hand weight. |
| Shield movement | `combat/shieldGuard.js`, `leftArmLayer.js` | Left-arm layer in the guard. |
| Pixelation section | `systems/charPixel.js`, `render/charPixelLayer.js`, `settingsMap.js` | Three dials. Replaces the `mw-model-detail` row. |

## Why settings are constants

The owner's chosen sources are in `src/systems/mwStockChoices.js` (`MW_STOCK`). The fork's source rows are removed, so a stored value cannot change a build. To make a source selectable again, put a row back and read it at the `MW_STOCK` call sites.

## Removed on purpose (not ready)

Animated cloaks and the iron-set cloak, character editor, shield on the back, third-person look-around camera, upper-body guard behaviour (`armClearance`, `armouredSword`), third-person blows (`blowLegs`). `bodyMotion.js`, `bodySolve.js`, `carry.js` and `mwCloakFit.js` are upstream's own.

## Done but not integrated: rights under review

See `docs/PR-Asset-Manifest.md`. The code paths exist; the files are not in the repo. Do not add them until the rights column is cleared.

## Steps for a developer or Claude

1. Read `CLAUDE.md`, `bible/Home.md`, `bible/01-Overview/Port-Doctrine.md`.
2. `npm ci`, `npm run lint`, `npm run types`, then the gates listed in `CLAUDE.md`. Expect test pins to need work: see "Not verified".
3. To see held-back items locally, place the packs under `Mods/` (ignored by git) and run the imports in `bible/04-Characters/Skyrim-Iron-Set.md`. Never commit the results.
4. Check in the game: looks in the inventory card, THIRD PERSON on and off, the pixel dials, walk and run in a province outside the Bay.

## Not verified

The full suite and CI were not run, and THIRD PERSON was not tried in the game. Conflicts with upstream's reformatting were resolved mostly by taking one side, so review `fpArm.js`, `mwItemMap.js`, `peerBodies.js`, `mwTextureClient.js`. Removed features may leave dead branches. `createFpArm` is over its host ceiling (`test/scenes/hostceiling.test.js`).
