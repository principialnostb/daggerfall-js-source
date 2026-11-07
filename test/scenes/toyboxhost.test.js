// The toybox's host module: who opens it, the powers read back after a press, the popups' actions, offline greying.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDom } from '../ui/toyboxDom.mjs';
import { createToyboxHost } from '../../src/scenes/toyboxHost.js';
import { parseToyboxCommand } from '../../src/systems/toybox/toyboxLaw.js';


function rig(over = {}) {
  const dom = fakeDom();
  const state = { invincible: false, noclip: false, ghost: false };
  const log = [];
  let glyphs = ['dev'];
  let online = true;
  const deps = {
    document: dom.doc,
    win: dom.win,
    glyphs: () => glyphs,
    online: () => online,
    powers: {
      get: () => ({ ...state }),
      set: (id, on) => {
        log.push(['set', id, on]);
        state[id] = on;
        return true;
      },
    },
    openTeleport: () => log.push(['teleport']),
    teleportToPlayer: (name, say) => {
      log.push(['to', name]);
      say(`To ${name}.`);
    },
    summon: (name, say) => {
      log.push(['summon', name]);
      say(`Summoning ${name}.`);
    },
    players: () => ['Bran', 'Cat'],
    cities: () => ['Daggerfall', 'Mournhold'],
    openForge: () => log.push(['forge']),
    startEvent: async (spec) => {
      log.push(['event', spec]);
      return { ok: true };
    },
    freeCursor: () => log.push(['cursor']),
    ...over,
  };
  const host = createToyboxHost(deps);
  const win = () => dom.byAttr('data-toybox');
  const btn = (id) => dom.byAttr('data-toybox-option', id);
  const popup = (tag) => dom.byAttr('data-toybox-popup', tag);
  const setGlyphs = (g) => {
    glyphs = g;
  };
  const setOnline = (o) => {
    online = o;
  };
  return { dom, host, state, log, win, btn, popup, setGlyphs, setOnline };
}
const tick = () => new Promise((r) => setImmediate(r));

test("/toybox opens for a developer; anyone else's is an unknown command, said nothing", () => {
  const r = rig();
  const said = [];
  const say = (l) => said.push(l);
  assert.equal(r.host.command(parseToyboxCommand('/toybox'), say), true);
  assert.equal(r.host.isOpen(), true);
  assert.deepEqual(r.log, [['cursor']], 'the cursor is freed for the window');
  assert.deepEqual(said, []);
  r.host.close();
  r.setGlyphs(['admin', 'mod']);
  assert.equal(r.host.command(parseToyboxCommand('/toybox'), say), false);
  assert.equal(r.host.isOpen(), false);
  assert.equal(r.host.open(), false);
  assert.equal(r.host.command(parseToyboxCommand('/toybox now'), say), false);
  assert.deepEqual(said, []);
  r.setGlyphs(['dev']);
  assert.equal(r.host.command(parseToyboxCommand('/toybox now'), say), true);
  assert.deepEqual(said, ['/toybox takes nothing after it.']);
  assert.equal(r.host.command(null, say), false);
});

test('a toggle sets the power and lights from what took', async () => {
  const r = rig();
  r.host.open();
  r.dom.fire(r.btn('invincible'), 'click');
  await tick();
  assert.deepEqual(r.log.at(-1), ['set', 'invincible', true]);
  assert.equal(r.btn('invincible').attrs['aria-pressed'], 'true');
  r.dom.fire(r.btn('invincible'), 'click');
  await tick();
  assert.deepEqual(r.log.at(-1), ['set', 'invincible', false]);
  assert.equal(r.btn('invincible').attrs['aria-pressed'], 'false');
});

test('a power that does not take stays unlit and says so', async () => {
  const r = rig({ powers: { get: () => ({ invincible: false, noclip: false, ghost: false }), set: async () => false } });
  r.host.open();
  r.dom.fire(r.btn('ghost'), 'click');
  await tick();
  assert.equal(r.btn('ghost').attrs['aria-pressed'], 'false');
  assert.match(r.win().textContent, /Ghost could not be turned on\./);
});

test('refresh repaints from the powers and the connection; offline greys Summon and closes its popup', () => {
  const r = rig();
  r.host.open();
  r.dom.fire(r.btn('summon'), 'click');
  assert.equal(r.popup('summon').style.display, 'block');
  r.state.noclip = true;
  r.setOnline(false);
  r.host.refresh();
  assert.equal(r.btn('noclip').attrs['aria-pressed'], 'true');
  assert.equal(r.btn('summon').disabled, true);
  assert.equal(r.popup('summon').style.display, 'none');
  r.dom.fire(r.btn('summon'), 'click');
  assert.equal(r.popup('summon').style.display, 'none', 'a greyed option opens nothing');
  r.dom.fire(r.btn('invasion'), 'click');
  assert.equal(r.popup('invasion').style.display, 'block', 'events still stage offline, as a test harness');
});

