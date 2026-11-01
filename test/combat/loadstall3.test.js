// LOAD-STALL 3 (bible/07-Rendering/Load-Stalls.md section 5): the player's body before the street's - the texture
// pool's queue with the player's jobs first, the body queue held while the player's rig works - and the dev server's
// URL globs without a module request per file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTexturePool } from '../../src/formats/morrowind/mwTextureClient.js';
import { decodeTextureImage } from '../../src/formats/morrowind/mwTexture.js';
import { createBuildGate, gateBuild } from '../../src/net/peer/peerBodies.js';
import { setPlayerBusyProbe, playerBuilding, PLAYER_HOLD_RETRY_MS } from '../../src/characters/playerBuildHold.js';
import { devGlobUrls } from '../../src/systems/devGlobUrls.js';
import { rewriteEagerUrlGlobs } from '../../scripts/devLazyUrlGlobs.mjs';

const DDS = 'textures/tx_fixture.dds';
const bytes = new Uint8Array(readFileSync(new URL('../fixtures/mw/fixture.dds', import.meta.url)));

/** A worker that answers only when told: `release()` answers its oldest job. */
function heldWorker(log) {
  const w = { onmessage: null, onerror: null, queue: [],
    postMessage(msg) { log.push(msg.path); w.queue.push(msg); },
    release() { const m = w.queue.shift(); if (m) w.onmessage?.({ data: { t: 'image', id: m.id, image: decodeTextureImage(DDS, bytes) } }); },
    terminate() {} };
  return w;
}

test('LOAD-STALL 3: the pool holds one job a worker and hands the next to the urgent line first (mutants: every job posted at once; the lines first come first served)', async () => {
  const posted = []; const workers = [];
  const pool = createTexturePool({ workerFactory: () => { const w = heldWorker(posted); workers.push(w); return w; }, size: 1 });
  const done = [];
  const npc = ['npc-1', 'npc-2', 'npc-3'].map((p) => pool.decode(p, bytes).then(() => done.push(p)));
  const mine = pool.decode('player-sword', bytes, { urgent: true }).then(() => done.push('player-sword'));
  assert.deepEqual(posted, ['npc-1'], 'one job in the worker\'s hands, the rest waiting here');
  assert.deepEqual(pool.waiting(), { urgent: 1, normal: 2 });
  workers[0].release(); await Promise.resolve();
  assert.equal(posted[1], 'player-sword', 'the player\'s job goes next, ahead of the NPCs that came before it');
  for (let i = 0; i < 3; i++) { workers[0].release(); await Promise.resolve(); }
  await Promise.all([...npc, mine]);
  assert.deepEqual(done, ['npc-1', 'player-sword', 'npc-2', 'npc-3']);
});

test('LOAD-STALL 3: a pool whose workers cannot open decodes what waits on this thread (mutant: a queued job stranded)', async () => {
  const pool = createTexturePool({ workerFactory: () => { throw new Error('no workers here'); }, size: 2 });
  const img = await pool.decode(DDS, bytes, { urgent: true });
  assert.deepEqual(img, decodeTextureImage(DDS, bytes));
  assert.equal(pool.stats.onThread, 1);
});

test('LOAD-STALL 3: the body queue starts nothing while the player\'s rig is busy, and starts it when the rig is done (mutants: the hold unread; never resumed)', async () => {
  let busy = true;
  setPlayerBusyProbe(() => busy);
  try {
    assert.equal(playerBuilding(), true);
    const gate = createBuildGate(); const ran = [];
    const done = gateBuild(gate, async () => { ran.push('npc'); }, true);
    await new Promise((r) => setTimeout(r, PLAYER_HOLD_RETRY_MS / 2));
    assert.deepEqual(ran, [], 'held while the player builds');
    busy = false;
    await done;
    assert.deepEqual(ran, ['npc']);
  } finally { setPlayerBusyProbe(null); }
  assert.equal(playerBuilding(), false, 'nothing registered is not busy');
});

test('LOAD-STALL 3: the player\'s rig marks its own builds and swaps urgent and registers the hold (mutants: the flag dropped; the probe unregistered)', () => {
  const src = readFileSync('src/combat/fpArm.js', 'utf8');
  assert.match(src, /if \(playerAppearance && opts && !opts\.urgent\) opts = \{ \.\.\.opts, urgent: true \};/);
  assert.match(src, /decodeTextureOffThread\(path, arc\.get\(path\), \{ urgent \}\)/);
  assert.equal((src.match(/preloadArmTextures\(t?[fF]resh, archives, gen, playerAppearance\)/g) ?? []).length, 5, 'every swap of the rig');
  assert.match(src, /setPlayerBusyProbe\(\(\) => fpArm\.rigBusy\(\)\);/);
});

test('LOAD-STALL 3: an eager URL glob is rewritten for the dev server into the same table from a lazy one, the line count kept; any other glob left alone (mutants: an eager glob kept; a line added above)', () => {
  const src = [
    "const A = import.meta.glob('../../vendor/x/*.png', { eager: true, query: '?url', import: 'default' });",
    "const B = import.meta.glob(['../a/*.dds',", "  '../b/*.nif'], {", "  eager: true, query: '?url', import: 'default',", '});',
    "const C = import.meta.glob('./data/*.json', { eager: true, import: 'default' });",
  ].join('\n');
  const out = rewriteEagerUrlGlobs(src, '/src/systems/m.js');
  assert.doesNotMatch(out, /eager: true, query: '\?url'/);
  assert.match(out, /__devGlobUrls\(import\.meta\.glob\('\.\.\/\.\.\/vendor\/x\/\*\.png', \{ query: '\?url', import: 'default' \}\), "\/src\/systems\/m\.js"\)/);
  assert.match(out, /const C = import\.meta\.glob\('\.\/data\/\*\.json', \{ eager: true, import: 'default' \}\);/, 'a JSON glob is not a URL table');
  const lineOfC = (s) => s.split('\n').findIndex((l) => l.startsWith('const C'));
  assert.equal(lineOfC(out), lineOfC(src), 'every line keeps its number - the folded options\' lines kept, nothing added above');
  assert.equal(rewriteEagerUrlGlobs("const x = import.meta.glob('./a/*.js');", '/src/a.js'), null);
  assert.deepEqual(devGlobUrls({ '../../vendor/x/a b.png': () => {}, './c.dds': () => {} }, '/src/systems/m.js'),
    { '../../vendor/x/a b.png': '/vendor/x/a b.png', './c.dds': '/src/systems/c.dds' }, 'the dev server\'s own `?url` answers');
});

test('LOAD-STALL 3: the dev server runs the rewrite and the build does not', () => {
  const cfg = readFileSync('vite.config.js', 'utf8');
  assert.match(cfg, /plugins: \[devLazyUrlGlobs\(\), /);
  const plugin = readFileSync('scripts/devLazyUrlGlobs.mjs', 'utf8');
  assert.match(plugin, /apply: 'serve',\s*\n\s*enforce: 'pre',/);
});
