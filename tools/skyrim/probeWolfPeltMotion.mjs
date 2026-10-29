// Real local NIF + armour + KF integration probe; does not launch or modify a game.
// node tools/skyrim/probeWolfPeltMotion.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { assembleFirstPersonArm, poseAssembly } from '../../src/formats/morrowind/mwFirstPerson.js';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { extractTracks, sampleTrack, collectTextKeys, parseAnimGroups, normalizeTextKeys } from '../../src/formats/morrowind/mwAnim.js';
import { accumRootRef } from '../../src/formats/morrowind/mwSkin.js';
import { createWolfPeltMotion, stepWolfPeltMotion } from '../../src/formats/morrowind/mwWolfPeltMotion.js';
import { BETTER_BODY, FEMALE_SKELETON } from './mwBody.mjs';

const bytes = (p) => new Uint8Array(readFileSync(p));
const names = ['iron_cuirass', 'iron_skirt', 'iron_pauldron_left', 'iron_pauldron_right', 'iron_gauntlet_left', 'iron_gauntlet_right', 'iron_boot_left', 'iron_boot_right', 'iron_greave_left', 'iron_greave_right', 'steel_plate_helm_horned', 'wolf_pelt_brown'];
const parts = names.map((n) => ({ slot: n.startsWith('wolf_') ? 'cloak (wolf_pelt_cloak)' : n, bones: [], bytes: bytes(`src/assets/mw/meshes/${n}.nif`) }));
parts.push({ slot: 'body', bones: [], bytes: bytes(BETTER_BODY()) });
const arm = await assembleFirstPersonArm({ skeletonBytes: bytes(FEMALE_SKELETON), parts });
if (!arm.ok) throw new Error(arm.error);
const nif = parseNif(bytes('Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim_female.kf'));
const tracks = extractTracks(nif), groups = parseAnimGroups(normalizeTextKeys(collectTextKeys(nif)));
const accumRoot = accumRootRef(arm.skeleton, tracks);
const state = createWolfPeltMotion(arm.pieces);
const under = new Set(parts.map((p) => p.slot).filter((s) => !s.startsWith('cloak')));
const out = 'scratch/wolf-motion'; mkdirSync(out, { recursive: true });
const report = { source: 'runtime skinning with local MAO KF; offline probe, not an in-game capture', stages: [] };
for (const [name, gait, frames] of [['walkforward', .65, 90], ['runforward', 1, 90], ['idle4', 0, 240]]) {
  const group = groups.get(name);
  if (!group) throw new Error(`Missing local KF group: ${name}`);
  const start = group.loopStart ?? group.start, stop = group.loopStop ?? group.stop;
  let maxOffset = 0, contactFrames = 0, maxContactDemand = 0, elapsed = 0;
  const times = [];
  for (let f = 0; f < frames; f++) {
    const phase = (f / 60 / (stop - start)) % 1;
    poseAssembly(arm, { tracks, sampleTrack, time: start + phase * (stop - start), accumRoot });
    const then = performance.now();
    stepWolfPeltMotion(state, arm, 1 / 60, { gait, gaitPhase: phase, yaw: name === 'runforward' ? f / 180 : 0 }, under);
    times.push(performance.now() - then);
    if (state.contacts) contactFrames++;
    maxContactDemand = Math.max(maxContactDemand, state.maxContactDemand);
    for (const l of state.layers) {
      if (!l.piece.positions.every(Number.isFinite)) throw new Error('Non-finite posed pelt');
      for (let i = 0; i < l.base.length; i += 3) maxOffset = Math.max(maxOffset, Math.hypot(...[0, 1, 2].map((k) => l.piece.batch.positions[i + k] - l.base[i + k])));
    }
    elapsed += 1 / 60;
  }
  times.sort((a, b) => a - b);
  const sample = { stage: name, seconds: elapsed, maxBindOffset: maxOffset, contactFrames, maxContactDemand, medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.floor(times.length * .95)], endNodes: state.nodes.map((n) => ({ ...n })) };
  report.stages.push(sample);
  writeFileSync(`${out}/${name}.json`, JSON.stringify(arm.pieces.map((p) => ({ name: p.batch?.name ?? p.slot, positions: Array.from(p.positions), indices: Array.from(p.indices), uvs: Array.from(p.uvs ?? []) }))));
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
