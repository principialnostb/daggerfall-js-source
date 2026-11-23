import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scenario, generateSuite, generateDrills, library, matrixPlan, LOADOUTS, REFERENCE_LOADOUT, SIGNATURE_SET } from '../../tools/provingGround/lab/model.mjs';
import { pops, footwork, blows, stance, clearance, report, compare, signature, coherence, diverge, meshSignals, toWorld } from '../../tools/provingGround/lab/measure.mjs';
import { createLabDriver } from '../../tools/provingGround/lab/driver.mjs';
import { assembleFirstPersonArm, poseAssembly } from '../../src/formats/morrowind/mwFirstPerson.js';
import { skinLayout, writeSkinPalette, skinnedVertex } from '../../src/formats/morrowind/mwGpuSkin.js';

// A standing body in its own frame ([right, up, forward], metres), every bone the readings name.
const body = (over = {}) => ({
  'bip01 pelvis': [0, 0.95, 0], 'bip01 spine2': [0, 1.3, 0.02], 'bip01 head': [0, 1.6, 0.03],
  'bip01 l thigh': [-0.1, 0.9, 0], 'bip01 r thigh': [0.1, 0.9, 0], 'bip01 l calf': [-0.1, 0.5, 0.03], 'bip01 r calf': [0.1, 0.5, 0.03],
  'bip01 l foot': [-0.1, 0.08, 0], 'bip01 r foot': [0.1, 0.08, 0], 'bip01 l upperarm': [-0.2, 1.4, 0], 'bip01 r upperarm': [0.2, 1.4, 0],
  'bip01 l forearm': [-0.3, 1.15, 0.05], 'bip01 r forearm': [0.3, 1.15, 0.05], 'bip01 l hand': [-0.32, 0.9, 0.1], 'bip01 r hand': [0.32, 0.9, 0.1],
  'weapon bone': [0.32, 0.9, 0.12], 'shield bone': null, ...over,
});
const frame = (f, over = {}, state = {}) => ({ f, b: body(over), pos: [0, 0, 0], yaw: 0, mg: null, up: 'WeaponEquipped', cls: 'two', ...state });

test('LAB2 feet: a planted foot that stays where the world holds it is no slide; one the body drags is found with its frames', () => {
  const walk = (slides) => Array.from({ length: 40 }, (_, i) => frame(i + 1, {
    'bip01 l foot': [-0.1, 0.08, slides ? 0.1 : 0.4 - i * 0.02],   // planted: it falls behind as the body travels
    'bip01 r foot': [0.1, 0.2, 0.1],
  }, { mg: 'walkforward', pos: [0, 0, i * 0.02] }));
  const held = footwork(walk(false)), dragged = footwork(walk(true));
  assert.equal(held.status, 'measured');
  assert.ok(held.slideCmPerPlantedFrame < 0.01, `a held foot slid ${held.slideCmPerPlantedFrame}`);
  assert.deepEqual(held.findings, []);
  assert.ok(Math.abs(dragged.slideCmPerPlantedFrame - 2) < 0.01);
  assert.equal(dragged.findings[0].kind, 'foot-slide');
  assert.equal(dragged.findings[0].bone, 'bip01 l foot');
  assert.equal(held.by, 'ankles');
  assert.equal(footwork([frame(1), frame(2)]).status, 'unmeasured', 'two frames are no reading, never a pass');
  // THE SOLES: a foot that rolls from its heel to its ball turns about a point that stays - no slide - while its ankle
  // swings low over the ground the whole time and would have been read as one
  const sole = (slides) => Array.from({ length: 40 }, (_, i) => {
    const z = slides ? 0.1 : 0.4 - i * 0.02, heelUp = i < 20 ? 0 : (i - 20) * 0.004;
    return frame(i + 1, { 'bip01 l foot': [-0.1, 0.07, z - 0.05], 'l heel': [-0.1, heelUp, z - 0.08], 'l ball': [-0.1, 0, z + 0.1],
      'bip01 r foot': [0.1, 0.06, 0.1 + i * 0.02], 'r heel': [0.1, 0.05, 0.05 + i * 0.02], 'r ball': [0.1, 0.06, 0.2 + i * 0.02] }, { mg: 'walkforward', pos: [0, 0, i * 0.02] });
  });
  const rolled = footwork(sole(false)), skated = footwork(sole(true));
  assert.deepEqual([rolled.by, rolled.findings.length, rolled.plants], ['soles', 0, 1], 'the swinging right foot, low as its ankle is, is no plant');
  assert.ok(rolled.slideCmPerPlantedFrame < 0.01);
  assert.equal(skated.findings[0].kind, 'foot-slide');
  assert.ok(Math.abs(skated.slideCmPerPlantedFrame - 2) < 0.01);
  assert.deepEqual(toWorld([1, 0, 0], [0, 0, 0], Math.PI / 2).map((v) => +v.toFixed(6)), [0, 0, -1], 'the body\'s right, facing +x, is the world\'s -z');
});

