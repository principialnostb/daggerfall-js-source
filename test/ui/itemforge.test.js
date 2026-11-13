// The toybox's Create Item window (src/ui/toybox/itemForge.js): a wearable piece chosen, its stats edited and its damage
// recomputed, special effects, enchantments and side effects added, changed and removed, the law's findings shown (the
// special effects it refuses online marked), and the grant sent to one's own pack or a typed account.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createItemForge, findingsText, OFFLINE_ONLY_TEXT, OFFLINE_GRANT_TEXT, RARE_OWN_TEXT } from '../../src/ui/toybox/itemForge.js';
import { toyboxCatalogue } from '../../src/systems/toybox/toyboxItem.js';

// A small DOM: elements that bubble events up their parents, a window that hears capture listeners first.
function fakeDom({ width = 1200, height = 900 } = {}) {
  const win = { innerWidth: width, innerHeight: height, on: [] };
  win.addEventListener = (type, f, capture) => win.on.push({ type, f, capture: !!capture });
  win.removeEventListener = (type, f, capture) => { win.on = win.on.filter((l) => !(l.type === type && l.f === f && l.capture === !!capture)); };
  win.getComputedStyle = (el) => ({ position: el.style.position || 'static' });
  const doc = { defaultView: win, activeElement: null };
  const node = (tag) => {
    const n = { tagName: tag.toUpperCase(), children: [], parentElement: null, ownerDocument: doc, attrs: {}, on: {}, style: {}, _text: '', value: '', checked: false, disabled: false, tabIndex: 0, offsetWidth: 100, offsetHeight: 80, offsetLeft: 0, offsetTop: 0, clientHeight: 80 };
    Object.defineProperty(n, 'textContent', { get: () => n._text + n.children.map((c) => c.textContent).join(''), set: (t) => { n.children = []; n._text = String(t); } });
    n.append = (...cs) => { for (const c of cs) { c.parentElement = n; n.children.push(c); } };
    n.appendChild = (c) => { n.append(c); return c; };
    n.replaceChildren = (...cs) => { n.children = []; n.append(...cs); };
    n.remove = () => { if (n.parentElement) n.parentElement.children = n.parentElement.children.filter((c) => c !== n); n.parentElement = null; };
    n.setAttribute = (k, v) => { n.attrs[k] = String(v); };
    n.getAttribute = (k) => n.attrs[k] ?? null;
    n.removeAttribute = (k) => { delete n.attrs[k]; };
    n.addEventListener = (k, f) => (n.on[k] ??= []).push(f);
    n.removeEventListener = (k, f) => { n.on[k] = (n.on[k] ?? []).filter((x) => x !== f); };
    n.focus = () => { doc.activeElement = n; };
    n.blur = () => { if (doc.activeElement === n) doc.activeElement = null; };
    n.getBoundingClientRect = () => ({ left: parseFloat(n.style.left) || 0, top: parseFloat(n.style.top) || 0, width: n.offsetWidth, height: n.offsetHeight });
    n.setPointerCapture = (id) => { n.captured = id; };
    n.releasePointerCapture = () => { n.captured = null; };
    return n;
  };
  doc.createElement = (tag) => node(tag);
  doc.body = node('body');
  function fire(target, type, props = {}) {
    let stopped = false;
    const e = { type, target, defaultPrevented: false, key: '', ...props, preventDefault() { e.defaultPrevented = true; }, stopPropagation() { stopped = true; } };
    for (const l of [...win.on]) if (l.type === type && l.capture) l.f(e);
    for (let n = target; n && !stopped; n = n.parentElement) for (const f of [...(n.on[type] ?? [])]) f(e);
    if (!stopped) for (const l of [...win.on]) if (l.type === type && !l.capture) l.f(e);
    e.reachedWindow = !stopped;
    return e;
  }
  const all = (root = doc.body) => [root, ...root.children.flatMap((c) => all(c))];
  const byAttr = (k, v, root) => all(root).find((n) => n.attrs[k] != null && (v === undefined || n.attrs[k] === v)) ?? null;
  const allByAttr = (k, root) => all(root).filter((n) => n.attrs[k] != null);
  const set = (el, value, type = 'change') => { el.value = value; fire(el, type); };
  return { doc, win, fire, all, byAttr, allByAttr, set };
}
const flush = () => new Promise((r) => setImmediate(r));

