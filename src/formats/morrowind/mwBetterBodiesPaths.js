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

// NUDITY-SYNC: one runtime texture name per skin variant, the same length as bb_skin<sex>_<race> so the NIF's own
// texture string is rewritten in place (fpArm's rewriteBetterBodiesTextureStem refuses a length change)
const VARIANT_PREFIX = Object.freeze({ underwear: 'bu', nude: 'bn', 'hd-underwear': 'hu', 'hd-nude': 'hn', 'hd-body-hair': 'hh' });
export function betterBodiesTextureStem({ genderKey = 'm', raceKey = 'no', variant = 'underwear' } = {}) {
  return `${VARIANT_PREFIX[variant] ?? 'bb'}_skin${genderKey}_${raceKey}`;
}

/** Normalize the existing first-person hand selector without coupling it to the third-person body-pack toggle. */
export function firstPersonHandsSource(value) {
  // BETTER-HANDS: two choices now - the standard arms, or Better Bodies' arm with Better Hands' hands (combat/fpArm.js);
  // a setting saved as the retired "Better Bodies" (2) takes the latter, its own arm and texture
  if (Number(value) === 1 || Number(value) === 2) return 'better-hands';
  return 'vanilla';
}

/** Optional high-resolution female hand texture paired with the selected Better Bodies skin. */
export function betterBodiesHighResolutionFemaleHandTexturePath({ race = 'Nord' } = {}) {
  const raceName = compactRaceName(race);
  const raceKey = RACE_CODES[raceName] ?? (Object.values(RACE_CODES).includes(raceName) ? raceName : null);
  if (!raceKey) return null;
  return `Mods/Bodies/High Resolution Better Body Female Textures/Hands/Textures/bb/bb_handf_${raceKey}.dds`;
}
