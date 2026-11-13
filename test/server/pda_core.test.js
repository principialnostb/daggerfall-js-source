// The Discord PDA's core: the UI kit's bounds, the account link both ways, the router's doors (unlinked, linked,
// barred), Settings, Mail, the outbox and its sender, the Terminal the service keeps, and the game's own routes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdaRig, fakeDiscord, snowflake, screenText, customIds, assertScreenOk } from '../pdaRig.mjs';
import { button, modal, formValues, countComponents, select, LIMITS, customId } from '../../server-account/src/pdaUi.js';
import {
  mintLinkCode,
  redeemLinkCode,
  normalCode,
  LINK_TRY_MAX,
  LINK_CODE_TTL_S,
  LINK_DM_DEFAULT,
  NOTICE_KINDS,
} from '../../server-account/src/pdaLink.js';
import { SCREENS, terminalCard, TERMINAL_VERSION } from '../../server-account/src/pdaFrame.js';
import { pdaModules, pdaHeads } from '../../server-account/src/pdaRouter.js';
import { mailNotices } from '../../server-account/src/pdaMail.js';
import { sendNotices, queueNotice, sweepNotices, NOTICE_KEEP_S } from '../../server-account/src/pdaNotices.js';
import { ensureTerminal, _resetTerminalForTests, TERMINAL_CHANNEL_NAME } from '../../server-account/src/pdaTerminal.js';
import { pdaMinute } from '../../server-account/src/pdaClock.js';
import { MINUTE_JOBS, HOUR_JOBS } from '../../server-account/src/cron.js';
import { pdaRoutes } from '../../server-account/src/pdaRoutes.js';

test('PDA UI: a custom id past 100 characters is refused, never cut; a modal holds at most five labelled fields; a form reads back by id', () => {
  assert.throws(() => customId('x'.repeat(101)));
  assert.equal(button('A', 'pda:home').custom_id, 'pda:home');
  const m = modal('pdam:mail:send', 'A title far longer than forty-five characters, cut', [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B', options: [{ label: 'x', value: 'x' }] },
  ]);
  assert.equal(m.type, 9);
  assert.ok(m.data.title.length <= LIMITS.MODAL_TITLE);
  assert.equal(m.data.components[0].type, 18);
  assert.equal(m.data.components[1].component.type, 3);
  assert.deepEqual(
    formValues({ components: [{ type: 18, component: { custom_id: 'a', value: 'hi' } }, { type: 18, component: { custom_id: 'b', values: ['x'] } }] }),
    { a: 'hi', b: 'x' },
  );
  assert.equal(countComponents([select('s', [{ label: 'a', value: 'a' }])]), 2, 'a row and its menu');
});

