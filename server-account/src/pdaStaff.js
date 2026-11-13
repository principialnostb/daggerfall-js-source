// @ts-check
// The staff desk: the open chat cases with their lines and the reviewer's word, a player's standing and notes, the
// polls, and the feedback queue. Every act is the code the staff panel and the moderators' cards already run (safety.js
// modAct, staffDesk.js's notes), as the staff member's own account, so the claim on a case, the one act a case, the
// record and the role rules hold here as at every other door. A Moderator sees chat cases; an Admin sees spawn cases too
// and alone opens or closes polls.
import { text, select, button, divider, modal, md, fenced, when, plural, line, STYLE, ACCENT } from './pdaUi.js';
import { frame, refusalText } from './pdaFrame.js';
import { displayName, isMuted } from './accounts.js';
import { CASE_CLAIM_S, modAct, CLICK_RE, modCases } from './safety.js';
import { findAccount, strikesLook, strikesOf, pushLaw, isBanned, bannedUntil } from './sanctions.js';
import { CARD_ACTS, minutesWord } from './discord.js';
import { staffDesk } from './staffDesk.js';
import { auditStatement, staffRole } from './staff.js';
import { ID_RE } from '../../src/net/identityToken.js';
import { LADDER_BAN_AT, ladderMinutes, BAN_FOREVER, BAN_DAYS_MAX, reportReasonLabel } from '../../src/net/safety/safetyLaw.js';
import {
  feedbackQueue,
  feedbackOf,
  feedbackOption,
  setFeedbackStatus,
  drawFeedbackCards,
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  feedbackWords,
  staffActorOf,
} from './pdaFeedback.js';
import {
  createPoll,
  closePollNow,
  pollsFor,
  pollWords,
  pollOption,
  POLL_ELIGIBLE,
  POLL_QUESTION_MAX,
  POLL_HOURS_MAX,
} from './pdaPolls.js';

/** A case's lines a view draws, the newest. */
export const DESK_CASE_LINES = 20;
/** A mute asked by minutes: Discord's command's own bound. */
export const DESK_MUTE_MAX = 10080;
const CASE_ID_RE = /^[0-9a-f]{16}$/;

const STAFF_WORDS = Object.freeze({
  'not-moderator': 'You are not a moderator in the game.',
  protected: 'Moderators cannot be muted or banned.',
  'no-player': 'Nobody has that name.',
  ambiguous: 'More than one guest has that name. Use the account id.',
  'bad-minutes': `A mute is 1 to ${DESK_MUTE_MAX} minutes.`,
  'bad-days': `A ban is 0 (for good) to ${BAN_DAYS_MAX} days.`,
  'not-banned': 'That account is not banned.',
  'staff-claimed': 'Another staff member has this case in the staff panel.',
  'case-acted': 'Another moderator is acting on this case now.',
  'case-closed': 'That case is already closed.',
  'not-developer': 'Only an Admin can do that.',
  'admin-sanction': 'An Admin set this. Only an Admin can lift or shorten it.',
  'no-case': 'That case is gone.',
  'note-text': 'A note is 1 to 500 characters.',
  'bad-click': 'That press did not carry its id. Try again.',
});
const say = (/** @type {string} */ e) => refusalText(e, STAFF_WORDS);

/** The relay's order sent after Discord is answered. */
const pushOf = (/** @type {any} */ who) => (/** @type {string} */ order) => {
  const p = pushLaw(who.env, who.io.fetchFn, order);
  who.io.later?.(p);
};

/** A staff note read or written through the staff panel's own door, its audit row marked as Discord's. */
async function notesDoor(who, actor, path, b) {
  const role = staffRole(actor, who.env);
  const audit = (/** @type {string} */ act, target = null, detail = null, how = {}) =>
    auditStatement(who.ctx.db, who.ctx.nowS, {
      actor,
      role,
      act,
      target,
      detail: { ...(detail ?? {}), via: 'discord' },
      ...how,
    });
  return staffDesk(who.ctx, who.env, path, b, { player: actor, role }, audit);
}

/** A time span in words. */
const banWord = (/** @type {number} */ until) => (until >= BAN_FOREVER ? 'for good' : `until ${when(until)}`);

