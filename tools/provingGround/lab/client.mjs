// Codex and Claude use the SAME API as the panel. No console copying or arbitrary evaluation.
import { readFileSync, writeFileSync } from 'node:fs';
const [command = 'status', argument, destination] = process.argv.slice(2);
const base = process.env.LAB_URL || 'http://localhost:5310';
const request = async (name, args = {}) => {
  const response = await fetch(`${base}/__lab/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: name, args }) });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
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
} else {
  let args = {};
  if (command === 'load') { const value = JSON.parse(readFileSync(argument, 'utf8')); args = { scenario: value.scenario ?? value }; }
  if (command === 'advance') args = { frames: Number(argument ?? 1) };
  if (command === 'mark') args = { note: argument };
  result = await request(command, args);
}
const json = JSON.stringify(result, null, 2);
if (destination) writeFileSync(destination, json);
else console.log(json);
