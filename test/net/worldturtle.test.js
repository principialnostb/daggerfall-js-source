// Eterna's own: the World Turtle title, its turtle glyph and the Worldshell aura - a turtle beside the name, and a
// turtle's shell in green and purple at the feet, seven hexagons making one big one on the Flower of Life of Eterna's
// own art. One handle list grants all three; the aura's shader is run here.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { TITLES, GLYPHS, AURAS, verifyToken } from '../../src/net/identityToken.js';
import {
  TITLE_TEXT, AURA_TEXT, AURA_PAINT, TITLE_RGBA, TITLE_GRADIENT, TITLE_EDGE, GLYPH_RGBA, GLYPH_GRADIENT, GLYPH_DETAIL, GLYPH_MARK,
  GLYPH_PATH, GLYPH_STROKE, FONT_GLYPH_MIN, FONT_GLYPH_MAX, cssRgba, titleBadge, glyphBadges, glyphDetails,
  SHELL_JADE, SHELL_VIOLET, SHELL_LILAC, SHELL_DEEP, SHELL_OCEAN,
} from '../../src/ui/playerBadge.js';
import { GLYPH_LABEL } from '../../src/ui/enhanced/enhancedAccount.js';
import { isStaff } from '../../src/net/staffCommands.js';
import { titlesHeld, glyphsOf, equipRefusal, titleWorn, aurasHeld, auraWorn, auraRefusal, wardrobeOf, TIER_LISTS, TIER_GLYPH, TIER_AURA } from '../../server-account/src/titles.js';
import { readBadge, readAura, badged } from '../../src/net/wire.js';
import { standService } from '../accountDb.mjs';
import {
  AURA_LOOK, AURA_GROUND_R, AURA_CLOCK_PERIOD, AURA_FS, glyphEdges,
  SHELL_PLATE_M, SHELL_STEP_M, SHELL_R, SHELL_FILL, SHELL_PLATES, SHELL_H, SHELL_VEIL_H, SHELL_HZ, SHELL_RGB,
  shellRatesWhole, shellPlateMiddle, shellHexD, shellPlateAt, shellLit,
} from '../../src/render/auraRing.js';
import { glslFunctions, GlslDiscard } from '../glsl.mjs';
import { wardrobeEntry } from '../../src/ui/collections/wardrobeCatalogue.js';

