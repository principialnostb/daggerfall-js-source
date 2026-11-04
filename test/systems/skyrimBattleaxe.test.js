import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { localWeaponModelFor, SKYRIM_STEEL_AXE, WEAPON_LOOKS_PREF, weaponLookKey } from '../../src/characters/ownModels/localWeaponModels.js';
import { WEAPONS, WEAPON_MATERIALS } from '../../src/characters/weapons.js';
import { MW_WEAPON_TYPE } from '../../src/formats/morrowind/mwFirstPerson.js';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { flattenNif } from '../../src/formats/morrowind/mwNifMesh.js';
import { decodeDds } from '../../src/formats/morrowind/mwDdsFile.js';

import { lookChoices, setLookVariant } from '../../src/systems/lookVariants.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';

const urls = { 'meshes/skyrim_steel_battleaxe.nif': 'mesh', 'textures/skyrim_steel_battleaxe.dds': 'texture' };
test('Skyrim axe is opt-in for two-handed axes of every material; missing data retains Original', () => {
  assert.equal(SKYRIM_STEEL_AXE.animateAs, MW_WEAPON_TYPE.AxeTwoHand);
  for (const templateIndex of Object.values(WEAPONS)) for (const material of Object.values(WEAPON_MATERIALS)) {
    const item = { templateIndex, material };
    const looks = { [weaponLookKey(item)]: 'skyrim-steel-battleaxe' };
    assert.equal(localWeaponModelFor(item, urls, null), null);
    assert.equal(localWeaponModelFor(item, urls, { [weaponLookKey(item)]: 'classic' }), null);
    assert.equal(localWeaponModelFor(item, urls, { [weaponLookKey(item)]: 'stale' }), null);
    assert.equal(localWeaponModelFor(item, urls, looks)?.model ?? null, templateIndex === WEAPONS.War_Axe ? SKYRIM_STEEL_AXE.model : null);
    assert.equal(localWeaponModelFor(item, {}, looks), null);
    for (const key of Object.keys(urls)) assert.equal(localWeaponModelFor(item, { [key]: 'asset' }, looks), null);
  }
  assert.equal(localWeaponModelFor(null, urls, null), null);
});
test('inventory skin choices default to Original, persist by material, and restore Original without changing the item', () => {
  const saved = getPref(WEAPON_LOOKS_PREF);
  try {
    setPref(WEAPON_LOOKS_PREF, null);
    const item = { templateIndex: WEAPONS.War_Axe, material: WEAPON_MATERIALS.Steel };
    const before = structuredClone(item);
    assert.deepEqual(lookChoices(item).map(c => [c.value, c.on]), [['classic', true], ['skyrim-steel-battleaxe', false]]);
    assert.equal(setLookVariant(item, 'skyrim-steel-battleaxe'), true);
    assert.equal(localWeaponModelFor(item, urls)?.model, SKYRIM_STEEL_AXE.model);
    assert.equal(localWeaponModelFor({ ...item, material: WEAPON_MATERIALS.Iron }, urls), null);
    assert.equal(lookChoices({ ...item, templateIndex: WEAPONS.Battle_Axe }), null);
    assert.equal(setLookVariant(item, 'invalid-skin'), false);
    assert.equal(setLookVariant(item, 'classic'), true);
    assert.equal(localWeaponModelFor(item, urls), null);
    assert.deepEqual(item, before);
  } finally { setPref(WEAPON_LOOKS_PREF, saved); }
});
const meshPath = 'src/assets/mw/meshes/skyrim_steel_battleaxe.nif';
test('local imported axe parses as one detailed textured mesh, without blood overlays', { skip: !existsSync(meshPath) }, () => {
  const batches = flattenNif(parseNif(new Uint8Array(readFileSync(meshPath))));
  assert.equal(batches.length, 1);
  assert.equal(batches[0].positions.length / 3, 1351);
  assert.equal(batches[0].indices.length / 3, 1734);
  assert.ok([...batches[0].positions].every(Number.isFinite));
  const ys = [...batches[0].positions].filter((_, i) => i % 3 === 1);
  const xs = [...batches[0].positions].filter((_, i) => i % 3 === 0);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 30.917202949523926) < 1e-4);
  assert.ok(Math.abs(Math.min(...ys) + 19.541900634765625) < 1e-4);
  assert.ok(Math.abs(Math.max(...ys) - 66.50004625789063) < 1e-4);
  const dds = decodeDds(new Uint8Array(readFileSync('src/assets/mw/textures/skyrim_steel_battleaxe.dds')));
  assert.equal(dds.mips[0].width, 512);
  assert.equal(dds.mips.length, 10);
});

