#!/usr/bin/env node
/**
 * Prepare the pixel-art body references from the smart-paperdoll branch.
 * Run from repository root: node tools/prepareSmartPaperdollBodies.mjs
 * Uses only Node's built-in fetch and the already-installed pngjs dependency.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = process.cwd();
const REF = 'https://raw.githubusercontent.com/principialnostb/daggerfall-js-source/smart-paperdoll/Reference/Textures/BodySprite';
const OUT = path.join(ROOT, 'vendor/smart-paperdoll/Textures/body');
const SOURCES = ['BODY17I0.IMG.png', 'ImperialFNude.IMG.png', 'OhmesFNude.IMG.png'];
const W = 53, H = 110;

function resizeNearest(src, width, height) {
  const out = new PNG({ width, height, colorType: 6 });
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y * src.height / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x * src.width / width));
      const si = (sy * src.width + sx) * 4;
      const di = (y * width + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
let ok = 0;
for (const name of SOURCES) {
  const url = `${REF}/${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`SKIP ${name}: HTTP ${res.status} from ${url}`);
    continue;
  }
  const input = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  const output = resizeNearest(input, W, H);
  const target = path.join(OUT, name);
  fs.writeFileSync(target, PNG.sync.write(output));
  console.log(`OK ${name}: ${input.width}x${input.height} -> ${W}x${H} => ${target}`);
  ok++;
}
if (!ok) {
  console.error('No textures were prepared. Check network access and branch Reference/Textures/BodySprite.');
  process.exitCode = 1;
} else {
  console.log(`Prepared ${ok} texture(s). Runtime overlay uses BODY17I0.IMG.png; other files are available for later race selection.`);
}
