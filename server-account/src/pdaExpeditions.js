// @ts-check
// Expeditions: a player's sworn revenants sent on errands from Discord, and the Discord game on top of them.
//
// The character's save changes only under its playing tab's lease, so the service never writes it. It reads the sworn
// from the latest save (read only), and keeps its own ledger of errands (exp_errands). An errand sent here waits until
// the game takes it up: the game sets it out as the Companions page would, with this ledger's seed and the world's
// minute it set out, so it comes back when the ledger says, and its haul is the game's own. A recall waits the same way.
// Errands sent in the game are told here too, so the PDA shows who is abroad.
import { text, select, button, STYLE, md, when, divider, ACCENT, plural, line, section } from './pdaUi.js';
import { frame, refusalText } from './pdaFrame.js';
import { wantsDm } from './pdaLink.js';
import { noticeStatement } from './pdaNotices.js';
import { getRealmBlob, realmSaveTextOf, REALM_ID_RE, mustChange } from './realm.js';
import { overRate } from './accounts.js';
import { renownForXp } from '../../src/net/renown.js';
import {
  REMOTE_PLACES,
  REMOTE_VENTURES,
  REMOTE_ERRANDS_MAX,
  REMOTE_MIN_RENOWN,
  remotePlace,
  isRemoteVenture,
  worldMinuteAt,
  wallSecondOf,
  remoteRoadMinutes,
  remoteErrandOdds,
  remoteOddsWord,
  remoteErrandCity,
  swornInSave,
  REMOTE_ERRAND_ID_RE,
} from '../../src/systems/revenant/revenantRemoteLaw.js';
import {
  POINTS_A_DAY,
  dayContracts,
  contractFor,
  utcDayOf,
  encounterOf,
  encounterScene,
  encounterOutcome,
  ENCOUNTERS,
  THEMES,
  TITLES,
  wareOf,
  errandReport,
} from './pdaExpLaw.js';

/** Errands the PDA may send an hour, an account. */
export const EXP_SENDS_MAX = 12;
/** Errands the game may tell of an hour, an account. */
export const EXP_GAME_MAX = 40;
/** A sent errand the game never took up is let go after this long. */
export const EXP_WAIT_S = 7 * 24 * 3600;
/** Finished errands are kept this long for the reports. */
export const EXP_KEEP_S = 30 * 24 * 3600;
/** Rows the clock settles a minute, each kind. */
export const EXP_CLOCK_ROWS = 100;
/** The furthest a client's word of an errand's minute may stand from the world's now. */
const WORLD_SLACK_MIN = 5 * 1440;
/** How long past its return a game's errand may still be told, in world minutes: an answer that waited out a blip. */
const GAME_LATE_MIN = 60;
/** States an errand is still on its road in, or waiting to set out. */
const OPEN_STATES = "('sent', 'out', 'recall')";
const COMPANION_ID_RE = /^[A-Za-z0-9_.-]{1,40}$/;

const EXP_WORDS = Object.freeze({
  'no-save': 'Play this character online once, so its save holds its companions.',
  'no-companion': 'That companion is not sworn to this character.',
  'odd-id': 'That companion cannot be sent from Discord.',
  abroad: 'It is already on a mission.',
  sent: 'It already has an errand waiting to set out.',
  resting: 'It is still recovering.',
  most: `You already have ${REMOTE_ERRANDS_MAX} revenants on missions, the most allowed at once.`,
  renown: `Your character needs Renown ${REMOTE_MIN_RENOWN} to send revenants on missions.`,
  'no-place': 'That is no place an errand goes.',
  'no-venture': 'That is no errand.',
  'exp-rate': 'You have sent many errands. Wait a while before the next.',
  'no-errand': 'That errand is gone.',
  'not-abroad': 'It is already back.',
  'no-ware': 'That is not for sale.',
  owned: 'You have that already.',
  points: 'You do not have enough Seals.',
  'not-owned': 'Buy that first.',
});
const say = (/** @type {string} */ e) => refusalText(e, EXP_WORDS);

