// @ts-check
// Mail: the player's letters and the developers' post, read, written, answered and thrown away from Discord. Every act
// is letters.js's or post.js's own, as the linked account, so the game's rules hold here unchanged: registered at both
// ends, the rates, the inbox's bound, a blocked sender's letter never arriving. An item in the post is claimed in the
// game, since a claim writes the character's save.
import { text, select, button, STYLE, md, when, fenced, plural, divider, ACCENT, modal, line } from './pdaUi.js';
import { frame, refusalText } from './pdaFrame.js';
import { inboxOf, readLetter, deleteLetter, sendLetter } from './letters.js';
import { postBoxOf, readPost, deletePost } from './post.js';
import { LETTER_SUBJECT_MAX, LETTER_BODY_MAX, LETTER_ID_RE } from '../../src/net/letterLaw.js';
import { POST_ID_RE } from '../../src/net/postLaw.js';
import { ID_RE } from '../../src/net/identityToken.js';
import { NOTICE_KINDS } from './pdaLink.js';
import { noticeStatement, noticeBound, NOTICE_SETTLE_S } from './pdaNotices.js';

/** Letters a page shows. */
export const MAIL_PAGE = 8;
/** Letters the clock tells of in one minute, all users together. */
export const MAIL_NOTICES_A_MINUTE = 50;

const MAIL_WORDS = Object.freeze({
  'no-subject': 'A letter needs a subject.',
  'subject-long': `A subject is at most ${LETTER_SUBJECT_MAX} characters.`,
  'no-body': 'A letter needs some words.',
  'body-long': `A letter is at most ${LETTER_BODY_MAX} characters.`,
  'body-lines': 'A letter is at most 40 lines.',
  'no-reader': 'Nobody has that name.',
  'reader-guest': 'That player has no mailbox yet. Guests cannot get letters.',
  'to-self': 'You cannot write to yourself.',
  'mail-rate': 'You have sent many letters. Wait a while before the next.',
  'inbox-full': 'Their mailbox is full.',
  'no-letter': 'That letter is gone.',
  'no-post': 'That piece is gone.',
  'post-unclaimed': 'Claim its item in the game before you throw it away.',
  muted: 'You are muted and cannot send letters now.',
});
const say = (/** @type {string} */ e) => refusalText(e, MAIL_WORDS);

/** A sender's badge, as the letter's head carries it. */
const badge = (/** @type {any} */ l) => (l.title ? ` · ${md(l.title, 40)}` : '');

/** The inbox, a page. @param {any} who @param {number} page @param {string} [said] */
async function inboxScreen(who, page = 0, said = '') {
  const box = await inboxOf(who.ctx, who.player, who.env);
  const pages = Math.max(1, Math.ceil(box.letters.length / MAIL_PAGE));
  const p = Math.min(Math.max(0, page | 0), pages - 1);
  const shown = box.letters.slice(p * MAIL_PAGE, (p + 1) * MAIL_PAGE);
  const lines = shown.map(
    (/** @type {any} */ l) =>
      `${l.read ? '○' : '●'} **${md(l.subject, 60)}**\n-# from ${md(l.from, 40)}${badge(l)} · ${when(l.sentAt, 'R')}`,
  );
  const parts = [
    ...(said ? [text(said), divider()] : []),
    text(
      `**Letters:** ${plural(box.letters.length, 'letter')}, ${num0(box.unread)} unread · room for ${box.max}${pages > 1 ? ` · page ${p + 1} of ${pages}` : ''}`,
    ),
    ...(shown.length ? [text(lines.join('\n'))] : [text('-# Your mailbox is empty.')]),
    ...(shown.length
      ? [
          select(
            'pda:mail:open',
            shown.map((/** @type {any} */ l) => ({
              label: l.subject,
              value: l.id,
              description: `from ${line(l.from, 40)}${l.read ? '' : ' · new'}`,
            })),
            { placeholder: 'Open a letter…' },
          ),
        ]
      : []),
  ];
  return frame(who, 'mail', parts, {
    actions: [
      button('Write', 'pda:mail:write', { style: STYLE.PRIMARY }),
      button('Developers’ post', 'pda:mail:post'),
      ...(p > 0 ? [button('Newer', `pda:mail:page:${p - 1}`)] : []),
      ...(p < pages - 1 ? [button('Older', `pda:mail:page:${p + 1}`)] : []),
    ],
  });
}
const num0 = (/** @type {number} */ n) => String(Math.max(0, n | 0));

