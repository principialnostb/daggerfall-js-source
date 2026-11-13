// @ts-check
// Guild: the guild of the character the PDA acts as, run from Discord. Every act is guilds.js's, guildBoard.js's or
// guildVault.js's own, as that account and character, so a rank's powers, the guild's cap and the rates hold here
// unchanged, and a forged button is refused by the same check the game's page meets. What moves a character's save
// (founding, the treasury, the vault's pieces) or cannot be undone (renaming, handing on, disbanding) stays in the game.
import { text, select, button, STYLE, md, when, fenced, plural, divider, ACCENT, modal, line, num } from './pdaUi.js';
import { frame, refusalText } from './pdaFrame.js';
import {
  guildOf,
  invitesOf,
  inviteToGuild,
  answerInvite,
  requestToJoin,
  withdrawJoinRequest,
  answerJoinRequest,
  leaveGuild,
  removeFromGuild,
  rankGuildMember,
  guildActorOf,
  guildPowersOfRow,
} from './guilds.js';
import { readGuildBoard, pinGuildNote, takeDownGuildNote } from './guildBoard.js';
import { vaultOf } from './guildVault.js';
import { mintId } from './accounts.js';
import { NOTICE_KINDS } from './pdaLink.js';
import { noticeBound, noticeStatement } from './pdaNotices.js';
import {
  guildMay,
  guildMayMove,
  guildOutranks,
  GUILD_RANK_MASTER,
  GUILD_MEMBERS_MAX,
  GUILD_ID_RE,
  GUILD_MEMBER_RE,
  GUILD_REQUEST_RE,
  GUILD_INVITE_TTL_S,
  GUILD_REQUEST_TTL_S,
} from '../../src/net/guild/guildLaw.js';
import { vaultStandingText } from '../../src/net/guild/guildVaultLaw.js';
import { NOTE_DAYS, NOTE_ID_RE } from '../../src/net/boardLaw.js';
import { LETTER_SUBJECT_MAX, LETTER_BODY_MAX } from '../../src/net/letterLaw.js';
import { PLAY_GRACE_S } from '../../src/net/playClock.js';
import { REGION_NAMES } from '../../src/formats/mapsTables.js';

/** Members a page of the roster shows. */
export const GUILD_PAGE = 10;
/** Invitations and requests the clock tells of in one minute, all users together. */
export const GUILD_NOTICES_A_MINUTE = 50;

const GUILD_WORDS = Object.freeze({
  'no-guild': 'This character is in no guild.',
  'guild-rank': 'Your rank may not do that.',
  'guild-rate': 'You have done a lot in your guild this hour. Wait a while.',
  'no-player': 'Nobody has that name.',
  'guild-full': `The guild is full. A guild holds ${GUILD_MEMBERS_MAX} characters.`,
  'no-invite': 'That invitation is gone.',
  'guild-already': 'This character is in a guild already.',
  'guild-character': 'Choose an online character first.',
  'guilds-need-account': 'Register your account in the game first.',
  'no-member': 'That member is gone or has moved.',
  'no-guild-tag': 'No guild has that tag.',
  'guild-invited': 'That guild has invited you already. Answer its invitation.',
  'guild-requested': 'Another of your characters has asked that guild already.',
  'guild-requests-max': 'You have asked three guilds already. Wait for an answer, or take one back.',
  'guild-requests-full': 'That guild has too many requests waiting.',
  'no-request': 'That request is gone.',
  'guild-request-joined': 'That character joined another guild.',
  'board-closed': 'The guild board is closed.',
  'board-rate': 'You have pinned many notes this hour. Wait a while.',
  'board-ops-rate': 'Slow down a little, then try again.',
  'notes-full': 'You have three notes up already. Take one down first.',
  'no-note': 'That note is gone.',
  'no-subject': 'A note needs a subject.',
  'subject-long': `A subject is at most ${LETTER_SUBJECT_MAX} characters.`,
  'no-body': 'A note needs some words.',
  'body-long': `A note is at most ${LETTER_BODY_MAX} characters.`,
  'body-lines': 'A note is at most 40 lines.',
  'bad-note-days': 'Choose how long the note stays up.',
  muted: 'You are muted and cannot do that now.',
  'master-leaves': 'A guildmaster leaves in the game, after handing the guild on.',
});
const say = (/** @type {string} */ e) => refusalText(e, GUILD_WORDS);

