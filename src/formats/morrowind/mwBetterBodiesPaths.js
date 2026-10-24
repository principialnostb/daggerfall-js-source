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