test('LAB2 leaps: a snap is told from a fast motion by the frames beside it, and names what changed under it', () => {
  const smooth = Array.from({ length: 12 }, (_, i) => frame(i + 1, { 'bip01 r hand': [0.3, 0.9, i * 0.09] }));
  assert.deepEqual(pops(smooth), [], 'nine centimetres every frame is a fast hand');
  const snap = Array.from({ length: 12 }, (_, i) => frame(i + 1, { 'bip01 r hand': [0.3, 0.9, i < 6 ? 0 : 0.3] }, { mg: i < 6 ? 'walkforward' : 'runforward' }));
  const found = pops(snap);
  assert.equal(found.length, 1);
  assert.deepEqual([found[0].frame, found[0].bone, found[0].cm, found[0].cause], [7, 'bip01 r hand', 30, 'movement clip changed']);
});

// A blow: 10 frames of a slow wind-up, 4 of the strike, 16 of recovery, the game's hit on the strike's second frame.
function blowFrames({ sharp = true, pelvis = 0.95 } = {}) {
  const out = [];
  let z = 0;
  for (let i = 0; i < 50; i++) {
    const inBlow = i >= 10 && i < 40, k = i - 10;
    if (inBlow) z += !sharp ? 0.03 : k < 10 ? 0.004 : k < 14 ? 0.12 : 0.006;
    const up = !inBlow ? 'WeaponEquipped' : k < 10 ? 'AttackWindUp' : k < 14 ? 'AttackRelease' : 'AttackEnd';
    out.push(frame(i + 1, { 'weapon bone': [0.3, 1.1, z], 'bip01 r hand': [0.3, 1.1, z * 0.9], 'bip01 pelvis': [0, pelvis, inBlow ? Math.min(0.08, k * 0.004) : 0] },
      { up, at: inBlow ? 'chop' : null, blow: inBlow ? { clock: k / 60, hitAt: 11 / 60, seconds: 0.5 } : null }));
  }
  return out;
}

test('LAB2 blows: the game\'s phases and hit time beside the hand\'s own speed - slow, sharp, slow is told from one speed', () => {
  const [sharp] = blows(blowFrames()), [flat] = blows(blowFrames({ sharp: false }));
  assert.deepEqual([sharp.frames, sharp.type, sharp.hand], [30, 'chop', 'weapon bone']);
  assert.deepEqual(sharp.game, { windUp: 10, release: 4, end: 16, hitFrame: 22 });
  assert.deepEqual([sharp.windUpFrames, sharp.strikeFrames, sharp.recoveryFrames], [10, 4, 16]);
  assert.ok(sharp.sharpness > 4 && flat.sharpness < 1.2, `${sharp.sharpness} against ${flat.sharpness}`);
  assert.ok(Math.abs(sharp.hitOffsetFrames) <= 1, 'the hit lands on the strike');
  assert.ok(sharp.hipTravelCm >= 7.9 && sharp.hipTravelCm <= 8.1);
  assert.deepEqual(blows([frame(1), frame(2)]), []);
  // a series: the second blow's wind-up follows the first one's end with no frame out of the attack - two blows
  const first = blowFrames().slice(10, 40), second = blowFrames().slice(10, 40).map((f) => ({ ...f, f: f.f + 30 }));
  assert.deepEqual(blows([...first, ...second]).map((b) => [b.from, b.frames]), [[11, 30], [41, 30]]);
});

