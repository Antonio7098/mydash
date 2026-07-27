# Artefacts

Artefacts are standalone HTML dashboards, presentations or concepts stored under `library/`.

```text
library/dashboards/<id>/artifact.json
library/presentations/<id>/artifact.json
library/concepts/<id>/artifact.json
```

Each artefact owns its HTML entry point, scripts, styles, data and Local UI resources. The filesystem is the source of truth; no registry update is required.

Use the CLI to inspect, validate and export:

```bash
npm run mydash -- artifact inspect <id> --kind dashboard
npm run mydash -- validate --artifact <id> --kind dashboard
npm run mydash -- artifact export <id> --kind dashboard
```

Exports are self-contained HTML files designed to work through `file://` without the server.
