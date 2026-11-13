// The pictures the port paints in code and puts up itself: no texture door and no studio set stands in front of them.
// Each set is listed by the pseudo-archive its hosts upload it under, with the painters they call, so the Replacements
// pane lists it and paints a preview when asked. The renderer asks here before it puts one up (render/paintedOverride.js):
// a picture the player replaced goes up in the painted one's place, top-down as the painters paint, and glows from the
// player's own pixels wherever the painted one glowed. One not decoded yet goes up painted, then the player's lands.
import { t } from '../textManager.js';
import { setPaintedOverride } from '../../render/paintedOverride.js';
import { hasPlayerReplacement, decodedTextureTopDown, preloadTextureRecord } from '../textureReplacement.js';

const EG_BAND_ARCHIVES = [38241, 38251, 38261, 38271];
/** The Elite Breach's bands, as the game names them (net/eliteGates/egLaw.js EG_BANDS), in their archives' order. */
const EG_BAND_TITLES = [
  () => t('menu.repl.painted.galleries', 'The Elite Breach: the Broken Galleries'),
  () => t('menu.repl.painted.cairn', 'The Elite Breach: the Soul Cairn'),
  () => t('menu.repl.painted.shade', 'The Elite Breach: the Shade Perilous'),
  () => t('menu.repl.painted.wellhead', 'The Elite Breach: the Havoc Wellhead'),
];

/**
 * The sets: the `archive` they go up under, a name for the pane, and `paint()` answering their records' pictures as the
 * hosts paint them (`[record, art]`, `art` a picture or `{ albedo, emission }`, top-down RGBA). `records` names a
 * record that is no number by the number the player's picture is kept under. A painter that takes a colour or a band is
 * asked with the one its host asks first.
 * @type {ReadonlyArray<{ id: string, archive: number, title: () => string, records?: Record<string, number>,
 *   paint: () => Promise<Iterable<[number|string, any]>> }>}
 */
