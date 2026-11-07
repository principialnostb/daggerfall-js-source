// A toybox invasion OFFLINE, its readouts end to end on an injected clock: the field (scenes/invasionField.js) over the
// local cell (systems/toybox/localInvasion.js), which runs the relay's own brain. Near its city the side panel counts
// the waves; the boss's bar comes up as it rises, warded; each phase it turns is said and laughed; its heavy blows are
// drawn on the ground as they wind up, called on its bar, and land on my feet; its fall is told, then the panel goes.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInvasionField, invasionFightHere } from '../../src/scenes/invasionField.js';
import { createInvasionBossHost } from '../../src/scenes/invasionBossHost.js';
import { invasionFoeAt, INVASION_NATIVE_PER_M, INVASION_RISE_MS, INVASION_WAVE_GAP_MS } from '../../src/net/invasion/invasionBrain.js';
import { INVASION_BLOW } from '../../src/net/invasion/invasionBlows.js';
import { INVASION_HUD_FELL_MS } from '../../src/ui/toybox/invasionHud.js';
import { setToyboxSound, _resetToyboxNews } from '../../src/systems/toybox/toyboxNews.js';
import { _resetLocalInvasions } from '../../src/systems/toybox/localInvasion.js';
import { INVASION_WAVES, INVASION_FAMILIES } from '../../src/systems/toybox/toyboxLaw.js';
import { INVASION_BOSS_HP } from '../../src/net/staffEvent/toyboxEvent.js';
import { PIXEL_UNITS } from '../../src/net/wire.js';

afterEach(() => {
  _resetToyboxNews();
  _resetLocalInvasions();
});

const FAMILY = INVASION_FAMILIES[3];
const EV = { id: 'tb12cd34ef', tb: 1, px: 200, py: 100, at: 0, go: 0, ue: 1e15, nm: 'Gothway Garden', mt: [...FAMILY.kinds], b: FAMILY.boss, hp: INVASION_BOSS_HP };
const local = (nx, nz) => [nx / INVASION_NATIVE_PER_M, nz / INVASION_NATIVE_PER_M];
const native = (x, z) => [x * INVASION_NATIVE_PER_M, z * INVASION_NATIVE_PER_M];

function rig() {
  const clock = { t: 1_800_000_000_000 };
  const log = { trackers: [], bars: [], mids: [], sounds: [], hurt: [], drawn: [] };
  setToyboxSound((cue) => log.sounds.push(cue));
  const host = createInvasionBossHost({ now: () => clock.t });
  const pool = {
    foes: [],
    spawnFoe: (kind, pos) => {
      const foe = { mobileType: kind, dead: false, entity: { health: 40, maxHealth: 40 }, ai: { feet: [...pos], yaw: 0, height: 4, walkTo() {} } };
      pool.foes.push(foe);
      return Promise.resolve(foe);
    },
    damageFoe: (foe, n, _f, _d, { fromPlayer = true, kind = 'melee' } = {}) => {
      if (foe.dead || host.takes(foe, n, kind, fromPlayer)) return;
      foe.entity.health -= n;
      if (foe.entity.health <= 0) foe.dead = true;
    },
    removeFoe: (foe) => { foe.dead = true; },
  };
  const me = { feet: local(EV.px * PIXEL_UNITS + PIXEL_UNITS / 2, (499 - EV.py) * PIXEL_UNITS + PIXEL_UNITS / 2) };
  const field = createInvasionField({
    offline: () => true, now: () => clock.t, clock: () => clock.t, events: () => [EV], pixel: () => ({ x: EV.px, y: EV.py }), pool: () => pool,
    local, native, ground: () => 0, feet: () => [me.feet[0], 0, me.feet[1]], player: { health: 100, maxHealth: 100 }, level: () => 40, name: () => 'Dev',
    hurt: (n) => log.hurt.push(n), rand: () => 0.37, sev: () => {},
    renderer: { gl: {} }, makePass: () => ({ draw: (list) => log.drawn.push(list.length) > 0 }),
    drawTracker: (model) => log.trackers.push(model), drawBar: (model) => log.bars.push(model), mid: (text) => log.mids.push(text),
  });
  const run = async (n, dt = 250) => {
    for (let i = 0; i < n; i++) {
      clock.t += dt;
      field.frame();
      field.drawMarks();
      await new Promise((r) => setImmediate(r));
    }
  };
  return { clock, log, field, me, run, fight: () => field._cell._fights().get(EV.id) };
}

