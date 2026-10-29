import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { CLOAK_TEMPLATES, WOLF_CLOAK_LOOKS, wolfCloakModel, CLOAK_LOOKS_PREF } from '../../src/characters/ownModels/wolfCloak.js';
import { ownCloakFor } from '../../src/characters/ownModels/ownClothingModels.js';
import { lookChoices, setLookVariant } from '../../src/systems/lookVariants.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { composeWornArmor } from '../../src/formats/morrowind/mwItemMap.js';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { flattenNif } from '../../src/formats/morrowind/mwNifMesh.js';
import { skinnedMeshesToNif } from '../../tools/nifWrite.mjs';

test('all casual/formal cloak templates offer wolf looks independently of material and preserve original', () => {
  const previous = getPref(CLOAK_LOOKS_PREF);
  try {
    for (const templateIndex of CLOAK_TEMPLATES) for (const material of [0, 1, 0x200, 0x209]) {
      const item = { templateIndex, material };
      assert.deepEqual(lookChoices(item).map((c) => c.value), ['classic', ...WOLF_CLOAK_LOOKS]);
      for (const look of WOLF_CLOAK_LOOKS) {
        setLookVariant(item, look);
        const result = composeWornArmor({ pieces: [{ kind: 'clothing', templateIndex, dye: 6 }], armors: [], clothes: [], bodyPool: [], cloakLooks: getPref(CLOAK_LOOKS_PREF) });
        assert.ok(result.adds.some((p) => p.model === wolfCloakModel(look)));
        assert.equal(lookChoices(item).find((c) => c.on).value, look);
      }
      setLookVariant(item, 'classic');
      assert.equal(ownCloakFor({ kind: 'clothing', name: 'Casual Cloak', dye: 6 }).model, 'cloak_white.nif');
    }
    assert.equal(lookChoices({ templateIndex: 9999 }), null);
  } finally { setPref(CLOAK_LOOKS_PREF, previous); }
});

test('NIF writer round-trips cutout shells with correctly resolved skin bones', () => {
  const mesh = { positions: [0,0,0, 1,0,0, 0,1,0], normals: [0,0,1,0,0,1,0,0,1], uvs: [0,0,1,0,0,1], indices: [0,1,2] };
  const shape = { mesh, weights: Array.from({ length: 3 }, () => [['Bip01 Spine2', 1]]), texture: 'fur.dds' };
  const bytes = skinnedMeshesToNif([shape, { ...shape, alphaTest: true }], { bones: [{ name: 'Bip01 Spine2', bind: { a: [1,0,0,0,1,0,0,0,1], t: [0,0,0] } }] });
  const nif = parseNif(bytes), batches = flattenNif(nif);
  assert.equal(batches[0].material.alphaTest, false);
  assert.equal(batches[1].material.alphaTest, true);
  assert.equal(batches[1].material.alphaThreshold, 128);
  for (const skin of nif.records.filter((r) => r.type === 'NiSkinInstance')) assert.equal(nif.records[skin.bones[0]].name, 'Bip01 Spine2');
});

test('locally imported wolf models contain only wearable shapes, chest binding and fur cutouts', { skip: !existsSync('src/assets/mw/meshes/wolf_pelt_brown.nif') }, () => {
  for (const colour of ['brown', 'white', 'black']) {
    const nif = parseNif(new Uint8Array(readFileSync(`src/assets/mw/meshes/wolf_pelt_${colour}.nif`)));
    const shapes = flattenNif(nif);
    assert.equal(shapes.length, 5);
    assert.ok(shapes.filter((s) => !s.name.includes('Panel') && !s.name.includes('Drape')).every((s) => s.material.alphaTest && s.material.twoSided));
    for (const r of nif.records.filter((r) => r.type === 'NiSkinInstance')) assert.deepEqual(r.bones.map((b) => nif.records[b].name), ['Bip01 Spine2']);
  }
});

