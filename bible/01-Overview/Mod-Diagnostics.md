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

- The Daggerfall Unity `.dfmod` registry reports discovery counts, resolved load order, registration state, dependency-sort failure, missing/failed indexes, duplicate texture names, bundle-open failures/timeouts and texture-decode failures.
- Morrowind animation providers report selected asset counts per pack/rig and per-file load failures for walk, first-person, dynamic third-person and hit-reaction clips. The archive fallback is named when retained.
- First-person animation selection now also reports an incompatible rig, an enabled provider with no eligible files, and a provider whose candidate clips all failed to load. Optional female locomotion files that Vite did not resolve are reported individually. An empty OpenMW third-person result is a warning, not a misleading successful selection.
- Morrowind bundled body/texture assets report selected pack/configuration summaries and failed asset fetches; the Morrowind texture worker reports decoder failures and worker-pool fallback.
- Simply Animated Cloaks reports discovered model/texture counts, VFS registrations, the active classic-versus-skinned cloak selection, and per-resource open failures/successes. These events distinguish a preference being enabled from the selected NIF actually reaching the Morrowind archive reader.

## Animation diagnostics: previous versus current

The earlier animation workflow included the Morrowind Mesh Viewer and source-selection messages. Those are useful for inspecting a file or confirming which group a source exposes, but they do not by themselves prove that gameplay requested a compatible rig, resolved a provider, loaded any eligible clips, or retained the archive fallback.

The current runtime diagnostics add a structured trail around the actual animation asset-loader boundaries:

- `animation-discovery`: optional files and provider catalogs that were not resolved.
- `animation-selection`: incompatible rig, no eligible candidates, empty loaded set, and successful per-provider counts.
- `animation-load`: per-file fetch/read failures with the rig and archive fallback recorded.

This is deliberately not a claim that every animation application path is instrumented. The events establish what the loader selected and loaded; they do not yet prove that a requested animation group was ultimately bound and sampled by every gameplay consumer. Treat missing events as an observability gap, not proof of success. The separate animation integration and maintenance documents remain the source of truth for provider rules and compatibility constraints.

These hooks cover the real loader seams currently instrumented, not every possible model path. Other model/body/animation paths should emit the same event contract as those paths are instrumented; a lack of an event must not be interpreted as proof that a resource loaded successfully.

## Actual movement-source selection events (2026-10-21)

The gameplay movement resolver in `src/combat/fpArm.js` now emits a versioned `movement-source-selection` diagnostic whenever it re-picks a movement clip. This extends coverage beyond replacement-only locomotion logs:

- `rig`, `actor`, and `group` identify the resolved skeleton, actor lane (`player`, `peer-player`, `female-npc`, or `male-or-unknown-npc`), and requested composed group.
- `preference` records the active walk/run preference where applicable; non-locomotion movement groups report the resolver's vanilla/default path.
- `candidateCount` records how many sources survived the family filter before clip selection.
- `file`, `sourcePack`, and `animationFamily` identify the actual selected source. Archive or unlabeled sources are explicitly marked rather than mistaken for a replacement pack.
- `selected: false` plus `fallback: no-compatible-source` records a failed pick, including the group for which no source supplied usable start/stop keys.

Events use the `movement-selection-v1` deduplication namespace so earlier stored diagnostics do not suppress the new event schema. As with the existing collector, this is a best-effort browser-local log; it proves the resolver's source decision, not that the rendered pose looked correct. Check a fresh exported JSON after reproducing a walk/run transition and inspect the event's `group`, `file`, and `sourcePack` fields.

