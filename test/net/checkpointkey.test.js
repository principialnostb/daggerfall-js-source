// A checkpoint's idle key, read off the save it was written from (src/systems/realmSaves.js checkpointKeyOf): the
// sink writes a save's text and hands it to its checkpoint in the same turn, so the key is the object's, stripped and
// written once, where it was a parse of the whole text and a second write. The key is the text's to the byte, for
// every save; a shape the object cannot vouch for is read off the text; the object answers one ask, in its turn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as saves from '../../src/systems/realmSaves.js';

const { realmSaveWithHeld, idleKeyOf, createRealmSession, REALM_HELD_FIELD } = saves;
const SUMMARY = { level: 30, className: 'Knight', race: 'Breton', gender: 'male', face: 3 };

/** How often JSON.parse reads `text` while `fn` runs. */
function parsesOf(text, fn) {
  const real = JSON.parse;
  let count = 0;
  JSON.parse = (source, reviver) => {
    if (source === text) count++;
    return real(source, reviver);
  };
  try {
    return { out: fn(), count };
  } finally {
    JSON.parse = real;
  }
}

/** A save of the composer's shape: the clock, the pose, survival, the quest machine's list, the automap's dungeons. */
function composerSave(minutes = 1000, yaw = 0.5, gold = 10) {
  return {
    v: 1,
    position: [1, 2, 3],
    pose: { yaw, pitch: -0.25, crouching: false, weaponDrawn: true, camera: { third: false, zoom: 3 }, fall: null },
    classicMinutes: minutes,
    readiedSpellIndex: null,
    quest: {
      machine: {
        quests: [
          { uid: 1, questName: 'Q1', tasks: [{ symbol: { name: 't' }, triggered: false }], ownSecondsAt: minutes * 60 },
          { uid: 2, questName: 'Q2', messages: [{ id: 1000, tokens: ['a', 'b'] }], ownSecondsAt: null },
        ],
        nextUid: 3,
      },
      notebook: { notes: ['a note'] },
    },
    worldMinutes: minutes * 2,
    survival: { lastMinute: minutes, rotMinutes: 4, thirst: 0.5, fed: 0.75, hunger: 2, notes: undefined },
    goldPieces: gold,
    items: [
      { uid: 7, name: 'Iron Longsword', enchantments: [{ type: 1, param: 2 }] },
      { uid: 8, name: 'Waterskin', charges: 3 },
    ],
    automap: {
      'dungeon:1': { revealed: ['0:0', '0:1'], visitedThisRun: [], entranceDiscovered: true, lastVisited: minutes },
      'dungeon:2': { revealed: [], entranceDiscovered: false, lastVisited: 5, trail: ['1:1'] },
    },
  };
}

const sparse = (length, at) => {
  const list = new Array(length);
  for (const [i, v] of at) list[i] = v;
  return list;
};

/** A save with members the text never holds: a symbol's, non-enumerable ones, a hidden quest list. */
function withHidden() {
  const save = { pose: { yaw: 1, kept: 2 }, [Symbol('mark')]: 1 };
  Object.defineProperty(save, 'classicMinutes', { value: 5, enumerable: false });
  Object.defineProperty(save, 'unsaid', { value: 5, enumerable: false });
  Object.defineProperty(save.pose, 'pitch', { value: 1, enumerable: false });
  const quest = { machine: { nextUid: 1 } };
  Object.defineProperty(quest, 'other', { value: 1, enumerable: false });
  Object.defineProperty(quest.machine, 'quests', { value: [{ ownSecondsAt: 1 }], enumerable: false });
  save.quest = quest;
  return save;
}

const nullProto = (o) => Object.assign(Object.create(null), o);

