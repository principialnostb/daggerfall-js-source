// The Discord PDA's test rig: the account service on a fresh database, registered players linked to Discord users, and
// the interactions Discord would send for a press, a menu choice, a submitted form or an Apps command - answered by the
// service's own discordInteraction. A fake Discord API keeps every call the bot makes.
import assert from 'node:assert/strict';
import { standService } from './accountDb.mjs';
import { discordInteraction } from '../server-account/src/discord.js';
import { countComponents, textLength, LIMITS, C } from '../server-account/src/pdaUi.js';
import { redeemLinkCode, mintLinkCode } from '../server-account/src/pdaLink.js';

const { subtle } = globalThis.crypto;
let snow = 100_000_000_000_000_000n;
/** A fresh Discord id. */
export const snowflake = () => String(++snow);

/**
 * A Discord API that answers each call by `routes` (method and path, a function or a fixed answer) and keeps them all.
 * Unrouted calls answer 200 with `{ id }` a fresh snowflake, as a post does.
 */
export function fakeDiscord(routes = {}) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const path = String(url).replace('https://discord.com/api/v10', '');
    const method = init.method ?? 'GET';
    const payload = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, payload, headers: init.headers });
    const key = `${method} ${path}`;
    const route = Object.entries(routes).find(([k]) => (k.endsWith('*') ? key.startsWith(k.slice(0, -1)) : k === key));
    let answer = route ? (typeof route[1] === 'function' ? route[1](payload, path) : route[1]) : { status: 200, json: { id: snowflake() } };
    if (answer && answer.status === undefined) answer = { status: 200, json: answer };
    const status = answer?.status ?? 200;
    const text = answer?.json === undefined ? '' : JSON.stringify(answer.json);
    return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => (text ? JSON.parse(text) : null) };
  };
  return { fetchFn, calls, called: (method, prefix) => calls.filter((c) => c.method === method && c.path.startsWith(prefix)) };
}

/** The service and a way to drive it from Discord. */
export async function pdaRig(extra = {}) {
  const s = await standService({ DISCORD_PUBLIC_KEY: 'ab'.repeat(32), DISCORD_BOT_TOKEN: 'bot-token', DISCORD_MOD_CHANNEL: '900000000000000001', ...extra });
  const discord = fakeDiscord();
  const nowS = () => Math.floor(Date.now() / 1000);
  const ctx = () => ({ db: s.env.DB, primary: s.env.DB, subtle, rand: (b) => crypto.getRandomValues(b), nowS: nowS(), bucket: s.env.SAVES, self: 'https://accounts.invalid' });
  const later = [];

  /** A registered player linked to a fresh Discord user. */
  const linked = async (handle, opts = {}) => {
    const who = await (opts.seated ? s.seated(handle, opts) : s.registered(handle, opts));
    const player = s.env.DB._raw.prepare('SELECT * FROM players WHERE id = ?').get(who.id);
    const minted = await mintLinkCode(ctx(), player);
    assert.ok(minted.ok, `${handle} mints a code`);
    const user = { id: snowflake(), username: handle.toLowerCase() };
    const r = await redeemLinkCode(ctx(), user, minted.code);
    assert.ok(r.ok, `${handle} links`);
    return { ...who, user, discordId: user.id };
  };

  const send = async (body) => {
    const answer = await discordInteraction(ctx(), s.env, { application_id: '700000000000000001', token: 'tok', id: snowflake(), ...body }, { fetchFn: discord.fetchFn, later: (p) => later.push(p) });
    await Promise.all(later.splice(0));
    return answer;
  };
  const userOf = (u) => (u.user ? u.user : u);
  /** A button pressed on an ephemeral PDA screen (or `message` given). */
  const press = (u, customId, { message = { flags: 64 | (1 << 15) }, values } = {}) =>
    send({ type: 3, member: { user: userOf(u) }, message, data: { custom_id: customId, component_type: values ? 3 : 2, ...(values ? { values } : {}) } });
  /** A menu choice. */
  const choose = (u, customId, values, opts = {}) => press(u, customId, { ...opts, values });
  /** A form submitted. `fields` its values by custom id. */
  const submit = (u, customId, fields, { message = { flags: 64 | (1 << 15) } } = {}) =>
    send({
      type: 5,
      member: { user: userOf(u) },
      ...(message ? { message } : {}),
      data: { custom_id: customId, components: Object.entries(fields).map(([k, v]) => ({ type: 18, component: { type: Array.isArray(v) ? 3 : 4, custom_id: k, ...(Array.isArray(v) ? { values: v } : { value: v }) } })) },
    });
  /** The Apps menu's user command. */
  const command = (u, name, targetId) => send({ type: 2, member: { user: userOf(u) }, data: { type: 2, name, target_id: targetId } });

  return { ...s, s, discord, ctx, nowS, linked, send, press, choose, submit, command, raw: s.env.DB._raw };
}

