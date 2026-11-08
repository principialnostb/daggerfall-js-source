# BLOODBATH build versus supplied source-code

Comparison date: 2026-11-08. Baseline: `C:/Users/user/Desktop/source-code`. Working tree: `C:/Users/user/Desktop/FDO FORK/test-PR`.

Both repositories report HEAD ea7d731249efd371285ab3d2ba26e25815f30ebc. This audit compares actual working files, not commit IDs. Equal revisions do not imply equal working trees.

Scope: text files under src, tools, app, scripts and locales, below 2 MB each. Build outputs and dependencies are excluded; CRLF is normalized. This is not a binary-asset or license audit. Found 204 differences: 130 added and 74 changed; 147 in src, 51 in tools, 4 in app, 1 in scripts and 1 in locales. These counts include supporting text and tools, not 204 player features.

Attribution follows the owner’s rule: changes made for another mod are BLOODBATH integration, not exclusive ownership of that mod. Code differences alone do not establish authorship. Existing comments sometimes attribute earlier decisions to Mac; their provenance must not be silently reassigned.

DFU remains the reference named by the project doctrine. Here “original” means the supplied source-code working tree, not stock Morrowind or stock DFU. No claim of complete runtime parity is made.

## Integration: resource providers

| Change | Difference / limitation | Evidence |
|---|---|---|
| Morrowind Animation Overhaul | Movement sources behind the legacy Vanilla choice. | `src/formats/morrowind/mwWalkAnimationAssets.js` |
| ReAnimation + OpenMW Dynamic Animations | First-person actions and directional movement; third-person overlays. | `src/formats/morrowind/mwWalkAnimationAssets.js` |
| Hit Reactions Animated v2 | Imported hit, stagger and death clips; separate reactions group. | `src/combat/fpArm.js` |
| Better Bodies + Robert bodies + Better Hands | Body meshes, matching skins, first-person arms, fist thumb and gauntlet fitting. | `src/formats/morrowind/mwBetterBodies.js` |
| Texture and equipment packs | High-resolution skin, Intelligent Textures, Vurt, Better Clothes, Better Morrowind Armor and joints, Westly packs; available providers are not proof of active selection. | `src/systems/bundledMorrowindMods.js` |
| Cloaks and pelts | Simply Animated Cloaks sources, cloth simulation, collisions, wolf-pelt motion and matching armor palettes. | `src/formats/morrowind/mwCloakPhysics.js` |
| Skyrim-derived equipment | Iron and horned armor, shields, battleaxe, wolf pelts; supplied from owner files, not wholly original artwork. | `src/characters/ownModels/shieldLooks.js` |

## Integration: code-authored behavior, not just imported clips

| Change | Difference / limitation | Evidence |
|---|---|---|
| Shield combat | Added bash, fist shield stance, left-arm overlay, shield carriage while walking/running, recovery. | `src/combat/shieldGuard.js` |
| Attack timing | Arm-led hit delivery, calm pacing, recovery, blend windows and buffered attack series. Not certified disabled by the catalog. | `src/combat/weapon/armLedBlow.js` |
| Click variety | At most two repeated strike families; currently in playerWeapon without a mod-group gate. | `src/characters/weaponStates.js` |
| Moving strikes | Separate upper/lower-body motion, torso rotation, stride preservation during attacks. | `src/combat/movingStrike.js` |
| Body solver | Weapon grips, arm/elbow clearance, two-handed guard, leg stride and return-to-rest changes. | `src/characters/bodyMotion/bodyMotion.js` |
| Hit feedback | Attacker/target hitstop and camera shake; code cites Precision and Ershin as the reference. | `src/combat/hitResponse.js` |
| First-person presentation | Landing inertia, running hand placement and finger curl, axe framing, cuff/armor seam fixes. | `src/combat/weapon/axeViewPlacement.js` |
| Garment fitting | Triangle-surface clearance, deformation and deferred equipment hides. | `src/formats/morrowind/mwSkinTransfer.js` |

## BLOODBATH features and independent changes

