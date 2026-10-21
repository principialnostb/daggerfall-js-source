# Animation diagnostics

This folder tracks reproducible animation/mod investigation results for the `morrowind.v5` branch. The runtime logger described below is the target architecture; features marked as planned are not implemented merely because they are documented.

## How to export runtime diagnostics

1. Start the game from the current `Dev` branch and reproduce the animation issue.
2. Open browser DevTools → Console.
3. Run:

```js
downloadMorrowindAnimationDiagnostics()
```

4. The browser downloads a file named `morrowind-animation-diagnostics-<timestamp>.json`.
5. Put the downloaded JSON in this folder (or attach it to the relevant issue/PR). Do not paste large console dumps into chat.

The JSON contains structured diagnostic events captured by the runtime, including clip parsing/binding and first-person source selection. Events are persisted in this browser profile's `localStorage` across reloads. Run `copyMorrowindAnimationDiagnostics()` in DevTools Console to copy the accumulated JSON; no download is needed. Use `clearMorrowindAnimationDiagnostics()` only when you intentionally want to discard the current local log.

## Initial observations from the first console report

Date recorded: 2026-10-21

- The runtime selected replacement locomotion group `walkforward` from Simply Walking Purist Edition for `meshes/xbase_anim.kf`.
- The runtime selected replacement locomotion group `walkforward` from Simply Walking Feminine Walk Cycle for `meshes/xbase_anim_female.kf`.
- OpenMW Dynamic Animations female-rig clips `Idle3_copy;.kf`, `zIdle2;.kf`, and `zIdle6;.kf` were reported with `ok: true`. This indicates successful parsing/binding at the diagnostic stage, but does not alone prove the clips were selected for playback.
- The provided excerpt did not include any `first-person-action-selection` entries, so ReAnimation's first-person attack source remains unverified from this report.

Keep generated JSON logs and future summarized findings in this folder so the investigation has a durable record independent of chat history.


## Attack-window diagnostics (2026-10-21)

