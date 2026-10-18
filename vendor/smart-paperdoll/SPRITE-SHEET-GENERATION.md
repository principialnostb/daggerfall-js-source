# Smart PaperDoll sprite-sheet generation

This workflow uses the repository's real EotB animation tables to extract archive-112364 sprite keys and PNG dimensions, then generates one reference-guided sheet through fal.ai and slices it into per-key PNGs. Generated art is still unreviewed and is not automatically enabled in runtime.

## Verified original sprite path

The original archive-112364 texture path is:

`vendor/eye-of-the-beholder/Textures/112364/112364_15-0.png`

It is under `vendor/eye-of-the-beholder`, **not** `vendor/class-skins`. Archive 112364 is the EotB foot archive. The extractor checks each corresponding PNG on disk and stops with an error if a source frame is missing. It obtains keys through the real `spriteFor()`, `STATE_TABLES`, and `frameCount()` implementations rather than inventing record/frame numbers.

## Run in Windows PowerShell

From the repository root:

1. Create the keys JSON from real tables (16 real, evenly sampled keys for a 4×4 preview):

   ```powershell
   node tools/extractSmartPaperdollKeys.mjs --limit 16 --out tools/smart-paperdoll-keys.json
   ```

   To export every unique archive-112364 frame key reachable from all 12 on-foot animation tables:

   ```powershell
   node tools/extractSmartPaperdollKeys.mjs --all --out tools/smart-paperdoll-keys-all.json
   ```

   Each JSON entry includes `key`, original `width`/`height`, a real `orientation` and `mirror` value, source path, and all table/frame/orientation contexts that resolved to that key.

2. Install the fal.ai API client locally (does not save it as a project dependency):

   ```powershell
   npm.cmd install --no-save @fal-ai/client
   ```

3. Create a key at https://fal.ai/dashboard/keys and keep it private:

   ```powershell
   $env:FAL_KEY = "YOUR_FAL_KEY"
   ```

4. Generate one 4×4 sheet using the two body-shape references and the **verified original texture** for palette/style reference:

   ```powershell
   node tools/smartPaperdollSpriteSheet.mjs --reference Reference/First.png --reference Reference/Second.png --reference vendor/eye-of-the-beholder/Textures/112364/112364_15-0.png --keys tools/smart-paperdoll-keys.json --rows 4 --cols 4 --palette-reference vendor/eye-of-the-beholder/Textures/112364/112364_15-0.png
   ```

   Do not share or commit `FAL_KEY`.

## Output

- `vendor/smart-paperdoll/generated/sprite-sheet.png` — generated sheet.
- `vendor/smart-paperdoll/generated/generated-manifest.json` — metadata.
- `vendor/smart-paperdoll/Textures/body/<archive>_<record>-<frame>.png` — frames.

The generator removes edge-connected magenta, resizes with nearest-neighbour, quantizes to at most 256 colors (using the original texture's palette when supplied), and clears hidden RGB in transparent pixels.

## Important limits

- The extractor produces real source keys and original canvas dimensions; it does **not** prove that newly generated poses match those frames.
- The current generator makes a 4×4 preview (16 keys), not every frame in the animation set. For all frames, the generated sheet must have enough cells and the generator's row/column arguments must match the complete keys file; a single 2K image may not have enough pixels for every source frame at usable resolution.
- Review every frame against its original before enabling it. This tool does not generate separate armor/body masks and does not connect the compositor.
- Until the art is reviewed and the compositor is implemented, runtime continues to use the original EotB sprite.
