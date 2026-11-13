// The world frame's kept scratch, run as the host runs it. Each test lifts the host's own statements out of world.js
// and runs them over stand-ins, so what it measures is the frame's code and not a copy of it: the walk's pixel list,
// the player's light, a person's record key, the street's two pools as one list, the still-tracker's last position
// and the canvas's size. A list or a colour made new each frame, or a list emptied with `length = 0`, is garbage the
// frame after; each must answer as it did and make none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'acorn';
import { ALLOC_CHILD_ARGS } from '../allocChild.mjs';
import { recordFrameKey } from '../../src/scenes/townScratch.js';
import { pixelsInto, bothInto, scaledInto, copiedInto } from '../../src/scenes/frameKept.js';

const WORLD = readFileSync(new URL('../../src/scenes/world.js', import.meta.url), 'utf8');
const AST = parse(WORLD, { ecmaVersion: 'latest', sourceType: 'module' });
const text = (node) => WORLD.slice(node.start, node.end);

/** Every node under `node`, depth first. */
function* nodes(node) {
  if (!node || typeof node.type !== 'string') return;
  yield node;
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) for (const child of value) yield* nodes(child);
    else if (value && typeof value.type === 'string') yield* nodes(value);
  }
}
const ALL = [...nodes(AST)];
const FRAME = ALL.filter((n) => n.type === 'FunctionDeclaration' && n.id?.name === 'frame').sort((a, b) => b.end - b.start - (a.end - a.start))[0];
const IN_FRAME = [...nodes(FRAME)];
const BODY = FRAME.body.body;
const one = (list, what) => {
  assert.equal(list.length, 1, `the frame has one ${what}`);
  return list[0];
};
const statement = (starts) => one(BODY.filter((s) => text(s).startsWith(starts)), `statement starting ${starts}`);
const argumentOf = (name) => text(one(IN_FRAME.filter((n) => n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === name), `call of ${name}`).arguments[0]);

/** The street's passes drawn after the names, each handed the frame's size. */
const STREET_PASSES = ['navalTags', 'navalCrewBars', 'navalCrewLines', 'wildMarksFrame'];
/** The host's lines, as world.js holds them. */
const SRC = {
  byDist2: text(one(AST.body.filter((s) => s.type === 'VariableDeclaration' && s.declarations[0].id.name === 'byDist2'), 'comparator').declarations[0].init),
  fill: BODY.slice(BODY.indexOf(statement('standingHorses.begin(')) + 1, BODY.indexOf(statement('_pixelOrder.sort(byDist2);'))).map(text).join('\n'),
  light: text(one(BODY.filter((s) => s.type === 'BlockStatement' && text(s).includes('renderer.setIndirectLight(cam.pos')), 'light block')),
  rkey: text(one(IN_FRAME.filter((n) => n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id.name === 'rkey')), 'record key')),
  doorways: argumentOf('clearDoorways'),
  reach: argumentOf('markFoeReach'),
  lastPos: text(one(BODY.filter((s) => s.type === 'ExpressionStatement' && s.expression.type === 'AssignmentExpression' && s.expression.left.name === '_lastPlayerPos'), 'still-tracker write')),
  size: [
    statement('const dt = '),
    statement('if (_tapArmed > 0 && --_tapArmed === 0) {'),
    statement('const worldAspect = '),
    statement('travelView?.drawHud('),
    one(BODY.filter((s) => s.type === 'IfStatement' && text(s).startsWith('if (touch) {') && text(s).includes('_lockChest')), 'lock dot'),
    statement('renderer.setWorldViewport('),
    one(IN_FRAME.filter((n) => n.type === 'ExpressionStatement' && text(n).startsWith('drawPeerNames(')), 'name pass'),
    ...STREET_PASSES.map((name) => one(IN_FRAME.filter((n) => n.type === 'ExpressionStatement' && text(n).startsWith(`${name}(`)), `call of ${name}`)),
  ].map(text).join('\n'),
};
/** Each as a function of what it reads. Names a version does not read are handed in unread. */
const PARAMS = {
  fill: ['_pixelOrder', 'built', 'state', 'pixelsInto'],
  light: ['renderer', 'cam', 'INDIRECT_LIGHT_RANGE', 'INDIRECT_LIGHT_COLOR', '_dwFogP', 'indirectLightScale', 'minute', 'wxNow', '_indirectRgb', 'scaledInto'],
  rkey: ['out', 'recordFrameKey'],
  doorways: ['cityGuards', 'exteriorFoes', '_foesBoth', 'bothInto'],
  reach: ['cityGuards', 'exteriorFoes', '_foesBoth', 'bothInto'],
  lastPos: ['cam', 'copiedInto'],
  size: ['canvas', 'now', 'last', '_tapArmed', '_tapPoint', '_tapDir', '_tapLockOnly', '_lastProj', '_lastView', 'cam', 'rayDirFromScreen', 'largeHudWorldAspect', 'travelView', 'touch', '_lockChest', 'projectToScreen', 'proj', 'view', 'worldViewportRect', 'renderer', 'drawPeerNames', 'mwv', ...STREET_PASSES],
};
const BODIES = {
  fill: SRC.fill,
  light: SRC.light,
  rkey: `${SRC.rkey}\nreturn rkey;`,
  doorways: `return (${SRC.doorways});`,
  reach: `return (${SRC.reach});`,
  lastPos: `let _lastPlayerPos = null;\nreturn () => {\n${SRC.lastPos}\nreturn _lastPlayerPos;\n};`,
  size: SRC.size,
};
const make = (name) => new Function(...PARAMS[name], `"use strict";\n${BODIES[name]}`);
const byDist2 = new Function(`return ${SRC.byDist2};`)();

