// Expeditions in the Discord PDA: the sworn read from the save (never written), an errand sent by the game's own rules,
// its due the world's minute the game would set, the game's pending and answer routes, recalls, errands the game sent
// told here, the day's contracts, the encounter on the road, points counted once at the return, and the shop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdaRig, screenText, customIds, assertScreenOk } from '../pdaRig.mjs';
import { freshSave, recordOf } from '../realmSeat.mjs';
import { expMinute, expHour, pointsOf, rosterOf, EXP_WAIT_S, EXP_KEEP_S } from '../../server-account/src/pdaExpeditions.js';
import { dayContracts, utcDayOf, POINTS_A_DAY, CONTRACT_REWARD, encounterOutcome, THEMES } from '../../server-account/src/pdaExpLaw.js';
import { worldMinuteAt, remoteRoadMinutes, wallSecondOf, REMOTE_ERRANDS_MAX, remotePlace } from '../../src/systems/revenant/revenantRemoteLaw.js';
import { NOTICE_KINDS } from '../../server-account/src/pdaLink.js';

/** A sworn record as a save keeps it. */
const swornRec = (id, { rank = 2, state = 'away', until = null, errand = null, loyalty = 60, name = `${id} the Scarred` } = {}) => ({
  id,
  rev: 3,
  mobileType: 7,
  gender: 'male',
  given: id,
  epithet: 'the Scarred',
  name,
  rank,
  sworn: true,
  defeated: false,
  companion: { state, until, errand, loyalty, items: [], gear: {}, stars: [], xp: 0, paid: [] },
});
const saveWith = (list, classicMinutes = 5000) => freshSave({ classicMinutes, modData: { Revenant: { v: 1, list, lastDay: null } } });

async function rig({ renown = 12, list = [swornRec('kael'), swornRec('mora'), swornRec('tull')], classicMinutes = 5000 } = {}) {
  const r = await pdaRig();
  const p = await r.linked('Varra', { seated: true, renown, save: saveWith(list, classicMinutes) });
  return { r, p };
}
const rows = (r, p) => r.raw.prepare('SELECT * FROM exp_errands WHERE player_id = ? ORDER BY sent_at, id').all(p.id);
/** Send `cid` to `place` on `venture` through the screens, as a player would. */
async function sendVia(r, p, cid, place = 'Skyrim', venture = 'plunder') {
  assertScreenOk(await r.press(p, 'pda:exp:send'), 'who');
  assertScreenOk(await r.choose(p, 'pda:exp:pick', [cid]), 'where');
  assertScreenOk(await r.choose(p, `pda:exp:place:${cid}`, [place]), 'what');
  const confirm = assertScreenOk(await r.choose(p, `pda:exp:venture:${cid}:${place}`, [venture]), 'confirm');
  assert.ok(customIds(confirm).includes(`pda:exp:go:${cid}:${place}:${venture}`));
  return assertScreenOk(await r.press(p, `pda:exp:go:${cid}:${place}:${venture}`), 'sent');
}
const pending = async (r, p) =>
  (await (await r.fetch(`https://accounts.invalid/v1/expeditions/pending?character=${p.character}`, { headers: { authorization: `Bearer ${p.secret}` } })).json()).errands;

test('EXPEDITIONS: the sworn are read from the save, never written; the screen says where each is and offers Send', async () => {
  const { r, p } = await rig({ list: [swornRec('kael'), swornRec('mora', { state: 'resting', until: 9000 }), swornRec('tull', { state: 'with' })] });
  const before = JSON.stringify(recordOf(r.env, p.character));
  const main = assertScreenOk(await r.press(p, 'pda:exp'), 'main');
  const t = screenText(main);
  assert.match(t, /Sworn:\*\* 3/);
  assert.match(t, /kael the Scarred/);
  assert.match(t, /Recovering/);
  assert.match(t, /At your side/);
  assert.ok(customIds(main).includes('pda:exp:send'));
  assert.equal(JSON.stringify(recordOf(r.env, p.character)), before, 'the save is untouched');
});

