// MOTION-PROBE (2026-11-06, TRUNK-SKIN / LEG-CLOCK - bible/05-Combat/Motion-Doctrine.md): the real third-person pose
// pipeline offline - MAO's clips on the retail rig, lowerBodyLayer, body motion and the body-weight slot as fpArm.js
// composes them - over every carry (none, one-hander, one-hander and shield, two-hander, a torch or a shield with no
// weapon) by every gait, the gait changes and the blows. Per scenario: how deep each arm's skin stands in Better Bodies'
// own trunk (skinL/skinR, rig units), the hands' fore-and-aft swing and their largest move in a frame (arm lengths), the
// gait's clock against the feet. Run it before and after a motion change and compare - the owner's game is the last word.
//   node tools/motionProbe.mjs <repoRoot> <out.json>
//   PROBE_KIND=female|male  PROBE_ONLY=<regexp over scenario names>  PROBE_DEBUG=1 (the clearance's choices)
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
globalThis.location ??= { search: process.env.PROBE_SEARCH ?? '' };
const root = process.argv[2], out = process.argv[3];
const R = (p) => import(pathToFileURL(`${root}/${p}`).href);
const { parseNif } = await R('src/formats/morrowind/mwNifFile.js');
const { extractTracks, collectTextKeys, normalizeTextKeys, resetClip, sampleTrack, advanceClip, animVelocity } = await R('src/formats/morrowind/mwAnim.js');
const { buildSkeleton, poseSkeleton, skeletonSpaceMatrices: sm, accumRootRef, GRAPH_ROOT, injectSkeletonNodes } = await R('src/formats/morrowind/mwSkin.js');
const { poseAssembly, MW_WEAPON_TYPE: T, MW_UNITS_PER_METER } = await R('src/formats/morrowind/mwFirstPerson.js');
const { createLowerBodyLayer, lowerBodyBones } = await R('src/combat/lowerBodyLayer.js');
const { guardMovementGroup } = await R('src/combat/guardLocomotion.js');
const { clipStridePhase } = await R('src/combat/movementContinuity.js').catch(() => ({}));
const { createBodyWeight } = await R('src/characters/bodyMotion/bodyWeight.js');
const { createBodyMotion, sceneInput } = await R('src/characters/bodyMotion/bodyMotion.js');
const { bodyOf } = await R('src/characters/bodyMotion/bodyKit.js');
const { bodyFrames } = await R('src/characters/bodyMotion/bodySolve.js');
const { offWeaponBoneAddon } = await R('src/combat/twoHands/mirrorRig.js');
const { retailSkeleton } = await R('test/fixtures/mw/retailRig.mjs');
const { bindPart } = await R('src/formats/morrowind/mwCharacter.js');
const { skinBatch } = await R('src/formats/morrowind/mwSkin.js');
const SKIN = process.env.PROBE_SKIN ?? 'bb_skinf_de.nif';
const skinNif = parseNif(readFileSync(`${root}/Mods/Bodies/Better Bodies/Underwear/Data Files/Meshes/bb/${SKIN}`));

const nif = parseNif(readFileSync(`${root}/Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf`));
const keys = normalizeTextKeys(collectTextKeys(nif)), trackMap = extractTracks(nif), source = { keys, trackMap };
const has = (g) => keys.some((k) => k.text.toLowerCase() === `${g}: start`.toLowerCase() || k.text.toLowerCase() === `${g}: loop start`.toLowerCase());
const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const CARRIES = { none: { weapon: T.None }, one: { weapon: T.LongBladeOneHand }, shield: { weapon: T.LongBladeOneHand, shield: true }, two: { weapon: T.LongBladeTwoHand }, torch: { weapon: T.None, torch: true }, bareshield: { weapon: T.None, shield: true } };
const GAITS = { idle: { group: 'idle', f: 0, s: 0, speed: 0 }, walk: { group: 'walkforward', f: 1, s: 0, speed: 2.5 },
  run: { group: 'runforward', f: 1, s: 0, speed: 8.1 }, back: { group: 'walkback', f: -1, s: 0, speed: 2.5 },
  strafe: { group: 'walkright', f: 0, s: 1, speed: 2.5 }, runback: { group: 'runback', f: -1, s: 0, speed: 6 } };

