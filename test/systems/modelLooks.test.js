// MODEL-LOOKS (systems/modelLooks.js, systems/modelLookSource.js): the 3D look of a piece on the player's own body - the
// Morrowind record it is drawn as - armour in its family's weight class, clothing of its type, a weapon of its type;
// no duplicates; the player's pieces alone; independent of the 2D card look.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { MODEL_LOOKS_PREF, modelLookChoices, modelLookOf, setModelLook, noteModelLookPlayer, isPlayersOwn } from '../../src/systems/modelLooks.js';
import { modelLookFor } from '../../src/systems/modelLookSource.js';
import { PAPERDOLL_LOOKS_PREF, paperdollLookOf } from '../../src/systems/paperdollLooks.js';
import { mwArmorRecords, mwClothingRecord, dfWornEquipment, CLOTHING_NAME, armorWeightOf, armorStemOf, armorSideOf } from '../../src/formats/morrowind/mwItemMap.js';
import { pickWeaponRecord, MW_WEAPON_TYPE } from '../../src/formats/morrowind/mwFirstPerson.js';
import { EQUIP_SLOTS } from '../../src/systems/equip.js';
import { ARMOR_MATERIAL } from '../../src/systems/armorMaterials.js';

const part = (id) => ({ part: 1, male: id, female: id });
const armo = (id, model = `a/${id}.nif`) => ({ id, model, name: id.replace(/_/g, ' '), enchanted: false, parts: [part(`${id}_part`)] });
const CAT = {
  armors: [
    armo('steel_cuirass'), armo('daedric_cuirass'), armo('ebony_cuirass'), armo('iron_cuirass'),
    armo('steel_cuirass_dup', 'a/steel_cuirass.nif'),                      // the steel mesh twice: one choice
    { ...armo('ebony_cuirass_enchanted'), enchanted: true },               // enchanted: no look
    armo('netch_leather_cuirass'), armo('chitin cuirass'), armo('bonemold_cuirass'), armo('imperial_chain_cuirass'),
    armo('iron_gauntlet_left'), armo('iron_gauntlet_right'), armo('daedric_gauntlet_left'), armo('daedric_gauntlet_right'),
    armo('ebony_bracer_left'),                                             // one side only: no pair, no look
    armo('bm_ice_gauntletl'), armo('bm_ice_gauntletr'),
  ],
  clothes: [
    { id: 'common_shirt_01', type: 2, model: 'c/s1.nif', name: 'Common Shirt', parts: [part('s1')] },
    { id: 'common_shirt_02', type: 2, model: 'c/s2.nif', name: 'Common Shirt', parts: [part('s2')] },
    { id: 'common_shirt_03', type: 2, model: 'c/s3.nif', name: 'Common Shirt', parts: [part('s1')] },   // draws as 01: one choice
    { id: 'common_pants_01', type: 0, model: 'c/p1.nif', name: 'Common Pants', parts: [part('p1')] },
  ],
  weapons: [
    { id: 'iron longsword', type: MW_WEAPON_TYPE.LongBladeOneHand, model: 'w/il.nif', name: 'Iron Longsword' },
    { id: 'steel longsword', type: MW_WEAPON_TYPE.LongBladeOneHand, model: 'w/sl.nif', name: 'Steel Longsword' },
    { id: 'daedric katana', type: MW_WEAPON_TYPE.LongBladeOneHand, model: 'w/dk.nif', name: 'Daedric Katana' },
    { id: 'steel claymore', type: MW_WEAPON_TYPE.LongBladeTwoHand, model: 'w/sc.nif', name: 'Steel Claymore' },
  ],
};
const keep = (fn) => async () => {
  const looks = getPref(MODEL_LOOKS_PREF), on = getPref('modelCustomization'), two = getPref(PAPERDOLL_LOOKS_PREF);
  try { setPref(MODEL_LOOKS_PREF, null); setPref('modelCustomization', true); await fn(); }
  finally { setPref(MODEL_LOOKS_PREF, looks); setPref('modelCustomization', on); setPref(PAPERDOLL_LOOKS_PREF, two); noteModelLookPlayer({ items: [], equip: { slots: [] } }); }
};
const steel = ARMOR_MATERIAL.Steel ?? ARMOR_MATERIAL.Iron + 1;