/** The guild acts' context: the request's, with the service's settings. */
const gctx = (/** @type {any} */ who) => ({ ...who.ctx, env: who.env });
/** A member is online when their account beat within the grace a play beat allows. */
const online = (/** @type {any} */ m, /** @type {number} */ nowS) =>
  Number.isSafeInteger(m?.seenAt) && nowS - m.seenAt <= PLAY_GRACE_S && m.hidden !== true;
/** A rank's name in this guild. */
const rankName = (/** @type {any} */ g, /** @type {number} */ r) => md(g.ranks?.[r] ?? `Rank ${r + 1}`, 20);
/** A region's name, any of the world's. */
const regionName = (/** @type {number} */ r) => REGION_NAMES[r] ?? `Region ${r}`;

/** The screen when the PDA has no character to act as. */
const noCharacter = (/** @type {any} */ who) =>
  frame(who, 'guild', [text(refusalText('no-character'))]);

/** The guild as this character's member sees it, or null for none; the refusal words where it cannot be read. */
async function viewOfWho(who) {
  const r = await guildOf(gctx(who), who.player, { character: who.character.id });
  if ('error' in r) return { error: r.error };
  return { guild: r.guild };
}

/** The guild's front page. @param {any} who @param {string} [said] */
async function guildScreen(who, said = '') {
  if (!who.character) return noCharacter(who);
  const v = await viewOfWho(who);
  if (v.error) return frame(who, 'guild', [text(say(v.error))]);
  if (!v.guild) return noGuildScreen(who, said);
  const g = v.guild;
  const nowS = who.ctx.nowS;
  const on = g.members.filter((/** @type {any} */ m) => online(m, nowS));
  const mayInvite = guildMay(g.rank, 'invite', g.powers);
  const requests = Array.isArray(g.requests) ? g.requests : [];
  const lines = [
    `## ${md(g.name, 40)} <${md(g.tag, 4)}>`,
    `-# You are **${rankName(g, g.rank)}** · ${plural(g.members.length, 'member')} of ${GUILD_MEMBERS_MAX} · ${num(on.length)} online now`,
    `Founded ${when(g.foundedAt, 'D')} · treasury ${num(g.treasury)} gold${g.marks != null ? ` · ${num(g.marks)} silver` : ''}`,
  ];
  if (on.length)
    lines.push(
      `**Online:** ${on
        .slice(0, 12)
        .map((/** @type {any} */ m) => md(m.name, 30))
        .join(', ')}${on.length > 12 ? ` and ${on.length - 12} more` : ''}`,
    );
  if (mayInvite && requests.length) lines.push(`**Join requests waiting:** ${num(requests.length)}`);
  if (mayInvite && g.invites?.length) lines.push(`-# ${plural(g.invites.length, 'invitation')} out`);
  return frame(who, 'guild', [...(said ? [text(said), divider()] : []), text(lines.join('\n'))], {
    actions: [
      button('Members', 'pda:guild:members:0', { style: STYLE.PRIMARY }),
      button('Board', 'pda:guild:board'),
      button('Vault', 'pda:guild:vault'),
      button('Hall and castles', 'pda:guild:hall'),
      ...(mayInvite ? [button('Invite', 'pda:guild:invite')] : []),
      ...(mayInvite && requests.length ? [button(`Requests (${requests.length})`, 'pda:guild:reqs')] : []),
      button('Leave', 'pda:guild:leave', { style: STYLE.DANGER }),
    ],
  });
}

/** A character in no guild: the invitations to the account, its standing requests, and a way to ask a guild. */
async function noGuildScreen(who, said = '') {
  const r = await invitesOf(who.ctx, who.player);
  const invites = r.invites ?? [];
  const requests = (r.requests ?? []).filter((/** @type {any} */ q) => q.character === who.character.id);
  const lines = [
    `**${md(who.character.name, 40)}** is in no guild.`,
    invites.length
      ? `**Invitations:**\n${invites.map((/** @type {any} */ i) => `· ${md(i.name, 32)} <${md(i.tag, 4)}> from ${md(i.by, 30)}, ${when(i.at, 'R')}`).join('\n')}`
      : '-# No invitations.',
    ...(requests.length
      ? [`**Your requests:**\n${requests.map((/** @type {any} */ q) => `· ${md(q.name, 32)} <${md(q.tag, 4)}>, asked ${when(q.at, 'R')}`).join('\n')}`]
      : []),
    '-# To found a guild, use the Guild window in the game.',
  ];
  return frame(
    who,
    'guild',
    [
      ...(said ? [text(said), divider()] : []),
      text(lines.join('\n')),
      ...(invites.length
        ? [
            select(
              'pda:guild:inv',
              invites.map((/** @type {any} */ i) => ({
                label: `${i.name} <${i.tag}>`,
                value: i.guild,
                description: `from ${line(i.by, 40)}`,
              })),
              { placeholder: 'Answer an invitation…' },
            ),
          ]
        : []),
      ...(requests.length
        ? [
            select(
              'pda:guild:unask',
              requests.map((/** @type {any} */ q) => ({ label: `Take back: ${q.name} <${q.tag}>`, value: q.guild })),
              { placeholder: 'Take a request back…' },
            ),
          ]
        : []),
    ],
    { actions: [button('Ask to join', 'pda:guild:ask', { style: STYLE.PRIMARY })] },
  );
}