/** A town's worth of built pixels around (cx, cy), in a stream's order rather than by distance. */
function pixelMap(count, cx, cy, seed = 7) {
  const built = new Map();
  for (let i = 0; i < count; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const px = cx + (seed % 13) - 6, py = cy + ((seed >> 8) % 13) - 6;
    built.set(`${px},${py}#${i}`, { px, py, name: i });
  }
  return built;
}

test('the walk\'s pixel list: every built pixel with its distance, nearest first after the sort and in the map\'s order between equals - as a new list each frame lists them, at every size, the list kept (mutant: a stale tail left past the count)', () => {
  const fill = make('fill');
  const kept = [];
  for (const [count, cx, cy] of [[120, 1000, 600], [120, 1001, 600], [40, 1001, 601], [200, 3, 2999], [0, 0, 0], [75, 900, 400], [121, 900, 401]]) {
    const built = pixelMap(count, cx, cy, count + cx);
    fill(kept, built, { current: { x: cx, y: cy } }, pixelsInto);
    kept.sort(byDist2);
    const fresh = [];
    for (const p of built.values()) fresh.push({ p, d: (p.px - cx) ** 2 + (p.py - cy) ** 2 });
    fresh.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    assert.equal(kept.length, built.size, `${count} pixels: the list is as long as the map`);
    assert.deepEqual(kept.map((p) => p.name), fresh.map((f) => f.p.name), `${count} pixels around ${cx},${cy}: the order a new list sorts to`);
    assert.deepEqual(kept.map((p) => p._dist2), fresh.map((f) => f.d), 'each with its grid distance squared');
  }
});

test('the player\'s light: one kept colour, refilled each frame to the bits a new one held (mutant: a new array a frame)', () => {
  const light = make('light');
  const COLOR = [0.9019608, 0.8, 0.6509804];
  const handed = [];
  const renderer = { setIndirectLight: (pos, range, color) => handed.push({ pos, range, color: color, bits: [...color] }) };
  const kept = new Float32Array(3);
  const frames = [[0.73, 0.5, false], [0.31, 1, false], [0.99, 0.25, true], [0.5, 0.75, false]];
  for (const [scale, sun, under] of frames) light(renderer, { pos: [1, 2, 3] }, 20, COLOR, { under }, () => scale, 600, { sun }, kept, scaledInto);
  frames.forEach(([scale, sun, under], i) => {
    const k = under ? 0 : scale * sun;
    assert.deepEqual(handed[i].bits, [...new Float32Array([COLOR[0] * k, COLOR[1] * k, COLOR[2] * k])], `frame ${i}: the colour a new Float32Array held`);
    assert.equal(handed[i].range, 20);
  });
  assert.ok(handed.every((h) => h.color === handed[0].color), 'the one colour, refilled: the renderer reads it until the next frame writes it');
});

