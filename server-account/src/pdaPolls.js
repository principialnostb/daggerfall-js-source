// @ts-check
// Polls: the developers ask, players answer. A poll is a public card in the Terminal's channel (or DISCORD_POLL_CHANNEL)
// with a button an option, voted from Discord or from the game. One vote an account, changed freely until it closes;
// a Discord user's vote is their linked account's, so a second Discord account is no second vote. The minute closes
// what is due, posts and redraws cards, and tells linked players who want it that a poll opened.
import {
  text,
  section,
  select,
  button,
  container,
  divider,
  reply,
  md,
  when,
  num,
  plural,
  line,
  STYLE,
  ACCENT,
} from './pdaUi.js';
import { frame, refusalText, refusalNote } from './pdaFrame.js';
import { accountKind, displayName } from './accounts.js';
import { isBanned } from './sanctions.js';
import { isDeveloper } from './titles.js';
import { pollChannelOf } from './pdaTerminal.js';
import { noticeStatement } from './pdaNotices.js';
import { NOTICE_KINDS } from './pdaLink.js';
import { drawCards } from './pdaFeedback.js';

/** A poll's bounds. */
export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 10;
export const POLL_QUESTION_MIN = 3;
export const POLL_QUESTION_MAX = 200;
export const POLL_OPTION_MAX = 80;
export const POLL_HOURS_MIN = 1;
export const POLL_HOURS_MAX = 336;
/** Who may vote: any registered account, or one with an online character. */
export const POLL_ELIGIBLE = Object.freeze({
  linked: 'Any registered player',
  played: 'Players with an online character',
});
/** A card is edited at most this often, however fast the votes come; the clock catches the rest up. */
export const POLL_REDRAW_S = 30;
/** Players told of a new poll in one minute. The outbox sends them at its own pace. */
export const POLL_ANNOUNCE_A_MINUTE = 60;
/** Votes are kept this long after a poll closes; its counts are kept for good. */
export const POLL_VOTES_KEEP_S = 90 * 24 * 3600;
/** Closed polls a screen shows, from the last fortnight. */
export const POLL_RECENT = 3;
export const POLL_RECENT_S = 14 * 24 * 3600;
const POLL_ID_RE = /^p[0-9a-f]{16}$/;
const LETTERS = 'ABCDEFGHIJ';
const BAR = 12;

const POLL_WORDS = Object.freeze({
  'poll-question': `A question is ${POLL_QUESTION_MIN} to ${POLL_QUESTION_MAX} characters.`,
  'poll-options': `Give ${POLL_OPTIONS_MIN} to ${POLL_OPTIONS_MAX} different options, one a line, each at most ${POLL_OPTION_MAX} characters.`,
  'poll-hours': `A poll runs ${POLL_HOURS_MIN} to ${POLL_HOURS_MAX} hours.`,
  'poll-eligible': 'Choose who may vote.',
  'not-developer': 'Only an Admin can open or close a poll.',
  'no-poll': 'That poll is gone.',
  'poll-closed': 'That poll has closed.',
  'poll-choice': 'That is not one of the options.',
  'poll-played': 'This poll is for players with an online character.',
  'polls-need-account': 'Register your account in the game to vote.',
});
export const pollWords = (/** @type {string} */ e) => refusalText(e, POLL_WORDS);

/** A poll's options, read from its row. @param {any} row @returns {string[]} */
export const optionsOf = (row) => {
  try {
    const o = JSON.parse(row?.options ?? '[]');
    return Array.isArray(o) ? o.map(String) : [];
  } catch {
    return [];
  }
};
/** A closed poll's kept counts. @param {any} row @returns {number[] | null} */
const talliesOf = (row) => {
  try {
    const t = row?.tallies ? JSON.parse(row.tallies) : null;
    return Array.isArray(t) ? t.map((n) => Number(n) || 0) : null;
  } catch {
    return null;
  }
};
/** Whether a poll takes votes now. @param {any} row @param {number} nowS */
export const pollOpen = (row, nowS) => row && row.closed_at == null && Number(row.closes_at) > nowS;

/**
 * A poll's words, checked: the question, the options (one a line, blank lines dropped), its hours, who may vote.
 * @param {{ question?: unknown, options?: unknown, hours?: unknown, eligible?: unknown }} w
 */