/** What stands against an account now, in words, or null. @param {any} t @param {number} nowS */
const standingOf = (t, nowS) =>
  [
    isBanned(t, nowS) ? `Banned ${banWord(bannedUntil(t))}${t?.ban_reason ? ` (${md(t.ban_reason)})` : ''}` : '',
    isMuted(t, nowS) ? `Muted until ${when(Number(t.muted_until))}` : '',
  ]
    .filter(Boolean)
    .join('; ') || null;

/** The desk's front: counts, the open cases, and the doors to the rest. @param {any} who @param {string} [said] */
async function deskScreen(who, said = '') {
  const actor = await staffActorOf(who);
  const cases = actor ? await modCases(who.ctx, actor, who.env) : { error: 'not-moderator' };
  const list = 'error' in cases ? [] : cases.cases;
  const fb = await who.ctx.db.prepare("SELECT COUNT(*) AS n FROM pda_feedback WHERE status = 'new'").first();
  const polls = await who.ctx.db
    .prepare('SELECT COUNT(*) AS n FROM pda_polls WHERE closed_at IS NULL AND closes_at > ?1')
    .bind(who.ctx.nowS)
    .first();
  const lines = list.map(
    (/** @type {any} */ c) =>
      `● **${md(c.name, 40)}**${c.kind === 'spawn' ? ' · spawn' : ''} · ${plural(c.reports, 'report')} (${c.credible} counted)${c.reasons.length ? ` · ${c.reasons.map(reportReasonLabel).join(', ')}` : ''}${c.ai ? ` · reviewer: ${md(c.ai.category, 20)} ${c.ai.severity}` : ''} · ${when(c.updatedAt, 'R')}`,
  );
  return frame(
    who,
    'staff',
    [
      ...(said ? [text(said), divider()] : []),
      text(
        `**Open cases:** ${list.length}${list.length >= 10 ? '+' : ''} · **New feedback:** ${Number(fb?.n) || 0} · **Open polls:** ${Number(polls?.n) || 0}`,
      ),
      text(lines.length ? lines.join('\n') : '-# No open cases.'),
      ...(list.length
        ? [
            select(
              'pda:staff:case',
              list.map((/** @type {any} */ c) => ({
                label: `${c.name}${c.kind === 'spawn' ? ' (spawn)' : ''}`,
                value: c.id,
                description: `${c.reports} reports, ${c.credible} counted${c.ai ? `, reviewer ${c.ai.category}` : ''}`,
              })),
              { placeholder: 'Open a case…' },
            ),
          ]
        : []),
    ],
    {
      actions: [
        button('Look up a player', 'pda:staff:lookup', { style: STYLE.PRIMARY }),
        button('Feedback', 'pda:staff:feedback'),
        button('Polls', 'pda:staff:polls'),
        button('Refresh', 'pda:staff'),
      ],
    },
  );
}

