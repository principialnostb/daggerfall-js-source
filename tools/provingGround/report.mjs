// PROVING-GROUND (bible/05-Combat/Proving-Ground.md): THE REPORT - every lane's runs side by side, "it was so, it
// became so": per scenario its numbers and its contact sheet, written as one local page beside the pictures
// (.proving-ground/out/report.html - the owner's data's pictures, never committed).
//   node tools/provingGround/report.mjs [lane ...]   (default: vanilla fork new - those that have runs)
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.proving-ground', 'out');
const lanes = (process.argv.slice(2).length ? process.argv.slice(2) : ['vanilla', 'fork', 'new']);
const sets = {};   // set (2c, shield, fight) -> lane -> metrics
for (const f of readdirSync(OUT).filter((n) => n.endsWith('.metrics.json'))) {
  const [lane, ...rest] = f.replace('.metrics.json', '').split('-');
  if (!lanes.includes(lane)) continue;
  (sets[rest.join('-')] ??= {})[lane] = JSON.parse(readFileSync(join(OUT, f), 'utf8'));
}
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const cell = (m) => (m ? `${m.invalid ? `<div class="num" style="color:#f66">INVALID RUN: ${esc(m.invalid)}</div>` : ''}<div class="num">frame ${m.frameMs ? `${m.frameMs.median}/${m.frameMs.p95} ms` : '-'} &middot; slide <b>${m.footSlideCmPerPlantedFrame ?? '-'}</b> cm/frame &middot; leaps <b>${m.pops ?? '-'}</b>` +
  `${m.worstPops?.length ? ` (worst ${m.worstPops[0].cm} cm ${esc(m.worstPops[0].bone)})` : ''}<br>rates ${esc(JSON.stringify(m.rates ?? {}))}</div>` : '<div class="num">-</div>');
let html = `<!doctype html><meta charset="utf-8"><title>Proving Ground report</title><style>
body{background:#111;color:#ddd;font:13px/1.4 system-ui,sans-serif;margin:16px}h2{margin:24px 0 6px}h3{margin:14px 0 4px;color:#fc6}
table{border-collapse:collapse;width:100%}td{vertical-align:top;padding:4px;border-top:1px solid #333;width:${Math.floor(100 / lanes.length)}%}
th{text-align:left;color:#9cf;padding:4px}img{width:100%;image-rendering:pixelated}.num{font:12px monospace;color:#bbb;margin:2px 0}</style>
<h1>Proving Ground - ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</h1>
<p>Lanes: ${lanes.map(esc).join(', ')}. Slide: the planted foot's travel in the world, centimetres a frame at 60 Hz. Leaps: single-frame jumps of a foot, a hand, the blade, the hips or the head.</p>`;
for (const [set, byLane] of Object.entries(sets)) {
  html += `<h2>${esc(set)}</h2>`;
  const scenes = [...new Set(Object.values(byLane).flatMap((m) => Object.keys(m)))].filter((s) => !['type'].includes(s));
  for (const s of scenes) {
    html += `<h3>${esc(s)}</h3><table><tr>${lanes.map((l) => `<th>${esc(l)}</th>`).join('')}</tr><tr>`;
    for (const l of lanes) {
      const m = byLane[l]?.[s];
      const sheet = `${l}-${set}-${s}.sheet.png`;
      html += `<td>${cell(m)}${existsSync(join(OUT, sheet)) ? `<a href="${sheet}"><img src="${sheet}"></a>` : ''}</td>`;
    }
    html += '</tr></table>';
  }
}
writeFileSync(join(OUT, 'report.html'), html);
console.log(join(OUT, 'report.html'));
