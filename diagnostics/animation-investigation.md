# Animation diagnostics

This folder tracks reproducible animation-mod investigation results for the `Dev` branch.

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
