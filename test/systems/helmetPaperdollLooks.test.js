import test from 'node:test';
import assert from 'node:assert/strict';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { HELMET_2D_PREF, helmetPaperdollVariant, setHelmetPaperdollVariant } from '../../src/systems/helmetPaperdollLooks.js';
import { inventoryItemImage } from '../../src/systems/item/itemTemplates.js';
import { paperdollItemImage } from '../../src/ui/paperDoll.js';
import { lookVariantsOf } from '../../src/systems/lookVariants.js';
import { helmetAppearancePicker } from '../../src/ui/enhanced/helmetAppearancePicker.js';

const helm = Object.freeze({ group: 'Armor', templateIndex: 107, material: 513, variant: 2 });

test('six cosmetic helmet looks change icon and doll together across gender/race; 3D and item stay unchanged', () => {
  const previous = getPref(HELMET_2D_PREF), modelLook = lookVariantsOf(helm)?.current;
  try {
    setPref(HELMET_2D_PREF, null);
    for (let variant = 0; variant < 6; variant++) {
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
  try {
    setPref(HELMET_2D_PREF, null);
    let changes = 0;
    const modelRow = new Element();
    const options = { item: helm, identity: { gender: 'female', race: 'Breton' }, modelRow, onChange: () => changes++, loadArt: async () => 'data:image/png;base64,test' };
    const root = helmetAppearancePicker(options), [tabs, panel] = root.children;
    assert.equal(panel.children[0], modelRow);
    tabs.children[1].onclick();
    const seen = [];
    for (let page = 0; page < 3; page++) {
      const [cards, arrows] = panel.children[0].children;
      seen.push(...cards.children.map((b) => b.title));
      if (page < 2) arrows.children[1].onclick();
      else assert.equal(arrows.children[1].disabled, true);
    }
    assert.equal(changes, 0);
    assert.equal(helmetPaperdollVariant(helm), null);
    assert.deepEqual(seen, ['Исходный', ...Array.from({ length: 6 }, (_, i) => `2D-облик ${i + 1}`)]);
    panel.children[0].children[0].children[0].onclick();
    assert.equal(changes, 1);
    assert.equal(helmetPaperdollVariant(helm), 5);
    const again = helmetAppearancePicker(options);
    assert.equal(again.children[1].attributes['aria-label'], '2D-облик');
    assert.equal(again.children[1].children[0].children[0].children[0].title, '2D-облик 6');
    again.children[0].children[0].onclick();
    assert.equal(changes, 1);
    assert.equal(again.children[1].children[0], modelRow);
    await Promise.resolve();
  } finally { globalThis.document = previousDocument; setPref(HELMET_2D_PREF, previous); }
});
