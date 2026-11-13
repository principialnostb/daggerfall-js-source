// The journal's worn paper: a page's heading and a seal drawn by the service at a signed address, a forged or altered
// address refused, the Courier card drawn with its heading once an interaction has told the service its own address,
// and places named in the lore's spelling wherever the journal writes them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdaRig, fakeDiscord, snowflake, screenText, assertScreenOk } from '../pdaRig.mjs';
import { decode } from '../pngDecode.mjs';
import { artUrl, artWords, ART_PATH, HEADER_W, HEADER_H, SEAL_PX, _resetArtForTests } from '../../server-account/src/journalArt.js';
import { loreName } from '../../server-account/src/pdaUi.js';
import { ensureTerminal, checkActivity, _resetTerminalForTests, TERMINAL_CHANNEL_NAME } from '../../server-account/src/pdaTerminal.js';
import { _resetSelfForTests } from '../../server-account/src/pdaRouter.js';

test('Journal art: a heading and a seal at their signed addresses; an altered word or a forged signature is refused', async () => {
  _resetArtForTests();
  const r = await pdaRig();
  const url = artUrl(r.env, 'https://accounts.invalid', 'header', { t: 'Letters', s: 'Yara · Level 12', m: 'The Journal' });
  assert.match(url, new RegExp(`^https://accounts\\.invalid${ART_PATH}header\\.png\\?p=[\\w-]+&s=[\\w-]{16}$`));
  const res = await r.fetch(url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.match(res.headers.get('cache-control'), /immutable/);
  const d = decode(new Uint8Array(await res.arrayBuffer()));
  assert.deepEqual([d.w, d.h, d.type], [HEADER_W, HEADER_H, 6]);
  const seal = await r.fetch(artUrl(r.env, 'https://accounts.invalid', 'seal', { l: 'Y', w: 'red' }));
  assert.deepEqual([decode(new Uint8Array(await seal.arrayBuffer())).w], [SEAL_PX]);
  const q = new URL(url).searchParams;
  const other = artUrl(r.env, 'https://accounts.invalid', 'header', { t: 'Staff desk', s: '', m: '' });
  const forged = `https://accounts.invalid${ART_PATH}header.png?p=${new URL(other).searchParams.get('p')}&s=${q.get('s')}`;
  assert.equal((await r.fetch(forged)).status, 404, 'words signed for another page');
  assert.equal(artWords(r.env, 'seal', q.get('p'), q.get('s')), null, 'a header\'s signature is no seal\'s');
  assert.equal(artWords({ IDENTITY_PRIVATE_KEY: 'another key' }, 'header', q.get('p'), q.get('s')), null, 'another key signs otherwise');
  assert.equal(artUrl({}, 'https://accounts.invalid', 'header', { t: 'x' }), null, 'no key, no address');
  assert.equal(artUrl(r.env, 'https://accounts.invalid', 'portrait', { t: 'x' }), null, 'only the kinds the service draws');
});

test('Journal frame: a page opens with its worn-paper heading, named in its description; the Courier is drawn with its own once the service knows its address', async () => {
  _resetTerminalForTests();
  _resetSelfForTests();
  const r = await pdaRig();
  const d = fakeDiscord({
    'GET /channels/900000000000000001': { id: '900000000000000001', guild_id: '800000000000000001' },
    'GET /guilds/800000000000000001/channels': [],
    'GET /users/@me': { id: '700000000000000009' },
    'POST /guilds/800000000000000001/channels': { id: '600000000000000001', name: TERMINAL_CHANNEL_NAME },
    'POST /channels/600000000000000001/messages': { id: '500000000000000001' },
    'PUT /channels/600000000000000001/pins/500000000000000001': { status: 204 },
    'PATCH /channels/600000000000000001/messages/500000000000000001': { id: '500000000000000001' },
  });
  assert.equal(await ensureTerminal(r.ctx(), r.env, d.fetchFn), 1);
  const plain = JSON.stringify(d.called('POST', '/channels/600000000000000001/messages')[0].payload);
  assert.ok(plain.includes('The Courier') && !plain.includes(ART_PATH), 'no address known: the Courier names itself in words');
  // an interaction tells the service its address; the next minute redraws the card with its heading
  const s = assertScreenOk(await r.press({ id: snowflake(), username: 'x' }, 'open:events', { message: { flags: 1 << 15 } }), 'events');
  assert.match(screenText(s), /\{World events/);
  _resetTerminalForTests();
  assert.equal(await ensureTerminal(r.ctx(), r.env, d.fetchFn), 1);
  const drawn = JSON.stringify(d.called('PATCH', '/channels/600000000000000001/messages/500000000000000001')[0].payload);
  assert.ok(drawn.includes(`https://accounts.invalid${ART_PATH}header.png`), 'the heading picture at the service\'s own address');
  _resetTerminalForTests();
  const before = d.calls.length;
  assert.equal(await ensureTerminal(r.ctx(), r.env, d.fetchFn), 0);
  assert.equal(d.calls.filter((c) => c.method !== 'GET').length, d.calls.slice(0, before).filter((c) => c.method !== 'GET').length, 'drawn whole: nothing more');
});

test('Journal words: Summerset in the lore\'s spelling wherever the journal names a place, never inside a player\'s own words', () => {
  assert.equal(loreName('Sumurset Isle'), 'Summerset Isle');
  assert.equal(loreName('SUMURSET'), 'SUMMERSET');
  assert.equal(loreName('Alinor, Sumurset'), 'Alinor, Summerset');
  assert.equal(loreName(null), '');
});

test('Journal Activity: the hour finds Discord\'s launcher entry and the Courier is drawn again with the press that opens the book; that press answers LAUNCH_ACTIVITY', async () => {
  _resetTerminalForTests();
  const r = await pdaRig();
  const globals = [];
  const d = fakeDiscord({
    'GET /channels/900000000000000001': { id: '900000000000000001', guild_id: '800000000000000001' },
    'GET /guilds/800000000000000001/channels': [],
    'GET /users/@me': { id: '700000000000000009' },
    'GET /applications/@me': { id: '700000000000000001' },
    'GET /applications/700000000000000001/commands': globals,
    'POST /guilds/800000000000000001/channels': { id: '600000000000000001', name: TERMINAL_CHANNEL_NAME },
    'POST /channels/600000000000000001/messages': { id: '500000000000000001' },
    'PUT /channels/600000000000000001/pins/500000000000000001': { status: 204 },
    'PATCH /channels/600000000000000001/messages/500000000000000001': { id: '500000000000000001' },
  });
  assert.equal(await checkActivity(r.ctx(), r.env, d.fetchFn), 1, 'off, kept');
  assert.equal(await checkActivity(r.ctx(), r.env, d.fetchFn), 0, 'unchanged: nothing more');
  await ensureTerminal(r.ctx(), r.env, d.fetchFn);
  assert.ok(!JSON.stringify(d.called('POST', '/channels/600000000000000001/messages')[0].payload).includes('open:activity'), 'Activities off: the pages in Discord');
  globals.push({ id: '1', type: 4, name: 'journal', handler: 2 });
  assert.equal(await checkActivity(r.ctx(), r.env, d.fetchFn), 1, 'on, kept, and the card to be drawn again');
  assert.equal(await ensureTerminal(r.ctx(), r.env, d.fetchFn), 1);
  const card = JSON.stringify(d.called('PATCH', '/channels/600000000000000001/messages/500000000000000001').at(-1).payload);
  assert.ok(card.includes('open:activity') && card.includes('open:home'), 'the book first, its pages a press away');
  const launch = await r.press({ id: snowflake(), username: 'x' }, 'open:activity', { message: { flags: 1 << 15 } });
  assert.deepEqual(launch, { type: 12 });
});
