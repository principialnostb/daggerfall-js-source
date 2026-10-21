# Upstream merge plan

Status: preparation plan for integrating the DFO Online developers' upstream into the customized `Dev` branch. This document is a workflow and acceptance contract; it does not claim that a merge has been performed or that every planned check is automated.

## Objective

Bring the current upstream implementation into the fork without losing the fork's character-rendering, character-editor, animation, resource-resolution, and Morrowind-derived asset work. Keep the base game usable when the optional Morrowind source is disabled, and keep updates reproducible and reversible.

The target is not a blind replacement of `Dev` with upstream. It is a controlled integration of upstream code plus an explicit revalidation of fork-specific changes against the new runtime.

## Repositories and branch roles

- Upstream developers: https://github.com/Lattymoy/daggerfall-js-source
- Customized fork: https://github.com/principialnostb/daggerfall-js-source
- Working fork branch: `Dev`
- Upstream target: `main` (confirm the intended branch and exact commit immediately before each integration).

Do not use a moving branch name as the historical identity of a completed merge. Record the exact upstream commit SHA and resulting fork commit SHA in every candidate checkpoint.

## Divergence snapshot

A comparison queried on 2026-10-21 reported:

- comparison: https://github.com/principialnostb/daggerfall-js-source/compare/Lattymoy:main...Dev
- common ancestor: `9ba797c7b1a0cd1be509a752c5809d24e8a2024a`
- upstream `main` at query time: `4bba28c6c76275392e34e84f620606a54e212ed7`
- fork ahead: 591 commits; fork behind: 835 commits; comparison status: diverged.

These are Git commit counts, not counts of independent features or merge conflicts. They can change as either branch advances and may include resource/documentation commits. Refresh the comparison before acting; do not use these figures as a substitute for inspecting the actual diff. The common ancestor is useful for orientation, not proof that every later change is independent.

## Non-negotiable architecture rules

1. **The fork remains a working game without the optional Morrowind source.** The base code and baseline resources must be sufficient to start and play the supported core paths with that source disabled.
2. **Morrowind is an independently selectable, updateable source.** A new upstream revision may change what is available from that source, but must not silently overwrite the pinned Vanilla baseline or unrelated resource-pack selections.
3. **A failure in an optional source is not automatically a base-build failure.** Test the base configuration separately. A Morrowind-specific test may fail while the base build remains releasable, provided the affected provider is disabled/blocked, a safe domain-local fallback exists, and no shared runtime code is broken.
4. **Shared runtime failures remain release blockers.** If an upstream code change breaks startup, parsing, rendering, source resolution, or a code path used with Morrowind disabled, it is a base-build regression—not an optional-pack issue.
5. **Fallback must be real and observable.** Disabling a source must restore the intended baseline for each affected domain, not leave stale files, cached objects, incompatible meshes, or rewritten profile selections. Diagnostics must distinguish requested source from effective fallback.
6. **Upstream integration and asset-source selection are separate operations.** Merging code must not automatically select new resources, change saved domain choices, or replace Vanilla.
7. **Only a tested fork build is distributed.** The launcher must deliver a published, identified fork release, not merge or execute arbitrary upstream code on the player's machine.

See [Modular asset-source architecture](../../MOD-SOURCE-ARCHITECTURE.md) for the source model and [Upstream compatibility and regression control](Upstream-Compatibility.md) for checkpoints, regression evidence, and test expectations.

## Merge procedure

### Phase A — establish a recoverable baseline

1. Confirm the working tree is clean, or explicitly record and preserve any uncommitted work.
2. Record the current `Dev` SHA and the last-known-good checkpoint.
3. Record the current upstream repository, branch, and exact target SHA.
4. Preserve the current working build and its resource manifest/profile so the pre-merge state can be reconstructed.
5. Refresh the comparison from the common ancestor and inspect changes by area: runtime/API contracts, renderer, animation, character editor, settings/persistence, resource loading, build/release tooling, tests, and documentation.

### Phase B — integrate on an isolated candidate branch

