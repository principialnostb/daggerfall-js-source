import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { scenario, generateSuite, analyze, VERSION } from './model.mjs';

/** Single owner of the Playwright page. Both the UI and agents use command(), never competing frame loops. */
export function createLabDriver({ page, step, kit, out, revision = 'unknown' }) {
  mkdirSync(out, { recursive: true });
  let tail = Promise.resolve(), run = null, cursor = 0, held = new Set(), yaw = 0;
  let image = null;
  const events = [];
  const log = (kind, detail) => { events.push({ frame: run?.frames.length ?? 0, kind, detail: String(detail).slice(0, 2000) }); if (events.length > 2000) events.shift(); };
  const onError = (error) => log('pageerror', error.message);
  const onConsole = (message) => {
    if (['error', 'warning'].includes(message.type()) || message.text().startsWith('[Morrowind animation diagnostic]')) log(message.type(), message.text());
  };
  page.on('pageerror', onError); page.on('console', onConsole);
  const save = () => {
    if (!run) return;
    writeFileSync(join(out, `${run.id}.json`), JSON.stringify({ ...run, events, analysis: analyze(run.frames), coverage: coverage() }, null, 2));
  };
  const coverage = () => {
    if (!run) return null;
    const findings = [];
    if (run.scenario.steps.some((s) => s.swing) && !run.frames.some((f) => String(f.up ?? '').startsWith('Attack'))) findings.push('Requested attack has not been observed in the recorded frames');
    if (run.scenario.steps.some((s) => s.keys.some((k) => ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(k))) && !run.frames.some((f) => f.mg)) findings.push('Requested locomotion has not been observed in the recorded frames');
    return findings;
  };
  const release = async () => {
    for (const key of held) await page.keyboard.up(key);
    held.clear();
    await page.mouse.up({ button: 'right' });
  };
  const observe = () => page.evaluate(async () => {
    const { fpArm } = await import('/src/combat/fpArm.js');
    const s = fpArm.status();
    return { s: await window.__pgKit.state(), b: await window.__pgKit.bones(), foes: await window.__pgKit.foes(),
      sources: { movement: s.movementSource, idle: s.idleSource, action: s.actionSource, jump: s.jumpSource },
      clip: { time: s.time, group: s.posedGroup, upper: s.upperName, hit: s.hit, death: s.death },
      skeleton: s.skeletonPath, groups: s.groups, sourcePaths: s.sources };
  });
  const photograph = async (frame) => {
    image = await page.screenshot({ type: 'png' });
    const file = `${run.id}-${String(frame).padStart(5, '0')}.png`;
    writeFileSync(join(out, file), image);
    run.shots.push({ frame, file });
  };
  async function begin(spec) {
    spec = scenario(spec); // validate BEFORE changing the world
    await release(); save();
    run = null; cursor = 0; image = null; events.length = 0;
    await kit('clearFoes'); await kit('home');
    await kit('third');
    if (spec.outfit.length) {
      const equipped = await kit('equip', spec.outfit);
      if (equipped.some((item) => !item.found)) throw new Error(`Outfit unavailable: ${JSON.stringify(equipped)}`);
    }
    if (spec.foe != null && await kit('placeFoe', spec.foe, 4, 0) == null) throw new Error('Foe could not be spawned');
    await step(30);
    const body = await kit('state');
    if (typeof body?.sheathed === 'boolean' && body.sheathed === spec.drawn) { await page.keyboard.press('z'); await step(60); }
    yaw = 0;
    run = { version: VERSION, id: `${spec.name}-${randomUUID().slice(0, 8)}`, revision, scenario: spec,
      created: new Date().toISOString(), frames: [], shots: [], marks: [],
      reproducibility: 'Input replay from a repositioned player; not a world/AI/physics checkpoint. Reload for a fresh baseline.' };
    const initial = await observe();
    run.initial = initial;
    await photograph(0); save();
    return status();
  }
  function actionAt(f) {
    let offset = 0;
    for (const s of run.scenario.steps) {
      if (f < offset + s.frames) return { action: s, local: f - offset };
      offset += s.frames;
    }
    return null;
  }
  async function advance(count = 1) {
    if (!run) throw new Error('Load a scenario first');
    if (!Number.isInteger(count) || count < 1 || count > 3600) throw new Error('Expected 1–3600 frames');
    try {
      for (let n = 0; n < count; n++) {
        const next = actionAt(cursor);
        if (!next) break;
        const { action: s, local } = next;
        const keys = new Set(s.keys);
        for (const k of held) if (!keys.has(k)) await page.keyboard.up(k);
        for (const k of keys) if (!held.has(k)) await page.keyboard.down(k);
        held = keys;
        if (s.swing) {
          const d = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[s.swing];
          if (local === 0) { await page.mouse.move(640, 360); await page.mouse.down({ button: 'right' }); }
          if (local < 8) await page.mouse.move(640 + d[0] * 12 * (local + 1), 360 + d[1] * 12 * (local + 1));
          if (local === 8) await page.mouse.up({ button: 'right' });
        }
        if (s.turn) { yaw += s.turn / 60; await kit('look', yaw, 0); }
        await step(1); cursor++;
        const frame = await observe();
        run.frames.push({ f: cursor, label: s.label, ...frame.s, b: frame.b, sources: frame.sources, clip: frame.clip, foes: frame.foes });
        if (cursor % 30 === 0) await photograph(cursor);
      }
    } finally { await release(); save(); }
    image = await page.screenshot({ type: 'png' });
    return status();
  }
  async function status() {
    return { version: VERSION, revision, frame: cursor, run: run && { id: run.id, scenario: run.scenario, marks: run.marks, shots: run.shots,
      reproducibility: run.reproducibility, analysis: analyze(run.frames), coverage: coverage(), complete: !actionAt(cursor) }, current: await observe(), events: events.slice(-40) };
  }
  async function perform(name, args = {}) {
    switch (name) {
      case 'status': return status();
      case 'suite': return generateSuite();
      case 'load': return begin(args.scenario);
      case 'advance': return advance(args.frames ?? 1);
      case 'run': return advance(3600);
      case 'mark': {
        if (!run) throw new Error('Load a scenario first');
        const note = String(args.note ?? '').trim().slice(0, 1000);
        if (!note) throw new Error('A mark needs a note');
        run.marks.push({ frame: cursor, note }); await photograph(cursor); save(); return status();
      }
      case 'orbit': {
        if (![args.yaw, args.pitch ?? 0].every(Number.isFinite)) throw new Error('Invalid camera angles');
        await kit('orbit', args.yaw, args.pitch ?? 0);
        // A camera change needs a real rendered frame; it is recorded when a run is active.
        if (run && actionAt(cursor)) return advance(1);
        await step(1); image = await page.screenshot({ type: 'png' }); return status();
      }
      case 'export': if (!run) throw new Error('No run'); return { ...run, events: [...events], analysis: analyze(run.frames), coverage: coverage() };
      default: throw new Error(`Unknown lab command: ${name}`);
    }
  }
  return {
    command(name, args) { const next = tail.then(() => perform(name, args)); tail = next.catch(() => {}); return next; },
    image: () => image,
    async close() { await tail; await release(); save(); page.off('pageerror', onError); page.off('console', onConsole); },
  };
}
