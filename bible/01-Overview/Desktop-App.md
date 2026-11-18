# Desktop App

The desktop app is the same game outside the browser: an Electron shell (`app/`) that loads the same `dist/` the
website deploys, with no fork of the game code. It adds saves as real files, ARENA2 read straight from the player's
folder, a launcher, and updates that fetch only the files that changed. Players download it from the landing page's
installer links; it opens on the launcher, and Play starts the game.

## How it works

### The shell

- **Storage.** `src/systems/appStorage.js` `appStorage` answers the shell's file store in the app, localStorage in a
  browser. `app/lib/fileStorage.cjs` keeps localStorage's words over files under userData:
  `Saves/SAVE<n>/SaveData.txt`, `SaveInfo.txt` and `Screenshot.jpg` for a slot, `Prefs/<key>` for the rest. Writes go
  to a temp file, then rename.
- **userData** is `<appData>/Daggerfall JavaScript` whatever the product is called, so a rename never strands saves,
  prefs or `config.json` (`DAGGER_USER_DATA` moves it). Updates never touch it.
- **The protocol.** `app/main.cjs` `handleDagger` serves `dagger://game` from `dist/` (inside `app.asar` when
  packaged) and answers `./arena2/*` from the player's folder, case-insensitively, with the `BOOKS/` fallback. With no
  folder the requests fail and the game's own in-page picker takes over. `dagger://launcher` is a separate origin.
  The scheme has `codeCache: true`, so V8 keeps compiled scripts between launches.
- **Fences.** One instance runs per userData. Navigation stays on `dagger://`; http(s) opens in the system browser.
- **Leaving.** Electron draws no "Leave site?" box, so when the player closes, quits or reloads while the game's
  unload guard holds, the shell asks **Leave / Stay** itself, Stay the default (`app/lib/shellDialogs.cjs`).
- **The File menu** has Open Saves Folder, Locate ARENA2 Folder, the update checks and Restart to Update. A folder
  pick clears the game's stored in-page ARENA2 at the next boot (`arena2IngestClear`), so it never shadows the folder.

Music packs, texture packs and Morrowind data stay in IndexedDB, which Chromium keeps under userData.

### Running and packaging

```
npm run build          # at the repo root - the shell loads dist/
cd app && npm install
npm start              # the app
npm run dist           # installers into app/release/
```

`DAGGER_DEV_URL` points the shell at a Vite server; `DAGGER_SKIP_ARENA2_PROMPT` and `DAGGER_NO_UPDATE_CHECK` serve
headless runs. `tools/appShellProbe.mjs` drives the real shell under xvfb; `DAGGER_SHELL_EXE` points it at a packaged
build.

### Releases

`.github/workflows/release-desktop.yml` cuts a release on every push to main, a pushed `app-v*` tag, or a dispatch
with `release_tag`. A dispatch with no tag builds artifacts only, with `publish: null` and no update metadata.

1. `version` resolves one number for every job: on main `app-v<MAJOR.MINOR>.<commits>`, MAJOR.MINOR from
   `app/package.json` and the patch from `git rev-list --count HEAD`. It also derives the update number and shell id.
2. `gate` runs `.github/workflows/verify.yml` on the release's commit.
3. `build` runs on Ubuntu, Windows and macOS with a 4 GB Node heap. Each stamps the version, indexes the bundled
   game (`scripts/desktopRelease.mjs seed`) and runs electron-builder. The Ubuntu leg packs the game (`pack`).
4. `publish` runs only when every leg passed. It adds each download under its pre-rename name (`alias`) and checks
   the set is whole (`check`). `delta` fails it when the game update would re-download over half the game. It writes
   the notes (`notes`), refuses an already published tag, and stages a draft at the built commit. One PATCH publishes
   it. `shouldMarkLatest` keeps a re-cut of an older build from taking `latest`.

The downloads keep fixed names (`app/lib/downloads.cjs` `DOWNLOAD_FILES`): `DFO-Online-win-x64-setup.exe`,
`DFO-Online-win-x64-portable.exe`, `DFO-Online-mac-arm64.dmg`, `DFO-Online-linux-x86_64.AppImage`. So
`releases/latest/download/<name>` always serves the newest, and the landing page links them directly. Builds are
unsigned; the macOS app is signed ad hoc (`app/afterPack.cjs`).

**Update numbers.** The player sees `Update MAJOR.MINOR.PATCH`, not the installer's version.
`scripts/updateLine.mjs` `UPDATE_LINE` holds the line. `scripts/updateNumber.mjs` makes each first-parent commit on
main since that line changed the next update. The release is named `Update <n>`; its tag keeps the installer's number,
which the updater compares. `scripts/buildTag.mjs` stamps it into `src/buildTag.js` `UPDATE`.

