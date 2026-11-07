// The toybox window: its buttons in order, lit toggles, greyed offline options, the drag, and the game kept out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDom } from './toyboxDom.mjs';
import { createToyboxWindow, TOYBOX_OFFLINE_TIP } from '../../src/ui/toybox/toyboxWindow.js';
import { TOYBOX_OPTIONS } from '../../src/systems/toybox/toyboxLaw.js';


const make = (over = {}) => {
  const dom = fakeDom();
  const picks = [];
  let closed = 0;
  const w = createToyboxWindow({ doc: dom.doc, win: dom.win, onPick: (id) => picks.push(id), onClose: () => closed++, ...over });
  return { dom, w, picks, closed: () => closed };
};

test('one button per option, in the law\'s order, with its label; hidden until opened', () => {
  const { dom, w } = make();
  const rows = dom.all(w.el).filter((n) => n.attrs['data-toybox-option'] != null);
  assert.deepEqual(rows.map((b) => b.attrs['data-toybox-option']), TOYBOX_OPTIONS.map((o) => o.id));
  assert.deepEqual(rows.map((b) => b.textContent), ['Invincible', 'No-Clip', 'Ghost', 'Teleport', 'Summon', 'Create Item', 'Invasion', 'Dragon Attack']);
  assert.match(w.el.style.cssText, /display:none/);
  assert.equal(w.isOpen(), false);
  w.open();
  assert.equal(w.isOpen(), true);
  assert.equal(w.el.style.display, 'block');
  assert.match(w.el.style.cssText, /position:fixed/);
  assert.match(w.el.style.cssText, /rgba\(10,12,16,0\.72\)/, 'see-through');
});

test('toggles light while on; a non-toggle never lights; online-only options grey out offline with a tip', () => {
  const { w, picks } = make();
  w.open();
  w.paint({ lit: { invincible: true, noclip: false, ghost: true, teleport: true }, online: false });
  assert.equal(w.button('invincible').attrs['aria-pressed'], 'true');
  assert.equal(w.button('noclip').attrs['aria-pressed'], 'false');
  assert.equal(w.button('ghost').attrs['aria-pressed'], 'true');
  assert.equal(w.button('teleport').attrs['aria-pressed'], 'false', 'teleport is no toggle');
  assert.notEqual(w.button('invincible').style.background, w.button('noclip').style.background);
  const summon = w.button('summon');
  assert.equal(summon.disabled, true);
  assert.equal(summon.attrs.title, TOYBOX_OFFLINE_TIP);
  assert.equal(summon.style.opacity, '0.4');
  w.paint({ lit: { invincible: false }, online: true });
  assert.equal(summon.disabled, false);
  assert.equal(summon.attrs.title, undefined);
  assert.equal(w.button('invincible').attrs['aria-pressed'], 'false');
  assert.equal(picks.length, 0);
});

test('a press of an option tells onPick; a greyed one tells nothing', () => {
  const { dom, w, picks } = make();
  w.open();
  w.paint({ lit: {}, online: false });
  dom.fire(w.button('ghost'), 'click');
  dom.fire(w.button('summon'), 'click');
  dom.fire(w.button('dragon'), 'click');
  assert.deepEqual(picks, ['ghost', 'dragon']);
});

test('X and Escape close it and tell onClose once each', () => {
  const { dom, w, closed } = make();
  w.open();
  dom.fire(dom.byAttr('data-toybox-close', undefined, w.el), 'click');
  assert.equal(w.isOpen(), false);
  assert.equal(closed(), 1);
  w.close();
  assert.equal(closed(), 1, 'closing a closed window says nothing');
  w.open();
  dom.fire(w.button('ghost'), 'keydown', { key: 'Escape' });
  assert.equal(w.isOpen(), false);
  assert.equal(closed(), 2);
});

test('presses and keys inside the window never reach the game; a release does', () => {
  const { dom, w } = make();
  w.open();
  for (const k of ['pointerdown', 'mousedown', 'click', 'wheel', 'keydown', 'keyup']) assert.notEqual(dom.fire(w.button('noclip'), k, { key: 'w' }).reachedWindow, true, k);
  assert.equal(dom.fire(w.button('noclip'), 'pointerup').reachedWindow, true);
  assert.equal(dom.fire(dom.doc.body, 'pointerdown').reachedWindow, true, 'the world outside still hears its own');
});

test('the title bar drags the window and keeps it on screen', () => {
  const { dom, w } = make();
  w.open();
  const bar = w.el.children[0];
  w.el.offsetWidth = 200;
  w.el.offsetHeight = 300;
  const startLeft = parseFloat(w.el.style.left);
  const startTop = parseFloat(w.el.style.top);
  dom.fire(bar, 'pointerdown', { button: 0, pointerId: 7, clientX: 30, clientY: 130 });
  assert.equal(bar.captured, 7, 'the pointer is captured');
  dom.fire(bar, 'pointermove', { pointerId: 7, clientX: 80, clientY: 160 });
  assert.equal(parseFloat(w.el.style.left), startLeft + 50);
  assert.equal(parseFloat(w.el.style.top), startTop + 30);
  dom.fire(bar, 'pointermove', { pointerId: 7, clientX: 5000, clientY: -5000 });
  assert.equal(w.el.style.left, '600px', 'held inside the right edge');
  assert.equal(w.el.style.top, '0px', 'held inside the top');
  dom.fire(bar, 'pointerup', { pointerId: 7 });
  assert.equal(bar.captured, null);
  dom.fire(bar, 'pointermove', { pointerId: 7, clientX: 0, clientY: 0 });
  assert.equal(w.el.style.left, '600px', 'no drag after the release');
  dom.fire(bar, 'pointerdown', { button: 2, pointerId: 8, clientX: 0, clientY: 0 });
  dom.fire(bar, 'pointermove', { pointerId: 8, clientX: 100, clientY: 100 });
  assert.equal(w.el.style.left, '600px', 'a right press drags nothing');
});
