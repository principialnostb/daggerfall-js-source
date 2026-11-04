// LOOK-THUMBS (2026-10-27, the owner: "что б не текстовое название было а превьюшка предмета"): a worn piece's looks
// as the card offers them - each with its name and picture slot, the worn one marked - and a pick puts the piece in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { lookChoices, setLookVariant, lookVariantsOf } from '../../src/systems/lookVariants.js';
import { CLASSIC_ARMOR_TEMPLATE, STEEL_HELM_STYLES, PLAYER_MADE_STYLES } from '../../src/characters/ownModels/ownArmorModels.js';
import { ARMOR_MATERIAL } from '../../src/systems/armorMaterials.js';
import { allLooks } from '../../tools/lookThumbs.mjs';
import { setPref } from '../../src/systems/uiPrefs.js';
import { composeWornArmor, composeWornModest } from '../../src/formats/morrowind/mwItemMap.js';
import { ARMOR_LOOKS_PREF } from '../../src/systems/lookVariants.js';

const helm = { templateIndex: CLASSIC_ARMOR_TEMPLATE.Helm, material: ARMOR_MATERIAL.Steel };

test('LOOK-THUMBS: the steel helm offers every look, the worn one on; a pick wears it, the worn one is no change', () => {
  setLookVariant(helm, 'closed');
  const c = lookChoices(helm);
  assert.deepEqual(c.map((x) => x.value), [...STEEL_HELM_STYLES]);
  assert.deepEqual(c.filter((x) => x.on).map((x) => x.value), [lookVariantsOf(helm).current]);
  assert.ok(c.every((x) => typeof x.label === 'string' && x.thumb === null), 'in node no picture is served - the card names the look');
  assert.equal(setLookVariant(helm, 'open'), true);
  assert.equal(lookVariantsOf(helm).current, 'open');
  assert.equal(setLookVariant(helm, 'open'), false, 'already worn');
  assert.equal(setLookVariant(helm, 'nonsense'), false);
  setLookVariant(helm, 'closed');
  assert.equal(lookChoices({ templateIndex: CLASSIC_ARMOR_TEMPLATE.Cuirass, material: ARMOR_MATERIAL.Ebony }), null, 'one look, no row');
});

test('LOOK-THUMBS: every look of Mac\'s pieces has its committed picture (the horned one is made by its import)', () => {
  for (const l of allLooks()) {
    if (PLAYER_MADE_STYLES.includes(l.look)) continue;   // MW-HORN5, MW-IRON1: Skyrim's, never committed
    assert.ok(existsSync(l.file), `${l.piece} ${l.look}: ${l.file} - run node tools/lookThumbs.mjs`);
  }
});

test('MW-IRON1: the cuirass and each pauldron keep their own look, by the piece - plate by default, iron on a pick', () => {
  setPref(ARMOR_LOOKS_PREF, {});
  const cuirass = { templateIndex: CLASSIC_ARMOR_TEMPLATE.Cuirass, material: ARMOR_MATERIAL.Steel };
  const left = { templateIndex: CLASSIC_ARMOR_TEMPLATE.Left_Pauldron, material: ARMOR_MATERIAL.Steel };
  assert.deepEqual(lookChoices(cuirass).map((c) => [c.value, c.on]), [['plate', true], ['iron', false]]);
  assert.equal(setLookVariant(cuirass, 'iron'), true);
  assert.equal(lookVariantsOf(cuirass).current, 'iron');
  assert.equal(lookVariantsOf(left).current, 'plate', 'the pauldron is its own');
  setLookVariant(helm, 'horned');
  assert.equal(lookVariantsOf(cuirass).current, 'iron', 'the helm switch is not the cuirass look');
  setLookVariant(helm, 'closed');
  setPref(ARMOR_LOOKS_PREF, {});
});

test('MW-IRON1: the iron cuirass shows the skin under it - the chest is covered, not hidden, and no modesty shirt goes under it; its pauldrons leave the upper arm', () => {
  const steel = (t) => ({ templateIndex: t, material: ARMOR_MATERIAL.Steel });
  const pieces = [steel(CLASSIC_ARMOR_TEMPLATE.Cuirass), steel(CLASSIC_ARMOR_TEMPLATE.Left_Pauldron), steel(CLASSIC_ARMOR_TEMPLATE.Right_Pauldron)];
  const looks = { daggerfall_steel_cuirass: 'iron', daggerfall_steel_left_pauldron: 'iron', daggerfall_steel_right_pauldron: 'iron' };
  const iron = composeWornArmor({ pieces, armors: [], bodyPool: [], female: true, looks });
  assert.deepEqual(iron.adds.map((a) => a.model).sort(), ['iron_cuirass.nif', 'iron_pauldron_left.nif', 'iron_pauldron_right.nif', 'iron_skirt.nif']);
  assert.ok(!iron.shadows.includes('chest') && iron.covers.includes('chest'));
  assert.ok(!iron.shadows.includes('upperarm:left') && !iron.shadows.includes('upperarm:right'));
  assert.ok(!composeWornModest({ pieces, armors: [], bodyPool: [], female: true, looks }, false).adds.some((a) => /shirt/i.test(a.model ?? '')), 'no modesty shirt under it');
  const plate = composeWornArmor({ pieces, armors: [], bodyPool: [], female: true });
  assert.ok(plate.shadows.includes('chest') && plate.shadows.includes('upperarm:left'), 'the plate as it was');
});

