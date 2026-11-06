// @ts-check
// GUARD-CONTINUITY: carry the support-foot interval across walk/run clip changes.
import { loopWindow, strideTime } from './leftArmLayer.js';

/** Footstep markers already belonging to this clip's loop, in file seconds. */
function contacts(state, keys) {
  const win = loopWindow(state, keys);
  const rows = [];
  for (const key of keys ?? []) {
    const text = String(key.text ?? '').toLowerCase();
    const side = /^soundgen: (left|right)$/.exec(text)?.[1];
    if (side && key.time >= win.start && key.time < win.stop) rows.push({ time: key.time, side });
  }
  return { win, rows: rows.sort((a, b) => a.time - b.time) };
}

/** Answer the new clip's time; never reset a supported stride to its arbitrary first pose. */
export function movementPhaseTime(from, fromKeys, to, toKeys) {
  const dir = (s) => /^(?:walk|run)(forward|back|left|right)/i.exec(String(s?.group ?? ''))?.[1];
  if (!dir(from) || dir(from) !== dir(to)) return null;
  const a = contacts(from, fromKeys), b = contacts(to, toKeys);
  const spanA = a.win.stop - a.win.start, spanB = b.win.stop - b.win.start;
  if (!(spanA > 0 && spanB > 0) || !(from.time >= a.win.start)) return null;
  if (a.rows.length >= 2 && b.rows.length >= 2) {
    let i = -1;
    for (let k = 0; k < a.rows.length; k++) if (a.rows[k].time <= from.time) i = k;
    if (i < 0) i = a.rows.length - 1;
    const start = a.rows[i], end = a.rows[(i + 1) % a.rows.length];
    const duration = end.time > start.time ? end.time - start.time : end.time + spanA - start.time;
    const passed = from.time >= start.time ? from.time - start.time : from.time + spanA - start.time;
    const j = b.rows.findIndex((r) => r.side === start.side);
    if (j >= 0 && duration > 0) {
      const next = b.rows[(j + 1) % b.rows.length];
      const targetSpan = next.time > b.rows[j].time ? next.time - b.rows[j].time : next.time + spanB - b.rows[j].time;
      const time = b.rows[j].time + Math.min(1, Math.max(0, passed / duration)) * targetSpan;
      return b.win.start + ((time - b.win.start) % spanB + spanB) % spanB;
    }
  }
  return strideTime(from, fromKeys, to, toKeys);
}

/** LEG-CLOCK (2026-11-06, the owner's 19-47-18 recording: the trunk and the arms "foreign" to the legs): where the
 *  movement clip's own legs stand in their stride, 0..1 - 0 at its left foot's contact (`soundgen: left`), 0.5 at its
 *  right's, even between them - or null where the clip marks no two contacts. The body layer's own gait clock
 *  (bodyMotion/gait.js) counted the stride from the ground crossed, and the legs drawn are the clip's: walking it ran
 *  3 strides to the clip's 3.5 in two seconds, running 5 to 4.5, so the chest's counter-turn and the held arms' swing
 *  drifted half a stride off the feet each second. */
export function clipStridePhase(state, keys) {
  if (!state || !Number.isFinite(state.time)) return null;
  const { win, rows } = contacts(state, keys);
  const span = win.stop - win.start;
  if (!(span > 0) || rows.length < 2 || !rows.some((r) => r.side === 'left') || !rows.some((r) => r.side === 'right')) return null;
  const t = win.start + (((state.time - win.start) % span) + span) % span;
  let i = -1;
  for (let k = 0; k < rows.length; k++) if (rows[k].time <= t) i = k;
  if (i < 0) i = rows.length - 1;
  const a = rows[i], b = rows[(i + 1) % rows.length];
  const gap = b.time > a.time ? b.time - a.time : b.time + span - a.time;
  const passed = t >= a.time ? t - a.time : t + span - a.time;
  const from = a.side === 'left' ? 0 : 0.5, to = b.side === a.side ? from + 1 : from + 0.5;
  const u = gap > 0 ? Math.min(1, Math.max(0, passed / gap)) : 0;
  const p = from + (to - from) * u;
  return p - Math.floor(p);
}
