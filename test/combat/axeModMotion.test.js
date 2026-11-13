import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { MwBsaFile } from '../../src/formats/morrowind/mwBsaFile.js';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { extractTracks, sampleTrack, collectTextKeys, parseAnimGroups, normalizeTextKeys, resetClip } from '../../src/formats/morrowind/mwAnim.js';
import { assembleFirstPersonArm, poseAssembly, firstPersonCameraRef } from '../../src/formats/morrowind/mwFirstPerson.js';
import { climbBones, rotationPart } from '../../src/combat/climbRig.js';
import { stepAxePlacement, axeReadyHold, axeActionWeight } from '../../src/combat/weapon/axeViewPlacement.js';

const archivePath = `${process.env.MORROWIND_PATH ?? 'D:/Steam/steamapps/common/Morrowind'}/Data Files/Morrowind.bsa`;
const folder = 'Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/';
for (const model of ['skyrim_steel_battleaxe.nif', 'enhanced_axe_steel.nif']) test(`axe preserves ReAnimation wrist movement through all eight walk/run directions: ${model}`, { skip: !existsSync(archivePath) || !existsSync(folder + 'x2cMovement.kf') }, async () => {
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
    weapon: { model } };
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


for (const model of ['skyrim_steel_battleaxe.nif', 'enhanced_axe_steel.nif']) test(`moving axe releases the ready solve before equip/unequip frames: ${model}`, { skip: !existsSync(archivePath) || !existsSync(folder + 'x2cEqUneq.kf') }, async () => {
  const archive = new MwBsaFile(new Uint8Array(readFileSync(archivePath)));
  const arm = await assembleFirstPersonArm({ skeletonBytes: archive.get('meshes/xbase_anim.1st.nif'), parts: [] });
  const load = file => parseNif(new Uint8Array(readFileSync(folder + file)));
  const idle = load('x2cIdle.kf'), tracks = extractTracks(idle);
  const built = { arm, tracks, cameraRef: firstPersonCameraRef(arm.skeleton), weapon: { model },
    sources: [{ keys: normalizeTextKeys(collectTextKeys(idle)), trackMap: tracks }] };
  const movement = load('x2cMovement.kf'), movementTracks = extractTracks(movement);
  const transition = load('x2cEqUneq.kf'), transitionTracks = extractTracks(transition);
  const keys = normalizeTextKeys(collectTextKeys(transition));
  const bones = climbBones(arm.skeleton), refs = [bones.R.hand, bones.L.hand, arm.skeleton.byName.get('weapon bone')];
  for (const [, group] of parseAnimGroups(normalizeTextKeys(collectTextKeys(movement)))) {
    for (const phase of [0, 0.5, 1]) {
      stepAxePlacement(built, true, 4, false, true);
      poseAssembly(arm, { tracks: movementTracks, sampleTrack, time: group.start + (group.stop - group.start) * phase, hold: axeReadyHold(built) });
      for (const section of ['Unequipping', 'Equipping']) {
        const word = section === 'Unequipping' ? 'unequip' : 'equip';
        const start = keys.find(k => k.text.toLowerCase().endsWith(': ' + word + ' start')).time;
        const stop = keys.find(k => k.text.toLowerCase().endsWith(': ' + word + ' stop')).time;
        stepAxePlacement(built, true, 1 / 60, false, true, section);
        assert.equal(axeReadyHold(built), null, 'the still-visible weapon must not keep the ready IK alive');
        for (const t of [0, 0.5, 1]) {
          const time = start + (stop - start) * t;
          poseAssembly(arm, { tracks: transitionTracks, sampleTrack, time });
          const native = refs.map(ref => ({ a: [...arm.mats.get(ref).a], t: [...arm.mats.get(ref).t] }));
          poseAssembly(arm, { tracks: transitionTracks, sampleTrack, time, hold: axeReadyHold(built) });
          assert.deepEqual(refs.map(ref => ({ a: [...arm.mats.get(ref).a], t: [...arm.mats.get(ref).t] })), native);
        }
      }
    }
  }
});


test('axe action joins are keyed, reversible and meet the actual ready pose at both boundaries', { skip: !existsSync(archivePath) || !existsSync(folder + 'x2cEqUneq.kf') }, async () => {
  const archive = new MwBsaFile(new Uint8Array(readFileSync(archivePath)));
  const arm = await assembleFirstPersonArm({ skeletonBytes: archive.get('meshes/xbase_anim.1st.nif'), parts: [] });
  const load = name => parseNif(new Uint8Array(readFileSync(folder + name)));
  const idle = load('x2cIdle.kf'), idleTracks = extractTracks(idle), idleKeys = normalizeTextKeys(collectTextKeys(idle));
  const transition = load('x2cEqUneq.kf'), keys = normalizeTextKeys(collectTextKeys(transition)), actionTracks = extractTracks(transition);
  const gait = load('x2cMovement.kf'), gaitTracks = extractTracks(gait);
  const built = { arm, tracks: idleTracks, cameraRef: firstPersonCameraRef(arm.skeleton), weapon: { model: 'enhanced_axe_steel.nif' }, sources: [{ keys: idleKeys, trackMap: idleTracks }] };
  const bones = climbBones(arm.skeleton), refs = [bones.R.hand, bones.L.hand];
  const idleGroup = parseAnimGroups(idleKeys).get('idle2c');
  const groups = [idleGroup, ...parseAnimGroups(normalizeTextKeys(collectTextKeys(gait))).values()];
  for (const group of groups) {
    const tracks = group === idleGroup ? idleTracks : gaitTracks;
    const ready = { time: (group.start + group.stop) / 2 };
    stepAxePlacement(built, true, 4, false, group !== idleGroup);
    poseAssembly(arm, { tracks, sampleTrack, time: ready.time, hold: axeReadyHold(built) });
    const expected = refs.map(ref => [...arm.mats.get(ref).t]);
    for (const [upper, prefix, reverse] of [['Equipping','equip',false], ['Unequipping','unequip',false], ['Unequipping','equip',true]]) {
      const startTime = keys.find(k => k.text.endsWith(': ' + prefix + ' start')).time;
      const stopTime = keys.find(k => k.text.endsWith(': ' + prefix + ' stop')).time;
      const action = { startTime, stopTime, time: upper === 'Equipping' ? stopTime : startTime, reversed: reverse };
      assert.equal(axeActionWeight(upper, action, keys), 1);
      stepAxePlacement(built, true, 1/60, false, group !== idleGroup, upper, action, {keys}, ready, {trackMap: tracks});
      const time = reverse ? startTime + stopTime - action.time : action.time;
      poseAssembly(arm, { tracks: actionTracks, sampleTrack, time, hold: axeReadyHold(built) });
      refs.forEach((ref,i)=>assert.ok(Math.hypot(...arm.mats.get(ref).t.map((v,k)=>v-expected[i][k])) < 0.01, upper + ' meets the same ready hands'));
      action.time = upper === 'Equipping' ? startTime : stopTime;
      assert.equal(axeActionWeight(upper, action, keys), 0);
      stepAxePlacement(built,true,1/60,false,true,upper,action,{keys},ready,{trackMap:tracks});
      assert.equal(axeReadyHold(built),null);
    }
  }
});
