// The pixels' reads from the kept confirmations (server-account/src/groundConfirmed.js): once the fill is done,
// `/v1/prof/pixels` and a harvest read a pixel's kept row - never its every report - and answer what the law says of its
// reports, a disputed pixel as the confirmed one it stands as. While the fill runs, both read the reports as before.
// tools/mutants/ground_reads.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { standService, T0 } from '../accountDb.mjs';
import { veins, nodeKey, witnessedFact, factConfirmed } from '../../src/net/nodeLaw.js';
import { sharedClassicMinutes } from '../../src/net/wire.js';
import { utcDay } from '../../src/net/marksLaw.js';

const DAY = 86_400;
const WOODS = 231, MOUNTAIN = 226, GLENUMBRA = 59, ANTICLERE = 21;
const hourAt = (seconds) => Math.floor((((Math.floor(sharedClassicMinutes(seconds * 1000)) % 1440) + 1440) % 1440) / 60);
function secondAt(from, want) {
  for (let s = from; s < from + 2 * 7200; s += 30) if (hourAt(s) === want && hourAt(s - 60) === want && hourAt(s + 60) === want) return s;
  throw new Error('no such hour');
}
const NOON = secondAt(utcDay(T0) * DAY + 3600, 12);
const realNow = Date.now;
Date.now = () => NOON * 1000;
test.after(() => { Date.now = realNow; });
let _rid = 0;
const rid = () => `grd-${String(++_rid).padStart(6, '0')}`;

/** A seeded stream of numbers in [0, 1), so a failure is the same failure on every run. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The service, a dozen witnesses, the statements its database is asked, and a way to file a report as the harvest does. */
async function stand({ filling = false } = {}) {
  const s = await standService({ PROFESSIONS_OPEN: 'on' });
  const raw = s.env.DB._raw;
  for (let i = 0; i < 12; i++) raw.prepare("INSERT INTO players (id, guest_name, created_at, last_seen) VALUES (?, 'g', 1, 1)").run(`w${i}`);
  if (filling) raw.exec("UPDATE ground_confirmed_fill SET after = '', done = 0");
  const put = raw.prepare("INSERT OR IGNORE INTO world_witness (kind, key, account, report, region, at) VALUES ('pixel', ?, ?, ?, ?, ?)");
  const say = (key, account, climate, region, at) => put.run(key, account, `${climate},${region}`, region, at);
  const said = [];
  const prepare = s.env.DB.prepare.bind(s.env.DB);
  s.env.DB.prepare = (sql) => { said.push(sql); return prepare(sql); };
  return { s, raw, say, said };
}
const REPORTS_READ = /SELECT key, account, report, at FROM world_witness/;
const KEPT_READ = /FROM ground_confirmed WHERE key IN/;

/** What the route should answer of `key`, from the law over its reports: a disputed pixel as confirmed. */
function lawView(raw, key) {
  const rows = raw.prepare("SELECT account, report, at FROM world_witness WHERE kind = 'pixel' AND key = ?").all(key).map((row) => ({ ...row, at: Number(row.at) }));
  const fact = witnessedFact(rows);
  if (factConfirmed(fact)) return { state: 'confirmed', climate: fact.climate, region: fact.region };
  return { state: fact.state };
}

test('the pixels\' route reads the kept confirmations once the fill is done - never a pixel\'s every report - and answers what the law says of each, confirmed, unconfirmed or none, a disputed pixel as confirmed (mutants: the reports read still; an unconfirmed pixel said as none)', async () => {
  const { s, raw, say, said } = await stand();
  const rand = seeded(17);
  let at = NOON - 10 * DAY;
  for (let i = 0; i < 300; i++) {
    at += 1 + Math.floor(rand() * 600);
    say(`${300 + Math.floor(rand() * 25)},200`, `w${Math.floor(rand() * 12)}`, [MOUNTAIN, MOUNTAIN, WOODS][Math.floor(rand() * 3)], [ANTICLERE, GLENUMBRA][Math.floor(rand() * 2)], at);
  }
  // a disputed pixel: three agree, then two say another answer
  for (const [account, climate, t] of [['w0', MOUNTAIN, 1], ['w1', MOUNTAIN, 2], ['w2', MOUNTAIN, 3], ['w3', WOODS, 4], ['w4', WOODS, 5]]) say('330,200', account, climate, ANTICLERE, NOON - DAY + t);
  const asked = [...Array.from({ length: 23 }, (_, i) => [300 + i, 200]), [330, 200], [400, 200]];
  const keys = asked.map(([x, y]) => `${x},${y}`);
  const states = new Set(keys.map((k) => lawView(raw, k).state));
  assert.ok(states.has('confirmed') && states.has('unconfirmed') && states.has('none'), `every state among them: ${[...states]}`);
  const reportsBefore = raw.prepare("SELECT account, report, at FROM world_witness WHERE kind = 'pixel' AND key = '330,200'").all().map((row) => ({ ...row, at: Number(row.at) }));
  assert.equal(witnessedFact(reportsBefore).state, 'disputed', 'the law disputes 330,200');
  const who = await s.seated('Reader');
  for (const round of [0, 1]) {
    said.length = 0;
    const r = await s.call('/v1/prof/pixels', { character: who.character, pixels: asked }, who.secret);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    for (const p of r.body.pixels) assert.deepEqual(p, { x: p.x, y: p.y, ...lawView(raw, `${p.x},${p.y}`) }, `round ${round}, ${p.x},${p.y}`);
    assert.ok(said.some((q) => KEPT_READ.test(q)), 'the kept rows read');
    assert.ok(!said.some((q) => REPORTS_READ.test(q)), 'and no pixel\'s every report');
  }
});

