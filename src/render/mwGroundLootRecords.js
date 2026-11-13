import { isPotion } from '../systems/useItem.js';
import { isMeatLoot } from './foodLootModel.js';

export const usesLootPouch = (item) => isMeatLoot(item) ||
  ((item?.group === 'PlantIngredients1' || item?.group === 'PlantIngredients2') &&
    ([10, 11].includes(item.templateIndex) || (item.templateIndex >= 19 && item.templateIndex <= 26)));
import { GEM_GRADE_TEMPLATE_BASE, GEM_GRADE_TEMPLATES, GEM_IDS } from '../systems/loot/gemGrades.js';

// Ground-model references checked against the retail TES3 masters and BSA indexes.
const MODELS = Object.freeze({
  "8": "n/ingred_willow_anther_01.nif",
  "9": "n/ingred_hackle-lo_01.nif",
  "10": "n/ingred_bittergreen_01.nif",
  "11": "n/ingred_gold_kanet_01.nif",
  "15": "n/ingred_bm_belladonna_01.nif",
  "17": "n/ingred_bm_belladonna_01.nif",
  "18": "n/ingred_hackle-lo_01.nif",
  "19": "n/ingred_bittergreen_01.nif",
  "20": "n/ingred_gold_kanet_01.nif",
  "21": "n/ingred_heather_01.nif",
  "22": "n/ingred_stoneflower_01.nif",
  "23": "n/ingred_bittergreen_01.nif",
  "24": "n/ingred_heather_01.nif",
  "25": "n/ingred_gold_kanet_01.nif",
  "26": "n/ingred_stoneflower_01.nif",
  "33": "m/misc_potion_standard_01.nif",
  "35": "n/ingred_scales_01.nif",
  "38": "n/ingred_void_salts_01.nif",
  "41": "m/misc_potion_standard_01.nif",
  "42": "m/misc_potion_standard_01.nif",
  "43": "m/misc_potion_standard_01.nif",
  "45": "n/ingred_ash_salts_01.nif",
  "46": "n/ingred_scales_01.nif",
  "50": "m/misc_potion_standard_01.nif",
  "56": "m/horkertusk.nif",
  "57": "n/ingred_kwama_cuttle_01.nif",
  "59": "m/misc_potion_standard_01.nif",
  "60": "m/misc_potion_standard_01.nif",
  "61": "m/misc_potion_standard_01.nif",
  "62": "m/misc_potion_standard_01.nif",
  "63": "m/misc_potion_standard_01.nif",
  "64": "n/ingred_shalk_resin_01.nif",
  "262": "m/misc_potion_standard_01.nif",
  "263": "c/amulet_common_1.nif",
  "287": "m/text_parchment_02.nif",
  "537": "n/ingred_scrib_jerky_01.nif",
  "0": "n/ingred_ruby_01.nif",
  "1": "n/ingred_emerald_01.nif",
  "3": "n/ingred_diamond_01.nif",
  "12": "n/ingred_corkbulb_root_01.nif",
  "13": "n/ingred_horn_lily_bulb_01.nif",
  "16": "n/ingred_bm_holly_01.nif",
  "34": "m/horkertusk.nif",
  "39": "n/ingred_ectoplasm_01.nif",
  "51": "m/bm_flamingeyeball.nif",
  "53": "n/ingred_daedra_heart_01.nif",
  "77": "n/ingred_pearl_01.nif",
  "82": "m/misc_flask_01.nif",
  "83": "m/misc_com_bottle_15.nif",
  "84": "m/misc_lw_flask.nif",
  "85": "m/misc_pot_mottled_01.nif",
  "131": "w/w_iron_arrow.nif",
  "132": "m/text_quarto_03.nif",
  "247": "l/light_com_torch_01.nif",
  "248": "l/light_com_lantern_01.nif",
  "253": "l/light_de_candle_13.nif",
  "265": "m/misc_6th_ash_statue_01.nif",
  "269": "l/light_de_candle_13.nif",
  "270": "w/w_silver_dagger.nif",
  "271": "m/text_quarto_03.nif",
  "274": "m/misc_soulgem_common.nif",
  "277": "m/text_quarto_03.nif",
  "278": "m/text_note_01.nif",
  "279": "m/text_note_01.nif",
  "285": "m/text_note_01.nif",
  "286": "m/text_note_01.nif",
  "534": "n/ingred_bread_01.nif",
  "538": "n/ingred_hound_meat_01.nif"
});

export function groundLootRecord(item) {
  const index = item.group === 'Gems' && GEM_GRADE_TEMPLATES.includes(item.templateIndex)
    ? (item.templateIndex - GEM_GRADE_TEMPLATE_BASE) % GEM_IDS.length
    : item.templateIndex;
  const model = isPotion(item) ? 'm/misc_potion_standard_01.nif' : MODELS[index];
  return model ? { model } : null;
}
