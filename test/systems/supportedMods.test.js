import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_MODS, supportedModFound } from '../../src/systems/supportedMods.js';

test('MODS-BYO: all six packs are listed, each with a https link, and none counts as found without its files', () => {
  assert.deepEqual(SUPPORTED_MODS.map((m) => m.id), ['oda', 'reanimation', 'mao', 'hands', 'robert', 'bodies']);
  for (const m of SUPPORTED_MODS) {
    assert.match(m.url, /^https:\/\/www\.nexusmods\.com\//);
    assert.equal(supportedModFound(m.id), false);
  }
});