/** One case, drawn for the desk. @param {any} who @param {string} caseId @param {string} [said] */
async function caseScreen(who, caseId, said = '') {
  if (!CASE_ID_RE.test(String(caseId))) return deskScreen(who, say('no-case'));
  const { db, nowS } = who.ctx;
  const c = await db.prepare('SELECT * FROM mod_cases WHERE id = ?1').bind(caseId).first();
  if (!c || (c.kind !== 'chat' && !who.admin)) return deskScreen(who, say('no-case'));
  const target = await db.prepare('SELECT * FROM players WHERE id = ?1').bind(c.target).first();
  const lines =
    (
      await db
        .prepare('SELECT at, sub, name, tab, text FROM mod_case_lines WHERE case_id = ?1 ORDER BY at, sub')
        .bind(caseId)
        .all()
    )?.results ?? [];
  const reports =
    (await db.prepare('SELECT reason, note FROM mod_reports WHERE case_id = ?1 ORDER BY at').bind(caseId).all())
      ?.results ?? [];
  const strikes = await strikesOf(db, c.target, nowS);
  const shown = lines
    .slice(-DESK_CASE_LINES)
    .map((/** @type {any} */ l) => {
      const flagged = c.ai_line_at != null && l.at === c.ai_line_at && l.sub === c.ai_line_sub;
      return `${flagged ? '!' : l.sub === c.target ? '>' : ' '} [${l.tab}] ${line(l.name, 30)}: ${line(l.text, 160)}`;
    });
  const reasons = [...new Set(reports.map((/** @type {any} */ r) => String(r.reason)))];
  const notes = reports.map((/** @type {any} */ r) => line(r.note, 200)).filter(Boolean);
  const standing = target ? standingOf(target, nowS) : null;
  const verdict =
    c.ai_state === 'done' && c.ai_category
      ? `**Reviewer:** ${c.ai_mode === 'shadow' ? 'shadow, nothing done on it. ' : ''}${md(c.ai_category, 20)}, severity ${c.ai_severity}, ${Math.round(Number(c.ai_confidence) * 100)}% sure${c.ai_line_at != null ? ' (the line marked !)' : ''}: ${md(c.ai_reason, 300)}`
      : c.ai_state === 'done'
        ? '**Reviewer:** found nothing against the code.'
        : c.ai_state === 'failed'
          ? '**Reviewer:** could not read this case.'
          : '';
  const open = c.status === 'open';
  const parts = [
    ...(said ? [text(said), divider()] : []),
    text(
      [
        `## Case ${c.id}${c.kind === 'spawn' ? ' · spawn' : c.source === 'review' ? ' · opened by the reviewer' : ''}`,
        `**Player:** ${md(target ? displayName(target) : '?', 40)} (\`${c.target}\`)`,
        `**Reports:** ${c.reports} (${c.credible} counted) · **Strikes (90 days):** ${strikes}, next ${strikes >= LADDER_BAN_AT ? 'a ban' : minutesWord(ladderMinutes(strikes))}`,
        ...(standing ? [`**Now:** ${standing}`] : []),
        ...(reasons.length ? [`**Reported for:** ${reasons.map(reportReasonLabel).join(', ')}`] : []),
        ...(c.auto ? [`**Done automatically:** muted 30 min (${c.auto === 'reports' ? 'three reports that count' : 'the reviewer, read twice'})`] : []),
        ...(verdict ? [verdict] : []),
        ...(!open ? [`**${c.status === 'dismissed' ? 'Dismissed' : 'Actioned'}** by ${md(c.resolved_by || '?', 40)}: ${md(c.resolution, 200)}`] : []),
      ].join('\n'),
    ),
    text(c.lines_kept === 0 ? '-# Its lines were deleted after it closed.' : shown.length ? fenced(shown.join('\n'), 2200) : '-# No lines kept.'),
    ...(notes.length ? [text(`**Reporters’ notes**\n${fenced(notes.join('\n'), 600)}`)] : []),
  ];
  return frame(who, 'staff', parts, {
    title: 'Case',
    accent: !open ? ACCENT.QUIET : (c.ai_severity ?? 0) >= 3 ? ACCENT.BAD : (c.ai_severity ?? 0) === 2 ? ACCENT.WARN : ACCENT.STAFF,
    actions: [
      ...(open
        ? Object.entries(CARD_ACTS).map(([k, a]) =>
            button(a.label, `pda:staff:act:${k}:${c.id}`, {
              style: k === 'dis' ? STYLE.SECONDARY : k === 'b30' ? STYLE.DANGER : STYLE.PRIMARY,
            }),
          )
        : []),
      ...(target ? [button('Player', `pda:staff:player:${c.target}`)] : []),
      button('Back', 'pda:staff'),
    ],
  });
}

/** A case's button: claimed, then acted through modAct as a card's press is, then drawn again. */
async function caseAct(who, k, caseId) {
  const actor = await staffActorOf(who);
  if (!actor) return deskScreen(who, say('not-moderator'));
  const a = /** @type {any} */ (CARD_ACTS)[k];
  if (!a || !CASE_ID_RE.test(String(caseId))) return deskScreen(who, say('no-case'));
  const { db, nowS } = who.ctx;
  const c = await db.prepare('SELECT * FROM mod_cases WHERE id = ?1').bind(caseId).first();
  if (!c || (c.kind !== 'chat' && !who.admin)) return deskScreen(who, say('no-case'));
  if (c.status !== 'open') return caseScreen(who, caseId, say('case-closed'));
  // One press acts; another inside CASE_CLAIM_S sees the case as it stands.
  const claimed = await db
    .prepare(
      "UPDATE mod_cases SET claimed_at = ?2 WHERE id = ?1 AND status = 'open' AND (claimed_at IS NULL OR claimed_at < ?3)",
    )
    .bind(caseId, nowS, nowS - CASE_CLAIM_S)
    .run();
  if (!claimed?.meta?.changes) return caseScreen(who, caseId, say('case-acted'));
  const release = () => db.prepare('UPDATE mod_cases SET claimed_at = NULL WHERE id = ?1').bind(caseId).run();
  /** @type {any} */
  const ask =
    'minutes' in a
      ? {
          act: 'mute',
          minutes: a.minutes,
          resolution: (/** @type {any} */ r) =>
            r.kept ? `muted (a longer mute stands, until ${when(r.until)})` : `muted ${minutesWord(a.minutes)}`,
        }
      : 'days' in a
        ? { act: 'ban', days: a.days, resolution: (/** @type {any} */ r) => `banned ${banWord(r.until)}` }
        : { act: 'dismiss' };
  const click = typeof who.body?.id === 'string' && CLICK_RE.test(who.body.id) ? who.body.id : null;
  const r = await modAct(
    who.ctx,
    actor,
    who.env,
    {
      ...ask,
      target: c.target,
      caseId,
      click,
      reason: `case ${caseId}`,
      actorName: `${displayName(actor)} (Discord)`,
      from: 'Discord',
      keepLonger: true,
    },
    { push: pushOf(who) },
  );
  if ('error' in r) {
    await release();
    return caseScreen(who, caseId, say(r.error));
  }
  return caseScreen(who, caseId, `Done: ${a.label}.`);
}

