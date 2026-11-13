// @ts-check
// The Courier: the one pinned card every player opens the journal from, in a read-only channel. The service keeps it
// itself, so no one posts it by hand: it finds the server from the moderators' channel, finds or makes the channel,
// posts the card and pins it, and redraws it whenever TERMINAL_VERSION moves or its heading picture can first be
// signed. What it found is kept in discord_state; the code keeps the Terminal's old names.
import { body } from './pdaUi.js';
import { terminalCard, TERMINAL_VERSION } from './pdaFrame.js';
import { discordApi, botOn } from './pdaDiscordApi.js';

/** The channel's name when the service makes it. The bot's own overwrite there grants only what posting needs:
 *  Discord refuses an overwrite that grants a permission the bot does not hold, and pinning is its role's. */
export const TERMINAL_CHANNEL_NAME = 'dfo-courier';
/** The channel's topic, set when it is made or renamed. */
export const TERMINAL_TOPIC = 'Open your DFO Online journal here. Only you see your journal.';
/** How long an isolate waits before trying again after Discord refused. */
export const TERMINAL_RETRY_S = 600;
const SNOWFLAKE_RE = /^\d{5,25}$/;
const P = Object.freeze({
  VIEW: 1n << 10n,
  SEND: 1n << 11n,
  EMBED: 1n << 14n,
  ATTACH: 1n << 15n,
  HISTORY: 1n << 16n,
  REACT: 1n << 6n,
  PUBLIC_THREADS: 1n << 35n,
  PRIVATE_THREADS: 1n << 36n,
  THREAD_SEND: 1n << 38n,
});

/** One of the bot's kept settings. @param {any} db @param {string} key */
export async function stateOf(db, key) {
  const r = await db.prepare('SELECT value FROM discord_state WHERE key = ?1').bind(key).first();
  return r ? String(r.value) : null;
}
/** One kept. @param {any} db @param {string} key @param {string} value @param {number} nowS */
export const keepState = (db, key, value, nowS) =>
  db
    .prepare(
      'INSERT INTO discord_state (key, value, at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, at = excluded.at',
    )
    .bind(key, String(value), nowS)
    .run();

/** The project's Discord server: the moderators' channel's. @param {{ db: any, nowS: number }} ctx @param {any} env @param {any} fetchFn */
export async function serverOf(ctx, env, fetchFn) {
  const kept = await stateOf(ctx.db, 'guild');
  if (kept && SNOWFLAKE_RE.test(kept)) return kept;
  const chan = String(env?.DISCORD_MOD_CHANNEL ?? '');
  if (!SNOWFLAKE_RE.test(chan)) return null;
  const r = await discordApi(env, fetchFn, 'GET', `/channels/${chan}`);
  const g = r.ok ? String(r.json?.guild_id ?? '') : '';
  if (!SNOWFLAKE_RE.test(g)) return null;
  await keepState(ctx.db, 'guild', g, ctx.nowS);
  return g;
}

/** The bot's own user id. */
async function botIdOf(ctx, env, fetchFn) {
  const kept = await stateOf(ctx.db, 'bot');
  if (kept && SNOWFLAKE_RE.test(kept)) return kept;
  const r = await discordApi(env, fetchFn, 'GET', '/users/@me');
  const id = r.ok ? String(r.json?.id ?? '') : '';
  if (!SNOWFLAKE_RE.test(id)) return null;
  await keepState(ctx.db, 'bot', id, ctx.nowS);
  return id;
}

/**
 * The Terminal's channel: the one DISCORD_TERMINAL_CHANNEL names; else the one kept; else the server's channel of
 * TERMINAL_CHANNEL_NAME; else one made, where everyone reads and only the bot writes.
 * @param {{ db: any, nowS: number }} ctx @param {any} env @param {any} fetchFn
 */
export async function terminalChannelOf(ctx, env, fetchFn) {
  const set = String(env?.DISCORD_TERMINAL_CHANNEL ?? '').trim();
  if (SNOWFLAKE_RE.test(set)) return set;
  const kept = await stateOf(ctx.db, 'terminal_channel');
  if (kept && SNOWFLAKE_RE.test(kept)) return kept;
  const guild = await serverOf(ctx, env, fetchFn);
  if (!guild) return null;
  const list = await discordApi(env, fetchFn, 'GET', `/guilds/${guild}/channels`);
  if (!list.ok) return null;
  const found = (Array.isArray(list.json) ? list.json : []).find(
    (c) => c?.type === 0 && c?.name === TERMINAL_CHANNEL_NAME,
  );
  let id = found ? String(found.id) : '';
  if (!id) {
    const bot = await botIdOf(ctx, env, fetchFn);
    const made = await discordApi(env, fetchFn, 'POST', `/guilds/${guild}/channels`, {
      name: TERMINAL_CHANNEL_NAME,
      type: 0,
      topic: TERMINAL_TOPIC,
      permission_overwrites: [
        {
          id: guild,
          type: 0,
          allow: String(P.VIEW | P.HISTORY),
          deny: String(P.SEND | P.REACT | P.PUBLIC_THREADS | P.PRIVATE_THREADS | P.THREAD_SEND),
        },
        ...(bot
          ? [{ id: bot, type: 1, allow: String(P.VIEW | P.SEND | P.EMBED | P.ATTACH | P.HISTORY), deny: '0' }]
          : []),
      ],
    });
    if (!made.ok) return null;
    id = String(made.json?.id ?? '');
  }
  if (!SNOWFLAKE_RE.test(id)) return null;
  await keepState(ctx.db, 'terminal_channel', id, ctx.nowS);
  return id;
}

