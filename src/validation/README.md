# Consolidated validation and impact analysis

`mydash validate` is the repository-wide quality gate. It checks the current
workspace without writing exports or recipe outputs.

## Validation stages

1. Workspace configuration
2. Manifest contracts and filesystem library discovery
3. Appearance and recursive dependency resolution
4. Data-recipe discovery, contract validation and read-only execution
5. In-memory standalone HTML export and final standalone validation

The flattened issue list retains the stage, artefact or recipe that produced
each problem. Validation uses exit code `3`.

## Reports

A JSON report can be written with:

```text
mydash validate --report .my-dashboards/reports/validation.json
```

Reports contain no generated HTML. They include export hashes, sizes,
resource counts and stage summaries.

## Impact analysis

`mydash impact <id> --kind <kind>` walks the reverse-consumer graph
transitively. It reports:

- direct consumers;
- shared resources that depend on the target;
- affected artefacts;
- lifecycle scope;
- a risk classification;
- the validation commands that should run before committing.

Core and contract changes are deliberately classified as high risk whenever
they have consumers.

## Qualified impact targets

When identifiers overlap, use an explicit scope:

```text
core/metric-card
executive-reporting/status-card
local/use-case-pipeline/metric-card
```
