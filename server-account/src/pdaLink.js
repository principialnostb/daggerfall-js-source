// @ts-check
// A game account linked to a Discord user. The game proves the account (its session mints a code); Discord proves the
// user (it signs every interaction). The player carries the code from one to the other, so the service needs no Discord
// login page and no second secret. A code lives ten minutes, is kept only as its hash, and works once.
//
// Linking moves a link that stood before: a Discord user holds one account and an account one Discord user. The account
// is told in its game mailbox each time, so a link made by someone who stole a code cannot go unseen.
import { accountKind, displayName, overRate } from './accounts.js';
import { isBanned } from './sanctions.js';
import { POST_SENDER } from '../../src/net/postLaw.js';

/** How long a code may wait to be typed. */
export const LINK_CODE_TTL_S = 600;
/** A code's letters: no 0, O, 1 or I, which are easy to misread. */
export const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** A code's length, shown as two groups of four. */
export const LINK_CODE_LENGTH = 8;
/** Codes an account may ask for in an hour. */
export const LINK_MINT_MAX = 10;
/** Codes a Discord user may try in ten minutes, so a code cannot be guessed. */
export const LINK_TRY_MAX = 6;
export const LINK_TRY_WINDOW_S = 600;
/** Each kind of direct message, by its bit in `discord_links.dm`, with the words its switch is shown with. */
export const NOTICE_KINDS = Object.freeze({
  mail: Object.freeze({ bit: 1, label: 'Letters', hint: 'A letter arrives' }),
  post: Object.freeze({ bit: 2, label: 'Developers’ post', hint: 'A piece arrives, perhaps with an item' }),
  market: Object.freeze({ bit: 4, label: 'Market', hint: 'Something of yours sells' }),
  exp: Object.freeze({ bit: 8, label: 'Expeditions', hint: 'A revenant comes back or meets trouble' }),
  guild: Object.freeze({ bit: 16, label: 'Guild', hint: 'An invitation or a request' }),
  polls: Object.freeze({ bit: 32, label: 'Polls', hint: 'A new poll opens' }),
  feedback: Object.freeze({ bit: 64, label: 'Feedback', hint: 'The staff answer your feedback' }),
  sea: Object.freeze({ bit: 128, label: 'The sea', hint: 'Another player attacks your ship' }),
});
/** Direct messages a new link wants: every kind. Reminders of world events are asked for one by one. */
export const LINK_DM_DEFAULT = Object.values(NOTICE_KINDS).reduce((n, k) => n | k.bit, 0);
/** Whether a link wants a kind of direct message. @param {any} link @param {keyof typeof NOTICE_KINDS} kind */
export const wantsDm = (link, kind) => (Number(link?.dm) & NOTICE_KINDS[kind].bit) !== 0 && Number(link?.dm_dead) !== 1;
const CODE_RE = new RegExp(`^[${LINK_CODE_ALPHABET}]{${LINK_CODE_LENGTH}}$`);
const SNOWFLAKE_RE = /^\d{5,25}$/;