/** A player's standing, history and notes. @param {any} who @param {string} target @param {string} [said] */
async function playerScreen(who, target, said = '') {
  const actor = await staffActorOf(who);
  if (!actor) return deskScreen(who, say('not-moderator'));
  const r = await strikesLook(who.ctx, actor, who.env, { target });
  if ('error' in r) return deskScreen(who, say(r.error));
  const notes = await notesDoor(who, actor, '/v1/staff/notes', { target: r.target });
  const open = await who.ctx.db
    .prepare("SELECT id FROM mod_cases WHERE target = ?1 AND status = 'open' AND (kind = 'chat' OR ?2 = 1) ORDER BY kind = 'chat' DESC LIMIT 1")
    .bind(r.target, who.admin ? 1 : 0)
    .first();
  const now =
    [
      r.bannedUntil ? `banned ${banWord(r.bannedUntil)}${r.banReason ? ` (${md(r.banReason)})` : ''}` : '',
      r.mutedUntil ? `muted until ${when(r.mutedUntil)}` : '',
    ]
      .filter(Boolean)
      .join('; ') || 'in good standing';
  const acts = r.history
    .slice(0, 8)
    .map(
      (/** @type {any} */ h) =>
        `· ${when(h.at, 'd')} ${h.kind}${h.voided ? ' (voided)' : ''}${h.until ? ` until ${h.until >= BAN_FOREVER ? 'forever' : when(h.until, 'd')}` : ''} by ${md(h.by || '?', 30)}${h.reason ? `: ${md(h.reason, 80)}` : ''}`,
    );
  const noteLines = 'error' in notes ? [] : notes.notes.slice(0, 5).map((/** @type {any} */ n) => `· ${when(n.at, 'd')} **${md(n.byName, 30)}:** ${md(n.text, 200)}`);
  return frame(
    who,
    'staff',
    [
      ...(said ? [text(said), divider()] : []),
      text(
        `## ${md(r.name, 40)}\n\`${r.target}\` · ${now}\n**Strikes (90 days):** ${r.strikes}, next ${r.next === 'ban' ? 'a ban' : minutesWord(Number(r.next))}`,
      ),
      text(`**Record**\n${acts.length ? acts.join('\n') : '-# Nothing on record.'}`),
      text(`**Staff notes**\n${noteLines.length ? noteLines.join('\n') : '-# No notes.'}`),
    ],
    {
      title: 'Player',
      accent: ACCENT.STAFF,
      actions: [
        button('Mute', `pda:staff:mute:${r.target}`, { style: STYLE.PRIMARY }),
        button('Unmute', `pda:staff:unmute:${r.target}`, { disabled: !r.mutedUntil }),
        button('Ban', `pda:staff:ban:${r.target}`, { style: STYLE.DANGER }),
        button('Unban', `pda:staff:unban:${r.target}`, { disabled: !r.bannedUntil }),
        button('Add note', `pda:staff:note:${r.target}`),
        ...(open ? [button('Open case', `pda:staff:case:${open.id}`)] : []),
        button('Back', 'pda:staff'),
      ],
    },
  );
}