**Notes.** A pull request carries its player notes in its description under `## Patch notes: <title>`
(`.github/pull_request_template.md`). `notes` reads each pull request merged since the previous `app-v` tag, opened
by the owner, a member or a collaborator (`NOTES_AUTHORS`). A read that fails publishes nothing.
`.github/workflows/release-notes.yml` runs when a merged pull request's description is edited, finds the first
release whose tag holds the merge, and rewrites that release's notes (`renotes`). GitHub's generated list stays below.
No patch-notes file may be committed (`PATCH_NOTES_PATH_RE`).

**The release host.** Installed copies read their releases from `Lattymoy/daggerfall-js-source` by name
(`app/main.cjs` `RELEASES_LATEST_API`, `app/lib/downloads.cjs` `RELEASES_URL`). That repository must stay public.
Unset, `vars.RELEASE_REPO` is the repository the workflow runs in. Set to another, `publish` stages there with
`secrets.RELEASE_TOKEN`, a token for that repository alone. Its tag goes on the host's default branch, because the
built commit is not there. The same tag is cut here at the built commit, so `notes` and `renotes` still find it.

**The public copy.** `.github/workflows/public-copy.yml` fills a new public repository by hand, and its Actions must
be off. `seed` pushes main's tree as one commit with no history and no tags. It leaves out the bible, every
`CLAUDE.md`, `.claude/` and all Markdown but `vendor/`, `SECURITY.md`, `SUPPORT.md` and `public/sfx/SOURCES.md`. Its
README is `.github/public-copy/README.md`. It goes on top of GitHub's creation commit (a licence, README or
`.gitignore`) if the repository has one, and on nothing else. A second seed is refused. `tags` copies releases whole,
and the newest takes `latest`.

## STE-NOTES

Patch notes are written in ASD-STE100 Simplified Technical English (the owner). Players read them twice, in the
release and in the launcher's news, and many read English as a second language.

- **Words.** STE's approved words in their approved meanings and parts of speech. The game's own names are technical
  names: write a control or an item as the game shows it, in **bold**. One thing has one name.
- **Verbs.** The simple present, simple past and future. A past participle only as an adjective. No -ing verb forms
  outside a technical name. No helping verb that makes a complex verb ("has been", "have fixed"). The active voice.
- **Sentences.** One topic. 25 words at most. An instruction is 20 words at most, in the imperative, its condition
  first. An article or "this" before a noun where it fits. No noun cluster past three words.
- **Paragraphs.** One topic, six sentences at most. A list for steps or choices, after a colon.
- **Punctuation.** No semicolons. No contractions.

`scripts/steNotes.mjs` checks what a machine can: sentence and paragraph length, semicolons, -ing forms,
contractions and complex verbs. It reads the notes as the release does (`patchNotesOf`). A hyphenated word, a number
with its unit, and a name in bold, code or quotes count as one word. A lowercase word ending in -ing counts as a verb
unless it is on `NOT_A_VERB`. `.github/workflows/ste-notes.yml` runs it when a pull request opens, its description
changes, or it gets a push. A description with no notes passes. Run `node scripts/steNotes.mjs <file>` on a draft
first. A clean run is not proof: the dictionary, the topics, the articles and the voice are the writer's.

### Updating a copy

Every check runs inside two gates: the Check for Updates Automatically switch (`updateCheck` in `config.json`) and
`DAGGER_NO_UPDATE_CHECK`. The launcher checks at launch, and a running copy checks again every `RECHECK_MS`
(`app/lib/launcherState.cjs`).

