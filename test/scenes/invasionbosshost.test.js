// An invasion's foes in the foe pool (scenes/invasionBossHost.js) and the field that draws the cell's fight
// (scenes/invasionField.js): a cell's foe is walked where the cell says, takes no blow in the pool - my blow goes to the
// cell - and dies only by the cell's word; the boss is held and drawn low while it rises, drawn through its fall before
// its corpse is laid; a slam the cell lays is marked on the ground and lands on my feet through the one damage door, so
// god mode (the toybox's Invincible) still spares the player. The pool's wiring is pinned on its text.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInvasionBossHost, setInvasionStrike, INVASION_SNAP_M } from '../../src/scenes/invasionBossHost.js';
import { createInvasionField } from '../../src/scenes/invasionField.js';
import { INVASION_RISE_MS, INVASION_FALL_MS } from '../../src/systems/toybox/invasionRun.js';
import { INVASION_BLOW, INVASION_NATIVE_PER_M } from '../../src/net/invasion/invasionBrain.js';
import { worldRoom } from '../../src/net/wire.js';
import { setStaffPowers } from '../../src/characters/playerEntity.js';

afterEach(() => {
  setStaffPowers({ god: false });
  setInvasionStrike(null);
});

function rig() {
  const clock = { t: 0 };
  const host = createInvasionBossHost({ now: () => clock.t });
  let held = 0;
  const boss = {
    dead: false,
    entity: { invasionBoss: true },
    _inv: { ev: 'iv12cd34ef', i: 0, goal: null },
    ai: { feet: [0, 10, 0], height: 4, yaw: 0, holdFrame: () => held++ },
    mobile: { heldPose: (state) => ({ record: 0, frame: 0, state }), update: (_dt, o) => ({ state: o.moving ? 'walk' : 'idle', o }) },
    batch: { origin: null },
  };
  return { clock, host, boss, held: () => held };
}

test('INVASION BOSS RISES: held where it stands, drawn its height under its feet, no blow taken; risen, it is walked where the cell says', () => {
  const { clock, host, boss, held } = rig();
  const me = [100, 10, 0];
  assert.equal(host.frame(boss, me, null), true, 'the pool does not step it');
  assert.equal(held(), 1, 'its motor held');
  assert.equal(boss._mout.state, 'idle');
  assert.equal(host.rising(boss), true, 'no blow while it rises');
  assert.equal(host.takes(boss, 50, 'melee', true), true);
  boss.batch.origin = boss.ai.feet;
  host.dress(boss, [0, 0, -5]);
  assert.equal(boss.batch.origin[1], 10 - 4, 'drawn a whole height down');
  assert.deepEqual(boss.ai.feet, [0, 10, 0], 'its feet untouched');
  clock.t = INVASION_RISE_MS;
  const walked = [];
  boss.ai.walkTo = (goal) => { walked.push(goal); boss.ai.walkGoal = goal; };
  boss.ai.update = () => { boss.ai.moving = true; };
  boss._inv.goal = [3, 10, 4];
  assert.equal(host.frame(boss, me, null), true, 'risen: still the cell\'s to move');
  assert.deepEqual(walked, [[3, 10, 4]], 'walked toward the cell\'s word');
  assert.equal(boss._mout.state, 'walk');
  boss._inv.goal = [INVASION_SNAP_M + 10, 10, 0];
  host.frame(boss, me, null);
  assert.deepEqual(boss.ai.feet, [INVASION_SNAP_M + 10, 10, 0], 'far off: set there at once');
  const plain = { entity: {}, ai: { feet: [0, 0, 0] }, batch: { origin: [0, 0, 0] } };
  assert.equal(host.frame(plain, me, null), false, 'any other foe: the pool\'s own');
  assert.equal(host.takes(plain, 5, 'melee', true), false);
});

