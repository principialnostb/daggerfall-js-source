// @ts-check
// Direct messages from the PDA. Each module writes what a player should hear into the outbox (discord_notices), one
// row a user, kind and subject, so nothing is told twice. The minute clock sends a bounded number each minute. A user
// Discord will not deliver to is marked, and asked nothing more until they press Test in Settings.
import { container, text, button, rows, body, STYLE, md, ACCENT } from './pdaUi.js';
import { discordApi, botOn, CANNOT_DM } from './pdaDiscordApi.js';

/** Direct messages the clock sends a minute, all users together: well inside Discord's own pace. */
export const NOTICES_A_MINUTE = 30;
/** Tries before a notice Discord keeps failing is let go. */
export const NOTICE_TRIES_MAX = 5;
/** How long a sent notice's row is kept, so the same subject is not told again. */
export const NOTICE_KEEP_S = 14 * 24 * 3600;
/** How long an unsent notice may wait before it is stale and let go. */
export const NOTICE_STALE_S = 2 * 24 * 3600;
/** How long a firing holds the notices it took: past it, a firing that died leaves them to the next. */
export const NOTICE_CLAIM_S = 300;
/** How long one firing spends sending, ms: Discord at its slowest must not keep the clock past its minute. */
export const NOTICE_SEND_MS = 40_000;

/**
 * A notice's card: a title, a few lines, and a button that opens the PDA where the news is.
 * @param {{ title: string, lines: string[], open?: string, label?: string, accent?: number }} n
 */
export function noticeCard({ title, lines, open = 'home', label = 'Open your journal', accent = ACCENT.JOURNAL }) {
  return [
    container(
      [
        text(`### ❦ The Courier · ${md(title, 80)}\n${lines.join('\n')}`.slice(0, 1800)),
        ...rows([button(label, `open:${open}`, { style: STYLE.PRIMARY })]),
      ],
      accent,
    ),
  ];
}

/**
 * A notice into the outbox. Answers whether it was new.
 * @param {any} db @param {string} discordId @param {string} kind @param {string} ref
 * @param {{ title: string, lines: string[], open?: string, label?: string, accent?: number }} n @param {number} nowS
 */
export async function queueNotice(db, discordId, kind, ref, n, nowS) {
  const r = await db
    .prepare(
      'INSERT OR IGNORE INTO discord_notices (discord_id, kind, ref, card, made_at) VALUES (?1, ?2, ?3, ?4, ?5)',
    )
    .bind(discordId, kind, String(ref).slice(0, 120), JSON.stringify(noticeCard(n)), nowS)
    .run();
  return Number(r?.meta?.changes ?? 0) > 0;
}
/** The same, as a statement for a batch. */
export const noticeStatement = (/** @type {any} */ db, discordId, kind, ref, n, nowS) =>
  db
    .prepare(
      'INSERT OR IGNORE INTO discord_notices (discord_id, kind, ref, card, made_at) VALUES (?1, ?2, ?3, ?4, ?5)',
    )
    .bind(discordId, kind, String(ref).slice(0, 120), JSON.stringify(noticeCard(n)), nowS);

/** The DM channel Discord keeps for a user, opened once and remembered. */
async function dmChannelOf(ctx, env, fetchFn, link) {
  if (/^\d{5,25}$/.test(String(link.dm_channel ?? ''))) return { id: String(link.dm_channel) };
  const r = await discordApi(env, fetchFn, 'POST', '/users/@me/channels', { recipient_id: link.discord_id });
  if (!r.ok) return { error: r };
  const id = String(r.json?.id ?? '');
  if (!/^\d{5,25}$/.test(id)) return { error: { ok: false, status: 0, code: 0, down: true } };
  await ctx.db.prepare('UPDATE discord_links SET dm_channel = ?1 WHERE discord_id = ?2').bind(id, link.discord_id).run();
  return { id };
}

/** Whether a refusal means Discord will not deliver to this user at all. */
const deadRefusal = (/** @type {any} */ r) => r.code === CANNOT_DM || r.status === 403;

/**
 * One direct message now, its components given whole. Answers `{ sent }`, `{ dead }` (Discord will not deliver to this
 * user; the link is marked) or `{ down }` (try later).
 * @param {{ db: any }} ctx @param {any} env @param {any} fetchFn @param {any} link @param {any[]} components
 */
export async function sendComponents(ctx, env, fetchFn, link, components) {
  if (!botOn(env)) return { down: true };
  const ch = await dmChannelOf(ctx, env, fetchFn, link);
  const mark = (dead) =>
    ctx.db.prepare('UPDATE discord_links SET dm_dead = ?1 WHERE discord_id = ?2').bind(dead, link.discord_id).run();
  if ('error' in ch) {
    if (deadRefusal(ch.error)) {
      await mark(1);
      return { dead: true };
    }
    return { down: true };
  }
  const r = await discordApi(env, fetchFn, 'POST', `/channels/${ch.id}/messages`, body(components));
  if (r.ok) {
    if (Number(link.dm_dead) === 1) await mark(0);
    return { sent: true };
  }
  if (deadRefusal(r)) {
    await mark(1);
    return { dead: true };
  }
  if (r.status === 404) {
    await ctx.db.prepare('UPDATE discord_links SET dm_channel = NULL WHERE discord_id = ?1').bind(link.discord_id).run();
  }
  return { down: true };
}

/** One direct message now, from a notice's parts (Settings' Test). */
export const sendDirect = (ctx, env, fetchFn, link, n) => sendComponents(ctx, env, fetchFn, link, noticeCard(n));

