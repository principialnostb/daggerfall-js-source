import { getPref } from '../../systems/uiPrefs.js';
import { BATTLEAXE_FIRST_PERSON } from './battleaxeFit.js';

export const AXE_FIRST_PERSON = Object.freeze({ a: BATTLEAXE_FIRST_PERSON.a, t: Object.freeze([0, -22, 0]) });
export const enhancedAxeModel = (model) =>
  'enhanced_axe_' +
  String(model)
    .toLowerCase()
    .replaceAll('\\', '/')
    .replace(/[^a-z0-9]/g, (c) => '_' + c.charCodeAt(0).toString(16) + '_') +
  '.nif';
export function enhancedAxeRecord(record) {
  if (!record?.model || record.type !== 8 || getPref('enhancedBattleaxes') === false) return record;
  return { ...record, model: enhancedAxeModel(record.model), firstPersonAttitude: AXE_FIRST_PERSON };
}

export function enhancedAxeArchive(archives) {
  const meshes = new Map();
  const loading = new Map();
  const source = (path) => {
    const match = /^meshes\/enhanced_axe_([a-z0-9_]+)\.nif$/.exec(path);
    if (!match) return null;
    const original = 'meshes/' + match[1].replace(/_([0-9a-f]+)_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const archive = archives.find(a => a.has(original));
    return archive && { archive, original };
  };
  const build = async ({ archive, original }) => {
    await archive.load?.(original);
    const bytes = archive.get(original);
    if (!bytes) return undefined;
    const [{ parseNif }, { flattenNif }, { meshesToNif }, { enhancedAxeShapes }] = await Promise.all([
      import('../../formats/morrowind/mwNifFile.js'),
      import('../../formats/morrowind/mwNifMesh.js'),
      import('../../formats/morrowind/mwNifWrite.js'),
      import('./enhancedAxeShapes.js'),
    ]);
    try {
      return meshesToNif(enhancedAxeShapes(flattenNif(parseNif(bytes))), { keepV: true });
    } catch {
      return bytes;
    }
  };
  return {
    has: path => !!source(path),
    get: path => meshes.get(path),
    loaded: path => meshes.has(path),
    async load(path) {
      if (meshes.has(path)) return meshes.get(path);
      const entry = source(path);
      if (!entry) return undefined;
      if (!loading.has(path)) {
        loading.set(path, build(entry).then(bytes => {
          if (bytes) meshes.set(path, bytes);
          return bytes;
        }).finally(() => loading.delete(path)));
      }
      return loading.get(path);
    },
  };
}
