// The Courier's Cabinet's wares in the game: bought with Seals in Discord, each is the account's at once and the game
// knows it, draws it, signs it and lists it. The catalogue is src/net/discordShopLaw.js; holding is the account row's
// `discord_wares`. Every ware's codes are in their vocabularies, each has its drawing, and the service counts it held.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { SEAL_WARES, TIDEBOUND_PIECES, discordHeld } from '../../src/net/discordShopLaw.js';
import { TITLES, AURAS, GLYPHS, ICONS, mintToken, verifyToken } from '../../src/net/identityToken.js';
import {
  ARMORY_LINES,
  ARMORY_SOURCE,
  ARMORY_PIECES,
  ARMORY_KEYS,
  ARMORY_NAME,
  armoryLinePieces,
  armoryLineKit,
  armoryKitOf,
} from '../../src/net/armoryLaw.js';
import {
  TITLE_TEXT, AURA_TEXT, AURA_PAINT, TITLE_RGBA, TITLE_GRADIENT, TITLE_EDGE, TITLE_FLAME, GLYPH_RGBA, GLYPH_DETAIL, GLYPH_MARK,
  GLYPH_PATH, GLYPH_STROKE, FONT_GLYPH_MIN, FONT_GLYPH_MAX, ARMORY_LINE_GRADIENT, glyphDetails, titleBadge, badgeCss,
  TIDE_DEEP, TIDE_GLASS, TIDE_FOAM, TIDE_TEAL, TIDE_PEARL, VEIL_PALE, VEIL_WHITE, WAX_RED,
} from '../../src/ui/playerBadge.js';
import { PLATE_PAINTERS } from '../../src/ui/titleFlame.js';
import { GLYPH_LABEL } from '../../src/ui/enhanced/enhancedAccount.js';
import { ICON_TEXT, ICON_ART, profileIconNode } from '../../src/ui/profileIcons.js';
import { ARMORY_TEXT, ARMORY_LOOK, ARMORY_LINE_TEXT } from '../../src/ui/armoryText.js';
import { wardrobeEntry, wardrobeEntries, sourceName, availLine } from '../../src/ui/collections/wardrobeCatalogue.js';
import {
  AURA_LOOK, AURA_FS, AURA_GROUND_R, AURA_CLOCK_PERIOD, SAGE_CARDS, TIDE_R, TIDE_SPACING_M, TIDE_MOTE_R, TIDE_H, TIDE_HZ,
  TIDE_RIPPLE_RGB, VEIL_R, VEIL_WALL_H, VEIL_WISPS, VEIL_WISP_R, VEIL_RGB, VEIL_TRAIL_M, glyphEdges, auraPrograms, tideRingAt,
  tideRatesWhole, veilRatesWhole, veilWisp, veilCardsInto, veilTrailOf, auraMotionStep,
} from '../../src/render/auraRing.js';
import { ARMORY_PIECE_INDEX, ARMORY_HEAD, TIDE_RGB, armoryDraws, armoryHeadTip, armoryPrograms } from '../../src/render/armoryPass.js';
import { TIDE_CIRCLET } from '../../src/render/armoryTide.js';
import { newPose } from '../../src/render/armoryPose.js';
import { ARMORY_GLOW, GLOW_CODE, GLOW_SKINS, GLOW_SKIN, GLOW_RAMPS, glowSpec, glowFromWord, armoryWeaponLook, ARMORY_LEVEL } from '../../src/systems/weaponGlow.js';
import { GLOW_REACH_MAX, GLOW_SPRITE_WINDOW, GLOW_TIDE } from '../../src/render/weaponGlowGlsl.js';
import { LOOK_GLOW_RE, LOOK_GLOW_KIT, LOOK_GLOW_SLOTS, readBadge, readAura, validLook, lookGlowWorn } from '../../src/net/wire.js';
import { fakeRoom } from '../fakeRoom.mjs';
import { titlesHeld, aurasHeld, glyphsOf, iconsHeld, armoryHeld, auraWorn, armoryWorn, iconWorn, titleWorn, cabinetKeys } from '../../server-account/src/titles.js';
import { standService } from '../accountDb.mjs';
import { glslFunctions, GlslDiscard } from '../glsl.mjs';

const { subtle } = webcrypto;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const near = (a, b, eps = 0.003) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= eps);
const apart = (a, b) => Math.hypot(...[0, 1, 2].map((i) => (a[i] - b[i]) * 255));
const AFTER = 1_900_000_000;
const row = (wares, over = {}) => ({ handle: 'Courier', created_at: AFTER, registered_at: AFTER, discord_wares: wares, ...over });
const ALL = SEAL_WARES.map((w) => w.id).join(' ');
const VOCAB = { title: TITLES, aura: AURAS, glyph: GLYPHS, icon: ICONS, armory: ARMORY_KEYS };
const keysOf = (kind) => [...new Set(SEAL_WARES.filter((w) => w.kind === kind).flatMap((w) => w.codes))];