test('LAB2 one fighter: a signature is the body\'s own numbers, and a lower stance or a flat blow stands apart from the reference', () => {
  const idle = (pelvis) => Array.from({ length: 20 }, (_, i) => frame(i + 1, { 'bip01 pelvis': [0, pelvis, 0] }));
  const reference = signature([report(idle(0.95)), report(blowFrames())]);
  assert.equal(reference.stand.pelvisM, 0.95);
  assert.ok(Math.abs(reference.blow.windUpShare - 10 / 30) < 1e-3);
  const same = coherence(signature([report(idle(0.96)), report(blowFrames())]), reference);
  assert.deepEqual(same.apart, []);
  const other = coherence(signature([report(idle(0.85)), report(blowFrames({ sharp: false }))]), reference);
  assert.ok(other.apart.includes('stand.pelvisM') && other.apart.includes('blow.sharpness'), other.apart.join());
  assert.ok(other.distance > same.distance);
  assert.equal(coherence({}, reference).distance, null, 'nothing shared was measured: no distance, never zero');
  assert.equal(Object.keys(stance(idle(0.95)))[0], 'two/stand');
});

test('LAB2 it was so - it became so: a metric is better only where lower is better, the same inside its slack', () => {
  const c = compare({ pops: 4, footSlideCm: 1, blowSharpness: 2, frames: 100, meshWorstStretch: null }, { pops: 1, footSlideCm: 1.02, blowSharpness: 3, frames: 100, meshWorstStretch: 2.1 });
  const verdict = Object.fromEntries(c.rows.map((r) => [r.metric, r.verdict]));
  assert.deepEqual(verdict, { pops: 'better', footSlideCm: 'same', blowSharpness: 'changed', frames: 'same', meshWorstStretch: 'unmeasured' });
  assert.deepEqual(compare({ pops: 1 }, { pops: 3 }).worse, ['pops']);
});

test('LAB2 the same run twice: the first frame two records part at, and a shorter record is no repeat', () => {
  const a = Array.from({ length: 10 }, (_, i) => frame(i + 1));
  assert.equal(diverge(a, a).repeats, true);
  const b = a.map((f) => (f.f < 6 ? f : frame(f.f, { 'bip01 head': [0, 1.6, 0.05] })));
  const d = diverge(a, b);
  assert.deepEqual([d.repeats, d.firstFrame, d.worstBone, d.worstMm], [false, 6, 'bip01 head', 20]);
  assert.equal(diverge(a, a.slice(0, 5)).repeats, false);
  assert.equal(diverge([{ f: 1, b: null }], [{ f: 1, b: null }]).status, 'unmeasured');
});

