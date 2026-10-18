#!/usr/bin/env node
/**
 * Extract real archive-112364 frame keys by running the project's actual
 * spriteFor() and EotB animation tables. No hand-authored record numbers.
 *
 * Usage:
 *   node tools/extractSmartPaperdollKeys.mjs
 *   node tools/extractSmartPaperdollKeys.mjs --all --out tools/smart-paperdoll-keys-all.json
 *   node tools/extractSmartPaperdollKeys.mjs --limit 16 --out tools/smart-paperdoll-keys.json
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { STATE_TABLES, TABLE_FRAMES, ORIENTATIONS, stateFor, frameCount } from '../src/player/eyeOfTheBeholder/eotbBillboard.js';
import { spriteFor } from '../src/player/eyeOfTheBeholder/eotbSprite.js';

const ROOT = process.cwd();
const ARCHIVE = 112364;
const TABLES = Object.keys(STATE_TABLES).filter(name => !name.endsWith('Horse') && !name.endsWith('Lycan'));
const args = process.argv.slice(2);
let all = false, limit = 16, out = 'tools/smart-paperdoll-keys.json';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--all') all = true;
  else if (args[i] === '--limit') limit = Number(args[++i]);
  else if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node tools/extractSmartPaperdollKeys.mjs [--all] [--limit N] [--out FILE]');
    process.exit(0);
  } else throw new Error('Unknown argument: ' + args[i]);
}
if (!all && (!Number.isInteger(limit) || limit < 1)) throw new Error('--limit must be a positive integer');

const unique = new Map();
for (const table of TABLES) {
  for (let frame = 0; frame < frameCount(table); frame++) {
    for (let orientation = 0; orientation < ORIENTATIONS; orientation++) {
      const sprite = spriteFor(table, orientation, frame, { onFoot: 0 });
      if (!sprite || sprite.archive !== ARCHIVE) continue;
      const key = sprite.key;
      const record = Number(key.match(/^112364_(\d+)-(\d+)$/)?.[1]);
      const frameIndex = Number(key.match(/^112364_(\d+)-(\d+)$/)?.[2]);
      if (!Number.isInteger(record) || !Number.isInteger(frameIndex)) throw new Error('Unexpected spriteFor key: ' + key);
      const entry = unique.get(key) ?? { key, archive: ARCHIVE, record, frame: frameIndex, width: 0, height: 0, orientation, mirror: sprite.mirror, contexts: [] };
      entry.contexts.push({ table, animationFrame: frame, orientation, mirror: sprite.mirror });
      unique.set(key, entry);
    }
  }
}
const entries = [...unique.values()];
if (!entries.length) throw new Error('spriteFor() produced no archive 112364 keys; refusing to invent keys.');
for (const entry of entries) {
  const pngPath = path.join(ROOT, 'vendor/eye-of-the-beholder/Textures', String(ARCHIVE), entry.key + '.png');
  let image;
  try { image = PNG.sync.read(await fs.readFile(pngPath)); }
  catch (error) { throw new Error('Real sprite PNG missing/unreadable for ' + entry.key + ': ' + pngPath + ' (' + error.message + ')'); }
  entry.width = image.width;
  entry.height = image.height;
  entry.source = path.relative(ROOT, pngPath).replaceAll(path.sep, '/');
  // Keep the contexts to prove how each sprite key was reached, but expose
  // the simple fields the sheet generator consumes at top level.
}
let selected = entries;
if (!all && entries.length > limit) {
  // Evenly sample the real, key-sorted list so a 4x4 preview is not just
  // sixteen adjacent idle sprites. All selected keys remain exact spriteFor outputs.
  selected = Array.from({ length: limit }, (_, i) => entries[Math.floor(i * (entries.length - 1) / (limit - 1 || 1))]);
}
const output = selected.map(({ key, width, height, orientation, mirror, archive, record, frame, source, contexts }) =>
  ({ key, width, height, orientation, mirror, archive, record, frame, source, contexts }));
const outPath = path.resolve(ROOT, out);
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(output, null, 2) + '\n');
console.log('Archive:', ARCHIVE, '(Light Fighter female / EotB foot base)');
console.log('Animation tables checked:', TABLES.length, '| unique real keys:', entries.length, '| written:', output.length);
console.log('Output:', path.relative(ROOT, outPath).replaceAll(path.sep, '/'));
console.log('Source PNG example:', output[0]?.source, output[0] ? output[0].width + 'x' + output[0].height : '');