function make() {
  const n = parseNif(retailSkeleton()), sk = buildSkeleton(n);
  injectSkeletonNodes(sk, offWeaponBoneAddon(sk, GRAPH_ROOT, sm, n));
  const part = bindPart(sk, skinNif), batch = (n) => part.skinned.find((x) => x.name === n);
  // per vertex, the share of its weight on the named bones
  const share = (bt, re) => { const w = new Float32Array(bt.positions.length / 3); for (const bone of bt.skin.bones) if (bone.ref != null && re.test(sk.nodes.get(bone.ref).name)) bone.indices.forEach((v, k) => { w[v] += bone.weights[k]; }); return w; };
  const chestB = batch('Tri Chest'), trunkW = share(chestB, /spine|pelvis|neck/i);
  const arms = { L: ['Tri Left Upper Arm', 'Tri Left Forearm'].map(batch), R: ['Tri Right Upper Arm', 'Tri Right Forearm'].map(batch) };
  const armW = Object.fromEntries(Object.entries(arms).map(([k, v]) => [k, v.map((bt) => share(bt, /upperarm|forearm|hand/i))]));
  const skin = { chestB, trunkW, arms, armW };
  const lower = createLowerBodyLayer({ sampleTrack });
  return { sk, skin, body: bodyOf(sk, GRAPH_ROOT, sm), lower, weight: createBodyWeight(), motion: createBodyMotion(undefined, lower),
    assembly: { skeleton: sk, fns: { poseSkeleton, skelMats: sm }, pieces: [] }, accumRoot: accumRootRef(sk, trackMap), mask: lowerBodyBones(sk) };
}

// how deep each arm stands inside the trunk: the chest frame's ellipse (armClearance's 0.5 x 0.42 shoulder widths), from
// the pelvis up to the shoulders; 0 = on the skin or out, 1 = at the trunk's axis. The upper arm's inner half included.
function depth(b, mats) {
  const F = bodyFrames(b, mats); if (!F) return { L: 0, R: 0 };
  const chest = mats.get(b.chest).t, pel = mats.get(b.bones.pelvis).t, sw = b.shoulderWidth;
  const A = sw * 0.5, Bd = sw * 0.42, bottom = dot(sub(pel, chest), F.up);
  const res = {};
  for (const side of ['L', 'R']) {
    const bb = b.bones[side], S = mats.get(bb.upper).t, E = mats.get(bb.fore).t, W = mats.get(bb.hand).t;
    const top = dot(sub(S, chest), F.up);
    let worst = 0;
    for (const p of [lerp(S, E, 0.5), lerp(S, E, 0.75), E, lerp(E, W, 0.25), lerp(E, W, 0.5), lerp(E, W, 0.75)]) {
      const d = sub(p, chest), z = dot(d, F.up); if (z < bottom || z > top) continue;
      const o = Math.hypot(dot(d, F.right) / A, dot(d, F.fwd) / Bd); worst = Math.max(worst, 1 - o);
    }
    res[side] = worst;
  }
  return res;
}
// THE SKIN'S OWN DEPTH: the posed Better Bodies trunk (its chest vertices on the spine, the breasts included) as a
// polar profile about the chest bone's vertical, in slices along the chest's up; each arm vertex (upper arm and forearm,
// its shoulder seam left out) inside that profile counts, by how far in (rig units). Conservative: the least radius of
// the vertex's angle bin and its two neighbours.
const NA = 36, SL = 1.5;
function skinDepth(b, pose, mats) {
  const F = bodyFrames(b.body, mats); if (!F) return { L: 0, R: 0 };
  const c = mats.get(b.body.chest).t, sk = b.sk, K = b.skin;
  const polar = (x, y, z) => { const d = [x - c[0], y - c[1], z - c[2]]; const u = dot(d, F.right), v = dot(d, F.fwd), h = dot(d, F.up); return [Math.floor(h / SL), Math.hypot(u, v), ((Math.floor((Math.atan2(v, u) + Math.PI) / (2 * Math.PI) * NA) % NA) + NA) % NA]; };
  const P = new Float32Array(K.chestB.positions.length), N = new Float32Array(K.chestB.positions.length);
  skinBatch(K.chestB, sk, pose, mats, P, N);
  const prof = new Map();
  for (let v = 0; v < P.length / 3; v++) { if (K.trunkW[v] < 0.7) continue; const [sl, r, a] = polar(P[3 * v], P[3 * v + 1], P[3 * v + 2]); const key = sl * NA + a; if (!(prof.get(key) >= r)) prof.set(key, r); }
  const res = {};
  for (const side of ['L', 'R']) {
    let worst = 0;
    K.arms[side].forEach((bt, j) => {
      const Q = new Float32Array(bt.positions.length), M = new Float32Array(bt.positions.length); skinBatch(bt, sk, pose, mats, Q, M);
      for (let v = 0; v < Q.length / 3; v++) {
        if (K.armW[side][j][v] < 0.9) continue;
        const [sl, r, a] = polar(Q[3 * v], Q[3 * v + 1], Q[3 * v + 2]);
        const rs = [a - 1, a, a + 1].map((x) => prof.get(sl * NA + ((x + NA) % NA)));
        if (rs.some((x) => x == null)) continue;
        worst = Math.max(worst, Math.min(...rs) - r);
      }
    });
    res[side] = worst;
  }
  return res;
}
const local = (b, mats, F, ref) => { const d = sub(mats.get(ref).t, mats.get(b.chest).t); return [dot(d, F.right), dot(d, F.fwd), dot(d, F.up)].map((v) => v / b.arm); };
const yawOf = (M, ref) => { const a = M.get(ref).a; return Math.atan2(a[3], a[0]); };
const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));

