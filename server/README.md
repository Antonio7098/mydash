# HTTP server

The server is a thin Express interface over the same shared services used by the
CLI. It does not reimplement discovery, resolution, export, validation or Git
logic.

## Start

```text
npm start
```

The default address comes from `config/workspace.json`:

```text
http://127.0.0.1:4173
```

Environment overrides:

```text
MYDASH_HOST=127.0.0.1
MYDASH_PORT=4173
```

## API

```text
GET  /api
GET  /api/health
GET  /api/capabilities

GET  /api/library
GET  /api/library/:kind/:id

GET  /api/artifacts
GET  /api/users
GET  /api/artifacts/:kind/:id
GET  /api/artifacts/:kind/:id/preview

POST /api/validation

GET  /api/git/status
```

Artifact routes accept `?userId=<id>` and default to the configured workspace
user. `/api/users` derives available IDs from artifact manifests; it is a
scoping aid, not an authentication endpoint. Library resources remain global.

The server is deliberately read-only at this stage. Preview and validation
builds happen in memory. It does not expose file writes, recipe refreshes,
exports to disk, Git commits or pushes.

## Response envelope

JSON responses use:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "uuid",
    "durationMs": 3
  }
}
```

Errors use the same metadata with an `error` object.

## Security

- `X-Powered-By` is disabled.
- API responses are not cached.
- JSON request bodies are limited to 64 KiB.
- Request IDs are validated before reuse.
- The default host is loopback-only.
- No CORS middleware is installed.
- Preview HTML is generated through the standalone export validator.


## Live state and caching

Bootstrap 14 adds a revision-aware service layer:

```text
GET /api/state
GET /api/events
```

The workspace revision is calculated from filesystem metadata beneath
`config/`, `library/`, `recipes/` and `package.json`. The poller does not read
or execute artefact code.

Library scans, standalone previews and validation reports are cached against the
current revision. A detected change clears every revision-bound cache.

Read-only GET routes return ETags. Clients may send `If-None-Match`; unchanged
responses return `304 Not Modified`.

The event stream emits:

```text
event: workspace-revision
data: {"id":"...","sequence":2}
```

The future navigator can invalidate its own state immediately instead of
polling every endpoint.


## Navigator UI

Bootstrap 18 serves the human-facing navigator from `app/`.

```text
GET /
GET /dashboards
GET /presentations
GET /concepts
GET /components
GET /settings
```

Static browser modules are served below:

```text
/navigator/
```

The supported application routes return the same `index.html` document and the
browser resolves the active route through the History API.

Navigator responses apply a restrictive Content Security Policy and do not
permit external scripts, external styles, camera, microphone, geolocation,
payment or USB access.

Unknown paths continue through the normal JSON 404 handler. API routes remain
under `/api`.


## Artefact gallery support

Bootstrap 19 adds a download form of the in-memory standalone export:

```text
GET /api/artifacts/:kind/:id/download
```

It uses the same revision-aware preview cache as the inline preview route and
returns `Content-Disposition: attachment`.

Deep navigator viewer routes are also served:

```text
GET /view/:kind/:id
```

The navigator Content Security Policy now permits same-origin preview frames
and nothing cross-origin.


## Viewer metadata and export status

Bootstrap 20 adds:

```text
GET /api/artifacts/:kind/:id/export-status
```

For a valid artefact the response contains:

- export readiness;
- filename;
- byte size;
- SHA-256;
- standalone validation result;
- embedded resource counts;
- build warnings;
- active revision.

The endpoint reuses the existing in-memory preview build and cache. It never
returns the generated HTML.

The artefact-detail response also includes the revision object used for its
resolution.


## Appearance routes

```text
GET /api/artifacts/:kind/:id/appearance-options
PUT /api/artifacts/:kind/:id/appearance
```

Preview, download and export-status routes accept a validated, URL-encoded JSON
`appearance` query parameter limited to 16 KiB.

The PUT route accepts same-origin JSON only and requires the active 64-character
workspace revision. It refuses to combine a UI save with existing uncommitted
changes in the same manifest.


## Library catalogue metadata

Bootstrap 22 expands `GET /api/library` with canonical references, descriptions, semantic slots, variants, supported themes and visual summaries.

`GET /api/library/:kind/:id` returns the full manifest plus resolved dependencies, consumers, scoped diagnostics and the active revision.


## Release readiness and optional Git

`GET /api/readiness` combines library discovery, minimal Core, appearance, export and Git checks. Git unavailability is reported as a recommendation rather than preventing the navigator from opening.

Startup errors for occupied or inaccessible ports are converted into actionable messages, and installed signal handlers are removed during clean shutdown.
