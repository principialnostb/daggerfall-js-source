// @ts-check
// The Discord PDA's doors on the relay. The Worker's door answers two paths: the live world events' public facts (the
// places the herald already posts), kept a few seconds so many screens make one ask of the hub; and one account's
// friends, asked by the account service with a signed ask (pdaRelayLaw.js), read or acted on through the hub's own
// social acts, so Discord meets every rule the game does. The hub's half reads its own records and nothing else.
import { importPublicKeyB64 } from '../../src/net/identityToken.js';
import { SOCIAL_ROOM, GATE_LANES_OPEN, SD_LANE_SPAN } from '../../src/net/wire.js';
import { gateAt } from '../../src/net/gate/gateLaw.js';
import { agreedGateSite } from '../../src/net/gate/gateHerald.js';
import { serpentAtWord } from '../../src/net/serpent/serpentHerald.js';
import { sdPhase, SD_LANES } from '../../src/net/superDungeon/sdLaw.js';
import { ROOM_CALL_MS } from './relayScale.js';
import {
  PDA_LIVE_PATH,
  PDA_FRIENDS_PATH,
  PDA_INTERNAL_LIVE,
  PDA_INTERNAL_FRIENDS,
  PDA_ASK_MAX_BYTES,
  PDA_LIVE_KEEP_MS,
  PDA_ASK_TTL_S,
  openAsk,
} from './pdaRelayLaw.js';

