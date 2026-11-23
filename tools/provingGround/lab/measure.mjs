// THE READINGS of a recorded run. Pure functions over the frames the driver
// keeps - bones in the body's own frame ([right, up, forward], metres from the feet), the rig's state words, the place.
// Every reading is a signal with its frame, never an artistic verdict; a reading that could not be taken says so.

const BONE = Object.freeze({
  pelvis: 'bip01 pelvis', chest: 'bip01 spine2', head: 'bip01 head',
  thighL: 'bip01 l thigh', thighR: 'bip01 r thigh', calfL: 'bip01 l calf', calfR: 'bip01 r calf',
  footL: 'bip01 l foot', footR: 'bip01 r foot', armL: 'bip01 l upperarm', armR: 'bip01 r upperarm',
  elbowL: 'bip01 l forearm', elbowR: 'bip01 r forearm', handL: 'bip01 l hand', handR: 'bip01 r hand',
  weapon: 'weapon bone', shield: 'shield bone',
});
/** A sole's own points, where the kit could find them on the worn foot: the heel and the ball. */
const SOLE = Object.freeze({ L: ['l heel', 'l ball'], R: ['r heel', 'r ball'] });
const WATCH = [BONE.footL, BONE.footR, BONE.handL, BONE.handR, BONE.weapon, BONE.shield, BONE.pelvis, BONE.head];
const FPS = 60;
const DEG = 180 / Math.PI;

const ok = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const at = (frame, name) => (ok(frame?.b?.[name]) ? frame.b[name] : null);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const dist = (a, b) => (a && b ? len(sub(a, b)) : null);
const round = (v, d = 2) => (Number.isFinite(v) ? +v.toFixed(d) : null);
const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
const pct = (xs, q) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const next = (a, b) => a && b && b.f === a.f + 1;
export const attacking = (frame) => /^attack/i.test(String(frame?.up ?? ''));
const moving = (frame) => !!frame?.mg;
const gaitOf = (frame) => (frame?.jg ? 'air' : !frame?.mg ? 'stand' : /^run/i.test(frame.mg) ? 'run' : /^sneak/i.test(frame.mg) ? 'sneak' : 'walk');

/** A body-frame point in the world, for a body at `pos` facing `yaw` (world forward = [sin yaw, 0, cos yaw]). */
export function toWorld(p, pos, yaw = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [pos[0] + p[0] * c + p[2] * s, pos[1] + p[1], pos[2] - p[0] * s + p[2] * c];
}

/** LEAPS: a bone that moves far in one frame and far more than in the frames beside it - a snap, not a fast motion. */
export function pops(frames, { cm = 6, ratio = 2.5 } = {}) {
  const out = [];
  for (let i = 2; i < frames.length - 1; i++) {
    if (!next(frames[i - 2], frames[i - 1]) || !next(frames[i - 1], frames[i]) || !next(frames[i], frames[i + 1])) continue;
    for (const bone of WATCH) {
      const d = dist(at(frames[i], bone), at(frames[i - 1], bone));
      if (d == null || d * 100 <= cm) continue;
      const around = Math.max(dist(at(frames[i - 1], bone), at(frames[i - 2], bone)) ?? 0, dist(at(frames[i + 1], bone), at(frames[i], bone)) ?? 0);
      if (d <= ratio * around) continue;
      const was = frames[i - 1], now = frames[i];
      out.push({ frame: now.f, kind: 'pop', bone, cm: round(d * 100, 1),
        from: `${was.mg ?? 'stand'}/${was.up ?? ''}`, to: `${now.mg ?? 'stand'}/${now.up ?? ''}`,
        cause: was.mg !== now.mg ? 'movement clip changed' : was.up !== now.up ? 'upper state changed' : was.clip?.group !== now.clip?.group ? 'clip changed' : 'inside one clip' });
    }
  }
  return out;
}

/**
 * THE FEET ON THE GROUND. A foot stands on its sole: where the frames carry the sole's own points (its heel and its
 * ball - the kit's `bones`), a foot is down while either is within `downCm` of the ground, and its slide in a frame is
 * the travel of whichever down point moved least - a foot that rolls from heel to ball turns about a point that stays.
 * A low foot on one edge of its sole, travelling as fast as the body, is swinging and is no plant.
 * Without them the ankle stands in: down while it is the lower one, near the ground and not rising - coarse, for an
 * ankle swings low. Each plant answers its frames and the path its foot slid.
 */
