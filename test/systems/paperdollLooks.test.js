// PAPERDOLL-LOOKS (systems/paperdollLooks.js, ui/enhanced/paperdollAppearancePicker.js): the 2D card look of every
// piece - armour in its own material, clothing styles, a weapon or shield drawn as another of its class - local and
// cosmetic, no duplicate choices, and one scale for every card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { PAPERDOLL_LOOKS_PREF, LEGACY_HELMET_PREF, paperdollLookChoices, paperdollLookOf, setPaperdollLook, clearPaperdollLooks } from '../../src/systems/paperdollLooks.js';
import { inventoryItemImage } from '../../src/systems/item/itemTemplates.js';
import { paperdollItemImage, paperdollCloakLining } from '../../src/ui/paperDoll.js';
import { getTemplate } from '../../src/characters/paperdoll/paperdoll.js';
import { EQUIP_SLOTS } from '../../src/systems/equip.js';
import { dedupeAndFrame, unionBounds, artBounds, lookLabel } from '../../src/ui/enhanced/paperdollAppearancePicker.js';

const keep = (fn) => async () => {
  const looks = getPref(PAPERDOLL_LOOKS_PREF), legacy = getPref(LEGACY_HELMET_PREF), on = getPref('paperdollCustomization');
  try { setPref(PAPERDOLL_LOOKS_PREF, null); setPref(LEGACY_HELMET_PREF, null); setPref('paperdollCustomization', true); await fn(); }
  finally { setPref(PAPERDOLL_LOOKS_PREF, looks); setPref(LEGACY_HELMET_PREF, legacy); setPref('paperdollCustomization', on); }
};
const ids = (looks) => looks.map((l) => `${l.t !== undefined ? `t${l.t}` : ''}${l.v !== undefined ? `v${l.v}` : ''}`);

test('armour offers only its own material family\'s other styles (the owner\'s choice), never its own twice', keep(() => {
  const plate = (t, v) => ({ group: 'Armor', templateIndex: t, material: 513, variant: v });
  assert.deepEqual(ids(paperdollLookChoices(plate(102, 1))), ['v2', 'v3']);          // cuirass: plate 1..3
  assert.deepEqual(ids(paperdollLookChoices(plate(104, 2))), ['v3', 'v4', 'v5']);    // greaves: plate 2..5
  assert.deepEqual(ids(paperdollLookChoices(plate(108, 1))), ['v2']);                // boots: plate 1..2
  assert.deepEqual(paperdollLookChoices({ group: 'Armor', templateIndex: 102, material: 0, variant: 0 }), []);      // leather: one style
  assert.deepEqual(paperdollLookChoices({ group: 'Armor', templateIndex: 102, material: 0x100, variant: 4 }), []);  // chain: one style
  assert.deepEqual(paperdollLookChoices(plate(103, 1)), []);                         // gauntlets: one style a family
  assert.deepEqual(ids(paperdollLookChoices({ group: 'Armor', templateIndex: 104, material: 0, variant: 0 })), ['v1']);   // leather greaves 0..1
}));

test('a chosen style draws the doll layer and the icon together; the item itself never changes', keep(() => {
  const cuirass = Object.freeze({ group: 'Armor', templateIndex: 102, material: 513, variant: 1 });
  const own = paperdollItemImage(cuirass, { gender: 'male', race: 'Breton' });
  assert.equal(setPaperdollLook(cuirass, { v: 3 }), true);
  for (const gender of ['male', 'female']) for (const race of ['Breton', 'Argonian', 'Khajiit']) {
    const layer = paperdollItemImage(cuirass, { gender, race }), icon = inventoryItemImage(cuirass, { gender, race });
    assert.equal(layer.record, getTemplate(102).playerTextureRecord + 3);
    assert.equal(icon.record, layer.record);
  }
  assert.equal(paperdollItemImage(cuirass, { gender: 'male', race: 'Breton' }, { look: null }).record, own.record);   // previewing Original
  assert.equal(cuirass.variant, 1);
  assert.equal(setPaperdollLook(cuirass, { v: 1 }), false);   // its own is not a choice
  assert.equal(setPaperdollLook(cuirass, { v: 0 }), false);   // leather's style is another family's
  assert.equal(setPaperdollLook(cuirass, null), true);
  assert.equal(paperdollLookOf(cuirass), null);
}));