/** Every text a screen draws, joined. */
export function screenText(answer) {
  const out = [];
  const walk = (list) => {
    for (const c of list ?? []) {
      if (c.type === C.TEXT) out.push(c.content);
      // a picture is read by its description, as a screen reader reads it: a page's heading names the page
      if (c.type === C.GALLERY) for (const it of c.items ?? []) if (it.description) out.push(`{${it.description}}`);
      if (c.components) walk(c.components);
      if (c.accessory?.label) out.push(`[${c.accessory.label}]`);
      if (c.type === C.BUTTON) out.push(`[${c.label}]`);
      if (c.type === C.SELECT) out.push(...c.options.map((o) => `<${o.label}>`));
    }
  };
  walk(answer?.data?.components ?? answer?.components ?? []);
  return out.join('\n');
}

/** Every custom id a screen carries. */
export function customIds(answer) {
  const out = [];
  const walk = (list) => {
    for (const c of list ?? []) {
      if (c.custom_id) out.push(c.custom_id);
      if (c.accessory?.custom_id) out.push(c.accessory.custom_id);
      if (c.component?.custom_id) out.push(c.component.custom_id);
      if (c.components) walk(c.components);
    }
  };
  walk(answer?.data?.components ?? []);
  return out;
}

const SELECTS = new Set([3, 5, 6, 7, 8]);
/** A button as Discord takes it: a label, and a custom id for an action or a URL for a link, never both. */
function buttonOk(b, what) {
  assert.ok(typeof b.label === 'string' && b.label.length >= 1 && b.label.length <= LIMITS.BUTTON_LABEL, `${what}: a button's label`);
  if (b.style === 5) assert.ok(b.url && !b.custom_id, `${what}: a link button has a URL alone`);
  else assert.ok(b.style >= 1 && b.style <= 4 && b.custom_id && !b.url, `${what}: an action button has a custom id alone`);
}
/** A menu as Discord takes it: 1 to 25 options within their bounds, no more chosen than may be. */
function selectOk(m, what) {
  assert.ok(m.options.length >= 1 && m.options.length <= LIMITS.SELECT_OPTIONS, `${what}: a menu's options`);
  for (const o of m.options) {
    assert.ok(o.label.length >= 1 && o.label.length <= LIMITS.OPTION_LABEL && String(o.value).length >= 1 && String(o.value).length <= 100, `${what}: an option's label and value`);
    if (o.description !== undefined) assert.ok(o.description.length <= LIMITS.OPTION_DESC, `${what}: an option's description`);
  }
  assert.equal(new Set(m.options.map((o) => o.value)).size, m.options.length, `${what}: a menu's values are its own`);
  const min = m.min_values ?? 1, max = m.max_values ?? 1;
  assert.ok(min >= 0 && min <= max && max <= m.options.length, `${what}: a menu's min and max`);
  assert.ok(m.options.filter((o) => o.default).length <= max, `${what}: no more chosen than may be`);
}
/** Discord's layout law over a message's tree: what may hold what, and every custom id once. */
function layoutOk(list, what) {
  const ids = [];
  const walk = (c, parent) => {
    if (c.custom_id) ids.push(c.custom_id);
    if (c.type === C.CONTAINER) {
      assert.equal(parent, 'top', `${what}: a container sits at the top`);
      for (const k of c.components) assert.ok([C.ROW, C.SECTION, C.TEXT, C.GALLERY, 13, C.SEPARATOR].includes(k.type), `${what}: a container holds ${k.type}`);
    } else if (c.type === C.ROW) {
      const kids = c.components ?? [];
      const menus = kids.filter((k) => SELECTS.has(k.type));
      if (menus.length) assert.equal(kids.length, 1, `${what}: a row with a menu holds it alone`);
      else assert.ok(kids.length >= 1 && kids.length <= 5 && kids.every((k) => k.type === C.BUTTON), `${what}: a row holds 1 to 5 buttons`);
    } else if (c.type === C.SECTION) {
      assert.ok(c.components.length >= 1 && c.components.length <= 3 && c.components.every((k) => k.type === C.TEXT), `${what}: a section holds 1 to 3 texts`);
      assert.ok(c.accessory && (c.accessory.type === C.BUTTON || c.accessory.type === C.THUMB), `${what}: a section's accessory`);
      if (c.accessory.type === C.BUTTON) { buttonOk(c.accessory, what); if (c.accessory.custom_id) ids.push(c.accessory.custom_id); }
    } else if (c.type === C.TEXT) assert.ok(String(c.content).length >= 1, `${what}: a text block says something`);
    else if (c.type === C.BUTTON) buttonOk(c, what);
    else if (SELECTS.has(c.type)) selectOk(c, what);
    if (parent === 'top') assert.ok([C.ROW, C.SECTION, C.TEXT, C.GALLERY, 13, C.SEPARATOR, C.CONTAINER].includes(c.type), `${what}: ${c.type} at the top`);
    for (const k of c.components ?? []) walk(k, c.type === C.CONTAINER ? 'container' : 'child');
  };
  for (const c of list) walk(c, 'top');
  assert.equal(new Set(ids).size, ids.length, `${what}: every custom id once - ${ids.filter((x, i) => ids.indexOf(x) !== i).join(', ')}`);
}