test('INVASION FOE: my blow on a cell\'s foe goes to the cell and stops in the pool; another\'s blow stops too; the cell\'s kill passes', () => {
  const { host, boss } = rig();
  boss.entity.invasionBoss = false;
  const sent = [];
  setInvasionStrike((foe, damage, kind) => sent.push([foe, damage, kind]));
  assert.equal(host.takes(boss, 30, 'arrow', true), true);
  assert.deepEqual(sent, [[boss, 30, 'arrow']]);
  assert.equal(host.takes(boss, 30, 'melee', false), true, 'a foe\'s maul is no blow on it');
  assert.equal(sent.length, 1);
  boss._inv.dying = true;
  assert.equal(host.takes(boss, 30, 'melee', false), false, 'the cell\'s word kills it');
});

test('INVASION BOSS FALLS: its corpse waits out the fall, its body drawn sinking and tipping meanwhile; any other foe\'s corpse is laid at once', () => {
  const { clock, host, boss } = rig();
  host.frame(boss, [100, 10, 0], null);
  clock.t = INVASION_RISE_MS;
  boss.dead = true;
  let laid = 0;
  let freed = 0;
  assert.equal(host.keeps(boss), true, 'its batch kept at its death');
  host.lay(boss, () => laid++, () => freed++);
  assert.equal(laid, 0, 'not yet');
  assert.equal(host.falling(boss), true, 'drawn through its fall');
  clock.t += INVASION_FALL_MS / 2;
  host.tick();
  boss.batch.origin = boss.ai.feet;
  host.dress(boss, [0, 10, -5]);
  assert.ok(boss.batch.tip[2] > 0 && boss.batch.tip[2] < Math.PI / 2, 'tipping over');
  assert.ok(boss.batch.origin[1] < 10, 'sinking');
  clock.t += INVASION_FALL_MS / 2;
  host.tick();
  assert.deepEqual([laid, freed], [1, 1], 'fallen: its batch freed, its corpse laid');
  assert.equal(host.falling(boss), false);
  let other = 0;
  assert.equal(host.keeps({ entity: {}, batch: {} }), false);
  host.lay({ entity: {}, batch: {} }, () => other++, () => assert.fail('the pool freed it already'));
  assert.equal(other, 1);
});