1. Create a dedicated integration branch from the current `Dev`; do not make the first attempt directly on the only working branch.
2. Bring in upstream changes in a way that preserves a recoverable baseline and makes conflicts reviewable. Given the large divergence, do not assume a single blind merge is safe; consider staged integration by coherent change groups where Git history and dependencies permit it.
3. Resolve conflicts by intent, not merely by choosing “ours” or “theirs.” For each conflict, record whether the upstream behavior, fork adaptation, or a deliberate combined implementation is retained.
4. Review deleted/renamed paths and changed runtime contracts, not only textual conflict markers. Git can merge cleanly while silently removing a fork-specific behavior.
5. Keep resource-source selection and the pinned Vanilla baseline independent from upstream's current files.
6. Do not combine unrelated feature work with the integration unless required to make the merge coherent. Keep any follow-up adaptation identifiable.

### Phase C — test both supported configurations

Run tests against the same candidate code revision and record the configuration for each run.

**Required baseline configuration: Morrowind source disabled**

- Build and startup succeed.
- Core gameplay and world loading work.
- Base resource resolution succeeds without files supplied only by the Morrowind source.
- Disabling Morrowind does not leave stale caches, missing references, invalid mesh/texture pairs, or changed unrelated selections.
- The source resolver reports the expected baseline provider and any fallback.
- Existing settings/profile data survives restart and migration.

**Optional configuration: Morrowind source enabled**

- Validate only the providers/domains actually integrated and declared available.
- Check animation groups, skeleton compatibility, character/body/race/sex variants, textures, equipment fit, editor preview, and affected first-/third-person paths.
- A failing optional provider is marked incompatible/blocked or falls back at the smallest safe domain. Do not silently make it the new default.
- Retest each affected provider after upstream changes to parsing, animation, geometry, texture loading, or the renderer.

**Repository and build checks**

- Run `npm run check` (currently lint, tests, and production build).
- Run targeted tests for every changed contract and add a regression test for each reproducible defect where practical.
- Run available browser/runtime probes and representative in-game visual checks. A green compile/build alone does not establish animation, appearance, or equipment compatibility.

If the baseline configuration fails, stop promotion. If only an optional provider fails and the baseline plus source isolation checks pass, block that provider and decide separately whether the candidate can ship without it.

### Phase D — record and promote

For each candidate, save:

- candidate ID/date;
- fork commit SHA and exact upstream SHA;
- resource-manifest identity and hashes for mutable/unversioned assets;
- selected source profile and whether Morrowind was enabled;
- command/environment and automated test results;
- runtime/visual checks and artifact links;
- known limitations and the decision: `candidate`, `validated`, `known-regression`, or `superseded`.

Promote only when the mandatory baseline checks pass and the enabled optional providers are either validated or explicitly blocked with a safe fallback. Preserve the previous known-good checkpoint. A failed candidate must not be published as validated.

## Regression triage

When a test fails after integration:

1. Determine whether the failure occurs with Morrowind disabled.
2. Reproduce it with the same fork revision, upstream revision, resource manifest, and profile.
3. Classify it as base/runtime regression, source-specific incompatibility, profile/migration regression, or an inconclusive/flaky test.
4. Record the symptom, expected/actual behavior, affected domain, exact SHAs, reproduction steps, and evidence in the canonical regression log.
5. If reproducible across commits, use `git bisect` with pinned resources/configuration to identify the first bad commit; verify the candidate commit and its parent.
6. Add a regression assertion or documented repeatable runtime check before closing the incident.

See [Upstream compatibility and regression control](Upstream-Compatibility.md) for the detailed checkpoint and incident record contract.

## Launcher update boundary

The launcher update should be downstream of integration and validation:

`upstream revision → integration candidate → checks → validated fork release → launcher delivery`

It must not be:

`upstream revision → automatic merge on player's machine`

The release identity should tie together the fork commit, upstream commit, and resource manifest where applicable. Verify integrity before activation and retain a recoverable prior build using the updater's supported mechanism. The exact update-manifest schema and integrity/rollback implementation must be verified against the actual updater before being described as implemented.

## Definition of ready

The upstream integration is ready for release only when:

- the exact source SHAs are recorded;
- the base build works with Morrowind disabled;
- failures in optional Morrowind providers are isolated and diagnosed;
- the relevant enabled providers pass compatibility/runtime checks or are explicitly blocked;
- source selections and the Vanilla snapshot are not silently changed;
- the project check command and targeted tests pass;
- the previous known-good build/checkpoint remains recoverable;
- the launcher points to the validated fork release, not to upstream's moving branch;
- the regression log and release notes describe known limitations honestly.

Until these checks are performed on a specific candidate, this document remains the merge plan—not evidence that the merge has already succeeded.