/** One letter, opened. @param {any} who @param {string} id */
async function letterScreen(who, id) {
  const r = await readLetter(who.ctx, who.player, who.env, id);
  if ('error' in r) return inboxScreen(who, 0, say(r.error));
  const l = r.letter;
  return frame(
    who,
    'mail',
    [
      text(`## ${md(l.subject, 60)}\n-# from **${md(l.from, 40)}**${badge(l)} · ${when(l.sentAt, 'f')}`),
      text(fenced(l.body, 1600)),
    ],
    {
      title: 'Letter',
      actions: [
        button('Reply', `pda:mail:reply:${l.id}`, { style: STYLE.PRIMARY }),
        button('Delete', `pda:mail:del:${l.id}`, { style: STYLE.DANGER }),
        button('Back', 'pda:mail'),
      ],
    },
  );
}

/** The developers' post. @param {any} who @param {string} [said] */
async function postScreen(who, said = '') {
  const box = await postBoxOf(who.ctx, who.player, who.env);
  const shown = box.post.slice(0, 10);
  const lines = shown.map(
    (/** @type {any} */ p) =>
      `${p.read ? '○' : '●'} **${md(p.subject, 60)}**${p.item ? ` · holds ${md(p.item.name, 40)}${p.claimed ? ' (claimed)' : ''}` : ''}\n-# ${md(p.from, 40)} · ${when(p.sentAt, 'R')}`,
  );
  return frame(
    who,
    'mail',
    [
      ...(said ? [text(said), divider()] : []),
      text(
        `**Developers’ post:** ${plural(box.post.length, 'piece')}, ${num0(box.unread)} unread${box.unclaimed ? `, ${plural(box.unclaimed, 'item')} to claim in the game` : ''}`,
      ),
      text(lines.length ? lines.join('\n') : '-# Nothing from the developers.'),
      ...(shown.length
        ? [
            select(
              'pda:mail:piece',
              shown.map((/** @type {any} */ p) => ({ label: p.subject, value: p.id, description: line(p.from, 40) })),
              { placeholder: 'Open a piece…' },
            ),
          ]
        : []),
    ],
    { title: 'Developers’ post', actions: [button('Letters', 'pda:mail')] },
  );
}

/** One piece of the post, opened. @param {any} who @param {string} id */
async function pieceScreen(who, id) {
  const r = await readPost(who.ctx, who.player, id);
  if ('error' in r) return postScreen(who, say(r.error));
  const p = r.post;
  const holds = p.item
    ? p.claimed
      ? `It held **${md(p.item.name, 40)}**, which you claimed.`
      : `It holds **${md(p.item.name, 40)}**. Claim it in the game, from the mailbox by the hourglass.`
    : '';
  return frame(
    who,
    'mail',
    [
      text(`## ${md(p.subject, 60)}\n-# from **${md(p.from, 40)}** · ${when(p.sentAt, 'f')}`),
      text(fenced(p.body, 1400)),
      ...(holds ? [text(holds)] : []),
    ],
    {
      title: 'Developers’ post',
      actions: [
        ...(!p.item || p.claimed ? [button('Delete', `pda:mail:pdel:${p.id}`, { style: STYLE.DANGER })] : []),
        button('Back', 'pda:mail:post'),
      ],
    },
  );
}