test('LAB2 limbs and meshes: an elbow inside the trunk is found; a piece is held to its own run, and a layer through a layer is named', () => {
  const inside = clearance([frame(1, { 'bip01 l forearm': [0, 1.1, 0.02] })]);
  assert.deepEqual([inside.insideFrames, inside.findings[0].bone], [1, 'bip01 l forearm']);
  assert.equal(clearance([frame(1)]).insideFrames, 0);
  const sample = (f, stretchOf) => ({ frame: f, status: 'measured', pieces: [{ slot: 'chest', maxStretch: stretchOf, minStretch: 0.7, stretched: 3, crushed: 0, worstBone: 'Bip01 L Thigh' }], pokes: f === 30 ? [{ kind: 'poke', inner: 'chest', outer: 'cuirass', vertices: 9, cm: 2.4 }] : [] });
  const read = meshSignals([sample(10, 1.9), sample(20, 1.95), sample(30, 3.4), sample(40, 1.9)]);
  assert.deepEqual(read.findings.map((x) => [x.frame, x.kind, x.bone]), [[30, 'mesh-stretch', 'chest'], [30, 'mesh-poke', 'chest > cuirass']], 'a joint\'s usual stretch is not a signal; the spike is');
  // a slot's two pieces are each held to their own run, and what stands in every sample is said once, as always there
  const two = (f) => ({ frame: f, status: 'measured', pieces: [{ slot: 'body', key: 'body#0', maxStretch: 4.4, minStretch: 0.8 }, { slot: 'body', key: 'body#1', maxStretch: 1.05, minStretch: 0.9 }], pokes: [{ kind: 'poke', inner: 'body', outer: 'cuirass', vertices: 4, cm: 3 }] });
  const steady = report([frame(10), frame(11), frame(12)], { geometry: [two(10), two(25), two(40)] });
  assert.deepEqual(steady.findings.map((x) => [x.kind, x.count, x.always]), [['mesh-poke', 3, true]]);
  assert.equal(read.pieces.chest.worstStretch, 3.4);
  assert.equal(meshSignals([]).status, 'unmeasured');
  const whole = report([frame(1), frame(2), frame(3)], { geometry: [sample(2, 4)] });
  assert.deepEqual([whole.summary.meshSamples, whole.summary.meshWorstStretch, whole.summary.meshPokeWorstCm], [1, 4, 0]);
  assert.equal(report([frame(1)], { geometry: [{ frame: 1, status: 'unmeasured' }] }).summary.meshWorstStretch, null, 'an unmeasured mesh is no number');
});

test('LAB2 scenarios: loadouts are worn whole by name, drills and the matrix are bounded scenarios, a hold belongs to a swing', () => {
  assert.equal(Object.keys(LOADOUTS).length, 20);   // Exercise all reference carries and outfits, including the cloak over steel.
  assert.ok(Object.hasOwn(LOADOUTS, REFERENCE_LOADOUT));
  assert.deepEqual(LOADOUTS['shield-bare'], ['Longsword', 'Kite Shield']);
  const drills = generateDrills(), all = library();
  assert.equal(all.length, generateSuite().length + drills.length);
  assert.equal(new Set(all.map((s) => s.name)).size, all.length);
  for (const spec of drills) assert.deepEqual(scenario(JSON.parse(JSON.stringify(spec))), spec);
  assert.ok(drills.find((s) => s.name === 'held-blow').steps.some((s) => s.hold));
  for (const name of SIGNATURE_SET) assert.ok(all.some((s) => s.name === name), name);
  const plan = matrixPlan({ loadouts: ['fists-bare', REFERENCE_LOADOUT], geometry: 15 });
  assert.equal(plan.length, 2 * SIGNATURE_SET.length);
  assert.deepEqual([plan[0].name, plan[0].loadout, plan[0].seed, plan[0].geometry], ['guard-idle__fists-bare', 'fists-bare', 1, 15]);
  const base = { version: 1, name: 'x', steps: [{ frames: 10 }] };
  assert.equal(drills.find((s) => s.name === 'held-series').swingMode, 2, 'a held series is the rolled swing; every other scenario is the drag\'s own');
  for (const bad of [{ swingMode: 3 }, { body: 'beast' }, { loadout: 'nothing' }, { seed: -1 }, { seed: 1.5 }, { geometry: 601 }, { steps: [{ frames: 10, hold: true }] }]) assert.throws(() => scenario({ ...base, ...bad }));
  assert.throws(() => matrixPlan({ loadouts: ['nothing'] }));
  assert.throws(() => matrixPlan({ scenarios: ['nothing'] }));
  assert.equal(scenario(base).loadout, undefined, 'an old scenario keeps its shape');
});

