// @ts-check
// Feedback: a player tells the team an idea, a balance note or anything else, from Discord or the game. Each is a card
// in the staff's channel that a staff member marks Seen, Planned, Done or Won't do; the player is told when it moves.
// A bug or an exploit is never posted to a channel: it goes to the private reports (reports.js), which only the named
// readers open, because an exploit read by one more person is one more who can use it before it is fixed.
import {
  text,
  button,
  rows,
  container,
  divider,
  update,
  body,
  modal,
  md,
  fenced,
  when,
  line,
  plural,
  STYLE,
  ACCENT,
} from './pdaUi.js';
import { frame, refusalText, refusalNote } from './pdaFrame.js';
import { accountKind, displayName, overRate } from './accounts.js';
import { sendReport, myReports } from './reports.js';
import { discordApi, botOn } from './pdaDiscordApi.js';
import { feedbackChannelOf } from './pdaTerminal.js';
import { queueNotice } from './pdaNotices.js';
import { wantsDm, discordOfPlayer } from './pdaLink.js';
import { discordModerators } from './discord.js';
import { canModerate } from './titles.js';
import { isBanned } from './sanctions.js';
import { cleanSubject, cleanBody } from '../../src/net/letterLaw.js';
import { REPORT_SUBJECT_MAX, REPORT_WORDS_MAX } from '../../src/net/reportLaw.js';

/** The kinds a player chooses from. `report` kinds go to the private reports, never to a channel. */
export const FEEDBACK_KINDS = Object.freeze({
  idea: Object.freeze({ label: 'Idea', hint: 'Something you would like to see' }),
  balance: Object.freeze({ label: 'Balance', hint: 'Too strong, too weak, too slow' }),
  bug: Object.freeze({ label: 'Bug', hint: 'Something broken. Only the developers read it', report: 'bug' }),
  exploit: Object.freeze({ label: 'Exploit or security', hint: 'A cheat or a hole. Only the developers read it', report: 'exploit' }),
  other: Object.freeze({ label: 'Other', hint: 'Anything else' }),
});
/** The staff's answers, in the order the card's buttons show them. */
export const FEEDBACK_STATUSES = Object.freeze({
  new: Object.freeze({ label: 'New', accent: ACCENT.JOURNAL }),
  seen: Object.freeze({ label: 'Seen', accent: ACCENT.STAFF }),
  planned: Object.freeze({ label: 'Planned', accent: ACCENT.GOOD }),
  done: Object.freeze({ label: 'Done', accent: ACCENT.GOOD }),
  declined: Object.freeze({ label: 'Won’t do', accent: ACCENT.QUIET }),
});
/** A title's and a note's bounds, in characters, as the table's CHECKs hold them. */
export const FEEDBACK_TITLE_MIN = 3;
export const FEEDBACK_TITLE_MAX = 80;
export const FEEDBACK_WORDS_MIN = 10;
export const FEEDBACK_WORDS_MAX = 1500;
/** Feedback an account may send in an hour. */
export const FEEDBACK_SEND_MAX = 5;
/** A player's own list's length. */
export const FEEDBACK_MINE_MAX = 10;
/** Cards one minute draws, and the refusals in a row before a card is let go. */
export const CARDS_A_MINUTE = 10;
export const CARD_TRIES_MAX = 5;
/** How long one isolate's claim on drawing a card holds. */
export const CARD_CLAIM_S = 60;
const FEEDBACK_ID_RE = /^f[0-9a-f]{20}$/;

