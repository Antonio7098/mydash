---
name: "Concept"
description: "Creates a lightweight visual concept or prototype without prematurely turning exploratory work into shared product architecture."
argument-hint: "[concept request]"
---

Treat `$ARGUMENTS` as the concept to explore.

Read:

- `docs/agent-workflows/OPERATING_MODEL.md`
- `docs/agent-workflows/ARTIFACT_AUTHORING.md`
- `docs/agent-workflows/VISUAL_STANDARDS.md`

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

## Completion

Before claiming the task is complete:

1. Run the relevant focused checks.
2. Run `npm run mydash -- validate` or scoped validation.
3. Review shared impact when applicable.
4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.
5. Report validation, commit, push and remaining obstacles honestly.