test('INVASION OFFLINE READOUTS: the panel counts the waves; the bar comes up warded as the boss rises; each phase said and laughed; its heavy blows drawn, called and landed; its fall told, then the panel gone', async () => {
  const r = rig();
  await r.run(2);
  assert.equal(r.log.trackers.at(-1).wave, 'Wave 1 of 10 - 9 left', 'the panel near its city before a foe stands');
  await r.run(Math.ceil(INVASION_WAVE_GAP_MS / 250) + 2);
  assert.equal(r.log.trackers.at(-1).wave, 'Wave 1 of 10 - 9 left');
  assert.match(r.log.trackers.at(-1).foes, /^6 foes stand$/);
  assert.equal(r.log.bars.length, 0, 'no bar before the boss');
  // the waves spent: the boss rises
  const fight = r.fight();
  fight.wave = INVASION_WAVES;
  fight.foes = [];
  fight.nextWaveAt = r.clock.t;
  await r.run(2);
  assert.equal(r.log.trackers.at(-1).boss, 'Warlord Dagnub rises from the ground');
  assert.deepEqual([r.log.bars.at(-1).warded, r.log.bars.at(-1).frac, r.log.bars.at(-1).marks.length], [true, 1, 2]);
  await r.run(Math.ceil(INVASION_RISE_MS / 250) + 1);
  assert.equal(r.log.trackers.at(-1).boss, 'Warlord Dagnub - phase 1 of 3');
  // the second phase: said, laughed, and its heavy blow thrown at once under my feet
  const boss = fight.boss;
  const [bossX, bossZ] = invasionFoeAt(boss, r.clock.t);
  r.me.feet = local(fight.sx + bossX * INVASION_NATIVE_PER_M, fight.sz + bossZ * INVASION_NATIVE_PER_M);
  boss.busy = 0;
  boss.h = boss.m * 0.6;
  const hurtBefore = r.log.hurt.length;
  await r.run(1);
  assert.deepEqual(r.log.mids, ['Warlord Dagnub roars. Its blows grow wide and wild!']);
  assert.deepEqual(r.log.sounds, ['laugh']);
  const heavy = fight.blows.find((blow) => blow.i === 0 && blow.a !== INVASION_BLOW.swing);
  assert.ok(heavy, 'a heavy blow at the turn');
  await r.run(1);
  assert.ok(r.log.drawn.at(-1) >= 1, 'drawn on the ground as it winds up');
  assert.deepEqual([r.log.bars.at(-1).spent, r.log.bars.at(-1).callout?.move], [[true, false], true], 'the bar: a mark spent, the blow called, MOVE');
  await r.run(Math.ceil(heavy.wu / 250) + 2);
  assert.ok(r.log.hurt.slice(hurtBefore).includes(Math.round(100 * heavy.p)), 'it landed on my feet');
  // the third: said and laughed, the waves endless
  boss.h = boss.m * 0.3;
  await r.run(2);
  assert.equal(r.log.mids.at(-1), 'Warlord Dagnub calls its host. The waves will not end!');
  assert.deepEqual(r.log.sounds, ['laugh', 'laugh']);
  assert.equal(r.log.trackers.at(-1).wave, 'The waves are endless now');
  // the fall: told, then the panel and the bar go
  boss.h = 5;
  fight.players.local.bucket = 1e9;
  const [x, z] = invasionFoeAt(boss, r.clock.t);
  r.me.feet = local(fight.sx + x * INVASION_NATIVE_PER_M, fight.sz + z * INVASION_NATIVE_PER_M);
  r.field._cell.send({ k: 'hit', id: EV.id, i: 0, d: 500, r: 0 });
  await r.run(1);
  assert.equal(r.log.trackers.at(-1).boss, 'Warlord Dagnub has fallen');
  assert.equal(r.log.bars.at(-1).fallen, true);
  await r.run(Math.ceil(INVASION_HUD_FELL_MS / 1000) + 1, 1000);
  assert.equal(r.log.trackers.at(-1), null, 'the panel gone a while after the fall');
});

test('INVASION GUARDS: while I stand at a live invasion the city guards spare its walkers, as in a raid; off the street, they keep the law again', async () => {
  const r = rig();
  assert.equal(invasionFightHere(), false, 'no invasion read yet');
  await r.run(2);
  assert.equal(invasionFightHere(), true, 'at its city, its panel up');
  const w = readFileSync('src/scenes/world.js', 'utf8');
  assert.ok(w.includes('raidHere: () => raidDefendingHere() || invasionFightHere() || !!dragonSky?.fightHere?.(),'), 'the guards ask it with the raid');
  r.field.away();
  assert.equal(invasionFightHere(), false, 'away from it');
});
