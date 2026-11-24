// The launcher's face: a window that fits the screen, a night drawn in the brand's pixels, the newest release told
// large, the patch notes beside it, a dock with the update and PLAY, and Settings, PLAY's question and the Private
// server over the page. These are its laws; the shell's and the state's own are in da8, da10 and audit_install2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { bootLauncher } from '../launcherDom.mjs';

const require = createRequire(import.meta.url);
const L = require('../../app/lib/launcherState.cjs');
const { launcherSize, launcherBounds, LAUNCHER_SIZE, LAUNCHER_MIN, FRAME } = require('../../app/lib/launcherWindow.cjs');
const { POINTER_FILES, pointerFiles } = require('../../app/lib/launcherPointer.cjs');
const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const run = (s, ...events) => events.reduce((st, e) => L.reduce(st, e), s);
const fresh = (over = {}) => L.initialState({ current: '0.1.4700', transport: 'game', checkEnabled: true, arena2Dir: '/games/DF/DAGGER/ARENA2', ...over });

const NOTES = [
  { version: '0.1.4712', update: '0.0.212', date: '2026-11-11T12:00:00Z', text: '# Patch Notes: Market stacks\n\n## Market\n- The **Goods** tab shows items in stacks.\n- Search finds an item.' },
  { version: '0.1.4700', update: '0.0.211', date: '2026-11-09T12:00:00Z', text: '# Patch Notes: House trader stock\n\n- Each trader shows its stock.' },
];
const view = (s) => L.viewOf(s);
/** Whether the page under a window is out of reach: every [data-behind] region inert, or none - and the status line,
 *  which must keep speaking, in none of them. */
const behind = (p) => {
  const regions = p.doc.querySelectorAll('[data-behind]').map((r) => r.hasAttribute('inert'));
  assert.equal(regions.length, 5, 'the header, the middle, the dock\'s actions, its private-server mark and PLAY');
  assert.ok(regions.every((x) => x === regions[0]), 'all of them or none');
  assert.equal(p.$('status').closest('[inert]'), null, 'the status line is never inert');
  return regions[0];
};
const ready = (over) => run(fresh(over), { type: 'check-none' }, { type: 'news', items: NOTES });

test('the GitHub release title and edited description appear without setup metadata', () => {
  const tag_name = 'app-v13.11.36';
  const name = '11.13.36 - Launcher fixes';
  const setup = '[Download setup](https://example.com/setup.exe)\n\n<!-- setup-tag: dfo-1311-v13.11.36 -->';
  const initial = L.newsFrom([{ tag_name, name, body: 'Original description.\n\n' + setup }]);
  const edited = L.newsFrom([{ tag_name, name, body: 'Edited description.\n\n<details>\n<summary>Download setup</summary>\n\n' + setup + '\n</details>' }]);
  assert.deepEqual(L.cachedNews({ items: initial }), initial);
  const state = run(fresh({ current: '13.11.36', news: initial }), { type: 'check-none' });
  const page = bootLauncher();
  page.show(view(state));
  assert.deepEqual([page.$('hero-title').textContent, page.$('hero-text').textContent], [name, 'Original description.']);
  page.show(view(run(state, { type: 'news', items: edited })));
  assert.deepEqual([page.$('hero-title').textContent, page.$('hero-text').textContent], [name, 'Edited description.']);
  assert.equal(page.doc.querySelector('#news .release h4').textContent, name);
  assert.equal(page.doc.querySelector('#news .release p').textContent, 'Edited description.');
});

// ---- the window ----------------------------------------------------------------------------------------------------