test('PDA link: a code is minted for a registered account alone, typed in Discord within its life, works once, and moves a link that stood before', async () => {
  const r = await pdaRig();
  const g = await r.guest();
  const guest = r.raw.prepare('SELECT * FROM players WHERE id = ?').get(g.id);
  assert.deepEqual(await mintLinkCode(r.ctx(), guest), { error: 'discord-needs-account' });
  const a = await r.registered('Avel');
  const row = r.raw.prepare('SELECT * FROM players WHERE id = ?').get(a.id);
  const m = await mintLinkCode(r.ctx(), row);
  assert.match(m.code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(normalCode(m.code.toLowerCase().replace('-', ' ')), m.code.replace('-', ''));
  const user = { id: snowflake(), username: 'avel' };
  assert.deepEqual(await redeemLinkCode(r.ctx(), user, 'ZZZZ-ZZZZ'), { error: 'bad-code' });
  const ok = await redeemLinkCode(r.ctx(), user, m.code);
  assert.equal(ok.ok, true);
  assert.deepEqual(await redeemLinkCode(r.ctx(), { id: snowflake(), username: 'x' }, m.code), { error: 'bad-code' }, 'a code works once');
  const link = r.raw.prepare('SELECT * FROM discord_links WHERE player_id = ?').get(a.id);
  assert.equal(link.discord_id, user.id);
  assert.equal(link.dm, LINK_DM_DEFAULT);
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM server_post WHERE to_id = ? AND subject = 'Linked to Discord'").get(a.id).n, 1, 'the account is told');
  // The same Discord user links another account: the first is unlinked, and told.
  const b = await r.registered('Brisa');
  const mb = await mintLinkCode(r.ctx(), r.raw.prepare('SELECT * FROM players WHERE id = ?').get(b.id));
  assert.equal((await redeemLinkCode(r.ctx(), user, mb.code)).ok, true);
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM discord_links WHERE player_id = ?').get(a.id).n, 0);
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM server_post WHERE to_id = ? AND subject = 'Unlinked from Discord'").get(a.id).n, 1);
  // An expired code is refused.
  const mc = await mintLinkCode(r.ctx(), r.raw.prepare('SELECT * FROM players WHERE id = ?').get(a.id));
  r.raw.prepare('UPDATE discord_link_codes SET expires_at = ?').run(r.nowS() - 1);
  assert.deepEqual(await redeemLinkCode(r.ctx(), { id: snowflake(), username: 'late' }, mc.code), { error: 'bad-code' });
  assert.ok(LINK_CODE_TTL_S <= 600);
});

test('PDA link: a Discord user has LINK_TRY_MAX tries in ten minutes, so a code cannot be guessed', async () => {
  const r = await pdaRig();
  const user = { id: snowflake(), username: 'guesser' };
  for (let i = 0; i < LINK_TRY_MAX; i++) assert.deepEqual(await redeemLinkCode(r.ctx(), user, 'AAAA-AAAA'), { error: 'bad-code' });
  assert.deepEqual(await redeemLinkCode(r.ctx(), user, 'AAAA-AAAA'), { error: 'discord-rate' });
});

test('PDA router: an unlinked user meets the link screen; the code form links them from Discord; a press that is not the PDA\'s stays the moderators\' queue', async () => {
  const r = await pdaRig();
  const stranger = { id: snowflake(), username: 'stranger' };
  const home = assertScreenOk(await r.press(stranger, 'open:home', { message: { flags: 1 << 15 } }), 'link screen');
  assert.equal(home.type, 4, 'a public card opens a new private screen');
  assert.ok(home.data.flags & 64, 'seen by the presser alone');
  assert.match(screenText(home), /Link your DFO Online account/);
  const form = assertScreenOk(await r.press(stranger, 'pda:link:code'), 'code form');
  assert.equal(form.type, 9);
  const a = await r.registered('Corvin');
  const m = await mintLinkCode(r.ctx(), r.raw.prepare('SELECT * FROM players WHERE id = ?').get(a.id));
  const linked = assertScreenOk(await r.submit(stranger, 'pdam:link:code', { code: m.code }), 'linked home');
  assert.equal(linked.type, 7, 'drawn in place of the private screen');
  assert.match(screenText(linked), /Corvin/);
  assert.match(screenText(linked), /no online character yet/);
  // a moderators' card press from a stranger is still the queue's refusal
  const mod = await r.press(stranger, 'safe:m30:0123456789abcdef');
  assert.match(mod.data.content, /Only the game's moderators/);
  assert.ok(pdaHeads().has('pda') && !pdaHeads().has('safe'));
});

test('PDA router: every screen a linked player can reach is drawn within Discord\'s bounds, and the menu names only what they may open', async () => {
  const r = await pdaRig();
  const p = await r.linked('Dara', { seated: true });
  for (const s of SCREENS) {
    const a = assertScreenOk(await r.choose(p, 'pda:nav', [s.key]), s.key);
    assert.equal(a.type, 7);
    const t = screenText(a);
    if (s.staff) assert.match(t, /for the staff/, 'a player is refused the staff desk');
    else assert.doesNotMatch(t, /Link your DFO Online account to use/);
  }
  const nav = customIds(await r.press(p, 'pda:home')).filter((id) => id === 'pda:nav');
  assert.equal(nav.length, 1);
  assert.ok(!screenText(await r.press(p, 'pda:home')).includes('<Staff desk>'), 'the staff desk is not in a player\'s menu');
  assert.deepEqual(pdaModules().map((m) => m.key), SCREENS.map((s) => s.key), 'one module a screen, in the menu\'s order');
});

test('PDA home: the character the PDA acts as, with its level, class and region, and the glances', async () => {
  const r = await pdaRig();
  const p = await r.linked('Eira', { seated: true });
  r.raw.prepare('UPDATE realm_characters SET summary = ? WHERE id = ?').run(JSON.stringify({ level: 12, className: 'Spellsword', race: 'Breton', region: 'Daggerfall' }), p.character);
  const t = screenText(await r.press(p, 'pda:home'));
  assert.match(t, /Level 12/);
  assert.match(t, /Breton Spellsword/);
  assert.match(t, /Daggerfall/);
  assert.match(t, /Mail:/);
});

test('PDA settings: direct messages chosen, the card shown, a character chosen, a test message sent or refused, and unlinking asked twice', async () => {
  const r = await pdaRig();
  const p = await r.linked('Fenn', { seated: true });
  const s1 = assertScreenOk(await r.choose(p, 'pda:settings:dm', ['mail', 'exp']), 'dm');
  assert.match(screenText(s1), /Saved/);
  assert.equal(r.raw.prepare('SELECT dm FROM discord_links WHERE player_id = ?').get(p.id).dm, NOTICE_KINDS.mail.bit | NOTICE_KINDS.exp.bit);
  await r.choose(p, 'pda:settings:dm', []);
  assert.equal(r.raw.prepare('SELECT dm FROM discord_links WHERE player_id = ?').get(p.id).dm, 0);
  await r.press(p, 'pda:settings:profile');
  assert.equal(r.raw.prepare('SELECT profile_open FROM discord_links WHERE player_id = ?').get(p.id).profile_open, 1);
  const c = await r.choose(p, 'pda:settings:char', [p.character]);
  assert.match(screenText(c), /now acts as/);
  assert.match(screenText(await r.choose(p, 'pda:settings:char', ['r00000000000000000000'])), /gone/);
  // Discord delivers the test.
  const t = await r.press(p, 'pda:settings:test');
  assert.match(screenText(t), /Sent/);
  assert.equal(r.discord.called('POST', '/users/@me/channels').length, 1);
  // Discord refuses: the link is marked, and Settings says how to fix it.
  r.discord.calls.length = 0;
  const shut = fakeDiscord({ 'POST /channels/*': { status: 403, json: { code: 50007, message: 'Cannot send messages to this user' } } });
  const prevFetch = r.discord.fetchFn;
  r.discord.fetchFn = shut.fetchFn;
  assert.match(screenText(await r.press(p, 'pda:settings:test')), /would not deliver/);
  r.discord.fetchFn = prevFetch;
  assert.equal(r.raw.prepare('SELECT dm_dead FROM discord_links WHERE player_id = ?').get(p.id).dm_dead, 1);
  const ask = await r.press(p, 'pda:settings:unlink');
  assert.ok(customIds(ask).includes('pda:settings:unlinkyes'));
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM discord_links WHERE player_id = ?').get(p.id).n, 1, 'asking is not unlinking');
  assert.match(screenText(await r.press(p, 'pda:settings:unlinkyes')), /Unlinked/);
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM discord_links WHERE player_id = ?').get(p.id).n, 0);
  assert.match(screenText(await r.press(p, 'pda:mail')), /Link your DFO Online account/, 'unlinked, the PDA asks for a link again');
});

test('PDA router: a banned account sees only that it is banned, and may still unlink', async () => {
  const r = await pdaRig();
  const p = await r.linked('Gale');
  r.raw.prepare('UPDATE players SET banned_until = ? WHERE id = ?').run(r.nowS() + 3600, p.id);
  assert.match(screenText(await r.press(p, 'pda:mail')), /banned/);
  assert.match(screenText(await r.press(p, 'pda:mail:write')), /banned/);
  await r.press(p, 'pda:settings:unlinkyes');
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM discord_links WHERE player_id = ?').get(p.id).n, 0);
});

test('PDA mail: written from a form, read, answered by account, deleted; the game\'s refusals are said in words; a blocked sender is never delivered', async () => {
  const r = await pdaRig();
  const a = await r.linked('Hale');
  const b = await r.linked('Iona');
  const form = await r.press(a, 'pda:mail:write');
  assert.equal(form.type, 9);
  const sent = assertScreenOk(await r.submit(a, 'pdam:mail:send', { to: 'Iona', subject: 'Hello', body: 'A letter from Discord.' }), 'sent');
  assert.match(screenText(sent), /Sent to/);
  const inbox = assertScreenOk(await r.press(b, 'pda:mail'), 'inbox');
  assert.match(screenText(inbox), /Hello/);
  const id = r.raw.prepare('SELECT id FROM letters WHERE to_id = ?').get(b.id).id;
  const open = assertScreenOk(await r.choose(b, 'pda:mail:open', [id]), 'letter');
  assert.match(screenText(open), /A letter from Discord/);
  assert.ok(r.raw.prepare('SELECT read_at FROM letters WHERE id = ?').get(id).read_at, 'opened is read');
  const reply = await r.press(b, `pda:mail:reply:${id}`);
  assert.equal(reply.type, 9);
  assert.equal(reply.data.custom_id, `pdam:mail:send:${a.id}`, 'the answer goes by account');
  assert.equal(reply.data.components.find((c) => c.component.custom_id === 'subject').component.value, 'Re: Hello');
  await r.submit(b, `pdam:mail:send:${a.id}`, { subject: 'Re: Hello', body: 'Back at you.' });
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM letters WHERE to_id = ?').get(a.id).n, 1);
  assert.match(screenText(await r.press(b, `pda:mail:del:${id}`)), /Deleted/);
  assert.match(screenText(await r.submit(a, 'pdam:mail:send', { to: 'Nobody9', subject: 'x', body: 'y' })), /Nobody has that name/);
  assert.match(screenText(await r.submit(a, 'pdam:mail:send', { to: 'Hale', subject: 'x', body: 'y' })), /cannot write to yourself/);
  r.raw.prepare('INSERT INTO blocks (player, blocked, at) VALUES (?, ?, ?)').run(b.id, a.id, r.nowS());
  assert.match(screenText(await r.submit(a, 'pdam:mail:send', { to: 'Iona', subject: 'x', body: 'y' })), /Sent to/, 'a block is never told');
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM letters WHERE to_id = ? AND subject = 'x'").get(b.id).n, 0);
});

test('PDA mail: the developers\' post is read from Discord; an item is claimed in the game, and its piece is kept until then', async () => {
  const r = await pdaRig();
  const a = await r.linked('Jory');
  r.raw.prepare("INSERT INTO server_post (id, to_id, batch, sender, subject, body, item, sent_at) VALUES ('p0000000000000000001', ?, 'gift-1', 'The Developers', 'A gift', 'For you.', ?, ?)").run(a.id, JSON.stringify({ name: 'Portal Stone' }), r.nowS());
  const box = assertScreenOk(await r.press(a, 'pda:mail:post'), 'post');
  assert.match(screenText(box), /holds Portal Stone/);
  const piece = assertScreenOk(await r.choose(a, 'pda:mail:piece', ['p0000000000000000001']), 'piece');
  assert.match(screenText(piece), /Claim it in the game/);
  assert.ok(!customIds(piece).some((c) => c.startsWith('pda:mail:pdel')), 'no delete while its item waits');
  assert.match(screenText(await r.press(a, 'pda:mail:pdel:p0000000000000000001')), /Claim its item in the game/);
});

test('PDA notices: a letter that comes is queued once for a link that wants it, the mark moves on, the clock sends it, and a user Discord refuses is let go', async () => {
  const r = await pdaRig();
  const a = await r.linked('Kael');
  const b = await r.linked('Lyra');
  r.raw.prepare('UPDATE discord_links SET mail_seen = 0').run();
  await r.submit(a, 'pdam:mail:send', { to: 'Lyra', subject: 'News', body: 'Read me.' });
  const later = () => ({ ...r.ctx(), nowS: r.nowS() + 3 });
  assert.equal(await mailNotices(r.ctx()), 0, 'a letter of this very second waits, in case another comes in it');
  assert.equal(await mailNotices(later()), 1);
  assert.equal(await mailNotices(later()), 0, 'told once');
  const n = r.raw.prepare('SELECT * FROM discord_notices WHERE discord_id = ?').all(b.discordId);
  assert.equal(n.length, 1);
  assert.equal(n[0].kind, 'mail');
  const d = fakeDiscord();
  assert.equal(await sendNotices(r.ctx(), r.env, d.fetchFn), 1);
  assert.equal(d.called('POST', '/users/@me/channels').length, 1);
  const post = d.calls.find((c) => c.path.endsWith('/messages'));
  assert.equal(post.payload.flags & (1 << 15), 1 << 15);
  assert.ok(JSON.stringify(post.payload).includes('open:mail'), 'its button opens the mail');
  assert.equal(await sendNotices(r.ctx(), r.env, d.fetchFn), 0, 'sent once');
  // a user who wants no letters is told of none, and the mark still moves
  r.raw.prepare('UPDATE discord_links SET dm = 0 WHERE discord_id = ?').run(b.discordId);
  await r.submit(a, 'pdam:mail:send', { to: 'Lyra', subject: 'Again', body: 'Quiet.' });
  await mailNotices(later());
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM discord_notices WHERE discord_id = ?').get(b.discordId).n, 1);
  // Discord will not deliver: marked, and nothing waits for them
  await queueNotice(r.env.DB, a.discordId, 'test', 'x', { title: 't', lines: ['l'] }, r.nowS());
  const shut = fakeDiscord({ 'POST /users/@me/channels': { status: 403, json: { code: 50007 } } });
  assert.equal(await sendNotices(r.ctx(), r.env, shut.fetchFn), 0);
  assert.equal(r.raw.prepare('SELECT dm_dead FROM discord_links WHERE discord_id = ?').get(a.discordId).dm_dead, 1);
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM discord_notices WHERE discord_id = ? AND sent_at IS NULL').get(a.discordId).n, 0);
  // the hour's sweep takes sent notices past their keeping
  r.raw.prepare('UPDATE discord_notices SET sent_at = ?').run(r.nowS() - NOTICE_KEEP_S - 1);
  assert.ok((await sweepNotices(r.ctx())) >= 1);
});

test('PDA terminal: the service finds its server, makes the read-only channel, posts and pins the card, and asks nothing more until the card changes', async () => {
  _resetTerminalForTests();
  const r = await pdaRig();
  const d = fakeDiscord({
    'GET /channels/900000000000000001': { id: '900000000000000001', guild_id: '800000000000000001' },
    'GET /guilds/800000000000000001/channels': [],
    'GET /users/@me': { id: '700000000000000009' },
    'POST /guilds/800000000000000001/channels': { id: '600000000000000001', name: TERMINAL_CHANNEL_NAME },
    'POST /channels/600000000000000001/messages': { id: '500000000000000001' },
    'PUT /channels/600000000000000001/pins/500000000000000001': { status: 204 },
  });
  assert.equal(await ensureTerminal(r.ctx(), r.env, d.fetchFn), 1);
  const made = d.called('POST', '/guilds/800000000000000001/channels')[0].payload;
  assert.equal(made.name, TERMINAL_CHANNEL_NAME);
  const everyone = made.permission_overwrites.find((o) => o.id === '800000000000000001');
  assert.ok(BigInt(everyone.deny) & (1n << 11n), 'only the bot writes there');
  assert.equal(d.called('PUT', '/channels/600000000000000001/pins/').length, 1);
  const card = d.called('POST', '/channels/600000000000000001/messages')[0].payload;
  assert.ok(JSON.stringify(card).includes('open:home'));
  assert.ok(countComponents(card.components) <= LIMITS.COMPONENTS);
  const before = d.calls.length;
  assert.equal(await ensureTerminal(r.ctx(), r.env, d.fetchFn), 0);
  assert.equal(d.calls.length, before, 'nothing asked again');
  // A fresh isolate reads what was kept and asks Discord nothing either.
  _resetTerminalForTests();
  assert.equal(await ensureTerminal(r.ctx(), r.env, d.fetchFn), 0);
  assert.equal(d.calls.filter((c) => c.method !== 'GET').length, 3, 'one channel, one post, one pin');
  // A new card: the kept message is redrawn.
  _resetTerminalForTests();
  r.raw.prepare("UPDATE discord_state SET value = '0' WHERE key = 'terminal_ver'").run();
  assert.equal(await ensureTerminal(r.ctx(), r.env, d.fetchFn), 1);
  assert.equal(d.called('PATCH', '/channels/600000000000000001/messages/500000000000000001').length, 1);
  assert.equal(TERMINAL_VERSION >= 1, true);
  assert.ok(terminalCard().length === 1);
});

test('PDA clock: the minute job is the service\'s, after the others; the hour\'s too; a module that throws stops no other', async () => {
  assert.equal(MINUTE_JOBS.at(-1)[0], 'pda');
  assert.ok(HOUR_JOBS.some(([n]) => n === 'pda'));
  _resetTerminalForTests();
  const r = await pdaRig({ DISCORD_BOT_TOKEN: '' });
  assert.equal(await pdaMinute({ ...r.ctx(), fetchFn: fakeDiscord().fetchFn }, r.env), 0, 'no token, nothing sent');
});

test('PDA routes: the game mints a code behind a session, reads the link, and unlinks; a guest is told to register; every route is in the one table', async () => {
  const r = await pdaRig();
  const g = await r.guest();
  assert.equal((await r.call('/v1/discord/code', {}, g.secret)).status, 403);
  const a = await r.registered('Mira');
  const code = await r.call('/v1/discord/code', {}, a.secret);
  assert.equal(code.status, 200);
  assert.match(code.body.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const get = await r.fetch('https://accounts.invalid/v1/discord/link', { headers: { authorization: `Bearer ${a.secret}` } });
  assert.deepEqual(await get.json(), { linked: false, name: null, linkedAt: null, canLink: true });
  const user = { id: snowflake(), username: 'mira' };
  await r.submit(user, 'pdam:link:code', { code: code.body.code });
  const after = await (await r.fetch('https://accounts.invalid/v1/discord/link', { headers: { authorization: `Bearer ${a.secret}` } })).json();
  assert.equal(after.linked, true);
  assert.equal(after.name, 'mira');
  assert.equal((await r.call('/v1/discord/unlink', {}, a.secret)).status, 200);
  assert.equal((await r.call('/v1/discord/unlink', {}, a.secret)).status, 404);
  assert.equal((await r.call('/v1/discord/code', {})).status, 401, 'no session, no code');
  assert.ok(pdaRoutes().has('/v1/discord/code'));
});

test('PDA router: an answer past Discord\'s three seconds is deferred - the pressed screen kept, or a private one promised - and drawn after through the interaction\'s own token', async () => {
  const r = await pdaRig({ PDA_ANSWER_MS: '1' });
  const p = await r.linked('Nyx');
  const { mailPda } = await import('../../server-account/src/pdaMail.js');
  const slow = mailPda.screen;
  mailPda.screen = async (who) => { await new Promise((res) => setTimeout(res, 30)); return slow(who); };
  try {
    const inPda = await r.press(p, 'pda:mail');
    assert.deepEqual(inPda, { type: 6 }, 'a press inside the PDA keeps its screen while the answer is drawn');
    const edit = r.discord.calls.find((c) => c.method === 'PATCH' && c.path === '/webhooks/700000000000000001/tok/messages/@original');
    assert.ok(edit, 'the answer is drawn into the original response');
    assert.equal(edit.payload.flags & 64, 0, 'an edit carries no flag Discord will not change');
    assert.ok(edit.payload.flags & (1 << 15));
    assert.match(JSON.stringify(edit.payload.components), /Letters/);
    r.discord.calls.length = 0;
    const launched = await r.press(p, 'open:mail', { message: { flags: 1 << 15 } });
    assert.deepEqual(launched, { type: 5, data: { flags: 64 } }, 'a public card promises a private screen');
    assert.equal(r.discord.calls.filter((c) => c.method === 'PATCH').length, 1);
  } finally {
    mailPda.screen = slow;
  }
  // fast answers are never deferred
  const q = await pdaRig();
  const quick = await q.linked('Oro');
  const fast = await q.press(quick, 'pda:settings');
  assert.equal(fast.type, 7);
  assert.match(screenText(fast), /Direct messages/);
  assert.equal(q.discord.calls.filter((c) => c.path.startsWith('/webhooks/')).length, 0);
});

test('PDA home: the lines are asked together and a slow one is drawn without, so Home answers inside its bound', async () => {
  const r = await pdaRig();
  const p = await r.linked('Pell');
  const { mailPda } = await import('../../server-account/src/pdaMail.js');
  const was = mailPda.glance;
  mailPda.glance = () => new Promise(() => {});
  try {
    const t0 = Date.now();
    const home = assertScreenOk(await r.press(p, 'pda:home'), 'home');
    assert.ok(Date.now() - t0 < 2000, 'not held by the slow line');
    assert.equal(home.type, 7);
    assert.doesNotMatch(screenText(home), /Mail:/);
  } finally {
    mailPda.glance = was;
  }
});

test('PDA link: a linked moderator acts on the case cards and /mod without a DISCORD_MODERATORS row - and not while banned or frozen', async () => {
  const r = await pdaRig({ MODERATOR_HANDLES: 'Quill' });
  const m = await r.linked('Quill');
  await r.registered('Rook');
  const look = () => r.send({ type: 2, member: { user: m.user }, data: { name: 'mod', options: [{ type: 1, name: 'lookup', options: [{ name: 'player', type: 3, value: 'Rook' }] }] } });
  assert.match((await look()).data.content, /Rook/);
  r.raw.prepare('UPDATE players SET frozen_until = ? WHERE id = ?').run(r.nowS() + 3600, m.id);
  assert.match((await look()).data.content, /Only the game's moderators/, 'a frozen moderator acts in nothing');
  r.raw.prepare('UPDATE players SET frozen_until = NULL, banned_until = ? WHERE id = ?').run(r.nowS() + 3600, m.id);
  assert.match((await look()).data.content, /Only the game's moderators/);
});

test('PDA notices: a scan whose page is full stops before its last second, so nothing past the page is passed over; a full page of one second is taken whole', async () => {
  const { noticeBound } = await import('../../server-account/src/pdaNotices.js');
  const at = (r) => r.at;
  const page = (...ats) => ats.map((a) => ({ at: a }));
  assert.equal(noticeBound(100, [{ rows: page(10, 20), limit: 3, at }]), 100, 'a page not full binds nothing');
  assert.equal(noticeBound(100, [{ rows: page(10, 20, 30), limit: 3, at }]), 29, 'a full page: before its last second');
  assert.equal(noticeBound(100, [{ rows: page(10, 20, 30), limit: 3, at }, { rows: page(5, 15, 25), limit: 3, at }]), 24, 'the earliest full page binds both');
  assert.equal(noticeBound(100, [{ rows: page(40, 40, 40), limit: 3, at }]), 40, 'one second whole, never a stall');
  // a page of letters past the minute's share: the rest are told next minute, none lost
  const r = await pdaRig();
  const a = await r.linked('Sable');
  const b = await r.linked('Tamsin');
  const { MAIL_NOTICES_A_MINUTE } = await import('../../server-account/src/pdaMail.js');
  r.raw.prepare('UPDATE discord_links SET mail_seen = 0').run();
  const ins = r.raw.prepare('INSERT INTO letters (id, to_id, from_id, from_name, subject, body, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const t0 = r.nowS() - 1000;
  for (let i = 0; i < MAIL_NOTICES_A_MINUTE + 5; i++) ins.run(`letter-${String(i).padStart(12, '0')}`, b.id, a.id, 'Sable', `n${i}`, 'x', t0 + Math.floor(i / 2));
  let told = 0;
  for (let k = 0; k < 4; k++) told += await mailNotices(r.ctx());
  assert.equal(r.raw.prepare("SELECT COUNT(*) AS n FROM discord_notices WHERE discord_id = ? AND kind = 'mail'").get(b.discordId).n, MAIL_NOTICES_A_MINUTE + 5, 'every letter told once');
  assert.equal(told, MAIL_NOTICES_A_MINUTE + 5);
});

test('PDA notices: two clock firings at once never send the same notice - each takes its notices in one statement first', async () => {
  const r = await pdaRig();
  const a = await r.linked('Ulla');
  const b = await r.linked('Vane');
  for (const [who, ref] of [[a, 'x1'], [a, 'x2'], [b, 'x3']]) await queueNotice(r.env.DB, who.discordId, 'test', ref, { title: 't', lines: ['l'] }, r.nowS());
  const d = fakeDiscord();
  const slow = async (u, i) => { await new Promise((res) => setTimeout(res, 15)); return d.fetchFn(u, i); };
  const [one, two] = await Promise.all([sendNotices(r.ctx(), r.env, slow), sendNotices(r.ctx(), r.env, slow)]);
  assert.equal(one + two, 3);
  assert.equal(d.calls.filter((c) => c.method === 'POST' && /^\/channels\/\d+\/messages$/.test(c.path)).length, 3, 'each sent once');
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM discord_notices WHERE sent_at IS NULL').get().n, 0);
});

test('PDA link: a link that moves leaves no notice waiting for the old pairing - the user who lost the account hears none of its news', async () => {
  const r = await pdaRig();
  const a = await r.linked('Wren');
  await queueNotice(r.env.DB, a.discordId, 'mail', 'old', { title: 'A letter', lines: ['for the old pairing'] }, r.nowS());
  r.raw.prepare("INSERT INTO discord_reminders (discord_id, family, at) VALUES (?, 'gate:0', 1)").run(a.discordId);
  const row = r.raw.prepare('SELECT * FROM players WHERE id = ?').get(a.id);
  const m = await mintLinkCode(r.ctx(), row);
  const other = { id: snowflake(), username: 'newowner' };
  assert.equal((await redeemLinkCode(r.ctx(), other, m.code)).ok, true);
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM discord_notices WHERE discord_id = ? AND sent_at IS NULL').get(a.discordId).n, 0);
  assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM discord_reminders WHERE discord_id = ?').get(a.discordId).n, 0, 'a user left with no link keeps no reminders');
});

test('PDA UI: a message past Discord\'s text total is cut at its longest blocks, a code fence closed again, so it is never refused whole', async () => {
  const { fitText, text: t, container: box, body: msg, textLength } = await import('../../server-account/src/pdaUi.js');
  const long = '```\n' + 'line of chat\n'.repeat(400) + '```';
  const comps = [box([t('### Case'), t(long), t('x'.repeat(1500))])];
  const out = msg(comps);
  assert.ok(textLength(out.components) <= 4000, `${textLength(out.components)} characters`);
  const fencedBlock = out.components[0].components[1].content;
  assert.equal((fencedBlock.match(/```/g) ?? []).length % 2, 0, 'the fence is closed');
  assert.equal(out.components[0].components[0].content, '### Case', 'the short header untouched');
  assert.deepEqual(fitText([box([t('short')])]), [box([t('short')])], 'within the total, nothing changes');
});

test('PDA clock: the firing passes a quiet job\'s unspent statements on, still bounded whole; the PDA sends its outbox first and stops its scans when its share is spent', async () => {
  const { runCron, FIRING_STATEMENTS_MAX } = await import('../../server-account/src/cron.js');
  const r = await pdaRig();
  const seen = [];
  const job = (name, use) => [name, async (ctx) => { seen.push({ name, budget: ctx.budget() }); for (let i = 0; i < use; i++) await ctx.db.prepare('SELECT 1').first(); return 0; }];
  const out = await runCron(r.env, { cron: '* * * * *', nowS: r.nowS(), jobs: [job('a', 0), job('b', 0), job('c', 50)] });
  assert.deepEqual(out.map((o) => o.statements), [0, 0, 50]);
  const shares = [];
  await runCron(r.env, {
    cron: '* * * * *', nowS: r.nowS(),
    jobs: [0, 1, 2].map((i) => [`j${i}`, async (ctx) => { let n = 0; while (ctx.budget()) { await ctx.db.prepare('SELECT 1').first(); n++; } shares.push(n); return 0; }]),
  });
  assert.equal(shares.reduce((a, b) => a + b, 0), FIRING_STATEMENTS_MAX, 'the firing as a whole is still bounded');
  // the outbox first, and no scan once the share is spent
  const order = [];
  const { pdaModules } = await import('../../server-account/src/pdaRouter.js');
  const polls = pdaModules().find((m) => m.key === 'polls');
  const was = polls.minute;
  polls.minute = async () => { order.push('polls'); return 0; };
  try {
    let left = 2;
    const { pdaMinute } = await import('../../server-account/src/pdaClock.js');
    await pdaMinute({ ...r.ctx(), fetchFn: fakeDiscord().fetchFn, budget: () => left-- > 0 }, r.env);
    assert.ok(!order.includes('polls'), 'scans wait once the share is spent');
  } finally {
    polls.minute = was;
  }
});

test('PDA notices: a player\'s own news goes before a poll announced to everyone', async () => {
  const r = await pdaRig();
  const a = await r.linked('Xan');
  for (let i = 0; i < 3; i++) await queueNotice(r.env.DB, a.discordId, 'polls', `p${i}`, { title: 'A poll', lines: ['vote'] }, r.nowS() - 10);
  await queueNotice(r.env.DB, a.discordId, 'mail', 'm1', { title: 'A letter', lines: ['news'] }, r.nowS());
  const d = fakeDiscord();
  assert.equal(await sendNotices(r.ctx(), r.env, d.fetchFn, 1), 1);
  assert.equal(r.raw.prepare("SELECT kind FROM discord_notices WHERE sent_at IS NOT NULL").get().kind, 'mail');
});

test('PDA router: a late answer to a press on a public card keeps that card when the press redraws it (a staff card), and promises a private screen otherwise', async () => {
  const r = await pdaRig({ PDA_ANSWER_MS: '1', MODERATOR_HANDLES: 'Yves' });
  const m = await r.linked('Yves');
  const { feedbackPda } = await import('../../server-account/src/pdaFeedback.js');
  const { pollsPda } = await import('../../server-account/src/pdaPolls.js');
  const slowF = feedbackPda.press;
  const slowP = pollsPda.press;
  feedbackPda.press = async (...a) => { await new Promise((res) => setTimeout(res, 20)); return slowF.apply(feedbackPda, a); };
  pollsPda.press = async (...a) => { await new Promise((res) => setTimeout(res, 20)); return slowP.apply(pollsPda, a); };
  try {
    assert.deepEqual(await r.press(m, 'fbk:seen:0000000000000000', { message: { flags: 1 << 15 } }), { type: 6 });
    assert.deepEqual(await r.press(m, 'poll:v:0000000000000000:0', { message: { flags: 1 << 15 } }), { type: 5, data: { flags: 64 } });
  } finally {
    feedbackPda.press = slowF;
    pollsPda.press = slowP;
  }
});
