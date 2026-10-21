# Mod integration diagnostics

The runtime collector lives in `src/systems/modDiagnostics.js`. It is host-neutral: it never imports Node or Electron, and a failure in the diagnostic sink must never break loading or rendering.

## Desktop log locations

The Electron shell writes newline-delimited JSON under the shell's user-data directory:

- `Diagnostics/integration.ndjson` — every accepted diagnostic event, across all mods.
- `Diagnostics/mods/<safe-mod-id>.ndjson` — the same event in that mod's own log.

The desktop user-data directory is the same root used by `Saves/` and `Prefs/` (normally the operating system's application-data directory under `Daggerfall JavaScript`; `DAGGER_USER_DATA` overrides it for tests/portable use). The log writer accepts records only from the game window, limits record size, and derives filenames from a sanitized module identifier. Renderer code cannot choose a path.

A browser build has no permission to write arbitrary files in the game's folder. It falls back to the browser console; it does not pretend that a durable file was written.

## Event contract

Each record contains `timestamp`, `sessionId`, monotonically increasing `sequence`, `level` (`debug|info|warn|error`), `phase`, `action`, `modId`, optional `resource`, a bounded `message`, and bounded `details`.

Use stable phase names such as `discovery`, `indexing`, `registration`, `texture`, `body`, `animation`, `render`, and `storage`. Name the exact resource whenever known. Use `createModDiagnostics().stage(..., work)` around asynchronous stages when the caller needs start/completion/failure events; failures are logged and rethrown unchanged.

Registration records use `action: 'register'` plus a `domain` and `resource`. Re-registering a resource from a different module produces a `duplicate-registration` warning with both owners. This is an observed overlap, not automatically proof of a bug: explicit overrides can be intentional, so preserve load order and both module IDs in the event.

## Integration and failure rules

- Diagnostic writes are best-effort and must not change gameplay results.
- Do not log whole texture buffers, model payloads, or arbitrary exception objects. Log resource identifiers, bounded error text, counts, fingerprints, load order, and relevant configuration.
- A missing optional index is an `indexing` state, not necessarily a hard error; emit an error only when the attempt fails or the resource cannot be registered.
- Report the distinction between discovered, indexed, registered, enabled, and actually opened/used. These are separate stages.
- When logging textures, prefer conflicts and stage summaries over one event per texture; large bundles can contain many thousands of entries.
- Tests for this collector are in `test/systems/mod_diagnostics.test.js`. The standard test runner discovers every `*.test.js` under `test/`.

## Current coverage

The collector and Electron NDJSON transport are the shared foundation. The Daggerfall Unity `.dfmod` registry reports discovery/registration order, indexing failures, and duplicate texture names through this interface. Other model/body/animation paths should emit the same event contract at their real loader seams as those paths are instrumented; a lack of an event must not be interpreted as proof that a resource loaded successfully.
