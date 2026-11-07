// A toybox invasion and dragon attack RUN OFFLINE, end to end on an injected clock: the local runner
// (systems/toybox/localToyboxEvents.js) as the hub, the local cell (systems/toybox/localInvasion.js) running the relay's
// own brain, and the field (scenes/invasionField.js) drawing it in a foe pool - its news to every screen, its map mark and
// countdown, nothing before its minute's wait, ten waves in order whose health is the cell's, the boss after the tenth
// (physical, rising), the third phase's endless waves, the fall, the receipt with `tb` rolled here. The raid's own path
// stands nothing of it. A dragon attack stands no raid: its row calls the world dragon and ends when that dragon falls.
import '../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { raidFrame as frame, raidRelayWord, setRaidingPartiesHost, restoreRaidSaveData, _resetRaidingParties } from '../../src/systems/raidingParties.js';
import { staffRaids, _resetStaffEvents } from '../../src/systems/staffEvents.js';
import { setSharedClock } from '../../src/systems/worldTick.js';
import { MINUTES_PER_DAY } from '../../src/systems/gameDate.js';
import { _resetModSettings, setModSetting } from '../../src/systems/modSettings.js';
import { _resetRenownKillsForTests } from '../../src/net/renownTracker.js';
import { readStaffReceipt } from '../../src/net/staffEvent/staffEventReceipt.js';
import { invasionWaveSize, INVASION_PHASE3_WAVE } from '../../src/net/staffEvent/toyboxEvent.js';
import { createLocalToyboxEvents, LOCAL_ACCOUNT } from '../../src/systems/toybox/localToyboxEvents.js';
import { _resetLocalInvasions } from '../../src/systems/toybox/localInvasion.js';
import { _resetToyboxNews, setToyboxSound } from '../../src/systems/toybox/toyboxNews.js';
import { toyboxMapMarks, toyboxTimerRows } from '../../src/systems/toybox/toyboxMarks.js';
import { invasionBossPose, invasionLaugh, INVASION_RISE_MS, INVASION_FALL_MS, LAUGH_ECHOES } from '../../src/systems/toybox/invasionRun.js';
import { startToyboxEvent } from '../../src/net/toyboxEvents.js';
import { INVASION_WAVES, INVASION_FAMILIES, TOYBOX_EVENT_WAIT_OFFLINE_MS } from '../../src/systems/toybox/toyboxLaw.js';
import { calledDragons, noteCalledFell, _resetCalledDragons } from '../../src/systems/dragon/calledDragons.js';
import { dragonTimes } from '../../src/net/dragon/dragonLaw.js';
import { invasionStagedText, invasionBossText, invasionWonText, dragonStagedText, dragonLandsText } from '../../src/systems/toybox/toyboxNews.js';
import { createInvasionField } from '../../src/scenes/invasionField.js';
import { createInvasionBossHost } from '../../src/scenes/invasionBossHost.js';
import { invasionFoeAt, INVASION_NATIVE_PER_M } from '../../src/net/invasion/invasionBrain.js';
import { PIXEL_UNITS } from '../../src/net/wire.js';

const DAY = 400;
const CITY = { rg: 3, loc: 7, px: 200, py: 100, nm: 'Gothway Garden', ct: 1 };
const tick = () => new Promise((r) => setImmediate(r));
/** The scene is the wire's frame in metres. */
const local = (nx, nz) => [nx / INVASION_NATIVE_PER_M, nz / INVASION_NATIVE_PER_M];
const native = (x, z) => [x * INVASION_NATIVE_PER_M, z * INVASION_NATIVE_PER_M];

