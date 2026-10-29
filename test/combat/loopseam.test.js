// LOOP-SEAM (MOTION-DOCTRINE, bible/05-Combat/Motion-Doctrine.md): a looping clip whose stop pose is not its start pose
// is carried over its last window to the start, so the wrap is not seen; a clean clip samples as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seamSampler, seamOf, createLoopSeam, LOOP_SEAM, smoothSampler, CLIP_SMOOTH } from '../../src/combat/loopSeam.js';
import { setPref } from '../../src/systems/uiPrefs.js';

/** A track turning about x by angle(t) and moving by move(t), quaternions [w, x, y, z]. */
const track = (angle, move = () => 0) => ({ angle, move });
const sampleTrack = (tr, t) => { const a = tr.angle(t); return { rotation: [Math.cos(a / 2), Math.sin(a / 2), 0, 0], translation: [tr.move(t), 0, 0], scale: 1 }; };
const angleOf = (s) => 2 * Math.atan2(s.rotation[1], s.rotation[0]);
const window = { start: 0, stop: 1 };

test('LOOP-SEAM: a knee that ends 0.3 rad from where it starts arrives at the start by the stop - and nothing moves before the window', () => {
  const knee = track((t) => 0.3 * t, (t) => 5 * t);
  const source = { trackMap: new Map([['bip01 l calf', knee]]) };
  const s = seamSampler(sampleTrack, sampleTrack, { group: 'sneakforward2c' }, source, window);
  assert.ok(Math.abs(angleOf(s(knee, 1)) - angleOf(sampleTrack(knee, 0))) < 1e-6, 'the stop is the start');
  assert.ok(Math.abs(s(knee, 1).translation[0]) < 1e-9, 'its move too');
  assert.deepEqual(s(knee, 0.5), sampleTrack(knee, 0.5), 'mid-loop, the clip as it is');
  const w = Math.min(LOOP_SEAM.window, LOOP_SEAM.share);
  let prev = angleOf(s(knee, 1 - w - 0.01)), worst = 0;
  for (let t = 1 - w; t <= 1 + 1e-9; t += 1 / 240) { const a = angleOf(s(knee, t)); worst = Math.max(worst, Math.abs(a - prev)); prev = a; }
  assert.ok(worst < 0.03, `carried smoothly (largest step ${worst} rad)`);
});

test('LOOP-SEAM: a clean loop, a seam under the floor, and an overlay track are left alone', () => {
  const clean = track((t) => Math.sin(2 * Math.PI * t));
  assert.equal(seamOf(clean, window, sampleTrack), null);
  const tiny = track((t) => 0.5 * LOOP_SEAM.minAngle * t);
  assert.equal(seamOf(tiny, window, sampleTrack), null);
  const knee = track((t) => 0.3 * t);
  const source = { trackMap: new Map([['k', knee]]) };
  const s = seamSampler(sampleTrack, sampleTrack, { group: 'walkforward' }, source, window);
  const overlay = { __overlay: knee };
  const under = (tr, t) => (tr.__overlay ? sampleTrack(tr.__overlay, t) : sampleTrack(tr, t));
  const so = seamSampler(under, sampleTrack, { group: 'walkforward' }, source, window);
  assert.deepEqual(so(overlay, 1), sampleTrack(knee, 1), 'an overlay keeps its own clock\'s sample');
  assert.ok(s(knee, 1) !== sampleTrack(knee, 1));
});

test('LOOP-SEAM: only a looping movement or idle clip is carried, and the rig wraps its third-person sampler behind the switch', () => {
  const seam = createLoopSeam({ sampleTrack, loopWindow: () => window });
  const source = { trackMap: new Map(), keys: [] };
  setPref('mwClipSmooth', false);
  assert.equal(seam.sampler(sampleTrack, { group: 'weapontwohand' }, source), sampleTrack, 'a blow is not a loop');
  setPref('mwClipSmooth', true);
  assert.notEqual(seam.sampler(sampleTrack, { group: 'weapontwohand' }, source), sampleTrack, 'CLIP-SMOOTH: a blow is rounded too');
  assert.equal(seam.sampler(sampleTrack, { group: 'walkforward' }, source, false), sampleTrack, 'switched off');
  assert.notEqual(seam.sampler(sampleTrack, { group: 'walkforward' }, source), sampleTrack);
  const src = readFileSync(new URL('../../src/combat/fpArm.js', import.meta.url), 'utf8');
  assert.match(src, /sampleTrack: loopSeam\.sampler\(lowerBody\.sampler\(/);
});

test('CLIP-SMOOTH: a corner in the curve of a clip is rounded over its h either side; a straight run is left as it is', () => {
  const kink = track((t) => (t < 0.5 ? 0 : 2 * (t - 0.5)), (t) => (t < 0.5 ? 0 : 10 * (t - 0.5)));
  const smooth = smoothSampler(sampleTrack);
  const h = CLIP_SMOOTH.h;
  assert.ok(angleOf(smooth(kink, 0.5)) > 0 && angleOf(smooth(kink, 0.5)) < 2 * h, 'at the corner: rounded, never ahead of the line');
  assert.ok(Math.abs(smooth(kink, 0.5).translation[0] - 10 * h / 4) < 1e-9, 'the move rounded the same way');
  assert.ok(Math.abs(angleOf(smooth(kink, 0.8)) - angleOf(sampleTrack(kink, 0.8))) < 1e-9, 'past the corner: the clip as it was');
  assert.ok(Math.abs(angleOf(smooth(kink, 0.2))) < 1e-12, 'before it: still');
});