- **The game's files** come first, on every platform (`app/main.cjs` `askGame`). A release carries the game as
  `DFO-Online-game.pack` (each file of `dist/` compressed on its own, in path order) and `DFO-Online-game.json.gz`
  (each file's path, size, sha256 and place in the pack, plus the version and the shell id). `app/lib/gameChannel.cjs`
  `planUpdate` keeps what the copy holds and fetches the rest by HTTP Range, one range a request, four at a time.
  Every file is hashed before it is written. `gameFetch` reaches only this repository's release downloads.
- **On disk** (`app/lib/gameStore.cjs`), a version lives in `<userData>/Game/v<version>/`: its index and only the files
  that differ from the installer's seed. It is staged, made whole when `index.json` lands, then put on trial. The
  game's first boot proves it, and the version before it is deleted. A boot that fails rolls back.
- **When it plays.** With the launcher open it plays at once. With the game running it plays at the next start.
- **The shell itself** updates only by its installer, when a release changes the shell id or the channel fails.
  `app/lib/autoUpdate.cjs` `updateTransport`: an installed NSIS copy and a running AppImage use electron-updater, which
  installs at quit (no prerelease, no downgrade). Every other copy uses the notice.
- **Self-swap.** On the notice transport the macOS app and the portable exe download their own file, check the
  release's size and sha256, and swap it in after quit (`app/lib/selfSwap.cjs` `swapPlan`). From a disk image, a
  translocated copy or a folder it cannot write, the notice's Download remains.
- **In the game.** `src/systems/shellUpdates.js` says a ready update on the HUD. With the player's auto-update switch
  on (`autoUpdates` in `src/systems/uiPrefs.js`, off by default), `src/ui/updateScreen.js` warns for a minute, saves,
  and the shell restarts onto the update (`restartForUpdate`). File > Restart to Update applies it on request
  (`restartToUpdate`): a game version on the page's next load, a shell update by its installer or swap.

### The launcher

`app/launcher/` is the app's first window on every launch, drawn from `app/lib/launcherState.cjs`. It is sandboxed
behind a small bridge (`app/launcherPreload.cjs`), with a CSP that allows nothing remote or inline. Every word,
GitHub's notes included, reaches the page as text.

- **The window** is 1120 by 680 where the screen has room, centred on the display under the pointer. On a smaller
  work area it takes the room there is, down to 900 by 520 (`app/lib/launcherWindow.cjs` `launcherBounds`), so Play
  stays above the taskbar on a 1366 by 768 laptop at 125%. A short window wears a compact layout.
- **The night** behind the page is drawn in pixels by `app/launcher/scene.js`: a castle on a crag against Masser, with
  Secunda, a lake, mist, pines and fireflies, from one seed and in the Enhanced skin's colours. No picture of the
  game's art ships. It holds still while the window is hidden, once Play starts the game, and for a player who asks for
  less motion. The icons are bitmaps in `app/launcher/icons.js`.
- **The pointer** is the game's own gauntlet (`src/ui/plus/gauntletArt.js`), its finger drawn in while a button is
  held. The page takes no `data:` images, so the shell reads that one file and serves its frames as PNGs
  (`app/lib/launcherPointer.cjs`). Under it, `app/launcher/pointer.js` draws a red glow that trails embers as it moves
  and throws sparks at a click. It draws nothing while the pointer rests, and holds still when the night does.
- **The headline**, left: the newest release's title and first point, and whether it is new since the player last
  played or in the next update.
- **Patch notes**, right: the latest releases' notes (at most `NEWS_MAX`), kept in `news.json`. Releases since the
  player last pressed Play (`lastPlayed`) are marked NEW, one on its way UPDATE. Until the game has files, the first
  run's card takes the place of both.
- **The dock and Play.** The status line's mark shows the view's `tone`. A download shows its size, and its speed and
  time left, which the page works out from the bytes. Play waits only while something is decided for the player: an
  update check (at most `CHECK_TIMEOUT_MS`), a download or install, or no game files. An installer update installs
  before play and reopens the app; **Play without updating** skips it. A download that stalls for
  `DOWNLOAD_STALL_MS`, or an install that never starts within `INSTALL_GIVEUP_MS`, frees Play.
- **Over the page.** Play asks where to play in a window: online or offline (the game's own menu asks which), or the
  Private server. **Settings** is a drawer from the right: Game files (Change folder), Saves (Open saves folder),
  Updates (the check switch, Reinstall), and on Windows Graphics (Use Vulkan). Whatever is over the page makes the
  regions under it `inert` (`data-behind`), so neither the keys nor a pad reach behind it. The status line is not
  among them, so it is still read aloud. Escape, or B on a pad, closes one at a time, and the game starting closes
  them all.
- **A private server on.** Its window has its own Play beside Stop, since the dock's is under it, and Escape closes
  it outright: "Online or offline" would load the game on the server. The dock says a server is on, and opens the
  window again.
- **What it costs.** No backdrop blur anywhere on the page, so it draws the same on Vulkan. With VSync off the app
  lifts Chromium's frame limit for the launcher too (`app/lib/frameRate.cjs`), so every endless animation moves in
  `steps()` on a property the page paints, never opacity or transform, which the compositor runs every frame. All of
  them pause while the game starts. The trail draws at most 60 frames a second and leaves the page at rest, and the
  night draws 30.
- **`--play`** goes straight into the game (`runDirect`), for game managers and Steam shortcuts. With no game files, or
  a saved folder that is not whole, the launcher opens instead.
- **A controller** drives it: `app/launcher/pad.js` runs the game's own `src/ui/menu/menuPad.js` over the page.

### Game files

Every folder, saved or picked, must hold `REQUIRED_ARENA2` (`app/lib/arena2Detect.cjs`), the same seven files
`src/scenes/dataSource.js` needs. On a first run the launcher searches where Daggerfall is installed: Daggerfall
Unity's settings.ini, every Steam library holding app 1812390, GOG Galaxy and GOG's default folders, and folders where
`DaggerfallGameFiles.zip` is unpacked. It offers what it finds and never takes it silently. With nothing found it says
where to get the game and keeps the in-page picker one click away. Every look at the disk runs in a utility process
(`app/lib/arena2Probe.cjs`) under a deadline, killed when done.

### Saves between the website and the app

`src/systems/save/saveTransfer.js` moves saves between the browser's store and the app's files. Export writes every
slot as one zip in the app's own `Saves/SAVE<n>/` layout. Import takes that zip or a picked folder. A slot never
overwrites another, and a save the store already holds is skipped. The doors are the enhanced menu's Load pane
("Move saves").

### Graphics and performance

All Chromium switches go on before the app is ready.

- **VSync.** With the saved `Video/VSync` off, `app/lib/frameRate.cjs` adds `disable-gpu-vsync` and
  `disable-frame-rate-limit`, and the page paces its own frames (`src/systems/frameCap.js`). The setting takes effect
  at the next start.
- **GPU.** `force_high_performance_gpu` picks the discrete GPU. `js-flags --max-semi-space-size=32` widens V8's young
  generation.
- **Shader cache.** `gpu-disk-cache-size-kb` raises Chromium's program cache to 128 MiB (`GPU_CACHE_KB`).
  `app/lib/gpuCacheTurn.cjs` deletes the GPU caches when the shell's or the game's version changes.
- **Vulkan** (Windows, opt-in): `graphicsBackend` on the `dagger.ui.v1` shelf, set in Settings or the launcher.
  `app/lib/graphicsBackend.cjs` `backendLaunch` adds `use-gl=angle`, `use-angle=vulkan` and `disable-gpu-sandbox`;
  `holdsVSync` keeps VSync on. `watchBackend` fails the launch on a software renderer, a page with no WebGL2 on
  Vulkan, no page report in `PAGE_REPORT_TIMEOUT_MS`, or the GPU process lost in the first minute. The failure is
  recorded by GPU and driver, and the app relaunches on the default.
- **Blank windows.** On a Vulkan launch the player is asked whether they can see the launcher and then the game, in a
  box Windows draws. Go back counts as a failure. No answer in `CONFIRM_TIMEOUT_MS` holds that launch on the default.
  A Keep over the game is recorded for that GPU, driver and Chromium.
- **Backdrop blur** is off when the page's renderer names Vulkan (`src/ui/vulkanBackdrop.js` `guardBackdrops`).
- **A hidden boot.** In the app, a hidden page's build yields an event-loop turn, not a frame
  (`src/systems/buildBreather.js` `breathFrame`), so the boot runs behind another window.
- **Crash trail.** `src/render/gpuTrail.js` samples the game context's live GPU objects and frame stats every 30 s.
  `app/lib/rendererGone.cjs` writes the last 20 into `crash.log` when the page or the GPU process stops.

## Rules

- Every push to main cuts a release; the version is derived, never bumped by hand (Mac).
- A release is published whole, once, only when every leg passed, and is never re-cut in place.
- Patch notes live in the pull request's description, never in a file. Editing a merged description rewrites its
  release's notes (Mac).
- Every merge to main is a numbered update, starting from 0.0.1 (Mac).
- Patch notes are written in STE (the owner, STE-NOTES above).
- Patch notes never give the loot gate's numbers (LOOT-GATE, Dudey).
- Players never install each release by hand: the game updates by the per-file channel (Mac).
- The macOS app and the portable exe update themselves where they can (the owner).
- Forced updates are off by default; the player turns them on (the owner).
- The launcher opens on every launch and waits for Play (Mac).
- Saves move between the website and the app (Mac).
- VSync off lets the app run above the screen's refresh (Mac).
- DevTools stay in the installed app (Mac). `test/tooling/anticheat_devtools.test.js` holds this.
- ARENA2 never enters the repo, the build or the installer. The shell reads the player's folder.
- The appId `dev.daggerfalljs.app` never changes, or installed copies stop seeing updates.
- The repository named `Lattymoy/daggerfall-js-source` stays public, keeps that name and is never archived. Installed
  copies ask it for every update, and accept downloads from it alone.

## Daggerfall Unity

- **Saves.** DFU's `SaveLoadManager` writes `Saves/SAVE<n>/` under `Application.persistentDataPath`. The app keeps the
  same layout under userData, so a save folder reads the same in both.
- **Game files.** The launcher reads DFU's own `settings.ini` (`[Daggerfall] MyDaggerfallPath`) as one place to look.
- **VSync.** DFU's `StartGameBehaviour.cs` waits for the screen with VSync on and lets `targetFrameRate` hold frames
  with it off. The app follows that, but Chromium takes the switch only at launch, so a change applies at the next
  start.
- DFU has no launcher or updater. Both are ours.

## Code and tests

- `app/main.cjs` - the shell: protocol, windows, menus, update wiring; `app/preload.cjs`, `app/launcherPreload.cjs` -
  the bridges; `app/lib/` - one pure module per concern, named above
- `scripts/desktopRelease.mjs`, `scripts/steNotes.mjs`, `scripts/updateNumber.mjs` - release, notes, update number
- `test/systems/save/filestorage.test.js`, `test/systems/save/savetransfer.test.js` - the stores
- `test/tooling/rel4_release.test.js`, `test/tooling/rel7_renotes.test.js`, `test/tooling/rel8_updates.test.js`,
  `test/tooling/ste_notes.test.js`, `test/tooling/audit_install2.test.js` - releases and notes
- `.github/workflows/public-copy.yml`, `test/tooling/releasehost.test.js` - the release host and the public copy
- `test/tooling/updatecheck.test.js`, `test/tooling/autoupdate.test.js`, `test/tooling/selfswap.test.js`,
  `test/tooling/da13_gamechannel.test.js` - updating
- `test/tooling/da10_launcher.test.js`, `test/tooling/da12_directplay.test.js`, `test/tooling/da9_arena2detect.test.js`
  - the launcher, `--play`, detection; `test/tooling/launcher_face.test.js` - its window, scene, pointer, headline and layers
- `test/tooling/gpubackend.test.js`, `test/tooling/shaderease_cacheturn.test.js`, `test/tooling/boot_hidden.test.js`,
  `test/render/gputrail.test.js` - graphics and boot

## Open

- Not seen on real hardware: a silent NSIS install and reopen on Windows, an AppImage swap, the macOS app.
- Vulkan: the blank-window box over a truly blank window and the backdrop flip are not checked on a Windows GPU.
- `LEGACY_DOWNLOAD_FILES` copies go once no copy older than the rename is left to ask for them.

## 13.11 test channel

The Windows test setup serves releases tagged `dfo-1311-v13.11.<patch>` in the private test repository. Setup passes a read credential to the launcher, which stores it with Windows encryption. The launcher uses the
`DFO 13.11-test-medium` profile and chooses the newest published version of this channel. It plays the installed
version when GitHub is unreachable. Daggerfall Unity distributes whole archives through its
[installation page](https://github.com/Interkarma/daggerfall-unity/wiki/Installing-Daggerfall-Unity-Cross-Platform).
This channel uses a bundled seed and the game's existing per-file update store.

`tools/prepareTestUpdate.mjs` packages the shell and manifests from the test build stage. A full installation
downloads the game archive in parts. When setup finds the issued client's archive, it checks the archive's hash and
reuses it as the seed. Setup prepares the new client beside the selected folder before swapping it in. The previous
folder remains available as a backup. Neither setup path moves the player's profile.

### Public test client and private EMC

DFO Test Build Setup installs or checks the existing public client. In the launcher, developers sign in through GitHub and testers enter an invitation. The launcher verifies access before checking releases. Play requires valid access and a verified EMC package. Public release files are directly accessible.

Public release builds exclude the optional Mods resource globs in the client and worker builds. Setup verifies the clean game seed before reusing it.

Developers with source repository write access maintain invitations through the Test channel panel. Revoking an invitation replaces its public hash and retains the tester label. Git Credential Manager handles developer sign-in and the launcher encrypts the credential with Windows storage.

Developers with read access to the private EMC release repository automatically install missing EMC through their GitHub sign-in. The EMC package tab copies a temporary offer for testers. Testers paste the offer into the launcher once. The launcher verifies the size and SHA-256 and serves the installed files to EMC at game launch.
The public desktop entry `src/testBuildEntry.js` `startTestBuild` reads the archive index before the game's loader modules build their file lists. The archive is stored in the test profile. Game-only patches keep the existing launcher and archive. GitHub controls the offer lifetime. Anyone who receives it can use the URL while it is valid.

Use `tools/prepareEmcOffer.mjs` with a staged directory containing only approved EMC files under `Mods/`.
Upload its output to the private test release repository. One archive must be smaller than the GitHub asset limit.