/** A fresh errand id. */
const mintErrandId = (/** @type {(b: Uint8Array) => void} */ rand) => {
  const b = new Uint8Array(10);
  rand(b);
  return `x${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
};
/** A fresh seed for the haul's dice. */
const mintSeed = (/** @type {(b: Uint8Array) => void} */ rand) => {
  const b = new Uint8Array(4);
  rand(b);
  return ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
};

/** The character's save, parsed, read only. Null where there is none yet. */
async function saveOf(ctx, playerId, charId) {
  const got = await getRealmBlob(ctx, playerId, charId);
  if (!('ok' in got)) return null;
  try {
    const t = await realmSaveTextOf(got.object);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}
/** The character's Renown. */
async function renownOf(db, playerId, charId) {
  const r = await db.prepare('SELECT xp FROM renown_tracks WHERE player = ?1 AND char_id = ?2').bind(playerId, charId).first();
  return r ? renownForXp(Number(r.xp) || 0) : 1;
}
/** The ledger's rows of a character still under way. */
async function openRows(db, playerId, charId) {
  return (
    (
      await db
        .prepare(`SELECT * FROM exp_errands WHERE player_id = ?1 AND char_id = ?2 AND state IN ${OPEN_STATES} ORDER BY due_at`)
        .bind(playerId, charId)
        .all()
    )?.results ?? []
  );
}
/** The points an account holds. */
export async function pointsOf(db, playerId) {
  const r = await db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM exp_points WHERE player_id = ?1').bind(playerId).first();
  return Number(r?.n) || 0;
}

/**
 * Each sworn one and where it is: home (and so free to go), resting, abroad by the save, or on an errand of the ledger.
 * `free` it may be sent now. `abroad` counts toward the most allowed at once.
 * @param {any} save @param {any[]} rows @param {number} nowS
 */
export function rosterOf(save, rows, nowS) {
  const world = worldMinuteAt(nowS * 1000);
  const own = Number(save?.classicMinutes);
  return swornInSave(save).map((c) => {
    const row = rows.find((r) => r.companion === c.id && (r.state !== 'out' || r.due_at > nowS)) ?? null;
    const saveAbroad = c.state === 'errand' && !(Number.isInteger(c.errand?.due) && c.errand.due <= world);
    const resting = c.state === 'resting' && !(Number.isFinite(c.until) && Number.isFinite(own) && c.until <= own);
    const abroad = !!row || saveAbroad;
    return { ...c, row, saveAbroad, resting, abroad, free: !abroad && !resting };
  });
}

/** A companion's place, in words. */
function statusWords(/** @type {any} */ c) {
  const r = c.row;
  if (r?.state === 'sent') return `Sent to ${placeName(r.place)} from your journal. It sets out when you next play.`;
  if (r?.state === 'recall') return 'Called home. It comes back when you next play.';
  if (r?.state === 'out') return `On a mission in ${placeName(r.place)}. Back ${when(r.due_at, 'R')}.`;
  if (c.saveAbroad) {
    const due = Number.isInteger(c.errand?.due) ? ` Back ${when(wallSecondOf(c.errand.due), 'R')}` : '';
    return `On a mission in ${placeName(c.errand?.place)}${due ? `.${due}` : ''}.`;
  }
  if (c.state === 'errand') return 'Back. Its haul waits for you in the game.';
  if (c.resting) return 'Recovering.';
  return c.state === 'with' ? 'At your side.' : 'Waiting to be called.';
}
const placeName = (/** @type {unknown} */ key) => remotePlace(key)?.name ?? 'abroad';
const ventureName = (/** @type {unknown} */ key) =>
  REMOTE_VENTURES[/** @type {keyof typeof REMOTE_VENTURES} */ (key)]?.label ?? String(key);

/** Everything the screens read for the PDA's character. */
async function stateOf(who) {
  const c = who.character;
  if (!c) return null;
  // The save is read from storage once a press: the service never writes it, so every screen of one press shares it.
  const save = await (who.expSave ??= saveOf(who.ctx, who.player.id, c.id));
  const rows = await openRows(who.ctx.db, who.player.id, c.id);
  return { save, rows, roster: save ? rosterOf(save, rows, who.ctx.nowS) : [] };
}

/** The screen when there is nothing to act as. */
const noCharacter = (who) =>
  frame(who, 'exp', [text(refusalText('no-character'))], { actions: [button('Home', 'pda:home')] });

/** The main screen: the sworn, the errands under way, points and contracts. */
async function mainScreen(who, said = '') {
  if (!who.character) return noCharacter(who);
  const st = await stateOf(who);
  const points = await pointsOf(who.ctx.db, who.player.id);
  const nowS = who.ctx.nowS;
  const parts = [...(said ? [text(said), divider()] : [])];
  if (!st?.save) parts.push(text(say('no-save')));
  else if (!st.roster.length)
    parts.push(text('This character has no sworn revenants yet. Spare a revenant that kneels, and you can send it on missions.'));
  else {
    const away = st.roster.filter((c) => c.abroad).length;
    parts.push(
      text(
        `**Sworn:** ${st.roster.length} · **On missions:** ${away} of ${REMOTE_ERRANDS_MAX} · **Seals:** ${points}\n` +
          st.roster
            .slice(0, 6)
            .map((c) => `**${md(c.name, 40)}** · rank ${c.rank}\n-# ${statusWords(c)}`)
            .join('\n'),
      ),
    );
    const enc = st.rows.filter((r) => r.source === 'discord' && r.enc_told === 1 && r.enc_choice == null);
    for (const r of enc.slice(0, 2))
      parts.push(section([`**${md(r.name, 40)}** ran into trouble on the way.`], button('Choose', `pda:exp:enc:${r.id}`)));
  }
  const recallable = (st?.rows ?? []).filter((r) => r.state === 'sent' || (r.state === 'out' && r.due_at > nowS));
  return frame(who, 'exp', parts, {
    actions: [
      ...(st?.roster?.some((c) => c.free) ? [button('Send', 'pda:exp:send', { style: STYLE.PRIMARY })] : []),
      ...recallable.slice(0, 2).map((r) => button(`Recall ${line(r.name, 30)}`, `pda:exp:recall:${r.id}`)),
      button('Contracts', 'pda:exp:contracts'),
      button('Shop', 'pda:exp:shop'),
      button('Reports', 'pda:exp:reports'),
    ],
  });
}

/** Why `c` may not be sent now, or null. */
function sendRefusal(/** @type {any} */ st, /** @type {any} */ c) {
  if (!c) return 'no-companion';
  if (!COMPANION_ID_RE.test(c.id)) return 'odd-id';
  if (c.row?.state === 'sent') return 'sent';
  if (c.abroad) return 'abroad';
  if (c.resting) return 'resting';
  if (st.roster.filter((x) => x.abroad).length >= REMOTE_ERRANDS_MAX) return 'most';
  return null;
}

