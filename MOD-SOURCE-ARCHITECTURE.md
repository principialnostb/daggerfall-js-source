# Modular asset-source architecture

Status: architecture contract for the Morrowind asset integration work on `Dev`.
This document describes the selection model before expanding the settings UI. A file being present in `Morrowind Textures/` does not mean it is a runtime provider.

## Goals

- Select the source for the smallest useful asset domain independently: e.g. player walk from pack A, player run from pack B, hair geometry from pack C, face texture from pack D.
- Keep model geometry, texture, animation, and presentation assets as distinct domains.
- Make every UI choice traceable to a runtime consumer, a concrete provider, and an explicit fallback.
- Never silently enable a whole pack just because one of its files is selected.
- Preserve existing settings through migrations and preserve Vanilla as a reliable fallback.
- Expose compatibility and integration status honestly; do not render placeholder cards as functional controls.

## 1. Four separate concepts

### Pack
A named distribution of files and metadata, e.g. Simply Walking, Better Bodies, Intelligent Textures, Westly's Faces Refurbished. A pack is a source container, not a setting and not an activation unit.

### Provider
A pack's contribution to one or more domains. A provider declares exactly which assets/groups it can supply, which actors it applies to, and its compatibility constraints. One pack may provide many providers; a provider must not imply that every other part of the pack becomes active.

### Domain
The atomic choice visible to the user. Examples:
- `animation.player.walk`, `animation.player.run`
- `animation.npc.male.walk`, `animation.npc.female.walk`
- `appearance.head.geometry`, `appearance.face.texture`
- `appearance.hair.geometry`, `appearance.hair.texture`
- `body.geometry.female`, `body.geometry.male`
- `body.skin.female.darkelf`, `body.skin.male.nord`
- `clothing.geometry.pants`, `clothing.texture.pants`
- `armor.geometry.cuirass`, `armor.texture.cuirass`
- `world.texture.architecture`, `item.texture.weapon`, `ui.icon.item`

A domain should be split further only when the runtime can resolve and apply the smaller choice safely. For example, separate weapon-specific attack groups should be individual domains only after the resolver can reliably identify those groups and validate their tracks.

### Selection
A persisted user choice for one domain and optional actor context. It is not a pack-wide enabled flag. Selecting Vanilla for one domain must not reset other domain selections.

## 2. Provider manifest contract

Each provider needs stable IDs and structured metadata. Suggested shape:

```js
{
  id: 'axel.female-walk',
  packId: 'axel-sexy-walk-fixed',
  domains: ['animation.player.walk', 'animation.player.run'],
  assets: [
    { path: '.../female/WalkForward;.kf', group: 'WalkForward' },
    { path: '.../female/RunForward;.kf', group: 'RunForward' }
  ],
  appliesTo: { actor: ['player'], sex: ['female'] },
  compatibility: {
    skeleton: 'morrowind-biped',
    requiredGroups: ['WalkForward'],
    optionalGroups: ['RunForward']
  },
  status: 'integrated'
}
```

This is a contract illustration, not a claim that the manifest is already implemented. Real entries must use paths and group names verified against repository files and parser output.

Required fields:
- Stable `packId` and `providerId`; human-readable name is not an identifier.
- Exact asset path(s) and the domain(s) each asset can replace.
- Scope selectors: player/NPC, sex, race, equipment slot, item class, or other context actually used by the resolver.
- Replacement granularity: complete asset, animation group, texture path, or compatible overlay.
- Compatibility requirements: skeleton/rig, body family, UV layout, mesh/texture pairing, and dependencies.
- Runtime state: `integrated`, `present-unintegrated`, `blocked`, or `needs-validation`.
- A concise reason for blocked or unvalidated providers.
- License/redistribution status where relevant.

Do not infer coverage from a folder name. A KF can contain multiple groups; a texture pack can include files for unrelated domains; a mesh pack can require a plugin or a mutually exclusive compatibility patch.

## 3. Resolution pipeline

For a requested domain and actor/item context:

1. Read that domain's explicit saved selection.
2. Filter providers by exact domain coverage and actor/item context.
3. Reject providers that fail required compatibility checks; retain a diagnostic reason.
4. Resolve the chosen provider's exact asset/group.
5. If unavailable or invalid, fall back to the base game/archive source for that domain only.
6. Return both the resolved asset and a diagnostic record: requested provider, effective provider, reason for fallback, and compatibility result.

