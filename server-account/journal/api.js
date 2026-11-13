// @ts-check
// The journal's asks of the service: every one under /v1/journal/, through Discord's proxy, which signs who is asking.
// Where the proxy says nothing, a ticket from Discord's sign-in rides along. A lapsed proxy ticket is renewed through
// Discord once and the ask sent again.

const BASE = '/v1/journal/';
/** @type {{ ticket: string | null, renew: (() => Promise<unknown>) | null, renewing: Promise<unknown> | null }} */
const held = { ticket: null, renew: null, renewing: null };
/** How long a renewal of the proxy's ticket is waited on, ms. */
const RENEW_MS = 8000;
/** One renewal at a time, whatever number of asks found the ticket lapsed; it never hangs an ask. */
function renewOnce() {
  if (!held.renew) return Promise.resolve();
  held.renewing ??= Promise.race([held.renew(), new Promise((r) => setTimeout(r, RENEW_MS))])
    .catch(() => {})
    .finally(() => (held.renewing = null));
  return held.renewing;
}
try {
  held.ticket = globalThis.sessionStorage?.getItem('journal-ticket') ?? null;
} catch {
  held.ticket = null;
}

/** The ticket to send from now on (null to forget it). @param {string | null} t */
export function useTicket(t) {
  held.ticket = t;
  try {
    if (t) globalThis.sessionStorage?.setItem('journal-ticket', t);
    else globalThis.sessionStorage?.removeItem('journal-ticket');
  } catch {
    /* a frame without storage keeps the ticket in memory alone */
  }
}
/** How a lapsed proxy ticket is renewed (Discord's command). @param {() => Promise<unknown>} fn */
export const onRenew = (fn) => (held.renew = fn);

/** An ask that failed, with the service's word for why. */
export class AskError extends Error {
  /** @param {number} status @param {any} body */
  constructor(status, body) {
    super(String(body?.error ?? `status ${status}`));
    this.status = status;
    this.body = body;
  }
}

/**
 * One ask. GET without a body, POST with one. Answers the JSON, or throws an AskError.
 * @param {string} route @param {any} [body] @param {{ retried?: boolean }} [o]
 */
export async function ask(route, body, o = {}) {
  /** @type {Record<string, string>} */
  const headers = { accept: 'application/json' };
  if (held.ticket) headers.authorization = `Journal ${held.ticket}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${BASE}${route}`, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new AskError(0, { error: 'offline' });
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && json?.error === 'proxy-expired' && !o.retried && held.renew) {
    await renewOnce();
    return ask(route, body, { retried: true });
  }
  if (!res.ok) throw new AskError(res.status, json);
  return json;
}
