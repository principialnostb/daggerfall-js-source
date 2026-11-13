// The PDA's world events: every theatre's events from the game's own clocks, places from the relay's live facts (and
// none before they are public), reminders a linked player chooses, and the minute that sends each reminder once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdaWorldRig } from '../pdaWorldRig.mjs';
import { pdaRig, screenText, customIds, assertScreenOk, snowflake } from '../pdaRig.mjs';
import { eventsPda, worldEvents, eventLists, REMINDERS, REMIND_LEAD_S, laneName, _resetPdaEventsForTests } from '../../server-account/src/pdaEvents.js';
import { GATE_LANES_OPEN, SD_KEY, SD_LANE_SPAN, gateLaneKey } from '../../src/net/wire.js';
import { gateAt } from '../../src/net/gate/gateLaw.js';
import { KT_THEATRES } from '../../src/net/ketch/ketchLaw.js';

const noDb = { prepare: () => ({ bind: () => ({ first: async () => ({ n: 0, until: null }) }) }) };

test('PDA events: every open gate lane, the serpent and every Ketch station from the clocks alone; with no relay, no place is claimed', async () => {
  const now = Date.UTC(2026, 10, 11, 12);
  const list = await worldEvents({ db: noDb }, {}, now, null);
  assert.equal(list.filter((e) => e.family === 'gate').length, GATE_LANES_OPEN.length);
  assert.equal(list.filter((e) => e.family === 'ketch').length, KT_THEATRES.length);
  assert.equal(list.filter((e) => e.family === 'serpent').length, 1);
  assert.ok(list.every((e) => e.px === undefined), 'no place without the relay');
  assert.ok(list.some((e) => e.family === 'gate' && e.where === 'in Skyrim'), 'a gate past the Bay is said by its province');
  assert.equal(laneName(0), 'the Iliac Bay');
  const { live, next } = eventLists(list, Math.floor(now / 1000));
  assert.ok(next.every((e, i) => i === 0 || e.startAt >= next[i - 1].startAt), 'soonest first');
  assert.ok(next.every((e) => e.startAt > now / 1000), 'nothing begun is coming up');
  assert.ok(live.every((e) => e.live));
  for (const e of list.filter((x) => x.family === 'ketch')) assert.ok(e.live || e.startAt > now / 1000, `${e.key}: her next arrival once she weighs anchor`);
  assert.ok(REMINDERS.length <= 25, 'one menu holds every reminder');
});

test('PDA events: the relay\'s live facts place a gate past the Bay and the serpent, and an Abyss Dungeon only once found, in its region', async () => {
  const r = await pdaWorldRig();
  try {
    await r.quiet(async () => {
      const now = r.now();
      const sky = gateAt(now, 3).day;
      r.hub.store.set(gateLaneKey('gatesite', 3), { d: sky, c: [[1700, -600, 'Whiterun', ['x', 'y']]] });
      r.hub.store.set(`${SD_KEY}:4`, { s: 4 * SD_LANE_SPAN + 2, ph: 'risen', r: 65, at: now - 1000, until: now + 3_600_000, next: now + 7_200_000 });
      r.hub.store.set(SD_KEY, { s: 7, ph: 'found', r: 17, at: now - 5000, until: now + 3_600_000, next: now + 9_000_000, foundAt: now - 1000, fb: 'Finder' });
      r.hub.wake();
      const list = await worldEvents({ db: r.env.DB }, r.env, now);
      const g = list.find((e) => e.family === 'gate' && e.lane === 3);
      assert.equal(g.where, 'near Whiterun');
      assert.equal(g.px, 1700.5);
      const risen = list.find((e) => e.key.endsWith(':risen'));
      assert.match(risen.where, /^somewhere in Morrowind/);
      const found = list.find((e) => e.key.endsWith(':found'));
      assert.match(found.where, /region$/, 'found: its region, as the herald says it');
      assert.ok(!JSON.stringify(list).includes('Finder'), 'no finder\'s name');
    });
  } finally {
    r.done();
  }
});

