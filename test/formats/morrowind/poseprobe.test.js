import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assembleFirstPersonArm, poseAssembly } from '../../../src/formats/morrowind/mwFirstPerson.js';

test('the opt-in pose probe observes the actual CPU and GPU assembly once per pose', async () => {
  const bytes = (name) => new Uint8Array(readFileSync(new URL(`../../fixtures/mw/${name}`, import.meta.url)));
  const arm = await assembleFirstPersonArm({ skeletonBytes: bytes('armskel.nif'), parts: [{ slot: 'hand', bytes: bytes('armhand.nif') }] });
  assert.ok(arm.ok, arm.error);
  const previous = globalThis.__mwPoseAssemblyProbe, seen = [];
  try {
    arm.afterPose = (assembly) => { assembly.probePlacementTime = assembly.time; };
    globalThis.__mwPoseAssemblyProbe = (assembly) => seen.push({ assembly, cpu: assembly.cpuSkinned, pose: assembly.pose, mats: assembly.mats, placedAt: assembly.probePlacementTime });
    poseAssembly(arm, { time: 1, skin: true });
    poseAssembly(arm, { time: 2, skin: false });
    assert.equal(seen.length, 2);
    assert.deepEqual(seen.map((s) => s.cpu), [true, false]);
    assert.deepEqual(seen.map((s) => s.placedAt), [1, 2], 'the observation includes afterPose placement on both paths');
    for (const observed of seen) {
      assert.equal(observed.assembly, arm);
      assert.ok(observed.pose instanceof Map && observed.pose.size > 0);
      assert.ok(observed.mats instanceof Map && observed.mats.size > 0);
    }
    assert.notEqual(seen[0].pose, seen[1].pose, 'each observation belongs to that pose');
  } finally {
    if (previous === undefined) delete globalThis.__mwPoseAssemblyProbe;
    else globalThis.__mwPoseAssemblyProbe = previous;
  }
});
