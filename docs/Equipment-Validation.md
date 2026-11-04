# Equipment validation — 2026-10-29

Base of both branches before integration: c5cb50f84d. Baseline checks ran in an isolated detached worktree of that commit, not by changing the working source.

- npm run lint: passed over the full configured repository scope.
- npm run types: passed.
- Targeted functional/format/motion/appearance tests: **51 passed, 0 failed, 0 skipped**, using local ARENA2, wolf/iron/shield assets. Files: helmetPaperdollLooks, inventoryFace, shieldLooks, wolfCloak, mwwolfpeltmotion, paperdollloadidentity, paperdollart, characters/paperdoll, lookthumbs, qs3_hud.
- git diff --check: passed.
- Existing enhancedInventory.test.js: **90 passed / 10 failed**, exactly the same failed test names as baseline (**90 / 10**). Four source expectations were updated to the intentional inventory-only face composite and separate face/doll column; their original fallback/4x/compositor checks remain. Existing newline-sensitive/old source pins still fail. This is not a green full UI suite.
- Documentation gates (manifest, citeanchor, citedrift, mutantdrift, audit18_bible_docs, systems/ledger): last complete combined run **57 passed / 12 failed**. All 12 failed test names also fail on baseline (**57 / 12**). Failures include stale flags, documentation counts/indexes, old citations and old mutant targets. Updated UI module count 403 → 407; a follow-up U42 run now reaches an older Systems.md count mismatch (760 versus 769) instead. Other unrelated counts/anchors were not broadly rewritten.
- The initial gate attempt had child Git processes reject repository ownership. The comparison above was rerun with process-local GIT_CONFIG_COUNT / safe.directory, without changing global Git configuration.
- Full test suite, production build and CI: not run. No remote push or deployment is included.
- Latest inventory thumbnail sizing/tab styling and retained popup positioning: implementation checks passed, but a fresh in-game visual pass remains pending. Prior final wolf wind animation was explicitly accepted by the owner in the game. Blender previews are offline inspections only.

## Existing failed inventory checks

- U55: a variant change repaints, and closesWindow travels
- PX20b: a LOOT target opens its own frame alone - the pack is never built
- PX21a: mounts and the cart get their own place - the tab they fall into is not a home (PLUS11: a split cell of the worn grid; the strip plain Enhanced drew is gone with it)
- PX21d: the loot window's head is a centred stack, not a column header
- PX21c / WORLD-HOVER: the plaque names a pile without opening it, on the take's own pick
- PX28: looting just TAKES - no second popup over the frame you are reading
- PX22: the character region is its contentвЂ™s height, the dock scrolls, nothing overlaps
- PX24: wear, take off, use and stow all clear the pick on success; refusals keep the tip
- AUDIT INV2: the ghost is the item's own tile, and the ladder it rides is walked, not eyeballed
- PLUS10: the Info box is the classic Info popup's own text - the item's TEXT.RSC record with its macros filled

## Existing failed documentation gates

- AUDIT 18: every open-flags entry in Home.md quotes a line its file holds
- AUDIT 18: the open-flags list and the FLAGGED/INTERIM sites in src/ agree BOTH ways
- AUDIT 21: bible/Home.md open-flags list matches the regenerator
- U42: every arc page that counts its own modules counts them right
- AUDIT 39: the index names every record under bible/01-Overview/
- AUDIT 39r: the three re-read Testing.md rows agree with the suites they describe
- CD4: every citation Wave E moved names the line it means
- CD8: the ROAD-G G4 review's re-resolved cites name the lines they mean
- AUDIT 58 F5 ledger: the RE-INTEGRATED road system has its own section A row, and the removal row stops saying nothing ships
- CA1: every anchor in the docs names one line - its quote stands once in the file, outside the anchors (a quote that stops being true goes red in the change that made it so, at the doc and the quote)
- AUDIT QS6 F7: every mutant record still names source that is there - a record that cannot apply is a law nobody checks
- MUT-AIM: every mutant record names ONE site - mutate.mjs takes the first copy of `old`, so a copy added above a record takes its mutant without a word

Detailed transient runner JSON/logs are under scratch/equipment-validation in the source worktree (ignored). The local asset identity list is Equipment-Local-Assets.json: 70 files, paths/sizes/SHA-256 only. Generated proprietary/mod assets and unused generated concept art are not committed.
