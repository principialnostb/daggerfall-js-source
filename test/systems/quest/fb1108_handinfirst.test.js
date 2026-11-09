// S0000020 on the real parser and machine: its `until _S.02_ performed:` block clears `_S.00_` (clicked npc
// _Mynisera_) as she offers the quest, so `_S.00_` re-armed on the next click and took the letter's hand-in from
// `_S.06_`. With the letter carried, the hand-in takes the click (actions.js handInWaits).
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { QuestMachine } from '../../../src/systems/quest/machine.js';
import { loadTables, worldOf, dungeon, questScript, rdbBlock } from '../../fb1004dTowns.mjs';

loadTables();
const MYNISERA = 366; // Quests-Factions.txt
const sym = (name) => ({ name });

/** The quest started, Morgiah satisfied, Mynisera's offer taken (her click, then Yes), Gortwog's letter given. */
function treaty() {
  const orsinium = dungeon({ name: 'Orsinium', locationIndex: 0, mapId: 50014, dungeonType: 0 });
  const world = worldOf({ locations: [orsinium], blocks: new Map([['DUNG.RDB', rdbBlock()]]) });
  world.getFactionData = (id) => ({ id, type: 4, rep: 0, name: 'Royal', parent: 0, flags: 0 }); // every named person an individual
  const pack = [];
  const said = [];
  const machine = new QuestMachine({
    nowSeconds: () => 0, world, getReputation: () => 0, changeReputation: () => {},
    carriesQuestItem: (res) => pack.some((it) => it.questItem && it.questUID === res.parentQuest?.uid && it.questSymbol?.name === res.symbol?.name),
    releaseQuestItem: (uid, res) => { for (let i = pack.length - 1; i >= 0; i--) if (pack[i].questUID === uid && pack[i].questSymbol?.name === res.symbol?.name) pack.splice(i, 1); },
  });
  const quest = machine.parseQuestForLists(questScript('S0000020'), 0, {});
  machine.startQuestImmediate(quest);
  machine.tick();
  const msg = quest.showMessagePopup.bind(quest);
  quest.showMessagePopup = (id, ...r) => { said.push(id); return msg(id, ...r); };
  /** Mynisera's own figure in Castle Daggerfall, clicked (the home copy's behaviour, its individual broadcast). */
  const click = () => {
    machine.setupIndividualStaticNPC({ staticNpcFactionId: MYNISERA, setActive: () => {} }, MYNISERA).doClick();
    machine.tick();
  };
  const set = (name) => !!quest.tasks.get(name)?.getTriggerValue();
  quest.startTask(sym('S.01')); // MorgiahSatisfied
  machine.tick();
  click(); // her offer
  assert.ok(set('S.02'), 'her click asked');
  quest.startTask(sym('yes'));
  machine.tick();
  quest.startTask(sym('S.05')); // Gortwog read her letter
  machine.tick();
  const takeLetter = () => pack.push({ questItem: true, questUID: quest.uid, questSymbol: { name: 'EmperorsLetter' } });
  return { machine, quest, pack, said, click, set, takeLetter };
}

test('FB1108 HAND-IN-FIRST: back from Orsinium with the Emperor\'s letter, the FIRST click on Mynisera hands it in - her words, the letter taken (mutant: `_S.00_`, re-arming, takes the click and nothing happens)', () => {
  const t = treaty();
  assert.equal(t.set('S.00'), false, 'the offer\'s tick cleared `_S.00_` (the until block)');
  t.takeLetter();
  t.click();
  assert.ok(t.set('S.06'), 'the hand-in fired on the first click');
  assert.ok(t.said.includes(1030), 'Mynisera read the letter (1030)');
  assert.equal(t.pack.length, 0, 'the letter left the pack');
});

test('FB1108 HAND-IN-FIRST: a copy whose `_S.00_` is unset before every click (a party resync, a load) still hands the letter in (mutant: every click lost)', () => {
  const t = treaty();
  t.takeLetter();
  for (let i = 0; i < 3 && !t.set('S.06'); i++) {
    t.quest.tasks.get('S.00').clear();
    t.click();
  }
  assert.ok(t.set('S.06'), 'handed in');
  assert.ok(t.said.includes(1030));
});

test('FB1108 HAND-IN-FIRST: without the letter the click is DFU\'s - `_S.00_` takes it and the hand-in waits (mutant: the click left to a hand-in the player cannot make)', () => {
  const t = treaty();
  t.click();
  assert.ok(t.set('S.00'), '`_S.00_` took the click');
  assert.equal(t.set('S.06'), false, 'no letter, no hand-in');
  t.takeLetter();
  t.click();
  assert.ok(t.set('S.06'), 'with the letter, the next click hands it in');
});
