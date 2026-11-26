// Geometry selects recipes by record. Editors can still request the whole family.
export function paintFamily(recipes) {
  const all = (paints = []) => recipes.map(([record, make]) => [record, make(slot => paints[slot])]);
  all.recipes = recipes;
  return all;
}
