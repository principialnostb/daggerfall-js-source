# Shield appearances

The inventory appearance selector uses `src/characters/ownModels/shieldLooks.js` as an explicit template/material compatibility list. Preferences live alongside existing armour looks, keyed `shield:<template>:<material>`. Selection is validated both when offered by the UI and when resolving the worn mesh. No material fallback chain grants a different shield material a new appearance. Item weight, armour value and other gameplay fields remain unchanged.

Shield cards offer appearances in the local backpack as well as when equipped. Pairs without an available compatible model show an explicit status message instead of silently hiding the selector. Choices follow the existing armour convention and apply to the template/material pair, including another currently equipped shield of that pair; the rig is rebuilt after a choice so that shared preference remains consistent.

Current local Skyrim alternatives:

| Daggerfall type | Material | Additional models |
|---|---|---|
| Round shield (110) | Leather | Hide |
| Round shield (110) | Iron | Iron, Banded Iron |
| Round shield (110) | Steel | Steel |
| Round shield (110) | Dwarven | Dwarven |
| Kite shield (111) | Elven | Elven |
| Kite shield (111) | Ebony | Ebony |
| Kite shield (111) | Daedric | Daedric |

Bucklers, tower shields and material/type pairs without an approved alternative retain their existing Morrowind resolver; no invented alternative is exposed. The Original card uses the current item's dyed paperdoll image, with the original Morrowind icon as fallback. Normal inventory 3D icons resolve the selected shield model. Runtime assembly, first/third person and stowed equipment use the existing shield-bone path.

Reproduce with `node tools/skyrim/importShields.mjs`. `SKYRIM_PATH` overrides the default local install directory. The importer reads local BSAs, preserves source proportions, fits round shields to a 44-unit envelope and kite shields to a 60-unit envelope, and rotates the source decorative face into Morrowind's +Z shield-local direction. UVs remain in their source orientation. Diffuse textures are converted to 256px DDS; shader-specific reflective/normal effects are not imported. Local NIF/DDS/thumbnail files are ignored by git.

`test/systems/shieldLooks.test.js` covers wrong material/type rejection, stale preference rejection, restore to Original, inventory-to-composition selection, and rigid attachment/finite posing of every local import. `scratch/shield-import/front.png` is an offline Blender inspection of runtime-posed meshes, not an in-game screenshot. Only the iron shield has been visually inspected on the full character in this pass; all imported thumbnails were inspected for texture orientation and silhouette.
