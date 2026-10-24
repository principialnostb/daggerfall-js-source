const RACE_CODES = Object.freeze({
  breton: 'br', darkelf: 'de', highelf: 'he', imperial: 'im',
  nord: 'no', orc: 'or', redguard: 'rg', woodelf: 'we',
});
const compactRaceName = (race) => String(
  race && typeof race === 'object' ? (race.name ?? race.race ?? race.id ?? '') : (race ?? ''),
).toLowerCase().replace(/[^a-z]/g, '');

/** Pure asset paths for the Better Bodies first-person hands, suitable for Node tests and the browser resolver. */
export function betterBodiesFirstPersonHandAssetPaths({ race = 'Nord', female = false, underwear = true } = {}) {
  const raceName = compactRaceName(race);
  const raceKey = RACE_CODES[raceName] ?? (Object.values(RACE_CODES).includes(raceName) ? raceName : null);
  if (!raceKey) return null;
  const genderKey = female ? 'f' : 'm';
  const variant = underwear ? 'Underwear' : 'Nude';
  const stem = `bb_hand${genderKey}_${raceKey}`;
  return Object.freeze({
    raceKey, genderKey, underwear: !!underwear, variant,
    modelPath: `Mods/Bodies/Better Bodies/${variant}/Data Files/Meshes/bb/${stem}.nif`,
    texturePath: `Mods/Bodies/Better Bodies/${variant}/Data Files/Textures/bb/${stem}.dds`,
    runtimeTexturePath: `textures/bb/${stem}.dds`,
  });
}

/** Normalize the existing first-person hand selector without coupling it to the third-person body-pack toggle. */
export function firstPersonHandsSource(value) {
  if (Number(value) === 1) return 'robert-bodies';
  if (Number(value) === 2) return 'better-bodies';
  return 'vanilla';
}

/** Optional high-resolution female hand texture paired with the selected Better Bodies skin. */
export function betterBodiesHighResolutionFemaleHandTexturePath({ race = 'Nord' } = {}) {
  const raceName = compactRaceName(race);
  const raceKey = RACE_CODES[raceName] ?? (Object.values(RACE_CODES).includes(raceName) ? raceName : null);
  if (!raceKey) return null;
  return `Mods/Bodies/High Resolution Better Body Female Textures/Hands/Textures/bb/bb_handf_${raceKey}.dds`;
}