const rd = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const { subtle } = webcrypto;
const toml = rd('server-account/wrangler.toml');
const v = (k) => new RegExp(`^${k} = "([^"]*)"$`, 'm').exec(toml)?.[1];
/** The Worker's config as it reads it: every handle list. */
const ENV = Object.fromEntries([...toml.matchAll(/^([A-Z_]+_HANDLES) = "([^"]*)"$/gm)].map((m) => [m[1], m[2]]));
const AFTER = 1_900_000_000;
const LATER = AFTER + 30 * 86_400;   // past the sprout's two weeks, so the only glyphs are the grants'
const row = (handle, over = {}) => ({ handle, created_at: AFTER, registered_at: AFTER, ...over });
const apart = (a, b) => Math.hypot(...[0, 1, 2].map((i) => (a[i] - b[i]) * 255));
const green = (c) => c[1] > c[0] * 1.5 && c[1] > c[2] * 1.5;
const violet = (c) => c[2] > c[0] && c[0] > c[1];

test('World Turtle vocabulary: the title, the glyph and the aura each join their closed list last, in words and on the account card; the title jade into violet into lilac, edged in black, its one colour apart from every other title', () => {
  assert.equal(TITLES.at(-1), 'worldturtle');
  assert.equal(GLYPHS.at(-1), 'worldturtle');
  assert.equal(AURAS.at(-1), 'worldshell');
  assert.equal(TITLE_TEXT.worldturtle, 'World Turtle');
  assert.equal(AURA_TEXT.worldshell, 'Worldshell');
  assert.equal(GLYPH_LABEL.worldturtle, 'World Turtle', 'named on the account card');
  assert.ok(green(SHELL_JADE) && violet(SHELL_VIOLET) && violet(SHELL_LILAC), 'asked green and purple');
  assert.ok(SHELL_DEEP[1] > SHELL_DEEP[0] && SHELL_DEEP[1] < 0.3, 'the seams a deep green');
  assert.ok(SHELL_OCEAN[2] > SHELL_OCEAN[1] && SHELL_OCEAN[1] > SHELL_OCEAN[0], 'the world an ocean blue');
  assert.deepEqual(TITLE_GRADIENT.worldturtle, [SHELL_JADE, SHELL_VIOLET, SHELL_LILAC], '"World" in the green, "Turtle" into the violet');
  assert.deepEqual(TITLE_EDGE.worldturtle, [0, 0, 0, 1], 'its light end edged in black');
  assert.equal(TITLE_RGBA.worldturtle, SHELL_JADE);
  for (const t of TITLES.filter((x) => x !== 'worldturtle' && TITLE_RGBA[x])) assert.ok(apart(TITLE_RGBA.worldturtle, TITLE_RGBA[t]) > 40, `apart from the ${t}'s (${cssRgba(TITLE_RGBA[t])})`);
  assert.equal(GLYPH_RGBA.worldturtle, SHELL_JADE, 'the turtle in the green, its plates its details');
  assert.equal(GLYPH_GRADIENT.worldturtle, undefined);
  assert.equal(GLYPH_STROKE.worldturtle, false, 'filled');
  assert.equal(GLYPH_MARK.worldturtle, 'T', 'the turtle');
  const marks = GLYPHS.map((g) => GLYPH_MARK[g]);
  assert.equal(new Set(marks).size, marks.length, 'a classic mark of its own');
  assert.ok(GLYPH_MARK.worldturtle.charCodeAt(0) >= FONT_GLYPH_MIN && GLYPH_MARK.worldturtle.charCodeAt(0) <= FONT_GLYPH_MAX, 'inside the font');
  assert.equal(AURA_PAINT.worldshell, 'worldturtle', 'the aura in the title\'s paint');
  const badge = titleBadge({ title: 'worldturtle' });
  assert.deepEqual({ text: badge.text, rgba: badge.rgba, gradient: badge.gradient, edge: badge.edge }, { text: 'World Turtle', rgba: SHELL_JADE, gradient: TITLE_GRADIENT.worldturtle, edge: TITLE_EDGE.worldturtle });
  assert.deepEqual(readBadge({ title: 'worldturtle', glyphs: ['worldturtle'] }), { title: 'worldturtle', glyphs: ['worldturtle'] }, 'the wire keeps it');
  assert.equal(readAura({ au: 'worldshell' }), 'worldshell', 'and the aura');
  assert.deepEqual(badged({ id: 'p1' }, { title: 'worldturtle', au: 'worldshell' }), { id: 'p1', title: 'worldturtle', au: 'worldshell' });
  assert.deepEqual(glyphBadges({ glyphs: ['worldturtle', 'sprout'] }).map((b) => b.key), ['sprout', 'worldturtle'], 'drawn in the vocabulary\'s order');
  assert.deepEqual([wardrobeEntry('title', 'worldturtle').with, wardrobeEntry('aura', 'worldshell').with, wardrobeEntry('glyph', 'worldturtle').with],
    [['aura:worldshell', 'glyph:worldturtle'], ['title:worldturtle', 'glyph:worldturtle'], ['title:worldturtle', 'aura:worldshell']], 'the Collections page names the three together');
});

/** A path's figures (absolute M, L, Q and Z) as their points, in order. */
const figuresOf = (d) => d.split(/(?=M)/).map((sub) => [...sub.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]));
/** Inside a shape filled even-odd over its edges (the shader's own rule). */
const insideOf = (edges, [x, y]) => edges.reduce((n, [ax, ay, bx, by]) => n + ((ay <= y) !== (by <= y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay) ? 1 : 0), 0) % 2 === 1;

