// @ts-check
// THE CITIES THE TOYBOX OFFERS: every city of the game, all of Tamriel - the Bay's off MAPS.BSA, the provinces' off
// the world's registry - each by a name of its own, and the fields a toybox event's place carries (staffEventLaw.js
// validStaffEvent: its region, its location, its pixel). A Bay city's location is its MAPS.BSA index in its region; a
// city past the Bay's is its place's own (negative), as the raids past the Bay key it.
import { LOCATION_TYPES } from '../../formats/mapsFile.js';
import { inBay } from '../../world/tamriel/tamrielFrame.js';
import { staffTownPixelOk, STAFF_EVENT_PLACE_MAX } from '../../net/staffEvent/staffEventLaw.js';
import { keptMaps, keptPlaces } from '../../net/staffPlaces.js';

/** @typedef {{ name: string, rg: number, loc: number, px: number, py: number, nm: string, ct: 1 }} ToyboxCity */

/** A Bay place's MAPS.BSA location index in its region, by its map id, or -1. @param {any} maps @param {any} place */
function bayLocation(maps, place) {
  const table = maps?.getRegion?.(place.region)?.mapTable ?? [];
  for (let k = 0; k < table.length; k++) if (table[k] && table[k].mapId >>> 0 === place.mapId) return k;
  return -1;
}

/**
 * EVERY CITY, by name: `[{ name, rg, loc, px, py, nm, ct }]`, sorted. Two cities of one name are told apart by their
 * region (`regionName`), then by their pixel. A city the event's law would not stand (no location, its pixel on the
 * wrong side of the Bay's edge) is left out.
 * @param {{ places?: any, maps?: any, regionName?: (rg: number) => string }} [o]
 * @returns {ToyboxCity[]}
 */
export function toyboxCities({ places = keptPlaces(), maps = keptMaps(), regionName = (region) => `Region ${region}` } = {}) {
  /** @type {ToyboxCity[]} */
  const found = [];
  for (const place of places?.all?.() ?? []) {
    if (!place || place.type !== LOCATION_TYPES.TownCity || !place.name) continue;
    const bay = inBay(place.px, place.py);
    const loc = bay ? bayLocation(maps, place) : Number.isSafeInteger(place.location) && place.location < -1 ? place.location : -1;
    if (loc === -1 || !staffTownPixelOk(place.px, place.py, loc, place.region)) continue;
    const shortName = String(place.name).slice(0, STAFF_EVENT_PLACE_MAX);
    found.push({ name: shortName, rg: place.region, loc, px: place.px, py: place.py, nm: shortName, ct: 1 });
  }
  const count = (/** @type {(city: ToyboxCity) => string} */ keyOf) => {
    const tally = new Map();
    for (const city of found) tally.set(keyOf(city), (tally.get(keyOf(city)) ?? 0) + 1);
    return tally;
  };
  const byName = count((city) => city.name);
  for (const city of found) if (byName.get(city.name) > 1) city.name = `${city.nm} (${regionName(city.rg)})`;
  const again = count((city) => city.name);
  for (const city of found) if (again.get(city.name) > 1) city.name = `${city.name} ${city.px},${city.py}`;
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** A city's event fields by its name in the list, or null. @param {ToyboxCity[]} list @param {unknown} name */
export function toyboxCityNamed(list, name) {
  const city = list.find((x) => x.name === name);
  return city ? { rg: city.rg, loc: city.loc, px: city.px, py: city.py, nm: city.nm, ct: city.ct } : null;
}
