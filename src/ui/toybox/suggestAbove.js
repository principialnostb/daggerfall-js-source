// @ts-check
// AN AUTOCOMPLETE LIST THAT OPENS ABOVE ITS TEXT BOX. The toybox's player and city boxes sit at the bottom of their
// popups, so the list grows upward where there is room. The matching is pure (matchSuggestions); the list is a DOM
// element laid over the box's own parent.

const fold = (/** @type {unknown} */ text) => String(text ?? '').toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim();

/** The names that match what is typed: those that begin with it first, then those that contain it, each in the order
 *  given, without repeats, at most `max`. An empty box lists nothing. @param {Iterable<string>} names @param {string} typed @param {number} [max] */
export function matchSuggestions(names, typed, max = 8) {
  const want = fold(typed);
  if (!want) return [];
  const begins = [],
    holds = [],
    seen = new Set();
  for (const n of names) {
    const folded = fold(n);
    if (!folded || seen.has(folded)) continue;
    seen.add(folded);
    if (folded.startsWith(want)) begins.push(n);
    else if (folded.includes(want)) holds.push(n);
  }
  return [...begins, ...holds].slice(0, Math.max(0, max));
}

const LIST_CSS =
  'position:absolute;z-index:2;max-height:180px;overflow-y:auto;margin:0;padding:2px 0;list-style:none;' +
  'background:rgba(12,14,18,0.94);border:1px solid rgba(127,227,240,0.55);border-radius:3px;box-sizing:border-box;';
const ROW_CSS = 'padding:3px 8px;cursor:pointer;white-space:nowrap;color:#e6f6f8;';
const ROW_HOT = 'rgba(127,227,240,0.22)';

/**
 * Attaches the list to `input`. `list()` gives every name the box may take, read fresh as the player types; a click or
 * Enter on a row fills the box and calls `onPick`. Arrow keys move the highlight, Escape closes the list.
 * @param {HTMLInputElement} input
 * @param {{ list: () => Iterable<string>, onPick?: (name: string) => void, max?: number }} opts
 */
export function createSuggestAbove(input, { list, onPick = () => {}, max = 8 }) {
  const doc = input.ownerDocument;
  const host = /** @type {HTMLElement} */ (input.parentElement);
  if (host && doc.defaultView?.getComputedStyle?.(host).position === 'static') host.style.position = 'relative';
  const listEl = doc.createElement('ul');
  listEl.style.cssText = LIST_CSS + 'display:none;';
  listEl.setAttribute('role', 'listbox');
  host?.appendChild(listEl);
  /** @type {string[]} */
  let rows = [];
  let hot = -1;
  const paint = () => {
    [...listEl.children].forEach((row, i) => {
      /** @type {HTMLElement} */ (row).style.background = i === hot ? ROW_HOT : 'transparent';
    });
  };
  const close = () => {
    rows = [];
    hot = -1;
    listEl.style.display = 'none';
    listEl.replaceChildren();
  };
  const pick = (/** @type {string} */ name) => {
    input.value = name;
    close();
    onPick(name);
  };
  const refresh = () => {
    rows = matchSuggestions(list(), input.value, max);
    hot = rows.length ? 0 : -1;
    listEl.replaceChildren(
      ...rows.map((name) => {
        const row = doc.createElement('li');
        row.style.cssText = ROW_CSS;
        row.textContent = name;
        row.setAttribute('role', 'option');
        // mousedown, not click: the box's blur would close the list before a click lands
        row.addEventListener('mousedown', (e) => {
          e.preventDefault();
          pick(name);
        });
        return row;
      }),
    );
    if (!rows.length) {
      listEl.style.display = 'none';
      return;
    }
    listEl.style.left = `${input.offsetLeft}px`;
    listEl.style.minWidth = `${input.offsetWidth}px`;
    listEl.style.bottom = `${(host?.clientHeight ?? 0) - input.offsetTop + 2}px`;
    listEl.style.display = 'block';
    paint();
  };
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (!rows.length) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      hot = (hot + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      paint();
    } else if (e.key === 'Enter' && hot >= 0) {
      e.preventDefault();
      pick(rows[hot]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', onKey);
  input.addEventListener('blur', close);
  return {
    el: listEl,
    refresh,
    close,
    /** The rows shown now (for tests). */
    rows: () => rows.slice(),
    destroy() {
      input.removeEventListener('input', refresh);
      input.removeEventListener('keydown', onKey);
      input.removeEventListener('blur', close);
      listEl.remove();
    },
  };
}
