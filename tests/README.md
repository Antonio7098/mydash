# Tests

- `unit/` — isolated service and contract behaviour;
- `integration/` — boundaries between shared services, CLI, server and filesystem;
- `fixtures/` — intentionally small test workbooks, presentations, manifests and artefacts.

Tests are written in TypeScript using `node:test` and `node:assert/strict`. Run `npm test` to compile the application and tests, then execute the compiled JavaScript from `build-test/tests/`. To compile tests without running them, use `npm run build:test`.

Tests should remain proportional to actual risk and complexity.
