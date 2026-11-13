// Feedback in the PDA: ideas, balance and other words become staff cards in the staff's channel; bugs and exploits
// become private reports that never reach a channel; the staff's answers on a card and their notice to the player; the
// card's drawing by the clock; and the game's own routes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDiscord, snowflake, screenText, customIds, assertScreenOk } from '../pdaRig.mjs';
import { staffRig } from '../pdaRigStaff.mjs';
import { drawFeedbackCards, feedbackCard, CARD_TRIES_MAX, FEEDBACK_SEND_MAX, sendFeedback } from '../../server-account/src/pdaFeedback.js';
import { countComponents, LIMITS } from '../../server-account/src/pdaUi.js';

const row = (r, sql, ...a) => r.raw.prepare(sql).get(...a);
const MOD_CHANNEL = '900000000000000001';

test('PDA feedback: an idea becomes a staff card in the moderators\' channel straight after the answer, posted once with its id as the nonce', async () => {
  const r = await staffRig();
  const p = await r.linked('Thinker');
  const screen = assertScreenOk(await r.press(p, 'pda:feedback'), 'feedback screen');
  assert.match(screenText(screen), /never to a channel/);
  const form = await r.press(p, 'pda:feedback:write');
  assert.equal(form.type, 9);
  assert.deepEqual(form.data.components[0].component.options.map((o) => o.value), ['idea', 'balance', 'bug', 'exploit', 'other']);
  const sent = assertScreenOk(await r.submit(p, 'pdam:feedback:send', { kind: ['idea'], title: 'Horse armour', words: 'Let horses wear barding please.' }), 'sent');
  assert.match(screenText(sent), /Thank you/);
  assert.match(screenText(sent), /\*\*Horse armour\*\* · Idea · New/);
  const f = row(r, 'SELECT * FROM pda_feedback');
  assert.equal(f.player_id, p.id);
  const posts = r.discord.called('POST', `/channels/${MOD_CHANNEL}/messages`);
  assert.equal(posts.length, 1, 'posted after the answer');
  assert.equal(posts[0].payload.nonce, f.id);
  assert.equal(posts[0].payload.enforce_nonce, true);
  assert.equal(posts[0].payload.flags, 1 << 15, 'a public card, not a private one');
  assert.ok(JSON.stringify(posts[0].payload).includes(`fbk:planned:${f.id}`));
  const after = row(r, 'SELECT card_id, card_dirty, card_channel FROM pda_feedback');
  assert.ok(after.card_id);
  assert.equal(after.card_dirty, 0);
  assert.equal(after.card_channel, MOD_CHANNEL);
  assert.equal(await drawFeedbackCards(r.ctx(), r.env, fakeDiscord().fetchFn), 0, 'nothing due again');
});

test('PDA feedback: a bug and an exploit are private reports, never a card; the player sees their reports\' states', async () => {
  const r = await staffRig();
  const p = await r.linked('Finder');
  const bug = await r.submit(p, 'pdam:feedback:send', { kind: ['bug'], title: 'Door stuck', words: 'The tavern door never opens after rest.' });
  assert.match(screenText(bug), /developers alone/);
  await r.submit(p, 'pdam:feedback:send', { kind: ['exploit'], title: 'Gold dupe', words: 'Dropping a stack while trading copies it.' });
  const reps = r.raw.prepare('SELECT kind, subject FROM private_reports WHERE from_id = ? ORDER BY sent_at, kind').all(p.id);
  assert.deepEqual(reps.map((x) => x.kind).sort(), ['bug', 'exploit']);
  assert.equal(row(r, 'SELECT COUNT(*) AS n FROM pda_feedback').n, 0);
  assert.equal(r.discord.calls.filter((c) => c.method === 'POST' && c.path.includes('/messages')).length, 0, 'nothing posted anywhere');
  const s = screenText(await r.press(p, 'pda:feedback'));
  assert.match(s, /Your private reports/);
  assert.match(s, /\*\*Gold dupe\*\* · Exploit · Open · not read yet/);
  assert.match(screenText(await r.submit(p, 'pdam:feedback:send', { kind: ['bug'], title: 'x', words: 'too short' })), /A title is 3/);
});