test('LAB2 the dice: a seed replays the same draws, and the wall\'s own dice come back', () => {
  const window = { requestAnimationFrame: () => 0, cancelAnimationFrame: () => {} };
  const sandbox = { window, performance: { now: () => 0 }, Date: { now: () => 0 }, Element: function Element() {}, Document: function Document() {}, Math: Object.create(Math), console };
  const wall = sandbox.Math.random = () => 0.123;
  vm.runInNewContext(readFileSync(new URL('../../tools/provingGround/clock.js', import.meta.url), 'utf8'), sandbox);
  const draw = (n) => { window.__pg.seed(n); return [sandbox.Math.random(), sandbox.Math.random(), sandbox.Math.random()]; };
  const first = draw(7);
  assert.deepEqual(draw(7), first);
  assert.notDeepEqual(draw(8), first);
  assert.ok(first.every((v) => v >= 0 && v < 1));
  assert.equal(window.__pg.draws(), 3);
  window.__pg.seed(null);
  assert.equal(sandbox.Math.random, wall);
});

test('LAB2 driver: a loadout is worn before the dice are seeded, a blow\'s own frames are kept as pictures, a held blow keeps its button, baselines compare', async () => {
  const out = mkdtempSync(join(tmpdir(), 'dfo-lab2-'));
  const calls = [], mouseAt = [];
  let ticks = 0, mouseHeld = false, recording = false;
  const upAt = (t) => (t >= 3 && t <= 5 ? 'AttackWindUp' : t >= 6 && t <= 8 ? 'AttackRelease' : 'WeaponEquipped');
  const page = { on() {}, off() {},
    keyboard: { async down() {}, async up() {}, async press() {} },
    mouse: { async down() { mouseHeld = true; }, async up() { mouseHeld = false; }, async move() {} },
    async evaluate(fn, arg) {
      if (typeof arg === 'number') { calls.push(['seed', arg]); return 0; }
      const t = recording ? ticks : 0;
      return { s: { mg: null, up: upAt(t), at: 'chop', cls: 'two' }, b: { 'weapon bone': [0, 1, t / 100] }, foes: [], sources: {}, clip: {}, blow: /^Attack/.test(upAt(t)) ? { clock: (t - 3) / 60, hitAt: 3 / 60, seconds: 0.1 } : null };
    },
    async screenshot() { return new Uint8Array([1]); } };
  const lab = async (name, ...args) => {
    calls.push([name, ...args]);
    if (name === 'outfit') return args[0].map((want) => ({ want, found: want }));
    if (name === 'geometry') return { status: 'measured', pieces: [{ slot: 'chest', maxStretch: 1.5, minStretch: 0.8, stretched: 0, crushed: 0 }], pokes: [] };
    if (name === 'tweak') return { layers: args[0] ?? [], applied: 0 };
    return name === 'rig' ? { status: 'measured', slots: [] } : true;
  };
  let stills = 0;
  const driver = createLabDriver({ page, out, revision: 'test', kit: async () => true, lab, still: async () => { stills++; },
    step: async (n) => { if (recording) ticks += n; if (n === 1) mouseAt.push(mouseHeld); } });
  try {
    const spec = { version: 1, name: 'held', loadout: 'twohand-bare', seed: 9, geometry: 4, steps: [{ frames: 12, swing: 'down', hold: true }, { frames: 4 }] };
    await driver.command('load', { scenario: spec });
    const order = calls.map((c) => c[0]);
    assert.deepEqual(calls.find((c) => c[0] === 'outfit')[1], ['Claymore']);
    assert.ok(order.indexOf('outfit') < order.indexOf('seed') && order.indexOf('seed') < order.indexOf('watch'), order.join());
    assert.deepEqual(calls.find((c) => c[0] === 'seed'), ['seed', 9]);
    recording = true; mouseAt.length = 0;
    const done = await driver.command('run');
    assert.deepEqual(mouseAt, [...Array(11).fill(true), false, false, false, false, false], 'a held blow keeps its button to the step\'s last frame');
    assert.deepEqual(done.run.shots.filter((s) => s.tag).map((s) => [s.frame, s.tag]), [[3, 'blow-start'], [6, 'blow-hit'], [9, 'blow-end']]);
    assert.equal(done.run.blows.length, 1);
    assert.equal(done.run.summary.meshSamples, 4);
    assert.equal(done.run.summary.meshWorstStretch, 1.5);
    assert.deepEqual(done.run.coverage, []);
    assert.ok(existsSync(join(out, done.run.shots[1].file)) && driver.shot(done.run.shots[1].file));
    assert.equal(driver.shot('../outside.png'), null);
    assert.equal((await driver.command('baseline', {})).status, 'unmeasured');
    await driver.command('baseline', { save: true });
    const checked = await driver.command('baseline', {});
    assert.deepEqual([checked.status, checked.worse, checked.divergence.repeats], ['measured', [], true]);
    assert.deepEqual(await driver.command('baseline', { list: true }), ['held']);
    await assert.rejects(driver.command('baseline', { save: true, label: '../x' }), /Invalid baseline name/);
    await assert.rejects(driver.command('compare', { a: '../x', b: 'y' }), /Invalid run id/);
    const views = await driver.command('views');
    assert.equal(views.shots.length, 4);
    assert.ok(stills >= 5, 'views draw still frames, never the scenario\'s own');
    assert.equal((await driver.command('status')).frame, 16);
    const tweak = await driver.command('tweak', { layers: [{ name: 'lean', bones: { 'bip01 spine1': { rot: [8, 0, 0] } } }] });
    assert.equal(tweak.layers[0].name, 'lean');
    assert.equal((await driver.command('plan', { loadouts: ['fists-bare'] })).length, SIGNATURE_SET.length);
    await assert.rejects(driver.command('load', { scenario: { ...spec, loadout: 'nothing' } }), /Unknown loadout/);
  } finally { await driver.close(); rmSync(out, { recursive: true, force: true }); }
});

