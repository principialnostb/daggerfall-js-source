// @ts-check
// The PDA's look: Discord's layout components (Components V2), built as plain objects. Every screen is one container
// with a header, a body, and a navigation menu at the foot, so the bot reads as one device rather than chat replies.
// Pure: nothing here reads the database or the network.

/** Discord's component types (its components reference). */
export const C = Object.freeze({
  ROW: 1,
  BUTTON: 2,
  SELECT: 3,
  TEXT_INPUT: 4,
  USER_SELECT: 5,
  SECTION: 9,
  TEXT: 10,
  THUMB: 11,
  GALLERY: 12,
  SEPARATOR: 14,
  CONTAINER: 17,
  LABEL: 18,
});
/** Button styles. */
export const STYLE = Object.freeze({ PRIMARY: 1, SECONDARY: 2, SUCCESS: 3, DANGER: 4, LINK: 5 });
/** Message flags: seen by the presser alone, and the layout components. */
export const EPHEMERAL = 1 << 6;
export const V2 = 1 << 15;
/** Interaction answers. */
export const ANSWER = Object.freeze({ PONG: 1, MESSAGE: 4, DEFER_MESSAGE: 5, DEFER_UPDATE: 6, UPDATE: 7, MODAL: 9, LAUNCH_ACTIVITY: 12 });

/** Discord's bounds, held by the builders so a long name never makes Discord refuse a whole screen. */
export const LIMITS = Object.freeze({
  COMPONENTS: 40,
  TEXT: 4000,
  CUSTOM_ID: 100,
  BUTTON_LABEL: 80,
  ROW_BUTTONS: 5,
  SELECT_OPTIONS: 25,
  OPTION_LABEL: 100,
  OPTION_DESC: 100,
  MODAL_TITLE: 45,
  LABEL: 45,
  LABEL_DESC: 100,
  PLACEHOLDER: 150,
});

/** The journal's colours: its frame's sepia edge, and the colours a page may take for its mood. */
export const ACCENT = Object.freeze({
  JOURNAL: 0x8b5e34,
  PDA: 0x8b5e34,
  STAFF: 0x6e2a1c,
  GOOD: 0x4e7a3a,
  WARN: 0xa0601a,
  BAD: 0x8a2a1c,
  QUIET: 0x7a6a58,
});

/** Places as the journal names them: the lore's spelling where the game's own tables keep Daggerfall's. */
export const LORE_NAMES = Object.freeze({ Sumurset: 'Summerset' });
/** A place's name in the lore's spelling. Never applied to a player's own words. @param {unknown} s */
export const loreName = (s) =>
  String(s ?? '').replace(/Sumurset/g, LORE_NAMES.Sumurset).replace(/SUMURSET/g, LORE_NAMES.Sumurset.toUpperCase());

