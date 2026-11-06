// A walk of the weather map tests a system's outline on its place and size before it builds the system, so of the many
// living systems a walk passes over, only those it answers are ever copied. Its own file: the systems it watches are
// proxies, and a proxy seen by the walk's code would change what that code allocates for the pins beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemsSpanWalk, systemsAmong, cellsOf } from '../../../src/systems/weather/weatherMap.js';
import { pixelOfField } from '../../../src/systems/weather/weatherField.js';
import { CLIMATES } from '../../../src/formats/mapsFile.js';
import { inBay } from '../../../src/world/tamriel/tamrielFrame.js';
import { tamrielClimateAt } from '../../../src/world/tamriel/tamrielGround.js';

/** The Bay's woodlands, and past the Bay the continent's own climates. */
const continent = (px, py) => (inBay(px, py) ? CLIMATES.Woodlands : tamrielClimateAt(px, py));

test('THE WALK COPIES ONLY THE SYSTEMS IT ANSWERS: every front and storm cell a walk answers, in the Bay and past it, is copied once, and the many living systems it passes over never are (a copy of every living system was made before its reach was tested)', () => {
  let living = 0,
    answered = 0,
    cells = 0,
    past = 0;
  for (const [x, z] of [
    [300000, 200000],
    [-409600, -245760],
    [1100000, 640000],
    [900000, -700000],
  ]) {
    for (const minutes of [1000003, 2000000, 2904512]) {
      const walk = systemsSpanWalk(x, z, minutes, minutes, continent, 0);
      let step = walk.next();
      while (!step.done) step = walk.next();
      const span = step.value;
      let copies = 0;
      const counted = (system) =>
        new Proxy(system, {
          ownKeys: (target) => {
            copies++;
            return Reflect.ownKeys(target);
          },
        });
      const inSpan = (c) => c.bornAt <= span.t1 && c.bornAt + c.life > span.t0;
      const watched = span.list.map((e) => ({
        b: counted(e.b),
        cellReach: e.cellReach,
        cells: e.cells === null ? null : cellsOf(e.b, continent).filter(inSpan).map(counted),
      }));
      const lives = (s) => minutes >= s.bornAt && minutes - s.bornAt < s.life;
      const here = watched.reduce((n, e) => n + lives(e.b) + (e.cells ?? []).filter(lives).length, 0);
      const got = systemsAmong({ ...span, list: watched }, minutes);
      const at = `(${x}, ${z}) at ${minutes}`;
      assert.deepEqual(got, systemsAmong({ ...span, list: span.list.map((e) => ({ ...e })) }, minutes), `${at}: the same answer`);
      assert.equal(copies, got.length, `${at}: one copy for each system answered, none for the rest (${here} living)`);
      living += here;
      answered += got.length;
      cells += got.filter((s) => s.front).length;
      const pixel = pixelOfField(x, z);
      if (!inBay(pixel.x, pixel.y)) past += got.length;
    }
  }
  assert.ok(answered >= 12 && living >= 5 * answered, `${living} living systems walked over, ${answered} answered`);
  assert.ok(cells >= 1 && past >= 6, `${cells} storm cells answered, ${past} systems past the Bay`);
});
