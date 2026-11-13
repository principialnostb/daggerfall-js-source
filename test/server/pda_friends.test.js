// The PDA's friends and profiles, end to end: the account service signs an ask, the relay's Worker checks it, the hub
// answers from its own records and acts through its own social law. A blocked account's request never shows; a profile
// shows only by its owner's choice, never across a block; a letter from a friend's screen goes by account.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdaWorldRig } from '../pdaWorldRig.mjs';
import { pdaRig, screenText, customIds, assertScreenOk, snowflake } from '../pdaRig.mjs';
import { PROFILE_COMMAND_NAME, _resetPdaFriendsForTests } from '../../server-account/src/pdaFriends.js';

/** Two players linked and in the hub, friends; a third who asked the first. */
async function threeFriends(r) {
  const a = await r.linked('Ansel', { seated: true });
  const b = await r.linked('Bryn');
  const c = await r.linked('Corin');
  const wa = await r.online(a, 'Ansel');
  const wb = await r.online(b, 'Bryn');
  const wc = await r.online(c, 'Corin');
  await r.social(wa, { k: 'friend.request', peer: 'peer-Bryn' });
  await r.social(wb, { k: 'friend.accept', acct: a.id });
  await r.social(wc, { k: 'friend.request', peer: 'peer-Ansel' });
  _resetPdaFriendsForTests();
  return { a, b, c, wa, wb, wc };
}

test('PDA friends: the list from the hub - online first, the request to answer, no live peer id - and Home\'s line', async () => {
  const r = await pdaWorldRig();
  try {
    await r.quiet(async () => {
      const { a } = await threeFriends(r);
      const s = assertScreenOk(await r.press(a, 'pda:friends'), 'friends');
      const t = screenText(s);
      assert.match(t, /Friends:\*\* 1 friend, 1 online/);
      assert.match(t, /● \*\*Bryn\*\* · online/);
      assert.match(t, /Corin asks to be your friend/);
      assert.ok(customIds(s).includes('pda:friends:pick'));
      assert.ok(r.relayCalls.includes('/v1/pda/friends'), 'asked through the relay\'s signed door');
      _resetPdaFriendsForTests();
      assert.match(screenText(await r.press(a, 'pda:home')), /Friends:\*\* 1 online · 1 request to answer/);
    });
  } finally {
    r.done();
  }
});

test('PDA friends: accepting from Discord is the hub\'s own accept - the friend\'s game hears it; removing asks once more; a request withdrawn', async () => {
  const r = await pdaWorldRig();
  try {
    await r.quiet(async () => {
      const { a, c, wc } = await threeFriends(r);
      const req = assertScreenOk(await r.choose(a, 'pda:friends:req', [`in:${c.id}`]), 'request');
      assert.ok(customIds(req).includes(`pda:friends:accept:${c.id}`));
      const heard = wc.sent.length;
      const ok = assertScreenOk(await r.press(a, `pda:friends:accept:${c.id}`), 'accepted');
      assert.match(screenText(ok), /You are friends now/);
      assert.match(screenText(ok), /2 friends/);
      assert.ok(wc.sent.slice(heard).some((m) => m.t === 'social' && m.k === 'state'), 'Corin\'s game is told at once');
      r.tick();
      const ask = await r.press(a, `pda:friends:remove:${c.id}`);
      assert.ok(customIds(ask).includes(`pda:friends:removeyes:${c.id}`));
      assert.match(screenText(await r.press(a, `pda:friends:removeyes:${c.id}`)), /Removed from your list/);
      r.tick();
      // a stranger: the hub asks by meeting, never by account, so the card says so and offers no button that cannot work
      const d = await r.linked('Dell');
      await r.online(d, 'Dell');
      r.raw.prepare('UPDATE discord_links SET profile_open = 1 WHERE player_id = ?').run(d.id);
      const card = assertScreenOk(await r.command(a, PROFILE_COMMAND_NAME, d.discordId), 'stranger\'s card');
      assert.match(screenText(card), /Meet them in the game to become friends/);
      assert.ok(!customIds(card).some((id) => id.startsWith('pda:friends:add')), 'no Add friend');
    });
  } finally {
    r.done();
  }
});

