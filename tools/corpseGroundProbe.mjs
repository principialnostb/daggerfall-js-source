// Replays a Better Bodies death in the standalone dungeon, then moves one
// real Physical Items drop under the settled mesh and measures floor contact.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = process.argv[2];
const windows = process.platform === 'win32';
const steam = 'D:/Steam/steamapps/common';
if (windows) {
  process.env.ARENA2_PATH ??= steam + '/The Elder Scrolls Daggerfall/DF/DAGGER/ARENA2';
  process.env.MORROWIND_DATA ??= steam + '/Morrowind/Data Files';
}
assert.ok(process.env.ARENA2_PATH && existsSync(join(process.env.ARENA2_PATH, 'MAPS.BSA')), 'Set ARENA2_PATH to the installed ARENA2 directory');
assert.ok(process.env.MORROWIND_DATA && existsSync(join(process.env.MORROWIND_DATA, 'Morrowind.bsa')), 'Set MORROWIND_DATA to the installed Morrowind Data Files directory');

function instrument(source, marker, code) {
  assert.equal(source.split(marker).length, 2, 'The probe hook moved: ' + marker);
  return source.replace(marker, code + '\n' + marker);
}

const hooks = {
  name: 'corpse-ground-probe',
  transform(source, id) {
    const path = id.replaceAll('\\', '/');
    if (path.endsWith('/src/scenes/physicalItemsLayer.js')) {
      return instrument(source, 'proxies.set(p.id, p);', `
        globalThis.__corpseProbe?.items.push(p);
      `);
    }
    if (path.endsWith('/src/scenes/dungeonContext.js')) {
      const built = instrument(source, 'droppedLoot.physical.attach({', `
        if (globalThis.__corpseProbe) {
          globalThis.__corpseProbe.revive = i => {
            const foe = foes[i];
            setFoeDead(foe, false);
            foe.entity.health = foe.entity.maxHealth;
          };
          globalThis.__corpseProbe.place = (item, at) => {
            const [pile] = droppedLoot.dropPhysical([{ ...item }], at, [0, 0, 1]);
            pile.pos = [...at];
            pile.settled = true;
            return pile;
          };
          globalThis.__corpseProbe.remove = pile => droppedLoot.removePile(pile);
        }
      `);
      return instrument(built, 'const p = corpseFloorLanding(collider, f.ai.feet);', `
        if (globalThis.__corpseProbe) globalThis.__corpseProbe.floorAt = (x, y, z) => {
          const d = collider.raycast([x, y + 0.1, z], [0, -1, 0], 0.25);
          return Number.isFinite(d) ? y + 0.1 - d : null;
        };
      `);
    }
    if (path.endsWith('/src/combat/fpArm.js')) {
      const clips = instrument(source, "const g = chooseRandomGroup('death', roll);", `
        if (globalThis.__corpseProbe?.clip != null) roll = globalThis.__corpseProbe.clip;
      `);
      return instrument(clips, 'const center = transformPoint(groundedModel,', `
        const probe = globalThis.__corpseProbe;
        if (probe?.target && !probe.samples[probe.phase] && deathState && Number.isFinite(thirdCorpseMinZ)
          && Math.hypot(probe.target[0] - feet[0], probe.target[2] - feet[2]) < 0.01) {
          let lowest = null;
          let minZ = Infinity;
          let supportSlot = null;
          const point = [0, 0, 0];
          for (const range of thirdMesh.ranges) {
            if (!isCorpseSupportRange(range)) continue;
            const piece = range.piece;
            for (const i of piece.indices) {
              const vertex = thirdMesh.skin ? skinnedVertex(thirdSkin, piece, i, thirdSkin.palette, point)
                : piece.positions.subarray(i * 3, i * 3 + 3);
              if (!vertex || vertex[2] >= minZ) continue;
              minZ = vertex[2];
              supportSlot = range.slot;
              lowest = transformPoint(groundedModel, ...vertex);
            }
          }
          const oldModel = groundThirdPersonModel(model, body.minZ, feet[1]);
          probe.samples[probe.phase] = {
            frame: globalThis.__frame, floor: feet[1], lowest, gpu: !!thirdMesh.skin, clip: deathState.group, supportSlot,
            betterBodies: thirdMesh.ranges.some(r => !r.hidden && (r.piece?.bodySection || r.textureFile?.includes('bb_skin'))),
            legacyGap: transformPoint(oldModel, 0, 0, minZ)[1] - feet[1],
          };
        }
      `);
    }
  },
};