test('World Turtle the glyph: a turtle seen from above in seven figures - head, two front flippers, shell, two back flippers, tail - none touching another, mirrored left to right; seven violet plates on the shell, the middle one carrying the world', () => {
  const figs = GLYPH_PATH.worldturtle.split(/(?=M)/);
  assert.equal(figs.length, 7, 'seven figures');
  for (const fig of figuresOf(GLYPH_PATH.worldturtle)) for (const [x, y] of fig) assert.ok(x >= 0 && x <= 16 && y >= 0 && y <= 16, `inside the box: ${x},${y}`);
  const [head, frontL, frontR, shell, backL, backR, tail] = figs.map((f) => glyphEdges(f));
  const all = [head, frontL, frontR, shell, backL, backR, tail], whole = glyphEdges(GLYPH_PATH.worldturtle);
  for (let x = 0.05; x < 16; x += 0.2) for (let y = 0.05; y < 16; y += 0.2) {
    assert.ok(all.filter((e) => insideOf(e, [x, y])).length <= 1, `no two figures overlap at ${x.toFixed(2)},${y.toFixed(2)}`);
    assert.equal(insideOf(whole, [x, y]), insideOf(whole, [16 - x, y]), 'mirrored left to right');
  }
  assert.ok(insideOf(head, [8, 2]) && insideOf(shell, [8, 8.7]) && insideOf(tail, [8, 14.6]), 'the head above the shell, the tail below');
  assert.ok(insideOf(frontL, [1.6, 4.6]) && insideOf(frontR, [14.4, 4.6]), 'the front flippers swept out');
  assert.ok(insideOf(backL, [2.6, 13.6]) && insideOf(backR, [13.4, 13.6]), 'the back flippers');
  const dets = GLYPH_DETAIL.worldturtle;
  assert.deepEqual(glyphDetails(dets), dets, 'a list');
  assert.deepEqual(dets.map((d) => cssRgba(d.rgba)), [SHELL_VIOLET, SHELL_OCEAN].map(cssRgba), 'the plates, then the world');
  const plates = figuresOf(dets[0].path);
  assert.equal(plates.length, 7, 'seven plates');
  for (const plate of plates) {
    assert.equal(plate.length, 6, 'each a hexagon');
    for (const p of plate) assert.ok(insideOf(shell, p), `a plate on the shell (${p})`);
  }
  const plateEdges = glyphEdges(dets[0].path);
  assert.ok(!insideOf(plateEdges, [8, 7.1]), 'the green seam showing between the middle plate and the one above');
  for (const p of figuresOf(dets[1].path)[0]) assert.ok(insideOf(glyphEdges(dets[0].path.split(/(?=M)/)[0]), p), `the world on the middle plate (${p})`);
});

test('World Turtle grant: WORLD_TURTLE_HANDLES names Eterna, and the list grants the title, its glyph and the Worldshell together, case-folded; worn while held; off the list all three go; a guest and every other handle hold none', () => {
  assert.equal(v('WORLD_TURTLE_HANDLES'), 'Eterna', 'for the in-game account Eterna');
  assert.equal(TIER_LISTS.worldturtle, 'WORLD_TURTLE_HANDLES');
  assert.equal(TIER_GLYPH.worldturtle, 'worldturtle');
  assert.equal(TIER_AURA.worldturtle, 'worldshell');
  for (const h of ['Eterna', 'eterna', 'ETERNA']) {
    const p = row(h);
    assert.deepEqual(titlesHeld(p, ENV), ['worldturtle'], `${h}: by name, case-folded`);
    assert.deepEqual(glyphsOf(p, ENV, LATER), ['worldturtle'], 'and its glyph');
    assert.deepEqual(aurasHeld(p, ENV), ['worldshell'], 'and the shell');
    assert.equal(equipRefusal('worldturtle', p, ENV), null);
    assert.equal(auraRefusal('worldshell', p, ENV), null);
  }
  const et = row('Eterna', { title: 'worldturtle', aura: 'worldshell' });
  assert.equal(titleWorn(et, ENV), 'worldturtle');
  assert.equal(auraWorn(et, ENV), 'worldshell');
  const w = wardrobeOf(et, ENV, LATER);
  assert.deepEqual([w.titles, w.title, w.glyphs, w.auras, w.aura], [['worldturtle'], 'worldturtle', ['worldturtle'], ['worldshell'], 'worldshell']);
  const off = { ...ENV, WORLD_TURTLE_HANDLES: '' };
  assert.deepEqual([titlesHeld(et, off), glyphsOf(et, off, LATER), aurasHeld(et, off)], [[], [], []], 'off the list, all three go');
  assert.equal(auraWorn(et, off), undefined);
  assert.deepEqual(titlesHeld({ ...et, handle: null }, ENV), [], 'a guest holds none');
  for (const h of ['trakel', 'Blob-Marley', 'SylviaBun', 'Eterna2', 'Etern', 'Eter na']) {
    assert.ok(!titlesHeld(row(h), ENV).includes('worldturtle'), `${h} does not hold it`);
    assert.equal(auraRefusal('worldshell', row(h), ENV), 'not-held');
  }
  assert.equal(isStaff(['worldturtle']), false, 'a glyph, not a staff role');
});

