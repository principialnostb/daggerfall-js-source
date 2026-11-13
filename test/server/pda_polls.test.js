// Polls: an Admin opens one; the clock posts its public card, tells the players who want polls, redraws the card at most
// every POLL_REDRAW_S, and closes it with its counts kept; a vote is one an account, changed until the close, from a
// card, from the PDA or from the game; who may vote is held; old votes are let go while the counts stay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDiscord, snowflake, screenText, customIds, assertScreenOk } from '../pdaRig.mjs';
import { staffRig } from '../pdaRigStaff.mjs';
import {
  createPoll,
  votePoll,
  pollWordsOf,
  pollCard,
  drawPollCards,
  closeDuePolls,
  announcePolls,
  countsOf,
  pollsPda,
  POLL_REDRAW_S,
  POLL_VOTES_KEEP_S,
  POLL_OPTIONS_MAX,
} from '../../server-account/src/pdaPolls.js';
import { countComponents, LIMITS } from '../../server-account/src/pdaUi.js';

const POLL_CHANNEL = '910000000000000001';
const row = (r, sql, ...a) => r.raw.prepare(sql).get(...a);
const player = (r, id) => r.raw.prepare('SELECT * FROM players WHERE id = ?').get(id);
const card = { flags: 1 << 15 };

async function opened(r, words = {}) {
  const dev = player(r, r.dev.id);
  const made = await createPoll(r.ctx(), dev, r.env, { question: 'Which province next?', options: ['Skyrim', 'Morrowind', 'Elsweyr'], hours: 24, eligible: 'linked', ...words });
  assert.ok(made.ok, JSON.stringify(made));
  return made.id;
}

test('PDA polls: a poll\'s words are checked - question, two to ten different options, hours, who may vote; only an Admin opens one', async () => {
  assert.deepEqual(pollWordsOf({ question: 'Hi?', options: 'A\n\n B \n', hours: '5' }), { question: 'Hi?', options: ['A', 'B'], hours: 5, eligible: 'linked' });
  assert.equal(pollWordsOf({ question: 'No', options: 'A\nB', hours: 5 }).error, 'poll-question');
  assert.equal(pollWordsOf({ question: 'Hi?', options: 'A', hours: 5 }).error, 'poll-options');
  assert.equal(pollWordsOf({ question: 'Hi?', options: 'A\na', hours: 5 }).error, 'poll-options');
  assert.equal(pollWordsOf({ question: 'Hi?', options: Array.from({ length: POLL_OPTIONS_MAX + 1 }, (_, i) => `o${i}`), hours: 5 }).error, 'poll-options');
  assert.equal(pollWordsOf({ question: 'Hi?', options: ['A', 'x'.repeat(81)], hours: 5 }).error, 'poll-options');
  assert.equal(pollWordsOf({ question: 'Hi?', options: 'A\nB', hours: '0' }).error, 'poll-hours');
  assert.equal(pollWordsOf({ question: 'Hi?', options: 'A\nB', hours: '2.5' }).error, 'poll-hours');
  assert.equal(pollWordsOf({ question: 'Hi?', options: 'A\nB', hours: 5, eligible: 'everyone' }).error, 'poll-eligible');
  const r = await staffRig();
  assert.deepEqual(await createPoll(r.ctx(), player(r, r.mod.id), r.env, { question: 'Hi?', options: 'A\nB', hours: 5 }), { error: 'not-developer' });
});

test('PDA polls: the clock posts the card to the polls\' channel with a Vote button an option, and tells each linked player who wants polls, once', async () => {
  const r = await staffRig();
  const a = await r.linked('Voter');
  const quiet = await r.linked('Quiet');
  r.raw.prepare('UPDATE discord_links SET dm = 0 WHERE discord_id = ?').run(quiet.discordId);
  const id = await opened(r);
  const d = fakeDiscord({ [`POST /channels/${POLL_CHANNEL}/messages`]: { id: '700000000000000123' } });
  await pollsPda.minute(r.ctx(), r.env, d.fetchFn);
  const post = d.called('POST', `/channels/${POLL_CHANNEL}/messages`);
  assert.equal(post.length, 1);
  assert.equal(post[0].payload.nonce, id);
  const ids = JSON.stringify(post[0].payload);
  for (const n of [0, 1, 2]) assert.ok(ids.includes(`poll:v:${id}:${n}`));
  assert.ok(countComponents(post[0].payload.components) <= LIMITS.COMPONENTS);
  const p = row(r, 'SELECT card_id, card_channel, announced FROM pda_polls');
  assert.equal(p.card_id, '700000000000000123');
  assert.equal(p.card_channel, POLL_CHANNEL);
  assert.equal(p.announced, 1);
  const told = r.raw.prepare("SELECT discord_id FROM discord_notices WHERE kind = 'polls'").all().map((n) => n.discord_id);
  assert.ok(told.includes(a.discordId));
  assert.ok(!told.includes(quiet.discordId), 'a player who wants no poll news is told nothing');
  await pollsPda.minute(r.ctx(), r.env, d.fetchFn);
  assert.equal(d.called('POST', '/channels/').length, 1, 'posted once');
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM discord_notices WHERE kind = 'polls'").get().n, told.length, 'told once');
});