test('MW-IRON2: the iron gauntlets hide the wrist and leave the forearm inside their cuff (MW-IRON4); the iron boots stop below the knee - they hide the ankle and leave the knee', () => {
  const steel = (t) => ({ templateIndex: t, material: ARMOR_MATERIAL.Steel });
  const pieces = [steel(CLASSIC_ARMOR_TEMPLATE.Gauntlets), steel(CLASSIC_ARMOR_TEMPLATE.Boots)];
  const looks = { daggerfall_steel_gauntlets: 'iron', daggerfall_steel_boots: 'iron' };
  const iron = composeWornArmor({ pieces, armors: [], bodyPool: [], female: true, looks });
  assert.deepEqual(iron.adds.map((a) => a.model).sort(), ['iron_boot_left.nif', 'iron_boot_right.nif', 'iron_gauntlet_left.nif', 'iron_gauntlet_right.nif']);
  for (const k of ['wrist:left', 'wrist:right', 'ankle:left', 'ankle:right', 'foot:left', 'hand:right']) assert.ok(iron.shadows.includes(k), k);
  assert.ok(!iron.shadows.includes('forearm:left') && !iron.shadows.includes('forearm:right'), 'the forearm is drawn in the cuff');
  assert.ok(!iron.shadows.includes('knee:left') && !iron.shadows.includes('knee:right'), 'the knee stands over the boot');
  const plate = composeWornArmor({ pieces, armors: [], bodyPool: [], female: true });
  assert.ok(plate.shadows.includes('knee:left'), 'the plate boot as it was');
});

test('MW-IRON3: the greaves iron look is the trousers - they show the skin under them (covered, not hidden), as the cuirass does', () => {
  const greaves = [{ templateIndex: CLASSIC_ARMOR_TEMPLATE.Greaves, material: ARMOR_MATERIAL.Steel }];
  const iron = composeWornArmor({ pieces: greaves, armors: [], bodyPool: [], female: true, looks: { daggerfall_steel_greaves: 'iron' } });
  assert.deepEqual(iron.adds.map((a) => a.model).sort(), ['iron_greave_left.nif', 'iron_greave_right.nif']);
  assert.ok(!iron.shadows.includes('upperleg:right') && iron.covers.includes('upperleg:right'));
  assert.ok(composeWornArmor({ pieces: greaves, armors: [], bodyPool: [], female: true }).shadows.includes('upperleg:right'), 'the plate greaves as they were');
});

test('MW-IRON5: the iron skirt covers the groin and the thighs whole and hides them - over the iron trousers too, which show the skin only where nothing else hides it; the knee stays drawn', () => {
  const steel = (t) => ({ templateIndex: t, material: ARMOR_MATERIAL.Steel });
  const looks = { daggerfall_steel_cuirass: 'iron', daggerfall_steel_greaves: 'iron', daggerfall_steel_boots: 'iron' };
  const set = composeWornArmor({ pieces: [steel(CLASSIC_ARMOR_TEMPLATE.Cuirass), steel(CLASSIC_ARMOR_TEMPLATE.Greaves), steel(CLASSIC_ARMOR_TEMPLATE.Boots)], armors: [], bodyPool: [], female: true, looks });
  for (const k of ['groin', 'upperleg:left', 'upperleg:right']) assert.ok(set.shadows.includes(k), k);
  assert.ok(!set.shadows.includes('knee:left') && !set.shadows.includes('knee:right'), 'the knee is drawn');
  assert.ok(set.adds.some((a) => a.model === 'iron_greave_left.nif'), 'the trousers still drawn over the hidden thighs');
  const cuirassAlone = composeWornArmor({ pieces: [steel(CLASSIC_ARMOR_TEMPLATE.Cuirass)], armors: [], bodyPool: [], female: true, looks });
  assert.ok(cuirassAlone.shadows.includes('upperleg:right') && cuirassAlone.shadows.includes('groin'), 'the skirt hides them on its own');
});
