# Morrowind cloak animation probe

This is an opt-in, read-only live geometry capture. It records the actual posed cloak and body-piece vertex arrays from `poseAssembly`; it does not move vertices, alter animation playback, or run a collision solver.

## Run

Requirements: Node version allowed by `package.json`, dependencies installed with `npm install`, and a working local game setup/assets.

```sh
npm run mwcloakprobe
```

By default the probe starts Vite on port 5247 and opens `/play/` in a visible Chromium window. Capture continues until you click **Stop cloak diagnostic capture** in the top-right corner. To use a timed capture, pass a number of seconds:

```sh
node tools/mwCloakAnimationProbe.mjs http://localhost:5247/play/ 180
```

Browser console errors and failed network requests are printed in the terminal and included in `capture.json`, which helps diagnose a blank page. The probe uses Playwright's normal browser installation; do not set a Linux-only `PLAYWRIGHT_BROWSERS_PATH` on Windows. The target page must load a game/player state in which a cloak is equipped and the body is assembled. If the app requires a save or a user action to reach gameplay, this headless probe will not be able to do that automatically yet; in that case the capture will report zero samples rather than pretend it tested the animations.

## Output

Files are written to `diagnostics/mw-cloak-probe/`:

- `capture.json`: sampled posed geometry for cloak and body slots, skeleton matrices, page errors and metadata.
- `last-frame.png`: final browser screenshot.
- `README.txt`: notes attached to that capture.

Upload the whole directory (or zip it) for analysis.

## Current limitations

- This is the first runtime capture stage, not yet a full animation-state fuzzer.
- It does not automatically enumerate/force every KF, combat state, blend or transition.
- The current pose callback does not yet attach the active KF/source clip name; `time` is the assembly pose time and must not be mistaken for a clip identifier.
- Captured geometry can be large. The probe samples no faster than roughly 10 Hz. It keeps a rolling maximum of 4,000 samples.
- A near-surface point alone is not proof of a mesh intersection. Do not treat this raw capture as a pass/fail verdict.

These limits are explicit so the report cannot claim coverage it has not actually achieved. The next stage is to connect the live actor's animation-source/state-machine metadata and a deterministic clip/state driver, then add geometry-level intersection classification and candidate-frame screenshots.
