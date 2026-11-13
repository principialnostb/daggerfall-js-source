// @ts-check
// Friends and profiles. A friends list lives in the relay's hub, beside the presence it grants, so the PDA asks the hub
// through a signed ask (server/src/pdaRelayLaw.js) and every act is the hub's own: accepting, declining, cancelling and
// removing work from Discord; adding a stranger is refused as in the game, where friends first meet. A request from an
// account the player blocked is never shown, as the game never shows it. A profile card is shown only by its owner's
// choice in Settings, and never between two accounts where either blocks the other.
import { text, select, button, STYLE, md, when, divider, ACCENT, modal, reply, container, line, plural, note } from './pdaUi.js';
import { frame } from './pdaFrame.js';
import { RELAY_AWAY_MS, relayCall } from './pdaEvents.js';
import { linkOf } from './pdaLink.js';
import { displayName } from './accounts.js';
import { listRealm } from './realm.js';
import { signingKey } from './signing.js';
import { signAsk, PDA_FRIENDS_PATH } from '../../server/src/pdaRelayLaw.js';
import { LETTER_SUBJECT_MAX, LETTER_BODY_MAX } from '../../src/net/letterLaw.js';
import { ID_RE } from '../../src/net/identityToken.js';

/** The Apps menu's command on a member: their profile card. Declared in discordCommands.js. */
export const PROFILE_COMMAND_NAME = 'DFO Profile';
/** How long a friends list read is kept in this isolate, ms: Home and the screen share one read. */
export const FRIENDS_KEEP_MS = 20_000;
/** Friends a list draws before it says how many more. */
export const FRIENDS_SHOWN = 20;

/** The hub's refusals, in the PDA's words. */
const HUB_WORDS = Object.freeze({
  'meet them first': 'Meet them in the game first, or ask them to add you. Then accept here.',
  'no such request': 'That request is gone.',
  'already friends': 'You are already friends.',
  'already asked': 'You asked them already.',
  'not a friend': 'They are not on your list.',
  'no such player': 'That player is gone.',
  'your friend list is full': 'Your friends list is full.',
  'their friend list is full': 'Their friends list is full.',
  'too many requests out': 'You have too many requests waiting.',
  'their inbox is full': 'They have too many requests waiting.',
  'no account': 'Play online once to start your friends list.',
});
const hubWords = (/** @type {string} */ said) =>
  /** @type {Record<string, string>} */ (HUB_WORDS)[said] ?? `The game said: ${line(said, 80)}.`;

const kept = new Map();
/** Tests stand fresh isolates. */
export const _resetPdaFriendsForTests = () => kept.clear();

/** A fresh nonce for an ask. */
const nonceOf = (/** @type {(b: Uint8Array) => void} */ rand) => {
  const b = new Uint8Array(8);
  rand(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

/**
 * An ask of the hub: a read, or one of its acts by account. Answers the hub's view of the list (`said` its refusal,
 * null when done), or null when the relay cannot be reached.
 * @param {any} ctx @param {any} env @param {string} playerId @param {string} act @param {string} [target]
 */
export async function askFriends(ctx, env, playerId, act = 'read', target) {
  if (act === 'read') {
    const k = kept.get(playerId);
    if (k && Date.now() - k.at < (k.body ? FRIENDS_KEEP_MS : RELAY_AWAY_MS)) return k.body;
  }
  const subtle = ctx.subtle ?? globalThis.crypto.subtle;
  const key = await signingKey(env, subtle);
  if (!key) return null;
  const ask = await signAsk(
    { s: playerId, a: act, ...(target === undefined ? {} : { t: target }), c: nonceOf(ctx.rand ?? ((b) => crypto.getRandomValues(b))) },
    key,
    { subtle, nowS: ctx.nowS },
  );
  const body = await relayCall(env, PDA_FRIENDS_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ask }),
  });
  if (!body || !Array.isArray(body.friends)) {
    // a relay that did not answer is left alone a little while; an act is never answered from the kept word
    if (act === 'read') kept.set(playerId, { at: Date.now(), body: null });
    else kept.delete(playerId);
    return null;
  }
  kept.set(playerId, { at: Date.now(), body });
  return body;
}

