// CLEAR-SMOOTH (2026-11-07, src/characters/bodyMotion/armClearance.js; the owner's 12-40-11 recording: the arms twitch at
// an interval standing). A woman's plain idle in the game is OpenMW Dynamic Animations' zIdle; its left arm drifts a hair
// into the breasts and back, and the clearance's turn leapt between two ways out (0.15 and 0.38 radians) twice a loop,
// 0.35 s apart, the elbow swinging with the hand still. Held here on that clip, on the woman's own skeleton.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearArms, CLEAR_SMOOTH } from '../../../src/characters/bodyMotion/armClearance.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { extractTracks, sampleTrack } from '../../../src/formats/morrowind/mwAnim.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sk = buildSkeleton(parseNif(readFileSync(join(ROOT, 'vendor/weapon-sheathing/Data Files/Animations/xbase_anim_female/xbase_anim_sh.nif'))));
const tracks = extractTracks(parseNif(readFileSync(join(ROOT, 'Mods/Animations/OpenMW Dynamic Animations/animations/xbase_anim_female/zIdle;.kf'))));
const sm = (s, pose, root, refs) => skeletonSpaceMatrices(s, pose, root, refs);

test('CLEAR-SMOOTH: standing in the woman\'s idle, the clearance\'s turn moves smoothly frame to frame - no leap between two ways out (mutant: the grid\'s step, no hold)', () => {
  const previous = { L: 0, R: 0 }, dt = 1 / 60;
  let last = null, worst = 0, turned = 0;
  for (let t = 0; t < 2.67 * 2; t += dt) {
    const pose = poseSkeleton(sk, tracks, sampleTrack, t % 2.6666);
    const out = clearArms(sk, pose, GRAPH_ROOT, sm, { previous, dt, kind: 'female', moving: 0 });
    // from half a second in: the first frames ease the turn in from none
    if (last && t > 0.5) worst = Math.max(worst, Math.abs(out.L - last.L), Math.abs(out.R - last.R));
    turned = Math.max(turned, Math.abs(out.L));
    last = out;
  }
  assert.ok(turned > 0.1, `the clip does take the left arm into the skin, and it is cleared: ${turned}`);
  assert.ok(worst < 0.02, `the largest turn in a frame: ${worst.toFixed(4)} radians`);
  assert.ok(CLEAR_SMOOTH.iterations >= 8 && CLEAR_SMOOTH.temperature > 0 && CLEAR_SMOOTH.grid > 0);
});
