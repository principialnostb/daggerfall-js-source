# Morrowind cloak animation probe

This is an opt-in, read-only live geometry capture. It records the actual posed cloak and body-piece vertex arrays from `poseAssembly`; it does not move vertices, alter animation playback, or run a collision solver.

## Run

Requirements: start the game normally first, with your usual assets and browser session. This diagnostic deliberately does **not** start a second web server or a separate Chromium profile.

In one terminal, start the game the same way you already do:

```bat
npm.cmd run dev
```

In another terminal, run:

```bat
npm.cmd run mwcloakprobe
```

The probe opens the normal dev-server game URL in your default browser with `?mwcloakprobe=1`. In the game tab, the diagnostic panel appears once the pose assembly is running. Play normally with the cloak equipped, including the idle, walk, run, combat and transition states you want to inspect. Click **Stop and download capture** to stop sampling and download `mw-cloak-capture.json`.

If Vite is using a different host or port, pass the game URL explicitly, for example:

```bat
npm.cmd run mwcloakprobe -- http://localhost:5174/play/
```

The capture is read-only. It records posed geometry only when both cloak and body pieces are present; it does not change geometry or animation playback and does not solve collisions. If the panel never appears, verify that the running game build contains the updated `src/formats/morrowind/mwFirstPerson.js` module and that its pose assembly is active.

## Output

The JSON capture is downloaded by the browser; it is not written to a separate Playwright-controlled browser's filesystem.

- `mw-cloak-capture.json` (browser download): sampled posed geometry for cloak and body slots, skeleton matrices, and capture metadata.

Upload the whole directory (or zip it) for analysis.

## Current limitations

- This is the first runtime capture stage, not yet a full animation-state fuzzer.
- It does not automatically enumerate/force every KF, combat state, blend or transition.
- The current pose callback does not yet attach the active KF/source clip name; `time` is the assembly pose time and must not be mistaken for a clip identifier.
- Captured geometry can be large. The probe samples no faster than roughly 10 Hz. It keeps a rolling maximum of 4,000 samples.
- A near-surface point alone is not proof of a mesh intersection. Do not treat this raw capture as a pass/fail verdict.

These limits are explicit so the report cannot claim coverage it has not actually achieved. The next stage is to connect the live actor's animation-source/state-machine metadata and a deterministic clip/state driver, then add geometry-level intersection classification and candidate-frame screenshots.