test('LAB2 the pose seam: off it costs nothing; on, a bone\'s edit and a piece\'s fit land the same on the CPU skin and the palette', async () => {
  const bytes = (name) => new Uint8Array(readFileSync(new URL(`../fixtures/mw/${name}`, import.meta.url)));
  const arm = await assembleFirstPersonArm({ skeletonBytes: bytes('armskel.nif'), parts: [{ slot: 'hand', bytes: bytes('armhand.nif') }] });
  assert.ok(arm.ok, arm.error);
  const piece = arm.pieces.find((p) => p.kind === 'skinned');
  assert.equal(globalThis.__mwPoseAssemblyEdit, undefined);
  poseAssembly(arm, { time: 0, skin: true });
  const plain = Float32Array.from(piece.positions), plainMats = arm.mats;
  const ref = piece.batch.skin.bones.find((b) => b.ref != null).ref;
  const fit = { a: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]), t: [3, -2, 5] };
  try {
    globalThis.__mwPoseAssemblyEdit = (assembly, pose) => {
      const local = pose.get(ref) ?? assembly.skeleton.nodes.get(ref).rest;
      pose.set(ref, { ...local, translation: [local.translation[0] + 1, local.translation[1], local.translation[2]] });
      for (const p of assembly.pieces) p.labFit = p === piece ? fit : null;
    };
    poseAssembly(arm, { time: 0, skin: true });
    assert.notDeepEqual(arm.mats.get(ref).t, plainMats.get(ref).t, 'the edit is in the matrices');
    const cpu = Float32Array.from(piece.positions);
    assert.ok(cpu.some((v, i) => Math.abs(v - plain[i]) > 0.5), 'the fit moved the piece');
    poseAssembly(arm, { time: 0, skin: false });
    const layout = skinLayout(arm.pieces);
    assert.ok(layout.ok !== false, layout.reason);
    writeSkinPalette(layout, arm);
    for (const v of [0, 1, Math.floor(cpu.length / 6), cpu.length / 3 - 1]) {
      const gpu = skinnedVertex(layout, piece, v);
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(gpu[k] - cpu[v * 3 + k]) < 1e-3, `vertex ${v} axis ${k}: ${gpu[k]} against ${cpu[v * 3 + k]}`);
    }
  } finally { delete globalThis.__mwPoseAssemblyEdit; for (const p of arm.pieces) delete p.labFit; }
  poseAssembly(arm, { time: 0, skin: true });
  assert.deepEqual(Float32Array.from(piece.positions), plain, 'with the tool gone the pose is the game\'s own');
});
