# TypeScript Migration Phases

This document tracks the migration of `src/`, `cli/`, `server/`, `bin/`, and
`tests/` from JavaScript source to strictly-typed TypeScript, compiled with
`tsc` and executed through `dist/`. Each phase is gated.

## Phase 0 — Establish the baseline

- Snapshot CLI exit codes, help text, and JSON envelopes under
  `/tmp/opencode/mydash-baseline/`.
- Confirm `npm run check:source`, `npm test`, `npm run validate`, and
  `npm run smoke` pass.
- Capture `/api/health` response from the running server.

## Phase 1 — Add TypeScript infrastructure

- New `tsconfig.json` with full strict flags and `module: NodeNext`.
- New `tsconfig.test.json` for test compilation.
- Ambient declarations in `types/ambient/dependencies.d.ts`.
- New scripts in `package.json`: `clean`, `build`, `typecheck`,
  `test:ts-compile`.
- `.gitignore` already ignores `dist/`; add `build-test/`.

## Phase 2 — Define shared boundary types

- Per-directory boundary types in `src/workspace/types.ts`,
  `src/library/types.ts`, `src/validation/types.ts`, `src/export/types.ts`,
  `cli/types.ts`, `server/types.ts`.
- External JSON remains `unknown` until validated at runtime.

## Phase 3 — Migrate foundational `src` modules

- `src/workspace`, `src/files`, `src/users`, `src/git`, `src/data`,
  `src/office`, `src/library`, `src/resolution`, `src/appearance`,
  `src/export`, `src/validation`, `src/skills` migrated to `.ts`.
- Imports rewritten to use `.js` extensions per `NodeNext` rules.

## Phase 4 — Migrate the CLI

- `cli/errors.mjs`, `cli/parser.mjs`, `cli/runtime.mjs`,
  `cli/command-options.mjs`, `cli/output.mjs`, `cli/registry.mjs`,
  `cli/index.mjs` and `cli/commands/*.mjs` migrated to `.ts`.
- `bin/mydash.mjs` becomes a tiny wrapper that imports
  `../dist/cli/index.js`.

## Phase 5 — Migrate the server

- HTTP helpers, middleware, routes, services, app composition, and startup
  migrated to `.ts`.
- Typed error envelope and route boundaries.

## Phase 6 — Migrate tests

- Each `tests/**/*.test.mjs` becomes `tests/**/*.test.ts`.
- Compiled output emitted to `build-test/tests/` via
  `tsconfig.test.json`.
- `npm test` runs `node --test build-test/tests/**/*.test.js`.

## Phase 7 — Resolve bootstrap / checkpoint scripts

- Mark `scripts/00-` through `scripts/23-` as historical artefacts.
- `check-source.mjs` no longer requires `server/start.mjs`; it requires the
  compiled launcher at `dist/server/start.js`.
- The bootstrap scripts remain in the tree but cannot rewrite TypeScript
  application source.

## Phase 8 — Make TypeScript mandatory

- Consolidated validation pipeline runs:
  1. `npm run check:source`
  2. `npm run typecheck`
  3. `npm run build`
  4. `npm test`
  5. `npm run validate`
  6. `npm run smoke`
- `.github/workflows/ci.yml` updated to include the new gates.
- READMEs and `CHANGELOG.md` updated.
- `BUG_LOG.md` updated with the migration entry.

## Final acceptance criteria

- `src/`, `cli/`, `server/`, `bin/` contain only `.ts` source.
- `npm run typecheck`, `npm run build`, `npm test`, `npm run validate`,
  `npm run smoke` all pass.
- CLI and server run only compiled output from `dist/`.
- Bootstrap scripts cannot overwrite TypeScript source.
- `dist/` is not committed.