export function pollWordsOf({ question, options, hours, eligible } = {}) {
  const q = line(question, 1000);
  if ([...q].length < POLL_QUESTION_MIN || [...q].length > POLL_QUESTION_MAX) return { error: 'poll-question' };
  const list = (Array.isArray(options) ? options.map(String) : String(options ?? '').split(/\r?\n/))
    .map((o) => line(o, 1000))
    .filter(Boolean);
  if (
    list.length < POLL_OPTIONS_MIN ||
    list.length > POLL_OPTIONS_MAX ||
    list.some((o) => [...o].length > POLL_OPTION_MAX) ||
    new Set(list.map((o) => o.toLowerCase())).size !== list.length
  )
    return { error: 'poll-options' };
  const h = Number(String(hours ?? '').trim());
  if (!Number.isInteger(h) || h < POLL_HOURS_MIN || h > POLL_HOURS_MAX) return { error: 'poll-hours' };
  const e = typeof eligible === 'string' && eligible ? eligible : 'linked';
  if (!Object.hasOwn(POLL_ELIGIBLE, e)) return { error: 'poll-eligible' };
  return { question: q, options: list, hours: h, eligible: e };
}

/**
 * A poll opened by an Admin. Its card and its news follow on the minute. Answers `{ ok, id, closesAt }` or `{ error }`.
 * @param {{ db: any, nowS: number, rand: (b: Uint8Array) => void }} ctx @param {any} actor @param {any} env @param {any} words
 */
export async function createPoll(ctx, actor, env, words) {
  if (!isDeveloper(actor, env)) return { error: 'not-developer' };
  const w = pollWordsOf(words);
  if ('error' in w) return w;
  const b = new Uint8Array(8);
  ctx.rand(b);
  const id = `p${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  const closesAt = ctx.nowS + w.hours * 3600;
  await ctx.db
    .prepare(
      `INSERT INTO pda_polls (id, question, options, made_by, made_by_name, made_at, closes_at, eligible)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(id, w.question, JSON.stringify(w.options), actor.id, displayName(actor), ctx.nowS, closesAt, w.eligible)
    .run();
  return { ok: true, id, closesAt };
}

/** A poll's counts now: its kept ones once closed, else its votes counted. @param {any} db @param {any} row */
export async function countsOf(db, row) {
  const n = optionsOf(row).length;
  const kept = row.closed_at != null ? talliesOf(row) : null;
  if (kept) return Array.from({ length: n }, (_, i) => kept[i] ?? 0);
  const out = new Array(n).fill(0);
  const got =
    (
      await db
        .prepare('SELECT choice, COUNT(*) AS n FROM pda_poll_votes WHERE poll_id = ?1 GROUP BY choice')
        .bind(row.id)
        .all()
    )?.results ?? [];
  for (const g of got) if (g.choice >= 0 && g.choice < n) out[g.choice] = Number(g.n) || 0;
  return out;
}

/** A poll by id. @param {any} db @param {unknown} id */
export async function pollOf(db, id) {
  if (!POLL_ID_RE.test(String(id ?? ''))) return null;
  return db.prepare('SELECT * FROM pda_polls WHERE id = ?1').bind(id).first();
}

/** Whether an account may vote in a poll; null when it may, else the refusal. */
async function voteRefusal(db, player, row, nowS) {
  if (!player || accountKind(player) !== 'linked') return 'polls-need-account';
  if (isBanned(player, nowS)) return 'banned';
  if (!row) return 'no-poll';
  if (!pollOpen(row, nowS)) return 'poll-closed';
  if (row.eligible === 'played') {
    const has = await db
      .prepare('SELECT 1 AS y FROM realm_characters WHERE player = ?1 AND dead_at IS NULL LIMIT 1')
      .bind(player.id)
      .first();
    if (!has) return 'poll-played';
  }
  return null;
}

/**
 * A vote, the account's: a new one, or one changed. The card is marked to be drawn again.
 * Answers `{ ok, choice, label, same, closesAt }` or `{ error }`.
 * @param {{ db: any, nowS: number }} ctx @param {any} player @param {unknown} pollId @param {unknown} choice
 */