| Change | Difference / limitation | Evidence |
|---|---|---|
| Campfire | Custom geometry, embers/flame, ground alignment, snow, pixelation. Author BLOODBATH confirmed by owner. | `src/world/campfireModel.js` |
| Paperdoll customization | 2D face selection, six helmet appearances, paging, 2D/3D tabs and availability indicators. Author BLOODBATH confirmed by owner. | `src/ui/enhanced/helmetAppearancePicker.js` |
| 3D customization UI | Model selection on item cards, inventory previews and native-inventory wheel changes. UI authorship BLOODBATH; asset origins remain separate. | `src/systems/lookVariants.js` |
| Appearance editor | Stored display-only race/sex/head/hair and body morphs, preview, preservation across rebuilds. Integration with imported bodies. | `src/ui/appearanceEditor.js` |
| Inventory modes | Separate 2D/3D figure and icons; Paperdoll Enhanced integration. | `src/ui/enhanced/inventoryPresentation.js` |
| Pixelation | Separate first-person, player, NPC, world-object and environment paths. Implementation attribution needs history review before claiming exclusive authorship. | `src/render/charPixelLayer.js` |
| Camera preview | Orbit/return behavior and mouse interception beyond the supplied original; based on OpenMW preview reference. | `src/player/lookAround.js` |
| Grounded movement fix | Standing state corrected while walking; separate from asset selection. | `src/player/motor.js` |
| Horse rendering | World meshes instead of ordinary sprite compositor; distant standing horses keep 3D, range changes from 60 to Infinity. | `src/world/standingHorses.js` |
| Resource menu and cache profiles | Catalog, group gates, persistent imports, active appearance, stale async-result protection. | `src/systems/enhancedModResources.js` |
| Data pipeline | Lazy loose-file reads, decoder timeout/fallback, diagnostics, UV channel fixes and GPU cloak bounds. | `src/formats/morrowind/mwTextureClient.js` |
| Desktop fork | DFO Online Mod branding, separate userData, fork release endpoints and diagnostics IPC. | `app/main.cjs` |

## Release blockers for the description

Do not describe “groups off” as full restoration of the supplied original. Attack pacing, buffered series, click variety, camera, horses, native-inventory look cycling and low-level fixes have independent paths. Each needs an explicit keep/gate decision and runtime validation. Provider availability also does not establish that files were selected, parsed and bound in the running scene.

## Complete text-file inventory