/** The channel polls are posted in: DISCORD_POLL_CHANNEL when set, else the Terminal's. */
export async function pollChannelOf(ctx, env, fetchFn) {
  const set = String(env?.DISCORD_POLL_CHANNEL ?? '').trim();
  return SNOWFLAKE_RE.test(set) ? set : terminalChannelOf(ctx, env, fetchFn);
}
/** The staff's channel for feedback cards: DISCORD_FEEDBACK_CHANNEL when set, else the moderators'. @param {any} env */
export function feedbackChannelOf(env) {
  const set = String(env?.DISCORD_FEEDBACK_CHANNEL ?? '').trim();
  if (SNOWFLAKE_RE.test(set)) return set;
  const mod = String(env?.DISCORD_MOD_CHANNEL ?? '').trim();
  return SNOWFLAKE_RE.test(mod) ? mod : null;
}

/**
 * Whether the journal's Activity is on: Discord has made its launcher entry (a global command of type 4), which happens
 * when a person turns Activities on in the Developer Portal. Read an hour at a time and kept in discord_state, so the
 * Courier's main press launches the Activity only where Discord will. Answers whether it changed.
 * @param {{ db: any, nowS: number }} ctx @param {any} env @param {any} fetchFn
 */
export async function checkActivity(ctx, env, fetchFn) {
  if (!botOn(env)) return 0;
  const app = await discordApi(env, fetchFn, 'GET', '/applications/@me');
  const id = app.ok ? String(app.json?.id ?? '') : '';
  if (!SNOWFLAKE_RE.test(id)) return 0;
  const list = await discordApi(env, fetchFn, 'GET', `/applications/${id}/commands`);
  if (!list.ok) return 0;
  const on = (Array.isArray(list.json) ? list.json : []).some((c) => c?.type === 4) ? '1' : '0';
  if ((await stateOf(ctx.db, 'activity')) === on) return 0;
  await keepState(ctx.db, 'activity', on, ctx.nowS);
  drawnVersion = 0;
  failedAt = 0;
  return 1;
}

let drawnVersion = 0;
let failedAt = 0;
/** Tests stand fresh isolates. */
export const _resetTerminalForTests = () => {
  drawnVersion = 0;
  failedAt = 0;
};

/**
 * The Terminal posted, pinned and current. Asks Discord nothing while this isolate has seen the current card drawn.
 * Answers 1 when it posted or redrew the card, else 0.
 * @param {{ db: any, nowS: number }} ctx @param {any} env @param {any} fetchFn
 */
export async function ensureTerminal(ctx, env, fetchFn) {
  if (!botOn(env) || drawnVersion === TERMINAL_VERSION) return 0;
  if (failedAt && ctx.nowS - failedAt < TERMINAL_RETRY_S) return 0;
  const [msg, ver, self, act] = [await stateOf(ctx.db, 'terminal_msg'), await stateOf(ctx.db, 'terminal_ver'), await stateOf(ctx.db, 'self'), await stateOf(ctx.db, 'activity')];
  const origin = self && /^https:\/\//.test(self) ? self : '';
  const activity = act === '1';
  // the card drawn without its picture is drawn again once an interaction has told the service its own address, and
  // again when the Activity comes on or goes off
  const want = `${TERMINAL_VERSION}${origin ? '' : '-plain'}${activity ? '-act' : ''}`;
  const channel = await terminalChannelOf(ctx, env, fetchFn);
  if (!channel) {
    failedAt = ctx.nowS;
    return 0;
  }
  const card = body(terminalCard(env, origin, activity));
  const [msgChannel, msgId] = String(msg ?? '').split('/');
  if (msgId && msgChannel === channel && String(ver) === want) {
    if (origin) drawnVersion = TERMINAL_VERSION;
    else failedAt = ctx.nowS; // current but plain: asked again a while later, not every minute
    return 0;
  }
  if (msgId && msgChannel === channel) {
    const r = await discordApi(env, fetchFn, 'PATCH', `/channels/${channel}/messages/${msgId}`, card);
    if (r.ok) {
      await keepState(ctx.db, 'terminal_ver', want, ctx.nowS);
      if (origin) drawnVersion = TERMINAL_VERSION;
      // a channel the service made under the Terminal's old name takes the Courier's; refused, it keeps its own
      if (Number(ver) < 2 && !String(env?.DISCORD_TERMINAL_CHANNEL ?? '').trim())
        await discordApi(env, fetchFn, 'PATCH', `/channels/${channel}`, { name: TERMINAL_CHANNEL_NAME, topic: TERMINAL_TOPIC });
      return 1;
    }
    if (r.status !== 404) {
      failedAt = ctx.nowS;
      return 0;
    }
  }
  const posted = await discordApi(env, fetchFn, 'POST', `/channels/${channel}/messages`, card);
  const id = posted.ok ? String(posted.json?.id ?? '') : '';
  if (!SNOWFLAKE_RE.test(id)) {
    failedAt = ctx.nowS;
    return 0;
  }
  await discordApi(env, fetchFn, 'PUT', `/channels/${channel}/pins/${id}`);
  await keepState(ctx.db, 'terminal_msg', `${channel}/${id}`, ctx.nowS);
  await keepState(ctx.db, 'terminal_ver', want, ctx.nowS);
  if (origin) drawnVersion = TERMINAL_VERSION;
  return 1;
}