test('a person\'s record key: the template\'s string for every pair, odd ones included, and the same string again for the same pair (mutants: the frame dropped from the pack; a pair outside the pack packed)', () => {
  const rkey = make('rkey');
  for (const record of [0, 1, 5, 17, 210, 4095]) for (const frame of [0, 1, 2, 7, 1023]) {
    assert.equal(rkey({ record, frame }, recordFrameKey), `${record}#${frame}`);
    assert.equal(recordFrameKey(record, frame), `${record}#${frame}`);
  }
  for (const [record, frame] of [[4096, 0], [0, 1024], [-1, 0], [1.5, 2], ['5', 0], ['05', 0], [undefined, 0], [null, null], [NaN, 1], [-0, 0], [3, -0]])
    assert.equal(recordFrameKey(record, frame), `${record}#${frame}`, `${String(record)}, ${String(frame)}`);
  assert.equal(recordFrameKey(5, 0), '5#0', 'a number pair is not taken for the string beside it');
});

test('the street\'s two pools as one list: what the spread listed, in one kept list whose length follows the pools as they grow and shrink (mutant: the list let go of nothing past its count)', () => {
  const doorwaysList = make('doorways'), reachList = make('reach');
  const kept = [];
  let first = null;
  for (const [g, f] of [[3, 5], [0, 7], [9, 0], [0, 0], [2, 2], [12, 30]]) {
    const cityGuards = { guards: Array.from({ length: g }, (_, i) => ({ id: `g${i}` })) };
    const exteriorFoes = { foes: Array.from({ length: f }, (_, i) => ({ id: `f${i}` })) };
    const doorways = doorwaysList(cityGuards, exteriorFoes, kept, bothInto), reach = reachList(cityGuards, exteriorFoes, kept, bothInto);
    for (const list of [doorways, reach]) assert.deepEqual(list, [...cityGuards.guards, ...exteriorFoes.foes], `${g} guards and ${f} foes`);
    first ??= doorways;
    assert.ok(doorways === first && reach === first, 'the one list, refilled before each call that reads it');
  }
});

test('the still-tracker\'s last position: the camera\'s, kept in one array refilled each frame (mutant: a new array a frame)', () => {
  const cam = { pos: [0, 0, 0] };
  const frame = make('lastPos')(cam, copiedInto);
  const seen = [];
  for (const pos of [[1.5, 2, -3.25], [1.5000001, 2, -3.25], [100, -4, 0.125]]) {
    cam.pos = [...pos];
    const last = frame();
    assert.deepEqual([...last], pos);
    assert.notEqual(last, cam.pos, 'a copy, not the camera\'s own array');
    seen.push(last);
  }
  assert.ok(seen.every((s) => s === seen[0]), 'one array, refilled');
});