/** The send's first step: who goes. */
async function sendScreen(who) {
  if (!who.character) return noCharacter(who);
  const st = await stateOf(who);
  if (!st?.save) return mainScreen(who, say('no-save'));
  const free = st.roster.filter((c) => !sendRefusal(st, c));
  if (!free.length)
    return mainScreen(who, st.roster.filter((c) => c.abroad).length >= REMOTE_ERRANDS_MAX ? say('most') : 'Nobody is free to go.');
  return frame(
    who,
    'exp',
    [
      text('**Who goes?**'),
      select(
        'pda:exp:pick',
        free.map((c) => ({ label: c.name, value: c.id, description: `Rank ${c.rank}` })),
        { placeholder: 'Choose a companion…' },
      ),
    ],
    { title: 'Send', actions: [button('Back', 'pda:exp')] },
  );
}

/** The companion chosen, still free, or the refusal. */
async function chosen(who, id) {
  if (!who.character) return { error: 'no-character' };
  const st = await stateOf(who);
  if (!st?.save) return { error: 'no-save' };
  const c = st.roster.find((x) => x.id === id);
  const why = sendRefusal(st, c);
  return why ? { error: why } : { st, c };
}

/** Where it goes. */
async function placeScreen(who, id) {
  const got = await chosen(who, id);
  if ('error' in got) return mainScreen(who, say(got.error));
  const r = got.c.record;
  return frame(
    who,
    'exp',
    [
      text(`**Where does ${md(got.c.name, 40)} go?**`),
      select(
        `pda:exp:place:${got.c.id}`,
        REMOTE_PLACES.map((p) => ({
          label: p.name,
          value: p.key,
          description: `${plural(p.days, 'day')} · danger ${p.danger} · ${remoteOddsWord(remoteErrandOdds(r, p.key))}`,
        })),
        { placeholder: 'Choose a place…' },
      ),
    ],
    { title: 'Send', actions: [button('Back', 'pda:exp:send')] },
  );
}

/** What it does there. */
async function ventureScreen(who, id, place) {
  const got = await chosen(who, id);
  if ('error' in got) return mainScreen(who, say(got.error));
  if (!remotePlace(place)) return mainScreen(who, say('no-place'));
  return frame(
    who,
    'exp',
    [
      text(`**What does ${md(got.c.name, 40)} do in ${placeName(place)}?**`),
      select(
        `pda:exp:venture:${got.c.id}:${place}`,
        Object.entries(REMOTE_VENTURES).map(([k, v]) => ({ label: v.label, value: k, description: v.blurb })),
        { placeholder: 'Choose an errand…' },
      ),
    ],
    { title: 'Send', actions: [button('Back', `pda:exp:pick:${got.c.id}`)] },
  );
}

/** The errand as it would go: when it is back, its odds, the contract it serves. Asked once more before it goes. */
async function confirmScreen(who, id, place, venture) {
  const got = await chosen(who, id);
  if ('error' in got) return mainScreen(who, say(got.error));
  if (!remotePlace(place)) return mainScreen(who, say('no-place'));
  if (!isRemoteVenture(venture)) return mainScreen(who, say('no-venture'));
  const nowS = who.ctx.nowS;
  const world = worldMinuteAt(nowS * 1000);
  const backAt = wallSecondOf(world + remoteRoadMinutes(got.c.record, place));
  const contract = await openContractFor(who.ctx.db, who.player.id, nowS, { place, venture, rank: got.c.rank });
  return frame(
    who,
    'exp',
    [
      text(
        [
          `**${md(got.c.name, 40)}** goes to **${placeName(place)}** (${ventureName(venture)}).`,
          `Back ${when(backAt, 'R')}, if it sets out now. ${remoteOddsWord(remoteErrandOdds(got.c.record, place))}.`,
          contract ? `It serves a contract: ${contract.words} (+${contract.reward} Seals)` : '-# It serves none of today’s contracts.',
          '-# It sets out when your game next runs this character. The haul comes home to the game.',
        ].join('\n'),
      ),
    ],
    {
      title: 'Send',
      actions: [
        button('Send', `pda:exp:go:${got.c.id}:${place}:${venture}`, { style: STYLE.SUCCESS }),
        button('Back', `pda:exp:place:${got.c.id}`),
      ],
    },
  );
}

/** The contracts of the day an errand was sent that it may still serve. */
async function takenContracts(db, playerId, day) {
  const r =
    (
      await db
        .prepare(
          "SELECT contract FROM exp_errands WHERE player_id = ?1 AND contract_day = ?2 AND contract IS NOT NULL AND state NOT IN ('refused', 'cancelled', 'recalled')",
        )
        .bind(playerId, day)
        .all()
    )?.results ?? [];
  return new Set(r.map((x) => Number(x.contract)));
}
async function openContractFor(db, playerId, nowS, e) {
  const day = utcDayOf(nowS);
  return contractFor(dayContracts(playerId, day), await takenContracts(db, playerId, day), e);
}

/**
 * AN ERRAND SENT FROM THE PDA: every rule asked again here, whatever the screens said, and the errand written to the
 * ledger for the game to take up.
 * @param {any} who @param {string} id @param {string} place @param {string} venture
 */
