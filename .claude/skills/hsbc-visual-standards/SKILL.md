---
name: "HSBC Visual Standards"
description: "Applies the project’s restrained HSBC-inspired visual language, approved-asset discipline and accessibility rules. Use for dashboards, presentations, concepts, components and the navigator."
argument-hint: "[artefact or visual request]"
---

Apply the request in `$ARGUMENTS`.

Read `skills/VISUAL_STANDARDS.md` before changing visuals.

## Rules

- Use approved repository assets.
- Use red selectively, not as decoration everywhere.
- Preserve a white, spacious and precise visual character.
- Establish hierarchy before adding effects.
- Keep charts purposeful and labelled.
- Do not encode meaning by colour alone.
- Maintain keyboard support, focus visibility and readable contrast.
- Respect reduced motion.
- Do not redraw the HSBC mark from memory or extract it from screenshots.
- Do not claim official brand approval or compliance without an approved source.
- When official internal guidance is supplied, treat it as authoritative over
  this project default.

Use `/component` when the visual request affects a shared resource.

## Completion

Before claiming the task is complete:

1. Run the relevant focused checks.
2. Run `npm run mydash -- validate` or scoped validation.
3. Review shared impact when applicable.
4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.
5. Report validation, commit, push and remaining obstacles honestly.