test("COURIER'S CABINET the vocabularies: every ware's codes are its kind's words, each once, appended after every word a token already carried", () => {
  for (const w of SEAL_WARES) for (const c of w.codes) assert.ok(VOCAB[w.kind].includes(c), `${w.id}: ${c} is a ${w.kind}`);
  assert.deepEqual(keysOf('title'), ['veilcourier']);
  assert.deepEqual(keysOf('aura'), ['eltherictide', 'veilwake']);
  assert.deepEqual(keysOf('glyph'), ['waxseal']);
  assert.deepEqual(keysOf('icon'), ['courier', 'tidecompass']);
  assert.deepEqual(keysOf('armory'), [...TIDEBOUND_PIECES]);
  assert.deepEqual([TITLES.at(-1), AURAS.slice(-2), GLYPHS.at(-1), ICONS.slice(-2)], ['veilcourier', ['eltherictide', 'veilwake'], 'waxseal', ['courier', 'tidecompass']]);
  for (const k of [...keysOf('title'), ...keysOf('aura'), ...keysOf('icon')]) assert.match(k, /^[a-z]{1,12}$/, `${k}: a token's word`);
});

test("COURIER'S CABINET the Tidebound line: five pieces, one a slot, each its code, drawn by the Discord source; named as the cabinet names them", () => {
  assert.ok(ARMORY_LINES.includes('tidebound'));
  assert.equal(ARMORY_SOURCE.tidebound, 'discord');
  assert.deepEqual(armoryLinePieces('tidebound').map((p) => [p.key, p.slot, p.code, p.source]), [
    ['tidecirclet', 'head', 'c', 'discord'],
    ['tidepearl', 'torso', 'c', 'discord'],
    ['tidebracers', 'arms', 'e', 'discord'],
    ['tidegreaves', 'legs', 'c', 'discord'],
    ['tideedge', 'weapon', 'c', 'discord'],
  ]);
  assert.equal(armoryLineKit('tidebound'), 'ccecc');
  for (const s of ['head', 'torso', 'arms', 'legs', 'weapon']) {
    const codes = ARMORY_PIECES.filter((p) => p.slot === s).map((p) => p.code);
    assert.equal(new Set(codes).size, codes.length, `${s}: a code once`);
  }
  for (const k of TIDEBOUND_PIECES) {
    const w = SEAL_WARES.find((x) => x.codes.length === 1 && x.codes[0] === k);
    assert.equal(ARMORY_NAME[k], w.name, `${k}: the service's name the cabinet's`);
    assert.equal(ARMORY_TEXT[k](), w.name, `${k}: the game's words the same`);
    assert.ok(ARMORY_LOOK[k]().length > 20, `${k}: a look`);
  }
  assert.equal(ARMORY_LINE_TEXT.tidebound(), 'Tidebound');
  assert.deepEqual(ARMORY_LINE_GRADIENT.tidebound, [TIDE_TEAL, TIDE_GLASS, TIDE_PEARL], 'its paint sea-glass into pearl');
  assert.ok(badgeCss().includes('.card button.acttitle.actaura.aura-tidebound'), 'its button painted');
});

