// @ts-check
// THE JOURNAL'S ACTIVITY: the book Discord opens inside itself (server-account/journal/, served by this Worker as its
// static files). Its pages are the bot's own pages, asked for as JSON through the router a Discord press goes through
// (pdaRouter.js journalPress), so every rule a press meets in Discord it meets here. The player is the one Discord's
// proxy vouches for: each request through the proxy carries a payload with the user's id, signed with the application's
// own key (the same DISCORD_PUBLIC_KEY that checks every interaction). Where the proxy says nothing, a player signed in
// through Discord's OAuth carries a ticket this service signed instead.
import { whoOf, journalPress } from './pdaRouter.js';
import { SCREENS } from './pdaFrame.js';
import { ANSWER, C, loreName } from './pdaUi.js';
import { overAccountRate, overAddressLimit } from './accounts.js';
import { hmac256, sha256, ART_PATH } from './journalArt.js';
import { mapBase, CHART_W, CHART_H, MAP_PX } from './journalMap.js';
import { encodeRgba } from './journalArt.js';
import { mapPins } from './pdaMap.js';
import { worldEvents, liveFacts } from './pdaEvents.js';
import { importPublicKey } from '../../src/net/identityToken.js';
import { DISCORD_API, DISCORD_USER_AGENT } from './pdaDiscordApi.js';
import { seaRoutes, sealsOf } from './seaJournal.js';
import { cabinetOf } from './pdaCabinet.js';

/** Every path the Activity asks, under this one prefix (the worn-paper pictures beside it are the bot's). */
export const JOURNAL_PREFIX = '/v1/journal/';
/** @param {string} path */
export const isJournalPath = (path) => path.startsWith(JOURNAL_PREFIX) && !path.startsWith(ART_PATH);
/** Asks one player may make a minute, past the router's own count of presses. */
export const JOURNAL_ASK_MAX = 240;
/** How long a ticket from the OAuth sign-in lasts, seconds. */
export const TICKET_TTL_S = 12 * 3600;
/** The largest body the Activity sends: a letter's words and a form's five fields. */
export const JOURNAL_BODY_MAX = 24 * 1024;
/** Asks a minute from one address that no one vouches for: Discord's proxy is shared, so this is a ceiling on junk. */
export const JOURNAL_UNKNOWN_MAX = 600;
const SNOWFLAKE_RE = /^\d{5,25}$/;

const utf8 = (/** @type {string} */ s) => new TextEncoder().encode(s);
const b64url = (/** @type {Uint8Array} */ b) =>
  globalThis.btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (/** @type {string} */ s) => {
  const bin = globalThis.atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
};
const hexBytes = (/** @type {string} */ h) => new Uint8Array(String(h).match(/../g)?.map((b) => parseInt(b, 16)) ?? []);

// ── Who is asking ────────────────────────────────────────────────────

/** @type {{ raw: string, key: CryptoKey | null }} */
let proxyKey = { raw: '', key: null };

/**
 * The user Discord's proxy vouches for, or why not. The payload is base64 JSON `{ application_id, user_id,
 * is_developer, created_at, expires_at }`; its signature is Ed25519 under the application's key, sent as base64 (or as
 * hex, which Discord's own examples also show), and its timestamp header must be its `created_at`.
 * @param {any} env @param {Headers} headers @param {{ subtle: SubtleCrypto, nowS: number }} io
 * @returns {Promise<{ id: string, developer: boolean } | { error: 'none' | 'proxy-bad' | 'proxy-expired' }>}
 */
export async function proxyUser(env, headers, { subtle, nowS }) {
  const sig = headers.get('x-signature-ed25519');
  const stamp = headers.get('x-signature-timestamp');
  const payload = headers.get('x-discord-proxy-payload');
  if (!sig || !stamp || !payload) return { error: 'none' };
  const raw = String(env?.DISCORD_PUBLIC_KEY ?? '');
  if (!/^[0-9a-f]{64}$/i.test(raw) || payload.length > 2048 || sig.length > 200) return { error: 'proxy-bad' };
  try {
    if (proxyKey.raw !== raw) proxyKey = { raw, key: await importPublicKey(hexBytes(raw), { subtle }) };
    if (!proxyKey.key) return { error: 'proxy-bad' };
    const bytes = fromB64(payload);
    const sigBytes = /^[0-9a-f]{128}$/i.test(sig) ? hexBytes(sig) : fromB64(sig);
    if (!(await subtle.verify({ name: 'Ed25519' }, proxyKey.key, sigBytes, bytes))) return { error: 'proxy-bad' };
    const p = JSON.parse(new TextDecoder().decode(bytes));
    if (String(p?.created_at) !== stamp || !SNOWFLAKE_RE.test(String(p?.user_id ?? ''))) return { error: 'proxy-bad' };
    if (!(Number(p.expires_at) >= nowS)) return { error: 'proxy-expired' };
    return { id: String(p.user_id), developer: p.is_developer === true };
  } catch {
    return { error: 'proxy-bad' };
  }
}

