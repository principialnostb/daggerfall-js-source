import test from 'node:test';
import assert from 'node:assert/strict';
import { setShippedDfmods, setDfmodEnabled } from '../../src/systems/dfmodTextures.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { clothingKind } from '../../src/systems/item/clothingKinds.js';
import { clothingDisplayTemplate } from '../../src/systems/item/clothingDisplay.js';
import { ITEM_TEMPLATES } from '../../src/systems/item/itemTemplates.js';
import { getTemplate } from '../../src/characters/paperdoll/paperdoll.js';
import { paperdollLookChoices } from '../../src/systems/paperdollLooks.js';
import { paperDollDisplayIdentity } from '../../src/ui/paperDoll.js';

test('Paperdoll Enhanced Eodoric is a full outfit only while its repaint is enabled', () => {
  const key = 'dfmod/paperdoll enhanced.dfmod', previous = getPref('dfmodOff');
  const pack = { key, on: true, index: { title: 'Paperdoll Enhanced', textures: [['237_9-0_Blue', 624, 1352]] }, open: async () => null };
  try {
    setShippedDfmods([pack]); setDfmodEnabled([key], true);
    assert.equal(clothingKind(getTemplate(185)), 'full');
    assert.equal(clothingKind(getTemplate(146)), 'sash', 'the mod carries no male art');
    const shirt = { group: 'WomensClothing', templateIndex: 202, variant: 0 };
    const robe = { group: 'WomensClothing', templateIndex: 200, variant: 0 };
    assert.ok(!paperdollLookChoices(shirt, { gender: 'female' }).some(l => l.t === 185));
    assert.ok(paperdollLookChoices(robe, { gender: 'female' }).some(l => l.t === 185));
    const display = paperDollDisplayIdentity({ gender: 'male', race: 'Nord' }, { race: 'breton', female: true, faceIndex: 0 });
    assert.equal(display.gender, 'female');
    assert.ok(paperdollLookChoices(robe, display).some(l => l.t === 185), 'editor gender selects the repainted female dress');
    const male = clothingDisplayTemplate(getTemplate(185), 'male', ITEM_TEMPLATES);
    assert.equal(clothingKind(male), 'full', 'a gender switch must not turn the dress into a sash');
    const belt = { group: 'MensClothing', templateIndex: 145, variant: 0 };
    assert.deepEqual(paperdollLookChoices(belt, { gender: 'female' }), [], 'no compatible female sash template in this repaint');
    setDfmodEnabled([key], false);
    assert.equal(clothingKind(getTemplate(185)), 'sash');
    assert.ok(!paperdollLookChoices(robe, { gender: 'female' }).some(l => l.t === 185));
    setDfmodEnabled([key], true);
    setShippedDfmods([]);
    assert.equal(clothingKind(getTemplate(185)), 'sash', 'removing the pack restores native classification');
  } finally { setShippedDfmods([]); setPref('dfmodOff', previous); }
});