test("COURIER'S CABINET the badges: the title on a plate of sea-glass light, 40 or more from every title's colour; the wax seal filled in its red, a mark of its own; the icons drawn", () => {
  assert.equal(TITLE_TEXT.veilcourier, 'Courier of the Veil');
  assert.deepEqual(TITLE_RGBA.veilcourier.slice(0, 3).map((x) => Math.round(x * 255)), [0x60, 0xf0, 0xd8]);
  for (const [k, c] of Object.entries(TITLE_RGBA)) if (k !== 'veilcourier') assert.ok(apart(TITLE_RGBA.veilcourier, c) > 40, `apart from the ${k}'s`);
  assert.deepEqual(TITLE_GRADIENT.veilcourier, [TIDE_GLASS, TITLE_RGBA.veilcourier, VEIL_PALE]);
  assert.deepEqual([...TITLE_EDGE.veilcourier], [0, 0, 0, 1]);
  assert.equal(TITLE_FLAME.veilcourier.style, 'pulse');
  assert.ok(Object.hasOwn(PLATE_PAINTERS, TITLE_FLAME.veilcourier.style));
  assert.ok(near(TITLE_FLAME.veilcourier.tips[1], hex('#6fd3c7')) && near(TITLE_FLAME.veilcourier.tips[3], hex('#e8fff8')), 'sea-glass into foam');
  assert.equal(titleBadge({ title: 'veilcourier' }).flame, true, 'drawn on its plate');

  assert.equal(GLYPH_LABEL.waxseal, 'Courier’s Seal');
  assert.ok(near(GLYPH_RGBA.waxseal.slice(0, 3), hex('#8a1f18')), 'the wax');
  assert.equal(GLYPH_RGBA.waxseal, WAX_RED);
  assert.equal(GLYPH_STROKE.waxseal, false, 'filled');
  const marks = GLYPHS.map((g) => GLYPH_MARK[g]);
  assert.equal(new Set(marks).size, marks.length, 'a classic mark of its own');
  const code = GLYPH_MARK.waxseal.charCodeAt(0);
  assert.ok(code >= FONT_GLYPH_MIN && code <= FONT_GLYPH_MAX, 'inside the font');
  const box = (d) => [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].every((m) => +m[1] >= 0 && +m[1] <= 16 && +m[2] >= 0 && +m[2] <= 16);
  assert.ok(box(GLYPH_PATH.waxseal) && glyphEdges(GLYPH_PATH.waxseal).length > 40, 'a scalloped disc in its box');
  const dets = glyphDetails(GLYPH_DETAIL.waxseal);
  assert.equal(dets.length, 4, 'the ring, the sheen, the quill and its shaft');
  for (const d of dets) assert.ok(box(d.path) && glyphEdges(d.path).length > 2, 'each inside the box');
  assert.ok(dets[2].rgba[0] > WAX_RED[0] + 0.2, 'the quill pressed in a warm light over the wax');

  assert.deepEqual([ICON_TEXT.courier, ICON_TEXT.tidecompass], ['The Courier', 'Tide Compass']);
  const node = (tag) => ({ tag, attrs: {}, kids: [], style: {}, setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.kids.push(...c); } });
  const doc = { createElementNS: (_, tag) => node(tag), createElement: (tag) => node(tag) };
  for (const k of ['courier', 'tidecompass']) {
    assert.ok(ICON_ART[k].field.length === 2 && ICON_ART[k].bezel && ICON_ART[k].shapes.length >= 6, `${k}: a field, a bezel, a drawing`);
    const svg = profileIconNode(doc, k, 'px', 64, { still: true });
    assert.equal(svg?.tag, 'svg', `${k}: drawn`);
    assert.equal(svg.attrs['aria-label'], ICON_TEXT[k]);
  }
});

test("COURIER'S CABINET the wardrobe: each ware listed under the Cabinet, sold for Seals at the cabinet's own price; the auras' looks the cabinet's words", () => {
  assert.equal(sourceName('discord'), 'The Courier’s Cabinet');
  const rows = { title: ['veilcourier'], aura: ['eltherictide', 'veilwake'], glyph: ['waxseal'], icon: ['courier', 'tidecompass'], armory: [...TIDEBOUND_PIECES] };
  for (const [kind, keys] of Object.entries(rows)) {
    assert.deepEqual(wardrobeEntries(kind).filter((e) => e.src === 'discord').map((e) => e.key), keys, kind);
    for (const k of keys) {
      const e = wardrobeEntry(kind, k), w = SEAL_WARES.find((x) => x.kind === kind && x.codes.length === 1 && x.codes[0] === k);
      assert.equal(e.avail, 'cabinet');
      assert.ok(e.how().includes(`${w.seals.toLocaleString('en')} Seals`), `${kind}:${k}: ${e.how()}`);
      assert.match(availLine(e), /Seals cannot be bought with money/);
    }
  }
  assert.ok(wardrobeEntry('armory', 'tideedge').how().includes('2,000 Seals'), 'the set\'s price beside the piece\'s');
  assert.equal(wardrobeEntry('aura', 'eltherictide').look(), 'Rings of sea-green light spread slowly around your feet.');
  assert.equal(wardrobeEntry('aura', 'veilwake').look(), 'A pale blue mist surrounds you and trails behind you as you move.');
  for (const k of ['eltherictide', 'veilwake']) assert.equal(wardrobeEntry('aura', k).look(), SEAL_WARES.find((w) => w.id === `dc-aura-${k}`).look, `${k}: the cabinet's own words`);
});

