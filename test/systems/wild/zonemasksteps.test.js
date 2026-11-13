// Cyrodiil's mask is made a step at a time in the held map's idle job (systems/wild/cyrodiilZone.js cyrodiilMaskSteps,
// ui/tamrielInk.js tracedSteps): the box a band of the picture's rows a step, the province's law asked ahead
// CYRODIIL_MASK_STEP_ASKS pixels a step, then the mask made off those answers in a step of its own. The mask is the one
// a build asking the law itself makes, to the byte. A reader on the way gets that whole mask, never a part: it finishes
// the build under way and begins none of its own. A land that moves on the way starts the build again. A slice of the
// job stops where its idle period is spent.
import '../../modsOff.js';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as zone from '../../../src/systems/wild/cyrodiilZone.js';
import * as ink from '../../../src/ui/tamrielInk.js';
import { buildWildMask } from '../../../src/systems/wild/wildZone.js';
import { setTamrielTrace, tamrielTrace, provinceKeyAt, fitBayToPicture, PROVINCE_OF_ID } from '../../../src/world/tamriel/tamrielLand.js';
import { setTamrielFit, tamrielFit, pictureToBay, PICTURE_W, PICTURE_H } from '../../../src/world/tamriel/tamrielFrame.js';
import { traceTamrielPicture, paletteReader } from '../../../src/ui/tamrielTrace.js';
import { theatreAt } from '../../../src/world/worldWide/worldGrid.js';

const { cyrodiilMask, zoneLineOf, provinceWaterAt, CYRODIIL_THEATRE, CYRODIIL_CELL_PX } = zone;

const ARENA2 = process.env.ARENA2_PATH;
const HAVE_ARENA2 = !!ARENA2 && ['TMAP00I0.IMG', 'TAMRIEL2.IMG', 'MAP.PAL', 'WOODS.WLD', 'MAPS.BSA', 'CLIMATE.PAK', 'POLITIC.PAK'].every((f) => existsSync(join(ARENA2, f)));
const realSkip = HAVE_ARENA2 ? false : 'ARENA2_PATH not set (sh tools/fetch-data.sh)';

afterEach(() => {
  ink.setTracedScheduler(null);
  setTamrielTrace(null);
  setTamrielFit(null);
});

/** A 40 x 30 picture (test/world/smoothland.test.js's): the sea round a block of land, Skyrim (3) west of x 20, Cyrodiil
 *  (9) east of it and Elsweyr (7) under y 18, a bay of the sea in Cyrodiil's north-east, and two lone pixels of Cyrodiil
 *  in the south-west. `cut` gives Cyrodiil's east column from y 12 to Elsweyr: another land. */
function picture(cut = false) {
  const w = 40, h = 30, land = new Uint8Array(w * h), province = new Uint8Array(w * h);
  const put = (x, y, p) => { land[y * w + x] = p ? 1 : 0; province[y * w + x] = p; };
  for (let y = 6; y < 25; y++) for (let x = 6; x < 35; x++) if (x + y >= 22) put(x, y, x < 20 ? 3 : y >= 18 ? 7 : 9);
  for (let y = 6; y < 12; y++) for (let x = 30; x < 35; x++) put(x, y, 0);
  put(2, 2, 3); put(2, 26, 9); put(3, 27, 9); put(37, 2, 3); put(36, 3, 3);
  if (cut) for (let y = 12; y < 18; y++) put(34, y, 7);
  return { w, h, land, province };
}
/** The picture past the Bay's east, 32 map pixels a picture pixel. */
const FIT = { ox: -2000, oy: 0, ppu: 32 };
/** The same fit three map pixels east: the cells' lattice falls another way on the land. */
const MOVED = { ox: -2003, oy: 0, ppu: 32 };
const install = (t = picture(), fit = FIT) => { setTamrielFit(fit); setTamrielTrace(t); return t; };

