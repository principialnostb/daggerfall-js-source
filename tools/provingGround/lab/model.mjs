// CHARACTER-LAB: portable scenario data, shared by the panel and the agent driver.
export const VERSION = 1;
export const LIMIT = 3600;
const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ControlLeft', 'Space', 'KeyZ', 'KeyF']);
const SWINGS = new Set(['down', 'up', 'left', 'right']);

// LAB2: WHAT THE BODY WEARS AND HOLDS, by name - the Test Room warrior's own pack. A loadout is worn whole: every slot
// taken off first, so two runs of one loadout are the same body.
const STEEL = ['Steel Cuirass', 'Steel Greaves', 'Steel Boots', 'Steel Gauntlets', 'Steel Helm', 'Steel Left Pauldron', 'Steel Right Pauldron'];
export const DRESS = Object.freeze({ bare: [], clothes: ['shirt|blouse', 'trousers|pants'], armour: STEEL, cloak: [...STEEL, 'cloak'] });
export const ARMS = Object.freeze({ fists: [], sword: ['Longsword'], shield: ['Longsword', 'Kite Shield'], twohand: ['Claymore'] });
export const LOADOUTS = Object.freeze(Object.fromEntries(Object.entries(ARMS).flatMap(([arm, held]) =>
  Object.entries(DRESS).map(([dress, worn]) => [`${arm}-${dress}`, Object.freeze([...worn, ...held])]))));
/** The fighter the owner accepted: every other carry is read against it (Motion-Doctrine, One fighter). */
export const REFERENCE_LOADOUT = 'twohand-armour';

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
    if (s.hold != null && (typeof s.hold !== 'boolean' || (s.hold && !s.swing))) throw new Error('hold belongs to a swing');
    return { frames: s.frames, keys: [...new Set(keys)], ...(s.swing ? { swing: s.swing } : {}), ...(s.hold ? { hold: true } : {}), ...(s.turn != null ? { turn: s.turn } : {}), label: String(s.label ?? '').slice(0, 160) };
  });
  const outfit = value.outfit ?? [];
  if (!Array.isArray(outfit) || outfit.length > 16 || outfit.some((x) => typeof x !== 'string' || x.length > 120)) throw new Error('Invalid outfit');
  const foe = value.foe ?? null;
  if (foe != null && (!Number.isInteger(foe) || foe < 0 || foe > 255)) throw new Error('Invalid mobile type');
  if (value.drawn != null && typeof value.drawn !== 'boolean') throw new Error('drawn must be boolean');
  const extra = {};
  if (value.loadout != null) { if (!Object.hasOwn(LOADOUTS, value.loadout)) throw new Error(`Unknown loadout: ${value.loadout}`); extra.loadout = value.loadout; }
  if (value.body != null) { if (!['female', 'male'].includes(value.body)) throw new Error('body is female or male'); extra.body = value.body; }
  if (value.swingMode != null) { if (![0, 1, 2].includes(value.swingMode)) throw new Error('swingMode is 0, 1 or 2'); if (value.swingMode) extra.swingMode = value.swingMode; }
  if (value.seed != null) { if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0x7fffffff) throw new Error('Invalid seed'); extra.seed = value.seed; }
  if (value.geometry != null) { if (!Number.isInteger(value.geometry) || value.geometry < 0 || value.geometry > 600) throw new Error('Invalid geometry interval'); if (value.geometry) extra.geometry = value.geometry; }
  return { version: VERSION, name: value.name, outfit, foe, drawn: value.drawn ?? true, steps, ...extra };
}

/** LAB2: THE DRILLS - the sequences a fight is made of, past the suite's single moves: series, a held blow, a blow
 *  into a stop and out of one, a change of way under a blow, reversals, the draw. */