test("COURIER'S CABINET the auras: each a kind and a look of its own - no aura made for one player lends its shape; their words, their paint and the asked colours", () => {
  assert.deepEqual({ ...AURA_LOOK.eltherictide }, { kind: 22, ringR: TIDE_MOTE_R, flameH: TIDE_H, glyphs: 0 });
  assert.deepEqual({ ...AURA_LOOK.veilwake }, { kind: 23, ringR: VEIL_R, flameH: VEIL_WALL_H, glyphs: VEIL_WISPS, shade: true, trail: true });
  assert.equal(new Set(Object.values(AURA_LOOK).map((l) => l.kind)).size, Object.keys(AURA_LOOK).length, 'a kind each');
  for (const a of AURAS) assert.ok(AURA_LOOK[a], `a look for every aura: ${a}`);
  assert.ok(VEIL_WISPS <= SAGE_CARDS, 'its wisps fit the card uniforms');
  assert.deepEqual([AURA_TEXT.eltherictide, AURA_TEXT.veilwake], ['Eltheric Tide', 'Veilwake']);
  assert.deepEqual([AURA_PAINT.eltherictide, AURA_PAINT.veilwake], ['veilcourier', 'veilcourier']);
  assert.ok(near(TIDE_DEEP.slice(0, 3), hex('#1f6f78')) && near(TIDE_GLASS.slice(0, 3), hex('#6fd3c7')) && near(TIDE_FOAM.slice(0, 3), hex('#e8fff8')));
  assert.deepEqual([TIDE_RIPPLE_RGB.deep, TIDE_RIPPLE_RGB.glass, TIDE_RIPPLE_RGB.foam], [TIDE_DEEP.slice(0, 3), TIDE_GLASS.slice(0, 3), TIDE_FOAM.slice(0, 3)]);
  assert.ok(near(VEIL_PALE.slice(0, 3), hex('#b9c8ff')) && near(VEIL_WHITE.slice(0, 3), hex('#e9eeff')));
  assert.deepEqual([VEIL_RGB.pale, VEIL_RGB.white], [VEIL_PALE.slice(0, 3), VEIL_WHITE.slice(0, 3)]);
  assert.ok(tideRatesWhole() && veilRatesWhole(), 'every rate whole over the clock');
  // their own GLSL: none of the bespoke looks' functions, nor Coldharbour's rune script, is called by theirs
  const fnBody = (src, name) => { const i = src.indexOf(`${name}(vec2`); const j = src.indexOf('\n}\n', i); return src.slice(i, j); };
  const own = ['tideGround', 'tideWall', 'veilGround', 'veilWall', 'veilCard'].map((n) => fnBody(AURA_FS, n)).join('\n');
  assert.ok(own.length > 500, 'their functions found');
  for (const bespoke of ['shell', 'haze', 'HAZE_SCRIPT', 'runeD', 'sage', 'warren', 'ward', 'radiance', 'resonance', 'cloak', 'SH_', 'HZ_']) assert.ok(!own.includes(bespoke), `nothing of ${bespoke}`);
  for (const kind of [22, 23]) {
    const [[vs, fs]] = auraPrograms(kind);
    assert.ok(vs.includes(`const int uAura = ${kind};`) && fs.includes(`const int uAura = ${kind};`), 'its own program');
  }
});

test("COURIER'S CABINET the Eltheric Tide's law: rings born at the feet spread slowly outward and fade by TIDE_R; whole at the wrap", () => {
  const crest = (t) => [...Array(400).keys()].map((i) => (i / 400) * TIDE_R).filter((r) => r > 0.2 && r < 0.2 + TIDE_SPACING_M).reduce((b, r) => (tideRingAt(r, t) > tideRingAt(b, t) ? r : b), 0.2);
  const r0 = crest(0), r1 = crest(1);
  assert.ok(r1 > r0 && r1 - r0 < 0.06, `a ring moves out slowly (${r0.toFixed(3)} -> ${r1.toFixed(3)} m in a second)`);
  assert.ok(Math.abs(r1 - r0 - TIDE_SPACING_M * TIDE_HZ.spread) < 0.01, 'at the spread rate');
  assert.equal(tideRingAt(TIDE_R + 0.01, 0.3), 0, 'gone past TIDE_R');
  assert.ok(tideRingAt(0.01, 0) < 0.01, 'nothing at the feet\'s middle');
  for (const r of [0.3, 0.5, 0.7]) assert.ok(Math.abs(tideRingAt(r, 2.2) - tideRingAt(r, 2.2 + AURA_CLOCK_PERIOD)) < 1e-9, 'whole at the wrap');
});

const at = (kind, aura, vP, { t = 0, kindle = 1, vS = [0, 0, 0], world = [0.6, 0.05, 0], eye = [0, 1.2, 5] } = {}) => {
  const look = Object.values(AURA_LOOK).find((l) => l.kind === aura);
  const f = glslFunctions(AURA_FS, {
    vP, vS, vWorld: world, uKind: kind, uAura: aura, uTime: t, uSeed: 0, uKindle: kindle, uRingR: look.ringR, uGroundR: AURA_GROUND_R,
    uFlameH: look.flameH, uFogMode: 0, uFogDensity: 0, uFogRange: [0, 1], uCamPos: eye, uAt: [0, 0, 0], uFocus: [0, 0, 0, 0],
    dFdx: () => [0.001, 0, 0], dFdy: () => [0, 0.001, 0],
  });
  try { f.main(); } catch (e) { if (e instanceof GlslDiscard) return null; throw e; }
  return f.globals.o;
};
const sum = (c) => c[0] + c[1] + c[2];