test('the canvas\'s size is read once a frame, at its start: the tap\'s ray, the lens, the travel readout, the lock dot, the world rect, the renderer, the name pass and the four passes after it all take that read, and a frame after a resize takes the new size (mutant: a read left at a use, or a pass handed no size)', () => {
  const size = make('size');
  const reads = { w: 0, h: 0 };
  const box = { w: 1280, h: 720 };
  const canvas = { get clientWidth() { reads.w++; return box.w; }, get clientHeight() { reads.h++; return box.h; } };
  const seen = [];
  const rect = (w, h) => ({ x: 0, y: 0, w: 1, h: h > 0 ? 1 - 92 / h : 1, of: [w, h] });
  const renderer = { setWorldViewport: (r, w = -1, h = -1) => seen.push({ rect: r.of, handed: [w, h] }) };
  const touch = { setLockDot: () => {} };
  let dot = null, tap = null, readout = null, names = null;
  const project = (p, w, h, proj, view, r) => { dot = [w, h, ...r.of]; return { front: true, x: 1, y: 2 }; };
  const ray = (x, y, w, h, proj, view, eye, r) => { tap = [w, h, ...r.of]; return [0, 0, 1]; };
  const travelView = { drawHud: (...handed) => { readout = handed; } };
  const drawPeerNames = (proj, view, eye, ...handed) => { names = handed; };
  let street = {};
  const passes = {
    navalTags: (proj, view, eye, ...handed) => { street.navalTags = handed; },
    navalCrewBars: (proj, view, eye, ...handed) => { street.navalCrewBars = handed; },
    navalCrewLines: (proj, view, eye, dt, ...handed) => { street.navalCrewLines = handed; },
    wildMarksFrame: (proj, view, eye, ...handed) => { street.wildMarksFrame = handed; },
  };
  for (const [w, h] of [[1280, 720], [1280, 720], [800, 1200]]) {
    box.w = w; box.h = h; reads.w = 0; reads.h = 0;
    let lens = null;
    tap = readout = names = null;
    street = {};
    size(canvas, 1000, 984, 1, [5, 6], null, false, {}, {}, { pos: [0, 0, 0] }, ray, (lensW, lensH) => { lens = [lensW, lensH]; return lensW / lensH; }, travelView, touch, [0, 1, 0], project, null, null, rect, renderer, drawPeerNames, { eye: [0, 0, 0] }, ...STREET_PASSES.map((name) => passes[name]));
    assert.deepEqual(reads, { w: 1, h: 1 }, `${w} x ${h}: one read of each a frame, a tap's frame too`);
    assert.deepEqual(tap, [w, h, w, h], 'the tap\'s ray and its rect take the frame\'s size');
    assert.deepEqual(lens, [w, h], 'the lens takes the frame\'s size');
    assert.deepEqual(readout, [w, h], 'the travel readout is handed it');
    assert.deepEqual(dot, [w, h, w, h], 'the lock dot and its rect too');
    assert.deepEqual(seen.at(-1), { rect: [w, h], handed: [w, h] }, 'the world rect is the frame\'s, and the renderer is handed the size it was made from');
    assert.deepEqual(names, [w, h], 'and the name pass is handed it');
    assert.deepEqual(street, Object.fromEntries(STREET_PASSES.map((name) => [name, [w, h]])), 'and so are the four passes drawn after it');
  }
});

test('the four passes after the names - the ships\' tags, the crew\'s bars and lines, the wild marks - lay their points out in a size they are handed and read no layout, and one handed none reads it once (mutant: a pass that reads the layout whatever it is handed)', () => {
  const reads = { w: 0, h: 0 };
  const canvas = { get clientWidth() { reads.w++; return 1280; }, get clientHeight() { reads.h++; return 720; } };
  const sizes = new Set();   // each size a pass laid its points out in: its rect's, each projection's, its helpers'
  const laid = (w, h) => { sizes.add(`${w}x${h}`); };
  const foe = { dead: false, entity: { maxHealth: 10, health: 10 }, ai: { feet: [0, 0, 5], height: 1.8 } };
  const scope = {
    canvas, document: {}, travelView: null, player: { collider: null },
    townTalk: { overlayActive: false, hudHidden: false }, gamePaused: () => false, _mode: () => 'exterior', navalOn: () => true,
    worldViewportRect: (w, h) => { laid(w, h); return { x: 0, y: 0, w: 1, h: 1 }; },
    projectToScreen: (p, w, h) => { laid(w, h); return { front: false, x: 0, y: 0 }; },
    worldRectPx: (r, w, h) => { laid(w, h); return { x: 0, y: 0, w, h }; },
    livingLinePoints: (points, w, h) => laid(w, h),
    naval: { tags: () => [{ id: 't', point: [0, 0, 5] }] }, navalCrew: { speech: () => [{ head: [0, 2, 5], member: {}, text: 'Ho' }] },
    exteriorFoes: { foes: [foe] }, _insidePool: () => [], isShipmate: () => true, crewBarPoint: (feet) => feet,
    foeAlerted: () => true, _inAnyLocationRect: () => false, _wildMarkAt: new WeakMap(), _wildGate: false,
    NAVAL_TAG_RANGE: 1e9, CREW_BAR_RANGE: 1e9, CREW_SAY_RANGE: 1e9, WILD_MARK_RANGE: 1e9, WILD_MARK_S: 5, CAPSULE_HEIGHT: 1.8,
    enhancedHudScale: () => 1, drawNavalTags() {}, drawCrewBars() {}, drawCrewLines() {}, drawWildMarks() {},
  };
  const names = Object.keys(scope);
  for (const name of STREET_PASSES) {
    const lifted = text(one(ALL.filter((n) => n.type === 'FunctionDeclaration' && n.id?.name === name), `pass ${name}`));
    const pass = new Function(...names, `"use strict";\n${lifted}\nreturn ${name};`)(...names.map((k) => scope[k]));
    const run = (...handed) => {
      reads.w = 0;
      reads.h = 0;
      sizes.clear();
      pass(null, null, [0, 0, 0], ...(name === 'navalCrewLines' ? [0] : []), ...handed);
      return { reads: { ...reads }, sizes: [...sizes] };
    };
    assert.deepEqual(run(800, 600), { reads: { w: 0, h: 0 }, sizes: ['800x600'] }, `${name}: handed the frame's size, it lays its points out in it and reads no layout`);
    assert.deepEqual(run(), { reads: { w: 1, h: 1 }, sizes: ['1280x720'] }, `${name}: handed none, it reads the layout once`);
  }
});

