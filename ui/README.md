# Navigator UI

The navigator is a lightweight browser interface over the repository and HTTP
services. It does not maintain a separate database or artefact index.

The top-bar user selector scopes artifact galleries, viewers, previews,
downloads and appearance changes. It defaults to the workspace `userId` and
persists the selected user in the URL and browser storage. The visual component
library remains global.

## Start

```bash
npm start
```

Open:

```text
http://127.0.0.1:4173/
```

## Routes

```text
/
 /dashboards
 /presentations
 /concepts
 /components
 /settings
```

The shell uses History API routing and the Express server returns `index.html`
for each supported route.

## Current scope

Bootstrap 18 provides:

- minimal white-and-red application chrome;
- compact expandable navigation;
- top-centre category selector;
- route-aware views;
- live health and revision status;
- artefact and library counts;
- component-library summary;
- Git and cache state;
- ETag-aware API reads;
- live refresh through `/api/events`.

It deliberately does not yet render miniature artefact previews or the final
gallery card system. Those belong to the next bootstrap.

## Browser modules

```text
index.html
styles.css
router.js
api.js
main.js
```

No bundler or framework is required. All browser code is ordinary ES modules
served by Express.

## Safety

- no external scripts or styles;
- no inline scripts;
- no cross-origin API calls;
- repository text is inserted with `textContent`;
- navigation routes are allow-listed;
- Content Security Policy is applied by the server;
- the HTTP interface remains read-only.


## Artefact gallery and viewer

Bootstrap 19 adds live miniature previews to Home and the artefact category
routes.

```text
/view/<kind>/<id>
```

Viewer pages keep the navigator chrome while presenting a large interactive
preview and direct standalone-download action.

Gallery previews:

- use native and observer-based lazy loading;
- use sandboxed iframes;
- do not accept pointer interaction;
- show explicit loading and failure states;
- preserve title/action metadata outside the iframe;
- choose a deterministic mount shape from the artefact identity.

The gallery never stores thumbnails or a manual artefact index. It renders the
current `/api/artifacts` response and loads previews from the existing
standalone exporter.


## Dedicated viewer controls

Bootstrap 20 completes the viewer toolbar.

```text
R          reload preview
F          enter or exit fullscreen
I          show or hide artefact details
?          show keyboard shortcuts
Escape     leave fullscreen or close shortcut help
```

Viewer details are loaded from:

```text
GET /api/artifacts/:kind/:id
GET /api/artifacts/:kind/:id/export-status
```

The export-status route uses the existing revision-aware standalone-preview
cache. Its JSON response contains hashes, byte size, resource counts,
validation and warnings, but never contains the generated HTML document.

The details panel shows:

- manifest metadata;
- selected theme, preset and layout;
- dependency closure and lifecycle scope;
- export readiness, size and SHA-256;
- embedded resource counts;
- related discovery or resolution issues;
- active workspace revision.

The viewer remains read-only.


## Scoped appearance controls

The viewer now has three appearance scopes:

```text
Preview only
Personal
Artefact default
```

Preview-only changes are encoded in the preview URL and never touch files.
Personal changes are stored in browser localStorage for the current artefact.
Artefact-default changes update only `artifact.json`, require the current
workspace revision, build and validate first, create a focused Git checkpoint,
push safely, and roll the manifest back if a pre-commit failure occurs.

Theme and preset remain the primary choices. Layout, component, primitive and
asset slot mappings are inside the Advanced section.


## Visual library browser

Bootstrap 22 replaces the Components summary with a searchable catalogue at `/components`.

Deep links use:

```text
/components/<kind>/<id>
```

The detail view exposes lifecycle scope, canonical reference, source path, props, variants, theme compatibility, dependencies, consumers and diagnostics. The browser is read-only and does not promote or edit shared resources.


## First-run and release readiness

Bootstrap 23 adds a readiness report to Home and Settings, a first-artefact guide for empty workspaces, friendly retry states and optional-Git operation. An extracted release zip can browse, preview and export before Git is initialised.
