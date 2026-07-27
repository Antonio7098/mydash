# Minimal Core library

Core is intentionally small. Bootstrap 16 seeds only the resources needed to
establish a stable visual baseline and build the first reference dashboard.

## Seeded resources

```text
Theme
  hsbc-light

Preset
  default

Layout
  dashboard-shell

Components
  metric-card
  section-heading

Primitives
  button
  status-badge

Asset
  mydash-brand-mark
```

The `hsbc-light` theme expresses the restrained red, white and charcoal visual
direction requested for this project. It is not an official HSBC brand theme.

`mydash-brand-mark` is a safe project fallback. It does not reproduce or claim
to be the HSBC logo. Replace the `brand-logo` asset mapping when an approved
internal asset is supplied.

## Core admission rule

Do not add another Core resource merely because it may be useful.

A resource belongs in Core only when it has:

- multiple real consumers;
- a stable semantic contract;
- cross-domain usefulness;
- validated behaviour across those consumers;
- a clear reason not to remain local or Collection-scoped.

Core resources can be demoted when the evidence no longer supports their scope.

## Validate

```bash
npm run mydash -- library scan
npm run mydash -- library list --level core
npm run test:core
npm run mydash -- validate
```
