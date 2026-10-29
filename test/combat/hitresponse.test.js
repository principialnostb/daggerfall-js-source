// HIT-RESPONSE (MOTION-DOCTRINE, bible/05-Combat/Motion-Doctrine.md): a landed blow holds the striking arm and the struck
// foe's frame for a short firm beat - heavier and harder longer, shorter for each further foe of a swing - and lays a
// soft decaying shake on the look; a miss, or the switch off, does nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHitResponse, HIT_RESPONSE } from '../../src/combat/hitResponse.js';
import { CameraRecoiler } from '../../src/player/cameraRecoiler.js';

const clock = () => { let t = 100; return { now: () => t, tick: (s) => { t += s; } }; };
const sword = { weightInKg: 3 }, claymore = { weightInKg: 7 };

test('HIT-RESPONSE: a landed blow holds the arm for its beat, spending real time, then lets it run', () => {
  const c = clock(), r = createHitResponse({ on: () => true, now: c.now });
  const beat = r.hit({ foe: {}, damage: 20, weapon: claymore, rolls: () => 0 });
  assert.ok(beat >= HIT_RESPONSE.stop[1] - 1e-9 && beat <= HIT_RESPONSE.stop[1] + 1e-9, `a hard blow of a heavy weapon holds the full ${beat} s`);
  let held = 0, t = 0;
  while (t < 0.3) { const d = r.armDt(1 / 60); if (d < 1 / 120) held += 1 / 60; t += 1 / 60; }
  assert.ok(Math.abs(held - beat) < 1 / 30, `the arm stood ${held} s`);
  assert.equal(r.armDt(1 / 60), 1 / 60, 'and runs after');
});

test('HIT-RESPONSE: heavier and harder hold longer; each further foe of one swing shorter; a miss holds nothing', () => {
  const c = clock(), r = createHitResponse({ on: () => true, now: c.now });
  const light = r.hit({ damage: 4, weapon: { weightInKg: 0.5 } }); c.tick(1);
  const heavy = r.hit({ damage: 20, weapon: claymore }); c.tick(1);
  assert.ok(heavy > light, `${heavy} > ${light}`);
  const first = r.hit({ damage: 10, weapon: sword }), second = r.hit({ damage: 10, weapon: sword });
  assert.ok(Math.abs(second - first * HIT_RESPONSE.diminish) < 1e-9, 'the second foe of the sweep, diminished');
  assert.equal(r.hit({ damage: 0, weapon: sword }), 0, 'a miss');
  const off = createHitResponse({ on: () => false, now: c.now });
  assert.equal(off.hit({ damage: 20, weapon: claymore }), 0, 'the switch off');
});

test('HIT-RESPONSE: the struck foe\'s own frame holds the same beat - its sprite unit, and no other', () => {
  const c = clock(), r = createHitResponse({ on: () => true, now: c.now });
  const unit = {}, other = {};
  r.hit({ foe: { mobile: unit }, damage: 18, weapon: sword });
  assert.equal(r.unitDt(other, 1 / 60), 1 / 60, 'a foe not struck runs on');
  assert.ok(r.unitDt(unit, 1 / 60) < 1 / 120, 'the struck one holds');
  for (let i = 0; i < 20; i++) r.unitDt(unit, 1 / 60);
  assert.equal(r.unitDt(unit, 1 / 60), 1 / 60, 'then its flinch plays on');
});

test('HIT-RESPONSE: the shake is a soft decaying sine, a fraction of a degree, gone within half a second', () => {
  const c = clock(), r = createHitResponse({ on: () => true, now: c.now });
  r.hit({ damage: 20, weapon: claymore, rolls: () => 0 });
  let peak = 0, last = null;
  for (let i = 0; i < 30; i++) { last = r.shake(1 / 60); peak = Math.max(peak, Math.hypot(...last)); }
  assert.ok(peak > 0.2 && peak <= HIT_RESPONSE.shake.deg[1] + 1e-9, `peak ${peak} degrees`);
  assert.deepEqual(r.shake(1 / 60), [0, 0], 'over');
});

test('HIT-RESPONSE: the recoiler lays the shake on the look and takes it back, whatever DFU\'s recoil setting', () => {
  const rec = new CameraRecoiler();
  const cam = { pitch: 0, yaw: 0 };
  rec.update(1 / 60, cam, { setting: 0 });
  assert.deepEqual([cam.pitch, cam.yaw], [0, 0], 'nothing laid at rest');
  const src = readFileSync(new URL('../../src/player/cameraRecoiler.js', import.meta.url), 'utf8');
  assert.match(src, /const hs = paused \? \[0, 0\] : hitResponse\.shake\(dt\);/);
  const pw = readFileSync(new URL('../../src/combat/playerWeapon.js', import.meta.url), 'utf8');
  assert.match(pw, /hitResponse\.hit\(\{ foe, damage, weapon: this\.strikingWeapon \}\);/);
  const mu = readFileSync(new URL('../../src/characters/mobile/mobileUnit.js', import.meta.url), 'utf8');
  assert.match(mu, /dt = hitResponse\.unitDt\(this, dt\);/);
  const fp = readFileSync(new URL('../../src/combat/fpArm.js', import.meta.url), 'utf8');
  assert.match(fp, /if \(playerAppearance\) dt = hitResponse\.armDt\(dt\);/);
});
