// The toybox in the world: who the chat line opens it for, the offline key, and the powers that go with the glyph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDom } from '../ui/toyboxDom.mjs';
import { createToyboxWorld, TOYBOX_OFFLINE_KEY } from '../../src/scenes/toyboxWorld.js';
import { setStaffPowers, staffPowers } from '../../src/characters/playerEntity.js';
import { ghostOn, setGhost } from '../../src/systems/toybox/toyboxGhost.js';

function world({ glyphs = ['dev'], online = { id: 'me' }, localDev = false, fetch = undefined, storage = null, holds = null } = {}) {
  const { doc } = fakeDom();
  const docKeys = [];
  doc.defaultView = { addEventListener: (type, f) => docKeys.push({ type, f }), removeEventListener: () => {} };
  let g = glyphs;
  const w = createToyboxWorld({
    document: doc,
    glyphs: () => g,
    online: () => online,
    storage: () => storage,
    localDev,
    holdCursor: () => { if (holds) holds.taken++; return () => { if (holds) holds.released++; return true; }; },
    ...(fetch ? { fetch } : {}),
    worldLink: () => null,
    summon: () => {},
    openTeleport: () => {},
    addToPack: () => {},
    postBox: () => null,
    deliver: () => {},
    playerName: () => 'Tester',
    audio: () => null,
    relayNowMs: () => 0,
  });
  const press = (code) => {
    const e = { code, defaultPrevented: false, preventDefault() { e.defaultPrevented = true; } };
    for (const l of docKeys) if (l.type === 'keydown') l.f(e);
    return e;
  };
  return { w, doc, press, setGlyphs: (v) => { g = v; } };
}

test('TOYBOX in the world: a developer\'s /toybox opens the window; anyone else\'s is the chat\'s own unknown line', () => {
  const dev = world();
  assert.equal(dev.w.chat('/toybox', () => {}), true);
  assert.equal(dev.w.host.isOpen(), true);
  const player = world({ glyphs: ['laurel'] });
  assert.equal(player.w.chat('/toybox', () => {}), false);
  assert.equal(player.w.host.isOpen(), false);
  const mod = world({ glyphs: ['mod'] });
  assert.equal(mod.w.chat('/toybox', () => {}), true, 'a moderator online');
  assert.equal(mod.w.host.isOpen(), true);
  const modOffline = world({ glyphs: ['mod'], online: null, localDev: false });
  assert.equal(modOffline.w.chat('/toybox', () => {}), false, 'offline, a shipped page has none');
  assert.equal(dev.w.chat('/tp Daggerfall', () => {}), false, 'other lines are not the toybox\'s');
});

test('TOYBOX in the world: offline, the / key opens the command bar for a developer alone', () => {
  const dev = world({ online: null, localDev: true });
  assert.equal(TOYBOX_OFFLINE_KEY, 'Slash');
  assert.equal(dev.press('Slash').defaultPrevented, true);
  const player = world({ glyphs: ['dev'], online: null, localDev: false });
  assert.equal(player.press('Slash').defaultPrevented, false, 'a shipped page offline: no toybox');
  const online = world({ online: { id: 'x' } });
  assert.equal(online.press('Slash').defaultPrevented, false, 'online the chat takes the line');
});

test('TOYBOX in the world: the powers go with the developer glyph', () => {
  const t = world();
  setStaffPowers({ noclip: true });
  setGhost(true);
  t.w.frame();
  assert.equal(staffPowers().noclip, true, 'a developer keeps them');
  t.setGlyphs([]);
  t.w.frame();
  assert.equal(staffPowers().noclip, false);
  assert.equal(ghostOn(), false);
});

test('TOYBOX in the world: offline it asks no server anything - a local build opens it, a production page does not', async () => {
  let calls = 0;
  const fetch = () => { calls++; return Promise.reject(new Error('no network offline')); };
  const signedIn = { getItem: () => JSON.stringify({ secret: 's', id: 'a' }), setItem: () => {}, removeItem: () => {} };
  const local = world({ glyphs: [], online: null, localDev: true, fetch, storage: signedIn });
  assert.equal(local.press('Slash').defaultPrevented, true, 'a local build is the developer\'s own machine');
  assert.equal(local.w.chat('/toybox', () => {}), true);
  for (let i = 0; i < 5; i++) local.w.frame();
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 0, 'offline the toybox sends nothing');
  const shipped = world({ glyphs: [], online: null, localDev: false, fetch, storage: signedIn });
  assert.equal(shipped.press('Slash').defaultPrevented, false);
  assert.equal(shipped.w.chat('/toybox', () => {}), false);
  shipped.w.frame();
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 0);
});

test('TOYBOX in the world: the window stays open until its X - the mouse held free through the game door, let go when it closes', () => {
  const holds = { taken: 0, released: 0 };
  const t = world({ holds });
  assert.equal(t.w.chat('/toybox', () => {}), true);
  assert.equal(holds.taken, 1, 'the mouse is freed by a hold, never by dropping the lock (which reads as Escape)');
  for (let i = 0; i < 10; i++) t.w.frame();
  assert.equal(t.w.host.isOpen(), true, 'it stays open frame after frame');
  assert.equal(holds.released, 0);
  const find = (n, attr) => { if (n?.attrs?.[attr] !== undefined) return n; for (const c of n?.children ?? []) { const hit = find(c, attr); if (hit) return hit; } return null; };
  const x = find(find(t.doc.body, 'data-toybox'), 'data-toybox-close');   // the toybox window's own X, not the forge's
  assert.ok(x, 'the window has its X');
  for (const f of x.on.click ?? []) f({ preventDefault() {}, stopPropagation() {} });
  assert.equal(t.w.host.isOpen(), false, 'the X closes it');
  t.w.frame();
  assert.equal(holds.released, 1, 'and the mouse is let go');
});

test('TOYBOX in the world: a shipped page that lost its connection has no toybox, whatever glyphs it was told online', () => {
  const shipped = world({ glyphs: ['dev'], online: null, localDev: false });
  assert.equal(shipped.w.chat('/toybox', () => {}), false);
  assert.equal(shipped.press('Slash').defaultPrevented, false);
});
