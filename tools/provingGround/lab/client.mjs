// Codex and Claude use the SAME API as the panel. No console copying or arbitrary evaluation.
//
//   node tools/provingGround/lab/client.mjs <command> [argument] [--out file] [--loadouts a,b] [--scenarios x,y]
//                                           [--body female|male] [--seed n] [--geometry everyNFrames]
//
//   status | suite | drills | library | loadouts | rig | runs | report | export | views | repeat
//   load <scenario.json | name[@loadout]>   advance <frames>   run   seek <frame>   mark <note>
//   geometry                                the meshes of this frame
//   pose [bone,bone]                        this frame's pose by bone
//   tweak <layers.json | clear>             the edit's layers (no argument reads them)
//   baseline save|check|list [label]        a run kept as the accepted one, a run read against it
//   compare <runA> <runB>                   two stored runs, metric by metric
//   play <name[@loadout]>                   load, run and report in one go
//   matrix                                  each loadout through the signature set, read against the reference fighter
//   batch <count>                           the suite's first runs (LAB1)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import http from 'node:http';

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(`--${name}`); if (i < 0) return null; const v = argv[i + 1]; if (v == null) throw new Error(`--${name} needs a value`); argv.splice(i, 2); return v; };
const destination = flag('out'), pickLoadouts = flag('loadouts'), pickScenarios = flag('scenarios'), seed = flag('seed'), geometry = flag('geometry'), bodyOf = flag('body');
const [command = 'status', argument, second] = argv;
const base = new URL(process.env.LAB_URL || 'http://localhost:5310');

/** One command over plain http: a long run answers when it ends, however long that is. */
const request = (name, args = {}) => new Promise((resolve, reject) => {
  const body = JSON.stringify({ command: name, args });
  const req = http.request({ host: base.hostname, port: base.port, path: '/__lab/command', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
    let text = '';
    res.setEncoding('utf8'); res.on('data', (c) => { text += c; });
    res.on('end', () => { try { const r = JSON.parse(text); if (r.ok) resolve(r.value); else reject(new Error(r.error)); } catch (e) { reject(e); } });
  });
  req.on('error', reject); req.end(body);
});

/** A scenario by file, or by its library name with an optional `@loadout`. */
async function scenarioOf(word) {
  if (existsSync(word)) { const value = JSON.parse(readFileSync(word, 'utf8')); return value.scenario ?? value; }
  const [name, loadout] = String(word).split('@');
  const found = (await request('library')).find((s) => s.name === name);
  if (!found) throw new Error(`No scenario file or library name: ${word}`);
  return { ...found, ...(loadout ? { loadout } : {}), ...(seed ? { seed: Number(seed) } : {}), ...(geometry ? { geometry: Number(geometry) } : {}), ...(bodyOf ? { body: bodyOf } : {}) };
}
const brief = (r) => ({ id: r.id, scenario: r.scenario.name, loadout: r.scenario.loadout ?? null, summary: r.summary, coverage: r.coverage, findings: r.findings.length, worst: r.findings.slice(0, 12) });

let result;
if (command === 'batch') {
  const suite = await request('suite');
  const limit = Number(argument ?? 3);
  if (!Number.isInteger(limit) || limit < 1 || limit > suite.length) throw new Error(`Batch count must be 1–${suite.length}`);
  result = [];
  for (const spec of suite.slice(0, limit)) {
    await request('load', { scenario: spec });
    const report = await request('run');
    result.push({ name: spec.name, id: report.run.id, analysis: report.run.analysis, coverage: report.run.coverage });
  }
} else if (command === 'play') {
  await request('load', { scenario: await scenarioOf(argument) });
  await request('run');
  result = brief(await request('report'));
} else if (command === 'matrix') {
  const info = await request('loadouts');
  const loadouts = pickLoadouts ? pickLoadouts.split(',') : Object.keys(info.loadouts);
  const plan = await request('plan', { loadouts: [...new Set([info.reference, ...loadouts])], ...(pickScenarios ? { scenarios: pickScenarios.split(',') } : {}), seed: Number(seed ?? 1), geometry: Number(geometry ?? 0), body: bodyOf });
  const ids = {}, runs = [];
  for (const [i, spec] of plan.entries()) {
    process.stderr.write(`matrix ${i + 1}/${plan.length} ${spec.name}\n`);
    await request('load', { scenario: spec });
    await request('run');
    const r = brief(await request('report'));
    (ids[spec.loadout] ??= []).push(r.id); runs.push(r);
  }
  const fighters = {};
  for (const loadout of Object.keys(ids)) fighters[loadout] = await request('signature', { runs: ids[loadout], reference: ids[info.reference] });
  result = { reference: info.reference, fighters, runs };
} else {
  let args = {};
  if (command === 'load') args = { scenario: await scenarioOf(argument) };
  if (command === 'advance') args = { frames: Number(argument ?? 1) };
  if (command === 'seek') args = { frame: Number(argument ?? 0) };
  if (command === 'mark') args = { note: argument };
  if (command === 'pose' && argument) args = { bones: argument.split(',') };
  if (command === 'tweak' && argument) args = { layers: argument === 'clear' ? [] : (() => { const v = JSON.parse(readFileSync(argument, 'utf8')); return v.layers ?? v; })() };
  if (command === 'baseline') args = { ...(argument === 'save' ? { save: true } : argument === 'list' ? { list: true } : {}), ...(second ? { label: second } : {}) };
  if (command === 'compare') args = { a: argument, b: second };
  result = await request(command, args);
}
const json = JSON.stringify(result, null, 2);
if (destination) writeFileSync(destination, json);
else console.log(json);
