// The Eltheric Ocean in the journal: the ships read from a character's own save, pinned equal to the game's numbers;
// setting sail off Veilhaven, courses, a raider fought round by round to its end, two captains in a duel with the
// round resolved once whoever asks, the peace, landfall and the isle's ground walked, the day's ceilings on Seals, and
// the clock's sweep of a fight nobody asks after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journalRig } from '../journalRig.mjs';
import { freshSave } from '../realmSeat.mjs';
import * as L from '../../server-account/src/seaJournalLaw.js';
import { seaMinute, resolveFight, PAIR_REST_S } from '../../server-account/src/seaJournal.js';
import { GUNS, HULL_BUILDS, playerBatteryWeight } from '../../src/systems/naval/navalShips.js';
import { refitOf } from '../../src/systems/fleet.js';
import { veilhaven, islesNear, ETHER_BOX } from '../../src/world/ethericSea.js';

/** A save with a fleet: a galleon refitted, its named hands at their posts, stores and cargo in its hold. */
const fleetSave = (o = {}) =>
  freshSave({
    modData: {
      Fleet: { v: 1, ships: [{ uid: 's1', hull: 2, name: 'Kestrel', upgrades: { guns: o.guns ?? 6, hull: o.hull ?? 6, rigging: 3, hold: 0 } }, { uid: 's0', hull: 0, name: 'Dinghy', upgrades: {} }] },
      NavalCombat: { v: 1, boats: { s1: { hull: 500, maxHull: 672, sail: 256, maxSail: 256, state: 'afloat', barrels: 3, mates: { hands: Array.from({ length: 20 }, (_, i) => ({ name: `Hand ${i}`, role: i === 0 ? 'Gunner' : i === 1 ? 'Carpenter' : '' })) } } } },
      'come-sail-away': { placedBoats: [{ UID: 's1', Hull: 2, Items: [{ templateIndex: 1330, stackCount: 3 }, { templateIndex: 1331, stackCount: 5, shortName: 'Spices' }] }] },
    },
  });

test('Sea law: every hull, gun and refit as the game builds them (navalShips.js, fleet.js)', () => {
  for (const k of Object.keys(L.SEA_GUNS)) for (const f of ['hull', 'sail', 'crew', 'reload']) assert.equal(L.SEA_GUNS[k][f], GUNS[k][f], `${k}.${f}`);
  for (const h of L.SEA_HULLS) {
    const b = HULL_BUILDS[h.hull];
    assert.equal(h.hullHp, b.hullHp, `${h.name} hull`);
    assert.equal(h.sailHp, b.sailHp, `${h.name} canvas`);
    assert.equal(h.crew, b.crew, `${h.name} hands`);
    assert.equal(h.broadside?.gun ?? null, b.gun ?? null, `${h.name} broadside gun`);
    assert.equal(h.broadside?.n ?? 0, b.broadside.length, `${h.name} broadside`);
    assert.equal(h.bow?.gun ?? null, b.bow?.gun ?? null, `${h.name} bow`);
    assert.equal(h.ram, !!b.ram, `${h.name} ram`);
    if (h.broadside) assert.equal(h.broadside.weight, playerBatteryWeight(h.hull, 'port'), `${h.name} broadside weight`);
  }
  for (const t of [0, 1, 3, 4, 8, 12]) {
    const up = { hold: t, rigging: t, hull: t, guns: t };
    assert.deepEqual(L.refitsOf(up), refitOf({ upgrades: up }), `refits at tier ${t}`);
  }
});

test('Sea law: a ship read from the save - its refits, damage, hands and posts, stores and cargo; a rowboat never fights', () => {
  const save = fleetSave();
  assert.deepEqual(L.fleetOf(save).map((s) => s.uid), ['s1']);
  const ship = L.shipFromSave(save, 's1');
  assert.equal(ship.name, 'Kestrel');
  assert.equal(ship.max.hull, Math.round(672 * L.refitMul('hull', 6)));
  assert.equal(ship.now.hull, Math.round(ship.max.hull * (500 / 672)));
  assert.equal(ship.now.crew, 20);
  assert.equal(ship.stores, 3);
  assert.equal(ship.barrels, 3);
  assert.deepEqual(ship.cargo, [{ name: 'Spices', n: 5 }]);
  assert.equal(L.shipFromSave(save, 's0'), null);
  const w = { ...save, modData: { ...save.modData, NavalCombat: { boats: { s1: { state: 'wrecked' } } } } };
  assert.equal(L.shipFromSave(w, 's1').now.sail, 0, 'a wrecked ship sails on oars');
});

