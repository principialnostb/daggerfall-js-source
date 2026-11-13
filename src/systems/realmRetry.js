// @ts-check
// When the realm service fails, which failures are waited out and what the player is told about the rest. The boot's
// join and save, and a copy to offline, ask through this. The loading screen and the copy's popup say the words.
import { busyWaitMs } from '../net/busyLaw.js';
import { t } from './textManager.js';

/** How long a busy realm is asked again before the door says why. It stays under the loading screen's own hold. */
export const REALM_BUSY_MAX_MS = 300_000;

/** Said while the boot waits on a busy or slow realm. */
export const realmBootBusyText = () => t('realm.bootBusy', 'Servers are currently experiencing issues, please wait...');
/** Said by the popup while a realm act waits for its answer. */
export const realmContactingText = () => t('realm.contacting', 'Contacting server...');
/** Said when the realm failed in a way that may clear later. */
export const realmIssuesText = () => t('realm.issues', 'Our servers are experiencing issues, please try again later...');
/** Said when the boot met a 4xx answer. */
export const realmMissingText = () => t('realm.missing', 'Server cannot be found currently.');
/** The popup's one button once it has said why. */
export const realmOkText = () => t('realm.ok', 'OK');

/**
 * Whether an answer is waited out: a 5xx, the account's request rate (429, which asks the caller to wait), or no answer
 * while the device is online. A 5xx page that carries no CORS headers reaches a browser as no answer at all. A device
 * that knows it is offline is not held for minutes.
 * @param {{ ok?: boolean, error?: string, status?: number }} answer @param {() => boolean} [online]
 */
export function realmMayClear(answer, online = () => globalThis.navigator?.onLine !== false) {
  const status = answer?.status ?? 0;
  if (status >= 500 || status === 429) return true;
  return answer?.error === 'offline' && online();
}

/**
 * The words for a realm failure, or null for a refusal this device made itself (signed out, a private run, no room for
 * a save), which keeps its own words. `missing`: a 4xx answer says the server cannot be found (the boot's rule).
 * @param {{ error?: string, status?: number }} answer @param {{ missing?: boolean }} [opts]
 */
export function realmFailureText(answer, { missing = false } = {}) {
  const status = answer?.status;
  if (missing && Number.isInteger(status) && status >= 400 && status < 500 && status !== 429) return realmMissingText();
  if (Number.isInteger(status) || answer?.error === 'offline' || answer?.error === 'server') return realmIssuesText();
  return null;
}

/**
 * One realm ask, asked again while realmMayClear says so. The waits are the busy gate's (busyWaitMs), so a crowd of
 * clients does not ask again in step. `onBusy` hears the first wait. Past `busyMaxMs`, or once `cancelled()`, the last
 * answer stands.
 * @param {() => Promise<any>} ask
 * @param {{ onBusy?: () => void, wait?: (ms: number) => Promise<void>, now?: () => number, rand?: () => number, busyMaxMs?: number, online?: () => boolean, cancelled?: () => boolean }} [at]
 */
export async function askThroughBusy(ask, { onBusy = () => {}, wait = (delayMs) => new Promise((resolve) => { setTimeout(resolve, delayMs); }), now = () => Date.now(), rand = Math.random, busyMaxMs = REALM_BUSY_MAX_MS, online, cancelled = () => false } = {}) {
  const until = now() + busyMaxMs;
  for (let tries = 1; ; tries++) {
    const answer = await ask();
    if (answer.ok || cancelled() || !realmMayClear(answer, online)) return answer;
    const delayMs = busyWaitMs(tries, rand());
    if (now() + delayMs > until) return answer;
    if (tries === 1) onBusy();
    await wait(delayMs);
    if (cancelled()) return answer;
  }
}