test('LAUNCHER-FACE: the window takes its full size where the screen has room, the screen\'s room where it has not, and never less than the page holds together at', () => {
  assert.deepEqual(LAUNCHER_SIZE, { width: 1120, height: 680 });
  assert.deepEqual(launcherSize({ width: 1920, height: 1040 }), LAUNCHER_SIZE, 'a 1080p screen');
  assert.deepEqual(launcherSize({ width: 1280, height: 672 }), { width: 1120, height: 672 - FRAME.height }, 'a 1080p laptop at 150%: Play stays above the taskbar');
  assert.deepEqual(LAUNCHER_MIN, { width: 900, height: 520 });
  assert.deepEqual(launcherSize({ width: 1093, height: 576 }), { width: 1093 - FRAME.width, height: 576 - FRAME.height }, 'a 1366x768 laptop at 125%: Play above the taskbar');
  assert.deepEqual(launcherSize({ width: 1024, height: 540 }), { width: 1024 - FRAME.width, height: LAUNCHER_MIN.height }, 'a smaller screen: the floor');
  assert.deepEqual(launcherSize({ width: 800, height: 500 }), LAUNCHER_MIN);
  for (const bad of [null, undefined, {}, { width: 'x', height: -4 }]) assert.deepEqual(launcherSize(bad), LAUNCHER_SIZE, `${JSON.stringify(bad)}: no answer is the full size`);
  const main = rd('app/main.cjs');
  const win = main.slice(main.indexOf('function openLauncherWindow()'), main.indexOf('function renderLauncher()'));
  assert.match(win, /new BrowserWindow\(\{\s*\.\.\.launcherBounds\(require\('electron'\)\.screen\),\s*useContentSize: true,\s*resizable: false,/);
});

test('LAUNCHER-FACE: the window opens on the display the player is looking at, centred in its room - and opens anyway when the screen cannot say', () => {
  const screenAt = (workArea) => ({ getCursorScreenPoint: () => ({ x: 3000, y: 200 }), getDisplayNearestPoint: () => ({ workArea }) });
  // a second, larger display to the right of the primary: the window opens there, not on the primary
  assert.deepEqual(launcherBounds(screenAt({ x: 1920, y: 0, width: 2560, height: 1400 })),
    { x: 1920 + (2560 - 1120 - FRAME.width) / 2, y: (1400 - 680 - FRAME.height) / 2, width: 1120, height: 680 });
  // a 1080p laptop at 150%: smaller, and its title bar on the screen
  assert.deepEqual(launcherBounds(screenAt({ x: 0, y: 0, width: 1280, height: 672 })), { x: 72, y: 0, width: 1120, height: 672 - FRAME.height });
  const broken = { getCursorScreenPoint: () => { throw new Error('not on this compositor'); }, getDisplayNearestPoint: () => null };
  assert.deepEqual(launcherBounds(broken), LAUNCHER_SIZE, 'no answer: the full size, placed by the platform');
  assert.deepEqual(launcherBounds(screenAt({})), LAUNCHER_SIZE, 'a work area with no numbers: the same');
  assert.deepEqual(launcherBounds(null), LAUNCHER_SIZE);
});

// ---- the view ------------------------------------------------------------------------------------------------------

test('LAUNCHER-FACE: the view carries the status mark\'s tone, whether the game is starting, and the download\'s bytes', () => {
  assert.equal(view(fresh()).tone, 'busy', 'checking');
  assert.equal(view(ready()).tone, 'ok', 'up to date');
  assert.equal(view(run(fresh(), { type: 'check-failed' })).tone, 'warn');
  assert.equal(view(fresh({ checkEnabled: false })).tone, 'off', 'checks turned off');
  assert.equal(view(run(fresh({ transport: 'notice' }), { type: 'check-available', version: '0.1.4712', download: 'x' })).tone, 'info', 'a version to get by hand');
  assert.equal(view(ready()).launching, false);
  assert.equal(view(run(ready(), { type: 'play' })).launching, true);
  const dl = view(run(fresh(), { type: 'game-available', version: '0.1.4712', total: 48e6 }, { type: 'progress', percent: 25, transferred: 12e6, total: 48e6 }));
  assert.deepEqual(dl.progress, { percent: 25, label: '12.0 of 48.0 MB', transferred: 12e6, total: 48e6 });
  const unsized = view(run(fresh({ transport: 'updater' }), { type: 'check-available', version: '0.1.4712' }));
  assert.deepEqual(unsized.progress, { percent: 0, label: 'Starting the download' }, 'no size yet: no bytes to reckon a speed from');
});

// ---- the page ------------------------------------------------------------------------------------------------------

test('LAUNCHER-FACE: the headline is the newest release - its title, its first point, and what it is to this player', () => {
  const p = bootLauncher();
  p.show(view(ready({ lastPlayed: '0.1.4690' })));
  assert.equal(p.$('hero').hidden, false);
  assert.equal(p.$('hero-title').textContent, 'Market stacks', 'the first heading, without "Patch Notes:"');
  assert.equal(p.$('hero-text').textContent, 'The Goods tab shows items in stacks.', 'the first point, as plain words');
  assert.equal(p.$('hero-kind').textContent, 'In the next update', 'newer than this copy');
  assert.equal(p.$('hero-when').textContent, 'Update 0.0.212 - 11 Nov 2026');
  const q = bootLauncher();
  q.show(view(ready({ current: '0.1.4712', lastPlayed: '0.1.4690' })));
  assert.equal(q.$('hero-kind').textContent, 'New since you last played');
  const r = bootLauncher();
  r.show(view(ready({ current: '0.1.4712', lastPlayed: '0.1.4712' })));
  assert.equal(r.$('hero-kind').textContent, 'Latest update');
  assert.equal(r.doc.querySelector('#news .feed .release').getAttribute('data-badge'), null, 'an unmarked release has no mark');
  assert.equal(q.doc.querySelector('#news .feed .release').getAttribute('data-badge'), 'new', 'a marked one carries its mark for the stylesheet');
  // notes of other shapes: untitled, a point first, a code block first - never "Patch Notes" or a stray fence as words
  const headline = (text) => {
    const h = bootLauncher();
    h.show(view(run(fresh(), { type: 'check-none' }, { type: 'news', items: [{ ...NOTES[0], text }, NOTES[1]] })));
    return [h.$('hero-title').textContent, h.$('hero-text').textContent];
  };
  assert.deepEqual(headline('# Patch Notes\n\n## Market\n- Stacks.\n- Search.'), ['Stacks.', 'Search.'], 'untitled: the first point is the title');
  assert.deepEqual(headline('- **Stacks** in the Goods tab.\n- Search by name.'), ['Stacks in the Goods tab.', 'Search by name.']);
  assert.deepEqual(headline('```\ncode\n```\n# Patch Notes: Fences\n- After the block.'), ['Fences', 'After the block.']);
  assert.deepEqual(headline(''), ['Update 0.0.212', ''], 'nothing said: the update\'s name');
  // no notes, or the first run's card: no headline
  const s = bootLauncher();
  s.show(view(fresh({ news: [] })));
  assert.equal(s.$('hero').hidden, true);
  const t = bootLauncher();
  t.show(view(run(fresh({ arena2Dir: null, news: NOTES }), { type: 'found', found: [] }, { type: 'detect-done' })));
  assert.deepEqual([t.$('setup').hidden, t.$('hero').hidden, t.$('news').hidden], [false, true, true]);
});

test('LAUNCHER-FACE: Settings opens over the page and makes it inert; Escape, the close button and the shade close it, and the focus comes home', () => {
  const p = bootLauncher();
  p.show(view(ready()));
  assert.equal(p.$('settings').hasAttribute('inert'), true, 'shut, the drawer is out of reach');
  p.$('settings-open').click();
  assert.deepEqual([behind(p), p.$('settings').hasAttribute('inert')], [true, false]);
  assert.equal(p.doc.body.getAttribute('data-over'), 'settings');
  assert.equal(p.$('settings-open').getAttribute('aria-expanded'), 'true');
  assert.equal(p.doc.activeElement.getAttribute('data-act'), 'choose-folder', 'the focus goes into the drawer');
  p.doc.body.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
  assert.deepEqual([behind(p), p.$('settings').hasAttribute('inert'), p.doc.body.hasAttribute('data-over')], [false, true, false]);
  assert.equal(p.doc.activeElement.id, 'settings-open', 'and back to the button that opened it');
  p.$('settings-open').click();
  p.$('settings-close').click();
  assert.equal(behind(p), false);
  p.$('settings-open').click();
  p.$('scrim').click();
  assert.equal(behind(p), false);
  // a switch in the drawer still works, and a view while it is open leaves the player's focus there
  p.$('settings-open').click();
  p.$('update-check').focus();
  p.show(view(run(ready(), { type: 'check-on-launch', on: false })));
  assert.equal(p.doc.activeElement.id, 'update-check');
  // the first run's card is the player's to answer: a card that comes up closes the drawer
  const card = (...events) => view(run(fresh({ arena2Dir: null }), { type: 'found', found: [] }, { type: 'detect-done' }, ...events));
  p.show(card());
  assert.deepEqual([behind(p), p.$('settings').hasAttribute('inert')], [false, true]);
  // but Settings opened ON the card stays open as views come - the update check answering, a download's ticks
  p.$('settings-open').click();
  p.show(card({ type: 'check-none' }));
  p.show(card({ type: 'check-none' }, { type: 'news', items: NOTES }));
  assert.deepEqual([behind(p), p.$('settings').hasAttribute('inert')], [true, false], 'it closes only as the card comes up');
  // and a game starting closes it
  p.show(view(ready()));
  p.$('settings-open').click();
  p.show(view(run(ready(), { type: 'play' })));
  assert.deepEqual([behind(p), p.$('settings').hasAttribute('inert')], [false, true]);
});

test('LAUNCHER-FACE: PLAY asks where to play in a window over the page; Escape steps back one window at a time', () => {
  const p = bootLauncher();
  p.show(view(ready({ current: '0.1.4712' })));
  p.$('play').click();
  assert.equal(p.$('choose').hidden, false);
  assert.equal(p.$('news').hidden, false, 'the notes stay under the shade');
  assert.equal(behind(p), true);
  assert.equal(p.doc.activeElement.id, 'play-main', 'Enter plays online or offline');
  assert.deepEqual(p.sent, [], 'the question sends nothing');
  p.$('private-open').click();
  assert.deepEqual([p.$('choose').hidden, p.$('private').hidden], [true, false]);
  p.doc.body.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
  assert.deepEqual([p.$('choose').hidden, p.$('private').hidden], [false, true], 'back to the question');
  p.doc.body.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
  assert.deepEqual([p.$('choose').hidden, behind(p)], [true, false], 'and back to the page');
  assert.equal(p.doc.activeElement.id, 'play');
  // back from the Private server while Play is held (a download began): the focus skips the held answer
  p.$('play').click();
  p.$('private-open').click();
  p.show(view(fresh({ current: '0.1.4712', news: NOTES })));
  p.doc.body.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
  assert.equal(p.$('play-main').disabled, true);
  assert.equal(p.doc.activeElement.id, 'private-open', 'never a button that cannot be pressed');
  p.show(view(ready({ current: '0.1.4712' })));
  p.doc.body.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
  // the answer plays
  p.$('play').click();
  p.$('play-main').click();
  assert.deepEqual(p.sent, [['play']]);
  // a window left open when the first run's card comes up does not leave the page inert under the card
  const q = bootLauncher();
  q.show(view(ready({ current: '0.1.4712' })));
  q.$('play').click();
  q.show(view(run(fresh({ arena2Dir: null }), { type: 'found', found: [] }, { type: 'detect-done' })));
  assert.deepEqual([q.$('choose').hidden, behind(q)], [true, false]);
  // the game starting closes the question too: no greyed answers over "Starting DFO Online"
  const r = bootLauncher();
  r.show(view(ready({ current: '0.1.4712' })));
  r.$('play').click();
  r.$('play-main').click();
  r.show(view(run(ready({ current: '0.1.4712' }), { type: 'play' })));
  assert.deepEqual([r.$('choose').hidden, behind(r)], [true, false]);
  // Play held and freed while the question is open: the focus is on an answer that can be pressed, every time
  const f = bootLauncher();
  f.show(view(ready({ current: '0.1.4712' })));
  f.$('play').click();
  f.show(view(fresh({ current: '0.1.4712', news: NOTES })));
  assert.equal(f.doc.activeElement.id, 'private-open', 'held: the other answer');
  f.show(view(ready({ current: '0.1.4712' })));
  assert.equal(f.$('choose').hidden, false);
  assert.ok(['play-main', 'private-open'].includes(f.doc.activeElement.id), 'freed: still on an answer, never on the PLAY under the shade');
});

test('LAUNCHER-FACE: the Private server window has its own PLAY once a server is on, the dock says one is on, and Escape never offers "Online or offline" over it', () => {
  const hosting = (over = {}) => run(ready({ current: '0.1.4712', ...over }), { type: 'private', priv: { status: 'hosting', port: 7777, players: 1, max: 10, addresses: ['192.168.1.20'] } });
  const p = bootLauncher();
  p.show(view(ready({ current: '0.1.4712' })));
  p.$('play').click();
  p.$('private-open').click();
  assert.deepEqual([p.$('private-play').hidden, p.$('private-chip').hidden], [true, true], 'off: no PLAY of its own, no mark');
  p.$('private-address').value = '10.0.0.5:7777';
  p.$('private-address').dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault() {} });
  assert.deepEqual(p.sent, [['private-join', '10.0.0.5:7777']], 'Enter in the address joins');
  p.show(view(hosting()));
  assert.deepEqual([p.$('private-play').hidden, p.$('private-play').disabled, p.$('private-stop').hidden], [false, false, false]);
  assert.equal(p.doc.activeElement.id, 'private-play', 'the focus, lost as Host went, is on the window\'s PLAY');
  p.$('private-play').click();
  assert.deepEqual(p.sent.at(-1), ['play'], 'it plays: there is no question while a server is on');
  // Escape closes the window outright: "Online or offline" would load the game on the server
  p.doc.body.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
  assert.deepEqual([p.$('choose').hidden, p.$('private').hidden, behind(p)], [true, true, false]);
  assert.equal(p.$('private-chip').hidden, false, 'the dock says a server is on');
  p.$('private-chip').click();
  assert.equal(p.$('private').hidden, false, 'and opens its window again');
  assert.equal(p.doc.activeElement.id, 'private-play', 'on an answer that is there - never the hidden Host');
  // the dialog's back button behaves as Escape does
  p.doc.querySelector('#private .back').click();
  assert.equal(p.$('choose').hidden, true);
  // with no server on, back from the Private server goes to the question, on the answer that opened it
  const q = bootLauncher();
  q.show(view(ready({ current: '0.1.4712' })));
  q.$('play').click();
  q.$('private-open').click();
  q.doc.body.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault() {} });
  assert.equal(q.$('choose').hidden, false);
  assert.equal(q.doc.activeElement.id, 'private-open');
  // a key that finishes a composed character is not the player's Escape
  q.doc.body.dispatchEvent({ type: 'keydown', key: 'Escape', isComposing: true, preventDefault() {} });
  assert.equal(q.$('choose').hidden, false);
});

