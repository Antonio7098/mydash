---
name: "Concept"
description: "Creates a lightweight visual concept or prototype without prematurely turning exploratory work into shared product architecture."
argument-hint: "[concept request]"
---

Treat `$ARGUMENTS` as the concept to explore.

Inspect Git state, the configured `user`, relevant sources and the filesystem
library before editing. Preserve unrelated work. Consult
`docs/cli-reference.md` only for exact command syntax.

Load `/component` before selecting, creating or changing any primitive,
component, layout, theme, preset or asset, including concept-local resources.

## Principles

- Optimise for learning, not completeness.
- Make the concept specific enough to react to.
- Keep new UI, theme and assets local.
- Avoid abstractions before there is a second real consumer.
- Prefer a small working path over a comprehensive speculative system.
- Clearly label assumptions, placeholders and unresolved questions.

## Workflow

1. State the idea being tested.
2. Identify the smallest useful interaction or visual sequence.
3. Inspect existing resources and reuse only what genuinely helps.
4. Build the concept under `library/concepts/<id>/`.
5. Use representative data without misrepresenting it as real.
6. Validate and export the concept so it can be shared.
7. Record what was learned and what should not yet be promoted.

A concept may be intentionally rough, but it must still be safe, accessible
enough to evaluate, structurally valid and standalone.

Use a schema-version-2 manifest and create only the `src/`, `data/`, `assets/`,
`recipes/`, `ui/` and `theme/` directories that are needed. Local resources
declare `level: local`, the containing `ownerArtifact`, a matching directory ID
and stable semantic slots. The final export must have no external load-time
dependencies.

Before creating or updating `artifact.json`, read the configured user from
`data.user` returned by `npm run mydash -- doctor --json` and set its `user`
field to that exact value. Do not infer it from the person's display name,
conversation, Git identity or optional `owner` metadata. If no configured user
exists, stop and ask the user to configure one.

The artefact manifest is `artifact.json`. Every resource also requires its own
kind-specific manifest: `ui.json` for primitives, components and layouts,
`theme.json` for themes, `preset.json` for presets and `asset.json` for assets.
An implementation without its manifest is incomplete and undiscoverable.
Follow `/component` for placement, required fields, dependencies and
validation.

## Completion

Before claiming the task is complete:

1. Run the relevant focused checks.
2. Run `npm run mydash -- validate` or scoped validation.
3. Review shared impact when applicable.
4. Update `BUG_LOG.md` only if the work fixes a system bug or changes system
   behaviour; do not log routine concept work.
5. Checkpoint explicit task-owned paths with `mydash git checkpoint`.
6. Report validation, commit, push and remaining obstacles honestly.
