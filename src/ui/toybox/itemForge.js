// @ts-check
// THE TOYBOX'S CREATE ITEM WINDOW: any piece a player can wear, its picture and its stats beside it. The fields a piece
// really carries are edited (material, condition, weight, value, name, special effects, enchantments, side effects,
// binding); damage and armour follow the template and the material, so they are shown and never typed. The piece is
// made by the toybox's own maker (systems/toybox/toyboxItem.js) on every change, so the window shows the law's findings
// before a grant, marks the special effects the law refuses online, and the grant sends the same spec. The account box
// at the foot lists the accounts online, above the box.
import { PIXEL_FONT_CSS, PIXEL_TEXT_SHADOW } from '../pixelifyFive.js';
import { STAFF_TAG_COLORS } from '../staffTags.js';
import { TOYBOX_PANEL_CSS, keepFromGame, toyButton, makeDraggable, placeOnScreen, titleBar } from './toyboxWindow.js';
import { createSuggestAbove } from './suggestAbove.js';
import {
  toyboxCatalogue,
  buildToyboxItem,
  toyboxEnchantChoices,
  toyboxParamChoices,
  toyboxSpecialRefused,
  materialsOf,
  TOYBOX_ROWS_MAX,
} from '../../systems/toybox/toyboxItem.js';
import {
  specialChoices,
  specialParams,
  specialView,
  specialLines,
  specialMaterial,
  specialBandTier,
  SPECIAL_SECTIONS,
  SPECIAL_MAX,
} from '../../systems/toybox/toyboxSpecial.js';
import { enchantmentName } from '../../systems/enchantmentCatalogue.js';
import { inventoryItemImage } from '../../systems/item/itemTemplates.js';
import { weaponDamageRange } from '../../systems/item/itemInfo.js';
import { itemArmorValue } from '../../systems/armorMaterials.js';
import { unitWeightInKg } from '../../systems/inventory.js';
import { requestIcon } from '../textureCanvas.js';

const FIELD_CSS =
  `${PIXEL_FONT_CSS}font-size:13px;color:#e6f6f8;background:rgba(0,0,0,0.45);border:1px solid rgba(127,227,240,0.4);` +
  `border-radius:3px;padding:2px 5px;box-sizing:border-box;user-select:text;`;
const LABEL_CSS = `color:${STAFF_TAG_COLORS.name};font-size:12px;`;
const ROW_CSS = 'display:flex;align-items:center;gap:6px;';
const PICTURE_CSS =
  'width:72px;height:72px;flex:none;display:flex;align-items:center;justify-content:center;' +
  'background:rgba(0,0,0,0.5);border:1px solid rgba(127,227,240,0.35);border-radius:3px;';

/** The player's words for the maker's refusals and the law's findings. */
const SPEC_TEXT = Object.freeze({
  'toybox-template': 'Choose a piece to make.',
  'toybox-material': 'That piece does not take that material.',
  'toybox-field': 'A number or the name is out of its bounds.',
  'toybox-enchant': 'There is no room in the item for these enchantments.',
  'toybox-special': 'That piece cannot carry those special effects.',
});
/** @param {string[]} findings */
export const findingsText = (findings) => `The item law refuses this piece: ${findings.join(', ')}.`;
/** What the window says of special effects the law refuses: online they block the grant, offline they go in as made. */
export const OFFLINE_ONLY_TEXT = 'Effects marked Offline only work in offline play. Online, the item law refuses them.';
export const OFFLINE_GRANT_TEXT = 'Offline, the piece goes into your pack as made.';
/** A Rare with none of a found Rare's own enchantments among its rows: the law asks for one. */
export const RARE_OWN_TEXT = 'A found Rare also carries one Rare enchantment. Add one under Enchantments to grant it online.';

/** The default picture door: the pack's own icon, or null until it loads. @param {any} item @param {() => void} onReady */
function packIcon(item, onReady) {
  const img = inventoryItemImage(item);
  return img?.archive != null
    ? requestIcon(img.archive, img.record, { scale: 2, dye: img.dye, dyeTarget: img.dyeTarget, onReady })
    : null;
}

/** A number box's value: an integer or a number as `whole` asks, or null for an empty or unreadable box.
 *  @param {string} raw @param {boolean} whole */
function numberOf(raw, whole) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return NaN;
  return whole ? Math.trunc(n) : n;
}