/** The form a letter is written in. `toAccount` is set when answering, so the name need not be typed. */
function writeForm(/** @type {string|null} */ toAccount, /** @type {string} */ toName = '', subject = '') {
  return modal(`pdam:mail:send${toAccount ? `:${toAccount}` : ''}`, toName ? `To ${toName}` : 'Write a letter', [
    ...(toAccount ? [] : [{ id: 'to', label: 'To', hint: 'Their username in the game', max: 32 }]),
    { id: 'subject', label: 'Subject', max: LETTER_SUBJECT_MAX, value: subject },
    { id: 'body', label: 'Letter', long: true, max: LETTER_BODY_MAX },
  ]);
}

export const mailPda = {
  key: 'mail',
  /** @param {any} who */
  screen: async (who) => inboxScreen(who, 0),
  acts: {
    /** @param {any} who @param {string[]} args */
    page: async (who, args) => inboxScreen(who, Number(args[0]) || 0),
    /** @param {any} who @param {string[]} args @param {string[]} values */
    open: async (who, args, values) => letterScreen(who, String(values[0] ?? args[0] ?? '')),
    /** @param {any} who @param {string[]} args */
    async del(who, args) {
      const r = await deleteLetter(who.ctx, who.player, args[0]);
      return inboxScreen(who, 0, 'error' in r ? say(r.error) : 'Deleted.');
    },
    /** @param {any} who @param {string[]} args */
    write: async (_who, args) => writeForm(ID_RE.test(String(args[0] ?? '')) ? args[0] : null),
    /** An answer to a letter: its sender by account, its subject carried. @param {any} who @param {string[]} args */
    async reply(who, args) {
      const id = String(args[0] ?? '');
      if (!LETTER_ID_RE.test(id)) return inboxScreen(who, 0, say('no-letter'));
      const l = await who.ctx.db
        .prepare('SELECT from_id, from_name, subject FROM letters WHERE id = ?1 AND to_id = ?2')
        .bind(id, who.player.id)
        .first();
      if (!l || !ID_RE.test(String(l.from_id))) return inboxScreen(who, 0, say('no-letter'));
      const re = String(l.subject).startsWith('Re: ') ? l.subject : `Re: ${l.subject}`;
      return writeForm(l.from_id, line(l.from_name, 30), re.slice(0, LETTER_SUBJECT_MAX));
    },
    /** @param {any} who */
    post: async (who) => postScreen(who),
    /** @param {any} who @param {string[]} args @param {string[]} values */
    piece: async (who, args, values) => pieceScreen(who, String(values[0] ?? args[0] ?? '')),
    /** @param {any} who @param {string[]} args */
    async pdel(who, args) {
      if (!POST_ID_RE.test(String(args[0] ?? ''))) return postScreen(who, say('no-post'));
      const r = await deletePost(who.ctx, who.player, args[0]);
      return postScreen(who, 'error' in r ? say(r.error === 'post-unclaimed' ? r.error : r.error) : 'Deleted.');
    },
  },
  forms: {
    /** A letter sent. @param {any} who @param {Record<string, string>} values @param {string[]} args */
    async send(who, values, args) {
      const toAccount = ID_RE.test(String(args[0] ?? '')) ? args[0] : undefined;
      const r = await sendLetter(who.ctx, who.player, {
        to: toAccount ? undefined : values.to,
        toAccount,
        subject: values.subject,
        body: values.body,
      });
      if ('error' in r) return inboxScreen(who, 0, say(r.error));
      return inboxScreen(who, 0, `Sent to **${md(r.to, 40)}**.`);
    },
  },
  /** @param {any} who */
  async glance(who) {
    const n = await who.ctx.db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM letters WHERE to_id = ?1 AND read_at IS NULL) AS letters, (SELECT COUNT(*) FROM server_post WHERE to_id = ?1 AND read_at IS NULL) AS post',
      )
      .bind(who.player.id)
      .first();
    const l = Number(n?.letters) || 0;
    const p = Number(n?.post) || 0;
    if (!l && !p) return '✉ **Mail:** nothing new';
    return `✉ **Mail:** ${[l ? `${plural(l, 'new letter')}` : '', p ? `${plural(p, 'new piece')} of post` : ''].filter(Boolean).join(', ')}`;
  },
};

