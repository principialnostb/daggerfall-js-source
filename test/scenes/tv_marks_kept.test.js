// The travel view's readout keeps each mark's record by its key from frame to frame - made again only when the fields
// it holds change, else written over, and let go when its key is gone from a frame or the view comes down. It lays a
// route's dots within the size the frame hands it, and reads the canvas's size only when handed none and a route has
// dots to lay. Each frame's records are held to the record the readout made afresh for every mark on every frame
// (written out below), field for field, in the same order and with the same badge and card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTravelView, routeGroundDots } from '../../src/scenes/travelView.js';
import { forwardOf } from '../../src/player/travelCamera.js';
import { mulberry32 } from '../../src/combat/blood/bloodArt.js';

/** A mark's record as the readout made it afresh on every frame. */
function freshRecord(m, at) {
  return {
    key: m.key, x: at?.x ?? 0, y: at?.y ?? 0, front: !!at?.front, label: m.label, sub: m.sub, kind: m.kind, pick: !!m.pick, edge: !!m.edge,
    ...(m.color ? { color: m.color } : {}),
    badge: m.badge ?? null,
    ...(m.kin ? { kin: m.kin } : {}),
    ...(m.lv != null ? { lv: m.lv } : {}),
    ...(Number.isFinite(m.dist) ? { dist: m.dist } : {}),
    ...(m.hub ? { hub: true } : {}),
    ...(m.tip ? { tip: m.tip } : {}),
    ...(m.wpKind ? { wpKind: m.wpKind } : {}),
    ...(m.followed ? { followed: true } : {}),
    ...(m.skull ? { skull: m.skull } : {}),
  };
}
const project = (p) => ({ x: 400 + p[0] * 3, y: 300 - p[2] * 3, front: p[2] > -40 });

/** A travel view up over `marks` and `route`: the readout's last frame, and how often the canvas's size was read. */
function viewOf({ marks, route = () => [], size = [800, 600] }) {
  const seen = { last: null, reads: 0 };
  const canvas = {
    get clientWidth() { seen.reads++; return size[0]; },
    get clientHeight() { seen.reads++; return size[1]; },
    contains: () => false,
  };
  const tv = createTravelView({
    canvas, win: { addEventListener() {}, removeEventListener() {} },
    feet: () => [0, 0, 0], headView: () => ({ eye: [0, 1.7, 0], fwd: forwardOf(0, 0) }),
    yaw: () => 0, setYaw: () => {}, heightAt: () => 0, cloudBase: () => null,
    allowed: () => ({ ok: true }), windowUp: () => false, actionsOf: () => [],
    project, marks, route,
    hud: { show() {}, hide() {}, update: (f) => { seen.last = f; } },
    schedule: () => null, cancel: () => {},
  });
  tv.enter();
  for (let i = 0; i < 200; i++) tv.frame(1 / 60);
  return { tv, seen };
}
/** The frame's records held to fresh ones for the marks it was handed, field for field and in order. */
function sameRecords(got, marks, what) {
  const want = marks.map((m) => freshRecord(m, m.at ? project(m.at) : null));
  assert.deepStrictEqual(got, want, what);
  assert.deepEqual(got.map((r) => Object.keys(r).join()), want.map((r) => Object.keys(r).join()), `${what}: the order of the fields`);
  got.forEach((r, i) => assert.ok(r.badge === want[i].badge && r.tip === want[i].tip, `${what}: the badge and the card handed on`));
}