The resolver must be deterministic. There is no hidden "last package wins" rule for selectable model or animation sources. Ordered texture overlays are a separate, explicitly declared composition mode, not the general selection rule.

## 4. Conflict and layering rules

- **Exclusive domains:** one effective provider per domain and context. Changing `animation.player.walk` must not change `animation.player.run`.
- **Independent domains:** a pack may be selected in several domains, but each selection is stored separately.
- **Texture overlays:** use explicit ordered layers only where overlaying exact texture paths is intended. Report which provider won each path. Do not overlay UV/atlas-dependent textures onto an incompatible mesh.
- **Geometry + texture pairs:** a provider may declare a required companion texture or mesh. A mismatch is rejected or uses an explicitly compatible fallback; never silently pair arbitrary assets.
- **Body and clothing:** body geometry is the reference surface. Clothing/armor fitting is a separate compatibility capability; changing the body source must invalidate or re-check dependent garment-fit caches.
- **Animations:** each group is resolved separately. Validate skeleton bone names, group/text keys, loop markers, timing and root-motion assumptions. Pose blending is a transition mechanism, not an animation asset provider.
- **Mutually exclusive patches:** a patch set such as armor compatibility alternatives must declare conflicts and cannot be combined by folder-order accident.

## 5. Settings UI is a view of the domain registry

The hierarchy is navigation, not the data model:

- Animations → Movement → Walk / Run / Turn / Sneak / Idle
- Animations → Combat → Attack families / Block / Weapon transitions
- Appearance → Heads / Face textures / Hair geometry / Hair textures
- Bodies → Male / Female geometry / Skin textures / Hands and feet / Morphs
- Clothing → garment families → geometry / textures
- Armor → equipment slots → geometry / textures
- World and items → resource families → texture/model/icon domains

The exact nesting can be adjusted to the existing settings screen, but the IDs must remain stable and independent of labels.

A row is shown as a selector only if its domain has a real resolver consumer and at least one valid non-Vanilla provider. If no provider is integrated, show it as unavailable/in-development rather than a fake Vanilla selector. If Vanilla is selected, collapse provider-specific controls for that domain; do not hide or reset other domains.

Each option should expose:
- provider/pack name;
- exact scope it changes;
- status (active, unavailable, incompatible, requires restart if applicable);
- short compatibility/fallback explanation.

## 6. Persistence and migration

Use the existing settings persistence seam; do not introduce a second localStorage store.

Migrate existing keys into atomic domain selections once:
- `PlayerWalkSource` → player walk and, only where the old provider actually replaced it, player run.
- `NpcMaleWalk` → male NPC walk.
- `NpcFemaleWalk` → female NPC walk and only the groups that the old resolver actually replaced.
- legacy `FemaleWalk` → the equivalent female walk selection if still present.

Migration must reflect old runtime behavior, not the key's name. Do not copy one old value to every new domain. Preserve the original values until migration is validated; migration must be idempotent and versioned.

## 7. Test contract

Every integrated domain/provider needs tests for:
- provider catalog coverage and exact asset paths;
- selection persistence, migration and independent domain choices;
- actor/sex/race/item scope filtering;
- incompatibility rejection and domain-local Vanilla fallback;
- conflict resolution and texture overlay ordering where applicable;
- missing assets and parser errors;
- a real runtime consumer for each exposed selector.

Regression tests should prove that changing one domain does not change unrelated domains. Unit tests do not replace in-game checks for foot sliding, skin/UV seams, garment clipping, face orientation, and texture sharpness.

## 8. Repository inventory at design time

The `Dev` branch contains these top-level asset collections under `Morrowind Textures/`:
- Animation Blending
- Axel's Sexy Walk Fixed
- Better Bodies
- Better Clothes Retextured
- Better Morrowind Armor
- High Resolution Better Body Female Textures
- Intelligent Textures
- Morrowind Animation Overhaul
- Seamless DMRA body replacer
- Simply Walking
- Vurt's Better Clothes Retexture
- Westly's Faces Refurbished
- Westly's Fine Clothiers of Tamriel