export async function votePoll(ctx, player, pollId, choice) {
  const row = await pollOf(ctx.db, pollId);
  const refused = await voteRefusal(ctx.db, player, row, ctx.nowS);
  if (refused) return { error: refused };
  const opts = optionsOf(row);
  const c = Number(choice);
  if (!Number.isInteger(c) || c < 0 || c >= opts.length) return { error: 'poll-choice' };
  const had = await ctx.db
    .prepare('SELECT choice FROM pda_poll_votes WHERE poll_id = ?1 AND player_id = ?2')
    .bind(row.id, player.id)
    .first();
  if (had && Number(had.choice) === c) return { ok: true, choice: c, label: opts[c], same: true, closesAt: row.closes_at };
  // The vote lands only while the poll is open, in the statement that writes it.
  const r = await ctx.db
    .prepare(
      `INSERT INTO pda_poll_votes (poll_id, player_id, choice, at) SELECT ?1, ?2, ?3, ?4
       WHERE EXISTS (SELECT 1 FROM pda_polls WHERE id = ?1 AND closed_at IS NULL AND closes_at > ?4)
       ON CONFLICT (poll_id, player_id) DO UPDATE SET choice = excluded.choice, at = excluded.at`,
    )
    .bind(row.id, player.id, c, ctx.nowS)
    .run();
  if (!r?.meta?.changes) return { error: 'poll-closed' };
  await ctx.db.prepare('UPDATE pda_polls SET card_dirty = 1 WHERE id = ?1').bind(row.id).run();
  return { ok: true, choice: c, label: opts[c], same: false, changed: !!had, closesAt: row.closes_at };
}

/**
 * A poll closed: its counts kept, its card drawn once more without buttons. By the clock when it is due, or by an Admin.
 * @param {{ db: any, nowS: number }} ctx @param {any} row
 */
export async function closePoll(ctx, row) {
  const counts = await countsOf(ctx.db, { ...row, closed_at: null });
  const r = await ctx.db
    .prepare(
      'UPDATE pda_polls SET closed_at = ?2, tallies = ?3, card_dirty = 1, card_tries = 0, card_drawn_at = 0 WHERE id = ?1 AND closed_at IS NULL',
    )
    .bind(row.id, ctx.nowS, JSON.stringify(counts))
    .run();
  return Number(r?.meta?.changes ?? 0) > 0 ? { ok: true, counts } : { error: 'poll-closed' };
}

/** An Admin closes a poll early. @param {{ db: any, nowS: number }} ctx @param {any} actor @param {any} env @param {unknown} id */
export async function closePollNow(ctx, actor, env, id) {
  if (!isDeveloper(actor, env)) return { error: 'not-developer' };
  const row = await pollOf(ctx.db, id);
  if (!row) return { error: 'no-poll' };
  return closePoll(ctx, row);
}

/** A row of a bar, filled to its share. */
const bar = (/** @type {number} */ n, /** @type {number} */ total) => {
  const f = total ? Math.round((n / total) * BAR) : 0;
  return `\`${'█'.repeat(f)}${'░'.repeat(BAR - f)}\``;
};
const pct = (/** @type {number} */ n, /** @type {number} */ total) => (total ? Math.round((n / total) * 100) : 0);

/**
 * A poll's public card: the question, each option with its bar and a Vote button while open; the counts and the
 * winner once closed.
 * @param {any} row @param {number[]} counts @param {number} nowS
 */
