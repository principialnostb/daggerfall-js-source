#!/usr/bin/env node
/**
 * Offline Smart PaperDoll art prototype. No network, credentials, or hosted
 * image-generation API. Uses original archive-112364 PNGs as pose/silhouette
 * templates, writes strict black/white region masks, and emits a nearest-
 * neighbour palette-safe body candidate for manual review.
 *
 * This intentionally does NOT claim to synthesize missing anatomy or invent
 * animation poses: a deterministic algorithm cannot infer those reliably
 * from a single sprite. Runtime remains on the original frame unless a
 * reviewed generated asset is present.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = process.cwd();
const ARCHIVE = 112364;
const args = process.argv.slice(2);
let keysFile = 'tools/smart-paperdoll-keys.json';
let outDir = 'vendor/smart-paperdoll/Textures/body';
let maskDir = 'vendor/smart-paperdoll/Textures/masks';
let help = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--keys') keysFile = args[++i];
  else if (args[i] === '--out-dir') outDir = args[++i];
  else if (args[i] === '--mask-dir') maskDir = args[++i];
  else if (args[i] === '--help' || args[i] === '-h') help = true;
  else throw new Error('Unknown argument: ' + args[i]);
}
if (help) {
  console.log('Offline prototype (no fal.ai, no API key)\nUsage: node tools/smartPaperdollSpriteSheet.mjs --keys tools/smart-paperdoll-keys.json');
  process.exit(0);
}
const read = async (file) => PNG.sync.read(await fs.readFile(file));
const write = async (file, png) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, PNG.sync.write(png));
};
const pixel = (png, x, y) => {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
};
const set = (png, x, y, c) => {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) * 4;
  png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = c[3] ?? 255;
};
const isOpaque = (p) => p[3] > 0;
const keys = JSON.parse(await fs.readFile(path.resolve(ROOT, keysFile), 'utf8'));
if (!Array.isArray(keys) || !keys.length) throw new Error('Keys JSON must be a non-empty array.');
await fs.mkdir(path.resolve(ROOT, outDir), { recursive: true });
await fs.mkdir(path.resolve(ROOT, maskDir), { recursive: true });
const manifest = [];
for (const entry of keys) {
  if (!entry || !new RegExp('^' + ARCHIVE + '_\\d+-\\d+$').test(entry.key || '')) {
    throw new Error('Invalid archive-112364 key: ' + (entry?.key ?? '(missing)'));
  }
  const sourcePath = path.resolve(ROOT, entry.source || `vendor/eye-of-the-beholder/Textures/${ARCHIVE}/${entry.key}.png`);
  const src = await read(sourcePath);
  if (entry.width && entry.width !== src.width || entry.height && entry.height !== src.height) {
    throw new Error(`Source dimensions changed for ${entry.key}: ${src.width}x${src.height}`);
  }

  // The source silhouette is preserved pixel-for-pixel. The output is a
  // conservative body candidate, not fabricated poses: opaque source pixels
  // stay intact. Masks use normalized regions, clipped to the original alpha.
  const mask = new PNG({ width: src.width, height: src.height });
  const body = new PNG({ width: src.width, height: src.height });
  const w = src.width, h = src.height;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = pixel(src, x, y);
    if (!isOpaque(p)) continue;
    // White indicates pixels in a removable equipment/body region.
    // Coordinates are normalized to each original frame; everything else black.
    const nx = (x + 0.5) / w, ny = (y + 0.5) / h;
    const torso = ny >= 0.24 && ny <= 0.57 && nx >= 0.27 && nx <= 0.73;
    const legs = ny > 0.55 && ny <= 0.91 && nx >= 0.20 && nx <= 0.80;
    const feet = ny > 0.88 && nx >= 0.16 && nx <= 0.84;
    const arms = ny >= 0.27 && ny <= 0.59 && (nx <= 0.30 || nx >= 0.70);
    const head = ny <= 0.27 && nx >= 0.30 && nx <= 0.70;
    const groin = ny >= 0.52 && ny <= 0.67 && nx >= 0.36 && nx <= 0.64;
    const changed = torso || legs || feet || arms || head || groin;
    set(mask, x, y, changed ? [255, 255, 255, 255] : [0, 0, 0, 255]);
    set(body, x, y, p);
  }
  const name = entry.key + '.png';
  await write(path.resolve(ROOT, outDir, name), body);
  await write(path.resolve(ROOT, maskDir, entry.key + '.mask.png'), mask);
  manifest.push({
    key: entry.key,
    source: path.relative(ROOT, sourcePath).replaceAll(path.sep, '/'),
    body: path.posix.join(outDir.replaceAll('\\\\', '/'), name),
    mask: path.posix.join(maskDir.replaceAll('\\\\', '/'), entry.key + '.mask.png'),
    width: w, height: h,
    maskEncoding: 'RGBA grayscale: white=region selected, black=preserve',
    status: 'template-only-original-pixels-preserved',
  });
}
const manifestPath = path.resolve(ROOT, 'vendor/smart-paperdoll/generated/offline-manifest.json');
await fs.mkdir(path.dirname(manifestPath), { recursive: true });
await fs.writeFile(manifestPath, JSON.stringify({
  generator: 'offline-template-mask-generator',
  archive: ARCHIVE,
  network: false,
  apiKeyRequired: false,
  note: 'This preserves source pixels and emits geometric masks. It does not create replacement anatomy or connect runtime compositing.',
  frames: manifest,
}, null, 2) + '\n');
console.log(`Wrote ${manifest.length} source-shaped frame candidates and black/white masks.`);
console.log('No network calls made. No replacement anatomy synthesized; runtime is unchanged.');