export const PAINTED_SETS = Object.freeze([
  {
    id: 'starfall',
    archive: 38301,
    title: () => t('menu.repl.painted.starfall', 'Starfall: the fallen stars'),
    paint: async () => (await import('../../world/starfall/starArt.js')).starArt(),
  },
  {
    id: 'fissures',
    archive: 38361,
    title: () => t('menu.repl.painted.fissures', 'The Brass Fissures'),
    paint: async () => (await import('../../world/fissureArt.js')).fissureArt(),
  },
  {
    id: 'guild',
    archive: 38341,
    title: () => t('menu.repl.painted.guild', 'Guild halls: their materials'),
    paint: async () => (await import('../../world/guildFurnitureArt.js')).guildMaterialArt(),
  },
  {
    id: 'abyss',
    archive: 38151,
    title: () => t('menu.repl.painted.abyss', 'The Abyss: its halls, steps and rifts'),
    paint: async () => {
      const [realm, hall, steps, rift, remnant] = await Promise.all([
        import('../../world/superDungeon/sdRealmArt.js'),
        import('../../world/superDungeon/sdHallArt.js'),
        import('../../world/superDungeon/sdStepsArt.js'),
        import('../../world/superDungeon/sdRiftArt.js'),
        import('../../world/superDungeon/sdRemnantArt.js'),
      ]);
      return [...realm.realmArt(), ...hall.hallArt(), ...steps.stepsArt(), ...rift.sdRiftArt(), ...remnant.remnantArt()];
    },
  },
  {
    id: 'remnants',
    archive: 38155,
    title: () => t('menu.repl.painted.remnants', 'The Abyss: its remnants'),
    paint: async () => {
      const [{ remnantLookArt }, { SD_BLOW_COLOR }] = await Promise.all([
        import('../../world/superDungeon/sdRemnantArt.js'),
        import('../../scenes/superDungeon/sdRemnantBlows.js'),
      ]);
      return remnantLookArt(SD_BLOW_COLOR);
    },
  },
  {
    id: 'gate',
    archive: 38101,
    title: () => t('menu.repl.painted.gate', 'The Oblivion Gate'),
    paint: async () => {
      const gate = await import('../../world/gate/gateArt.js');
      return [...gate.gateArt(), ...gate.archArt(), ...gate.riteArt()];
    },
  },
  {
    id: 'court',
    archive: 38111,
    title: () => t('menu.repl.painted.court', "The Oblivion Gate's court"),
    paint: async () => (await import('../../world/gate/gateArt.js')).courtArt(),
  },
  ...EG_BAND_ARCHIVES.map((archive, band) => ({
    id: `band-${band}`,
    archive,
    title: EG_BAND_TITLES[band],
    paint: async () => (await import('../../world/eliteGates/egBandArt.js')).egBandArt(band),
  })),
  {
    id: 'ketch',
    archive: 38311,
    title: () => t('menu.repl.painted.ketch', 'The Sky-Ketch'),
    paint: async () => {
      const { ketchArt, resolveKetchArt } = await import('../../world/ketch/ketchArt.js');
      return ketchArt().map(([record, raw]) => [record, resolveKetchArt(raw, null)]);
    },
  },
  {
    id: 'figureheads',
    archive: 38194,
    title: () => t('menu.repl.painted.figureheads', 'Ship figureheads'),
    paint: async () => (await import('../../world/ships/figureheadArt.js')).carvingArt(),
  },
  {
    id: 'blood',
    archive: 38001,
    title: () => t('menu.repl.painted.blood', 'Blood'),
    records: Object.freeze({ marks: 0, drop: 1 }),
    paint: async () => {
      const { bloodAtlas, bloodDropletArt, BLOOD_ATLAS_RECORD, BLOOD_DROP_RECORD } = await import('../../combat/blood/bloodArt.js');
      return [[BLOOD_ATLAS_RECORD, bloodAtlas()], [BLOOD_DROP_RECORD, bloodDropletArt()]];
    },
  },
  {
    id: 'ghostfence',
    archive: 38331,
    title: () => t('menu.repl.painted.ghostfence', 'The Ghostfence'),
    paint: async () => {
      const { ghostfencePictures, GF_RECORD } = await import('../../world/tamriel/ghostfenceModel.js');
      const pictures = ghostfencePictures();
      return Object.entries(GF_RECORD).map(([part, record]) => [record, pictures[part]]);
    },
  },
]);

const SET_OF_ARCHIVE = new Map(PAINTED_SETS.map((set) => [set.archive, set]));
/** The painted set an archive is, or null. */
export const paintedSetOf = (archive) => SET_OF_ARCHIVE.get(Number(archive)) ?? null;
/** The number a record is kept under: its own, or the set's name for it ('marks'); null where it is neither. */
function recordNumber(set, record) {
  if (set.records && Object.hasOwn(set.records, record)) return set.records[record];
  return typeof record === 'number' && Number.isInteger(record) ? record : null;
}
/** A painter's picture as a PNG holds it: top-down RGBA in `data`. */
const rgbaOf = (picture) => (picture?.width ? { width: picture.width, height: picture.height, data: picture.data ?? picture.colors } : null);

const _painted = new Map();
/** A set's pictures by record number, `{ albedo, emission }` top-down, painted once when first asked. */
export function paintedPictures(set) {
  if (!_painted.has(set.id)) {
    const painting = Promise.resolve()
      .then(() => set.paint())
      .then((list) => {
        const out = new Map();
        for (const [record, art] of list) {
          const number = recordNumber(set, record);
          if (number == null || out.has(number)) continue;
          const albedo = rgbaOf(art?.albedo ?? art);
          if (albedo) out.set(number, { albedo, emission: rgbaOf(art?.emission) });
        }
        return out;
      });
    painting.catch(() => _painted.delete(set.id));
    _painted.set(set.id, painting);
  }
  return _painted.get(set.id);
}
/** A painted record's picture, top-down RGBA, or null where the archive is no painted set's or has no such record. */
export async function paintedPicture(archive, record) {
  const set = paintedSetOf(archive);
  if (!set) return null;
  return (await paintedPictures(set).catch(() => null))?.get(Number(record))?.albedo ?? null;
}

