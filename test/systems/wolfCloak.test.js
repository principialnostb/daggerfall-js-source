import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { CLOAK_TEMPLATES, WOLF_CLOAK_LOOKS, wolfCloakModel, CLOAK_LOOKS_PREF } from '../../src/characters/ownModels/wolfCloak.js';
import { MOD_PACKS } from '../../src/systems/enhancedModCatalog.js';
import { modResourceGlob } from '../../src/systems/enhancedModResources.js';
import { lookChoices, setLookVariant } from '../../src/systems/lookVariants.js';
import { getPref, setPref, _resetForTests } from '../../src/systems/uiPrefs.js';
import { composeWornArmor, dfWornEquipment } from '../../src/formats/morrowind/mwItemMap.js';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { flattenNif } from '../../src/formats/morrowind/mwNifMesh.js';
import { skinnedMeshesToNif } from '../../tools/nifWrite.mjs';

test('a saved cloak item look overrides the older template setting, survives reload and restores after disabling', (t) => {
  const previousStore = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) };
  t.after(() => { globalThis.localStorage = previousStore; _resetForTests(); });
  _resetForTests();
  setPref('modelCustomization', true);
  for (const pack of MOD_PACKS.filter(p => p.group === 'bodies')) {
    modResourceGlob('../../Mods/**/*', { [`../../Mods/${pack.folder}/test.nif`]: 'local' });
  }
  for (const templateIndex of CLOAK_TEMPLATES) {
    assert.deepEqual(lookChoices({ templateIndex }).map(c => c.value), ['classic', ...WOLF_CLOAK_LOOKS]);
  }
  const saved = { 154: 'wolf-grey' };
  setPref(CLOAK_LOOKS_PREF, saved);
  const item = { templateIndex: 154, dye: 6 }, sibling = { ...item };
  assert.equal(lookChoices(item).find(c => c.on).value, 'wolf-brown');
  assert.equal(lookChoices({ templateIndex: 155, ownStyle: 'wolf-grey' }).find(c => c.on).value, 'wolf-brown');
  assert.equal(setLookVariant(item, 'wolf-white'), true);
  assert.ok(item.localLookId);
  const restored = JSON.parse(JSON.stringify(item));
  _resetForTests();
  const modelOn = (worn) => {
    const pieces = dfWornEquipment([worn], { Cloak1: 0 }, {});
    const { adds } = composeWornArmor({ pieces, cloakLooks: getPref(CLOAK_LOOKS_PREF), armors: [], bodyPool: [] });
    return adds.find(a => a.partName === 'cloak').model;
  };
  assert.equal(lookChoices(restored).find(c => c.on).value, 'wolf-white');
  assert.equal(modelOn(restored), 'wolf_pelt_white.nif');
  assert.equal(modelOn(sibling), 'wolf_pelt_brown.nif');
  setPref('extraCloakLooks', false);
  assert.equal(lookChoices(restored), null);
  assert.equal(setLookVariant(restored, 'wolf-black'), false);
  assert.equal(modelOn(restored), 'cloak_white.nif');
  assert.equal(wolfCloakModel('wolf-grey'), null);
  setPref('extraCloakLooks', true);
  assert.equal(modelOn(restored), 'wolf_pelt_white.nif');
  assert.equal(setLookVariant(restored, 'classic'), true);
  assert.equal(modelOn(restored), 'cloak_white.nif');
  assert.deepEqual(getPref(CLOAK_LOOKS_PREF), saved);
  assert.equal(modelOn(sibling), 'wolf_pelt_brown.nif');
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
  // A triangle crossing a swatch boundary stretches unrelated fur across the
  // centre of the back. The final two columns contain four grades of short
  // guard hair for the exposed roots, midtones and pale ends.
  const swatch = ([u, v]) => Math.floor(u * 8) + Math.floor(v * 4) * 8;
  for (const shape of shapes.filter((s) => s.kind === 'clumps')) {
    const islands = shape.uvs.map(swatch);
    for (let i = 0; i < shape.indices.length; i += 3) {
      const a = islands[shape.indices[i]];
      assert.ok(a === islands[shape.indices[i + 1]] && a === islands[shape.indices[i + 2]], shape.name);
    }
  }
});

