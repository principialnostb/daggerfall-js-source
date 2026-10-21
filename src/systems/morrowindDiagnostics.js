// Structured, bounded diagnostics for asset/mod integration.
// Browser mode exports JSON; the desktop shell additionally persists JSONL files.
// Logging is best-effort: diagnostic failures must never break gameplay.
const STORAGE_KEY = 'morrowind.diagnostics.events.v2';
const MAX_EVENTS = 2500;
const MAX_STRING = 1200;
const sessionId = `mw-${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
let sequence = 0;
const memory = [];

function clean(value, depth = 0) {
  if (depth > 5) return '[depth-limit]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, MAX_STRING);
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => clean(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      if (/password|token|authorization|cookie|secret|credential/i.test(key)) continue;
      out[String(key).slice(0, 100)] = clean(item, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, MAX_STRING);
}
function readStored() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(-MAX_EVENTS) : [];
  } catch { return []; }
}
function persistBrowser(events) {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS))); } catch { /* quota/privacy mode */ }
}
function notifyDesktop(events) {
  try {
    const append = globalThis.daggerShell?.diagnostics?.append;
    if (typeof append === 'function') {
      const result = append(events);
      if (result?.ok === false) console.warn('[Morrowind diagnostics] desktop log write failed:', result.error ?? 'unknown error');
    }
  } catch (error) {
    try { console.warn('[Morrowind diagnostics] desktop bridge unavailable:', String(error?.message ?? error)); } catch { /* no console */ }
  }
}
export function recordMorrowindDiagnostic(event = {}) {
  try {
    const normalized = clean({
      schemaVersion: 2, timestamp: new Date().toISOString(), sessionId,
      sequence: ++sequence, severity: 'info', subsystem: 'integration',
      stage: 'unspecified', outcome: 'info', ...event,
    });
    const events = readStored();
    events.push(normalized);
    persistBrowser(events);
    memory.push(normalized);
    if (memory.length > MAX_EVENTS) memory.splice(0, memory.length - MAX_EVENTS);
    notifyDesktop([normalized]);
    return normalized;
  } catch { return null; }
}
export function getMorrowindDiagnostics() {
  try {
    const stored = readStored();
    return stored.length ? stored : memory.slice(-MAX_EVENTS);
  } catch { return memory.slice(-MAX_EVENTS); }
}
export function clearMorrowindDiagnostics() {
  memory.length = 0;
  try { globalThis.localStorage?.removeItem(STORAGE_KEY); } catch { /* ignored */ }
}
export function exportMorrowindDiagnostics() {
  return JSON.stringify({ schemaVersion: 2, sessionId, exportedAt: new Date().toISOString(), events: getMorrowindDiagnostics() }, null, 2);
}
export function copyMorrowindAnimationDiagnostics() {
  const value = exportMorrowindDiagnostics();
  try { if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) navigator.clipboard.writeText(value).catch(() => {}); } catch { /* clipboard is optional */ }
  return value;
}
export function downloadMorrowindAnimationDiagnostics() {
  const value = exportMorrowindDiagnostics();
  try {
    if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && globalThis.URL?.createObjectURL) {
      const url = URL.createObjectURL(new Blob([value], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `morrowind-animation-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  } catch { /* export remains available as a returned JSON string */ }
  return value;
}
if (typeof globalThis !== 'undefined') {
  globalThis.downloadMorrowindAnimationDiagnostics ??= downloadMorrowindAnimationDiagnostics;
  globalThis.copyMorrowindAnimationDiagnostics ??= copyMorrowindAnimationDiagnostics;
  globalThis.clearMorrowindAnimationDiagnostics ??= clearMorrowindDiagnostics;
}
