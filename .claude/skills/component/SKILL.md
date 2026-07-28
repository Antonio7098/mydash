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

## Classify the resource

Choose the kind by responsibility, not by its filename or appearance:

- **Primitive** — one small interaction or semantic building block, such as a
  button, input or status badge.
- **Component** — a composed, reusable content pattern with a meaningful
  contract, such as a metric summary.
- **Layout** — page or region structure and responsive placement, without
  domain content.
- **Theme** — semantic design tokens and approved asset-slot defaults.
- **Preset** — a coherent mapping of layout, component, primitive and asset
  slots for use with supported themes.
- **Asset** — an owned file such as an image, logo, icon, font or illustration,
  together with its permitted usage and provenance.

If the requirement is only a one-off fragment of an artefact, ordinary local
HTML/CSS/JavaScript may be enough. Do not manufacture a resource solely to put
every element in the library.

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

The directory name, manifest `id`, manifest `kind` and implementation path must
agree. IDs and slots are stable kebab-case contracts. Use `schemaVersion: 1`.
Local manifests use `level: local` and the containing artefact ID as
`ownerArtifact`; Collection manifests use `level: collection` and declare their
`collection`; Core manifests use `level: core`.

For primitives, components and layouts, `ui.json` defines the entry file,
semantic slot, `contractVersion`, supported themes, props, variants and
dependencies. Declare only real inputs and variants. Describe required props,
use semantic dependency slots, and ensure every referenced resource resolves.

For themes, `theme.json` owns semantic tokens and optional asset-slot mappings.
For presets, `preset.json` maps stable slots to existing resources and declares
supported themes. For assets, `asset.json` identifies the exact file, media
type, category, intended usage, approval state and attribution where known.
Never imply that an asset is approved when approval has not been established.

## Authoring workflow

1. Inspect `npm run mydash -- git status --json` and preserve unrelated work.
2. Identify the consuming artefact, intended slot, expected inputs, supported
   themes and accessibility behaviour.
3. Search the filesystem library and inspect plausible resources, their
   manifests, variants, dependencies and consumers.
4. Reuse an exact contract or compatible variant when one exists.
5. Otherwise choose Local, Collection or Core using evidence; new resources
   normally start Local.
6. Create the resource directory, required manifest and the smallest complete
   implementation. A manifest alone is not an implementation, and an
   implementation without its manifest is not a resource.
7. Reference other resources through declared semantic dependencies. Do not
   copy shared implementation into a new local resource merely to avoid a
   dependency.
8. Integrate the resource into its consumer and preserve graceful empty, error,
   narrow-screen, keyboard and reduced-motion behaviour where applicable.
9. Run library diagnostics, inspect the discovered resource, resolve the
   consuming artefact's appearance and validate the affected artefact.
10. Visually inspect the real consumer and any resource preview before
    reporting completion.

Useful inspection and validation commands:

```text
npm run mydash -- library list --kind <kind>
npm run mydash -- library inspect <id> --kind <kind>
npm run mydash -- library diagnostics
npm run mydash -- appearance resolve <artefact-id> --kind <artefact-kind>
npm run mydash -- validate --artifact <artefact-id> --kind <artefact-kind>
```

## Changes to existing resources

Treat the manifest as a public contract. Before editing, compare current props,
variants, slots, dependencies, supported themes and consumers. An
implementation-only fix may keep the same `contractVersion`; a breaking
contract change requires an intentional migration of every consumer and an
incremented `contractVersion`.

Prefer adding a genuinely coherent compatible variant over changing existing
meaning. Do not retain obsolete compatibility indefinitely or create variants
that encode one consumer's domain language in a shared resource.

For assets, preserve the original approved file unless replacement is
explicitly authorised. Check media type, file size, licensing/attribution,
accessible usage and light/dark-background suitability. Do not extract logos
from screenshots, redraw protected marks or make an unapproved asset globally
available.

## Shared changes

Before changing Core or Collection:

```text
mydash library consumers <id> --kind <kind>
mydash impact core/<id> --kind <kind>
mydash impact <collection>/<id> --kind <kind>
```

Inspect affected artefacts and validate them. Prefer a compatible variant or
local override when the desired change is not universal.

Promotion is a migration, not a copy:

1. Confirm the required number and breadth of real consumers.
2. Define the shared contract from their common needs.
3. Create the destination manifest with the correct lifecycle metadata.
4. Move or adapt the implementation without leaving duplicate identities.
5. Update each consumer reference.
6. Validate every consumer and review transitive impact.
7. Remove the obsolete source only after references resolve and validation
   succeeds.

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

1. Confirm the resource is discovered from its manifest at the intended scope.
2. Confirm its implementation, entry file, dependencies and consumer references
   resolve.
3. Run the relevant focused checks and visually inspect the consumer.
4. Run `npm run mydash -- validate` or scoped validation.
5. Review shared impact and every affected consumer when applicable.
6. Update `BUG_LOG.md` only if the work fixes a system bug or changes system
   behaviour; do not log routine resource creation or editing.
7. Checkpoint explicit task-owned paths with `mydash git checkpoint`.
8. Report placement, manifest, consumers, validation, commit, push and
   remaining obstacles honestly.