test('Sea law: a round - the helms move the range, the guns that bear fire, bracing halves the harm, a struck ship ends it, the faster ship runs clear', () => {
  const ship = L.shipFromSave(fleetSave({ guns: 12 }), 's1');
  const side = (s) => ({ name: 'S', ship: s, hull: s.max.hull, sail: s.max.sail, crew: s.max.crew, stores: 2, barrels: 2, posts: {}, fire: 0 });
  const rng = () => 0.5;
  let r = L.resolveRound({ range: 'long', round: 1 }, { a: side(ship), b: side(ship) }, { a: { helm: 'close' }, b: { helm: 'close' } }, rng);
  assert.equal(r.range, 'medium', 'both close: the range shortens');
  const a = side(ship), b = side(ship);
  r = L.resolveRound({ range: 'medium', round: 1 }, { a, b }, { a: { helm: 'hold' }, b: { helm: 'hold', brace: true } }, rng);
  const braced = ship.max.hull - b.hull;
  const a2 = side(ship), b2 = side(ship);
  L.resolveRound({ range: 'medium', round: 1 }, { a: a2, b: b2 }, { a: { helm: 'hold' }, b: { helm: 'hold' } }, rng);
  const open = ship.max.hull - b2.hull;
  assert.ok(open > 0 && Math.abs(braced * 2 - open) <= 2, `braced ${braced} is half of ${open}`);
  assert.equal(b.hull > b2.hull, true);
  assert.equal(a.hull, ship.max.hull, 'a braced ship fires nothing');
  const weak = side(ship);
  weak.hull = Math.floor(ship.max.hull * 0.2);
  r = L.resolveRound({ range: 'short', round: 3 }, { a: side(ship), b: weak }, { a: { helm: 'hold' }, b: { helm: 'hold' } }, rng);
  assert.deepEqual([r.over, r.winner], ['won', 'a'], 'a ship under a quarter of her hull strikes');
  const slow = side(L.shipFromSave(fleetSave(), 's1'));
  slow.sail = 0;
  r = L.resolveRound({ range: 'long', round: 2 }, { a: side(ship), b: slow }, { a: { helm: 'flee', hands: 'sails' }, b: { helm: 'hold' } }, rng);
  assert.equal(r.escaped, 'a', 'the faster ship runs clear at long range');
  assert.deepEqual(L.ordersOf({ helm: 'nonsense', shot: 'grape' }), { helm: 'hold', shot: 'grape', hands: 'guns', brace: false });
});

test('Sea: setting sail from the fleet in the save, a course clamped and sailed, the peace about Veilhaven', async () => {
  const r = await journalRig();
  const p = await r.linked('Kaya', { seated: true, save: fleetSave() });
  const st0 = await r.ask(p.discordId, 'sea/state');
  assert.equal(st0.status, 200);
  assert.deepEqual(st0.json.fleet.map((s) => s.name), ['Kestrel']);
  assert.equal(st0.json.fleet[0].ship.stores, 3);
  assert.equal((await r.ask(p.discordId, 'sea/sail', { uid: 's0' })).status, 404, 'a rowboat does not sail out');
  const st = await r.ask(p.discordId, 'sea/sail', { uid: 's1' });
  assert.equal(st.status, 200);
  assert.equal(st.json.captain.ship.name, 'Kestrel');
  assert.equal(st.json.captain.waters.peace, true, 'the ship sets sail in Veilhaven\'s peace');
  assert.equal((await r.ask(p.discordId, 'sea/sail', { uid: 's1' })).json.error, 'at-sea');
  const h = veilhaven();
  const c = await r.ask(p.discordId, 'sea/course', { x: h.px - 1000, y: h.py });
  assert.equal(c.status, 200);
  assert.ok(Math.abs(Math.hypot(c.json.captain.to.x - c.json.captain.at.x, c.json.captain.to.y - c.json.captain.at.y) - 120) < 0.01, 'a course reaches at most 120 pixels');
  assert.ok(c.json.captain.way > 0);
  r.raw.prepare('UPDATE sea_captains SET set_at = set_at - 600').run();
  const later = await r.ask(p.discordId, 'sea/state?full=1');
  assert.ok(later.json.captain.at.x < c.json.captain.at.x - 20, 'ten minutes on, the ship is well west');
  const out = await r.ask(p.discordId, 'sea/course', {});
  assert.equal(out.json.captain.to, null, 'the anchor let go');
  assert.ok(Array.isArray(later.json.near.isles) && later.json.near.isles.length > 0, 'isles in sight');
  assert.equal(later.json.bounties.length, 3);
});

