---
name: "Component"
description: "Selects, creates, modifies or promotes primitives, components, layouts, themes, presets and assets using evidence-based Local, Collection and Core lifecycle rules."
argument-hint: "[UI requirement or resource]"
---

Treat `$ARGUMENTS` as the UI requirement.

Read:

- `skills/OPERATING_MODEL.md`
- `skills/ARTIFACT_AUTHORING.md`
- `skills/VISUAL_STANDARDS.md`

## Decision tree

1. Classify the requirement.
2. Decide whether it is a primitive, component, layout, theme, preset or asset.
3. Search Core.
4. Search relevant Collections.
5. Check whether an existing variant already expresses the need.
6. Determine the intended theme, semantic slot and layout context.
7. Reuse an existing resource when its contract genuinely fits.
8. Otherwise create it locally under the consuming artefact.
9. Modify shared code only when the change is appropriate for every consumer
   and preserves the contract.
10. Promote only after demonstrated reuse.

## Scope

```text
Local → Collection → Core
```

- Start local.
- Promote to Collection after a second real consumer in a coherent domain.
- Promote to Core only after broad, stable, cross-domain reuse.
- Demote shared resources when their scope is no longer justified.

## Shared changes

Before changing Core or Collection:

```text
mydash library consumers <id> --kind <kind>
mydash impact core/<id> --kind <kind>
mydash impact <collection>/<id> --kind <kind>
```

Inspect affected artefacts and validate them. Prefer a compatible variant or
local override when the desired change is not universal.

Do not:

- generalise from visual resemblance alone;
- add options for hypothetical consumers;
- silently break semantic slots;
- edit approved assets destructively;
- promote a resource in the same moment it is first created.

## Checkpoint

Consumed shared changes require explicit impact acknowledgement:

```text
mydash git checkpoint <explicit-path...> \
  --message "<focused message>" \
  --acknowledge-impact
```

## Completion

Before claiming the task is complete:

1. Run the relevant focused checks.
2. Run `npm run mydash -- validate` or scoped validation.
3. Review shared impact when applicable.
4. Checkpoint explicit task-owned paths with `mydash git checkpoint`.
5. Report validation, commit, push and remaining obstacles honestly.