/** Saves whose key the object gives: each the text's key, read with no parse. */
const OWN_SHAPES = [
  ['the composer', composerSave()],
  ['an empty save', {}],
  ['no stripped member', { v: 1, name: 'Ada' }],
  ['stripped members as plain values', { pose: null, survival: 0, quest: 'q', automap: false, classicMinutes: 'x' }],
  ['more plain values', { pose: 'p', survival: true, quest: 7, automap: 'abc' }],
  [
    'members the text drops',
    { pose: () => 1, survival: undefined, quest: Symbol('q'), automap: () => {}, said: () => 1, unset: undefined },
  ],
  ['empty records', { pose: {}, survival: {}, quest: {}, automap: {} }],
  ['a quest list, which a parse gives no machine', { quest: [{ machine: { quests: [{ ownSecondsAt: 1 }] } }] }],
  ['a machine list, which a parse gives no quests', { quest: { machine: [{ quests: [{ ownSecondsAt: 1 }] }] } }],
  [
    'quests as a map',
    { quest: { machine: { quests: { a: { ownSecondsAt: 1, n: 2 }, b: { n: 3 }, c: [{ ownSecondsAt: 1 }] } } } },
  ],
  ['quests as text', { quest: { machine: { quests: 'abc' } } }],
  [
    'a quest list of every kind of member',
    {
      quest: {
        machine: {
          quests: [null, 1, 'x', [{ ownSecondsAt: 1 }], { ownSecondsAt: 2, m: 1 }, undefined, () => 1, { m: 3 }],
        },
      },
    },
  ],
  ['a quest list with holes', { quest: { machine: { quests: sparse(4, [[1, { ownSecondsAt: 1, kept: 1 }]]) } } }],
  ['an automap list', { automap: [{ lastVisited: 1, a: 1 }, null, [1], 'x'] }],
  [
    'integer keys, in the order a parse gives them',
    {
      2: 'b',
      1: 'a',
      pose: { 10: 'x', 2: 'y', yaw: 1, b: 1 },
      automap: { 5: { lastVisited: 3 }, 1: { lastVisited: 4, q: 1 } },
    },
  ],
  [
    'an own __proto__ member',
    JSON.parse('{"__proto__":{"x":1},"pose":{"__proto__":5,"yaw":1},"automap":{"__proto__":{"lastVisited":1,"k":2}}}'),
  ],
  [
    'records with no prototype',
    nullProto({
      pose: nullProto({ yaw: 1, z: 2 }),
      quest: nullProto({ machine: nullProto({ quests: [nullProto({ ownSecondsAt: 1, k: 1 })] }) }),
      automap: nullProto({ d: nullProto({ lastVisited: 1, r: [1] }) }),
    }),
  ],
  [
    'numbers and text a write and a parse keep as they are',
    {
      n: [-0, NaN, Infinity, -Infinity, 1e21, 1e-7, 0.1 + 0.2, 2 ** 53 + 2, 5e-324],
      s: '  "\\\n\t\u0000\ud800 \udc00 é😀',
      pose: { yaw: -0, s: '\ud83d', [Symbol.iterator]: 1 },
    },
  ],
  [
    'dates and a toJSON below the stripped records',
    {
      when: new Date(0),
      deep: { toJSON: () => ({ a: 1 }) },
      pose: { at: new Date(1), yaw: 2 },
      quest: { machine: { quests: [{ when: new Date(2), ownSecondsAt: 1, deep: { toJSON: (key) => key } }] } },
    },
  ],
  ['members the text never holds', withHidden()],
  ['a list with holes beyond the stripped records', { list: sparse(5, [[0, 1], [2, 3], [4, () => 1]]) }],
  [
    'a getter that answers the same each time',
    {
      get pose() {
        return { yaw: 1, kept: 2 };
      },
      goldPieces: 1,
    },
  ],
  ['a shared record, stripped where each stands', (() => {
    const shared = { ownSecondsAt: 1, lastVisited: 2, kept: 3 };
    return { quest: { machine: { quests: [shared, shared] } }, automap: { a: shared, b: shared }, again: shared };
  })()],
];

/** Saves whose key the object leaves to the text: still the text's key. */
const TEXT_SHAPES = [
  ['a pose list, which a parse makes a record', { pose: [1, 2, 3] }],
  ['a survival list', { survival: [0.5, 1] }],
  ['a date for a pose', { pose: new Date(0) }],
  ['a toJSON on a stripped record', { pose: { toJSON: () => ({ yaw: 1, k: 2 }) } }],
  [
    'a class for the quest record',
    {
      quest: new (class Quest {
        constructor() {
          this.machine = { quests: [{ ownSecondsAt: 1 }] };
        }
      })(),
    },
  ],
  ['a map for the machine', { quest: { machine: new Map() } }],
  ['a set for the quests', { quest: { machine: { quests: new Set([1]) } } }],
  ['a date for a quest', { quest: { machine: { quests: [new Date(0)] } } }],
  ['a map for the automap', { automap: new Map([['a', 1]]) }],
  [
    'a class for a dungeon',
    {
      automap: {
        d: new (class Dungeon {
          constructor() {
            this.lastVisited = 1;
          }
        })(),
      },
    },
  ],
  ['typed bytes for the automap', { automap: new Uint8Array([1, 2]) }],
  ['boxed text for a pose, which is written as its text', { pose: new String('ab') }],
  ['a boxed number for a dungeon', { automap: { d: new Number(5) } }],
  ['a list made to look like a record, which has no key', Object.setPrototypeOf([1, 2], Object.prototype)],
  ['a list of another kind for the quests', { quest: { machine: { quests: new (class Quests extends Array {})() } } }],
  ['a class for the save', Object.assign(new (class Save {})(), { pose: { yaw: 1 } })],
  ['a toJSON on the save', { toJSON: () => ({ pose: { yaw: 1 }, classicMinutes: 3 }) }],
  // a list or a function is written as its toJSON answers: a record with members the key strips
  ...toJSONShapes(),
];

