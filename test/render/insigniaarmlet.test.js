// GUILD-SHOP (2026-10-30, the owner: "A armory aura arm piece where it shows your guild insigia in a detailed format on one
// of the upper arms. Just one side"; bible/11-Multiplayer/Guild-Shop.md) - THE INSIGNIA ARMLET: one upper arm alone, the
// wearer's left; the arms on a gilt shield floating beside it, a glow in the guild's colours behind; drawn over what is
// behind, its glow added; the crest a texture each pair of arms keeps, let go when unused; mine my guild's, a peer's the
// guild their token names.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ArmoryRenderer, armoryDraws, armletSide, armletColours, ARMORY_ARMLET, ARMORY_CREST_IDLE_S, ARMORY_PROGRAMS, armoryPrograms, ARMORY_PIECE_INDEX } from '../../src/render/armoryPass.js';
import { newPose, poseAtRest, poseWorld } from '../../src/render/armoryPose.js';
import { ARMORY_HOVER, ARMORY_BODY, armoryHoverAt, armoryPhase } from '../../src/render/armoryHover.js';
import { noteGuildArms, noteOwnGuild, ownGuildArms, guildArmsOf, setArmsDoor, armsKey, _resetArmsBook } from '../../src/net/guild/guildArmsBook.js';
import { armletArmsOf } from '../../src/scenes/auraHost.js';
import { ARMORY_LOOK, armoryPieceName } from '../../src/ui/armoryText.js';

const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const OWL = Object.freeze({ field: 'azure', border: 'gold', device: 'owl' });
function logGl() {
  const log = [];
  let n = 0;
  const gl = new Proxy({}, { get: (_, k) => (typeof k === 'string' && /^[A-Z][A-Z_0-9]*$/.test(k) ? k : (...a) => { log.push([k, ...a]); return k === 'getExtension' ? null : k === 'createTexture' ? { tex: ++n } : {}; }) });
  return { gl, log, count: (/** @type {string} */ name) => log.filter((c) => c[0] === name).length };
}
const rig = () => { const p = newPose(); poseAtRest(p, 1, false); return p; };
const wearer = (/** @type {any} */ o = {}) => ({ kit: '00c00', at: [0, 0, 0], yaw: 0, pose: rig(), kindle: 1, torn: -1, _d: 3, ...o });

test('GUILD-SHOP the armlet\'s side: a rig\'s own left arm; a sprite\'s picture side - its right while the eye stands before it, its left from behind (mutants: both arms; the sprite\'s sides unswapped)', () => {
  assert.equal(armletSide({ card: false }, [0, 0, 1], [0, 1.3, 0], [0, 1.6, 3]), 'L');
  assert.equal(armletSide({ card: false }, [0, 0, 1], [0, 1.3, 0], [0, 1.6, -3]), 'L', 'a rig\'s left is its left from any side');
  assert.equal(armletSide({ card: true }, [0, 0, 1], [0, 1.3, 0], [0, 1.6, 3]), 'R', 'a sprite seen from the front: its left arm is the picture\'s right');
  assert.equal(armletSide({ card: true }, [0, 0, 1], [0, 1.3, 0], [0, 1.6, -3]), 'L');
});

test('GUILD-SHOP the armlet draws beside ONE upper arm: its crest plate floating a third of the way to the elbow, the arms\' gap out from the arm, the glow behind it, facing out and a little forward; nothing for a body sunk to its neck (mutants: the other arm; the crest facing in; the plate at the elbow; the plate on the arm)', () => {
  const w = wearer();
  const draws = armoryDraws('insigniaarmlet', w, [0, 1.6, 3], true);
  assert.deepEqual(draws.map((d) => [d.mesh, d.part]), [[2, 2], [2, 1]], 'its glow and its crest, no band');
  const sh = poseWorld(w.pose, 'shL', w.at, 0, [0, 0, 0]), el = poseWorld(w.pose, 'elL', w.at, 0, [0, 0, 0]), shR = poseWorld(w.pose, 'shR', w.at, 0, [0, 0, 0]);
  const h = armoryHoverAt('arms', armoryPhase('insigniaarmlet', 0), 0, null, 1), plate = draws[1].B.map((v, i) => v - h[i]);
  const at = [0, 1, 2].map((i) => sh[i] + (el[i] - sh[i]) * ARMORY_ARMLET.at);
  const d = [0, 1, 2].map((i) => el[i] - sh[i]), L2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2, t = [0, 1, 2].reduce((q, i) => q + (plate[i] - sh[i]) * d[i], 0) / L2;
  assert.ok(Math.abs(t - ARMORY_ARMLET.at) < 1e-6, `beside the left upper arm, a third of the way down (${t.toFixed(3)})`);
  const out = Math.hypot(...[0, 1, 2].map((i) => plate[i] - at[i]));
  assert.ok(out > ARMORY_BODY.upper + ARMORY_HOVER.arms.gap && out < ARMORY_BODY.upper + ARMORY_HOVER.arms.gap + ARMORY_ARMLET.size, `floating the arms' gap out from it (${out.toFixed(3)} m)`);
  assert.ok(Math.hypot(plate[0] - shR[0], plate[2] - shR[2]) > Math.hypot(plate[0] - sh[0], plate[2] - sh[2]), 'never the right');
  const crest = draws[1];
  const outward = Math.sign(sh[0]);   // the left shoulder's side of the body
  assert.ok(Math.sign(crest.N[0]) === outward && crest.N[2] > 0, 'facing out from the body and toward the eye before it');
  assert.ok(crest.U[1] > 0.9, 'its up toward the shoulder');
  assert.equal(armoryDraws('insigniaarmlet', wearer({ pose: { ...rig(), sunk: true } }), [0, 1.6, 3], true).length, 0, 'sunk to the neck');
  assert.equal(armoryPieceName('insigniaarmlet'), 'Insignia Armlet');
  assert.match(ARMORY_LOOK.insigniaarmlet(), /left upper arm/);
});