export function pollCard(row, counts, nowS) {
  const opts = optionsOf(row);
  const total = counts.reduce((a, b) => a + b, 0);
  const open = pollOpen(row, nowS);
  const head = text(`### ❦ Poll\n**${md(row.question, 200)}**`);
  const foot = text(
    open
      ? `-# ${plural(total, 'vote')} · closes ${when(row.closes_at, 'R')} · ${POLL_ELIGIBLE[/** @type {keyof typeof POLL_ELIGIBLE} */ (row.eligible)] ?? ''} · one vote each, change it any time`
      : `-# ${plural(total, 'vote')} · closed ${when(row.closed_at ?? row.closes_at, 'f')}`,
  );
  if (open) {
    return [
      container(
        [
          head,
          divider(),
          ...opts.map((o, i) =>
            section(
              [`**${LETTERS[i]}.** ${md(o, POLL_OPTION_MAX)}\n${bar(counts[i], total)} ${pct(counts[i], total)}% · ${num(counts[i])}`],
              button('Vote', `poll:v:${row.id}:${i}`, { style: STYLE.PRIMARY }),
            ),
          ),
          divider(),
          foot,
        ],
        ACCENT.JOURNAL,
      ),
    ];
  }
  const top = Math.max(0, ...counts);
  const winners = total ? opts.filter((_, i) => counts[i] === top) : [];
  return [
    container(
      [
        head,
        divider(),
        text(
          opts
            .map(
              (o, i) =>
                `${counts[i] === top && total ? '★' : '·'} **${LETTERS[i]}.** ${md(o, POLL_OPTION_MAX)}\n${bar(counts[i], total)} ${pct(counts[i], total)}% · ${num(counts[i])}`,
            )
            .join('\n'),
        ),
        text(
          winners.length === 1
            ? `**Result:** ${md(winners[0], POLL_OPTION_MAX)}`
            : winners.length > 1
              ? `**Result:** a tie between ${winners.map((w) => md(w, 40)).join(' and ')}`
              : '**Result:** no votes',
        ),
        divider(),
        foot,
      ],
      ACCENT.QUIET,
    ),
  ];
}

/** The polls' cards due, drawn: a new one posted, a voted one redrawn at most every POLL_REDRAW_S. */
export const drawPollCards = (/** @type {any} */ ctx, /** @type {any} */ env, /** @type {any} */ fetchFn, only) =>
  drawCards(ctx, env, fetchFn, {
    table: 'pda_polls',
    channel: () => pollChannelOf(ctx, env, fetchFn),
    card: async (row) => pollCard(row, await countsOf(ctx.db, row), ctx.nowS),
    throttleS: POLL_REDRAW_S,
    only,
  });

/** Polls past their close, closed. @param {{ db: any, nowS: number }} ctx */
export async function closeDuePolls(ctx) {
  const due =
    (
      await ctx.db
        .prepare('SELECT * FROM pda_polls WHERE closed_at IS NULL AND closes_at <= ?1 ORDER BY closes_at LIMIT 20')
        .bind(ctx.nowS)
        .all()
    )?.results ?? [];
  let n = 0;
  for (const row of due) if ('ok' in (await closePoll(ctx, row))) n++;
  return n;
}

/**
 * A new poll told to the linked players who want polls and may vote in it, a page a minute, each into the outbox.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function announcePolls(ctx) {
  const { db, nowS } = ctx;
  const polls =
    (
      await db
        .prepare('SELECT * FROM pda_polls WHERE announced = 0 AND closed_at IS NULL AND closes_at > ?1 ORDER BY made_at LIMIT 3')
        .bind(nowS)
        .all()
    )?.results ?? [];
  let told = 0;
  for (const p of polls) {
    const page =
      (
        await db
          .prepare(
            `SELECT d.rowid AS rid, d.discord_id FROM discord_links d WHERE d.rowid > ?1 AND (d.dm & ?2) != 0 AND d.dm_dead = 0
             AND (?3 = 'linked' OR EXISTS (SELECT 1 FROM realm_characters r WHERE r.player = d.player_id AND r.dead_at IS NULL))
             ORDER BY d.rowid LIMIT ?4`,
          )
          .bind(Number(p.announce_cursor) || 0, NOTICE_KINDS.polls.bit, p.eligible, POLL_ANNOUNCE_A_MINUTE)
          .all()
      )?.results ?? [];
    const n = {
      title: 'A new poll',
      lines: [`**${md(p.question, 200)}**`, `-# Closes ${when(p.closes_at, 'R')}.`],
      open: 'polls',
      label: 'Vote',
    };
    const done = page.length < POLL_ANNOUNCE_A_MINUTE;
    await db.batch([
      ...page.map((l) => noticeStatement(db, l.discord_id, 'polls', p.id, n, nowS)),
      db
        .prepare('UPDATE pda_polls SET announce_cursor = ?2, announced = ?3 WHERE id = ?1')
        .bind(p.id, page.length ? Number(page.at(-1).rid) : Number(p.announce_cursor) || 0, done ? 1 : 0),
    ]);
    told += page.length;
  }
  return told;
}

/** Open polls and the last closed, with counts and the account's own vote. @param {any} db @param {any} player @param {number} nowS */
export async function pollsFor(db, player, nowS) {
  const live =
    (
      await db
        .prepare('SELECT * FROM pda_polls WHERE closed_at IS NULL AND closes_at > ?1 ORDER BY closes_at LIMIT 5')
        .bind(nowS)
        .all()
    )?.results ?? [];
  const recent =
    (
      await db
        .prepare('SELECT * FROM pda_polls WHERE closed_at IS NOT NULL AND closed_at > ?1 ORDER BY closed_at DESC LIMIT ?2')
        .bind(nowS - POLL_RECENT_S, POLL_RECENT)
        .all()
    )?.results ?? [];
  const mine = new Map();
  if (player && live.length) {
    const got =
      (
        await db
          .prepare(
            `SELECT poll_id, choice FROM pda_poll_votes WHERE player_id = ?1 AND poll_id IN (${live.map((_, i) => `?${i + 2}`).join(', ')})`,
          )
          .bind(player.id, ...live.map((p) => p.id))
          .all()
      )?.results ?? [];
    for (const g of got) mine.set(g.poll_id, Number(g.choice));
  }
  const view = async (/** @type {any} */ row) => {
    const counts = await countsOf(db, row);
    return {
      id: row.id,
      question: row.question,
      options: optionsOf(row).map((label, i) => ({ label, votes: counts[i] })),
      closesAt: row.closes_at,
      closedAt: row.closed_at ?? null,
      eligible: row.eligible,
      mine: mine.has(row.id) ? mine.get(row.id) : null,
    };
  };
  return { open: await Promise.all(live.map(view)), recent: await Promise.all(recent.map(view)) };
}