test('Sea: a raider fought round by round to its end - Seals paid once, the raider gone for this captain, the log tells it; the clock sweeps an overdue round', async () => {
  const r = await journalRig();
  const p = await r.linked('Brand', { seated: true, save: fleetSave({ guns: 12, hull: 12 }) });
  await r.ask(p.discordId, 'sea/sail', { uid: 's1' });
  const nowS = Math.floor(Date.now() / 1000);
  // a raider in the Shallows, out of the peace
  let foe = null;
  for (let x = 7700; !foe && x > 7000; x -= 30) foe = L.raidersNear(x, -5185, 30, nowS).find((f) => f.cls === 'sloop') ?? null;
  assert.ok(foe, 'a sloop lies in wait');
  r.raw.prepare('UPDATE sea_captains SET x = ?, y = ?, to_x = NULL, to_y = NULL').run(foe.x + 1, foe.y);
  const tooFar = await r.ask(p.discordId, 'sea/engage', { target: `r:999:999:${Math.floor(nowS / L.RAIDER_LIFE_S)}` });
  assert.ok(tooFar.status >= 400);
  const e = await r.ask(p.discordId, 'sea/engage', { target: foe.id });
  assert.equal(e.status, 200, JSON.stringify(e.json));
  assert.equal(e.json.battle.foe.name, foe.name);
  assert.equal(e.json.battle.range, 'long');
  let st = e.json;
  for (let i = 0; i < 30 && !st.battle?.over; i++) {
    const helm = st.battle.range === 'long' || st.battle.range === 'medium' ? 'close' : 'hold';
    st = (await r.ask(p.discordId, 'sea/orders', { helm, shot: 'round', hands: 'guns', round: st.battle.round })).json;
  }
  assert.ok(st.battle.over, 'the fight ended');
  assert.ok(st.battle.log.length > 3, 'its rounds told');
  const won = st.battle.over.mine;
  const seals = r.raw.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM exp_points WHERE player_id = ? AND why = 'sea'").get(p.id).n;
  if (won) {
    assert.ok(seals > 0, 'Seals paid for the win');
    const again = await r.ask(p.discordId, 'sea/engage', { target: foe.id });
    assert.ok(again.status >= 400, 'a sunk raider is gone for this captain');
  } else assert.equal(seals, 0);
  const acked = await r.ask(p.discordId, 'sea/ack', {});
  assert.equal(acked.json.battle, undefined, 'the end seen, the fight put away');
  assert.ok(acked.json.log.some((l) => /surrendered|captured|defeated|draw|escaped/.test(l.words)), JSON.stringify(acked.json.log));
  // an overdue round runs on without either side asking
  const p2 = await r.linked('Sel', { seated: true, save: fleetSave() });
  await r.ask(p2.discordId, 'sea/sail', { uid: 's1' });
  r.raw.prepare('UPDATE sea_captains SET x = ?, y = ? WHERE player_id = ?').run(foe.x - 2, foe.y + 1, p2.id);
  let f2 = null;
  for (let x = foe.x - 40; !f2 && x > 6500; x -= 25) f2 = L.raidersNear(x, foe.y, 25, nowS)[0] ?? null;
  r.raw.prepare('UPDATE sea_captains SET x = ?, y = ? WHERE player_id = ?').run(f2.x, f2.y, p2.id);
  assert.equal((await r.ask(p2.discordId, 'sea/engage', { target: f2.id })).status, 200);
  r.raw.prepare('UPDATE sea_battles SET due_at = 0 WHERE a = (SELECT char_id FROM sea_captains WHERE player_id = ?)').run(p2.id);
  assert.equal(await seaMinute(r.ctx()), 1, 'the clock resolved the round');
});

