// @ts-check
// The PDA's door: every press, menu choice, form and Apps command a player makes in Discord, routed to the screen
// module that answers it, as the account the Discord user is linked to. discord.js hands over what is the PDA's; this
// answers null for the rest, which stays the moderators' queue.
// Custom ids: `pda:<screen>[:<act>[:<args>]]` redraws in place; `open:<screen>` on a public card or a direct message
// opens a private PDA; `pdam:<screen>:<form>[:<args>]` is a submitted form; a module's public cards use its own head.
import { reply, update, modal, formValues, ANSWER, EPHEMERAL, V2, container, text, ACCENT } from './pdaUi.js';
import { editOriginal } from './pdaDiscordApi.js';
import { keepState } from './pdaTerminal.js';
import { frame, linkScreen, refusalText, refusalNote, refusalScreen, screenOf, SCREEN_KEYS } from './pdaFrame.js';
import { linkOf, redeemLinkCode } from './pdaLink.js';
import { overAccountRate, displayName } from './accounts.js';
import { isBanned, bannedUntil } from './sanctions.js';
import { isFrozen } from './staffFreeze.js';
import { canModerate, isDeveloper } from './titles.js';
import { listRealm } from './realm.js';
import { homePda } from './pdaHome.js';
import { settingsPda } from './pdaSettings.js';
import { mailPda } from './pdaMail.js';
import { feedbackPda } from './pdaFeedback.js';
import { pollsPda } from './pdaPolls.js';
import { staffPda } from './pdaStaff.js';
import { guildPda } from './pdaGuild.js';
import { marketPda } from './pdaMarket.js';
import { eventsPda } from './pdaEvents.js';
import { mapPda } from './pdaMap.js';
import { friendsPda, PROFILE_COMMAND_NAME } from './pdaFriends.js';
import { expPda } from './pdaExpeditions.js';
import { cabinetPda } from './pdaCabinet.js';
import { seaPda } from './pdaSea.js';

/**
 * A screen module: `screen` draws it, `acts` answer its buttons and menus, `forms` its submitted forms, `glance` gives
 * Home one line, `press` answers its public cards' buttons (their head is `heads`; `pressUpdates` when a press redraws
 * the card itself rather than answering privately).
 * @typedef {{ key: string, screen: (who: any, args: string[]) => Promise<any>, acts?: Record<string, (who: any, args: string[], values: string[]) => Promise<any>>, forms?: Record<string, (who: any, values: Record<string, string>, args: string[]) => Promise<any>>, glance?: (who: any) => Promise<string|null>, heads?: string[], press?: (who: any, parts: string[], values: string[]) => Promise<any> }} PdaModule
 */
/** The tables of modules, built on first use: a module imported before the router (a cycle through discord.js) is
 *  then already whole. @type {{ list: PdaModule[], byKey: Map<string, PdaModule>, byHead: Map<string, PdaModule>, heads: Set<string> } | null} */
let tables = null;
function tablesOf() {
  if (tables) return tables;
  /** @type {PdaModule[]} */
  const list = [homePda, mailPda, friendsPda, guildPda, marketPda, eventsPda, mapPda, expPda, seaPda, cabinetPda, pollsPda, feedbackPda, settingsPda, staffPda];
  const byHead = new Map(list.flatMap((m) => (m.heads ?? []).map((h) => /** @type {[string, PdaModule]} */ ([h, m]))));
  tables = { list, byKey: new Map(list.map((m) => [m.key, m])), byHead, heads: new Set(['pda', 'open', 'pdam', ...byHead.keys()]) };
  return tables;
}
/** Every screen module, in the menu's order. */
export const pdaModules = () => tablesOf().list;
/** The heads of every custom id the PDA answers. */
export const pdaHeads = () => tablesOf().heads;
/** Presses one Discord user may make a minute, counted in this isolate: a ceiling on a script, not on a person. */
export const PDA_PRESS_MAX = 90;
/** How long the PDA works on an answer before telling Discord it is still working: Discord gives three seconds. */
export const PDA_ANSWER_MS = 2200;
/** How long Home waits on any one module's line before drawing without it. */
export const GLANCE_MS = 1200;