test("COURIER'S CABINET the shaders RUN: the tide's rings sea-green where tideRingAt says, dark between, foam rising on the strip, nothing past the ground or unkindled, whole at the wrap; Veilwake's mist pale blue, covering, its wisps pale", () => {
  const t = 3.1;
  const rs = [...Array(200).keys()].map((i) => 0.2 + (i / 200) * 0.5);
  const top = rs.reduce((b, r) => (tideRingAt(r, t) > tideRingAt(b, t) ? r : b), rs[0]);
  const between = top + TIDE_SPACING_M / 2 > 0.7 ? top - TIDE_SPACING_M / 2 : top + TIDE_SPACING_M / 2;
  const mean = (r) => { const cs = [...Array(12).keys()].map((i) => at(0, 22, [r * Math.cos((i * Math.PI) / 6), r * Math.sin((i * Math.PI) / 6)], { t })); return [0, 1, 2].map((k) => cs.reduce((s, c) => s + c[k], 0) / cs.length); };
  const crest = mean(top), trough = mean(between);
  assert.ok(crest[1] > crest[0] * 1.5 && crest[2] > crest[0] * 1.4, `a ring sea-green (${crest.map((x) => x.toFixed(3))})`);
  assert.ok(sum(crest) > sum(trough) * 2, `dark between the rings (${sum(crest).toFixed(3)} against ${sum(trough).toFixed(3)})`);
  assert.equal(at(0, 22, [AURA_GROUND_R + 0.05, 0]), null, 'nothing past the ground');
  assert.deepEqual(at(0, 22, [top, 0], { t, kindle: 0 }).slice(0, 3), [0, 0, 0], 'nothing before it kindles');
  for (const p of [[top, 0], [0.31, -0.2]]) {
    const a = at(0, 22, p, { t: 9.1 }), b = at(0, 22, p, { t: 9.1 + AURA_CLOCK_PERIOD });
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-6, 'the same at the wrap');
  }
  const strip = [...Array(60).keys()].map((i) => at(1, 22, [i / 60, 0.3], { t: 1.7, world: [0.5, 0.3, 0] })).reduce((m, c) => (sum(c) > sum(m) ? c : m));
  assert.ok(sum(strip) > 0.2 && strip[1] > strip[0], `foam on the strip (${strip.map((x) => x.toFixed(3))})`);
  const a0 = at(1, 22, [0, 0.3], { t: 1.7 }), a1 = at(1, 22, [1, 0.3], { t: 1.7 });
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(a0[i] - a1[i]) < 1e-6, 'no seam behind the wearer');

  const mist = at(0, 23, [0.1, 0.05], { t: 3 });
  assert.ok(mist[3] > 0.05, `the mist covers (${mist[3].toFixed(3)})`);
  assert.ok(mist[2] >= mist[1] && mist[1] >= mist[0] && mist[2] > 0, `pale blue (${mist.map((x) => x.toFixed(3))})`);
  const low = at(1, 23, [0.3, 0.2], { t: 3 }), high = at(1, 23, [0.3, 0.97], { t: 3 });
  assert.ok(low[3] > high[3] && low[2] >= low[0], 'round the legs, gone by the waist');
  const wisp = at(2, 23, [0.5, 0.55], { vS: [0.3, 0.4, 1] });
  assert.ok(wisp[3] > 0 && wisp[2] >= wisp[0], `a wisp of the mist (${wisp.map((x) => x.toFixed(3))})`);
  assert.deepEqual(at(2, 23, [0.5, 0.5], { vS: [0.3, 0.4, 0] }), [0, 0, 0, 0], 'a wisp at no cover is none');
});

