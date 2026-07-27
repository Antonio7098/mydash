# MyDash

A local-first library, preview environment and export system for standalone HTML dashboards, presentations and concepts.

MyDash uses the repository filesystem as its source of truth. It discovers artefacts and shared UI resources automatically, resolves appearance dependencies, previews them through a lightweight Express navigator and exports each artefact as one self-contained HTML file.

## What is included

- Plain Node.js CLI and Express server
- Filesystem, CSV/JSON, Excel and PowerPoint inspection utilities
- Filesystem-discovered artefact and UI library
- Local → Collection → Core component lifecycle
- Theme, preset and advanced appearance resolution
- Standalone HTML export and validation
- Focused Git checkpoints with impact analysis
- Browser navigator, live gallery and dedicated artefact viewer
- Preview-only, browser-personal and artefact-default appearance scopes
- Agent skills for dashboards, presentations, concepts, spreadsheets and components
- Reference AI use-case governance dashboard

## Requirements

- Node.js 20 or later
- npm
- Git

## Install

```bash
npm install
```

## Start

```bash
npm start
```

Open:

```text
http://127.0.0.1:4173/
```

The reference dashboard viewer is available at:

```text
http://127.0.0.1:4173/view/dashboard/ai-use-case-governance
```

## Useful commands

```bash
npm run mydash -- help
npm run mydash -- doctor
npm run mydash -- library scan
npm run mydash -- validate
npm run mydash -- artifact export ai-use-case-governance --kind dashboard
npm test
```

## Architecture

```text
Skills provide judgement.
CLI provides capability.
Shared services provide correctness.
Navigator provides human interface.
Git provides persistence and recovery.
```

Key principles:

- The filesystem is the source of truth.
- Git provides persistence, collaboration and recovery.
- Shared abstractions must earn their place.
- New UI begins local and is promoted only through demonstrated reuse.
- Every artefact exports as a standalone HTML file.
- Significant changes are validated before focused commits and safe pushes.

## Project history

The numbered scripts under `scripts/` preserve the incremental bootstrap path used to construct the project. A fresh user normally only needs `npm install` and `npm start`; the bootstraps are retained for auditability, learning and reconstruction.
