import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scenario, generateSuite, analyze } from '../../tools/provingGround/lab/model.mjs';
import { createLabDriver } from '../../tools/provingGround/lab/driver.mjs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { createLabPlugin } from '../../tools/provingGround/lab/server.mjs';
import { registerExteriorFoeProbe, latestExteriorFoes } from '../../src/scenes/exteriorFoeProbe.js';

test('LAB: the foe lookup returns the exact live pool, preserving spawn methods and its mutable actor list', () => {
  const pool = { foes: [], spawnFoe() { this.foes.push({ type: 0 }); } };
  assert.equal(registerExteriorFoeProbe(pool), pool);
  assert.equal(latestExteriorFoes(), pool);
  latestExteriorFoes().spawnFoe();
  assert.equal(pool.foes.length, 1);
  registerExteriorFoeProbe({ foes: [] }, true);
  assert.equal(latestExteriorFoes(), pool, 'an indoor pool must not take the exterior probe slot');
});

test('LAB: generated gameplay suite covers every movement direction with all four attacks and standing attacks', () => {
  const suite = generateSuite();
  assert.equal(suite.length, 47);
  assert.equal(new Set(suite.map((s) => s.name)).size, suite.length);
  const attacks = suite.filter((s) => s.steps.some((step) => step.swing));
  assert.equal(attacks.length, 36);
  for (const swing of ['down', 'up', 'left', 'right']) assert.equal(attacks.filter((s) => s.steps.some((step) => step.swing === swing)).length, 9);
  for (const spec of suite) assert.deepEqual(scenario(JSON.parse(JSON.stringify(spec))), spec);
});

test('LAB: imported scenarios reject unbounded time, unsupported input, invalid actors and path names before execution', () => {
  const base = { version: 1, name: 'repro', steps: [{ frames: 10 }] };
  for (const change of [
    { version: 2 }, { name: '../overwrite' }, { steps: [{ frames: 3601 }] }, { steps: [{ frames: 0 }] },
    { steps: [{ frames: 10, keys: ['Delete'] }] }, { steps: [{ frames: 8, swing: 'down' }] },
    { steps: [{ frames: 10, turn: Infinity }] }, { foe: -1 }, { outfit: [null] },
  ]) assert.throws(() => scenario({ ...base, ...change }));
});

test('LAB: bone analysis finds a known jump but never calls absent or non-finite geometry a pass', () => {
  const frames = [
    { f: 1, b: { hand: [0, 0, 0] } }, { f: 2, b: { hand: [0.5, 0, 0] } },
    { f: 3, b: { hand: [NaN, 0, 0] } }, { f: 4, b: null },
  ];
  assert.deepEqual(analyze(frames).findings.map((x) => x.kind), ['bone-jump', 'invalid-position', 'missing-bones']);
  assert.equal(analyze([]).status, 'unmeasured');
  assert.equal(analyze([{ f: 1, b: null }]).status, 'unmeasured');
  assert.equal(analyze([frames[0], { f: 8, b: { hand: [1, 0, 0] } }]).findings.length, 0, 'a capture gap is not a single-frame jump');
});

test('LAB: UI and agent frame commands serialize; marks persist the observed frame and inputs release after failure', async () => {
  const out = mkdtempSync(join(tmpdir(), 'dfo-lab-'));
  const keys = new Set();
  const mouseFrames = [];
  let mouseHeld = false;
  let ticks = 0, inStep = false, fail = false;
  const page = {
    on() {}, off() {},
    keyboard: { async down(key) { keys.add(key); }, async up(key) { keys.delete(key); } },
    mouse: { async down() { mouseHeld = true; }, async up() { mouseHeld = false; }, async move() {} },
    async evaluate() { return { s: { mg: 'walkforward' }, b: { hand: [ticks / 100, 0, 0] }, foes: [], sources: {}, clip: {} }; },
    async screenshot() { return new Uint8Array([1, 2, 3]); },
  };
  const driver = createLabDriver({ page, out, revision: 'test', kit: async () => true, step: async (count) => {
    assert.equal(inStep, false, 'only one owner may advance the game');
    inStep = true;
    await new Promise((resolve) => setTimeout(resolve, 1));
    inStep = false;
    if (fail) throw new Error('frame failed');
    if (count === 1) mouseFrames.push(mouseHeld);
    ticks += count;
  } });
  try {
    await assert.rejects(driver.command('load', { scenario: { version: 9 } }));
    assert.equal(ticks, 0, 'invalid import did not advance the game');
    await driver.command('load', { scenario: { version: 1, name: 'walk', steps: [{ frames: 20, keys: ['KeyW'] }] } });
    const [a, b] = await Promise.all([driver.command('advance', { frames: 2 }), driver.command('advance', { frames: 3 })]);
    assert.equal(a.frame, 2); assert.equal(b.frame, 5);
    assert.deepEqual([...keys], ['KeyW'], 'stepping preserves held input while the simulation clock is paused');
    const marked = await driver.command('mark', { note: '<broken shoulder>' });
    const stored = JSON.parse(readFileSync(join(out, `${marked.run.id}.json`), 'utf8'));
    assert.deepEqual(stored.marks, [{ frame: 5, note: '<broken shoulder>' }]);
    assert.equal(stored.frames.length, 5);
    fail = true;
    await assert.rejects(driver.command('advance'), /frame failed/);
    assert.equal(keys.size, 0, 'failed execution must not leave movement held');
    fail = false;
    assert.equal((await driver.command('advance')).frame, 6, 'a failed command must not poison the queue');
    await driver.command('run');
    assert.equal(keys.size, 0, 'scenario completion releases held input');
    await driver.command('load', { scenario: { version: 1, name: 'attack', steps: [{ frames: 9, swing: 'down' }] } });
    mouseFrames.length = 0;
    for (let i = 0; i < 9; i++) await driver.command('advance');
    assert.deepEqual(mouseFrames, [...Array(8).fill(true), false], 'single-frame stepping preserves the full drag window');
  } finally { await driver.close(); rmSync(out, { recursive: true, force: true }); }
});

test('LAB: the development route precedes Vite fallback, reports loading, and refuses cross-origin mutation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dfo-lab-server-'));
  const bridge = createLabPlugin();
  const server = await createServer({ root, configFile: false, plugins: [bridge.plugin], logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  let driver;
  try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const panel = await fetch(`${base}/__lab/`);
    assert.equal(panel.status, 200); assert.match(await panel.text(), /Animation Lab/);
    assert.equal((await fetch(`${base}/__lab/command`, { method: 'POST' })).status, 503);
    driver = bridge.attach({ page: { on() {}, off() {}, mouse: { async up() {} } }, kit() {}, step() {}, out: root });
    const rejected = await fetch(`${base}/__lab/command`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' }, body: '{"command":"suite"}' });
    assert.equal(rejected.status, 403);
    const accepted = await fetch(`${base}/__lab/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"command":"suite"}' });
    assert.equal((await accepted.json()).value.length, 47);
    assert.equal((await fetch(`${base}/__lab/not-a-file`)).status, 404);
  } finally { await driver?.close(); await server.close(); rmSync(root, { recursive: true, force: true }); }
});
