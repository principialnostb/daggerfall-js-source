# Smart PaperDoll: offline frame/mask prototype

**fal.ai has been removed from this workflow.** This script makes no network calls, needs no API key, and does not install any external service client.

## Source archive

The verified original texture path is:

`vendor/eye-of-the-beholder/Textures/112364/112364_15-0.png`

It is under `vendor/eye-of-the-beholder`, not `vendor/class-skins`.

## Commands

From the repository root:

```powershell
node tools/extractSmartPaperdollKeys.mjs --limit 16 --out tools/smart-paperdoll-keys.json
node tools/smartPaperdollSpriteSheet.mjs --keys tools/smart-paperdoll-keys.json
```

The first command is intended to export real `spriteFor()` keys and original PNG dimensions. The second reads the real source PNGs, writes pixel-identical source-shaped candidate PNGs, and emits RGBA black/white masks in `vendor/smart-paperdoll/Textures/masks` (white = selected region, black = preserve). It also writes `vendor/smart-paperdoll/generated/offline-manifest.json`.

## Important limitation — not game-ready art

This offline script is a **mask/asset plumbing prototype**, not an art generator. It preserves the original sprite pixels; it does not remove armor, synthesize a body underneath it, or invent matching animation poses. Its geometric masks are provisional and must not be used as authoritative armor-removal masks without checking frames individually.

The runtime compositor in `src/player/eyeOfTheBeholder/eotbBody.js` is **not connected to these files yet**. In particular, the current code does not yet read per-item equipped state and choose a different body layer. Until that integration is implemented and tested, the game should continue drawing the original sprite. No claim is made that removing the cuirass or boots changes the appearance yet.

This file deliberately avoids the previous hosted generation path. A useful replacement body asset must be authored or sourced as pose-matched pixel art for each required record/frame; simply recoloring or reusing the same generated pose would create obvious animation/angle errors.
