// LOAD-STALL (bible/07-Rendering/Load-Stalls.md): THE PLAYER'S BODY BUILT IN NODE, ON REAL DATA, TIMED.
//
//   node tools/mwBuildProbe.mjs [--race nord] [--female] [--repeat 3]
//
// Loads src/combat/fpArm.js through Vite's SSR transform (so the mods' import.meta.glob resolves as in the game),
// opens the retail .bsa/.esm off MORROWIND_DATA (default: the owner's Steam install) in the game's own order - the
// bundled packs, the scabbards, the cloaks, the port's own, then the archives - and builds the player's body: once
// bare (the world's load), then once per worn set (an equip). Prints the build's own span line and the longest
// synchronous stretch (the freeze a player feels), measured off an interval timer the build starves.
import { createServer } from 'vite';
import { openAsBlob, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const DATA = process.env.MORROWIND_DATA || 'D:/Steam/steamapps/common/Morrowind/Data Files';
const root = resolve(import.meta.dirname, '..');
if (!existsSync(join(DATA, 'Morrowind.esm'))) { console.error(`no Morrowind.esm under ${DATA} (set MORROWIND_DATA)`); process.exit(1); }

// the mods' modules list their files only where `window` stands (IN_BROWSER) - the probe stands one, or the bodies
// it times are retail's
globalThis.window ??= globalThis;
// fetch: a root-relative URL (the mods' ?url imports) is a file of the repository
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('/')) {
    const path = join(root, decodeURIComponent(u.split('?')[0]).replace(/^\/@fs\//, '/'));
    if (!existsSync(path)) return new Response(null, { status: 404 });
    return new Response(readFileSync(path));
  }
  return realFetch(url, init);
};

const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true } });
const load = (p) => server.ssrLoadModule(p);
const { MwBsaFile } = await load('/src/formats/morrowind/mwBsaFile.js');
const fpArm = await load('/src/combat/fpArm.js');

const ESMS = ['Morrowind.esm', 'Tribunal.esm', 'Bloodmoon.esm'].filter((n) => existsSync(join(DATA, n)));
const BSAS = ['Bloodmoon.bsa', 'Tribunal.bsa', 'Morrowind.bsa'].filter((n) => existsSync(join(DATA, n)));
let archives = null;
const esmFiles = new Map();
const deps = {
  morrowindDataGeneration: () => 1,
  storedMorrowindNames: async () => [...ESMS, ...BSAS],
  loadMorrowindFile: async (n) => esmFiles.get(n) ?? (esmFiles.set(n, new Uint8Array(readFileSync(join(DATA, n)))), esmFiles.get(n)),   // the game's file memo
  async loadMorrowindArchives() {
    if (archives) return archives;
    archives = [];
    for (const [mod, fn] of [['/src/systems/bundledMorrowindMods.js', 'bundledMorrowindModsArchive'], ['/src/systems/weaponSheathingAssets.js', 'weaponSheathingArchive'],
      ['/src/systems/simplyAnimatedCloaksAssets.js', 'simplyAnimatedCloaksArchive'], ['/src/systems/ownMwAssets.js', 'ownMwArchive']]) {
      try { archives.push((await load(mod))[fn]()); } catch (e) { console.warn(`${fn}: ${e.message}`); }
    }
    for (const n of BSAS) archives.push(await MwBsaFile.open(await openAsBlob(join(DATA, n))));
    return archives;
  },
};

// the freeze meter: an interval that should tick every 4 ms; the widest gap between ticks is the longest stretch the
// build held the thread
function freezeMeter() {
  let last = performance.now(), worst = 0;
  const id = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last); last = n; }, 4);
  return () => { clearInterval(id); return Math.round(Math.max(worst, performance.now() - last)); };
}

const race = opt('race', 'nord');
const female = args.includes('--female');
const repeat = Number(opt('repeat', 2));
// dfWornEquipment's own shape (mwItemMap.js) - ARMOR_ENUM's templates, material 0
const piece = (templateIndex) => ({ kind: 'armor', templateIndex, material: 0 });
const SETS = [
  ['bare', null],
  ['cuirass', [piece(102)]],
  ['+greaves+boots', [piece(102), piece(104), piece(108)]],
  ['+gauntlets', [piece(102), piece(104), piece(108), piece(103)]],
  ['+pauldrons+helm', [piece(102), piece(104), piece(108), piece(103), piece(105), piece(106), piece(107)]],
];
const original = console.log;
for (let r = 0; r < repeat; r++) {
  for (const [label, armor] of SETS) {
    let line = '';
    console.log = (...a) => { const s = a.join(' '); if (s.startsWith('[mw] arm built')) line = s; else if (process.env.PROBE_VERBOSE) original(...a); };
    const stop = freezeMeter();
    const t0 = performance.now();
    const res = await fpArm.buildFpArm({ race, female, armor, deps, ownHeads: true });
    const total = Math.round(performance.now() - t0);
    const freeze = stop();
    // LOAD-STALL 2: the sweep the build deferred, run as the rig runs it - beside the frames
    let later = '';
    if (res.ok && typeof res.sweepLater === 'function') {
      const stopLater = freezeMeter();
      const s0 = performance.now();
      await res.sweepLater();
      later = ` | deferred sweep ${Math.round(performance.now() - s0)}ms worst-freeze=${stopLater()}ms`;
    }
    console.log = original;
    console.log(`#${r} ${label.padEnd(18)} ok=${res.ok} pieces=${res.pieces ?? '-'}/${res.third?.pieces ?? '-'} wall=${total}ms worst-freeze=${freeze}ms | ${line.replace('[mw] arm built in ', '')}${later}${res.ok ? '' : ` | ${res.stage}: ${res.error}`}`);
  }
}
await server.close();
process.exit(0);