/** One invitation, to accept with this character or decline. */
async function inviteScreen(who, guildId) {
  const r = await invitesOf(who.ctx, who.player);
  const i = (r.invites ?? []).find((/** @type {any} */ x) => x.guild === guildId);
  if (!i) return guildScreen(who, say('no-invite'));
  return frame(
    who,
    'guild',
    [
      text(
        `**${md(i.name, 32)} <${md(i.tag, 4)}>** invites you. ${md(i.by, 30)} asked ${when(i.at, 'R')}.\nAccepted, **${md(who.character.name, 40)}** joins at the lowest rank.`,
      ),
    ],
    {
      title: 'Invitation',
      actions: [
        button('Join', `pda:guild:join:${i.guild}`, { style: STYLE.SUCCESS }),
        button('Decline', `pda:guild:decline:${i.guild}`, { style: STYLE.DANGER }),
        button('Back', 'pda:guild'),
      ],
    },
  );
}

/** The roster, a page, with a menu to open a member. */
async function membersScreen(who, page = 0) {
  if (!who.character) return noCharacter(who);
  const v = await viewOfWho(who);
  if (v.error || !v.guild) return guildScreen(who, v.error ? say(v.error) : '');
  const g = v.guild;
  const nowS = who.ctx.nowS;
  const pages = Math.max(1, Math.ceil(g.members.length / GUILD_PAGE));
  const p = Math.min(Math.max(0, page | 0), pages - 1);
  const shown = g.members.slice(p * GUILD_PAGE, (p + 1) * GUILD_PAGE);
  const lines = shown.map(
    (/** @type {any} */ m) =>
      `${online(m, nowS) ? '●' : '○'} **${md(m.name, 30)}**${m.you ? ' (you)' : ''} · ${rankName(g, m.rank)}${
        !online(m, nowS) && Number.isSafeInteger(m.seenAt) ? ` · seen ${when(m.seenAt, 'R')}` : ''
      }`,
  );
  return frame(
    who,
    'guild',
    [
      text(`**${md(g.name, 40)} <${md(g.tag, 4)}>** · ${plural(g.members.length, 'member')}${pages > 1 ? ` · page ${p + 1} of ${pages}` : ''}`),
      text(lines.join('\n') || '-# Nobody.'),
      select(
        'pda:guild:member',
        shown.map((/** @type {any} */ m) => ({
          label: m.name,
          value: m.member,
          description: `${line(g.ranks?.[m.rank] ?? '', 20)}${online(m, nowS) ? ' · online' : ''}`,
        })),
        { placeholder: 'Open a member…' },
      ),
    ],
    {
      title: 'Members',
      actions: [
        ...(p > 0 ? [button('Previous', `pda:guild:members:${p - 1}`)] : []),
        ...(p < pages - 1 ? [button('Next', `pda:guild:members:${p + 1}`)] : []),
        button('Back', 'pda:guild'),
      ],
    },
  );
}