test('the dorsal fur keeps its breadth behind the waist', { skip: !existsSync('scratch/skyrim/wolf/rebuilt.json') }, () => {
  const shapes = JSON.parse(readFileSync('scratch/skyrim/wolf/rebuilt.json', 'utf8'));
  const { positions, indices } = shapes.find((shape) => shape.name === 'Wolf_Back_Locks');
  function sectionWidth(z) {
    let left = Infinity, right = -Infinity;
    for (let i = 0; i < indices.length; i += 3) {
      for (let edge = 0; edge < 3; edge++) {
        const a = positions[indices[i + edge]], b = positions[indices[i + (edge + 1) % 3]];
        if ((a[2] > z) === (b[2] > z)) continue;
        const x = a[0] + (b[0] - a[0]) * (z - a[2]) / (b[2] - a[2]);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    return right - left;
  }
  const hip = sectionWidth(60);
  assert.ok(hip > 0);
  for (const waist of [71, 74, 77]) {
    assert.ok(sectionWidth(waist) >= .84 * hip, 'the middle keeps the volume of the overlapping falls');
  }
});

test('low rear nape bridges shoulders without enclosing the front neck', { skip: !existsSync('scratch/skyrim/wolf/rebuilt.json') }, () => {
  const shapes = JSON.parse(readFileSync('scratch/skyrim/wolf/rebuilt.json', 'utf8'));
  const nape = shapes.find((s) => s.name === 'Wolf_Nape_Locks');
  assert.ok(nape && nape.positions.length > 500, 'separate dense geometric nape transition');
  assert.ok(nape.positions.every((p) => p[1] < 0), 'no front collar');
  assert.ok(Math.max(...nape.positions.map((p) => p[2])) < 121, 'low transition, not a high collar');
  assert.ok(nape.positions.some((p) => p[0] < -12) && nape.positions.some((p) => p[0] > 12), 'fan reaches both rear shoulders');
});

test('one pelt card switches between its three authored colours independently of the fabric dye', async t => {
  const { fakeDom } = await import('../invdrag.mjs');
  const { modelLookRow } = await import('../../src/ui/enhanced/modelLookRow.js');
  const previousDocument = globalThis.document;
  globalThis.document = fakeDom().doc;
  t.after(() => { globalThis.document = previousDocument; _resetForTests(); });
  setPref('modelCustomization', true);
  for (const pack of MOD_PACKS.filter(p => p.group === 'bodies')) {
    modResourceGlob('../../Mods/**/*', { [`../../Mods/${pack.folder}/test.nif`]: 'local' });
  }
  const item = { templateIndex: 154, group: 'MensClothing' };
  const ownLooks = lookChoices(item).map(look => ({ ...look, thumb: look.value + '.png' }));
  const calls = [], changes = [];
  const row = modelLookRow({ item, catalog: { clothes: [] }, ownLooks, onChange() { changes.push('mesh'); }, onColour() { changes.push('colour'); },
    thumb: (records, kind, catalog, { dye }) => { calls.push([records[0].model, dye]); return null; } });
  const chips = () => row.querySelector('.look-dyes').children;
  const cards = () => row.querySelector('.look-cards').children;
  assert.equal(cards().length, 2);
  assert.equal(chips().length, 10);
  assert.equal(chips()[0].getAttribute('aria-pressed'), 'true');
  chips()[2].onclick();
  assert.deepEqual(calls.findLast(([model]) => model === 'cloak_blue.nif'), ['cloak_blue.nif', 2]);
  cards()[1].onclick();
  assert.equal(chips().length, 3);
  chips()[1].onclick();
  assert.equal(lookChoices(item).find(l => l.on).value, 'wolf-white');
  assert.equal(cards().length, 2);
  assert.equal(chips()[1].getAttribute('aria-pressed'), 'true');
  assert.ok(calls.filter(([model]) => model.startsWith('wolf_pelt')).every(([, dye]) => dye === null));
  cards()[0].onclick();
  assert.equal(chips()[2].getAttribute('aria-pressed'), 'true');
  assert.deepEqual(changes, ['colour','mesh','colour','mesh']);
});

test('only a change of palette on the visible cloak can reuse the standing mesh', async () => {
  const { cloakPaletteChange } = await import('../../src/characters/ownModels/cloakPalette.js');
  const fabric = { kind: 'clothing', templateIndex: 155, dye: 0 };
  const wolf = { ...fabric, ownStyle: 'wolf-white' };
  assert.deepEqual(cloakPaletteChange([fabric],[{ ...fabric, cosmeticDye: 2 }],'cloak (daggerfall_cloak)'), { dye: 2 });
  assert.deepEqual(cloakPaletteChange([wolf],[{ ...wolf, ownStyle: 'wolf-black' }],'cloak (wolf_pelt_cloak)'), { fur: 'black' });
  assert.equal(cloakPaletteChange([fabric],[wolf],'cloak (daggerfall_cloak)'), null);
  assert.equal(cloakPaletteChange([wolf],[fabric],'cloak (wolf_pelt_cloak)'), null);
  assert.equal(cloakPaletteChange([fabric],[{ ...fabric, mwRecord:'shirt' }],'cloak (daggerfall_cloak)'), null);
});