// one run: `steps` is [{ frames, gait, blow?(i,n), yaw?(i,n) }]
function run(carry, steps, dt = 1 / 60) {
  const b = make(), c = CARRIES[carry], frames = [];
  let movement = null, group = null, t = 0, fade = 1, from = null, wasBlow = false; const trav = [0, 0, 0];
  for (const st of steps) for (let i = 0; i < st.frames; i++, t += dt) {
    const g = GAITS[st.gait];
    const want = guardMovementGroup(g.group, c.weapon, has, true)?.group ?? g.group;
    if (want !== group) { const nm = resetClip(keys, want, { loopFallback: true, loopCount: Infinity }); if (nm.ok) { if (movement) { from = b.assembly.shownPose ? new Map(b.assembly.shownPose) : null; fade = 0; } movement = nm; group = want; } }
    const animSpeed = g.speed ? animVelocity(keys, trackMap.get(b.sk.nodes.get(b.accumRoot).name.toLowerCase()), group) || 1 : 1;
    const yaw = st.yaw ? st.yaw(i, st.frames) : 0, blow = st.blow ? st.blow(i, st.frames) : null;
    const cam = { yaw, move: { speed: g.speed, running: st.gait.startsWith('run'), forward: g.f, strafe: g.s, grounded: true, bodyYaw: yaw, travel: [trav[0] += g.s * g.speed * dt, 0, trav[2] += g.f * g.speed * dt] } };
    const word = { ...sceneInput({ kind: process.env.PROBE_KIND ?? 'female', weapon: c.weapon, shield: !!c.shield, torch: !!c.torch, running: cam.move.running, forward: g.f, strafe: g.s, speed: g.speed, yaw, blow, travel: cam.move.travel }) };
    advanceClip(movement, keys, dt * (g.speed ? b.weight.moveRate(g.speed * MW_UNITS_PER_METER / animSpeed, group) : 1));
    // a blow plays the weapon clip's own keys, the legs kept on the movement (lowerBodyLayer), faded in and out as the rig does
    const grp = c.weapon === T.LongBladeTwoHand ? 'weapontwohand' : 'weapononehand', kt = (n) => keys.find((k) => k.text === `${grp}: ${blow?.type === 'thrust' ? 'thrust' : blow?.type} ${n}`)?.time;
    const atk = blow ? (blow.section === 'windup' ? [kt('start'), kt('max attack')] : blow.section === 'release' ? [kt('max attack'), kt('hit')] : [kt('hit'), kt('large follow stop')]) : null;
    const clipTime = atk && atk[0] != null ? atk[0] + (atk[1] - atk[0]) * blow.progress : movement.time;
    if (!!blow !== wasBlow) { from = b.assembly.shownPose ? new Map(b.assembly.shownPose) : null; fade = 0; wasBlow = !!blow; }
    b.lower.stepRig(dt, true, null, blow ? {} : null, null, null, movement, source, null, null);
    b.motion.step(dt, word);
    b.weight.stepRig(dt, true, cam, [], c.weapon, false, word, movement, source, animSpeed);
    if (process.env.PROBE_DEBUG) globalThis.__clearDebug = [];
    poseAssembly(b.assembly, { tracks: b.lower.tracks(trackMap, b.mask), sampleTrack: b.lower.sampler(sampleTrack), time: clipTime,
      accumRoot: b.accumRoot, skin: false, blendFrom: fade < 1 ? from : null, blendWeight: fade < 1 ? Math.max(0.05, fade) : 1, motion: b.weight.slot(b.motion.slot) });
    fade = Math.min(1, fade + dt / 0.2);
    const M = b.assembly.mats, F = bodyFrames(b.body, M); if (!F) continue;
    const dp = depth(b.body, M), ds = skinDepth(b, b.assembly.pose, M);
    frames.push({ t: +t.toFixed(4), gait: st.gait, blow: blow?.section ?? null, dbg: globalThis.__clearDebug, gph: b.motion.stride().phase, cph: clipStridePhase ? clipStridePhase(movement, keys) : null, feet: dot(sub(M.get(b.body.bones.L.foot).t, M.get(b.body.bones.R.foot).t), F.fwd) / b.body.leg, dL: dp.L, dR: dp.R, sL: ds.L, sR: ds.R,
      hL: local(b.body, M, F, b.body.bones.L.hand), hR: local(b.body, M, F, b.body.bones.R.hand),
      eL: local(b.body, M, F, b.body.bones.L.fore), eR: local(b.body, M, F, b.body.bones.R.fore),
      twist: wrap(yawOf(M, b.body.chest) - yawOf(M, b.body.bones.pelvis)) });
  }
  return frames;
}
const blowOf = (type) => (i, n) => { const u = i / n; return { type, hand: 'R', strength: 1, section: u < 0.35 ? 'windup' : u < 0.55 ? 'release' : 'follow', progress: u < 0.35 ? u / 0.35 : u < 0.55 ? (u - 0.35) / 0.2 : (u - 0.55) / 0.45 }; };

