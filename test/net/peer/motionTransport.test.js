import test from 'node:test';
import assert from 'node:assert/strict';
import { motionPoseOf } from '../../../src/net/peer/peerMotionPose.js';
import { validPose, slimPose, poseChanged } from '../../../src/net/wire.js';
import { lerpPose } from '../../../src/net/online.js';
import { peerCamera } from '../../../src/net/peer/peerBodies.js';

const pose = (player) => validPose({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
  ...motionPoseOf(player, false), bms: 480, bhm: 240 });

test('motion survives relay validation, compact transport and interpolation, then clears', () => {
  let prior = pose({ grounded: true });
  let cam = null;
  for (const player of [{ grounded: false }, { grounded: true, crouching: true }, { grounded: true }]) {
    const sent = pose(player);
    assert.equal(poseChanged(prior, sent), true);
    const received = validPose(JSON.parse(JSON.stringify(slimPose(sent))));
    const shown = lerpPose(prior, received, 0.5);
    cam = peerCamera(shown, [0, 0, 0], 0, cam);
    assert.equal(cam.move.grounded, player.grounded);
    assert.equal(cam.sneaking, !!player.crouching);
    assert.equal(shown.bms, 480);
    assert.equal(shown.bhm, 240);
    prior = sent;
  }
});