/** @type {Map<string, Uint8Array>} */
const ticketKeys = new Map();
function ticketKey(/** @type {any} */ env) {
  const root = String(env?.IDENTITY_PRIVATE_KEY ?? '');
  if (!root) return null;
  if (!ticketKeys.has(root)) ticketKeys.set(root, sha256(utf8(`dfo-journal-ticket1\n${root}`)));
  return ticketKeys.get(root) ?? null;
}
/** A ticket for a Discord user signed in through OAuth: `jt1.<claims>.<signature>`. Null with no key to sign. */
export function mintTicket(/** @type {any} */ env, /** @type {string} */ discordId, /** @type {number} */ nowS) {
  const key = ticketKey(env);
  if (!key || !SNOWFLAKE_RE.test(discordId)) return null;
  const claims = b64url(utf8(JSON.stringify({ d: discordId, x: nowS + TICKET_TTL_S })));
  return `jt1.${claims}.${b64url(hmac256(key, utf8(`jt1.${claims}`)))}`;
}
/** The Discord user a ticket names, or null for a forged, altered or spent one. */
export function ticketUser(/** @type {any} */ env, /** @type {string} */ ticket, /** @type {number} */ nowS) {
  const key = ticketKey(env);
  const m = /^jt1\.([\w-]{8,200})\.([\w-]{43})$/.exec(String(ticket ?? ''));
  if (!key || !m) return null;
  const want = b64url(hmac256(key, utf8(`jt1.${m[1]}`)));
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ m[2].charCodeAt(i);
  if (diff) return null;
  try {
    const c = JSON.parse(new TextDecoder().decode(fromB64(m[1])));
    return SNOWFLAKE_RE.test(String(c?.d)) && Number(c?.x) >= nowS ? String(c.d) : null;
  } catch {
    return null;
  }
}

/**
 * Who is asking: the proxy's word first, then a ticket. The answer says which, or why neither was taken.
 * @param {any} env @param {Request} request @param {{ subtle: SubtleCrypto, nowS: number }} io
 */
export async function journalUser(env, request, io) {
  const proxied = await proxyUser(env, request.headers, io);
  if ('id' in proxied) return { id: proxied.id, via: 'proxy' };
  const auth = request.headers.get('authorization') ?? '';
  const t = /^Journal (\S+)$/.exec(auth);
  const id = t ? ticketUser(env, t[1], io.nowS) : null;
  if (id) return { id, via: 'ticket' };
  return { error: proxied.error === 'proxy-expired' ? 'proxy-expired' : t ? 'ticket' : proxied.error === 'proxy-bad' ? 'proxy-bad' : 'who' };
}

/** Whether the OAuth sign-in can run: the application's secret is the service's. @param {any} env */
export const oauthOn = (env) => typeof env?.DISCORD_CLIENT_SECRET === 'string' && env.DISCORD_CLIENT_SECRET.length >= 16;

/**
 * Discord's OAuth code, from the Activity's `authorize`, traded for the user it names: the code for an access token
 * (with the application's id and secret), the token for the user. Answers the user's id, the access token the Activity
 * hands back to Discord (`authenticate`), and a ticket of ours.
 * @param {any} env @param {{ code?: unknown, client_id?: unknown }} body @param {number} nowS @param {any} fetchFn
 */
export async function oauthSignIn(env, body, nowS, fetchFn) {
  if (!oauthOn(env)) return { error: 'oauth-off' };
  const code = String(body?.code ?? '');
  const clientId = String(body?.client_id ?? '');
  if (!/^[\w-]{10,100}$/.test(code) || !SNOWFLAKE_RE.test(clientId)) return { error: 'body' };
  const form = new URLSearchParams({ client_id: clientId, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code });
  const tok = await fetchFn(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': DISCORD_USER_AGENT },
    body: form.toString(),
  });
  const t = tok.ok ? await tok.json().catch(() => null) : null;
  const access = String(t?.access_token ?? '');
  if (!access) return { error: 'oauth-refused' };
  const me = await fetchFn(`${DISCORD_API}/users/@me`, { headers: { authorization: `Bearer ${access}`, 'user-agent': DISCORD_USER_AGENT } });
  const u = me.ok ? await me.json().catch(() => null) : null;
  const id = String(u?.id ?? '');
  const ticket = SNOWFLAKE_RE.test(id) ? mintTicket(env, id, nowS) : null;
  if (!ticket) return { error: 'oauth-refused' };
  return { id, access_token: access, ticket, expires: nowS + TICKET_TTL_S };
}