export async function sendErrand(who, id, place, venture) {
  const { db, nowS, rand } = who.ctx;
  if (!remotePlace(place)) return { error: 'no-place' };
  if (!isRemoteVenture(venture)) return { error: 'no-venture' };
  const got = await chosen(who, id);
  if ('error' in got) return got;
  if ((await renownOf(db, who.player.id, who.character.id)) < REMOTE_MIN_RENOWN) return { error: 'renown' };
  if (await overRate(who.ctx, `exp:${who.player.id}`, EXP_SENDS_MAX, 3600)) return { error: 'exp-rate' };
  const c = got.c;
  const world = worldMinuteAt(nowS * 1000);
  const due = world + remoteRoadMinutes(c.record, place);
  const dueAt = wallSecondOf(due);
  const seed = mintSeed(rand);
  const rowId = mintErrandId(rand);
  const contract = await openContractFor(db, who.player.id, nowS, { place, venture, rank: c.rank });
  const encAt = nowS + Math.max(60, Math.floor((dueAt - nowS) / 2));
  await db
    .prepare(
      `INSERT INTO exp_errands (id, player_id, char_id, companion, name, rank, place, venture, seed, world_at, due, due_at,
         sent_at, source, state, state_at, contract, contract_day, enc_kind, enc_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'discord', 'sent', ?13, ?14, ?15, ?16, ?17)`,
    )
    .bind(
      rowId,
      who.player.id,
      who.character.id,
      c.id,
      c.name,
      c.rank,
      place,
      venture,
      seed,
      world,
      due,
      dueAt,
      nowS,
      contract ? contract.n : null,
      contract ? utcDayOf(nowS) : null,
      encounterOf(seed),
      encAt,
    )
    .run();
  return { ok: true, id: rowId, dueAt, contract, city: remoteErrandCity(c.record, place, seed) };
}

/** A recall from the PDA: one not yet set out is let go; one abroad is called home when the game next runs. */
export async function recallErrand(who, rowId) {
  const { db, nowS } = who.ctx;
  if (!REMOTE_ERRAND_ID_RE.test(String(rowId))) return { error: 'no-errand' };
  const r = await db.prepare('SELECT * FROM exp_errands WHERE id = ?1 AND player_id = ?2').bind(rowId, who.player.id).first();
  if (!r) return { error: 'no-errand' };
  if (r.state === 'sent') {
    await db.prepare("UPDATE exp_errands SET state = 'cancelled', state_at = ?2 WHERE id = ?1 AND state = 'sent'").bind(rowId, nowS).run();
    return { ok: true, cancelled: true, name: r.name };
  }
  if (r.state !== 'out' || r.due_at <= nowS) return { error: 'not-abroad' };
  await db.prepare("UPDATE exp_errands SET state = 'recall', state_at = ?2 WHERE id = ?1 AND state = 'out'").bind(rowId, nowS).run();
  return { ok: true, cancelled: false, name: r.name };
}

/** An encounter's screen: the scene and its choices, or how the choice went. */
async function encounterScreen(who, rowId, said = '') {
  if (!REMOTE_ERRAND_ID_RE.test(String(rowId))) return mainScreen(who, say('no-errand'));
  const r = await who.ctx.db.prepare('SELECT * FROM exp_errands WHERE id = ?1 AND player_id = ?2').bind(rowId, who.player.id).first();
  if (!r || !r.enc_kind || !ENCOUNTERS[/** @type {keyof typeof ENCOUNTERS} */ (r.enc_kind)]) return mainScreen(who, say('no-errand'));
  const city = remoteErrandCity({ id: r.companion }, r.place, r.seed) ?? placeName(r.place);
  const scene = encounterScene(r.enc_kind, r.name, city);
  const e = ENCOUNTERS[/** @type {keyof typeof ENCOUNTERS} */ (r.enc_kind)];
  if (r.enc_choice != null || ['refused', 'cancelled', 'recalled', 'back'].includes(r.state)) {
    const o = encounterOutcome(r.enc_kind, r.enc_choice, r.seed);
    return frame(
      who,
      'exp',
      [...(said ? [text(said)] : []), text(`${scene}\n${md(r.name, 40)} ${o.words}.${r.enc_choice != null ? ` (+${o.points} Seals when it is back)` : ''}`)],
      { title: 'On the way', actions: [button('Back', 'pda:exp')] },
    );
  }
  return frame(who, 'exp', [text(`${scene}\n-# What does ${md(r.name, 40)} do?`)], {
    title: 'On the way',
    actions: [...e.choices.map((c, i) => button(c.label, `pda:exp:choose:${r.id}:${i}`, { style: STYLE.PRIMARY })), button('Later', 'pda:exp')],
  });
}

/** The day's contracts and how each stands. */
async function contractsScreen(who) {
  const { db, nowS } = who.ctx;
  const day = utcDayOf(nowS);
  const list = dayContracts(who.player.id, day);
  const rows =
    (
      await db
        .prepare(
          "SELECT contract, state FROM exp_errands WHERE player_id = ?1 AND contract_day = ?2 AND contract IS NOT NULL AND state NOT IN ('refused', 'cancelled', 'recalled')",
        )
        .bind(who.player.id, day)
        .all()
    )?.results ?? [];
  const lines = list.map((c) => {
    const r = rows.find((x) => Number(x.contract) === c.n);
    const mark = !r ? '○ Open' : r.state === 'back' ? '● Done' : '◐ Under way';
    return `**${c.words}** +${c.reward} Seals\n-# ${mark}`;
  });
  return frame(
    who,
    'exp',
    [text(`**Today’s contracts.** New ones ${when((day + 1) * 86400, 'R')}.\n${lines.join('\n')}`), text('-# An errand that meets a contract earns its Seals when it comes back.')],
    { title: 'Contracts', actions: [button('Send', 'pda:exp:send', { style: STYLE.PRIMARY }), button('Back', 'pda:exp')] },
  );
}