test('wolf cloak binds all five fitted shapes through the runtime on the female skeleton', { skip: !existsSync('src/assets/mw/meshes/wolf_pelt_brown.nif') }, async () => {
  const { assembleFirstPersonArm, poseAssembly } = await import('../../src/formats/morrowind/mwFirstPerson.js');
  const { FEMALE_SKELETON } = await import('../../tools/skyrim/mwBody.mjs');
  const built = await assembleFirstPersonArm({
    skeletonBytes: new Uint8Array(readFileSync(FEMALE_SKELETON)),
    parts: [{ slot: 'cloak (wolf_pelt_cloak)', partName: 'cloak', bones: [], bytes: new Uint8Array(readFileSync('src/assets/mw/meshes/wolf_pelt_brown.nif')) }],
  });
  assert.equal(built.ok, true, built.error);
  const pieces = built.pieces.filter((p) => p.slot === 'cloak (wolf_pelt_cloak)');
  assert.equal(pieces.length, 5);
  assert.ok(pieces.every((p) => p.kind === 'skinned'));
  assert.ok(!built.notes.some((n) => /no bone/.test(n)));
  poseAssembly(built);
  for (const p of pieces) assert.ok(Array.from(p.positions).every(Number.isFinite));
});

test('rebuilt cloak has a tapered long panel, separate overlapping locks and a prepared lower motion region', { skip: !existsSync('scratch/skyrim/wolf/rebuilt.json') }, () => {
  const shapes = JSON.parse(readFileSync('scratch/skyrim/wolf/rebuilt.json', 'utf8'));
  assert.deepEqual(shapes.map((s) => s.name), ['Wolf_Back_Panel', 'Wolf_Back_Locks', 'Wolf_Upper_Drape', 'Wolf_Nape_Locks', 'Wolf_Shoulder_Locks']);
  const panel = shapes[0], back = shapes[1], shoulders = shapes.find((s) => s.name === 'Wolf_Shoulder_Locks');
  const width = (p) => Math.max(...p.map((v) => v[0])) - Math.min(...p.map((v) => v[0]));
  // Check the fitted panel: the armour cage narrows the original authoring grid.
  assert.ok(width(panel.positions.filter((p) => p[2] > 100)) > width(panel.positions.filter((p) => p[2] < 40)), 'fitted upper back stays wider than the hem');
  assert.ok(Math.min(...back.positions.map((p) => p[2])) < 25, 'long free tips replace the old shortened hem');
  assert.ok(back.indices.length > panel.indices.length * 2, 'fur is separate geometric locks, not just another texture');
  assert.ok(width(shoulders.positions) > width(panel.positions), 'shoulder locks fan out beyond the fitted panel');
  assert.ok(shoulders.positions.every((p) => Math.hypot(p[0], p[1]) > 8), 'shoulder mesh leaves the neck opening clear');
  assert.ok(back.motion.some((w) => w > .9) && back.motion.some((w) => w === 0));
  assert.ok(back.positions.every((p) => p[1] < 0), 'lower cloak remains behind the chest');
});

test('existing grey-choice preferences resolve to the new brown cloak', () => {
  const previous = getPref(CLOAK_LOOKS_PREF);
  try {
    setPref(CLOAK_LOOKS_PREF, { 154: 'wolf-grey' });
    assert.equal(wolfCloakModel('wolf-grey'), 'wolf_pelt_brown.nif');
    assert.equal(lookChoices({ templateIndex: 154 }).find((c) => c.on).value, 'wolf-brown');
  } finally { setPref(CLOAK_LOOKS_PREF, previous); }
});

test('low rear nape bridges shoulders without enclosing the front neck', { skip: !existsSync('scratch/skyrim/wolf/rebuilt.json') }, () => {
  const shapes = JSON.parse(readFileSync('scratch/skyrim/wolf/rebuilt.json', 'utf8'));
  const nape = shapes.find((s) => s.name === 'Wolf_Nape_Locks');
  assert.ok(nape && nape.positions.length > 500, 'separate dense geometric nape transition');
  assert.ok(nape.positions.every((p) => p[1] < 0), 'no front collar');
  assert.ok(Math.max(...nape.positions.map((p) => p[2])) < 121, 'low transition, not a high collar');
  assert.ok(nape.positions.some((p) => p[0] < -12) && nape.positions.some((p) => p[0] > 12), 'fan reaches both rear shoulders');
});
