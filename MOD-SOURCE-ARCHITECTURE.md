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
