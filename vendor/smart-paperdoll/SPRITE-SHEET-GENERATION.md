# Smart PaperDoll sprite-sheet generation

This tool creates **one** reference-guided sprite sheet through fal.ai and
splits it into per-key PNGs. It is an art-generation helper, not proof that
the generated pixels align with EotB animation frames.

## Run in Windows PowerShell

1. Install the API client (does not save it as a project dependency):

   `npm.cmd install --no-save @fal-ai/client`

2. Create a key at https://fal.ai/dashboard/keys and keep it private:

   `$env:FAL_KEY = "YOUR_FAL_KEY"`

3. Use the actual source sprite path from your checkout. Example:

   ```powershell
   node tools/smartPaperdollSpriteSheet.mjs --reference Reference/First.png --reference Reference/Second.png --reference "vendor/class-skins/Textures/112364/112364_15-0.png" --keys tools/smart-paperdoll-keys.json --rows 4 --cols 4 --palette-reference "vendor/class-skins/Textures/112364/112364_15-0.png"
   ```

The source sprite path is an example; verify it exists. The keys JSON must
contain exactly rows*cols objects with real keys copied from actual
`spriteFor()` results. Each key may include the original frame width/height.

## Output

- `vendor/smart-paperdoll/generated/sprite-sheet.png` — generated sheet.
- `vendor/smart-paperdoll/generated/generated-manifest.json` — metadata.
- `vendor/smart-paperdoll/Textures/body/<archive>_<record>-<frame>.png` — frames.

The script removes edge-connected magenta, resizes with nearest-neighbour,
quantizes to at most 256 colors (prefer `--palette-reference` to use the
original sprite's palette), and clears hidden RGB in transparent pixels.

## Quality gates

Generation cannot guarantee consistent anatomy, exact cell framing, true
palette fidelity, or pixel-perfect alignment. Review every frame against its
source before enabling it. This script does not generate body-part masks or
connect the compositor. It refuses keys outside archive 112364.