test('while the fill runs the pixels\' route reads the reports, as before it, and answers the law (mutants: the fill unread; the kept rows trusted mid-fill)', async () => {
  const { s, raw, say, said } = await stand({ filling: true });
  for (const [account, t] of [['w0', 1], ['w1', 2], ['w2', 3]]) say('500,200', account, MOUNTAIN, ANTICLERE, NOON - DAY + t);
  raw.exec("DELETE FROM ground_confirmed");   // filed before the table: not read in yet
  const who = await s.seated('Reader');
  const r = await s.call('/v1/prof/pixels', { character: who.character, pixels: [[500, 200], [501, 200]] }, who.secret);
  assert.deepEqual(r.body.pixels, [{ x: 500, y: 200, state: 'confirmed', climate: MOUNTAIN, region: ANTICLERE }, { x: 501, y: 200, state: 'none' }]);
  assert.ok(said.some((q) => REPORTS_READ.test(q)), 'the reports read');
});

/** A harvest of a Woodlands vein claimed for Glenumbra on a pixel three accounts confirmed for Anticlere - refused. */
async function claimAgainst({ s, raw, say }) {
  for (const [account, t] of [['w0', 1], ['w1', 2], ['w2', 3]]) say('600,200', account, WOODS, ANTICLERE, NOON - DAY + t);
  const who = await s.seated('Miner');
  raw.prepare('UPDATE players SET registered_at = ? WHERE id = ?').run(NOON - 8 * DAY, who.id);
  const v = veins({ x: 600, y: 200, day: utcDay(NOON), climate: WOODS, region: GLENUMBRA })[0];
  const body = { character: who.character, node: nodeKey({ kind: 'vein', x: 600, y: 200, day: utcDay(NOON), slot: v.slot }), kind: 'ore', climate: WOODS, region: GLENUMBRA, act: { glints: 0 }, at: NOON - 2, rid: rid() };
  return s.call('/v1/prof/harvest', body, who.secret);
}

test('a harvest reads its pixel\'s kept row once the fill is done - one row, never its every report - and a claim against confirmed ground is still refused (mutants: the reports read still)', async () => {
  const rig = await stand();
  rig.said.length = 0;
  const r = await claimAgainst(rig);
  assert.deepEqual([r.status, r.body], [409, { error: 'prof-pixel' }]);
  assert.ok(rig.said.some((q) => /FROM ground_confirmed WHERE key IN \(\?1\)/.test(q)), 'its kept row read');
  assert.ok(!rig.said.some((q) => REPORTS_READ.test(q)), 'and not its reports');
});

test('while the fill runs a harvest reads its pixel\'s reports, and a claim against ground confirmed before the table is refused (mutants: the kept rows trusted mid-fill)', async () => {
  const rig = await stand({ filling: true });
  const reportsOnly = rig.s.env.DB.prepare;
  let cleared = false;
  // the pixel's kept row gone, as a pixel filed before the table and not read in yet
  rig.s.env.DB.prepare = (sql) => {
    if (!cleared && /FROM ground_confirmed_fill/.test(sql)) { rig.raw.exec('DELETE FROM ground_confirmed'); cleared = true; }
    return reportsOnly(sql);
  };
  const r = await claimAgainst(rig);
  assert.deepEqual([r.status, r.body], [409, { error: 'prof-pixel' }]);
  assert.ok(rig.said.some((q) => REPORTS_READ.test(q)), 'its reports read');
});