- added: `src/assets/mw/source/wolf_fur_card.md`
- added: `src/characters/activeAppearance.js`
- added: `src/characters/bodyMorphs.js`
- added: `src/characters/bodyMotion/armAnatomy.js`
- added: `src/characters/bodyMotion/armClearance.js`
- added: `src/characters/bodyMotion/armouredSword.js`
- added: `src/characters/bodyMotion/blowLegs.js`
- changed: `src/characters/bodyMotion/bodyKit.js`
- changed: `src/characters/bodyMotion/bodyMotion.js`
- changed: `src/characters/bodyMotion/bodySolve.js`
- added: `src/characters/bodyMotion/bodyWeight.js`
- changed: `src/characters/bodyMotion/carry.js`
- added: `src/characters/bodyMotion/elbowSkin.js`
- added: `src/characters/bodyMotion/freshReturn.js`
- changed: `src/characters/bodyMotion/gait.js`
- added: `src/characters/bodyMotion/guardElbows.js`
- added: `src/characters/bodyMotion/guardStance.js`
- added: `src/characters/bodyMotion/guardStride.js`
- added: `src/characters/bodyMotion/guardTravel.js`
- added: `src/characters/bodyMotion/guardWalkBalance.js`
- added: `src/characters/bodyMotion/guardWalkPose.js`
- added: `src/characters/bodyMotion/handFingers.js`
- added: `src/characters/bodyMotion/legClock.js`
- added: `src/characters/bodyMotion/shieldSet.js`
- added: `src/characters/bodyMotion/stride.js`
- added: `src/characters/bodyMotion/travelStride.js`
- added: `src/characters/bodyMotion/trunkProfile.js`
- added: `src/characters/bodyShape.js`
- changed: `src/characters/headPortraits.js`
- changed: `src/characters/mobile/mobileUnit.js`
- added: `src/characters/ownModels/battleaxeFit.js`
- added: `src/characters/ownModels/localWeaponModels.js`
- changed: `src/characters/ownModels/ownArmorModels.js`
- changed: `src/characters/ownModels/ownClothingModels.js`
- changed: `src/characters/ownModels/ownWeaponModels.js`
- added: `src/characters/ownModels/shieldLooks.js`
- added: `src/characters/ownModels/wolfArmorPalette.js`
- added: `src/characters/ownModels/wolfCloak.js`
- added: `src/characters/playerBuildHold.js`
- changed: `src/characters/weaponStates.js`
- added: `src/combat/blowFlow.js`
- added: `src/combat/directionalWalkSampler.js`
- changed: `src/combat/fpArm.js`
- added: `src/combat/fpInertia.js`
- added: `src/combat/guardLocomotion.js`
- added: `src/combat/hitResponse.js`
- added: `src/combat/idleSettle.js`
- added: `src/combat/leftArmLayer.js`
- added: `src/combat/loopSeam.js`
- added: `src/combat/lowerBodyLayer.js`
- added: `src/combat/movementContinuity.js`
- added: `src/combat/movingStrike.js`
- changed: `src/combat/playerWeapon.js`
- added: `src/combat/shieldGuard.js`
- changed: `src/combat/twoHands/handsLaw.js`
- added: `src/combat/weapon/armLedBlow.js`
- added: `src/combat/weapon/attackSeries.js`
- added: `src/combat/weapon/axeViewPlacement.js`
- changed: `src/combat/weapon/weaponRig.js`
- added: `src/firstVisitPins.js`
- changed: `src/formats/morrowind/mwAnim.js`
- added: `src/formats/morrowind/mwBetterBodies.js`
- added: `src/formats/morrowind/mwBetterBodiesPaths.js`
- changed: `src/formats/morrowind/mwCharacter.js`
- changed: `src/formats/morrowind/mwCloakFit.js`
- added: `src/formats/morrowind/mwCloakPhysics.js`
- added: `src/formats/morrowind/mwCuffFit.js`
- changed: `src/formats/morrowind/mwFirstPerson.js`
- changed: `src/formats/morrowind/mwGpuSkin.js`
- changed: `src/formats/morrowind/mwItemMap.js`
- changed: `src/formats/morrowind/mwNifMesh.js`
- added: `src/formats/morrowind/mwPoseContinuity.js`
- changed: `src/formats/morrowind/mwSkin.js`
- changed: `src/formats/morrowind/mwSkinTransfer.js`
- changed: `src/formats/morrowind/mwTextureClient.js`
- added: `src/formats/morrowind/mwThumbFist.js`
- added: `src/formats/morrowind/mwWalkAnimationAssets.js`
- added: `src/formats/morrowind/mwWolfPeltMotion.js`
- changed: `src/main.js`
- changed: `src/net/peer/peerBodies.js`
- changed: `src/player/cameraRecoiler.js`
- added: `src/player/lookAround.js`
- changed: `src/player/lookFilter.js`
- changed: `src/player/motor.js`
- changed: `src/player/mwView.js`
- added: `src/render/charPixelLayer.js`
- changed: `src/render/characterSprite.js`
- changed: `src/render/renderer.js`
- added: `src/render/worldPixelLayer.js`
- added: `src/scenes/campfirePixelBody.js`
- added: `src/scenes/campfirePixelFlame.js`
- added: `src/scenes/campfireSnow.js`
- added: `src/scenes/campfireVisual.js`
- changed: `src/scenes/camps.js`
- changed: `src/scenes/dataPipeline.js`
- changed: `src/scenes/dataSource.js`
- changed: `src/scenes/dungeon.js`
- changed: `src/scenes/dungeonContext.js`
- changed: `src/scenes/exterior.js`
- changed: `src/scenes/snowfallHost.js`
- changed: `src/scenes/worldModes.js`
- added: `src/systems/assetSourceSelection.js`
- added: `src/systems/bundledMorrowindMods.js`
- added: `src/systems/charPixel.js`
- added: `src/systems/devGlobUrls.js`
- changed: `src/systems/dfmodTextures.js`
- added: `src/systems/enhancedModCatalog.js`
- added: `src/systems/enhancedModProfile.js`
- added: `src/systems/enhancedModResources.js`
- added: `src/systems/enhancedModRuntime.js`
- changed: `src/systems/features.js`
- added: `src/systems/helmetPaperdollLooks.js`
- added: `src/systems/inventoryFace.js`
- changed: `src/systems/item/itemTemplates.js`
- added: `src/systems/lookVariants.js`
- added: `src/systems/modDiagnostics.js`
- changed: `src/systems/modSettings.js`
- added: `src/systems/simplyAnimatedCloaksAssets.js`
- changed: `src/systems/uiPrefs.js`
- changed: `src/systems/urlArchive.js`
- added: `src/systems/worldPixel.js`
- added: `src/systems/worldPixelConfig.js`
- changed: `src/tools/enhanced/enhancedMenu.js`
- added: `src/tools/mwCloakPreview.js`
- changed: `src/tools/mwViewer.js`
- added: `src/tools/paperdoll/betterBodiesPreview.js`
- added: `src/ui/appearanceEditor.js`
- changed: `src/ui/enhanced/enhancedInventory.js`
- changed: `src/ui/enhanced/enhancedMenu.js`
- added: `src/ui/enhanced/enhancedModCatalog.js`
- changed: `src/ui/enhanced/enhancedPlusStyle.js`
- changed: `src/ui/enhanced/enhancedStyle.js`
- added: `src/ui/enhanced/helmetAppearancePicker.js`
- added: `src/ui/enhanced/inventoryFaces.js`
- added: `src/ui/enhanced/inventoryFacesStyle.js`
- added: `src/ui/enhanced/inventoryPresentation.js`
- changed: `src/ui/facePortrait.js`
- changed: `src/ui/hud/hud.js`
- changed: `src/ui/item/itemIconUrl.js`
- changed: `src/ui/item/itemScroller.js`
- changed: `src/ui/native/nativeInventory.js`
- changed: `src/ui/paperDoll.js`
- changed: `src/ui/settings/settingsMap.js`
- added: `src/world/campfireGround.js`
- added: `src/world/campfireModel.js`
- changed: `src/world/horseRig.js`
- changed: `src/world/standingHorses.js`
- added: `tools/MW-CLOAK-PROBE.md`
- added: `tools/bakeHornedHelm.mjs`
- added: `tools/blender/hornedHelm.py`
- added: `tools/buildModDesktop.mjs`
- added: `tools/campfireExport.mjs`
- added: `tools/campfireGameProbe.mjs`
- added: `tools/campfireGroundProbe.mjs`
- added: `tools/campfireProbe.mjs`
- added: `tools/lookThumbs.mjs`
- added: `tools/motionProbe.mjs`
- added: `tools/mutants/blowflow.json`
- changed: `tools/mutants/bodymotion.json`
- changed: `tools/mutants/bodymotion_audit.json`
- changed: `tools/mutants/bodymotion_run.json`
- added: `tools/mutants/cufffit.json`
- added: `tools/mutants/emptypart.json`
- added: `tools/mutants/fpsheathe.json`
- changed: `tools/mutants/mwnpc9b.json`
- changed: `tools/mutants/mwpace1.json`
- added: `tools/mutants/shieldguard.json`
- added: `tools/mutants/thumbfist.json`
- changed: `tools/mutants/twohands_mw.json`
- added: `tools/mwBuildProbe.mjs`
- added: `tools/mwCloakAnimationProbe.mjs`
- changed: `tools/nifWrite.mjs`
- added: `tools/provingGround/clock.js`
- added: `tools/provingGround/compare.mjs`
- added: `tools/provingGround/kit.js`
- added: `tools/provingGround/report.mjs`
- added: `tools/provingGround/run.mjs`
- added: `tools/provingGround/scenario.mjs`
- added: `tools/skyrim/adaptIronHelmet.py`
- added: `tools/skyrim/bakePainting.py`
- added: `tools/skyrim/bsa.mjs`
- added: `tools/skyrim/buildWolfArmorPalettes.mjs`
- added: `tools/skyrim/fitWolfCloak.py`
- added: `tools/skyrim/importBattleaxe.mjs`
- added: `tools/skyrim/importIronCuirass.mjs`
- added: `tools/skyrim/importIronHelmet.mjs`
- added: `tools/skyrim/importIronLimbs.mjs`
- added: `tools/skyrim/importShields.mjs`
- added: `tools/skyrim/importWolfCloak.mjs`
- added: `tools/skyrim/mwBody.mjs`
- added: `tools/skyrim/previewWolfCloak.mjs`
- added: `tools/skyrim/probeWolfPeltMotion.mjs`
- added: `tools/skyrim/rebuildWolfCloak.py`
- added: `tools/skyrim/renderWolfCloak.py`
- added: `tools/skyrim/retarget.mjs`
- added: `tools/skyrim/sseNif.mjs`
- added: `tools/skyrim/wolfCloakCage.mjs`
- added: `tools/worldPixelProbe.mjs`
- changed: `app/lib/downloads.cjs`
- changed: `app/main.cjs`
- changed: `app/package.json`
- changed: `app/preload.cjs`
- added: `scripts/devLazyUrlGlobs.mjs`
- changed: `locales/ru/Port_Strings.csv`

## Local equipment restoration and catalog prerequisites

Comparison with source-code-mod found the cloak physics, wolf-pelt motion, armor and weapon selection code already present in test-PR. Local asset availability was a separate problem. The restoration copied 81 missing, gitignored files from the owner’s existing local checkout; it did not commit or fetch Bethesda assets. The local file list is in `.proving-ground/emc-restored-local-assets.txt`.

Armor selection now checks selected meshes before replacing standard parts. Missing saved looks preserve their preference but draw standard armor. Single available armor and weapon variants remain visible in customization. Only Vanilla Animated is selected for cloak integration; the retired static and imported-mesh dev choices are not exposed.

Shield-on-back visibility follows the body group. Group cards list resource readiness using text and green/red status colors. Character pixelation requires the body resources to be connected and enabled. Morrowind People and Billboard Look retain their values and move to Mods & files. The editor is linked from the body integration card. These changes are BLOODBATH integration; they do not create separate author-owned mods for each fitting or animation adjustment. In-game validation of transferred equipment and cloak behavior remains required.