/** A screen within Discord's bounds: its components, its text, every custom id, every select's options. */
export function assertScreenOk(answer, what = 'screen') {
  assert.ok(answer && typeof answer.type === 'number', `${what}: an answer`);
  if (answer.type === 9) {
    assert.ok(answer.data.title.length >= 1 && answer.data.title.length <= LIMITS.MODAL_TITLE, `${what}: modal title`);
    assert.ok(answer.data.components.length >= 1 && answer.data.components.length <= 5, `${what}: modal fields`);
    const ids = [];
    for (const f of answer.data.components) {
      assert.ok(f.type === C.LABEL || f.type === C.TEXT, `${what}: a form holds labels`);
      if (f.type !== C.LABEL) continue;
      assert.ok(f.label.length >= 1 && f.label.length <= LIMITS.LABEL, `${what}: a label's words`);
      if (f.description !== undefined) assert.ok(f.description.length <= LIMITS.LABEL_DESC, `${what}: a label's hint`);
      const k = f.component;
      ids.push(k.custom_id);
      if (k.type === C.TEXT_INPUT) {
        assert.ok(k.style === 1 || k.style === 2, `${what}: a text box's style`);
        assert.ok(k.label === undefined, `${what}: a labelled text box carries no label of its own`);
        assert.ok(k.max_length >= 1 && k.max_length <= 4000 && (k.min_length ?? 0) <= k.max_length, `${what}: a text box's lengths`);
        if (k.value !== undefined) assert.ok(String(k.value).length <= k.max_length, `${what}: a text box's value fits`);
      } else assert.ok(SELECTS.has(k.type), `${what}: a form's field is a text box or a menu`);
      if (k.type === C.SELECT) selectOk(k, what);
    }
    assert.equal(new Set(ids).size, ids.length, `${what}: every field's id once`);
    return answer;
  }
  if (answer.type === 6 || answer.type === 5) return answer;
  const comps = answer.data?.components ?? [];
  assert.ok(answer.data.flags & (1 << 15), `${what}: layout components`);
  assert.ok(countComponents(comps) <= LIMITS.COMPONENTS, `${what}: ${countComponents(comps)} components`);
  assert.ok(textLength(comps) <= LIMITS.TEXT, `${what}: ${textLength(comps)} characters`);
  for (const id of customIds(answer)) assert.ok(id.length >= 1 && id.length <= LIMITS.CUSTOM_ID, `${what}: custom id ${id}`);
  layoutOk(comps, what);
  assert.deepEqual(answer.data.allowed_mentions, { parse: [] }, `${what}: pings nobody`);
  return answer;
}
