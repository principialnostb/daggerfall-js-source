// PROVING-GROUND (bible/05-Combat/Proving-Ground.md): THE GAME IN OPERATION, DRIVEN BY A SCRIPT.
//
//   node tools/provingGround/run.mjs boot [--lane fork|vanilla|new] [--headed]
//
// Starts its own dev server (the owner's ARENA2 handed to it by ARENA2_PATH, default his Steam install), a Chromium
// with a profile of its own under .proving-ground/ (gitignored) - into which the owner's Morrowind Data Files are
// attached once, through the game's own door (dataSource.js storeMorrowindFiles) - lays the fixed clock
// (tools/provingGround/clock.js) and the lane's settings before the game's code, boots the game and runs the command.
// Nothing of the owner's data, settings or pictures is written outside .proving-ground/.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOME = join(ROOT, '.proving-ground');
const OUT = join(HOME, 'out');
const PROFILE = join(HOME, 'profile');
const ARENA2 = process.env.ARENA2_PATH || 'D:/Steam/steamapps/common/The Elder Scrolls Daggerfall/DF/DAGGER/ARENA2';
const MW_DATA = process.env.MORROWIND_DATA || 'D:/Steam/steamapps/common/Morrowind/Data Files';
const PORT = Number(process.env.PG_PORT || 5310);

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('--')) ?? 'boot';
const opt = (name, dflt = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : dflt; };

/** THE LANES (Proving-Ground.md section 2): the settings each is booted with, laid into localStorage before the game. */
export function laneSeed(lane) {
  const fork = JSON.parse(readFileSync(join(HOME, 'fork-seed.json'), 'utf8'));
  const seed = Object.fromEntries(Object.entries(fork).map(([k, v]) => [k, JSON.stringify(v)]));
  const mods = fork['dfjs-mod-settings'];
  const ui = fork['dagger.ui.v1'];
  if (lane === 'vanilla') {
    // the original game's motion: Morrowind's own clips, no pack, no layer laid over them
    const anim = Object.fromEntries(Object.keys(mods['morrowind-animation']).filter((k) => !k.includes('@')).map((k) => [k, 0]));
    Object.assign(anim, { MotionDoctrine: 0, AnimationOverhaul: 0, OpenMWDynamicAnimations: 0, PlayerWalkSource: 0, PlayerRunSource: 0 });
    seed['dfjs-mod-settings'] = JSON.stringify({ ...mods, 'morrowind-animation': anim });
    seed['dagger.ui.v1'] = JSON.stringify({ ...ui, mwBodyMotion: false, mwFullGait: false });
  } else if (lane === 'new') {
    seed['dagger.ui.v1'] = JSON.stringify({ ...ui, mwFullGait: true });
  } else if (lane === 'smooth') {
    // the owner's build with the clips' corners rounded (loopSeam.js CLIP-SMOOTH) - his animations, smoother
    seed['dagger.ui.v1'] = JSON.stringify({ ...ui, mwFullGait: false, mwClipSmooth: true });
  } else if (lane === 'fork') {
    seed['dagger.ui.v1'] = JSON.stringify({ ...ui, mwFullGait: false, mwClipSmooth: false });
  }
  return seed;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  process.env.ARENA2_PATH = ARENA2;
  const server = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.js'), logLevel: 'error', server: { port: PORT, strictPort: true, hmr: false } });
  await server.listen();
  const base = `http://localhost:${PORT}`;
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: !opt('headed'),
    viewport: { width: 1280, height: 960 },
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  // OFFLINE: the ground's game talks to its own server alone - the live services (accounts, POI feeds, the relay) are
  // no part of a run, and a run must not hang on them or tell them anything
  await context.route((url) => !/^(http|ws)s?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url.href) && !url.href.startsWith('data:') && !url.href.startsWith('blob:'), (route) => route.abort('blockedbyclient'));
  const page = wire(context.pages()[0] ?? await context.newPage());
  try {
    await ensureMorrowind(page, base);
    const lane = opt('lane', 'fork');
    await context.addInitScript({ content: readFileSync(join(ROOT, 'tools', 'provingGround', 'clock.js'), 'utf8') });
    await context.addInitScript(({ seed }) => {
      if (sessionStorage.getItem('__pgSeeded')) return;
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
      sessionStorage.setItem('__pgSeeded', '1');
    }, { seed: laneSeed(lane) });
    if (command === 'boot') await boot(context, page, base, lane);
    if (command === 'session') { const live = await boot(context, page, base, lane); await session(live, lane, server); }
  } finally {
    await context.close();
    await server.close();
  }
}

/** A page's own reports in the ground's log: its errors, a failed request, a resource the server does not have. */
function wire(page) {
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text().slice(0, 300)); });
  page.on('requestfailed', (r) => { if (!/ERR_BLOCKED_BY_CLIENT/.test(r.failure()?.errorText ?? '')) console.error('[request failed]', r.url().slice(0, 200), r.failure()?.errorText); });
  page.on('response', (r) => { if (r.status() === 404) console.error('[404]', r.url().slice(0, 200)); });
  return page;
}

/** The owner's Morrowind data in this profile's IndexedDB, attached once through the game's own door. */
/** A page load that outlasts the dev server's first dependency pass (it restarts itself once while it optimises). */
async function load(page, url, tries = 4) {
  for (let i = 1; ; i++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 }); return; } catch (e) { if (i >= tries) throw e; console.log(`  (reload ${i}: ${e.message.split('\n')[0]})`); }
  }
}