test('EXPEDITIONS: one press reads the save from storage once, however many of its screens need it', async () => {
  const { r, p } = await rig();
  const get = r.env.SAVES.get.bind(r.env.SAVES);
  let reads = 0;
  r.env.SAVES.get = async (...a) => { reads++; return get(...a); };
  try {
    await r.choose(p, 'pda:exp:venture:kael:Skyrim', ['plunder']);
    reads = 0;
    assert.match(screenText(await r.press(p, 'pda:exp:go:kael:Skyrim:plunder')), /Sent to/);
    assert.equal(reads, 1, 'the send and the screen after it share one read');
  } finally {
    r.env.SAVES.get = get;
  }
});

test('EXPEDITIONS: an errand sent from the PDA - every rule asked again at the press, its due the world\'s minute plus the road the game reads', async () => {
  const { r, p } = await rig();
  const t0 = r.nowS();
  assert.match(screenText(await sendVia(r, p, 'kael', 'Skyrim', 'plunder')), /Sent to/);
  const [row] = rows(r, p);
  assert.equal(row.state, 'sent');
  assert.equal(row.source, 'discord');
  assert.ok(Math.abs(row.world_at - worldMinuteAt(t0 * 1000)) <= 1);
  assert.equal(row.due - row.world_at, remoteRoadMinutes({ sworn: true, companion: { stars: [] } }, 'Skyrim'), 'two days of road');
  assert.equal(row.due_at, wallSecondOf(row.due));
  assert.ok(row.seed >= 0 && row.seed <= 0xffffffff);
  assert.ok(row.enc_at > row.sent_at && row.enc_at < row.due_at, 'met about half-way');
  // the same companion again: it already has an errand waiting
  assert.match(screenText(await r.press(p, 'pda:exp:go:kael:HighRock:forage')), /already has an errand waiting/);
  // a second goes; a third is past the most abroad at once
  await sendVia(r, p, 'mora', 'HighRock', 'forage');
  assert.equal(rows(r, p).length, REMOTE_ERRANDS_MAX);
  assert.match(screenText(await r.press(p, 'pda:exp:go:tull:HighRock:forage')), /the most allowed at once/);
  assert.match(screenText(await r.press(p, 'pda:exp:send')), /the most allowed at once/);
  // a place or venture the game does not know
  assert.match(screenText(await r.press(p, 'pda:exp:go:tull:Atmora:forage')), /no place/);
  assert.match(screenText(await r.press(p, 'pda:exp:go:tull:Skyrim:pillage')), /no errand/);
  // a name nobody is sworn under
  assert.match(screenText(await r.press(p, 'pda:exp:go:ghost:Skyrim:plunder')), /not sworn/);
});

test('EXPEDITIONS: refusals - under Renown 10, a resting one, one abroad by the save, no save at all', async () => {
  const low = await rig({ renown: 5 });
  assert.match(screenText(await low.r.press(low.p, 'pda:exp:go:kael:Skyrim:plunder')), /Renown 10/);
  assert.equal(rows(low.r, low.p).length, 0);
  const w = worldMinuteAt(Date.now());
  const busy = await rig({
    list: [
      swornRec('kael', { state: 'resting', until: 9000 }),
      swornRec('mora', { state: 'errand', errand: { place: 'Skyrim', venture: 'plunder', at: 1, until: 3000, seed: 4, due: w + 600 } }),
      swornRec('tull', { state: 'resting', until: 100 }),
    ],
  });
  assert.match(screenText(await busy.r.press(busy.p, 'pda:exp:go:kael:Skyrim:plunder')), /recovering/);
  assert.match(screenText(await busy.r.press(busy.p, 'pda:exp:go:mora:Skyrim:plunder')), /already on a mission/);
  assert.match(screenText(await busy.r.press(busy.p, 'pda:exp')), /On a mission in Skyrim\. Back/);
  assert.match(screenText(await busy.r.press(busy.p, 'pda:exp:go:tull:HighRock:forage')), /Sent to/, 'its rest is over on its own clock');
  // one abroad whose world minute has passed is back as far as the PDA can tell
  const roster = rosterOf(saveWith([swornRec('a', { state: 'errand', errand: { place: 'Skyrim', due: w - 5 } })]), [], Math.floor(Date.now() / 1000));
  assert.equal(roster[0].free, true);
  const r = await pdaRig();
  const p = await r.linked('Nosave', { seated: false });
  assert.match(screenText(await r.press(p, 'pda:exp')), /no online character yet/);
});

