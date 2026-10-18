# Smart PaperDoll — установка, проверка и откат

Smart PaperDoll is an opt-in third-person player body. The existing `SMART PAPERDOLL: ON/OFF` control and `Graphics.SmartPaperDoll` setting remain the only switch; this work does not alter the control or its default.

## Current animated-rig prototype

The world draw now uses `src/characters/smartPaperDollRig.js`, an independently assembled rig rather than converting the finished inventory portrait into voxels:

- Builds a separate 3D body from the project's loft geometry and applies a feminine silhouette morph plus explicit chest geometry.
- Uses the shared `createCharacterRig` / `animateTarget` animation runtime. The body uses an idle sway when stationary and the walk cycle when the player's world position advances.
- Exposes the body, body details and each optional garment as separate geometry layers in `buildSmartPaperDollLayers()`. Garments can be selected through `setSmartPaperDollLayers([...])`; available first-pass draped pieces are exported as `SMART_PAPERDOLL_LAYERS`.
- The first pass uses project-authored geometry and palette ramps. It is a working foundation, not yet a pixel-perfect reconstruction of the original Light Fighter female sprite or a complete equipment-to-geometry mapping.
- First-person rendering and the standard third-person body path when the switch is OFF are not intentionally changed.

## Verify

Use Node.js 20.19+ or 22.12+ as required by `package.json`.

```powershell
npm test -- --test-name-pattern="Smart PaperDoll|paperdoll rig|voxel"
npm run lint
npm run build
```

The tests cover the existing switch, independent rig integration, generated body geometry, optional garment layers and the legacy voxel conversion helpers.

## Roll back

1. Turn Smart PaperDoll OFF using the existing control.
2. To remove this prototype entirely, revert the commits on `smart-paperdoll-animated`. The stable `main` and `smart-paperdoll` branches are not changed by this work.