test('the walk\'s list, the light, a record key, the two pools and the last position make nothing a frame once warm, measured in a node of its own against a control that must show (mutants: each back to the list, the colour, the string or the array it made)', () => {
  const href = (p) => JSON.stringify(new URL(`../../${p}`, import.meta.url).href);
  const script = `
    const { recordFrameKey } = await import(${href('src/scenes/townScratch.js')}).catch(() => ({}));
    const { pixelsInto, bothInto, scaledInto, copiedInto } = await import(${href('src/scenes/frameKept.js')}).catch(() => ({}));
    const PARAMS = ${JSON.stringify(PARAMS)}, BODIES = ${JSON.stringify(BODIES)};
    const make = (name) => new Function(...PARAMS[name], '"use strict";\\n' + BODIES[name]);
    const pixelMap = ${pixelMap.toString()};
    const fill = make('fill'), light = make('light'), rkey = make('rkey'), doorways = make('doorways'), reach = make('reach');
    const built = pixelMap(120, 1000, 600), kept = [], state = { current: { x: 1000, y: 600 } };
    const renderer = { c: null, setIndirectLight(pos, range, color) { this.c = color; }, setWorldViewport(r, w, h) { this.r = r; } };
    const cam = { pos: [10.5, 2.25, -7.75] }, COLOR = [0.9019608, 0.8, 0.6509804], rgb = new Float32Array(3), fog = { under: false }, sky = { sun: 1 };
    const scale = () => 1;
    const outs = [{ record: 5, frame: 0 }, { record: 5, frame: 1 }, { record: 12, frame: 3 }];
    const guards = { guards: [{ a: 1 }, { a: 2 }, { a: 3 }] }, foes = { foes: [{ b: 1 }, { b: 2 }, { b: 3 }, { b: 4 }, { b: 5 }] }, both = [];
    const lastPos = make('lastPos')(cam, copiedInto);
    let sink = null, k = 0;
    const fns = {
      fill: () => { fill(kept, built, state, pixelsInto); sink = kept; },
      light: () => { light(renderer, cam, 20, COLOR, fog, scale, 600, sky, rgb, scaledInto); sink = renderer.c; },
      rkey: () => { sink = rkey(outs[(k = (k + 1) % 3)], recordFrameKey); },
      pools: () => { sink = doorways(guards, foes, both, bothInto); sink = reach(guards, foes, both, bothInto); },
      lastPos: () => { sink = lastPos(); },
      control: () => { sink = { a: k, b: [k] }; },
    };
    const bytes = (fn) => {
      let least = Infinity;
      for (let r = 0; r < 5; r++) {
        for (let f = 0; f < 2000; f++) fn();
        globalThis.gc(); globalThis.gc();
        const h0 = process.memoryUsage().heapUsed;
        for (let f = 0; f < 2000; f++) fn();
        least = Math.min(least, (process.memoryUsage().heapUsed - h0) / 2000);
      }
      return least;
    };
    const out = { listed: kept.length };
    for (const name of Object.keys(fns)) out[name] = bytes(fns[name]);
    out.listed = kept.length;
    out.sunk = sink !== undefined;
    console.log(JSON.stringify(out));
  `;
  const run = spawnSync(process.execPath, [...ALLOC_CHILD_ARGS, '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const m = JSON.parse(run.stdout.trim().split('\n').pop());
  assert.ok(m.control >= 20, `the control made ${m.control.toFixed(2)} bytes a call: the measure is blind`);
  assert.equal(m.listed, 120, 'the walk listed every pixel');
  for (const name of ['fill', 'light', 'rkey', 'pools', 'lastPos']) assert.ok(m[name] < 16, `${name}: ${m[name].toFixed(2)} bytes a frame`);
});
