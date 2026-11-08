// Display identity can differ from the item's original gender. Use matching art
// on that body's sheet; never move an item's gameplay template or dye.
export function clothingDisplayTemplate(template, gender, templates) {
  const sheet = gender === 'female' ? 235 : gender === 'male' ? 239 : null;
  if (!sheet || ![235, 239].includes(template?.playerTextureArchive) || template.playerTextureArchive === sheet) return template;
  const matches = templates.filter((t) => t.playerTextureArchive === sheet && t.name === template.name);
  return matches.find((t) => t.playerTextureRecord === template.playerTextureRecord) ?? matches[0] ?? template;
}
