// The journal's Activity through the Worker's own door: the player is the one Discord's proxy vouches for (a payload
// signed with the application's key), or one an OAuth ticket names; a forged, altered or lapsed word is refused. Pages
// are the router's, as a Discord press gets them; forms and notes come back as such; the map's pins carry their places
// and the player's reminders. The Activity's own files are served beside the routes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { journalRig, proxyKeys } from '../journalRig.mjs';
import { mintTicket, ticketUser, TICKET_TTL_S, journalAnswerOf, chaptersOf } from '../../server-account/src/journalDoor.js';
import { mdToHtml, mdToPlain } from '../../server-account/journal/md.js';
import { frameQuery, clientIdOf } from '../../server-account/journal/frame.js';
import { SEA_WORDS, DOOR_WORDS } from '../../server-account/journal/words.js';

test('Journal door: the proxy\'s signed word names the player - base64 or hex; a forged, altered, lapsed or missing one is refused before a page is read', async () => {
  const r = await journalRig();
  const p = await r.linked('Yara', { seated: true });
  const ok = await r.ask(p.discordId, 'hello');
  assert.equal(ok.status, 200);
  assert.equal(ok.json.linked, true);
  assert.equal(ok.json.via, 'proxy');
  assert.equal(ok.json.name, 'Yara');
  assert.ok(ok.json.chapters.some((c) => c.key === 'sea'), 'the sea is a chapter');
  assert.equal((await r.ask(null, 'hello', undefined, { headers: await r.keys.sign(p.discordId, { hexSig: true }) })).status, 200, 'a hex signature is read too');
  const other = await proxyKeys();
  assert.equal((await r.ask(null, 'hello', undefined, { headers: await other.sign(p.discordId) })).json.error, 'proxy-bad', 'another application\'s key');
  const h = await r.keys.sign(p.discordId);
  const forged = { ...h, 'x-discord-proxy-payload': Buffer.from(JSON.stringify({ user_id: '1234567', created_at: Number(h['x-signature-timestamp']), expires_at: 9e9 })).toString('base64') };
  assert.equal((await r.ask(null, 'hello', undefined, { headers: forged })).status, 401, 'an altered payload');
  assert.equal((await r.ask(null, 'hello', undefined, { headers: { ...h, 'x-signature-timestamp': '1' } })).status, 401, 'a timestamp not its own');
  const lapsed = await r.ask(null, 'hello', undefined, { headers: await r.keys.sign(p.discordId, { created: 1000, ttl: 10 }) });
  assert.deepEqual([lapsed.status, lapsed.json.error], [401, 'proxy-expired'], 'a lapsed ticket says so, so the Activity renews it');
  const none = await r.ask(null, 'hello');
  assert.deepEqual([none.status, none.json.error, none.json.oauth], [401, 'who', false]);
  const stranger = await r.ask('555555555555555555', 'hello');
  assert.deepEqual([stranger.json.linked, stranger.json.name], [false, ''], 'an unlinked Discord user opens the book, linked to nothing');
});