/** One member: their rank, when they joined, and the moves this member's rank may make on them. */
async function memberScreen(who, memberId, said = '') {
  if (!who.character) return noCharacter(who);
  const v = await viewOfWho(who);
  if (v.error || !v.guild) return guildScreen(who, v.error ? say(v.error) : '');
  const g = v.guild;
  const m = g.members.find((/** @type {any} */ x) => x.member === memberId);
  if (!m) return membersScreen(who, 0);
  const n = g.ranks.length;
  const nowS = who.ctx.nowS;
  const up = m.rank - 1;
  const down = m.rank + 1;
  const mayUp = !m.you && up > GUILD_RANK_MASTER && guildMayMove(g.rank, m.rank, up, g.powers, n);
  const mayDown = !m.you && down < n && guildMayMove(g.rank, m.rank, down, g.powers, n);
  const mayRemove = !m.you && guildMay(g.rank, 'remove', g.powers) && guildOutranks(g.rank, m.rank);
  return frame(
    who,
    'guild',
    [
      ...(said ? [text(said), divider()] : []),
      text(
        [
          `## ${md(m.name, 30)}${m.you ? ' (you)' : ''}`,
          `**${rankName(g, m.rank)}** · joined ${when(m.joinedAt, 'D')}`,
          online(m, nowS) ? 'Online now' : Number.isSafeInteger(m.seenAt) ? `Last online ${when(m.seenAt, 'R')}` : '-# Not seen yet',
          `-# Vault: ${vaultStandingText(m.vault)}`,
        ].join('\n'),
      ),
    ],
    {
      title: 'Member',
      actions: [
        ...(mayUp ? [button(`Promote to ${line(g.ranks[up], 20)}`, `pda:guild:rank:${m.member}:${up}`, { style: STYLE.SUCCESS })] : []),
        ...(mayDown ? [button(`Demote to ${line(g.ranks[down], 20)}`, `pda:guild:rank:${m.member}:${down}`)] : []),
        ...(mayRemove ? [button('Remove', `pda:guild:rm:${m.member}`, { style: STYLE.DANGER })] : []),
        button('Members', 'pda:guild:members:0'),
      ],
    },
  );
}

/** The join requests the guild holds, to a rank that may answer them. */
async function requestsScreen(who, said = '') {
  if (!who.character) return noCharacter(who);
  const v = await viewOfWho(who);
  if (v.error || !v.guild) return guildScreen(who, v.error ? say(v.error) : '');
  const g = v.guild;
  if (!guildMay(g.rank, 'invite', g.powers)) return guildScreen(who, say('guild-rank'));
  const list = Array.isArray(g.requests) ? g.requests : [];
  return frame(
    who,
    'guild',
    [
      ...(said ? [text(said), divider()] : []),
      text(
        list.length
          ? list.map((/** @type {any} */ q) => `· **${md(q.name, 30)}**, asked ${when(q.at, 'R')}`).join('\n')
          : '-# No requests are waiting.',
      ),
      ...(list.length
        ? [
            select(
              'pda:guild:req',
              list.slice(0, 25).map((/** @type {any} */ q) => ({ label: q.name, value: q.id, description: 'Accept or decline' })),
              { placeholder: 'Answer a request…' },
            ),
          ]
        : []),
    ],
    { title: 'Join requests', actions: [button('Back', 'pda:guild')] },
  );
}

/** The guild's board: its live notes, newest first. */
async function boardScreen(who, said = '') {
  if (!who.character) return noCharacter(who);
  const r = await readGuildBoard(who.ctx, who.player, who.env, { character: who.character.id });
  if ('error' in r) return guildScreen(who, say(r.error));
  const notes = r.notes.slice(0, 15);
  const lines = notes.map(
    (/** @type {any} */ n) => `· **${md(n.subject, 60)}**\n-# ${md(n.from, 30)} · ${when(n.at, 'R')}${n.mine ? ' · yours' : ''}`,
  );
  return frame(
    who,
    'guild',
    [
      ...(said ? [text(said), divider()] : []),
      text(`**${md(r.guild.name, 40)} <${md(r.guild.tag, 4)}>** board · your notes up: ${r.me.live} of ${r.me.max}`),
      text(lines.join('\n') || '-# Nothing is pinned.'),
      ...(notes.length
        ? [
            select(
              'pda:guild:note',
              notes.map((/** @type {any} */ n) => ({ label: n.subject, value: n.id, description: `from ${line(n.from, 40)}` })),
              { placeholder: 'Read a note…' },
            ),
          ]
        : []),
    ],
    {
      title: 'Guild board',
      actions: [
        ...(r.me.canPin && r.me.live < r.me.max ? [button('Pin a note', 'pda:guild:pin', { style: STYLE.PRIMARY })] : []),
        button('Back', 'pda:guild'),
      ],
    },
  );
}

