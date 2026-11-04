# Upstream compatibility and regression control

Status: process and acceptance contract for the `Dev` fork. This document describes the intended workflow; it does not claim that every check or automation described here already exists.

## Purpose

Keep the fork's Morrowind-derived assets and code adaptations working while incorporating changes from the upstream DFO Online repository and later distributing updates through the launcher. Every regression should be attributable to a reproducible combination of code revisions, resource inputs, configuration, and test evidence.

A successful download or update is not proof of compatibility. Updating files and validating the resulting build are separate operations.

## Three independently changing inputs

Every compatibility record must distinguish:

1. **Upstream DFO Online** — the exact upstream repository and commit incorporated or tested.
2. **Fork code** — the exact fork commit, including local character, animation, resource-resolution, editor, and rendering changes.
3. **External resources and configuration** — pack identity/version or immutable source revision, file hashes where no version exists, relevant resolver selections, skeleton/rig configuration, and settings that affect the result.

Record the source repository URL and commit SHA; do not use labels such as “latest” or branch names as historical identifiers. Branch names move. A fork commit alone is insufficient if resource packs or local settings can change independently.

## Compatibility checkpoint

Maintain a last-known-good checkpoint and preserve earlier checkpoints rather than overwriting them. Each checkpoint should record:

- checkpoint ID and date;
- fork commit SHA;
- upstream repository URL and incorporated upstream commit SHA;
- resource manifest: pack IDs, versions/revisions, and hashes for unversioned or locally modified inputs;
- relevant runtime/build version and dependency lockfile identity;
- resolver profile, skeleton/animation configuration, and any non-default test settings;
- commands and environment used for validation;
- test results, known limitations, and links to CI artifacts or screenshots;
- status: `candidate`, `validated`, `known-regression`, or `superseded`.

A checkpoint is “validated” only for the test coverage and configuration it records. It is not a universal guarantee for every machine, race, animation, or resource combination.

## Update and merge workflow

1. **Capture the baseline.** Before a large upstream merge, record the current fork SHA and the last-known-good test result. Ensure uncommitted work and local resource changes are accounted for.
2. **Identify the upstream target.** Record the exact upstream commit intended for integration. Do not merge an unpinned moving branch and later try to infer which revision was used.
3. **Integrate on a dedicated branch.** Keep the existing known-good `Dev` checkpoint recoverable. Resolve conflicts and keep upstream changes distinguishable from fork-specific adaptations where practical.
4. **Run static and automated checks.** At minimum, run the repository's established check command (`npm run check`, currently lint + test + build) and any relevant targeted tests. A green build alone does not establish visual or animation compatibility.
5. **Run targeted runtime checks.** Cover the changed surfaces: startup/world load, resource resolution and fallback, player and NPC animations, races/sexes and body variants, equipment fit, character editor, and first-/third-person paths where applicable. Add a regression test for each reproducible defect where practical.
6. **Compare with the baseline.** Save the tested fork SHA, upstream SHA, resource hashes, results, and artifacts together. If a check fails, do not promote the candidate to the known-good checkpoint.
7. **Promote deliberately.** Mark a candidate validated only after required automated checks and the relevant runtime checks pass. Keep the previous checkpoint available for comparison and rollback.

For small, isolated changes, the workflow can be proportionate: run the relevant targeted test plus the normal project check. Broad upstream merges, changes to skeletons/animation contracts, or changes to resource resolution require broader validation.

## Regression evidence and log

Keep a human-readable log at `docs/compatibility/REGRESSION-LOG.md` (or another single, documented canonical location). Each entry should include:

- symptom and first observed date;
- expected versus actual behaviour;
- last-known-good fork SHA and first-known-bad fork SHA, when known;
- upstream SHA before and after the merge;
- resource/configuration identities;
- reproduction steps and affected race, sex, animation, equipment slot, or scene;
- failing test name and CI run/artifact link;
- diagnosis, fix commit, and the test that prevents recurrence.

Do not record only “broken after update”. Preserve enough evidence to reproduce the state that failed.

## Finding the change that caused a regression

Use `git bisect` when a failure can be reproduced reliably and there is a known-good revision and a known-bad revision:

1. Pin the same resource set and configuration for all tested commits.
2. Confirm the test passes at the known-good commit and fails at the known-bad commit.
3. Run `git bisect` with a deterministic test or a repeatable manual procedure.
4. Record the first bad commit and verify the conclusion by testing its parent and the commit itself.
5. Add a regression test or a precise manual test record before closing the incident.

Binary search can narrow the culprit among many commits, but it is not proof when the test is flaky, the resources changed during the search, or commits depend on one another. For merge regressions, inspect both the merge commit and the upstream changes it introduced.

## Minimum automated test coverage