export function footwork(frames, { downCm = 2, plantCm = 3.5, riseCm = 1.2, slideCm = 4, sinkCm = 2.5 } = {}) {
  const soles = frames.some((f) => at(f, SOLE.L[0]) && at(f, SOLE.R[0]));
  const points = (side) => (soles ? SOLE[side] : [side === 'L' ? BONE.footL : BONE.footR]);
  const lows = [], standing = [];
  for (const f of frames) {
    if (f.jg) continue;
    const hs = [...points('L'), ...points('R')].map((n) => at(f, n)?.[1]).filter(Number.isFinite);
    if (hs.length !== points('L').length * 2) continue;
    lows.push(Math.min(...hs));
    if (!f.mg && !attacking(f)) standing.push(Math.min(...hs));
  }
  if (lows.length < 4) return { status: 'unmeasured', why: 'no grounded frame holds both feet', by: soles ? 'soles' : 'ankles', plants: [], findings: [] };
  // THE GROUND is where the body stands still; a run with no stand takes the level its lower foot keeps most. (The
  // lowest a foot ever gets is no ground: a planted foot pushed under it is the fault being looked for.)
  const ground = soles ? pct(standing.length >= 4 ? standing : lows, 0.5) : pct(lows, 0.05);
  const plants = [], findings = [];
  let planted = 0, path = 0, sink = 0, deepest = 0;
  for (const side of ['L', 'R']) {
    const mine = points(side), other = points(side === 'L' ? 'R' : 'L');
    let open = null;
    const close = () => { if (open && open.frames >= 3) plants.push(open); open = null; };
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i], p = frames[i - 1];
      if (!next(p, a) || a.jg || !ok(a.pos) || !ok(p.pos) || Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) > 2) { close(); continue; }   // a gap, the air, or the world's origin moved
      let least = Infinity, lowest = Infinity, downs = 0;
      for (const name of mine) {
        const fa = at(a, name), fp = at(p, name);
        if (!fa || !fp) continue;
        lowest = Math.min(lowest, fa[1]);
        const down = soles ? fa[1] <= ground + downCm / 100 && fp[1] <= ground + downCm / 100
          : fa[1] <= (at(a, other[0])?.[1] ?? Infinity) + 0.005 && fa[1] <= ground + plantCm / 100 && Math.abs(fa[1] - fp[1]) * 100 <= riseCm;
        if (!down) continue;
        downs++;
        const wa = toWorld(fa, a.pos, a.yaw ?? 0), wp = toWorld(fp, p.pos, p.yaw ?? 0);
        least = Math.min(least, Math.hypot(wa[0] - wp[0], wa[2] - wp[2]));
      }
      const under = (ground - lowest) * 100;
      if (under >= sinkCm) { sink++; deepest = Math.max(deepest, under); findings.push({ frame: a.f, kind: 'foot-sink', bone: side === 'L' ? BONE.footL : BONE.footR, cm: round(under, 1), gait: gaitOf(a) }); }
      // A foot on one edge of its sole that keeps up with the body is being carried forward, not stood on: low as it
      // swings, it is no plant (under the ground it is a sink, above). A flat foot is stood on however far it is dragged.
      const travel = Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]);
      if (!Number.isFinite(least) || (soles && downs < mine.length && travel > 0.01 && least >= travel * 0.9)) { close(); continue; }
      if (!open) open = { side, from: p.f, to: a.f, frames: 0, pathCm: 0, worstCm: 0, worstFrame: a.f, gait: gaitOf(a) };
      open.to = a.f; open.frames++; open.pathCm += least * 100;
      if (least * 100 > open.worstCm) { open.worstCm = least * 100; open.worstFrame = a.f; }
      planted++; path += least;
    }
    close();
  }
  for (const p of plants) {
    p.pathCm = round(p.pathCm, 1); p.worstCm = round(p.worstCm, 1); p.driftCm = p.pathCm;
    if (p.pathCm >= slideCm) findings.push({ frame: p.worstFrame, kind: 'foot-slide', bone: p.side === 'L' ? BONE.footL : BONE.footR, cm: p.pathCm, span: [p.from, p.to], gait: p.gait });
  }
  return { status: planted ? 'measured' : 'unmeasured', why: planted ? null : 'no foot was ever planted', by: soles ? 'soles' : 'ankles', groundM: round(ground, 3),
    plantedFrames: planted, plants: plants.length, slideCmPerPlantedFrame: planted ? round((path / planted) * 100) : null,
    worstPlantCm: plants.length ? Math.max(...plants.map((p) => p.pathCm)) : null, sinkFrames: sink, sinkWorstCm: round(deepest, 1),
    worst: [...plants].sort((x, y) => y.pathCm - x.pathCm).slice(0, 8), findings };
}

