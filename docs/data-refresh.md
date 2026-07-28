# Data refresh

MyDash dashboards and presentations consume deterministic generated datasets.
They do not read user uploads or live workbooks directly.

```text
external source
  -> workspace snapshot
  -> recipe extraction
  -> quality checks
  -> atomic publication
  -> provenance and refresh status
```

## Artefact layout

```text
library/dashboards/<id>/
├── data/
│   ├── source/<source-id>/
│   │   ├── current.xlsx
│   │   ├── source.json
│   │   └── history/
│   ├── generated/
│   │   ├── dashboard-data.json
│   │   └── dashboard-data.provenance.json
│   └── refresh-status.json
└── recipes/
    └── <source-id>.recipe.json
```

Raw `current.*` files and `history/` are workstation-local and ignored by Git.
The operational `snapshot.json` acquisition record is also workstation-local.
Commit source policies, recipes, approved generated data and provenance as
appropriate for the data's classification.

## Manual source copies

When a user supplies a workbook or tabular file somewhere on the workstation,
stage it before inspecting or analysing its contents:

```bash
npm run mydash -- data stage /path/to/Portfolio.xlsx \
  --artifact portfolio-overview \
  --kind dashboard \
  --source portfolio-workbook
```

The command rejects symbolic links, waits for a stable file, enforces the
100 MB default limit, copies through a temporary file and calculates a SHA-256
hash. Re-staging identical content is a no-op. Changed sources retain the
configured number of previous snapshots.

The first stage creates `source.json`. Review its freshness and quality policy
before publishing data.

## Live-local sources

Set the source policy's mode to `live-local` and configure the machine-specific
path in `.mydash-local/sources.json`:

```json
{
  "portfolio-workbook": {
    "path": "/mnt/shared/Portfolio.xlsx"
  }
}
```

Use [.mydash-local.example/sources.json](../.mydash-local.example/sources.json)
as a template. `.mydash-local/` is ignored by Git and must not contain
credentials.

Synchronise a snapshot with:

```bash
npm run mydash -- data sync portfolio-overview \
  --kind dashboard \
  --source portfolio-workbook
```

Recipes still point to the workspace `current.*` snapshot, never to the live
external path. This prevents a workbook save from changing data during
extraction. A successful sync runs the artefact refresh pipeline immediately
after staging the snapshot.

## Recipe and quality policy

Recipes remain schema-version-1 data recipes:

```json
{
  "schemaVersion": 1,
  "id": "portfolio-workbook",
  "source": {
    "type": "excel",
    "file": "library/dashboards/portfolio-overview/data/source/portfolio-workbook/current.xlsx",
    "table": "PortfolioTable"
  },
  "output": {
    "file": "library/dashboards/portfolio-overview/data/generated/dashboard-data.json",
    "format": "json",
    "overwrite": true
  }
}
```

`source.json` controls acquisition and publication quality:

```json
{
  "schemaVersion": 1,
  "id": "portfolio-workbook",
  "mode": "manual",
  "filename": "current.xlsx",
  "refresh": {
    "expectedFrequency": "weekly",
    "maximumAgeHours": 192,
    "retainSnapshots": 3
  },
  "quality": {
    "minimumRows": 1,
    "requiredColumns": ["id", "status", "owner"],
    "uniqueKey": ["id"],
    "failOnFormulaErrors": true,
    "maximumRowDecreasePercent": 20
  }
}
```

Publication fails on missing required columns, too few rows, duplicate declared
keys, cached formula-error values or an excessive row-count decrease. A failed
refresh leaves the previous generated dataset in place and records the failure
in `data/refresh-status.json`.

## Refresh and status

Refresh every recipe owned by an artefact:

```bash
npm run mydash -- data refresh-artifact portfolio-overview --kind dashboard
```

The operation acquires an artefact-specific lock, validates recipes, extracts
all datasets to temporary files, applies quality gates, and publishes outputs
and provenance as one rollback-protected transaction.

Inspect current state and freshness:

```bash
npm run mydash -- data status portfolio-overview --kind dashboard
```

Use `--json` for automation. Status includes the last attempt, last successful
refresh, dataset row counts, errors, source hashes and freshness.

## Scheduling on a cloud workstation

The thin wrapper optionally synchronises one live source, refreshes the
artefact and prints status:

```bash
scripts/refresh-artifact.sh dashboard portfolio-overview portfolio-workbook
```

A `systemd --user` timer or cron entry may invoke this wrapper. Cloud
workstations can stop or suspend, so workstation scheduling is best-effort.
Use a continuously scheduled service when refreshes must run while the
workstation is stopped.

Example cron entry:

```text
15 7 * * 1 /absolute/path/to/mydash/scripts/refresh-artifact.sh dashboard portfolio-overview portfolio-workbook >> /absolute/path/to/refresh.log 2>&1
```

Scheduling and access to an external source require explicit user approval.
The wrapper contains no extraction logic; all safety and publication behaviour
remains in the MyDash CLI.