/** An act on a player from the desk, through modAct. */
async function playerAct(who, target, ask, done) {
  const actor = await staffActorOf(who);
  if (!actor) return deskScreen(who, say('not-moderator'));
  const r = await modAct(
    who.ctx,
    actor,
    who.env,
    { ...ask, target, actorName: `${displayName(actor)} (Discord)`, from: 'Discord' },
    { push: pushOf(who) },
  );
  if ('error' in r) return playerScreen(who, target, say(r.error));
  return playerScreen(who, target, done(r));
}

/** The desk's polls: what is open, the last results, and an Admin's doors to open or close one. @param {any} who @param {string} [said] */
async function pollsDesk(who, said = '') {
  const { open, recent } = await pollsFor(who.ctx.db, null, who.ctx.nowS);
  const summary = (/** @type {any} */ p) => {
    const total = p.options.reduce((/** @type {number} */ a, /** @type {any} */ o) => a + o.votes, 0);
    return `**${md(p.question, 150)}**\n-# ${p.options.map((/** @type {any} */ o) => `${md(o.label, 30)} ${o.votes}`).join(' · ')} · ${plural(total, 'vote')} · ${p.closedAt ? `closed ${when(p.closedAt, 'R')}` : `closes ${when(p.closesAt, 'R')}`}`;
  };
  return frame(
    who,
    'staff',
    [
      ...(said ? [text(said), divider()] : []),
      text(`**Open polls**\n${open.length ? open.map(summary).join('\n') : '-# None open.'}`),
      ...(recent.length ? [text(`**Recent results**\n${recent.map(summary).join('\n')}`)] : []),
      ...(who.admin && open.length
        ? [
            select(
              'pda:staff:pclose',
              open.map((/** @type {any} */ p) => pollOption({ question: p.question, id: p.id, closes_at: p.closesAt })),
              { placeholder: 'Close a poll now…' },
            ),
          ]
        : []),
      ...(!who.admin ? [text('-# Only an Admin can open or close a poll.')] : []),
    ],
    {
      title: 'Polls',
      actions: [
        ...(who.admin ? [button('New poll', 'pda:staff:pnew', { style: STYLE.PRIMARY })] : []),
        button('Back', 'pda:staff'),
      ],
    },
  );
}

/** The form a poll is opened with. */
const POLL_FORM = modal('pdam:staff:poll', 'Open a poll', [
  { id: 'question', label: 'Question', min: 3, max: POLL_QUESTION_MAX },
  { id: 'options', label: 'Options', hint: 'One a line, two to ten', long: true, max: 900 },
  { id: 'hours', label: 'Hours it runs', hint: `1 to ${POLL_HOURS_MAX}`, max: 3, value: '72' },
  {
    id: 'eligible',
    label: 'Who may vote',
    options: Object.entries(POLL_ELIGIBLE).map(([value, label]) => ({ label, value, default: value === 'linked' })),
  },
]);

/** The feedback queue: new first, then seen. @param {any} who @param {string} [said] */
async function feedbackDesk(who, said = '') {
  const q = await feedbackQueue(who.ctx.db, 15);
  const lines = q.map(
    (/** @type {any} */ f) =>
      `${f.status === 'new' ? '●' : '○'} **${md(f.title, 60)}** · ${FEEDBACK_KINDS[/** @type {keyof typeof FEEDBACK_KINDS} */ (f.kind)]?.label ?? ''} · ${md(displayName(f), 30)} · ${when(f.made_at, 'R')}`,
  );
  return frame(
    who,
    'staff',
    [
      ...(said ? [text(said), divider()] : []),
      text(`**Feedback waiting**\n${lines.length ? lines.join('\n') : '-# Nothing waiting.'}`),
      ...(q.length ? [select('pda:staff:fopen', q.map(feedbackOption), { placeholder: 'Open one…' })] : []),
    ],
    { title: 'Feedback', actions: [button('Back', 'pda:staff')] },
  );
}