This is a file inventory, not an activation list. Current code already integrates only selected slices of this collection. In particular, the checked-in MWSE Lua animation-blending plugin is not executed by the browser runtime; the JavaScript pose-blending implementation is a separate feature. Morrowind Animation Overhaul is not to be enabled by default and its redistribution/compatibility status must be resolved before reuse. The high-resolution female body texture pack and old Better Heads package are currently excluded from the bundled texture loader.

## 9. Recommended implementation order

1. Freeze the domain/provider IDs and manifest schema.
2. Inventory each pack into provider records, marking unknown or blocked coverage honestly.
3. Implement a pure resolver with compatibility filtering and domain-local Vanilla fallback.
4. Move existing walk selectors onto the resolver without changing current effective behavior; add migration tests.
5. Add domains only alongside their actual runtime consumers (body, face/hair, clothing/armor, then wider world textures).
6. Render nested UI directly from the registry and remove placeholder selector cards.
7. Validate each domain in-game before marking its provider `integrated`.

The first migration target should be animation walk/run because it already has working source files and a runtime consumer. Hair, faces, bodies, clothing, and armor should follow as separate domains; they must not be bundled into one generic "character appearance pack" switch.

## 10. Why deterministic source selection exists

The source-selection system is not merely a mod toggle UI. Its purpose is to make the build's effective assets explainable, reproducible, independently configurable, and safe to update.

Without explicit source ownership, a file can change because a package was copied over another directory, a glob happens to enumerate files in a different order, a new upstream patch changes a path, or a loader applies an implicit override. In that situation the visible settings no longer describe what the game actually uses. Users cannot reliably compare alternatives, preserve a preferred older result, or determine why a character looks different after an update.

The architecture must therefore guarantee these properties:

- **Explicit choice:** every selectable domain has a persisted source selection or a documented default.
- **Stable meaning:** a setting ID represents the same domain across UI label changes and releases.
- **Predictable resolution:** the same source catalog, profile, runtime context, and compatibility rules resolve to the same effective provider and asset.
- **Isolation:** changing one domain does not silently change unrelated domains.
- **Reproducibility:** a selected source points to a known version or immutable snapshot, not merely to a mutable folder called `latest`.
- **Explainability:** diagnostics can say what was requested, what was actually resolved, and why a fallback or rejection occurred.
- **Reversibility:** a user can return to a previous known-good source without reconstructing files manually.
- **Update safety:** incorporating upstream code does not automatically replace the user's selected asset sources or rewrite their pinned baseline.

Determinism applies to source resolution and configuration. It does not by itself guarantee pixel-identical output across different browsers, GPUs, renderer revisions, or graphics settings. Those are separate reproducibility dimensions and should be recorded where exact visual comparison requires them.

## 11. Source roles: Morrowind, Vanilla, and resource packs

These are source roles with distinct update policies. They are not three names for the same directory, and none should silently overwrite another.

### Morrowind — current upstream/developer implementation

In the relevant selector, **Morrowind** means the resource implementation supplied by the current DFO developer version incorporated into this build. The exact upstream repository/ref and incorporated commit must be recorded in source metadata. It is a tracked, updateable source.

- It may change when a newer upstream revision is integrated.
- A change in this source must not mutate Vanilla snapshots or third-party package contents.
- New or changed upstream resources should be discoverable and testable before being made the default for another source/domain.
- The label is a UI concept for this source role; it must not be used as a substitute for a commit, asset manifest, or content identity.

### Vanilla — pinned baseline of this customized build

**Vanilla means the known baseline chosen for this DFO build**, not “whatever the newest developers call vanilla” and not a live alias to the current upstream branch.

- It points to an immutable snapshot/manifest of the baseline assets used when the build's Vanilla source was established.
- It has a stable source ID and version identity. A display name alone is insufficient.
- Updating or merging upstream code must not refresh the snapshot implicitly.
- Replacing the baseline is a deliberate, separately reviewed operation that creates a new snapshot/version; it must not retroactively alter profiles pinned to the old snapshot.
- If a Vanilla asset is missing or invalid, the resolver must report the condition and apply the documented domain-local fallback. It must not silently substitute a newer upstream file while continuing to claim the effective source is Vanilla.

This distinction protects a user's preference for the current/default animation set even if a future upstream patch changes gait, timing, arm movement, or animation grouping.

### Resource packs — separately versioned alternatives

A resource pack is an installable collection, not a global priority rule. It may contribute to one or many domains, but only explicitly selected and compatible contributions become active.