const FEEDBACK_WORDS = Object.freeze({
  'feedback-kind': 'Choose what kind of feedback it is.',
  'feedback-title': `A title is ${FEEDBACK_TITLE_MIN} to ${FEEDBACK_TITLE_MAX} characters.`,
  'feedback-body': `Say a little more: ${FEEDBACK_WORDS_MIN} to ${FEEDBACK_WORDS_MAX} characters.`,
  'feedback-rate': 'You have sent a lot of feedback this hour. Wait a while, then send more.',
  'feedback-needs-account': 'Register your account in the game to send feedback.',
  'report-subject': `A title is 3 to ${REPORT_SUBJECT_MAX} characters.`,
  'report-body': `Say what happens and how to repeat it: 10 to ${REPORT_WORDS_MAX} characters.`,
  'report-full': 'You have many reports waiting. Wait until the developers answer some.',
  'report-rate': 'You have sent many reports this hour. Wait a while, then send more.',
  'report-rid': 'That did not send. Try again.',
  'no-feedback': 'That feedback is gone.',
  'bad-status': 'That is not an answer the staff can give.',
});
export const feedbackWords = (/** @type {string} */ e) => refusalText(e, FEEDBACK_WORDS);

/** A fresh feedback id. @param {(b: Uint8Array) => void} rand */
const feedbackId = (rand) => {
  const b = new Uint8Array(10);
  rand(b);
  return `f${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
};

/**
 * Feedback sent, as the account: an idea, a balance note or other words. Answers `{ ok, id }` or `{ error }`.
 * @param {{ db: any, nowS: number, rand: (b: Uint8Array) => void }} ctx @param {any} player
 * @param {{ kind?: unknown, title?: unknown, body?: unknown }} f
 */
export async function sendFeedback(ctx, player, { kind, title, body: words } = {}) {
  if (accountKind(player) !== 'linked') return { error: 'feedback-needs-account' };
  const k = typeof kind === 'string' ? kind : '';
  if (!Object.hasOwn(FEEDBACK_KINDS, k) || /** @type {any} */ (FEEDBACK_KINDS)[k].report) return { error: 'feedback-kind' };
  const t = cleanSubject(typeof title === 'string' ? title : '');
  if ([...t].length < FEEDBACK_TITLE_MIN || [...t].length > FEEDBACK_TITLE_MAX) return { error: 'feedback-title' };
  const b = cleanBody(typeof words === 'string' ? words : '');
  if ([...b].length < FEEDBACK_WORDS_MIN || [...b].length > FEEDBACK_WORDS_MAX) return { error: 'feedback-body' };
  if (await overRate(ctx, `feedback:${player.id}`, FEEDBACK_SEND_MAX, 3600)) return { error: 'feedback-rate' };
  const id = feedbackId(ctx.rand);
  await ctx.db
    .prepare(
      'INSERT INTO pda_feedback (id, player_id, kind, title, body, made_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    )
    .bind(id, player.id, k, t, b, ctx.nowS)
    .run();
  return { ok: true, id };
}

/** A player's own feedback, newest first. @param {{ db: any }} ctx @param {any} player */
export async function myFeedback({ db }, player) {
  const rowsOf =
    (
      await db
        .prepare(
          'SELECT id, kind, title, status, made_at, status_at FROM pda_feedback WHERE player_id = ?1 ORDER BY made_at DESC, id DESC LIMIT ?2',
        )
        .bind(player.id, FEEDBACK_MINE_MAX)
        .all()
    )?.results ?? [];
  return {
    feedback: rowsOf.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      status: r.status,
      sentAt: r.made_at,
      answeredAt: r.status_at ?? null,
    })),
  };
}

/**
 * The staff's answer: a status set, the card drawn again, and the player told when it changed. Answers `{ ok, row }`.
 * @param {{ db: any, nowS: number }} ctx @param {any} actor @param {string} id @param {string} status
 */
export async function setFeedbackStatus(ctx, actor, id, status) {
  if (!Object.hasOwn(FEEDBACK_STATUSES, status) || status === 'new') return { error: 'bad-status' };
  if (!FEEDBACK_ID_RE.test(String(id))) return { error: 'no-feedback' };
  const was = await ctx.db.prepare('SELECT * FROM pda_feedback WHERE id = ?1').bind(id).first();
  if (!was) return { error: 'no-feedback' };
  if (was.status === status) return { ok: true, row: was, same: true };
  const by = displayName(actor);
  await ctx.db
    .prepare(
      'UPDATE pda_feedback SET status = ?2, status_at = ?3, status_by = ?4, card_dirty = 1, card_tries = 0 WHERE id = ?1',
    )
    .bind(id, status, ctx.nowS, by)
    .run();
  const row = { ...was, status, status_at: ctx.nowS, status_by: by };
  const link = await discordOfPlayer(ctx.db, was.player_id);
  if (link && wantsDm(link, 'feedback')) {
    await queueNotice(
      ctx.db,
      link.discord_id,
      'feedback',
      `${id}:${status}`,
      {
        title: 'Your feedback',
        lines: [`**${md(was.title, 80)}**`, `The staff marked it **${FEEDBACK_STATUSES[/** @type {keyof typeof FEEDBACK_STATUSES} */ (status)].label}**.`],
        open: 'feedback',
      },
      ctx.nowS,
    );
  }
  return { ok: true, row };
}

/** The staff card of one piece of feedback: what was said, by whom, its status, and the four answers. @param {any} row @param {string} [from] */
export function feedbackCard(row, from = '') {
  const s = FEEDBACK_STATUSES[/** @type {keyof typeof FEEDBACK_STATUSES} */ (row.status)] ?? FEEDBACK_STATUSES.new;
  const k = FEEDBACK_KINDS[/** @type {keyof typeof FEEDBACK_KINDS} */ (row.kind)]?.label ?? 'Feedback';
  const answered =
    row.status === 'new'
      ? '**Status:** New'
      : `**Status:** ${s.label} · by ${md(row.status_by || '?', 40)} ${when(row.status_at, 'R')}`;
  return [
    container(
      [
        text(`### ❦ Feedback · ${k}\n**${md(row.title, 80)}**`),
        text(fenced(row.body, 1500)),
        text(`-# from ${md(from || '?', 40)} (\`${row.player_id}\`) · ${when(row.made_at, 'f')}`),
        divider(),
        text(answered),
        ...rows(
          Object.entries(FEEDBACK_STATUSES)
            .filter(([key]) => key !== 'new')
            .map(([key, v]) =>
              button(v.label, `fbk:${key}:${row.id}`, {
                style: key === 'declined' ? STYLE.SECONDARY : key === 'seen' ? STYLE.PRIMARY : STYLE.SUCCESS,
                disabled: key === row.status,
              }),
            ),
        ),
      ],
      s.accent,
    ),
  ];
}

