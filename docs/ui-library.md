# UI library

The UI lifecycle is:

```text
Local → Collection → Core
```

Start new UI inside the consuming artefact. Promote it only after real reuse demonstrates a stable contract.

The visual library browser is available at `/components`. It exposes canonical references, lifecycle ownership, source paths, props, variants, supported themes, dependencies and consumers.

Resource types are themes, presets, layouts, components, primitives and assets. MyDash does not automatically promote or edit shared resources through the browser.