/**
 * A glow map from the player's picture: its own pixels wherever the painted glow map is lit (sampled at the player's
 * size, so both are read from the same mip level), clear elsewhere. Both top-down.
 * @param {{ width: number, height: number, colors: ArrayLike<number> }} own
 * @param {{ width: number, height: number, colors?: ArrayLike<number>, data?: ArrayLike<number> }} emission
 */
export function glowFrom(own, emission) {
  const lit = emission.colors ?? emission.data;
  const out = new Uint8ClampedArray(own.width * own.height * 4);
  for (let y = 0; y < own.height; y++) {
    const ey = Math.min(emission.height - 1, Math.floor((y * emission.height) / own.height));
    for (let x = 0; x < own.width; x++) {
      const ex = Math.min(emission.width - 1, Math.floor((x * emission.width) / own.width));
      const e = (ey * emission.width + ex) * 4;
      if (!(lit[e] || lit[e + 1] || lit[e + 2])) continue;
      const i = (y * own.width + x) * 4;
      out[i] = own.colors[i];
      out[i + 1] = own.colors[i + 1];
      out[i + 2] = own.colors[i + 2];
      out[i + 3] = own.colors[i + 3];
    }
  }
  return { width: own.width, height: own.height, colors: out };
}

/** The player's picture for a painted record, top-down in `colors`, or null: none, or not decoded yet. */
function ownPicture(archive, record) {
  const set = paintedSetOf(archive);
  const number = set ? recordNumber(set, record) : null;
  if (number == null || !hasPlayerReplacement(archive, number)) return { number: null, own: null };
  const decoded = decodedTextureTopDown(archive, number);
  return { number, own: decoded ? { width: decoded.width, height: decoded.height, colors: decoded.rgba } : null };
}

/** A picture asked before the player's was decoded: what went up, so the player's goes up in its place when it lands. */
const _late = new Map();
function putUpWhenDecoded(renderer, archive, record, number, opts) {
  const key = `${archive}_${record}`;
  const late = _late.get(key);
  if (late) {
    late.opts = opts;
    return;
  }
  const asked = { renderer, opts, emission: null, emissionOpts: undefined };
  _late.set(key, asked);
  preloadTextureRecord(archive, number)
    .then(() => {
      if (_late.get(key) !== asked) return;
      _late.delete(key);
      const { own } = ownPicture(archive, record);
      if (!own || typeof renderer?.uploadTexture !== 'function') return;
      renderer.releaseTexture?.(archive, record);
      renderer.uploadTexture(archive, record, own, asked.opts);
      if (asked.emission && typeof renderer.uploadEmissionTexture === 'function') {
        renderer.evictEmissionTexture?.(key);
        renderer.uploadEmissionTexture(archive, record, asked.emission, asked.emissionOpts);
      }
    })
    .catch((e) => {
      if (_late.get(key) === asked) _late.delete(key);
      console.warn(`[replacements] ${key}: the player's picture would not go up - the painted one stands:`, e?.message ?? e);
    });
}

/** The renderer's ask (render/paintedOverride.js): the player's picture for a painted record going up, or null. */
function ownUpload(renderer, archive, record, opts) {
  const { number, own } = ownPicture(archive, record);
  if (number == null) return null;
  if (!own) putUpWhenDecoded(renderer, archive, record, number, opts);
  return own;
}
/** And for its glow map: the player's pixels where the painted map is lit, or null. */
function ownGlow(renderer, archive, record, emission, opts) {
  const { number, own } = ownPicture(archive, record);
  if (number == null || !emission?.width) return null;
  if (own) return glowFrom(own, emission);
  const late = _late.get(`${archive}_${record}`);
  if (late) Object.assign(late, { emission, emissionOpts: opts });
  return null;
}

setPaintedOverride({ upload: ownUpload, glow: ownGlow });

/** The tests' seam: paint every set again. */
export function forgetPaintedPictures() {
  _painted.clear();
  _late.clear();
}