// ── The answers ──────────────────────────────────────────────────────

/** The chapters a player's book holds: every page the bot has, staff's only for staff. @param {any} who */
export function chaptersOf(who) {
  return SCREENS.filter((s) => !s.staff || who?.staff).map((s) => ({ key: s.key, label: s.label, hint: s.hint }));
}

/** The character the book is kept for, as the Activity shows it. @param {any} who */
function characterOf(who) {
  const c = who?.character;
  if (!c) return null;
  const s = c.summary ?? {};
  return { id: String(c.id ?? ''), name: String(c.name ?? ''), level: Number(s.level) || 0, race: s.race ?? '', className: s.className ?? '', region: loreName(s.region ?? '') };
}

/** What opens the book: who it is kept for, and its chapters. @param {any} who */
export function helloOf(who, env) {
  return {
    ok: true,
    user: who.discordId,
    linked: !!who.player,
    name: who.player ? who.name : '',
    staff: !!who.staff,
    barred: who.barred ?? null,
    character: characterOf(who),
    characters: (who.characters ?? []).slice(0, 12).map((/** @type {any} */ c) => ({ id: String(c.id ?? ''), name: String(c.name ?? '') })),
    theme: Number(who?.link?.pda_theme) || null,
    title: who?.link?.pda_title ?? null,
    chapters: chaptersOf(who),
    oauth: oauthOn(env),
  };
}

/** The page a component tree draws: the chapter its menu says it is, or none. */
function chapterOfTree(/** @type {any[]} */ list) {
  let key = null;
  const walk = (/** @type {any[]} */ l) => {
    for (const c of l ?? []) {
      if (key) return;
      if (c?.type === C.SELECT && c.custom_id === 'pda:nav') key = c.options?.find((/** @type {any} */ o) => o.default)?.value ?? null;
      if (c?.components) walk(c.components);
    }
  };
  walk(list);
  return key;
}

/**
 * A router answer as the Activity takes it: a page (its tree and chapter), a form to fill, or a note laid over the page.
 * @param {any} answer
 */
export function journalAnswerOf(answer) {
  if (!answer) return { kind: 'note', components: [], words: 'That page is not in this journal.' };
  if (answer.type === ANSWER.MODAL) return { kind: 'form', form: answer.data };
  const components = answer.data?.components ?? [];
  const chapter = chapterOfTree(components);
  if (chapter || answer.type === ANSWER.UPDATE) return { kind: 'page', chapter, components };
  return { kind: 'note', components };
}

/** The chart under the map's pins, drawn once an isolate (the promise, so asks at once share one drawing). @type {Promise<Uint8Array> | null} */
let chart = null;
/** Tests stand fresh isolates. */
export const _resetJournalDoorForTests = () => {
  chart = null;
  proxyKey = { raw: '', key: null };
};

/**
 * The map's pins as the Activity draws them, each with its words and where it stands on the chart, and the reminders
 * the player keeps (null for one not linked, who may keep none).
 * @param {any} ctx @param {any} env @param {any} [who]
 */
export async function mapOf(ctx, env, who = null) {
  const reminders = who?.player
    ? ((await ctx.db.prepare('SELECT family FROM discord_reminders WHERE discord_id = ?1').bind(who.discordId).all())?.results ?? []).map((/** @type {any} */ r) => String(r.family))
    : null;
  const facts = await liveFacts(env, ctx.nowS * 1000);
  const pins = mapPins(await worldEvents(ctx, env, ctx.nowS * 1000, facts), ctx.nowS);
  return {
    chart: { w: CHART_W, h: CHART_H, unit: MAP_PX },
    known: !!facts,
    reminders,
    pins: pins.map((p) => ({
      n: p.n,
      family: p.e.family,
      title: loreName(p.e.title),
      where: loreName(p.e.where),
      live: !!p.live,
      exact: !!p.exact,
      startAt: p.e.startAt ?? null,
      endAt: p.e.endAt ?? null,
      remind: p.e.remind ?? null,
      x: p.x * MAP_PX,
      y: p.y * MAP_PX,
    })),
  };
}

/** A body's text, read no further than `max` bytes: null past it, whatever the length header said. @param {Request} request @param {number} max */
async function readUpTo(request, max) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.byteLength;
  }
  return new TextDecoder().decode(all);
}

const jsonOf = (/** @type {any} */ body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
  });

/**
 * A body read to its bound, as JSON, or null. Only the Activity's own asks are read: JSON, from its own page (a form
 * or a plain-text post from another site is refused, whatever the proxy says of who sent it).
 * @param {Request} request
 */
