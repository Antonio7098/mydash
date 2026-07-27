# Safe filesystem services

These modules provide deterministic operations for both the CLI and future HTTP
server.

## Safety rules

- Read operations remain inside the workspace by default.
- Read-only access outside the workspace requires `--allow-outside`.
- Symlinks are resolved before workspace-bound access is approved.
- Writes always require a workspace and remain inside it.
- Existing outputs are not replaced unless overwrite is explicit.
- Writes use temporary files followed by atomic rename.
- Directory traversal does not follow symbolic links.
- `.git`, `node_modules` and `.my-dashboards` are ignored by default.

## Working area

Runtime scratch files belong in:

```text
.my-dashboards/
├── cache/
├── temp/
├── extracts/
└── logs/
```

This directory is intentionally ignored by Git.