const lean = (frame) => {   // the trunk's pitch and roll, degrees: the pelvis-to-head line off the vertical
  const p = at(frame, BONE.pelvis), h = at(frame, BONE.head);
  if (!p || !h) return null;
  const v = sub(h, p);
  return { fore: Math.atan2(v[2], v[1]) * DEG, side: Math.atan2(v[0], v[1]) * DEG };
};
const twist = (frame) => {   // the shoulders' line against the hips' about the vertical, degrees
  const al = at(frame, BONE.armL), ar = at(frame, BONE.armR), tl = at(frame, BONE.thighL), tr = at(frame, BONE.thighR);
  if (!al || !ar || !tl || !tr) return null;
  const s = sub(ar, al), h = sub(tr, tl);
  let d = (Math.atan2(s[2], s[0]) - Math.atan2(h[2], h[0])) * DEG;
  while (d > 180) d -= 360; while (d < -180) d += 360;
  return d;
};
const knee = (frame, hip, kneeBone, foot) => {   // the knee's bend, degrees: 0 a straight leg
  const a = at(frame, hip), b = at(frame, kneeBone), c = at(frame, foot);
  if (!a || !b || !c) return null;
  const u = sub(a, b), v = sub(c, b), n = len(u) * len(v);
  return n > 1e-9 ? 180 - Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / n))) * DEG : null;
};
const span = (xs) => (xs.length ? Math.max(...xs) - Math.min(...xs) : null);

/**
 * THE BLOWS. The game names a blow's own phases (wind-up, release, end) and its hit time; the hand's speed says how the
 * body met them: slow, sharp, slow or one speed throughout. Each blow answers its frames, rhythm, trunk, hips and feet.
 */
export function blows(frames) {
  const out = [];
  for (let i = 0; i < frames.length; i++) {
    if (!attacking(frames[i])) continue;
    let j = i;
    // a series flows from one blow's end into the next one's wind-up without leaving the attack: the wind-up's return
    // (or the blow's own clock starting over) is where the next blow begins
    const again = (a, b) => (/windup/i.test(String(b.up)) && !/windup/i.test(String(a.up))) || (a.blow && b.blow && b.blow.clock < a.blow.clock - 1e-6);
    while (j + 1 < frames.length && attacking(frames[j + 1]) && next(frames[j], frames[j + 1]) && !again(frames[j], frames[j + 1])) j++;
    if (j - i >= 4) out.push(readBlow(frames, i, j));
    i = j;
  }
  return out;
}

