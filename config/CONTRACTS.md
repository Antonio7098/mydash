# My Dashboards contracts

All persistent workspace records use versioned JSON contracts.

## Identifiers

Identifiers use lower-case kebab case:

```text
use-case-pipeline
metric-card
hsbc-light
```

They are stable references, not display labels.

## Paths

Contract paths are workspace-relative, use forward slashes and must not contain
`..`, absolute roots or URL schemes.

## Lifecycle

Reusable library entries use:

```text
local → collection → core
```

- **local** requires an owning artefact;
- **collection** requires a collection identifier;
- **core** must not declare either.

## Appearance

Themes define tokens. Presets define mappings for layouts, components and
primitives. Artefacts may override mappings explicitly.

## Compatibility

Shared UI declares a positive integer `contractVersion`. A later resolver may
reject incompatible mappings rather than silently rendering incorrect UI.

## Discovery

Artefacts are discovered from their folders. No manually maintained dashboard
index is part of these contracts.

## Users

Workspace and artefact schema version 2 require a kebab-case `user`.
Artefact IDs remain globally unique; user scoping controls discovery and
operations rather than creating a second identifier namespace. Reusable
library resources remain global.

## Validation

Run:

```bash
npm run validate
```

The current validator is intentionally dependency-free and checks both schemas
and representative valid/invalid fixtures.