test('the weight class, the side and the stem read every spelling retail uses', () => {
  assert.equal(armorWeightOf('netch_leather_boots'), 'light');
  assert.equal(armorWeightOf('imperial_chain_greaves'), 'medium');
  assert.equal(armorWeightOf('imperial_studded_cuirass'), 'light');
  assert.equal(armorWeightOf('imperial cuirass_armor'), 'heavy');
  assert.equal(armorWeightOf('ebony_cuirass'), 'heavy');
  assert.equal(armorWeightOf('cephalopod_helm'), 'medium');
  for (const id of ['iron_gauntlet_left', 'bm_ice_gauntletl', 'bonemold_pauldron_l', 'chitin pauldron - left']) assert.equal(armorSideOf(id), 'left', id);
  assert.equal(armorStemOf('bm_ice_gauntletl'), armorStemOf('bm_ice_gauntletr'));
  assert.equal(armorStemOf('chitin pauldron - left'), armorStemOf('chitin pauldron - right'));
});

test('armour offers every record of its piece in its family\'s weight class, pairs whole, no duplicate mesh, never its own', keep(() => {
  const cuirass = { group: 'Armor', templateIndex: 102, material: steel };
  assert.deepEqual(modelLookChoices(cuirass, CAT).map((c) => c.id), ['daedric_cuirass', 'ebony_cuirass', 'iron_cuirass']);   // steel is Original; netch, chitin, bonemold, chain are other families
  assert.deepEqual(modelLookChoices({ group: 'Armor', templateIndex: 102, material: ARMOR_MATERIAL.Leather }, CAT).map((c) => c.id), ['chitin_cuirass']);
  assert.deepEqual(modelLookChoices({ group: 'Armor', templateIndex: 102, material: ARMOR_MATERIAL.Chain }, CAT).map((c) => c.id), ['bonemold_cuirass']);
  const gauntlets = modelLookChoices({ group: 'Armor', templateIndex: 103, material: steel }, CAT);
  assert.deepEqual(gauntlets.map((c) => c.id).sort(), ['bm_ice_gauntlet', 'daedric_gauntlet', 'iron_gauntlet'].sort());   // the one-sided ebony bracer is none
  assert.equal(gauntlets.find((c) => c.id === 'daedric_gauntlet').models.length, 2);
}));

test('the resolvers draw the chosen record, and fall back to their own pick when the archives lack it', () => {
  assert.equal(mwArmorRecords(CAT.armors, 102, steel, null, 'daedric_cuirass').records[0].id, 'daedric_cuirass');
  assert.deepEqual(mwArmorRecords(CAT.armors, 103, steel, null, 'bm_ice_gauntlet').records.map((r) => r.id), ['bm_ice_gauntletl', 'bm_ice_gauntletr']);
  assert.equal(mwArmorRecords(CAT.armors, 102, steel, null, 'nowhere_cuirass').records[0].id, mwArmorRecords(CAT.armors, 102, steel).records[0].id);
  assert.equal(mwClothingRecord(CAT.clothes, 'Short Shirt', { recordId: 'common_shirt_02' }).record.id, 'common_shirt_02');
  assert.equal(mwClothingRecord(CAT.clothes, 'Short Shirt', { recordId: 'common_pants_01' }).record.id, 'common_shirt_01');   // another type is no shirt
  assert.equal(pickWeaponRecord(CAT.weapons, MW_WEAPON_TYPE.LongBladeOneHand, 'Iron', { pick: 'daedric katana' }).id, 'daedric katana');
  assert.equal(pickWeaponRecord(CAT.weapons, MW_WEAPON_TYPE.LongBladeOneHand, 'Iron', { pick: 'steel claymore' }).id, 'iron longsword');   // another type: the own pick
});

test('clothing offers the other garments of its type that draw differently; a weapon the other records of its Morrowind type', keep(() => {
  const shirt = Number(Object.entries(CLOTHING_NAME).find(([, n]) => n === 'Short Shirt')[0]);
  assert.deepEqual(modelLookChoices({ group: 'MensClothing', templateIndex: shirt, dye: 0 }, CAT).map((c) => c.id), ['common_shirt_02']);   // 01 is Original, 03 draws as 01, pants are another type
  const longsword = { group: 'Weapons', templateIndex: 120, material: 0 };
  const ids = modelLookChoices(longsword, CAT).map((c) => c.id);
  assert.ok(!ids.includes('steel claymore'), 'a two-hander is another type');
  assert.ok(ids.length === 2, `two other longswords: ${ids}`);
}));