- Each pack/provider has stable IDs, a version, an asset manifest, scope, compatibility metadata, and an integration/validation status.
- Selecting one contribution must not activate unrelated assets in the same pack.
- A pack update is a new version; it must not silently mutate a pinned version used by a saved profile.
- A pack can be selected for one domain while another domain uses Morrowind, Vanilla, or a different pack, subject to compatibility constraints.
- The UI must not offer an unavailable or unvalidated provider as though it were ready for use.

### These roles are not quality rankings

Morrowind is not automatically “best” because it is newest; Vanilla is not automatically “best” because it is the baseline; a mod is not automatically “best” because it is specialized. Source roles describe provenance and update policy, not quality. The user chooses among valid options after testing and comparison.

## 12. Upstream integration and update lifecycle

Upstream code integration and asset-source selection are related but separate operations.

**Integrating a developer revision** updates the code and source catalog available to the build. **Selecting an asset source** determines which compatible resource a domain actually uses. One operation must not implicitly perform the other.

Recommended lifecycle:

1. **Record the starting point.** Identify the currently integrated upstream revision and the current Vanilla snapshot/manifest before merging new upstream changes.
2. **Integrate upstream code into `Dev`.** Resolve code conflicts without replacing independent source-selection logic or deleting project-specific work.
3. **Inventory resource changes.** Compare the incoming revision with the previously integrated revision: added, changed, removed, renamed, or newly referenced assets and animation groups.
4. **Update the Morrowind source manifest.** Point it to the incorporated revision and describe the newly available resources. Do not edit the Vanilla manifest as a side effect.
5. **Validate changes.** Check parsing, required animation groups/tracks, skeleton assumptions, mesh/texture dependencies, actor/race/sex scope, and runtime consumers.
6. **Expose valid alternatives.** Make new resources selectable only when the resolver can actually load them. Mark incomplete entries as unintegrated, blocked, or requiring validation.
7. **Compare before promotion.** Test the upstream result against the pinned Vanilla source and relevant resource packs. A new source must not become the user's choice solely because it arrived in a patch.
8. **Preserve profile state.** Existing domain selections remain unchanged unless a migration is required to keep a removed/renamed provider valid. Any migration must be explicit, versioned, and diagnosable.
9. **Promote deliberately.** If the project owner wants the new result to become the new Vanilla baseline, create a new immutable snapshot/version as a separate reviewed action.
10. **Keep rollback possible.** Retain the prior source identity and asset manifest for as long as saved profiles or supported releases may refer to it.

A code merge can change animation logic, parsing, renderer behavior, or runtime contracts. Such changes may require compatibility work even when the asset selection remains pinned. Therefore, pinning resources is not a promise that every old asset will work with every future runtime; compatibility must be validated against the current code.

## 13. Version identity, snapshots, and content integrity

Mutable branch names such as `Dev`, `main`, or `latest` are useful for development but are not sufficient identities for reproducible asset sources.

A source/snapshot record should contain, where applicable:

- stable source/provider ID and schema version;
- human-readable label;
- source role: upstream, pinned baseline, or resource pack;
- upstream repository and incorporated commit/ref;
- pack release/version and manifest revision;
- exact relative asset paths and animation group names;
- content hashes for files or a canonical manifest hash;
- declared domains and runtime scope;
- compatibility constraints and dependencies;
- integration/validation status and diagnostic notes.

A snapshot is immutable once published. If any included file or mapping changes, create a new snapshot identity. Hashes help detect accidental mutation and distinguish two packages that use the same display name. They do not replace parsing or compatibility tests.

The implementation should not duplicate all files unnecessarily. Immutable manifests can reference content-addressed or otherwise version-pinned assets, and unchanged files can be shared safely, provided the referenced content cannot mutate under the old identity.

## 14. Profiles and independent domain selections

The persisted configuration is a set of selections by stable domain ID, optionally scoped by actor/context. It is not a single “active mod pack” flag.

Conceptually, a profile records:

- profile schema/version;
- domain ID → selected provider/source ID;
- pinned provider or snapshot version where reproducibility is required;
- intentional overlay order for domains that support overlays;
- compatibility exceptions only when explicitly supported;
- enough source-catalog identity to diagnose unavailable selections.