test('TV-MARKS KEPT every frame\'s records are the ones made afresh - over frames whose marks move, change their words, gain and lose fields, come and go and stand twice under one key', () => {
  const draw = mulberry32(11);
  const pick = (list) => list[Math.floor(draw() * list.length)];
  const badge = { title: 'founder', glyphs: ['dev'], lv: 12, gt: 'HND' };
  const card = () => ({ title: 'Daggerfall', lines: ['Weather: clear'] });
  const markAt = (key) => {
    const at = draw() < 0.05 ? null : [Math.floor(draw() * 200) - 100, 2, Math.floor(draw() * 200) - 100];
    const m = { key, at, label: pick(['Daggerfall', 'Bran', '?', undefined]), sub: pick([undefined, '12 km', 'Tier 3']), kind: pick(['place', 'party journey', 'far', 'gather mining', 'camp']) };
    if (draw() < 0.5) m.pick = pick([true, 1, false]);
    if (draw() < 0.3) m.edge = true;
    if (draw() < 0.3) m.color = pick(['#c08a3e', '#6fb86a', '']);
    if (draw() < 0.4) m.badge = pick([badge, { ...badge }, null]);
    if (draw() < 0.3) m.kin = pick(['guild', 'party', '']);
    if (draw() < 0.3) m.lv = pick([0, 7, null, 30]);
    if (draw() < 0.3) m.dist = pick([0.4, 3, NaN, Infinity]);
    if (draw() < 0.3) m.hub = pick([true, 1, 0]);
    if (draw() < 0.3) m.tip = pick([card, card(), () => null]);
    if (draw() < 0.2) m.wpKind = pick(['flag', 'quest', '']);
    if (draw() < 0.2) m.followed = pick([true, false]);
    if (draw() < 0.2) m.skull = pick(['gold', 'red', null]);
    return m;
  };
  const keys = Array.from({ length: 30 }, (_, i) => `mark:${i}`);
  let marks = keys.map(markAt);
  const { tv, seen } = viewOf({ marks: () => marks });
  for (let frame = 0; frame < 400; frame++) {
    marks = marks.map((m) => {
      const roll = draw();
      if (roll < 0.5 && m.at) return { ...m, at: [m.at[0] + 1, m.at[1], m.at[2] - 1] };   // moved alone
      if (roll < 0.8) return markAt(m.key);   // its words and fields drawn again
      return m;
    }).filter(() => draw() < 0.95);
    if (draw() < 0.3) marks.push(markAt(pick(keys)));   // one back, or a key stood twice
    tv.drawHud();
    sameRecords(seen.last.marks, marks, `frame ${frame}`);
  }
});

test('TV-MARKS KEPT a mark\'s record is the same from frame to frame while its fields hold, written over with the frame\'s place and words; made again when a field comes or goes; a key stood twice has two records', () => {
  let marks = [{ key: 'place:1', at: [0, 0, 10], label: 'Ripwych', kind: 'place', pick: true }];
  const { tv, seen } = viewOf({ marks: () => marks });
  tv.drawHud();
  const first = seen.last.marks[0];
  marks = [{ key: 'place:1', at: [5, 0, 12], label: 'Ripwych Docks', kind: 'place', pick: true, badge: { title: 'x' } }];
  tv.drawHud();
  assert.equal(seen.last.marks[0], first, 'the record kept');
  sameRecords(seen.last.marks, marks, 'written over');
  marks = [{ ...marks[0], color: '#c08a3e' }];
  tv.drawHud();
  assert.notEqual(seen.last.marks[0], first, 'a field come: made again');
  sameRecords(seen.last.marks, marks, 'made again');
  const again = seen.last.marks[0];
  marks = [{ ...marks[0], at: [9, 0, 9] }, { ...marks[0], at: [-9, 0, 9] }];
  tv.drawHud();
  assert.equal(seen.last.marks[0], again);
  assert.notEqual(seen.last.marks[1], again, 'the key stood twice: a record of its own');
  sameRecords(seen.last.marks, marks, 'stood twice');
});