/** The accounts a player blocked. */
async function blockedBy(/** @type {any} */ db, /** @type {string} */ playerId) {
  const r = await db.prepare('SELECT blocked FROM blocks WHERE player = ?1').bind(playerId).all();
  return new Set((r?.results ?? []).map((x) => String(x.blocked)));
}

/** Whether either of two accounts blocks the other. */
async function blockedEitherWay(/** @type {any} */ db, /** @type {string} */ a, /** @type {string} */ b) {
  const r = await db
    .prepare('SELECT 1 AS y FROM blocks WHERE (player = ?1 AND blocked = ?2) OR (player = ?2 AND blocked = ?1)')
    .bind(a, b)
    .first();
  return !!r;
}

/** The list as the PDA shows it: requests from blocked accounts left out. @param {any} who */
async function listOf(who, act = 'read', target) {
  const body = await askFriends(who.ctx, who.env, who.player.id, act, target);
  if (!body) return null;
  const blocked = await blockedBy(who.ctx.db, who.player.id);
  return { ...body, in: (body.in ?? []).filter((/** @type {any} */ r) => !blocked.has(r.acct)) };
}

/** A friend's line. */
const friendLine = (/** @type {any} */ f) =>
  f.online ? `● **${md(f.name ?? '?', 40)}** · online` : `○ **${md(f.name ?? '?', 40)}**${f.seen ? ` · seen ${when(Math.floor(f.seen / 1000), 'R')}` : ''}`;

