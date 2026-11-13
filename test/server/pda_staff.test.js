// The staff desk in the PDA: its door (staff alone), the open cases a Moderator and an Admin each see, a case's view and
// its buttons acting through modAct with the claim and the record, a player's lookup with its acts and notes, and the
// desk's polls and feedback queue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenText, customIds, assertScreenOk } from '../pdaRig.mjs';
import { staffRig, openCase } from '../pdaRigStaff.mjs';

const row = (r, sql, ...a) => r.raw.prepare(sql).get(...a);

test('PDA staff desk: a player is refused it and never sees it in the menu; a Moderator sees chat cases and an Admin spawn cases too', async () => {
  const r = await staffRig();
  const p = await r.linked('Plain');
  const troll = await r.registered('Troll');
  const spawner = await r.registered('Spawner');
  openCase(r.raw, troll.id, { reporters: [p.id] });
  openCase(r.raw, spawner.id, { kind: 'spawn', source: 'review' });
  assert.match(screenText(await r.press(p, 'pda:staff')), /for the staff/);
  assert.ok(!screenText(await r.press(p, 'pda:home')).includes('<Staff desk>'));
  const m = assertScreenOk(await r.press(r.mod, 'pda:staff'), 'moderator desk');
  assert.match(screenText(m), /Troll/);
  assert.doesNotMatch(screenText(m), /Spawner/, 'a spawn case is an Admin\'s');
  assert.ok(screenText(await r.press(r.mod, 'pda:home')).includes('<Staff desk>'));
  const d = assertScreenOk(await r.press(r.dev, 'pda:staff'), 'admin desk');
  assert.match(screenText(d), /Spawner/);
  assert.match(screenText(await r.press(r.mod, 'pda:home')), /Staff desk:/, 'Home says what waits');
});

test('PDA staff desk: a case is drawn with its lines (the account\'s own and the flagged line marked), reasons, notes, the reviewer and its buttons', async () => {
  const r = await staffRig();
  const rep = await r.registered('Witness');
  const troll = await r.registered('Troll');
  const now = r.nowS();
  const id = openCase(r.raw, troll.id, {
    reporters: [rep.id],
    reasons: ['hate'],
    lines: [
      { sub: rep.id, name: 'Witness', text: 'hello', at: now - 50 },
      { sub: troll.id, name: 'Troll', text: 'a vile **line**', at: now - 40 },
    ],
    ai: { category: 'hate', severity: 3, confidence: 0.9, reason: 'a slur', mode: 'shadow', lineAt: now - 40, lineSub: troll.id },
  });
  const v = assertScreenOk(await r.choose(r.mod, 'pda:staff:case', [id]), 'case');
  const t = screenText(v);
  assert.match(t, /! \[world\] Troll: a vile \*\*line\*\*/, 'a player\'s words inside a code block, the flagged line marked');
  assert.match(t, /  \[world\] Witness: hello/);
  assert.match(t, /Hate or slurs/);
  assert.match(t, /said it twice/);
  assert.match(t, /shadow, nothing done on it/);
  for (const k of ['m30', 'm1d', 'm7d', 'b30', 'dis']) assert.ok(customIds(v).includes(`pda:staff:act:${k}:${id}`));
});

test('PDA staff desk: Mute 30 min acts once through modAct - muted, the case actioned as Discord\'s, the record kept - and a second press finds it closed', async () => {
  const r = await staffRig();
  const rep = await r.registered('Witness');
  const troll = await r.registered('Troll');
  const id = openCase(r.raw, troll.id, { reporters: [rep.id] });
  const done = assertScreenOk(await r.press(r.mod, `pda:staff:act:m30:${id}`), 'acted');
  assert.match(screenText(done), /Done: Mute 30 min/);
  assert.match(screenText(done), /Actioned/);
  const p = row(r, 'SELECT muted_until FROM players WHERE id = ?', troll.id);
  assert.ok(p.muted_until > r.nowS() + 25 * 60 && p.muted_until <= r.nowS() + 31 * 60);
  const c = row(r, 'SELECT status, resolution FROM mod_cases WHERE id = ?', id);
  assert.equal(c.status, 'actioned');
  assert.match(c.resolution, /muted 30 min/);
  const act = row(r, "SELECT actor_name, case_id FROM mod_actions WHERE target = ? AND kind = 'mute'", troll.id);
  assert.equal(act.actor_name, 'Mod1 (Discord)');
  assert.equal(act.case_id, id);
  assert.ok(row(r, "SELECT COUNT(*) AS n FROM staff_audit WHERE act = 'mute' AND target = ?", troll.id).n >= 1, 'the staff log keeps it');
  assert.match(screenText(await r.press(r.mod, `pda:staff:act:b30:${id}`)), /already closed/);
  assert.equal(row(r, 'SELECT banned_until FROM players WHERE id = ?', troll.id).banned_until ?? 0, 0, 'no second act');
});

