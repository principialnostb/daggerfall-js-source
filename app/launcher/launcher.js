// THE LAUNCHER'S DRAW. It holds no state of its own: the shell sends the whole view (app/lib/launcherState.cjs viewOf)
// on every change, and this paints it. Every word reaches the page as TEXT - the patch notes included, which come from
// GitHub - through textContent and fresh elements, never markup.
//
// The regions: the headline and the patch notes (or the first run's card), the dock with the update and PLAY, and over
// them Settings, PLAY's question and the Private server. A button says WHICH action it is (data-act, or its view
// entry); the shell decides what that does.
'use strict';

(() => {
  const bridge = window.daggerLauncher;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const button = (a, cls) => {
    const b = el('button', `${cls}${a.primary ? ' primary' : ''}`, a.label);
    b.type = 'button';
    if (a.name) b.setAttribute('aria-label', a.name);
    b.addEventListener('click', () => bridge.act(a.id, a.arg));
    return b;
  };
  /** Text written only when it changed: a screen reader re-reads a region
   *  whose text is replaced, even with the same words (AUDIT INSTALL L5-17). */
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };

  /** A line of notes as plain words: links and `code` as their text, no ** marks. */
  const plain = (text) => String(text).replace(/\[([^\][]*)\]\([^()]*\)/g, '$1').replace(/`([^`]*)`/g, '$1').replace(/\*\*/g, '');

  /** "a **b** c" as text nodes and <strong>, `code` and links as their text. */
  function inline(target, text) {
    const plain = String(text).replace(/\[([^\][]*)\]\([^()]*\)/g, '$1').replace(/`([^`]*)`/g, '$1');
    plain.split('**').forEach((part, i) => {
      if (part) target.append(i % 2 ? el('strong', null, part) : document.createTextNode(part));
    });
  }

  const BADGE = { new: 'New', update: 'Update' };
  const HERO_KIND = { new: 'New since you last played', update: 'In the next update' };

  /** The headline: the newest release's title (its first heading, "Patch Notes:" taken off) and its first point. Notes
   *  with no title give their first point as the title and their second as the line. Code blocks are skipped: the
   *  patch notes beside it hold the whole of it. */
  function drawHero(note) {
    if (!note) return;
    let title = null, fenced = false;
    const said = [];
    for (const raw of String(note.text ?? '').split('\n')) {
      const line = raw.trim();
      if (/^(```|~~~)/.test(line)) { fenced = !fenced; continue; }
      if (fenced || !line) continue;
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (heading) { title ??= heading[1].replace(/^Patch Notes:?\s*/i, ''); continue; }
      said.push(plain(line.replace(/^[-*]\s+/, '')));
      if (said.length === 2) break;
    }
    if (!title) title = said.shift() ?? '';
    const name = note.update ? `Update ${note.update}` : `v${note.version}`;
    $('hero-kind').textContent = Object.hasOwn(HERO_KIND, note.badge) ? HERO_KIND[note.badge] : 'Latest update';
    $('hero-when').textContent = note.date ? `${name} - ${note.date}` : name;
    $('hero-title').textContent = plain(title) || name;
    $('hero-text').textContent = said[0] ?? '';
  }

  /** A release's patch notes - the markdown subset a pull request's
   *  "Patch notes" section is written in (scripts/desktopRelease.mjs):
   *  headings, bullets (nested by their indent), paragraphs. Anything
   *  else is a paragraph of its text. */
  function notesBlock(note) {
    const box = el('article', 'release');
    if (Object.hasOwn(BADGE, note.badge)) box.dataset.badge = note.badge;
    box.setAttribute('tabindex', '-1');
    const head = el('div', 'head');
    head.append(el('span', 'ver', note.update ? `Update ${note.update}` : `v${note.version}`));   // REL8: the player's update number, where the release names one
    if (note.date) head.append(el('span', 'date', note.date));
    if (Object.hasOwn(BADGE, note.badge)) head.append(el('span', `badge ${note.badge}`, BADGE[note.badge]));
    box.append(head);
    // the open lists, outermost first, each with the indent its bullets stand at (AUDIT INSTALL R2-E8: notes
    // nest their bullets, and flattened the sub-points read as points of their own)
    let lists = [];
    let para = null;
    for (const raw of String(note.text ?? '').split('\n')) {
      const line = raw.trim();
      const bullet = /^(\s*)[-*]\s+(.*)$/.exec(raw.replace(/\t/g, '  '));
      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (!line) { lists = []; para = null; continue; }
      if (heading) {
        lists = []; para = null;
        box.append(el(heading[1].length === 1 ? 'h4' : 'h5', null, heading[2].replace(/^Patch Notes:\s*/i, '')));
      } else if (bullet) {
        para = null;
        const indent = bullet[1].length;
        while (lists.length && lists[lists.length - 1].indent > indent) lists.pop();
        const top = lists[lists.length - 1];
        if (!top || indent > top.indent) {
          const ul = el('ul');
          (top?.ul.lastElementChild ?? box).append(ul);
          lists.push({ indent, ul });
        }
        const li = el('li');
        inline(li, bullet[2]);
        lists[lists.length - 1].ul.append(li);
      } else {
        lists = [];
        if (!para) { para = el('p'); box.append(para); } else para.append(document.createTextNode(' '));
        inline(para, line);
      }
    }
    return box;
  }

  /** Rebuild a region only when what it shows changed. A download sends a
   *  view many times a second, and a button rebuilt under the pointer
   *  between press and release is a click that never happens. */
  const drawn = new Map();
  const changed = (region, value) => {
    const key = JSON.stringify(value);
    if (drawn.get(region) === key) return false;
    drawn.set(region, key);
    return true;
  };

  /** A path, cut from the LEFT (right-to-left, in the stylesheet) so its end
   *  shows; the marks keep its slashes in order, or bidi moves an absolute
   *  path's leading "/" to the far end. */
  const pathLine = (dir) => {
    const p = el('span', 'path', `‎${dir}‎`);
    p.title = dir;
    return p;
  };

  /** The download's speed and time left, from the bytes the last few seconds of views carried. */
  const speed = { total: 0, seen: [] };
  function rateLine(p) {
    if (!p || !(p.total > 0) || !(p.transferred >= 0)) { speed.seen = []; return ''; }
    const now = (globalThis.performance ?? Date).now();
    if (p.total !== speed.total || p.transferred < (speed.seen.at(-1)?.[1] ?? 0)) { speed.total = p.total; speed.seen = []; }
    speed.seen.push([now, p.transferred]);
    while (speed.seen.length > 2 && now - speed.seen[0][0] > 6000) speed.seen.shift();
    const [t0, b0] = speed.seen[0];
    if (now - t0 < 1500 || p.transferred <= b0) return '';
    if (p.transferred >= p.total) return '';
    const rate = ((p.transferred - b0) * 1000) / (now - t0);
    const secs = Math.max(1, Math.ceil((p.total - p.transferred) / rate));
    const perSecond = rate >= 999.5e3 ? `${(rate / 1e6).toFixed(1)} MB/s` : `${Math.max(1, Math.round(rate / 1e3))} KB/s`;
    return `${perSecond} - ${secs < 60 ? `${secs} s left` : `${Math.ceil(secs / 60)} min left`}`;
  }

  let screen = null;   // PLAY's question ('choose') or the Private server screen ('private') over the news: the page's own
  let privateOn = false;   // hosting or joined: PLAY loads the game there, with no question
  let drawer = false;   // Settings, open over the page
  let lastView = null;
  let lastPanel = null;
  /** What is over the front door: Settings, PLAY's question or the Private server. The regions under it (each
   *  [data-behind]) are inert, so the keys and the pad cannot reach behind it, and the stylesheet shades them. The
   *  status line is not among them: what the launcher does is still said while a window is open. */
  function layer() {
    const over = drawer ? 'settings' : screen;
    document.body.toggleAttribute('data-over', !!over);
    if (over) document.body.dataset.over = over;
    for (const region of document.querySelectorAll('[data-behind]')) region.toggleAttribute('inert', !!over);
    $('settings').toggleAttribute('inert', !drawer);
    $('settings-open').setAttribute('aria-expanded', String(drawer));
  }
  /** A control the player can reach in `root`: drawn, enabled and not under a hidden region. */
  const firstAnswer = (root) => [...root.querySelectorAll('button, input')].find((b) => !b.disabled && b.checkVisibility());
  const lost = (at) => !at || at === document.body || at.disabled || !at.isConnected || !at.checkVisibility() || !!at.closest('[inert]');
  function render(v) {
    lastView = v;
    if (v.emcProgress && !v.waitingForUpdate) {
      const { stage, part, received, total } = v.emcProgress;
      const mb = (bytes) => (bytes / 1048576).toFixed(1);
      const status = stage === 'downloading' ? 'Downloading EMC ' + part
        : stage === 'verifying' ? 'Verifying EMC ' + part
          : stage === 'access' ? 'Checking test access for EMC' : 'Connecting to GitHub for EMC ' + part;
      v = { ...v, status, detail: '', busy: true, progress: stage === 'downloading'
        ? { percent: 100 * received / total, label: mb(received) + ' of ' + mb(total) + ' MiB', transferred: received, total }
        : null };
    }
    // nothing stays over the first run's card as it comes up, or over the game starting
    if (v.panel !== 'news' || v.launching) screen = null;
    if (drawer && ((v.panel === 'setup' && lastPanel !== 'setup') || v.launching)) settings(false);
    lastPanel = v.panel;
    document.body.toggleAttribute('data-busy', !!v.busy);
    document.body.toggleAttribute('data-launching', !!v.launching);
    document.body.dataset.tone = v.tone ?? 'ok';
    document.body.dataset.panel = v.panel;
    setText($('version'), v.version);
    setText($('status'), v.status);
    setText($('detail'), v.detail);

    const progress = $('progress');
    progress.hidden = !v.progress;
    if (v.progress) {
      const track = progress.querySelector('.track');
      progress.querySelector('.track i').style.width = `${v.progress.percent}%`;
      track.setAttribute('aria-valuenow', String(Math.round(v.progress.percent)));
      track.setAttribute('aria-valuetext', v.progress.label);
      setText(progress.querySelector('.label'), v.progress.label);
    }
    const rate = rateLine(v.progress);
    setText($('rate'), rate);
    // the speed and time left are said with the bar's value, not as a second announcement
    if (v.progress && rate) progress.querySelector('.track').setAttribute('aria-valuetext', `${v.progress.label}, ${rate}`);
    if (changed('status-actions', v.statusActions)) {
      $('status-actions').replaceChildren(...v.statusActions.map((a) => button(a, 'plaque')));
    }

    const play = $('play');
    play.disabled = !v.play.enabled;
    play.textContent = v.play.label;
    const requirement = $('test-play-requirement');
    const dockAction = $('test-dock-action');
    const gate = v.testPlayGate;
    const emc = v.emcProgress;
    document.dispatchEvent(new CustomEvent('launcher-update-gate', { detail: v.waitingForUpdate || !!emc }));
    requirement.textContent = gate?.message ?? '';
    requirement.hidden = !gate || !!gate.emc;
    $('test-dock').hidden = !gate;
    dockAction.hidden = !gate?.invite;
    $('test-dock-retry').hidden = !gate?.retryEmc;
    $('test-dock').closest('.bar').toggleAttribute('data-test-gate', !!gate);
    $('test-dock-install').hidden = !gate?.emc || !!emc;

    $('news').hidden = v.panel !== 'news';
    $('hero').hidden = v.panel !== 'news' || !v.news.items.length;
    $('choose').hidden = v.panel !== 'news' || screen !== 'choose';
    $('private').hidden = v.panel !== 'news' || screen !== 'private';
    $('play-main').disabled = !v.play.enabled;
    $('setup').hidden = v.panel !== 'setup';
    if (v.setup && changed('setup', v.setup)) {
      $('setup-title').textContent = v.setup.title;
      $('setup-detail').textContent = v.setup.detail;
      const found = $('found');
      found.replaceChildren(...v.setup.found.map((f) => {
        const li = el('li');
        const where = el('span', 'where');
        where.append(el('span', 'from', f.from), pathLine(f.dir));
        const use = button({ id: 'use-found', arg: f.index, label: 'Use these files', name: `Use these files - ${f.from}: ${f.dir}`, primary: f.primary }, 'plaque small');
        li.append(where, use);
        return li;
      }));
      found.hidden = !v.setup.found.length;
      $('setup-actions').replaceChildren(...v.setup.actions.map((a) => button(a, 'plaque')));
    }
    if (changed('news', v.news)) {
      document.querySelector('#news .feed').replaceChildren(...v.news.items.map(notesBlock));
      drawHero(v.news.items[0]);
      const note = document.querySelector('#news .note');
      note.textContent = v.news.note;
      note.hidden = !v.news.note;
    }

    if (changed('files', v.options.files)) {
      $('files').replaceChildren(v.options.files.path ? pathLine(v.options.files.path) : document.createTextNode(v.options.files.note));
      document.querySelector('[data-act="choose-folder"]').textContent = v.options.files.label;
    }
    const check = $('update-check');
    check.disabled = !!v.options.requireCurrent;
    if (check.checked !== v.options.checkOnLaunch) check.checked = v.options.checkOnLaunch;
    // GPU-BACKEND-LAUNCHER: the Graphics option - the box is the backend the next start uses
    const g = v.options.graphics;
    $('graphics').hidden = !g;
    if (g) {
      const vulkan = $('backend-vulkan');
      if (vulkan.checked !== g.on) vulkan.checked = g.on;
      vulkan.disabled = !g.enabled;
      setText($('backend-note'), g.note);
      document.querySelector('[data-act="restart"]').hidden = !g.restart;
    }

    // The Private server option - Host and Join while off; Stop and its own PLAY while on, since the dock's is under the
    // window. The dock says a server is on, and opens the window again.
    const pv = v.options.privateServer;
    privateOn = !!pv?.on;
    if (pv) {
      setText($('private-note'), pv.note);
      $('private-off').hidden = pv.on;
      $('private-stop').hidden = !pv.on;
      for (const b of document.querySelectorAll('#private [data-act]')) b.disabled = !pv.enabled;
      $('private-address').disabled = !pv.enabled;
      $('private-play').hidden = !pv.on;
      $('private-play').disabled = !pv.on || !v.play.enabled;
    }
    $('private-chip').hidden = !privateOn;

    layer();

    // Enter takes the screen's own answer - the first run's card's, or PLAY once it can be pressed -
    // and only that: "Play without updating" under a download is the way out, not the way on
    const focusKey = v.panel === 'setup' ? `setup:${JSON.stringify(v.setup)}` : `play:${v.play.enabled}`;
    if (changed('focus', focusKey)) {
      const at = document.activeElement;
      // AUDIT INSTALL R2-E1: a control inside a region just hidden (the card's answer, once the card gives way to the
      // news) is gone for the player - Chromium blurs it only later, after this view had used up its one focus move,
      // and Enter pressed nothing
      const idle = !at || at === document.body || at.disabled || !at.isConnected || !at.checkVisibility();
      if (v.panel === 'setup') document.querySelector('#setup .plaque.primary')?.focus({ preventScroll: true });
      else if (v.play.enabled && idle) play.focus({ preventScroll: true });
    }
    // a window whose focused control went away (held, hidden, or behind it) gives the focus to its first answer
    if ((screen || drawer) && lost(document.activeElement)) firstAnswer(drawer ? $('settings') : $(screen))?.focus({ preventScroll: true });
  }

  document.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    // PLAY asks first - the main servers or a private server - unless a private server is already on
    if (act?.id === 'play' && !act.disabled && !privateOn && lastView?.panel === 'news') { show('choose'); return; }
    // Join carries the address typed beside it
    if (act && !act.disabled) bridge.act(act.dataset.act, act.dataset.act === 'private-join' ? $('private-address').value : undefined);
    const link = e.target.closest('[data-open]');
    if (link) bridge.act('open', link.dataset.open);
  });
  const show = (next) => {
    const from = screen;
    screen = next;
    if (lastView) render(lastView);
    // back from the Private server, the focus is on the answer that opened it
    const into = !next ? $('play') : from === 'private' && !$('private-open').disabled ? $('private-open') : firstAnswer($(next));
    into?.focus({ preventScroll: true });
  };
  /** One window back: the Private server steps back to PLAY's question - unless a server is on, when PLAY no longer
   *  asks and its "Online or offline" would load the game on the server. */
  const stepBack = () => show(screen === 'private' && !privateOn ? 'choose' : null);
  function settings(open) {
    drawer = open;
    layer();
    (open ? $('settings').querySelector('.plaque') : $('settings-open')).focus({ preventScroll: true });
  }
  /** Escape, the pad's B and a click on the shade each close what is on top, one step at a time. */
  const back = () => {
    if (drawer) settings(false);
    else if (screen) stepBack();
    else return false;
    return true;
  };
  // a key that finishes a composed character is the input method's, not the page's
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.isComposing && back()) e.preventDefault(); });
  $('scrim').addEventListener('click', back);
  $('settings-open').addEventListener('click', () => settings(true));
  $('settings-close').addEventListener('click', () => settings(false));
  // Read the patch notes: the headline's release, brought to the top of the column, marked, and given the focus
  $('hero-read').addEventListener('click', () => {
    const feed = document.querySelector('#news .feed');
    const first = feed.querySelector('.release');
    feed.scrollTop = 0;
    if (!first) return;
    first.removeAttribute('data-flash');
    void first.offsetWidth;   // a fresh mark each time: the attribute's animation runs again
    first.setAttribute('data-flash', '');
    first.focus({ preventScroll: true });
  });
  $('private-open').addEventListener('click', () => show('private'));
  $('private-chip').addEventListener('click', () => show('private'));
  for (const b of document.querySelectorAll('.dialog .back')) b.addEventListener('click', stepBack);
  $('private-address').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    document.querySelector('[data-act="private-join"]').click();
  });
  $('update-check').addEventListener('change', (e) => bridge.act('set-update-check', e.target.checked));
  $('backend-vulkan').addEventListener('change', (e) => bridge.act('set-backend', e.target.checked ? 'vulkan' : 'default'));
  bridge.onView(render);
})();