/**
 * The clock's send: the oldest waiting notices, up to `max`, each to its user's DMs. A user whose link is gone, who
 * turned that kind off, or whom Discord will not deliver to, is passed over and the notice let go. Answers how many
 * went.
 * @param {{ db: any, nowS: number }} ctx @param {any} env @param {any} fetchFn @param {number} [max]
 */
export async function sendNotices(ctx, env, fetchFn, max = NOTICES_A_MINUTE) {
  if (!botOn(env)) return 0;
  await ctx.db
    .prepare('DELETE FROM discord_notices WHERE sent_at IS NULL AND (made_at < ?1 OR tries >= ?2)')
    .bind(ctx.nowS - NOTICE_STALE_S, NOTICE_TRIES_MAX)
    .run();
  // Taken first, in one statement, so two firings at once never send the same notice. A player's own news goes before
  // a poll's announcement to everyone, which would otherwise hold a letter's notice back behind hundreds.
  const took =
    (
      await ctx.db
        .prepare(
          `UPDATE discord_notices SET claimed_at = ?1 WHERE id IN (
             SELECT n.id FROM discord_notices n JOIN discord_links l ON l.discord_id = n.discord_id
             WHERE n.sent_at IS NULL AND l.dm_dead = 0 AND (n.claimed_at IS NULL OR n.claimed_at < ?2)
             ORDER BY CASE n.kind WHEN 'polls' THEN 1 ELSE 0 END, n.made_at, n.id LIMIT ?3) RETURNING id`,
        )
        .bind(ctx.nowS, ctx.nowS - NOTICE_CLAIM_S, max)
        .all()
    )?.results ?? [];
  if (!took.length) return 0;
  const ids = took.map((r) => Number(r.id));
  const due =
    (
      await ctx.db
        .prepare(
          `SELECT n.id, n.card, n.kind, l.* FROM discord_notices n JOIN discord_links l ON l.discord_id = n.discord_id
           WHERE n.id IN (${ids.map((_, i) => `?${i + 1}`).join(', ')}) ORDER BY CASE n.kind WHEN 'polls' THEN 1 ELSE 0 END, n.made_at, n.id`,
        )
        .bind(...ids)
        .all()
    )?.results ?? [];
  let sent = 0;
  const failed = new Set();
  const began = Date.now();
  const release = (/** @type {number} */ id) =>
    ctx.db.prepare('UPDATE discord_notices SET claimed_at = NULL WHERE id = ?1 AND sent_at IS NULL').bind(id).run();
  for (const row of due) {
    if (failed.has(row.discord_id) || Date.now() - began > NOTICE_SEND_MS) {
      await release(row.id);
      continue;
    }
    let card;
    try {
      card = JSON.parse(row.card);
    } catch {
      card = null;
    }
    if (!card) {
      await ctx.db.prepare('DELETE FROM discord_notices WHERE id = ?1').bind(row.id).run();
      continue;
    }
    const r = await sendComponents(ctx, env, fetchFn, row, card);
    if ('sent' in r) {
      sent++;
      await ctx.db.prepare('UPDATE discord_notices SET sent_at = ?1 WHERE id = ?2').bind(ctx.nowS, row.id).run();
    } else {
      failed.add(row.discord_id);
      await ctx.db.prepare('UPDATE discord_notices SET tries = tries + 1, claimed_at = NULL WHERE id = ?1').bind(row.id).run();
    }
  }
  // A user Discord will not deliver to keeps nothing waiting.
  await ctx.db
    .prepare(
      'DELETE FROM discord_notices WHERE sent_at IS NULL AND discord_id IN (SELECT discord_id FROM discord_links WHERE dm_dead = 1)',
    )
    .run();
  return sent;
}

/** The hour's sweep: sent notices past their keeping, and link codes past their life. @param {{ db: any, nowS: number }} ctx */
export async function sweepNotices(ctx) {
  const a = await ctx.db
    .prepare('DELETE FROM discord_notices WHERE sent_at IS NOT NULL AND sent_at < ?1')
    .bind(ctx.nowS - NOTICE_KEEP_S)
    .run();
  const b = await ctx.db.prepare('DELETE FROM discord_link_codes WHERE expires_at <= ?1').bind(ctx.nowS).run();
  return Number(a?.meta?.changes ?? 0) + Number(b?.meta?.changes ?? 0);
}

/** Rows written in the last seconds may still have a neighbour coming in the same second, so a scan stops short. */
export const NOTICE_SETTLE_S = 2;

/**
 * How far a scan of news may move the links' marks. Several queries can share one mark a link, each bounded to a page,
 * so when a page is full the scan stops before its last row's second, and the rows past it are read next minute. A
 * full page all of one second is taken whole, so the scan never stalls.
 * @param {number} upTo the settled bound already asked of the queries
 * @param {{ rows: any[], limit: number, at: (r: any) => number }[]} pages
 */
export function noticeBound(upTo, pages) {
  let bound = upTo;
  for (const p of pages) {
    if (p.rows.length < p.limit) continue;
    const first = p.at(p.rows[0]);
    const last = p.at(p.rows[p.rows.length - 1]);
    bound = Math.min(bound, last > first ? last - 1 : last);
  }
  return bound;
}

/**
 * The links that want a kind of notice, with the account behind each, a page at a time - for the modules that scan for
 * news (a letter since the mark, a sale since the mark).
 * @param {any} db @param {number} bit @param {number} [limit]
 */
export async function linksWanting(db, bit, limit = 200) {
  return (
    (
      await db
        .prepare('SELECT * FROM discord_links WHERE (dm & ?1) != 0 AND dm_dead = 0 ORDER BY linked_at LIMIT ?2')
        .bind(bit, limit)
        .all()
    )?.results ?? []
  );
}
