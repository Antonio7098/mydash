# Data utilities

The data layer provides deterministic operations for CSV, JSON and NDJSON:

- structural inspection;
- column profiling;
- conversion;
- column selection;
- safe row filtering;
- key-based deduplication;
- repeatable extraction recipes;
- source hashing and provenance.
- manual and live-local source snapshotting;
- artefact-level quality gates and rollback-protected publication;
- refresh status and freshness reporting.

## Refresh model

Dashboards consume generated datasets, never external files or live workbooks.
`mydash data stage` snapshots a user-supplied source, while `mydash data sync`
snapshots a path configured in ignored workstation-local configuration.
`mydash data refresh-artifact` extracts every artefact-local recipe to temporary
outputs, applies its source policy and publishes the complete set only after all
checks pass. See `docs/data-refresh.md`.

## Safety

- No user expression is evaluated as JavaScript.
- Filter expressions use a small explicit grammar.
- Input files are limited to 100 MB by default.
- Outputs remain inside the workspace.
- Existing outputs require explicit overwrite.
- Writes are atomic.
- Recipe source files are hashed using SHA-256.
- Source snapshots reject symbolic links and files that are still changing.
- A failed artefact refresh retains the last-known-good generated data.
- Formula execution, spreadsheet macros and document scripts are never run.

## Filter grammar

Examples:

```text
status=Approved
amount>=1000
owner contains smith
created>=2026-01-01
notes is-null
owner not-null
```

String matching is case-insensitive. Numeric and ISO-style date comparisons are
performed when both values can be interpreted safely.