/** The name a card shows for the player who sent it. */
async function senderName(db, playerId) {
  const p = await db.prepare('SELECT handle, guest_name FROM players WHERE id = ?1').bind(playerId).first();
  return p ? displayName(p) : '';
}

/**
 * Cards posted or drawn again: the rows of `table` whose card is due, each claimed so two isolates never post one card
 * twice, then posted (a new one, Discord holding its id as the nonce) or edited. A card whose message was deleted is
 * posted anew. `edits` waits `throttleS` between two edits of one card. Answers the cards drawn.
 * @param {{ db: any, nowS: number }} ctx @param {any} env @param {any} fetchFn
 * @param {{ table: 'pda_feedback'|'pda_polls', channel: (row: any) => Promise<string|null>, card: (row: any) => Promise<any[]>, throttleS?: number, only?: string, limit?: number }} o
 */
export async function drawCards(ctx, env, fetchFn, { table, channel, card, throttleS = 0, only, limit = CARDS_A_MINUTE }) {
  if (!botOn(env)) return 0;
  const { db, nowS } = ctx;
  const due = `(card_dirty = 1 OR (card_dirty = 2 AND card_claim_at < ?1)) AND card_tries < ?2 AND (card_id IS NULL OR card_drawn_at <= ?3)`;
  const found =
    (
      await db
        .prepare(`SELECT * FROM ${table} WHERE ${due} ${only ? 'AND id = ?5' : ''} ORDER BY made_at LIMIT ?4`)
        .bind(nowS - CARD_CLAIM_S, CARD_TRIES_MAX, nowS - throttleS, limit, ...(only ? [only] : []))
        .all()
    )?.results ?? [];
  let drawn = 0;
  for (const row of found) {
    const claimed = await db
      .prepare(`UPDATE ${table} SET card_dirty = 2, card_claim_at = ?4 WHERE id = ?5 AND ${due}`)
      .bind(nowS - CARD_CLAIM_S, CARD_TRIES_MAX, nowS - throttleS, nowS, row.id)
      .run();
    if (!claimed?.meta?.changes) continue;
    const components = await card(row);
    let ch = row.card_channel && row.card_id ? String(row.card_channel) : await channel(row);
    let r = null;
    if (ch && row.card_id) {
      r = await discordApi(env, fetchFn, 'PATCH', `/channels/${ch}/messages/${row.card_id}`, body(components));
      if (!r.ok && r.status === 404) {
        r = null;
        ch = await channel(row);
      }
    }
    if (ch && !r) {
      r = await discordApi(env, fetchFn, 'POST', `/channels/${ch}/messages`, {
        ...body(components),
        nonce: String(row.id).slice(0, 25),
        enforce_nonce: true,
      });
      if (r.ok) row.card_id = String(r.json?.id ?? '') || null;
    }
    if (r?.ok) {
      drawn++;
      await db
        .prepare(
          `UPDATE ${table} SET card_dirty = CASE WHEN card_dirty = 2 THEN 0 ELSE card_dirty END, card_channel = ?3, card_id = ?4, card_drawn_at = ?2, card_tries = 0 WHERE id = ?1`,
        )
        .bind(row.id, nowS, ch, row.card_id)
        .run();
    } else {
      // Discord down, or no channel yet: try again next minute. Refused outright: counted toward letting it go.
      const forGood = r && !r.ok && !r.down;
      await db
        .prepare(`UPDATE ${table} SET card_dirty = 1, card_tries = card_tries + ?2 WHERE id = ?1 AND card_dirty = 2`)
        .bind(row.id, forGood ? 1 : 0)
        .run();
    }
  }
  return drawn;
}

