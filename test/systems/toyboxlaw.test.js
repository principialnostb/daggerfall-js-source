// The toybox's law: who opens it, what /toybox reads as, and the families an invasion brings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mayToybox,
  parseToyboxCommand,
  INVASION_FAMILIES,
  invasionFamily,
  TOYBOX_OPTIONS,
  TOYBOX_ONLINE_ONLY,
  TOYBOX_EVENT_WAIT_MS,
  TOYBOX_EVENT_WAIT_OFFLINE_MS,
  DRAGON_ATTACK_RUN_MS,
} from '../../src/systems/toybox/toyboxLaw.js';
import { DRAGON_STAY_MS } from '../../src/net/dragon/dragonLaw.js';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';

test('mayToybox: the dev glyph alone opens it', () => {
  assert.equal(mayToybox(['dev']), true);
  assert.equal(mayToybox(['admin', 'dev']), true);
  assert.equal(mayToybox(['admin', 'mod']), false);
  assert.equal(mayToybox([]), false);
  assert.equal(mayToybox('dev'), false, 'a string is no glyph list');
  assert.equal(mayToybox(null), false);
});

test('parseToyboxCommand: /toybox, any case, nothing after it', () => {
  assert.deepEqual(parseToyboxCommand('/toybox'), { cmd: 'toybox' });
  assert.deepEqual(parseToyboxCommand('  /TOYBOX  '), { cmd: 'toybox' });
  assert.deepEqual(parseToyboxCommand('/toybox now'), { error: '/toybox takes nothing after it.' });
  assert.equal(parseToyboxCommand('/toyboxes'), null);
  assert.equal(parseToyboxCommand('toybox'), null);
  assert.equal(parseToyboxCommand('/dragon'), null);
  assert.equal(parseToyboxCommand(null), null);
});

test('the options: eight, the three powers toggles, Summon the one online-only', () => {
  assert.deepEqual(TOYBOX_OPTIONS.map((o) => o.id), ['invincible', 'noclip', 'ghost', 'teleport', 'summon', 'item', 'invasion', 'dragon']);
  assert.deepEqual(TOYBOX_OPTIONS.filter((o) => o.toggle).map((o) => o.id), ['invincible', 'noclip', 'ghost']);
  assert.deepEqual([...TOYBOX_ONLINE_ONLY], ['summon']);
});

test('INVASION_FAMILIES: their kinds and bosses are these MobileTypes, in the dropdown order', () => {
  const name = (n) => Object.keys(MOBILE_TYPES).find((k) => MOBILE_TYPES[k] === n);
  const want = {
    daedra: [['FrostDaedra', 'FireDaedra', 'Daedroth', 'DaedraSeducer', 'FireAtronach', 'IronAtronach', 'FleshAtronach', 'IceAtronach'], 'DaedraLord'],
    undead: [['SkeletalWarrior', 'Zombie', 'Ghost', 'Mummy', 'Wraith', 'Vampire'], 'AncientLich'],
    werewolves: [['Werewolf', 'Wereboar'], 'Werewolf'],
    orcs: [['Orc', 'OrcSergeant', 'OrcShaman'], 'OrcWarlord'],
    humans: [['Warrior', 'Knight', 'Barbarian', 'Archer', 'Rogue', 'Battlemage', 'Spellsword'], 'Knight'],
  };
  assert.deepEqual(INVASION_FAMILIES.map((f) => f.id), Object.keys(want));
  assert.deepEqual(INVASION_FAMILIES.map((f) => f.label), ['Daedra', 'Undead', 'Werewolves', 'Orcs', 'Humans']);
  for (const f of INVASION_FAMILIES) {
    assert.deepEqual(f.kinds.map(name), want[f.id][0], f.id);
    assert.equal(name(f.boss), want[f.id][1], `${f.id} boss`);
  }
  assert.equal(invasionFamily('orcs')?.label, 'Orcs');
  assert.equal(invasionFamily('dragons'), null);
});

test('the waits and the dragon attack\'s run: offline a minute, online ten; the run the world dragon\'s stay, so the event ends as it leaves', () => {
  assert.equal(TOYBOX_EVENT_WAIT_OFFLINE_MS, 60_000);
  assert.equal(TOYBOX_EVENT_WAIT_MS, 600_000);
  assert.equal(DRAGON_ATTACK_RUN_MS, DRAGON_STAY_MS);
});
