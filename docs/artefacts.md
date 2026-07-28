# Artefacts

Artefacts are standalone HTML dashboards, presentations or concepts stored under `library/`.

```text
library/dashboards/<id>/artifact.json
library/presentations/<id>/artifact.json
library/concepts/<id>/artifact.json
```

Each artefact owns its HTML entry point, scripts, styles, data and Local UI resources. The filesystem is the source of truth; no registry update is required.

A typical artefact may contain:

```text
<artefact>/
├── artifact.json
├── src/
│   ├── index.html
│   ├── main.js
│   └── styles.css
├── data/
│   ├── source/<source-id>/
│   ├── generated/
│   └── refresh-status.json
├── assets/
├── recipes/
├── ui/
│   ├── primitives/
│   ├── components/
│   └── layouts/
└── theme/
```

Only create directories the artefact needs. Local resource manifests declare
`level: local` and the containing `ownerArtifact`, live beneath that artefact,
use a directory matching their ID and preserve semantic slot contracts.

Each schema-version-2 manifest declares a kebab-case `user`. Artifact-aware
CLI commands use the workspace `user` by default; pass `--all-users` for an
explicit workspace-wide operation. The Navigator shows only the configured
workspace user's artefacts. To see another user's content in the UI, change
`user` in `config/workspace.json` to that existing user, validate and reload.
Do not change artefact manifests just to switch the view. Reusable resources
remain global. User scoping is organisational and is not authentication.

Use the CLI to inspect, validate and export:

```bash
npm run mydash -- artifact inspect <id> --kind dashboard
npm run mydash -- validate --artifact <id> --kind dashboard
npm run mydash -- artifact export <id> --kind dashboard
```

Exports are self-contained HTML files designed to work through `file://` without the server.

The exporter supports local HTML, CSS and CSS imports, JavaScript modules, JSON
and tabular data, images, fonts and approved media. Final exports cannot have
external load-time dependencies. Prefer deterministic extracted data over
parsing Office files in browser code; keep repeatable extraction recipes and
provenance with the artefact.

Refreshable artefacts stage external inputs beneath `data/source/<source-id>/`
and publish deterministic browser-consumable outputs beneath `data/generated/`.
The raw current snapshot and history are workstation-local by default. See
[Data refresh](data-refresh.md).