test('GARMENT-KINDS: a garment is offered every style of every garment of its kind on its sheet - a top any top, a robe any whole outfit - its dye kept, never the other body sheet', keep(() => {
  const straps = { group: 'MensClothing', templateIndex: 141, variant: 1, dye: 3 };
  const choices = paperdollLookChoices(straps);
  assert.ok(choices.some((c) => c.v === 0 && c.t === undefined), 'its own other styles, as before');
  assert.ok(choices.some((c) => getTemplate(c.t)?.name === 'Short Shirt'), 'a shirt is a top too');
  assert.ok(!choices.some((c) => ['Plain Robes', 'Casual Pants', 'Shoes'].includes(getTemplate(c.t)?.name)), 'never a whole outfit, legs or feet');
  assert.ok(choices.every((c) => c.t === undefined || (c.t >= 141 && c.t <= 181)), 'the men sheet alone');
  const shirt = choices.find((c) => getTemplate(c.t)?.name === 'Long Shirt');
  assert.equal(setPaperdollLook(straps, shirt), true);
  const layer = paperdollItemImage(straps, { gender: 'male', race: 'Breton' });
  assert.equal(layer.record, getTemplate(shirt.t).playerTextureRecord + shirt.v);
  assert.equal(layer.dye, 3, 'the dye is the piece own');
  assert.equal(inventoryItemImage(straps).record, layer.record);
  assert.deepEqual(paperdollLookOf(straps), shirt, 'kept with its template and style');
  const robes = paperdollLookChoices({ group: 'MensClothing', templateIndex: 163, variant: 0 }).map((c) => getTemplate(c.t)?.name);
  assert.ok(robes.includes('Kimono') && robes.includes('Toga') && !robes.includes('Short Shirt'));
  // records two garments share are one card (Casual Pants' third style is the Breeches' first record)
  const legs = paperdollLookChoices({ group: 'MensClothing', templateIndex: 151, variant: 0 });
  const records = legs.map((c) => `${getTemplate(c.t ?? 151).playerTextureRecord + (c.v ?? 0)}`);
  assert.equal(new Set(records).size, records.length);
}));

test('a weapon or shield is drawn as another template of its class and hands; the hand law follows the picture', keep(() => {
  const longsword = Object.freeze({ group: 'Weapons', templateIndex: 120, material: 2, equipSlot: EQUIP_SLOTS.RightHand });
  assert.deepEqual(ids(paperdollLookChoices(longsword)), ['t113', 't114', 't116', 't117', 't118', 't119', 't121']);
  assert.deepEqual(ids(paperdollLookChoices({ group: 'Weapons', templateIndex: 122, material: 2 })), ['t123']);   // two-handed blades
  assert.deepEqual(ids(paperdollLookChoices({ group: 'Weapons', templateIndex: 129, material: 2 })), ['t130']);   // bows
  assert.deepEqual(ids(paperdollLookChoices({ group: 'Armor', templateIndex: 110, material: 513 })), ['t109', 't111', 't112']);   // shields
  assert.equal(setPaperdollLook(longsword, { t: 119 }), true);
  const layer = paperdollItemImage(longsword, { gender: 'male', race: 'Breton' });
  assert.equal(layer.record, getTemplate(119).playerTextureRecord + 1);   // either-hand worn right: the saber's +1 record
  assert.equal(layer.dye, paperdollItemImage({ ...longsword, templateIndex: 119 }, { gender: 'male', race: 'Breton' }).dye);   // the metal kept
  assert.equal(inventoryItemImage(longsword).record, getTemplate(119).playerTextureRecord);   // the list draws the saber
  assert.equal(longsword.templateIndex, 120);
  assert.equal(setPaperdollLook(longsword, { t: 122 }), false);   // another class
  assert.equal(setPaperdollLook(longsword, { t: 120 }), false);   // its own
  setPaperdollLook(longsword, { t: 121 });
  assert.equal(inventoryItemImage(longsword).record, getTemplate(121).playerTextureRecord + 1);   // the katana's list +1 rides the picture
}));

