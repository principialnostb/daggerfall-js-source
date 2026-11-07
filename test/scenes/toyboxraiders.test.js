// A toybox event's raider is an older build's: this build stands none for one (its foes are its cell's, its dragon the
// world's), so a peer's raider tagged with a toybox event's key stands no puppet here - the Dwarven Dragons an older
// game stood the moment a Dragon Attack was staged. A plain staff event's raider still stands. Mutants:
// tools/mutants/toyboxraiders.json.
import '../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createExteriorFoes } from '../../src/scenes/exteriorFoes.js';
import { staffEventBook, toyboxRaidKey, _resetStaffEvents } from '../../src/systems/staffEvents.js';
import { staffEventKey } from '../../src/net/staffEvent/staffEventLaw.js';
import { toyboxStaffEvent } from '../../src/net/staffEvent/toyboxEvent.js';

function craftCfg({ hpPerLevel = 4, speed = 90, str = 40, agi = 85, luck = 55, atkFlags = 0x08 } = {}) {
  const b = new Uint8Array(74); const v = new DataView(b.buffer);
  b[10] = atkFlags; v.setUint16(52, hpPerLevel, true);
  const attrs = [str, 50, 50, agi, 50, 50, speed, luck];
  for (let i = 0; i < 8; i++) v.setUint16(58 + i * 2, attrs[i], true);
  return b;
}
function craftMonsterBsa(records) {
  const NAME_FIELD = 14, ENTRY = 18;
  const dataLen = records.reduce((a, [, b]) => a + b.length, 0);
  const out = new Uint8Array(4 + dataLen + ENTRY * records.length); const v = new DataView(out.buffer);
  v.setInt16(0, records.length, true); v.setUint16(2, 0x0100, true);
  let pos = 4;
  for (const [, bytes] of records) { out.set(bytes, pos); pos += bytes.length; }
  for (const [name, bytes] of records) { for (let i = 0; i < name.length; i++) out[pos + i] = name.charCodeAt(i); v.setInt32(pos + NAME_FIELD, bytes.length, true); pos += ENTRY; }
  return out;
}
const bsa = craftMonsterBsa([['ENEMY000.CFG', craftCfg()]]);
const stubTex = { getSize: () => ({ width: 64, height: 100 }), getScale: () => ({ width: 0, height: 0 }), recordCount: 8, getFrameCount: () => 1 };
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const playerEntity = () => ({ level: 1, reflexes: 2, health: 50, maxHealth: 50, skills: new Array(40).fill(20), skillUses: new Array(40).fill(0), items: [], activeEffects: [], stats: { strength: 50, agility: 50, luck: 50, speed: 50, endurance: 50 }, armorValues: new Array(7).fill(60) });
function pool() {
  const p = createExteriorFoes({
    renderer: { createBillboardBatch: () => ({}), destroyBillboardBatch: () => {}, textures: new Map() },
    collider: { raycast: () => Infinity, heightAt: () => 0, raycastHit: () => ({ dist: Infinity, normal: null }), sphereOverlaps: () => false, capsuleCast: () => ({ dist: Infinity, key: null }), sphereCast: () => ({ dist: Infinity, key: null }), move: (feet, mx, my, mz) => { feet[0] += mx; feet[2] += mz; return { grounded: true, hitCeiling: false, groundKey: 'floor' }; } },
    fetchBytes: async (n) => { if (n === 'MONSTER.BSA') return bsa; throw new Error(`no ${n} in this pin`); },
    getTexture: async () => stubTex, uploadRecordFrame: () => {},
    currentMinute: () => 0, currentPixelKey: () => '3,12',
    playerEntity: playerEntity(), audio: null, onPlayerHurt: () => {}, rolls: () => 0.01, rand: () => 0.01,
  });
  p.setNet({ room: () => 'world:3,12', selfId: () => 'mmm-0002', peers: () => [], now: () => 0, staleMs: 0, onPeerHit: () => true, toWire: (f) => [f[0], f[1], f[2]], toScene: (w) => [w[0], w[1], w[2]] });
  return p;
}
const OLD = 'old-0006';
const rec = (i) => ({ i, t: 0, x: 0, f: [100 + i, 0, 100], y: 0, h: 10, k: 10, d: 0 });
let n = 0;
const send = async (p, frame) => { p.applyFoes(OLD, { n: ++n, ...frame }); await settle(); };
const CITY = { rg: 3, loc: 7, px: 200, py: 100, nm: 'Gothway Garden' };
const PLAIN = { id: 'ab12cd34ef', rg: 3, loc: 7, px: 200, py: 100, nm: 'Gothway Garden', ct: 1, mt: [0], n: 6, m: 3, b: 24, bs: 250, bh: 20, at: 1_700_000_000_000, ue: 0, eb: 1, fb: 0, by: 'SirMcMobdon' };
const toybox = (kind, id) => {
  const made = toyboxStaffEvent({ kind, place: CITY, family: kind === 'invasion' ? 'undead' : undefined, id, at: Date.now(), by: 'SirMcMobdon' });
  assert.ok('ev' in made, JSON.stringify(made));
  return made.ev;
};

beforeEach(() => _resetStaffEvents());

test('TOYBOX-RAIDERS a raider tagged with a toybox event is an older build\'s - a Dragon Attack\'s or an invasion\'s - and a plain staff event\'s or a day\'s raid is not', () => {
  const dragon = toybox('dragon', 'dd11ee22ff');
  staffEventBook([PLAIN, dragon]);
  assert.equal(toyboxRaidKey(staffEventKey(dragon.id)), true, 'the Dragon Attack\'s');
  assert.equal(toyboxRaidKey(staffEventKey(PLAIN.id)), false, 'a plain staff event\'s');
  assert.equal(toyboxRaidKey('1:2:3'), false, 'a day\'s raid');
  assert.equal(toyboxRaidKey(null), false);
});

test('TOYBOX-RAIDERS an older build\'s raiders of a staged Dragon Attack stand no puppet here; a plain staff event\'s still do', async () => {
  const dragon = toybox('dragon', 'dd11ee22ff');
  staffEventBook([PLAIN, dragon]);
  const reader = pool();
  const theirs = [rec(1), rec(2)];
  await send(reader, { f: theirs, rz: theirs.map((r) => [r.i, staffEventKey(dragon.id)]) });
  assert.equal(reader.foes.filter((f) => f.puppet === OLD && !f.dead).length, 0, 'the Dragon Attack\'s raiders: none');
  const plain = [rec(3)];
  await send(reader, { f: [...theirs, ...plain], rz: [...theirs.map((r) => [r.i, staffEventKey(dragon.id)]), [3, staffEventKey(PLAIN.id)]] });
  const live = reader.foes.filter((f) => f.puppet === OLD && !f.dead);
  assert.equal(live.length, 1, 'the plain event\'s raider stands');
  assert.equal(live[0]._pupRaid, staffEventKey(PLAIN.id));
});