test("COURIER'S CABINET Veilwake's wisps hug the body and trail the walk: behind a wearer who moves, the older the further, at most VEIL_TRAIL_M; still, none", () => {
  for (let m = 0; m < VEIL_WISPS; m++) for (const t of [0.3, 7.7, 101.2]) {
    const w = veilWisp(m, t), r = Math.hypot(w.x, w.z);
    assert.ok(r >= VEIL_WISP_R[0] - 1e-9 && r <= VEIL_WISP_R[1] + 1e-9, `wisp ${m} near the body (${r.toFixed(3)})`);
    const v = veilWisp(m, t + AURA_CLOCK_PERIOD);
    assert.ok(Math.abs(v.x - w.x) < 1e-6 && Math.abs(v.y - w.y) < 1e-6, 'whole at the wrap');
  }
  const w = { at: [0, 0, 0], yaw: 0 };
  assert.deepEqual(veilTrailOf(w, [0, 0]), [-0, -0], 'never stepped: no trail');
  for (let i = 0; i <= 30; i++) { w.at = [0, 0, i * 0.1]; auraMotionStep(w, i / 30); }   // three metres a second, toward +z
  const trail = veilTrailOf(w, [0, 0]);
  assert.ok(trail[1] < -0.3 && Math.abs(trail[0]) < 1e-6, `behind the walk (${trail})`);
  assert.ok(Math.hypot(...trail) <= VEIL_TRAIL_M + 1e-9);
  assert.ok(Math.abs(Math.hypot(...veilTrailOf({ motion: { v: [0, 0, 40] } }, [0, 0])) - VEIL_TRAIL_M) < 1e-9, 'never past its most');
  const still = new Float32Array(SAGE_CARDS * 4), moved = new Float32Array(SAGE_CARDS * 4);
  veilCardsInto(still, new Float32Array(SAGE_CARDS * 4), 7.3, 1, [0, 0, 0], [0, 50, 0]);
  veilCardsInto(moved, new Float32Array(SAGE_CARDS * 4), 7.3, 1, [0, 0, 0], [0, 50, 0], trail);
  const zs = (a) => Array.from({ length: VEIL_WISPS }, (_, i) => a[i * 4 + 2]).reduce((s, z) => s + z, 0) / VEIL_WISPS;
  assert.ok(zs(moved) < zs(still) - 0.1, `the wisps behind (${zs(moved).toFixed(3)} against ${zs(still).toFixed(3)})`);
});

test("COURIER'S CABINET the Tidebound pieces are drawn in shapes of their own, through their ramp from sea-glass teal to pearl; the Edge the edge's code in a skin of its own", () => {
  assert.ok(near(TIDE_RGB.teal, hex('#2aa198')) && near(TIDE_RGB.pearl, hex('#f2fbff')));
  const rig = { at: [0, 0, 0], yaw: 0, pose: newPose(), vel: [0, 0, 0] }, eye = [0, 1.6, 3];
  const twin = { tidecirclet: 'eternalhalo', tidepearl: 'eternalsigil', tidebracers: 'eternalarmlets', tidegreaves: 'eternalgreaves' };
  for (const [tide, eternal] of Object.entries(twin)) {
    assert.equal(ARMORY_PIECES[ARMORY_PIECE_INDEX[tide]].slot, ARMORY_PIECES[ARMORY_PIECE_INDEX[eternal]].slot, `${tide} in ${eternal}'s slot`);
    const a = armoryDraws(tide, rig, eye, true), b = armoryDraws(eternal, rig, eye, true);
    assert.ok(a.length > 0, `${tide} draws`);
    assert.notDeepEqual(a.map((d) => [d.mesh, d.part, d.count, d.r]), b.map((d) => [d.mesh, d.part, d.count, d.r]), `${tide}: not ${eternal}'s shape`);
  }
  assert.equal(ARMORY_HEAD.tidecirclet, TIDE_CIRCLET, 'the circlet\'s own measures');
  assert.ok(armoryHeadTip({ kit: 'c0000', pose: rig.pose, at: [0, 0, 0], yaw: 0 }) > 0, 'a plate over the head clears it');
  // the ramp each piece's program reads: the Tidebound's teal to pearl, the Eternal's its own
  const rampOf = (key, v) => {
    const [[, fs]] = armoryPrograms(ARMORY_PIECE_INDEX[key]);
    return glslFunctions(fs, { uTime: 0, uSeed: 0 }).ramp(v);
  };
  assert.ok(near(rampOf('tidepearl', 1), TIDE_RGB.pearl) && near(rampOf('tidegreaves', 0.4), TIDE_RGB.teal), 'teal into pearl');
  assert.ok(!near(rampOf('eternalsigil', 1), TIDE_RGB.pearl), 'the Eternal keeps its own');

  assert.equal(ARMORY_GLOW.tideedge, 'tide');
  assert.equal(armoryWeaponLook('0000c'), 'tide');
  assert.deepEqual([GLOW_SKINS.tide, GLOW_SKIN.tide], ['edge', GLOW_TIDE.skin]);
  const spec = glowSpec('tide', ARMORY_LEVEL), edge = glowSpec('edge', ARMORY_LEVEL);
  assert.deepEqual([spec.code, spec.skin, spec.word, spec.win], [GLOW_CODE.edge, GLOW_TIDE.skin, 'tide2', GLOW_SPRITE_WINDOW.tide], 'the edge\'s code, its own skin and window');
  assert.notDeepEqual([edge.skin, edge.win], [spec.skin, spec.win], 'not the Eternal Edge\'s');
  assert.deepEqual(spec.ramp, GLOW_RAMPS.tide.flat());
  assert.ok(near(GLOW_RAMPS.tide[0], hex('#2aa198')) && near(GLOW_RAMPS.tide[3], hex('#f2fbff')));
  assert.ok(GLOW_REACH_MAX.tide > 0);
  assert.ok(LOOK_GLOW_RE.test('tide2') && !LOOK_GLOW_RE.test('tide1'), 'the wire takes its one word');
  assert.equal(glowFromWord('tide2'), spec);
});