function forge({ online = true, players = ['Ann', 'Annabel', 'Bob'], answer = { ok: true } } = {}) {
  const dom = fakeDom();
  const asked = [], granted = [];
  let net = online;
  const f = createItemForge({
    document: dom.doc, win: dom.win, online: () => net, players: () => players,
    grant: async (spec, target) => { asked.push({ spec, target }); return typeof answer === 'function' ? answer(spec, target) : answer; },
    onGranted: (item) => granted.push(item),
    icon: () => 'data:icon',
  });
  f.open();
  const q = (name) => dom.byAttr('data-forge', name, f.el);
  return { dom, f, asked, granted, q, goOffline: () => { net = false; } };
}

test('it opens on a weapon with its picture and stats, movable, its presses kept from the game, Escape closing it', () => {
  const { dom, f, q } = forge();
  assert.equal(f.isOpen(), true);
  assert.match(f.el.textContent, /Create Item/);
  assert.equal(q('picture').children[0]?.src, 'data:icon', 'the piece\'s picture');
  assert.match(q('readout').textContent, /Damage: \d+ - \d+/);
  const pieces = dom.all(q('piece')).filter((n) => n.tagName === 'OPTION').length;
  assert.equal(pieces, toyboxCatalogue().reduce((s, c) => s + c.items.length, 0), 'every wearable piece listed');
  assert.equal(dom.fire(q('name'), 'keydown', { key: 'w' }).reachedWindow, false, 'the game never hears a key typed here');
  assert.equal(dom.fire(f.el, 'pointerdown', {}).reachedWindow, false, 'nor a press');
  dom.fire(f.el.children[0], 'pointerdown', { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
  dom.fire(f.el.children[0], 'pointermove', { clientX: 60, clientY: 40, pointerId: 1 });
  assert.equal(f.el.style.left, '270px', `dragged by its title bar (${f.el.style.left})`);
  dom.fire(q('name'), 'keydown', { key: 'Escape' });
  assert.equal(f.isOpen(), false);
});

test('the material recomputes the damage; armour shows its armour; the typed fields go in the spec', () => {
  const { dom, f, q } = forge();
  dom.set(q('piece'), 'Weapons:120');
  const iron = q('readout').textContent;
  dom.set(q('material'), '9');
  assert.notEqual(q('readout').textContent, iron, 'Daedric hits harder than iron');
  assert.equal(f.spec().material, 9);
  dom.set(q('name'), 'Toy Blade', 'input');
  dom.set(q('condition'), '50');
  dom.set(q('weight'), '1.5');
  dom.set(q('value'), '1234');
  assert.deepEqual([f.spec().name, f.spec().condition, f.spec().weight, f.spec().value], ['Toy Blade', 50, 1.5, 1234]);
  assert.equal(f.made().item.currentCondition, 50);
  dom.set(q('value'), '');
  assert.equal(f.spec().value, undefined, 'an emptied box is the producer\'s value again');
  dom.set(q('piece'), 'Armor:102');
  assert.match(q('readout').textContent, /Armor: \d+/);
  assert.doesNotMatch(q('readout').textContent, /Damage/);
  assert.equal(f.spec().name, undefined, 'a new piece starts fresh');
  dom.set(q('piece'), 'Jewellery:135');
  assert.equal(q('material').parentElement.style.display, 'none', 'a ring takes no material');
});

test('an enchantment and a side effect added from the item\'s own lists, its setting changed, and removed by its X', () => {
  const { dom, f, q } = forge();
  dom.set(q('piece'), 'Weapons:120');
  dom.set(q('material'), '9');
  dom.fire(dom.byAttr('data-forge-add', 'powers', f.el), 'click');
  const choices = dom.allByAttr('data-forge-choice', q('powers'));
  assert.ok(choices.length > 5, 'the item maker\'s powers for a weapon');
  dom.fire(choices.find((c) => c.attrs['data-forge-choice'] === 'ExtraSpellPts'), 'click');
  assert.deepEqual(f.spec().enchantments.map((e) => e.type), ['ExtraSpellPts']);
  assert.equal(dom.allByAttr('data-forge-choice', q('powers')).length, 0, 'the list closes once one is picked');
  const row = dom.byAttr('data-forge-row', 'powers:0', f.el);
  const sel = row.children.find((c) => c.tagName === 'SELECT');
  const other = sel.children.map((o) => o.value).find((v) => v !== String(f.spec().enchantments[0].param));
  dom.set(sel, other);
  assert.equal(f.spec().enchantments[0].param, Number(other), 'its value changed');
  dom.fire(dom.byAttr('data-forge-add', 'sides', f.el), 'click');
  const side = dom.allByAttr('data-forge-choice', q('sides')).find((c) => c.attrs['data-forge-choice'] === 'ExtraWeight');
  dom.fire(side, 'click');
  assert.deepEqual(f.spec().sideEffects.map((e) => e.type), ['ExtraWeight']);
  assert.match(q('readout').textContent, /Enchantment points: -?\d+ \/ \d+/);
  const x = dom.byAttr('data-forge-row', 'powers:0', f.el).children.find((c) => c.attrs['aria-label'] === 'Remove');
  dom.fire(x, 'click');
  assert.deepEqual(f.spec().enchantments, []);
  dom.set(q('piece'), 'Armor:102');
  dom.fire(dom.byAttr('data-forge-add', 'powers', f.el), 'click');
  const armour = dom.allByAttr('data-forge-choice', q('powers')).map((c) => c.attrs['data-forge-choice']);
  assert.ok(armour.length && !armour.includes('PotentVs'), 'a weapon\'s powers are not offered on armour');
});

test('a piece the law refuses shows its findings and cannot be granted', async () => {
  const { dom, f, q, asked } = forge();
  dom.set(q('piece'), 'Weapons:113');
  dom.set(q('material'), '0');
  for (const type of ['ExtraSpellPts', 'RegensHealth', 'EnhancesSkill', 'ImprovesTalents']) {
    dom.fire(dom.byAttr('data-forge-add', 'powers', f.el), 'click');
    const c = dom.allByAttr('data-forge-choice', q('powers')).find((n) => n.attrs['data-forge-choice'] === type);
    if (c) dom.fire(c, 'click');
  }
  assert.ok(f.made().findings.length, 'too much for an iron dagger');
  assert.equal(q('law').textContent, findingsText(f.made().findings));
  assert.equal(q('grant').disabled, true);
  dom.fire(q('grant'), 'click');
  await flush();
  assert.equal(asked.length, 0);
});

test('Grant: empty box, one\'s own pack; a typed account from the list above the box; soulbound sent; the answer said', async () => {
  const { dom, f, q, asked, granted } = forge({ answer: (spec) => ({ ok: true, item: { name: 'made', bound: spec.bound === true } }) });
  dom.set(q('soulbound'), '', 'change');
  q('soulbound').checked = true;
  dom.fire(q('soulbound'), 'change');
  dom.fire(q('grant'), 'click');
  await flush();
  assert.deepEqual([asked[0].target, asked[0].spec.bound], [null, true], 'my own pack, bound');
  assert.equal(granted.length, 1);
  assert.match(q('status').textContent, /Added to your pack\./);
  dom.set(q('target'), 'ann', 'input');
  assert.deepEqual(f.suggest.rows(), ['Ann', 'Annabel'], 'the accounts online, matched');
  assert.ok(f.suggest.el.style.bottom, 'the list stands above the box');
  dom.fire(f.suggest.el.children[1], 'mousedown');
  assert.equal(q('target').value, 'Annabel');
  dom.fire(q('grant'), 'click');
  await flush();
  assert.equal(asked[1].target, 'Annabel');
  assert.match(q('status').textContent, /Sent to Annabel\./);
});

test('offline: the account box is shut and the grant goes to one\'s own pack; a refusal is said', async () => {
  const { dom, f, q, asked, goOffline } = forge({ answer: { ok: false, error: 'toybox-offline-target' } });
  goOffline();
  f.open();
  assert.equal(q('target').disabled, true);
  dom.fire(q('grant'), 'click');
  await flush();
  assert.equal(asked[0].target, null);
  assert.match(q('status').textContent, /refused/);
});

const addSpecial = (dom, f, q, key) => {
  dom.fire(dom.byAttr('data-forge-add', 'special', f.el), 'click');
  const choice = dom.allByAttr('data-forge-choice', q('special')).find((n) => n.attrs['data-forge-choice'] === key);
  assert.ok(choice, `${key} is offered`);
  dom.fire(choice, 'click');
};

test('Special Effects stands above Enchantments, lists the piece\'s own, and adds, sets and removes them', () => {
  const { dom, f, q } = forge();
  dom.set(q('piece'), 'Weapons:120');
  dom.set(q('material'), '7');
  const parts = q('special').parentElement.children;
  assert.ok(parts.indexOf(q('special')) < parts.indexOf(q('powers')), 'above the enchantments');
  assert.match(q('special').textContent, /Special Effects/);
  dom.fire(dom.byAttr('data-forge-add', 'special', f.el), 'click');
  const offered = dom.allByAttr('data-forge-choice', q('special'));
  const sections = new Set(offered.map((n) => n.attrs['data-forge-section']));
  assert.deepEqual([...sections], ['sets', 'moves', 'effects'], 'set bonuses, special moves, special effects');
  assert.match(q('special').textContent, /Set bonuses[\s\S]*Special moves[\s\S]*Special effects/);
  assert.ok(!offered.some((n) => n.attrs['data-forge-choice'] === 'line:armor'), 'no armour\'s line on a sword');
  dom.fire(offered.find((n) => n.attrs['data-forge-choice'] === 'line:damage'), 'click');
  assert.deepEqual(f.spec().special, [{ kind: 'line', id: 'damage', value: 10 }], 'a found Rare\'s floor');
  assert.equal(q('tier'), null, 'no list of enchantments among the special effects');
  dom.set(dom.byAttr('data-forge-value', '0', f.el), '12');
  addSpecial(dom, f, q, 'line:stat');
  const param = dom.byAttr('data-forge-param', '1', f.el);
  dom.set(param, 'speed');
  addSpecial(dom, f, q, 'line:skill');
  addSpecial(dom, f, q, 'technique:leap');
  addSpecial(dom, f, q, 'set:malacath');
  assert.deepEqual([f.spec().tier, f.spec().flavour], ['rare', undefined]);
  assert.deepEqual(f.made().findings, ['enchantments'], 'a Rare carries one of its own enchantments');
  assert.match(q('law').textContent, new RegExp(RARE_OWN_TEXT));
  dom.fire(dom.byAttr('data-forge-add', 'powers', f.el), 'click');
  dom.fire(dom.allByAttr('data-forge-choice', q('powers')).find((c) => c.attrs['data-forge-choice'] === 'PotentVs'), 'click');
  assert.deepEqual(f.made().findings, [], 'its own taken from the Enchantments rows');
  const item = f.made().item;
  assert.equal(item.rarity, 'rare');
  assert.deepEqual(item.affixes.map((a) => a.id), ['damage', 'stat', 'skill', 'technique']);
  assert.deepEqual([item.affixes[0].value, item.affixes[1].value], [12, 5]);
  assert.equal(item.enchantments.length, 1, 'the row is the Rare\'s own, not a second one');
  assert.equal(item.sigil.set, 'malacath');
  assert.match(q('readout').textContent, /Tier: Rare[\s\S]*\+12% damage[\s\S]*Enchantment: Potent[\s\S]*Set: Malacath's Bulwark/, 'on the stats');
  const x = dom.byAttr('data-forge-row', 'special:0', f.el).children[0].children.find((c) => c.attrs['aria-label'] === 'Remove');
  dom.fire(x, 'click');
  assert.equal(f.spec().special.length, 4);
  assert.ok(!f.made().item.affixes.some((a) => a.id === 'damage'), 'removed by its X');
  dom.set(q('piece'), 'Jewellery:135');
  assert.deepEqual(f.spec().special, [], 'a new piece starts fresh');
  dom.fire(dom.byAttr('data-forge-add', 'special', f.el), 'click');
  const ring = dom.allByAttr('data-forge-choice', q('special')).map((n) => n.attrs['data-forge-choice']);
  assert.ok(ring.includes('line:focus') && !ring.some((k) => k.startsWith('set:') || k.startsWith('technique:')), 'a ring\'s own');
});

test('a special effect the law refuses: marked Offline only, the grant shut online and open offline', async () => {
  const { dom, f, q, asked, goOffline } = forge({ answer: { ok: true } });
  dom.set(q('piece'), 'Weapons:120');
  dom.set(q('material'), '7');
  addSpecial(dom, f, q, 'line:damage');
  addSpecial(dom, f, q, 'set:ruhn');
  assert.ok(f.made().findings.length, 'Ruhn\'s set on a piece that is not its record');
  assert.ok(dom.byAttr('data-forge-offline', '1', f.el), 'the set is marked');
  assert.equal(dom.byAttr('data-forge-offline', '0', f.el), null, 'the lawful line is not');
  assert.match(q('law').textContent, new RegExp(OFFLINE_ONLY_TEXT));
  assert.equal(q('grant').disabled, true, 'online the law refuses it');
  goOffline();
  f.open();
  assert.match(q('law').textContent, new RegExp(OFFLINE_GRANT_TEXT));
  assert.equal(q('grant').disabled, false);
  dom.fire(q('grant'), 'click');
  await flush();
  assert.deepEqual(asked[0].spec.special.map((e) => e.kind), ['line', 'set']);
});

test('an Aetheric set on its own record makes that piece, of its make, and the law takes it', () => {
  const { dom, f, q } = forge();
  dom.set(q('piece'), 'Armor:102');
  addSpecial(dom, f, q, 'set:ruhn');
  assert.equal(f.made().item.aetheric, 'ruhn-warden-plate');
  assert.equal(f.spec().material, f.made().item.material, 'the window shows its make');
  assert.deepEqual(f.made().findings, []);
  assert.equal(f.made().item.rarity, 'aetheric', 'a record has its own tier');
});