/** A foe pool as the street's stands its foes: the boss host's damage door first, as exteriorFoes.js asks it. */
function fakePool(bossHost) {
  const pool = {
    foes: [],
    spawnFoe: (kind, pos) => {
      const foe = { mobileType: kind, dead: false, entity: { health: 40, maxHealth: 40, mobileType: kind, spells: [{ index: 1 }], magicka: 50 }, ai: { feet: [...pos], yaw: 0, height: 4, walkTo() {} } };
      pool.foes.push(foe);
      return Promise.resolve(foe);
    },
    damageFoe: (foe, n, _feet, _dir, { fromPlayer = true, kind = 'melee' } = {}) => {
      if (foe.dead || bossHost.takes(foe, n, kind, fromPlayer)) return;
      foe.entity.health -= n;
      if (foe.entity.health <= 0) foe.dead = true;
    },
    removeFoe: (foe) => { foe.dead = true; foe.removed = true; },
  };
  return pool;
}

function rig() {
  const at = { now: DAY * MINUTES_PER_DAY + 600, wall: 100000, clock: 1_800_000_000_000 };
  const log = { raiders: [], news: [], sounds: [], receipts: [], hurt: [] };
  let localEvents = null;
  const h = {
    now: () => at.now, random: () => 0, wallNow: () => at.wall, relayNow: () => at.clock, selfId: () => 'me', maps: () => null, picker: () => null,
    regionIndex: () => 3, regionName: (r) => `Region${r}`,
    townHere: (outdoors) => (outdoors ? true : { regionIndex: 3, locationIndex: 7 }), playerPixel: () => ({ x: 200, y: 100 }),
    peersInTown: () => [], raidPuppets: () => [], ownRaidFoes: () => [], relayRaids: () => false,
    standRaider: (mt) => { log.raiders.push(mt); return Promise.resolve(null); },
    standDefender: () => Promise.resolve(null), defenderCount: () => 0, defendersAllowed: () => true, removeFoe: () => {}, outOfSight: () => true,
    reputation: () => ({ player: { legalRep: {} }, store: { dict: new Map() } }), say: () => {},
    sendRaid: (w) => localEvents.word(w),
    onRaidReceipt: (r, c) => log.receipts.push([r, c]),
  };
  localEvents = createLocalToyboxEvents({ deliver: (sev, room) => raidRelayWord({ k: 'sev', sev }, room), now: () => at.clock, rand: () => 0.25, name: () => 'Dev' });
  setRaidingPartiesHost(h);
  _resetToyboxNews((kind, text, id) => log.news.push([kind, text, id]));
  setToyboxSound((cue) => log.sounds.push(cue));
  restoreRaidSaveData({ lastSelectedDay: DAY, raids: [] });
  const bossHost = createInvasionBossHost({ now: () => at.clock });
  const pool = fakePool(bossHost);
  const me = { feet: local(CITY.px * PIXEL_UNITS + PIXEL_UNITS / 2, (499 - CITY.py) * PIXEL_UNITS + PIXEL_UNITS / 2) };
  const player = { health: 100, maxHealth: 100 };
  const field = createInvasionField({
    offline: () => true, now: () => at.clock, clock: () => at.clock, pixel: () => ({ x: CITY.px, y: CITY.py }), pool: () => pool,
    local, native, ground: () => 0, feet: () => [me.feet[0], 0, me.feet[1]], player, level: () => 30, name: () => 'Dev',
    hurt: (n) => log.hurt.push(n), blows: () => {}, tactics: () => 0, rand: () => 0.37,
  });
  return { at, log, local: localEvents, pool, me, field };
}
/** Frames, each `dt` seconds on every clock: the raid's own path, the toybox's runner and the field. */
async function run(r, n, dt = 0.25) {
  for (let i = 0; i < n; i++) {
    r.at.clock += dt * 1000;
    r.at.wall += dt * 1000;
    frame(dt);
    r.local.tick();
    r.field.frame();
    await tick();
  }
}
const drawn = (r) => r.pool.foes.filter((f) => !f.dead && f._inv && !f.entity.invasionBoss);
/** My blows on a drawn foe until the cell kills it - from beside it, where the cell says it stands, each a breath apart. */
async function slay(r, foe) {
  for (let k = 0; k < 40 && !foe.dead; k++) {
    const fight = r.field._cell._fights().get(foe._inv.ev);
    const body = foe._inv.i === 0 ? fight.boss : fight.foes.find((b) => b.i === foe._inv.i);
    if (body) {
      const [x, z] = invasionFoeAt(body, r.at.clock);
      r.me.feet = local(fight.sx + x * INVASION_NATIVE_PER_M, fight.sz + z * INVASION_NATIVE_PER_M);
      r.pool.damageFoe(foe, 500, null, null, { fromPlayer: true });
    }
    await run(r, 4);
  }
  assert.ok(foe.dead, 'the cell killed it');
}