/** One piece of feedback, with the staff's answers. @param {any} who @param {string} id @param {string} [said] */
async function feedbackItem(who, id, said = '') {
  const f = await feedbackOf(who.ctx.db, id);
  if (!f) return feedbackDesk(who, feedbackWords('no-feedback'));
  const s = FEEDBACK_STATUSES[/** @type {keyof typeof FEEDBACK_STATUSES} */ (f.status)] ?? FEEDBACK_STATUSES.new;
  return frame(
    who,
    'staff',
    [
      ...(said ? [text(said), divider()] : []),
      text(
        `## ${md(f.title, 80)}\n${FEEDBACK_KINDS[/** @type {keyof typeof FEEDBACK_KINDS} */ (f.kind)]?.label ?? ''} · from **${md(displayName(f), 40)}** (\`${f.player_id}\`) · ${when(f.made_at, 'f')}`,
      ),
      text(fenced(f.body, 1500)),
      text(f.status === 'new' ? '**Status:** New' : `**Status:** ${s.label} · by ${md(f.status_by || '?', 40)} ${when(f.status_at, 'R')}`),
    ],
    {
      title: 'Feedback',
      accent: s.accent,
      actions: [
        ...Object.entries(FEEDBACK_STATUSES)
          .filter(([k]) => k !== 'new')
          .map(([k, v]) => button(v.label, `pda:staff:fset:${k}:${f.id}`, { disabled: k === f.status })),
        button('Back', 'pda:staff:feedback'),
      ],
    },
  );
}

/** A whole number from a form's box, or the fallback when it is empty; NaN when it is not a number. */
const whole = (/** @type {string|undefined} */ v, /** @type {number} */ fallback) => {
  const t = String(v ?? '').trim();
  if (!t) return fallback;
  return /^\d{1,6}$/.test(t) ? Number(t) : NaN;
};

