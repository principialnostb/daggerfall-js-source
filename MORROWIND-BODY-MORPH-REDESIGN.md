# Body morph redesign

Status: first diagnostic correction on `feature/body-morph-geometry-audit`. This is not a claim that the editor's deformations are anatomically calibrated. The current generic coordinate masks remain a temporary fallback until the real body meshes have authored morph data.

## Why the current method is insufficient

The current runtime estimates anatomy from normalized whole-body coordinates and Gaussian height bands, then gates those masks with NIF skin influences where recognized bone names exist. This is fragile for several independent reasons:

- body meshes are separate skinned pieces and may use different local vertex sets;
- race/sex variants need not share topology or the same skin-influence naming;
- bone weights describe animation influence, not necessarily the exact surface region a shape slider should deform;
- a height/width threshold cannot distinguish nearby surfaces such as abdomen, breast, pelvis, upper thigh, and buttock;
- changing global bounds can move a mask when another body part (for example, outstretched arms) changes.

## Target architecture

### 1. Inventory the actual assets

For every supported body asset, record race key, sex, source NIF, mesh slot, vertex count, triangle count, bounds, skeleton references, and per-bone influence coverage. Treat each distinct topology as a separate morph target. Do not assume that the female Nord mesh, race-specific male meshes, Seamless DMRA, hands, or underwear variants are interchangeable.

The report must distinguish parsed facts from heuristics and explicitly identify missing/unrecognized bones.

### 2. Use authored morph deltas as the primary representation

Store each slider as vertex offsets relative to the exact base mesh, in a versioned asset keyed by mesh identity/topology. A slider value applies a scaled delta to those vertices. Author the neutral and positive/negative targets in a mesh editor or import them from OBJ/shape-key data while preserving vertex count and order. This is the same core model used by shape keys/blend shapes and Skyrim TRI/BodySlide morphs.

Runtime formula-based deformations should remain only for genuinely global controls or as a labelled fallback—not the source of truth for localized anatomy.

### 3. Keep region masks explicit and inspectable

For fallback procedural controls, use per-role mask data and bone weights only when the relevant role is actually represented. Never use the existence of any recognized bone as evidence that every anatomical role is covered. Mask data should be inspectable as vertex counts, weight ranges, overlap reports, and visualized per-vertex heat maps.

### 4. Separate geometry from rig transforms

Use vertex morphs for local shape/volume and projection; use skeleton transforms for controls that should move a whole joint chain or alter proportions while preserving animation. Head scale must include the head geometry/attachment and its placement, not just move the torso beneath a stationary head.

### 5. Validate against the real runtime

For each race/sex/mesh variant and each slider at minimum, test -100%, neutral, and +100%, then important slider pairs. Assert that:
- the intended region moves by a measurable amount;
- protected regions stay within a documented tolerance;
- no vertices become NaN/Infinity;
- normals remain finite;
- bounds and connected seams remain valid;
- the preview and gameplay rig use the same morph data;
- clothing/armor behavior is explicitly tested rather than assumed.

Synthetic geometry tests verify algorithms only. They do not count as proof that a real Better Bodies mesh deforms correctly.

## First correction

The existing implementation used one global `hasRecognizedBoneRegions` flag. If any role was recognized, all other roles stopped using their geometric fallback, even when the mesh had no corresponding bone record. The first patch changes this to per-role recognition and adds a regression test for the missing-arm-role case.

This correction prevents one category of silent failure. It does not remove approximate masks or claim that the current sliders now match anatomy exactly.

## Research references

- BodySlide / Outfit Studio: https://github.com/ousnius/BodySlide-and-Outfit-Studio
- BodySlide project and slider data workflow: https://github.com/Insole-Invictus/Bodyslide-Outfit-Studio-Manual/blob/master/Creating-a-BodySlide-project.md
- Skyrim TRI morph targets overview: https://github.com/BadDogSkyrim/BethesdaLibrary/blob/main/docs/file-formats/morphs-shapekeys.md
- EA, *Innovations in The Sims 4 Character Creator* (morph targets, bone-driven deformations, deformation maps): https://www.gdcvault.com/play/1022085/Innovations-in-The-Sims-4