test("COURIER'S CABINET held: the service counts each kind off `players.discord_wares` - a set its every piece, an unknown id nothing - and nothing without it; a guest holds none; an Admin holds the seal", () => {
  const all = row(ALL);
  assert.ok(titlesHeld(all, {}).includes('veilcourier'));
  assert.deepEqual(aurasHeld(all, {}), ['eltherictide', 'veilwake']);
  assert.deepEqual(glyphsOf(all, {}, AFTER + 30 * 86_400), ['waxseal']);
  assert.deepEqual(iconsHeld(all, {}), ['courier', 'tidecompass']);
  assert.deepEqual(armoryHeld(all, {}), [...TIDEBOUND_PIECES]);
  assert.deepEqual(armoryHeld(row('dc-armory-tidebound'), {}), [...TIDEBOUND_PIECES], 'the set gives every piece');
  assert.deepEqual(armoryHeld(row('dc-armory-tidepearl dc-nonsuch'), {}), ['tidepearl'], 'a piece alone; an unknown id is no ware');
  for (const r of [row(''), row(undefined), { handle: 'Courier', created_at: AFTER, registered_at: AFTER }]) {
    assert.ok(!titlesHeld(r, {}).includes('veilcourier'));
    assert.deepEqual([aurasHeld(r, {}), glyphsOf(r, {}, AFTER + 30 * 86_400), iconsHeld(r, {}), armoryHeld(r, {})], [[], [], [], []], 'without the row\'s wares, none');
  }
  const guest = row(ALL, { handle: null, registered_at: null });
  assert.deepEqual([cabinetKeys(guest, 'aura'), aurasHeld(guest, {}), armoryHeld(guest, {})], [[], [], []], 'a guest holds none');
  assert.deepEqual(cabinetKeys(all, 'nonsuch'), []);
  assert.deepEqual(discordHeld(all, 'aura'), cabinetKeys(all, 'aura'));
  const worn = row(ALL, { title: 'veilcourier', aura: 'veilwake', icon: 'tidecompass', armory: 'ccecc' });
  assert.deepEqual([titleWorn(worn, {}), auraWorn(worn, {}), iconWorn(worn, {}), armoryWorn(worn, {})], ['veilcourier', 'veilwake', 'tidecompass', 'ccecc']);
  assert.deepEqual([auraWorn({ ...worn, discord_wares: '' }, {}), armoryWorn({ ...worn, discord_wares: '' }, {})], [undefined, undefined], 'worn no longer once not held');
  const admin = { handle: 'Mac', created_at: AFTER, registered_at: AFTER };
  const env = { DEVELOPER_HANDLES: 'Mac' };
  assert.ok(glyphsOf(admin, env, AFTER + 30 * 86_400).includes('waxseal'), 'an Admin holds the seal');
  assert.ok(aurasHeld(admin, env).includes('veilwake') && armoryHeld(admin, env).includes('tideedge') && iconsHeld(admin, env).includes('courier'));
});