/** The PDA's polls screen: each open poll with a private menu to vote, and the last results. @param {any} who @param {string} [said] */
async function pollsScreen(who, said = '') {
  const { open, recent } = await pollsFor(who.ctx.db, who.player, who.ctx.nowS);
  const parts = [...(said ? [text(said), divider()] : [])];
  if (!open.length) parts.push(text('-# No poll is open now.'));
  for (const p of open.slice(0, 4)) {
    const total = p.options.reduce((a, o) => a + o.votes, 0);
    parts.push(
      text(
        `**${md(p.question, 200)}**\n${p.options
          .map((o, i) => `${p.mine === i ? '▸' : '·'} ${LETTERS[i]}. ${md(o.label, POLL_OPTION_MAX)} · ${pct(o.votes, total)}%`)
          .join('\n')}\n-# ${plural(total, 'vote')} · closes ${when(p.closesAt, 'R')}${p.mine != null ? ` · you chose ${LETTERS[p.mine]}` : ''}`,
      ),
    );
    if (who.player)
      parts.push(
        select(
          `pda:polls:vote:${p.id}`,
          p.options.map((o, i) => ({ label: `${LETTERS[i]}. ${o.label}`, value: String(i), default: p.mine === i })),
          { placeholder: p.mine != null ? 'Change your vote…' : 'Vote…' },
        ),
      );
  }
  if (!who.player && open.length) parts.push(text('-# Link your account to vote.'));
  if (recent.length) {
    parts.push(divider());
    parts.push(
      text(
        `**Recent results**\n${recent
          .map((p) => {
            const total = p.options.reduce((a, o) => a + o.votes, 0);
            const top = Math.max(0, ...p.options.map((o) => o.votes));
            const win = total ? p.options.filter((o) => o.votes === top).map((o) => md(o.label, 40)) : [];
            return `· **${md(p.question, 120)}**: ${win.length ? win.join(' and ') : 'no votes'} (${plural(total, 'vote')})`;
          })
          .join('\n')}`,
      ),
    );
  }
  return frame(who, 'polls', parts, { actions: [button('Refresh', 'pda:polls')] });
}

/** A vote's private answer. */
const votedWords = (/** @type {any} */ r) =>
  r.same
    ? `You already chose **${md(r.label, POLL_OPTION_MAX)}**.`
    : `Your vote: **${md(r.label, POLL_OPTION_MAX)}**. You can change it until the poll closes ${when(r.closesAt, 'R')}.`;