test('INVASION FIELD: online it says `in` on the city\'s pixel, stands the cell\'s foes as their kinds with the cell\'s health, sends my blow as a `hit`, kills a foe the cell no longer names, and lands a slam on my feet through the damage door - god mode spares me (mutants: health set by my blow; no telegraph; god mode ignored)', async () => {
  const EV = { id: 'iv12cd34ef', tb: 1, px: 207, py: 213, at: 0, go: 0, ue: 1e15 };
  const clock = { t: 1_000_000 };
  const sent = [], drawn = [];
  const stood = [];
  const host = createInvasionBossHost({ now: () => clock.t });
  const pool = {
    spawnFoe: (kind, pos, opts) => { const foe = { mobileType: kind, dead: false, opts, entity: { health: 1, maxHealth: 1 }, ai: { feet: [...pos], yaw: 0 } }; stood.push(foe); return Promise.resolve(foe); },
    damageFoe: (foe, n, _p, _d, o = {}) => { if (host.takes(foe, n, o.kind ?? 'melee', o.fromPlayer !== false)) return; foe.entity.health -= n; if (foe.entity.health <= 0) foe.dead = true; },
    removeFoe: (foe) => { foe.dead = true; },
  };
  const player = { health: 100, maxHealth: 100, items: [] };
  const field = createInvasionField({
    now: () => clock.t, clock: () => clock.t, events: () => [EV], offline: () => false,
    online: { ready: () => true, send: (word, room) => sent.push([word, room]) },
    pixel: () => ({ x: EV.px, y: EV.py }), pool: () => pool,
    local: (nx, nz) => [nx / INVASION_NATIVE_PER_M, nz / INVASION_NATIVE_PER_M], native: (x, z) => [x * INVASION_NATIVE_PER_M, z * INVASION_NATIVE_PER_M],
    ground: () => 0, feet: () => [0, 0, 0], player, level: () => 30,
    renderer: { gl: {} }, makePass: () => ({ draw: (list) => drawn.push(list.map((one) => one.sh.r)) > 0 }), drawBar: () => {}, drawTracker: () => {}, mid: () => {},
  });
  field.frame();
  assert.deepEqual(sent[0], [{ k: 'in', id: EV.id, lv: 30 }, worldRoom(EV.px, EV.py)], 'said to the city\'s cell');
  const row = (i, kind, h) => [i, kind, h, 300, 2, 0, 2, 0, 0, 0, 0, 0];
  const st = { k: 'st', id: EV.id, sx: 0, sz: 0, w: 1, ph: 0, p3: 0, n: 0, np: 1, f: [row(1, 7, 250), row(2, 12, 300)], b: [], fl: 0 };
  field.word(st);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(stood.map((foe) => [foe.mobileType, foe.entity.health, foe.entity.maxHealth, foe.opts.placed, foe.opts.transient]), [[7, 250, 300, true, true], [12, 300, 300, true, true]]);
  pool.damageFoe(stood[0], 40, null, null, { fromPlayer: true });
  assert.equal(stood[0].entity.health, 250, 'my blow moves nothing here');
  assert.deepEqual(sent.at(-1)[0], { k: 'hit', id: EV.id, i: 1, d: 40, r: 0 }, 'it goes to the cell');
  // the cell's word: foe 1 at 100, foe 2 gone - killed through the pool's own death; a slam laid under my feet
  const at = clock.t + 1800;
  field.word({ ...st, f: [row(1, 7, 100)], b: [[1, 0, INVASION_BLOW.slam, at, 1800, 0.45, ['d', 0, 0, 7]]] });
  assert.equal(stood[0].entity.health, 100);
  assert.equal(stood[1].dead, true);
  field.frame();
  assert.equal(field.drawMarks(), true);
  assert.deepEqual(drawn.at(-1), [7], 'the slam marked on the ground as it winds up, its own size');
  setStaffPowers({ god: true });
  clock.t = at + 10;
  field.frame();
  assert.equal(player.health, 100, 'god mode spares me');
  setStaffPowers({ god: false });
  field.word({ ...st, f: [row(1, 7, 100)], b: [[2, 0, INVASION_BLOW.slam, clock.t + 100, 1800, 0.45, ['d', 0, 0, 7]]] });
  clock.t += 200;
  field.frame();
  assert.equal(player.health, 55, 'a slam takes its share of my health');
});

test('INVASION: the foe pool wires the host - stepped first, a blow asked of it, drawn through its fall, its corpse laid after it; the raid stands no invasion', () => {
  const src = readFileSync(new URL('../../src/scenes/exteriorFoes.js', import.meta.url), 'utf8');
  assert.match(src, /createInvasionBossHost\(\{ player: playerEntity/);
  assert.match(src, /if \(invasion\.frame\(f, playerFeet, eye\)\) continue;/);
  assert.match(src, /if \(invasion\.takes\(f, damage, kind, fromPlayer && !peer\)\) return;/);
  assert.match(src, /\(f\.dead && !invasion\.falling\(f\)\) \|\| !f\._mout/);
  assert.match(src, /invasion\.dress\(f, _eye\)/);
  assert.equal(src.match(/if \(!invasion\.keeps\(f\)\) releaseFoeBatch\(f\);/g)?.length, 2, 'both death doors keep its batch');
  assert.equal(src.match(/invasion\.lay\(f, \(\) => mintCorpse\(f\), \(\) => releaseFoeBatch\(f\)\)/g)?.length, 2, 'and lay its corpse after its fall');
  assert.match(src, /invasion\.tick\(\);/);
  const raids = readFileSync(new URL('../../src/systems/raidingParties.js', import.meta.url), 'utf8');
  assert.match(raids, /const sraid = here\?\.staff\?\.tb === TB_INVASION \? null : here;/);
});