test('PDA staff desk: a case another press holds is shown as it stands; Dismiss closes it; a Moderator cannot act on a spawn case', async () => {
  const r = await staffRig();
  const troll = await r.registered('Troll');
  const id = openCase(r.raw, troll.id);
  r.raw.prepare('UPDATE mod_cases SET claimed_at = ? WHERE id = ?').run(r.nowS(), id);
  assert.match(screenText(await r.press(r.mod, `pda:staff:act:m1d:${id}`)), /acting on this case now/);
  r.raw.prepare('UPDATE mod_cases SET claimed_at = NULL WHERE id = ?').run(id);
  assert.match(screenText(await r.press(r.mod, `pda:staff:act:dis:${id}`)), /Dismissed/);
  assert.equal(row(r, 'SELECT status FROM mod_cases WHERE id = ?', id).status, 'dismissed');
  const sp = await r.registered('Spawner');
  const sid = openCase(r.raw, sp.id, { kind: 'spawn', source: 'review' });
  assert.match(screenText(await r.press(r.mod, `pda:staff:act:m30:${sid}`)), /That case is gone/);
  assert.match(screenText(await r.press(r.dev, `pda:staff:act:dis:${sid}`)), /Dismissed/, 'an Admin may');
});

test('PDA staff desk: a player looked up by name or id; muted by minutes, unmuted, banned and unbanned through modAct; a note added; a moderator is protected', async () => {
  const r = await staffRig();
  const target = await r.registered('Rowdy');
  assert.equal((await r.press(r.mod, 'pda:staff:lookup')).type, 9);
  const v = assertScreenOk(await r.submit(r.mod, 'pdam:staff:lookup', { who: 'rowdy' }), 'player');
  assert.match(screenText(v), /Rowdy/);
  assert.match(screenText(v), /in good standing/);
  assert.match(screenText(await r.submit(r.mod, 'pdam:staff:lookup', { who: target.id })), /Rowdy/, 'by id');
  assert.match(screenText(await r.submit(r.mod, 'pdam:staff:lookup', { who: 'Nobody77' })), /Nobody has that name/);
  assert.equal((await r.press(r.mod, `pda:staff:mute:${target.id}`)).data.custom_id, `pdam:staff:mute:${target.id}`);
  assert.match(screenText(await r.submit(r.mod, `pdam:staff:mute:${target.id}`, { minutes: '99999', reason: '' })), /A mute is 1 to/);
  const muted = await r.submit(r.mod, `pdam:staff:mute:${target.id}`, { minutes: '15', reason: 'spam' });
  assert.match(screenText(muted), /Muted for 15 min/);
  assert.match(screenText(muted), /muted until/);
  assert.match(screenText(await r.press(r.mod, `pda:staff:unmute:${target.id}`)), /can chat again/);
  assert.ok(row(r, 'SELECT muted_until FROM players WHERE id = ?', target.id).muted_until <= r.nowS());
  const banned = await r.submit(r.mod, `pdam:staff:ban:${target.id}`, { days: '3', reason: 'repeat' });
  assert.match(screenText(banned), /Banned until/);
  assert.ok(row(r, 'SELECT banned_until FROM players WHERE id = ?', target.id).banned_until > r.nowS() + 2 * 86400);
  assert.match(screenText(await r.press(r.mod, `pda:staff:unban:${target.id}`)), /Unbanned/);
  const noted = await r.submit(r.mod, `pdam:staff:note:${target.id}`, { text: 'warned in person' });
  assert.match(screenText(noted), /Note added/);
  assert.match(screenText(noted), /warned in person/);
  assert.equal(row(r, 'SELECT via FROM (SELECT json_extract(detail, \'$.via\') AS via FROM staff_audit WHERE act = \'note-add\')').via, 'discord');
  const other = await r.registered('Keeper');
  assert.match(screenText(await r.submit(r.mod, `pdam:staff:mute:${other.id}`, { minutes: '10' })), /Moderators cannot be muted/);
});