beforeEach(() => {
  _resetRaidingParties();
  _resetStaffEvents();
  _resetModSettings();
  _resetRenownKillsForTests();
  _resetLocalInvasions();
  setModSetting('world-events-raiding-parties', 'Enabled', true);
  setSharedClock(null);
});

test('TOYBOX OFFLINE: an invasion end to end - staged to every screen, marked with its countdown, nothing before it begins, ten waves in order whose health is the cell\'s, the boss rises and laughs, its third phase\'s waves, its fall pays a receipt with `tb`; the raid\'s own path stands nothing of it', async () => {
  const r = rig();
  const { at, log } = r;
  const started = await startToyboxEvent({ kind: 'invasion', city: 'Gothway Garden', family: 'orcs' }, { online: () => false, local: r.local, cities: () => [{ name: 'Gothway Garden', ...CITY }] });
  assert.equal(started.ok, true, JSON.stringify(started));
  const e = started.event;
  assert.equal(e.go, at.clock + TOYBOX_EVENT_WAIT_OFFLINE_MS, 'offline, a minute');
  assert.deepEqual(log.news[0], ['invasion', invasionStagedText('Gothway Garden'), `tb:${e.id}`], 'every screen: the board\'s invasion kind');
  assert.equal(staffRaids().length, 1);
  at.clock += 18_000;
  const [mark] = toyboxMapMarks(at.clock);
  assert.deepEqual([mark.px, mark.py, mark.label, mark.icon, mark.text], [200, 100, 'Gothway Garden - invasion in 0:42', 'invasion', 'Invasion in 0:42']);
  const [row] = toyboxTimerRows(at.clock);
  assert.deepEqual([row.kind, row.live, row.at, row.title], ['invasion', false, e.go, 'Invasion of Gothway Garden']);
  // THE WAIT: nothing stands before it begins
  await run(r, 20, 0.5);
  assert.ok(at.clock < e.go);
  assert.equal(r.pool.foes.length, 0, 'nothing before `go`');
  at.clock = e.go;
  assert.equal(toyboxMapMarks(at.clock)[0].text, 'Invasion Active', 'its mark once the wait is over');
  // THE WAVES, in order: each whole, the next only once the last is dead; a foe's health the cell's
  for (let k = 0; k < INVASION_WAVES; k++) {
    await run(r, 16);
    const wave = drawn(r);
    assert.equal(wave.length, invasionWaveSize(k), `wave ${k + 1}`);
    assert.ok(wave.every((f) => INVASION_FAMILIES[3].kinds.includes(f.mobileType)), 'the family\'s own');
    if (k === 0) {
      const health = wave[0].entity.health;
      r.pool.damageFoe(wave[0], 10, null, null, { fromPlayer: false });
      assert.equal(wave[0].entity.health, health, 'no blow but the cell\'s word moves its health');
    }
    for (const f of wave) await slay(r, f);
  }
  assert.ok(log.hurt.length > 0, 'their swings landed on my feet');
  // THE BOSS: it rises after the tenth, physical; its rise said to every screen, and laughed
  await run(r, 16);
  const boss = r.pool.foes.find((f) => f.entity.invasionBoss);
  assert.ok(boss, 'the boss rises after wave 10');
  assert.equal(boss.mobileType, INVASION_FAMILIES[3].boss);
  assert.deepEqual([boss.entity.spells.length, boss.entity.magicka], [0, 0], 'no spells: every blow physical');
  assert.ok(log.news.some(([, t]) => t === invasionBossText('Gothway Garden')));
  assert.deepEqual(log.sounds, ['laugh']);
  assert.equal(invasionBossPose(boss, at.clock).holds, true, 'it rises');
  assert.equal(invasionBossPose(boss, at.clock + INVASION_RISE_MS).holds, false, 'and stands');
  await run(r, Math.ceil(INVASION_RISE_MS / 250) + 4);
  assert.equal(drawn(r).length, 0, 'its second phase: no waves');
  // THE THIRD PHASE: a third of its health, and waves come, the next as the last dies
  const fight = r.field._cell._fights().get(e.id);
  fight.boss.h = Math.floor(fight.boss.m / 3);
  for (let i = 0; i < 2; i++) {
    await run(r, 16);
    assert.equal(drawn(r).length, INVASION_PHASE3_WAVE, `phase three, wave ${i + 1}`);
    for (const f of drawn(r)) await slay(r, f);
  }
  // THE FALL: the receipt, rolled here, says it is an invasion's; the siege broken said to every screen; the event over
  fight.boss.h = 50;
  await slay(r, boss);
  await r.field._cell.settled();
  await run(r, 4);
  assert.equal(log.receipts.length, 1);
  const c = readStaffReceipt(log.receipts[0][0]);
  assert.deepEqual([c.v, c.s, c.tb, c.signed], [e.id, LOCAL_ACCOUNT, 1, false]);
  assert.ok(log.news.some(([, t]) => t === invasionWonText('Gothway Garden')));
  assert.equal(staffRaids().length, 0, 'over');
  assert.equal(log.raiders.length, 0, 'the raid\'s own path stood none of it');
  assert.equal(invasionBossPose(boss, 10_000_000).tilt, 0, 'its fall begins as it is first seen dead');
  assert.equal(invasionBossPose(boss, 10_000_000 + INVASION_FALL_MS).tilt, Math.PI / 2, 'and slowly ends on the ground');
});

