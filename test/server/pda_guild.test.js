// The PDA's Guild screen: a guild run from Discord through guilds.js's own acts - the front page and who is online,
// the roster and its moves (shown only where the rank may, refused where a button is forged), invitations and join
// requests both ways, the board, the vault and hall read only, leaving, and the clock's guild notices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdaRig, screenText, customIds, assertScreenOk } from '../pdaRig.mjs';
import { seatRealm } from '../realmSeat.mjs';
import { T0 } from '../accountDb.mjs';
import { guildNotices } from '../../server-account/src/pdaGuild.js';

/** A guild founded by a linked guildmaster, and a way to bring linked members in through the PDA itself. */
async function guildRig() {
  const r = await pdaRig({ MARKS_OPEN: 'on', BOARD_OPEN: 'on' });
  const gm = await r.linked('Aldric', { renown: 10 });
  const realm = await seatRealm(r.env, gm.secret, 'Aldric', { name: 'Aldric', level: 5, goldPieces: 20_000, items: [], bankAccounts: [{ accountGold: 0 }] });
  gm.character = realm.id;
  r.raw.prepare('INSERT OR REPLACE INTO renown_tracks (player, char_id, name, xp, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(gm.id, gm.character, 'Aldric', 1_000_000, T0, T0);
  const found = await r.call('/v1/guilds/found', { character: gm.character, name: 'The Iron Oath', tag: 'IRON', realm: realm.at(), region: 0 }, gm.secret);
  assert.equal(found.status, 200, JSON.stringify(found.body));
  r.raw.prepare('UPDATE discord_links SET char_id = ? WHERE discord_id = ?').run(gm.character, gm.discordId);
  const gid = found.body.guild.id;
  /** A linked player with a realm character, invited from the PDA and joined from the PDA. */
  const join = async (handle) => {
    const p = await r.linked(handle, { seated: true });
    assert.match(screenText(await r.submit(gm, 'pdam:guild:invite', { name: handle })), /Invited/);
    const answer = assertScreenOk(await r.press(p, `pda:guild:join:${gid}`), 'join');
    assert.match(screenText(answer), /Welcome to The Iron Oath/);
    p.member = `m${r.raw.prepare('SELECT rowid FROM guild_members WHERE player = ?').get(p.id).rowid}`;
    return p;
  };
  const rankOf = (p) => r.raw.prepare('SELECT rank FROM guild_members WHERE player = ?').get(p.id)?.rank;
  return { r, gm, gid, join, rankOf };
}

test('PDA guild: the front page names the guild, the rank, the members and who is online now; every screen is within Discord\'s bounds', async () => {
  const { r, gm, join } = await guildRig();
  const bo = await join('Bren');
  r.raw.prepare('UPDATE players SET played_at = ? WHERE id = ?').run(r.nowS() - 30, bo.id);
  r.raw.prepare('UPDATE players SET played_at = ? WHERE id = ?').run(r.nowS() - 7200, gm.id);
  const front = assertScreenOk(await r.press(gm, 'pda:guild'), 'front');
  const t = screenText(front);
  assert.match(t, /The Iron Oath/);
  assert.match(t, /IRON/);
  assert.match(t, /You are \*\*Guildmaster\*\*/);
  assert.match(t, /2 members of 75/);
  assert.match(t, /1 online now/);
  assert.match(t, /Online:\*\* Bren/);
  for (const id of ['pda:guild:members:0', 'pda:guild:board', 'pda:guild:vault', 'pda:guild:hall', 'pda:guild:invite', 'pda:guild:leave']) assert.ok(customIds(front).includes(id), id);
  for (const id of ['pda:guild:members:0', 'pda:guild:board', 'pda:guild:vault', 'pda:guild:hall', 'pda:guild:reqs']) assertScreenOk(await r.press(gm, id), id);
  assert.match(screenText(await r.press(gm, 'pda:guild:hall')), /no hall/);
  assert.match(screenText(await r.press(gm, 'pda:guild:vault')), /Vault:\*\* 0 of 50/);
  assert.match(screenText(await r.press(gm, 'pda:home')), /Guild:\*\* The Iron Oath/, 'Home\'s glance');
});

test('PDA guild: a member\'s view offers only what the rank may; Promote and Remove are refused by the game when forged; the guildmaster moves and removes through the game\'s own acts', async () => {
  const { r, gm, join, rankOf } = await guildRig();
  const a = await join('Cael');
  const b = await join('Dina');
  assert.equal(rankOf(a), 3, 'a new member is a Recruit');
  // the recruit sees no moves on another recruit, and no Invite on the front page
  const view = await r.choose(a, 'pda:guild:member', [b.member]);
  assert.ok(!customIds(view).some((id) => id.startsWith('pda:guild:rank') || id.startsWith('pda:guild:rm')), 'no moves for a recruit');
  assert.ok(!customIds(await r.press(a, 'pda:guild')).includes('pda:guild:invite'));
  // a forged promote and a forged remove are the game's refusal
  assert.match(screenText(await r.press(a, `pda:guild:rank:${b.member}:2`)), /Your rank may not do that/);
  assert.equal(rankOf(b), 3);
  assert.match(screenText(await r.press(a, `pda:guild:rmyes:${b.member}`)), /Your rank may not do that/);
  assert.equal(rankOf(b), 3);
  // the guildmaster sees the moves and makes them
  const gmView = await r.choose(gm, 'pda:guild:member', [a.member]);
  assert.ok(customIds(gmView).includes(`pda:guild:rank:${a.member}:2`), 'promote to Member');
  assert.ok(!customIds(gmView).some((id) => id === `pda:guild:rank:${a.member}:4`), 'no rank below the lowest');
  assert.match(screenText(await r.press(gm, `pda:guild:rank:${a.member}:2`)), /Done/);
  assert.equal(rankOf(a), 2);
  assert.match(screenText(await r.press(gm, `pda:guild:rank:${a.member}:1`)), /Done/);
  assert.equal(rankOf(a), 1, 'an Officer now');
  // an officer may move recruits, not the guildmaster
  const offView = await r.choose(a, 'pda:guild:member', [b.member]);
  assert.ok(customIds(offView).includes(`pda:guild:rank:${b.member}:2`));
  assert.ok(customIds(offView).includes(`pda:guild:rm:${b.member}`));
  const gmRow = `m${r.raw.prepare('SELECT rowid FROM guild_members WHERE player = ?').get(gm.id).rowid}`;
  assert.ok(!customIds(await r.choose(a, 'pda:guild:member', [gmRow])).some((id) => id.startsWith('pda:guild:rank') || id.startsWith('pda:guild:rm')));
  // remove is asked once more, then done
  const ask = await r.press(a, `pda:guild:rm:${b.member}`);
  assert.ok(customIds(ask).includes(`pda:guild:rmyes:${b.member}`));
  assert.equal(rankOf(b), 3, 'asking is not removing');
  assertScreenOk(await r.press(a, `pda:guild:rmyes:${b.member}`), 'removed');
  assert.equal(rankOf(b), undefined);
  // a custom id naming no member is refused, never a crash
  assert.match(screenText(await r.press(gm, 'pda:guild:rank:x:1')), /gone or has moved/);
});

test('PDA guild: invitations are answered from Discord, declined or joined; a request to join is sent by tag, taken back, and answered by the guild\'s rank that may', async () => {
  const { r, gm, gid } = await guildRig();
  const e = await r.linked('Esme', { seated: true });
  // no guild: the screen says so, and offers to ask
  const none = assertScreenOk(await r.press(e, 'pda:guild'), 'no guild');
  assert.match(screenText(none), /is in no guild/);
  assert.ok(customIds(none).includes('pda:guild:ask'));
  // invited, then declined
  await r.submit(gm, 'pdam:guild:invite', { name: 'Esme' });
  const invited = await r.press(e, 'pda:guild');
  assert.match(screenText(invited), /Invitations:\*\*/);
  assert.ok(customIds(invited).includes('pda:guild:inv'));
  const one = assertScreenOk(await r.choose(e, 'pda:guild:inv', [gid]), 'one invitation');
  assert.ok(customIds(one).includes(`pda:guild:join:${gid}`));
  assert.match(screenText(await r.press(e, `pda:guild:decline:${gid}`)), /Declined/);
  assert.match(screenText(await r.press(e, `pda:guild:join:${gid}`)), /invitation is gone/);
  // asked by tag: a form, then the request stands and the guild sees it
  assert.equal((await r.press(e, 'pda:guild:ask')).type, 9);
  assert.match(screenText(await r.submit(e, 'pdam:guild:ask', { tag: 'zzzz' })), /No guild has that tag/);
  assert.match(screenText(await r.submit(e, 'pdam:guild:ask', { tag: 'iron' })), /Asked/);
  const front = await r.press(gm, 'pda:guild');
  assert.match(screenText(front), /Join requests waiting:\*\* 1/);
  // taken back, asked again, then accepted by the guildmaster
  assert.match(screenText(await r.choose(e, 'pda:guild:unask', [gid])), /taken back/);
  await r.submit(e, 'pdam:guild:ask', { tag: 'IRON' });
  const reqs = assertScreenOk(await r.press(gm, 'pda:guild:reqs'), 'requests');
  const q = `q${r.raw.prepare('SELECT id FROM guild_requests WHERE player = ?').get(e.id).id}`;
  assert.ok(customIds(await r.choose(gm, 'pda:guild:req', [q])).includes(`pda:guild:reqyes:${q}`));
  assert.ok(reqs);
  assert.match(screenText(await r.press(gm, `pda:guild:reqyes:${q}`)), /Accepted/);
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM guild_members WHERE player = ?').get(e.id).n, 1);
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM server_post WHERE to_id = ? AND subject LIKE 'You joined%'").get(e.id).n, 1, 'the asker gets the game\'s letter');
  // a recruit cannot answer requests, even with a forged button
  const f = await r.linked('Finn', { seated: true });
  await r.submit(f, 'pdam:guild:ask', { tag: 'IRON' });
  const fq = `q${r.raw.prepare('SELECT id FROM guild_requests WHERE player = ?').get(f.id).id}`;
  assert.match(screenText(await r.press(e, `pda:guild:reqyes:${fq}`)), /Your rank may not do that/);
});

test('PDA guild: the board is read, pinned to and taken down from Discord, under the board\'s own rules', async () => {
  const { r, gm, join } = await guildRig();
  const a = await join('Gwen');
  assert.equal((await r.press(a, 'pda:guild:pin')).type, 9);
  assert.match(screenText(await r.submit(a, 'pdam:guild:pin', { subject: 'Raid tonight', body: 'Meet at the gate.', days: ['1'] })), /Pinned/);
  const board = assertScreenOk(await r.press(gm, 'pda:guild:board'), 'board');
  assert.match(screenText(board), /Raid tonight/);
  const id = r.raw.prepare('SELECT id FROM guild_notes').get().id;
  const note = assertScreenOk(await r.choose(gm, 'pda:guild:note', [id]), 'note');
  assert.match(screenText(note), /Meet at the gate/);
  assert.ok(customIds(note).includes(`pda:guild:unpin:${id}`), 'the guildmaster keeps the board');
  const b = await join('Hugh');
  assert.ok(!customIds(await r.choose(b, 'pda:guild:note', [id])).includes(`pda:guild:unpin:${id}`), 'a recruit may not take down another\'s note');
  assert.match(screenText(await r.press(b, `pda:guild:unpin:${id}`)), /That note is gone/, 'forged, the game refuses');
  assert.match(screenText(await r.press(gm, `pda:guild:unpin:${id}`)), /Taken down/);
  assert.match(screenText(await r.submit(a, 'pdam:guild:pin', { subject: '', body: 'x', days: ['1'] })), /needs a subject/);
  // the board's switch is the board's
  r.env.BOARD_OPEN = 'off';
  assert.match(screenText(await r.press(gm, 'pda:guild:board')), /guild board is closed/);
  assert.match(screenText(await r.submit(a, 'pdam:guild:pin', { subject: 'x', body: 'y', days: ['1'] })), /guild board is closed/);
});

test('PDA guild: a member leaves after a second press; a guildmaster is sent to the game; nothing that moves a save is offered', async () => {
  const { r, gm, join, rankOf } = await guildRig();
  const a = await join('Jory');
  const ask = await r.press(a, 'pda:guild:leave');
  assert.ok(customIds(ask).includes('pda:guild:leaveyes'));
  assert.equal(rankOf(a), 3);
  assert.match(screenText(await r.press(a, 'pda:guild:leaveyes')), /You left the guild/);
  assert.equal(rankOf(a), undefined);
  assert.match(screenText(await r.press(gm, 'pda:guild:leave')), /guildmaster leaves in the game/);
  assert.match(screenText(await r.press(gm, 'pda:guild:leaveyes')), /guildmaster leaves in the game/, 'forged, still refused');
  assert.equal(rankOf(gm), 0);
  const all = (await Promise.all(['pda:guild', 'pda:guild:vault', 'pda:guild:hall'].map((id) => r.press(gm, id)))).flatMap(customIds);
  for (const id of all) assert.doesNotMatch(id, /deposit|withdraw|found|disband|handover|rename|take|put/, id);
});

test('PDA guild: no online character, the screen says so; a guest-free account with no guild is offered to ask', async () => {
  const r = await pdaRig({ MARKS_OPEN: 'on' });
  const p = await r.linked('Kira');
  assert.match(screenText(assertScreenOk(await r.press(p, 'pda:guild'), 'no character')), /no online character/);
  assert.match(screenText(await r.press(p, 'pda:guild:members:0')), /no online character/);
});

test('PDA guild notices: an invitation to a linked account, and a join request to a guild whose rank may answer, each told once; the mark moves for links that want none', async () => {
  const { r, gm, gid } = await guildRig();
  const k = await r.linked('Lena', { seated: true });
  r.raw.prepare('UPDATE discord_links SET invite_seen = 0').run();
  await r.submit(gm, 'pdam:guild:invite', { name: 'Lena' });
  const m = await r.linked('Moss', { seated: true });
  await r.submit(m, 'pdam:guild:ask', { tag: 'IRON' });
  // rows written this second wait for the clock's next minute
  r.raw.prepare('UPDATE guild_invites SET at = at - 10').run();
  r.raw.prepare('UPDATE guild_requests SET at = at - 10').run();
  assert.ok((await guildNotices(r.ctx())) >= 2);
  const kin = r.raw.prepare("SELECT ref FROM discord_notices WHERE discord_id = ? AND kind = 'guild'").all(k.discordId).map((x) => x.ref);
  assert.deepEqual(kin.map((x) => x.split(':')[0]), ['inv']);
  assert.ok(kin[0].startsWith(`inv:${gid}:`));
  const gmin = r.raw.prepare("SELECT ref FROM discord_notices WHERE discord_id = ? AND kind = 'guild'").all(gm.discordId).map((x) => x.ref);
  assert.equal(gmin.length, 1);
  assert.match(gmin[0], /^req:\d+$/);
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM discord_notices WHERE discord_id = ? AND kind = 'guild'").get(m.discordId).n, 0, 'the asker is told nothing');
  const before = r.raw.prepare("SELECT COUNT(*) AS n FROM discord_notices WHERE kind = 'guild'").get().n;
  await guildNotices(r.ctx());
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM discord_notices WHERE kind = 'guild'").get().n, before, 'told once');
  // a link that wants no guild news is told nothing, and its mark still moves
  r.raw.prepare('UPDATE discord_links SET dm = 0, invite_seen = 0 WHERE discord_id = ?').run(k.discordId);
  r.raw.prepare("DELETE FROM discord_notices WHERE discord_id = ?").run(k.discordId);
  await guildNotices(r.ctx());
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM discord_notices WHERE discord_id = ?').get(k.discordId).n, 0);
  assert.ok(r.raw.prepare('SELECT invite_seen FROM discord_links WHERE discord_id = ?').get(k.discordId).invite_seen > 0);
  // a row from this very second is left for the next minute
  await r.submit(gm, 'pdam:guild:invite', { name: 'Moss' });
  r.raw.prepare('UPDATE discord_links SET invite_seen = 0 WHERE discord_id = ?').run(m.discordId);
  await guildNotices(r.ctx());
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM discord_notices WHERE discord_id = ? AND ref LIKE 'inv:%'").get(m.discordId).n, 0);
});