/** A code as typed, made comparable: case, spaces and dashes do not count. Null for anything that cannot be one. */
export function normalCode(/** @type {unknown} */ typed) {
  const s = String(typed ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '');
  return CODE_RE.test(s) ? s : null;
}
/** A code as the game shows it: `ABCD-EFGH`. */
export const shownCode = (/** @type {string} */ code) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** The hash a code is kept as. @param {SubtleCrypto} subtle @param {string} code */
export async function codeHash(subtle, code) {
  const d = await subtle.digest('SHA-256', new TextEncoder().encode(`dfo-link1\n${code}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A fresh code from the service's randomness. @param {(b: Uint8Array) => void} rand */
export function mintCode(rand) {
  const bytes = new Uint8Array(LINK_CODE_LENGTH);
  rand(bytes);
  return [...bytes].map((b) => LINK_CODE_ALPHABET[b % LINK_CODE_ALPHABET.length]).join('');
}

/**
 * The game asks for a code: a registered account's, not banned. Any code it held before is gone.
 * @param {{ db: any, rand: (b: Uint8Array) => void, subtle: SubtleCrypto, nowS: number }} ctx @param {any} player
 */
export async function mintLinkCode(ctx, player) {
  if (accountKind(player) !== 'linked') return { error: 'discord-needs-account' };
  if (isBanned(player, ctx.nowS)) return { error: 'banned' };
  if (await overRate(ctx, `dlink:${player.id}`, LINK_MINT_MAX, 3600)) return { error: 'discord-rate' };
  const code = mintCode(ctx.rand);
  const expiresAt = ctx.nowS + LINK_CODE_TTL_S;
  await ctx.db.batch([
    ctx.db.prepare('DELETE FROM discord_link_codes WHERE player_id = ?1 OR expires_at <= ?2').bind(player.id, ctx.nowS),
    ctx.db
      .prepare('INSERT INTO discord_link_codes (code_hash, player_id, made_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(await codeHash(ctx.subtle, code), player.id, ctx.nowS, expiresAt),
  ]);
  return { ok: true, code: shownCode(code), expiresAt };
}

/** What the game shows of an account's link. @param {{ db: any }} ctx @param {any} player */
export async function discordLinkView({ db }, player) {
  const row = await db
    .prepare('SELECT discord_name, linked_at FROM discord_links WHERE player_id = ?1')
    .bind(player.id)
    .first();
  return {
    linked: !!row,
    name: row ? String(row.discord_name || '') : null,
    linkedAt: row ? Number(row.linked_at) : null,
    canLink: accountKind(player) === 'linked',
  };
}

/** The Discord user's name as an interaction carries it: the unique username, never a nickname. @param {any} user */
export const discordNameOf = (user) => String(user?.username ?? '').slice(0, 40);

/** The in-game letter that tells an account its link changed. */
function linkLetter(/** @type {any} */ db, /** @type {string} */ playerId, /** @type {string} */ batch, subject, words, nowS) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO server_post (id, to_id, batch, sender, subject, body, item, sent_at, ware)
       VALUES (lower(hex(randomblob(12))), ?1, ?2, ?3, ?4, ?5, NULL, ?6, NULL)`,
    )
    .bind(playerId, batch.slice(0, 48), POST_SENDER, subject, words, nowS);
}

/**
 * A code typed in Discord: the account it was minted for is linked to `user`. A code is spent whether or not the link
 * is made after it, and a wrong code costs a try. Answers `{ ok, player }` or `{ error }`.
 * @param {{ db: any, subtle: SubtleCrypto, nowS: number }} ctx @param {any} user Discord's user object @param {unknown} typed
 */
export async function redeemLinkCode(ctx, user, typed) {
  const discordId = String(user?.id ?? '');
  if (!SNOWFLAKE_RE.test(discordId)) return { error: 'no-user' };
  if (await overRate(ctx, `dcode:${discordId}`, LINK_TRY_MAX, LINK_TRY_WINDOW_S)) return { error: 'discord-rate' };
  const code = normalCode(typed);
  if (!code) return { error: 'bad-code' };
  const hash = await codeHash(ctx.subtle, code);
  const held = await ctx.db
    .prepare('DELETE FROM discord_link_codes WHERE code_hash = ?1 RETURNING player_id, expires_at')
    .bind(hash)
    .first();
  if (!held || Number(held.expires_at) <= ctx.nowS) return { error: 'bad-code' };
  const player = await ctx.db.prepare('SELECT * FROM players WHERE id = ?1').bind(held.player_id).first();
  if (!player || accountKind(player) !== 'linked') return { error: 'bad-code' };
  if (isBanned(player, ctx.nowS)) return { error: 'banned' };
  const name = discordNameOf(user);
  const before = await ctx.db
    .prepare('SELECT discord_id, player_id FROM discord_links WHERE discord_id = ?1 OR player_id = ?2')
    .bind(discordId, player.id)
    .all();
  const moved = (before?.results ?? []).filter((r) => r.player_id !== player.id);
  // Every Discord user whose link ends here (this one's old account, or this account's old user) keeps nothing waiting:
  // a notice queued for the old pairing would tell the wrong person. Reminders are a Discord user's own, kept unless
  // that user is left with no link.
  const losing = (before?.results ?? []).filter((r) => r.discord_id !== discordId).map((r) => r.discord_id);
  await ctx.db.batch([
    ctx.db.prepare('DELETE FROM discord_notices WHERE discord_id = ?1 AND sent_at IS NULL').bind(discordId),
    ...losing.flatMap((id) => [
      ctx.db.prepare('DELETE FROM discord_notices WHERE discord_id = ?1 AND sent_at IS NULL').bind(id),
      ctx.db.prepare('DELETE FROM discord_reminders WHERE discord_id = ?1').bind(id),
    ]),
    ctx.db.prepare('DELETE FROM discord_links WHERE discord_id = ?1 OR player_id = ?2').bind(discordId, player.id),
    ctx.db
      .prepare(
        `INSERT INTO discord_links (discord_id, player_id, discord_name, linked_at, dm, mail_seen, post_seen, sale_seen, invite_seen)
         VALUES (?1, ?2, ?3, ?4, ?5, ?4, ?4, ?4, ?4)`,
      )
      .bind(discordId, player.id, name, ctx.nowS, LINK_DM_DEFAULT),
    linkLetter(
      ctx.db,
      player.id,
      `discord-link-${discordId}-${ctx.nowS}`,
      'Linked to Discord',
      `Your account is now linked to the Discord user ${name || discordId}. If this was not you, unlink it from Account, then change your password.`,
      ctx.nowS,
    ),
    ...moved.map((r) =>
      linkLetter(
        ctx.db,
        r.player_id,
        `discord-unlink-${discordId}-${ctx.nowS}`,
        'Unlinked from Discord',
        `Your account is no longer linked to Discord. The Discord user ${name || discordId} linked another account.`,
        ctx.nowS,
      ),
    ),
  ]);
  return { ok: true, player, name };
}

/** The account linked to a Discord user, its player row whole, with the link's own columns beside it. @param {any} db @param {unknown} discordId */
export async function linkOf(db, discordId) {
  const id = String(discordId ?? '');
  if (!SNOWFLAKE_RE.test(id)) return null;
  const link = await db.prepare('SELECT * FROM discord_links WHERE discord_id = ?1').bind(id).first();
  if (!link) return null;
  const player = await db.prepare('SELECT * FROM players WHERE id = ?1').bind(link.player_id).first();
  return player ? { link, player } : null;
}

/** The Discord user linked to an account, or null. @param {any} db @param {string} playerId */
export async function discordOfPlayer(db, playerId) {
  return db.prepare('SELECT * FROM discord_links WHERE player_id = ?1').bind(playerId).first();
}

/** Unlinked from either side: the game's account page or the PDA's settings. @param {{ db: any, nowS: number }} ctx @param {string} playerId */
export async function unlinkDiscord(ctx, playerId) {
  const gone = await ctx.db
    .prepare('DELETE FROM discord_links WHERE player_id = ?1 RETURNING discord_id')
    .bind(playerId)
    .first();
  if (!gone) return { error: 'not-linked' };
  await ctx.db.prepare('DELETE FROM discord_notices WHERE discord_id = ?1 AND sent_at IS NULL').bind(gone.discord_id).run();
  await ctx.db.prepare('DELETE FROM discord_reminders WHERE discord_id = ?1').bind(gone.discord_id).run();
  return { ok: true };
}

/** A name shown for a linked account. */
export const linkedName = (/** @type {any} */ player) => displayName(player);
