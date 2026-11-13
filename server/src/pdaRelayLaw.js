// @ts-check
// The Discord PDA's two doors on the relay, one home for both ends: the paths, the bounds, and the signed ask the
// account service sends for a player's friends. The ask is signed with the service's identity key, which the relay
// already holds the public half of. Its bytes start with ASK_PREFIX, so an ask can never pass as a token or an order,
// and a token or an order never as an ask. Pure: imports the identity law's codec alone.
import { _b64url, ID_RE } from '../../src/net/identityToken.js';

/** The public door: the live world events' public facts. */
export const PDA_LIVE_PATH = '/v1/pda/live';
/** The signed door: one account's friends, read or acted on. */
export const PDA_FRIENDS_PATH = '/v1/pda/friends';
/** Every PDA path on the relay starts here. */
export const PDA_RELAY_PREFIX = '/v1/pda/';
/** The hub's own paths, reached only from the relay's Worker. */
export const PDA_INTERNAL_LIVE = '/internal/pda/live';
export const PDA_INTERNAL_FRIENDS = '/internal/pda/friends';
export const PDA_INTERNAL_PREFIX = '/internal/pda/';
/** How long a signed ask is good for. */
export const PDA_ASK_TTL_S = 60;
/** The most bytes an ask's request body may be. */
export const PDA_ASK_MAX_BYTES = 2048;
/** How long the relay's Worker keeps the live answer, ms: many players' screens, one ask of the hub. */
export const PDA_LIVE_KEEP_MS = 20_000;
/** What an ask may do with the friends list: read it, or one of the hub's own acts by account. */
export const PDA_FRIEND_ACTS = Object.freeze(['read', 'accept', 'decline', 'cancel', 'remove', 'request']);
const ASK_PREFIX = 'dfo-pda-ask1\n';
const NONCE_RE = /^[0-9a-f]{16}$/;

/**
 * Whether an ask's claims are well made and live at `nowS`: `{ k: 'friends', s, a, t?, c, i, e }` - the account, the
 * act, its target (every act but a read), a nonce, issued and expiry seconds.
 * @param {any} c @param {number} nowS
 */
export function askClaimsOk(c, nowS) {
  if (!c || typeof c !== 'object' || c.k !== 'friends') return false;
  if (typeof c.s !== 'string' || !ID_RE.test(c.s)) return false;
  if (!PDA_FRIEND_ACTS.includes(c.a)) return false;
  if (c.a === 'read' ? c.t !== undefined : typeof c.t !== 'string' || !ID_RE.test(c.t) || c.t === c.s) return false;
  if (typeof c.c !== 'string' || !NONCE_RE.test(c.c)) return false;
  if (!Number.isSafeInteger(c.i) || !Number.isSafeInteger(c.e) || c.e <= c.i || c.e - c.i > PDA_ASK_TTL_S) return false;
  return nowS >= c.i - 30 && nowS < c.e;
}

const signedBytes = (/** @type {string} */ payload) => new TextEncoder().encode(`${ASK_PREFIX}${payload}`);

/**
 * An ask, signed: `<payload>.<signature>`, each base64url.
 * @param {{ s: string, a: string, t?: string, c: string }} what @param {CryptoKey} privateKey
 * @param {{ subtle: SubtleCrypto, nowS: number }} o
 */
export async function signAsk({ s, a, t, c }, privateKey, { subtle, nowS }) {
  const claims = { k: 'friends', s, a, ...(t === undefined ? {} : { t }), c, i: nowS, e: nowS + PDA_ASK_TTL_S };
  if (!askClaimsOk(claims, nowS)) throw new TypeError('signAsk refused an ask it could not open');
  const payload = _b64url.encode(new TextEncoder().encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, privateKey, signedBytes(payload)));
  return `${payload}.${_b64url.encode(sig)}`;
}

/**
 * An ask opened: its claims when the signature is the service's and the claims are live, else null. Never throws.
 * @param {unknown} ask @param {CryptoKey|null} publicKey @param {{ subtle: SubtleCrypto, nowS: number }} o
 */
export async function openAsk(ask, publicKey, { subtle, nowS }) {
  if (!publicKey || typeof ask !== 'string' || ask.length > PDA_ASK_MAX_BYTES) return null;
  const parts = ask.split('.');
  if (parts.length !== 2) return null;
  const sig = _b64url.decode(parts[1]);
  const raw = _b64url.decode(parts[0]);
  if (!sig || !raw) return null;
  try {
    if (!(await subtle.verify({ name: 'Ed25519' }, publicKey, sig, signedBytes(parts[0])))) return null;
    const claims = JSON.parse(new TextDecoder().decode(raw));
    return askClaimsOk(claims, nowS) ? claims : null;
  } catch {
    return null;
  }
}