test('PDA staff desk: polls are opened and closed by an Admin alone; a poll\'s words are checked', async () => {
  const r = await staffRig();
  const m = assertScreenOk(await r.press(r.mod, 'pda:staff:polls'), 'mod polls');
  assert.match(screenText(m), /Only an Admin/);
  assert.ok(!customIds(m).includes('pda:staff:pnew'));
  assert.match(screenText(await r.press(r.mod, 'pda:staff:pnew')), /Only an Admin/);
  assert.match(screenText(await r.submit(r.mod, 'pdam:staff:poll', { question: 'Which?', options: 'A\nB', hours: '24', eligible: ['linked'] })), /Only an Admin/);
  assert.equal(row(r, 'SELECT COUNT(*) AS n FROM pda_polls').n, 0);
  const form = await r.press(r.dev, 'pda:staff:pnew');
  assert.equal(form.type, 9);
  assert.match(screenText(await r.submit(r.dev, 'pdam:staff:poll', { question: 'Which?', options: 'Same\nsame', hours: '24', eligible: ['linked'] })), /different options/);
  assert.match(screenText(await r.submit(r.dev, 'pdam:staff:poll', { question: 'Which?', options: 'A\nB', hours: '999', eligible: ['linked'] })), /runs 1 to 336 hours/);
  const ok = assertScreenOk(await r.submit(r.dev, 'pdam:staff:poll', { question: 'Which region next?', options: 'Skyrim\nMorrowind\n\nElsweyr', hours: '48', eligible: ['played'] }), 'opened');
  assert.match(screenText(ok), /Opened/);
  const poll = row(r, 'SELECT * FROM pda_polls');
  assert.deepEqual(JSON.parse(poll.options), ['Skyrim', 'Morrowind', 'Elsweyr']);
  assert.equal(poll.eligible, 'played');
  assert.equal(poll.made_by_name, 'Dev1');
  assert.ok(Math.abs(poll.closes_at - (r.nowS() + 48 * 3600)) <= 2);
  const closed = await r.choose(r.dev, 'pda:staff:pclose', [poll.id]);
  assert.match(screenText(closed), /Closed/);
  assert.ok(row(r, 'SELECT closed_at FROM pda_polls').closed_at);
  assert.match(screenText(await r.choose(r.mod, 'pda:staff:pclose', [poll.id])), /Only an Admin/);
});

test('PDA staff desk: the feedback queue lists what waits, opens one, and an answer is kept and told to the player once', async () => {
  const r = await staffRig();
  const p = await r.linked('Thinker');
  await r.submit(p, 'pdam:feedback:send', { kind: ['idea'], title: 'Horse armour', words: 'Let horses wear barding please.' });
  const id = row(r, 'SELECT id FROM pda_feedback').id;
  const q = assertScreenOk(await r.press(r.mod, 'pda:staff:feedback'), 'queue');
  assert.match(screenText(q), /Horse armour/);
  const item = assertScreenOk(await r.choose(r.mod, 'pda:staff:fopen', [id]), 'item');
  assert.match(screenText(item), /Let horses wear barding/);
  const set = assertScreenOk(await r.press(r.mod, `pda:staff:fset:planned:${id}`), 'set');
  assert.match(screenText(set), /player is told/);
  const f = row(r, 'SELECT status, status_by FROM pda_feedback WHERE id = ?', id);
  assert.equal(f.status, 'planned');
  assert.equal(f.status_by, 'Mod1');
  assert.equal(row(r, "SELECT COUNT(*) AS n FROM discord_notices WHERE discord_id = ? AND kind = 'feedback'", p.discordId).n, 1);
  assert.match(screenText(await r.press(r.mod, `pda:staff:fset:planned:${id}`)), /already says that/);
  assert.equal(row(r, "SELECT COUNT(*) AS n FROM discord_notices WHERE discord_id = ? AND kind = 'feedback'", p.discordId).n, 1, 'told once');
  assert.match(screenText(await r.press(r.mod, 'pda:staff:fset:bogus:fffffffffffffffffffff')), /not an answer|gone/);
});