test('LAUNCHER-FACE: the dock says the download\'s speed and time left from the bytes as they come, once there are seconds enough to tell', () => {
  let clock = 1_000_000;
  const p = bootLauncher({ now: () => clock });
  const at = (bytes, total = 48e6) => view(run(fresh(), { type: 'game-available', version: '0.1.4712', total }, { type: 'progress', percent: (100 * bytes) / total, transferred: bytes, total }));
  p.show(at(0));
  assert.equal(p.$('rate').textContent, '', 'nothing to tell yet');
  clock += 1000;
  p.show(at(2e6));
  assert.equal(p.$('rate').textContent, '', 'one second is too little');
  clock += 1000;
  p.show(at(4e6));
  assert.equal(p.$('rate').textContent, '2.0 MB/s - 22 s left', '4 MB in 2 s, 44 MB to go');
  clock += 8000;
  p.show(at(4.4e6));
  assert.equal(p.$('rate').textContent, '50 KB/s - 15 min left', 'a slow stretch: the last six seconds or so count, not the fast start');
  clock += 2000;
  p.show(at(5e6, 100e6));
  assert.equal(p.$('rate').textContent, '', 'a new download starts the count again, even one further along than the last');
  clock += 1000;
  p.show(at(1e5, 10e6));
  assert.equal(p.$('rate').textContent, '', 'and one with fewer bytes than the last');
  clock += 2000;
  p.show(at(3e5, 10e6));
  assert.equal(p.$('rate').textContent, '100 KB/s - 2 min left', '97 s, in minutes past one');
  clock += 1000;
  p.show(at(10e6, 10e6));
  assert.equal(p.$('rate').textContent, '', 'every byte in: no time left to tell');
  p.show(view(fresh()));
  assert.equal(p.$('rate').textContent, '', 'and goes with the progress');
});

