// Display identity can differ from the item's original gender. Use matching art
// on that body's sheet; never move an item's gameplay template or dye.
import { clothingKind } from './clothingKinds.js';
export function clothingDisplayTemplate(template, gender, templates) {
  const sheet = gender === 'female' ? 235 : gender === 'male' ? 239 : null;
  if (!sheet || ![235, 239].includes(template?.playerTextureArchive) || template.playerTextureArchive === sheet) return template;
  const kind = clothingKind(template);
  const matches = templates.filter((t) => t.playerTextureArchive === sheet && t.name === template.name && clothingKind(t) === kind);
  return matches.find((t) => t.playerTextureRecord === template.playerTextureRecord) ?? matches[0]
    ?? templates.find((t) => t.playerTextureArchive === sheet && kind && clothingKind(t) === kind) ?? template;
}
