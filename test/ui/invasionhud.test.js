// An invasion's readouts (ui/toybox/invasionHud.js): the side panel's lines by wave - the wave now and how many are
// left, the foes standing, the boss's state - and the boss's bar, the gate's, its three phases marked where the brain
// turns them, each spent as the boss passes it, its heavy blow called as it winds up.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { invasionTrackerModel, invasionBarModel, invasionBossName } from '../../src/ui/toybox/invasionHud.js';
import { INVASION_PHASE_AT, INVASION_BLOW } from '../../src/net/invasion/invasionBlows.js';
import { INVASION_WAVES, INVASION_FAMILIES } from '../../src/systems/toybox/toyboxLaw.js';

const EVENT = { id: 'tb12cd34ef', nm: 'Gothway Garden', b: 24 };
const foe = (i, dead = 0) => [i, 7, 100, 100, 0, 0, 0, 0, 0, 0, 0, dead];
const boss = (h, up = 0, dead = 0) => [0, 24, h, 1000, 0, 0, 0, 0, 0, 0, up, dead];
const state = (o) => ({ k: 'st', id: EVENT.id, sx: 0, sz: 0, w: 0, ph: 0, p3: 0, n: 0, np: 2, f: [], b: [], fl: 0, ...o });
const name = invasionBossName(24);

test('INVASION PANEL: its title, the wave now and how many are left, the foes standing and the boss\'s state, wave by wave', () => {
  assert.equal(name, 'Warlord Dagnub');
  const before = invasionTrackerModel(EVENT, null, 0);
  assert.deepEqual(before, { title: 'Invasion of Gothway Garden', wave: `Wave 1 of ${INVASION_WAVES} - 9 left`, foes: 'The next wave gathers', boss: 'Warlord Dagnub rises after the last wave', phase: 0 });
  assert.equal(invasionTrackerModel(EVENT, state({ w: 3, f: [foe(1), foe(2), foe(3, 1)] }), 0).wave, 'Wave 3 of 10 - 7 left');
  assert.equal(invasionTrackerModel(EVENT, state({ w: 3, f: [foe(1), foe(2), foe(3, 1)] }), 0).foes, '2 foes stand');
  assert.equal(invasionTrackerModel(EVENT, state({ w: 10, f: [foe(1)] }), 0).wave, 'Wave 10 of 10 - 0 left');
  assert.equal(invasionTrackerModel(EVENT, state({ w: 10, f: [foe(1)] }), 0).foes, '1 foe stands');
  const rising = invasionTrackerModel(EVENT, state({ w: 10, ph: 1, f: [boss(1000, 5000)] }), 1000);
  assert.deepEqual([rising.wave, rising.foes, rising.boss], ['All 10 waves broken', '', 'Warlord Dagnub rises from the ground']);
  assert.equal(invasionTrackerModel(EVENT, state({ w: 10, ph: 2, f: [boss(600)] }), 9000).boss, 'Warlord Dagnub - phase 2 of 3');
  const third = invasionTrackerModel(EVENT, state({ w: 10, ph: 3, p3: 1, f: [foe(40), boss(300)] }), 9000);
  assert.deepEqual([third.wave, third.foes, third.boss, third.phase], ['The waves are endless now', '1 foe stands', 'Warlord Dagnub - phase 3 of 3', 3]);
  assert.equal(invasionTrackerModel(EVENT, state({ w: 10, ph: 3, p3: 1, f: [boss(0, 0, 1)], fl: 9000 }), 9500).boss, 'Warlord Dagnub has fallen');
});

test('INVASION BAR: none before the boss rises; its three phases marked where the brain turns them, each spent as it passes; warded while it rises; its heavy blow called, MOVE when it holds my feet (mutant: the marks the gate\'s thirds)', () => {
  assert.equal(invasionBarModel(state({ w: 4, f: [foe(1)] }), 0), null);
  const up = invasionBarModel(state({ w: 10, ph: 1, f: [boss(1000, 5000)] }), 1000);
  assert.deepEqual([up.name, up.title, up.frac, up.warded, up.wardedText], ['Warlord Dagnub', 'Lord of the Invasion', 1, true, 'Rising']);
  assert.deepEqual(up.marks, [...INVASION_PHASE_AT]);
  assert.deepEqual(up.marks, [0.66, 1 / 3]);
  assert.deepEqual(up.spent, [false, false]);
  const second = invasionBarModel(state({ w: 10, ph: 2, np: 3, f: [boss(500)] }), 9000, { a: INVASION_BLOW.cleave, t: 0.5, aimed: true });
  assert.deepEqual([second.frac, second.spent, second.host, second.fightersLine, second.warded], [0.5, [true, false], 'Phase 2 of 3', '3 defenders', false]);
  assert.deepEqual([second.callout.text, second.callout.t, second.callout.move], ['Cleave', 0.5, true]);
  const third = invasionBarModel(state({ w: 10, ph: 3, f: [boss(50)] }), 9000, { a: INVASION_BLOW.stomp, t: 0.1, aimed: false });
  assert.deepEqual([third.spent, third.low, third.callout.text, third.callout.move], [[true, true], true, 'Quake Stomp', false]);
  const fell = invasionBarModel(state({ w: 10, ph: 3, f: [boss(0, 0, 1)], fl: 9000 }), 9100);
  assert.deepEqual([fell.fallen, fell.fallenText, fell.frac, fell.callout, fell.alpha], [true, 'Fallen', 0, null, 1]);
  assert.equal(invasionBarModel(state({ w: 10, ph: 3, f: [boss(0, 0, 1)], fl: 9000 }), 60_000).alpha, 0, 'and fades');
});

test('INVASION BOSS NAMES: each family\'s boss goes by its own name on the bar, the panel and the calls', () => {
  const named = Object.fromEntries(INVASION_FAMILIES.map((family) => [family.id, invasionBossName(family.boss)]));
  assert.deepEqual(named, {
    daedra: 'Daedric Commander',
    undead: 'Grand Necromancer',
    werewolves: 'The Grand Hunt',
    orcs: 'Warlord Dagnub',
    humans: 'Fallen Knight of Akatosh',
  });
  assert.equal(invasionBossName(7), 'Orc', 'a kind no family raises keeps its creature\'s name');
});
