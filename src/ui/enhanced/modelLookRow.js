import { itemAppearanceKey } from '../../systems/item/itemAppearanceKey.js';
import { pixelatedPreviewUrl, previewPixelKey, previewImageRendering } from './previewPixelation.js';
import { ownCloakFor } from '../../characters/ownModels/ownClothingModels.js';
import { CLOTHING_NAME } from '../../formats/morrowind/mwItemMap.js';
import { appearanceFigure } from './appearanceFigure.js';
import { modelDyeKey, modelDyeOf, setModelDye } from '../../systems/modelDye.js';
import { CLOTHING_DYES, DYE_NAMES } from '../../characters/dyes.js';
import { DF_CLOTHING_DYE_RGB } from '../../formats/morrowind/mwItemMap.js';
// MODEL-LOOKS (BLOODBATH, 2026-11-08; systems/modelLooks.js): THE 3D TAB'S ONE ROW - every look a piece may wear on the
// player's body in one list (the owner: "не должно быть таких разделений на старое и новое а все в одну кучу"): the
// port's own looks first (the Skyrim set, the helm's styles, the shields, the wolf pelts - systems/lookVariants.js, each
// its own switch), then every Morrowind record; with no own look, "Original" (the resolver's own record) leads. Paged
// three at a time like the 2D tab. Each card is a picture drawn the own looks' way (render/mwLookThumb.js: the record as
// worn, a pair as a pair), or the own look's baked picture; its name until the picture lands.
import { modelLookChoices, modelLookOf, setModelLook, modelLookOwnRecords, modelLookOwnChoice, modelLookKind } from '../../systems/modelLooks.js';
import { setLookVariant } from '../../systems/lookVariants.js';
import { mwLookThumb } from '../../render/mwLookThumb.js';

const PAGE = 3;
/** The page per piece, kept across the inventory's rerenders. */
const pages = new Map();
/** Picture data URLs by the records drawn. */
const urls = new Map();

function dataUrl(img) {
  if (!img || typeof document === 'undefined' || typeof ImageData === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    canvas.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    return canvas.toDataURL('image/png');
  } catch { return null; }
}

/**
 * The row, or null when the piece has no look to choose.
 * @param {{ item: any, fpArm: any, ownLooks?: Array<{ value: string, label: string, thumb: string | null, on: boolean }> | null,
 *           onChange: () => void, catalog?: any, thumb?: typeof mwLookThumb }} options
 */