test('EXPEDITIONS: the game takes errands up - pending lists them, an answer marks each taken or refused, and a refusal is told on Discord once', async () => {
  const { r, p } = await rig();
  await sendVia(r, p, 'kael');
  await sendVia(r, p, 'mora', 'HighRock', 'forage');
  const list = await pending(r, p);
  assert.equal(list.length, 2);
  const a = rows(r, p).find((x) => x.companion === 'kael');
  const b = rows(r, p).find((x) => x.companion === 'mora');
  assert.deepEqual(list.find((e) => e.id === a.id), { id: a.id, kind: 'send', companion: 'kael', seed: a.seed, place: 'Skyrim', venture: 'plunder', world: a.world_at });
  // taken, with the game's own minute (its stars may move the road)
  assert.equal((await r.call('/v1/expeditions/ack', { id: a.id, taken: true, due: a.due - 30 }, p.secret)).status, 200);
  let now = r.raw.prepare('SELECT * FROM exp_errands WHERE id = ?').get(a.id);
  assert.equal(now.state, 'out');
  assert.equal(now.due, a.due - 30);
  assert.equal(now.due_at, wallSecondOf(a.due - 30));
  // an answer far from the ledger's minute is not believed
  await r.call('/v1/expeditions/ack', { id: b.id, taken: false, why: 'It is no longer sworn to you.' }, p.secret);
  now = r.raw.prepare('SELECT * FROM exp_errands WHERE id = ?').get(b.id);
  assert.equal(now.state, 'refused');
  assert.equal(now.why, 'It is no longer sworn to you.');
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM discord_notices WHERE kind = 'exp' AND ref = ?").get(`refused:${b.id}`).n, 1);
  assert.equal((await pending(r, p)).length, 0, 'nothing waits');
  // asked again, an answer changes nothing
  await r.call('/v1/expeditions/ack', { id: a.id, taken: false }, p.secret);
  assert.equal(r.raw.prepare('SELECT state FROM exp_errands WHERE id = ?').get(a.id).state, 'out');
  // another account's errand, or none
  const other = await r.linked('Other', { seated: true, renown: 12, save: saveWith([]) });
  assert.equal((await r.call('/v1/expeditions/ack', { id: a.id, taken: false }, other.secret)).status, 404);
  assert.equal((await r.fetch(`https://accounts.invalid/v1/expeditions/pending?character=${p.character}`, { headers: { authorization: `Bearer ${other.secret}` } })).status, 404);
  const g = await r.guest();
  assert.equal((await r.call('/v1/expeditions/ack', { id: a.id, taken: true }, g.secret)).status, 403);
});