test('artifacts and gilded pieces keep their own art; customization off draws every piece as its own and forgets on clear', keep(() => {
  assert.deepEqual(paperdollLookChoices({ group: 'Weapons', templateIndex: 120, material: 2, artifact: true }), []);
  assert.deepEqual(paperdollLookChoices({ group: 'Weapons', templateIndex: 120, material: 2, rarity: 'gilded' }), []);
  const helm = { group: 'Armor', templateIndex: 107, material: 513, variant: 2 };
  setPref(LEGACY_HELMET_PREF, { '107:513': 4 });
  assert.equal(paperdollLookOf(helm), null, 'legacy type-wide choices cannot identify a particular piece');
  setPaperdollLook(helm, { v: 4 });
  assert.deepEqual(paperdollLookOf(helm), { v: 4 });
  setPref('paperdollCustomization', false);
  assert.equal(paperdollLookOf(helm), null);
  assert.equal(paperdollItemImage(helm, {}).record, getTemplate(107).playerTextureRecord + 2);
  setPref('paperdollCustomization', true);
  clearPaperdollLooks();
  assert.equal(paperdollLookOf(helm), null);
}));

test('the picker drops pixel-equal cards (the original first) and frames every card in one shared window', () => {
  const W = 8, H = 8;
  const pic = (x, y, w, h, c) => {
    const rgba = new Uint8Array(W * H * 4);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const o = (j * W + i) * 4; rgba[o] = c; rgba[o + 3] = 255; }
    return { width: W, height: H, rgba };
  };
  const entries = [
    { look: null, pixels: pic(2, 2, 2, 2, 100) },       // the original: small
    { look: { v: 0 }, pixels: pic(2, 2, 2, 2, 100) },   // painted the same: dropped
    { look: { v: 1 }, pixels: pic(1, 1, 5, 6, 50) },    // larger: keeps its size against the small one
    { look: { v: 3 }, pixels: null },                   // no picture: kept, shown by name
  ];
  const { kept, window } = dedupeAndFrame(entries);
  assert.deepEqual(kept.map((e) => e.look), [null, { v: 1 }, { v: 3 }]);
  assert.deepEqual(window, { x: 1, y: 1, width: 5, height: 6 });
  assert.deepEqual(unionBounds([artBounds(entries[0].pixels.rgba, W, H), artBounds(entries[2].pixels.rgba, W, H)]), window);
  assert.equal(lookLabel(null), 'Исходный');
  assert.equal(lookLabel({ v: 2 }), '2D-облик 3');
  assert.equal(lookLabel({ t: 119 }), getTemplate(119).name);
});

test('a garment dyed by dyeColor alone draws that dye on the doll and its cards, as its icon does', keep(() => {
  const shirt = { group: 'MensClothing', templateIndex: 141, variant: 0, dyeColor: 5 };
  const layer = paperdollItemImage(shirt, { gender: 'male', race: 'Breton' }), icon = inventoryItemImage(shirt);
  assert.equal(layer.dye, 5);
  assert.equal(icon.dye, layer.dye);
  assert.equal(paperdollItemImage({ ...shirt, dye: 7 }, {}).dye, 7);   // `dye` first, as the icon reads it
}));

test('a hooded garment is offered only the styles drawn as it is worn - hood up or down - and keeps one choice for each', keep(() => {
  const down = { group: 'MensClothing', templateIndex: 154, variant: 0 };   // Casual Cloak, hood down
  const up = { ...down, variant: 1 };                                        // the same cloak, hood raised
  assert.deepEqual(ids(paperdollLookChoices(down)), ['v3', 'v4', 't155v0'], 'its hood-down styles and the Formal Cloak hood down');
  assert.deepEqual(ids(paperdollLookChoices(up)), ['v2', 'v5', 't155v1'], 'its hood-up styles and the Formal Cloak hood up');
  assert.equal(setPaperdollLook(down, { v: 4 }), true);
  assert.equal(setPaperdollLook(up, { v: 5 }), true);
  assert.deepEqual(paperdollLookOf(down), { v: 4 }, 'lowering the hood shows the hood-down choice');
  assert.deepEqual(paperdollLookOf(up), { v: 5 }, 'raising it the hood-up one');
  assert.equal(setPaperdollLook(down, { v: 2 }), false, 'a hood-up picture is no choice while the hood is down');
  assert.deepEqual(paperdollLookChoices({ group: 'MensClothing', templateIndex: 163, variant: 1 }), [], 'plain robes hood up: no other whole outfit has a hood');
}));