test('Journal door: an OAuth ticket names its user until it lapses; a forged or altered one is refused; the sign-in trades Discord\'s code for one', async () => {
  const fetches = [];
  const fakeFetch = async (url, init) => {
    fetches.push([url, init]);
    if (String(url).endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'acc-token-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (String(url).endsWith('/users/@me')) return new Response(JSON.stringify({ id: '424242424242424242' }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const r = await journalRig({ DISCORD_CLIENT_SECRET: 's'.repeat(32) });
  const nowS = Math.floor(Date.now() / 1000);
  const t = mintTicket(r.env, '424242424242424242', nowS);
  assert.equal(ticketUser(r.env, t, nowS), '424242424242424242');
  assert.equal(ticketUser(r.env, t, nowS + TICKET_TTL_S + 1), null, 'lapsed');
  assert.equal(ticketUser({ IDENTITY_PRIVATE_KEY: 'another' }, t, nowS), null, 'another key');
  assert.equal(ticketUser(r.env, t.replace(/\.(.)/, '.A'), nowS), null, 'altered');
  const viaTicket = await r.ask(null, 'hello', undefined, { headers: { authorization: `Journal ${t}` } });
  assert.deepEqual([viaTicket.status, viaTicket.json.via, viaTicket.json.oauth], [200, 'ticket', true]);
  const { oauthSignIn } = await import('../../server-account/src/journalDoor.js');
  const signed = await oauthSignIn(r.env, { code: 'abcdefghijklmnop', client_id: '700000000000000001' }, nowS, fakeFetch);
  assert.equal(signed.id, '424242424242424242');
  assert.equal(signed.access_token, 'acc-token-1');
  assert.equal(ticketUser(r.env, signed.ticket, nowS), '424242424242424242');
  const form = new URLSearchParams(fetches[0][1].body);
  assert.deepEqual([form.get('grant_type'), form.get('client_id'), form.get('code')], ['authorization_code', '700000000000000001', 'abcdefghijklmnop']);
  assert.equal((await oauthSignIn({ ...r.env, DISCORD_CLIENT_SECRET: '' }, { code: 'abcdefghijklmnop', client_id: '7000000001' }, nowS, fakeFetch)).error, 'oauth-off');
  assert.equal((await oauthSignIn(r.env, { code: 'x', client_id: '7000000001' }, nowS, fakeFetch)).error, 'body');
});

test('Journal door: a page is the router\'s own, drawn as Discord gets it; a form comes back to fill; a press that is not the journal\'s is refused', async () => {
  const r = await journalRig();
  const p = await r.linked('Corvin', { seated: true });
  const home = await r.ask(p.discordId, 'press', { id: 'pda:home' });
  assert.equal(home.status, 200);
  assert.equal(home.json.kind, 'page');
  assert.equal(home.json.chapter, 'home');
  const mail = await r.ask(p.discordId, 'press', { id: 'pda:mail' });
  assert.equal(mail.json.chapter, 'mail');
  const ids = JSON.stringify(mail.json.components).match(/"custom_id":"(pda:mail:[^"]+)"/g) ?? [];
  const write = ids.map((s) => s.slice(13, -1)).find((id) => /write|send|new/.test(id));
  if (write) {
    const form = await r.ask(p.discordId, 'press', { id: write });
    assert.equal(form.json.kind, 'form', 'a letter is a form to fill');
    assert.ok(form.json.form.custom_id);
  }
  assert.equal((await r.ask(p.discordId, 'press', { id: 'mod:case:1' })).status, 404, 'the moderators\' queue is not the journal\'s');
  const unlinked = await r.ask('666666666666666666', 'press', { id: 'pda:mail' });
  assert.match(JSON.stringify(unlinked.json), /Link your DFO Online account/);
  assert.equal(journalAnswerOf({ type: 9, data: { custom_id: 'x', title: 't', components: [] } }).kind, 'form');
  assert.equal(journalAnswerOf({ type: 4, data: { components: [{ type: 17, components: [{ type: 10, content: 'Done.' }] }] } }).kind, 'note');
  assert.ok(chaptersOf({ staff: false }).every((c) => c.key !== 'staff'));
  assert.ok(chaptersOf({ staff: true }).some((c) => c.key === 'staff'));
});

test('Journal door: the map answers its pins on the chart and the player\'s reminders (none for one unlinked); the chart is served; the Activity\'s files are there', async () => {
  const r = await journalRig();
  const p = await r.linked('Mira', { seated: true });
  r.raw.prepare("INSERT INTO discord_reminders (discord_id, family, at) VALUES (?, 'serpent', 1)").run(p.discordId);
  const m = await r.ask(p.discordId, 'map');
  assert.equal(m.status, 200);
  assert.deepEqual(m.json.reminders, ['serpent']);
  assert.deepEqual([m.json.chart.w, m.json.chart.h], [1280, 800]);
  assert.equal((await r.ask('777777777777777777', 'map')).json.reminders, null);
  const chart = await r.fetch('https://accounts.invalid/v1/journal/chart.png');
  assert.equal(chart.status, 200);
  assert.equal(chart.headers.get('content-type'), 'image/png');
  for (const f of ['index.html', 'desk.js', 'book.js', 'render.js', 'md.js', 'frame.js', 'api.js', 'sheet.js', 'mapView.js', 'seaView.js', 'paper.js', 'sound.js', 'journal.css', 'fonts/Jacquard12-latin.woff2', 'fonts/IMFellEnglish-latin.woff2'])
    assert.ok(existsSync(new URL(`../../server-account/journal/${f}`, import.meta.url)), `journal/${f}`);
  const html = readFileSync(new URL('../../server-account/journal/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /https?:\/\//, 'nothing loaded from another host: Discord\'s frame would refuse it');
  const toml = readFileSync(new URL('../../server-account/wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /\[assets\]\s*\ndirectory = "\.\/journal"/);
});

test('Journal md: the bot\'s marks read into the book, a player\'s words never become markup, escapes stay literal', () => {
  const h = mdToHtml('### Letters\n**Bold** and *soft* and __under__\n-# small print\n> a quote\n- one\n- two\n<t:1700000000:R>\n[a link](https://example.com/x)');
  assert.match(h, /<h4 class="ink-h3">Letters<\/h4>/);
  assert.match(h, /<strong>Bold<\/strong>/);
  assert.match(h, /<em>soft<\/em>/);
  assert.match(h, /<u>under<\/u>/);
  assert.match(h, /<p class="margin">small print<\/p>/);
  assert.match(h, /<blockquote>a quote<\/blockquote>/);
  assert.match(h, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(h, /<time data-t="1700000000" data-f="R">/);
  assert.match(h, /<a href="#" data-href="https:\/\/example.com\/x">a link<\/a>/);
  const evil = mdToHtml('<img src=x onerror=alert(1)> \\*not bold\\* \\<script\\>');
  assert.doesNotMatch(evil, /<img|<script/);
  assert.match(evil, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(evil, /\*not bold\*/);
  assert.equal(mdToPlain('### A **title**'), 'A title');
  assert.equal(clientIdOf('700000000000000001.discordsays.com'), '700000000000000001');
  assert.equal(clientIdOf('evil.example.com'), null);
  assert.equal(frameQuery('?frame_id=f&instance_id=i&platform=desktop').frameId, 'f');
  assert.equal(frameQuery('?instance_id=i&platform=desktop'), null);
});

test('Journal words: every refusal the door and the sea can answer has the book\'s sentence - walked from their source, not listed', () => {
  const said = new Set();
  for (const f of ['server-account/src/journalDoor.js', 'server-account/src/seaJournal.js', 'server-account/src/seaJournalLaw.js'])
    for (const m of readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').matchAll(/error:\s*'([a-z-]+)'/g)) said.add(m[1]);
  assert.ok(said.size >= 20, `the walk found ${said.size} words - it has stopped seeing its subject`);
  const known = { ...SEA_WORDS, ...DOOR_WORDS };
  assert.deepEqual([...said].filter((w) => !(w in known)), [], 'a refusal the book has no sentence for');
  for (const [w, line] of Object.entries(known)) assert.ok(line.split(/\s+/).length <= 25, `${w}: a sentence of 25 words at most`);
});