/** The feedback cards due, drawn. @param {{ db: any, nowS: number }} ctx @param {any} env @param {any} fetchFn @param {string} [only] */
export const drawFeedbackCards = (ctx, env, fetchFn, only) =>
  drawCards(ctx, env, fetchFn, {
    table: 'pda_feedback',
    channel: async () => feedbackChannelOf(env),
    card: async (row) => feedbackCard(row, await senderName(ctx.db, row.player_id)),
    only,
  });

/**
 * The account a staff press acts as: the PDA's linked account when it is staff, else the handle DISCORD_MODERATORS pairs
 * with this Discord user. Null for anyone else, or a banned account.
 * @param {any} who
 */
export async function staffActorOf(who) {
  if (who.staff && who.player && !who.barred) return who.player;
  const handle = discordModerators(who.env).get(who.discordId);
  if (!handle) return null;
  const row = await who.ctx.db.prepare('SELECT * FROM players WHERE handle_lc = ?1').bind(handle).first();
  return row && canModerate(row, who.env) && !isBanned(row, who.ctx.nowS) ? row : null;
}

/** The form feedback is written in. */
const FEEDBACK_FORM = modal('pdam:feedback:send', 'Send feedback', [
  {
    id: 'kind',
    label: 'What kind?',
    options: Object.entries(FEEDBACK_KINDS).map(([value, k]) => ({ label: k.label, value, description: k.hint })),
  },
  { id: 'title', label: 'Title', min: FEEDBACK_TITLE_MIN, max: FEEDBACK_TITLE_MAX },
  {
    id: 'words',
    label: 'Your feedback',
    hint: 'For a bug, say what happens and how to repeat it.',
    long: true,
    min: FEEDBACK_WORDS_MIN,
    max: FEEDBACK_WORDS_MAX,
  },
]);

