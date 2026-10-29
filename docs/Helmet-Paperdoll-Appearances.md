# Helmet appearance selector

The local inventory card for a standard Helm (template 107) has two tabs below Info:

- **3D-модель** keeps the existing model selection and rig rebuild path.
- **2D-облик** offers Original plus all six classic helmet art variants (records 27–32), three cards per row with up/down arrows. Art uses the existing texture replacement/mod loader, gender/race archive and material dye.

The 2D choice changes the inventory icon and worn paperdoll layer together. An explicit choice takes priority over the optional model icon and model figure in the enhanced inventory; world models remain independent. Original removes this override and restores the item's original variant and normal inventory rendering preferences.

`helmetPaperdollLooks` stores cosmetic preferences by template/material, like the existing model appearance preferences. It does not mutate the item, its variant, stats or equipped slot. Artifacts and other templates are excluded. Switching tabs or rows does not change either appearance; tab/page survive inventory rerenders.

Implementation: `src/systems/helmetPaperdollLooks.js`, `src/ui/enhanced/helmetAppearancePicker.js`, art address resolution in `src/systems/item/itemTemplates.js` and `src/ui/paperDoll.js`, plus inventory integration/styles. Tests cover icon/layer agreement for all six variants across gender/race, independence from 3D preferences, Original/reset, material isolation and tab/pagination behavior.

Latest UI follow-ups: tabs reuse the stock act/primary skin; transparent margins are cropped and thumbnails cached. Design-specific scale corrections normalize the dome against crests/horns. The inventory retains the open card DOM/anchor/focus during appearance changes and updates its preview in place, skipping repeated placement. Other actions, a new selection or a layout resize invalidate that retention. Latest in-game visual acceptance remains pending. See Equipment-Claude-Handoff.md.
