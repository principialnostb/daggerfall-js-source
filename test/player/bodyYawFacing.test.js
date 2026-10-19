import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerMotor } from '../../src/player/motor.js';

test('v3 body-facing contract: the model follows current view yaw by default', () => {
  const player = new PlayerMotor(null);
  assert.equal(player.bodyYawFor(0.4), 0.4);
  assert.equal(player.bodyYawFor(1.2), 1.2, 'camera/view rotation updates the model yaw');
  assert.equal(player.bodyYawFor(-2.0), -2.0, 'continued camera rotation continues to update facing');
});

test('v3 body-facing contract: explicit climb and seat yaw retain precedence', () => {
  const player = new PlayerMotor(null);
  player._bodyYaw = 1.1;
  assert.equal(player.bodyYawFor(2.2), 1.1, 'climb-owned body yaw remains authoritative');
  player.drawYaw = -2.8;
  assert.equal(player.bodyYawFor(0), -2.8, 'seat/draw yaw wins over view yaw');
});