const REPORT_STATE_WORDS = Object.freeze({ open: 'Open', fixed: 'Fixed', wontfix: 'Won’t fix', duplicate: 'Already known' });

/** The player's feedback screen: their own feedback and private reports, and the form. @param {any} who @param {string} [said] */
async function feedbackScreen(who, said = '') {
  const mine = await myFeedback(who.ctx, who.player);
  const reports = (await myReports(who.ctx, who.player)).reports.slice(0, 5);
  const fLines = mine.feedback.map(
    (/** @type {any} */ f) =>
      `${f.status === 'new' ? '○' : '●'} **${md(f.title, 60)}** · ${FEEDBACK_KINDS[/** @type {keyof typeof FEEDBACK_KINDS} */ (f.kind)]?.label ?? ''} · ${FEEDBACK_STATUSES[/** @type {keyof typeof FEEDBACK_STATUSES} */ (f.status)]?.label ?? f.status}${f.answeredAt ? ` ${when(f.answeredAt, 'R')}` : ''}`,
  );
  const rLines = reports.map(
    (/** @type {any} */ r) =>
      `${r.read ? '●' : '○'} **${md(r.subject, 60)}** · ${r.kind === 'bug' ? 'Bug' : r.kind === 'security' ? 'Security' : 'Exploit'} · ${REPORT_STATE_WORDS[/** @type {keyof typeof REPORT_STATE_WORDS} */ (r.state)] ?? r.state}${r.read ? '' : ' · not read yet'}`,
  );
  return frame(
    who,
    'feedback',
    [
      ...(said ? [text(said), divider()] : []),
      text('Tell the team what you think. Bugs and exploits go to the developers alone, never to a channel.'),
      divider(),
      text(`**Your feedback**\n${fLines.length ? fLines.join('\n') : '-# Nothing sent yet.'}`),
      ...(rLines.length ? [text(`**Your private reports**\n${rLines.join('\n')}`)] : []),
    ],
    { actions: [button('Send feedback', 'pda:feedback:write', { style: STYLE.PRIMARY })] },
  );
}

