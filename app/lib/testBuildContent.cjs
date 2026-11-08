'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Seed complete slots once, preserving existing saves and later player deletions.
function seedTestSaves(source, userData) {
  const marker = path.join(userData, 'test-build-saves-v1.json');
  if (fs.existsSync(marker) || !fs.existsSync(source)) return;
  const target = path.join(userData, 'Saves');
  fs.mkdirSync(target, { recursive: true });
  for (const slot of fs.readdirSync(source, { withFileTypes: true })) {
    if (!slot.isDirectory() || !/^SAVE(?:0|[1-9][0-9]*)$/.test(slot.name)) continue;
    const destination = path.join(target, slot.name);
    if (fs.existsSync(destination)) continue;
    const origin = path.join(source, slot.name);
    for (const name of ['SaveData.txt', 'SaveInfo.txt']) JSON.parse(fs.readFileSync(path.join(origin, name), 'utf8'));
    const staging = fs.mkdtempSync(path.join(target, '.test-seed-'));
    for (const name of ['SaveData.txt', 'SaveInfo.txt', 'Screenshot.jpg']) {
      const file = path.join(origin, name);
      if (fs.existsSync(file)) fs.copyFileSync(file, path.join(staging, name), fs.constants.COPYFILE_EXCL);
    }
    fs.renameSync(staging, destination);
  }
  fs.writeFileSync(marker, JSON.stringify({ seeded: true }));
}
module.exports = { seedTestSaves };