const chrome = process.env.CHROMIUM ?? (windows ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : null);
const server = await createServer({
  root, cacheDir: join(tmpdir(), 'codex-corpse-vite'), plugins: [hooks], logLevel: 'error', optimizeDeps: { entries: ['play/index.html'] },
  server: { host: 'localhost', port: Number(process.env.CORPSE_PROBE_PORT ?? 5338), strictPort: true, hmr: false, watch: null },
});
await server.listen();
console.log('Starting the standalone dungeon');
try {
  const browser = await chromium.launch({
    ...(chrome && existsSync(chrome) ? { executablePath: chrome } : {}),
    args: windows && !process.env.CORPSE_SWIFTSHADER
      ? ['--use-angle=d3d11', '--ignore-gpu-blocklist']
      : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
    await context.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort());
    await context.addInitScript(() => {
      localStorage.setItem('dagger.ui.v1', JSON.stringify({ skin: 'enhanced', mwNpcBodies: 'all' }));
      window.__corpseProbe = { items: [], samples: {}, phase: 'before' };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://localhost:${server.config.server.port}/play/?shot&fly&nomenu&novideo&class=1`, { waitUntil: 'commit', timeout: 90_000 });
    await page.waitForFunction(() => window.__frame > 12, null, { timeout: 150_000 });
    const setup = await page.evaluate(async () => {
      const { setUiSkin } = await import('/src/systems/uiSkin.js');
      const { setPref } = await import('/src/systems/uiPrefs.js');
      const { setModSetting, modSetting } = await import('/src/systems/modSettings.js');
      const { registerMorrowindData, countMorrowindArchives } = await import('/src/scenes/dataSource.js');
      const { initEnhancedModResources, modGroupReady, modPackState } = await import('/src/systems/enhancedModResources.js');
      const { foeActor } = await import('/src/characters/foeBodies.js');
      setUiSkin('enhanced');
      setPref('mwNpcBodies', 'all');
      setModSetting('physical-items', 'Enabled', true);
      setModSetting('physical-items', 'Enemy Loot.Physical Enemy Drops', true);
      await initEnhancedModResources();
      await registerMorrowindData();
      const foes = JSON.parse(window.__foes());
      const foe = foes.find(({ i, type, dead }) => {
        if (dead || type !== 129) return false;
        const look = foeActor(window.__foeRecord(i)).look;
        return look?.race === 'Nord' && look?.gender === 'female';
      });
      if (!foe) throw Error('Expected the female Nord enemy in Privateer’s Hold');
      const [x, y, z] = window.__foeRecord(foe.i).ai.feet;
      window.__player.warp(x, y + 0.02, z - 2.5);
      window.__pose(x, y + 1.15, z - 1.5, 0, -0.42);
      return {
        foe: foe.i, mwArchives: await countMorrowindArchives(), bb: modPackState('bb'), bodyGroupReady: modGroupReady('bodies'),
        bbSource: modSetting('morrowind-textures', 'BetterBodiesSource'), physical: modSetting('physical-items', 'Enabled'),
      };
    });
    console.log('Mod setup', setup);
    assert.ok(setup.mwArchives > 0 && setup.bb.connected && setup.bbSource === 2 && setup.physical, 'Morrowind, Better Bodies and Physical Items must be active');

    const frame = await page.evaluate(() => window.__frame);
    await page.waitForFunction(frame => window.__frame > frame + 24, frame);
    await page.evaluate(i => {
      const { feet, yaw } = window.__foeRecord(i).ai;
      const [x, y, z] = feet;
      window.__corpseProbe.target = [x, y, z];
      window.__corpseProbe.origin = { feet: [x, y, z], yaw };
      window.__pose(x, y + 1.15, z - 1.5, 0, -0.42);
      window.__damageFoe(i, 10_000);
    }, setup.foe);
    await page.waitForFunction(i => {
      const p = window.__corpseProbe;
      return p.samples.before && p.items.some(item => item.backing.group.key === 'corpse:' + i && item.batch && !item.dead);
    }, setup.foe, { timeout: 45_000 });
    if (output) {
      mkdirSync(output, { recursive: true });
      await page.screenshot({ path: join(output, 'corpse-before.png') });
    }

    const drop = await page.evaluate(i => {
      const p = window.__corpseProbe;
      const item = p.items.find(item => item.backing.group.key === 'corpse:' + i && item.batch && !item.dead);
      const [x, , z] = p.samples.before.lowest;
      item.body.pos.splice(0, 3, x, p.samples.before.floor, z);
      item.body.vel.fill(0);
      item.body.settled = true;
      p.drop = item;
      p.phase = 'under';
      return item.item.group;
    }, setup.foe);
    await page.waitForFunction(() => {
      const p = window.__corpseProbe;
      return p.samples.under && p.drop.batch?.origin.every((value, i) => Math.abs(value - p.drop.body.pos[i]) < 0.001);
    });
    const report = await page.evaluate(() => {
      const p = window.__corpseProbe;
      return { ...p.samples, itemPosition: [...p.drop.batch.origin], itemPresented: !p.drop.dead, measuredFloor: p.floorAt(...p.drop.body.pos) };
    });
    console.log(JSON.stringify({ ...setup, drop, ...report }, null, 2));
    if (output) await page.screenshot({ path: join(output, 'corpse-under-loot.png') });
    assert.deepEqual(errors, []);
    for (const sample of [report.before, report.under]) {
      assert.ok(sample.gpu && sample.betterBodies, 'Expected the active Better Bodies GPU mesh');
      assert.ok(Math.abs(sample.lowest[1] - sample.floor) < 0.0001, 'Corpse gap exceeded 0.1 mm');
    }
    const [x, , z] = report.under.lowest;
    assert.ok(Number.isFinite(report.measuredFloor) && Math.abs(report.under.lowest[1] - report.measuredFloor) < 0.001, 'Expected contact with the actual collision floor');
    assert.ok(report.itemPresented && Math.hypot(x - report.itemPosition[0], z - report.itemPosition[2]) < 0.001, 'The rendered item must be directly below the corpse');
    assert.ok(Math.abs(report.before.lowest[1] - report.under.lowest[1]) < 0.001, 'Moving the drop changed the corpse height');
    const clips = [];
    const replay = async (roll, phase, at = null) => {
      const start = await page.evaluate(({ i, roll, phase, at }) => {
        const p = window.__corpseProbe;
        p.item ??= { ...p.drop.item };
        if (p.pile) p.remove(p.pile);
        p.pile = at ? p.place(p.item, at) : null;
        p.clip = roll;
        p.phase = phase;
        p.revive(i);
        return window.__frame;
      }, { i: setup.foe, roll, phase, at });
      await page.waitForFunction(frame => {
        const p = window.__corpseProbe;
        return window.__frame > frame + 10 && (!p.pile || p.items.some(item => item.backing.pile === p.pile && item.batch && !item.dead));
      }, start, { timeout: 20_000 });
      const positioned = await page.evaluate(i => {
        const p = window.__corpseProbe;
        const foe = window.__foeRecord(i);
        const [x, y, z] = p.origin.feet;
        const item = p.items.find(item => p.pile && item.backing.pile === p.pile && item.batch && !item.dead);
        foe.ai.feet[0] = x;
        foe.ai.feet[1] = y;
        foe.ai.feet[2] = z;
        foe.ai.yaw = p.origin.yaw;
        window.__damageFoe(i, 10_000);
        return item ? [...item.batch.origin] : null;
      }, setup.foe);
      if (at) assert.ok(positioned && Math.hypot(...at.map((v, i) => v - positioned[i])) < 0.001, 'The independent drop must be on the floor before the killing blow');
      await page.waitForFunction(phase => window.__corpseProbe.samples[phase], phase, { timeout: 25_000 });
      return page.evaluate(phase => {
        const p = window.__corpseProbe;
        const sample = p.samples[phase];
        const [x, , z] = sample.lowest;
        const item = p.items.find(item => p.pile && item.backing.pile === p.pile && item.batch && !item.dead);
        return { ...sample, measuredFloor: p.floorAt(x, sample.floor, z), independentDrop: item ? [...item.batch.origin] : null };
      }, phase);
    };
    for (let roll = 0; roll < 5; roll++) {
      const clip = 'death' + (roll + 1);
      const control = await replay(roll, clip + '-control');
      const at = [control.lowest[0], control.measuredFloor, control.lowest[2]];
      const preexisting = await replay(roll, clip + '-preexisting', at);
      for (const sample of [control, preexisting]) {
        assert.equal(sample.clip, clip);
        assert.ok(sample.gpu && sample.betterBodies && Number.isFinite(sample.measuredFloor));
        assert.ok(Math.abs(sample.lowest[1] - sample.measuredFloor) < 0.0001, clip + ': corpse lost floor contact');
      }
      assert.ok(preexisting.independentDrop && Math.hypot(...at.map((v, i) => v - preexisting.independentDrop[i])) < 0.001, clip + ': the drop must remain under the body');
      assert.ok(Math.hypot(...preexisting.lowest.map((v, i) => v - control.lowest[i])) < 0.001, clip + ': the existing drop changed corpse placement');
      clips.push({ clip, beforeDeath: at, control, preexisting });
      console.log('PASS', clip, 'pre-existing drop, legacy gap', (control.legacyGap * 1000).toFixed(2), 'mm');
    }
    if (output) writeFileSync(join(output, 'corpse-ground.json'), JSON.stringify({ ...setup, drop, ...report, clips }, null, 2) + '\n');
    assert.deepEqual(errors, []);
    console.log('PASS: the Better Bodies corpse stayed grounded with a rendered item directly beneath it.');
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
