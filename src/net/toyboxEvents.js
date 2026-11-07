// @ts-check
// THE TOYBOX'S INVASION AND DRAGON ATTACK, STARTED: online through the developer's own route on the account service
// (server-account/src/devEvents.js), which signs the event for the hub; offline through the local runner
// (systems/toybox/localToyboxEvents.js), which is the hub and the cell for this one player. Either way the event then
// comes to the game as the hub's book does, and runs as a staff event runs.
import { relaySupportsToyboxEvents } from './staffEvent/staffEventLaw.js';
import { call, storedSession, serviceBase } from './accountClient.js';
import { toyboxCityNamed } from '../systems/toybox/toyboxCities.js';

/** The developer's route (server-account/src/devEvents.js DEV_EVENT_PATH). */
export const TOYBOX_EVENT_PATH = '/v1/dev/event';

/**
 * The account service's one call for it, bound to this device's stored session: `post(body)` answers
 * accountClient.js call's `{ ok, data }` or `{ ok: false, error }`.
 * @param {{ fetch: any, storage: any }} o
 */
export function accountToyboxEvents({ fetch, storage }) {
  return {
    /** @param {any} body */
    post: async (body) => {
      const session = storedSession(storage);
      if (!session) return { ok: false, error: 'no-session' };
      return call({ fetch, base: serviceBase(storage), secret: session.secret }, TOYBOX_EVENT_PATH, body);
    },
  };
}

/**
 * START ONE: `spec.city` a name from toyboxCities.js's list (`cities`) or the place's fields. Online the route is asked,
 * if the relay keeps a toybox event's fields; offline the local runner stages it. Answers `{ ok: true, event }` or
 * `{ ok: false, error }` (`city`, `relay-old`, the route's or the runner's word).
 * @param {{ kind: string, city: any, family?: string }} spec
 * @param {{ online: () => boolean, relayOk?: () => boolean, relayVersion?: () => (string|null), post?: (body: any) => Promise<any>, local?: { start: (spec: any) => any } | null, cities?: () => any[] }} deps
 * @returns {Promise<{ ok: true, event: any } | { ok: false, error: string }>}
 */
export async function startToyboxEvent(spec, deps) {
  const city =
    typeof spec?.city === 'string' ? toyboxCityNamed(deps.cities?.() ?? [], spec.city) : (spec?.city ?? null);
  if (!city) return { ok: false, error: 'city' };
  const body = { kind: spec.kind, city, ...(spec.kind === 'invasion' ? { family: spec.family } : {}) };
  if (deps.online()) {
    const kept = deps.relayOk ? deps.relayOk() : relaySupportsToyboxEvents(deps.relayVersion?.() ?? null); // online.js toyboxEvOk
    if (!kept) return { ok: false, error: 'relay-old' };
    if (!deps.post) return { ok: false, error: 'no-session' };
    const answer = await deps.post(body);
    return answer?.ok && answer.data?.event ? { ok: true, event: answer.data.event } : { ok: false, error: answer?.error ?? 'server' };
  }
  if (!deps.local) return { ok: false, error: 'offline' };
  const started = deps.local.start(body);
  return started?.ok ? { ok: true, event: started.event } : { ok: false, error: started?.error ?? 'event' };
}