Commit: [6ed8038](https://github.com/principialnostb/daggerfall-js-source/commit/6ed8038e509410808685742e013c5b5c5aaf4afd)

The first-person ReAnimation diagnostics now record the actual normalized text keys from each parsed KF file. Each attempted attack window emits a versioned `first-person-action-selection-v2` event with:

- the requested weapon group and exact start/stop markers;
- each ReAnimation candidate's file, group presence, marker presence, and whether `resetClip` accepts the window;
- candidate group text keys and an explicit fallback reason;
- the final selected file and animation pack.

Versioned event keys (`fp-v2`, `fp-action-v2`) intentionally bypass older persisted diagnostic entries that would otherwise suppress the richer events. Reproduce at least one chop, slash, and thrust after updating to this commit, then run `copyMorrowindAnimationDiagnostics()` and add the JSON to this directory. Do not clear the log before copying it.


## Logging architecture: per-mod diagnostics (planned)

### Goal

Turn animation, body, texture, and third-party mod integration failures into reproducible evidence instead of guesswork. Diagnostics must show what the runtime discovered, attempted, selected, rejected, and fell back to, with enough context to identify the failing stage and responsible mod.

### Event contract

Use one structured, versioned event format across subsystems. Each event should include, where available:

- schema version, timestamp, severity, subsystem and stage;
- stable event name and correlation/session ID;
- mod/package ID and display name, source-relative asset path, asset type and content hash when practical;
- actor/rig context (player/NPC/creature, first-/third-person, skeleton or body variant);
- operation and outcome (started, ok, skipped, fallback, warning, error);
- concise reason/code, expected versus actual values, and the chosen fallback;
- related event IDs so one asset can be traced from discovery through parsing, binding, selection and rendering.

Do not rely on free-form messages alone. Keep stable machine-readable codes and fields; messages are for humans. Avoid logging credentials or unrelated player data.

### Event pipeline and storage

1. **Instrumentation:** emit events at resource discovery, file read/decode, parsing, validation, skeleton/texture binding, candidate ranking, conflict resolution, selection, and final render/use. Record rejected candidates as well as the winner.
2. **Session buffer:** collect events in a bounded in-memory buffer and flush in batches. Duplicate-event suppression must not hide new schema versions or changed outcomes.
3. **Per-mod view:** group events by normalized mod ID while preserving a session-wide timeline for conflicts between mods. If attribution is unknown, record that explicitly instead of guessing.
4. **Persistent local output:** in the packaged desktop app, write logs beneath a dedicated diagnostics directory inside the game installation only when that location is writable and permitted. Prefer a configurable path and fall back to the user's app-data directory when installation folders are read-only. Report the destination and any write failure.
5. **Browser fallback:** browsers cannot write arbitrary files into the game directory. In browser mode, use bounded local persistence and explicit JSON export/download. Do not imply browser mode writes into the installation folder.
6. **Rotation and privacy:** use session-stamped files, size limits and retention/rotation. Keep raw asset bytes out of logs by default; record paths, hashes, metadata and concise error details.

Suggested output layout:

\`\`\`text
<Game>/diagnostics/
  sessions/<session-id>/session.jsonl
  mods/<normalized-mod-id>.jsonl
  summary.json
\`\`\`

The session stream is canonical; per-mod streams are filtered views or indexes, not competing sources of truth. JSON Lines (.jsonl) is preferred for append-only events; summary.json contains environment, enabled mods, counts and first-seen failures.

### Integration coverage

- **Animations:** KF/NIF discovery, text-key extraction, group resolution, marker/loop-window validation, rig and bone compatibility, candidate ranking, selected source, fallback reason, and whether the selected clip was actually played.
- **Textures:** path normalization, archive/loose-file resolution, missing or ambiguous matches, decode dimensions/format, cache hit/miss, material assignment, and fallback texture.
- **Bodies and rigs:** body-part source selection, actor/race/sex variant, skeleton identity, missing bones, skinning/binding failures, and attachment compatibility.
- **Cross-mod conflicts:** record competing candidates and the deterministic precedence rule that selected one. Include winning and losing mod IDs; do not just emit "conflict".
- **Failure boundaries:** isolate expected integration-stage failures and use safe fallbacks where possible, rather than aborting unrelated assets. Do not swallow errors without a diagnostic event.

### Operational requirements

- Logging levels: error, warn, info, and opt-in verbose tracing. Keep high-volume per-frame events disabled by default; log state transitions and sampled summaries instead.
- Correlation: one session ID per launch and trace IDs for each actor/resource integration path.
- Stable IDs: normalize mod IDs independently from display names and paths; handle duplicate names and case differences.
- Compatibility: version the event schema and preserve backward-compatible export where practical.
- Logger failures must not crash the game. A write failure should produce a visible warning and retain a bounded in-memory/exportable buffer.
- Tests must cover event schema, mod attribution, redaction, buffer limits, file rotation, unwritable paths, browser export, deterministic conflict reporting, and logger-failure isolation.

### Acceptance criteria

The first implementation milestone is complete only when a tester can reproduce a broken third-party asset and answer from the exported report:

1. Which mod and asset were considered?
2. Which integration stage failed, with a stable reason code?
3. Which competing asset or mod won, and why?
4. What fallback did the runtime use?
5. Was the asset merely parsed, actually selected, and finally rendered/played?
6. Where was the log written, or why could it not be written there?

This section specifies the target architecture. The existing animation diagnostic export remains the current behavior until persistent desktop file output and broader instrumentation are implemented.


## Runtime implementation status (2026-10-21)

The first runtime milestone is implemented in `src/systems/morrowindDiagnostics.js` and wired into animation asset loading:

- schema-v2 events include timestamps, session IDs, sequence numbers, subsystem, stage, outcome and reason codes;
- browser mode keeps a bounded localStorage history and exposes the console commands above for JSON export/copy/download;
- desktop mode appends JSONL under `<userData>/Game/diagnostics/` when the channel-managed game store is active, otherwise under `<userData>/Diagnostics/diagnostics/` because install directories may be read-only;
- canonical session streams live in `sessions/<session-id>.jsonl`; attributed events are also written to `mods/<mod-id>.jsonl`;
- the desktop IPC accepts events only from the game window, limits batch/event size and sanitizes file names; write failures are non-fatal;
- animation asset reads record start/success/failure events, and pack-load failures record the archive fallback.

This is a first vertical slice, not yet full animation/texture/body coverage. Next instrumentation points are parse/bind validation, candidate ranking and rejected candidates, final selection versus actual playback, texture resolution/cache/fallback, and body/rig compatibility. Runtime log output should not be committed to source control.
