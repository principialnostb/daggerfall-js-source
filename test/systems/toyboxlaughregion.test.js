// The invasion boss's laugh at its rise is heard in the boss's own area alone - on the Bay its region, past the Bay its
// province's district - while the rise's line still goes to every screen.
import '../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { raidRelayWord, setRaidingPartiesHost, restoreRaidSaveData, _resetRaidingParties } from '../../src/systems/raidingParties.js';
import { _resetStaffEvents } from '../../src/systems/staffEvents.js';
import { setSharedClock } from '../../src/systems/worldTick.js';
import { MINUTES_PER_DAY } from '../../src/systems/gameDate.js';
import { _resetModSettings, setModSetting } from '../../src/systems/modSettings.js';
import { createLocalToyboxEvents } from '../../src/systems/toybox/localToyboxEvents.js';
import { _resetLocalInvasions } from '../../src/systems/toybox/localInvasion.js';
import { _resetToyboxNews, setToyboxSound, invasionBossText } from '../../src/systems/toybox/toyboxNews.js';
import { startToyboxEvent } from '../../src/net/toyboxEvents.js';

const BAY = { rg: 3, loc: 7, px: 200, py: 100, nm: 'Gothway Garden', ct: 1 };
const PAST = { rg: 64, loc: -1000123, px: 1450, py: -220, nm: 'Mournhold', ct: 1 };

beforeEach(() => {
  _resetRaidingParties();
  _resetStaffEvents();
  _resetModSettings();
  _resetLocalInvasions();
  setModSetting('world-events-raiding-parties', 'Enabled', true);
  setSharedClock(null);
});

/** An invasion staged at `city`, its boss's rise heard by a player in `region` on `pixel`: the lines and the sounds. */
async function bossRiseHeard(city, region, pixel) {
  const clock = 1_800_000_000_000;
  const news = [], sounds = [];
  let local = null;
  setRaidingPartiesHost({
    now: () => 400 * MINUTES_PER_DAY + 600, random: () => 0, wallNow: () => 100000, relayNow: () => clock, selfId: () => 'me',
    maps: () => null, picker: () => null, regionIndex: () => region, regionName: (r) => `Region${r}`, townHere: () => null,
    playerPixel: () => pixel, peersInTown: () => [], raidPuppets: () => [], ownRaidFoes: () => [], relayRaids: () => false,
    standRaider: () => Promise.resolve(null), standDefender: () => Promise.resolve(null), defenderCount: () => 0,
    defendersAllowed: () => true, removeFoe: () => {}, outOfSight: () => true, say: () => {},
    reputation: () => ({ player: { legalRep: {} }, store: { dict: new Map() } }), sendRaid: (w) => local.word(w),
  });
  local = createLocalToyboxEvents({ deliver: (sev, room) => raidRelayWord({ k: 'sev', sev }, room), now: () => clock, rand: () => 0.25, name: () => 'Dev' });
  _resetToyboxNews((kind, text) => news.push(text));
  setToyboxSound((cue) => sounds.push(cue));
  restoreRaidSaveData({ lastSelectedDay: 400, raids: [] });
  const started = await startToyboxEvent({ kind: 'invasion', city: city.nm, family: 'orcs' }, { online: () => false, local, cities: () => [{ name: city.nm, ...city }] });
  assert.equal(started.ok, true, JSON.stringify(started));
  raidRelayWord({ k: 'sev', sev: { k: 'tb', id: started.event.id, s: 'boss' } }, 'social');
  return { rose: news.includes(invasionBossText(city.nm)), sounds };
}

test('THE LAUGH ON THE BAY: heard in the boss\'s region, not in another, not at sea; the line said everywhere (mutants: the laugh everywhere; the line kept from another region)', async () => {
  assert.deepEqual(await bossRiseHeard(BAY, 3, { x: 200, y: 100 }), { rose: true, sounds: ['laugh'] });
  assert.deepEqual(await bossRiseHeard(BAY, 4, { x: 300, y: 100 }), { rose: true, sounds: [] });
  assert.deepEqual(await bossRiseHeard(BAY, -1, { x: 200, y: 100 }), { rose: true, sounds: [] });
});

test('THE LAUGH PAST THE BAY: heard in the boss\'s district of its province, not in a far district of the same province, nor on the Bay (mutants: the province\'s region for its district)', async () => {
  assert.deepEqual(await bossRiseHeard(PAST, 64, { x: 1450, y: -220 }), { rose: true, sounds: ['laugh'] });
  assert.deepEqual(await bossRiseHeard(PAST, 64, { x: 1450 + 400, y: -220 }), { rose: true, sounds: [] });
  assert.deepEqual(await bossRiseHeard(PAST, 3, { x: 200, y: 100 }), { rose: true, sounds: [] });
});