/** One note, with Take down where it is the reader's or the reader keeps the board. */
async function noteScreen(who, id) {
  if (!who.character) return noCharacter(who);
  const r = await readGuildBoard(who.ctx, who.player, who.env, { character: who.character.id });
  if ('error' in r) return guildScreen(who, say(r.error));
  const n = r.notes.find((/** @type {any} */ x) => x.id === id);
  if (!n) return boardScreen(who, say('no-note'));
  return frame(
    who,
    'guild',
    [text(`## ${md(n.subject, 60)}\n-# ${md(n.from, 30)} · ${when(n.at, 'f')} · comes down ${when(n.expiresAt, 'R')}`), text(fenced(n.body, 1600))],
    {
      title: 'Note',
      actions: [
        ...(n.mine || r.me.keeper ? [button('Take down', `pda:guild:unpin:${n.id}`, { style: STYLE.DANGER })] : []),
        button('Board', 'pda:guild:board'),
      ],
    },
  );
}

/** The vault, read only: what it holds, the member's standing, the latest moves. */
async function vaultScreen(who) {
  if (!who.character) return noCharacter(who);
  const r = await vaultOf(who.ctx, who.player, { character: who.character.id });
  if ('error' in r) return guildScreen(who, say(r.error));
  const v = r.vault;
  const items = v.items
    .slice(0, 20)
    .map((/** @type {any} */ i) => `· ${md(i.name, 40)}${i.count > 1 ? ` ×${num(i.count)}` : ''} · put in by ${md(i.by, 30)}`);
  const log = v.log
    .slice(0, 5)
    .map((/** @type {any} */ l) => `-# ${md(l.who, 30)} ${l.kind === 'take' ? 'took' : 'put in'} ${md(l.name, 30)} ${when(l.at, 'R')}`);
  return frame(
    who,
    'guild',
    [
      text(`**Vault:** ${num(v.items.length)} of ${num(v.max)} shelves used · you: ${vaultStandingText(v.me)}${v.me.level === 'withdraw' && v.me.limit > 0 ? `, ${num(v.me.taken)} taken today` : ''}`),
      text(items.join('\n') || '-# The vault is empty.'),
      ...(log.length ? [text(log.join('\n'))] : []),
      text('-# Pieces go in and out in the game, at the guild vault.'),
    ],
    { title: 'Vault', actions: [button('Back', 'pda:guild')] },
  );
}

/** The guild's hall and castles, read only. */
async function hallScreen(who) {
  if (!who.character) return noCharacter(who);
  const v = await viewOfWho(who);
  if (v.error || !v.guild) return guildScreen(who, v.error ? say(v.error) : '');
  const g = v.guild;
  const hall = g.hall
    ? `**Hall** in ${md(regionName(Number(g.hall.region)), 40)} · bought ${when(g.hall.boughtAt, 'D')} · entry: ${md(g.hall.entry ?? 'members', 20)}`
    : '-# The guild has no hall.';
  const castles = (g.castles ?? []).length
    ? `**Castles:** ${(g.castles ?? []).map((/** @type {any} */ c) => md(regionName(c.region), 40)).join(', ')}`
    : '-# The guild holds no castle.';
  return frame(who, 'guild', [text(`${hall}\n${castles}\n-# Halls and castles are bought, sold and kept in the game.`)], {
    title: 'Hall and castles',
    actions: [button('Back', 'pda:guild')],
  });
}

/** A fresh request id for an act the game asks one of. */
const ridOf = (/** @type {any} */ who) => mintId(who.ctx.rand);

