// Smart PaperDoll secondary motion.
// The source figure is a single composed image, not a skinned skeleton. This module adds
// restrained, deterministic vertex motion while preserving the existing colors and mesh format.

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const angleDelta = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export function createSmartPaperDollMotionState() {
  return {
    lastFeet: null,
    lastYaw: null,
    lastTime: null,
    phase: 0,
    speed: 0,
    turnRate: 0,
    chestOffset: 0,
    chestVelocity: 0,
  };
}

/** Advance secondary motion from world-space foot movement. Time is in milliseconds. */
export function stepSmartPaperDollMotion(state, {
  feet,
  yaw = 0,
  time = null,
  gender = 'male',
} = {}) {
  const now = Number.isFinite(time)
    ? time
    : (typeof performance !== 'undefined' && Number.isFinite(performance.now?.())
      ? performance.now()
      : Date.now());
  const validFeet = feet && feet.length >= 3 && feet.slice(0, 3).every(Number.isFinite);
  if (!validFeet) {
    state.lastFeet = null;
    state.lastYaw = null;
    state.lastTime = now;
    state.speed = 0;
    state.turnRate = 0;
    state.chestOffset = 0;
    state.chestVelocity = 0;
    return { phase: state.phase, moveWeight: 0, bob: 0, sway: 0, breath: 0, chestOffset: 0 };
  }

  const dt = state.lastTime == null
    ? 1 / 60
    : clamp((now - state.lastTime) / 1000, 1 / 120, 0.05);
  let speed = 0;
  let yawRate = 0;
  if (state.lastFeet) {
    const dx = feet[0] - state.lastFeet[0];
    const dz = feet[2] - state.lastFeet[2];
    speed = Math.hypot(dx, dz) / dt;
  }
  if (state.lastYaw != null) yawRate = angleDelta(yaw, state.lastYaw) / dt;

  state.speed = clamp(speed, 0, 5);
  const moveWeight = smoothstep(0.08, 0.75, state.speed);
  state.turnRate += (clamp(yawRate, -4, 4) - state.turnRate) * (1 - Math.exp(-dt * 9));
  if (moveWeight > 0.001) state.phase += dt * (4.8 + Math.min(state.speed, 2.8) * 2.4);

  const bob = Math.sin(state.phase * 2) * 0.014 * moveWeight;
  const sway = Math.sin(state.phase) * 0.012 * moveWeight
    + clamp(state.turnRate, -2.5, 2.5) * 0.0025;
  const seconds = now / 1000;
  const breath = Math.sin(seconds * 1.7) * 0.0022;

  // A damped spring follows the gait rather than translating the whole torso in lockstep.
  // It is deliberately subtle; this is secondary motion, not a replacement for a rig.
  const chestTarget = gender === 'female'
    ? Math.sin(state.phase * 2 - 0.55) * 0.012 * moveWeight
    : 0;
  const springAcceleration = (chestTarget - state.chestOffset) * 92 - state.chestVelocity * 17;
  state.chestVelocity = clamp(state.chestVelocity + springAcceleration * dt, -0.8, 0.8);
  state.chestOffset = clamp(state.chestOffset + state.chestVelocity * dt, -0.022, 0.022);

  state.lastFeet = [feet[0], feet[1], feet[2]];
  state.lastYaw = yaw;
  state.lastTime = now;
  return {
    phase: state.phase,
    moveWeight,
    bob,
    sway,
    breath,
    chestOffset: gender === 'female' ? state.chestOffset : 0,
  };
}

/**
 * Deform the interleaved [position, colour, normal] character stream in place.
 * The torso and head receive a small gait bob; the outer limb silhouette gets opposing
 * depth offsets; female chest pixels get a damped, low-amplitude spring response.
 */
export function deformSmartPaperDollVertices(base, motion, {
  height = 1.8,
  gender = 'male',
  out = null,
} = {}) {
  if (!(base instanceof Float32Array) || base.length % 9 !== 0) {
    throw new TypeError('Smart PaperDoll vertex data must be a 9-float Float32Array stream');
  }
  const result = out instanceof Float32Array && out.length === base.length
    ? out
    : new Float32Array(base.length);
  const phase = Number.isFinite(motion?.phase) ? motion.phase : 0;
  const move = clamp(Number.isFinite(motion?.moveWeight) ? motion.moveWeight : 0, 0, 1);
  const bob = Number.isFinite(motion?.bob) ? motion.bob : 0;
  const sway = Number.isFinite(motion?.sway) ? motion.sway : 0;
  const breath = Number.isFinite(motion?.breath) ? motion.breath : 0;
  const chestOffset = gender === 'female' && Number.isFinite(motion?.chestOffset) ? motion.chestOffset : 0;

  for (let i = 0; i < base.length; i += 9) {
    const x = base[i], y = base[i + 1], z = base[i + 2];
    const ax = Math.abs(x);
    const side = x / (ax + 0.045);
    const torso = smoothstep(0.42, 0.68, y) * (1 - smoothstep(1.28, 1.48, y));
    const upper = smoothstep(0.12, 0.52, y);
    const legs = 1 - smoothstep(0.43, 0.78, y);
    const arms = smoothstep(0.23, 0.36, ax)
      * (1 - smoothstep(0.43, 0.53, ax))
      * smoothstep(0.57, 0.76, y)
      * (1 - smoothstep(1.12, 1.31, y));

    const px = x + sway * torso;
    let py = y + bob * upper + breath * torso;
    let pz = z
      + Math.sin(phase) * 0.052 * move * legs * side
      - Math.sin(phase) * 0.034 * move * arms * side;

    if (gender === 'female') {
      const chest = smoothstep(0.78, 0.91, y) * (1 - smoothstep(1.15, 1.29, y));
      const lobes = smoothstep(0.025, 0.075, ax) * (1 - smoothstep(0.19, 0.27, ax));
      const frontBack = z < 0 ? -1 : 1;
      pz += frontBack * chest * lobes * (0.004 + chestOffset);
      py += chest * lobes * chestOffset * 0.22;
    }

    result[i] = px;
    result[i + 1] = py;
    result[i + 2] = pz;
    result[i + 3] = base[i + 3];
    result[i + 4] = base[i + 4];
    result[i + 5] = base[i + 5];
    // Small deformations do not materially change face normals; preserve authored normals
    // rather than reconstructing every triangle each frame.
    result[i + 6] = base[i + 6];
    result[i + 7] = base[i + 7];
    result[i + 8] = base[i + 8];
  }
  return result;
}
