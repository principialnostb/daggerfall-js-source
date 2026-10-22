// MOD-DIAG1: structured diagnostics for third-party asset integration.
// The collector is deliberately host-neutral: Electron writes durable NDJSON files;
// browser/headless hosts remain useful without granting arbitrary filesystem access.

const LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const textOf = (value, limit = 1200) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit);
function cleanValue(value, depth = 0, seen = new WeakSet()) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return textOf(value, 500);
  if (typeof value === 'number') return Number.isFinite(value) ? value : textOf(value, 100);
  if (typeof value !== 'object') return textOf(value, 300);
  if (depth >= 3) return '[depth limit]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => cleanValue(item, depth + 1, seen));
  return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [textOf(key, 80), cleanValue(item, depth + 1, seen)]));
}

const modOf = (value) => {
  const raw = textOf(value || 'core', 240).replace(/\\/g, '/').split('/').pop();
  return raw.replace(/[^a-zA-Z0-9._ -]/g, '_').trim().slice(0, 120) || 'unknown-mod';
};

function defaultSink(event) {
  // Keep a small browser-readable history so diagnostics remain inspectable even
  // when DevTools renders console objects as opaque/collapsed entries.
  try {
    const history = globalThis.__modDiagnosticsEvents
      ?? (globalThis.__modDiagnosticsEvents = []);
    history.push(event);
    if (history.length > 250) history.splice(0, history.length - 250);
  } catch { /* diagnostics must never take down the game */ }
  try {
    const shell = globalThis.daggerShell?.diagnostics;
    if (typeof shell?.write === 'function') {
      shell.write(event);
      return;
    }
  } catch { /* diagnostics must never take down the game */ }
  const method = event.level === 'error' ? 'error' : event.level === 'warn' ? 'warn' : 'debug';
  try { globalThis.console?.[method]?.('[mod-diagnostics]', JSON.stringify(event)); } catch { /* headless host */ }
}

/** Build an isolated collector; injectable time and sink keep tests deterministic. */
export function createModDiagnostics({ sink = defaultSink, now = () => new Date(), sessionId = null } = {}) {
  const session = textOf(sessionId || `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, 100);
  let sequence = 0;
  const registrations = new Map();
  const totals = { debug: 0, info: 0, warn: 0, error: 0, conflicts: 0 };

  function emit(input) {
    const level = LEVELS.has(input?.level) ? input.level : 'info';
    const event = Object.freeze({
      timestamp: (() => { try { return new Date(now()).toISOString(); } catch { return new Date().toISOString(); } })(),
      sessionId: session,
      sequence: ++sequence,
      level,
      phase: textOf(input?.phase || 'runtime', 100),
      action: textOf(input?.action || 'event', 120),
      modId: modOf(input?.modId),
      resource: textOf(input?.resource, 500) || null,
      message: textOf(input?.message, 2000),
      details: input?.details && typeof input.details === 'object' && !Array.isArray(input.details)
        ? cleanValue(input.details)
        : {},
    });
    totals[level]++;
    try { sink(event); } catch { /* a broken log destination must not alter gameplay */ }
    return event;
  }

  return Object.freeze({
    record(input = {}) {
      const domain = textOf(input.domain || input.phase || 'resource', 100);
      const resource = textOf(input.resource, 500);
      const owner = modOf(input.modId);
      if (input.action === 'register' && resource) {
        const key = `${domain}\u0000${resource.toLowerCase()}`;
        const previous = registrations.get(key);
        registrations.set(key, owner);
        if (previous && previous !== owner) {
          totals.conflicts++;
          emit({
            level: 'warn', phase: 'conflict', action: 'duplicate-registration', modId: owner, resource,
            message: `Resource registration replaced/overlapped a prior owner: ${previous}`,
            details: { domain, previousOwner: previous, currentOwner: owner },
          });
        }
      }
      return emit(input);
    },
    async stage({ modId, phase, resource = null, details = {} } = {}, work) {
      const started = Date.now();
      emit({ level: 'debug', phase, action: 'stage-start', modId, resource, details });
      try {
        const result = await work();
        emit({ level: 'info', phase, action: 'stage-complete', modId, resource, details: { ...details, durationMs: Date.now() - started } });
        return result;
      } catch (error) {
        emit({ level: 'error', phase, action: 'stage-failed', modId, resource,
          message: textOf(error?.message ?? error, 2000), details: { ...details, errorName: textOf(error?.name || 'Error', 100), durationMs: Date.now() - started } });
        throw error;
      }
    },
    summary() {
      return Object.freeze({ sessionId: session, sequence, totals: Object.freeze({ ...totals }), registeredResources: registrations.size });
    },
    resetForTests() {
      registrations.clear();
      sequence = 0;
      for (const key of Object.keys(totals)) totals[key] = 0;
    },
  });
}

export const modDiagnostics = createModDiagnostics();
export const diagnosticModId = modOf;
