// A toybox event on the held map: a Dragon Attack wears its own orange mark and words ("Dragon Attack in 0:42", then
// "Dragon Attacking for 39:10"), as an invasion wears its purple; its card says what its mark and its timer row say; the
// map paints whole with either up; and the mark and the row go the moment the event is over - its dragon gone or fallen.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { HeldMapWindow } from '../../src/ui/heldMap.js';
import { paintRaidMark, toPaper } from '../../src/ui/ink/inkMap.js';
import { readRaidMarksIn, DRAGON_MARK_CSS, INVASION_MARK_CSS, RAID_MARK_CSS } from '../../src/ui/eventMapMarks.js';
import { CLIMATES } from '../../src/formats/mapsFile.js';
import { _resetForTests } from '../../src/systems/uiPrefs.js';
import { toyboxMapMarks, toyboxTimerRows } from '../../src/systems/toybox/toyboxMarks.js';
import { toyboxStaffEvent } from '../../src/net/staffEvent/toyboxEvent.js';
import { DRAGON_STAY_MS, dragonCalledOf, dragonTimes } from '../../src/net/dragon/dragonLaw.js';
import { noteCalledFell, _resetCalledDragons } from '../../src/systems/dragon/calledDragons.js';
import { createLocalToyboxEvents } from '../../src/systems/toybox/localToyboxEvents.js';

const AT = 1_800_000_000_000;
const WAIT = 60_000;
const PLACE = { rg: 17, loc: 3, px: 3, py: 7, nm: 'Wayrest', ct: 1 };
const eventOf = (kind, id = kind === 'dragon' ? 'ldragon001' : 'linvade001') =>
  /** @type {any} */ (toyboxStaffEvent({ kind, place: PLACE, family: 'orcs', id, at: AT, by: 'Dev', wait: WAIT })).ev;
const held = (...events) => events.map((staff) => ({ staff, cleansed: false }));

function fakeDocument() {
  const node = () => {
    const n = {
      children: [], style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
      append(...k) { n.children.push(...k); },
      remove() { n.removed = true; },
      addEventListener() {}, removeEventListener() {},
      setPointerCapture() {}, querySelectorAll: () => [],
      set innerHTML(v) { n.children = []; }, get innerHTML() { return ''; },
    };
    return n;
  };
  return { createElement: () => node(), getElementById: () => null, head: node(), body: node(), addEventListener() {}, removeEventListener() {} };
}
function recordingCtx() {
  const calls = [];
  const state = {};
  return new Proxy({}, {
    get: (_, k) => {
      if (k === 'calls') return calls;
      if (k === 'measureText') return (s) => ({ width: s.length * 6 });
      if (k in state) return state[k];
      return (...args) => { calls.push({ fn: k, args, strokeStyle: state.strokeStyle, fillStyle: state.fillStyle }); };
    },
    set: (_, k, v) => { state[k] = v; return true; },
  });
}

beforeEach(() => _resetCalledDragons());

test('DRAGON MARK: a dragon attack\'s mark is its orange icon with its countdown to landing, then its fight\'s time left; its card and its timer row say the same (mutants: no icon; the words the invasion\'s; the time left counted to the landing)', () => {
  const e = eventOf('dragon');
  const before = AT + 18_000;
  const [coming] = toyboxMapMarks(before, held(e));
  assert.deepEqual([coming.icon, coming.text], ['dragon', 'Dragon Attack in 0:42']);
  assert.deepEqual(coming.tip, { title: 'Dragon Attack', lines: ['Wayrest', 'Dragon Attack in 0:42'] });
  const [row] = toyboxTimerRows(before, held(e));
  assert.deepEqual([row.live, row.at - before], [false, 42_000], 'the row counts to the same landing');
  const fighting = e.go + 50_000;
  const [live] = toyboxMapMarks(fighting, held(e));
  const left = dragonTimes(dragonCalledOf(e)).leaveAt - fighting;
  assert.equal(left, DRAGON_STAY_MS - 50_000);
  assert.deepEqual([live.icon, live.text], ['dragon', 'Dragon Attacking for 39:10']);
  assert.equal(live.tip.lines.at(-1), live.text, 'the card says what the mark says');
  const [liveRow] = toyboxTimerRows(fighting, held(e));
  assert.deepEqual([liveRow.live, liveRow.until - fighting], [true, left], 'the row counts to the dragon\'s leaving');
  // read by the map as its own icon, beside the invasion's
  const marks = readRaidMarksIn(() => toyboxMapMarks(before, held(e, eventOf('invasion'))), { x0: 0, y0: 0, w: 10, h: 10 });
  assert.deepEqual(marks.map((m) => m.icon), ['dragon', 'invasion']);
});

test('DRAGON MARK GOES WITH ITS EVENT: past its end (its dragon\'s leaving) or once its dragon fell here, no mark and no row, before the book says so (mutants: the end not read; the fall not read)', () => {
  const e = eventOf('dragon');
  const leaveAt = dragonTimes(dragonCalledOf(e)).leaveAt;
  assert.equal(e.ue, leaveAt, 'the event ends as its dragon leaves');
  assert.equal(toyboxMapMarks(leaveAt - 1, held(e)).length, 1);
  assert.equal(toyboxMapMarks(leaveAt, held(e)).length, 0, 'gone the moment it leaves');
  assert.equal(toyboxTimerRows(leaveAt, held(e)).length, 0);
  noteCalledFell(e.id);
  assert.equal(toyboxMapMarks(e.go + 1000, held(e)).length, 0, 'fallen: gone at once');
  assert.equal(toyboxTimerRows(e.go + 1000, held(e)).length, 0);
  assert.equal(toyboxMapMarks(e.go + 1000, held(eventOf('invasion'))).length, 1, 'an invasion is not a dragon\'s');
});

