# Appearance and dependency resolution

Resolution turns declarative manifests into one explicit effective appearance.

## Precedence

```text
workspace default
    ↓
artefact theme / preset choice
    ↓
preset layout, component, primitive and asset mappings
    ↓
theme asset mappings
    ↓
artefact overrides
    ↓
recursive UI dependencies
```

Later layers override earlier mappings for the same slot.

## Reference scope

Qualified references are explicit:

```text
core/metric-card
executive-reporting/status-card
local/risk-summary
```

Unqualified references resolve in this order:

1. a local resource owned by the current artefact;
2. Core;
3. the source resource's own collection;
4. a unique remaining Collection match.

Ambiguous Collection matches are errors.

Workspace defaults and shared presets cannot resolve artefact-local resources.
Local UI may depend on resources owned by the same artefact.

## Validation

Resolution reports:

- missing and ambiguous references;
- preset/theme incompatibility;
- UI/theme incompatibility;
- slot mismatches;
- dependency cycles;
- complete dependency closure.

No source files are executed during resolution.
