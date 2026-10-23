// Secondary motion for skinned Morrowind cloaks.
// The original OpenMW pack swaps three pre-bent meshes from Lua. This port keeps
// the rigged mesh and adds a bounded Verlet pass so the hem lags and sways while
// the GPU continues to skin it to the character's chest bone.

// Deliberately visible secondary motion in Morrowind's authored world units.
// The old 1.6-unit envelope and 0.28-unit step made the hem look nearly rigid.
const MAX_OFFSET = 5.0;
const MAX_STEP = 0.72;
const DAMPING = 0.972;
const GRAVITY = 22;
const ITERATIONS = 7;
const STIFFNESS = 0.68;

const distance3 = (p, a, b) => Math.hypot(
  p[a * 3] - p[b * 3],
  p[a * 3 + 1] - p[b * 3 + 1],
  p[a * 3 + 2] - p[b * 3 + 2],
);

/** Make a bounded cloth state from one skinned mesh, after its body-fit has been applied. */
export function createCloakPhysics(piece) {
  const positions = piece?.batch?.positions;
  const indices = piece?.indices;
  if (!(positions instanceof Float32Array) || positions.length < 9 || !indices?.length) return null;
  const count = positions.length / 3;
  const base = Float32Array.from(positions);
  const prev = Float32Array.from(positions);
  const pos = Float32Array.from(positions);
  const pinned = new Uint8Array(count);
  let minZ = Infinity, maxZ = -Infinity;
  for (let v = 0; v < count; v++) {
    const z = base[v * 3 + 2];
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const span = Math.max(1e-4, maxZ - minZ);
  let pinThreshold = maxZ - span * 0.10;
  let pinCount = 0;
  for (let v = 0; v < count; v++) if (base[v * 3 + 2] >= pinThreshold) { pinned[v] = 1; pinCount++; }
  if (pinCount < 3) {
    pinThreshold = maxZ - span * 0.20;
    pinCount = 0;
    pinned.fill(0);
    for (let v = 0; v < count; v++) if (base[v * 3 + 2] >= pinThreshold) { pinned[v] = 1; pinCount++; }
  }
  if (!pinCount) {
    let top = 0;
    for (let v = 1; v < count; v++) if (base[v * 3 + 2] > base[top * 3 + 2]) top = v;
    pinned[top] = 1;
  }

  // One distance constraint per unique triangle edge preserves the authored fit.
  const seen = new Set();
  const edges = [];
  const addEdge = (a, b) => {
    if (a === b || a < 0 || b < 0 || a >= count || b >= count) return;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const key = lo * count + hi;
    if (seen.has(key)) return;
    seen.add(key);
    const rest = distance3(base, lo, hi);
    if (rest > 1e-5) edges.push({ a: lo, b: hi, rest });
  };
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    addEdge(a, b); addEdge(b, c); addEdge(c, a);
  }
  if (!edges.length) return null;
  return {
    base, pos, prev, pinned, edges, time: 0, maxOffset: MAX_OFFSET,
    baseNormals: piece.batch.normals ? Float32Array.from(piece.batch.normals) : null,
    normals: piece.batch.normals ?? null,
  };
}

function rebuildNormals(positions, indices, out, fallback) {
  if (!out || out.length !== positions.length) return;
  out.fill(0);
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const abx = positions[b] - positions[a], aby = positions[b + 1] - positions[a + 1], abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a], acy = positions[c + 1] - positions[a + 1], acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    out[a] += nx; out[a + 1] += ny; out[a + 2] += nz;
    out[b] += nx; out[b + 1] += ny; out[b + 2] += nz;
    out[c] += nx; out[c + 1] += ny; out[c + 2] += nz;
  }
  for (let i = 0; i < out.length; i += 3) {
    const length = Math.hypot(out[i], out[i + 1], out[i + 2]);
    if (length > 1e-8) {
      out[i] /= length; out[i + 1] /= length; out[i + 2] /= length;
    } else if (fallback?.length === out.length) {
      out[i] = fallback[i]; out[i + 1] = fallback[i + 1]; out[i + 2] = fallback[i + 2];
    }
  }
}

