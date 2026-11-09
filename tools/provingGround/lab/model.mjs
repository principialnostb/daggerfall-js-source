// CHARACTER-LAB: portable scenario data, shared by the panel and the agent driver.
export const VERSION = 1;
export const LIMIT = 3600;
const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ControlLeft', 'Space', 'KeyZ', 'KeyF']);
const SWINGS = new Set(['down', 'up', 'left', 'right']);

export function scenario(value) {
  if (!value || value.version !== VERSION) throw new Error('Scenario version must be 1');
  if (typeof value.name !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value.name)) throw new Error('Invalid scenario name');
  if (!Array.isArray(value.steps) || !value.steps.length || value.steps.length > 128) throw new Error('Expected 1–128 steps');
  let total = 0;
  const steps = value.steps.map((s) => {
    if (!s || !Number.isInteger(s.frames) || s.frames < 1) throw new Error('Each step needs positive integer frames');
    total += s.frames;
    if (total > LIMIT) throw new Error(`Scenario exceeds ${LIMIT} frames`);
    const keys = s.keys ?? [];
    if (!Array.isArray(keys) || keys.some((k) => !KEYS.has(k))) throw new Error('Unsupported input key');
    if (s.swing != null && !SWINGS.has(s.swing)) throw new Error('Unsupported swing');
    if (s.swing && s.frames < 9) throw new Error('A swing needs at least 9 frames');
    if (s.turn != null && (!Number.isFinite(s.turn) || Math.abs(s.turn) > 6)) throw new Error('Invalid turn rate');
    return { frames: s.frames, keys: [...new Set(keys)], ...(s.swing ? { swing: s.swing } : {}), ...(s.turn != null ? { turn: s.turn } : {}), label: String(s.label ?? '').slice(0, 160) };
  });
  const outfit = value.outfit ?? [];
  if (!Array.isArray(outfit) || outfit.length > 16 || outfit.some((x) => typeof x !== 'string' || x.length > 120)) throw new Error('Invalid outfit');
  const foe = value.foe ?? null;
  if (foe != null && (!Number.isInteger(foe) || foe < 0 || foe > 255)) throw new Error('Invalid mobile type');
  if (value.drawn != null && typeof value.drawn !== 'boolean') throw new Error('drawn must be boolean');
  return { version: VERSION, name: value.name, outfit, foe, drawn: value.drawn ?? true, steps };
}

/** A bounded coverage set. These exercise game inputs, not arbitrary direct clip playback. */
export function generateSuite() {
  const cases = [];
  const add = (name, steps) => cases.push(scenario({ version: VERSION, name, steps }));
  const idle = () => ({ frames: 30, keys: [], label: 'settle' });
  const directions = [['forward', ['KeyW']], ['backward', ['KeyS']], ['left', ['KeyA']], ['right', ['KeyD']],
    ['forward-left', ['KeyW', 'KeyA']], ['forward-right', ['KeyW', 'KeyD']], ['back-left', ['KeyS', 'KeyA']], ['back-right', ['KeyS', 'KeyD']]];
  for (const [name, keys] of directions) {
    add(`travel-${name}`, [idle(), { frames: 60, keys, label: 'walk' }, { frames: 60, keys: [...keys, 'ShiftLeft'], label: 'run' }, idle()]);
    for (const swing of SWINGS) add(`attack-${name}-${swing}`, [idle(), { frames: 30, keys, label: 'approach' }, { frames: 75, keys, swing, label: 'attack while moving' }, idle()]);
  }
  for (const swing of SWINGS) add(`attack-standing-${swing}`, [idle(), { frames: 90, swing, label: 'standing attack' }, idle()]);
  add('turn-and-stop', [idle(), { frames: 90, keys: ['KeyW'], turn: 1.5, label: 'turning walk' }, idle()]);
  add('jump-and-land', [idle(), { frames: 6, keys: ['Space', 'KeyW'], label: 'jump' }, { frames: 90, keys: ['KeyW'], label: 'landing' }, idle()]);
  add('sneak-transition', [idle(), { frames: 60, keys: ['ControlLeft', 'KeyW'], label: 'sneak' }, { frames: 60, keys: ['KeyW'], label: 'walk' }, idle()]);
  return cases;
}

/** Signals, never an artistic verdict. Gaps and absent geometry are reported, not treated as passing checks. */
export function analyze(frames, { jump = 0.25 } = {}) {
  const findings = [];
  let measured = 0;
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (!frame.b || !Object.keys(frame.b).length) { findings.push({ frame: frame.f, kind: 'missing-bones' }); continue; }
    for (const [bone, p] of Object.entries(frame.b)) {
      if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) { findings.push({ frame: frame.f, bone, kind: 'invalid-position' }); continue; }
      measured++;
      const prev = frames[i - 1];
      const q = prev?.b?.[bone];
      if (!q || !q.every(Number.isFinite) || frame.f !== prev.f + 1) continue;
      const metres = Math.hypot(...p.map((v, k) => v - q[k]));
      if (metres > jump) findings.push({ frame: frame.f, bone, kind: 'bone-jump', metres, from: prev.mg, to: frame.mg });
    }
  }
  return { status: measured ? 'measured' : 'unmeasured', measured, findings,
    limitations: ['Bone positions are body-relative; fast intended motion can trigger a jump signal.', 'No surface penetration, foot contact or artistic quality verdict in this analyzer.'] };
}