test('a look answers for the player\'s own pieces alone - a peer or a townsperson in the same cuirass keeps its own', keep(() => {
  const mine = { group: 'Armor', templateIndex: 102, material: steel };
  const theirs = { group: 'Armor', templateIndex: 102, material: steel };
  const slots = []; slots[EQUIP_SLOTS.ChestArmor] = mine;
  noteModelLookPlayer({ items: [mine], equip: { slots } });
  assert.equal(setModelLook(mine, 'daedric_cuirass'), true);
  assert.equal(isPlayersOwn(mine), true);
  assert.equal(isPlayersOwn(theirs), false);
  assert.equal(modelLookFor(mine), 'daedric_cuirass');
  assert.equal(modelLookFor(theirs), null);
  const peerSlots = []; peerSlots[EQUIP_SLOTS.ChestArmor] = theirs;
  assert.equal(dfWornEquipment(slots, EQUIP_SLOTS, { Buckler: 109, Tower_Shield: 112 }).find((p) => p.templateIndex === 102).mwRecord, 'daedric_cuirass');
  assert.equal(dfWornEquipment(peerSlots, EQUIP_SLOTS, { Buckler: 109, Tower_Shield: 112 }).find((p) => p.templateIndex === 102).mwRecord, undefined);
  assert.equal(modelLookFor({ ...theirs, __mwLook: 'iron_cuirass' }), 'iron_cuirass');   // a preview names its own
  assert.equal(modelLookFor({ ...mine, __mwLook: null }), null);                          // the Original card
  setPref('modelCustomization', false);
  assert.equal(modelLookFor(mine), null);   // the switch off: every piece its own
  setPref('modelCustomization', true);
  assert.equal(paperdollLookOf(mine), null, 'the 2D card look is its own choice');
  assert.equal(mine.templateIndex, 102); assert.equal(Object.hasOwn(mine, 'mwRecord'), false);
}));

test('the 3D tab is one row: the own looks then the records, "Original" only when the piece has no own look; a choice of either puts the other down', keep(async () => {
  const { modelLookRow } = await import('../../src/ui/enhanced/modelLookRow.js');
  const previousDocument = globalThis.document;
  class Element {
    children = []; attributes = {}; className = ''; textContent = '';
    setAttribute(k, v) { this.attributes[k] = v; }
    append(...n) { this.children.push(...n); }
    replaceChildren(...n) { this.children = n; }
    remove() {}
  }
  globalThis.document = { createElement: () => new Element() };
  try {
    const cuirass = { group: 'Armor', templateIndex: 102, material: steel };
    const slots = []; slots[EQUIP_SLOTS.ChestArmor] = cuirass;
    noteModelLookPlayer({ items: [cuirass], equip: { slots } });
    let changes = 0;
    const titles = (row) => { const out = []; let guard = 0; const next = () => row.children[1].children[1]; while (!row.children[1].children[0].disabled && guard++ < 20) row.children[1].children[0].onclick(); guard = 0; for (;;) { out.push(...row.children[0].children.map((b) => b.title)); if (next().disabled || guard++ > 20) break; next().onclick(); } return out; };
    const plain = modelLookRow({ item: cuirass, catalog: CAT, onChange: () => changes++, thumb: async () => null });
    assert.deepEqual(titles(plain), ['Исходный', 'daedric cuirass', 'ebony cuirass', 'iron cuirass']);
    const own = [{ value: 'plate', label: 'Steel plate', thumb: 'data:x', on: true }, { value: 'iron', label: 'Iron', thumb: 'data:y', on: false }];
    const mixed = modelLookRow({ item: { ...cuirass, templateIndex: 102 }, catalog: CAT, ownLooks: own, onChange: () => changes++, thumb: async () => null });
    assert.deepEqual(titles(mixed).slice(0, 4), ['Steel plate', 'Iron', 'steel cuirass', 'daedric cuirass'], 'one heap: the own looks, the Morrowind record they stand over (never lost), then the rest - no Original');
    assert.equal(titles(mixed).includes('Исходный'), false);
  } finally { globalThis.document = previousDocument; }
}));

test('the look picture raster draws copies framed together - a mirrored copy beside its original fills both halves', async () => {
  const { rasterLook, MIRROR_X } = await import('../../src/render/lookThumbRaster.js');
  const tri = { positions: Float32Array.from([0, 0, 0, 10, 0, 0, 0, 0, 10]), indices: [0, 1, 2], normals: null, uvs: null, material: null };
  const one = rasterLook([{ shapes: [tri] }], () => null, { size: 16, supersample: 1, yaw: 0, pitch: 0 });
  const pair = rasterLook([{ shapes: [tri] }, { shapes: [tri], matrix: MIRROR_X, offset: [-2, 0, 0] }], () => null, { size: 16, supersample: 1, yaw: 0, pitch: 0 });
  const filled = (img, x0, x1) => { let n = 0; for (let y = 0; y < 16; y++) for (let x = x0; x < x1; x++) if (img.data[(y * 16 + x) * 4 + 3]) n++; return n; };
  assert.ok(filled(one, 0, 16) > 20);
  assert.ok(filled(pair, 0, 8) > 10 && filled(pair, 8, 16) > 10, 'both copies drawn, side by side');
});