test('PDA feedback: refusals are said in words - a short title, a short note, a kind not offered, and the hour\'s bound', async () => {
  const r = await staffRig();
  const p = await r.linked('Chatty');
  assert.match(screenText(await r.submit(p, 'pdam:feedback:send', { kind: ['idea'], title: 'ab', words: 'Long enough words here.' })), /A title is 3 to 80/);
  assert.match(screenText(await r.submit(p, 'pdam:feedback:send', { kind: ['idea'], title: 'Fine title', words: 'short' })), /Say a little more/);
  assert.match(screenText(await r.submit(p, 'pdam:feedback:send', { kind: ['nonsense'], title: 'Fine title', words: 'Long enough words here.' })), /Choose what kind/);
  for (let i = 0; i < FEEDBACK_SEND_MAX; i++) await r.submit(p, 'pdam:feedback:send', { kind: ['balance'], title: `Note ${i}`, words: 'Long enough words here.' });
  assert.match(screenText(await r.submit(p, 'pdam:feedback:send', { kind: ['balance'], title: 'One more', words: 'Long enough words here.' })), /a lot of feedback this hour/);
  assert.equal(row(r, 'SELECT COUNT(*) AS n FROM pda_feedback').n, FEEDBACK_SEND_MAX);
});

test('PDA feedback: a staff answer pressed on the card redraws it in place and tells the player once; a player\'s press is refused; a DISCORD_MODERATORS id acts too', async () => {
  const keeperDiscord = snowflake();
  const r = await staffRig({ DISCORD_MODERATORS: `${keeperDiscord}:Keeper` });
  await r.registered('Keeper');
  const p = await r.linked('Thinker');
  await r.submit(p, 'pdam:feedback:send', { kind: ['balance'], title: 'Bows too strong', words: 'Bows out-damage two-handers by far.' });
  const id = row(r, 'SELECT id FROM pda_feedback').id;
  const card = { flags: 1 << 15 };
  const refused = await r.press(p, `fbk:planned:${id}`, { message: card });
  assert.equal(refused.type, 4);
  assert.ok(refused.data.flags & 64, 'a private refusal');
  assert.match(screenText(refused), /for the staff/);
  assert.equal(row(r, 'SELECT status FROM pda_feedback').status, 'new');
  const done = assertScreenOk(await r.press(r.mod, `fbk:planned:${id}`, { message: card }), 'card');
  assert.equal(done.type, 7, 'the card itself, drawn again');
  assert.equal(done.data.flags & 64, 0, 'still public');
  const planned = JSON.stringify(done.data.components).match(/"label":"Planned"[^}]*"disabled":(true|false)/);
  assert.equal(planned?.[1], 'true', 'the answer given is greyed');
  assert.match(screenText(done), /Planned · by Mod1/);
  assert.equal(row(r, 'SELECT card_dirty FROM pda_feedback').card_dirty, 0, 'drawn in place, nothing for the clock');
  const n = r.raw.prepare("SELECT * FROM discord_notices WHERE kind = 'feedback'").all();
  assert.equal(n.length, 1);
  assert.equal(n[0].discord_id, p.discordId);
  assert.ok(n[0].card.includes('Planned'));
  await r.press(r.mod, `fbk:planned:${id}`, { message: card });
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM discord_notices WHERE kind = 'feedback'").get().n, 1, 'the same answer is no news');
  const viaList = await r.press({ id: keeperDiscord, username: 'keeper' }, `fbk:done:${id}`, { message: card });
  assert.equal(viaList.type, 7);
  assert.equal(row(r, 'SELECT status, status_by FROM pda_feedback').status_by, 'Keeper');
  const s = screenText(await r.press(p, 'pda:feedback'));
  assert.match(s, /\*\*Bows too strong\*\* · Balance · Done/);
  assert.match(screenText(await r.press(p, 'pda:home')), /Feedback:\*\* the staff answered 1 piece/);
});

