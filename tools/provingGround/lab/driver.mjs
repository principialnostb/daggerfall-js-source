import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as MODEL from './model.mjs';
import * as MEASURE from './measure.mjs';

const SAFE = /^[a-z0-9][a-z0-9_.-]{0,95}$/i;

/** Single owner of the Playwright page. Both the UI and agents use command(), never competing frame loops. */
export function createLabDriver({ page, step, kit, lab = null, still = null, out, revision = 'unknown', modules = null }) {
  // A reload hands the driver the scenario and reading modules as they stand on disk now (server.mjs reload)
  const { scenario, generateSuite, generateDrills, library, matrixPlan, analyze, VERSION, LOADOUTS, REFERENCE_LOADOUT, SIGNATURE_SET } = modules?.model ?? MODEL;
  const { report, compare, diverge, signature, coherence, attacking } = modules?.measure ?? MEASURE;
  mkdirSync(out, { recursive: true });
  const body = lab ?? (async () => null);   // The body's own doors (labKit.js); absent, every mesh reading is unmeasured
  let tail = Promise.resolve(), run = null, cursor = 0, held = new Set(), yaw = 0, mouse = false, centreAt = -1, swingWas = null;
  // THE DICE, FRAME BY FRAME: each frame's seed is the scenario's and the frame's own, so the world's stray draws in
  // one frame (snow, a far creature) do not shift the rolls of the next
  const diceOf = (seed, k) => (Math.imul(seed + 1, 0x9E3779B1) + Math.imul(k + 1, 0x85EBCA6B)) >>> 0;
  // The swing is read off the mouse's travel, and a jump back to the middle is travel too: the mouse goes home well
  // clear of a press, never beside one
  const centre = async () => { await body('quiet', true); await page.mouse.move(640, 360); await body('quiet', false); };
  /** `n` frames with `dice` laid before them. */
  const rolled = async (n, dice) => { await page.evaluate((seed) => window.__pg?.seed?.(seed), dice); await step(n); };
  let image = null, cached = null;
  const events = [];
  const log = (kind, detail) => { events.push({ frame: run?.frames.length ?? 0, kind, detail: String(detail).slice(0, 2000) }); if (events.length > 2000) events.shift(); };
  const onError = (error) => log('pageerror', error.message);
  const onConsole = (message) => {
    if (['error', 'warning'].includes(message.type()) || message.text().startsWith('[Morrowind animation diagnostic]')) log(message.type(), message.text());
  };
  page.on('pageerror', onError); page.on('console', onConsole);
  /** The run's whole reading, made once a length: the panel asks often. */
  const reading = () => {
    if (!run) return null;
    const key = `${run.id}:${run.frames.length}:${run.geometry.length}`;
    if (cached?.key !== key) cached = { key, value: report(run.frames, { geometry: run.geometry }) };
    return cached.value;
  };
  const save = () => {
    if (!run) return;
    writeFileSync(join(out, `${run.id}.json`), JSON.stringify({ ...run, events, analysis: analyze(run.frames), report: reading(), coverage: coverage() }));
  };
  const coverage = () => {
    if (!run) return null;
    const findings = [];
    if (run.scenario.steps.some((s) => s.swing) && !run.frames.some(attacking)) findings.push('Requested attack has not been observed in the recorded frames');
    if (run.scenario.steps.some((s) => s.keys.some((k) => ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(k))) && !run.frames.some((f) => f.mg)) findings.push('Requested locomotion has not been observed in the recorded frames');
    if (run.scenario.loadout && run.worn?.some((w) => !w.found)) findings.push('The loadout was not worn whole');
    if (run.aligned === false && run.frames.some((f) => Number.isFinite(f.clip?.time))) findings.push('The start was not aligned to the idle clip\'s loop: two runs may leave from different poses');
    if (run.scenario.geometry && !run.geometry.some((g) => g.status === 'measured')) findings.push('The meshes were asked for and never measured');
    return findings;
  };
  const release = async () => {
    for (const key of held) await page.keyboard.up(key);
    held.clear(); mouse = false;
    await page.mouse.up({ button: 'right' });
  };
  const observe = () => page.evaluate(async () => {
    const { fpArm } = await import('/src/combat/fpArm.js');
    const s = fpArm.status();
    const found = window.__labKit ? await window.__labKit.sync() : null;
    // the pose just made where the body is in hand (labKit.js bones), else the pose the game last drew
    const made = found ? await window.__labKit.bones() : null;
    return { s: await window.__pgKit.state(), b: made ?? await window.__pgKit.bones(), bonesOf: made ? 'pose' : 'drawn', foes: await window.__pgKit.foes(),
      sources: { movement: s.movementSource, idle: s.idleSource, action: s.actionSource, jump: s.jumpSource },
      clip: { time: s.time, group: s.posedGroup, upper: s.upperName, hit: s.hit, death: s.death, layers: (globalThis.__armTrace ??= { on: true }).clip ? { la: globalThis.__armTrace.clip.la, ub: globalThis.__armTrace.clip.ub, blendW: globalThis.__armTrace.clip.blendW } : null },   // The arm layers' clips and weights
      blow: s.blow ? { clock: s.blow.clock, hitAt: s.blow.hitAt, seconds: s.blow.seconds } : null, legs: s.motion?.legs ?? null, body: found,
      skeleton: s.skeletonPath, groups: s.groups, sourcePaths: s.sources };
  });
  /** The picture of THIS frame's pose: the game draws a pose a frame after it is made, so one still frame is drawn first. */
  const picture = async () => { if (still) await still(); image = await page.screenshot({ type: 'png' }); return image; };
  // A named picture is of the BODY: the follow camera holds it in one place of the 1280x960 frame, so the same window
  // is cut from every one and two of them lie on each other. The frame's own picture stays whole.
  const BODY = { x: 300, y: 180, width: 680, height: 760 };
  const photograph = async (frame, tag = null) => {
    await picture();
    if (run.shots.some((s) => s.frame === frame && s.tag === tag)) return;
    const file = `${run.id}-${String(frame).padStart(5, '0')}${tag ? `-${tag}` : ''}.png`;
    writeFileSync(join(out, file), tag ? await page.screenshot({ type: 'png', clip: BODY }) : image);
    run.shots.push({ frame, file, ...(tag ? { tag } : {}) });
  };
  /** The body in hand before it is read or edited: the watch on, and one still frame drawn if no pose has been seen. */
  const ensureBody = async () => {
    await kit('third');
    await body('watch', true);
    if (!(await body('sync')) && still) { await still(); await body('sync'); }
  };
  /** THE WORLD ADVANCES: home sets the body half a metre up, and a live game lands it. A game that does not (its pause
   *  or a window is up) is refused - it would record a body standing - and no key is pressed into a menu to mend it. */
  const landed = async () => {
    for (let waited = 0; waited < 180; waited += 10) { await step(10); if (!(await kit('state'))?.jg) return; }
    throw new Error('The game does not advance: its pause or a window is up (see /__lab/boot-image). Restart the lab.');
  };
  const measureMesh = async (options) => {
    await ensureBody();
    const g = (await body('geometry', options ?? {})) ?? { status: 'unmeasured', why: 'the lab kit is not laid in' };
    const row = { frame: cursor, ...g };
    if (run) { run.geometry = run.geometry.filter((x) => x.frame !== cursor); run.geometry.push(row); run.geometry.sort((a, b) => a.frame - b.frame); }
    return row;
  };
  async function begin(spec) {
    spec = scenario(spec); // validate BEFORE changing the world
    await release(); save();
    run = null; cursor = 0; image = null; events.length = 0; cached = null;
    await kit('clearFoes'); await kit('home');
    await kit('god', true); await body('rested');   // one fighter every run: whole, and never tired by the run before
    await body('hold', true);   // the pointer as play holds it, so a drag is a swing (labKit.js hold) - held for the session: a lock lost is the player's Escape to the game
    await landed();
    await kit('third');
    // the script's swing is the blow struck (the drag's own direction) unless the scenario asks for the rolled one
    const mode = await body('swingMode', spec.swingMode ?? 0);
    if (swingWas == null && Number.isInteger(mode)) swingWas = mode;
    let worn = null;
    if (spec.body) {
      const built = await body('identity', { female: spec.body === 'female' });
      if (!built || built.female !== (spec.body === 'female')) throw new Error(`The ${spec.body} body was not built: ${JSON.stringify(built)}`);
      await step(120); await kit('third');
    }
    if (spec.loadout) {
      worn = (await body('outfit', LOADOUTS[spec.loadout])) ?? [];
      if (worn.some((item) => !item.found)) throw new Error(`Loadout unavailable: ${JSON.stringify(worn)}`);
      await step(90);   // the rig follows the worn set over its own frames
    }
    if (spec.outfit.length) {
      const equipped = await kit('equip', spec.outfit);
      if (equipped.some((item) => !item.found)) throw new Error(`Outfit unavailable: ${JSON.stringify(equipped)}`);
    }
    if (spec.foe != null && await kit('placeFoe', spec.foe, 4, 0) == null) throw new Error('Foe could not be spawned');
    await step(30);
    const stance = await kit('state');
    if (typeof stance?.sheathed === 'boolean' && stance.sheathed === spec.drawn) { await page.keyboard.press('z'); await step(60); }
    // THE RIG STANDS before anything is asked of it: a body rebuilt or a weapon changed loads its meshes over real time,
    // and a run recorded before it is ready has no bones at all. Refused when it never comes.
    for (let waited = 0; ; waited += 10) {
      const now = await kit('state');
      if (now === true || now?.ready !== false) break;   // (a kit that answers no state has no rig to wait for)
      if (waited >= 1500) throw new Error(`The rig did not become ready: ${JSON.stringify({ weapon: now.weapon, view: now.view })}. See the events for a failed load.`);
      await step(10);
    }
    await kit('third');
    // the draw, the sheathe or a fresh hold played out before anything is recorded: its frames are no part of the run
    for (let waited = 0; waited < 420; waited += 10) { await step(10); if (!/equipping/i.test(String((await kit('state'))?.up ?? ''))) break; }
    await kit('home'); await centre();
    // ONE START. The dice seeded, then the stance stood through to its idle clip's own loop point, so every run
    // of a scenario leaves from the same pose; `aligned` says whether the loop point was found
    const seed = spec.seed ?? 1;
    await page.evaluate((n) => window.__pg?.seed?.(n), seed);
    await body('watch', true);
    const fighter = await body('rested');
    await rolled(45, diceOf(seed, -1));
    let aligned = false;
    for (let waited = 0, last = null; waited < 600; waited++) {
      await rolled(1, diceOf(seed, -1));
      const now = await observe(), time = now.clip?.time;
      if (!Number.isFinite(time)) break;
      if (last != null && time < last - 1e-6 && !now.s?.mg) { aligned = true; break; }
      last = time;
    }
    await rolled(20, diceOf(seed, -2));
    yaw = 0; centreAt = -1;
    run = { version: VERSION, id: `${spec.name}-${randomUUID().slice(0, 8)}`, revision, scenario: spec, seed, worn,
      created: new Date().toISOString(), aligned, fighter, frames: [], shots: [], marks: [], geometry: [],
      reproducibility: 'Input replay from a repositioned player under seeded dice; not a world/AI/physics checkpoint. `repeat` measures how far two runs part.' };
    const initial = await observe();
    run.initial = initial;
    run.rig = await body('rig');
    run.tweak = (await body('tweak'))?.layers ?? [];
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
          if (local === 0) { await page.mouse.move(640, 360); await page.mouse.down({ button: 'right' }); mouse = true; }
          // the drag is the swing's direction only where the game reads one; under a rolled swing it would turn the view
          if (local < 8 && !run.scenario.swingMode) await page.mouse.move(640 + d[0] * 12 * (local + 1), 360 + d[1] * 12 * (local + 1));
          if (local === (s.hold ? s.frames - 1 : 8)) { await page.mouse.up({ button: 'right' }); mouse = false; centreAt = cursor + 6; }
        } else if (mouse) { await page.mouse.up({ button: 'right' }); mouse = false; centreAt = cursor + 6; }
        if (!mouse && cursor === centreAt) await centre();
        if (s.turn) { yaw += s.turn / 60; await kit('look', yaw, 0); }
        await rolled(1, diceOf(run.seed, cursor)); cursor++;
        const frame = await observe(), was = run.frames[run.frames.length - 1];
        const now = { f: cursor, label: s.label, ...frame.s, b: frame.b, yaw, sources: frame.sources, clip: frame.clip, blow: frame.blow, legs: frame.legs, foes: frame.foes };
        run.frames.push(now);
        // A BLOW'S OWN FRAMES kept as pictures - where it starts, where the game lands it, where it ends
        const hit = (f) => !!f?.blow && Number.isFinite(f.blow.clock) && f.blow.clock >= f.blow.hitAt;
        if (attacking(now) && !attacking(was)) await photograph(cursor, 'blow-start');
        else if (attacking(now) && hit(now) && !hit(was)) await photograph(cursor, 'blow-hit');
        else if (!attacking(now) && attacking(was)) await photograph(cursor, 'blow-end');
        else if (cursor % 30 === 0) await photograph(cursor);
        if (run.scenario.geometry && cursor % run.scenario.geometry === 0) await measureMesh();
      }
    } catch (error) { await release(); save(); throw error; }
    // Paused fixed-clock frames retain browser input: releasing between +1 steps would cut every wind-up short.
    if (!actionAt(cursor)) await release();
    save();
    await picture();
    return status();
  }
  async function status() {
    const read = reading();
    return { version: VERSION, revision, frame: cursor, run: run && { id: run.id, scenario: run.scenario, marks: run.marks, shots: run.shots,
      reproducibility: run.reproducibility, analysis: analyze(run.frames), summary: read.summary, findings: read.findings, lanes: read.lanes,
      blows: read.blows, coverage: coverage(), frames: run.frames.length, total: run.scenario.steps.reduce((n, s) => n + s.frames, 0), complete: !actionAt(cursor) },
      current: await observe(), events: events.slice(-40) };
  }
  const stored = (id) => {
    if (!SAFE.test(String(id))) throw new Error('Invalid run id');
    const file = join(out, `${id}.json`);
    if (!existsSync(file)) throw new Error(`No stored run: ${id}`);
    return JSON.parse(readFileSync(file, 'utf8'));
  };
  const readingOf = (id) => { const r = stored(id); return r.report ?? report(r.frames, { geometry: r.geometry ?? [] }); };
  const baselineFile = (label, name) => {
    if (!SAFE.test(label) || !SAFE.test(name)) throw new Error('Invalid baseline name');
    mkdirSync(join(out, 'baselines', label), { recursive: true });
    return join(out, 'baselines', label, `${name}.json`);
  };
  /** A picture of this very frame from another side: the camera swung, one frame drawn with the clock all but still. */
  async function views(angles = { back: 0, side: Math.PI / 2, front: Math.PI, quarter: Math.PI * 0.75 }) {
    if (!run) throw new Error('Load a scenario first');
    if (!still) throw new Error('This lab cannot draw a still frame');
    const before = (await observe()).b, shots = [];
    // a second set of the same frame (an edit tried, then another) is its own pictures, never the first set's again
    const set = (run.viewSets = (run.viewSets ?? 0) + 1), mark = set > 1 ? `-${set}` : '';
    for (const [name, angle] of Object.entries(angles)) {
      await kit('orbit', angle, -0.08);
      await photograph(cursor, `view-${name}${mark}`);
      shots.push(run.shots[run.shots.length - 1]);
    }
    await kit('orbit', 0, 0); await picture();
    const after = (await observe()).b;
    let moved = 0;
    for (const bone of Object.keys(before ?? {})) if (before[bone] && after?.[bone]) moved = Math.max(moved, Math.hypot(...before[bone].map((v, i) => v - after[bone][i])));
    save();
    return { shots, movedMm: +(moved * 1000).toFixed(2), note: moved > 0.002 ? 'The body moved while the views were drawn: the pictures are not one frame.' : 'The body held still.' };
  }
  async function perform(name, args = {}) {
    switch (name) {
      case 'status': return status();
      case 'suite': return generateSuite();
      case 'drills': return generateDrills();
      case 'library': return library();
      case 'loadouts': return { loadouts: LOADOUTS, reference: REFERENCE_LOADOUT, signatureSet: SIGNATURE_SET };
      case 'plan': return matrixPlan({ ...(Array.isArray(args.loadouts) ? { loadouts: args.loadouts } : {}), ...(Array.isArray(args.scenarios) ? { scenarios: args.scenarios } : {}), seed: args.seed ?? 1, geometry: args.geometry ?? 0, body: args.body ?? null });
      case 'load': return begin(args.scenario);
      case 'advance': return advance(args.frames ?? 1);
      case 'run': return advance(3600);
      case 'seek': {
        if (!run) throw new Error('Load a scenario first');
        if (!Number.isInteger(args.frame) || args.frame < 0) throw new Error('Invalid frame');
        const spec = run.scenario;
        await begin(spec);
        return args.frame ? advance(Math.min(3600, args.frame)) : status();
      }
      case 'mark': {
        if (!run) throw new Error('Load a scenario first');
        const note = String(args.note ?? '').trim().slice(0, 1000);
        if (!note) throw new Error('A mark needs a note');
        run.marks.push({ frame: cursor, note }); await photograph(cursor, `mark${run.marks.length}`); save(); return status();
      }
      case 'orbit': {
        if (![args.yaw, args.pitch ?? 0].every(Number.isFinite)) throw new Error('Invalid camera angles');
        await kit('orbit', args.yaw, args.pitch ?? 0);
        if (still) { await picture(); return status(); }
        // A camera change needs a real rendered frame; it is recorded when a run is active.
        if (run && actionAt(cursor)) return advance(1);
        await step(1); image = await page.screenshot({ type: 'png' }); return status();
      }
      case 'views': return views();
      case 'report': {
        if (!run) throw new Error('No run');
        const read = reading();
        return { id: run.id, scenario: run.scenario, ...read, signature: signature(read), coverage: coverage(), rig: run.rig, tweak: run.tweak };
      }
      case 'geometry': { const g = await measureMesh(args.options); save(); return g; }
      case 'fold': return body('foldSpeed', args.times ?? 8);
      case 'diagnose': { await body('watch', true); if (still) await still(); return { ...(await body('diagnose')), mouse: await body('mouse'), swingMode: await body('swingMode') }; }
      case 'rig': await ensureBody(); return body('rig');
      case 'pose': await ensureBody(); return body('pose', Array.isArray(args.bones) ? args.bones.map((b) => String(b).toLowerCase()) : null);
      case 'tweak': {
        await ensureBody();
        const value = await body('tweak', args.layers);
        if (!value) throw new Error('The lab kit is not laid in');
        if (args.layers !== undefined) { writeFileSync(join(out, 'tweak.json'), JSON.stringify(value.layers, null, 2)); if (still) await picture(); }
        return value;
      }
      case 'repeat': {
        if (!run) throw new Error('Load a scenario first');
        const spec = run.scenario;
        await begin(spec); await advance(3600); const first = run.frames, a = run.id, was = run.fighter;
        await begin(spec); await advance(3600);
        return { scenario: spec.name, runs: [a, run.id], fighters: [was, run.fighter], ...diverge(first, run.frames) };
      }
      case 'runs': return readdirSync(out).filter((f) => f.endsWith('.json') && f !== 'tweak.json').map((f) => {
        try { const r = JSON.parse(readFileSync(join(out, f), 'utf8')); return r.frames ? { id: r.id, scenario: r.scenario?.name, loadout: r.scenario?.loadout ?? null, created: r.created, frames: r.frames.length, revision: r.revision } : null; } catch { return null; }
      }).filter(Boolean).sort((x, y) => String(y.created).localeCompare(String(x.created))).slice(0, args.limit ?? 60);
      case 'compare': {
        const a = stored(args.a), b = stored(args.b);
        const ra = a.report ?? report(a.frames, { geometry: a.geometry ?? [] }), rb = b.report ?? report(b.frames, { geometry: b.geometry ?? [] });
        return { a: a.id, b: b.id, sameScenario: JSON.stringify(a.scenario.steps) === JSON.stringify(b.scenario.steps), ...compare(ra.summary, rb.summary), divergence: diverge(a.frames, b.frames) };
      }
      case 'baseline': {
        const label = String(args.label ?? 'accepted');
        if (args.list) { const dir = join(out, 'baselines', SAFE.test(label) ? label : 'accepted'); return existsSync(dir) ? readdirSync(dir).map((f) => f.replace(/\.json$/, '')) : []; }
        if (!run) throw new Error('No run');
        const file = baselineFile(label, run.scenario.name), read = reading();
        if (args.save) { writeFileSync(file, JSON.stringify({ id: run.id, revision, created: run.created, scenario: run.scenario, summary: read.summary, signature: signature(read), frames: run.frames }, null, 1)); return { saved: `${label}/${run.scenario.name}`, summary: read.summary }; }
        if (!existsSync(file)) return { status: 'unmeasured', why: `no baseline ${label}/${run.scenario.name}` };
        const base = JSON.parse(readFileSync(file, 'utf8'));
        return { status: 'measured', baseline: { id: base.id, revision: base.revision, created: base.created }, ...compare(base.summary, read.summary), divergence: diverge(base.frames, run.frames) };
      }
      case 'signature': {
        const ids = Array.isArray(args.runs) && args.runs.length ? args.runs : run ? [run.id] : [];
        if (!ids.length) throw new Error('No run');
        const own = signature(ids.map((id) => (run && id === run.id ? reading() : readingOf(id))));
        if (!Array.isArray(args.reference) || !args.reference.length) return { signature: own };
        const ref = signature(args.reference.map(readingOf));
        return { signature: own, reference: ref, coherence: coherence(own, ref) };
      }
      case 'export': if (!run) throw new Error('No run'); return { ...run, events: [...events], analysis: analyze(run.frames), report: reading(), coverage: coverage() };
      default: throw new Error(`Unknown lab command: ${name}`);
    }
  }
  return {
    command(name, args) { const next = tail.then(() => perform(name, args)); tail = next.catch(() => {}); return next; },
    image: () => image,
    shot(file) { return SAFE.test(String(file)) && String(file).endsWith('.png') && existsSync(join(out, file)) ? readFileSync(join(out, file)) : null; },
    async close() { await tail; await release(); save(); if (swingWas != null) await body('swingMode', swingWas).catch(() => {}); await body('watch', false).catch(() => {}); page.off('pageerror', onError); page.off('console', onConsole); },
  };
}
