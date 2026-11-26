import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PointShadowMembership } from '../../src/render/pointShadowMembership.js';
import { cubeKeeps, cubeSlack } from '../../src/render/shadowPass.js';

test('a stable caster reuses unchanged light ranks and rebuilds lists from the current sphere and limits', () => {
  let tests = 0;
  const memo = new PointShadowMembership(3, (...args) => { tests++; return cubeKeeps(...args); });
  const lights = new Float64Array(15);
  const caster = {}, sphere = [0, 0, 0, 1];
  function light(rank, x, far) {
    lights.set([x, 0, 0, far, cubeSlack(x, 0, 0, far)], rank * 5);
  }
  function verify(active, expectedTests, s = sphere) {
    let expected = 0;
    for (let i = 0; i < 3; i++) if ((active & (1 << i)) && (!s || cubeKeeps(lights, i, ...s))) expected |= 1 << i;
    const before = tests;
    assert.equal(memo.ranks(caster, s), expected);
    assert.equal(tests - before, expectedTests);
  }
  light(0, 0, 16); light(1, 90, 8); light(2, -20, 32);
  memo.begin(lights, 7); verify(7, 3);
  memo.begin(lights, 7); verify(7, 0);
  light(1, 3, 8); memo.begin(lights, 7); verify(7, 1);
  sphere[0] = 95; verify(7, 3); verify(7, 0);
  light(1, 3, 150); memo.begin(lights, 7); verify(7, 1);
  memo.begin(lights, 1); verify(1, 0);
  memo.begin(lights, 7); verify(7, 2);
  memo.begin(lights, 7); // A streamed-out caster misses this walk and returns after a light moved.
  light(0, 94, 16); memo.begin(lights, 7); verify(7, 3);
  verify(7, 0, null);
  sphere[0] = NaN; verify(7, 3);
});
