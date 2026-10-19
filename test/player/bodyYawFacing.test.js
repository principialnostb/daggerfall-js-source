import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerMotor } from '../../src/player/motor.js';

test('MW-D40: camera orbit leaves the body facing latched while idle', () => {
  const player = new PlayerMotor(null);
  assert.equal(player.bodyYawFor(0.4), 0.4, 'first third-person frame seeds facing');
  assert.equal(player.bodyYawFor(1.2), 0.4, 'mouse orbit does not rotate the body');
  assert.equal(player.bodyYawFor(-2.0), 0.4, 'continued orbit preserves the same facing');
});

test('MW-D40: movement, running and combat can resume view-facing and then relatch', () => {
  const player = new PlayerMotor(null);
  assert.equal(player.bodyYawFor(0.4), 0.4);
  assert.equal(player.bodyYawFor(1.2, { faceView: true }), 1.2);
  assert.equal(player.bodyYawFor(2.1), 1.2, 'after run/combat ends, keep its last facing');
  assert.equal(player.bodyYawFor(-0.7, { faceView: true }), -0.7);
});


test('MW-D41: third-person walking faces its movement heading, then latches on idle', () => {
  const player = new PlayerMotor(null);
  assert.equal(player.bodyYawFor(0.2, { moveYaw: 2.4 }), 2.4, 'walking uses movement heading instead of orbit yaw');
  assert.equal(player.bodyYawFor(-1.1), 2.4, 'stopping preserves the last locomotion heading');
  assert.equal(player.bodyYawFor(-0.8, { faceView: true }), -0.8, 'first-person or explicit run/combat facing syncs to the view');
  assert.equal(player.bodyYawFor(1.7), -0.8, 'idle after view-facing keeps the latest view heading');
});

test('MW-D40: first-person sync, climb facing and seats retain precedence', () => {
  const player = new PlayerMotor(null);
  player.bodyYawFor(0.2);
  assert.equal(player.bodyYawFor(1.1, { faceView: true }), 1.1);
  player.climbFacing = 1.8;
  player._bodyYaw = 2.4;
  assert.equal(player.bodyYawFor(-1, { faceView: true }), 2.4, 'active climb-owned yaw wins over movement-facing');
  player.climbFacing = null;
  assert.equal(player.bodyYawFor(-1, { faceView: true }), -1, 'movement-facing overrides a stale climb yaw');
  player._bodyYawOff = 0.7;
  assert.equal(player.bodyYawFor(0.6, { faceView: true }), 0.6, 'movement-facing overrides the climb-release offset');
  assert.equal(player.bodyYawFor(2.2), 0.6, 'idle after movement keeps the latest facing instead of resurrecting a stale offset');
  player._bodyYaw = 1.9;
  assert.equal(player.bodyYawFor(-0.4, { faceView: true }), -0.4, 'view-facing clears a stale body yaw');
  assert.equal(player.bodyYawFor(0.8), -0.4, 'idle keeps the direction established by the last view-facing frame');
  player.drawYaw = -2.8;
  assert.equal(player.bodyYawFor(0), -2.8, 'seat/draw yaw wins over every body mode');
});
