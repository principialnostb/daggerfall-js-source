# Morrowind character rendering: distance, camera angle, and animation ownership

Status: `morrowind.v4`, 2026-10-19. This is a source-level implementation map; it is not a substitute for in-game validation.

## Current render paths

- **Player third-person body:** `src/combat/fpArm.js` builds and skins the Morrowind body. In the ordinary path, `drawThird` uses `renderer.drawCharacter(thirdMesh, groundedModel)` directly at every camera distance. The character-sprite compositor is retained for concealment/dissolve effects. Do not reintroduce a camera-distance LOD that bakes the body into a low-resolution camera-facing target: it caused compression at close range and pixelation at distance.
- **Ridden / moving 3D horse:** `src/world/horseRig.js` uses a world-space skinned mesh in the ordinary path. The sprite compositor remains only for concealment and the first-person riding picture.
- **Standing town horses:** `src/world/standingHorses.js` chooses the nearest eight candidates for the 3D pass. The distance cutoff is disabled (`STANDING_HORSE_RANGE = Infinity`), so a lone horse does not switch to a pixelated billboard simply because the player walks away. The eight-horse cap remains a performance bound; in a crowd, horses outside the selected eight can still use their source billboard.
- **Generic Daggerfall/voxel characters:** `src/render/characterSprite.js` still owns the sprite-card path for actors that are not using the Morrowind world-mesh lane. Do not assume every actor type shares the same renderer.

## Reported issues that still require in-game verification

- NPC legs jittering or appearing incorrectly when viewed from below / at certain camera angles.
- The player's hands disappearing during third-person running or obstacle-jumping.
- Horse near-side body compression when the camera approaches, despite the world-mesh path.

The first two symptoms are not declared fixed by this document. They need reproduction against the active v4 branch, with the actor type, camera pitch/distance, selected animation source, and equipment state recorded. Fix the responsible skinning/pose/visibility path rather than masking it with another LOD threshold.

## Validation checklist

- [ ] One standing horse, viewed close and from far away: stable body proportions and no distance-triggered pixelation.
- [ ] Ridden horse: head, barrel, and hindquarters retain proportions while orbiting close to the model.
- [ ] Player and NPC: inspect legs from low, level, and high camera pitches during idle, walk, run, jump, and landing.
- [ ] Player hands: verify bare hands and equipped gloves/gauntlets during walk, run, jump, attack, and block.
- [ ] Repeat with Vanilla locomotion and Axel's walk/run source; animation selection must not change mesh visibility.
- [ ] Record browser console errors and verify the build before calling any rendering issue resolved.