Grow this set with actual regressions; do not create superficial tests that pass without exercising the affected behaviour.

- repository checks: lint, tests, and production build;
- deterministic asset/provider resolution for a fixed catalog and profile;
- missing/incompatible asset fallback with an actionable diagnostic;
- required animation group / skeleton compatibility checks where supported;
- representative player and NPC animation paths, including run and arm visibility;
- body/race/sex combinations and equipment-fit checks where fixtures exist;
- editor preview and saved selection persistence/migration;
- startup and world-load smoke test;
- resource manifest/hash verification so an unexplained resource change cannot masquerade as a code regression.

Automated checks should emit the fork SHA, upstream SHA, and resource-manifest identity in their output or attached metadata. Keep screenshots and rendered comparisons as artifacts for visual regressions; do not treat them as a substitute for assertions on behaviour.

## Launcher auto-updates: separate delivery from integration

The launcher should distribute a **tested build of this fork**, not merge or execute arbitrary upstream source code on the player's machine.

Recommended flow:

1. Upstream changes are fetched and integrated by the maintainer in a controlled development/CI workflow.
2. CI builds a candidate fork revision and runs the required checks.
3. A validated candidate is published as a release/update manifest containing an immutable build identifier, fork commit SHA, upstream commit SHA, and release notes. Include resource-manifest identity if resources are shipped or can vary independently.
4. The launcher checks for and downloads the published fork update using the existing updater's trusted release mechanism.
5. The update is staged and verified before activation; retain a recoverable previous build or use the existing updater's rollback-safe strategy where supported.
6. After installation, diagnostics should make the installed fork version/build ID visible. A failed download or integrity check must not be reported as a successful update.

Do not let a launcher's “latest” pointer stand in for provenance: it is a discovery mechanism, not a reproducible version identifier. Do not silently change the upstream base or bundled mod resources independently of the tested build.

The exact manifest schema, signature/integrity verification, staging, and rollback mechanics must be designed against the updater implementation before they are treated as implemented requirements.

## Rollback and incident handling

When a new candidate fails:

- stop promotion and publishing of that candidate;
- preserve its commit SHAs, resource manifest, failing test, and logs;
- return development/testing to the last-known-good checkpoint or revert the specific change;
- keep the failed checkpoint in the log so the same revision is not accidentally reintroduced as “new”;
- verify the fix against the failing test and the normal project checks.

Rollback is not complete merely because the old code is restored if resource packs, generated assets, configuration migrations, or saved settings also changed. Record and restore those inputs as needed.

## Acceptance criteria

This system is operational only when:

1. Every candidate build can be tied to an exact fork SHA and exact upstream SHA.
2. Relevant resource inputs are versioned or hash-recorded.
3. A last-known-good checkpoint can be reconstructed.
4. CI results and runtime evidence are associated with the exact candidate.
5. A reproducible regression can be narrowed to a change and retained as a test or documented manual check.
6. A failed candidate is not promoted or distributed as validated.
7. Launcher delivery uses a tested fork release and exposes enough version information to diagnose the installed build.
8. The documentation clearly distinguishes implemented automation from planned workflow.

Until these criteria are implemented and verified, this document is a process contract and implementation plan, not a claim that automated compatibility tracking, rollback, or upstream synchronization already exists.

## Optional Morrowind source and base-build isolation

The base game must remain usable when the optional Morrowind source is disabled. This is a release invariant, not merely a convenience setting.

Test two configurations independently:

- **Baseline (Morrowind disabled):** startup, core gameplay, world loading, resource resolution, and supported character paths must work without assets supplied only by the Morrowind source.
- **Optional source (Morrowind enabled):** validate each integrated provider/domain against the current runtime. A provider that fails compatibility checks must be blocked or fall back at the smallest safe domain, with a diagnostic.

Classify a failure before treating it as a release blocker:

- If it also occurs with Morrowind disabled, or affects shared code such as startup, parsing, rendering, persistence, or resource resolution, treat it as a base/runtime regression.
- If it is isolated to an optional Morrowind provider and the baseline configuration passes, block that provider and retain the baseline release path, provided the fallback is verified and no stale assets, caches, or settings remain.
- If disabling the source leaves unresolved references or broken shared code, the source is not properly isolated; the failure is not safe to dismiss as optional.

Disabling Morrowind must not silently rewrite saved domain selections, update the pinned Vanilla snapshot, or change unrelated providers. Diagnostics should distinguish the requested source from the effective provider after fallback. A successful fallback is evidence of containment, not evidence that the incompatible provider itself is valid.

The detailed integration sequence, current divergence snapshot, two-configuration test gate, and release criteria are in [Upstream merge plan](Upstream-Merge-Plan.md). The documented commit counts are time-specific; refresh the comparison and record exact SHAs before every actual integration.