test('TOYBOX OFFLINE: a dragon attack stands no raid - its row is a called world dragon at the city, at its minute; the row ends when that dragon falls (mutants: a raid boss stood; the row kept past the fall)', async () => {
  _resetCalledDragons();
  const { at, log, local } = rig();
  const r = local.start({ kind: 'dragon', city: CITY });
  assert.equal(r.ok, true);
  assert.equal(r.event.go, at.clock + TOYBOX_EVENT_WAIT_OFFLINE_MS);
  assert.deepEqual(log.news[0][1], dragonStagedText('Gothway Garden'));
  at.clock = r.event.go;
  await run(10);
  assert.equal(log.raiders.length, 0, 'nothing of a raid stands');
  const [o] = calledDragons();
  assert.deepEqual([o.ev, o.px, o.py, o.nm, dragonTimes(o).landAt], [r.event.id, CITY.px, CITY.py, 'Gothway Garden', r.event.go], 'the world dragon, called to the city at its hour');
  assert.equal(local.book().length, 1);
  noteCalledFell(r.event.id);
  local.tick();
  assert.equal(local.book().length, 0, 'its fall ends the row');
  assert.equal(dragonLandsText('Gothway Garden').length > 0, true);
});

test('TOYBOX: the laugh echoes, deep', () => {
  const played = [], later = [];
  assert.equal(invasionLaugh((clip, v, p) => played.push([clip, v, p]), (fn, ms) => later.push([fn, ms])), 1 + LAUGH_ECHOES);
  for (const [fn] of later) fn();
  assert.equal(played.length, 1 + LAUGH_ECHOES);
  assert.ok(played.every(([, , p]) => p < 1), 'slowed, so deep');
  assert.ok(played[1][1] < played[0][1], 'each echo quieter');
});