test('THE HELD MAP WITH A DRAGON ATTACK AND AN INVASION: it paints its sheet and both marks, each in its colour with its words, and the legend names both (mutants: the dragon painted as a raid; the legend left out)', () => {
  _resetForTests();
  globalThis.location = /** @type {any} */ ({ search: '?skin=enhanced' });
  globalThis.document = /** @type {any} */ (fakeDocument());
  try {
    const now = AT + 18_000;
    const events = held(eventOf('dragon'), { ...eventOf('invasion'), px: 8, py: 2 });
    const win = new HeldMapWindow({
      getPlayerPixel: () => ({ x: 5, y: 5 }), getClimateIndex: () => CLIMATES.Woodlands,
      woods: { heightMapBuffer: new Uint8Array(100).fill(10) }, mapSize: { width: 10, height: 10 },
      gold: () => 10000, goldPieces: () => 10000, hasHorse: false, hasCart: false, hasShip: false,
      diseaseCount: () => 0, poisonCount: () => 0, raids: () => toyboxMapMarks(now, events),
    });
    win.tick(0.3);
    assert.deepEqual(win._raids.map((m) => m.icon), ['dragon', 'invasion']);
    const legend = win._chrome.legend.children.map((c) => c.textContent).filter(Boolean);
    assert.ok(legend.includes('Dragon Attack') && legend.includes('Invasion'), legend.join(', '));
    win._layout();
    win._view = { ox: 0, oy: 0, scale: 20 };
    win._goal = { ...win._view };
    const ctx = recordingCtx();
    win._chrome.ink.getContext = () => ctx;
    win._dirty = true;
    assert.doesNotThrow(() => win._paint());
    const [x, y] = toPaper(win._view, 3.5, 7.5);
    const at = ctx.calls.findIndex((c) => c.fn === 'arc' && Math.abs(c.args[0] - x) < 1e-9 && Math.abs(c.args[1] - y) < 1e-9 && c.args[2] >= 11);
    const ring = at >= 0 && ctx.calls.slice(at).find((c) => c.fn === 'stroke')?.strokeStyle === DRAGON_MARK_CSS;
    assert.ok(ring, 'the orange ring about its city');
    assert.ok(ctx.calls.some((c) => c.fn === 'fillText' && c.args[0] === 'Dragon Attack in 0:42'), 'its words');
    assert.ok(ctx.calls.some((c) => c.fn === 'fillText' && c.args[0] === 'Invasion in 0:42'), 'and the invasion\'s');
    assert.ok(ctx.calls.some((c) => c.fn === 'fill' && c.fillStyle === INVASION_MARK_CSS), 'the invasion in its purple');
    assert.equal(ctx.calls.filter((c) => c.strokeStyle === RAID_MARK_CSS).length, 0, 'neither drawn as a raided town');
    win.dispose();
  } finally {
    delete globalThis.document;
  }
  // the painter on its own: ring, flame and words
  const ctx = recordingCtx();
  paintRaidMark(ctx, { ox: 0, oy: 0, scale: 10 }, { x: 5, y: 5, icon: 'dragon', text: 'Dragon Attack in 0:42' }, 0);
  assert.deepEqual(ctx.calls.find((c) => c.fn === 'arc').args.slice(0, 3), [50, 50, 11]);
  assert.ok(ctx.calls.some((c) => c.fn === 'fill' && c.fillStyle === DRAGON_MARK_CSS));
});

test('OFFLINE, THE EVENT ENDS WITH ITS DRAGON: the local runner ends a dragon attack the moment its dragon leaves, and at once when it falls (mutants: the end waited past the leaving; the fall not read)', () => {
  const clock = { now: AT };
  const said = [];
  const local = createLocalToyboxEvents({ deliver: (sev) => said.push(sev), now: () => clock.now, rand: () => 0.5 });
  const started = local.start({ kind: 'dragon', city: PLACE });
  assert.equal(started.ok, true);
  const e = started.event;
  const leaveAt = dragonTimes(dragonCalledOf(e)).leaveAt;
  clock.now = leaveAt - 1;
  local.tick();
  assert.equal(local.book().length, 1, 'the dragon still here');
  clock.now = leaveAt;
  local.tick();
  assert.equal(local.book().length, 0, 'it left: the event ended at once');
  assert.deepEqual(said.filter((w) => w.k === 'end').map((w) => [w.id, w.why]), [[e.id, 'time']]);
  // and a fall ends it as soon as it is heard
  clock.now = AT;
  const again = local.start({ kind: 'dragon', city: PLACE }).event;
  clock.now = again.go + 5000;
  noteCalledFell(again.id);
  local.tick();
  assert.equal(local.book().length, 0);
  assert.deepEqual(said.filter((w) => w.k === 'end').at(-1), { k: 'end', id: again.id, why: 'done' });
});