test('PDA polls: a vote on the card is answered privately, one an account, changed until the close; an unlinked or banned user is refused', async () => {
  const r = await staffRig();
  const a = await r.linked('Voter');
  const id = await opened(r);
  const v = await r.press(a, `poll:v:${id}:1`, { message: card });
  assert.equal(v.type, 4);
  assert.ok(v.data.flags & 64, 'private');
  assert.match(screenText(v), /Your vote: \*\*Morrowind\*\*/);
  assert.match(screenText(await r.press(a, `poll:v:${id}:1`, { message: card })), /already chose/);
  await r.press(a, `poll:v:${id}:2`, { message: card });
  assert.deepEqual(r.raw.prepare('SELECT choice FROM pda_poll_votes').all().map((x) => x.choice), [2], 'changed, still one vote');
  assert.deepEqual(await countsOf(r.env.DB, row(r, 'SELECT * FROM pda_polls')), [0, 0, 1]);
  assert.match(screenText(await r.press({ id: snowflake(), username: 'drifter' }, `poll:v:${id}:0`, { message: card })), /Link your DFO account to vote/);
  assert.match(screenText(await r.press(a, `poll:v:${id}:9`, { message: card })), /not one of the options/);
  assert.match(screenText(await r.press(a, 'poll:v:pffffffffffffffff:0', { message: card })), /poll is gone/);
  r.raw.prepare('UPDATE players SET banned_until = ? WHERE id = ?').run(r.nowS() + 3600, a.id);
  assert.match(screenText(await r.press(a, `poll:v:${id}:0`, { message: card })), /banned/);
});

test('PDA polls: a poll for players with an online character refuses an account with none', async () => {
  const r = await staffRig();
  const none = await r.linked('Lurker');
  const seated = await r.linked('Adventurer', { seated: true });
  const id = await opened(r, { eligible: 'played' });
  assert.match(screenText(await r.press(none, `poll:v:${id}:0`, { message: card })), /online character/);
  assert.match(screenText(await r.press(seated, `poll:v:${id}:0`, { message: card })), /Your vote/);
  await announcePolls(r.ctx());
  const told = r.raw.prepare("SELECT discord_id FROM discord_notices WHERE kind = 'polls'").all().map((n) => n.discord_id);
  assert.ok(told.includes(seated.discordId));
  assert.ok(!told.includes(none.discordId), 'only those who may vote are told');
});

test('PDA polls: the card is redrawn after votes at most every POLL_REDRAW_S, and closed by the clock with its counts kept and no buttons', async () => {
  const r = await staffRig();
  const a = await r.linked('Voter');
  const b = await r.linked('Other', {});
  const id = await opened(r);
  const t0 = r.nowS();
  const d = fakeDiscord({ [`POST /channels/${POLL_CHANNEL}/messages`]: { id: '700000000000000123' } });
  const at = (s) => ({ ...r.ctx(), nowS: s });
  await drawPollCards(at(t0), r.env, d.fetchFn);
  await votePoll(at(t0), player(r, a.id), id, 0);
  assert.equal(await drawPollCards(at(t0 + 5), r.env, d.fetchFn), 0, 'too soon');
  assert.equal(await drawPollCards(at(t0 + POLL_REDRAW_S + 1), r.env, d.fetchFn), 1);
  const patch = d.called('PATCH', `/channels/${POLL_CHANNEL}/messages/700000000000000123`);
  assert.equal(patch.length, 1);
  assert.match(JSON.stringify(patch[0].payload), /100% · 1/);
  assert.equal(await drawPollCards(at(t0 + 2 * POLL_REDRAW_S + 2), r.env, d.fetchFn), 0, 'nothing new, nothing drawn');
  await votePoll(at(t0 + 70), player(r, b.id), id, 1);
  r.raw.prepare('UPDATE pda_polls SET closes_at = ?').run(t0 + 100);
  assert.equal(await closeDuePolls(at(t0 + 101)), 1);
  const closed = row(r, 'SELECT * FROM pda_polls');
  assert.deepEqual(JSON.parse(closed.tallies), [1, 1, 0]);
  assert.equal(await drawPollCards(at(t0 + 101), r.env, d.fetchFn), 1, 'the close is drawn at once');
  const last = d.called('PATCH', '/channels/').at(-1).payload;
  assert.ok(!JSON.stringify(last).includes('poll:v:'), 'no buttons once closed');
  assert.match(JSON.stringify(last), /a tie between/);
  assert.deepEqual(await votePoll(at(t0 + 102), player(r, a.id), id, 2), { error: 'poll-closed' });
  // the hour lets old votes go; the counts stay
  r.raw.prepare('UPDATE pda_polls SET closed_at = ?').run(r.nowS() - POLL_VOTES_KEEP_S - 1);
  assert.equal(await pollsPda.hour(r.ctx()), 2);
  assert.deepEqual(await countsOf(r.env.DB, row(r, 'SELECT * FROM pda_polls')), [1, 1, 0]);
});