test('PDA friends: a request from an account the player blocked is never shown; a friend\'s letter goes by account', async () => {
  const r = await pdaWorldRig();
  try {
    await r.quiet(async () => {
      const { a, b, c } = await threeFriends(r);
      r.raw.prepare('INSERT INTO blocks (player, blocked, at) VALUES (?, ?, ?)').run(a.id, c.id, 1);
      _resetPdaFriendsForTests();
      assert.doesNotMatch(screenText(await r.press(a, 'pda:friends')), /Corin/);
      const f = assertScreenOk(await r.choose(a, 'pda:friends:pick', [b.id]), 'friend');
      assert.match(screenText(f), /Online now/);
      const form = await r.press(a, `pda:friends:write:${b.id}`);
      assert.equal(form.type, 9);
      assert.equal(form.data.custom_id, `pdam:mail:send:${b.id}`);
      assert.match(form.data.title, /Bryn/);
      await r.submit(a, form.data.custom_id, { subject: 'Hi', body: 'From the friends list.' });
      assert.equal(r.raw.prepare('SELECT COUNT(*) AS n FROM letters WHERE to_id = ?').get(b.id).n, 1);
    });
  } finally {
    r.done();
  }
});

test('PDA friends: with the relay away, the screen says so and offers to try again', async () => {
  _resetPdaFriendsForTests();
  const r = await pdaRig();
  const p = await r.linked('Esme');
  const s = assertScreenOk(await r.press(p, 'pda:friends'), 'away');
  assert.match(screenText(s), /cannot be reached right now/);
  assert.ok(customIds(s).includes('pda:friends:refresh'));
});

test('PDA profile: shown only when its owner chose to show it, never across a block, and never to say whether a hidden member is linked', async () => {
  const r = await pdaWorldRig();
  try {
    await r.quiet(async () => {
      const { a, b, c } = await threeFriends(r);
      r.raw.prepare('UPDATE realm_characters SET summary = ? WHERE player = ?').run(JSON.stringify({ level: 21, race: 'Breton', className: 'Knight', region: 'Glenpoint' }), a.id);
      const stranger = { id: snowflake(), username: 'nobody' };
      const hidden = await r.command(b, PROFILE_COMMAND_NAME, a.discordId);
      assert.match(screenText(hidden), /no DFO profile to show/);
      assert.match(screenText(await r.command(b, PROFILE_COMMAND_NAME, stranger.id)), /no DFO profile to show/, 'the same words for nobody');
      r.raw.prepare('UPDATE discord_links SET profile_open = 1 WHERE player_id = ?').run(a.id);
      const card = assertScreenOk(await r.command(b, PROFILE_COMMAND_NAME, a.discordId), 'card');
      assert.ok(card.data.flags & 64, 'seen by the asker alone');
      const t = screenText(card);
      assert.match(t, /Ansel/);
      assert.match(t, /Level 21/);
      assert.match(t, /Glenpoint/);
      assert.match(t, /You are friends/);
      assert.ok(customIds(card).includes(`pda:friends:write:${a.id}`));
      // Corin asked Ansel: Ansel opening Corin's card may accept
      r.raw.prepare('UPDATE discord_links SET profile_open = 1 WHERE player_id = ?').run(c.id);
      _resetPdaFriendsForTests();
      assert.ok(customIds(await r.command(a, PROFILE_COMMAND_NAME, c.discordId)).includes(`pda:friends:accept:${c.id}`));
      // a block either way hides it
      r.raw.prepare('INSERT INTO blocks (player, blocked, at) VALUES (?, ?, ?)').run(a.id, b.id, 1);
      assert.match(screenText(await r.command(b, PROFILE_COMMAND_NAME, a.discordId)), /no DFO profile to show/);
      // an unlinked member may look, and is told to link to write
      assert.match(screenText(await r.command(stranger, PROFILE_COMMAND_NAME, a.discordId)), /Link your account to write/);
      // one's own card
      assert.match(screenText(await r.command(a, PROFILE_COMMAND_NAME, a.discordId)), /your own card/);
    });
  } finally {
    r.done();
  }
});