The profile must not rely solely on human-readable labels or filesystem enumeration order. If a provider is renamed, its stable ID should remain the same. If it is replaced incompatibly, create a new provider/version identity and migrate deliberately.

A user may, for example, select upstream walk animation, pinned Vanilla run animation, a specific body provider, and a separate texture provider. This combination is valid only if the declared compatibility checks pass. If a provider covers several groups as one inseparable set, the UI must present it at that set's actual replacement granularity rather than pretending each group can be chosen independently.

Changing a selection must affect only the addressed domain and any explicitly declared dependants. It must not reset unrelated domains, switch an entire pack on, or rewrite the profile's other selections.

## 15. Comparison and promotion workflow

The purpose of preserving multiple sources is to let the owner make informed choices as the project evolves, not to add complexity for its own sake.

For each changed or newly available provider, the system should make it possible to answer:

- What changed relative to the previous upstream revision or pinned baseline?
- Which domains and exact assets/groups are affected?
- Which races, sexes, actors, equipment states, and animation states are in scope?
- Is the provider integrated, compatible, and runtime-tested?
- What are the known limitations and fallback paths?
- Which profiles currently select the old or new provider?

Automated comparison can identify changed files, group names, metadata, and hashes. It cannot reliably determine subjective visual quality. Animation timing, foot sliding, arm pose, body/clothing clipping, texture seams, readability, and style consistency still require representative runtime tests and human review.

Promotion is an explicit decision: a provider can remain an optional alternative, become the selected provider for a particular domain, or be used as the source for a newly published Vanilla snapshot. These are distinct operations and must not be conflated.

## 16. Failure, fallback, and diagnostics

Fallback is scoped to the smallest domain that can be safely recovered.

- If a selected walk provider is missing, do not reset run, idle, bodies, or textures.
- If a mesh requires a particular UV/texture layout, do not silently combine it with an incompatible texture source.
- If a source references a missing animation group, report the requested group/provider and the effective fallback.
- If the saved provider is no longer available, preserve the user's intent in diagnostics and choose only the documented compatible fallback; do not silently rewrite the persisted selection to a different provider.
- If a fallback changes the effective source, the UI/debug record must distinguish the requested source from the effective source.

A successful fallback prevents a crash; it does not mean the requested provider is valid. The catalog must retain the incompatibility or missing-resource status so the issue can be fixed.

## 17. Acceptance criteria for deterministic source management

The design is not complete merely because the settings UI displays source names. At minimum, tests should demonstrate:

1. The same catalog, profile, context, and compatibility rules resolve to the same provider and asset.
2. Updating the upstream source does not change the Vanilla snapshot hash or contents.
3. Updating one provider/domain does not change unrelated domain selections.
4. A profile survives restart and code/resource updates without silent selection changes.
5. A missing or incompatible resource triggers a domain-local fallback and an actionable diagnostic.
6. Resource enumeration order cannot change the winner for an exclusive domain.
7. Explicit texture overlay order is stable and separately tested.
8. Migration from legacy settings is versioned, idempotent, and preserves old effective behavior where possible.
9. A UI selector corresponds to a real resolver consumer and a provider that is actually available.
10. A new Vanilla baseline can be published without overwriting the previous snapshot referenced by existing profiles.
11. Compatibility is validated for the runtime version, not inferred solely from matching file names.
12. Representative in-game checks cover player and NPC animation, first-/third-person paths where applicable, body/skin combinations, equipment, and the affected world/texture domains.

## Upstream updates and regression history

The source-selection architecture must be validated against the exact upstream revision and resource inputs used by a build. See [Upstream compatibility and regression control](bible/01-Overview/Upstream-Compatibility.md) for checkpoint records, merge validation, regression logs, `git bisect`, and the distinction between integrating upstream changes and distributing a tested fork build through the launcher. This workflow is a target contract until the corresponding checks and automation are implemented.

## 18. Scope and implementation status

This document defines the target architecture and acceptance contract. A rule described here is not proof that every domain, manifest field, snapshot mechanism, comparison screen, or test is already implemented.

Implementation status must be recorded per provider/domain and supported by code/tests. The rollout should preserve current effective behavior first, move existing working selectors to the resolver, and expand to additional domains only when their real runtime consumers and compatibility checks exist. Do not mark a source as integrated solely because its files are present in the repository.

