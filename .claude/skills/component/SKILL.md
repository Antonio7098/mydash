---
name: "Component"
description: "Selects, creates, modifies or promotes primitives, components, layouts, themes, presets and assets using evidence-based Local, Collection and Core lifecycle rules."
argument-hint: "[UI requirement or resource]"
---

Treat `$ARGUMENTS` as the UI requirement.

Inspect Git state, relevant artefacts and the filesystem library before editing.
Preserve unrelated work. Consult `docs/cli-reference.md` only for exact command
syntax.

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

The visual library browser at `/components` is an inspection surface. It shows
canonical references, lifecycle ownership, source paths, props, variants,
supported themes, dependencies and consumers. It does not automatically
promote or edit shared resources; make lifecycle changes explicitly in the
filesystem and validate them.

## Required manifests and placement

Every created resource must include the manifest required for its kind. A
resource directory without its manifest is incomplete and is not discoverable
as that resource.

| Resource | Shared placement | Local artefact placement | Required manifest |
| --- | --- | --- | --- |
| Primitive | `library/ui/primitives/core/<id>/` or `library/ui/primitives/collections/<collection>/<id>/` | `<artefact>/ui/primitives/<id>/` | `ui.json` |
| Component | `library/ui/components/core/<id>/` or `library/ui/components/collections/<collection>/<id>/` | `<artefact>/ui/components/<id>/` | `ui.json` |
| Layout | `library/ui/layouts/core/<id>/` or `library/ui/layouts/collections/<collection>/<id>/` | `<artefact>/ui/layouts/<id>/` | `ui.json` |
| Theme | `library/themes/core/<id>/` or `library/themes/collections/<collection>/<id>/` | `<artefact>/theme/<id>/` | `theme.json` |
| Preset | `library/presets/core/<id>/` or `library/presets/collections/<collection>/<id>/` | Not supported locally | `preset.json` |
| Asset | `library/assets/core/<id>/` or `library/assets/collections/<collection>/<id>/` | `<artefact>/assets/<id>/` | `asset.json` |

Here, `<artefact>` is the containing
`library/dashboards/<id>/`, `library/presentations/<id>/` or
`library/concepts/<id>/` directory. The artefact itself requires
`artifact.json`; `asset.json` is required only for an asset resource owned by
that artefact. For example, Core metric card creation is incomplete without
`library/ui/components/core/metric-card/ui.json`, while a dashboard-local logo
is incomplete without
`library/dashboards/<dashboard-id>/assets/<asset-id>/asset.json`.

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

Local primitives, components, layouts, themes and assets declare `level:
local`, name their containing `ownerArtifact`, live beneath that artefact in a
directory matching their ID and preserve semantic slot contracts. Do not create
a shared resource merely because two files look alike.

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
4. Update `BUG_LOG.md` only if the work fixes a system bug or changes system
   behaviour; do not log routine resource creation or editing.
5. Checkpoint explicit task-owned paths with `mydash git checkpoint`.
6. Report validation, commit, push and remaining obstacles honestly.