export function generateDrills() {
  const cases = [];
  const add = (name, steps, extra = {}) => cases.push(scenario({ version: VERSION, name, steps, ...extra }));
  const idle = (frames = 30) => ({ frames, keys: [], label: 'settle' });
  const W = ['KeyW'], run = ['KeyW', 'ShiftLeft'];
  add('guard-idle', [{ frames: 240, keys: [], label: 'stand in the stance' }]);
  add('series-standing', [idle(), ...['down', 'left', 'right', 'up'].map((swing) => ({ frames: 45, swing, label: `series ${swing}` })), idle(60)]);
  add('series-walking', [idle(), { frames: 30, keys: W, label: 'approach' }, ...['down', 'left', 'right'].map((swing) => ({ frames: 45, keys: W, swing, label: `series ${swing}` })), idle(60)]);
  add('held-blow', [idle(), { frames: 90, swing: 'down', hold: true, label: 'held' }, { frames: 60, keys: [], label: 'released' }, idle()]);
  // the player's own default: the button held, the game striking blow after blow, each one's direction rolled
  add('held-series', [idle(), { frames: 200, swing: 'down', hold: true, label: 'held series' }, { frames: 60, keys: [], label: 'released' }, idle()], { swingMode: 2 });
  add('held-series-walking', [idle(), { frames: 30, keys: W, label: 'approach' }, { frames: 200, keys: W, swing: 'down', hold: true, label: 'held series walking' }, { frames: 60, keys: [], label: 'released' }, idle()], { swingMode: 2 });
  add('blow-into-stop', [idle(), { frames: 40, keys: W, label: 'walk' }, { frames: 18, keys: W, swing: 'down', label: 'blow on the move' }, { frames: 70, keys: [], label: 'stop under the blow' }, idle()]);
  add('blow-into-start', [idle(), { frames: 18, swing: 'left', label: 'blow standing' }, { frames: 70, keys: W, label: 'start under the blow' }, idle()]);
  add('blow-into-run', [idle(), { frames: 30, keys: W, label: 'walk' }, { frames: 18, keys: W, swing: 'right', label: 'blow' }, { frames: 70, keys: run, label: 'run under the blow' }, idle()]);
  add('blow-change-way', [idle(), { frames: 30, keys: W, label: 'forward' }, { frames: 20, keys: W, swing: 'down', label: 'blow forward' }, { frames: 25, keys: ['KeyD'], label: 'right under the blow' }, { frames: 25, keys: ['KeyS'], label: 'back under the blow' }, idle()]);
  add('reverse-walk', [idle(), { frames: 50, keys: W, label: 'forward' }, { frames: 50, keys: ['KeyS'], label: 'back' }, { frames: 50, keys: W, label: 'forward again' }, idle()]);
  add('strafe-switch', [idle(), { frames: 40, keys: ['KeyA'], label: 'left' }, { frames: 40, keys: ['KeyD'], label: 'right' }, { frames: 40, keys: ['KeyA'], label: 'left again' }, idle()]);
  add('run-stop-run', [idle(), { frames: 60, keys: run, label: 'run' }, { frames: 30, keys: [], label: 'stop' }, { frames: 60, keys: run, label: 'run again' }, idle(45)]);
  add('circle', [idle(), ...[['KeyW', 'KeyA'], ['KeyA', 'KeyS'], ['KeyS', 'KeyD'], ['KeyD', 'KeyW']].map((keys) => ({ frames: 45, keys, label: keys.join('+') })), idle()]);
  add('sheathe-draw', [idle(), { frames: 3, keys: ['KeyZ'], label: 'sheathe' }, { frames: 90, keys: [], label: 'sheathing' }, { frames: 3, keys: ['KeyZ'], label: 'draw' }, { frames: 90, keys: [], label: 'drawing' }]);
  add('walk-sheathed', [idle(), { frames: 3, keys: ['KeyZ'], label: 'sheathe' }, { frames: 80, keys: [], label: 'sheathing' }, { frames: 80, keys: W, label: 'walk sheathed' }, { frames: 80, keys: run, label: 'run sheathed' }, { frames: 3, keys: ['KeyZ'], label: 'draw' }, { frames: 80, keys: W, label: 'draw walking' }, idle()]);
  return cases;
}

/** Every scenario the lab can name: the suite's single moves, then the drills. */
export const library = () => [...generateSuite(), ...generateDrills()];

/** What a fighter's signature is read from: a stand, the gaits, blows standing and moving, a series. */
export const SIGNATURE_SET = Object.freeze(['guard-idle', 'travel-forward', 'travel-backward', 'travel-left', 'attack-standing-down', 'attack-standing-left',
  'attack-standing-right', 'attack-forward-down', 'series-standing', 'blow-into-stop']);

/** THE MATRIX: each scenario by each loadout, as scenarios of their own (`name__loadout`), every one seeded alike. */
export function matrixPlan({ loadouts = Object.keys(LOADOUTS), scenarios = SIGNATURE_SET, seed = 1, geometry = 0, body = null } = {}) {
  const all = new Map(library().map((s) => [s.name, s]));
  const out = [];
  for (const loadout of loadouts) {
    if (!Object.hasOwn(LOADOUTS, loadout)) throw new Error(`Unknown loadout: ${loadout}`);
    for (const name of scenarios) {
      const base = all.get(name);
      if (!base) throw new Error(`Unknown scenario: ${name}`);
      out.push(scenario({ ...base, name: `${name}__${loadout}`, outfit: [], loadout, seed, ...(geometry ? { geometry } : {}), ...(body ? { body } : {}) }));
    }
  }
  return out;
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
      if (!Array.isArray(q) || q.length !== 3 || !q.every(Number.isFinite) || frame.f !== prev.f + 1) continue;
      const metres = Math.hypot(...p.map((v, k) => v - q[k]));
      if (metres > jump) findings.push({ frame: frame.f, bone, kind: 'bone-jump', metres, from: prev.mg, to: frame.mg });
    }
  }
  return { status: measured ? 'measured' : 'unmeasured', measured, findings,
    limitations: ['Bone positions are body-relative; fast intended motion can trigger a jump signal.', 'No surface penetration, foot contact or artistic quality verdict in this analyzer.'] };
}