test("COURIER'S CABINET end to end: an account whose row holds the wares wears each, and the relay's token signs them all and verifies; the wire keeps them", async () => {
  const { env, call, registered, identityPublic } = await standService();
  const me = await registered('Courier');
  env.DB._raw.prepare('UPDATE players SET discord_wares = ? WHERE id = ?').run(ALL, me.id);
  assert.equal((await call('/v1/account/title', { title: 'veilcourier' }, me.secret)).status, 200);
  assert.equal((await call('/v1/account/aura', { aura: 'eltherictide' }, me.secret)).status, 200);
  assert.equal((await call('/v1/account/icon', { icon: 'courier' }, me.secret)).status, 200);
  assert.equal((await call('/v1/account/armory', { kit: armoryKitOf([...TIDEBOUND_PIECES]) }, me.secret)).status, 200);
  const r = await call('/v1/auth/token', {}, me.secret);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const got = await verifyToken(r.body.token, identityPublic, { subtle, nowS: Math.floor(Date.now() / 1000) });
  assert.ok(got.ok, got.why);
  assert.deepEqual([got.claims.t, got.claims.au, got.claims.pi, got.claims.ak], ['veilcourier', 'eltherictide', 'courier', 'ccecc']);
  assert.ok(got.claims.g.includes('waxseal'), 'the seal signed');
  env.DB._raw.prepare("UPDATE players SET discord_wares = '' WHERE id = ?").run(me.id);
  assert.equal((await call('/v1/account/aura', { aura: 'veilwake' }, me.secret)).status, 403, 'not held, not worn');
  assert.deepEqual(readBadge({ title: 'veilcourier', glyphs: ['waxseal'] }), { title: 'veilcourier', glyphs: ['waxseal'] });
  assert.equal(readAura({ au: 'veilwake' }), 'veilwake');
});

test("COURIER'S CABINET a token carrying every new word at once validates, and one naming a word no vocabulary has does not", async () => {
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const nowS = 1_760_000_000;
  const tok = await mintToken({ s: 'acct-courier', n: 'Courier', k: 'linked', t: 'veilcourier', g: ['waxseal'], au: 'veilwake', pi: 'tidecompass', ak: 'ccecc' }, kp.privateKey, { subtle, nowS });
  const r = await verifyToken(tok, kp.publicKey, { subtle, nowS });
  assert.ok(r.ok, r.why);
  assert.deepEqual([r.claims.t, r.claims.g, r.claims.au, r.claims.pi, r.claims.ak], ['veilcourier', ['waxseal'], 'veilwake', 'tidecompass', 'ccecc']);
  await assert.rejects(mintToken({ s: 'acct-courier', n: 'Courier', k: 'linked', au: 'seawake' }, kp.privateKey, { subtle, nowS }), /refused/, 'an aura not in the vocabulary is never minted');
});

test("COURIER'S CABINET the relay: a look says `tide2` only beside a token's kit that wears the Tidebound Edge - at the hello and at a look; the other glow words as they were", async () => {
  assert.deepEqual({ ...LOOK_GLOW_KIT }, { tide2: 'tideedge' });
  const LOOK = validLook({
    race: 'Breton', gender: 'male', faceIndex: 0,
    items: [{ templateIndex: 113, group: 'Weapons', equipSlot: LOOK_GLOW_SLOTS[0], glow: 'tide2' }, { templateIndex: 114, group: 'Weapons', equipSlot: LOOK_GLOW_SLOTS[1], glow: 'edge2' }],
  });
  assert.deepEqual(LOOK.items.map((it) => it.glow), ['tide2', 'edge2'], 'the wire takes both words');
  const glows = (look) => (look?.items ?? []).map((it) => it.glow ?? null);
  assert.equal(lookGlowWorn(LOOK, 'ccecc'), LOOK, 'worn: the same look');
  assert.equal(lookGlowWorn(LOOK, '0000c'), LOOK);
  for (const kit of ['0000b', 'ccec0', null, undefined, 'zzzzz']) assert.deepEqual(glows(lookGlowWorn(LOOK, kit)), [null, 'edge2'], `not worn (${kit}): tide2 dropped, edge2 kept`);
  assert.equal(lookGlowWorn(undefined, null), undefined, 'no look, none');

  const r = fakeRoom('world:3,12');
  const watcher = r.connect(), liar = r.connect(), owner = r.connect();
  await r.hello(watcher, 'peer-0002');
  const joined = (id) => watcher.sent.filter((m) => m.t === 'join' && m.id === id).at(-1);
  await r.hello(liar, 'peer-0001', null, { look: LOOK, ak: '0b000' });
  assert.deepEqual(glows(joined('peer-0001').look), [null, 'edge2'], 'a hello without the Edge shows no tide');
  await r.hello(owner, 'peer-0003', null, { look: LOOK, ak: 'ccecc' });
  assert.deepEqual(glows(joined('peer-0003').look), ['tide2', 'edge2'], 'a hello with it shows it');
  await r.raw(liar, JSON.stringify({ t: 'look', look: LOOK }));
  assert.deepEqual(glows(joined('peer-0001').look), [null, 'edge2'], 'nor a look frame');
  const later = r.connect();
  await r.hello(later, 'peer-0004');
  const roster = later.sent.find((m) => m.t === 'welcome').peers;
  assert.deepEqual(glows(roster.find((p) => p.id === 'peer-0001').look), [null, 'edge2'], 'the stored look holds none either');
  assert.deepEqual(glows(roster.find((p) => p.id === 'peer-0003').look), ['tide2', 'edge2']);
});