/** A list and a function, each with a toJSON, at every place the key strips: a parse gives back what it answers. */
function toJSONShapes() {
  const quests = [{ ownSecondsAt: 1, k: 1 }];
  const places = [
    ['the pose', (v) => ({ pose: v }), { yaw: 1, pitch: 2, camera: 3, k: 4 }],
    ['survival', (v) => ({ survival: v }), { lastMinute: 1, rotMinutes: 2, thirst: 3, fed: 4, k: 5 }],
    ['the quest record', (v) => ({ quest: v }), { machine: { quests } }],
    ['the machine', (v) => ({ quest: { machine: v } }), { quests }],
    ['the quests', (v) => ({ quest: { machine: { quests: v } } }), quests],
    ['a quest', (v) => ({ quest: { machine: { quests: [v] } } }), { ownSecondsAt: 1, k: 1 }],
    ['a quest in a map', (v) => ({ quest: { machine: { quests: { a: v } } } }), { ownSecondsAt: 1, k: 1 }],
    ['the automap', (v) => ({ automap: v }), { d: { lastVisited: 1, k: 1 } }],
    ['a dungeon', (v) => ({ automap: { d: v } }), { lastVisited: 1, k: 1 }],
    ['a dungeon in a list', (v) => ({ automap: [v] }), { lastVisited: 1, k: 1 }],
  ];
  const out = [];
  for (const [place, save, written] of places) {
    out.push([`a list with a toJSON for ${place}`, save(Object.assign([{ lastVisited: 9 }], { toJSON: () => written }))]);
    out.push([`a function with a toJSON for ${place}`, save(Object.assign(() => 1, { toJSON: () => written }))]);
  }
  return out;
}

test('the idle key of a save just written is read off its object: no parse of its text, the same key', () => {
  const text = realmSaveWithHeld(composerSave(), ['spoil.1']);
  const { out, count } = parsesOf(text, () => saves.checkpointKeyOf?.(text, SUMMARY));
  assert.equal(count, 0, 'the text is not parsed');
  assert.equal(out, idleKeyOf(text, SUMMARY));
});

test('every save gives the key its text gives, to the byte; a shape the object cannot vouch for is read off the text', () => {
  for (const [shapes, own] of [
    [OWN_SHAPES, true],
    [TEXT_SHAPES, false],
  ]) {
    for (const [name, snap] of shapes) {
      for (const held of [[], ['spoil.1', 'spoil.2']]) {
        for (const summary of [null, SUMMARY, undefined]) {
          const text = realmSaveWithHeld(snap, held);
          const { out, count } = parsesOf(text, () => saves.checkpointKeyOf?.(text, summary));
          assert.equal(out, idleKeyOf(text, summary), `${name}: the key is the text's`);
          // a save written holding spoils is a copy of its members: a class or a toJSON there is copied off
          if (own) assert.equal(count, 0, `${name}: the object answers`);
          else if (!held.length) assert.equal(count, 1, `${name}: the text answers`);
        }
      }
    }
  }
});

test("a save's text is written as it always was", () => {
  for (const [name, snap] of [...OWN_SHAPES, ...TEXT_SHAPES]) {
    assert.equal(realmSaveWithHeld(snap, []), JSON.stringify(snap), name);
    const ids = ['spoil.1', 7, 'x'.repeat(129), 'spoil.2'];
    assert.equal(
      realmSaveWithHeld(snap, ids),
      JSON.stringify({ ...snap, [REALM_HELD_FIELD]: ['spoil.1', 'spoil.2'] }),
      `${name}, holding`,
    );
  }
});