test('GARMENT-DYES: a garment chooses its colour apart from its shape - the doll, the icon and the cards wear it; its own colour is no choice', keep(async () => {
  const { paperdollDyeOf, setPaperdollDye } = await import('../../src/systems/paperdollLooks.js');
  const shirt = { group: 'MensClothing', templateIndex: 165, variant: 0, dye: 3 };
  assert.equal(paperdollDyeOf(shirt), 3);
  assert.equal(setPaperdollDye(shirt, 3), false, 'its own colour');
  assert.equal(setPaperdollDye(shirt, 8), true);
  assert.equal(paperdollItemImage(shirt, { gender: 'male', race: 'Breton' }).dye, 8);
  assert.equal(inventoryItemImage(shirt).dye, 8);
  const long = paperdollLookChoices(shirt).find((c) => getTemplate(c.t)?.name === 'Long Shirt');
  assert.equal(setPaperdollLook(shirt, long), true);
  assert.deepEqual(paperdollLookOf(shirt), { ...long, d: 8 }, 'the shape changes, the colour stays');
  assert.equal(setPaperdollLook(shirt, null), true);
  assert.deepEqual(paperdollLookOf(shirt), { d: 8 }, 'back to its own shape, still in the chosen colour');
  assert.equal(setPaperdollDye(shirt, null), true);
  assert.equal(paperdollLookOf(shirt), null);
  assert.equal(setPaperdollDye({ group: 'Armor', templateIndex: 102, material: 513 }, 2), false, 'armour wears its metal');
}));

test('the 2D picker: every card a look of its own - template AND style - three a page, the colours above for a garment', keep(async () => {
  const { paperdollAppearancePicker } = await import('../../src/ui/enhanced/paperdollAppearancePicker.js');
  const previousDocument = globalThis.document, prev2D = getPref('morrowindThirdPersonOnly');
  class Element { children = []; attributes = {}; className = ''; textContent = ''; classList = { toggle() {} }; setAttribute(k, v) { this.attributes[k] = v; } append(...n) { this.children.push(...n); } replaceChildren(...n) { this.children = n; } remove() {} }
  globalThis.document = { createElement: () => new Element() };
  setPref('morrowindThirdPersonOnly', true);
  try {
    const shirt = { group: 'MensClothing', templateIndex: 165, variant: 0, dye: 3 };
    const draws = [];
    const root = paperdollAppearancePicker({ item: shirt, identity: { gender: 'male', race: 'Breton' }, onChange() {}, layerPixels: async (_item, _identity, look) => { draws.push(look?.d); return null; } });
    const panel = root.children[1];
    const [dyes, row] = panel.children;
    assert.equal(dyes.className, 'look-dyes');
    assert.equal(dyes.children.length, 10);
    assert.equal(dyes.children.filter((c) => c.className.includes(' on')).length, 1);
    const ids = new Set();
    let guard = 0;
    for (;;) {
      const [cards, nav] = (panel.children.at(-1)).children;
      assert.ok(cards.children.length <= 3, 'three a page');
      for (const c of cards.children) { assert.ok(!ids.has(c.attributes['data-paperdoll-look']), `one id a card: ${c.attributes['data-paperdoll-look']}`); ids.add(c.attributes['data-paperdoll-look']); }
      if (nav.children[1].disabled || guard++ > 40) break;
      nav.children[1].onclick();
    }
    assert.equal(ids.size, paperdollLookChoices(shirt).length + 1);
    const red = panel.children[0].children[2];
    red.onclick();
    assert.equal(panel.children[0].children[2].attributes['aria-checked'], 'true');
    assert.equal(panel.children[0].children[3].attributes['aria-checked'], 'false');
    assert.equal(paperdollItemImage(shirt).dye, 2);
    assert.ok(draws.includes(2), 'the preserved picker reloads the pictures in the new colour');
    void row;
  } finally { globalThis.document = previousDocument; setPref('morrowindThirdPersonOnly', prev2D); }
}));