/**
 * The window. `grant(spec, target)` sends the spec (`target` null for one's own pack, else the typed account) and
 * answers `{ ok, error?, item? }`; `onGranted(item)` hears one that landed; `players()` names the accounts online.
 * @param {{ document: Document, win?: any, online: () => boolean, players: () => string[],
 *   grant: (spec: any, target: string | null) => Promise<{ ok: boolean, error?: string, item?: any }>,
 *   onGranted?: (item: any) => void, errorText?: (error: string) => string,
 *   icon?: (item: any, onReady: () => void) => string | null }} deps
 */
export function createItemForge({
  document: doc,
  win = doc.defaultView ?? globalThis,
  online,
  players,
  grant,
  onGranted = () => {},
  errorText = (e) => `The grant was refused (${e}).`,
  icon = packIcon,
}) {
  const catalogue = toyboxCatalogue();
  const first = catalogue.find((section) => section.items.length)?.items[0];
  /** @type {{ template: number, group: string, material?: number, name: string | null, condition: number | null,
   *   weight: number | null, value: number | null, enchantments: { type: string, param: number }[],
   *   sideEffects: { type: string, param: number }[], special: any[], bound: boolean }} */
  const state = {
    template: first?.template ?? 113,
    group: first?.group ?? 'Weapons',
    material: materialsOf(first?.group ?? 'Weapons')?.[0]?.[0],
    name: null,
    condition: null,
    weight: null,
    value: null,
    enchantments: [],
    sideEffects: [],
    special: [],
    bound: false,
  };
  let shown = false,
    busy = false;
  /** @type {'powers' | 'sides' | 'special' | null} */
  let adding = null;
  /** @type {any} */
  let made = null;

  const makeEl = (/** @type {string} */ tag, css = '', text = '') => {
    const n = doc.createElement(tag);
    if (css) n.style.cssText = css;
    if (text) n.textContent = text;
    return n;
  };
  const labelled = (/** @type {string} */ words, /** @type {HTMLElement} */ field) => {
    const row = makeEl('label', ROW_CSS);
    row.append(makeEl('span', LABEL_CSS + 'min-width:74px;', words), field);
    return row;
  };
  const box = (/** @type {string} */ type, /** @type {string} */ data, width = '90px') => {
    const i = /** @type {HTMLInputElement} */ (makeEl('input', FIELD_CSS + `width:${width};`));
    i.type = type;
    i.setAttribute('data-forge', data);
    return i;
  };

  const root = makeEl('div', TOYBOX_PANEL_CSS + 'display:none;width:420px;max-height:90vh;overflow-y:auto;');
  root.style.left = '220px';
  root.style.top = '80px';
  root.setAttribute('data-item-forge', '');
  root.setAttribute('role', 'dialog');
  keepFromGame(root);
  const close = () => {
    if (!shown) return;
    shown = false;
    adding = null;
    suggest.close();
    root.style.display = 'none';
  };
  const { bar } = titleBar(doc, 'Create Item', close);
  makeDraggable(bar, root, win);
  const body = makeEl('div', 'display:flex;flex-direction:column;gap:6px;padding:6px 8px;');

  // the piece and its material
  const pieceSel = /** @type {HTMLSelectElement} */ (makeEl('select', FIELD_CSS + 'width:100%;'));
  pieceSel.setAttribute('data-forge', 'piece');
  for (const section of catalogue) {
    if (!section.items.length) continue;
    const optgroup = makeEl('optgroup');
    optgroup.setAttribute('label', section.label);
    for (const it of section.items) {
      const option = /** @type {HTMLOptionElement} */ (makeEl('option', '', it.name));
      option.value = `${it.group}:${it.template}`;
      optgroup.append(option);
    }
    pieceSel.append(optgroup);
  }
  const matSel = /** @type {HTMLSelectElement} */ (makeEl('select', FIELD_CSS + 'width:140px;'));
  matSel.setAttribute('data-forge', 'material');
  const matRow = labelled('Material', matSel);

  // the picture, and the stats beside it
  const picture = makeEl('div', PICTURE_CSS);
  picture.setAttribute('data-forge', 'picture');
  const nameBox = box('text', 'name', '200px');
  nameBox.maxLength = 64;
  const condBox = box('number', 'condition');
  const condMax = makeEl('span', LABEL_CSS);
  const condRow = labelled('Condition', condBox);
  condRow.append(condMax);
  const weightBox = box('number', 'weight');
  weightBox.step = '0.25';
  const valueBox = box('number', 'value');
  const readout = makeEl('div', 'font-size:12px;line-height:1.4;');
  readout.setAttribute('data-forge', 'readout');
  const stats = makeEl('div', 'display:flex;flex-direction:column;gap:3px;min-width:0;');
  stats.append(labelled('Name', nameBox), condRow, labelled('Weight', weightBox), labelled('Value', valueBox), readout);
  const top = makeEl('div', 'display:flex;gap:8px;align-items:flex-start;');
  top.append(picture, stats);

  // the enchantments and the side effects
  const listPart = (/** @type {'powers' | 'sides' | 'special'} */ kind, /** @type {string} */ heading, /** @type {string} */ add, /** @type {HTMLElement | null} */ extra = null) => {
    const part = makeEl('div', 'display:flex;flex-direction:column;gap:3px;');
    part.setAttribute('data-forge', kind);
    const head = makeEl('div', ROW_CSS + 'justify-content:space-between;');
    const addBtn = toyButton(doc, add, () => {
      adding = adding === kind ? null : kind;
      paint();
    });
    addBtn.setAttribute('data-forge-add', kind);
    head.append(makeEl('span', LABEL_CSS, heading), ...(extra ? [extra] : []), addBtn);
    const rows = makeEl('div', 'display:flex;flex-direction:column;gap:2px;');
    const picker = makeEl('div', 'display:none;flex-direction:column;gap:2px;max-height:160px;overflow-y:auto;');
    picker.setAttribute('data-forge-picker', kind);
    part.append(head, rows, picker);
    return { part, addBtn, rows, picker };
  };
  const specialPart = listPart('special', 'Special Effects', 'Add special effect');
  const powersPart = listPart('powers', 'Enchantments', 'Add enchantment');
  const sidesPart = listPart('sides', 'Side Effects', 'Add side effect');
  const law = makeEl('div', 'font-size:12px;min-height:1em;white-space:normal;color:' + STAFF_TAG_COLORS.high + ';');
  law.setAttribute('data-forge', 'law');

  // the account and the grant
  const targetWrap = makeEl('div', 'position:relative;');
  const target = box('text', 'target', '100%');
  target.autocomplete = 'off';
  targetWrap.append(target);
  const suggest = createSuggestAbove(target, { list: () => players() ?? [] });
  const bound = /** @type {HTMLInputElement} */ (makeEl('input'));
  bound.type = 'checkbox';
  bound.setAttribute('data-forge', 'soulbound');
  const boundLabel = makeEl('label', ROW_CSS + 'cursor:pointer;');
  boundLabel.setAttribute('title', 'It cannot be traded or dropped, only destroyed.');
  boundLabel.append(bound, makeEl('span', '', 'Soulbound'));
  const grantBtn = toyButton(doc, 'Grant', () => void doGrant());
  grantBtn.setAttribute('data-forge', 'grant');
  const foot = makeEl('div', ROW_CSS);
  foot.append(grantBtn, boundLabel);
  const status = makeEl('div', 'font-size:12px;min-height:1em;white-space:normal;');
  status.setAttribute('data-forge', 'status');

  body.append(pieceSel, matRow, top, specialPart.part, powersPart.part, sidesPart.part, law, targetWrap, foot, status);
  root.append(bar, body);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      close();
    }
  });
  doc.body.append(root);

  const spec = () => ({
    template: state.template,
    group: state.group,
    ...(state.material !== undefined ? { material: state.material } : {}),
    ...(state.name != null ? { name: state.name } : {}),
    ...(state.condition != null ? { condition: state.condition } : {}),
    ...(state.weight != null ? { weight: state.weight } : {}),
    ...(state.value != null ? { value: state.value } : {}),
    enchantments: state.enchantments.map((e) => ({ ...e })),
    sideEffects: state.sideEffects.map((e) => ({ ...e })),
    special: state.special.map((e) => ({ ...e })),
    ...(state.special.length ? { tier: 'rare' } : {}),
    ...(state.bound ? { bound: true } : {}),
  });
  const piece = () => ({ group: state.group, templateIndex: state.template });
  const say = (/** @type {string} */ line) => {
    status.textContent = line;
  };

  const fillMaterials = () => {
    const mats = materialsOf(state.group);
    matRow.style.display = mats ? 'flex' : 'none';
    matSel.replaceChildren(
      ...(mats ?? []).map(([value, n]) => {
        const option = /** @type {HTMLOptionElement} */ (makeEl('option', '', String(n)));
        option.value = String(value);
        return option;
      }),
    );
    if (mats) matSel.value = String(state.material);
  };
  /** Puts `value` in a box the player is not typing in. @param {HTMLInputElement} b @param {unknown} value */
  const put = (b, value) => {
    if (doc.activeElement !== b) b.value = value == null ? '' : String(value);
  };

  const rowOf = (/** @type {'powers' | 'sides'} */ kind, /** @type {{ type: string, param: number }} */ e, /** @type {number} */ at) => {
    const power = kind === 'powers';
    const list = power ? state.enchantments : state.sideEffects;
    const row = makeEl('div', ROW_CSS);
    row.setAttribute('data-forge-row', `${kind}:${at}`);
    const choices = toyboxParamChoices(spec(), power, at);
    row.append(makeEl('span', 'min-width:130px;', enchantmentName(e.type)));
    if (choices.length > 1 || (choices[0]?.label ?? '') !== '') {
      const sel = /** @type {HTMLSelectElement} */ (makeEl('select', FIELD_CSS + 'flex:1;min-width:0;'));
      sel.replaceChildren(
        ...choices.map((choice) => {
          const option = /** @type {HTMLOptionElement} */ (makeEl('option', '', choice.label || String(choice.param)));
          option.value = String(choice.param);
          return option;
        }),
      );
      sel.value = String(e.param);
      sel.addEventListener('change', () => {
        list[at] = { type: e.type, param: Number(sel.value) };
        paint();
      });
      row.append(sel);
    } else row.append(makeEl('span', 'flex:1;'));
    const x = toyButton(doc, 'X', () => {
      list.splice(at, 1);
      paint();
    });
    x.setAttribute('aria-label', 'Remove');
    x.style.padding = '0 6px';
    row.append(x);
    return row;
  };
  const paintList = (/** @type {'powers' | 'sides'} */ kind, /** @type {ReturnType<typeof listPart>} */ part) => {
    const power = kind === 'powers';
    const list = power ? state.enchantments : state.sideEffects;
    part.rows.replaceChildren(...list.map((e, i) => rowOf(kind, e, i)));
    const choices = toyboxEnchantChoices(spec(), power).filter((choice) => choice.params.length);
    const full = state.enchantments.length + state.sideEffects.length >= TOYBOX_ROWS_MAX;
    const none = full || !choices.length;
    part.addBtn.disabled = none;
    part.addBtn.style.opacity = none ? '0.4' : '1';
    if (none && adding === kind) adding = null;
    part.picker.style.display = adding === kind ? 'flex' : 'none';
    part.picker.replaceChildren(
      ...(adding === kind
        ? choices.map((choice) => {
            const b = toyButton(doc, choice.name, () => {
              list.push({ type: choice.type, param: choice.params[0].param });
              adding = null;
              paint();
            });
            b.setAttribute('data-forge-choice', choice.type);
            return b;
          })
        : []),
    );
  };

  // the special effects: the port's own marks, each a row with its setting, its value and what it does
  const SMALL_CSS = 'font-size:11px;opacity:0.8;white-space:normal;';
  const bandTier = (/** @type {any[]} */ held) => specialBandTier(piece(), held, 'rare');
  const specialRow = (/** @type {any} */ entry, /** @type {number} */ at, /** @type {boolean} */ refused) => {
    const view = specialView(piece(), entry);
    const wrap = makeEl('div', 'display:flex;flex-direction:column;gap:1px;');
    wrap.setAttribute('data-forge-row', `special:${at}`);
    const row = makeEl('div', ROW_CSS);
    row.append(makeEl('span', 'min-width:130px;', view.name));
    const params = specialParams(piece(), state.special, at);
    if (params?.length) {
      const sel = /** @type {HTMLSelectElement} */ (makeEl('select', FIELD_CSS + 'flex:1;min-width:0;'));
      sel.setAttribute('data-forge-param', String(at));
      sel.replaceChildren(
        ...params.map((/** @type {any} */ choice) => {
          const option = /** @type {HTMLOptionElement} */ (makeEl('option', '', choice.label));
          option.value = String(choice.param);
          return option;
        }),
      );
      sel.value = String(entry.param);
      sel.addEventListener('change', () => {
        const picked = params.find((/** @type {any} */ choice) => String(choice.param) === sel.value);
        if (picked) state.special[at] = { ...entry, param: picked.param };
        paint();
      });
      row.append(sel);
    } else row.append(makeEl('span', 'flex:1;'));
    if (view.max != null) {
      const num = box('number', 'special-value', '56px');
      num.setAttribute('data-forge-value', String(at));
      num.min = '1';
      num.max = String(view.max);
      num.value = String(entry.value);
      const [lo, hi] = view.band?.[bandTier(state.special)] ?? [1, view.max];
      num.title = `${lo} - ${hi}`;
      num.addEventListener('change', () => {
        const value = numberOf(num.value, true);
        if (value != null && value >= 1 && value <= /** @type {number} */ (view.max)) state.special[at] = { ...entry, value };
        paint();
      });
      row.append(num);
    }
    const x = toyButton(doc, 'X', () => {
      state.special.splice(at, 1);
      paint();
    });
    x.setAttribute('aria-label', 'Remove');
    x.style.padding = '0 6px';
    row.append(x);
    wrap.append(row);
    const words = makeEl('div', SMALL_CSS, view.does);
    if (refused) {
      const tag = makeEl('span', `color:${STAFF_TAG_COLORS.high};`, 'Offline only. ');
      tag.setAttribute('data-forge-offline', String(at));
      words.replaceChildren(tag, makeEl('span', '', view.does));
    }
    wrap.append(words);
    return wrap;
  };
  const addSpecial = (/** @type {any} */ choice) => {
    /** @type {any} */
    const entry = { kind: choice.kind, id: choice.id, ...(choice.params ? { param: choice.params[0].param } : {}) };
    if (choice.band) entry.value = choice.band[bandTier([...state.special, entry])][0];
    state.special.push(entry);
    const fixed = specialMaterial(piece(), state.special);
    if (fixed !== undefined && fixed !== state.material) {
      state.material = fixed;
      fillMaterials();
    }
    adding = null;
    paint();
  };
  const paintSpecial = () => {
    const refused = state.special.length && made?.findings?.length ? toyboxSpecialRefused(spec()) : [];
    specialPart.rows.replaceChildren(...state.special.map((entry, i) => specialRow(entry, i, refused[i] === true)));
    const choices = 'error' in (made ?? {}) ? [] : specialChoices(piece(), state.special);
    const none = state.special.length >= SPECIAL_MAX || !choices.length;
    specialPart.addBtn.disabled = none;
    specialPart.addBtn.style.opacity = none ? '0.4' : '1';
    if (none && adding === 'special') adding = null;
    specialPart.picker.style.display = adding === 'special' ? 'flex' : 'none';
    if (adding !== 'special') return void specialPart.picker.replaceChildren();
    const parts = [];
    for (const section of SPECIAL_SECTIONS) {
      const mine = choices.filter((choice) => choice.section === section.id);
      if (!mine.length) continue;
      parts.push(makeEl('span', LABEL_CSS, section.label));
      for (const choice of mine) {
        const line = makeEl('div', 'display:flex;flex-direction:column;gap:1px;');
        const pick = toyButton(doc, choice.name, () => addSpecial(choice));
        pick.setAttribute('data-forge-choice', `${choice.kind}:${choice.id}`);
        pick.setAttribute('data-forge-section', section.id);
        line.append(pick, makeEl('span', SMALL_CSS, choice.does));
        parts.push(line);
      }
    }
    specialPart.picker.replaceChildren(...parts);
  };

  function paintPicture(/** @type {any} */ item) {
    let src = null;
    try {
      src = item ? icon(item, () => shown && made?.item === item && paintPicture(item)) : null;
    } catch {
      src = null;
    }
    if (!src) return void picture.replaceChildren();
    const img = /** @type {HTMLImageElement} */ (makeEl('img', 'max-width:64px;max-height:64px;image-rendering:pixelated;'));
    img.src = src;
    img.alt = '';
    picture.replaceChildren(img);
  }

  /** The law's line: a refusal, the findings, and what the special effects it refuses do offline. @param {boolean} offline */
  function lawText(offline) {
    if ('error' in made) return SPEC_TEXT[/** @type {keyof typeof SPEC_TEXT} */ (made.error)] ?? made.error;
    if (!made.findings.length) return '';
    const special = made.baseFindings.length ? '' : ` ${OFFLINE_ONLY_TEXT}${offline ? ` ${OFFLINE_GRANT_TEXT}` : ''}`;
    const own = made.item?.rarity === 'rare' && made.findings.includes('enchantments') ? ` ${RARE_OWN_TEXT}` : '';
    return findingsText(made.findings) + special + own;
  }

  function paint() {
    made = buildToyboxItem(spec());
    const item = made.item ?? null;
    pieceSel.value = `${state.group}:${state.template}`;
    put(nameBox, state.name ?? item?.name ?? '');
    put(condBox, state.condition ?? item?.currentCondition ?? '');
    condMax.textContent = item ? `/ ${item.maxCondition ?? 0}` : '';
    put(weightBox, state.weight ?? (item ? Math.round(unitWeightInKg(item) * 100) / 100 : ''));
    put(valueBox, state.value ?? item?.value ?? '');
    bound.checked = state.bound;
    const lines = [];
    if (item?.group === 'Weapons') {
      const [lo, hi] = weaponDamageRange(item);
      lines.push(`Damage: ${lo} - ${hi}`);
    }
    if (item?.group === 'Armor') lines.push(`Armor: ${itemArmorValue(item)}`);
    if (item) lines.push(`Enchantment points: ${made.cost} / ${made.power}`);
    if (item) lines.push(...specialLines(item));
    readout.textContent = lines.join('\n');
    readout.style.whiteSpace = 'pre-line';
    paintPicture(item);
    paintSpecial();
    paintList('powers', powersPart);
    paintList('sides', sidesPart);
    const offline = !online();
    target.disabled = offline;
    target.placeholder = offline ? 'Offline: your own pack' : 'Empty: your own pack';
    if (offline && target.value) target.value = '';
    law.textContent = lawText(offline);
    const blocked = busy || !item || (offline ? made.baseFindings : made.findings).length > 0;
    grantBtn.disabled = blocked;
    grantBtn.style.opacity = blocked ? '0.4' : '1';
  }

  pieceSel.addEventListener('change', () => {
    const [group, template] = String(pieceSel.value).split(':');
    state.group = group;
    state.template = Number(template);
    state.material = materialsOf(group)?.[0]?.[0];
    Object.assign(state, { name: null, condition: null, weight: null, value: null, enchantments: [], sideEffects: [] });
    Object.assign(state, { special: [] });
    adding = null;
    fillMaterials();
    paint();
  });
  matSel.addEventListener('change', () => {
    state.material = Number(matSel.value);
    paint();
  });
  nameBox.addEventListener('input', () => {
    state.name = nameBox.value.trim() ? nameBox.value : null;
    paint();
  });
  for (const [b, k, whole] of /** @type {const} */ ([
    [condBox, 'condition', true],
    [weightBox, 'weight', false],
    [valueBox, 'value', true],
  ]))
    b.addEventListener('change', () => {
      state[k] = /** @type {any} */ (numberOf(b.value, whole));
      paint();
    });
  bound.addEventListener('change', () => {
    state.bound = !!bound.checked;
    paint();
  });

  async function doGrant() {
    if (busy || !made?.item || (online() ? made.findings : made.baseFindings).length) return;
    const to = online() && target.value.trim() ? target.value.trim() : null;
    busy = true;
    say('Granting...');
    paint();
    /** @type {{ ok: boolean, error?: string, item?: any }} */
    let result;
    try {
      result = await grant(spec(), to);
    } catch {
      result = { ok: false, error: 'server' };
    }
    busy = false;
    if (result?.ok) {
      say(to ? `Sent to ${to}.` : 'Added to your pack.');
      try {
        onGranted(result.item ?? made.item);
      } catch {
        /* the grant stands */
      }
    } else say(errorText(result?.error ?? 'server'));
    paint();
  }

  fillMaterials();
  return {
    el: root,
    open() {
      if (!shown) {
        shown = true;
        root.style.display = 'block';
        placeOnScreen(root, parseFloat(root.style.left) || 0, parseFloat(root.style.top) || 0, win);
      }
      say('');
      paint();
    },
    close,
    isOpen: () => shown,
    /** The spec the window holds now (for the host and tests). */
    spec,
    /** The piece the spec makes now: `{ item, findings, cost, power }` or `{ error }`. */
    made: () => made,
    suggest,
    dispose() {
      close();
      suggest.destroy();
      root.remove();
    },
  };
}