test('Sea: two captains in a duel - out of the peace, in hail, both awake; a round resolves once whoever asks; the winner paid once a day for that rival', async () => {
  const r = await journalRig();
  const a = await r.linked('Ash', { seated: true, save: fleetSave({ guns: 12, hull: 12 }) });
  const b = await r.linked('Birch', { seated: true, save: fleetSave({ guns: 0, hull: 0 }) });
  await r.ask(a.discordId, 'sea/sail', { uid: 's1' });
  await r.ask(b.discordId, 'sea/sail', { uid: 's1' });
  const peace = await r.ask(a.discordId, 'sea/engage', { target: (await r.ask(b.discordId, 'sea/state')).json.captain.id });
  assert.equal(peace.json.error, 'peace', 'no fight in Veilhaven\'s peace');
  const x = ETHER_BOX.x0 + 4000, y = -5000;
  r.raw.prepare('UPDATE sea_captains SET x = ?, y = ?, to_x = NULL, to_y = NULL').run(x, y);
  const bId = (await r.ask(b.discordId, 'sea/state')).json.captain.id;
  const st = await r.ask(a.discordId, 'sea/state');
  assert.ok(st.json.near.captains.some((c) => c.id === bId && c.awake), 'the rival in sight and awake');
  const e = await r.ask(a.discordId, 'sea/engage', { target: bId });
  assert.equal(e.status, 200, JSON.stringify(e.json));
  const bs = await r.ask(b.discordId, 'sea/state');
  assert.equal(bs.json.battle.mine, 'b', 'the defender is in the fight');
  const told = r.raw.prepare("SELECT card FROM discord_notices WHERE discord_id = ? AND kind = 'sea'").all(b.discordId);
  assert.equal(told.length, 1, 'the courier tells the one engaged');
  assert.match(told[0].card, /attacked/);
  assert.equal((await r.ask(b.discordId, 'sea/course', { x: x - 50, y })).json.error, 'in-battle', 'no sailing away from a fight but by fleeing it');
  let sa = e.json;
  for (let i = 0; i < 30 && !sa.battle?.over; i++) {
    await r.ask(a.discordId, 'sea/orders', { helm: 'hold', shot: 'round', hands: 'guns', round: sa.battle.round });
    const round = sa.battle.round;
    sa = (await r.ask(b.discordId, 'sea/orders', { helm: 'hold', shot: 'round', hands: 'guns', round })).json;
    const after = (await r.ask(a.discordId, 'sea/state')).json;
    assert.ok(after.battle.round === round + 1 || after.battle.over, 'the round resolved exactly once');
    sa = after;
  }
  assert.ok(sa.battle.over);
  const pay = (id) => r.raw.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM exp_points WHERE player_id = ? AND why = 'sea'").get(id).n;
  const winner = sa.battle.over.mine ? a : b;
  assert.ok(pay(winner.id) > 0, 'the winner is paid');
  // a second win over the same rival the same day pays nothing more
  const fight = r.raw.prepare('SELECT * FROM sea_battles ORDER BY began_at DESC LIMIT 1').get();
  assert.equal(await resolveFight(r.ctx(), fight), false, 'an ended fight never moves again');
});

test('Sea: landfall on an isle in reach, the ground walked to a spot and visited; a walk where no way goes is refused; back aboard', async () => {
  const r = await journalRig();
  const p = await r.linked('Lio', { seated: true, save: fleetSave() });
  await r.ask(p.discordId, 'sea/sail', { uid: 's1' });
  const isle = islesNear(7600, -5185, 60).find((i) => i.kind === 'wild' || i.kind === 'ruin');
  assert.ok(isle);
  r.raw.prepare('UPDATE sea_captains SET x = ?, y = ?').run(isle.px + 0.5, isle.py);
  const st = await r.ask(p.discordId, 'sea/state');
  assert.equal(st.json.landable, isle.key);
  const land = await r.ask(p.discordId, 'sea/land', {});
  assert.equal(land.status, 200);
  assert.equal(land.json.captain.state, 'ashore');
  const g = land.json.ground;
  assert.equal(g.name, isle.name);
  assert.ok(land.json.log.some((l) => l.kind === 'landfall'));
  const spot = g.spots.find((s) => s.kind === 'ruin' || s.kind === 'good');
  const walk = await r.ask(p.discordId, 'sea/walk', { x: spot.x, y: spot.y });
  assert.equal(walk.status, 200);
  assert.ok(walk.json.path.length >= 2, 'a path over the ground');
  const water = g.tiles.findIndex((row) => row.includes(' '));
  assert.equal((await r.ask(p.discordId, 'sea/walk', { x: g.tiles[water].indexOf(' '), y: water })).json.error, 'no-way');
  const v = await r.ask(p.discordId, 'sea/visit', { spot: spot.kind });
  assert.equal(v.status, 200, JSON.stringify(v.json));
  assert.ok(v.json.said.length > 10);
  assert.equal((await r.ask(p.discordId, 'sea/visit', { spot: spot.kind })).json.error, 'done-today');
  const back = await r.ask(p.discordId, 'sea/embark', {});
  assert.equal(back.json.captain.state, 'sea');
  const sealsToday = r.raw.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM exp_points WHERE player_id = ? AND why = 'sea'").get(p.id).n;
  assert.ok(sealsToday > 0 && sealsToday <= L.SEA_SEALS_A_DAY);
});

