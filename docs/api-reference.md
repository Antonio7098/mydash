# My Dashboards HTTP API

This is the authoritative reference for the local HTTP API exposed by
`npm start`. The default base URL is `http://127.0.0.1:4173/api`.

The API is intended for the Navigator and trusted local tooling. It has no
authentication layer. Keep the server bound to loopback unless the hosting
environment provides appropriate access controls.

## Response conventions

JSON endpoints return an envelope containing `data` and may include revision
metadata. Revision-aware GET responses use `ETag` and accept
`If-None-Match`. Workspace-backed responses may include
`X-MyDash-Revision`. Errors use an HTTP status plus a machine-readable error
code and message.

Most artefact endpoints accept `user=<kebab-case-user>` for trusted local
tooling and otherwise use `config/workspace.json`. The Navigator itself always
uses the configured workspace user; viewing another user in the UI requires a
workspace configuration change. Build endpoints accept:

- `minify=true|false`
- `maxBytes=<integer>` from 1 KiB through 200 MiB
- `appearance=<encoded appearance selection>`

## Discovery and status

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/` | Service metadata and endpoint links |
| `GET` | `/api/capabilities` | Product and runtime capabilities |
| `GET` | `/api/health` | Liveness and current workspace revision |
| `GET` | `/api/readiness` | Consolidated readiness report |
| `GET` | `/api/state` | Current live workspace state |
| `GET` | `/api/events` | Server-sent `workspace-revision` events; includes 25-second heartbeats |
| `GET` | `/api/git/status` | Read-only Git status |

## Library

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/library` | List resources and diagnostics |
| `GET` | `/api/library/:kind/:id` | Inspect a resource, manifest, consumers and dependencies |

The list accepts optional `kind`, `level` and `collection` filters. When an
unqualified detail route matches more than one resource, Local takes precedence
over Core, matching appearance resolution.

## Artefacts

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/users` | List artefact users and the configured current user |
| `GET` | `/api/artifacts` | List artefacts for the selected user |
| `GET` | `/api/artifacts/:kind/:id` | Return manifest, resolved appearance and related issues |
| `GET` | `/api/artifacts/:kind/:id/appearance-options` | Return current appearance, choices and slots |
| `PUT` | `/api/artifacts/:kind/:id/appearance` | Save an artefact-default appearance, export and checkpoint |
| `GET` | `/api/artifacts/:kind/:id/export-status` | Validate/build and report standalone-export metadata |
| `GET` | `/api/artifacts/:kind/:id/preview` | Return standalone HTML inline |
| `GET` | `/api/artifacts/:kind/:id/download` | Download standalone HTML |

The appearance mutation is same-origin only. Its JSON body is:

```json
{
  "appearance": {},
  "expectedRevision": "<64-character workspace revision>"
}
```

`expectedRevision` provides optimistic concurrency protection. Unknown body
properties are rejected.

## Validation

`POST /api/validation` runs consolidated validation. The JSON body may contain:

```json
{
  "artifactId": "optional-id",
  "artifactKind": "dashboard",
  "validateExports": true,
  "validateRecipes": true,
  "minify": false,
  "maxBytes": 52428800,
  "failOnWarning": false
}
```

All properties are optional. Unknown properties and invalid types are rejected.

## Navigator routes

The human interface is outside `/api`: `/`, `/dashboards`, `/presentations`,
`/concepts`, `/components`, `/settings`, `/view/:kind/:id` and
`/components/:kind/:id`. Static Navigator assets are served from `/navigator`.