/** Random saves, the stripped records among the members, every kind of value in them. */
function randomSave(rand) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  // a date stands among a record's members, never for a record the key strips (the text answers that one)
  const leaf = (dated = true) =>
    pick([
      () => null,
      () => rand() < 0.5,
      () => Math.round(rand() * 1e6) / 1e3,
      () => pick([-0, NaN, Infinity, 1e21, 0.1]),
      () => `t${Math.floor(rand() * 100)}\n"`,
      () => undefined,
      () => () => 1,
      () => (dated ? new Date(Math.floor(rand() * 1e12)) : 'undated'),
    ])();
  const value = (depth) => {
    if (depth > 3 || rand() < 0.4) return leaf();
    if (rand() < 0.5) return Array.from({ length: Math.floor(rand() * 4) }, () => value(depth + 1));
    return record(depth + 1, ['a', 'b', '3', 'ownSecondsAt', 'lastVisited', 'yaw', 'fed']);
  };
  const record = (depth, names) => {
    const out = {};
    for (const name of names) if (rand() < 0.5) out[name] = value(depth);
    return out;
  };
  const listOrMap = (inner) =>
    rand() < 0.5
      ? Array.from({ length: Math.floor(rand() * 4) }, () => (rand() < 0.8 ? inner() : leaf(false)))
      : Object.fromEntries(Array.from({ length: Math.floor(rand() * 4) }, (_, i) => [`k${i}`, inner()]));
  const save = record(0, ['v', 'classicMinutes', 'worldMinutes', 'goldPieces', '7']);
  if (rand() < 0.8) save.pose = record(1, ['yaw', 'pitch', 'camera', 'crouching', 'fall']);
  if (rand() < 0.8) save.survival = record(1, ['lastMinute', 'rotMinutes', 'thirst', 'fed', 'hunger']);
  if (rand() < 0.8) {
    const quests = listOrMap(() => record(2, ['uid', 'ownSecondsAt', 'tasks']));
    const machine = rand() < 0.9 ? { quests, nextUid: 1 } : leaf(false);
    save.quest = rand() < 0.9 ? { machine, notebook: value(2) } : leaf(false);
  }
  if (rand() < 0.8) save.automap = listOrMap(() => record(2, ['revealed', 'lastVisited', 'entranceDiscovered']));
  return save;
}

test('random saves give the key their text gives, read off the object', () => {
  let seed = 20261104;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let n = 0; n < 400; n++) {
    const snap = randomSave(rand);
    const text = realmSaveWithHeld(snap, n % 3 ? [] : ['spoil.1']);
    const { out, count } = parsesOf(text, () => saves.checkpointKeyOf?.(text, SUMMARY));
    assert.equal(out, idleKeyOf(text, SUMMARY), `save ${n}: ${text.slice(0, 200)}`);
    assert.equal(count, 0, `save ${n}: the object answers`);
  }
});

test('the object answers one ask, in the turn its save was written; after that the text answers', async () => {
  const snap = composerSave();
  let text = realmSaveWithHeld(snap, []);
  assert.equal(parsesOf(text, () => saves.checkpointKeyOf?.(text)).count, 0);
  const again = parsesOf(text, () => saves.checkpointKeyOf?.(text));
  assert.equal(again.count, 1, 'a second ask reads the text');
  assert.equal(again.out, idleKeyOf(text));

  text = realmSaveWithHeld(snap, []);
  const key = idleKeyOf(text);
  await null;
  snap.goldPieces = 999;
  const late = parsesOf(text, () => saves.checkpointKeyOf?.(text));
  assert.equal(late.count, 1, 'a later turn reads the text');
  assert.equal(late.out, key, 'so a save changed after its turn keeps the key of what was written');

  const first = realmSaveWithHeld(composerSave(1, 0, 1), []);
  realmSaveWithHeld(composerSave(2, 0, 2), []);
  const older = parsesOf(first, () => saves.checkpointKeyOf?.(first));
  assert.equal(older.count, 1, 'a save written since replaces the one kept');
  assert.equal(older.out, idleKeyOf(first));
});

test("the realm session's idle checkpoint of a save just written parses nothing, and skips as it always did", async () => {
  let puts = 0,
    seq = 1;
  const io = {
    base: 'https://acct.test',
    secret: 's',
    storage: null,
    player: 'p',
    fetch: async () => {
      puts++;
      seq++;
      return new Response(JSON.stringify({ ok: true, seq }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  };
  let now = 0;
  const session = createRealmSession({
    io,
    id: 'c1',
    lease: 'L',
    seq: 1,
    later: () => () => {},
    hidden: () => false,
    watchHidden: () => {},
    now: () => now,
  });
  assert.equal((await session.checkpoint(realmSaveWithHeld(composerSave(1, 0, 5), ['s1']), SUMMARY)).ok, true);
  assert.equal(puts, 1);
  const idleCheckpoint = (snap) =>
    session.idle(() => {
      const text = realmSaveWithHeld(snap, ['s1']);
      const { out, count } = parsesOf(text, () => session.checkpoint(text, SUMMARY));
      assert.equal(count, 0, 'the idle test parses nothing');
      return out;
    });
  now += 120_000;
  const r = await idleCheckpoint(composerSave(3, 1.5, 5));
  assert.deepEqual([r.ok, r.idle, puts], [true, true, 1], 'the clock and the look moved, nothing else: no put');
  now += 120_000;
  await idleCheckpoint(composerSave(5, 2, 6));
  assert.equal(puts, 2, 'a changed save goes');
});
