// Every screen the PDA can reach, pressed. From Home, the crawler presses each button and every option of each menu,
// breadth first, as a player with sworn revenants and as an Admin with a case open. Every answer is held to
// Discord's layout law (test/pdaRig.mjs assertScreenOk), and no press may land on the catch-all failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdaRig, screenText, assertScreenOk } from '../pdaRig.mjs';
import { freshSave } from '../realmSeat.mjs';
import { openCase } from '../pdaRigStaff.mjs';
import { C } from '../../server-account/src/pdaUi.js';
import { SCREENS } from '../../server-account/src/pdaFrame.js';

const sworn = (id) => ({
  id, rev: 3, mobileType: 7, gender: 'male', given: id, epithet: 'the Scarred', name: `${id} the Scarred`, rank: 2, sworn: true, defeated: false,
  companion: { state: 'away', until: null, errand: null, loyalty: 60, items: [], gear: {}, stars: [], xp: 0, paid: [] },
});

/** The presses a screen offers: each button, and every option of each menu. */
function pressesOf(answer) {
  const out = [];
  const walk = (list) => {
    for (const c of list ?? []) {
      if (c.type === C.BUTTON && c.custom_id) out.push({ id: c.custom_id });
      if (c.accessory?.type === C.BUTTON && c.accessory.custom_id) out.push({ id: c.accessory.custom_id });
      if (c.type === C.SELECT) for (const o of c.options ?? []) if (o.value !== '-') out.push({ id: c.custom_id, values: [o.value] });
      if (c.components) walk(c.components);
    }
  };
  walk(answer?.data?.components);
  return out;
}

/** Presses that end the crawl's own standing: they are pressed by their own tests, never here. */
const SKIP = /unlinkyes|:leaveyes|:disband|pda:link:code/;

async function crawl(r, who, { max = 700 } = {}) {
  const seen = new Set();
  const queue = [{ id: 'pda:home' }];
  let pressed = 0;
  while (queue.length && pressed < max) {
    const p = queue.shift();
    const key = `${p.id}|${p.values?.[0] ?? ''}`;
    if (seen.has(key) || SKIP.test(p.id)) continue;
    seen.add(key);
    const a = p.values ? await r.choose(who, p.id, p.values) : await r.press(who, p.id);
    pressed++;
    assert.ok(a, `${p.id}: an answer`);
    assert.doesNotMatch(JSON.stringify(a.data ?? {}), /Something went wrong|Slow down a little/, `${p.id}: no press fails`);
    if (a.type === 9) {
      assertScreenOk(a, `${p.id} (form)`);
      continue;
    }
    assertScreenOk(a, p.id);
    for (const next of pressesOf(a)) queue.push(next);
  }
  if (process.env.PDA_CRAWL_SAY) console.log(`crawled ${pressed} presses`);
  return { pressed, seen };
}

test('PDA crawl: a player with sworn revenants - every screen reachable from Home is within Discord\'s law, and none fails', async () => {
  const r = await pdaRig({ PDA_PRESS_MAX: '100000' });
  const p = await r.linked('Yara', { seated: true, renown: 12, save: freshSave({ classicMinutes: 5000, modData: { Revenant: { v: 1, list: [sworn('kael'), sworn('mora')], lastDay: null } } }) });
  const b = await r.linked('Zed');
  await r.submit(b, 'pdam:mail:send', { to: 'Yara', subject: 'Hello', body: 'A letter to read.' });
  const { pressed, seen } = await crawl(r, p);
  assert.ok(pressed > 60, `the crawl reached ${pressed} presses`);
  for (const s of SCREENS.filter((x) => !x.staff)) assert.ok([...seen].some((k) => k.startsWith(`pda:${s.key}:`) || k === `pda:nav|${s.key}`), `${s.key} reached`);
});

test('PDA crawl: an Admin with an open case - the staff desk and every screen beside it hold the law, and none fails', async () => {
  const r = await pdaRig({ DEVELOPER_HANDLES: 'Adra', MODERATOR_HANDLES: 'Adra', PDA_PRESS_MAX: '100000' });
  const dev = await r.linked('Adra', { seated: true });
  const target = await r.registered('Troll');
  openCase(r.raw, target.id, { lines: [{ sub: target.id, name: 'Troll', text: 'a line said in anger' }], reporters: [dev.id] });
  const { pressed, seen } = await crawl(r, dev);
  for (const s of SCREENS) assert.ok([...seen].some((k) => k.startsWith(`pda:${s.key}:`) || k === `pda:nav|${s.key}`), `${s.key} reached`);
  assert.ok(pressed > 60, `the crawl reached ${pressed} presses`);
  assert.match(screenText(await r.press(dev, 'pda:staff')), /Staff desk/);
});