test('EXPEDITIONS: a recall - one not yet set out is called off at once; one abroad waits for the game to call it home', async () => {
  const { r, p } = await rig();
  await sendVia(r, p, 'kael');
  const [a] = rows(r, p);
  const ask = await r.press(p, `pda:exp:recall:${a.id}`);
  assert.match(screenText(ask), /has not set out yet/);
  assert.match(screenText(await r.press(p, `pda:exp:recallyes:${a.id}`)), /called off/);
  assert.equal(r.raw.prepare('SELECT state FROM exp_errands WHERE id = ?').get(a.id).state, 'cancelled');
  await sendVia(r, p, 'mora');
  const b = rows(r, p).find((x) => x.companion === 'mora');
  await r.call('/v1/expeditions/ack', { id: b.id, taken: true }, p.secret);
  assert.match(screenText(await r.press(p, `pda:exp:recall:${b.id}`)), /brings nothing back/);
  await r.press(p, `pda:exp:recallyes:${b.id}`);
  assert.equal(r.raw.prepare('SELECT state FROM exp_errands WHERE id = ?').get(b.id).state, 'recall');
  assert.deepEqual(await pending(r, p), [{ id: b.id, kind: 'recall', companion: 'mora', seed: b.seed }]);
  await r.call('/v1/expeditions/ack', { id: b.id, taken: true }, p.secret);
  assert.equal(r.raw.prepare('SELECT state FROM exp_errands WHERE id = ?').get(b.id).state, 'recalled');
  assert.match(screenText(await r.press(p, `pda:exp:recallyes:${b.id}`)), /already back/);
});

