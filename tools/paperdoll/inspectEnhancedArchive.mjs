#!/usr/bin/env node
// Inspect Paperdoll Enhanced source archives without altering game assets.
// Handles an outer RAR containing nested archives, then records every PNG's
// dimensions and opaque bounds so the layered sprite set can be mapped safely.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const archive = path.resolve(valueAfter('--archive', 'paperdoll enhanced.rar'));
const output = path.resolve(valueAfter('--out', 'build/paperdoll-source'));
const maxDepth = Number(valueAfter('--max-depth', '5'));

function commandExists(command) {
  const result = spawnSync(command, ['--help'], { stdio: 'ignore' });
  return !result.error;
}

const extractor = ['7z', '7zz', 'unar', 'unrar'].find(commandExists);
if (!fs.existsSync(archive)) {
  console.error(`Archive not found: ${archive}`);
  process.exit(2);
}
if (!extractor) {
  console.error('No RAR extractor found. Install 7-Zip (7z), 7zz, unar, or unrar and rerun.');
  process.exit(2);
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
const extractionRoot = path.join(output, 'extracted');
fs.mkdirSync(extractionRoot, { recursive: true });

function extract(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  let result;
  if (extractor === 'unar') {
    result = spawnSync(extractor, ['-force-overwrite', '-output-directory', destination, source], { encoding: 'utf8' });
  } else if (extractor === 'unrar') {
    result = spawnSync(extractor, ['x', '-o+', source, destination + path.sep], { encoding: 'utf8' });
  } else {
    result = spawnSync(extractor, ['x', '-y', `-o${destination}`, source], { encoding: 'utf8' });
  }
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr ?? result.stdout ?? `exit ${result.status}`;
    throw new Error(`Could not extract ${source}: ${detail}`);
  }
}

const visited = new Set();
const archiveRecords = [];
function extractTree(source, destination, depth) {
  const key = path.resolve(source);
  if (visited.has(key)) return;
  visited.add(key);
  extract(source, destination);
  archiveRecords.push({ archive: path.relative(process.cwd(), source), depth, output: path.relative(output, destination) });
  if (depth >= maxDepth) return;
  const nested = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(rar|7z|zip)$/i.test(entry.name) && path.resolve(full) !== key) nested.push(full);
    }
  };
  walk(destination);
  nested.sort();
  for (let i = 0; i < nested.length; i++) {
    const nestedPath = nested[i];
    const nestedOut = path.join(output, 'nested', String(archiveRecords.length).padStart(4, '0'));
    extractTree(nestedPath, nestedOut, depth + 1);
  }
}

try {
  extractTree(archive, extractionRoot, 0);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function alphaBounds(png) {
  let left = png.width, top = png.height, right = -1, bottom = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return null;
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

const images = [];
function indexImages(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      indexImages(full);
      continue;
    }
    if (!/\.png$/i.test(entry.name)) continue;
    try {
      const png = PNG.sync.read(fs.readFileSync(full), { skipRescale: true });
      const relative = path.relative(extractionRoot, full).split(path.sep).join('/');
      images.push({
        path: relative,
        width: png.width,
        height: png.height,
        opaqueBounds: alphaBounds(png),
        bytes: fs.statSync(full).size,
      });
    } catch (error) {
      images.push({ path: path.relative(extractionRoot, full).split(path.sep).join('/'), error: error.message });
    }
  }
}
indexImages(extractionRoot);
images.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
const manifest = {
  sourceArchive: path.basename(archive),
  extractor,
  maxNestedDepth: maxDepth,
  archives: archiveRecords,
  imageCount: images.length,
  images,
};
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Extracted ${archiveRecords.length} archive(s); indexed ${images.length} PNG(s).`);
console.log(`Manifest: ${path.join(output, 'manifest.json')}`);
