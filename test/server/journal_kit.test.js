// The journal's kit: the Cabinet's pictures drawn by the game's own painters, bundled for the Activity. Held here: the
// bundle is light and is exactly the painters' graph (none of the game's settings, account or weapon rules); every ware
// in the catalogue has a drawing; an armory weapon piece's look is the game's own; and the journal loads the kit from
// where the tool writes it, a path git never keeps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../chargenDom.mjs';
import { buildKit, KIT_ENTRY, KIT_OUT, KIT_BUDGET } from '../../tools/journalKit.mjs';
import { graph } from '../importGraph.mjs';
import { wareDrawing, wareNode, focusBox, SLOT_FOCUS } from '../../src/journalKit/cabinetPreview.js';
import { armoryGlowSpec } from '../../src/systems/weaponGlowLooks.js';
import { glowSpec, ARMORY_LEVEL, ARMORY_GLOW } from '../../src/systems/weaponGlow.js';
import { SEAL_WARES, TIDEBOUND_PIECES } from '../../src/net/discordShopLaw.js';
import { armoryPieceOf } from '../../src/net/armoryLaw.js';

test('Journal kit: one light browser module, exactly the painters\' graph - no settings, account client, grass or weapon rules ride along', async () => {
  const kit = await buildKit({ write: false });
  assert.ok(kit.bytes < KIT_BUDGET, `${kit.bytes} bytes, past the budget of ${KIT_BUDGET}`);
  assert.deepEqual(kit.inputs, [...graph(KIT_ENTRY)].sort(), 'the walk and the bundle');
  for (const heavy of ['src/net/accountClient.js', 'src/systems/modSettings.js', 'src/systems/features.js', 'src/render/labGrass.js', 'src/systems/weaponGlow.js', 'src/systems/loot/lootRarity.js'])
    assert.ok(!kit.inputs.includes(heavy), `${heavy} joined the kit`);
  assert.doesNotMatch(kit.text, /\bfrom\s*["']node:/, 'nothing of Node in a page\'s module');
  assert.match(kit.text, /export\s*\{/, 'an ES module the journal imports');
});

test('Journal kit: every ware in the catalogue has the game\'s drawing - an aura on the figure, a body piece framed on its slot, the Edge on its blade, the set with both', () => {
  for (const w of SEAL_WARES) {
    const d = wareDrawing(w.id);
    assert.ok(d, `${w.id}: no drawing`);
    if (w.kind === 'aura') assert.deepEqual(d, { how: 'stage', parts: [{ part: 'figure', aura: w.codes[0], kit: null }] });
    if (w.kind === 'title') assert.deepEqual(d, { how: 'plate', title: w.codes[0] });
    if (w.kind === 'glyph') assert.deepEqual(d, { how: 'glyph', glyph: w.codes[0] });
    if (w.kind === 'icon') assert.deepEqual(d, { how: 'icon', icon: w.codes[0] });
  }
  for (const key of TIDEBOUND_PIECES) {
    const piece = armoryPieceOf(key);
    const d = /** @type {any} */ (wareDrawing(`dc-armory-${key}`));
    if (piece?.slot === 'weapon') {
      assert.deepEqual(d.parts, [{ part: 'blade', look: 'tide' }], 'the weapon piece alone stands on its blade');
      continue;
    }
    assert.equal(d.parts.length, 1);
    assert.equal(d.parts[0].part, 'figure');
    assert.deepEqual(d.parts[0].focus, SLOT_FOCUS[/** @type {keyof typeof SLOT_FOCUS} */ (piece?.slot)], `${key}: framed on its slot`);
  }
  const set = /** @type {any} */ (wareDrawing('dc-armory-tidebound'));
  assert.equal(set.parts[0].part, 'figure');
  assert.equal(set.parts[0].focus, undefined, 'the set is seen whole');
  assert.deepEqual(set.parts[1], { part: 'blade', look: 'tide' }, 'and its weapon piece on its blade');
  assert.equal(wareDrawing('dc-aura-nothing'), null);
  assert.equal(wareDrawing(42), null);
});

test('Journal kit: a weapon piece\'s look is the game\'s own - the leaf\'s spec is glowSpec\'s for every armory look, none for an element', () => {
  for (const look of Object.values(ARMORY_GLOW)) assert.deepEqual(armoryGlowSpec(look), glowSpec(look, ARMORY_LEVEL), look);
  assert.equal(armoryGlowSpec('fire'), null);
  assert.equal(armoryGlowSpec(undefined), null);
});

test('Journal kit: a piece\'s still keeps a share of the frame inside it, about its slot', () => {
  for (const f of Object.values(SLOT_FOCUS)) {
    const [x, y, w, h] = focusBox(f);
    assert.ok(x >= 0 && y >= 0 && x + w <= 1 + 1e-9 && y + h <= 1 + 1e-9, JSON.stringify(f));
    assert.ok(Math.abs(w - 1 / f.zoom) < 1e-9 && Math.abs(h - 1 / f.zoom) < 1e-9);
  }
  assert.deepEqual(focusBox({ y: 0.02, zoom: 2 }), [0.25, 0, 0.5, 0.5], 'held inside at the top');
  assert.deepEqual(focusBox({ y: 0.99, zoom: 2 }), [0.25, 0.5, 0.5, 0.5], 'and at the bottom');
  assert.deepEqual(focusBox({ y: 0.5, zoom: 0.5 }), [0, 0, 1, 1], 'never larger than the frame');
});

test('Journal kit: a title on its plate over the name, a glyph beside it, a portrait in its bezel - each by the game\'s painter', () => {
  const doc = /** @type {any} */ (globalThis.document);
  // no canvas here: a flame title's sheets are a browser's to paint, and the plate's letters stand without them
  const make = doc.createElement;
  doc.createElement = (/** @type {string} */ t) => Object.assign(make(t), String(t).toLowerCase() === 'canvas' ? { getContext: () => null } : {});
  const plate = /** @type {any} */ (wareNode(doc, 'dc-title-veilcourier', { name: 'Kaya' }));
  assert.ok(plate, 'the title is drawn');
  assert.match(plate.textContent, /Courier of the Veil/);
  assert.match(plate.textContent, /Kaya/);
  const glyph = /** @type {any} */ (wareNode(doc, 'dc-glyph-waxseal', { name: 'Kaya' }));
  assert.ok(glyph && /Kaya/.test(glyph.textContent), 'the glyph beside the name');
  const icon = /** @type {any} */ (wareNode(doc, 'dc-icon-courier', { size: 64, still: true }));
  assert.ok(icon, 'the portrait is drawn');
  assert.equal(wareNode(doc, 'dc-aura-veilwake'), null, 'an aura is a stage\'s, not a node');
});

test('Journal kit: the journal imports it from where the tool writes it, and git never keeps it', () => {
  assert.equal(KIT_OUT, 'server-account/journal/kit/cabinetPreview.js');
  const view = readFileSync(new URL('../../server-account/journal/cabinetView.js', import.meta.url), 'utf8');
  assert.match(view, /new URL\('\.\/kit\/cabinetPreview\.js', import\.meta\.url\)/);
  assert.match(view, /\.catch\(\(\) => null\)/, 'a journal without its kit shows the seals');
  const ignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');
  assert.match(ignore, /^server-account\/journal\/kit\/$/m);
});