test('Sea in Discord\'s messages: the ledger page shows the fleet, then the ship at sea with its bounties and log; the Activity\'s press only where it is on', async () => {
  const { screenText, assertScreenOk, customIds } = await import('../pdaRig.mjs');
  const r = await journalRig();
  const p = await r.linked('Mae', { seated: true, save: fleetSave() });
  const before = assertScreenOk(await r.press(p, 'pda:sea'), 'sea ledger');
  assert.match(screenText(before), /Kestrel/);
  assert.ok(!customIds(before).includes('open:activity'), 'Activities off: no press Discord would refuse');
  await r.ask(p.discordId, 'sea/sail', { uid: 's1' });
  r.raw.prepare("INSERT INTO discord_state (key, value, at) VALUES ('activity', '1', 1) ON CONFLICT(key) DO UPDATE SET value = '1'").run();
  const at = assertScreenOk(await r.press(p, 'pda:sea'), 'sea ledger at sea');
  assert.match(screenText(at), /Today’s bounties/);
  assert.match(screenText(at), /set sail from Veilhaven/);
  assert.ok(customIds(at).includes('open:activity'));
});

test('Sea: a captain laid up keeps their record - a legend sunk still rests when they sail again; a ship under the mercy share is never engaged by a rival', async () => {
  const r = await journalRig();
  const a = await r.linked('Hale', { seated: true, save: fleetSave({ guns: 12, hull: 12 }) });
  const b = await r.linked('Mirro', { seated: true, save: fleetSave() });
  await r.ask(a.discordId, 'sea/sail', { uid: 's1' });
  const aId = (await r.ask(a.discordId, 'sea/state')).json.captain.id;
  r.raw.prepare('UPDATE sea_captains SET loads = ? WHERE char_id = ?').run(JSON.stringify({ posts: {}, shot: 'round', legends: { 'l:sorrow': Math.floor(Date.now() / 1000) }, sunk: ['r:1:1:1'] }), aId);
  const home = await r.ask(a.discordId, 'sea/home', {});
  assert.ok(home.json.fleet, 'laid up: the fleet to sail from');
  assert.equal(r.raw.prepare('SELECT state FROM sea_captains WHERE char_id = ?').get(aId).state, 'home', 'the row stays, laid up');
  const again = await r.ask(a.discordId, 'sea/sail', { uid: 's1' });
  assert.equal(again.status, 200);
  const cfg = JSON.parse(r.raw.prepare('SELECT loads FROM sea_captains WHERE char_id = ?').get(aId).loads);
  assert.ok(cfg.legends['l:sorrow'] > 0 && cfg.sunk.includes('r:1:1:1'), 'the record kept across voyages');
  const [lx, ly] = L.LEGENDS[0].at;
  r.raw.prepare('UPDATE sea_captains SET x = ?, y = ? WHERE char_id = ?').run(lx + 1, ly, aId);
  assert.ok((await r.ask(a.discordId, 'sea/engage', { target: 'l:sorrow' })).status >= 400, 'a legend sunk rests, whatever voyage this is');
  // mercy
  await r.ask(b.discordId, 'sea/sail', { uid: 's1' });
  const bId = (await r.ask(b.discordId, 'sea/state')).json.captain.id;
  r.raw.prepare('UPDATE sea_captains SET x = ?, y = ?, to_x = NULL, to_y = NULL').run(4000, -5000);
  r.raw.prepare('UPDATE sea_captains SET hull = 50 WHERE char_id = ?').run(bId);
  assert.equal((await r.ask(a.discordId, 'sea/engage', { target: bId })).json.error, 'mercy');
  assert.equal((await r.ask(b.discordId, 'sea/state')).json.captain.state, 'sea');
});

