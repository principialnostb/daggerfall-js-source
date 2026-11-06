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
    .filter((report) => parseReport(report?.report))
    .sort((a, b) => a.at - b.at || (a.account < b.account ? -1 : a.account > b.account ? 1 : 0));
  const by = new Map();
  for (const report of sorted) {
    const seen = by.get(report.report) ?? new Set();
    seen.add(report.account);
    by.set(report.report, seen);
    if (seen.size >= WITNESS.confirm) return { report: report.report, at: report.at };
  }
  return null;
}

/** The bindings whose fill this isolate has seen done: a fill never starts again, so it is asked no more. */
const filledSeen = new WeakSet();
const rootOf = (/** @type {any} */ db) => db?.[DB_ROOT] ?? db;

/** Whether this isolate has seen the fill done on `db`'s binding - asked of nothing. */
export const groundFillKnown = (/** @type {any} */ db) => filledSeen.has(rootOf(db));
/** The fill's mark, as a statement for a batch: a route asks it beside its own reads until the fill is known done. */
export const fillMarkStatement = (/** @type {any} */ db) => db.prepare('SELECT done FROM ground_confirmed_fill WHERE id = 1');
/** Whether the mark's row says the fill is done - kept for the binding once it does. */
export function groundMarkDone(/** @type {any} */ db, /** @type {any} */ row) {
  const done = !row || Number(row.done) === 1;
  if (done && db && typeof db === 'object') filledSeen.add(rootOf(db));
  return done;
}

/** Whether every report filed before the table is read into it - the pick waits until then. */
export async function groundFilled(/** @type {any} */ db) {
  if (groundFillKnown(db)) return true;
  return groundMarkDone(db, await fillMarkStatement(db).first());
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
  const alone = full && results.every((row) => row.key === cut); // one pixel's reports past a page: read it whole
  const rows = alone
    ? ((
        await db
          .prepare("SELECT key, account, report, at FROM world_witness WHERE kind = 'pixel' AND key = ?1")
          .bind(cut)
          .all()
      )?.results ?? [])
    : full
      ? results.filter((row) => row.key !== cut)
      : results;
  const byKey = new Map();
  for (const row of rows) {
    const reports = byKey.get(row.key) ?? [];
    reports.push({ account: String(row.account), report: String(row.report), at: Number(row.at) });
    byKey.set(row.key, reports);
  }
  const kept = [];
  for (const [key, list] of byKey) {
    const confirmation = confirmationOf(list);
    if (confirmation) kept.push([key, confirmation.report, confirmation.at]);
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
    ...chunks.map((part) =>
      db
        .prepare(
          `INSERT OR REPLACE INTO ground_confirmed (key, report, at)
      SELECT json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]'), json_extract(j.value, '$[2]') FROM json_each(?1) AS j`,
        )
        .bind(JSON.stringify(part)),
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
  for (const row of results) {
    const said = parseReport(row.report);
    const [x, y] = String(row.key).split(',').map(Number);
    if (!said || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) continue;
    out.push({ x, y, climate: said.climate, region: said.region });
  }
  return out;
}

const placeholders = (/** @type {readonly string[]} */ keys) => keys.map((_, i) => `?${i + 1}`).join(', ');
/** The kept confirmations of pixel `keys` (`x,y`), as a statement for a batch. */
export const confirmedStatement = (/** @type {any} */ db, /** @type {readonly string[]} */ keys) =>
  db.prepare(`SELECT key, report FROM ground_confirmed WHERE key IN (${placeholders(keys)})`).bind(...keys);
/** Which of pixel `keys` hold a report but no kept confirmation - by the reports' key index alone, no row read. */
export const reportedStatement = (/** @type {any} */ db, /** @type {readonly string[]} */ keys) =>
  db
    .prepare(
      `SELECT key FROM world_witness WHERE kind = 'pixel' AND key IN (${placeholders(keys)})
    AND key NOT IN (SELECT key FROM ground_confirmed WHERE key IN (${placeholders(keys)})) GROUP BY key`,
    )
    .bind(...keys);

/**
 * Each of `keys`' facts from the kept rows, as nodeLaw witnessedFact answers what a reader uses: a kept pixel
 * confirmed with its answer, one with reports unconfirmed, one with none none. A disputed pixel reads as confirmed - its
 * confirmed answer stands, and every reader treats the two alike (factConfirmed).
 * @param {readonly string[]} keys @param {any[]} confirmedRows @param {any[]} reportedRows
 */
export function keptFacts(keys, confirmedRows, reportedRows) {
  const kept = new Map(confirmedRows.map((row) => [String(row.key), parseReport(row.report)]));
  const reported = new Set(reportedRows.map((row) => String(row.key)));
  const out = new Map();
  for (const k of keys) {
    const said = kept.get(k);
    if (said) out.set(k, { state: 'confirmed', ...said });
    else out.set(k, reported.has(k) ? { state: 'unconfirmed' } : { state: 'none', climate: null, region: null });
  }
  return out;
}
