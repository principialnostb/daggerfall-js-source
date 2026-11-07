// @ts-check
// THE TOYBOX'S EVENTS, THE SERVICE'S SIDE: a developer's own game session stages an invasion or a dragon attack at a
// city. The event is a staff event with its toybox fields (src/net/staffEvent/toyboxEvent.js), stored and audited as
// the Staff Panel's events are (staffEvents.js), then signed as a `sevent` order and pushed to the hub, which keeps it in
// its book and says it to every player online.
//
// A developer alone (titles.js isDeveloper). Every staging and every refusal after that check is a staff_audit row.
import { isDeveloper } from './titles.js';
import { displayName } from './accounts.js';
import { auditStatement } from './staff.js';
import { pushLaw } from './sanctions.js';
import { signingKey } from './signing.js';
import { mintEventId } from './staffEvents.js';
import { mintStaffEventOrder } from '../../src/net/identityToken.js';
import { toyboxStaffEvent } from '../../src/net/staffEvent/toyboxEvent.js';

/** The route the game's session calls. */
export const DEV_EVENT_PATH = '/v1/dev/event';
/** The audit row's act. */
export const DEV_EVENT_ACT = 'toybox-event';
/** The refusals' statuses (any other is 400). */
export const DEV_EVENT_STATUS = Object.freeze({
  'not-developer': 403,
  'event-full': 409,
  'event-relay-old': 409,
  'event-relay': 503,
});

/**
 * STAGE ONE: `{ kind: 'invasion'|'dragon', city: { rg, loc, px, py, nm }, family? }`. Answers `{ ok, event }` - the event
 * as the hub's book holds it - or a refusal: `not-developer`, `event-bad-<field>` (the law's word), `event-full` (the
 * book holds its most), `event-relay` (the relay did not answer), `event-relay-old` (a relay that drops the toybox's
 * fields: the event is ended there at once).
 * @param {any} ctx @param {any} me the session's player @param {any} env @param {any} body
 */
export async function devStageEvent(ctx, me, env, body) {
  const { db, nowS, subtle, rand } = ctx;
  if (!isDeveloper(me, env)) return { error: 'not-developer' };
  const audit = (/** @type {object} */ detail, outcome = /** @type {'ok'|'failed'} */ ('ok')) =>
    auditStatement(db, nowS, { actor: me, role: 'admin', act: DEV_EVENT_ACT, detail, outcome });
  const id = mintEventId(rand);
  const by = displayName(me);
  const made = toyboxStaffEvent({ kind: body?.kind, place: body?.city, family: body?.family, id, at: nowS * 1000, by });
  if ('error' in made) {
    await audit({ kind: String(body?.kind ?? '').slice(0, 16), error: made.error }, 'failed').run();
    return { error: `event-bad-${made.error}` };
  }
  const staged = made.ev;
  const detail = { id, kind: body.kind, place: staged.nm, rg: staged.rg, loc: staged.loc, family: body.family ?? null, go: staged.go };
  await db.batch([
    db
      .prepare(
        "INSERT INTO staff_events (id, at, staff_id, staff_name, ev, state, kills, boss) VALUES (?1, ?2, ?3, ?4, ?5, 'starting', 0, 'none')",
      )
      .bind(id, nowS, me.id, by, JSON.stringify(staged)),
    audit(detail),
  ]);
  /** An order to the hub: `{ took, l, why }`. @param {{ op: string, ev?: any, ei?: string }} order */
  const ask = async (order) => {
    const key = await signingKey(env, subtle);
    const signed = key ? await mintStaffEventOrder({ s: me.id, ...order }, key, { subtle, nowS }) : null;
    /** @type {any} */
    let said = null;
    const hear = (/** @type {any} */ answer) => {
      said = answer;
    };
    const took = await pushLaw(env, (url, init) => globalThis.fetch(url, init), signed, hear, hear);
    return { took, l: Array.isArray(said?.l) ? said.l : [], why: said?.why ?? null };
  };
  const said = await ask({ op: 'start', ev: staged });
  const held = said.l.find((/** @type {any} */ e) => e?.id === id);
  const old = said.took && held && held.tb !== staged.tb; // an older relay kept the event and dropped its fields
  if (old) await ask({ op: 'end', ei: id });
  const why = !said.took ? (said.why === 'full' ? 'event-full' : 'event-relay') : old ? 'event-relay-old' : null;
  await db
    .prepare('UPDATE staff_events SET state = ?2, ended_at = ?3, ended_by = ?4 WHERE id = ?1')
    .bind(id, why ? 'failed' : 'live', why ? nowS : null, why)
    .run();
  if (why) {
    await audit({ ...detail, error: why }, 'failed').run();
    return { error: why };
  }
  return { ok: true, event: staged };
}
