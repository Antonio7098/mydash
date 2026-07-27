# Shared application services

This is the functional core of My Dashboards.

Both the CLI and HTTP server will call these modules:

- `workspace/` — workspace configuration and path rules;
- `files/` — safe filesystem operations;
- `office/` — Excel and PowerPoint inspection and extraction;
- `data/` — deterministic data preparation;
- `library/` — filesystem discovery and consumer analysis;
- `resolution/` — themes, presets, layouts, components, primitives and assets;
- `export/` — standalone HTML generation;
- `validation/` — workspace and artefact validation;
- `git/` — constrained checkpoint operations.
