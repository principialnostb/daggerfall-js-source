// THE JOURNAL'S KIT: the game's own painters for the Courier's Cabinet's wares (src/ui/cabinetPreview.js), bundled into
// one module the journal's Activity loads beside its pages, at server-account/journal/kit/ (never committed). The
// account deploy builds it before it uploads the journal with the Worker, so the Cabinet draws each ware as the game of
// that commit draws it. Without it the Cabinet shows each ware's wax seal.
//   node tools/journalKit.mjs            build it
//   node tools/journalKit.mjs --report   build it and name its largest inputs
import { build } from 'esbuild';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { isMain } from './lib/isMain.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** The painters' entry, in the game's tree. */
export const KIT_ENTRY = 'src/ui/cabinetPreview.js';
/** Where the journal loads it from (server-account/journal/cabinetView.js imports `./kit/cabinetPreview.js`). */
export const KIT_OUT = 'server-account/journal/kit/cabinetPreview.js';
/** The most it may weigh, minified, in bytes: the Cabinet loads it on Discord's mobile clients too. */
export const KIT_BUDGET = 640 * 1024;

/** esbuild's options for the kit: one browser module, minified, its own comments left out. */
export const kitOptions = (/** @type {string} */ outfile = KIT_OUT) => ({
  absWorkingDir: ROOT,
  entryPoints: [KIT_ENTRY],
  bundle: true,
  format: /** @type {const} */ ('esm'),
  platform: /** @type {const} */ ('browser'),
  target: 'es2022',
  minify: true,
  legalComments: /** @type {const} */ ('none'),
  metafile: true,
  logLevel: /** @type {const} */ ('warning'),
  outfile,
});

/**
 * The kit built: written to `outfile`, or held in memory with `write: false`. Answers its size, its gzipped size, the
 * files it bundles and esbuild's metafile.
 * @param {{ outfile?: string, write?: boolean }} [o]
 */
export async function buildKit({ outfile = KIT_OUT, write = true } = {}) {
  const r = await build({ ...kitOptions(outfile), write });
  const text = write ? readFileSync(join(ROOT, outfile)) : Buffer.from(r.outputFiles?.[0]?.contents ?? []);
  return {
    bytes: text.length,
    gzip: gzipSync(text).length,
    inputs: Object.keys(r.metafile?.inputs ?? {}).sort(),
    metafile: r.metafile,
    text: text.toString('utf8'),
  };
}

if (isMain(import.meta.url)) {
  const kit = await buildKit();
  console.log(`${KIT_OUT}: ${(kit.bytes / 1024).toFixed(0)} KiB, ${(kit.gzip / 1024).toFixed(0)} KiB gzipped, ${kit.inputs.length} files`);
  if (process.argv.includes('--report')) {
    const out = /** @type {any} */ (Object.values(kit.metafile?.outputs ?? {})[0]);
    const rows = Object.entries(out?.inputs ?? {}).sort((a, b) => /** @type {any} */ (b[1]).bytesInOutput - /** @type {any} */ (a[1]).bytesInOutput);
    for (const [f, v] of rows.slice(0, 20)) console.log(`${String(/** @type {any} */ (v).bytesInOutput).padStart(9)}  ${f}`);
  }
  if (kit.bytes > KIT_BUDGET) {
    console.error(`the kit weighs ${kit.bytes} bytes, past its budget of ${KIT_BUDGET}: a heavy module joined it (--report names it)`);
    process.exit(1);
  }
}
