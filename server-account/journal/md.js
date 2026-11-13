// @ts-check
// Discord's markdown, as the bot writes its pages, read into the journal's HTML. Everything is escaped first, so a
// player's words can never become markup; only the marks below are read back, and a link opens through Discord.
// Pure: no DOM, so the book's tests read it under Node.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Text made safe to place in HTML. @param {unknown} s */
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => /** @type {Record<string, string>} */ (ESC)[c]);

/** The marks a backslash keeps literal, as the bot's `md()` escapes them. */
const ESCAPABLE = /\\([\\`*_~|>#[\]()<@:\-.!+={}])/g;
/** Control characters never shown: the markers below are made of them, so no player's text can forge one. */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
/** A held piece of text (a literal, a code span, a link) stands as \u0002<n>\u0002 until the marks are read. */
const held = (/** @type {string[]} */ list, /** @type {string} */ v) => `\u0002${list.push(v) - 1}\u0002`;
const HELD_RE = /\u0002(\d+)\u0002/g;

/** A Discord timestamp's words in the reader's own locale. @param {number} s @param {string} f @param {number} nowMs */
export function timeWords(s, f, nowMs = Date.now()) {
  const d = new Date(s * 1000);
  const opt = /** @type {Record<string, Intl.DateTimeFormatOptions>} */ ({
    t: { hour: 'numeric', minute: '2-digit' },
    T: { hour: 'numeric', minute: '2-digit', second: '2-digit' },
    d: { day: 'numeric', month: 'numeric', year: 'numeric' },
    D: { day: 'numeric', month: 'long', year: 'numeric' },
    f: { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' },
    F: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' },
  });
  if (f === 'R') return relativeWords(s * 1000 - nowMs);
  try {
    return new Intl.DateTimeFormat(undefined, opt[f] ?? opt.f).format(d);
  } catch {
    return d.toISOString();
  }
}

/** "in 3 hours", "5 minutes ago". @param {number} ms */
export function relativeWords(ms) {
  const units = /** @type {[Intl.RelativeTimeFormatUnit, number][]} */ ([
    ['year', 31536e6],
    ['month', 2592e6],
    ['week', 6048e5],
    ['day', 864e5],
    ['hour', 36e5],
    ['minute', 6e4],
    ['second', 1e3],
  ]);
  const abs = Math.abs(ms);
  const [unit, size] = units.find(([, n]) => abs >= n) ?? ['second', 1e3];
  try {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(Math.round(ms / size), unit);
  } catch {
    return `${Math.round(ms / size)} ${unit}s`;
  }
}

/** The emphasis marks: bold, underline, italics, strikethrough, spoilers. Escaped text in, HTML out. */
function marks(/** @type {string} */ s) {
  return s
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<u>$1</u>')
    .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler" tabindex="0">$1</span>');
}

/** One line's inline marks. The line is escaped already; code spans and links are held so no mark runs inside them. */
function inline(/** @type {string} */ s, /** @type {number} */ nowMs, /** @type {string[]} */ hold) {
  let out = s
    .replace(/`([^`]+)`/g, (_, c) => held(hold, `<code>${c}</code>`))
    .replace(/\[([^\]\n]{1,200})\]\((https:\/\/[^\s)]{1,500})\)/g, (_, t, u) => held(hold, `<a href="#" data-href="${u}">${marks(t)}</a>`));
  out = out
    .replace(/&lt;t:(-?\d{1,12})(?::([tTdDfFR]))?&gt;/g, (_, t, f = 'f') => held(hold, `<time data-t="${t}" data-f="${f}">${escapeHtml(timeWords(Number(t), f, nowMs))}</time>`))
    .replace(/&lt;a?:(\w{1,32}):\d{5,25}&gt;/g, ':$1:')
    .replace(/&lt;@[!&]?\d{5,25}&gt;/g, '<span class="who">@someone</span>')
    .replace(/&lt;#\d{5,25}&gt;/g, '<span class="who">#a channel</span>');
  return marks(out);
}

/**
 * A page's text, read: headings, small print, quotes, lists, code blocks and the inline marks.
 * @param {unknown} src the bot's markdown @param {number} [nowMs] for relative times
 * @returns {string} HTML
 */
export function mdToHtml(src, nowMs = Date.now()) {
  /** @type {string[]} */
  const hold = [];
  const text = String(src ?? '')
    .replace(CONTROL, '')
    .replace(ESCAPABLE, (_, c) => held(hold, escapeHtml(c)));
  const lines = escapeHtml(text).split('\n');
  /** @type {string[]} */
  const out = [];
  /** @type {'ul'|'ol'|null} */
  let list = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^```/.test(ln)) {
      closeList();
      const body = [];
      let j = i + 1;
      if (/^```[^`]*```$/.test(ln) && ln.length > 6) {
        out.push(`<pre>${ln.slice(3, -3)}</pre>`);
        continue;
      }
      for (; j < lines.length && !/^```/.test(lines[j]); j++) body.push(lines[j]);
      out.push(`<pre>${body.join('\n')}</pre>`);
      i = j;
      continue;
    }
    let m;
    if ((m = /^(#{1,3}) (.*)$/.exec(ln))) {
      closeList();
      const n = m[1].length;
      out.push(`<h${n + 1} class="ink-h${n}">${inline(m[2], nowMs, hold)}</h${n + 1}>`);
    } else if ((m = /^-# (.*)$/.exec(ln))) {
      closeList();
      out.push(`<p class="margin">${inline(m[1], nowMs, hold)}</p>`);
    } else if ((m = /^&gt;&gt;&gt; (.*)$/.exec(ln))) {
      closeList();
      out.push(`<blockquote>${[m[1], ...lines.slice(i + 1)].map((l) => inline(l, nowMs, hold)).join('<br>')}</blockquote>`);
      break;
    } else if ((m = /^&gt; (.*)$/.exec(ln))) {
      closeList();
      out.push(`<blockquote>${inline(m[1], nowMs, hold)}</blockquote>`);
    } else if ((m = /^\s*[-*•] (.*)$/.exec(ln))) {
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(m[1], nowMs, hold)}</li>`);
    } else if ((m = /^\s*\d{1,3}\. (.*)$/.exec(ln))) {
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(m[1], nowMs, hold)}</li>`);
    } else if (!ln.trim()) {
      closeList();
      out.push('<div class="gap"></div>');
    } else {
      closeList();
      out.push(`<p>${inline(ln, nowMs, hold)}</p>`);
    }
  }
  closeList();
  // the held pieces come back last (a held piece may hold another), so no mark is ever read inside one
  let html = out.join('');
  for (let i = 0; i < 4 && /\u0002\d+\u0002/.test(html); i++) html = html.replace(HELD_RE, (_, n) => hold[Number(n)] ?? '');
  return html;
}

/** A page's text as plain words: for a picture's description and a note's title. @param {unknown} src */
export const mdToPlain = (src) =>
  String(src ?? '')
    .replace(CONTROL, '')
    .replace(ESCAPABLE, '$1')
    .replace(/^(#{1,3}|-#|>) /gm, '')
    .replace(/[*_~|`]/g, '')
    .trim();
