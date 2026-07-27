# MyDash

A local-first library, navigator and standalone export system for HTML dashboards, presentations and concepts.

```bash
npm install --no-audit --no-fund
npm start
```

Open `http://127.0.0.1:4173/`.

On Windows, `start-mydash.cmd` installs missing dependencies and starts the app. Git is recommended but not required for browsing, previewing or exporting.

## What it does

- discovers artefacts and UI resources from the filesystem;
- inspects CSV, JSON, Excel and PowerPoint source files;
- resolves themes, presets and Local/Collection/Core UI dependencies;
- provides a live navigator, visual library browser and dedicated viewer;
- supports preview-only, browser-personal and artefact-default appearance scopes;
- exports one self-contained HTML file that works through `file://`;
- validates significant changes before focused Git checkpoints.

## Verify

```bash
npm run check:source
npm run validate
npm test
npm run smoke
```

## Documentation

- [Getting started](docs/getting-started.md)
- [Artefacts](docs/artefacts.md)
- [UI library](docs/ui-library.md)
- [Appearance](docs/appearance.md)
- [Agent workflow](docs/agent-workflow.md)
- [Cloud workstation](docs/cloud-workstation.md)
- [Troubleshooting](docs/troubleshooting.md)

## Principles

```text
Skills provide judgement.
CLI provides capability.
Shared services provide correctness.
Navigator provides human interface.
Git provides persistence and recovery.
```

The numbered scripts under `scripts/` preserve the incremental construction path. Normal use begins with `npm install` and `npm start`.