/** What points buy, and what the player owns and uses. */
async function shopScreen(who, said = '') {
  const { db } = who.ctx;
  const points = await pointsOf(db, who.player.id);
  const owned = new Set(
    ((await db.prepare('SELECT key FROM exp_unlocks WHERE player_id = ?1').bind(who.player.id).all())?.results ?? []).map((r) => r.key),
  );
  owned.add('theme:amber');
  const theme = Number(who.link?.pda_theme) || THEMES[0].accent;
  const title = who.link?.pda_title ?? null;
  const forSale = [...THEMES, ...TITLES].filter((w) => !owned.has(w.key));
  const usable = [...THEMES, ...TITLES].filter((w) => owned.has(w.key));
  return frame(
    who,
    'exp',
    [
      ...(said ? [text(said), divider()] : []),
      text(
        `**Seals:** ${points}\n-# Earn Seals on missions, in contracts and at sea. Spend them on journal looks here, or on game cosmetics in the Courier’s Cabinet.`,
      ),
      ...(forSale.length
        ? [
            select(
              'pda:exp:buy',
              forSale.map((w) => ({ label: w.label, value: w.key, description: `${w.cost} Seals${w.cost > points ? ' · not enough yet' : ''}` })),
              { placeholder: 'Buy…' },
            ),
          ]
        : []),
      select(
        'pda:exp:use',
        [
          ...usable.map((w) => ({
            label: w.label,
            value: w.key,
            description: 'accent' in w ? (w.accent === theme ? 'Your frame now' : 'A frame') : w.label === title ? 'Your title now' : 'A title',
          })),
          ...(title ? [{ label: 'No title', value: 'title:none', description: 'Show no title' }] : []),
        ],
        { placeholder: 'Use…' },
      ),
    ],
    { title: 'Shop', actions: [button('Back', 'pda:exp')] },
  );
}

/** The last errands finished, with their reports. */
async function reportsScreen(who) {
  const rows =
    (
      await who.ctx.db
        .prepare(
          "SELECT * FROM exp_errands WHERE player_id = ?1 AND state IN ('back', 'refused', 'cancelled', 'recalled') ORDER BY state_at DESC LIMIT 6",
        )
        .bind(who.player.id)
        .all()
    )?.results ?? [];
  const lines = rows.map((r) => {
    if (r.state === 'back') return `${line(r.report ?? `${r.name} is back.`, 400)}${r.points ? ` (+${r.points} points)` : ''}\n-# ${when(r.state_at, 'R')}`;
    if (r.state === 'refused') return `${md(r.name, 40)} could not set out: ${md(r.why ?? 'the game refused it', 120)}\n-# ${when(r.state_at, 'R')}`;
    if (r.state === 'recalled') return `${md(r.name, 40)} was called home from ${placeName(r.place)}.\n-# ${when(r.state_at, 'R')}`;
    return `${md(r.name, 40)}’s errand to ${placeName(r.place)} was called off.\n-# ${when(r.state_at, 'R')}`;
  });
  return frame(who, 'exp', [text(lines.length ? lines.join('\n') : 'No errand has finished yet.')], {
    title: 'Reports',
    actions: [button('Back', 'pda:exp')],
  });
}