test('World Turtle the service end to end: Eterna registers and holds all three, wears the title and the shell, and the token signs all three and verifies', async () => {
  const { call, registered, identityPublic } = await standService({ WORLD_TURTLE_HANDLES: 'Eterna' });
  const me = await registered('Eterna');
  assert.equal((await call('/v1/account/title', { title: 'worldturtle' }, me.secret)).status, 200);
  assert.equal((await call('/v1/account/aura', { aura: 'worldshell' }, me.secret)).status, 200);
  const r = await call('/v1/auth/token', {}, me.secret);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const got = await verifyToken(r.body.token, identityPublic, { subtle, nowS: Math.floor(Date.now() / 1000) });
  assert.ok(got.ok, got.why);
  assert.equal(got.claims.t, 'worldturtle');
  assert.equal(got.claims.au, 'worldshell');
  assert.ok(got.claims.g.includes('worldturtle'), 'the turtle signed');
});

test('Worldshell the look\'s law: its own kind, added whole; seven plates, the seed\'s circles through their neighbours\' middles and the ring where the outer circles touch; each point on one plate or in a seam, turning with the shell; the wave round the middle and every rate whole over the clock; its colours the title\'s', () => {
  const look = AURA_LOOK.worldshell;
  assert.deepEqual({ ...look }, { kind: 21, ringR: SHELL_R, flameH: SHELL_H, glyphs: 0 });
  assert.equal(new Set(Object.values(AURA_LOOK).map((l) => l.kind)).size, Object.keys(AURA_LOOK).length, 'a kind of its own');
  for (const a of AURAS) assert.ok(AURA_LOOK[a], `a look for every aura: ${a}`);
  assert.equal(SHELL_PLATES, 7, 'seven hexagons making one big one');
  assert.ok(Math.abs(SHELL_STEP_M - Math.sqrt(3) * SHELL_PLATE_M) < 1e-12 && Math.abs(SHELL_R - 2 * SHELL_STEP_M) < 1e-12, 'the seed of life: its circles through their neighbours\' middles, the ring where the outer ones touch');
  assert.ok(SHELL_R < AURA_GROUND_R - 0.2 && SHELL_R > 0.6, 'clear of the boots, inside the ground');
  assert.ok(SHELL_VEIL_H < SHELL_H, 'the veil below the motes');
  for (let k = 0; k < SHELL_PLATES; k++) {
    const [x, y] = shellPlateMiddle(k);
    assert.equal(shellPlateAt(x, y), k, `plate ${k} at its middle`);
    const turn = 1.234, c = Math.cos(turn), s = Math.sin(turn);
    assert.equal(shellPlateAt(c * x - s * y, s * x + c * y, turn), k, `plate ${k} turned with the shell`);
  }
  const [x1, y1] = shellPlateMiddle(1), [x2, y2] = shellPlateMiddle(2);
  assert.equal(shellPlateAt(x1 / 2, y1 / 2), -1, 'a seam between the middle and plate 1');
  assert.equal(shellPlateAt((x1 + x2) / 2, (y1 + y2) / 2), -1, 'a seam between plates 1 and 2');
  assert.equal(shellPlateAt(SHELL_R * 0.95, 0.02), -1, 'nothing past the seven');
  const edge = SHELL_PLATE_M * 0.8660254 * SHELL_FILL;
  assert.ok(shellHexD(edge * 0.99, 0) < edge && shellHexD(0, SHELL_PLATE_M * SHELL_FILL * 0.99) < edge && shellHexD(0, SHELL_PLATE_M * SHELL_FILL * 1.01) > edge, 'pointy at +-y, flat at +-x');
  const peaks = [1, 2, 3, 4, 5, 6].map((k) => [...Array(1000).keys()].map((i) => (i / 1000) / SHELL_HZ.wave).reduce((b, t) => (shellLit(k, t) > shellLit(k, b) ? t : b), 0));
  for (let k = 1; k < 6; k++) assert.ok(peaks[k] > peaks[k - 1], `plate ${k + 1} lights after plate ${k}`);
  for (let k = 1; k <= 6; k++) assert.ok(Math.abs(shellLit(k, 3.7) - shellLit(k, 3.7 + AURA_CLOCK_PERIOD)) < 1e-9, `the wave whole at the wrap (${k})`);
  assert.ok(shellRatesWhole(), 'every rate whole over the clock');
  assert.deepEqual(SHELL_RGB, { jade: SHELL_JADE.slice(0, 3), violet: SHELL_VIOLET.slice(0, 3), lilac: SHELL_LILAC.slice(0, 3), deep: SHELL_DEEP.slice(0, 3), ocean: SHELL_OCEAN.slice(0, 3) }, 'one family with the title and the turtle');
});