test('EXPEDITIONS: errands the game sent are told here once (by their seed), counted abroad, and a recall in the game closes them', async () => {
  const { r, p } = await rig();
  const w = worldMinuteAt(Date.now());
  const body = { character: p.character, kind: 'send', companion: 'tull', name: 'Tull', rank: 3, place: 'Morrowind', venture: 'forage', seed: 99, due: w + 4000, world: w - 320 };
  assert.equal((await r.call('/v1/expeditions/game', body, p.secret)).status, 200);
  assert.equal((await r.call('/v1/expeditions/game', body, p.secret)).status, 200);
  const list = rows(r, p);
  assert.equal(list.length, 1, 'told once');
  assert.equal(list[0].source, 'game');
  assert.equal(list[0].state, 'out');
  assert.equal(list[0].enc_kind, null, 'the road\'s encounters are the PDA\'s own errands');
  assert.match(screenText(await r.press(p, 'pda:exp')), /On a mission in Morrowind/);
  // a minute far from the world's now is refused
  assert.equal((await r.call('/v1/expeditions/game', { ...body, seed: 100, due: w + 99999 }, p.secret)).status, 400);
  assert.equal((await r.call('/v1/expeditions/game', { ...body, character: 'r00000000000000000000' }, p.secret)).status, 404);
  await r.call('/v1/expeditions/game', { character: p.character, kind: 'recall', companion: 'tull', seed: 99 }, p.secret);
  assert.equal(rows(r, p)[0].state, 'recalled');
  // the game's word earns nothing: one told back at once pays no points and meets no contract (mutant: game rows paid)
  assert.equal((await r.call('/v1/expeditions/game', { ...body, companion: 'mora', seed: 200, due: w - 1 }, p.secret)).status, 200);
  const told = rows(r, p).find((x) => x.seed === 200);
  assert.equal(told.contract, null);
  await expMinute({ db: r.env.DB, nowS: Math.floor(Date.now() / 1000) + 120 });
  assert.equal(r.raw.prepare('SELECT state FROM exp_errands WHERE id = ?').get(told.id).state, 'back');
  assert.equal(r.raw.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM exp_points WHERE player_id = ?').get(p.id).n, 0);
  // and one long past its return is refused
  assert.equal((await r.call('/v1/expeditions/game', { ...body, companion: 'mora', seed: 201, due: w - 1000 }, p.secret)).status, 400);
});

test('EXPEDITIONS: the day\'s three contracts are the same each time asked, an account\'s own; an errand that meets one reserves it', async () => {
  const day = utcDayOf(Math.floor(Date.now() / 1000));
  assert.deepEqual(dayContracts('acct-a', day), dayContracts('acct-a', day));
  assert.notDeepEqual(dayContracts('acct-a', day), dayContracts('acct-b', day));
  assert.notDeepEqual(dayContracts('acct-a', day), dayContracts('acct-a', day + 1));
  for (const c of dayContracts('acct-a', day)) assert.ok(c.words.split(/\s+/).length <= 25);
  const { r, p } = await rig();
  const [scout] = dayContracts(p.id, day);
  await sendVia(r, p, 'kael', scout.place, 'contract');
  const [row] = rows(r, p);
  assert.ok(row.contract != null, 'it serves one');
  assert.equal(row.contract_day, day);
  assert.match(screenText(await r.press(p, 'pda:exp:contracts')), /Under way/);
});

test('EXPEDITIONS: the clock - the encounter told once and chosen; the return counts its points once, writes its report and tells the player once', async () => {
  const { r, p } = await rig();
  const day = utcDayOf(Math.floor(Date.now() / 1000));
  const [scout] = dayContracts(p.id, day);
  await sendVia(r, p, 'kael', scout.place, 'plunder');
  const [a] = rows(r, p);
  await r.call('/v1/expeditions/ack', { id: a.id, taken: true }, p.secret);
  const mid = a.enc_at + 1;
  assert.equal(await expMinute({ db: r.env.DB, nowS: mid }), 1);
  assert.equal(await expMinute({ db: r.env.DB, nowS: mid }), 0, 'told once');
  const told = r.raw.prepare("SELECT * FROM discord_notices WHERE kind = 'exp' AND ref = ?").get(`enc:${a.id}`);
  assert.ok(told.card.includes(`open:exp:enc:${a.id}`), 'its button opens the encounter');
  const scene = assertScreenOk(await r.press(p, `open:exp:enc:${a.id}`, { message: { flags: 1 << 15 } }), 'encounter');
  assert.equal(scene.type, 4);
  const choices = customIds(scene).filter((c) => c.startsWith(`pda:exp:choose:${a.id}:`));
  assert.ok(choices.length >= 2);
  assert.match(screenText(await r.press(p, choices[1])), /Seals when it is back/);
  await r.press(p, choices[0]);
  assert.equal(r.raw.prepare('SELECT enc_choice FROM exp_errands WHERE id = ?').get(a.id).enc_choice, 1, 'the first choice stands');
  const row = r.raw.prepare('SELECT * FROM exp_errands WHERE id = ?').get(a.id);
  const after = row.due_at + 1;
  assert.equal(await expMinute({ db: r.env.DB, nowS: after }), 1);
  assert.equal(await expMinute({ db: r.env.DB, nowS: after }), 0, 'counted once');
  const back = r.raw.prepare('SELECT * FROM exp_errands WHERE id = ?').get(a.id);
  assert.equal(back.state, 'back');
  const enc = encounterOutcome(row.enc_kind, 1, row.seed).points;
  const want = POINTS_A_DAY * remotePlace(scout.place).days + (row.contract != null ? dayContracts(p.id, day).find((c) => c.n === row.contract).reward : 0) + enc;
  assert.equal(back.points, want);
  assert.equal(await pointsOf(r.env.DB, p.id), want);
  assert.match(back.report, /kael the Scarred went to/);
  assert.match(back.report, /haul waits for you in the game/);
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM discord_notices WHERE kind = 'exp' AND ref = ?").get(`back:${a.id}`).n, 1);
  assert.match(screenText(await r.press(p, 'pda:exp:reports')), /went to/);
  assert.ok(CONTRACT_REWARD.scout > 0);
});

test('EXPEDITIONS: one sent but never taken up earns nothing at its time, and is let go after a week; old reports are swept', async () => {
  const { r, p } = await rig();
  await sendVia(r, p, 'kael');
  const [a] = rows(r, p);
  await expMinute({ db: r.env.DB, nowS: a.due_at + 10 });
  assert.equal(r.raw.prepare('SELECT state FROM exp_errands WHERE id = ?').get(a.id).state, 'sent');
  assert.equal(await pointsOf(r.env.DB, p.id), 0);
  await expMinute({ db: r.env.DB, nowS: a.sent_at + EXP_WAIT_S + 1 });
  assert.equal(r.raw.prepare('SELECT state FROM exp_errands WHERE id = ?').get(a.id).state, 'cancelled');
  assert.equal(await expHour({ db: r.env.DB, nowS: a.sent_at + EXP_WAIT_S + EXP_KEEP_S + 10 }), 1);
});

test('EXPEDITIONS: a player who wants no Expeditions messages hears none, and the clock still moves', async () => {
  const { r, p } = await rig();
  r.raw.prepare('UPDATE discord_links SET dm = ? WHERE player_id = ?').run(NOTICE_KINDS.mail.bit, p.id);
  await sendVia(r, p, 'kael');
  const [a] = rows(r, p);
  await expMinute({ db: r.env.DB, nowS: a.enc_at + 1 });
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM discord_notices WHERE kind = 'exp'").get().n, 0);
  assert.equal(r.raw.prepare('SELECT enc_told FROM exp_errands WHERE id = ?').get(a.id).enc_told, 1);
});

test('EXPEDITIONS: the shop - nothing bought without the points; bought once, paid once; a frame and a title used; none of it is the game\'s', async () => {
  const { r, p } = await rig();
  const shop = assertScreenOk(await r.press(p, 'pda:exp:shop'), 'shop');
  assert.match(screenText(shop), /Seals:\*\* 0/);
  assert.match(screenText(await r.choose(p, 'pda:exp:buy', ['theme:crimson'])), /not have enough Seals/);
  r.raw.prepare("INSERT INTO exp_points (player_id, amount, why, ref, at) VALUES (?, 100, 'test', 'seed', 1)").run(p.id);
  assert.match(screenText(await r.choose(p, 'pda:exp:buy', ['theme:crimson'])), /Bought: Crimson frame/);
  assert.equal(await pointsOf(r.env.DB, p.id), 40);
  assert.match(screenText(await r.choose(p, 'pda:exp:buy', ['theme:crimson'])), /have that already/);
  assert.match(screenText(await r.choose(p, 'pda:exp:buy', ['title:pathfinder'])), /not have enough Seals/);
  assert.equal(await pointsOf(r.env.DB, p.id), 40, 'a refusal spends nothing');
  await r.choose(p, 'pda:exp:use', ['theme:crimson']);
  assert.equal(r.raw.prepare('SELECT pda_theme FROM discord_links WHERE player_id = ?').get(p.id).pda_theme, THEMES.find((t) => t.key === 'theme:crimson').accent);
  assert.match(screenText(await r.choose(p, 'pda:exp:use', ['title:pathfinder'])), /Buy that first/);
  r.raw.prepare("INSERT INTO exp_points (player_id, amount, why, ref, at) VALUES (?, 100, 'test', 'seed2', 1)").run(p.id);
  await r.choose(p, 'pda:exp:buy', ['title:pathfinder']);
  await r.choose(p, 'pda:exp:use', ['title:pathfinder']);
  assert.equal(r.raw.prepare('SELECT pda_title FROM discord_links WHERE player_id = ?').get(p.id).pda_title, 'Pathfinder');
  await r.choose(p, 'pda:exp:use', ['title:none']);
  assert.equal(r.raw.prepare('SELECT pda_title FROM discord_links WHERE player_id = ?').get(p.id).pda_title, null);
  assert.match(screenText(await r.choose(p, 'pda:exp:buy', ['aurum:500'])), /not for sale/);
});

test('EXPEDITIONS: Home\'s line - who is away, who waits to set out, the points', async () => {
  const { r, p } = await rig();
  assert.match(screenText(await r.press(p, 'pda:home')), /Expeditions:\*\* nobody away/);
  await sendVia(r, p, 'kael');
  assert.match(screenText(await r.press(p, 'pda:home')), /1 waiting to set out/);
  const [a] = rows(r, p);
  await r.call('/v1/expeditions/ack', { id: a.id, taken: true }, p.secret);
  assert.match(screenText(await r.press(p, 'pda:home')), /1 away, next back/);
});