test('TV-MARKS KEPT the canvas\'s size is read only to lay a route\'s dots - not for no route, nor for a route of one point - and the dots are the ones that size lays', () => {
  let route = [];
  const { tv, seen } = viewOf({ marks: () => [], route: () => route });
  seen.reads = 0;
  tv.drawHud();
  assert.equal(seen.reads, 0, 'no route: the canvas unread');
  assert.deepEqual(seen.last.routeDots, []);
  route = [[0, 0, 0]];
  tv.drawHud();
  assert.equal(seen.reads, 0, 'one point: the canvas unread');
  assert.deepEqual(seen.last.routeDots, []);
  route = [[0, 0, 0], [30, 0, 60], [90, 0, 120]];
  tv.drawHud();
  assert.equal(seen.reads, 2, 'a route: its width and height read once');
  assert.ok(seen.last.routeDots.length > 0, 'dots laid');
  assert.deepEqual(seen.last.routeDots, routeGroundDots(route, project, { w: 800, h: 600, keep: { k: 0 } }), 'the dots the canvas\'s size lays');
  const small = viewOf({ marks: () => [], route: () => route, size: [120, 90] });
  small.tv.drawHud();
  assert.deepEqual(small.seen.last.routeDots, routeGroundDots(route, project, { w: 120, h: 90, keep: { k: 0 } }), 'a smaller canvas\'s');
  assert.notDeepEqual(small.seen.last.routeDots, seen.last.routeDots, 'the size read bounds them');
});

test('TV-MARKS KEPT a key gone from a frame lets its record go, and so does the view coming down: a key back after either gets a record made again (mutants: absent keys never let go; the records kept while the view is off)', () => {
  const party = { key: 'trav:1', at: [0, 0, 10], label: 'Bran', kind: 'party journey' };
  const band = { key: 'band:2', at: [4, 0, 12], label: 'Rogues', kind: 'far' };
  const giant = { key: 'giant:3', at: [-4, 0, 14], label: 'Giant', kind: 'far' };
  let marks = [party, band, giant];
  const { tv, seen } = viewOf({ marks: () => marks });
  tv.drawHud();
  const [partyRecord, bandRecord, giantRecord] = seen.last.marks;
  marks = [party];
  tv.drawHud();
  assert.equal(seen.last.marks[0], partyRecord, 'a key still there keeps its record');
  marks = [party, band, giant];
  tv.drawHud();
  assert.equal(seen.last.marks[0], partyRecord);
  assert.ok(seen.last.marks[1] !== bandRecord && seen.last.marks[2] !== giantRecord, 'the keys gone for a frame: their records let go, then made again');
  sameRecords(seen.last.marks, marks, 'made again');
  const kept = seen.last.marks[0];
  tv.exit('escape', true);
  assert.equal(tv.active, false, 'the view is down');
  tv.drawHud();
  tv.enter();
  tv.drawHud();
  assert.notEqual(seen.last.marks[0], kept, 'the view down and up again: its records made again');
  sameRecords(seen.last.marks, marks, 'after the view came down');
});

test('TV-MARKS KEPT the dots are laid within the size the frame hands in, and the canvas goes unread; a size of nothing is handed on as one read would be (mutants: the canvas read whatever is handed; a handed nothing read again)', () => {
  const route = [[0, 0, 0], [30, 0, 60], [90, 0, 120]];
  const { tv, seen } = viewOf({ marks: () => [], route: () => route });
  seen.reads = 0;
  tv.drawHud(120, 90);
  assert.equal(seen.reads, 0, 'the frame\'s own read handed on: the canvas unread');
  assert.deepEqual(seen.last.routeDots, routeGroundDots(route, project, { w: 120, h: 90, keep: { k: 0 } }), 'the dots the handed size lays');
  const read = viewOf({ marks: () => [], route: () => route, size: [120, 90] });
  read.tv.drawHud();
  assert.deepEqual(seen.last.routeDots, read.seen.last.routeDots, 'the dots a canvas of that size lays when it is read');
  const hidden = viewOf({ marks: () => [], route: () => route });
  hidden.seen.reads = 0;
  hidden.tv.drawHud(0, 0);
  assert.equal(hidden.seen.reads, 0, 'a canvas laid out to nothing: the read handed on, not made again');
  assert.deepEqual(hidden.seen.last.routeDots, routeGroundDots(route, project, { w: Infinity, h: Infinity, keep: { k: 0 } }), 'and its dots bounded by nothing, as a read of nothing bounds them');
});
