// The staff desk's test pieces: a rig whose service names a moderator and an Admin, and an open chat case laid by hand
// as the safety code would leave one.
import { pdaRig } from './pdaRig.mjs';

/** The rig with `Mod1` a moderator and `Dev1` an Admin, each linked to Discord, and the polls' own channel set. */
export async function staffRig(extra = {}) {
  const r = await pdaRig({
    MODERATOR_HANDLES: 'Mod1,Keeper',
    DEVELOPER_HANDLES: 'Dev1',
    DISCORD_POLL_CHANNEL: '910000000000000001',
    ...extra,
  });
  const mod = await r.linked('Mod1');
  const dev = await r.linked('Dev1');
  return { ...r, mod, dev };
}

let n = 0;
/** A fresh case id, as safety.js mints them. */
export const caseId = () => (++n).toString(16).padStart(16, '0');

/**
 * An open case against `target`: its lines (`own` ones are the target's), its reports by `reporters`, the reviewer's
 * verdict when `ai` is given. Answers the case's id.
 */
export function openCase(raw, target, { kind = 'chat', source = 'report', reporters = [], reasons = ['harassment'], lines = [], ai = null, nowS = Math.floor(Date.now() / 1000), id = caseId() } = {}) {
  raw
    .prepare(
      `INSERT INTO mod_cases (id, target, source, status, opened_at, updated_at, reports, credible, ai_state, ai_category, ai_severity, ai_confidence, ai_reason, ai_mode, ai_line_at, ai_line_sub, discord_state, kind)
       VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'off', ?)`,
    )
    .run(id, target, source, nowS, nowS, reporters.length, reporters.length, ai ? 'done' : 'due', ai?.category ?? null, ai?.severity ?? null, ai?.confidence ?? null, ai?.reason ?? null, ai?.mode ?? null, ai?.lineAt ?? null, ai?.lineSub ?? null, kind);
  reporters.forEach((rep, i) =>
    raw.prepare('INSERT INTO mod_reports (case_id, reporter, reason, note, at, counted) VALUES (?, ?, ?, ?, ?, 1)').run(id, rep, reasons[i % reasons.length], i === 0 ? 'said it twice' : null, nowS),
  );
  lines.forEach((l, i) => raw.prepare('INSERT INTO mod_case_lines (case_id, at, sub, name, tab, text) VALUES (?, ?, ?, ?, ?, ?)').run(id, l.at ?? nowS - 100 + i, l.sub, l.name, l.tab ?? 'world', l.text));
  return id;
}
