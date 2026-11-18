'use strict';
const fs = require('node:fs');
const path = require('node:path');

function legacyGameRoots(executable, userData) {
  const folder = path.dirname(path.dirname(executable));
  if (!fs.existsSync(path.join(folder, 'DFO Online Mod.exe'))) return [];
  const roots = [];
  const previous = path.join(userData, 'Game-public-1311');
  try {
    const { current } = JSON.parse(fs.readFileSync(path.join(previous, 'state.json'), 'utf8'));
    if (/^13\.11\.\d+$/.test(current)) roots.push(path.join(previous, 'v' + current, 'files'));
  } catch { /* An original installation can have just its bundled game. */ }
  for (const archive of ['game-seed.asar', 'app.asar']) {
    const dist = path.join(folder, 'resources', archive, 'dist');
    if (fs.existsSync(dist)) roots.push(dist);
  }
  return roots;
}
module.exports = { legacyGameRoots };