test('PDA feedback: the clock redraws a card whose message was deleted, waits while Discord is down, and lets go of one Discord keeps refusing', async () => {
  const r = await staffRig();
  const p = await r.linked('Thinker');
  const made = await sendFeedback(r.ctx(), r.raw.prepare('SELECT * FROM players WHERE id = ?').get(p.id), { kind: 'other', title: 'Music', body: 'The tavern songs are lovely.' });
  const first = fakeDiscord({ 'POST /channels/*': { id: '555000000000000001' } });
  assert.equal(await drawFeedbackCards(r.ctx(), r.env, first.fetchFn), 1);
  r.raw.prepare('UPDATE pda_feedback SET card_dirty = 1').run();
  const gone = fakeDiscord({ 'PATCH /channels/*': { status: 404, json: { message: 'Unknown Message' } }, 'POST /channels/*': { id: '555000000000000002' } });
  assert.equal(await drawFeedbackCards(r.ctx(), r.env, gone.fetchFn), 1);
  assert.equal(gone.called('POST', '/channels/').length, 1, 'posted anew');
  assert.equal(row(r, 'SELECT card_id FROM pda_feedback').card_id, '555000000000000002');
  r.raw.prepare('UPDATE pda_feedback SET card_dirty = 1').run();
  const down = fakeDiscord({ 'PATCH /channels/*': { status: 503 } });
  assert.equal(await drawFeedbackCards(r.ctx(), r.env, down.fetchFn), 0);
  const d = row(r, 'SELECT card_dirty, card_tries FROM pda_feedback');
  assert.deepEqual([d.card_dirty, d.card_tries], [1, 0], 'down: waits, counts nothing');
  const no = fakeDiscord({ 'PATCH /channels/*': { status: 400, json: { message: 'Invalid Form Body' } } });
  for (let i = 0; i < CARD_TRIES_MAX + 2; i++) await drawFeedbackCards(r.ctx(), r.env, no.fetchFn);
  assert.equal(no.called('PATCH', '/channels/').length, CARD_TRIES_MAX, 'let go after its tries');
  assert.ok(made.ok);
});

test('PDA feedback: every card is within Discord\'s bounds, a long note included, and a sender\'s marks cannot draw a link or a ping', () => {
  const card = feedbackCard({ id: 'f00000000000000000000', player_id: 'acct', kind: 'idea', title: '[click](https://x) @everyone', body: 'w'.repeat(1500), status: 'seen', status_by: 'Mod1', status_at: 1, made_at: 1 }, '<@123>');
  assert.ok(countComponents(card) <= LIMITS.COMPONENTS);
  const t = JSON.stringify(card);
  assert.ok(!t.includes('[click](https'), 'the title\'s link is escaped');
  assert.ok(t.includes('\\\\<\\\\@123'), 'the name\'s ping is escaped');
});

test('PDA feedback: the game sends and lists feedback behind a session; a guest is told to register; a bug is the reports\' door', async () => {
  const r = await staffRig();
  const g = await r.guest();
  assert.equal((await r.call('/v1/feedback/send', { kind: 'idea', title: 'Hello', body: 'A guest has ideas too.' }, g.secret)).status, 403);
  const a = await r.registered('Gamer');
  const ok = await r.call('/v1/feedback/send', { kind: 'idea', title: 'Fishing', body: 'More fish in the Bay please.' }, a.secret);
  assert.equal(ok.status, 200);
  assert.match(ok.body.id, /^f[0-9a-f]{20}$/);
  assert.equal((await r.call('/v1/feedback/send', { kind: 'bug', title: 'Crash', body: 'It crashes on load.' }, a.secret)).body.error, 'feedback-kind');
  const mine = await r.call('/v1/feedback/mine', {}, a.secret);
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.feedback.map((f) => [f.title, f.status]), [['Fishing', 'new']]);
  assert.equal((await r.call('/v1/feedback/mine', {}, g.secret)).status, 403);
  assert.equal((await r.call('/v1/feedback/mine', {})).status, 401);
  assert.ok(customIds(await r.press(await r.linked('Other'), 'pda:feedback')).includes('pda:feedback:write'));
});
