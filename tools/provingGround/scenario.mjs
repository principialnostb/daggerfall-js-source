// PROVING-GROUND (bible/05-Combat/Proving-Ground.md): A SCENARIO PLAYED AND READ. A scenario is a list of actions, each a
// number of frames on the fixed clock with keys held, a swing dragged or the camera swung; every frame the body's bones,
// the player's place and the rig's word are recorded, and every `every` frames a picture of the body is taken from the
// camera the scenario asks. `metrics` reads the record: single-frame leaps, the planted foot's slide, the cadence, each
// blow's reach and bend.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const YAW = 0;   // the body faces the camera's yaw; scenarios play along this heading

/** Play `spec` = { name, look: [yaw, pitch] for the camera swing, every, clip: picture box, steps: [...] }. A step:
 *  { frames, keys: ['KeyW', 'ShiftLeft'] } held over its frames, or { swing: 'down'|'up'|'left'|'right', frames } (the
 *  right button dragged that way over its first 8 frames), or { orbit: [yaw, pitch] }, or { press: 'KeyZ' }. Any step may
 *  turn the view as a mouse would: `turn` radians a second, or `weave` [amplitude rad, period s] - a sine about the heading. */
export async function play({ page, step, kit, out }, spec) {
  const yaw0 = spec.yaw ?? YAW;   // the heading the scenario plays along (a fight faces its foe)
  let yaw = yaw0;
  if (!spec.stay) { await kit('home'); await step(40); }
  await page.evaluate((y) => window.__look?.(y, 0), yaw);
  if (spec.look) await kit('orbit', spec.look[0], spec.look[1]);
  await step(20);
  const frames = [], shots = [];
  let held = new Set(), f = 0;
  const every = spec.every ?? 12;
  const clip = spec.clip ?? { x: 380, y: 300, width: 520, height: 560 };
  const record = async (label) => {
    const r = await page.evaluate(async () => ({ s: await window.__pgKit.state(), b: await window.__pgKit.bones() }));
    frames.push({ f, label, yaw, ...r.s, b: r.b });
    if (f % every === 0) {
      const file = join(out, `${spec.name}-${String(f).padStart(4, '0')}.png`);
      await page.screenshot({ path: file, clip });
      shots.push({ f, file, label, mg: r.s.mg, up: r.s.up, at: r.s.at });
    }
  };
  for (const s of spec.steps) {
    if (s.orbit) { await kit('orbit', s.orbit[0], s.orbit[1]); continue; }
    if (s.press) { await page.keyboard.press(s.press); continue; }
    const keys = new Set(s.keys ?? []);
    for (const k of held) if (!keys.has(k)) await page.keyboard.up(k);
    for (const k of keys) if (!held.has(k)) await page.keyboard.down(k);
    held = keys;
    let drag = null;
    if (s.swing) {
      const d = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[s.swing];
      await page.mouse.move(640, 360); await page.mouse.down({ button: 'right' });
      drag = d;
    }
    for (let i = 0; i < (s.frames ?? 1); i++) {
      if (drag && i < 8) await page.mouse.move(640 + drag[0] * 12 * (i + 1), 360 + drag[1] * 12 * (i + 1));
      if (drag && i === 8) await page.mouse.up({ button: 'right' });
      if (s.turn || s.weave) {
        yaw = s.weave ? yaw0 + s.weave[0] * Math.sin((2 * Math.PI * f) / (60 * s.weave[1])) : yaw + s.turn / 60;
        await page.evaluate((y) => window.__look?.(y, 0), yaw);
      }
      await step(1); f++;
      await record(s.label ?? null);
    }
    if (drag && (s.frames ?? 1) <= 8) await page.mouse.up({ button: 'right' });
  }
  for (const k of held) await page.keyboard.up(k);
  writeFileSync(join(out, `${spec.name}.frames.json`), JSON.stringify(frames));
  return { frames, shots };
}

const D = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0);
/** A body-frame point ([right, up, forward] metres from the feet) in the world, for a body at `pos` facing `yaw`. */
const world = (p, pos, yaw) => [pos[0] + p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw), pos[1] + p[1], pos[2] - p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw)];