function readBlow(frames, i0, i1) {
  const seg = frames.slice(i0, i1 + 1);
  let hand = null, speeds = [];
  for (const bone of [BONE.weapon, BONE.handR, BONE.handL]) {
    const v = seg.map((f, k) => (k ? (dist(at(f, bone), at(seg[k - 1], bone)) ?? 0) * FPS : 0));
    if (!hand || Math.max(...v) > Math.max(...speeds) * 1.15) { hand = bone; speeds = v; }
  }
  const peak = Math.max(...speeds), peakAt = speeds.indexOf(peak);
  let a = peakAt, b = peakAt;
  while (a > 0 && speeds[a - 1] >= peak / 2) a--;
  while (b < seg.length - 1 && speeds[b + 1] >= peak / 2) b++;
  let still = 0, run = 0;
  for (const v of speeds.slice(1)) { run = v < peak * 0.04 ? run + 1 : 0; still = Math.max(still, run); }
  const hit = seg.find((f) => f.blow && Number.isFinite(f.blow.clock) && f.blow.clock >= f.blow.hitAt);
  const leans = seg.map(lean).filter(Boolean), twists = seg.map(twist).filter((v) => v != null);
  const pel = seg.map((f) => at(f, BONE.pelvis)).filter(Boolean);
  const feet = [BONE.footL, BONE.footR].map((n) => { const p = seg.map((f) => at(f, n)).filter(Boolean); return p.length ? Math.max(...p.map((q) => Math.hypot(q[0] - p[0][0], q[2] - p[0][2]))) : 0; });
  const chest = seg.map((f) => dist(at(f, hand), at(f, BONE.chest))).filter((v) => v != null);
  const phase = (word) => seg.filter((f) => String(f.up).toLowerCase() === word).length;
  const kinds = {}; for (const f of seg) if (f.at != null) kinds[f.at] = (kinds[f.at] ?? 0) + 1;
  return {
    from: seg[0].f, to: seg[seg.length - 1].f, frames: seg.length, type: Object.entries(kinds).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
    group: seg[Math.floor(seg.length / 2)].clip?.group ?? null, cls: seg[0].cls ?? null, hand,
    movingShare: round(seg.filter(moving).length / seg.length),
    game: { windUp: phase('attackwindup'), release: phase('attackrelease'), end: phase('attackend'), hitFrame: hit?.f ?? null },
    windUpFrames: a, strikeFrames: b - a + 1, recoveryFrames: seg.length - 1 - b, peakFrame: seg[peakAt].f,
    hitOffsetFrames: hit ? hit.f - seg[peakAt].f : null,
    peakMps: round(peak), meanMps: round(mean(speeds.slice(1))), sharpness: round(peak / Math.max(1e-6, mean(speeds.slice(1)))),
    stillFrames: still, reachM: chest.length ? round(Math.max(...chest)) : null,
    leanRangeDeg: round(span(leans.map((l) => l.fore)), 1), twistRangeDeg: round(span(twists), 1),
    hipTravelCm: pel.length ? round(Math.max(...pel.map((p) => Math.hypot(p[0] - pel[0][0], p[2] - pel[0][2]))) * 100, 1) : null,
    hipDropCm: pel.length ? round((pel[0][1] - Math.min(...pel.map((p) => p[1]))) * 100, 1) : null,
    leadStepCm: round(Math.max(...feet) * 100, 1), rearStepCm: round(Math.min(...feet) * 100, 1),
  };
}