// Real first-person idle, not a hand-built pose. Optional player data stays outside Git.
const mwArchive = `${process.env.MORROWIND_PATH ?? 'D:/Steam/steamapps/common/Morrowind'}/Data Files/Morrowind.bsa`;
test('long axe ready pose widens the existing hands on the real rig, independently of the short retail axe', { skip: !existsSync(mwArchive) || !existsSync(meshPath) }, async () => {
  const { MwBsaFile } = await import('../../src/formats/morrowind/mwBsaFile.js');
  const { extractTracks, sampleTrack, collectTextKeys, parseAnimGroups, normalizeTextKeys } = await import('../../src/formats/morrowind/mwAnim.js');
  const { assembleFirstPersonArm, poseAssembly, firstPersonCameraRef } = await import('../../src/formats/morrowind/mwFirstPerson.js');
  const { climbBones } = await import('../../src/combat/climbRig.js');
  const { stepAxePlacement, axeReadyHold, firstPersonLens } = await import('../../src/combat/weapon/axeViewPlacement.js');
  const { transformPoint } = await import('../../src/world/mat4.js');
  const archive = new MwBsaFile(new Uint8Array(readFileSync(mwArchive)));
  const arm = await assembleFirstPersonArm({ skeletonBytes: archive.get('meshes/xbase_anim.1st.nif'), parts: [{ slot: 'weapon', bones: ['Weapon Bone'], bytes: new Uint8Array(readFileSync(meshPath)), preTransform: SKYRIM_STEEL_AXE.firstPersonAttitude }] });
  assert.equal(arm.ok, true);
  const built = { arm, cameraRef: firstPersonCameraRef(arm.skeleton), weapon: { model: SKYRIM_STEEL_AXE.model } };
  stepAxePlacement(built, true, 4);
  const files = [archive.get('meshes/xbase_anim.1st.kf')];
  const path = 'Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/x2cIdle.kf';
  if (existsSync(path)) files.push(new Uint8Array(readFileSync(path)));
  const bones = climbBones(arm.skeleton);
  for (const bytes of files) {
    const n = parseNif(bytes), tracks = extractTracks(n);
    const g = parseAnimGroups(normalizeTextKeys(collectTextKeys(n))).get('idle2c');
    for (const phase of [0, 0.5, 1]) {
      const time = g.start + (g.stop - g.start) * phase;
      poseAssembly(arm, { tracks, sampleTrack, time });
      const anchors = [bones.R.upper, bones.L.upper, bones.R.clavicle, bones.L.clavicle].filter(ref => ref != null);
      const originalAnchors = anchors.map(ref => [...arm.mats.get(ref).t]);
      poseAssembly(arm, { tracks, sampleTrack, time, hold: axeReadyHold(built) });
      anchors.forEach((ref, i) => assert.deepEqual([...arm.mats.get(ref).t], originalAnchors[i], 'original shoulder anchors retained'));
      const R = arm.mats.get(bones.R.hand).t, L = arm.mats.get(bones.L.hand).t;
      assert.ok(Math.hypot(...R.map((v, k) => v - L[k])) > 18, 'wide two-handed grip');
      const eye = arm.mats.get(built.cameraRef).t;
      const lens = firstPersonLens([eye[0], eye[2], -eye[1]], 0, built);
      const cameraPoint = p => transformPoint(lens, p[0], p[2], -p[1]);
      const pr = cameraPoint(R), pl = cameraPoint(L);
      assert.ok(pr[0] / -pr[2] > pl[0] / -pl[2], 'upper hand right of lower hand');
      assert.ok(pr[2] < 0 && pl[2] < 0);
      assert.ok(arm.pieces[0].positions.every(Number.isFinite));
    }
  }
  stepAxePlacement(built, true, 4, true);
  assert.equal(axeReadyHold(built), null, 'native attack clip regains the hands');
});