const json = (/** @type {any} */ body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A body read to `max` bytes and no further: null past it. */
async function bodyUpTo(/** @type {Request} */ request, /** @type {number} */ max) {
  const said = Number(request.headers.get('content-length'));
  if (Number.isFinite(said) && said > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) {
      try {
        await reader.cancel();
      } catch {
        /* gone */
      }
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** The service's public key, imported once an isolate (again only when the config's text changes). */
let keyHeld = { raw: '', key: /** @type {CryptoKey|null} */ (null) };
async function serviceKey(/** @type {any} */ env) {
  const raw = String(env?.IDENTITY_PUBLIC_KEY ?? '');
  if (!raw) return null;
  if (keyHeld.raw !== raw) {
    let key = null;
    try {
      key = await importPublicKeyB64(raw, { subtle: crypto.subtle });
    } catch {
      key = null;
    }
    keyHeld = { raw, key };
  }
  return keyHeld.key;
}

/** Nonces of asks this isolate has handed the hub, by when they lapse: a replayed act wakes nothing. */
const seen = new Map();
const SEEN_MAX = 4096;
/** The live answer this isolate keeps, and the ask of the hub in flight. */
let liveKept = { at: 0, body: /** @type {any} */ (null) };
/** @type {Promise<any>|null} */
let liveAsking = null;
/** Tests stand fresh isolates. */
export const _resetPdaRelayForTests = () => {
  seen.clear();
  liveKept = { at: 0, body: null };
  liveAsking = null;
  keyHeld = { raw: '', key: null };
};

const hub = (/** @type {any} */ env) => env?.ROOMS?.get?.(env.ROOMS.idFromName(SOCIAL_ROOM)) ?? null;

/** The hub's live answer, one ask in flight an isolate. */
async function liveOf(/** @type {any} */ env) {
  const now = Date.now();
  if (liveKept.body && now - liveKept.at < PDA_LIVE_KEEP_MS) return liveKept.body;
  if (!liveAsking) {
    liveAsking = (async () => {
      try {
        const res = await hub(env).fetch(
          new Request(`https://relay.internal${PDA_INTERNAL_LIVE}`, {
            method: 'POST',
            body: '{}',
            signal: AbortSignal.timeout(ROOM_CALL_MS),
          }),
        );
        const body = res?.ok ? await res.json() : null;
        if (body) liveKept = { at: Date.now(), body };
        return body;
      } catch (e) {
        console.warn('[pda] live', /** @type {any} */ (e)?.message ?? e);
        return null;
      } finally {
        liveAsking = null;
      }
    })();
  }
  return liveAsking;
}

/**
 * THE WORKER'S DOOR: `GET /v1/pda/live` (public) and `POST /v1/pda/friends` (a signed ask).
 * @param {Request} request @param {any} env @param {URL} url
 */
export async function pdaRelayDoor(request, env, url) {
  if (!hub(env)) return json({ error: 'unavailable' }, 503);
  if (url.pathname === PDA_LIVE_PATH) {
    if (request.method !== 'GET') return json({ error: 'method' }, 405);
    const body = await liveOf(env);
    return body ? json(body) : json({ error: 'unavailable' }, 503);
  }
  if (url.pathname !== PDA_FRIENDS_PATH) return json({ error: 'not found' }, 404);
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  const raw = await bodyUpTo(request, PDA_ASK_MAX_BYTES);
  if (!raw) return json({ error: 'too large' }, 413);
  let ask = null;
  try {
    ask = JSON.parse(new TextDecoder().decode(raw))?.ask;
  } catch {
    ask = null;
  }
  const nowS = Math.floor(Date.now() / 1000);
  const claims = await openAsk(ask, await serviceKey(env), { subtle: crypto.subtle, nowS });
  if (!claims) return json({ error: 'bad ask' }, 403);
  for (const [k, e] of seen) {
    if (e > nowS) break;
    seen.delete(k);
  }
  if (claims.a !== 'read' && seen.has(claims.c)) return json({ error: 'replayed' }, 409);
  if (seen.size >= SEEN_MAX) seen.delete(seen.keys().next().value);
  seen.set(claims.c, claims.e + PDA_ASK_TTL_S);
  try {
    const res = await hub(env).fetch(
      new Request(`https://relay.internal${PDA_INTERNAL_FRIENDS}`, {
        method: 'POST',
        body: JSON.stringify({ s: claims.s, a: claims.a, t: claims.t, c: claims.c }),
        signal: AbortSignal.timeout(ROOM_CALL_MS),
      }),
    );
    if (!res?.ok) return json({ error: 'unavailable' }, 503);
    return json(await res.json());
  } catch (e) {
    console.warn('[pda] friends', /** @type {any} */ (e)?.message ?? e);
    return json({ error: 'unavailable' }, 503);
  }
}

/** An Abyss Dungeon's record as the public may read it: its region only once found, as the herald says it. */
function publicHollow(/** @type {any} */ rec, /** @type {number} */ now) {
  const ph = sdPhase(rec, now);
  const found = rec.foundAt != null && (ph === 'found' || ph === 'fell');
  return {
    lane: Math.floor(rec.s / SD_LANE_SPAN),
    s: rec.s,
    ph,
    at: rec.at,
    until: rec.until,
    next: rec.next,
    ...(found ? { r: rec.r, foundAt: rec.foundAt } : {}),
    ...(rec.fellAt != null ? { fellAt: rec.fellAt } : {}),
  };
}

/** The hub's live facts: each lane's gate and its agreed place, the serpent's agreed place, every lane's Hollow, the
 *  Spire's live breaches. Only what the herald already tells the world. @param {any} room */
async function liveInternal(room) {
  const now = Date.now();
  const gates = [];
  for (const lane of GATE_LANES_OPEN) {
    const t = gateAt(now, lane);
    const site = agreedGateSite(await room._gateSiteOf(lane), t.day);
    gates.push({ lane, n: t.day, ...(site ? { px: site.px, py: site.py, pl: site.pl } : {}) });
  }
  const sw = serpentAtWord(await room._serpentSiteOf(), now);
  const abyss = [];
  for (const lane of SD_LANES) {
    const rec = await room._sdOf(lane);
    if (rec && rec.s % SD_LANE_SPAN > 0) abyss.push(publicHollow(rec, now));
  }
  let spire = 0;
  try {
    spire = Number((await room._egLiveSay?.())?.live) || 0;
  } catch {
    spire = 0;
  }
  return json({
    t: now,
    gates,
    serpent: sw ? { d: sw.d, sx: sw.sx, sz: sw.sz, pl: sw.pl } : null,
    abyss,
    spire,
  });
}

/** A friend's row as the PDA reads it: the hub's own row, without the live peer ids a world client marks friends by. */
const friendRow = (/** @type {any} */ r) => ({ acct: r.acct, name: r.name, online: r.online, seen: r.seen });

/** Nonces of acts this hub has taken, by when they lapse - a second door against a replay the Worker missed. */
const HUB_SEEN_MAX = 2048;

/** One account's friends, read or acted on through the hub's own acts. @param {any} room @param {Request} request */
async function friendsInternal(room, request) {
  let m = null;
  try {
    m = await request.json();
  } catch {
    m = null;
  }
  if (!m || typeof m.s !== 'string') return json({ error: 'bad ask' }, 400);
  const now = Date.now();
  if (!room._pdaSeen) room._pdaSeen = new Map();
  if (m.a !== 'read') {
    for (const [k, e] of room._pdaSeen) {
      if (e > now) break;
      room._pdaSeen.delete(k);
    }
    if (room._pdaSeen.has(m.c)) return json({ error: 'replayed' }, 409);
    if (room._pdaSeen.size >= HUB_SEEN_MAX) room._pdaSeen.delete(room._pdaSeen.keys().next().value);
    room._pdaSeen.set(m.c, now + 2 * PDA_ASK_TTL_S * 1000);
  }
  let rec = await room._acct(m.s);
  if (!rec) return json({ known: false, friends: [], in: [], out: [], said: m.a === 'read' ? null : 'no account' });
  let said = null;
  if (m.a === 'accept') said = await room._friendAccept(m.s, rec, m.t, now);
  else if (m.a === 'decline') said = await room._friendUnlist(m.s, rec, m.t, now, 'in', 'out');
  else if (m.a === 'cancel') said = await room._friendUnlist(m.s, rec, m.t, now, 'out', 'in');
  else if (m.a === 'remove') said = await room._friendRemove(m.s, rec, m.t, now);
  else if (m.a === 'request') said = await room._friendRequest(m.s, rec, { acct: m.t }, now);
  if (m.a !== 'read') rec = (await room._acct(m.s)) ?? rec;
  const ids = [...rec.friends, ...rec.in.map((e) => e.acct), ...rec.out.map((e) => e.acct)];
  const recs = await room._accts(ids);
  return json({
    known: true,
    said,
    friends: rec.friends.map((id) => friendRow(room._rowOf(id, recs.get(id), now))),
    in: rec.in.map((e) => ({ ...friendRow(room._blankRow(e.acct, recs.get(e.acct))), at: e.at })),
    out: rec.out.map((e) => ({ ...friendRow(room._blankRow(e.acct, recs.get(e.acct))), at: e.at })),
  });
}

/**
 * THE HUB'S HALF, reached only through the Worker's door above.
 * @param {any} room the hub @param {string} path @param {Request} request
 */
export function pdaRelayInternal(room, path, request) {
  if (path === PDA_INTERNAL_LIVE) return liveInternal(room);
  if (path === PDA_INTERNAL_FRIENDS) return friendsInternal(room, request);
  return json({ error: 'not found' }, 404);
}