export const guildPda = {
  key: 'guild',
  /** @param {any} who */
  screen: async (who) => guildScreen(who),
  acts: {
    /** @param {any} who @param {string[]} args */
    members: async (who, args) => membersScreen(who, Number(args[0]) || 0),
    /** @param {any} who @param {string[]} args @param {string[]} values */
    member: async (who, args, values) => memberScreen(who, String(values[0] ?? args[0] ?? '')),
    /** A member moved a rank. The game's own check decides; a forged button is refused there. @param {any} who @param {string[]} args */
    async rank(who, args) {
      const [member, to] = args;
      if (!who.character || !GUILD_MEMBER_RE.test(String(member)) || !/^\d$/.test(String(to))) return guildScreen(who, say('no-member'));
      const r = await rankGuildMember(gctx(who), who.player, { character: who.character.id, member, rank: Number(to) });
      return memberScreen(who, member, 'error' in r ? say(r.error) : 'Done.');
    },
    /** Remove, asked once more. @param {any} who @param {string[]} args */
    async rm(who, args) {
      const v = await viewOfWho(who);
      const m = v.guild?.members.find((/** @type {any} */ x) => x.member === args[0]);
      if (!m) return guildScreen(who, say('no-member'));
      return frame(who, 'guild', [text(`**Remove ${md(m.name, 30)} from the guild?**`)], {
        title: 'Remove',
        accent: ACCENT.WARN,
        nav: false,
        actions: [
          button('Remove', `pda:guild:rmyes:${m.member}`, { style: STYLE.DANGER }),
          button('Keep them', `pda:guild:member:${m.member}`),
        ],
      });
    },
    /** @param {any} who @param {string[]} args */
    async rmyes(who, args) {
      if (!who.character || !GUILD_MEMBER_RE.test(String(args[0]))) return guildScreen(who, say('no-member'));
      const r = await removeFromGuild(gctx(who), who.player, { character: who.character.id, member: args[0] });
      return 'error' in r ? memberScreen(who, args[0], say(r.error)) : membersScreen(who, 0);
    },
    /** The invite form. */
    invite: async () =>
      modal('pdam:guild:invite', 'Invite to the guild', [{ id: 'name', label: 'Their username', hint: 'The name they sign in with', max: 32 }]),
    /** @param {any} who */
    reqs: async (who) => requestsScreen(who),
    /** One request, opened from the menu. @param {any} who @param {string[]} args @param {string[]} values */
    async req(who, args, values) {
      const id = String(values[0] ?? args[0] ?? '');
      const v = await viewOfWho(who);
      const q = (v.guild?.requests ?? []).find((/** @type {any} */ x) => x.id === id);
      if (!q) return requestsScreen(who, say('no-request'));
      return frame(who, 'guild', [text(`**${md(q.name, 30)}** asks to join, ${when(q.at, 'R')}.`)], {
        title: 'Join request',
        actions: [
          button('Accept', `pda:guild:reqyes:${q.id}`, { style: STYLE.SUCCESS }),
          button('Decline', `pda:guild:reqno:${q.id}`, { style: STYLE.DANGER }),
          button('Back', 'pda:guild:reqs'),
        ],
      });
    },
    /** @param {any} who @param {string[]} args */
    reqyes: async (who, args) => answerRequest(who, args[0], true),
    /** @param {any} who @param {string[]} args */
    reqno: async (who, args) => answerRequest(who, args[0], false),
    /** An invitation opened from the menu. @param {any} who @param {string[]} args @param {string[]} values */
    async inv(who, args, values) {
      if (!who.character) return noCharacter(who);
      return inviteScreen(who, String(values[0] ?? args[0] ?? ''));
    },
    /** @param {any} who @param {string[]} args */
    async join(who, args) {
      if (!who.character || !GUILD_ID_RE.test(String(args[0]))) return guildScreen(who, say('no-invite'));
      const r = await answerInvite(gctx(who), who.player, { character: who.character.id, guild: args[0], accept: true });
      return guildScreen(who, 'error' in r ? say(r.error) : `Welcome to ${md(r.guild?.name ?? 'the guild', 40)}.`);
    },
    /** @param {any} who @param {string[]} args */
    async decline(who, args) {
      if (!GUILD_ID_RE.test(String(args[0]))) return guildScreen(who, say('no-invite'));
      const r = await answerInvite(gctx(who), who.player, { character: who.character?.id, guild: args[0], accept: false });
      return guildScreen(who, 'error' in r ? say(r.error) : 'Declined.');
    },
    /** The ask-to-join form. */
    ask: async () =>
      modal('pdam:guild:ask', 'Ask to join a guild', [{ id: 'tag', label: 'The guild’s tag', hint: 'Two to four letters or digits', min: 2, max: 4 }]),
    /** A request taken back. @param {any} who @param {string[]} args @param {string[]} values */
    async unask(who, args, values) {
      const guild = String(values[0] ?? args[0] ?? '');
      if (!who.character) return noCharacter(who);
      const r = await withdrawJoinRequest(who.ctx, who.player, { character: who.character.id, guild });
      return guildScreen(who, 'error' in r ? say(r.error) : 'Request taken back.');
    },
    /** @param {any} who */
    board: async (who) => boardScreen(who),
    /** @param {any} who @param {string[]} args @param {string[]} values */
    note: async (who, args, values) => noteScreen(who, String(values[0] ?? args[0] ?? '')),
    /** The note form. */
    pin: async () =>
      modal('pdam:guild:pin', 'Pin a note', [
        { id: 'subject', label: 'Subject', max: LETTER_SUBJECT_MAX },
        { id: 'body', label: 'Note', long: true, max: LETTER_BODY_MAX },
        {
          id: 'days',
          label: 'Stays up for',
          options: NOTE_DAYS.map((d) => ({ label: d === 1 ? '1 day' : `${d} days`, value: String(d), default: d === 3 })),
        },
      ]),
    /** @param {any} who @param {string[]} args */
    async unpin(who, args) {
      if (!who.character || !NOTE_ID_RE.test(String(args[0]))) return boardScreen(who, say('no-note'));
      const r = await takeDownGuildNote(who.ctx, who.player, who.env, { character: who.character.id, id: args[0] });
      return boardScreen(who, 'error' in r ? say(r.error) : 'Taken down.');
    },
    /** @param {any} who */
    vault: async (who) => vaultScreen(who),
    /** @param {any} who */
    hall: async (who) => hallScreen(who),
    /** Leaving, asked once more. A guildmaster is sent to the game, where the guild is handed on first. @param {any} who */
    async leave(who) {
      if (!who.character) return noCharacter(who);
      const v = await viewOfWho(who);
      if (!v.guild) return guildScreen(who, v.error ? say(v.error) : '');
      if (v.guild.rank === GUILD_RANK_MASTER) return guildScreen(who, say('master-leaves'));
      return frame(who, 'guild', [text(`**Leave ${md(v.guild.name, 40)}?**\n${md(who.character.name, 40)} will need a new invitation to come back.`)], {
        title: 'Leave',
        accent: ACCENT.WARN,
        nav: false,
        actions: [button('Leave', 'pda:guild:leaveyes', { style: STYLE.DANGER }), button('Stay', 'pda:guild')],
      });
    },
    /** @param {any} who */
    async leaveyes(who) {
      if (!who.character) return noCharacter(who);
      const a = await guildActorOf(who.ctx.db, who.player, who.character.id);
      if (!('error' in a) && a.me.rank === GUILD_RANK_MASTER) return guildScreen(who, say('master-leaves'));
      const r = await leaveGuild(who.ctx, who.player, { character: who.character.id });
      return guildScreen(who, 'error' in r ? say(r.error) : 'You left the guild.');
    },
  },
  forms: {
    /** @param {any} who @param {Record<string, string>} values */
    async invite(who, values) {
      if (!who.character) return noCharacter(who);
      const handle = String(values.name ?? '').trim();
      const r = await inviteToGuild(gctx(who), who.player, { character: who.character.id, handle });
      return guildScreen(who, 'error' in r ? say(r.error) : `Invited **${md(handle, 32)}**. They can answer in the game or here.`);
    },
    /** @param {any} who @param {Record<string, string>} values */
    async ask(who, values) {
      if (!who.character) return noCharacter(who);
      const r = await requestToJoin(gctx(who), who.player, { character: who.character.id, tag: values.tag });
      return guildScreen(
        who,
        'error' in r ? say(r.error) : `Asked **${md(r.request.name, 32)} <${md(r.request.tag, 4)}>**. You get a letter when they answer.`,
      );
    },
    /** @param {any} who @param {Record<string, string>} values */
    async pin(who, values) {
      if (!who.character) return noCharacter(who);
      const r = await pinGuildNote(who.ctx, who.player, who.env, {
        character: who.character.id,
        subject: values.subject,
        body: values.body,
        days: Number(values.days) || 3,
        rid: ridOf(who),
      });
      return boardScreen(who, 'error' in r ? say(r.error) : 'Pinned.');
    },
  },
  /** @param {any} who */
  async glance(who) {
    if (!who.character) return null;
    const m = await who.ctx.db
      .prepare(
        'SELECT g.name, g.tag, g.ranks, m.rank FROM guild_members m JOIN guilds g ON g.id = m.guild_id WHERE m.player = ?1 AND m.char_id = ?2',
      )
      .bind(who.player.id, who.character.id)
      .first();
    if (!m) return '⚑ **Guild:** none';
    let ranks = [];
    try {
      ranks = JSON.parse(m.ranks) ?? [];
    } catch {
      ranks = [];
    }
    const rank = Array.isArray(ranks) && ranks[m.rank] ? ranks[m.rank] : ['Guildmaster', 'Officer', 'Member', 'Recruit'][m.rank] ?? 'Member';
    return `⚑ **Guild:** ${md(m.name, 40)} <${md(m.tag, 4)}> · ${md(rank, 20)}`;
  },
  minute: async (/** @type {any} */ ctx) => guildNotices(ctx),
};

