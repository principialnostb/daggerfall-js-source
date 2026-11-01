// LOAD-STALL 2 (bible/07-Rendering/Load-Stalls.md section 3): the reach sweep - measured by tools/mwBuildProbe.mjs as
// 74% of an equip's build, 500 ms on retail and ~3 s with Better Bodies and Better Hands, held on the frame's thread -
// remembered by the arm it measured, swept in slices, and owed by a new arm to the frames rather than to the build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractTracks, sampleTrack } from '../../src/formats/morrowind/mwAnim.js';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { accumRootRef } from '../../src/formats/morrowind/mwSkin.js';
import { assembleFirstPersonArm, poseAssembly, clipUnionBounds, clipUnionBoundsSliced, sweepShadowOf } from '../../src/formats/morrowind/mwFirstPerson.js';
import { armShapeKey } from '../../src/combat/fpArm.js';

const f = (n) => new Uint8Array(readFileSync(new URL(`../fixtures/mw/${n}`, import.meta.url)));
const fpArm = readFileSync('src/combat/fpArm.js', 'utf8');

async function fixture() {
  const arm = await assembleFirstPersonArm({
    skeletonBytes: f('armskel.nif'),
    parts: [{ slot: 'hand', bytes: f('armhand.nif') }, { slot: 'upperarm', bytes: f('armcuff.nif') }],
  });
  const tracks = extractTracks(parseNif(f('armidle.kf')));
  const accumRoot = accumRootRef(arm.skeleton, tracks);
  return { arm, at: (a) => (t) => poseAssembly(a, { tracks, sampleTrack, time: t, accumRoot }) };
}
const TIMES = Array.from({ length: 40 }, (_, i) => i * 0.1);

test('LOAD-STALL 2: the sliced sweep is the same union as the whole one, handing the thread back each budget (mutants: a sample skipped at a yield; no yield)', async () => {
  const { arm, at } = await fixture();
  const whole = clipUnionBounds(arm, at(arm), TIMES);
  let clock = 0; let yields = 0;
  const sliced = await clipUnionBoundsSliced(arm, at(arm), TIMES, { budgetMs: 3, now: () => (clock += 1), yieldNow: async () => { yields++; } });
  assert.deepEqual(sliced, whole);
  assert.ok(yields >= TIMES.length / 4, `${yields} yields over ${TIMES.length} poses at a budget of three ticks`);
});

test('LOAD-STALL 2: a shadow sweeps the arm\'s union and poses nothing of the arm - its raw pose, its mats, its positions (mutants: the shadow sharing the outputs; the arm posed)', async () => {
  const { arm, at } = await fixture();
  at(arm)(0.35);
  const before = { rawPose: arm.rawPose, mats: arm.mats, time: arm.time, positions: arm.pieces.map((p) => Float32Array.from(p.positions)) };
  const shadow = sweepShadowOf(arm);
  const viaShadow = await clipUnionBoundsSliced(shadow, at(shadow), TIMES, { yieldNow: async () => {} });
  assert.equal(arm.rawPose, before.rawPose); assert.equal(arm.mats, before.mats); assert.equal(arm.time, before.time);
  arm.pieces.forEach((p, i) => assert.deepEqual(Float32Array.from(p.positions), before.positions[i], `piece ${i} posed by the shadow's sweep`));
  assert.deepEqual(viaShadow, clipUnionBounds(arm, at(arm), TIMES), 'the shadow measures the arm');
});

test('LOAD-STALL 2: armShapeKey tells arms apart by their pieces and not by their pose (mutants: a piece unread; the posed copy read)', async () => {
  const { arm, at } = await fixture();
  const k = armShapeKey(arm.pieces);
  at(arm)(1.2);
  assert.equal(armShapeKey(arm.pieces), k, 'a pose is not another arm');
  assert.equal(armShapeKey([...arm.pieces].reverse()), k, 'the order pieces bound in is not another arm');
  assert.notEqual(armShapeKey(arm.pieces.slice(1)), k, 'a piece fewer is another arm');
  const moved = arm.pieces.map((p, i) => (i ? p : { ...p, batch: { ...p.batch, positions: p.batch.positions.map((v) => v + 1) } }));
  assert.notEqual(armShapeKey(moved), k, 'another mesh of the same size is another arm');
});

test('LOAD-STALL 2: the build remembers the union by its arm, owes a new one to the frames on a shadow, and the rig lands it only on the arm it measured (mutants: the memo unread; the sweep inside the build; a late reach over a swapped hand; the preview swept)', () => {
  assert.match(fpArm, /let union = reachKey \? REACH_CACHE\.get\(reachKey\) \?\? null : null;/);
  assert.match(fpArm, /if \(gen === null\) union = await clipUnionBoundsSliced\(arm, poseAt, sweep\);/);
  assert.match(fpArm, /const shadow = sweepShadowOf\(arm\);/);
  assert.match(fpArm, /if \(r == null \|\| built !== res \|\| res\.arm\.pieces !== piecesAt\) return;/);
  assert.match(fpArm, /if \(held && held\.built === res\) held\.reach0 = r;/);
  const preview = fpArm.slice(fpArm.indexOf('async createAppearancePreviewRig('), fpArm.indexOf('const builtPreview = await previewRig.build(opts);'));
  assert.match(preview, /reachSweep: false/);
  for (const memo of ['REACH_CACHE', 'ESM_MERGE_CACHE']) {
    assert.match(fpArm, new RegExp(`HEAD_PORTRAIT_CACHE, REACH_CACHE, ESM_MERGE_CACHE\\]\\) m\\.clear\\(\\)`), `${memo} outlives its generation`);
  }
});

test('LOAD-STALL 2: the load order\'s records are joined once a generation (mutant: joined at every equip)', () => {
  assert.match(fpArm, /let merged = mergeKey \? ESM_MERGE_CACHE\.get\(mergeKey\) : undefined;/);
  assert.match(fpArm, /if \(mergeKey\) ESM_MERGE_CACHE\.set\(mergeKey, merged\);/);
});
