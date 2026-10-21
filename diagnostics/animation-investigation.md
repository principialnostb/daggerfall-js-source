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

The JSON contains structured diagnostic events captured by the runtime, including clip parsing/binding and first-person source selection. The collector is in-memory for the current page session; reload the game and reproduce the issue again if needed. Export before reloading.

## Initial observations from the first console report

Date recorded: 2026-10-21

- The runtime selected replacement locomotion group `walkforward` from Simply Walking Purist Edition for `meshes/xbase_anim.kf`.
- The runtime selected replacement locomotion group `walkforward` from Simply Walking Feminine Walk Cycle for `meshes/xbase_anim_female.kf`.
- OpenMW Dynamic Animations female-rig clips `Idle3_copy;.kf`, `zIdle2;.kf`, and `zIdle6;.kf` were reported with `ok: true`. This indicates successful parsing/binding at the diagnostic stage, but does not alone prove the clips were selected for playback.
- The provided excerpt did not include any `first-person-action-selection` entries, so ReAnimation's first-person attack source remains unverified from this report.

Keep generated JSON logs and future summarized findings in this folder so the investigation has a durable record independent of chat history.
