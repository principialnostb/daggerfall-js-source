// The toybox's popups: Summon, Invasion and Dragon Attack - the boxes, their lists above, the buttons that wake only on
// a listed name, and the status line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDom } from './toyboxDom.mjs';
import { createSummonPopup, createInvasionPopup, createDragonPopup, exactName } from '../../src/ui/toybox/toyboxPopups.js';
import { INVASION_FAMILIES } from '../../src/systems/toybox/toyboxLaw.js';


const CITIES = ['Daggerfall', 'Sentinel', 'Wayrest', 'Mournhold', 'Solitude'];

test('exactName: whole and case-blind, the list\'s own spelling back', () => {
  assert.equal(exactName(CITIES, '  daggerFALL '), 'Daggerfall');
  assert.equal(exactName(CITIES, 'Dagger'), null);
  assert.equal(exactName(CITIES, ''), null);
  assert.equal(exactName(['Mournhold'], 'mournhold'), 'Mournhold', 'a city past the Bay');
});

test('Summon: label Player, its list above the box, the button asleep until the box holds an online name', () => {
  const dom = fakeDom();
  const asked = [];
  const p = createSummonPopup({ doc: dom.doc, win: dom.win, players: () => ['Bran', 'Brienne', 'Cat'], onSummon: (name, say) => { asked.push(name); say(`Summoning ${name}.`); } });
  p.open({ left: 10, top: 100, width: 200 });
  assert.equal(p.isOpen(), true);
  assert.equal(p.el.style.left, '218px', 'beside the toybox window');
  assert.match(p.el.textContent, /Player/);
  assert.equal(p.button.textContent, 'Summon');
  assert.equal(p.button.disabled, true);
  dom.type(p.input, 'br');
  assert.deepEqual(p.suggest.rows(), ['Bran', 'Brienne']);
  assert.ok(p.suggest.el.style.bottom, 'the list stands above the box');
  assert.equal(p.button.disabled, true, 'a part of a name is no name');
  dom.fire(p.suggest.el.children[1], 'mousedown');
  assert.equal(p.input.value, 'Brienne');
  assert.equal(p.button.disabled, false);
  dom.fire(p.button, 'click');
  assert.deepEqual(asked, ['Brienne']);
  assert.match(p.el.textContent, /Summoning Brienne\./);
  dom.type(p.input, 'CAT');
  dom.fire(p.input, 'keydown', { key: 'Escape' }); // the list takes the first Escape
  assert.equal(p.isOpen(), true);
  dom.fire(p.input, 'keydown', { key: 'Enter' });
  assert.deepEqual(asked, ['Brienne', 'Cat'], 'Enter presses it; the list\'s spelling is sent');
  dom.fire(p.input, 'keydown', { key: 'Escape' });
  assert.equal(p.isOpen(), false, 'the next Escape closes the popup');
  p.open();
  assert.equal(p.input.value, '', 'opened fresh');
  dom.fire(dom.byAttr('data-toybox-close', undefined, p.el), 'click');
  assert.equal(p.isOpen(), false);
});

test('Invasion: a city box, the word Enemies, the families in the law\'s order, then Commence; the answer is said', async () => {
  const dom = fakeDom();
  const specs = [];
  let answer = { ok: true };
  const p = createInvasionPopup({ doc: dom.doc, win: dom.win, cities: () => CITIES, onStart: async (s) => { specs.push(s); return answer; } });
  p.open();
  assert.match(p.el.textContent, /Enemies/);
  assert.deepEqual(p.select.children.map((o) => o.textContent), ['Daedra', 'Undead', 'Werewolves', 'Orcs', 'Humans']);
  assert.deepEqual(p.select.children.map((o) => o.value), INVASION_FAMILIES.map((f) => f.id));
  assert.equal(p.button.textContent, 'Commence');
  assert.equal(p.button.disabled, true);
  dom.type(p.input, 'mourn');
  assert.deepEqual(p.suggest.rows(), ['Mournhold']);
  dom.type(p.input, 'mournhold');
  assert.equal(p.button.disabled, false);
  p.select.value = 'orcs';
  await p.run();
  assert.deepEqual(specs, [{ kind: 'invasion', city: 'Mournhold', family: 'orcs' }]);
  assert.match(p.el.textContent, /Invasion staged at Mournhold\. It starts in 10 minutes\./);
  answer = { ok: false, error: 'An event is already staged.' };
  await p.run();
  assert.match(p.el.textContent, /An event is already staged\./);
  answer = Promise.reject(new Error('no relay'));
  answer.catch(() => {});
  await p.run();
  assert.match(p.el.textContent, /no relay/);
});

test('Invasion: one press at a time while the answer is awaited', async () => {
  const dom = fakeDom();
  let release;
  let calls = 0;
  const p = createInvasionPopup({ doc: dom.doc, win: dom.win, cities: () => CITIES, onStart: () => { calls++; return new Promise((r) => { release = r; }); } });
  p.open();
  dom.type(p.input, 'Sentinel');
  const first = p.run();
  assert.equal(p.button.disabled, true, 'asleep while it stages');
  await p.run();
  assert.equal(calls, 1);
  release({ ok: true });
  await first;
  assert.equal(p.button.disabled, false);
});

test('Dragon Attack: Location, a city box, Summon; it stages a dragon at the city', async () => {
  const dom = fakeDom();
  const specs = [];
  const p = createDragonPopup({ doc: dom.doc, win: dom.win, cities: () => CITIES, onStart: async (s) => { specs.push(s); return { ok: true }; } });
  p.open();
  assert.match(p.el.textContent, /Location/);
  assert.equal(p.select, null);
  assert.equal(p.button.textContent, 'Summon');
  dom.type(p.input, 'way');
  dom.fire(p.input, 'keydown', { key: 'Enter' }); // picks from the list
  assert.equal(p.input.value, 'Wayrest');
  assert.equal(specs.length, 0, 'the list took that Enter');
  dom.fire(p.button, 'click');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(specs, [{ kind: 'dragon', city: 'Wayrest' }]);
  assert.match(p.el.textContent, /Dragon attack staged at Wayrest\./);
});

test('popups keep the game from their presses and keys', () => {
  const dom = fakeDom();
  const p = createDragonPopup({ doc: dom.doc, win: dom.win, cities: () => CITIES, onStart: async () => ({ ok: true }) });
  p.open();
  for (const k of ['pointerdown', 'mousedown', 'click', 'keydown']) assert.notEqual(dom.fire(p.input, k, { key: 'w' }).reachedWindow, true, k);
});