test('LAUNCHER-FACE: the body says the tone, and whether the game is starting - the scene stops drawing then', () => {
  const p = bootLauncher();
  p.show(view(run(fresh(), { type: 'check-failed' })));
  assert.equal(p.doc.body.getAttribute('data-tone'), 'warn');
  assert.equal(p.doc.body.hasAttribute('data-launching'), false);
  p.show(view(run(ready(), { type: 'play' })));
  assert.equal(p.doc.body.hasAttribute('data-launching'), true);
  assert.match(rd('app/launcher/scene.js'), /const stopped = \(\) => document\.hidden \|\| document\.body\.hasAttribute\('data-launching'\) \|\| !!still\?\.matches;/,
    'hidden, starting the game, or asked for less motion');
});

// ---- the scene, the icons and the stylesheet -----------------------------------------------------------------------

test('LAUNCHER-FACE: the scene and the icons are drawn by code from the brand\'s own colours, and ask for nothing outside the page', () => {
  const skin = rd('src/ui/enhanced/enhancedStyle.js');
  const colours = (text) => new Set([...text.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)/g)].map((m) => m[0].toLowerCase().replace(/\s+/g, '')));
  const known = colours(skin);
  for (const f of ['app/launcher/scene.js', 'app/launcher/icons.js', 'app/launcher/pointer.js']) {
    const src = rd(f);
    assert.deepEqual([...colours(src)].filter((c) => !known.has(c)), [], `${f}: every colour is one the Enhanced skin uses`);
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|WebSocket|import\(|new Image|\.src\s*=|innerHTML|insertAdjacentHTML/, `${f}: no request and no markup`);
  }
  const html = rd('app/launcher/index.html');
  assert.match(html, /<canvas id="scene" class="scene" aria-hidden="true"><\/canvas>/, 'the night is decoration: a reader skips it');
  assert.deepEqual([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]), ['icons.js', 'scene.js', 'pointer.js', 'launcher.js', 'pad.js'], 'each its own file - the page runs no inline code');
  // every icon the page asks for is drawn, 16 by 16, in ink and air only
  const icons = rd('app/launcher/icons.js');
  const drawn = new Map([...icons.matchAll(/^ {4}(\w+): \[\n((?: {6}'[^']*',\n)+) {4}\],/gm)].map((m) => [m[1], [...m[2].matchAll(/'([^']*)'/g)].map((r) => r[1])]));
  for (const [name, rows] of drawn) {
    assert.equal(rows.length, 16, `${name}: 16 rows`);
    for (const row of rows) assert.match(row, /^[.#]{16}$/, `${name}: 16 columns of . and #`);
  }
  for (const [, name] of html.matchAll(/data-icon="(\w+)"/g)) assert.ok(drawn.has(name), `the page asks for "${name}"`);
});

test('LAUNCHER-FACE: the stylesheet - every small word at AA on the night, the scene in whole pixels, and nothing moves for a player who asked for less', () => {
  const css = rd('app/launcher/launcher.css');
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const colourOf = (sel) => {
    const m = new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(css);
    assert.ok(m, `${sel} is a rule`);
    return /(?:^|;)\s*color: (#[0-9a-f]{6});/.exec(m[1])?.[1];
  };
  for (const sel of ['.hero-text', '.eyebrow', '.eyebrow .when', '.release .ver', '.release p', '.mode-line', '.rate', '.found .from', '#private-note']) {
    const c = ratio(colourOf(sel), '#0a0c11');
    assert.ok(c >= 4.5, `${sel}: ${c.toFixed(2)}:1 on the night`);
  }
  assert.match(css, /\.scene \{[^}]*image-rendering: pixelated;/, 'the scene\'s pixels stay square');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^@]*\*, \*::before, \*::after \{ animation: none !important; transition: none !important; \}/);
  // the page under a window is out of reach, and the closed drawer too (launcher.js sets inert; the pad loop skips it)
  assert.match(rd('app/launcher/index.html'), /<aside id="settings" class="drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title" inert>/);
  assert.match(rd('src/ui/menu/menuPad.js'), /if \(el\.disabled \|\| el\.closest\('\[inert\]'\)\) continue;/, 'the pad loop never lands behind a window');
});

// ---- the pointer ---------------------------------------------------------------------------------------------------

test('LAUNCHER-FACE: the pointer is the game\'s own gauntlet - one art file, which the game wears and the shell serves the launcher as PNGs', async () => {
  const art = rd('src/ui/plus/gauntletArt.js');
  const files = pointerFiles(art);
  assert.deepEqual([...files.keys()], Object.keys(POINTER_FILES), 'every frame the stylesheet asks for');
  const size = (png) => [png.readUInt32BE(16), png.readUInt32BE(20)];
  assert.deepEqual(size(files.get('gauntlet-point.png')), [31, 32]);
  assert.deepEqual(size(files.get('gauntlet-point@2x.png')), [62, 64]);
  assert.deepEqual(size(files.get('gauntlet-press.png')), [31, 32]);
  assert.deepEqual(size(files.get('gauntlet-press@2x.png')), [62, 64]);
  // the very frames the game's gauntlet wears
  const { GAUNTLET_POINT, GAUNTLET_PRESS } = await import('../../src/ui/plus/plusCursor.js');
  const bytes = (uri) => Buffer.from(uri.replace(/^data:image\/png;base64,/, ''), 'base64');
  assert.ok(files.get('gauntlet-point.png').equals(bytes(GAUNTLET_POINT)));
  assert.ok(files.get('gauntlet-press.png').equals(bytes(GAUNTLET_PRESS)));
  // the game's gauntlet takes all four frames from that file, and holds no copy of its own
  const cursorSrc = rd('src/ui/plus/plusCursor.js');
  assert.match(cursorSrc, /^import \{\s*GAUNTLET_POINT_1X as N1,\s*GAUNTLET_POINT_2X as N2,\s*GAUNTLET_PRESS_1X as P1,\s*GAUNTLET_PRESS_2X as P2,?\s*\} from '\.\/gauntletArt\.js';$/m);
  assert.doesNotMatch(cursorSrc, /data:image\/png;base64,/);
  assert.doesNotMatch(art, /^import /m, 'data only: the shell reads it as text');
  // a frame that is not there whole, or not a PNG, is not served: the stylesheet's `auto` is the OS arrow
  assert.equal(pointerFiles('').size, 0);
  assert.equal(pointerFiles(null).size, 0);
  assert.equal(pointerFiles(`export const GAUNTLET_POINT_1X =\n  'data:image/png;base64,${Buffer.from('not a png').toString('base64')}';`).size, 0);
  // the shell: the four names alone, before the traversal law, from the game's file (packed beside the page)
  const main = rd('app/main.cjs');
  const serve = main.slice(main.indexOf('async function serveLauncherFile'), main.indexOf('function handleDagger'));
  assert.match(serve, /^async function serveLauncherFile\(parts\) \{\n {2}if \(parts\.length === 1 && Object\.hasOwn\(POINTER_FILES, parts\[0\]\)\) \{/);
  assert.match(serve, /return png \? new Response\(png, \{ headers: \{ 'Content-Type': 'image\/png' \} \}\) : new Response\('not found', \{ status: 404 \}\);/);
  assert.match(main, /const LAUNCHER_POINTER_ART = app\.isPackaged \? path\.join\(LAUNCHER_DIR, 'gauntletArt\.js'\) : path\.join\(__dirname, '\.\.', 'src', 'ui', 'plus', 'gauntletArt\.js'\);/);
  assert.match(rd('scripts/desktopRelease.mjs'), /\{ from: 'src\/ui\/plus\/gauntletArt\.js', to: 'app\/launcher\/gauntletArt\.js' \}/, 'staged beside the page');
  assert.match(rd('.gitignore'), /^app\/launcher\/gauntletArt\.js$/m, 'and the staged copy never committed');
});

test('LAUNCHER-FACE: a pointer art read that fails is tried again at the next request, and said once - never kept for the session', async () => {
  const main = rd('app/main.cjs');
  const src = main.slice(main.indexOf('let launcherPointer = null;'), main.indexOf('async function serveLauncherFile'));
  const art = rd('src/ui/plus/gauntletArt.js');
  const answers = [Promise.reject(new Error('EBUSY')), Promise.resolve('export const NOTHING = 1;'), Promise.resolve(art)];
  let reads = 0, warned = 0;
  const fsStub = { promises: { readFile: () => answers[reads++] } };
  const files = new Function('fs', 'pointerFiles', 'POINTER_FILES', 'LAUNCHER_POINTER_ART', 'console', `${src}\nreturn launcherPointerFiles;`)(
    fsStub, pointerFiles, POINTER_FILES, '/x/gauntletArt.js', { warn: () => { warned++; } });
  assert.equal((await files()).size, 0, 'the file was held');
  assert.equal((await files()).size, 0, 'then it held no frames');
  assert.equal((await files()).size, 4, 'then it was whole: read again, and served');
  assert.equal((await files()).size, 4);
  assert.deepEqual([reads, warned], [3, 1], 'a whole read is kept; the failure is said once');
});

test('LAUNCHER-FACE: the page wears the gauntlet over every element, the press frame while a button is held, and the OS arrow if the art fails', () => {
  const css = rd('app/launcher/launcher.css');
  assert.match(css, /^html, html \*, html \*::before, html \*::after \{ cursor: url\(gauntlet-point\.png\) 0 0, auto !important; cursor: image-set\(url\(gauntlet-point\.png\) 1x, url\(gauntlet-point@2x\.png\) 2x\) 0 0, auto !important; \}$/m);
  assert.match(css, /^html\.press, html\.press \*, html\.press \*::before, html\.press \*::after \{ cursor: url\(gauntlet-press\.png\) 0 0, auto !important; cursor: image-set\(url\(gauntlet-press\.png\) 1x, url\(gauntlet-press@2x\.png\) 2x\) 0 0, auto !important; \}$/m);
  assert.match(css, /^html \.address \{ cursor: text !important; \}$/m, 'the address field keeps its caret');
  assert.match(css, /^\.trail \{[^}]*pointer-events: none;/m, 'the red never takes a click');
  assert.match(rd('app/launcher/index.html'), /<canvas id="trail" class="trail" aria-hidden="true"><\/canvas>/);
  const js = rd('app/launcher/pointer.js');
  assert.match(js, /window\.addEventListener\('pointerdown', \(e\) => \{ if \(e\.pointerType !== 'touch'\) press\(true\); \}/, 'a finger on a touch screen wears no gauntlet');
  assert.match(js, /for \(const type of \['pointerup', 'pointercancel'\]\) window\.addEventListener\(type, \(\) => press\(false\)/);
  assert.match(js, /window\.addEventListener\('blur', \(\) => press\(false\)\);/, 'a press is never left on when the window loses the mouse');
  assert.match(js, /const stopped = \(\) => document\.hidden \|\| document\.body\.hasAttribute\('data-launching'\) \|\| !!still\?\.matches;/, 'no red while hidden, starting the game, or for less motion');
  assert.match(js, /if \(busy\(\)\) raf = requestAnimationFrame\(tick\);/, 'and no frame at all while the pointer rests');
});

// ---- what it costs ------------------------------------------------------------------------------------------------

test('LAUNCHER-FACE: every endless animation moves in steps on a property the page paints, and all of them stop while the game starts - VSync off lifts the frame limit', () => {
  const css = rd('app/launcher/launcher.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const endless = [...css.matchAll(/animation:\s*([\w-]+)\s+[^;]*\binfinite\b[^;]*;/g)];
  assert.deepEqual(endless.map((m) => m[1]).sort(), ['beat', 'gleam', 'glow', 'sweep'], 'the four that run while the launcher waits');
  for (const [decl, name] of endless) {
    assert.match(decl, /steps\(\d+\)/, `${name}: in steps - a few paints a second, not one a frame`);
    const body = new RegExp(`@keyframes ${name} \\{((?:[^{}]*\\{[^{}]*\\})*[^{}]*)\\}`).exec(css)?.[1];
    assert.ok(body, `@keyframes ${name}`);
    assert.doesNotMatch(body, /\b(opacity|transform)\s*:/, `${name}: never opacity or transform, which the compositor runs at every frame whatever the steps`);
  }
  assert.match(css, /^body\[data-launching\] \*, body\[data-launching\] \*::before, body\[data-launching\] \*::after \{ animation-play-state: paused !important; \}$/m,
    'nothing moves while the game starts behind the launcher');
});

test('LAUNCHER-FACE: the trail draws at most 60 frames a second and leaves the page at rest; both canvases follow a change of screen scale; the night survives a window of nothing', () => {
  const ptr = rd('app/launcher/pointer.js');
  assert.match(ptr, /if \(dt >= 1 \/ 61\) \{\s*last = now;\s*draw\(now \/ 1000, dt\);\s*\}/, 'a frame cap, whatever the screen or VSync');
  assert.match(ptr, /else \{ ctx\.clearRect\(0, 0, W, H\); canvas\.hidden = true; \}/, 'at rest its full-window blend is off the page');
  assert.match(ptr, /function wake\(\) \{\s*if \(!raf && !stopped\(\)\) \{ canvas\.hidden = false;/);
  assert.match(ptr, /^ {2}canvas\.hidden = true;$/m, 'and it starts off the page');
  const scene = rd('app/launcher/scene.js');
  for (const [f, src, then] of [['pointer.js', ptr, 'size'], ['scene.js', scene, 'redraw']]) {
    assert.match(src, new RegExp(`matchMedia\\?\\.\\(\`\\(resolution: \\$\\{window\\.devicePixelRatio \\|\\| 1\\}dppx\\)\`\\)\\?\\.addEventListener\\('change', \\(\\) => \\{ ${then}\\(\\); watchScale\\(\\); \\}, \\{ once: true \\}\\)`), `${f}: a move to a screen of another scale rebuilds it`);
    assert.match(src, /^ {2}watchScale\(\);$/m, `${f}: and the watch is set`);
  }
  assert.match(scene, /w = Math\.max\(1, w\);\s*h = Math\.max\(1, h\);/, 'a layer is never less than a pixel');
  assert.match(scene, /W = Math\.max\(1, Math\.ceil\(/);
  assert.ok(scene.indexOf("window.addEventListener('resize', redraw);") < scene.search(/^ {2}redraw\(\);$/m), 'the listeners before the first draw: a draw that fails is not left deaf');
});