export function modelLookRow({ item, fpArm, ownLooks = null, onChange, catalog = fpArm?.modelCatalog?.() ?? null, thumb = mwLookThumb }) {
  const records = modelLookChoices(item, catalog);
  const own = (ownLooks ?? []).map((c) => ({ kind: 'own', key: `own:${c.value}`, value: c.value, label: c.label, picture: c.thumb, on: c.on }));
  // beside own looks with no "classic" of their own, the Morrowind record they stand over is a choice too (it was lost)
  const ownRecord = own.length && !own.some((l) => l.value === 'classic') ? modelLookOwnChoice(item, catalog) : null;
  const looks = [
    ...(own.length ? own : (records.length || modelLookKind(item) === 'clothing') ? [{ kind: 'original', key: 'original', label: 'Исходный', records: modelLookOwnRecords(item, catalog) }] : []),
    ...(ownRecord ? [{ kind: 'record', key: `rec:${ownRecord.id}`, id: ownRecord.id, label: ownRecord.label, records: ownRecord.records }] : []),
    ...records.map((c) => ({ kind: 'record', key: `rec:${c.id}`, id: c.id, label: c.label, records: c.records })),
  ];
  if (looks.length < 2 && modelLookKind(item) !== 'clothing') return null;
  // an own look's "classic" carries no baked picture: it is the resolver's own record, drawn as one
  for (const l of looks) if (l.kind === 'own' && !l.picture && l.value === 'classic') l.records = modelLookOwnRecords(item, catalog);
  for (const look of looks) {
    const cloak = ownCloakFor({ kind: 'clothing', name: CLOTHING_NAME[item.templateIndex], dye: item.dye ?? 0 }, { look: look.value ?? 'classic' });
    if (cloak) { look.picture = null; look.records = [{ id: cloak.id, model: cloak.model }]; }
  }
  const kind = modelLookKind(item);
  const pauldron = item.templateIndex === 105 || item.templateIndex === 106;
  const key = `${itemAppearanceKey(item, true)}|${item.group}:${item.templateIndex}:${item.material ?? 0}`;
  const make = (tag, cls, text = '') => { const n = document.createElement(tag); n.className = cls; n.textContent = text; return n; };
  const activeKey = () => { const id = modelLookOf(item); if (id) return `rec:${id}`; const on = own.find((l) => l.on); return on ? on.key : 'original'; };
  if (!pages.has(key)) pages.set(key, Math.max(0, Math.floor(looks.findIndex((l) => l.key === activeKey()) / PAGE)));
  const root = make('div', 'look-row model-look-row');
  root.setAttribute('aria-label', '3D-модели');
  const preview = appearanceFigure(fpArm, root, { back: [154, 155, 191, 192].includes(item.templateIndex) });
  root.setPreviewVisible = (visible) => visible ? preview.start() : preview.stop();
  const draw = () => {
    const visible = looks.slice();
    const current = activeKey();
    const page = Math.max(0, Math.min(pages.get(key) ?? 0, Math.ceil(visible.length / PAGE) - 1));
    pages.set(key, page);
    root.replaceChildren();
    const active = looks.find((l) => l.key === current);
    const dyeKey = modelDyeKey(item, active);
    if (kind === 'clothing' && dyeKey) {
      const dyes = make('div', 'look-dyes');
      dyes.setAttribute('role', 'group'); dyes.setAttribute('aria-label', 'Цвет ткани');
      for (const d of [null, ...CLOTHING_DYES]) {
        const button = make('button', `look-dye${modelDyeOf(dyeKey) === d ? ' on' : ''}`, d === null ? '↺' : '');
        button.type = 'button'; button.title = d === null ? 'Исходный цвет' : DYE_NAMES[d];
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-pressed', String(modelDyeOf(dyeKey) === d));
        if (d !== null) button.style?.setProperty('background', `rgb(${DF_CLOTHING_DYE_RGB[d].join(',')})`);
        button.onclick = () => { if (setModelDye(dyeKey, d)) { urls.clear(); preview.pending(); draw(); onChange(); } };
        dyes.append(button);
      }
      root.append(dyes);
    }
    const cards = make('div', 'look-cards');
    for (const look of visible.slice(page * PAGE, page * PAGE + PAGE)) {
      const on = look.key === current;
      const button = make('button', `look-pick${on ? ' on' : ''}`);
      button.type = 'button'; button.title = look.label;
      button.setAttribute('aria-label', look.label); button.setAttribute('aria-pressed', String(on));
      button.setAttribute('data-model-look', look.key);
      const name = make('span', 'look-name', look.label);
      const show = (src) => { if (!src) return; const image = make('img', ''); image.style?.setProperty('image-rendering', previewImageRendering()); image.alt = look.label; pixelatedPreviewUrl(src).then((url) => { image.src = url; }); name.remove(); button.replaceChildren(image); };
      button.append(name);
      if (look.picture) show(look.picture);
      else if (look.records?.length && catalog) {
        const rk = `${previewPixelKey()}:${itemAppearanceKey(item)}:${modelDyeOf(itemAppearanceKey(item))}:${catalog.gen ?? 0}:${look.records.map((r) => `${r.id}:${r.model}`).join('+')}`;
        if (urls.has(rk)) show(urls.get(rk));
        else Promise.resolve(thumb(look.records, kind, catalog, { pauldron, dye: modelDyeOf(itemAppearanceKey(item)) })).then((img) => { const u = dataUrl(img); if (u) { urls.set(rk, u); show(u); } }).catch(() => {});
      }
      button.onclick = () => {
        let changed = false;
        if (look.kind === 'record') changed = setModelLook(item, look.id);
        else {
          changed = setModelLook(item, null);   // an own look or Original puts a chosen record down
          if (look.kind === 'own') changed = setLookVariant(item, look.value) || changed;
        }
        if (changed) { preview.pending(); for (const l of own) l.on = l.key === look.key; draw(); onChange(); }
      };
      cards.append(button);
    }
    const navigation = make('div', 'look-pages');
    for (const [delta, label] of [[-1, 'Предыдущий ряд'], [1, 'Следующий ряд']]) {
      const button = make('button', delta < 0 ? 'look-page-prev' : 'look-page-next'); button.type = 'button';
      button.title = label; button.setAttribute('aria-label', label);
      button.disabled = delta < 0 ? page === 0 : (page + 1) * PAGE >= visible.length;
      button.onclick = () => { pages.set(key, page + delta); draw(); };
      navigation.append(button);
    }
    root.append(cards, navigation);
  };
  draw();
  return root;
}
