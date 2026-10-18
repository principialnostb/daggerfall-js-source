# Smart PaperDoll EotB layer art contract

**State: integration contract only; not playable bare-body art.** The current Light Fighter female archive (112364) contains complete rendered sprites, including equipment. It cannot be made into a clean body by hiding a setting or overlaying a transparent image.

## Required asset naming

For a sprite key returned by EotB's `spriteFor()`, use the same key stem:

- Body: `vendor/smart-paperdoll/Textures/body/<archive>_<record>-<frame>.png`
- Cuirass: `vendor/smart-paperdoll/Textures/armor/cuirass/<archive>_<record>-<frame>.png`

Example stem: `112364_15-0.png`. This is only an example key; it does not imply that the record is the only frame required.

## Image requirements

- PNG RGBA with real transparency (not a matte/checkerboard).
- Exactly the same canvas width and height as the corresponding source sprite.
- Same pixel grid, character silhouette, pose, feet baseline, and anchor. Do not resize/recenter.
- Body sprites must be complete body-only frames, not the original armored sprite with armor painted over.
- Armor sprites contain only the equipment pixels; transparent everywhere else.
- Create an asset for every distinct `archive_record-frame` key reached by the active EotB animation tables. Mirrored views are produced by the existing EotB mirror logic; do not hand-flip only one layer.
- Keep palette and skin tones sampled from the original Light Fighter female sprite, not the green reference character.

## Runtime insertion point

1. `src/player/eyeOfTheBeholder/eotbSprite.js`: `spriteFor(table, orientation, frame, look)` is the canonical source of archive, record, frame, mirror and key.
2. `src/player/eyeOfTheBeholder/eotbBody.js`: `decodeSprite(url)` is the PNG decode boundary; the current body pipeline expects one composited raster per frame.
3. The compositor must load the body layer, then alpha-composite equipped item layers in order, and return one world-order pixel buffer to the existing billboard upload/cache. All layers must share the exact same mirror and row-order transforms.
4. Equipment state must come from the live equipment slots. Missing body art must fall back to the original EotB sprite, never to another class-skin archive.

## Why no fake placeholders are shipped

A transparent PNG placeholder would make the requested feature appear integrated while still showing the original baked-in armor. An SVG silhouette would be a different art style and would not supply the missing animation frames. This directory intentionally remains absent until real aligned frame art can be produced.
