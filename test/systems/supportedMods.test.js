import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_MODS, supportedModFound, identifyPacks, modFileKey, registerModTable, applyModFiles } from '../../src/systems/supportedMods.js';

test('MODS-BYO: all six packs are listed, each with a https link, and none counts as found without its files', () => {
  assert.deepEqual(SUPPORTED_MODS.map((m) => m.id), ['oda', 'reanimation', 'mao', 'hands', 'robert', 'gauntlets', 'bodies']);
  for (const m of SUPPORTED_MODS) {
    assert.match(m.url, /^https:\/\/www\.nexusmods\.com\//);
    assert.equal(supportedModFound(m.id), false);
    assert.ok(m.blurb);
  }
});

test('MODS-BYO: a pick lands on the path the loader reads, with or without its Data Files level', () => {
  const [mao] = identifyPacks(['MAO v0.72/Data Files/Meshes/Xbase_anim.kf', 'MAO v0.72/MAO_readme.txt']);
  assert.equal(mao.id, 'mao');
  assert.equal(modFileKey(mao, 'MAO v0.72/Data Files/Meshes/Xbase_anim.kf'), 'Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf');
  assert.equal(modFileKey(mao, 'MAO v0.72/MAO_readme.txt'), null);
  const [bare] = identifyPacks(['Meshes/xbase_anim.kf']);
  assert.equal(modFileKey(bare, 'Meshes/xbase_anim.kf'), 'Animations/Morrowind Animation Overhaul/Data Files/Meshes/xbase_anim.kf');
  const [re] = identifyPacks(['pack/00 Core/Animations/xbase_anim.1st/Idle2c;.kf']);
  assert.equal(modFileKey(re, 'pack/00 Core/Animations/xbase_anim.1st/Idle2c;.kf'), 'Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/Idle2c;.kf');
});

test('MODS-BYO: an attached file enters only its own table, and a table lookup finds it', () => {
  const walk = registerModTable({}, /morrowind animation overhaul\/data files\/meshes\/xbase_anim/);
  const hands = registerModTable({}, /better hands\/meshes\/b\//);
  applyModFiles([['Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf', 'blob:a']]);
  assert.deepEqual(Object.values(walk), ['blob:a']);
  assert.deepEqual(Object.keys(hands), []);
  assert.equal(supportedModFound('mao'), true);
  applyModFiles([]);
});