/** One line of text safe to draw: no line breaks, no runaway length. @param {unknown} s @param {number} [max] */
export const line = (s, max = 200) => {
  const t = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
/** A player's words outside a code block: every markdown mark escaped, so a name cannot draw a link or ping. */
export const md = (/** @type {unknown} */ s, max = 200) => line(s, max).replace(/([\\`*_~|>#[\]()<@:-])/g, '\\$1');
/** A player's words inside a code block: the fence cannot be closed from inside. */
export const fenced = (/** @type {unknown} */ s, max = 1500) => {
  const t = String(s ?? '')
    .replace(/```/g, "'''")
    .replace(/\r/g, '');
  return `\`\`\`\n${t.length > max ? `${t.slice(0, max - 1)}…` : t}\n\`\`\``;
};
/** A time in each reader's own zone. @param {number} s @param {'f'|'R'|'t'|'d'|'D'|'F'|'T'} [style] */
export const when = (s, style = 'f') => `<t:${Math.floor(Number(s) || 0)}:${style}>`;
/** A whole number with thousands marks. */
export const num = (/** @type {number} */ n) => Math.round(Number(n) || 0).toLocaleString('en-US');
/** "1 letter", "2 letters". */
export const plural = (/** @type {number} */ n, /** @type {string} */ one, many = `${one}s`) =>
  `${num(n)} ${n === 1 ? one : many}`;

/** A text block. Empty text draws a thin space, since Discord refuses an empty one. */
export const text = (/** @type {string} */ content) => ({
  type: C.TEXT,
  content: String(content || '​').slice(0, LIMITS.TEXT),
});
/** A divider. @param {boolean} [big] */
export const divider = (big = false) => ({ type: C.SEPARATOR, divider: true, spacing: big ? 2 : 1 });
/** Space without a line. */
export const gap = () => ({ type: C.SEPARATOR, divider: false, spacing: 1 });

/**
 * A button. `id` is its custom id, or a URL for a link button.
 * @param {string} label @param {string} id @param {{ style?: number, disabled?: boolean }} [o]
 */
export function button(label, id, { style = STYLE.SECONDARY, disabled = false } = {}) {
  const b = { type: C.BUTTON, style, label: line(label, LIMITS.BUTTON_LABEL) || '…', disabled };
  if (style === STYLE.LINK) return { ...b, url: id };
  return { ...b, custom_id: customId(id) };
}
/** A custom id within Discord's bound; a longer one is a bug in the caller, never cut silently. */
export function customId(/** @type {string} */ id) {
  const s = String(id);
  if (!s || s.length > LIMITS.CUSTOM_ID) throw new Error(`custom id out of bounds: ${s.slice(0, 40)}`);
  return s;
}
/** A row of buttons, at most five; empty rows are left out by `rows`. */
export const row = (/** @type {any[]} */ items) => ({ type: C.ROW, components: items.slice(0, LIMITS.ROW_BUTTONS) });
/** Buttons laid in rows of five. */
export function rows(/** @type {any[]} */ buttons) {
  const out = [];
  const list = buttons.filter(Boolean);
  for (let i = 0; i < list.length; i += LIMITS.ROW_BUTTONS) out.push(row(list.slice(i, i + LIMITS.ROW_BUTTONS)));
  return out;
}

/**
 * A select menu in its own row.
 * @param {string} id @param {{ label: string, value: string, description?: string, default?: boolean }[]} options
 * @param {{ placeholder?: string, min?: number, max?: number, disabled?: boolean }} [o]
 */
export function select(id, options, { placeholder = 'Choose…', min = 1, max = 1, disabled = false } = {}) {
  const opts = options.slice(0, LIMITS.SELECT_OPTIONS).map((o) => ({
    label: line(o.label, LIMITS.OPTION_LABEL) || '…',
    value: String(o.value).slice(0, 100),
    ...(o.description ? { description: line(o.description, LIMITS.OPTION_DESC) } : {}),
    ...(o.default ? { default: true } : {}),
  }));
  return {
    type: C.ROW,
    components: [
      {
        type: C.SELECT,
        custom_id: customId(id),
        options: opts.length ? opts : [{ label: 'Nothing here', value: '-' }],
        placeholder: line(placeholder, LIMITS.PLACEHOLDER),
        min_values: Math.min(min, Math.max(1, opts.length)),
        max_values: Math.min(max, Math.max(1, opts.length)),
        disabled: disabled || !opts.length,
      },
    ],
  };
}

/** A section: up to three text blocks with a button or a picture beside them. @param {string[]} texts @param {any} accessory */
export const section = (texts, accessory) => ({
  type: C.SECTION,
  components: texts.slice(0, 3).map(text),
  accessory,
});
/** A small picture beside a section. */
export const thumb = (/** @type {string} */ url, description = '') => ({
  type: C.THUMB,
  media: { url },
  ...(description ? { description: line(description, 1024) } : {}),
});
/** A picture across the screen. */
export const picture = (/** @type {string} */ url, description = '') => ({
  type: C.GALLERY,
  items: [{ media: { url }, ...(description ? { description: line(description, 1024) } : {}) }],
});
/** The frame every screen sits in. */
export const container = (/** @type {any[]} */ components, accent = ACCENT.PDA) => ({
  type: C.CONTAINER,
  accent_color: accent,
  components: components.filter(Boolean),
});

/** How many components a tree holds, as Discord counts them (each nested one too). */
export function countComponents(/** @type {any[]} */ list) {
  let n = 0;
  for (const c of list ?? []) {
    n += 1;
    if (Array.isArray(c.components)) n += countComponents(c.components);
    if (c.accessory) n += 1;
    if (c.component) n += 1;
  }
  return n;
}
/** All the text a tree draws, as Discord sums it against its 4,000. */
export function textLength(/** @type {any[]} */ list) {
  let n = 0;
  for (const c of list ?? []) {
    if (c.type === C.TEXT) n += String(c.content).length;
    if (Array.isArray(c.components)) n += textLength(c.components);
  }
  return n;
}

/**
 * A tree's text held to Discord's total: past it, the longest blocks are cut until it fits, a code fence closed again
 * where the cut fell inside one. Discord refuses a whole message past its total, so a long case or report still shows.
 * @param {any[]} list @param {number} [max]
 */
export function fitText(list, max = LIMITS.TEXT) {
  /** @type {any[]} */
  const texts = [];
  const walk = (/** @type {any[]} */ l) => {
    for (const c of l ?? []) {
      if (c?.type === C.TEXT) texts.push(c);
      if (Array.isArray(c?.components)) walk(c.components);
    }
  };
  walk(list);
  let over = texts.reduce((n, t) => n + String(t.content).length, 0) - max;
  while (over > 0 && texts.length) {
    const t = texts.reduce((a, b) => (String(b.content).length > String(a.content).length ? b : a));
    const was = String(t.content);
    const room = Math.max(1, was.length - over - 8);
    let cut = `${was.slice(0, room)}…`;
    if ((cut.match(/```/g) ?? []).length % 2 === 1) cut += '\n```';
    if (cut.length >= was.length) break;
    t.content = cut;
    over -= was.length - cut.length;
  }
  return list;
}

/** A message body of layout components: never mentions anyone, and never past Discord's text total.
 *  @param {any[]} components @param {{ ephemeral?: boolean }} [o] */
export const body = (components, { ephemeral = false } = {}) => ({
  flags: V2 | (ephemeral ? EPHEMERAL : 0),
  components: fitText(components),
  allowed_mentions: { parse: [] },
});
/** A new private screen for the presser. */
export const reply = (/** @type {any[]} */ components) => ({ type: ANSWER.MESSAGE, data: body(components, { ephemeral: true }) });
/** The pressed screen drawn again in place. */
export const update = (/** @type {any[]} */ components) => ({ type: ANSWER.UPDATE, data: body(components) });

/**
 * A pop-up form. Each field is a text box or a menu, under its own label.
 * @param {string} id @param {string} title
 * @param {({ id: string, label: string, hint?: string, long?: boolean, min?: number, max?: number, required?: boolean, value?: string, placeholder?: string } | { id: string, label: string, hint?: string, options: { label: string, value: string, description?: string, default?: boolean }[], required?: boolean })[]} fields
 */
export function modal(id, title, fields) {
  return {
    type: ANSWER.MODAL,
    data: {
      custom_id: customId(id),
      title: line(title, LIMITS.MODAL_TITLE),
      components: fields.slice(0, 5).map((f) => ({
        type: C.LABEL,
        label: line(f.label, LIMITS.LABEL),
        ...(f.hint ? { description: line(f.hint, LIMITS.LABEL_DESC) } : {}),
        component:
          'options' in f
            ? {
                type: C.SELECT,
                custom_id: customId(f.id),
                options: f.options.slice(0, LIMITS.SELECT_OPTIONS).map((o) => ({
                  label: line(o.label, LIMITS.OPTION_LABEL),
                  value: String(o.value).slice(0, 100),
                  ...(o.description ? { description: line(o.description, LIMITS.OPTION_DESC) } : {}),
                  ...(o.default ? { default: true } : {}),
                })),
                min_values: 1,
                max_values: 1,
                required: f.required !== false,
              }
            : {
                type: C.TEXT_INPUT,
                custom_id: customId(f.id),
                style: f.long ? 2 : 1,
                ...(f.min ? { min_length: f.min } : {}),
                max_length: f.max ?? 100,
                required: f.required !== false,
                ...(f.value ? { value: String(f.value).slice(0, f.max ?? 100) } : {}),
                ...(f.placeholder ? { placeholder: line(f.placeholder, LIMITS.PLACEHOLDER) } : {}),
              },
      })),
    },
  };
}

/** What a submitted form holds: each field's value (a text box's words, a menu's first choice), by its custom id. */
export function formValues(/** @type {any} */ data) {
  /** @type {Record<string, string>} */
  const out = {};
  const walk = (/** @type {any[]} */ list) => {
    for (const c of list ?? []) {
      if (c?.component) walk([c.component]);
      if (Array.isArray(c?.components)) walk(c.components);
      if (typeof c?.custom_id === 'string') {
        if (typeof c.value === 'string') out[c.custom_id] = c.value;
        else if (Array.isArray(c.values)) out[c.custom_id] = String(c.values[0] ?? '');
      }
    }
  };
  walk(data?.components);
  return out;
}

/** A private answer of a few words, in the device's frame. */
export const note = (/** @type {string} */ words, accent = ACCENT.PDA) => reply([container([text(words)], accent)]);