test('GUILD-SHOP the armlet\'s plate turns round the arm toward the eye, never more than its turn from straight out: its face seen from the front, from behind and from its own side, never turned in to the body; its place the same from every eye, its near edge the gap off the arm at its widest turn (mutants: the turn unclamped; the plate never turned; turned away from the eye; its place from its turn)', () => {
  const w = wearer(), sh = poseWorld(w.pose, 'shL', w.at, 0, [0, 0, 0]), el = poseWorld(w.pose, 'elL', w.at, 0, [0, 0, 0]);
  const h = armoryHoverAt('arms', armoryPhase('insigniaarmlet', 0), 0, null, 1);
  const d = [0, 1, 2].map((i) => el[i] - sh[i]), dl = Math.hypot(...d), du = d.map((v) => v / dl);
  const dotv = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const side0 = [Math.sign(sh[0]), 0, 0], o = side0.map((v, i) => v - du[i] * dotv(side0, du)), ol = Math.hypot(...o), out = o.map((v) => v / ol);   // straight out: square to the arm
  const seen = (/** @type {number[]} */ eye) => {
    const c = armoryDraws('insigniaarmlet', w, eye, true)[1], at = c.B.map((v, i) => v - h[i]), e = eye.map((v, i) => v - at[i]), el2 = Math.hypot(...e);
    return { c, at, toEye: dotv(c.N, e.map((v) => v / el2)), out: dotv(c.N, out) };
  };
  const front = seen([0, 1.6, 3]), behind = seen([0, 2.2, -3.5]), side = seen(out.map((v, i) => [0, 1.3, 0][i] + v * 4)), across = seen([-4 * side0[0], 1.4, 0.2]);
  for (const [name, v] of Object.entries({ front, behind, side })) assert.ok(v.toEye > 0.75, `its face toward an eye ${name} (${v.toEye.toFixed(3)})`);
  assert.ok(behind.c.N[2] < 0 && front.c.N[2] > 0, 'turned back toward an eye behind, forward toward one before');
  assert.ok(side.out > 0.999, 'straight out toward an eye at its own side');
  for (const v of [front, behind, side, across]) assert.ok(v.out >= Math.cos(ARMORY_ARMLET.turn) - 1e-9, `never past its turn, never in to the body (${v.out.toFixed(3)})`);
  assert.ok(Math.abs(front.out - Math.cos(ARMORY_ARMLET.turn)) < 1e-6 && Math.abs(behind.out - Math.cos(ARMORY_ARMLET.turn)) < 1e-6, 'an eye before or behind: its whole turn');
  assert.ok(Math.abs(dotv(front.c.N, du)) < 1e-9 && Math.abs(dotv(behind.c.N, du)) < 1e-9, 'turned round the arm, not tipped along it');
  for (const v of [behind, side, across]) assert.ok(Math.hypot(...v.at.map((q, i) => q - front.at[i])) < 1e-12, 'its place the same from every eye');
  // its near edge (the plate's half across, square to its face and the arm) never nearer the arm's line than the gap
  for (const v of [front, behind, side]) {
    const flat = [du[1] * v.c.N[2] - du[2] * v.c.N[1], du[2] * v.c.N[0] - du[0] * v.c.N[2], du[0] * v.c.N[1] - du[1] * v.c.N[0]];
    for (const k of [-1, 1]) {
      const edge = v.at.map((q, i) => q + flat[i] * k * ARMORY_ARMLET.size), r = edge.map((q, i) => q - sh[i]), along = dotv(r, du);
      const off = Math.hypot(...r.map((q, i) => q - du[i] * along));
      assert.ok(off >= ARMORY_BODY.upper + ARMORY_HOVER.arms.gap - 1e-9, `its near edge the gap off the arm (${off.toFixed(4)} m)`);
    }
  }
});

