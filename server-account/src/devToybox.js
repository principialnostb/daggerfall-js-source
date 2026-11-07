// @ts-check
// THE TOYBOX'S GRANT, THE SERVICE'S SIDE: a developer's game session sends a piece the window made (toyboxItem.js
// buildToyboxItem) to an account, their own when the box was empty. Developers alone; every act is a staff_audit row.
// The piece never goes straight into a record: seizing a live record (realm.js seizeRealmRecord) refuses its tab's
// next save. It goes as a piece of the server's post, which a live session claims under its own lease (post.js
// claimPost), the record and the claim in one batch. The game claims a grant to oneself at once; another account
// finds it in their mailbox, playing now or later.
import { isDeveloper } from './titles.js';
import { displayName } from './accounts.js';
import { auditStatement } from './staff.js';
import { REALM_PLAYING_S } from './realm.js';
import { buildToyboxItem } from '../../src/systems/toybox/toyboxItem.js';
import { isGuestShaped, isHandleShaped } from '../../src/net/handleShape.js';
import { POST_SENDER } from '../../src/net/postLaw.js';

/** The route the game's session calls. */
export const DEV_GRANT_PATH = '/v1/dev/item/grant';
/** A grant's batch in the post: this, then the piece's own id. */
export const DEV_GRANT_BATCH = 'toybox-';
/** The audit row's act. */
export const DEV_GRANT_ACT = 'toybox-give';
/** The words a grant is written with (within the post's 80 and 1,200). */
export const devGrantSubject = (/** @type {string} */ name) => `A gift: ${name}`.slice(0, 80);
export const DEV_GRANT_BODY = [
  'A developer made this piece for you.',
  '',
  'Claim it and it goes into the pack of the online character you are playing.',
  '',
  `- ${POST_SENDER}`,
].join('\n');
/** The refusals' statuses (a bad body is 400). */
export const DEV_GRANT_STATUS = Object.freeze({ 'not-developer': 403, 'no-player': 404, ambiguous: 409 });

/** A post id from the service's random bytes: 24 hex, the operator's own `lower(hex(randomblob(12)))` shape. */
const postIdOf = (/** @type {(b: Uint8Array<ArrayBuffer>) => Uint8Array} */ rand) =>
  [...rand(new Uint8Array(12))].map((x) => x.toString(16).padStart(2, '0')).join('');

/** The account `to` names: the actor for an empty one, else the handle's. @param {any} db @param {any} actor @param {unknown} to */
async function targetOf(db, actor, to) {
  if (to === undefined || to === null || (typeof to === 'string' && !to.trim())) return { row: actor };
  if (typeof to !== 'string') return { error: 'body' };
  const name = to.trim();
  if (isGuestShaped(name)) return { error: 'dev-target-guest' };
  if (!isHandleShaped(name)) return { error: 'body' };
  const { results = [] } = await db.prepare('SELECT * FROM players WHERE handle_lc = ? LIMIT 2').bind(name.toLowerCase()).all();
  if (!results.length) return { error: 'no-player' };
  if (results.length > 1) return { error: 'ambiguous' };
  return { row: results[0] };
}

/**
 * GRANT ONE PIECE: `{ spec, to? }`, `to` an account's handle or nothing for one's own. Answers `{ ok, post, item, to:
 * { account, name, self }, playing }` (`playing`: a character of theirs in play now), or a refusal: `not-developer`,
 * `body`, the spec's own words, `toybox-unlawful` with the law's `findings`, `dev-target-guest`, `no-player`, `ambiguous`.
 * @param {{ db: any, nowS: number, rand: (b: Uint8Array<ArrayBuffer>) => Uint8Array }} ctx
 * @param {any} actor the session's player row @param {any} env @param {any} body
 */
export async function devGrantItem({ db, nowS, rand }, actor, env, body) {
  if (!isDeveloper(actor, env)) return { error: 'not-developer' };
  const refuse = async (/** @type {string|null} */ target, /** @type {any} */ detail, /** @type {any} */ refusal) => {
    await auditStatement(db, nowS, { actor, role: 'admin', act: DEV_GRANT_ACT, target, detail: { ...detail, error: refusal.error }, outcome: 'failed' }).run();
    return refusal;
  };
  const asked = { template: Number.isSafeInteger(body?.spec?.template) ? body.spec.template : null, door: 'game' };
  const made = buildToyboxItem(body?.spec, { rand });
  if (!('item' in made)) return refuse(null, asked, { error: made.error });
  const item = made.item;
  const detail = { ...asked, name: item.name ?? null, key: item.uid ?? null, bound: item.bound === true };
  if (made.findings.length) return refuse(null, { ...detail, findings: made.findings }, { error: 'toybox-unlawful', findings: made.findings });
  const found = await targetOf(db, actor, body?.to);
  if (!('row' in found)) return refuse(null, detail, found);
  const target = found.row;
  if (!target?.handle) return refuse(target?.id ?? null, detail, { error: 'dev-target-guest' });
  const id = postIdOf(rand);
  await db.batch([
    db
      .prepare(
        `INSERT INTO server_post (id, to_id, batch, sender, subject, body, item, sent_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(id, target.id, DEV_GRANT_BATCH + id, POST_SENDER, devGrantSubject(String(item.name ?? 'Item')), DEV_GRANT_BODY, JSON.stringify(item), nowS),
    auditStatement(db, nowS, { actor, role: 'admin', act: DEV_GRANT_ACT, target: target.id, detail: { ...detail, post: id } }),
  ]);
  const live = await db
    .prepare('SELECT COUNT(*) AS n FROM realm_characters WHERE player = ? AND lease IS NOT NULL AND lease_at > ?')
    .bind(target.id, nowS - REALM_PLAYING_S)
    .first();
  return {
    ok: true,
    post: id,
    item,
    to: { account: target.id, name: displayName(target), self: target.id === actor.id },
    playing: (Number(live?.n) || 0) > 0,
  };
}