/** Buy a look or a title, paid in one batch that cannot overspend. */
export async function buyWare(ctx, playerId, key) {
  const w = wareOf(key);
  if (!w || w.cost <= 0) return { error: 'no-ware' };
  const { db, nowS } = ctx;
  if (await db.prepare('SELECT 1 AS y FROM exp_unlocks WHERE player_id = ?1 AND key = ?2').bind(playerId, key).first()) return { error: 'owned' };
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO exp_points (player_id, amount, why, ref, at)
           SELECT ?1, ?2, 'shop', ?3, ?4 WHERE (SELECT COALESCE(SUM(amount), 0) FROM exp_points WHERE player_id = ?1) >= ?5`,
        )
        .bind(playerId, -w.cost, `buy:${key}`, nowS, w.cost),
      mustChange(db, 1),
      db.prepare('INSERT INTO exp_unlocks (player_id, key, at) VALUES (?1, ?2, ?3)').bind(playerId, key, nowS),
    ]);
  } catch {
    return { error: 'points' };
  }
  return { ok: true, ware: w };
}

/** Use a look or a title the player owns. */
async function useWare(who, key) {
  const { db } = who.ctx;
  if (key === 'title:none') {
    await db.prepare('UPDATE discord_links SET pda_title = NULL WHERE discord_id = ?1').bind(who.discordId).run();
    who.link = { ...who.link, pda_title: null };
    return { ok: true, words: 'You show no title now.' };
  }
  const w = wareOf(key);
  if (!w) return { error: 'no-ware' };
  if (w.key !== 'theme:amber' && !(await db.prepare('SELECT 1 AS y FROM exp_unlocks WHERE player_id = ?1 AND key = ?2').bind(who.player.id, key).first()))
    return { error: 'not-owned' };
  if ('accent' in w) {
    await db.prepare('UPDATE discord_links SET pda_theme = ?1 WHERE discord_id = ?2').bind(w.accent, who.discordId).run();
    who.link = { ...who.link, pda_theme: w.accent };
    return { ok: true, words: `Your journal now uses the ${w.label.toLowerCase()}.` };
  }
  await db.prepare('UPDATE discord_links SET pda_title = ?1 WHERE discord_id = ?2').bind(w.label, who.discordId).run();
  who.link = { ...who.link, pda_title: w.label };
  return { ok: true, words: `Your profile card shows ${w.label} now.` };
}

const acts = {
  /** @param {any} who */
  send: async (who) => sendScreen(who),
  /** @param {any} who @param {string[]} args @param {string[]} values */
  pick: async (who, args, values) => placeScreen(who, String(values[0] ?? args[0] ?? '')),
  /** @param {any} who @param {string[]} args @param {string[]} values */
  place: async (who, args, values) => (values.length ? ventureScreen(who, args[0], values[0]) : placeScreen(who, args[0])),
  /** @param {any} who @param {string[]} args @param {string[]} values */
  venture: async (who, args, values) => confirmScreen(who, args[0], args[1], String(values[0] ?? '')),
  /** @param {any} who @param {string[]} args */
  async go(who, args) {
    const r = await sendErrand(who, args[0], args[1], args[2]);
    if ('error' in r) return mainScreen(who, say(r.error));
    const city = r.city ? `${md(r.city, 40)}, in ` : '';
    return mainScreen(
      who,
      `Sent to ${city}${placeName(args[1])}. It sets out within two minutes if you are playing, or when you next play. Back ${when(r.dueAt, 'R')} if it leaves now.`,
    );
  },
  /** @param {any} who @param {string[]} args */
  async recall(who, args) {
    const r = await who.ctx.db.prepare('SELECT name, state FROM exp_errands WHERE id = ?1 AND player_id = ?2').bind(String(args[0] ?? ''), who.player.id).first();
    if (!r) return mainScreen(who, say('no-errand'));
    return frame(
      who,
      'exp',
      [
        text(
          r.state === 'sent'
            ? `Call off ${md(r.name, 40)}’s errand? It has not set out yet.`
            : `Call ${md(r.name, 40)} home? It brings nothing back, and must recover from the road.`,
        ),
      ],
      {
        title: 'Recall',
        accent: ACCENT.WARN,
        actions: [button('Recall', `pda:exp:recallyes:${args[0]}`, { style: STYLE.DANGER }), button('Keep going', 'pda:exp')],
      },
    );
  },
  /** @param {any} who @param {string[]} args */
  async recallyes(who, args) {
    const r = await recallErrand(who, args[0]);
    if ('error' in r) return mainScreen(who, say(r.error));
    return mainScreen(who, r.cancelled ? `${md(r.name, 40)}’s errand is called off.` : `${md(r.name, 40)} is called home. It comes back when you next play.`);
  },
  /** @param {any} who @param {string[]} args */
  enc: async (who, args) => encounterScreen(who, args[0]),
  /** @param {any} who @param {string[]} args */
  async choose(who, args) {
    const n = Number(args[1]);
    const r = await who.ctx.db.prepare('SELECT * FROM exp_errands WHERE id = ?1 AND player_id = ?2').bind(String(args[0] ?? ''), who.player.id).first();
    const e = r?.enc_kind ? ENCOUNTERS[/** @type {keyof typeof ENCOUNTERS} */ (r.enc_kind)] : null;
    if (!r || !e || !Number.isInteger(n) || !e.choices[n]) return mainScreen(who, say('no-errand'));
    await who.ctx.db
      .prepare(
        "UPDATE exp_errands SET enc_choice = ?2, enc_told = 1 WHERE id = ?1 AND enc_choice IS NULL AND state IN ('sent', 'out', 'recall')",
      )
      .bind(r.id, n)
      .run();
    return encounterScreen(who, r.id);
  },
  /** @param {any} who */
  contracts: async (who) => contractsScreen(who),
  /** @param {any} who */
  shop: async (who) => shopScreen(who),
  /** @param {any} who @param {string[]} _a @param {string[]} values */
  async buy(who, _a, values) {
    const r = await buyWare(who.ctx, who.player.id, values[0]);
    return shopScreen(who, 'error' in r ? say(r.error) : `Bought: ${r.ware.label}. Choose it under Use.`);
  },
  /** @param {any} who @param {string[]} _a @param {string[]} values */
  async use(who, _a, values) {
    const r = await useWare(who, String(values[0] ?? ''));
    return shopScreen(who, 'error' in r ? say(r.error) : r.words);
  },
  /** @param {any} who */
  reports: async (who) => reportsScreen(who),
};

// ── the clock ──────────────────────────────────────────────────────

/** The link of each account, when it wants Expeditions' direct messages. */
async function linksOf(db, playerIds) {
  const ids = [...new Set(playerIds)];
  const out = new Map();
  // D1 binds at most 100 values a statement, so the accounts are asked about 90 at a time
  for (let at = 0; at < ids.length; at += 90) {
    const part = ids.slice(at, at + 90);
    const rows =
      (await db.prepare(`SELECT * FROM discord_links WHERE player_id IN (${part.map((_, i) => `?${i + 1}`).join(', ')})`).bind(...part).all())
        ?.results ?? [];
    for (const l of rows) if (wantsDm(l, 'exp')) out.set(l.player_id, l);
  }
  return out;
}

/**
 * The minute: encounters met (told once), errands back (their points counted once, their report written, the player
 * told), and errands the game never took up let go. Answers the rows moved.
 * @param {{ db: any, nowS: number }} ctx
 */
export async function expMinute(ctx) {
  const { db, nowS } = ctx;
  let n = 0;
  const met =
    (
      await db
        .prepare(
          `SELECT * FROM exp_errands WHERE enc_told = 0 AND enc_at <= ?1 AND source = 'discord' AND state IN ('sent', 'out') LIMIT ?2`,
        )
        .bind(nowS, EXP_CLOCK_ROWS)
        .all()
    )?.results ?? [];
  if (met.length) {
    const links = await linksOf(db, met.map((r) => r.player_id));
    const st = [];
    for (const r of met) {
      const l = links.get(r.player_id);
      const city = remoteErrandCity({ id: r.companion }, r.place, r.seed) ?? placeName(r.place);
      if (l)
        st.push(
          noticeStatement(db, l.discord_id, 'exp', `enc:${r.id}`, { title: 'On the road', lines: [encounterScene(r.enc_kind, r.name, city), '-# Choose what it does.'], open: `exp:enc:${r.id}`, label: 'Choose' }, nowS),
        );
      st.push(db.prepare('UPDATE exp_errands SET enc_told = 1 WHERE id = ?1').bind(r.id));
    }
    await db.batch(st);
    n += met.length;
  }
  const back =
    (
      await db
        .prepare("SELECT * FROM exp_errands WHERE state IN ('out', 'recall') AND due_at <= ?1 ORDER BY due_at LIMIT ?2")
        .bind(nowS, EXP_CLOCK_ROWS)
        .all()
    )?.results ?? [];
  if (back.length) {
    const links = await linksOf(db, back.map((r) => r.player_id));
    for (const r of back) {
      const days = remotePlace(r.place)?.days ?? 1;
      // Points come only from errands the service itself sent and timed; one the game reports is shown, never paid.
      const paid = r.source === 'discord';
      const lines = paid ? [{ amount: POINTS_A_DAY * days, why: 'errand', ref: `back:${r.id}` }] : [];
      if (paid && r.contract != null && r.contract_day != null) {
        const c = dayContracts(r.player_id, r.contract_day).find((x) => x.n === r.contract);
        if (c) lines.push({ amount: c.reward, why: 'contract', ref: `contract:${r.contract_day}:${c.n}` });
      }
      if (r.source === 'discord' && r.enc_kind && r.enc_choice != null) {
        const o = encounterOutcome(r.enc_kind, r.enc_choice, r.seed);
        if (o.points) lines.push({ amount: o.points, why: 'road', ref: `enc:${r.id}` });
      }
      const points = lines.reduce((s, x) => s + x.amount, 0);
      const city = remoteErrandCity({ id: r.companion }, r.place, r.seed) ?? placeName(r.place);
      const report = errandReport(r, city);
      const l = links.get(r.player_id);
      const moved = await db
        .prepare("UPDATE exp_errands SET state = 'back', state_at = ?2, points = ?3, report = ?4 WHERE id = ?1 AND state IN ('out', 'recall')")
        .bind(r.id, nowS, points, report)
        .run();
      if (!Number(moved?.meta?.changes)) continue;
      await db.batch([
        ...lines.map((x) =>
          db.prepare('INSERT OR IGNORE INTO exp_points (player_id, amount, why, ref, at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(r.player_id, x.amount, x.why, x.ref, nowS),
        ),
        ...(l
          ? [noticeStatement(db, l.discord_id, 'exp', `back:${r.id}`, { title: `${line(r.name, 40)} is back`, lines: [report, ...(points ? [`-# +${points} Seals`] : [])], open: 'exp', label: 'Open your journal' }, nowS)]
          : []),
      ]);
      n++;
    }
  }
  const stale = await db
    .prepare("UPDATE exp_errands SET state = 'cancelled', state_at = ?1, why = 'never taken up' WHERE state = 'sent' AND sent_at < ?2")
    .bind(nowS, nowS - EXP_WAIT_S)
    .run();
  return n + Number(stale?.meta?.changes ?? 0);
}