test('GUILD-SHOP the armlet\'s program: its own, colour over what is behind (alpha), started at the boot\'s idle with the rest; its colours the arms\' field and ink, a plain glow for none (mutants: the program left out; the colours swapped)', () => {
  const i = ARMORY_PIECE_INDEX.insigniaarmlet;
  assert.equal(i, 10);
  assert.ok(ARMORY_PROGRAMS.includes(armoryPrograms(i)[0]));
  const fs = armoryPrograms(i)[0][1];
  assert.match(fs, /const int uPiece = 10;/);
  assert.match(fs, /vec4 insigniaLight\(\)/);
  assert.match(fs, /texture\(uArms, uv\)/);
  assert.deepEqual(armletColours({ heraldry: OWL }), { field: [0x3b / 255, 0x6f / 255, 0xd8 / 255], ink: [0xd4 / 255, 0xa0 / 255, 0x17 / 255] });
  assert.deepEqual(armletColours(null), { field: [0.9, 0.9, 0.9], ink: [0.54, 0.54, 0.54] });
});

test('GUILD-SHOP the pass: the armlet blends over, its crest painted once a pair of arms and bound, the blend handed back; no crest painted - its glow alone; a crest unused let go; the renderer\'s going frees them (mutants: added light; painted every frame; never let go)', () => {
  const { gl, log, count } = logGl();
  const painted = [];
  const pass = new ArmoryRenderer(/** @type {any} */ (gl), { crest: (arms) => { painted.push(armsKey(arms)); return { pic: true }; } });
  const w = wearer({ arms: { heraldry: OWL, logo: null } });
  pass.draw([w], I, I, [0, 1.6, 3], 1, null, true);
  assert.equal(pass.drawn, 1);
  assert.deepEqual(log.filter((c) => c[0] === 'blendFunc').map((c) => c.slice(1)), [['ONE', 'ONE'], ['ONE', 'ONE_MINUS_SRC_ALPHA'], ['ONE', 'ONE'], ['ONE', 'ONE']], 'over, then added again');
  assert.equal(count('drawArrays'), 2, 'the glow, the crest');
  assert.equal(count('createTexture'), 1);
  pass.draw([w], I, I, [0, 1.6, 3], 2, null, true);
  assert.deepEqual([painted.length, count('createTexture')], [1, 1], 'painted once');
  pass.draw([wearer({ arms: { heraldry: { ...OWL, field: 'crimson' }, logo: null } })], I, I, [0, 1.6, 3], 3, null, true);
  assert.equal(count('createTexture'), 2, 'other arms, their own crest');
  pass.draw([w], I, I, [0, 1.6, 3], 3 + ARMORY_CREST_IDLE_S + 1, null, true);
  assert.equal(count('deleteTexture'), 1, 'the crimson crest let go');
  pass.dispose();
  assert.equal(count('deleteTexture'), 2, 'and the rest at the going');
  const bare = logGl();
  const none = new ArmoryRenderer(/** @type {any} */ (bare.gl), { crest: () => null });
  none.draw([w], I, I, [0, 1.6, 3], 1, null, true);
  assert.deepEqual([bare.count('drawArrays'), bare.count('bindTexture')], [1, 0], 'no crest: its glow alone');
});

test('GUILD-SHOP the arms a wearer\'s armlet wears: mine my own guild\'s, a peer\'s the guild their token names - asked of the service once, a batch; a kit without the armlet asks nothing (mutants: a peer given my arms; every peer asked)', async () => {
  _resetArmsBook();
  const asked = [];
  setArmsDoor({ arms: async (tags) => { asked.push(tags); return { ok: true, data: { arms: { GREY: { heraldry: OWL, logo: null, name: 'The Grey Hand' } } } }; } }, () => 1_000_000);
  noteGuildArms('IRON', { field: 'crimson', border: 'sable', device: 'wolf' }, null, 'The Iron Oath');
  noteOwnGuild('IRON');
  assert.equal(ownGuildArms().heraldry.device, 'wolf');
  assert.equal(armletArmsOf('a0000', 'GREY'), null, 'no armlet, no ask');
  assert.equal(asked.length, 0);
  assert.equal(armletArmsOf('00c00', 'GREY'), null, 'not known yet');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(asked, [['GREY']]);
  assert.equal(armletArmsOf('00c00', 'GREY').heraldry.device, 'owl');
  assert.equal(guildArmsOf('NOPE'), null);
  noteOwnGuild(null);
  assert.equal(ownGuildArms(), null, 'in no guild, a plain armlet');
  _resetArmsBook();
});