/** The mask as one build makes it, asking the law itself: the province's box off the picture, then buildWildMask over
 *  the cells' lattice on it, every pixel the province's law or its own water. */
function oneShot() {
  const key = PROVINCE_OF_ID[CYRODIIL_THEATRE];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let py = 0; py < PICTURE_H; py++) {
    for (let px = 0; px < PICTURE_W; px++) {
      if (provinceKeyAt(px + 0.5, py + 0.5) !== key) continue;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
  }
  if (x1 < x0) return null;
  const [ax, ay] = pictureToBay(x0 - 1, y0 - 1), [bx, by] = pictureToBay(x1 + 2, y1 + 2);
  const box = { x0: Math.floor(ax), y0: Math.floor(ay), x1: Math.ceil(bx), y1: Math.ceil(by) };
  const cell = CYRODIIL_CELL_PX, ox = Math.floor(box.x0 / cell) * cell, oy = Math.floor(box.y0 / cell) * cell;
  const width = Math.ceil((box.x1 + 1 - ox) / cell), height = Math.ceil((box.y1 + 1 - oy) / cell);
  return buildWildMask({ width, height, ox, oy, cell, pixelIn: (x, y) => theatreAt(x, y) === CYRODIIL_THEATRE || provinceWaterAt(x, y) });
}
const bytesOf = (a) => (a ? Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64') : a);
/** A mask as text: its numbers, its box and its fields to the byte. */
const maskText = (m) => m && JSON.stringify([m.width, m.height, m.ox, m.oy, m.cell, m.maxDepth, m.box, bytesOf(m.inside), bytesOf(m.near), bytesOf(m.depth), bytesOf(m.bits)]);
/** How many steps the zone's mask takes to make on the land installed now (the land is then the mask's). */
function stepsToMake() {
  let steps = 0;
  for (const g = zone.cyrodiilMaskSteps(); !g.next().done; ) steps++;
  return steps;
}

test('THE MASK IN STEPS IS THE ONE BUILD\'S: stepped to its end, Cyrodiil\'s mask is the mask one build asking the law makes, to the byte, with its line; it takes several steps, and steps asked of a whole mask take none', () => {
  install();
  const ref = oneShot();
  assert.ok(ref && ref.box && ref.maxDepth > 0, 'the picture holds the province');
  const steps = stepsToMake(), mask = cyrodiilMask();
  assert.ok(steps >= 6, `${steps} steps`);
  assert.equal(maskText(mask), maskText(ref));
  assert.deepEqual(Object.keys(mask), [...Object.keys(ref), 'line']);
  const line = Object.getOwnPropertyDescriptor(mask, 'line');
  assert.deepEqual([typeof line?.get, line?.enumerable, line?.configurable], ['function', true, true]);
  assert.equal(JSON.stringify(mask.line), JSON.stringify(zoneLineOf(tamrielTrace(), ref)), 'its line is the one the build\'s mask draws');
  assert.equal(stepsToMake(), 0, 'the mask whole: no step');
  assert.equal(cyrodiilMask(), mask, 'the same mask kept');
  // the fit moved: the steps make that land's mask, the one build's there
  setTamrielFit(MOVED);
  const moved = oneShot();
  assert.notEqual(maskText(moved), maskText(ref), 'the moved fit is another mask');
  assert.ok(stepsToMake() >= 6);
  assert.equal(maskText(cyrodiilMask()), maskText(moved));
});

test('A READER ON THE WAY GETS THE WHOLE MASK: an ask after any number of the steps is answered with the whole mask of the land as it is, the one build\'s to the byte, never the last land\'s, and the steps then end; a mask read before is left as it was', () => {
  install();
  const refs = new Map([[FIT, oneShot()]]);
  setTamrielFit(MOVED);
  refs.set(MOVED, oneShot());
  setTamrielFit(FIT);
  const before = cyrodiilMask(), beforeText = maskText(before);
  assert.equal(beforeText, maskText(refs.get(FIT)));
  setTamrielFit(MOVED);
  const steps = stepsToMake();
  for (let k = 0; k <= steps; k++) {
    const fit = k % 2 ? MOVED : FIT;   // the other land than the one whose mask was made last: its mask is to make
    setTamrielFit(fit);
    const g = zone.cyrodiilMaskSteps();
    for (let n = 0; n < k; n++) if (g.next().done) break;
    assert.equal(maskText(before), beforeText, 'a mask read before is not touched by the build');
    const asked = cyrodiilMask();
    assert.equal(maskText(asked), maskText(refs.get(fit)), `the ask after ${k} steps`);
    assert.deepEqual([Object.keys(asked).at(-1), typeof Object.getOwnPropertyDescriptor(asked, 'line')?.get], ['line', 'function'], 'kept with its line');
    assert.equal(g.next().done, true, `the steps end once the ask after ${k} has made the mask`);
    assert.equal(cyrodiilMask(), asked);
  }
});

test('A READER ON THE WAY FINISHES THE BUILD UNDER WAY: an ask after any number of the steps takes up the build they began and begins none of its own - one build for the land, as the steps alone make - and where the fit moved on the way, it begins the new land\'s', () => {
  const t = install();
  const steps = stepsToMake();
  for (let k = 1; k < steps; k++) {
    for (const [change, builds, label] of [
      [() => {}, 1, 'the same land'],
      [() => setTamrielFit(MOVED), 2, 'the fit moved'],
    ]) {
      install({ ...t });
      const begun = zone.maskBuildsBegun();
      const g = zone.cyrodiilMaskSteps();
      for (let n = 0; n < k; n++) assert.equal(g.next().done, false);
      change();
      cyrodiilMask();
      assert.equal(zone.maskBuildsBegun() - begun, builds, `${label}, the ask after ${k} steps: the builds begun`);
      assert.equal(g.next().done, true, `${label}, the ask after ${k} steps: the steps end`);
    }
  }
});

test('A LAND THAT MOVES ON THE WAY STARTS THE BUILD AGAIN: the fit moved, or another trace landed, after any number of the steps - the steps end with the new land\'s mask, never a part of the old one\'s; moved and moved back, the land\'s own', () => {
  const t = install(), ref = oneShot();
  setTamrielFit(MOVED);
  const moved = oneShot();
  const cutPicture = picture(true);
  install(cutPicture);
  const cut = oneShot();
  assert.equal(new Set([maskText(ref), maskText(moved), maskText(cut)]).size, 3, 'three lands, three masks');
  install(t);
  const steps = stepsToMake();
  for (let k = 1; k < steps; k++) {
    for (const [change, want, label] of [
      [() => setTamrielFit(MOVED), moved, 'the fit moved'],
      [() => setTamrielTrace({ ...cutPicture }), cut, 'another trace'],
      [() => { setTamrielFit(MOVED); setTamrielFit(FIT); }, ref, 'moved and moved back'],
    ]) {
      install({ ...t });
      const g = zone.cyrodiilMaskSteps();
      for (let n = 0; n < k; n++) g.next();
      change();
      while (!g.next().done);
      assert.equal(maskText(cyrodiilMask()), maskText(want), `${label} after ${k} steps`);
    }
  }
});

test('A READER AFTER THE LAND MOVED GETS THAT LAND\'S MASK: the fit moved, or another trace landed, after any number of the steps, and a reader asks before the next one - the new land\'s whole mask, the one build\'s to the byte, never the build under way\'s; the steps then end', () => {
  const t = install();
  setTamrielFit(MOVED);
  const moved = oneShot();
  const cutPicture = picture(true);
  install(cutPicture);
  const cut = oneShot();
  install(t);
  const steps = stepsToMake();
  for (let k = 1; k < steps; k++) {
    for (const [change, want, label] of [
      [() => setTamrielFit(MOVED), moved, 'the fit moved'],
      [() => setTamrielTrace({ ...cutPicture }), cut, 'another trace'],
    ]) {
      install({ ...t });
      const g = zone.cyrodiilMaskSteps();
      for (let n = 0; n < k; n++) assert.equal(g.next().done, false);
      change();
      assert.equal(maskText(cyrodiilMask()), maskText(want), `${label} after ${k} steps: the reader's mask`);
      assert.equal(g.next().done, true, `${label} after ${k} steps: the steps end`);
    }
  }
});

test('THE MASK KEPT IS THE LAST WHOLE ONE WHILE ANOTHER IS MADE: the land moved and some of its steps taken, then moved back - the reader gets the mask it had, the same object, and the steps end', () => {
  const t = install();
  setTamrielFit(MOVED);
  const steps = stepsToMake();
  for (let k = 1; k < steps; k++) {
    install({ ...t });
    const kept = cyrodiilMask();
    setTamrielFit(MOVED);
    const g = zone.cyrodiilMaskSteps();
    for (let n = 0; n < k; n++) assert.equal(g.next().done, false);
    setTamrielFit(FIT);
    assert.ok(cyrodiilMask() === kept, `back after ${k} steps: the mask kept`);   // a boolean: the mask is too big to report
    assert.equal(g.next().done, true, `back after ${k} steps: its land's mask whole, the steps end`);
  }
});

test('A SPENT IDLE PERIOD ENDS A SLICE: the held map\'s idle job takes one step where the period is spent, as many as it has time for up to TRACED_SLICE_STEPS, and the next period takes the rest; the chains and the zone\'s mask are the whole walk\'s', () => {
  const t = install();   // no scheduler yet: the landing starts no job
  const queue = [];
  ink.setTracedScheduler((run) => queue.push(run));
  const job = ink.startTracedJob(tamrielTrace());
  assert.equal(queue.length, 1);
  queue.shift()({ timeRemaining: () => 0 });
  assert.deepEqual([job.slices, job.steps, queue.length], [1, 1, 1], 'a spent period: one step, the rest the next one\'s');
  let left = 3;
  queue.shift()({ timeRemaining: () => --left });
  assert.deepEqual([job.slices, job.steps], [2, 4], 'a period spent after three steps: three');
  queue.shift()({ timeRemaining: () => 50 });
  assert.deepEqual([job.slices, job.steps], [3, 4 + ink.TRACED_SLICE_STEPS], 'a period with time in it: the slice\'s steps');
  queue.shift()();
  assert.deepEqual([job.slices, job.steps], [4, 4 + 2 * ink.TRACED_SLICE_STEPS], 'no deadline handed: the slice\'s steps');
  let most = 0;
  while (queue.length) {
    const steps = job.steps;
    queue.shift()({ timeRemaining: () => 0 });
    most = Math.max(most, job.steps - steps);
  }
  assert.equal(most, 1, 'each spent period one step');
  assert.ok(job.done && job.slices > 100, `${job.slices} slices`);
  const made = ink.tracedChains(tamrielTrace());
  assert.equal(JSON.stringify(made), JSON.stringify(ink.tracedChains({ w: t.w, h: t.h, land: t.land, province: t.province })), 'the whole walk\'s chains');
  assert.equal(maskText(cyrodiilMask()), maskText(oneShot()), 'the one build\'s mask');
});

test('THE IDLE WALK MAKES THE MASK OVER ITS STEPS: a walk of the traced chains on a land whose mask is not made takes the mask\'s own steps before its own, so no step of it makes the mask whole', () => {
  const t = install();
  let stale = 0;
  for (const g = ink.tracedSteps({ ...t }); !g.next().done; ) stale++;
  install({ ...t });
  cyrodiilMask();   // the same picture landed again, its mask made at once
  let made = 0;
  for (const g = ink.tracedSteps({ ...t }); !g.next().done; ) made++;
  assert.ok(stale - made >= 6, `${stale - made} steps more where the mask was to make`);
  install({ ...t });
  assert.equal(stale - made, stepsToMake(), 'the mask\'s own steps');
});

test('ON A PAGE THE IDLE PERIOD\'S DEADLINE REACHES THE SLICE: the idle job\'s own scheduler hands requestIdleCallback\'s deadline on, so a spent period takes one step and one with time in it the slice\'s steps', async () => {
  install();   // landed before the page's module is loaded: no job of its own yet
  const idle = [];
  globalThis.requestIdleCallback = (run) => idle.push(run);
  const page = await import('../../../src/ui/tamrielInk.js?zonemasksteps');
  try {
    const job = page.startTracedJob(tamrielTrace());
    assert.equal(idle.length, 1);
    idle.shift()({ didTimeout: false, timeRemaining: () => 0 });
    assert.deepEqual([job.slices, job.steps, idle.length], [1, 1, 1]);
    idle.shift()({ didTimeout: false, timeRemaining: () => 50 });
    assert.deepEqual([job.slices, job.steps], [2, 1 + page.TRACED_SLICE_STEPS]);
  } finally {
    page.setTracedScheduler(null);
    delete globalThis.requestIdleCallback;
  }
});

test('THE FREEWARE\'S PICTURE: on the player\'s own trace and fit, and on that fit moved three pixels, the mask in steps is the one build\'s to the byte - a reader on the way gets it whole - and its asks take twenty steps and more', { skip: realSkip }, async () => {
  const f = (n) => new Uint8Array(readFileSync(join(/** @type {string} */ (ARENA2), n)));
  const { ImgFile } = await import('../../../src/formats/imgFile.js');
  const { DFPalette } = await import('../../../src/formats/dfPalette.js');
  const { WoodsFile } = await import('../../../src/formats/woodsFile.js');
  const { MapsFile } = await import('../../../src/formats/mapsFile.js');
  const { isWaterPixel } = await import('../../../src/ui/overworldModel.js');
  const pic = new ImgFile(); pic.load(f('TMAP00I0.IMG'), 'TMAP00I0.IMG');
  const pal = new DFPalette(); pal.load(f('MAP.PAL'), 'MAP.PAL');
  const pk = new ImgFile(); pk.load(f('TAMRIEL2.IMG'), 'TAMRIEL2.IMG');
  const trace = traceTamrielPicture(pk.getDFBitmap(), pic.getDFBitmap(), paletteReader(pal));
  const woods = new WoodsFile(); woods.load(f('WOODS.WLD'));
  const maps = new MapsFile(); maps.load(f('MAPS.BSA'), f('CLIMATE.PAK'), f('POLITIC.PAK'));
  const fit = /** @type {any} */ (fitBayToPicture({ bayLand: (x, y) => !isWaterPixel(maps.getClimateIndex(x, y), woods.getHeightMapValue(x, y)), trace }));
  setTamrielTrace(trace);
  setTamrielFit({ ox: fit.ox * fit.ppu, oy: fit.oy * fit.ppu, ppu: fit.ppu });
  const ref = oneShot();
  const steps = stepsToMake();
  assert.equal(maskText(cyrodiilMask()), maskText(ref));
  assert.ok(steps >= 1 + Math.floor((ref.width * ref.height) / zone.CYRODIIL_MASK_STEP_ASKS), `${steps} steps for ${ref.width * ref.height} cells`);
  assert.ok(steps >= 20);
  const own = tamrielFit();
  setTamrielFit({ ...own, ox: own.ox + 3 });
  const moved = oneShot();
  assert.notEqual(maskText(moved), maskText(ref));
  const g = zone.cyrodiilMaskSteps();
  for (let n = 0; n < 10; n++) g.next();
  assert.equal(maskText(cyrodiilMask()), maskText(moved), 'a reader after ten steps');
  assert.equal(g.next().done, true);
});