const scen = {};
const ONLY = process.env.PROBE_ONLY ? new RegExp(process.env.PROBE_ONLY) : null;
const put = (name, f) => { if (!ONLY || ONLY.test(name)) scen[name] = f(); };
for (const carry of Object.keys(CARRIES)) for (const gait of Object.keys(GAITS)) put(`${carry}/${gait}`, () => run(carry, [{ frames: 60, gait: 'idle' }, { frames: 180, gait }]));
// the owner's 19-47-18 video, 4.9-5.9 s: a two-hander's slash standing, then a run begun while the body turns 90 degrees
const turn = (deg) => (i, n) => (deg * Math.PI / 180) * Math.min(1, i / n);
for (const carry of ['two', 'one', 'shield']) for (const type of ['slash', 'chop', 'thrust']) for (const deg of [0]) {
  put(`${carry}/blow-${type}-run-turn${deg}`, () => run(carry, [{ frames: 60, gait: 'idle' }, { frames: 48, gait: 'idle', blow: blowOf(type) },
    { frames: 36, gait: 'run', yaw: turn(deg) }, { frames: 90, gait: 'run', yaw: () => deg * Math.PI / 180 }]));
  put(`${carry}/runblow-${type}-turn${deg}`, () => run(carry, [{ frames: 60, gait: 'run' }, { frames: 48, gait: 'run', blow: blowOf(type) },
    { frames: 36, gait: 'run', yaw: turn(deg) }, { frames: 60, gait: 'run', yaw: () => deg * Math.PI / 180 }]));
}
// gait changes
for (const carry of Object.keys(CARRIES)) put(`${carry}/walk-run-idle`, () => run(carry, [{ frames: 60, gait: 'walk' }, { frames: 90, gait: 'run' }, { frames: 60, gait: 'walk' }, { frames: 60, gait: 'idle' }]));

const summary = {};
for (const [k, fr] of Object.entries(scen)) {
  const s = fr.slice(30), max = (f) => Math.max(...s.map(f)), min = (f) => Math.min(...s.map(f));
  const worst = s.reduce((a, f) => (Math.max(f.dL, f.dR) > Math.max(a.dL, a.dR) ? f : a), s[0]);
  const jump = (key) => Math.max(...s.slice(1).map((f, i) => Math.hypot(...sub(f[key], s[i][key]))));
  const sw = s.reduce((a, f) => (Math.max(f.sL, f.sR) > Math.max(a.sL, a.sR) ? f : a), s[0]);
  summary[k] = { skinL: +max((f) => f.sL).toFixed(2), skinR: +max((f) => f.sR).toFixed(2), skinAt: sw.t, depthL: +max((f) => f.dL).toFixed(3), depthR: +max((f) => f.dR).toFixed(3), worstAt: worst.t, worstGait: worst.gait,
    swingL: +(max((f) => f.hL[1]) - min((f) => f.hL[1])).toFixed(3), swingR: +(max((f) => f.hR[1]) - min((f) => f.hR[1])).toFixed(3),
    twist: +((max((f) => f.twist) - min((f) => f.twist)) * 180 / Math.PI).toFixed(1), jumpL: +jump('hL').toFixed(3), jumpR: +jump('hR').toFixed(3) };
}
writeFileSync(out, JSON.stringify({ summary, scen }));
console.table(summary);