export const feedbackPda = {
  key: 'feedback',
  heads: ['fbk'],
  /** @param {any} who */
  screen: async (who) => feedbackScreen(who),
  acts: {
    write: async () => FEEDBACK_FORM,
  },
  forms: {
    /** Feedback sent: a report for a bug or an exploit, else a card for the staff. @param {any} who @param {Record<string, string>} values */
    async send(who, values) {
      const kind = /** @type {any} */ (FEEDBACK_KINDS)[values.kind];
      if (!kind) return feedbackScreen(who, feedbackWords('feedback-kind'));
      if (kind.report) {
        const rid = String(who.body?.id ?? '').replace(/[^\w-]/g, '').slice(0, 40);
        const r = await sendReport(who.ctx, who.player, {
          kind: kind.report,
          subject: values.title,
          body: values.words,
          rid: rid.length >= 8 ? rid : `pda${who.ctx.nowS}`,
        });
        if ('error' in r) return feedbackScreen(who, feedbackWords(r.error));
        return feedbackScreen(who, 'Sent to the developers alone. You will see here when they answer it.');
      }
      const r = await sendFeedback(who.ctx, who.player, { kind: values.kind, title: values.title, body: values.words });
      if ('error' in r) return feedbackScreen(who, feedbackWords(r.error));
      who.io?.later?.(drawFeedbackCards(who.ctx, who.env, who.io.fetchFn, r.id));
      return feedbackScreen(who, 'Thank you. The staff will see it, and you will hear when they answer.');
    },
  },
  /** A staff answer pressed on a card in the staff's channel: the card drawn again in place. @param {any} who @param {string[]} parts */
  /** A press on the staff's card redraws that card. */
  pressUpdates: true,
  async press(who, parts) {
    const [, status, id] = parts;
    const actor = await staffActorOf(who);
    if (!actor) return refusalNote(refusalText('not-staff'));
    const r = await setFeedbackStatus(who.ctx, actor, id, status);
    if ('error' in r) return refusalNote(feedbackWords(r.error));
    await who.ctx.db
      .prepare('UPDATE pda_feedback SET card_dirty = 0, card_drawn_at = ?2 WHERE id = ?1 AND card_dirty = 1')
      .bind(id, who.ctx.nowS)
      .run();
    return update(feedbackCard(r.row, await senderName(who.ctx.db, r.row.player_id)));
  },
  /** News on the player's own feedback in the last week. @param {any} who */
  async glance(who) {
    const n = await who.ctx.db
      .prepare(
        "SELECT COUNT(*) AS n FROM pda_feedback WHERE player_id = ?1 AND status != 'new' AND status_at > ?2",
      )
      .bind(who.player.id, who.ctx.nowS - 7 * 86400)
      .first();
    const k = Number(n?.n) || 0;
    return k ? `◇ **Feedback:** the staff answered ${plural(k, 'piece')} this week` : null;
  },
  /** The staff cards due. @param {any} ctx @param {any} env @param {any} fetchFn */
  minute: (ctx, env, fetchFn) => drawFeedbackCards(ctx, env, fetchFn),
  routes: {
    '/v1/feedback/send': {
      method: 'POST',
      /** @param {any} ctx @param {any} _env @param {any} player @param {any} b */
      async handle(ctx, _env, player, b) {
        const r = await sendFeedback(ctx, player, { kind: b?.kind, title: b?.title, body: b?.body });
        if ('error' in r)
          return {
            status: r.error === 'feedback-needs-account' ? 403 : r.error === 'feedback-rate' ? 429 : 400,
            json: { error: r.error },
          };
        return { status: 200, json: r };
      },
    },
    '/v1/feedback/mine': {
      method: 'POST',
      /** @param {any} ctx @param {any} _env @param {any} player */
      async handle(ctx, _env, player) {
        if (accountKind(player) !== 'linked') return { status: 403, json: { error: 'feedback-needs-account' } };
        return { status: 200, json: await myFeedback(ctx, player) };
      },
    },
  },
};

/** The staff desk's queue of feedback not yet planned, done or declined, newest first. @param {any} db */
export async function feedbackQueue(db, limit = 10) {
  return (
    (
      await db
        .prepare(
          `SELECT f.*, p.handle, p.guest_name FROM pda_feedback f JOIN players p ON p.id = f.player_id
           WHERE f.status IN ('new', 'seen') ORDER BY f.status = 'new' DESC, f.made_at DESC LIMIT ?1`,
        )
        .bind(limit)
        .all()
    )?.results ?? []
  );
}
/** One piece of feedback with its sender's name. @param {any} db @param {string} id */
export async function feedbackOf(db, id) {
  if (!FEEDBACK_ID_RE.test(String(id))) return null;
  return db
    .prepare('SELECT f.*, p.handle, p.guest_name FROM pda_feedback f JOIN players p ON p.id = f.player_id WHERE f.id = ?1')
    .bind(id)
    .first();
}
/** A queue line's label for a menu. @param {any} f */
export const feedbackOption = (f) => ({
  label: f.title,
  value: f.id,
  description: `${FEEDBACK_KINDS[/** @type {keyof typeof FEEDBACK_KINDS} */ (f.kind)]?.label ?? ''} · ${FEEDBACK_STATUSES[/** @type {keyof typeof FEEDBACK_STATUSES} */ (f.status)]?.label ?? ''} · ${line(displayName(f), 30)}`,
});