// The shader, run: the fragment's own functions over the aura's uniforms.
const shellAt = (kind, vP, { t = 0, kindle = 1, world = [0, 0, 0], eye = [0, 1.2, 5], px = 0.001 } = {}) => {
  const f = glslFunctions(AURA_FS, {
    vP, vS: [0, 0, 0], vWorld: world, uKind: kind, uAura: 21, uTime: t, uSeed: 0, uKindle: kindle, uRingR: SHELL_R, uGroundR: AURA_GROUND_R,
    uFlameH: SHELL_H, uFogMode: 0, uFogDensity: 0, uFogRange: [0, 1], uCamPos: eye, uAt: [0, 0, 0], uFocus: [0, 0, 0, 0],
    dFdx: () => [px, 0, 0], dFdy: () => [0, px, 0],
  });
  try { f.main(); } catch (e) { if (e instanceof GlslDiscard) return null; throw e; }
  return f.globals.o;
};
const sum = (c) => c[0] + c[1] + c[2];
const mean = (cs) => [0, 1, 2].map((i) => cs.reduce((s, c) => s + c[i], 0) / cs.length);

test('Worldshell the shader RUN: a plate glows violet and its rim jade, the seam between plates dark, the middle plate carries the world in blue and green, the ring lilac; nothing past the ground, nothing unkindled, the same at the wrap; on the strip a veil at the foot gone higher up, the same both sides of the seam behind the wearer', () => {
  const edge = SHELL_PLATE_M * 0.8660254 * SHELL_FILL;
  const [mx, my] = shellPlateMiddle(2);
  const inner = [];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) inner.push(shellAt(0, [mx + i * edge * 0.12, my + j * edge * 0.12]));
  const plate = mean(inner);
  assert.ok(violet(plate) && plate[2] > plate[1] * 1.3, `a plate violet (${plate.map((x) => x.toFixed(3))})`);
  const rim = shellAt(0, [mx + edge - 0.006, my]);
  assert.ok(rim[1] > rim[0] * 1.4 && rim[1] > plate[1] * 2, `its rim jade (${rim.map((x) => x.toFixed(3))})`);
  const [ax, ay] = shellPlateMiddle(1);
  const seam = shellAt(0, [ax / 2, ay / 2]);
  assert.ok(sum(seam) < sum(plate) * 0.5, `the seam dark (${sum(seam).toFixed(3)} against ${sum(plate).toFixed(3)})`);
  const globe = shellAt(0, [0.03, 0.02]);
  assert.ok(globe[2] + globe[1] > globe[0] * 3, `the world in the middle plate, ocean and land (${globe.map((x) => x.toFixed(3))})`);
  const ring = shellAt(0, [SHELL_R * Math.cos(Math.PI / 6), SHELL_R * Math.sin(Math.PI / 6)]);
  assert.ok(sum(ring) > 1 && ring[2] >= ring[0] && ring[0] > ring[1] * 0.85, `the ring lilac (${ring.map((x) => x.toFixed(3))})`);
  assert.equal(shellAt(0, [AURA_GROUND_R + 0.05, 0]), null, 'nothing past the ground');
  assert.deepEqual(shellAt(0, [mx, my], { kindle: 0 }).slice(0, 3), [0, 0, 0], 'nothing before it kindles');
  for (const p of [[mx, my], [0.31, -0.2], [SHELL_R, 0]]) {
    const a = shellAt(0, p, { t: 13.3 }), b = shellAt(0, p, { t: 13.3 + AURA_CLOCK_PERIOD });
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-6, `the same at the wrap (${p})`);
  }
  const foot = mean([...Array(24).keys()].map((i) => shellAt(1, [i / 24, 0.02], { world: [0.6, 0.03, 0] })));
  const high = mean([...Array(24).keys()].map((i) => shellAt(1, [i / 24 + 0.01, (SHELL_VEIL_H + 0.25) / SHELL_H], { world: [0.6, 1, 0] })));
  assert.ok(sum(foot) > 0.1 && sum(high) < sum(foot) * 0.3, `the veil at the foot (${sum(foot).toFixed(3)}), gone above it (${sum(high).toFixed(3)})`);
  for (let vq = 0.004; vq < 0.3; vq += 0.013) {
    const a = shellAt(1, [0, vq], { t: 7.7 }), b = shellAt(1, [1, vq], { t: 7.7 });
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-6, `no seam behind the wearer at ${vq.toFixed(3)}`);
  }
  assert.deepEqual(shellAt(1, [0.3, 0.05], { kindle: 0 }).slice(0, 3), [0, 0, 0], 'the veil unkindled');
});