/** Advance one frame. Accepts the legacy gait number or a gait/attack state object. */
export function stepCloakPhysics(piece, dt, motion = 0) {
  const state = piece?.clothPhysics;
  const positions = piece?.batch?.positions;
  const indices = piece?.indices;
  if (!state || !positions || positions.length !== state.pos.length || !indices?.length) return false;
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  if (step <= 0) return false;
  state.time += step;
  const { base, pos, prev, pinned, edges } = state;
  const gait = typeof motion === 'object' && motion !== null ? motion.gait : motion;
  const move = Math.max(0, Math.min(1, Number(gait) || 0));
  const attack = typeof motion === 'object' && motion !== null ? Math.max(0, Math.min(1, Number(motion.attack) || 0)) : 0;
  const attackProgress = typeof motion === 'object' && motion !== null ? Math.max(0, Math.min(1, Number(motion.attackProgress) || 0)) : 0;
  // A short, strong outward impulse peaks through the middle of a swing. It is
  // deliberately weighted toward the lower cloak so the hem clears the hips
  // during overhead/forward attacks instead of remaining a rigid backdrop.
  const attackPulse = attack * Math.sin(Math.PI * attackProgress);
  const attackGroup = typeof motion === 'object' && motion !== null ? String(motion.attackGroup ?? '').toLowerCase() : '';
  const overhead = /overhead|chop|two.?hand|2.?hand|greatsword|weapon.*(2|two)/.test(attackGroup) ? 1 : 0.65;
  const dt2 = step * step;

  for (let v = 0; v < pinned.length; v++) {
    const o = v * 3;
    if (pinned[v]) {
      pos[o] = prev[o] = base[o];
      pos[o + 1] = prev[o + 1] = base[o + 1];
      pos[o + 2] = prev[o + 2] = base[o + 2];
      continue;
    }
    const x = pos[o], y = pos[o + 1], z = pos[o + 2];
    // NIF positions are in Morrowind world units (the cloak is tens of units tall), not metres.
    // The previous sub-3-unit/s² wind produced only thousandths of a unit per frame and looked rigid.
    // Keep Verlet's dt² integration, but use accelerations scaled to the mesh's authored coordinate space.
    const hemWeight = Math.max(0, Math.min(1, (maxOffsetSafe(base, o + 2) - base[o + 2]) / 1));
    let dx = (x - prev[o]) * DAMPING
      + Math.sin(state.time * (move > 0.8 ? 2.7 : 1.7) + base[o + 2] * 0.17) * (18 + move * 72) * dt2;
    // Walking alternates the cloth laterally; running adds a sustained backward drag.
    let dy = (y - prev[o + 1]) * DAMPING
      + Math.cos(state.time * (move > 0.8 ? 3.1 : 2.0) + base[o] * 0.11) * (8 + move * 32) * dt2
      - move * move * 24 * dt2
      - attackPulse * overhead * (70 + 105 * hemWeight) * dt2;
    let dz = (z - prev[o + 2]) * DAMPING - GRAVITY * dt2
      - attackPulse * overhead * (18 + 28 * hemWeight) * dt2;
    const length = Math.hypot(dx, dy, dz);
    if (length > MAX_STEP) { const scale = MAX_STEP / length; dx *= scale; dy *= scale; dz *= scale; }
    prev[o] = x; prev[o + 1] = y; prev[o + 2] = z;
    pos[o] = x + dx; pos[o + 1] = y + dy; pos[o + 2] = z + dz;
  }

  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    for (const edge of edges) {
      const a = edge.a * 3, b = edge.b * 3;
      let dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
      const length = Math.hypot(dx, dy, dz) || 1e-6;
      const correction = ((length - edge.rest) / length) * 0.5 * STIFFNESS;
      dx *= correction; dy *= correction; dz *= correction;
      if (!pinned[edge.a]) { pos[a] += dx; pos[a + 1] += dy; pos[a + 2] += dz; }
      if (!pinned[edge.b]) { pos[b] -= dx; pos[b + 1] -= dy; pos[b + 2] -= dz; }
    }
    for (let v = 0; v < pinned.length; v++) if (pinned[v]) {
      const o = v * 3; pos[o] = base[o]; pos[o + 1] = base[o + 1]; pos[o + 2] = base[o + 2];
    }
  }

  for (let v = 0; v < pinned.length; v++) {
    if (pinned[v]) continue;
    const o = v * 3;
    // Morrowind is Z-up and the cape hangs behind the actor on -Y. Keep it
    // from moving materially forward through the fitted back surface.
    pos[o + 1] = Math.min(pos[o + 1], base[o + 1] + 0.22);
    let dx = pos[o] - base[o], dy = pos[o + 1] - base[o + 1], dz = pos[o + 2] - base[o + 2];
    const length = Math.hypot(dx, dy, dz);
    if (length > MAX_OFFSET) {
      const scale = MAX_OFFSET / length;
      pos[o] = base[o] + dx * scale;
      pos[o + 1] = base[o + 1] + dy * scale;
      pos[o + 2] = base[o + 2] + dz * scale;
    }
  }

  positions.set(pos);
  if (state.normals && piece.batch.normals === state.normals) rebuildNormals(positions, indices, state.normals, state.baseNormals);
  piece.sourceGen = ((piece.sourceGen | 0) + 1) >>> 0;
  return true;
}
