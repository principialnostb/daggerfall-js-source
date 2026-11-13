import { ENEMY_BASICS } from '../characters/enemy/enemyBasics.js';
import { GROUP_TEMPLATE_INDICES, mintCondition, setItemFields } from '../systems/item/itemTemplates.js';
import { LOOT_MATRICES, createPotion, CLASSIC_RECIPE_KEYS } from '../systems/loot/loot.js';
import { themedIngredientPool } from '../systems/loot/lootThemes.js';
import { goldStack } from '../systems/inventory.js';
import { TEMPLATE, SURVIVAL_GROUP } from '../systems/survival/food.js';
import { loadItemLootModel } from '../render/groundLootModels.js';
import { usesLootPouch } from '../render/mwGroundLootRecords.js';
import { shownItemName } from '../systems/item/itemInfo.js';
import { consoleLog } from '../systems/consoleCommands.js';

const groups = {
  P1: 'PlantIngredients1', P2: 'PlantIngredients2', C1: 'CreatureIngredients1',
  C2: 'CreatureIngredients2', C3: 'CreatureIngredients3', M1: 'MiscellaneousIngredients1',
  M2: 'MiscellaneousIngredients2', RL: 'ReligiousItems', BK: 'Books',
};

function samples() {
  const byTemplate = new Map();
  const add = (group, templateIndex) => byTemplate.set(templateIndex, { group, templateIndex });
  for (const [id, enemy] of Object.entries(ENEMY_BASICS)) {
    const matrix = LOOT_MATRICES[enemy.lootTableKey];
    if (!matrix) continue;
    for (const [tier, group] of Object.entries(groups)) {
      if (!matrix[tier]) continue;
      const pool = GROUP_TEMPLATE_INDICES[group];
      for (const index of tier.startsWith('C') ? themedIngredientPool(Number(id), tier, pool) : pool) add(group, index);
    }
  }
  for (const group of ['Weapons', 'Armor', 'MensClothing']) {
    for (const index of GROUP_TEMPLATE_INDICES[group]) add(group, index);
  }
  add('Maps', 287);
  add('MiscItems', 278);
  add(SURVIVAL_GROUP, TEMPLATE.RawMeat);
  add(SURVIVAL_GROUP, TEMPLATE.Meat);
  return [...byTemplate.values()].map(item => mintCondition(setItemFields(item)))
    .concat(goldStack(8), createPotion(CLASSIC_RECIPE_KEYS[0]));
}

export function spawnDungeonLootPreview(context, clear = false, report = consoleLog) {
  const loot = context.loot;
  const request = context.lootRequest = {};
  for (const pile of context.lootPreviews.splice(0)) loot.removePile(pile);
  if (clear) return 'Тестовый лут убран.';
  const feet = context.lootFeet(), view = context.renderer._view;
  if (!feet || !view) return 'Дождитесь загрузки комнаты.';
  if (!loot.physical.on()) return 'Включите Physical Items.';
  const forward = [-view[2], 0, -view[10]];
  const items = samples();
  Promise.all(items.map(async item => {
    if (usesLootPouch(item)) return null;
    if (item.group === 'Currency') return 'coins';
    const model = await loadItemLootModel(item).catch(() => null);
    model?.release();
    return model?.modelKey ?? null;
  })).then(keys => {
    if (context.lootRequest !== request || !context.active()) return;
    const packed = items.filter((_, i) => !keys[i]);
    const byModel = new Map();
    for (const [i, key] of keys.entries()) {
      if (!key) continue;
      if (!byModel.has(key)) byModel.set(key, []);
      byModel.get(key).push(items[i]);
    }
    const separate = [...byModel.values()].map(group => group[0]);
    const pouch = packed.find(usesLootPouch) ?? packed[0];
    const display = pouch ? [...separate, pouch] : separate;
    for (const pile of loot.dropPhysical(display, feet, forward)) {
      pile.unsaved = true;
      context.lootPreviews.push(pile);
    }
    if (packed.length) {
      consoleLog(`В мешочке (${packed.length}):`);
      for (const item of packed) consoleLog(`• ${shownItemName(item)}`);
    }
    for (const group of byModel.values()) {
      if (group.length > 1) consoleLog(`Одна модель: ${group.map(shownItemName).join(', ')}`);
    }
    report(`Размещено: ${display.length}. В мешочке: ${packed.length}. Списки в консоли.`);
  });
  return 'Проверяю модели дропа…';
}