test('PDA polls: an open card holds ten options within Discord\'s bounds; a closed one names its winner', () => {
  const opts = Array.from({ length: 10 }, (_, i) => `Option ${i} ${'x'.repeat(70)}`);
  const open = pollCard({ id: 'p0000000000000000', question: 'q'.repeat(200), options: JSON.stringify(opts), closes_at: 2e9, closed_at: null, eligible: 'linked' }, opts.map((_, i) => i * 3), 1e9);
  assert.ok(countComponents(open) <= LIMITS.COMPONENTS, `${countComponents(open)} components`);
  const won = pollCard({ id: 'p0000000000000000', question: 'Q?', options: JSON.stringify(['A', 'B']), closes_at: 1, closed_at: 1, eligible: 'linked' }, [3, 1], 2);
  assert.match(JSON.stringify(won), /Result:\*\* A/);
});

test('PDA polls: the PDA\'s screen shows open polls with a private menu to vote, and an unlinked user reads them without one', async () => {
  const r = await staffRig();
  const a = await r.linked('Voter');
  const id = await opened(r);
  const s = assertScreenOk(await r.press(a, 'pda:polls'), 'polls');
  assert.match(screenText(s), /Which province next/);
  assert.ok(customIds(s).includes(`pda:polls:vote:${id}`));
  const voted = assertScreenOk(await r.choose(a, `pda:polls:vote:${id}`, ['0']), 'voted');
  assert.match(screenText(voted), /Your vote: \*\*Skyrim\*\*/);
  assert.match(screenText(voted), /you chose A/);
  assert.doesNotMatch(screenText(await r.press(a, 'pda:home')), /Polls:/, 'voted, nothing waits');
  const stranger = { id: snowflake(), username: 'reader' };
  const open = assertScreenOk(await r.press(stranger, 'open:polls', { message: card }), 'stranger');
  assert.match(screenText(open), /Link your account to vote/);
  assert.ok(!customIds(open).includes(`pda:polls:vote:${id}`));
  const b = await r.linked('Late');
  assert.match(screenText(await r.press(b, 'pda:home')), /Polls:\*\* 1 poll waiting/);
});

test('PDA polls: the game reads the polls with its vote and votes behind a session; a guest is refused', async () => {
  const r = await staffRig();
  const id = await opened(r);
  const a = await r.registered('Gamer');
  const g = await r.guest();
  const get = async (secret) => (await r.fetch('https://accounts.invalid/v1/polls', { headers: { authorization: `Bearer ${secret}` } })).json();
  const before = await get(a.secret);
  assert.equal(before.open.length, 1);
  assert.equal(before.open[0].mine, null);
  assert.deepEqual(before.open[0].options.map((o) => o.label), ['Skyrim', 'Morrowind', 'Elsweyr']);
  const v = await r.call('/v1/polls/vote', { poll: id, choice: 1 }, a.secret);
  assert.equal(v.status, 200);
  const after = await get(a.secret);
  assert.equal(after.open[0].mine, 1);
  assert.equal(after.open[0].options[1].votes, 1);
  assert.equal((await r.call('/v1/polls/vote', { poll: id, choice: 1 }, g.secret)).status, 403);
  assert.equal((await r.call('/v1/polls/vote', { poll: id, choice: 7 }, a.secret)).status, 400);
  assert.equal((await r.call('/v1/polls/vote', { poll: 'pffffffffffffffff', choice: 0 }, a.secret)).status, 404);
  r.raw.prepare('UPDATE pda_polls SET closes_at = ?').run(r.nowS() - 1);
  assert.equal((await r.call('/v1/polls/vote', { poll: id, choice: 0 }, a.secret)).status, 409);
  assert.equal((await r.call('/v1/polls/vote', { poll: id, choice: 0 })).status, 401);
});