const LATE = Symbol('late');
/** A promise's value, or LATE once `ms` have passed. The timer never outlives the race. */
async function within(/** @type {Promise<any>} */ p, /** @type {number} */ ms) {
  /** @type {any} */
  let timer;
  try {
    return await Promise.race([p, new Promise((r) => (timer = setTimeout(() => r(LATE), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

/** Home's lines from every module that has one, asked together, each bounded so a slow one hides only its own line. */
export async function glances(/** @type {any} */ who) {
  const asks = pdaModules()
    .filter((m) => m.glance && m.key !== 'home')
    .map(async (m) => {
      try {
        const g = await within(/** @type {any} */ (m).glance(who), GLANCE_MS);
        return g === LATE ? null : g;
      } catch (e) {
        console.warn(`[pda] ${m.key}'s glance failed:`, /** @type {any} */ (e)?.message ?? e);
        return null;
      }
    });
  return (await Promise.all(asks)).filter(Boolean);
}

/** The realm character the PDA acts as: the one chosen in Settings while it lives, else the one played last. */
async function characterOf(ctx, link, player) {
  const list = await listRealm(ctx, player.id);
  const chosen = list.find((c) => c.id === link?.char_id) ?? list[0] ?? null;
  return { characters: list, character: chosen };
}

/**
 * Who is pressing: the Discord user, and, when linked, their account and character. Banned and frozen accounts are
 * linked but `barred`.
 * @param {any} ctx @param {any} env @param {any} body @param {any} io
 */
export async function whoOf(ctx, env, body, io) {
  const user = body?.member?.user ?? body?.user ?? null;
  const found = user ? await linkOf(ctx.db, user.id) : null;
  /** @type {any} */
  const who = {
    ctx,
    env,
    io,
    body,
    user,
    discordId: String(user?.id ?? ''),
    link: found?.link ?? null,
    player: found?.player ?? null,
    name: found ? displayName(found.player) : String(user?.username ?? ''),
    staff: false,
    admin: false,
    character: null,
    characters: [],
    origin: String(ctx.self ?? ''),
    barred: null,
  };
  who.glances = () => glances(who);
  if (!found) return who;
  const p = found.player;
  who.staff = canModerate(p, env);
  who.admin = isDeveloper(p, env);
  if (isBanned(p, ctx.nowS)) who.barred = 'banned';
  else if (isFrozen(p, ctx.nowS)) who.barred = 'frozen';
  Object.assign(who, await characterOf(ctx, found.link, p));
  return who;
}

/** A module's answer as Discord takes it: a screen drawn in place, or opened anew from a public card. */
const answerOf = (result, launcher) => (Array.isArray(result) ? (launcher ? reply(result) : update(result)) : result);

/** The form the link code is typed into. */
const CODE_FORM = modal('pdam:link:code', 'Link your DFO account', [
  { id: 'code', label: 'Code from the game', hint: 'Account › Link Discord shows it', min: 8, max: 9, placeholder: 'ABCD-EFGH' },
]);

/** A screen drawn for `who`, refused when it needs what they lack. */
async function screenFor(who, key, args) {
  const s = screenOf(key);
  const m = tablesOf().byKey.get(key);
  if (!s || !m) return refusalScreen(who, refusalText('gone'));
  if (!s.open && !who.player) return linkScreen('', who);
  if (s.staff && !who.staff) return refusalScreen(who, refusalText('not-staff'));
  if (who.barred && !s.open && key !== 'settings') return refusalScreen(who, barredWords(who), 'settings');
  return m.screen(who, args);
}

const barredWords = (who) =>
  who.barred === 'banned'
    ? `${refusalText('banned')} It ends <t:${bannedUntil(who.player)}:f>.`
    : refusalText('frozen');

/**
 * THE PDA'S INTERACTIONS. Answers Discord's reply, or null for an interaction that is not the PDA's.
 * @param {{ db: any, nowS: number, subtle: SubtleCrypto, rand: (b: Uint8Array) => void, self?: string, bucket?: any }} ctx
 * @param {any} env @param {any} body @param {{ fetchFn: any, later: (p: Promise<unknown>) => void }} io
 */
export async function pdaInteraction(ctx, env, body, io) {
  const type = body?.type;
  const cid = String(body?.data?.custom_id ?? '');
  const head = cid.split(':')[0];
  const command = type === 2 && body?.data?.name === PROFILE_COMMAND_NAME;
  if (!command && !((type === 3 || type === 5) && pdaHeads().has(head))) return null;
  const userId = String(body?.member?.user?.id ?? body?.user?.id ?? '');
  if (overAccountRate(`pda:${userId}`, ctx.nowS, Number(env?.PDA_PRESS_MAX) || PDA_PRESS_MAX, 60)) return refusalNote(refusalText('rate'));
  const work = answerInteraction(ctx, env, body, io, { type, cid, head, command });
  const quick = await within(work, Number(env?.PDA_ANSWER_MS) || PDA_ANSWER_MS);
  if (quick !== LATE) return quick;
  // Too slow for Discord's three seconds (the relay, a save read): say the PDA is working, and draw the answer after.
  io.later(work.then((answer) => editOriginal(io.fetchFn, String(body?.application_id ?? ''), body?.token, lateData(answer))));
  return deferredOf(body, head);
}

/**
 * A PRESS FROM THE JOURNAL'S ACTIVITY (journalDoor.js): the answer a Discord press gets, built from the Activity's own
 * words for a press, a choice or a form. No three seconds bind it, so it is never deferred. Null for an id that is not
 * the journal's. `user` is the one Discord's proxy vouched for.
 * @param {any} ctx @param {any} env @param {{ id: string, username?: string }} user
 * @param {{ id?: unknown, values?: unknown, fields?: unknown }} press @param {{ fetchFn: any, later: (p: Promise<unknown>) => void }} io
 */
export async function journalPress(ctx, env, user, press, io) {
  const cid = String(press?.id ?? '').slice(0, 100);
  const head = cid.split(':')[0];
  if (!pdaHeads().has(head) || !user?.id) return null;
  if (overAccountRate(`pda:${user.id}`, ctx.nowS, Number(env?.PDA_PRESS_MAX) || PDA_PRESS_MAX, 60)) return refusalNote(refusalText('rate'));
  const fields = press?.fields && typeof press.fields === 'object' && !Array.isArray(press.fields) ? Object.entries(press.fields).slice(0, 5) : null;
  const values = Array.isArray(press?.values) ? press.values.slice(0, 25).map((v) => String(v).slice(0, 100)) : [];
  const type = fields ? 5 : 3;
  const body = {
    type,
    user: { id: user.id, username: user.username ?? '' },
    message: { flags: EPHEMERAL | V2 },
    data: fields
      ? { custom_id: cid, components: fields.map(([k, v]) => ({ type: 18, component: { custom_id: String(k).slice(0, 100), value: String(v ?? '').slice(0, 4000) } })) }
      : { custom_id: cid, component_type: values.length ? 3 : 2, values },
  };
  return answerInteraction(ctx, env, body, io, { type, cid, head, command: false });
}

/** What Discord is told while the answer is still being drawn: the pressed screen kept, or a private one to come. */
function deferredOf(body, head) {
  const keeps = head === 'pda' || /** @type {any} */ (tablesOf().byHead.get(head))?.pressUpdates === true;
  const inPda = body?.type === 3 ? keeps : body?.type === 5 && !!body?.message && (Number(body.message.flags) & EPHEMERAL) !== 0;
  return inPda ? { type: ANSWER.DEFER_UPDATE } : { type: ANSWER.DEFER_MESSAGE, data: { flags: EPHEMERAL } };
}

/** An answer as the late edit carries it. A form cannot open after a wait, so it is asked for again. */
function lateData(answer) {
  if (answer?.type === ANSWER.MODAL)
    return { flags: V2, components: [container([text('Press that again to open its form.')], ACCENT.WARN)], allowed_mentions: { parse: [] } };
  const data = answer?.data ?? {};
  return { ...data, flags: (Number(data.flags) || 0) & ~EPHEMERAL };
}

/** The service's own address as an interaction last reached it, kept once an isolate for the clock's cards. */
let selfKept = '';
/** Tests stand fresh isolates. */
export const _resetSelfForTests = () => (selfKept = '');

/** The interaction answered, whatever time it takes. */
async function answerInteraction(ctx, env, body, io, { type, cid, head, command }) {
  const who = await whoOf(ctx, env, body, io);
  if (who.origin && who.origin !== selfKept && /^https:\/\//.test(who.origin)) {
    selfKept = who.origin;
    await keepState(ctx.db, 'self', who.origin, ctx.nowS).catch(() => {});
  }
  try {
    if (command) return await friendsPda.profileCommand(who, String(body?.data?.target_id ?? ''));
    const parts = cid.split(':');
    if (type === 5) return await onForm(who, parts, formValues(body?.data));
    const values = Array.isArray(body?.data?.values) ? body.data.values.map(String) : [];
    if (head === 'open') {
      // the Courier's press into the journal's Activity: Discord opens it in the channel the press was made in
      if (parts[1] === 'activity') return { type: ANSWER.LAUNCH_ACTIVITY };
      if (parts[1] === 'link') return reply(who.player ? await screenFor(who, 'settings', []) : linkScreen('', who));
      return answerOf(await screenFor(who, parts[1], parts.slice(2)), true);
    }
    if (head === 'pda') return await onPress(who, parts, values);
    const m = tablesOf().byHead.get(head);
    return m?.press ? answerOf(await m.press(who, parts, values), true) : refusalNote(refusalText('gone'));
  } catch (e) {
    console.warn('[pda] an interaction failed:', /** @type {any} */ (e)?.stack ?? e);
    return refusalNote('Something went wrong. Try again.');
  }
}

/** A press inside the PDA, or the menu. */
async function onPress(who, parts, values) {
  const [, key, act, ...args] = parts;
  if (key === 'nav') return update(await screenFor(who, SCREEN_KEYS.includes(values[0]) ? values[0] : 'home', []));
  if (key === 'link' && act === 'code') return CODE_FORM;
  if (!act) return update(await screenFor(who, key, []));
  const m = tablesOf().byKey.get(key);
  const s = screenOf(key);
  const fn = m?.acts?.[act];
  if (!m || !s || !fn) return update(await screenFor(who, 'home', []));
  if (!s.open && !who.player) return update(linkScreen('', who));
  if (s.staff && !who.staff) return update(refusalScreen(who, refusalText('not-staff')));
  if (who.barred && !(key === 'settings' && act.startsWith('unlink'))) return update(refusalScreen(who, barredWords(who), 'settings'));
  return answerOf(await fn(who, args, values), false);
}

/** A submitted form. */
async function onForm(who, parts, values) {
  const [, key, form, ...args] = parts;
  const launched = !who.body?.message || !(Number(who.body.message.flags) & 64);
  if (key === 'link' && form === 'code') {
    const r = await redeemLinkCode(who.ctx, who.user, values.code);
    if ('error' in r) return answerOf(linkScreen(refusalText(r.error), who), launched);
    const now = await whoOf(who.ctx, who.env, who.body, who.io);
    return answerOf(
      frame(now, 'home', [...(await homePda.screenParts(now)), ...[]], {
        title: 'Linked',
        actions: homePda.actionsOf(now),
      }),
      launched,
    );
  }
  const m = tablesOf().byKey.get(key);
  const s = screenOf(key);
  const fn = m?.forms?.[form];
  if (!m || !s || !fn) return refusalNote(refusalText('gone'));
  if (!s.open && !who.player) return answerOf(linkScreen('', who), launched);
  if (s.staff && !who.staff) return refusalNote(refusalText('not-staff'));
  if (who.barred) return refusalNote(barredWords(who));
  return answerOf(await fn(who, values, args), launched);
}

/** For a module: a modal answer passes through untouched. */
export const isRaw = (/** @type {any} */ r) => r && !Array.isArray(r) && typeof r.type === 'number';
export { ANSWER };