/** A join request answered, as the rank that may. */
async function answerRequest(who, id, accept) {
  if (!who.character || !GUILD_REQUEST_RE.test(String(id))) return requestsScreen(who, say('no-request'));
  const r = await answerJoinRequest(gctx(who), who.player, { character: who.character.id, request: id, accept });
  return requestsScreen(who, 'error' in r ? say(r.error) : accept ? 'Accepted. They are in.' : 'Declined.');
}

/**
 * The clock's news of guilds: each invitation to a linked account, and each join request to a guild where one of the
 * account's characters may answer it, since the link's mark. Rows from the last two seconds wait a minute, so a row
 * written in the mark's own second is never passed over. Links that want no guild news have their mark moved too.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function guildNotices(ctx) {
  const { db, nowS } = ctx;
  const upTo = nowS - 2;
  const invites =
    (
      await db
        .prepare(
          `SELECT d.discord_id, d.dm, i.guild_id, i.by_name, i.at, g.name, g.tag FROM discord_links d
           JOIN guild_invites i ON i.player = d.player_id AND i.at > d.invite_seen AND i.at <= ?1 AND i.at > ?2
           JOIN guilds g ON g.id = i.guild_id
           WHERE d.dm_dead = 0 ORDER BY i.at LIMIT ?3`,
        )
        .bind(upTo, nowS - GUILD_INVITE_TTL_S, GUILD_NOTICES_A_MINUTE)
        .all()
    )?.results ?? [];
  const asks =
    (
      await db
        .prepare(
          `SELECT d.discord_id, d.dm, q.id AS rid, q.name AS asker, q.at, m.rank, g.name, g.tag, g.ranks, g.powers FROM discord_links d
           JOIN guild_members m ON m.player = d.player_id
           JOIN guild_requests q ON q.guild_id = m.guild_id AND q.at > d.invite_seen AND q.at <= ?1 AND q.at > ?2
           JOIN guilds g ON g.id = m.guild_id
           WHERE d.dm_dead = 0 ORDER BY q.at LIMIT ?3`,
        )
        .bind(upTo, nowS - GUILD_REQUEST_TTL_S, GUILD_NOTICES_A_MINUTE)
        .all()
    )?.results ?? [];
  const bound = noticeBound(upTo, [
    { rows: invites, limit: GUILD_NOTICES_A_MINUTE, at: (r) => Number(r.at) },
    { rows: asks, limit: GUILD_NOTICES_A_MINUTE, at: (r) => Number(r.at) },
  ]);
  const st = [];
  const marks = new Map();
  const mark = (/** @type {string} */ id, /** @type {number} */ at) => marks.set(id, Math.max(marks.get(id) ?? 0, at));
  for (const i of invites.filter((r) => Number(r.at) <= bound)) {
    if (Number(i.dm) & NOTICE_KINDS.guild.bit)
      st.push(
        noticeStatement(
          db,
          i.discord_id,
          'guild',
          `inv:${i.guild_id}:${i.at}`,
          {
            title: 'A guild invitation',
            lines: [`**${md(i.name, 32)} <${md(i.tag, 4)}>** invites you.`, `-# from ${md(i.by_name, 30)}`],
            open: 'guild',
            label: 'Answer',
          },
          nowS,
        ),
      );
    mark(i.discord_id, Number(i.at));
  }
  const told = new Set();
  for (const q of asks.filter((r) => Number(r.at) <= bound)) {
    mark(q.discord_id, Number(q.at));
    if (!(Number(q.dm) & NOTICE_KINDS.guild.bit)) continue;
    if (!guildMay(Number(q.rank), 'invite', guildPowersOfRow(q))) continue;
    const key = `${q.discord_id}:${q.rid}`;
    if (told.has(key)) continue;
    told.add(key);
    st.push(
      noticeStatement(
        db,
        q.discord_id,
        'guild',
        `req:${q.rid}`,
        {
          title: 'A request to join',
          lines: [`**${md(q.asker, 30)}** asks to join **${md(q.name, 32)} <${md(q.tag, 4)}>**.`],
          open: 'guild',
          label: 'Answer',
        },
        nowS,
      ),
    );
  }
  for (const [id, at] of marks)
    st.push(db.prepare('UPDATE discord_links SET invite_seen = MAX(invite_seen, ?1) WHERE discord_id = ?2').bind(at, id));
  if (st.length) await db.batch(st);
  return invites.filter((r) => Number(r.at) <= bound).length + asks.filter((r) => Number(r.at) <= bound).length;
}

export const _guildWords = GUILD_WORDS;
