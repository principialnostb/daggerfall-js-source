import { morrowindDataGeneration, morrowindDataCount } from '../scenes/dataSource.js';

const furnishings = new Map([
  ['205:2', ['m/misc_flask_01.nif', false]],
  ['205:12', ['m/misc_com_bottle_15.nif', false]],
  ['205:35', ['m/misc_com_bottle_12.nif', false]],
  ['214:2', ['m/misc_muck_shovel_01.nif', true, 1.1]],
  ['214:6', ['w/w_pickaxe.nif', true]],
  ['214:13', ['m/misc_prongs00.nif', true]],
]);

export function releaseFurnishingMorrowind(entry) {
  entry.morrowind?.model?.release();
  entry.morrowind = null;
}

export function furnishingMorrowind(entry) {
  const spec = furnishings.get(entry.record);
  const generation = morrowindDataGeneration();
  if (entry.morrowind?.generation !== generation) releaseFurnishingMorrowind(entry);
  if (!spec || !morrowindDataCount()) return null;
  if (!entry.morrowind || entry.morrowind.retry <= Date.now()) {
    const state = entry.morrowind = { generation, model: null, retry: Infinity };
    const [path, tool, length] = spec;
    import('../combat/fpArm.js').then(async ({ fpArm }) => {
      if (fpArm.mountPictureStamp() == null) {
        state.retry = Date.now() + 2000;
        return;
      }
      const model = await fpArm.groundLootModel(tool ? { group: 'Weapons' } : {}, path);
      if (entry.morrowind === state) state.model = model && {
        draw: (x, y, z, yaw) => model.draw(x, y, z, yaw, length),
        release: model.release,
      };
      else model?.release();
    }).catch(() => {});
  }
  return entry.morrowind.model;
}