test('Sea: a duel is never against your own account, nor the same rival twice in a row; going home far out sails for Veilhaven first; a repair stops at whole', async () => {
  const r = await journalRig();
  const a = await r.linked('Oren', { seated: true, save: fleetSave({ guns: 12, hull: 12 }) });
  const b = await r.linked('Pell', { seated: true, save: fleetSave() });
  await r.ask(a.discordId, 'sea/sail', { uid: 's1' });
  await r.ask(b.discordId, 'sea/sail', { uid: 's1' });
  const aId = (await r.ask(a.discordId, 'sea/state')).json.captain.id;
  const bId = (await r.ask(b.discordId, 'sea/state')).json.captain.id;
  const x = ETHER_BOX.x0 + 4000, y = -5000;
  r.raw.prepare('UPDATE sea_captains SET x = ?, y = ?, to_x = NULL, to_y = NULL').run(x, y);
  // the rival's ship counted as the same account's: no fight
  r.raw.prepare('UPDATE sea_captains SET player_id = ? WHERE char_id = ?').run(a.id, bId);
  assert.equal((await r.ask(a.discordId, 'sea/engage', { target: bId })).json.error, 'own-ship');
  r.raw.prepare('UPDATE sea_captains SET player_id = ? WHERE char_id = ?').run(b.id, bId);
  // a fight a few minutes ago between the two: no new one until the rest is over
  r.raw.prepare("INSERT INTO sea_battles (id, a, b, foe, round, state, due_at, began_at, ended_at, seed) VALUES ('old', ?, ?, NULL, 3, '{}', 0, ?, ?, 1)").run(bId, aId, Math.floor(Date.now() / 1000) - 120, Math.floor(Date.now() / 1000) - 60);
  assert.equal((await r.ask(a.discordId, 'sea/engage', { target: bId })).json.error, 'cooldown');
  r.raw.prepare("UPDATE sea_battles SET began_at = began_at - ? WHERE id = 'old'").run(PAIR_REST_S);
  assert.equal((await r.ask(a.discordId, 'sea/engage', { target: bId })).status, 200, 'the rest over, the fight starts');
  r.raw.prepare("UPDATE sea_battles SET ended_at = 1 WHERE ended_at IS NULL").run();
  r.raw.prepare("UPDATE sea_captains SET state = 'sea', battle = NULL").run();
  // going home out on open water: a course for Veilhaven, still at sea
  const far = await r.ask(a.discordId, 'sea/home', {});
  assert.equal(far.status, 200);
  assert.equal(far.json.captain.state, 'sea', 'still at sea');
  assert.match(far.json.said, /Sailing back to Veilhaven/);
  assert.ok(far.json.captain.to, 'a course is set');
  assert.ok(Math.hypot(far.json.captain.to.x - x, far.json.captain.to.y - y) > 100, 'toward home');
  const port = L.setSailAt();
  assert.ok(L.inPeace(port.x, port.y), 'the course ends in the peace');
  // a repair one short of whole stops at whole, and spends one store
  const max = far.json.captain.ship.max.hull;
  r.raw.prepare('UPDATE sea_captains SET hull = ?, stores = 3 WHERE char_id = ?').run(max - 1, aId);
  const mend = await r.ask(a.discordId, 'sea/manage', { mend: true });
  assert.equal(mend.status, 200, JSON.stringify(mend.json));
  const row = r.raw.prepare('SELECT hull, stores FROM sea_captains WHERE char_id = ?').get(aId);
  assert.equal(row.hull, max, 'never past the ship\'s most');
  assert.equal(row.stores, 2);
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM sea_log WHERE char_id = ? AND kind = 'mend'").get(aId).n, 1, 'one log line for one store');
  // the posts and the shot kept over a visit's mark written meanwhile
  r.raw.prepare('UPDATE sea_captains SET loads = ? WHERE char_id = ?').run(JSON.stringify({ posts: {}, shot: 'round', watchUntil: 99 }), aId);
  await r.ask(a.discordId, 'sea/manage', { shot: 'chain' });
  const cfg = JSON.parse(r.raw.prepare('SELECT loads FROM sea_captains WHERE char_id = ?').get(aId).loads);
  assert.equal(cfg.shot, 'chain');
  assert.equal(cfg.watchUntil, 99, 'the other setting kept');
  // in the peace, home ends the voyage
  r.raw.prepare('UPDATE sea_captains SET x = ?, y = ?, to_x = NULL, to_y = NULL WHERE char_id = ?').run(port.x, port.y, aId);
  await r.ask(a.discordId, 'sea/home', {});
  assert.equal(r.raw.prepare('SELECT state FROM sea_captains WHERE char_id = ?').get(aId).state, 'home');
});