/** @param {any} who @param {string} [said] @param {any} [given] a list already asked for */
async function friendsScreen(who, said = '', given) {
  const body = given ?? (await listOf(who));
  if (!body)
    return frame(who, 'friends', [
      ...(said ? [text(said)] : []),
      text('Your friends list lives in the game\'s live world, and it cannot be reached right now. Try again soon.'),
    ], { actions: [button('Try again', 'pda:friends:refresh', { style: STYLE.PRIMARY })] });
  if (!body.known)
    return frame(who, 'friends', [text('Play online once to start your friends list. Friends are added in the game.')]);
  const friends = [...body.friends].sort((a, b) => Number(b.online) - Number(a.online) || String(a.name).localeCompare(String(b.name)));
  const online = friends.filter((f) => f.online).length;
  const shown = friends.slice(0, FRIENDS_SHOWN);
  const parts = [
    ...(said ? [text(said), divider()] : []),
    text(`**Friends:** ${plural(friends.length, 'friend')}, ${online} online`),
    text(shown.length ? `${shown.map(friendLine).join('\n')}${friends.length > shown.length ? `\n-# and ${friends.length - shown.length} more` : ''}` : '-# No friends yet. Add them in the game, by their name tag.'),
  ];
  if (shown.length)
    parts.push(
      select(
        'pda:friends:pick',
        friends.slice(0, 25).map((f) => ({
          label: f.name ?? '?',
          value: f.acct,
          description: f.online ? 'Online now' : 'Offline',
        })),
        { placeholder: 'Choose a friend…' },
      ),
    );
  const reqs = [
    ...body.in.map((/** @type {any} */ r) => ({ label: `${line(r.name ?? '?', 40)} asks to be your friend`, value: `in:${r.acct}` })),
    ...body.out.map((/** @type {any} */ r) => ({ label: `You asked ${line(r.name ?? '?', 40)}`, value: `out:${r.acct}` })),
  ];
  if (reqs.length)
    parts.push(
      divider(),
      text(`**Requests:** ${body.in.length} to answer, ${body.out.length} waiting on them`),
      select('pda:friends:req', reqs, { placeholder: 'Answer a request…' }),
    );
  return frame(who, 'friends', parts, { actions: [button('Refresh', 'pda:friends:refresh', { style: STYLE.PRIMARY })] });
}

/** The form a letter to an account is written in: the mail's own form, its reader by account. */
function letterForm(/** @type {string} */ acct, /** @type {string} */ name) {
  return modal(`pdam:mail:send:${acct}`, name ? `To ${line(name, 30)}` : 'Write a letter', [
    { id: 'subject', label: 'Subject', max: LETTER_SUBJECT_MAX },
    { id: 'body', label: 'Letter', long: true, max: LETTER_BODY_MAX },
  ]);
}

/** One friend: write to them, or remove them. @param {any} who @param {string} acct */
async function friendScreen(who, acct) {
  const body = await listOf(who);
  const f = body?.friends?.find((/** @type {any} */ x) => x.acct === acct);
  if (!f) return friendsScreen(who, 'They are not on your list.', body ?? undefined);
  return frame(
    who,
    'friends',
    [text(`## ${md(f.name ?? '?', 40)}\n${f.online ? 'Online now' : f.seen ? `Last seen ${when(Math.floor(f.seen / 1000), 'R')}` : 'Offline'}`)],
    {
      title: 'Friend',
      actions: [
        button('Write a letter', `pda:friends:write:${acct}`, { style: STYLE.PRIMARY }),
        button('Remove', `pda:friends:remove:${acct}`, { style: STYLE.DANGER }),
        button('Back', 'pda:friends'),
      ],
    },
  );
}

/** A request, answered. @param {any} who @param {string} act @param {string} acct */
async function act(who, act, acct) {
  if (!ID_RE.test(String(acct ?? ''))) return friendsScreen(who, 'That request is gone.');
  const body = await listOf(who, act, acct);
  if (!body) return friendsScreen(who, 'The game could not be reached. Try again soon.');
  const done = {
    accept: 'You are friends now.',
    decline: 'Declined.',
    cancel: 'Your request is withdrawn.',
    remove: 'Removed from your list.',
    request: 'Asked.',
  }[act];
  return friendsScreen(who, body.said ? hubWords(body.said) : done, body);
}

/** Their name, for a form's title. */
async function nameOf(/** @type {any} */ db, /** @type {string} */ acct) {
  const row = await db.prepare('SELECT handle, guest_name FROM players WHERE id = ?1').bind(acct).first();
  return row ? displayName(row) : '';
}

/** The guild a character wears, or null. */
async function guildOfCharacter(/** @type {any} */ db, /** @type {string|undefined} */ charId) {
  if (!charId) return null;
  return db
    .prepare('SELECT g.name, g.tag FROM guild_members m JOIN guilds g ON g.id = m.guild_id WHERE m.char_id = ?1')
    .bind(charId)
    .first();
}

export const friendsPda = {
  key: 'friends',
  /** @param {any} who */
  screen: async (who) => friendsScreen(who),
  acts: {
    /** @param {any} who */
    refresh: async (who) => {
      kept.delete(who.player.id);
      return friendsScreen(who);
    },
    /** @param {any} who @param {string[]} args @param {string[]} values */
    pick: async (who, args, values) => friendScreen(who, String(values[0] ?? args[0] ?? '')),
    /** @param {any} who @param {string[]} _a @param {string[]} values */
    async req(who, _a, values) {
      const [kind, acct] = String(values[0] ?? '').split(':');
      const body = await listOf(who);
      const r = (kind === 'in' ? body?.in : body?.out)?.find((/** @type {any} */ x) => x.acct === acct);
      if (!r) return friendsScreen(who, 'That request is gone.', body ?? undefined);
      return frame(
        who,
        'friends',
        [text(kind === 'in' ? `**${md(r.name ?? '?', 40)}** asks to be your friend.` : `You asked **${md(r.name ?? '?', 40)}** to be friends.`)],
        {
          title: 'Request',
          actions:
            kind === 'in'
              ? [
                  button('Accept', `pda:friends:accept:${acct}`, { style: STYLE.SUCCESS }),
                  button('Decline', `pda:friends:decline:${acct}`, { style: STYLE.DANGER }),
                  button('Back', 'pda:friends'),
                ]
              : [button('Withdraw', `pda:friends:cancel:${acct}`, { style: STYLE.DANGER }), button('Back', 'pda:friends')],
        },
      );
    },
    /** @param {any} who @param {string[]} args */
    accept: async (who, args) => act(who, 'accept', args[0]),
    /** @param {any} who @param {string[]} args */
    decline: async (who, args) => act(who, 'decline', args[0]),
    /** @param {any} who @param {string[]} args */
    cancel: async (who, args) => act(who, 'cancel', args[0]),
    /** @param {any} who @param {string[]} args */
    /** Removing, asked once more. @param {any} who @param {string[]} args */
    async remove(who, args) {
      const acct = String(args[0] ?? '');
      return frame(who, 'friends', [text(`**Remove ${md(await nameOf(who.ctx.db, acct), 40) || 'them'} from your friends?**`)], {
        title: 'Remove friend',
        accent: ACCENT.WARN,
        actions: [button('Remove', `pda:friends:removeyes:${acct}`, { style: STYLE.DANGER }), button('Keep', 'pda:friends')],
        nav: false,
      });
    },
    /** @param {any} who @param {string[]} args */
    removeyes: async (who, args) => act(who, 'remove', args[0]),
    /** A letter to an account, from a friend's screen or a profile card. @param {any} who @param {string[]} args */
    async write(who, args) {
      const acct = String(args[0] ?? '');
      if (!ID_RE.test(acct) || acct === who.player.id) return friendsScreen(who, 'You cannot write to that player.');
      return letterForm(acct, await nameOf(who.ctx.db, acct));
    },
  },
  /** Friends online, from the kept read when there is one. @param {any} who */
  async glance(who) {
    const body = await askFriends(who.ctx, who.env, who.player.id, 'read');
    if (!body?.known) return null;
    const online = body.friends.filter((/** @type {any} */ f) => f.online).length;
    const asks = body.in.length;
    return `♦ **Friends:** ${online} online${asks ? ` · ${plural(asks, 'request')} to answer` : ''}`;
  },

  /**
   * The Apps menu's DFO Profile on a member: their card, if they chose to show it and neither blocks the other.
   * @param {any} who @param {string} targetId the member's Discord id
   */
  async profileCommand(who, targetId) {
    const none = note('That member has no DFO profile to show.', ACCENT.QUIET);
    const target = await linkOf(who.ctx.db, targetId);
    if (!target || Number(target.link.profile_open) !== 1) return none;
    const self = who.player?.id === target.player.id;
    if (who.player && !self && (await blockedEitherWay(who.ctx.db, who.player.id, target.player.id))) return none;
    const chars = await listRealm(who.ctx, target.player.id);
    const c = chars.find((x) => x.id === target.link.char_id) ?? chars[0] ?? null;
    const s = c?.summary ?? {};
    const g = await guildOfCharacter(who.ctx.db, c?.id);
    const lines = [
      `## ${md(displayName(target.player), 40)}`,
      ...(target.link.pda_title ? [`*${md(target.link.pda_title, 40)}*`] : []),
      c
        ? `**${md(c.name, 40)}** · ${[s.level ? `Level ${s.level}` : '', [s.race, s.className].filter(Boolean).map((x) => md(x, 30)).join(' ')].filter(Boolean).join(' · ') || 'no details yet'}`
        : '-# No online character yet.',
      ...(s.region ? [`-# ${md(s.region, 40)}`] : []),
      ...(g ? [`Guild: **${md(g.name, 40)}** \\<${md(g.tag, 8)}\\>`] : []),
      `-# On Discord since ${when(target.link.linked_at, 'D')}`,
    ];
    /** @type {any[]} */
    let actions = [];
    let foot = '';
    if (self) foot = '-# This is your own card. Settings chooses whether others see it.';
    else if (!who.player) foot = '-# Link your account to write to them.';
    else {
      actions = [button('Write a letter', `pda:friends:write:${target.player.id}`, { style: STYLE.PRIMARY })];
      const mine = await listOf(who);
      const id = target.player.id;
      if (mine?.friends?.some((/** @type {any} */ f) => f.acct === id)) foot = '-# You are friends.';
      else if (mine?.in?.some((/** @type {any} */ f) => f.acct === id))
        actions.push(button('Accept their request', `pda:friends:accept:${id}`, { style: STYLE.SUCCESS }));
      else if (mine?.out?.some((/** @type {any} */ f) => f.acct === id)) foot = '-# You asked them to be friends.';
      else if (mine?.known) foot = '-# Meet them in the game to become friends.'; // the hub asks a stranger by meeting, never by account
    }
    return reply([
      container([
        text('### ❦ The Journal › Profile'),
        divider(),
        text(lines.join('\n')),
        ...(foot ? [text(foot)] : []),
        ...(actions.length ? [divider(), { type: 1, components: actions }] : []),
      ]),
    ]);
  },
};