export const staffPda = {
  key: 'staff',
  /** @param {any} who */
  screen: async (who) => deskScreen(who),
  acts: {
    /** @param {any} who @param {string[]} args @param {string[]} values */
    case: async (who, args, values) => caseScreen(who, String(values[0] ?? args[0] ?? '')),
    /** @param {any} who @param {string[]} args */
    act: async (who, args) => caseAct(who, String(args[0] ?? ''), String(args[1] ?? '')),
    lookup: async () =>
      modal('pdam:staff:lookup', 'Look up a player', [{ id: 'who', label: 'Name or account id', max: 64 }]),
    /** @param {any} who @param {string[]} args */
    player: async (who, args) => playerScreen(who, String(args[0] ?? '')),
    /** @param {any} _who @param {string[]} args */
    mute: async (_who, args) =>
      modal(`pdam:staff:mute:${args[0]}`, 'Mute', [
        { id: 'minutes', label: 'Minutes', hint: `Empty for the next step on the ladder. 1 to ${DESK_MUTE_MAX}.`, max: 5, required: false },
        { id: 'reason', label: 'Reason', hint: 'Kept in the record', max: 200, required: false },
      ]),
    /** @param {any} who @param {string[]} args */
    unmute: async (who, args) =>
      playerAct(who, String(args[0] ?? ''), { act: 'mute', minutes: 0 }, () => 'They can chat again.'),
    /** @param {any} _who @param {string[]} args */
    ban: async (_who, args) =>
      modal(`pdam:staff:ban:${args[0]}`, 'Ban', [
        { id: 'days', label: 'Days', hint: `Empty for 30. 0 for good, or up to ${BAN_DAYS_MAX}.`, max: 3, required: false },
        { id: 'reason', label: 'Reason', hint: 'The banned player is shown it', max: 200, required: false },
      ]),
    /** @param {any} who @param {string[]} args */
    unban: async (who, args) => playerAct(who, String(args[0] ?? ''), { act: 'unban' }, () => 'Unbanned.'),
    /** @param {any} _who @param {string[]} args */
    note: async (_who, args) =>
      modal(`pdam:staff:note:${args[0]}`, 'Staff note', [{ id: 'text', label: 'Note', hint: 'Every staff member reads it', long: true, max: 500 }]),
    /** @param {any} who */
    polls: async (who) => pollsDesk(who),
    /** @param {any} who */
    pnew: async (who) => (who.admin ? POLL_FORM : pollsDesk(who, pollWords('not-developer'))),
    /** @param {any} who @param {string[]} _a @param {string[]} values */
    async pclose(who, _a, values) {
      const actor = await staffActorOf(who);
      const r = actor ? await closePollNow(who.ctx, actor, who.env, values[0]) : { error: 'not-developer' };
      if ('error' in r) return pollsDesk(who, pollWords(r.error));
      return pollsDesk(who, 'Closed. Its card shows the result in a minute.');
    },
    /** @param {any} who */
    feedback: async (who) => feedbackDesk(who),
    /** @param {any} who @param {string[]} args @param {string[]} values */
    fopen: async (who, args, values) => feedbackItem(who, String(values[0] ?? args[0] ?? '')),
    /** @param {any} who @param {string[]} args */
    async fset(who, args) {
      const actor = await staffActorOf(who);
      if (!actor) return deskScreen(who, say('not-moderator'));
      const r = await setFeedbackStatus(who.ctx, actor, String(args[1] ?? ''), String(args[0] ?? ''));
      if ('error' in r) return feedbackDesk(who, feedbackWords(r.error));
      who.io?.later?.(drawFeedbackCards(who.ctx, who.env, who.io.fetchFn, String(args[1])));
      return feedbackItem(who, String(args[1]), r.same ? 'It already says that.' : 'Saved. The player is told.');
    },
  },
  forms: {
    /** By account id first, then by name: an id is a valid name, so a name first let a decoy take the act. */
    async lookup(who, values) {
      const said = String(values.who ?? '').trim();
      let row = ID_RE.test(said) ? await findAccount(who.ctx.db, { target: said }) : { error: 'no-player' };
      if ('error' in row && row.error === 'no-player') row = await findAccount(who.ctx.db, { name: said });
      if ('error' in row) return deskScreen(who, say(row.error));
      return playerScreen(who, row.id);
    },
    /** @param {any} who @param {Record<string, string>} values @param {string[]} args */
    async mute(who, values, args) {
      const target = String(args[0] ?? '');
      const strikes = await strikesOf(who.ctx.db, target, who.ctx.nowS);
      const minutes = whole(values.minutes, ladderMinutes(Math.min(strikes, LADDER_BAN_AT - 1)));
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > DESK_MUTE_MAX) return playerScreen(who, target, say('bad-minutes'));
      return playerAct(
        who,
        target,
        { act: 'mute', minutes, reason: values.reason || undefined },
        () => `Muted for ${minutesWord(minutes)}.`,
      );
    },
    /** @param {any} who @param {Record<string, string>} values @param {string[]} args */
    async ban(who, values, args) {
      const target = String(args[0] ?? '');
      const days = whole(values.days, 30);
      if (!Number.isInteger(days) || days < 0 || days > BAN_DAYS_MAX) return playerScreen(who, target, say('bad-days'));
      return playerAct(
        who,
        target,
        { act: 'ban', days, reason: values.reason || undefined },
        (/** @type {any} */ r) => `Banned ${banWord(r.until)}.`,
      );
    },
    /** @param {any} who @param {Record<string, string>} values @param {string[]} args */
    async note(who, values, args) {
      const actor = await staffActorOf(who);
      if (!actor) return deskScreen(who, say('not-moderator'));
      const r = await notesDoor(who, actor, '/v1/staff/notes/add', { target: String(args[0] ?? ''), text: values.text });
      if ('error' in r) return playerScreen(who, String(args[0] ?? ''), say(r.error));
      return playerScreen(who, String(args[0]), 'Note added.');
    },
    /** @param {any} who @param {Record<string, string>} values */
    async poll(who, values) {
      const actor = await staffActorOf(who);
      const r = actor
        ? await createPoll(who.ctx, actor, who.env, {
            question: values.question,
            options: values.options,
            hours: values.hours,
            eligible: values.eligible,
          })
        : { error: 'not-developer' };
      if ('error' in r) return pollsDesk(who, pollWords(r.error));
      return pollsDesk(who, `Opened. Its card is posted within a minute and it closes ${when(r.closesAt, 'R')}.`);
    },
  },
  /** For staff alone: what waits on the desk. @param {any} who */
  async glance(who) {
    if (!who.staff) return null;
    const c = await who.ctx.db
      .prepare(
        "SELECT (SELECT COUNT(*) FROM mod_cases WHERE status = 'open' AND (kind = 'chat' OR ?1 = 1)) AS cases, (SELECT COUNT(*) FROM pda_feedback WHERE status = 'new') AS fb",
      )
      .bind(who.admin ? 1 : 0)
      .first();
    const cases = Number(c?.cases) || 0;
    const fb = Number(c?.fb) || 0;
    return cases || fb ? `❦ **Staff desk:** ${plural(cases, 'open case')}, ${plural(fb, 'new piece')} of feedback` : null;
  },
};

