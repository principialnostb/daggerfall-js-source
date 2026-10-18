import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerMotor } from '../../src/player/motor.js';

test('MW-D40: camera orbit leaves the body facing latched while standing/walking', () => {
  const player = new PlayerMotor(null);
  assert.equal(player.bodyYawFor(0.4), 0.4, 'first third-person frame seeds facing');
  assert.equal(player.bodyYawFor(1.2), 0.4, 'mouse orbit does not rotate the body');
  assert.equal(player.bodyYawFor(-2.0), 0.4, 'continued orbit preserves the same facing');
});

test('MW-D40: running/combat can resume view-facing and then relatch', () => {
  const player = new PlayerMotor(null);
  assert.equal(player.bodyYawFor(0.4), 0.4);
  assert.equal(player.bodyYawFor(1.2, { faceView: true }), 1.2);
  assert.equal(player.bodyYawFor(2.1), 1.2, 'after run/combat ends, keep its last facing');
  assert.equal(player.bodyYawFor(-0.7, { faceView: true }), -0.7);
});

test('MW-D40: first-person sync, climb facing and seats retain precedence', () => {
  const player = new PlayerMotor(null);
  player.bodyYawFor(0.2);
  assert.equal(player.bodyYawFor(1.1, { faceView: true }), 1.1);
  player._bodyYaw = 2.4;
  assert.equal(player.bodyYawFor(-1), 2.4, 'climb-owned yaw wins');
  player.drawYaw = -2.8;
  assert.equal(player.bodyYawFor(0), -2.8, 'seat/draw yaw wins over every body mode');
});
