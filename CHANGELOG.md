# Changelog

## Unreleased

- TypeScript migration: `src/`, `cli/`, `server/`, `bin/`, and `tests/` now ship as TypeScript and compile to `dist/` (and `build-test/` for tests) via `tsc`. The `bin` field in `package.json` points at the built `dist/cli/index.js`; the launcher `bin/mydash.mjs` is a thin wrapper that resolves it.
- New npm scripts: `npm run typecheck`, `npm run build`, `npm run build:test`, `npm run clean`. `npm test` now compiles tests to `build-test/tests/` and runs them via `node --test`.
- Strict TypeScript flags enabled: `strict`, `noUncheckedIndexedAccess`, and `useUnknownInCatchVariables`. `exactOptionalPropertyTypes` and `verbatimModuleSyntax` remain disabled for now because the existing JS-style ergonomics pass `undefined` to optional fields; both are deferred to a follow-up release.
- Bootstrap scripts are now historical: `scripts/00-` through `scripts/23-` refuse to overwrite TypeScript application directories (`src/`, `cli/`, `server/`, `tests/`, `bin/`, `dist/`). Any attempt records a `BOOTSTRAP_TYPE_SCRIPT_GUARD` warning instead of writing.

## 0.1.0

- Filesystem-discovered artefact and UI library
- CSV, JSON, Excel and PowerPoint inspection utilities
- Theme, preset and dependency resolution
- Standalone HTML export and validation
- Focused Git checkpoint and impact analysis
- Agent skills and minimal reusable Core
- Reference AI use-case governance dashboard
- Live navigator, gallery and artefact viewer
- Scoped appearance controls
- Visual library browser
- First-run guidance and release readiness checks
- Windows and Linux launchers
- Nontechnical setup and existing-dashboard migration guide for Claude Code
- Global `/mydash` skill linked to the repository workflow
- Workspace and artefact scoping through the `user` configuration field
- Explicit artefact-manifest user assignment from the configured workspace user
- Explicit resource-manifest rules across dashboard, presentation and concept
  workflows
- Expanded component lifecycle, authoring, asset and validation guidance
- Recurring nontechnical solutions maintained in `/help`
- Mandatory changelog coverage for core-system and skill changes
