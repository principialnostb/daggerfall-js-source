// The frame clock trims its one-second window in place (splice), where a copy of the whole window was made every frame.
// The readout is the window's: these pins hold the mean, the worst, the count and a frame found by its stamp to the
// samples inside the window and none outside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameBegin, frameEnd, frameCpu, frameSampleAt, _resetFrameClock } from '../../src/systems/frameClock.js';

test('after a second and a half of frames only the last second is read: its mean, its worst, its count, and a stamp past the window answers null (mutants: the trim dropped, the trim off by one)', () => {
  _resetFrameClock();
  let t = 0;
  const stamps = [];
  for (let i = 0; i < 90; i++) {
    frameBegin(t, t);
    frameEnd(t + (i < 45 ? 5 : 10));   // the first 45 frames cost 5 ms, the rest 10
    stamps.push(t);
    t += 16;
  }
  const last = stamps[stamps.length - 1];
  const inWindow = stamps.filter((s) => s >= last + 10 - 1000);   // frameEnd's cut: samples whose `now` is within WINDOW_MS of the last
  const c = frameCpu();
  assert.ok(c, 'a readout');
  assert.ok(c.frames < 90 && c.frames >= 60, `the window holds about a second of frames (${c.frames})`);
  assert.equal(c.worstMs, 10);
  assert.ok(c.meanMs > 5 && c.meanMs <= 10, `the mean is the window's (${c.meanMs})`);
  assert.equal(frameSampleAt(last)?.ms, 10, 'the last frame found by its stamp');
  assert.equal(frameSampleAt(stamps[0]), null, 'the first frame is out of the window');
  assert.equal(frameSampleAt(inWindow[0])?.ms ?? frameSampleAt(inWindow[1])?.ms, inWindow[0] < 45 * 16 ? 5 : 10, 'a frame at the window\'s edge reads its own cost');
  _resetFrameClock();
});