export const pollsPda = {
  key: 'polls',
  heads: ['poll'],
  /** @param {any} who */
  screen: async (who) => pollsScreen(who),
  acts: {
    /** A vote from the PDA's own menu. @param {any} who @param {string[]} args @param {string[]} values */
    async vote(who, args, values) {
      if (!who.player) return pollsScreen(who, refusalText('not-linked'));
      const r = await votePoll(who.ctx, who.player, args[0], values[0]);
      if ('error' in r) return pollsScreen(who, pollWords(r.error));
      if (!r.same) who.io?.later?.(drawPollCards(who.ctx, who.env, who.io.fetchFn, String(args[0])));
      return pollsScreen(who, votedWords(r));
    },
  },
  /** A Vote pressed on a public card: answered privately, the card drawn again soon. @param {any} who @param {string[]} parts */
  async press(who, parts) {
    const [, act, id, choice] = parts;
    if (act !== 'v') return refusalNote(refusalText('gone'));
    if (!who.player) return refusalNote('Link your DFO account to vote. Press Link account in the Terminal.');
    if (who.barred) return refusalNote(refusalText(who.barred));
    const r = await votePoll(who.ctx, who.player, id, choice);
    if ('error' in r) return refusalNote(pollWords(r.error));
    if (!r.same) who.io?.later?.(drawPollCards(who.ctx, who.env, who.io.fetchFn, String(id)));
    return reply([container([text(votedWords(r))], ACCENT.GOOD)]);
  },
  /** Open polls the player has not voted in. @param {any} who */
  async glance(who) {
    const n = await who.ctx.db
      .prepare(
        `SELECT COUNT(*) AS n FROM pda_polls p WHERE p.closed_at IS NULL AND p.closes_at > ?1
         AND NOT EXISTS (SELECT 1 FROM pda_poll_votes v WHERE v.poll_id = p.id AND v.player_id = ?2)`,
      )
      .bind(who.ctx.nowS, who.player.id)
      .first();
    const k = Number(n?.n) || 0;
    return k ? `◇ **Polls:** ${plural(k, 'poll')} waiting for your vote` : null;
  },
  /** Close what is due, post and redraw cards, tell players of new polls. @param {any} ctx @param {any} env @param {any} fetchFn */
  async minute(ctx, env, fetchFn) {
    return (await closeDuePolls(ctx)) + (await drawPollCards(ctx, env, fetchFn)) + (await announcePolls(ctx));
  },
  /** Votes of long-closed polls let go; their counts stay. @param {{ db: any, nowS: number }} ctx */
  async hour(ctx) {
    const r = await ctx.db
      .prepare(
        `DELETE FROM pda_poll_votes WHERE rowid IN (SELECT v.rowid FROM pda_poll_votes v JOIN pda_polls p ON p.id = v.poll_id
         WHERE p.closed_at IS NOT NULL AND p.closed_at < ?1 LIMIT 1000)`,
      )
      .bind(ctx.nowS - POLL_VOTES_KEEP_S)
      .run();
    return Number(r?.meta?.changes ?? 0);
  },
  routes: {
    '/v1/polls': {
      method: 'GET',
      /** @param {any} ctx @param {any} _env @param {any} player */
      async handle(ctx, _env, player) {
        return { status: 200, json: await pollsFor(ctx.db, player, ctx.nowS) };
      },
    },
    '/v1/polls/vote': {
      method: 'POST',
      /** @param {any} ctx @param {any} _env @param {any} player @param {any} b */
      async handle(ctx, _env, player, b) {
        const r = await votePoll(ctx, player, b?.poll, b?.choice);
        if ('error' in r)
          return {
            status:
              r.error === 'polls-need-account' || r.error === 'banned' || r.error === 'poll-played'
                ? 403
                : r.error === 'no-poll'
                  ? 404
                  : r.error === 'poll-closed'
                    ? 409
                    : 400,
            json: { error: r.error },
          };
        return { status: 200, json: { ok: true, choice: r.choice } };
      },
    },
  },
};

/** A poll's line for the staff desk's menu. @param {any} p */
export const pollOption = (p) => ({ label: p.question, value: p.id, description: `closes ${new Date(Number(p.closes_at) * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC` });
