# AI Use Case Governance

This is the first real My Dashboards artefact and the reference implementation
for the source-to-preview-to-standalone-export path.

## Purpose

It answers four operational questions:

1. How many use cases are in the portfolio?
2. Where is governance work accumulating?
3. Which items require attention?
4. What is the next action?

The included portfolio is representative sample data. It does not describe a
real organisation or approval state.

## Appearance

The artefact consumes the complete minimal Core:

```text
hsbc-light
default
dashboard-shell
metric-card
section-heading
button
status-badge
mydash-brand-mark
```

It owns one local component:

```text
governance-pipeline
```

The pipeline remains local because it has one demonstrated consumer.

## Preview

```bash
npm start
```

Then open:

```text
http://127.0.0.1:4173/api/artifacts/dashboard/ai-use-case-governance/preview
```

## Validate and export

```bash
npm run mydash -- artifact validate ai-use-case-governance --kind dashboard

npm run mydash -- artifact export ai-use-case-governance \
  --kind dashboard
```

The exported file works directly through `file://`.
