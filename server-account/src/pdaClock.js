// @ts-check
// The PDA's share of the service's clocks. Each minute: the Terminal kept, each module's own minute (news into the
// outbox, polls closed, revenants back), the mail's news, and then the outbox sent. Each hour: each module's sweep and
// the outbox's. A module's failure is logged and the next runs, so one broken part never stops the rest.
import { seaMinute } from './seaJournal.js';
import { pdaModules } from './pdaRouter.js';
import { ensureTerminal, checkActivity } from './pdaTerminal.js';
import { sendNotices, sweepNotices, NOTICES_A_MINUTE } from './pdaNotices.js';
import { mailNotices } from './pdaMail.js';

/** @typedef {{ db: any, nowS: number, rand: (b: Uint8Array) => void, budget?: () => boolean, subtle?: SubtleCrypto }} ClockCtx */

const fetchOf = (/** @type {any} */ ctx) => ctx.fetchFn ?? ((u, i) => globalThis.fetch(u, i));

/** One step, its failure logged. */
async function step(/** @type {string} */ name, /** @type {() => Promise<number>} */ fn) {
  try {
    return Number(await fn()) || 0;
  } catch (e) {
    console.error(`[pda] ${name} failed:`, /** @type {any} */ (e)?.stack ?? e);
    return 0;
  }
}

/** The minute. @param {ClockCtx & { fetchFn?: any }} ctx @param {any} env */
export async function pdaMinute(ctx, env) {
  const fetchFn = fetchOf(ctx);
  const c = { ...ctx, subtle: ctx.subtle ?? globalThis.crypto.subtle };
  // The firing's statements are shared with every other job: once this job's share is spent, the rest wait a minute.
  // The outbox goes first, so what earlier minutes found is sent even on a minute with no share left for scans.
  const more = () => typeof ctx.budget !== 'function' || ctx.budget();
  const steps = [
    ['terminal', () => ensureTerminal(c, env, fetchFn)],
    ['send', () => sendNotices(c, env, fetchFn, NOTICES_A_MINUTE)],
    ['mail', () => mailNotices(c)],
    ['sea', () => seaMinute(c)],
    ...pdaModules()
      .filter((m) => typeof (/** @type {any} */ (m).minute) === 'function')
      .map((m) => [m.key, () => /** @type {any} */ (m).minute(c, env, fetchFn)]),
  ];
  let n = 0;
  for (const [name, fn] of /** @type {[string, () => Promise<number>][]} */ (steps)) {
    if (!more()) break;
    n += await step(name, fn);
  }
  return n;
}

/** The hour. @param {ClockCtx} ctx @param {any} env */
export async function pdaHour(ctx, env) {
  let n = await step('notices', () => sweepNotices(ctx));
  n += await step('activity', () => checkActivity(ctx, env, fetchOf(ctx)));
  for (const m of pdaModules()) {
    const hour = /** @type {any} */ (m).hour;
    if (typeof hour === 'function') n += await step(`${m.key} sweep`, () => hour(ctx, env));
  }
  return n;
}
