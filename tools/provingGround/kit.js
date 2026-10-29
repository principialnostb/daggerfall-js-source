// PROVING-GROUND (bible/05-Combat/Proving-Ground.md): THE KIT - the game's own doors, gathered for the script. Laid into
// the booted page as a module; every call answers plain data. The modules are the ones the game itself loaded (the
// ground's dev server runs no hot reload, so a path is the game's own instance).
const mod = (p) => import(p);

const BONES = ['bip01 pelvis', 'bip01 spine2', 'bip01 head', 'bip01 l thigh', 'bip01 r thigh', 'bip01 l calf', 'bip01 r calf',
  'bip01 l foot', 'bip01 r foot', 'bip01 l upperarm', 'bip01 r upperarm', 'bip01 l forearm', 'bip01 r forearm',
  'bip01 l hand', 'bip01 r hand', 'weapon bone', 'shield bone'];

window.__pgKit = {
  /** What the body and its rig say now. */
  async state() {
    const { fpArm } = await mod('/src/combat/fpArm.js');
    const s = fpArm.status();
    return {
      view: s.viewMode, ready: fpArm.ready(), weapon: s.weapon?.name ?? null, wg: s.weaponGroup, sheathed: s.sheathed,
      mg: s.movementGroup, mr: s.movementRate, up: s.upperName, at: s.attackType, jg: s.jumpGroup, pg: s.posedGroup,
      cls: s.motion?.cls, mode: s.motion?.mode, pos: window.__player?.pos ?? null, frame: window.__pg.frames(), ms: +(window.__pg.lastMs?.() ?? 0).toFixed(2),
    };
  },
  /** The body's bones this frame (metres from the feet, [right, up, forward]). */
  async bones() {
    const v = await mod('/src/player/mwView.js');
    return v.mwViewBodyBones(BONES);
  },
  /** The player's pack: what it holds, by name, kind and template. */
  items() {
    const e = window.__playerEntity;
    const list = Array.isArray(e?.items) ? e.items : Object.values(e?.items ?? {});
    return list.map((it, i) => ({ i, name: it?.name, group: it?.group ?? it?.itemGroup, templateIndex: it?.templateIndex, material: it?.material, equipped: !!it?.equipped }));
  },
  /** Wear and hold exactly `names` (each the first pack item whose name matches, case-insensitive). */
  async equip(names) {
    const e = window.__playerEntity;
    const eq = await mod('/src/systems/equip.js');
    const list = Array.isArray(e.items) ? e.items : Object.values(e.items);
    const done = [];
    for (const n of names) {
      const it = list.find((x) => String(x?.name ?? '').toLowerCase() === String(n).toLowerCase()) ?? list.find((x) => String(x?.name ?? '').toLowerCase().includes(String(n).toLowerCase()));
      if (!it) { done.push({ n, found: false }); continue; }
      eq.equipItem(e, it);
      done.push({ n, found: it.name });
    }
    eq.rebuildEquipState?.(e);
    return done;
  },
  /** The view switched to the body (third person). */
  async third() {
    const v = await mod('/src/player/mwView.js');
    const { mwCamera } = await mod('/src/player/mwCamera.js');
    if (!mwCamera.thirdPerson()) v.mwViewTogglePerspective();
    return mwCamera.thirdPerson();
  },
  /** The camera swung round the standing body by `yaw` radians (0 behind, pi/2 its right side, pi in front) and
   *  `pitch` - LOOK-AROUND's preview, held on. */
  async orbit(yaw = 0, pitch = 0) {
    const la = await mod('/src/player/lookAround.js');
    const { mwCamera } = await mod('/src/player/mwCamera.js');
    const third = () => mwCamera.thirdPerson();
    if (!la.lookAroundActive()) { la.stepLookAround(0, true, () => {}, third); la.stepLookAround(0.3, true, () => {}, third); la.stepLookAround(0, false, () => {}, third); }
    const [y0, p0] = la.lookAroundSwing();
    la.takeLook(yaw - y0, pitch - p0);
    return la.lookAroundSwing();
  },
  /** HOME: the open ground the scenarios start on - set to where the player stands now, or (no argument) the player
   *  put back there, facing yaw 0, settled for a moment. */
  setHome() { window.__pgHome = window.__player.pos; return window.__pgHome; },
  /** Home again. The world moves its origin by a map pixel (819.2 m) when the player crosses one, so a home kept from
   *  before is taken along by the nearest whole number of pixels to where the player now stands. */
  home() {
    const h = window.__pgHome; if (!h) return null;
    const p = window.__player.pos, P = 819.2;
    const sx = Math.round((p[0] - h[0]) / P) * P, sz = Math.round((p[2] - h[2]) / P) * P;
    if (sx || sz) window.__pgHome = [h[0] + sx, h[1], h[2] + sz];
    const g = window.__pgHome;
    window.__pose(g[0], g[1] + 0.5, g[2], 0, 0);
    return g;
  },
  /** Where in its map pixel (819.2 m) the player stands: [x, z] - home is set well inside one. */
  inPixel() { const p = window.__player.pos, P = 819.2; return [((p[0] % P) + P) % P, ((p[2] % P) + P) % P]; },
  /** THE FOES (exteriorFoes.js latestExteriorFoes): every live one cleared - the ground's fights are the script's. */
  async clearFoes() {
    const pool = (await mod('/src/scenes/exteriorFoes.js')).latestExteriorFoes();
    if (!pool) return null;
    pool.clearLive();
    return pool.activeCount();
  },
  /** A foe of DFU MobileTypes `type` set down `dist` metres ahead of the player along `yaw` (the body's heading),
   *  facing back at it - loose, so no encounter cap refuses it. Answers its mobile type, or null. */
  async placeFoe(type, dist = 4, yaw = 0, opts = {}) {
    const pool = (await mod('/src/scenes/exteriorFoes.js')).latestExteriorFoes();
    const p = window.__player.pos;
    const at = [p[0] + Math.sin(yaw) * dist, p[1] + 1, p[2] + Math.cos(yaw) * dist];
    const f = await pool.spawnFoe(type, at, { loose: true, yaw: yaw + Math.PI, ...opts });
    return f ? f.mobileType : null;
  },
  /** The pool's live foes: type, place, health, whether dead. */
  async foes() {
    const pool = (await mod('/src/scenes/exteriorFoes.js')).latestExteriorFoes();
    const me = window.__player.pos;
    return (pool?.foes ?? []).filter((f) => !f.dead).map((f) => {
      const at = f.ai?.position ?? f.pos ?? f.feet ?? null;
      return { type: f.mobileType, hp: f.entity?.health ?? null, dist: at ? +Math.hypot(at[0] - me[0], at[2] - me[2]).toFixed(2) : null };
    });
  },
  /** The player kept whole and fresh (health, fatigue, magicka topped every 50 ms of wall time) - a run is never cut
   *  short by a death or an empty fatigue bar. */
  god(on = true) {
    clearInterval(window.__pgGod);
    if (!on) return false;
    window.__pgGod = setInterval(() => {
      const e = window.__playerEntity; if (!e) return;
      if (e.maxHealth) e.health = e.maxHealth;
      if (e.maxMagicka) e.magicka = e.maxMagicka;
      e.fatigue = Math.max(e.fatigue ?? 0, e.maxFatigue ?? 2000);
    }, 50);
    return true;
  },
  /** What the third-person body wears (the rig's worn pieces), for a look that went missing. */
  async worn() {
    const { fpArm } = await mod('/src/combat/fpArm.js');
    const s = fpArm.status();
    return { worn: s.worn, pieces: s.pieces };
  },
  /** The player's look (world yaw, pitch) - the body faces it. */
  look(yaw, pitch = 0) { window.__look?.(yaw, pitch); return true; },
};
