// @ts-check
// The journal's word with Discord: the frame protocol the Embedded App SDK speaks (handshake, commands with a nonce,
// events), written here in a page rather than bundled, since the book needs a handful of its commands. The protocol is
// the SDK's own (2.5.0, output/Discord.mjs): opcodes HANDSHAKE 0, FRAME 1, CLOSE 2, HELLO 3, sent to the window that
// opened the frame at the referrer's origin, answered only from Discord's origins.

const OP = Object.freeze({ HANDSHAKE: 0, FRAME: 1, CLOSE: 2, HELLO: 3 });
/** The SDK version the handshake names: the commands below are that version's. */
export const SDK_VERSION = '2.5.0';
/** How long a command waits for Discord before it fails, ms; sign-in waits on the player, so longer. */
const COMMAND_MS = 15000;
const AUTHORIZE_MS = 120000;
/** Mobile clients older than this take no SDK version in the handshake. */
const MOBILE_VERSION_FOR_SDK = 250;
const ORIGINS = new Set([
  'https://discord.com',
  'https://discordapp.com',
  'https://ptb.discord.com',
  'https://ptb.discordapp.com',
  'https://canary.discord.com',
  'https://canary.discordapp.com',
  'https://pax.discord.com',
  'null',
]);

/**
 * The frame's query: what Discord tells an Activity about where it was opened. Null outside Discord.
 * @param {string} search
 */
export function frameQuery(search) {
  const q = new URLSearchParams(search);
  const frameId = q.get('frame_id');
  const instanceId = q.get('instance_id');
  const platform = q.get('platform');
  if (!frameId || !instanceId || (platform !== 'desktop' && platform !== 'mobile')) return null;
  return {
    frameId,
    instanceId,
    platform,
    guildId: q.get('guild_id'),
    channelId: q.get('channel_id'),
    locationId: q.get('location_id'),
    customId: q.get('custom_id'),
    referrerId: q.get('referrer_id'),
    mobileAppVersion: q.get('mobile_app_version'),
  };
}

/** The application's id: the first label of the proxy's host (`<id>.discordsays.com`). @param {string} host */
export const clientIdOf = (host) => (/^(\d{5,25})\.discordsays\.com$/.exec(host) ?? [])[1] ?? null;

/**
 * A bridge to Discord, opened at once. `ready` settles when Discord says READY; a command answers its data or throws
 * Discord's error. Events are subscribed by name.
 * @param {{ clientId: string, query: NonNullable<ReturnType<typeof frameQuery>>, win?: any }} o
 */
export function openFrame({ clientId, query, win = globalThis.window }) {
  const source = win.parent?.opener ?? win.parent;
  const origin = win.document?.referrer ? new URL(win.document.referrer).origin : '*';
  /** @type {Map<string, { resolve: (v: any) => void, reject: (e: any) => void }>} */
  const pending = new Map();
  /** @type {Map<string, Set<(data: any) => void>>} */
  const listeners = new Map();
  let isReady = false;
  /** @type {string | null} Discord's reason, once it has closed the frame */
  let closedWhy = null;
  /** @type {(v?: any) => void} */
  let markReady = () => {};
  const ready = new Promise((r) => (markReady = r));
  const nonce = () => (win.crypto?.randomUUID ? win.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

  const post = (/** @type {any[]} */ msg) => source?.postMessage(msg, origin);
  /** A command, answered or refused, never left hanging: past `ms` it fails. @param {string} cmd @param {any} [args] @param {string} [evt] */
  const send = (cmd, args = {}, evt, ms = COMMAND_MS) =>
    new Promise((resolve, reject) => {
      if (closedWhy) return reject(new Error(closedWhy));
      const n = nonce();
      const timer = setTimeout(() => {
        pending.delete(n);
        reject(new Error(`Discord did not answer ${cmd}`));
      }, ms);
      pending.set(n, { resolve: (v) => (clearTimeout(timer), resolve(v)), reject: (e) => (clearTimeout(timer), reject(e)) });
      post([OP.FRAME, { cmd, args, ...(evt ? { evt } : {}), nonce: n }]);
    });

  const onMessage = (/** @type {MessageEvent} */ ev) => {
    if (!ORIGINS.has(ev.origin) && ev.origin !== win.location?.origin) return;
    if (!Array.isArray(ev.data)) return;
    const [op, data] = ev.data;
    if (op === OP.CLOSE) {
      // Discord refused the frame (a bad client id, an origin it does not know): every waiting command fails now
      closedWhy = String(data?.message ?? 'Discord closed the journal');
      for (const p of pending.values()) p.reject(new Error(closedWhy));
      pending.clear();
      return;
    }
    if (op !== OP.FRAME || !data || typeof data !== 'object') return;
    if (data.cmd === 'DISPATCH') {
      if (data.evt === 'READY') {
        isReady = true;
        markReady(data.data);
      }
      for (const fn of listeners.get(data.evt) ?? []) fn(data.data);
      return;
    }
    const p = data.nonce ? pending.get(data.nonce) : null;
    if (!p) return;
    pending.delete(data.nonce);
    if (data.evt === 'ERROR') p.reject(Object.assign(new Error(String(data.data?.message ?? 'Discord refused')), { code: data.data?.code }));
    else p.resolve(data.data);
  };
  win.addEventListener('message', onMessage);

  const hs = /** @type {Record<string, unknown>} */ ({ v: 1, encoding: 'json', client_id: clientId, frame_id: query.frameId });
  const mv = String(query.mobileAppVersion ?? '');
  const mobile = mv.includes('.') ? Number(mv.split('.')[0]) : -1;
  if (query.platform === 'desktop' || (Number.isFinite(mobile) && mobile >= MOBILE_VERSION_FOR_SDK)) hs.sdk_version = SDK_VERSION;
  post([OP.HANDSHAKE, hs]);

  return {
    query,
    clientId,
    ready,
    get isReady() {
      return isReady;
    },
    get closed() {
      return closedWhy;
    },
    /** @param {string} cmd @param {any} [args] */
    command: (cmd, args) => send(cmd, args),
    /** @param {string} evt @param {(data: any) => void} fn @param {any} [args] */
    async subscribe(evt, fn, args = {}) {
      const set = listeners.get(evt) ?? new Set();
      const first = set.size === 0;
      set.add(fn);
      listeners.set(evt, set);
      if (first && evt !== 'READY') await send('SUBSCRIBE', args, evt);
    },
    /** Discord's OAuth code for this application, asked without a prompt where the player already agreed. */
    authorize: (/** @type {string[]} */ scope) =>
      send('AUTHORIZE', { client_id: clientId, response_type: 'code', state: '', prompt: 'none', scope }, undefined, AUTHORIZE_MS),
    authenticate: (/** @type {string} */ accessToken) => send('AUTHENTICATE', { access_token: accessToken }),
    openLink: (/** @type {string} */ url) => send('OPEN_EXTERNAL_LINK', { url }),
    /** A fresh ticket for the proxy's signed headers, once the old one has lapsed. */
    refreshProxyTicket: () => send('REQUEST_PROXY_TICKET_REFRESH', {}),
    participants: () => send('GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS', {}),
    close: (code = 1000, message = '') => post([OP.CLOSE, { code, message, nonce: nonce() }]),
  };
}
