// PROVING-GROUND (bible/05-Combat/Proving-Ground.md): THE LANES SIDE BY SIDE as one picture - for each scenario named,
// the vanilla, fork and new contact sheets' first rows in a row.  node tools/provingGround/compare.mjs <out.png> <set-scene> ...
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.proving-ground', 'out'), dest = join(OUT, process.argv[2]), scenes = process.argv.slice(3);
const lanes = (process.env.PG_LANES || 'vanilla,fork,new').split(',');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 2400, height: 800 } });
const img = (f) => `data:image/png;base64,${readFileSync(join(OUT, f)).toString('base64')}`;
let html = '<body style="margin:0;background:#111;color:#eee;font:16px monospace">';
for (const s of scenes) {
  html += `<div style="padding:6px 8px;font-size:22px;color:#fc6">${s}</div><div>`;
  for (const l of lanes) html += `<div><div style="padding:4px 6px;font-size:20px">${l}</div><div style="height:560px;overflow:hidden"><img src="${img(`${l}-${s}.sheet.png`)}" style="width:100%"></div></div>`;
  html += '</div>';
}
await p.setContent(html + '</body>');
await p.screenshot({ path: dest, fullPage: true });
await b.close();
