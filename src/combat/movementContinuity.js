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