/**
 * The clock's news of mail: each letter and piece of post that came since a link's marks, into the outbox, and the
 * marks moved on. Links that want neither kind have their marks moved too, so turning one on later sends nothing old.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function mailNotices(ctx) {
  const { db, nowS } = ctx;
  const upTo = nowS - NOTICE_SETTLE_S;
  const letters =
    (
      await db
        .prepare(
          `SELECT d.discord_id, d.dm, l.id, l.from_name, l.subject, l.sent_at FROM discord_links d
           JOIN letters l ON l.to_id = d.player_id AND l.sent_at > d.mail_seen AND l.sent_at <= ?2 AND l.read_at IS NULL
           WHERE d.dm_dead = 0 ORDER BY l.sent_at LIMIT ?1`,
        )
        .bind(MAIL_NOTICES_A_MINUTE, upTo)
        .all()
    )?.results ?? [];
  const pieces =
    (
      await db
        .prepare(
          `SELECT d.discord_id, d.dm, p.id, p.sender, p.subject, p.item, p.sent_at FROM discord_links d
           JOIN server_post p ON p.to_id = d.player_id AND p.sent_at > d.post_seen AND p.sent_at <= ?2 AND p.read_at IS NULL
           WHERE d.dm_dead = 0 ORDER BY p.sent_at LIMIT ?1`,
        )
        .bind(MAIL_NOTICES_A_MINUTE, upTo)
        .all()
    )?.results ?? [];
  // letters and post keep marks of their own, so each is bounded by its own page
  const lettersTo = noticeBound(upTo, [{ rows: letters, limit: MAIL_NOTICES_A_MINUTE, at: (r) => Number(r.sent_at) }]);
  const postTo = noticeBound(upTo, [{ rows: pieces, limit: MAIL_NOTICES_A_MINUTE, at: (r) => Number(r.sent_at) }]);
  const st = [];
  const marks = new Map();
  const toldLetters = letters.filter((r) => Number(r.sent_at) <= lettersTo);
  const toldPieces = pieces.filter((r) => Number(r.sent_at) <= postTo);
  for (const l of toldLetters) {
    if (Number(l.dm) & NOTICE_KINDS.mail.bit)
      st.push(
        noticeStatement(db, l.discord_id, 'mail', l.id, {
          title: 'A letter',
          lines: [`**${md(l.subject, 60)}**`, `-# from ${md(l.from_name, 40)}`],
          open: 'mail',
          label: 'Read it',
        }, nowS),
      );
    marks.set(`m${l.discord_id}`, Math.max(marks.get(`m${l.discord_id}`) ?? 0, Number(l.sent_at)));
  }
  for (const p of toldPieces) {
    if (Number(p.dm) & NOTICE_KINDS.post.bit)
      st.push(
        noticeStatement(db, p.discord_id, 'post', p.id, {
          title: 'Post from the developers',
          lines: [`**${md(p.subject, 60)}**`, ...(p.item ? ['-# It holds an item. Claim it in the game.'] : [])],
          open: 'mail',
          label: 'Open your journal',
        }, nowS),
      );
    marks.set(`p${p.discord_id}`, Math.max(marks.get(`p${p.discord_id}`) ?? 0, Number(p.sent_at)));
  }
  for (const [k, at] of marks) {
    const col = k[0] === 'm' ? 'mail_seen' : 'post_seen';
    st.push(db.prepare(`UPDATE discord_links SET ${col} = MAX(${col}, ?1) WHERE discord_id = ?2`).bind(at, k.slice(1)));
  }
  if (st.length) await db.batch(st);
  return toldLetters.length + toldPieces.length;
}

export const _mailWords = MAIL_WORDS;
export { ACCENT };
