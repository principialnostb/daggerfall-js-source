// @ts-check
// The PDA's routes the game itself calls: the link code and the link's state on the account page, and each module's
// own (a poll's vote from the game, the expeditions a character should take up, the map's picture). A module lists its
// routes on its object; this file gathers them so the service's door asks one table.
import { mintLinkCode, discordLinkView, unlinkDiscord } from './pdaLink.js';
import { pdaModules } from './pdaRouter.js';
import { ART_PATH, ART_KINDS, artWords, artBytes } from './journalArt.js';

/**
 * A route: its method, whether it needs no session (`open`), and its answer. `who` is the session's player row, or null
 * on an open route. Answers `{ status, json }`, or a Response for a route that is not JSON.
 * @typedef {{ method: 'GET'|'POST', open?: boolean, handle: (ctx: any, env: any, who: any, body: any, request: Request) => Promise<{ status?: number, json?: any } | Response> }} PdaRoute
 */

const fromResult = (/** @type {any} */ r, /** @type {Record<string, number>} */ statuses = {}) =>
  r && 'error' in r ? { status: statuses[r.error] ?? 400, json: { error: r.error } } : { status: 200, json: r };

/** @type {Record<string, PdaRoute>} */
const LINK_ROUTES = {
  '/v1/discord/link': {
    method: 'GET',
    handle: async (ctx, _env, who) => ({ status: 200, json: await discordLinkView(ctx, who) }),
  },
  '/v1/discord/code': {
    method: 'POST',
    handle: async (ctx, _env, who) =>
      fromResult(await mintLinkCode(ctx, who), { 'discord-needs-account': 403, banned: 403, 'discord-rate': 429 }),
  },
  '/v1/discord/unlink': {
    method: 'POST',
    handle: async (ctx, _env, who) => fromResult(await unlinkDiscord(ctx, who.id), { 'not-linked': 404 }),
  },
};

/** A worn-paper picture, open as the map is: Discord fetches it by the signed address the page was drawn with. */
const artRoute = (/** @type {string} */ kind) => ({
  method: /** @type {'GET'} */ ('GET'),
  open: true,
  handle: async (/** @type {any} */ _ctx, /** @type {any} */ env, /** @type {any} */ _who, /** @type {any} */ _body, /** @type {Request} */ request) => {
    const q = new URL(request.url).searchParams;
    const words = artWords(env, kind, q.get('p') ?? '', q.get('s') ?? '');
    if (!words) return { status: 404, json: { error: 'not-found' } };
    try {
      return new Response(await artBytes(kind, words), {
        status: 200,
        headers: {
          'content-type': 'image/png',
          // the words are in the address, so the picture never changes under it
          'cache-control': 'public, max-age=604800, immutable',
          'access-control-allow-origin': '*',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch (e) {
      console.warn('[journal] a picture', /** @type {any} */ (e)?.message ?? e);
      return { status: 503, json: { error: 'art-unavailable' } };
    }
  },
});
/** @type {Record<string, PdaRoute>} */
const ART_ROUTES = Object.fromEntries(ART_KINDS.map((k) => [`${ART_PATH}${k}.png`, artRoute(k)]));

/** Every route, the link's and each module's. Built once, on first ask. @type {Map<string, PdaRoute> | null} */
let table = null;
export function pdaRoutes() {
  if (table) return table;
  table = new Map([...Object.entries(LINK_ROUTES), ...Object.entries(ART_ROUTES)]);
  for (const m of pdaModules()) {
    const own = /** @type {any} */ (m).routes;
    if (!own) continue;
    for (const [path, r] of Object.entries(own)) {
      if (table.has(path)) throw new Error(`two PDA routes at ${path}`);
      table.set(path, r);
    }
  }
  return table;
}
/** The route at a path, or null. @param {string} path */
export const pdaRouteOf = (path) => pdaRoutes().get(path) ?? null;

/**
 * A route answered. The caller has resolved the session for a route that is not open, and refused a banned or frozen
 * account already.
 * @param {any} ctx @param {any} env @param {string} path @param {any} who @param {any} body @param {Request} request
 * @returns {Promise<{ status: number, json: any } | Response>}
 */
export async function answerPdaRoute(ctx, env, path, who, body, request) {
  const r = pdaRouteOf(path);
  if (!r) return { status: 404, json: { error: 'not-found' } };
  if (request.method !== r.method) return { status: 405, json: { error: 'method' } };
  const out = await r.handle(ctx, env, who, body, request);
  if (out instanceof Response) return out;
  return { status: out.status ?? 200, json: out.json ?? {} };
}