/** The hour: finished errands past their keeping. Points are never swept. */
export async function expHour(/** @type {{ db: any, nowS: number }} */ ctx) {
  const r = await ctx.db
    .prepare("DELETE FROM exp_errands WHERE state IN ('back', 'refused', 'cancelled', 'recalled') AND state_at < ?1")
    .bind(ctx.nowS - EXP_KEEP_S)
    .run();
  return Number(r?.meta?.changes ?? 0);
}

// ── the game's routes ──────────────────────────────────────────────

/** The character a request names, if it is the account's own realm character. */
async function ownCharacter(db, playerId, charId) {
  if (typeof charId !== 'string' || !REALM_ID_RE.test(charId)) return null;
  return db.prepare('SELECT id FROM realm_characters WHERE id = ?1 AND player = ?2 AND dead_at IS NULL').bind(charId, playerId).first();
}
const refused = (error, status = 400) => ({ status, json: { error } });

/** What the game should take up for a character: errands to set out, and errands to call home. */
async function pendingRoute(ctx, _env, player, _body, request) {
  const charId = new URL(request.url).searchParams.get('character');
  if (!(await ownCharacter(ctx.db, player.id, charId))) return refused('no-character', 404);
  const rows =
    (
      await ctx.db
        .prepare("SELECT * FROM exp_errands WHERE player_id = ?1 AND char_id = ?2 AND state IN ('sent', 'recall') ORDER BY sent_at LIMIT 10")
        .bind(player.id, charId)
        .all()
    )?.results ?? [];
  return {
    status: 200,
    json: {
      errands: rows.map((r) =>
        r.state === 'recall'
          ? { id: r.id, kind: 'recall', companion: r.companion, seed: r.seed }
          : { id: r.id, kind: 'send', companion: r.companion, seed: r.seed, place: r.place, venture: r.venture, world: r.world_at },
      ),
    },
  };
}

