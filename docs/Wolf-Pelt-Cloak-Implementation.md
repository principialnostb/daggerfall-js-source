# Wolf Pelt Cloak — active implementation

Updated 2026-10-29. Start with [Equipment handoff](Equipment-Claude-Handoff.md). This document describes the active implementation, not the rejected concept iterations.

## Accepted asset

The owner retained the original five-shape rebuilt cloak and accepted the later visible wind animation in the game. Do not replace it with the experimental concept assets. The current topology is 7,088 triangles:

| Shape | Vertices | Triangles | Role |
|---|---:|---:|---|
| Wolf_Back_Panel | 391 | 704 | Connected hide support |
| Wolf_Back_Locks | 1750 | 2400 | Back fur |
| Wolf_Upper_Drape | 147 | 240 | Shoulder support |
| Wolf_Nape_Locks | 770 | 1056 | Rear neck fur |
| Wolf_Shoulder_Locks | 1960 | 2688 | Shoulder fur |

This is geometric layered fur with cutout textures, not individual simulated hairs. The NIF is skinned to Bip01 Spine2; secondary motion is CPU deformation after the character pose. Tuft topology matters: the motion controller expects the original 35-vertex locks. Replacing geometry requires reviewing that assumption.

Three looks are available: wolf-brown, wolf-white, wolf-black. Earlier wolf-grey preferences resolve to brown. All four Casual/Formal cloak templates (154, 155, 191, 192) can select them without a material restriction. Statistics and item data are preserved. Choices are local, shared by template through mwCloakLooks, not item-instance customization.

## Source, fitting and reproduction

Pelts o Plenty supplies local texture atlases; its original rounded pelt shell is not the active geometry. Source credits: qIp / Pelts o Plenty; heavy collar NordwarUA; fur technique FrankBlack. Keep third-party source and generated meshes/textures out of Git, as with the Skyrim iron set.

Run from the repository root:

```powershell
$env:PELTS_PATH = "Mods/Textures/Pelts 'o' Plenty - Fur Pelt Cloaks"
$env:BLENDER = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'
node tools/skyrim/importWolfCloak.mjs
```

The importer invokes wolfCloakCage.mjs to sample runtime-posed Better Bodies, the iron armour and the helmet into a fitting cage. rebuildWolfCloak.py builds the hide and layers; fitWolfCloak.py fits the upper region to that cage. It writes scratch/skyrim/wolf/rebuilt.json and a Blender inspection scene. The importer exports three skinned NIFs, two DDS atlases per colour, and three inventory thumbnails. The final shoulder tips bend down slightly; RGB detail is softened toward the iron set while alpha cutouts are retained.

Prerequisites: Node dependencies, Python with Pillow, Blender, the local Pelts source, Better Bodies, the vendored female skeleton, and previously imported iron pieces. BETTER_BODY/FEMALE_SKELETON in tools/skyrim/mwBody.mjs declare the actual local body/skeleton paths. Running an importer rewrites local outputs: preserve accepted assets before artistic experiments.

Generated runtime files:

- src/assets/mw/meshes/wolf_pelt_{brown,white,black}.nif
- src/assets/mw/textures/wolf_pelt_{brown,white,black}_{hide,clumps}.dds
- src/assets/mw/looks/wolf_pelt_{brown,white,black}.png

## Runtime motion

Vanilla Animated enables createWolfPeltMotion/stepWolfPeltMotion in mwWolfPeltMotion.js through fpArm.js. Ordinary cloaks retain their cloth path; wolf meshes skip that direct cloth deformation. Vanilla/Simply retain the wolf appearance without this custom secondary motion.

1. The existing cloth solver runs on a separate connected back-panel proxy. Nearest-four X/Z interpolation transfers deformation to back fur, attenuated for the heavy hide.
2. Three damped spring controls add inertia; independent tuft-end springs increase flexibility toward the free ends. Supported upper roots remain anchored.
3. Movement phase travels down/across the hide; energy ramps with movement and decays after stopping.
4. A separate persistent wind clock adds slow gusts and broad travelling rolls even at rest. Tufts hinge about their roots with increasing bend toward tips, changing silhouette and normals visibly.
5. A coarse shared envelope sampled from posed body/armour supplies bounded, eased rear contact correction. Normals, source generation and bounds are updated before CPU upload.

Integration uses a fixed 120 Hz step and resets after tab suspension. ROOT=100 / HEM=22 are in the accepted asset's bind coordinates. This is not full cloth/self collision or a shader-only normal effect. Extreme poses, back-mounted shields and weapons can still clip; no zero-clipping guarantee is made.

## Validation and limits

Tests: test/systems/wolfCloak.test.js (selection, assembly, geometry, cutout NIF round trip) and test/formats/morrowind/mwwolfpeltmotion.test.js (anchored roots, settling versus continuing wind, travelling wave, finite outputs, frame-rate variation/tab resume and contacts).

node tools/skyrim/probeWolfPeltMotion.mjs exercises the actual local wolf/iron/body/KF assets offline and writes scratch/wolf-motion. previewWolfCloak.mjs and renderWolfCloak.py produce Blender inspections of exported/runtime-posed meshes. These are not in-game screenshots.

The owner explicitly accepted the final in-game motion. Later inventory changes have automated checks, but their latest layout/retained-card changes still need a fresh in-game visual check. Old scratch proposal/concept directories and src/assets/mw/source/wolf_fur_card.png are unused experiments. Do not connect them or infer the current mesh from those pictures. docs/Wolf-Pelt-Cloak-Audit.md is the initial historical audit only.
