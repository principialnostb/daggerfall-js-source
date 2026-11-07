// The offline command bar: one line for slash commands where no chat runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDom } from './toyboxDom.mjs';
import { createOfflineCommandBar, OFFLINE_LINE_MS } from '../../src/ui/offlineCommandBar.js';


const make = (answer = () => null) => {
  const dom = fakeDom();
  const sent = [];
  const timers = [];
  const bar = createOfflineCommandBar({
    doc: dom.doc,
    win: dom.win,
    onSubmit: (t) => {
      sent.push(t);
      return answer(t);
    },
    setTimer: (f, ms) => {
      const t = { f, ms, live: true };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => {
      t.live = false;
    },
  });
  return { dom, bar, sent, timers };
};

test('hidden until opened; open shows it focused at the bottom-left', () => {
  const { dom, bar } = make();
  assert.match(bar.el.style.cssText, /display:none/);
  assert.match(bar.el.style.cssText, /left:12px;bottom:12px/);
  bar.open();
  assert.equal(bar.isOpen(), true);
  assert.equal(bar.el.style.display, 'flex');
  assert.equal(dom.doc.activeElement, bar.input);
});

test('Enter sends the line, closes the box and shows the answer for a while', () => {
  const { dom, bar, sent, timers } = make((t) => (t === '/toybox' ? null : `Unknown command: ${t}`));
  bar.open();
  bar.input.value = '  /toybox ';
  dom.fire(bar.input, 'keydown', { key: 'Enter' });
  assert.deepEqual(sent, ['/toybox']);
  assert.equal(bar.isOpen(), false);
  assert.equal(bar.el.style.display, 'none', 'no answer: nothing stays');
  bar.open();
  bar.input.value = '/fly';
  dom.fire(bar.input, 'keydown', { key: 'Enter' });
  assert.equal(bar.isOpen(), false);
  assert.equal(bar.el.style.display, 'flex', 'the answer stays up');
  assert.match(bar.el.textContent, /Unknown command: \/fly/);
  const t = timers.at(-1);
  assert.equal(t.ms, OFFLINE_LINE_MS);
  t.f();
  assert.equal(bar.el.style.display, 'none', 'and goes after its time');
  bar.open();
  dom.fire(bar.input, 'keydown', { key: 'Enter' });
  assert.equal(sent.length, 2, 'an empty line sends nothing');
});

test('Escape closes without sending; a blur closes it too', () => {
  const { dom, bar, sent } = make();
  bar.open();
  bar.input.value = '/toybox';
  dom.fire(bar.input, 'keydown', { key: 'Escape' });
  assert.equal(bar.isOpen(), false);
  assert.deepEqual(sent, []);
  bar.open();
  bar.input.blur();
  assert.equal(bar.isOpen(), false);
});

test("while open, the box's keys never reach the game; closed, its window listener is gone", () => {
  const { dom, bar } = make();
  const game = [];
  dom.win.addEventListener('keydown', (e) => game.push(e.key));
  bar.open();
  for (const key of ['w', ' ', 'e']) assert.notEqual(dom.fire(bar.input, 'keydown', { key }).reachedWindow, true);
  assert.deepEqual(game, []);
  assert.notEqual(dom.fire(bar.input, 'keyup', { key: 'w' }).reachedWindow, true);
  bar.close();
  assert.equal(dom.win.on.filter((l) => l.capture).length, 0);
  dom.fire(dom.doc.body, 'keydown', { key: 'w' });
  assert.deepEqual(game, ['w']);
});

test('say shows a line with the box closed', () => {
  const { bar } = make();
  bar.say('No toybox for you.');
  assert.equal(bar.el.style.display, 'flex');
  assert.equal(bar.isOpen(), false);
  bar.dispose();
});

test('OFFLINE BAR opened by the slash holds the slash already, the caret after it', () => {
  const { doc, win } = fakeDom();
  const bar = createOfflineCommandBar({ doc, win, onSubmit: () => null });
  bar.open('/');
  assert.equal(bar.input.value, '/');
  bar.close();
  bar.open();
  assert.equal(bar.input.value, '', 'opened without a start it is empty');
});