test('display gender fits shoes and pants to the body without changing the item', keep(() => {
  for (const [male, female] of [[147, 186], [148, 187], [149, 188], [150, 189], [151, 190]]) {
    const item = Object.freeze({ group: 'MensClothing', templateIndex: male, variant: 0, dye: 3 });
    const identity = { gender: 'female', race: 'DarkElf' };
    const image = paperdollItemImage(item, identity);
    assert.equal(image.archive, getTemplate(female).playerTextureArchive + 1);
    assert.equal(image.record, getTemplate(female).playerTextureRecord);
    assert.equal(inventoryItemImage(item, identity).archive, image.archive);
    assert.equal(inventoryItemImage(item, identity).record, image.record);
    assert.equal(item.templateIndex, male);
  }
}));


test('the display sheet includes its extra pants style and preserves that choice', keep(() => {
  const pants = { group: 'MensClothing', templateIndex: 151, variant: 0, dye: 3 };
  const extra = paperdollLookChoices(pants, { gender: 'female' }).find((l) => l.t === 190 && l.v === 4);
  assert.ok(extra);
  assert.equal(setPaperdollLook(pants, extra), true);
  assert.deepEqual(paperdollLookOf(pants), extra);
  assert.equal(paperdollItemImage(pants, { gender: 'female' }).record, 20);
}));


test('cloak lining and outside use the same custom dye and displayed body sheet', keep(async () => {
  const { setPaperdollDye } = await import('../../src/systems/paperdollLooks.js');
  for (const templateIndex of [154, 155, 191, 192]) {
    const cloak = { group: templateIndex < 182 ? 'MensClothing' : 'WomensClothing', templateIndex, dye: 0, variant: 0 };
    setPaperdollDye(cloak, 2);
    for (const gender of ['male', 'female']) {
      const outer = paperdollItemImage(cloak, { gender, race: 'Breton' });
      const lining = paperdollCloakLining(cloak, { gender, race: 'Breton' });
      assert.equal(lining.archive, outer.archive);
      assert.equal(lining.dye, 2);
      assert.equal(lining.target, outer.target);
      assert.ok(lining.record < outer.record);
    }
  }
}));


test('3D mode carries to a newly opened item without reopening the inventory', keep(async () => {
  const { paperdollAppearancePicker } = await import('../../src/ui/enhanced/paperdollAppearancePicker.js');
  const previousDocument = globalThis.document, previous3D = getPref('modelCustomization'), previous2D = getPref('morrowindThirdPersonOnly');
  class Element {
    children = []; attributes = {}; className = ''; classList = { toggle() {} };
    setAttribute(k, v) { this.attributes[k] = v; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
  }
  globalThis.document = { createElement: () => new Element() };
  setPref('modelCustomization', true); setPref('morrowindThirdPersonOnly', true);
  try {
    const options = (templateIndex, modelRow) => ({ item: { group: 'MensClothing', templateIndex, variant: 0, dye: 0 }, identity: { gender: 'male', race: 'Breton' }, modelRow, onChange() {}, layerPixels: async () => null });
    const first = paperdollAppearancePicker(options(165, new Element()));
    first.children[0].children[0].onclick();
    const secondRow = new Element(); let visible = false;
    secondRow.setPreviewVisible = (value) => { visible = value; };
    const second = paperdollAppearancePicker(options(151, secondRow));
    assert.equal(second.children[1].attributes['aria-label'], '3D-модель');
    assert.equal(visible, true);
  } finally { globalThis.document = previousDocument; setPref('modelCustomization', previous3D); setPref('morrowindThirdPersonOnly', previous2D); }
}));
