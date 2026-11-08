import test from 'node:test';
import assert from 'node:assert/strict';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { HELMET_2D_PREF, setPaperdollCustomization, helmetCustomizationModes, helmetPaperdollVariant, setHelmetPaperdollVariant } from '../../src/systems/helmetPaperdollLooks.js';
import { inventoryItemImage } from '../../src/systems/item/itemTemplates.js';
import { paperdollItemImage } from '../../src/ui/paperDoll.js';
import { lookVariantsOf } from '../../src/systems/lookVariants.js';
import { helmetAppearancePicker } from '../../src/ui/enhanced/helmetAppearancePicker.js';

const helm = Object.freeze({ group: 'Armor', templateIndex: 107, material: 513, variant: 2 });

test('the helm other five looks change icon and doll together across gender/race; its own is no second choice; 3D and item stay unchanged', () => {
  const previous = getPref(HELMET_2D_PREF), modelLook = lookVariantsOf(helm)?.current;
  try {
    setPref(HELMET_2D_PREF, null);
    // PAPERDOLL-LOOKS: no duplicates - the helm's own style (2) is "Original", never a second card
    assert.equal(setHelmetPaperdollVariant(helm, 2), false);
    for (const variant of [0, 1, 3, 4, 5]) {
      assert.equal(setHelmetPaperdollVariant(helm, variant), true);
      for (const gender of ['male', 'female']) for (const race of ['Breton', 'DarkElf', 'Argonian', 'Khajiit']) {
        const identity = { gender, race };
        const icon = inventoryItemImage(helm, identity), layer = paperdollItemImage(helm, identity);
        assert.equal(icon.record, 27 + variant);
        assert.equal(layer.record, icon.record);
        assert.equal(layer.archive, icon.archive);
        assert.equal(icon.dye, layer.dye);
      }
      assert.equal(helm.variant, 2);
      assert.equal(lookVariantsOf(helm)?.current, modelLook);
    }
    assert.equal(helmetPaperdollVariant({ ...helm, material: 512 }), null);
    // Previewing Original must not show the saved override or change it.
    assert.equal(paperdollItemImage(helm, {}, { helmetVariant: null }).record, 29);
    assert.equal(helmetPaperdollVariant(helm), 5);
    assert.equal(setHelmetPaperdollVariant(helm, null), true);
    assert.equal(inventoryItemImage(helm).record, 29);
    for (const value of [-1, 6, 1.5, '2']) assert.equal(setHelmetPaperdollVariant(helm, value), false);
    assert.equal(setHelmetPaperdollVariant({ ...helm, artifact: true }, 0), false);
    assert.equal(setHelmetPaperdollVariant({ ...helm, templateIndex: 102 }, 0), false);
  } finally { setPref(HELMET_2D_PREF, previous); }
});

test('tabs and row arrows only browse; selecting 2D preserves tab/page on inventory rerender', async () => {
  const previous = getPref(HELMET_2D_PREF), previousDocument = globalThis.document;
  class Element {
    children = []; attributes = {}; className = ''; textContent = '';
    classList = { toggle: () => {} };
    setAttribute(k, v) { this.attributes[k] = v; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    remove() {}
  }
  globalThis.document = { createElement: () => new Element() };
  const previous3D = getPref('modelCustomization'), previous2D = getPref('morrowindThirdPersonOnly');
  setPref('modelCustomization', true); setPref('morrowindThirdPersonOnly', true);   // the 2D tab needs the 2D card
  try {
    setPref(HELMET_2D_PREF, null);
    let changes = 0;
    const modelRow = new Element();
    const options = { item: helm, identity: { gender: 'female', race: 'Breton' }, modelRow, onChange: () => changes++, layerPixels: async () => null };
    const root = helmetAppearancePicker(options), [tabs, panel] = root.children;
    assert.equal(panel.children[0], modelRow);
    tabs.children[1].onclick();
    const seen = [];
    for (let page = 0; page < 2; page++) {
      const [cards, arrows] = panel.children[0].children;
      seen.push(...cards.children.map((b) => b.title));
      if (page < 1) arrows.children[1].onclick();
      else assert.equal(arrows.children[1].disabled, true);
    }
    assert.equal(changes, 0);
    assert.equal(helmetPaperdollVariant(helm), null);
    assert.deepEqual(seen, ['Исходный', '2D-облик 1', '2D-облик 2', '2D-облик 4', '2D-облик 5', '2D-облик 6']);   // the own style (3) once, as Original
    panel.children[0].children[0].children[0].onclick();
    assert.equal(changes, 1);
    assert.equal(helmetPaperdollVariant(helm), 3);
    const again = helmetAppearancePicker(options);
    assert.equal(again.children[1].attributes['aria-label'], '2D-облик');
    assert.equal(again.children[1].children[0].children[0].children[0].title, '2D-облик 4');
    again.children[0].children[0].onclick();
    assert.equal(changes, 1);
    assert.equal(again.children[1].children[0], modelRow);
    await Promise.resolve();
    // THE TABS (the owner, 2026-11-08): one on, one full-width tab named for it; both on, two
    assert.deepEqual(root.children[0].children.map((b) => b.textContent), ['3D', '2D']);
    setPref('modelCustomization', false);
    assert.deepEqual(helmetAppearancePicker(options).children[0].children.map((b) => b.textContent), ['2D-облик']);
    setPref('modelCustomization', true); setPref('morrowindThirdPersonOnly', false);
    assert.deepEqual(helmetAppearancePicker(options).children[0].children.map((b) => b.textContent), ['3D-модель']);
    setPref('modelCustomization', false);
    assert.equal(helmetAppearancePicker(options), null);
  } finally { setPref('modelCustomization', previous3D); setPref('morrowindThirdPersonOnly', previous2D); globalThis.document = previousDocument; setPref(HELMET_2D_PREF, previous); }
});

test('disabling paperdoll customization resets saved helmet art; tab availability follows enabled modifications',()=>{
 const previous=getPref(HELMET_2D_PREF), enabled=getPref('paperdollCustomization'), models=getPref('modelCustomization');
 try{
  setPaperdollCustomization(true);setPref('modelCustomization',false);
  setHelmetPaperdollVariant(helm,3);assert.equal(helmetPaperdollVariant(helm),3);
  assert.deepEqual(helmetCustomizationModes(),['2d']);
  setPref('modelCustomization',true);assert.deepEqual(helmetCustomizationModes(),['3d','2d']);
  setPaperdollCustomization(false);assert.equal(helmetPaperdollVariant(helm),null);
  assert.deepEqual(getPref(HELMET_2D_PREF),{});
  assert.deepEqual(helmetCustomizationModes(),['3d']);
  setPaperdollCustomization(true);assert.equal(helmetPaperdollVariant(helm),null);
 }finally{setPref(HELMET_2D_PREF,previous);setPref('paperdollCustomization',enabled);setPref('modelCustomization',models);}
});