/** HOW THE BODY STANDS AND TRAVELS, by carry and gait: each bucket's means over its frames, blows left out. */
export function stance(frames) {
  const buckets = new Map();
  for (const f of frames) {
    if (attacking(f) || f.jg) continue;
    const pelvis = at(f, BONE.pelvis), fl = at(f, BONE.footL), fr = at(f, BONE.footR);
    if (!pelvis || !fl || !fr) continue;
    const key = `${f.cls ?? 'free'}/${gaitOf(f)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { n: 0, rows: {}, heads: [], pelves: [] }));
    const l = lean(f), chest = at(f, BONE.chest), hl = at(f, BONE.handL), hr = at(f, BONE.handR), head = at(f, BONE.head);
    const row = {
      pelvisM: pelvis[1], stanceWidthCm: Math.abs(fl[0] - fr[0]) * 100, stanceDepthCm: Math.abs(fl[2] - fr[2]) * 100,
      leanForeDeg: l?.fore, leanSideDeg: l?.side, twistDeg: twist(f),
      kneeLDeg: knee(f, BONE.thighL, BONE.calfL, BONE.footL), kneeRDeg: knee(f, BONE.thighR, BONE.calfR, BONE.footR),
      handLUpCm: hl && chest ? (hl[1] - chest[1]) * 100 : null, handRUpCm: hr && chest ? (hr[1] - chest[1]) * 100 : null,
      handLForeCm: hl && chest ? (hl[2] - chest[2]) * 100 : null, handRForeCm: hr && chest ? (hr[2] - chest[2]) * 100 : null,
      handSpreadCm: hl && hr ? dist(hl, hr) * 100 : null,
    };
    for (const [k, v] of Object.entries(row)) if (Number.isFinite(v)) (b.rows[k] ??= []).push(v);
    if (head) b.heads.push(head[1]);
    b.pelves.push(pelvis[1]); b.n++;
  }
  const out = {};
  for (const [key, b] of buckets) {
    if (b.n < 6) continue;
    out[key] = { frames: b.n, headBobCm: round(span(b.heads) * 100, 1), pelvisBobCm: round(span(b.pelves) * 100, 1) };
    for (const [k, v] of Object.entries(b.rows)) out[key][k] = round(mean(v), k.endsWith('M') ? 3 : 1);
    out[key].kneeDeg = round(mean([out[key].kneeLDeg, out[key].kneeRDeg].filter(Number.isFinite)), 1);
  }
  return out;
}

/** HOW HARD THE BODY IS THROWN ABOUT: each watched bone's acceleration, m/s2 (the 95th percentile and the peak). */
export function smoothness(frames) {
  const out = {};
  for (const bone of WATCH) {
    const acc = [];
    for (let i = 1; i < frames.length - 1; i++) {
      const a = at(frames[i - 1], bone), b = at(frames[i], bone), c = at(frames[i + 1], bone);
      if (!a || !b || !c || !next(frames[i - 1], frames[i]) || !next(frames[i], frames[i + 1])) continue;
      acc.push(len([c[0] - 2 * b[0] + a[0], c[1] - 2 * b[1] + a[1], c[2] - 2 * b[2] + a[2]]) * FPS * FPS);
    }
    if (acc.length) out[bone] = { p95: round(pct(acc, 0.95), 1), peak: round(Math.max(...acc), 1) };
  }
  return out;
}

const toSegment = (p, a, b) => {
  const ab = sub(b, a), n = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = n > 1e-12 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / n)) : 0;
  return dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
};

/** A LIMB INSIDE THE TRUNK, by the bones alone: an elbow, a wrist, the weapon's or the shield's bone inside a capsule
 *  from the pelvis to the chest. Coarse - the mesh reading (the kit's `geometry`) is the exact one. */
export function clearance(frames, { depthCm = 3 } = {}) {
  const findings = [];
  let worst = 0, inside = 0, read = 0;
  for (const f of frames) {
    const pelvis = at(f, BONE.pelvis), chest = at(f, BONE.chest), al = at(f, BONE.armL), ar = at(f, BONE.armR);
    if (!pelvis || !chest || !al || !ar) continue;
    read++;
    const radius = dist(al, ar) * 0.3;   // the trunk's half-depth off the shoulders' own width
    let deep = 0, who = null;
    for (const bone of [BONE.elbowL, BONE.elbowR, BONE.handL, BONE.handR, BONE.weapon]) {
      const p = at(f, bone);
      if (!p) continue;
      const d = (radius + 0.035 - toSegment(p, pelvis, chest)) * 100;
      if (d > deep) { deep = d; who = bone; }
    }
    if (deep >= depthCm) { inside++; findings.push({ frame: f.f, kind: 'limb-in-trunk', bone: who, cm: round(deep, 1) }); }
    worst = Math.max(worst, deep);
  }
  return { status: read ? 'measured' : 'unmeasured', insideFrames: inside, worstCm: round(worst, 1), findings };
}

function gaps(frames) {
  const findings = [];
  for (const f of frames) {
    if (!f.b || !Object.keys(f.b).length) { findings.push({ frame: f.f, kind: 'missing-bones' }); continue; }
    for (const [bone, p] of Object.entries(f.b)) if (p != null && !ok(p)) findings.push({ frame: f.f, kind: 'invalid-position', bone });
  }
  return findings;
}

/** One finding a frame, bone and kind kept: the worst of a streak, so a held fault is one line and not sixty. */
function merge(findings) {
  const sorted = [...findings].sort((a, b) => a.frame - b.frame), out = [], last = new Map();
  for (const f of sorted) {
    const key = `${f.kind}|${f.bone ?? ''}`, was = last.get(key);
    if (was && f.frame - was.until <= (f.stride ?? 2)) { was.until = f.frame; was.count++; if ((f.cm ?? f.ratio ?? 0) > (was.cm ?? was.ratio ?? 0)) Object.assign(was, f, { until: f.frame, count: was.count }); continue; }
    const row = { ...f, until: f.frame, count: 1 };
    last.set(key, row); out.push(row);
  }
  return out;
}

/**
 * THE MESH READINGS the driver took on the way (the kit's `geometry`), as signals. A joint always stretches its skin,
 * so a piece is held to its own run: a frame far past the piece's median is the one to look at.
 */
export function meshSignals(geometry, { stretch = 1.8, crush = 0.4, over = 1.25, pokeCm = 1.2 } = {}) {
  const bySlot = new Map(), findings = [];
  const keyOf = (p) => p.key ?? p.slot;
  for (const g of geometry) for (const p of g.pieces ?? []) if (Number.isFinite(p.maxStretch)) (bySlot.get(keyOf(p)) ?? bySlot.set(keyOf(p), []).get(keyOf(p))).push(p);
  const mid = (slot, key) => pct(bySlot.get(slot).map((p) => p[key]), 0.5);
  const at = geometry.map((g) => g.frame).filter(Number.isFinite).sort((a, b) => a - b);
  const stride = at.length > 1 ? Math.min(...at.slice(1).map((f, i) => f - at[i])) + 1 : 2;
  for (const g of geometry) {
    for (const p of g.pieces ?? []) {
      if (!Number.isFinite(p.maxStretch)) continue;
      if (p.maxStretch >= Math.max(stretch, mid(keyOf(p), 'maxStretch') * over)) findings.push({ frame: g.frame, kind: 'mesh-stretch', bone: keyOf(p), ratio: p.maxStretch, near: p.worstBone ?? null, at: p.worstAt ?? null, edges: p.stretched, stride });
      if ((p.crushed ?? 0) >= 3 && p.minStretch <= Math.min(crush, mid(keyOf(p), 'minStretch') / over)) findings.push({ frame: g.frame, kind: 'mesh-crush', bone: keyOf(p), ratio: p.minStretch, edges: p.crushed, stride });
    }
    for (const k of g.pokes ?? []) if (k.cm >= pokeCm) findings.push({ frame: g.frame, kind: k.kind === 'held-inside' ? 'held-inside' : 'mesh-poke', bone: `${k.inner} > ${k.outer}`, cm: k.cm, vertices: k.vertices, at: k.at ?? null, stride });
  }
  const pieces = {};
  for (const [slot, rows] of bySlot) pieces[slot] = { samples: rows.length, medianStretch: round(mid(slot, 'maxStretch')), worstStretch: round(Math.max(...rows.map((p) => p.maxStretch))), worstCrush: round(Math.min(...rows.map((p) => p.minStretch))) };
  return { status: geometry.some((g) => g.status === 'measured') ? 'measured' : 'unmeasured', samples: geometry.length, pieces, findings };
}

/** A run's states as spans, for a timeline: the movement clip, the upper body's state, the carry. */
export function lanes(frames) {
  const runs = (word) => {
    const out = [];
    for (const f of frames) {
      const v = word(f), tail = out[out.length - 1];
      if (tail && tail.v === v && tail.to === f.f - 1) tail.to = f.f; else out.push({ v, from: f.f, to: f.f });
    }
    return out.filter((s) => s.v != null);
  };
  return { movement: runs((f) => f.mg ?? (f.jg ? `jump:${f.jg}` : null)), upper: runs((f) => (f.up && f.up !== 'None' ? f.up : null)),
    carry: runs((f) => f.cls ?? null), label: runs((f) => f.label || null) };
}

/** THE WHOLE READING of a run's frames. `geometry` is the mesh readings the driver took on the way, when it took any. */
export function report(frames, { geometry = [] } = {}) {
  const leaps = pops(frames), feet = footwork(frames), limbs = clearance(frames), strikes = blows(frames);
  const acc = smoothness(frames), ms = frames.map((f) => f.ms).filter(Number.isFinite);
  const mesh = meshSignals(geometry);
  const findings = merge([...gaps(frames), ...leaps, ...feet.findings, ...limbs.findings, ...mesh.findings]);
  // a mesh finding that stands in every sample is how the piece sits, not a frame's fault: said once, after the rest
  for (const f of findings) if (f.stride && geometry.length > 1 && f.count >= geometry.length) f.always = true;
  findings.sort((a, b) => (a.always ? 1 : 0) - (b.always ? 1 : 0) || a.frame - b.frame);
  const avg = (k) => round(mean(strikes.map((s) => s[k]).filter(Number.isFinite)));
  const measured = frames.some((f) => f.b && Object.values(f.b).some(ok));
  const summary = {
    frames: frames.length, pops: leaps.length, popWorstCm: leaps.length ? Math.max(...leaps.map((p) => p.cm)) : 0,
    footSlideCm: feet.slideCmPerPlantedFrame, footWorstPlantCm: feet.worstPlantCm, footSinkFrames: feet.sinkFrames ?? null, footSinkWorstCm: feet.sinkWorstCm ?? null,
    limbInTrunkFrames: limbs.insideFrames, limbInTrunkWorstCm: limbs.worstCm,
    handAccelP95: round(Math.max(acc[BONE.handL]?.p95 ?? 0, acc[BONE.handR]?.p95 ?? 0), 1), footAccelP95: round(Math.max(acc[BONE.footL]?.p95 ?? 0, acc[BONE.footR]?.p95 ?? 0), 1),
    headAccelP95: acc[BONE.head]?.p95 ?? null, pelvisAccelP95: acc[BONE.pelvis]?.p95 ?? null,
    blows: strikes.length, blowSharpness: avg('sharpness'), blowWindUpFrames: avg('windUpFrames'), blowStrikeFrames: avg('strikeFrames'),
    blowRecoveryFrames: avg('recoveryFrames'), blowStillFrames: avg('stillFrames'), blowHitOffsetFrames: round(mean(strikes.map((s) => Math.abs(s.hitOffsetFrames)).filter(Number.isFinite))),
    blowHipTravelCm: avg('hipTravelCm'), blowTwistRangeDeg: avg('twistRangeDeg'), blowLeanRangeDeg: avg('leanRangeDeg'), blowLeadStepCm: avg('leadStepCm'),
    meshSamples: geometry.length, meshWorstStretch: Object.keys(mesh.pieces).length ? Math.max(...Object.values(mesh.pieces).map((p) => p.worstStretch)) : null,
    meshPokeWorstCm: mesh.status === 'measured' ? round(Math.max(0, ...geometry.flatMap((g) => (g.pokes ?? []).map((p) => p.cm))), 1) : null,
    frameMsP95: round(pct(ms, 0.95)),
  };
  return { status: measured ? 'measured' : 'unmeasured', summary, findings, blows: strikes, stance: stance(frames), feet, mesh, smoothness: acc, lanes: lanes(frames),
    limitations: ['Bones are read in the body\'s own frame: a foot\'s slide needs the body\'s place and heading too.',
      'The trunk capsule is coarse; only the mesh reading sees a surface.', 'A signal marks a frame to look at. It is not a verdict on the motion.'] };
}

/** Metrics a lower value of which is better; every other one only says that it changed. */
export const LOWER_IS_BETTER = Object.freeze(['pops', 'popWorstCm', 'footSlideCm', 'footWorstPlantCm', 'footSinkFrames', 'footSinkWorstCm', 'limbInTrunkFrames',
  'limbInTrunkWorstCm', 'handAccelP95', 'footAccelP95', 'headAccelP95', 'pelvisAccelP95', 'blowStillFrames', 'blowHitOffsetFrames',
  'meshWorstStretch', 'meshPokeWorstCm', 'frameMsP95']);

/** IT WAS SO - IT BECAME SO: two summaries, metric by metric. A change inside `slack` (a share of the value) is none. */
export function compare(before, after, { slack = 0.05, floor = 0.05 } = {}) {
  const rows = [];
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    const a = before?.[key], b = after?.[key];
    if (!Number.isFinite(a) || !Number.isFinite(b)) { if (a !== b) rows.push({ metric: key, before: a ?? null, after: b ?? null, verdict: 'unmeasured' }); continue; }
    const delta = b - a, same = Math.abs(delta) <= Math.max(floor, Math.abs(a) * slack);
    const verdict = same ? 'same' : !LOWER_IS_BETTER.includes(key) ? 'changed' : delta < 0 ? 'better' : 'worse';
    rows.push({ metric: key, before: a, after: b, delta: round(delta, 3), verdict });
  }
  return { rows, worse: rows.filter((r) => r.verdict === 'worse').map((r) => r.metric), better: rows.filter((r) => r.verdict === 'better').map((r) => r.metric) };
}

/** What every carry should share with the reference fighter, and how far apart still counts as one fighter. */
export const SHARED = Object.freeze([
  ['stand', 'pelvisM', 0.04], ['stand', 'kneeDeg', 8], ['stand', 'leanForeDeg', 6], ['stand', 'leanSideDeg', 4],
  ['walk', 'pelvisM', 0.04], ['walk', 'pelvisBobCm', 3], ['walk', 'headBobCm', 4], ['walk', 'leanForeDeg', 6],
  ['run', 'pelvisM', 0.05], ['run', 'pelvisBobCm', 4], ['run', 'headBobCm', 5], ['run', 'leanForeDeg', 8],
  ['blow', 'sharpness', 0.8], ['blow', 'windUpShare', 0.15], ['blow', 'recoveryShare', 0.15], ['blow', 'hipTravelCm', 6],
  ['blow', 'twistRangeDeg', 12], ['blow', 'leanRangeDeg', 10], ['blow', 'stillFrames', 4],
]);

/** A FIGHTER'S SIGNATURE: what its body does, whatever it holds - the numbers one fighter keeps across weapons. */
export function signature(reports) {
  const list = Array.isArray(reports) ? reports : [reports];
  const sums = {}, put = (group, key, v, w = 1) => { if (Number.isFinite(v)) { const s = ((sums[group] ??= {})[key] ??= { v: 0, w: 0 }); s.v += v * w; s.w += w; } };
  for (const r of list) {
    for (const [key, row] of Object.entries(r.stance ?? {})) {
      const gait = key.split('/')[1];
      for (const [k, v] of Object.entries(row)) if (k !== 'frames') put(gait, k, v, row.frames);
    }
    for (const b of r.blows ?? []) {
      for (const k of ['sharpness', 'hipTravelCm', 'twistRangeDeg', 'leanRangeDeg', 'stillFrames', 'leadStepCm', 'peakMps', 'frames']) put('blow', k, b[k]);
      put('blow', 'windUpShare', b.windUpFrames / b.frames); put('blow', 'recoveryShare', b.recoveryFrames / b.frames);
    }
  }
  const out = {};
  for (const [group, rows] of Object.entries(sums)) { out[group] = {}; for (const [k, s] of Object.entries(rows)) out[group][k] = round(s.v / s.w, 3); }
  return out;
}

/** ONE FIGHTER? A signature against the reference's: each shared number's distance in tolerances, and their mean. */
export function coherence(sig, reference) {
  const rows = [];
  for (const [group, key, tol] of SHARED) {
    const a = sig?.[group]?.[key], b = reference?.[group]?.[key];
    if (!Number.isFinite(a) || !Number.isFinite(b)) { rows.push({ group, metric: key, value: a ?? null, reference: b ?? null, score: null }); continue; }
    rows.push({ group, metric: key, value: a, reference: b, delta: round(a - b, 3), tolerance: tol, score: round(Math.abs(a - b) / tol) });
  }
  const scored = rows.filter((r) => r.score != null);
  return { rows, measured: scored.length, of: rows.length, distance: scored.length ? round(mean(scored.map((r) => Math.min(3, r.score)))) : null,
    apart: scored.filter((r) => r.score > 1).sort((x, y) => y.score - x.score).map((r) => `${r.group}.${r.metric}`) };
}

/** THE SAME RUN TWICE: where two records of one scenario part, bone by bone. A run that repeats can be compared. */
export function diverge(a, b, { mm = 1 } = {}) {
  let first = null, worst = 0, worstFrame = null, worstBone = null, read = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    for (const bone of Object.keys(a[i].b ?? {})) {
      const d = dist(at(a[i], bone), at(b[i], bone));
      if (d == null) continue;
      read++;
      if (d * 1000 > mm && first == null) first = a[i].f;
      if (d > worst) { worst = d; worstFrame = a[i].f; worstBone = bone; }
    }
  }
  return { status: read ? 'measured' : 'unmeasured', frames: n, lengthsMatch: a.length === b.length, firstFrame: first, worstMm: round(worst * 1000, 1), worstFrame, worstBone, repeats: read > 0 && first == null && a.length === b.length };
}
