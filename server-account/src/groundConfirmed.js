// @ts-check
// THE CONFIRMED GROUND, KEPT (migration 0212): one row a confirmed pixel - its confirmed answer and the second it was
// confirmed. A report's insert keeps it (trigger ground_confirmed_in); the reports filed before the table are read
// into it a page a minute (fillGroundStep). The day's Motherlodes pick and the held map's tiles read it.
import { WITNESS, parseReport } from '../../src/net/nodeLaw.js';
import { TILES_LAID_CHARS } from './witnessTiles.js';
import { DB_ROOT } from './service.js';

/** The pixel reports one fill step reads: a few hundred milliseconds of the database a minute. */
export const GROUND_FILL_ROWS = 10_000;

/**
 * A pixel's confirmation from its reports, `{ report, at }`, or null: the first answer three accounts give, in the
 * order nodeLaw witnessedFact reads them (by second, then account), at its third account's second.
 * @param {ReadonlyArray<{ account: string, report: string, at: number }>} rows
 */
export function confirmationOf(rows) {
  const sorted = [...rows]
    .filter((r) => parseReport(r?.report))
    .sort((a, b) => a.at - b.at || (a.account < b.account ? -1 : a.account > b.account ? 1 : 0));
  const by = new Map();
  for (const r of sorted) {
    const seen = by.get(r.report) ?? new Set();
    seen.add(r.account);
    by.set(r.report, seen);
    if (seen.size >= WITNESS.confirm) return { report: r.report, at: r.at };
  }
  return null;
}

/** The bindings whose fill this isolate has seen done: a fill never starts again, so it is asked no more. */
const filledSeen = new WeakSet();
const rootOf = (/** @type {any} */ db) => db?.[DB_ROOT] ?? db;

/** Whether every report filed before the table is read into it - the pick waits until then. */
export async function groundFilled(/** @type {any} */ db) {
  if (filledSeen.has(rootOf(db))) return true;
  const row = await db.prepare('SELECT done FROM ground_confirmed_fill WHERE id = 1').first();
  const done = !row || Number(row.done) === 1;
  if (done && db && typeof db === 'object') filledSeen.add(rootOf(db));
  return done;
}

/**
 * ONE PAGE OF THE FILL: the next GROUND_FILL_ROWS pixel reports by key, each whole key's confirmation kept (a key the
 * page cut is read whole by the next). Answers the pixels kept. A fill row's confirmation is exact, so it replaces
 * whatever a report's insert kept for that pixel before the fill reached it.
 * @param {any} db @param {number} [page]
 */
export async function fillGroundStep(db, page = GROUND_FILL_ROWS) {
  if (filledSeen.has(rootOf(db))) return 0;
  const mark = await db.prepare('SELECT after, done FROM ground_confirmed_fill WHERE id = 1').first();
  if (!mark || Number(mark.done) === 1) {
    if (db && typeof db === 'object') filledSeen.add(rootOf(db));
    return 0;
  }
  const { results = [] } = await db
    .prepare("SELECT key, account, report, at FROM world_witness WHERE kind = 'pixel' AND key > ?1 ORDER BY key LIMIT ?2")
    .bind(String(mark.after), page)
    .all();
  const full = results.length >= page;
  const cut = full ? results.at(-1).key : null;
  const alone = full && results.every((r) => r.key === cut); // one pixel's reports past a page: read it whole
  const rows = alone
    ? ((
        await db
          .prepare("SELECT key, account, report, at FROM world_witness WHERE kind = 'pixel' AND key = ?1")
          .bind(cut)
          .all()
      )?.results ?? [])
    : full
      ? results.filter((r) => r.key !== cut)
      : results;
  const byKey = new Map();
  for (const r of rows) {
    const a = byKey.get(r.key) ?? [];
    a.push({ account: String(r.account), report: String(r.report), at: Number(r.at) });
    byKey.set(r.key, a);
  }
  const kept = [];
  for (const [key, list] of byKey) {
    const c = confirmationOf(list);
    if (c) kept.push([key, c.report, c.at]);
  }
  const chunks = [];
  let chunk = [],
    chars = 0;
  for (const k of kept) {
    const n = JSON.stringify(k).length + 1;
    if (chunk.length && chars + n > TILES_LAID_CHARS) {
      chunks.push(chunk);
      chunk = [];
      chars = 0;
    }
    chunk.push(k);
    chars += n;
  }
  if (chunk.length) chunks.push(chunk);
  const last = rows.length ? String(rows.at(-1).key) : String(mark.after);
  await db.batch([
    ...chunks.map((c) =>
      db
        .prepare(
          `INSERT OR REPLACE INTO ground_confirmed (key, report, at)
      SELECT json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), json_extract(j.value, '$[2]') FROM json_each(?1) AS j`,
        )
        .bind(JSON.stringify(c)),
    ),
    db
      .prepare('UPDATE ground_confirmed_fill SET after = ?1, done = ?2 WHERE id = 1 AND after = ?3')
      .bind(last, full ? 0 : 1, String(mark.after)),
  ]);
  return kept.length;
}

/**
 * THE GROUND CONFIRMED BEFORE `day` BEGAN, `[{ x, y, climate, region }]`: every pixel kept with a second before the
 * day's - a disputed pixel too, its confirmed answer standing (nodeLaw factConfirmed). Read by the Motherlodes pick and
 * the held map's tiles.
 * @param {any} db @param {number} day
 */
export async function confirmedGroundBefore(db, day) {
  const { results = [] } = await db
    .prepare('SELECT key, report FROM ground_confirmed WHERE at < ?1')
    .bind(day * 86400)
    .all();
  const out = [];
  for (const r of results) {
    const said = parseReport(r.report);
    const [x, y] = String(r.key).split(',').map(Number);
    if (!said || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) continue;
    out.push({ x, y, climate: said.climate, region: said.region });
  }
  return out;
}
