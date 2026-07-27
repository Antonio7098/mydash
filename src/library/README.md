# Filesystem library discovery

The repository is the source of truth. The scanner discovers manifests directly
from configured library roots; no manually maintained artefact index exists.

## Manifest filenames

| Resource | Manifest |
| --- | --- |
| Dashboard, presentation, concept | `artifact.json` |
| Primitive, component, layout | `ui.json` |
| Theme | `theme.json` |
| Preset | `preset.json` |
| Asset | `asset.json` |

## Shared-library placement

```text
library/<resource>/core/<id>/<manifest>
library/<resource>/collections/<collection>/<id>/<manifest>
```

The manifest `id`, lifecycle level and collection must agree with its directory.

## Diagnostics

The scanner checks:

- JSON parsing and contract validation;
- resource kind versus configured root;
- duplicate identifiers;
- lifecycle and collection placement;
- manifest id versus directory name;
- missing, ambiguous and qualified references;
- symbolic links, which are skipped rather than followed.

## Reverse consumers

References are extracted from:

- artefact appearance configuration;
- preset mappings;
- UI dependencies;
- supported theme declarations;
- theme asset mappings.

This supports cautious shared-library changes by showing which artefacts and
resources consume a component, primitive, layout, theme, preset or asset.
