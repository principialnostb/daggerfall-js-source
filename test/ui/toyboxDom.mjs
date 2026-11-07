// The toybox tests' small DOM: elements that bubble events up their parents, a window that hears capture listeners
// first - enough for the window, the popups, the command bar and the host, which build plain DOM.
export function fakeDom({ width = 800, height = 600 } = {}) {
  const win = { innerWidth: width, innerHeight: height, on: [] };
  win.addEventListener = (type, f, capture) => win.on.push({ type, f, capture: !!capture });
  win.removeEventListener = (type, f, capture) => { win.on = win.on.filter((l) => !(l.type === type && l.f === f && l.capture === !!capture)); };
  win.getComputedStyle = (el) => ({ position: el.style.position || 'static' });
  const doc = { defaultView: win, activeElement: null };
  const node = (tag) => {
    const n = { tagName: tag.toUpperCase(), children: [], parentElement: null, ownerDocument: doc, attrs: {}, on: {}, style: {}, _text: '', value: '', disabled: false, tabIndex: 0, offsetWidth: 100, offsetHeight: 80, offsetLeft: 0, offsetTop: 0, clientHeight: 80 };
    Object.defineProperty(n, 'textContent', { get: () => n._text + n.children.map((c) => c.textContent).join(''), set: (t) => { n.children = []; n._text = String(t); } });
    n.append = (...cs) => { for (const c of cs) { c.parentElement = n; n.children.push(c); } };
    n.appendChild = (c) => { n.append(c); return c; };
    n.replaceChildren = (...cs) => { n.children = []; n.append(...cs); };
    n.remove = () => { if (n.parentElement) n.parentElement.children = n.parentElement.children.filter((c) => c !== n); n.parentElement = null; };
    n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
    n.getAttribute = (k) => n.attrs[k] ?? null;
    n.removeAttribute = (k) => { delete n.attrs[k]; };
    n.addEventListener = (k, f) => (n.on[k] ??= []).push(f);
    n.removeEventListener = (k, f) => { n.on[k] = (n.on[k] ?? []).filter((x) => x !== f); };
    n.focus = () => { doc.activeElement = n; };
    n.blur = () => { if (doc.activeElement === n) { doc.activeElement = null; fire(n, 'blur', {}, { bubbles: false }); } };
    n.getBoundingClientRect = () => ({ left: parseFloat(n.style.left) || 0, top: parseFloat(n.style.top) || 0, width: n.offsetWidth, height: n.offsetHeight });
    n.setPointerCapture = (id) => { n.captured = id; };
    n.releasePointerCapture = () => { n.captured = null; };
    return n;
  };
  doc.createElement = (tag) => node(tag);
  doc.body = node('body');
  /** Fires `type` at `target`: the window's capture listeners, then the target and its parents, then the window's bubble listeners. */
  function fire(target, type, props = {}, { bubbles = true } = {}) {
    let stopped = false, now = false;
    const e = { type, target, defaultPrevented: false, key: '', code: '', ...props, preventDefault() { e.defaultPrevented = true; }, stopPropagation() { stopped = true; }, stopImmediatePropagation() { stopped = true; now = true; } };
    for (const l of [...win.on]) if (l.type === type && l.capture) { l.f(e); if (now) return e; }
    if (stopped) return e;
    for (let n = target; n; n = bubbles ? n.parentElement : null) {
      for (const f of [...(n.on[type] ?? [])]) { f(e); if (now) return e; }
      if (stopped) return e;
    }
    for (const l of [...win.on]) if (l.type === type && !l.capture) l.f(e);
    e.reachedWindow = true;
    return e;
  }
  const all = (root = doc.body) => [root, ...root.children.flatMap((c) => all(c))];
  const find = (pred, root) => all(root).find(pred) ?? null;
  const byAttr = (k, v, root) => find((n) => n.attrs[k] != null && (v === undefined || n.attrs[k] === v), root);
  const type = (input, text) => { input.value = text; fire(input, 'input'); };
  return { doc, win, fire, all, find, byAttr, type };
}