/** The game's answer for one errand: taken up, or refused with its words. */
async function ackRoute(ctx, _env, player, body) {
  const { db, nowS } = ctx;
  const id = String(body?.id ?? '');
  if (!REMOTE_ERRAND_ID_RE.test(id)) return refused('no-errand', 404);
  const r = await db.prepare('SELECT * FROM exp_errands WHERE id = ?1 AND player_id = ?2').bind(id, player.id).first();
  if (!r) return refused('no-errand', 404);
  const taken = body?.taken === true;
  const why = typeof body?.why === 'string' ? body.why.replace(/\s+/g, ' ').trim().slice(0, 120) : null;
  if (r.state === 'sent') {
    if (taken) {
      // The game's own minute it is back, where it is near the ledger's: the companion's stars may have moved its road.
      const due = Number.isInteger(body?.due) && Math.abs(body.due - r.due) <= 1440 ? body.due : r.due;
      await db
        .prepare("UPDATE exp_errands SET state = 'out', state_at = ?2, due = ?3, due_at = ?4 WHERE id = ?1 AND state = 'sent'")
        .bind(id, nowS, due, wallSecondOf(due))
        .run();
      return { status: 200, json: { ok: true, state: 'out' } };
    }
    await db.prepare("UPDATE exp_errands SET state = 'refused', state_at = ?2, why = ?3 WHERE id = ?1 AND state = 'sent'").bind(id, nowS, why).run();
    const l = (await linksOf(db, [player.id])).get(player.id);
    if (l)
      await db
        .batch([
          noticeStatement(db, l.discord_id, 'exp', `refused:${id}`, { title: `${line(r.name, 40)} stayed home`, lines: [`The game could not send it: ${why ?? 'it was not free to go'}.`], open: 'exp', label: 'Open your journal' }, nowS),
        ]);
    return { status: 200, json: { ok: true, state: 'refused' } };
  }
  if (r.state === 'recall') {
    const next = taken ? 'recalled' : 'cancelled';
    await db.prepare("UPDATE exp_errands SET state = ?3, state_at = ?2, why = ?4 WHERE id = ?1 AND state = 'recall'").bind(id, nowS, next, taken ? null : why).run();
    return { status: 200, json: { ok: true, state: next } };
  }
  return { status: 200, json: { ok: true, state: r.state } };
}

/** An errand the game sent or recalled itself, told so the PDA shows it. */
async function gameRoute(ctx, _env, player, body) {
  const { db, nowS } = ctx;
  if (!(await ownCharacter(db, player.id, body?.character))) return refused('no-character', 404);
  const companion = String(body?.companion ?? '');
  const seed = body?.seed;
  if (!companion || companion.length > 64 || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return refused('body');
  if (await overRate(ctx, `expgame:${player.id}`, EXP_GAME_MAX, 3600)) return refused('rate', 429);
  if (body?.kind === 'recall') {
    await db
      .prepare(
        "UPDATE exp_errands SET state = 'recalled', state_at = ?4 WHERE char_id = ?1 AND companion = ?2 AND seed = ?3 AND state IN ('sent', 'out', 'recall')",
      )
      .bind(body.character, companion, seed, nowS)
      .run();
    return { status: 200, json: { ok: true } };
  }
  if (body?.kind !== 'send' || !remotePlace(body.place) || !isRemoteVenture(body.venture)) return refused('body');
  const world = worldMinuteAt(nowS * 1000);
  // An errand the game sent is on its road now: back within the longest road, and not long past its own return.
  const due = Number.isInteger(body.due) && body.due >= world - GAME_LATE_MIN && body.due - world <= WORLD_SLACK_MIN ? body.due : null;
  if (due == null) return refused('body');
  const rank = Math.max(1, Math.min(5, Number(body.rank) | 0));
  const contract = null; // a contract is met by an errand the PDA sent; the game's word earns nothing
  const worldAt = Number.isInteger(body.world) && body.world <= due ? body.world : due - remoteRoadMinutes(null, body.place);
  await db
    .prepare(
      `INSERT OR IGNORE INTO exp_errands (id, player_id, char_id, companion, name, rank, place, venture, seed, world_at, due,
         due_at, sent_at, source, state, state_at, contract, contract_day)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'game', 'out', ?13, ?14, ?15)`,
    )
    .bind(
      mintErrandId(ctx.rand),
      player.id,
      body.character,
      companion,
      String(body.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 64) || 'A sworn revenant',
      rank,
      body.place,
      body.venture,
      seed,
      worldAt,
      due,
      wallSecondOf(due),
      nowS,
      contract ? contract.n : null,
      contract ? utcDayOf(nowS) : null,
    )
    .run();
  return { status: 200, json: { ok: true } };
}

/** A registered account's alone, as letters are. */
const registered = (fn) => async (ctx, env, player, body, request) =>
  player?.handle ? fn(ctx, env, player, body, request) : refused('expeditions-need-account', 403);

export const expPda = {
  key: 'exp',
  /** @param {any} who @param {string[]} args */
  async screen(who, args = []) {
    const act = args[0] && /** @type {any} */ (acts)[args[0]];
    return act ? act(who, args.slice(1), []) : mainScreen(who);
  },
  acts,
  /** @param {any} who */
  async glance(who) {
    if (!who.character) return null;
    const rows = await openRows(who.ctx.db, who.player.id, who.character.id);
    const away = rows.filter((r) => r.state === 'out' && r.due_at > who.ctx.nowS);
    const waiting = rows.filter((r) => r.state === 'sent').length;
    const points = await pointsOf(who.ctx.db, who.player.id);
    const bits = [
      away.length ? `${away.length} away, next back ${when(Math.min(...away.map((r) => r.due_at)), 'R')}` : '',
      waiting ? `${waiting} waiting to set out` : '',
      points ? `${points} Seals` : '',
    ].filter(Boolean);
    return `⚑ **Expeditions:** ${bits.length ? bits.join(' · ') : 'nobody away'}`;
  },
  /** @param {any} ctx */
  minute: (ctx) => expMinute(ctx),
  /** @param {any} ctx */
  hour: (ctx) => expHour(ctx),
  routes: {
    '/v1/expeditions/pending': { method: 'GET', handle: registered(pendingRoute) },
    '/v1/expeditions/ack': { method: 'POST', handle: registered(ackRoute) },
    '/v1/expeditions/game': { method: 'POST', handle: registered(gameRoute) },
  },
};
