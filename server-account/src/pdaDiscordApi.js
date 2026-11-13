// @ts-check
// The bot's own calls to Discord's API, with its token: posting and editing its cards, opening a DM, finding or making
// its channels and roles. One door, so every call carries the User-Agent Discord asks for, a timeout, and an answer
// that says whether to try again. Never throws, and never puts the token in a log line.

/** Discord's API. */
export const DISCORD_API = 'https://discord.com/api/v10';
/** How long the service waits on Discord's API, ms. */
export const DISCORD_POST_MS = 8000;
/** The User-Agent Discord's API asks of every bot. */
export const DISCORD_USER_AGENT = 'DiscordBot (https://github.com/Lattymoy/daggerfall-js-source, 1)';

/** Whether the bot can call Discord at all: its token is set. @param {any} env */
export const botOn = (env) => typeof env?.DISCORD_BOT_TOKEN === 'string' && env.DISCORD_BOT_TOKEN.length > 0;

/**
 * One call. Answers `{ ok: true, json }`, or `{ ok: false, status, code, down }` where `down` means try later (Discord
 * unreachable, rate-limited or erring) and a 4xx is Discord's refusal of this call for good. `code` is Discord's own
 * error code where it gave one (50007: that user takes no DMs).
 * @param {any} env @param {(url: string, init: any) => Promise<Response>} fetchFn
 * @param {string} method @param {string} path @param {any} [payload]
 * @returns {Promise<{ ok: true, json: any } | { ok: false, status: number, code: number, down: boolean }>}
 */
export async function discordApi(env, fetchFn, method, path, payload) {
  if (!botOn(env)) return { ok: false, status: 0, code: 0, down: true };
  try {
    const res = await fetchFn(`${DISCORD_API}${path}`, {
      method,
      headers: {
        authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        'user-agent': DISCORD_USER_AGENT,
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: AbortSignal.timeout(DISCORD_POST_MS),
    });
    const textBody = await res.text().catch(() => '');
    let json = null;
    try {
      json = textBody ? JSON.parse(textBody) : null;
    } catch {
      json = null;
    }
    if (res.ok) return { ok: true, json };
    const down = res.status === 429 || res.status >= 500;
    if (!down) console.warn(`[pda] Discord refused ${method} ${path.replace(/\d{5,}/g, '#')}: ${res.status}`);
    return { ok: false, status: res.status, code: Number(json?.code) || 0, down };
  } catch (e) {
    console.warn('[pda] Discord unreachable:', /** @type {any} */ (e)?.message ?? e);
    return { ok: false, status: 0, code: 0, down: true };
  }
}

/** Discord's code for "this user takes no direct messages from this bot". */
export const CANNOT_DM = 50007;

/**
 * The answer to an interaction, drawn after Discord was told the PDA is working: the original response edited through
 * the interaction's own token (no bot token needed; it lives fifteen minutes). Answers whether Discord took it.
 * @param {(url: string, init: any) => Promise<Response>} fetchFn @param {string} appId @param {string} token @param {any} data
 */
export async function editOriginal(fetchFn, appId, token, data) {
  if (!/^\d{5,25}$/.test(String(appId)) || typeof token !== 'string' || !token) return false;
  try {
    const res = await fetchFn(`${DISCORD_API}/webhooks/${appId}/${encodeURIComponent(token)}/messages/@original`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'user-agent': DISCORD_USER_AGENT },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(DISCORD_POST_MS),
    });
    if (!res.ok) console.warn(`[pda] Discord refused a late answer: ${res.status}`);
    return res.ok;
  } catch (e) {
    console.warn('[pda] a late answer did not reach Discord:', /** @type {any} */ (e)?.message ?? e);
    return false;
  }
}
