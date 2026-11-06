// The name pass's own frame: the host's mask is walked in loops (one list, and a map only where a point is tinted),
// and the sight test is handed the frame's projection product, made once for every head, so it never makes its own.
// What the names say and where they stand is pinned by test/net/name1_bubbles.test.js and the PVP and WILD pins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RemotePlayers, PEER_HEIGHT } from '../../src/net/remotePlayers.js';
import { projectToScreen } from '../../src/player/tapRay.js';
import { perspective, mirrorProjectionX, lookAt, multiply } from '../../src/world/mat4.js';

const PROJ = mirrorProjectionX(perspective(Math.PI / 3, 16 / 9, 0.2, 6000));
const VIEW = lookAt([0, 1.7, 0], [0, 1.7, -10], [0, 1, 0]);
const EYE = [0, 1.7, 0];
const W = 1600, H = 900;
const toScene = (p) => [p.x, p.y, p.z];
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/** How many times `run` calls each of the array methods that make a list or walk one with a callback. */
function listCalls(run) {
  const names = ['map', 'filter', 'some'];
  const real = names.map((n) => Array.prototype[n]);
  const calls = { map: 0, filter: 0, some: 0 };
  names.forEach((n, i) => {
    Array.prototype[n] = function (...a) { calls[n]++; return real[i].apply(this, a); };
  });
  try { run(); } finally { names.forEach((n, i) => { Array.prototype[n] = real[i]; }); }
  return calls;
}

test('the name mask is walked in loops: no list method runs, a dropped point is dropped, and only a tinted point wears its tint', () => {
  const rp = new RemotePlayers({ renderer: {}, deps: null, compose: async () => null });
  const points = [
    { id: 'a', name: 'Ada', x: 1, y: 1 },
    { id: 'b', name: 'Bo', x: 2, y: 2 },
    { id: 'c', name: 'Cy', x: 3, y: 3 },
    { id: 'd', name: 'Di', x: 4, y: 4 },
  ];
  rp.namePoints = () => points.slice();
  const mask = (p) => {
    if (p.id === 'b') return null;   // taken
    if (p.id === 'c') return { ...p, name: 'Stranger', tint: [1, 0, 0, 1] };
    if (p.id === 'd') throw new Error('a mask that throws keeps the point');
    return p;
  };
  let drawn = null;
  const layer = { render: (args) => { drawn = args; return 0; } };
  const social = (id) => (id === 'a' ? [0, 1, 0, 1] : null);
  const calls = listCalls(() => rp.nameFrame({ proj: PROJ, view: VIEW, w: W, h: H, eye: EYE, layer, colorOf: social, mask }));
  assert.deepEqual(calls, { map: 0, filter: 0, some: 0 }, 'no list method runs');
  assert.deepEqual(drawn.points.map((p) => [p.id, p.name]), [['a', 'Ada'], ['c', 'Stranger'], ['d', 'Di']]);
  assert.deepEqual(drawn.colorOf('c'), [1, 0, 0, 1], 'the tint over the social picture');
  assert.deepEqual(drawn.colorOf('a'), [0, 1, 0, 1], 'an untinted point keeps the social colour');
  assert.equal(drawn.colorOf('d'), null);
  // no tint at all: the social picture's own colorOf, untouched
  rp.namePoints = () => [{ id: 'a', name: 'Ada', x: 1, y: 1 }];
  rp.nameFrame({ proj: PROJ, view: VIEW, w: W, h: H, eye: EYE, layer, colorOf: social, mask: (p) => p });
  assert.equal(drawn.colorOf, social);
  // a hidden player's tag is its skull and bar, or nothing
  rp.namePoints = () => [{ id: 'a', x: 1, y: 1, hid: true }, { id: 'b', x: 2, y: 2, hid: true, skull: 'red' }, { id: 'c', x: 3, y: 3 }];
  rp.nameFrame({ proj: PROJ, view: VIEW, w: W, h: H, eye: EYE, layer, colorOf: social, mask: (p) => p });
  assert.deepEqual(drawn.points.map((p) => p.id), ['b', 'c']);
});

test('the sight test is handed the frame\'s one projection product, and the host\'s own passes it on: the same answer, no product of its own', () => {
  const rp = new RemotePlayers({ renderer: {}, deps: null, compose: async () => null });
  rp._shown = [
    { peer: { id: 'a', name: 'Ada', shown: { x: 0, y: 0, z: -10 } }, height: PEER_HEIGHT },
    { peer: { id: 'b', name: 'Bo', shown: { x: 2, y: 0, z: -12 } }, height: PEER_HEIGHT },
  ];
  const asked = [];
  const points = rp.namePoints(PROJ, VIEW, W, H, EYE, toScene, null, (head, id, pv) => { asked.push({ id, pv }); return false; });
  assert.deepEqual(points.map((p) => p.id), ['a', 'b']);
  assert.equal(asked.length, 2);
  assert.ok(asked[0].pv && asked[0].pv === asked[1].pv, 'one product for every head');
  assert.deepEqual([...asked[0].pv], [...multiply(PROJ, VIEW)], 'the frame\'s proj x view');
  // world.js's sight test, mounted from its own source
  const W_SRC = strip(read('src/scenes/world.js'));
  const at = W_SRC.indexOf('const blocked = (head, id');
  assert.ok(at >= 0 && W_SRC.indexOf('const blocked = (head, id', at + 1) < 0, 'world.js has one name sight test');
  const end = W_SRC.indexOf(';', at);
  const projected = [];
  const scope = {
    glassCuts: (s) => s.front && s.depth < 3, nameSight: { blocked: () => false }, player: { collider: null }, eye: EYE,
    proj: PROJ, view: VIEW, projectToScreen: (...a) => { projected.push(a); return projectToScreen(...a); },
  };
  const k = Object.keys(scope);
  const blocked = new Function(...k, `'use strict';\n${W_SRC.slice(at, end + 1)}\nreturn blocked;`)(...k.map((x) => scope[x]));
  const pv = multiply(PROJ, VIEW);
  const near = [0, 1.7, -2], far = [0, 1.7, -10];
  assert.equal(blocked(near, 'a', pv), true, 'a head nearer than the glass\'s cut is cut');
  assert.equal(blocked(far, 'a', pv), false);
  assert.equal(projected[0][7], pv, 'the product handed in is the one projected with');
  assert.deepEqual(projected[0].slice(5, 7), [null, false], 'at the projection\'s own defaults');
  assert.equal(blocked(near, 'a'), true, 'a caller with no product: the same answer');
  assert.equal(blocked(far, 'a'), false);
});
