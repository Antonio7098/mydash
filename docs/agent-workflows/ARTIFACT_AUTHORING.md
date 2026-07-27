# Artefact authoring guide

## Filesystem layout

```text
library/dashboards/<id>/
library/presentations/<id>/
library/concepts/<id>/
```

A typical artefact:

```text
<artefact>/
├── artifact.json
├── src/
│   ├── index.html
│   ├── main.js
│   └── styles.css
├── data/
├── assets/
├── recipes/
├── ui/
│   ├── primitives/
│   ├── components/
│   └── layouts/
└── theme/
```

Create only the directories the artefact needs.

Every artefact manifest uses schema version 2 and declares the `userId` from
`config/workspace.json`. The field controls CLI and Navigator scoping; it is
not authentication. The optional `owner` field remains descriptive metadata.

## Before creating

1. Run `mydash library list`.
2. Confirm the configured user with `mydash doctor --json`.
3. Inspect relevant themes, presets, layouts and components.
4. Inspect comparable artefacts for conventions, not for blind copying.
5. Inspect and profile source data.
6. Define the audience, decision or story.
7. Choose the smallest useful first version.

## UI selection

Use this priority:

1. Existing local resource owned by the artefact
2. Core resource whose contract genuinely fits
3. Relevant Collection resource
4. A new local resource

Do not create a shared resource merely because two files look similar.

## Local resource manifests

Local primitives, components, layouts, themes and assets must:

- declare `level: local`;
- declare the containing `ownerArtifact`;
- live under the containing artefact;
- use a directory name matching their ID;
- preserve semantic slot contracts.

## HTML

Use semantic, accessible HTML. Keep the entry point ordinary and inspectable.

The exporter supports local:

- HTML
- CSS and CSS imports
- JavaScript modules
- JSON and tabular data
- images, fonts and approved media

External load-time dependencies are not allowed in the final export.

## Data

Prefer deterministic extracted data over parsing Office files in browser code.

Store repeatable extraction instructions as recipes and provenance. Keep raw
source files only when their inclusion is intentional and safe.

## Validation sequence

```text
mydash library scan
mydash appearance resolve <id> --kind <kind>
mydash artifact validate <id> --kind <kind>
mydash validate --artifact <id> --kind <kind>
```

Open the server preview when visual confirmation is needed:

```text
/api/artifacts/<kind>/<id>/preview
```

## Completion

Export when the user needs a shareable file:

```text
mydash artifact export <id> --kind <kind>
```

Then checkpoint only the artefact and any intentionally changed shared files.