test('the window closes when the dev glyph goes', () => {
  const r = rig();
  r.host.open();
  r.setGlyphs([]);
  r.host.refresh();
  assert.equal(r.host.isOpen(), false);
});

test('Teleport opens its popup: Open Map closes the window and opens the map, To Player goes to the one picked; Create Item opens the forge', () => {
  const r = rig();
  r.host.open();
  r.dom.fire(r.btn('item'), 'click');
  assert.deepEqual(r.log.at(-1), ['forge']);
  assert.equal(r.host.isOpen(), true);
  r.dom.fire(r.btn('teleport'), 'click');
  assert.equal(r.popup('teleport').style.display, 'block', 'the popup, not the map at once');
  assert.equal(r.host.isOpen(), true);
  const input = r.dom.find((n) => n.tagName === 'INPUT', r.popup('teleport'));
  r.dom.type(input, 'bran');
  r.dom.fire(r.dom.byAttr('data-toybox-go', undefined, r.popup('teleport')), 'click');
  assert.deepEqual(r.log.at(-1), ['to', 'Bran']);
  r.dom.fire(r.dom.byAttr('data-toybox-map', undefined, r.popup('teleport')), 'click');
  assert.deepEqual(r.log.at(-1), ['teleport']);
  assert.equal(r.host.isOpen(), false, 'the toybox steps aside for the map');
});

test('Teleport offline: Open Map still works, To Player is greyed - no one else is there', () => {
  const r = rig();
  r.setOnline(false);
  r.host.open();
  r.dom.fire(r.btn('teleport'), 'click');
  const go = r.dom.byAttr('data-toybox-go', undefined, r.popup('teleport'));
  r.dom.fire(go, 'click');
  assert.equal(r.log.some((e) => e[0] === 'to'), false);
  r.dom.fire(r.dom.byAttr('data-toybox-map', undefined, r.popup('teleport')), 'click');
  assert.deepEqual(r.log.at(-1), ['teleport']);
});

test('the popups act through the deps: summon, invasion, dragon; one popup at a time', async () => {
  const r = rig();
  r.host.open();
  const inputOf = (tag) => r.dom.find((n) => n.tagName === 'INPUT', r.popup(tag));
  const goOf = (tag) => r.dom.byAttr('data-toybox-go', undefined, r.popup(tag));
  r.dom.fire(r.btn('summon'), 'click');
  r.dom.type(inputOf('summon'), 'cat');
  r.dom.fire(goOf('summon'), 'click');
  assert.deepEqual(r.log.at(-1), ['summon', 'Cat']);
  assert.match(r.popup('summon').textContent, /Summoning Cat\./);
  r.dom.fire(r.btn('invasion'), 'click');
  assert.equal(r.popup('summon').style.display, 'none');
  r.dom.type(inputOf('invasion'), 'Mournhold');
  r.dom.byAttr('data-toybox-family', undefined, r.popup('invasion')).value = 'undead';
  r.dom.fire(goOf('invasion'), 'click');
  await tick();
  assert.deepEqual(r.log.at(-1), ['event', { kind: 'invasion', city: 'Mournhold', family: 'undead' }]);
  r.dom.fire(r.btn('dragon'), 'click');
  r.dom.type(inputOf('dragon'), 'daggerfall');
  r.dom.fire(goOf('dragon'), 'click');
  await tick();
  assert.deepEqual(r.log.at(-1), ['event', { kind: 'dragon', city: 'Daggerfall' }]);
});

test('Escape closes the top popup first, then the window, and the window listener goes with it', () => {
  const r = rig();
  r.host.open();
  r.dom.fire(r.btn('dragon'), 'click');
  const e = r.dom.fire(r.dom.doc.body, 'keydown', { key: 'Escape' });
  assert.notEqual(e.reachedWindow, true, 'the game never hears it');
  assert.equal(r.popup('dragon').style.display, 'none');
  assert.equal(r.host.isOpen(), true);
  r.dom.fire(r.dom.doc.body, 'keydown', { key: 'Escape' });
  assert.equal(r.host.isOpen(), false);
  assert.equal(r.dom.win.on.length, 0);
  r.host.open();
  r.dom.fire(r.dom.byAttr('data-toybox-close', undefined, r.win()), 'click');
  assert.equal(r.host.isOpen(), false);
  assert.equal(r.dom.win.on.length, 0, 'closed by its X, the listener goes too');
});