async function bodyOf(request) {
  if (request.method !== 'POST') return {};
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) return null;
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return null;
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > JOURNAL_BODY_MAX) return null;
  const text = await readUpTo(request, JOURNAL_BODY_MAX);
  if (text === null) return null;
  try {
    const v = JSON.parse(text || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * THE DOOR. Every `/v1/journal/` path but the pictures: the chart (open, as the map is), the OAuth sign-in (proven by
 * Discord's code), and the rest as the player the proxy or a ticket names.
 * @param {any} ctx `{ db, nowS, subtle, rand, self, bucket }` @param {any} env @param {Request} request @param {string} path
 * @param {{ fetchFn?: any, later?: (p: Promise<unknown>) => void }} [io]
 * @returns {Promise<Response>}
 */
export async function journalDoor(ctx, env, request, path, io = {}) {
  const fetchFn = io.fetchFn ?? ((/** @type {any} */ u, /** @type {any} */ i) => globalThis.fetch(u, i));
  const later = io.later ?? ((/** @type {Promise<unknown>} */ p) => void p.catch(() => {}));
  const route = path.slice(JOURNAL_PREFIX.length);
  if (route === 'chart.png') {
    if (request.method !== 'GET') return jsonOf({ error: 'method' }, 405);
    chart ??= mapBase().then((c) => encodeRgba(c));
    return new Response(await chart, { status: 200, headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' } });
  }
  const body = await bodyOf(request);
  if (!body) return jsonOf({ error: 'body' }, 400);
  if (route === 'oauth') {
    if (request.method !== 'POST') return jsonOf({ error: 'method' }, 405);
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (overAccountRate(`journal-oauth:${ip}`, ctx.nowS, 300, 60)) return jsonOf({ error: 'rate' }, 429);
    const r = await oauthSignIn(env, body, ctx.nowS, fetchFn);
    return 'error' in r ? jsonOf(r, r.error === 'oauth-off' ? 501 : 401) : jsonOf(r);
  }
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (overAccountRate(`journal-ip:${ip}`, ctx.nowS, JOURNAL_UNKNOWN_MAX * 20, 60)) return jsonOf({ error: 'rate' }, 429);
  const who0 = await journalUser(env, request, ctx);
  if ('error' in who0) {
    if (overAccountRate(`journal-unknown:${ip}`, ctx.nowS, JOURNAL_UNKNOWN_MAX, 60)) return jsonOf({ error: 'rate' }, 429);
    return jsonOf({ error: who0.error, oauth: oauthOn(env) }, 401);
  }
  // each player is limited by their Discord id: in this isolate, and across every location through the same limiter
  if (overAccountRate(`journal:${who0.id}`, ctx.nowS, Number(env?.JOURNAL_ASK_MAX) || JOURNAL_ASK_MAX, 60)) return jsonOf({ error: 'rate' }, 429);
  if (await overAddressLimit(env.ADDRESS_LIMIT, `journal:${who0.id}`)) return jsonOf({ error: 'rate' }, 429);
  const pio = { fetchFn, later };
  if (route === 'hello') {
    const who = await whoOf(ctx, env, { user: { id: who0.id } }, pio);
    const seals = who.player ? await sealsOf(ctx.db, who.player.id) : null;
    return jsonOf({ ...helloOf(who, env), seals, via: who0.via });
  }
  if (route === 'cabinet') {
    const who = await whoOf(ctx, env, { user: { id: who0.id } }, pio);
    if (!who.player) return jsonOf({ error: 'not-linked' }, 403);
    return jsonOf(await cabinetOf(who));
  }
  if (route === 'press') {
    if (request.method !== 'POST') return jsonOf({ error: 'method' }, 405);
    const answer = await journalPress(ctx, env, { id: who0.id }, body, pio);
    if (!answer) return jsonOf({ error: 'not-journal' }, 404);
    return jsonOf(journalAnswerOf(answer));
  }
  if (route === 'map') return jsonOf(await mapOf(ctx, env, await whoOf(ctx, env, { user: { id: who0.id } }, pio)));
  const sea = seaRoutes()[route];
  if (sea) {
    if (request.method !== sea.method) return jsonOf({ error: 'method' }, 405);
    const who = await whoOf(ctx, env, { user: { id: who0.id } }, pio);
    if (!who.player) return jsonOf({ error: 'not-linked' }, 403);
    if (who.barred) return jsonOf({ error: who.barred }, 403);
    const asked = request.method === 'GET' ? Object.fromEntries(new URL(request.url).searchParams) : body;
    const r = await sea.handle(ctx, env, who, asked);
    return jsonOf(r, r && 'error' in r ? (r.status ?? 409) : 200);
  }
  return jsonOf({ error: 'not-found' }, 404);
}