test('PDA events: anyone may read the screen; a linked player chooses reminders, and the menu shows them chosen', async () => {
  _resetPdaEventsForTests();
  const r = await pdaRig();
  const stranger = { id: snowflake(), username: 'stranger' };
  const open = assertScreenOk(await r.press(stranger, 'open:events', { message: { flags: 1 << 15 } }), 'events, unlinked');
  assert.match(screenText(open), /Live now/);
  assert.match(screenText(open), /Link your account to get reminders/);
  assert.match(screenText(await r.choose(stranger, 'pda:events:remind', ['serpent'])), /Link your account/);
  const p = await r.linked('Orla');
  const s = assertScreenOk(await r.press(p, 'pda:events'), 'events');
  assert.ok(customIds(s).includes('pda:events:remind'));
  const saved = assertScreenOk(await r.choose(p, 'pda:events:remind', ['gate:3', 'serpent', 'bogus']), 'saved');
  assert.match(screenText(saved), /2 kinds/);
  assert.deepEqual(r.raw.prepare('SELECT family FROM discord_reminders WHERE discord_id = ? ORDER BY family').all(p.discordId).map((x) => x.family), ['gate:3', 'serpent']);
  const menu = saved.data.components[0].components.find((c) => c.type === 1 && c.components?.[0]?.custom_id === 'pda:events:remind').components[0];
  assert.deepEqual(menu.options.filter((o) => o.default).map((o) => o.value).sort(), ['gate:3', 'serpent']);
  await r.choose(p, 'pda:events:remind', []);
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM discord_reminders WHERE discord_id = ?').get(p.discordId).n, 0);
});

test('PDA events: the minute queues a reminder once for each player who asked, ten minutes before the start, never to a user Discord refuses; the hour drops unlinked users\' reminders', async () => {
  _resetPdaEventsForTests();
  const r = await pdaRig();
  const a = await r.linked('Pell');
  const b = await r.linked('Quinn');
  const c = await r.linked('Rook');
  const bay = gateAt(Date.now(), 0);
  // the clock set just inside the lead of the Bay's next opening
  const nowS = Math.floor(bay.openAt / 1000) - REMIND_LEAD_S + 30;
  for (const who of [a, b, c]) r.raw.prepare('INSERT INTO discord_reminders (discord_id, family, at) VALUES (?, ?, ?)').run(who.discordId, 'gate:0', nowS);
  r.raw.prepare('UPDATE discord_links SET dm_dead = 1 WHERE discord_id = ?').run(c.discordId);
  const ctx = { ...r.ctx(), nowS };
  assert.equal(await eventsPda.minute(ctx, r.env), 2);
  assert.equal(await eventsPda.minute(ctx, r.env), 0, 'once');
  const rows = r.raw.prepare("SELECT discord_id, ref, card FROM discord_notices WHERE kind = 'events'").all();
  assert.deepEqual(rows.map((x) => x.discord_id).sort(), [a.discordId, b.discordId].sort());
  assert.ok(rows[0].ref.startsWith('gate:0:'));
  assert.match(rows[0].card, /open:events/);
  // too early: nothing
  _resetPdaEventsForTests();
  r.raw.prepare("DELETE FROM discord_notices WHERE kind = 'events'").run();
  assert.equal(await eventsPda.minute({ ...ctx, nowS: nowS - 3600 }, r.env), 0);
  // a user unlinked keeps no reminders past the hour
  r.raw.prepare('DELETE FROM discord_links WHERE discord_id = ?').run(b.discordId);
  assert.equal(await eventsPda.hour(r.ctx()), 1);
});

test('PDA events: the minute tells of an Abyss Dungeon found, once, to those who asked', async () => {
  const r = await pdaWorldRig();
  try {
    await r.quiet(async () => {
      const p = await r.linked('Sable');
      r.raw.prepare("INSERT INTO discord_reminders (discord_id, family, at) VALUES (?, 'abyss', ?)").run(p.discordId, 1);
      const now = r.now();
      r.hub.store.set(SD_KEY, { s: 7, ph: 'found', r: 17, at: now - 5000, until: now + 3_600_000, next: now + 9_000_000, foundAt: now - 60_000 });
      r.hub.wake();
      const ctx = { ...r.ctx(), nowS: Math.floor(now / 1000) };
      assert.equal(await eventsPda.minute(ctx, r.env), 1);
      assert.equal(await eventsPda.minute(ctx, r.env), 0);
      assert.equal(r.raw.prepare("SELECT ref FROM discord_notices WHERE kind = 'events'").get().ref, 'abyss:7:found');
    });
  } finally {
    r.done();
  }
});

test('PDA events: Home\'s line names the next event', async () => {
  _resetPdaEventsForTests();
  const r = await pdaRig();
  const p = await r.linked('Tamsin');
  assert.match(screenText(await r.press(p, 'pda:home')), /Next:.*<t:\d+:R>/);
});
