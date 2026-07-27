# Artefact and design library

The filesystem is the source of truth.

## Artefacts

- `dashboards/`
- `presentations/`
- `concepts/`

Each artefact owns its content, data and any genuinely local UI.

## Shared UI

Shared UI is divided into:

```text
Primitives → Components → Layouts
```

Each category has:

- `core/` — broadly trusted, stable implementations;
- `collections/` — narrower reusable families.

New UI normally starts locally inside an artefact. It moves to a collection after demonstrated reuse and reaches Core only after its contract and usefulness have stabilised.

## Appearance

- `themes/` define visual tokens;
- `presets/` map layouts, components and primitives;
- `assets/` stores approved logos, icons, images, illustrations and fonts.