/** THE READING of a recorded scenario. */
export function metrics(frames) {
  const pops = [];
  const watch = ['bip01 l foot', 'bip01 r foot', 'bip01 l hand', 'bip01 r hand', 'weapon bone', 'shield bone', 'bip01 pelvis', 'bip01 head'];
  for (let i = 2; i < frames.length - 1; i++) {
    for (const n of watch) {
      const d = D(frames[i].b?.[n], frames[i - 1].b?.[n]);
      const nb = Math.max(D(frames[i - 1].b?.[n], frames[i - 2].b?.[n]), D(frames[i + 1].b?.[n], frames[i].b?.[n]));
      if (d > 0.06 && d > 2.5 * nb) pops.push({ f: frames[i].f, bone: n, cm: Math.round(d * 100), was: `${frames[i - 1].mg ?? 'stand'}/${frames[i - 1].up}`, now: `${frames[i].mg ?? 'stand'}/${frames[i].up}` });
    }
  }
  // the planted foot: the lower of the two while it is within 4 cm of the lowest it gets; its slide is its world travel
  let slide = 0, planted = 0;
  const lowest = Math.min(...frames.map((x) => Math.min(x.b?.['bip01 l foot']?.[1] ?? 9, x.b?.['bip01 r foot']?.[1] ?? 9)));
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i], p = frames[i - 1];
    if (!a.pos || !p.pos || !a.b || !p.b) continue;
    if (Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) > 2) continue;   // the world's origin moved (a rebase of a map pixel), not the body
    for (const s of ['l', 'r']) {
      const n = `bip01 ${s} foot`, o = `bip01 ${s === 'l' ? 'r' : 'l'} foot`;
      if (!(a.b[n] && p.b[n] && a.b[o])) continue;
      if (a.b[n][1] > a.b[o][1] || a.b[n][1] > lowest + 0.04 || p.b[n][1] > lowest + 0.04) continue;
      const wa = world(a.b[n], a.pos, a.yaw ?? YAW), wp = world(p.b[n], p.pos, p.yaw ?? YAW);
      slide += Math.hypot(wa[0] - wp[0], wa[2] - wp[2]); planted++;
    }
  }
  let travel = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i].pos, p = frames[i - 1].pos;
    if (!a || !p) continue;
    const d = Math.hypot(a[0] - p[0], a[2] - p[2]);
    if (d <= 2) travel += d;   // a rebase's jump is no travel
  }
  const groups = {}; for (const x of frames) { const k = x.mg ?? (x.jg ? 'jump' : 'stand'); groups[k] = (groups[k] ?? 0) + 1; }
  const rates = {}; for (const x of frames) if (x.mg) (rates[x.mg] ??= new Set()).add(Math.round((x.mr ?? 0) * 100) / 100);
  const ms = frames.map((x) => x.ms ?? 0).sort((x, y) => x - y);
  // A RUN THAT DID NOT HAPPEN says so: a body falling most of the run, or one that never moved while it was told to
  const falling = frames.filter((x) => x.jg).length / Math.max(1, frames.length);
  const told = frames.some((x) => x.mg);
  const invalid = falling > 0.4 ? `in the air ${Math.round(falling * 100)}% of the run` : !told && frames.length > 0 && frames[0].label === 'move' ? 'never moved' : null;
  return {
    invalid,
    frameMs: { median: ms[ms.length >> 1] ?? null, p95: ms[Math.floor(ms.length * 0.95)] ?? null },
    frames: frames.length, travelM: +travel.toFixed(2),
    pops: pops.length, worstPops: pops.sort((a, b) => b.cm - a.cm).slice(0, 8),
    footSlideCmPerPlantedFrame: planted ? +((slide / planted) * 100).toFixed(2) : null,
    groups, rates: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, [...v].sort((a, b) => a - b)])),
  };
}

/** A contact sheet of a scenario's pictures, laid out by the browser and written as one PNG. */
export async function sheet(context, shots, file, title, cols = 8) {
  const { readFileSync } = await import('node:fs');
  const p = await context.newPage();
  const cells = shots.map((s) => `<figure><img src="data:image/png;base64,${readFileSync(s.file).toString('base64')}"><figcaption>${s.f} ${s.mg ?? 'stand'} ${s.up ?? ''} ${s.at ?? ''}</figcaption></figure>`).join('');
  await p.setContent(`<html><body style="margin:0;background:#111;color:#ddd;font:11px monospace"><div style="padding:4px;font-size:14px">${title}</div><div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:2px">${cells}</div><style>figure{margin:0}img{width:100%;display:block;image-rendering:pixelated}figcaption{padding:1px 3px}</style></body></html>`);
  const width = cols * 240;
  await p.setViewportSize({ width, height: 400 });
  await p.screenshot({ path: file, fullPage: true });
  await p.close();
  return file;
}
