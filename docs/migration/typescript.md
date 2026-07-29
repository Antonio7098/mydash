# TypeScript Migration Tracker

Tracks the incremental conversion of the repository from JavaScript source to
strictly-typed TypeScript. Each section lists the current state of a directory
and any follow-ups still required.

## Status overview

| Directory      | Status in Phase 0 baseline | Status after Phase 8 | Notes |
| -------------- | -------------------------- | -------------------- | ----- |
| `src/`         | 40 `.mjs` files            | TypeScript           | Shared application services. |
| `cli/`         | 22 `.mjs` files            | TypeScript           | CLI implementation. |
| `server/`      | 16 `.mjs` files            | TypeScript           | HTTP server. |
| `bin/`         | `bin/mydash.mjs`           | TypeScript wrapper that imports compiled CLI. |
| `ui/`          | JavaScript                 | JavaScript (unchanged) | Browser modules stay `.js` for direct ES module loading. |
| `app/`         | not present                | not present          | |
| `tests/`       | `.test.mjs`                | `.test.ts` compiled via `tsconfig.test.json`. |
| `scripts/`     | `.mjs` bootstrap scripts   | Historical artefacts only; cannot overwrite TypeScript source. |
| `scripts/tasks/` | `.mjs` task runners      | JavaScript shims that import compiled output where applicable. |

## Compiler configuration

- `tsconfig.json` targets `ES2022`, `module: NodeNext`, full strict flags,
  `verbatimModuleSyntax`, `declaration` and `sourceMap` enabled, output in
  `dist/`.
- `tsconfig.test.json` extends the above and emits tests under `build-test/`.
- Ambient declarations for libraries without first-party types live in
  `types/ambient/dependencies.d.ts`.

## Bootstrap script policy

Scripts `00-` through `23-` are now historical artefacts. They contain
snapshots of the prior JavaScript implementation. The Phase 7 guard prevents
them from rewriting established TypeScript directories. Running any of these
scripts against the current repository will not recreate obsolete `.mjs`
application sources because:

- `cli/`, `server/`, `src/`, `bin/`, and `tests/` no longer ship matching
  embedded templates in any later bootstrap script.
- The embedded `FILES` registries in scripts `04-` through `23-` describe the
  historical JavaScript layout; their `writeManagedFile` helper will refuse
  to overwrite existing TypeScript files that differ from any embedded
  snapshot unless explicitly authorised.
- `check-source.mjs` now refuses to recognise `.mjs` application source files
  in the core directories.

## Phase gates

Each phase must pass its gate before the next begins. See
`docs/migration/typescript-phases.md` for the full phase plan and gate
checklist.

## Open follow-ups

- Future dependency types (`@types/exceljs`, `@types/fflate`) may be adopted
  when they publish official declarations, removing the need for the ambient
  shims in `types/ambient/`.