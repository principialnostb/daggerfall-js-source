// The toybox's banner (src/ui/lootBanner.js announceToyboxItem): the usual found-piece banner with a rainbow edge that
// runs, the delve puzzle's won jingle, on either skin, and no second banner from the pack's own watcher.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _resetForTests, setPref } from '../../src/systems/uiPrefs.js';
import * as B from '../../src/ui/lootBanner.js';
import { SOUND } from '../../src/systems/soundClips.js';
import { DELVE_SOUNDS } from '../../src/scenes/delve/delveLitany.js';
import { buildToyboxItem } from '../../src/systems/toybox/toyboxItem.js';

function fakeEl(tag, doc) {
  const classes = new Set();
  const n = {
    tag, doc, children: [], dataset: {}, attrs: {}, parent: null, hidden: false,
    style: { _p: {}, setProperty(k, v) { this._p[k] = v; }, getPropertyValue(k) { return this._p[k] ?? ''; } },
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, v = !classes.has(c)) => { if (v) classes.add(c); else classes.delete(c); return v; }, contains: (c) => classes.has(c),
    },
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((x) => classes.add(x)); },
    _text: '',
    get textContent() { return n._text + n.children.map((c) => c.textContent ?? '').join(''); },
    set textContent(v) { n.children.length = 0; n._text = v == null ? '' : String(v); },
    get firstChild() { return n.children[0] ?? null; },
    get isConnected() { let x = n; while (x.parent) x = x.parent; return x === doc.body || x === doc.head; },
    append(...cs) { for (const c of cs) { c.parent = n; n.children.push(c); } },
    replaceChildren(...cs) { n.children.length = 0; n.append(...cs); },
    insertBefore(c, ref) { c.parent = n; const i = ref ? n.children.indexOf(ref) : -1; if (i < 0) n.children.push(c); else n.children.splice(i, 0, c); return c; },
    remove() { if (n.parent) { n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = null; } },
    setAttribute(k, v) { n.attrs[k] = v; }, getAttribute: (k) => n.attrs[k] ?? null,
  };
  return n;
}
function fakeDocument() {
  const doc = {};
  doc.createElement = (t) => fakeEl(t, doc);
  doc.body = fakeEl('body', doc);
  doc.head = fakeEl('head', doc);
  const all = () => { const out = []; const walk = (x) => { for (const c of x.children) { out.push(c); walk(c); } }; walk(doc.head); walk(doc.body); return out; };
  doc.getElementById = (id) => all().find((e) => e.id === id) ?? null;
  doc.querySelectorAll = () => [];
  doc.querySelector = () => null;
  return doc;
}
const byClass = (root, cls) => { const out = []; const walk = (x) => { for (const c of x.children ?? []) { if (c.classList?.contains(cls)) out.push(c); walk(c); } }; walk(root); return out; };
function withPage(fn, skin) {
  const doc = fakeDocument();
  globalThis.document = doc;
  globalThis.location = { search: `?skin=${skin}` };
  const sounds = [];
  B._resetLootBannersForTests();
  B._setLootBannerForTests({ icon: () => ({ src: 'data:x', w: 20, h: 20, smooth: false }), play: (c) => sounds.push(c), schedule: () => 1, cancel: () => {} });
  try { return fn(doc, sounds); } finally {
    B._resetLootBannersForTests();
    B._setLootBannerForTests({ icon: null, play: null });
    delete globalThis.document; delete globalThis.location;
  }
}
const hero = () => ({ isPlayer: true, chargenDone: true, items: [], wagonItems: [], bagItems: [] });

test('the entry: a common piece stands as a Rare, its own banner each grant, with the rainbow mark', () => {
  const { item } = buildToyboxItem({ template: 120, material: 7, name: 'Toy Blade' });
  const a = B.toyboxEntry(item), b = B.toyboxEntry(item);
  assert.deepEqual([a.tier, a.rainbow, a.kicker, a.count], ['rare', true, 'Created', 1]);
  assert.equal(a.name, 'Ebony Toy Blade', 'named as the pack names it');
  assert.notEqual(a.key, b.key, 'two grants are two banners');
  assert.equal(B.toyboxEntry(null), null);
});

test('the rainbow edge runs, and stands still for a reader who asks for less motion', () => {
  assert.match(B.LOOT_BANNER_CSS, /\.lootbanner\.lb-rainbow \{[^}]*border-box;[^}]*animation: lb-rainbow /);
  assert.match(B.LOOT_BANNER_CSS, /@keyframes lb-rainbow/);
  assert.match(B.LOOT_BANNER_CSS, /prefers-reduced-motion[^@]*\.lootbanner\.lb-rainbow/);
});

for (const skin of ['enhanced', 'classic'])
  test(`announced on the ${skin} skin it stands with the jingle, though the pack holds it, and the watcher raises no second`, () =>
    withPage((doc, sounds) => {
      _resetForTests();
      setPref('lootRarity', true);
      setPref('soundEnhancements', false);
      const me = hero();
      B.drawLootBanners({ entity: me, dt: 0.016 });
      const { item } = buildToyboxItem({ template: 135 });
      me.items.push(item);
      assert.equal(B.announceToyboxItem(item), true);
      B.drawLootBanners({ entity: me, dt: 0.016 });
      const banners = byClass(doc.body, 'lootbanner');
      assert.equal(banners.length, 1, 'one banner');
      assert.ok(banners[0].classList.contains('lb-rainbow'));
      assert.deepEqual(sounds, [SOUND.ArenaFanfareLevelUp], 'the jingle, whatever the sounds switch says');
      assert.equal(SOUND.ArenaFanfareLevelUp, DELVE_SOUNDS.won.rec, 'the delve puzzle\'s won sound');
      B.drawLootBanners({ entity: me, dt: 0.016 });
      assert.equal(byClass(doc.body, 'lootbanner').length, 1, 'no second from the watcher');
    }, skin));

test('a piece sent to another account stands though nobody here holds it', () =>
  withPage((doc) => {
    const me = hero();
    B.drawLootBanners({ entity: me, dt: 0.016 });
    assert.equal(B.announceToyboxItem(buildToyboxItem({ template: 102, material: 0 }).item), true);
    B.drawLootBanners({ entity: me, dt: 0.016 });
    assert.equal(byClass(doc.body, 'lb-rainbow').length, 1);
  }, 'enhanced'));