async function ensureMorrowind(page, base) {
  await load(page, `${base}/`);
  await page.waitForTimeout(3000);
  const stored = await page.evaluate(async () => (await import('/src/scenes/dataSource.js')).storedMorrowindNames());
  if (stored?.length) { console.log(`Morrowind data: ${stored.length} files stored`); return; }
  if (!existsSync(MW_DATA)) throw new Error(`no Morrowind Data Files at ${MW_DATA} (MORROWIND_DATA)`);
  console.log(`attaching Morrowind data from ${MW_DATA} (once) ...`);
  await page.evaluate(() => { const i = document.createElement('input'); i.type = 'file'; i.id = '__pgDir'; i.webkitdirectory = true; i.multiple = true; document.body.appendChild(i); });
  await page.setInputFiles('#__pgDir', MW_DATA);
  const n = await page.evaluate(async () => {
    const files = [...document.getElementById('__pgDir').files];
    await (await import('/src/scenes/dataSource.js')).storeMorrowindFiles(files);
    return (await (await import('/src/scenes/dataSource.js')).storedMorrowindNames()).length;
  });
  console.log(`Morrowind data: ${n} files stored`);
}

async function boot(context, page, base, lane) {
  const url = `${base}/play/?shot&play&world&test=nord-warrior&tod=12:00&weather=sunny&wseed=1`;
  console.log(`[${lane}] ${url}`);
  for (let attempt = 1; ; attempt++) {
    if (attempt > 1) {   // a stuck boot's page is let go whole: a fresh tab, the same profile
      const old = page; page = wire(await context.newPage()); await old.close().catch(() => {});
    }
    await load(page, url);
    try { await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 240000 }); break; } catch (e) {
      // a boot that never readies: its picture and its word kept, then once more from the start
      await page.screenshot({ path: join(OUT, `boot-${lane}-stuck-${attempt}.png`) }).catch(() => {});
      const why = await page.evaluate(() => ({ frame: window.__frame, idle: window.__streamIdle?.(), built: window.__builtCount?.(), title: document.title })).catch(() => null);
      console.log(`  boot not ready (attempt ${attempt}): ${JSON.stringify(why)}`);
      if (attempt >= 3) throw e;
    }
  }
  await page.evaluate(() => window.__pg.freeze());
  await page.evaluate(() => window.__pg.step(60));
  const file = join(OUT, `boot-${lane}.png`);
  await page.screenshot({ path: file });
  const state = await page.evaluate(() => ({ frame: window.__frame, pgFrames: window.__pg.frames(), pos: window.__player?.pos ?? null }));
  writeFileSync(join(OUT, `boot-${lane}.json`), JSON.stringify(state, null, 2));
  console.log(file, JSON.stringify(state));
  return page;
}

/**
 * THE SESSION: the game booted once, then driven by command files - each `.proving-ground/cmd/<name>.mjs` a module whose
 * default export is `async ({ page, step, shot, kit, out }) => result`, run once and answered in `<name>.result.json`
 * (and its pictures beside it). `stop.mjs` ends the session. Local files only: no port is opened for it.
 */
async function session(page, lane, server) {
  const { readdirSync, renameSync } = await import('node:fs');
  const { pathToFileURL } = await import('node:url');
  const CMD = join(HOME, 'cmd');
  mkdirSync(CMD, { recursive: true });
  await page.addScriptTag({ type: 'module', content: readFileSync(join(ROOT, 'tools', 'provingGround', 'kit.js'), 'utf8') });
  await page.waitForFunction(() => !!window.__pgKit);
  const step = (n = 1) => page.evaluate((k) => window.__pg.step(k), n);
  const shot = async (name) => { const file = join(OUT, `${name}.png`); await page.screenshot({ path: file }); return file; };
  const kit = (fn, ...a) => page.evaluate(([f, x]) => window.__pgKit[f](...x), [fn, a]);
  writeFileSync(join(CMD, 'READY'), new Date().toISOString());
  console.log('session ready: drop modules into', CMD);
  for (;;) {
    const jobs = readdirSync(CMD).filter((f) => f.endsWith('.mjs')).sort();
    if (!jobs.length) { await new Promise((r) => setTimeout(r, 300)); continue; }
    const job = jobs[0], name = job.replace(/\.mjs$/, ''), path = join(CMD, job);
    if (name === 'stop') { renameSync(path, path + '.done'); return; }
    let result;
    try {
      await page.addScriptTag({ type: 'module', content: readFileSync(join(ROOT, 'tools', 'provingGround', 'kit.js'), 'utf8') });   // the kit as it stands now
      const mod = await import(pathToFileURL(path).href + `?v=${Date.now()}`);
      result = { ok: true, value: await mod.default({ page, step, shot, kit, out: OUT, lane, server }) };
    } catch (e) { result = { ok: false, error: String(e?.stack ?? e) }; }
    writeFileSync(join(CMD, `${name}.result.json`), JSON.stringify(result, null, 2));
    renameSync(path, path + '.done');
    console.log(`[session] ${name}: ${result.ok ? 'ok' : 'FAILED'}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
