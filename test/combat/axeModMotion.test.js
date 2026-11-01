import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MwBsaFile } from '../../src/formats/morrowind/mwBsaFile.js';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { extractTracks, sampleTrack, collectTextKeys, parseAnimGroups, normalizeTextKeys, resetClip } from '../../src/formats/morrowind/mwAnim.js';
import { assembleFirstPersonArm, poseAssembly, firstPersonCameraRef } from '../../src/formats/morrowind/mwFirstPerson.js';
import { climbBones, rotationPart } from '../../src/combat/climbRig.js';
import { stepAxePlacement, axeReadyHold } from '../../src/combat/weapon/axeViewPlacement.js';

const archivePath = `${process.env.MORROWIND_PATH ?? 'D:/Steam/steamapps/common/Morrowind'}/Data Files/Morrowind.bsa`;
const folder = 'Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/';
test('axe preserves ReAnimation wrist movement through all eight walk/run directions, rather than pinning hands', { skip: !existsSync(archivePath) || !existsSync(folder + 'x2cMovement.kf') }, async () => {
  const archive = new MwBsaFile(new Uint8Array(readFileSync(archivePath)));
  const arm = await assembleFirstPersonArm({ skeletonBytes: archive.get('meshes/xbase_anim.1st.nif'), parts: [] });
  const bones = climbBones(arm.skeleton), cameraRef = firstPersonCameraRef(arm.skeleton);
  const load = file => parseNif(new Uint8Array(readFileSync(folder + file)));
  const idle = load('x2cIdle.kf'), tracks = extractTracks(idle);
  const idleGroup = parseAnimGroups(normalizeTextKeys(collectTextKeys(idle))).get('idle2c');
  // Actual runtime starts sheathed: built.tracks/clip refer to the bare idle, not idle2c.
  const base = parseNif(archive.get('meshes/xbase_anim.1st.kf'));
  const baseKeys = normalizeTextKeys(collectTextKeys(base)), baseTracks = extractTracks(base);
  const baseIdle = resetClip(baseKeys, 'idle', { loopFallback: true });
  assert.equal(baseIdle.ok, true);
  const built = { arm, cameraRef, tracks: baseTracks, clip: baseIdle,
    sources: [{ keys: baseKeys, trackMap: baseTracks }, { keys: normalizeTextKeys(collectTextKeys(idle)), trackMap: tracks }],
    weapon: { model: 'skyrim_steel_battleaxe.nif' } };
  const movement = load('x2cMovement.kf'), movementTracks = extractTracks(movement);
  const groups = parseAnimGroups(normalizeTextKeys(collectTextKeys(movement)));
  assert.equal(groups.size, 8);
  stepAxePlacement(built, true, 4);
  const relative = () => arm.mats.get(bones.R.hand).t.map((v, k) => v - arm.mats.get(cameraRef).t[k]);
  poseAssembly(arm, { tracks, sampleTrack, time: idleGroup.start });
  const nativeIdleRotation = rotationPart(arm.mats.get(bones.R.hand).a);
  poseAssembly(arm, { tracks, sampleTrack, time: idleGroup.start, hold: axeReadyHold(built) });
  const heldIdleRotation = rotationPart(arm.mats.get(bones.R.hand).a);
  relative().forEach((v, k) => assert.ok(Math.abs(v - [7, 28, -11][k]) < 1e-4, 'drawn idle must not inherit the sheathed pose offset'));
  const idleEye = arm.mats.get(cameraRef).t;
  const leftRefs = [bones.L.hand, ...bones.L.fingers.flat(), ...(bones.L.thumb ?? [])];
  const nearestLeft = Math.min(...leftRefs.map(ref => {
    const p = arm.mats.get(ref).t;
    return 0.5 - (p[2] - idleEye[2]) / (p[1] - idleEye[1]) / (2 * Math.tan(Math.PI / 6));
  }));
  assert.ok(nearestLeft > 0.95 && nearestLeft < 1.08, 'lower-hand knuckles stay at the bottom edge, not in the middle of the view');

  const angle = (a, b) => Math.acos(Math.min(1, Math.max(-1, (a.reduce((v, x, i) => v + x * b[i], 0) - 1) / 2)));
  stepAxePlacement(built, true, 4, false, true);
  let largestSourceAngle = 0;
  for (const [name, group] of groups) {
    const native = [], held = [];
    for (let i = 0; i <= 16; i++) {
      const time = group.start + (group.stop - group.start) * i / 16;
      poseAssembly(arm, { tracks: movementTracks, sampleTrack, time });
      native.push(relative());
      const nativeAngle = angle(nativeIdleRotation, rotationPart(arm.mats.get(bones.R.hand).a));
      largestSourceAngle = Math.max(largestSourceAngle, nativeAngle);
      const anchors = [bones.R.upper, bones.L.upper].map(ref => [...arm.mats.get(ref).t]);
      poseAssembly(arm, { tracks: movementTracks, sampleTrack, time, hold: axeReadyHold(built) });
      held.push(relative());
      const heldAngle = angle(heldIdleRotation, rotationPart(arm.mats.get(bones.R.hand).a));
      assert.ok(Math.abs(heldAngle - nativeAngle * 0.45) < 0.003, `${name} angular travel reduced without changing phase`);
      [bones.R.upper, bones.L.upper].forEach((ref, k) => assert.deepEqual([...arm.mats.get(ref).t], anchors[k]));
    }
    assert.ok(native.some(p => Math.hypot(...p.map((v, k) => v - native[0][k])) > 1), name);
    for (let i = 1; i < native.length; i++) for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs((native[i][k] - native[0][k]) - (held[i][k] - held[0][k])) < 1e-4, `${name} frame ${i} axis ${k}`);
    }
  }
  assert.ok(largestSourceAngle > 0.01, 'exercise an actually rotating mod clip');
});
