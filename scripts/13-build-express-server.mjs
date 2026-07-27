#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 13: Build Express server foundation
 *
 * Adds a read-only HTTP interface over existing shared services:
 *
 *   GET  /api
 *   GET  /api/health
 *   GET  /api/capabilities
 *   GET  /api/library
 *   GET  /api/library/:kind/:id
 *   GET  /api/artifacts
 *   GET  /api/artifacts/:kind/:id
 *   GET  /api/artifacts/:kind/:id/preview
 *   POST /api/validation
 *   GET  /api/git/status
 *
 * Usage:
 *   node scripts/13-build-express-server.mjs
 *   node scripts/13-build-express-server.mjs --dry-run
 *   node scripts/13-build-express-server.mjs --no-commit
 *   node scripts/13-build-express-server.mjs --no-push
 *   node scripts/13-build-express-server.mjs --json
 *   node scripts/13-build-express-server.mjs --target /path/to/my-dashboards
 */

import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import process from "node:process";

const SCRIPT_NAME = "13-build-express-server";
const COMMIT_MESSAGE = "Add Express server foundation";
const MIN_NODE_MAJOR = 20;
const FILES = {"src/workspace/capabilities.mjs": {"content": "export function getWorkspaceCapabilities(options = {}) {\n  return {\n    schemaVersion: 1,\n    product: {\n      name: options.name ?? \"My Dashboards\",\n      version: options.version ?? \"0.0.0\",\n    },\n    runtime: {\n      node: process.versions.node,\n      readOnlyHttp: true,\n    },\n    features: [\n      {\n        id: \"office.excel\",\n        title: \"Excel inspection\",\n        available: true,\n        formats: [\"xlsx\", \"xlsm\"],\n      },\n      {\n        id: \"office.powerpoint\",\n        title: \"PowerPoint inspection\",\n        available: true,\n        formats: [\"pptx\", \"pptm\"],\n      },\n      {\n        id: \"data.utilities\",\n        title: \"CSV, JSON and NDJSON utilities\",\n        available: true,\n        formats: [\"csv\", \"json\", \"ndjson\", \"jsonl\"],\n      },\n      {\n        id: \"library.discovery\",\n        title: \"Filesystem library discovery\",\n        available: true,\n      },\n      {\n        id: \"appearance.resolution\",\n        title: \"Appearance and dependency resolution\",\n        available: true,\n      },\n      {\n        id: \"artifact.standalone-export\",\n        title: \"Standalone HTML export\",\n        available: true,\n        fileProtocolCompatible: true,\n      },\n      {\n        id: \"workspace.validation\",\n        title: \"Consolidated validation\",\n        available: true,\n      },\n      {\n        id: \"git.checkpoint\",\n        title: \"Constrained Git checkpoints\",\n        available: true,\n        exposedOverHttp: false,\n      },\n    ],\n  };\n}\n"}, "server/http.mjs": {"content": "export class HttpError extends Error {\n  constructor(status, code, message, options = {}) {\n    super(message);\n    this.name = \"HttpError\";\n    this.status = status;\n    this.code = code;\n    this.details = options.details ?? null;\n    this.expose = options.expose ?? status < 500;\n  }\n}\n\nexport function asyncRoute(handler) {\n  return function wrappedRoute(request, response, next) {\n    Promise.resolve(handler(request, response, next)).catch(next);\n  };\n}\n\nexport function sendJson(response, data, options = {}) {\n  const durationMs = elapsedMilliseconds(\n    response.locals.requestStartedAt,\n  );\n\n  response.status(options.status ?? 200).json({\n    ok: true,\n    data,\n    meta: {\n      requestId: response.locals.requestId,\n      durationMs,\n    },\n  });\n}\n\nexport function sendError(response, error) {\n  const durationMs = elapsedMilliseconds(\n    response.locals.requestStartedAt,\n  );\n\n  response.status(error.status).json({\n    ok: false,\n    error: {\n      code: error.code,\n      message: error.message,\n      ...(error.details ? { details: error.details } : {}),\n    },\n    meta: {\n      requestId: response.locals.requestId,\n      durationMs,\n    },\n  });\n}\n\nexport function stringQuery(value, name, options = {}) {\n  if (value === undefined) return options.defaultValue;\n\n  if (Array.isArray(value) || typeof value !== \"string\") {\n    throw new HttpError(\n      400,\n      \"INVALID_QUERY_PARAMETER\",\n      `Query parameter ${name} must be a single string.`,\n    );\n  }\n\n  const result = value.trim();\n\n  if (!result && options.allowEmpty !== true) {\n    throw new HttpError(\n      400,\n      \"INVALID_QUERY_PARAMETER\",\n      `Query parameter ${name} cannot be empty.`,\n    );\n  }\n\n  return result;\n}\n\nexport function booleanQuery(value, name, defaultValue = false) {\n  if (value === undefined) return defaultValue;\n  const text = stringQuery(value, name).toLowerCase();\n\n  if ([\"true\", \"1\", \"yes\"].includes(text)) return true;\n  if ([\"false\", \"0\", \"no\"].includes(text)) return false;\n\n  throw new HttpError(\n    400,\n    \"INVALID_QUERY_PARAMETER\",\n    `Query parameter ${name} must be true or false.`,\n  );\n}\n\nexport function integerQuery(\n  value,\n  name,\n  options = {},\n) {\n  if (value === undefined) return options.defaultValue;\n\n  const text = stringQuery(value, name);\n  if (!/^\\d+$/.test(text)) {\n    throw new HttpError(\n      400,\n      \"INVALID_QUERY_PARAMETER\",\n      `Query parameter ${name} must be an integer.`,\n    );\n  }\n\n  const parsed = Number.parseInt(text, 10);\n  const minimum = options.minimum ?? 0;\n  const maximum =\n    options.maximum ?? Number.MAX_SAFE_INTEGER;\n\n  if (parsed < minimum || parsed > maximum) {\n    throw new HttpError(\n      400,\n      \"INVALID_QUERY_PARAMETER\",\n      `Query parameter ${name} must be between ${minimum} and ${maximum}.`,\n    );\n  }\n\n  return parsed;\n}\n\nexport function requireIdentifier(value, name) {\n  if (\n    typeof value !== \"string\" ||\n    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(value)\n  ) {\n    throw new HttpError(\n      400,\n      \"INVALID_PATH_PARAMETER\",\n      `Path parameter ${name} must be a kebab-case identifier.`,\n    );\n  }\n\n  return value;\n}\n\nfunction elapsedMilliseconds(startedAt) {\n  if (typeof startedAt !== \"bigint\") return 0;\n  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;\n}\n"}, "server/middleware/request-context.mjs": {"content": "import {\n  randomUUID,\n} from \"node:crypto\";\n\nconst REQUEST_ID_PATTERN =\n  /^[A-Za-z0-9._-]{1,100}$/;\n\nexport function requestContext(options = {}) {\n  const now = options.now ?? (() => new Date());\n  const logger = options.logger ?? (() => {});\n\n  return function requestContextMiddleware(\n    request,\n    response,\n    next,\n  ) {\n    const candidate =\n      request.get(\"x-request-id\");\n    const requestId =\n      candidate &&\n      REQUEST_ID_PATTERN.test(candidate)\n        ? candidate\n        : randomUUID();\n    const startedAt =\n      process.hrtime.bigint();\n\n    response.locals.requestId = requestId;\n    response.locals.requestStartedAt = startedAt;\n    response.setHeader(\n      \"X-Request-Id\",\n      requestId,\n    );\n\n    response.on(\"finish\", () => {\n      logger({\n        timestamp: now().toISOString(),\n        level:\n          response.statusCode >= 500\n            ? \"error\"\n            : \"info\",\n        event: \"http.request\",\n        requestId,\n        method: request.method,\n        path: request.originalUrl,\n        statusCode: response.statusCode,\n        durationMs:\n          Number(\n            process.hrtime.bigint() -\n              startedAt,\n          ) / 1_000_000,\n      });\n    });\n\n    next();\n  };\n}\n"}, "server/middleware/security.mjs": {"content": "export function securityHeaders(\n  request,\n  response,\n  next,\n) {\n  response.setHeader(\n    \"X-Content-Type-Options\",\n    \"nosniff\",\n  );\n  response.setHeader(\n    \"Referrer-Policy\",\n    \"no-referrer\",\n  );\n  response.setHeader(\n    \"Cross-Origin-Resource-Policy\",\n    \"same-origin\",\n  );\n\n  if (request.path.startsWith(\"/api\")) {\n    response.setHeader(\n      \"Cache-Control\",\n      \"no-store\",\n    );\n  }\n\n  next();\n}\n"}, "server/middleware/errors.mjs": {"content": "import {\n  CliError,\n} from \"../../cli/errors.mjs\";\nimport {\n  GitSafetyError,\n} from \"../../src/git/errors.mjs\";\nimport {\n  HttpError,\n  sendError,\n} from \"../http.mjs\";\n\nexport function notFoundHandler(\n  request,\n  response,\n  next,\n) {\n  next(\n    new HttpError(\n      404,\n      \"ROUTE_NOT_FOUND\",\n      `No route matches ${request.method} ${request.originalUrl}.`,\n    ),\n  );\n}\n\nexport function errorHandler(options = {}) {\n  const logger = options.logger ?? (() => {});\n\n  return function handleError(\n    error,\n    request,\n    response,\n    next,\n  ) {\n    if (response.headersSent) {\n      next(error);\n      return;\n    }\n\n    const mapped = mapError(error);\n\n    if (mapped.status >= 500) {\n      logger({\n        timestamp: new Date().toISOString(),\n        level: \"error\",\n        event: \"http.error\",\n        requestId:\n          response.locals.requestId ?? null,\n        method: request.method,\n        path: request.originalUrl,\n        code: mapped.code,\n        message: error?.message ?? String(error),\n        stack:\n          error instanceof Error\n            ? error.stack\n            : null,\n      });\n    }\n\n    sendError(response, mapped);\n  };\n}\n\nfunction mapError(error) {\n  if (error instanceof HttpError) {\n    return error;\n  }\n\n  if (\n    error?.type === \"entity.parse.failed\"\n  ) {\n    return new HttpError(\n      400,\n      \"INVALID_JSON_BODY\",\n      \"The request body is not valid JSON.\",\n    );\n  }\n\n  if (\n    error?.type === \"entity.too.large\"\n  ) {\n    return new HttpError(\n      413,\n      \"REQUEST_BODY_TOO_LARGE\",\n      \"The JSON request body exceeds 64 KiB.\",\n    );\n  }\n\n  if (error instanceof CliError) {\n    const status =\n      /NOT_FOUND/.test(error.code)\n        ? 404\n        : error.exitCode === 3\n          ? 422\n          : 400;\n\n    return new HttpError(\n      status,\n      error.code,\n      error.message,\n      {\n        details: error.details,\n      },\n    );\n  }\n\n  if (error instanceof GitSafetyError) {\n    return new HttpError(\n      error.exitCode === 3 ? 422 : 409,\n      error.code,\n      error.message,\n      {\n        details: error.details,\n      },\n    );\n  }\n\n  if (\n    error?.code ===\n      \"STANDALONE_EXPORT_INVALID\" ||\n    error?.code ===\n      \"ARTIFACT_ENTRY_INVALID\" ||\n    error?.code ===\n      \"ARTIFACT_ENTRY_NOT_HTML\"\n  ) {\n    return new HttpError(\n      422,\n      error.code,\n      error.message,\n      {\n        details:\n          error.validation ?? null,\n      },\n    );\n  }\n\n  return new HttpError(\n    500,\n    \"INTERNAL_SERVER_ERROR\",\n    \"The server could not complete the request.\",\n    {\n      expose: false,\n    },\n  );\n}\n"}, "server/routes/health.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  asyncRoute,\n  sendJson,\n} from \"../http.mjs\";\n\nexport function createHealthRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/health\",\n    asyncRoute(async (request, response) => {\n      sendJson(response, {\n        status: \"ok\",\n        service: \"my-dashboards\",\n        version:\n          context.packageMetadata.version,\n        workspace: {\n          id: context.config.id,\n          name: context.config.name,\n        },\n        startedAt:\n          context.startedAt.toISOString(),\n        currentTime:\n          context.now().toISOString(),\n        uptimeSeconds:\n          Math.max(\n            0,\n            Math.floor(\n              (context.now().getTime() -\n                context.startedAt.getTime()) /\n                1000,\n            ),\n          ),\n      });\n    }),\n  );\n\n  return router;\n}\n"}, "server/routes/capabilities.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  asyncRoute,\n  sendJson,\n} from \"../http.mjs\";\nimport {\n  getWorkspaceCapabilities,\n} from \"../../src/workspace/capabilities.mjs\";\n\nexport function createCapabilitiesRouter(\n  context,\n) {\n  const router = Router();\n\n  router.get(\n    \"/\",\n    asyncRoute(async (request, response) => {\n      sendJson(response, {\n        service: {\n          name: \"My Dashboards API\",\n          version:\n            context.packageMetadata.version,\n        },\n        links: {\n          health: \"/api/health\",\n          capabilities:\n            \"/api/capabilities\",\n          library: \"/api/library\",\n          artifacts: \"/api/artifacts\",\n          validation: \"/api/validation\",\n          gitStatus: \"/api/git/status\",\n        },\n      });\n    }),\n  );\n\n  router.get(\n    \"/capabilities\",\n    asyncRoute(async (request, response) => {\n      sendJson(\n        response,\n        getWorkspaceCapabilities({\n          name: context.config.name,\n          version:\n            context.packageMetadata.version,\n        }),\n      );\n    }),\n  );\n\n  return router;\n}\n"}, "server/routes/library.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  buildConsumerGraph,\n  consumersForEntry,\n  dependenciesForEntry,\n} from \"../../src/library/consumers.mjs\";\nimport {\n  findLibraryEntries,\n  scanWorkspaceLibrary,\n} from \"../../src/library/scan.mjs\";\nimport {\n  HttpError,\n  asyncRoute,\n  requireIdentifier,\n  sendJson,\n  stringQuery,\n} from \"../http.mjs\";\n\nexport function createLibraryRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/library\",\n    asyncRoute(async (request, response) => {\n      const scan =\n        await scanWorkspaceLibrary(\n          context.workspaceRoot,\n        );\n      const filters = {\n        kind: stringQuery(\n          request.query.kind,\n          \"kind\",\n        ),\n        level: stringQuery(\n          request.query.level,\n          \"level\",\n        ),\n        collection: stringQuery(\n          request.query.collection,\n          \"collection\",\n        ),\n      };\n      const entries = findLibraryEntries(\n        scan.entries,\n        filters,\n      );\n\n      sendJson(response, {\n        summary: scan.summary,\n        filters,\n        entries: entries.map(publicEntry),\n        issues: scan.issues,\n      });\n    }),\n  );\n\n  router.get(\n    \"/library/:kind/:id\",\n    asyncRoute(async (request, response) => {\n      const kind = requireIdentifier(\n        request.params.kind,\n        \"kind\",\n      );\n      const id = requireIdentifier(\n        request.params.id,\n        \"id\",\n      );\n      const scan =\n        await scanWorkspaceLibrary(\n          context.workspaceRoot,\n        );\n      const matches = scan.entries.filter(\n        (entry) =>\n          entry.id === id &&\n          (entry.kind === kind ||\n            entry.category === kind),\n      );\n\n      if (matches.length === 0) {\n        throw new HttpError(\n          404,\n          \"LIBRARY_ENTRY_NOT_FOUND\",\n          `No library entry found for ${kind}:${id}.`,\n        );\n      }\n\n      if (matches.length > 1) {\n        throw new HttpError(\n          409,\n          \"AMBIGUOUS_LIBRARY_ENTRY\",\n          `Multiple library entries match ${kind}:${id}.`,\n          {\n            details: {\n              matches: matches.map(publicEntry),\n            },\n          },\n        );\n      }\n\n      const entry = matches[0];\n      const graph =\n        buildConsumerGraph(scan);\n\n      sendJson(response, {\n        entry: {\n          ...publicEntry(entry),\n          manifest: entry.manifest,\n        },\n        consumers:\n          consumersForEntry(entry, graph),\n        dependencies:\n          dependenciesForEntry(entry, graph),\n        issues: scan.issues.filter(\n          (issue) =>\n            issue.manifestPath ===\n              entry.manifestPath ||\n            issue.targetManifestPath ===\n              entry.manifestPath,\n        ),\n      });\n    }),\n  );\n\n  return router;\n}\n\nfunction publicEntry(entry) {\n  return {\n    id: entry.id,\n    kind: entry.kind,\n    category: entry.category,\n    title: entry.title,\n    level: entry.level,\n    collection: entry.collection,\n    ownerArtifact:\n      entry.ownerArtifact,\n    displayPath: entry.displayPath,\n    manifestPath: entry.manifestPath,\n  };\n}\n"}, "server/routes/artifacts.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  scanWorkspaceLibrary,\n} from \"../../src/library/scan.mjs\";\nimport {\n  findArtifact,\n} from \"../../src/resolution/find-artifact.mjs\";\nimport {\n  resolveArtifactAppearance,\n} from \"../../src/resolution/resolve.mjs\";\nimport {\n  buildStandaloneArtifact,\n} from \"../../src/export/export-artifact.mjs\";\nimport {\n  HttpError,\n  asyncRoute,\n  booleanQuery,\n  integerQuery,\n  requireIdentifier,\n  sendJson,\n} from \"../http.mjs\";\n\nconst DEFAULT_MAX_BYTES =\n  50 * 1024 * 1024;\n\nexport function createArtifactsRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/artifacts\",\n    asyncRoute(async (request, response) => {\n      const scan =\n        await scanWorkspaceLibrary(\n          context.workspaceRoot,\n        );\n      const artifacts = scan.entries\n        .filter(\n          (entry) =>\n            entry.category === \"artifact\",\n        )\n        .map(publicArtifact);\n\n      sendJson(response, {\n        artifacts,\n        count: artifacts.length,\n        librarySummary: scan.summary,\n      });\n    }),\n  );\n\n  router.get(\n    \"/artifacts/:kind/:id\",\n    asyncRoute(async (request, response) => {\n      const { scan, artifact, resolution } =\n        await loadArtifact(\n          context,\n          request.params,\n        );\n\n      sendJson(response, {\n        artifact: {\n          ...publicArtifact(artifact),\n          manifest: artifact.manifest,\n        },\n        resolution,\n        relatedIssues: scan.issues.filter(\n          (issue) =>\n            issue.manifestPath ===\n              artifact.manifestPath,\n        ),\n      });\n    }),\n  );\n\n  router.get(\n    \"/artifacts/:kind/:id/preview\",\n    asyncRoute(async (request, response) => {\n      const { scan, artifact, resolution } =\n        await loadArtifact(\n          context,\n          request.params,\n        );\n\n      if (!resolution.summary.valid) {\n        throw new HttpError(\n          422,\n          \"APPEARANCE_INVALID\",\n          `Artefact ${artifact.kind}:${artifact.id} has unresolved appearance errors.`,\n          {\n            details: {\n              issues: resolution.issues,\n            },\n          },\n        );\n      }\n\n      const minify = booleanQuery(\n        request.query.minify,\n        \"minify\",\n        false,\n      );\n      const maxBytes = integerQuery(\n        request.query.maxBytes,\n        \"maxBytes\",\n        {\n          minimum: 1024,\n          maximum:\n            200 * 1024 * 1024,\n          defaultValue:\n            DEFAULT_MAX_BYTES,\n        },\n      );\n      const built =\n        await buildStandaloneArtifact({\n          workspaceRoot:\n            context.workspaceRoot,\n          scan,\n          artifact,\n          resolution,\n          minify,\n          maxBytes,\n        });\n\n      response.status(200);\n      response.type(\"html\");\n      response.setHeader(\n        \"Content-Disposition\",\n        `inline; filename=\"${safeFilename(\n          artifact.id,\n        )}.html\"`,\n      );\n      response.setHeader(\n        \"ETag\",\n        `\"sha256-${built.sha256}\"`,\n      );\n      response.setHeader(\n        \"X-MyDash-SHA256\",\n        built.sha256,\n      );\n      response.setHeader(\n        \"X-MyDash-Artifact\",\n        `${artifact.kind}:${artifact.id}`,\n      );\n      response.send(built.html);\n    }),\n  );\n\n  return router;\n}\n\nasync function loadArtifact(\n  context,\n  params,\n) {\n  const kind = requireIdentifier(\n    params.kind,\n    \"kind\",\n  );\n  const id = requireIdentifier(\n    params.id,\n    \"id\",\n  );\n  const scan =\n    await scanWorkspaceLibrary(\n      context.workspaceRoot,\n    );\n  const artifact = findArtifact(\n    scan,\n    id,\n    kind,\n  );\n  const resolution =\n    resolveArtifactAppearance(\n      scan,\n      artifact,\n    );\n\n  return {\n    scan,\n    artifact,\n    resolution,\n  };\n}\n\nfunction publicArtifact(entry) {\n  return {\n    id: entry.id,\n    kind: entry.kind,\n    title: entry.title,\n    displayPath: entry.displayPath,\n    manifestPath: entry.manifestPath,\n  };\n}\n\nfunction safeFilename(value) {\n  return value.replace(\n    /[^a-z0-9-]/gi,\n    \"-\",\n  );\n}\n"}, "server/routes/validation.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  validateWorkspace,\n} from \"../../src/validation/workspace-validation.mjs\";\nimport {\n  HttpError,\n  asyncRoute,\n  sendJson,\n} from \"../http.mjs\";\n\nconst DEFAULT_MAX_BYTES =\n  50 * 1024 * 1024;\n\nexport function createValidationRouter(context) {\n  const router = Router();\n\n  router.post(\n    \"/validation\",\n    asyncRoute(async (request, response) => {\n      const body =\n        request.body &&\n        typeof request.body === \"object\" &&\n        !Array.isArray(request.body)\n          ? request.body\n          : {};\n\n      const options =\n        validateBody(body);\n      const report =\n        await validateWorkspace({\n          workspaceRoot:\n            context.workspaceRoot,\n          artifactId:\n            options.artifactId,\n          artifactKind:\n            options.artifactKind,\n          validateExports:\n            options.validateExports,\n          validateRecipes:\n            options.validateRecipes,\n          minify: options.minify,\n          maxBytes: options.maxBytes,\n          failOnWarning:\n            options.failOnWarning,\n          now: context.now,\n        });\n\n      sendJson(response, report);\n    }),\n  );\n\n  return router;\n}\n\nfunction validateBody(body) {\n  const allowed = new Set([\n    \"artifactId\",\n    \"artifactKind\",\n    \"validateExports\",\n    \"validateRecipes\",\n    \"minify\",\n    \"maxBytes\",\n    \"failOnWarning\",\n  ]);\n  const unknown =\n    Object.keys(body).filter(\n      (key) => !allowed.has(key),\n    );\n\n  if (unknown.length > 0) {\n    throw new HttpError(\n      400,\n      \"UNKNOWN_VALIDATION_OPTIONS\",\n      `Unknown validation options: ${unknown.join(\", \")}.`,\n    );\n  }\n\n  return {\n    artifactId: optionalIdentifier(\n      body.artifactId,\n      \"artifactId\",\n    ),\n    artifactKind: optionalIdentifier(\n      body.artifactKind,\n      \"artifactKind\",\n    ),\n    validateExports: optionalBoolean(\n      body.validateExports,\n      \"validateExports\",\n      true,\n    ),\n    validateRecipes: optionalBoolean(\n      body.validateRecipes,\n      \"validateRecipes\",\n      true,\n    ),\n    minify: optionalBoolean(\n      body.minify,\n      \"minify\",\n      false,\n    ),\n    maxBytes: optionalInteger(\n      body.maxBytes,\n      \"maxBytes\",\n      DEFAULT_MAX_BYTES,\n    ),\n    failOnWarning: optionalBoolean(\n      body.failOnWarning,\n      \"failOnWarning\",\n      false,\n    ),\n  };\n}\n\nfunction optionalIdentifier(value, name) {\n  if (value === undefined || value === null) {\n    return null;\n  }\n\n  if (\n    typeof value !== \"string\" ||\n    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(\n      value,\n    )\n  ) {\n    throw new HttpError(\n      400,\n      \"INVALID_VALIDATION_OPTION\",\n      `${name} must be a kebab-case identifier.`,\n    );\n  }\n\n  return value;\n}\n\nfunction optionalBoolean(\n  value,\n  name,\n  defaultValue,\n) {\n  if (value === undefined) {\n    return defaultValue;\n  }\n\n  if (typeof value !== \"boolean\") {\n    throw new HttpError(\n      400,\n      \"INVALID_VALIDATION_OPTION\",\n      `${name} must be a boolean.`,\n    );\n  }\n\n  return value;\n}\n\nfunction optionalInteger(\n  value,\n  name,\n  defaultValue,\n) {\n  if (value === undefined) {\n    return defaultValue;\n  }\n\n  if (\n    !Number.isInteger(value) ||\n    value < 1024 ||\n    value > 200 * 1024 * 1024\n  ) {\n    throw new HttpError(\n      400,\n      \"INVALID_VALIDATION_OPTION\",\n      `${name} must be an integer between 1024 and ${200 * 1024 * 1024}.`,\n    );\n  }\n\n  return value;\n}\n"}, "server/routes/git.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  getRepositoryStatus,\n} from \"../../src/git/status.mjs\";\nimport {\n  asyncRoute,\n  sendJson,\n} from \"../http.mjs\";\n\nexport function createGitRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/git/status\",\n    asyncRoute(async (request, response) => {\n      const status =\n        await getRepositoryStatus(\n          context.workspaceRoot,\n        );\n\n      sendJson(response, status);\n    }),\n  );\n\n  return router;\n}\n"}, "server/routes/index.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  createArtifactsRouter,\n} from \"./artifacts.mjs\";\nimport {\n  createCapabilitiesRouter,\n} from \"./capabilities.mjs\";\nimport {\n  createGitRouter,\n} from \"./git.mjs\";\nimport {\n  createHealthRouter,\n} from \"./health.mjs\";\nimport {\n  createLibraryRouter,\n} from \"./library.mjs\";\nimport {\n  createValidationRouter,\n} from \"./validation.mjs\";\n\nexport function createApiRouter(context) {\n  const router = Router();\n\n  router.use(\n    createCapabilitiesRouter(context),\n  );\n  router.use(\n    createHealthRouter(context),\n  );\n  router.use(\n    createLibraryRouter(context),\n  );\n  router.use(\n    createArtifactsRouter(context),\n  );\n  router.use(\n    createValidationRouter(context),\n  );\n  router.use(\n    createGitRouter(context),\n  );\n\n  return router;\n}\n"}, "server/app.mjs": {"content": "import express from \"express\";\nimport {\n  loadWorkspaceConfig,\n} from \"../src/workspace/load-config.mjs\";\nimport {\n  loadPackageMetadata,\n} from \"../src/workspace/package-metadata.mjs\";\nimport {\n  errorHandler,\n  notFoundHandler,\n} from \"./middleware/errors.mjs\";\nimport {\n  requestContext,\n} from \"./middleware/request-context.mjs\";\nimport {\n  securityHeaders,\n} from \"./middleware/security.mjs\";\nimport {\n  createApiRouter,\n} from \"./routes/index.mjs\";\n\nexport async function createApplication(\n  options,\n) {\n  const workspaceRoot =\n    options.workspaceRoot;\n  const now =\n    options.now ?? (() => new Date());\n  const logger =\n    options.logger ?? defaultLogger;\n  const config =\n    options.config ??\n    (await loadWorkspaceConfig(\n      workspaceRoot,\n    ));\n  const packageMetadata =\n    options.packageMetadata ??\n    (await loadPackageMetadata(\n      workspaceRoot,\n    ));\n  const startedAt =\n    options.startedAt ?? now();\n  const context = {\n    workspaceRoot,\n    config,\n    packageMetadata,\n    now,\n    startedAt,\n    logger,\n  };\n  const app = express();\n\n  app.disable(\"x-powered-by\");\n  app.set(\"query parser\", \"simple\");\n  app.use(\n    requestContext({\n      now,\n      logger,\n    }),\n  );\n  app.use(securityHeaders);\n  app.use(\n    \"/api\",\n    express.json({\n      limit: \"64kb\",\n      strict: true,\n      type: \"application/json\",\n    }),\n  );\n\n  app.get(\"/\", (request, response) => {\n    response.redirect(307, \"/api\");\n  });\n  app.use(\n    \"/api\",\n    createApiRouter(context),\n  );\n  app.use(notFoundHandler);\n  app.use(\n    errorHandler({ logger }),\n  );\n\n  return {\n    app,\n    context,\n  };\n}\n\nfunction defaultLogger(record) {\n  process.stdout.write(\n    `${JSON.stringify(record)}\\n`,\n  );\n}\n"}, "server/start.mjs": {"content": "import {\n  createServer,\n} from \"node:http\";\nimport process from \"node:process\";\nimport {\n  resolve,\n} from \"node:path\";\nimport {\n  createApplication,\n} from \"./app.mjs\";\n\nexport async function startApplicationServer(\n  options = {},\n) {\n  const workspaceRoot = resolve(\n    options.workspaceRoot ??\n      process.cwd(),\n  );\n  const created =\n    await createApplication({\n      workspaceRoot,\n      logger:\n        options.logger,\n      now: options.now,\n    });\n  const host =\n    options.host ??\n    process.env.MYDASH_HOST ??\n    created.context.config.preview.host ??\n    \"127.0.0.1\";\n  const port = parsePort(\n    options.port ??\n      process.env.MYDASH_PORT ??\n      created.context.config.preview.port ??\n      4173,\n  );\n  const server = createServer(\n    created.app,\n  );\n\n  server.requestTimeout = 120_000;\n  server.headersTimeout = 15_000;\n  server.keepAliveTimeout = 5_000;\n\n  await new Promise(\n    (resolvePromise, reject) => {\n      server.once(\"error\", reject);\n      server.listen(\n        port,\n        host,\n        () => {\n          server.off(\"error\", reject);\n          resolvePromise();\n        },\n      );\n    },\n  );\n\n  const address = server.address();\n  const actualPort =\n    typeof address === \"object\" &&\n    address\n      ? address.port\n      : port;\n  const logger =\n    options.logger ??\n    ((record) =>\n      process.stdout.write(\n        `${JSON.stringify(record)}\\n`,\n      ));\n\n  logger({\n    timestamp: new Date().toISOString(),\n    level: \"info\",\n    event: \"server.started\",\n    host,\n    port: actualPort,\n    workspaceRoot,\n  });\n\n  if (options.installSignalHandlers !== false) {\n    installShutdownHandlers(\n      server,\n      logger,\n    );\n  }\n\n  return {\n    server,\n    app: created.app,\n    context: created.context,\n    host,\n    port: actualPort,\n    url: `http://${formatHost(host)}:${actualPort}`,\n  };\n}\n\nfunction installShutdownHandlers(\n  server,\n  logger,\n) {\n  let closing = false;\n\n  const shutdown = (signal) => {\n    if (closing) return;\n    closing = true;\n\n    logger({\n      timestamp: new Date().toISOString(),\n      level: \"info\",\n      event: \"server.stopping\",\n      signal,\n    });\n\n    const timer = setTimeout(() => {\n      server.closeAllConnections?.();\n    }, 10_000);\n    timer.unref();\n\n    server.close((error) => {\n      clearTimeout(timer);\n\n      if (error) {\n        logger({\n          timestamp:\n            new Date().toISOString(),\n          level: \"error\",\n          event: \"server.stop.failed\",\n          message: error.message,\n        });\n        process.exitCode = 1;\n      } else {\n        logger({\n          timestamp:\n            new Date().toISOString(),\n          level: \"info\",\n          event: \"server.stopped\",\n        });\n      }\n    });\n  };\n\n  process.once(\n    \"SIGINT\",\n    () => shutdown(\"SIGINT\"),\n  );\n  process.once(\n    \"SIGTERM\",\n    () => shutdown(\"SIGTERM\"),\n  );\n}\n\nfunction parsePort(value) {\n  const text = String(value);\n\n  if (!/^\\d+$/.test(text)) {\n    throw new Error(\n      `Server port must be an integer. Received: ${value}`,\n    );\n  }\n\n  const port = Number.parseInt(text, 10);\n\n  if (port < 0 || port > 65535) {\n    throw new Error(\n      `Server port must be between 0 and 65535. Received: ${value}`,\n    );\n  }\n\n  return port;\n}\n\nfunction formatHost(host) {\n  return host.includes(\":\")\n    ? `[${host}]`\n    : host;\n}\n\nif (\n  import.meta.url ===\n  `file://${process.argv[1]}`\n) {\n  await startApplicationServer();\n}\n"}, "server/README.md": {"content": "# HTTP server\n\nThe server is a thin Express interface over the same shared services used by the\nCLI. It does not reimplement discovery, resolution, export, validation or Git\nlogic.\n\n## Start\n\n```text\nnpm start\n```\n\nThe default address comes from `config/workspace.json`:\n\n```text\nhttp://127.0.0.1:4173\n```\n\nEnvironment overrides:\n\n```text\nMYDASH_HOST=127.0.0.1\nMYDASH_PORT=4173\n```\n\n## API\n\n```text\nGET  /api\nGET  /api/health\nGET  /api/capabilities\n\nGET  /api/library\nGET  /api/library/:kind/:id\n\nGET  /api/artifacts\nGET  /api/artifacts/:kind/:id\nGET  /api/artifacts/:kind/:id/preview\n\nPOST /api/validation\n\nGET  /api/git/status\n```\n\nThe server is deliberately read-only at this stage. Preview and validation\nbuilds happen in memory. It does not expose file writes, recipe refreshes,\nexports to disk, Git commits or pushes.\n\n## Response envelope\n\nJSON responses use:\n\n```json\n{\n  \"ok\": true,\n  \"data\": {},\n  \"meta\": {\n    \"requestId\": \"uuid\",\n    \"durationMs\": 3\n  }\n}\n```\n\nErrors use the same metadata with an `error` object.\n\n## Security\n\n- `X-Powered-By` is disabled.\n- API responses are not cached.\n- JSON request bodies are limited to 64 KiB.\n- Request IDs are validated before reuse.\n- The default host is loopback-only.\n- No CORS middleware is installed.\n- Preview HTML is generated through the standalone export validator.\n", "allowedPrevious": ["# HTTP server\n\nThis directory will contain the lightweight Express interface used by the navigator.\n\nThe server will call the same shared services as the CLI. It must not become a second implementation of discovery, resolution, export or validation.\n"]}, "scripts/tasks/start.mjs": {"content": "#!/usr/bin/env node\n\nimport {\n  startApplicationServer,\n} from \"../../server/start.mjs\";\n\nawait startApplicationServer();\n", "allowedPrevious": ["#!/usr/bin/env node\n\nconsole.error(\n  \"The application server is not installed yet. Continue the bootstrap sequence first.\",\n);\nprocess.exitCode = 2;\n"]}, "tests/integration/server.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  createServer,\n} from \"node:http\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport test from \"node:test\";\nimport {\n  createApplication,\n} from \"../../server/app.mjs\";\n\nconst testDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  testDirectory,\n  \"../..\",\n);\nconst workspaceRoot = resolve(\n  projectRoot,\n  \"tests\",\n  \"fixtures\",\n  \"export-workspace\",\n);\n\ntest(\"health and capabilities expose the server foundation\", async () => {\n  await withServer(async (baseUrl) => {\n    const health = await getJson(\n      `${baseUrl}/api/health`,\n    );\n    const capabilities = await getJson(\n      `${baseUrl}/api/capabilities`,\n    );\n\n    assert.equal(health.response.status, 200);\n    assert.equal(health.body.ok, true);\n    assert.equal(\n      health.body.data.status,\n      \"ok\",\n    );\n    assert.match(\n      health.response.headers.get(\n        \"x-request-id\",\n      ),\n      /^[A-Za-z0-9._-]+$/,\n    );\n    assert.equal(\n      capabilities.body.data.runtime\n        .readOnlyHttp,\n      true,\n    );\n    assert.equal(\n      capabilities.body.data.features.some(\n        (feature) =>\n          feature.id ===\n          \"artifact.standalone-export\",\n      ),\n      true,\n    );\n  });\n});\n\ntest(\"library and artefact routes reuse discovery and resolution services\", async () => {\n  await withServer(async (baseUrl) => {\n    const library = await getJson(\n      `${baseUrl}/api/library?kind=component`,\n    );\n    const artifact = await getJson(\n      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline`,\n    );\n\n    assert.equal(\n      library.body.data.entries.length,\n      2,\n    );\n    assert.equal(\n      artifact.body.data.artifact.id,\n      \"use-case-pipeline\",\n    );\n    assert.equal(\n      artifact.body.data.resolution\n        .selections.components[\n          \"metric-summary\"\n        ].entry.level,\n      \"local\",\n    );\n  });\n});\n\ntest(\"preview route returns validated standalone HTML\", async () => {\n  await withServer(async (baseUrl) => {\n    const response = await fetch(\n      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/preview`,\n    );\n    const html = await response.text();\n\n    assert.equal(response.status, 200);\n    assert.match(\n      response.headers.get(\n        \"content-type\",\n      ),\n      /^text\\/html/,\n    );\n    assert.match(\n      response.headers.get(\n        \"x-mydash-sha256\",\n      ),\n      /^[a-f0-9]{64}$/,\n    );\n    assert.match(\n      html,\n      /data-mydash-standalone/,\n    );\n    assert.match(\n      html,\n      /Use Case Pipeline/,\n    );\n  });\n});\n\ntest(\"validation route returns an in-memory report\", async () => {\n  await withServer(async (baseUrl) => {\n    const response = await fetch(\n      `${baseUrl}/api/validation`,\n      {\n        method: \"POST\",\n        headers: {\n          \"content-type\":\n            \"application/json\",\n        },\n        body: JSON.stringify({\n          validateExports: false,\n          validateRecipes: true,\n        }),\n      },\n    );\n    const body = await response.json();\n\n    assert.equal(response.status, 200);\n    assert.equal(body.ok, true);\n    assert.equal(\n      body.data.summary.valid,\n      true,\n    );\n    assert.equal(\n      body.data.stages.exports.status,\n      \"skipped\",\n    );\n  });\n});\n\ntest(\"unknown routes and malformed JSON use the error envelope\", async () => {\n  await withServer(async (baseUrl) => {\n    const missing = await getJson(\n      `${baseUrl}/api/not-here`,\n    );\n    const malformed = await fetch(\n      `${baseUrl}/api/validation`,\n      {\n        method: \"POST\",\n        headers: {\n          \"content-type\":\n            \"application/json\",\n        },\n        body: \"{ invalid\",\n      },\n    );\n    const malformedBody =\n      await malformed.json();\n\n    assert.equal(\n      missing.response.status,\n      404,\n    );\n    assert.equal(\n      missing.body.error.code,\n      \"ROUTE_NOT_FOUND\",\n    );\n    assert.equal(\n      malformed.status,\n      400,\n    );\n    assert.equal(\n      malformedBody.error.code,\n      \"INVALID_JSON_BODY\",\n    );\n  });\n});\n\nasync function withServer(callback) {\n  const logs = [];\n  const created =\n    await createApplication({\n      workspaceRoot,\n      logger(record) {\n        logs.push(record);\n      },\n      now: () =>\n        new Date(\n          \"2026-07-26T12:00:00.000Z\",\n        ),\n      startedAt: new Date(\n        \"2026-07-26T11:00:00.000Z\",\n      ),\n    });\n  const server = createServer(\n    created.app,\n  );\n\n  await new Promise(\n    (resolvePromise, reject) => {\n      server.once(\"error\", reject);\n      server.listen(\n        0,\n        \"127.0.0.1\",\n        () => {\n          server.off(\"error\", reject);\n          resolvePromise();\n        },\n      );\n    },\n  );\n\n  const address = server.address();\n  const baseUrl =\n    `http://127.0.0.1:${address.port}`;\n\n  try {\n    await callback(baseUrl, logs);\n  } finally {\n    await new Promise(\n      (resolvePromise, reject) => {\n        server.close((error) => {\n          if (error) reject(error);\n          else resolvePromise();\n        });\n      },\n    );\n  }\n}\n\nasync function getJson(url) {\n  const response = await fetch(url);\n  return {\n    response,\n    body: await response.json(),\n  };\n}\n"}, "scripts/tasks/test-server.mjs": {"content": "#!/usr/bin/env node\n\nimport {\n  spawnSync,\n} from \"node:child_process\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  scriptDirectory,\n  \"../..\",\n);\n\nconst tests = [\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"integration\",\n    \"server.test.mjs\",\n  ),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n    maxBuffer:\n      64 * 1024 * 1024,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode = result.status ?? 1;\n"}};
const REQUIRED_DEPENDENCIES = {"express": "5.2.1"};

const args = parseBootstrapArgs(process.argv.slice(2));
const targetRoot = resolve(args.target ?? process.cwd());
const selfPath = resolve(fileURLToPath(import.meta.url));

const report = {
  ok: false,
  script: SCRIPT_NAME,
  targetRoot,
  dryRun: args.dryRun,
  created: [],
  updated: [],
  preserved: [],
  dependencies: [],
  warnings: [],
  validation: [],
  git: {
    commit: null,
    pushed: false,
    pushTarget: null,
  },
};

main().catch((error) => {
  report.warnings.push({
    code: "UNEXPECTED_FAILURE",
    message:
      error instanceof Error
        ? error.message
        : String(error),
  });
  finish(1);
});

async function main() {
  assertNodeVersion();
  await assertBootstrapFoundation();

  const repoRoot = getRepositoryRoot(targetRoot);
  if (!repoRoot || resolve(repoRoot) !== targetRoot) {
    throw new Error(
      "Bootstrap 13 must run from the root of the My Dashboards Git repository.",
    );
  }

  const dirtyBefore = getDirtyPaths(repoRoot);
  assertPackageFilesSafe(dirtyBefore);

  const ownedAbsolutePaths = [];

  if (!args.dryRun) {
    const packagePaths =
      await installDependencies();
    ownedAbsolutePaths.push(
      ...packagePaths,
    );
  } else {
    for (const [name, version] of Object.entries(
      REQUIRED_DEPENDENCIES,
    )) {
      report.dependencies.push(
        `${name}@${version}`,
      );
    }
    report.updated.push("package.json");
    report.updated.push("package-lock.json");
  }

  for (const [relativePath, descriptor] of Object.entries(FILES)) {
    const absolutePath = join(
      targetRoot,
      relativePath,
    );
    const result =
      await writeManagedFile({
        absolutePath,
        content: descriptor.content,
        allowedPrevious:
          descriptor.allowedPrevious ?? [],
        dirtyBefore,
        repoRoot,
      });

    if (
      result === "created" ||
      result === "updated"
    ) {
      ownedAbsolutePaths.push(
        absolutePath,
      );
    }
  }

  await validateGeneratedState();

  const expectedSelfPath = join(
    targetRoot,
    "scripts",
    "13-build-express-server.mjs",
  );

  if (
    selfPath === expectedSelfPath &&
    (await pathExists(selfPath))
  ) {
    ownedAbsolutePaths.push(selfPath);
  }

  if (!args.noCommit && !args.dryRun) {
    await checkpoint(
      repoRoot,
      uniquePaths(ownedAbsolutePaths),
    );
  } else if (args.noCommit) {
    report.warnings.push({
      code: "COMMIT_DISABLED",
      message:
        "The Express server was created and tested, but --no-commit disabled the Git checkpoint.",
    });
  }

  report.ok = true;
  finish(0);
}

function parseBootstrapArgs(argv) {
  const parsed = {
    target: null,
    dryRun: false,
    noCommit: false,
    noPush: false,
    json: false,
    help: false,
  };

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const value = argv[index];

    switch (value) {
      case "--target":
        index += 1;
        if (!argv[index]) {
          failArguments(
            "--target requires a directory path.",
          );
        }
        parsed.target = argv[index];
        break;
      case "--dry-run":
        parsed.dryRun = true;
        parsed.noCommit = true;
        parsed.noPush = true;
        break;
      case "--no-commit":
        parsed.noCommit = true;
        parsed.noPush = true;
        break;
      case "--no-push":
        parsed.noPush = true;
        break;
      case "--json":
        parsed.json = true;
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      default:
        failArguments(
          `Unknown argument: ${value}`,
        );
    }
  }

  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  return parsed;
}

function failArguments(message) {
  console.error(message);
  console.error(
    "Run with --help to see supported options.",
  );
  process.exit(2);
}

function printHelp() {
  console.log(`
My Dashboards — Bootstrap 13

Usage:
  node scripts/13-build-express-server.mjs [options]

Options:
  --target <path>  Build the server in a specific repository root.
  --dry-run        Report intended changes without installing or writing.
  --no-commit      Install, write and validate without committing.
  --no-push        Commit locally but do not push.
  --json           Return a machine-readable report.
  --help, -h       Show this help.
`.trim());
}

function assertNodeVersion() {
  const major = Number.parseInt(
    process.versions.node.split(".")[0],
    10,
  );

  if (
    !Number.isInteger(major) ||
    major < MIN_NODE_MAJOR
  ) {
    throw new Error(
      `Node.js ${MIN_NODE_MAJOR} or later is required. Found ${process.versions.node}.`,
    );
  }
}

async function assertBootstrapFoundation() {
  if (!args.dryRun) {
    await access(
      targetRoot,
      fsConstants.W_OK,
    );
  }

  const required = [
    "package.json",
    "package-lock.json",
    "bin/mydash.mjs",
    "src/workspace/load-config.mjs",
    "src/workspace/package-metadata.mjs",
    "src/library/scan.mjs",
    "src/library/consumers.mjs",
    "src/resolution/find-artifact.mjs",
    "src/resolution/resolve.mjs",
    "src/export/export-artifact.mjs",
    "src/validation/workspace-validation.mjs",
    "src/git/status.mjs",
    "scripts/tasks/start.mjs",
    "scripts/tasks/test-git.mjs",
    "server/README.md",
  ];

  const missing = [];

  for (const relativePath of required) {
    if (
      !(await pathExists(
        join(targetRoot, relativePath),
      ))
    ) {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      [
        "Bootstrap 12 has not been completed.",
        `Missing required paths: ${missing.join(", ")}`,
      ].join("\n"),
    );
  }
}

function assertPackageFilesSafe(dirtyBefore) {
  const unsafe = [
    "package.json",
    "package-lock.json",
  ].filter((path) =>
    dirtyBefore.has(path),
  );

  if (unsafe.length > 0) {
    throw new Error(
      [
        "Bootstrap 13 needs to install the pinned Express dependency.",
        `Commit or otherwise resolve existing changes in: ${unsafe.join(", ")}`,
        "The bootstrap refuses to merge dependency changes into unrelated package edits.",
      ].join("\n"),
    );
  }
}

async function installDependencies() {
  const packagePath = join(
    targetRoot,
    "package.json",
  );
  const lockPath = join(
    targetRoot,
    "package-lock.json",
  );
  const originalPackage = await readFile(
    packagePath,
    "utf8",
  );
  const originalLock = await readFile(
    lockPath,
  );

  let packageValue;

  try {
    packageValue = JSON.parse(
      originalPackage,
    );
  } catch {
    throw new Error(
      "package.json is not valid JSON and was not modified.",
    );
  }

  packageValue.dependencies ??= {};
  for (const [name, version] of Object.entries(
    REQUIRED_DEPENDENCIES,
  )) {
    packageValue.dependencies[name] =
      version;
    report.dependencies.push(
      `${name}@${version}`,
    );
  }

  packageValue.scripts ??= {};
  packageValue.scripts["test:server"] =
    "node scripts/tasks/test-server.mjs";

  await atomicWrite(
    packagePath,
    `${JSON.stringify(
      packageValue,
      null,
      2,
    )}\n`,
  );

  const install = run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
  );

  if (install.status !== 0) {
    await atomicWrite(
      packagePath,
      originalPackage,
    );
    await writeBinaryAtomic(
      lockPath,
      originalLock,
    );

    throw new Error(
      [
        "npm could not install Express.",
        install.stderr || install.stdout,
        "package.json and package-lock.json were restored.",
      ].join("\n"),
    );
  }

  report.updated.push("package.json");
  report.updated.push("package-lock.json");

  return [packagePath, lockPath];
}

async function writeManagedFile({
  absolutePath,
  content,
  allowedPrevious,
  dirtyBefore,
  repoRoot,
}) {
  const gitPath = relativeGitPath(
    repoRoot,
    absolutePath,
  );
  const exists =
    await pathExists(absolutePath);

  if (
    dirtyBefore.has(gitPath) &&
    absolutePath !== selfPath
  ) {
    report.preserved.push(gitPath);
    report.warnings.push({
      code: "PREEXISTING_FILE_CHANGES",
      message:
        `Preserved pre-existing changes in ${gitPath}.`,
    });
    return "preserved";
  }

  if (exists) {
    const current = await readFile(
      absolutePath,
      "utf8",
    );

    if (current === content) {
      report.preserved.push(gitPath);
      return "preserved";
    }

    if (!allowedPrevious.includes(current)) {
      report.preserved.push(gitPath);
      report.warnings.push({
        code: "EXISTING_FILE_PRESERVED",
        message:
          `${gitPath} already exists with different content and was not overwritten.`,
      });
      return "preserved";
    }

    if (args.dryRun) {
      report.updated.push(gitPath);
      return "updated";
    }

    await atomicWrite(
      absolutePath,
      content,
    );
    report.updated.push(gitPath);
    return "updated";
  }

  if (args.dryRun) {
    report.created.push(gitPath);
    return "created";
  }

  await atomicWrite(
    absolutePath,
    content,
  );
  report.created.push(gitPath);
  return "created";
}

async function validateGeneratedState() {
  if (args.dryRun) {
    report.validation.push({
      check: "dry-run",
      ok: true,
      message:
        "The Express server foundation was calculated without installing or writing it.",
    });
    return;
  }

  const modulePaths = [
    "src/workspace/capabilities.mjs",
    "server/http.mjs",
    "server/middleware/request-context.mjs",
    "server/middleware/security.mjs",
    "server/middleware/errors.mjs",
    "server/routes/health.mjs",
    "server/routes/capabilities.mjs",
    "server/routes/library.mjs",
    "server/routes/artifacts.mjs",
    "server/routes/validation.mjs",
    "server/routes/git.mjs",
    "server/routes/index.mjs",
    "server/app.mjs",
    "server/start.mjs",
    "scripts/tasks/start.mjs",
    "tests/integration/server.test.mjs",
    "scripts/tasks/test-server.mjs",
  ];

  for (const relativePath of modulePaths) {
    const result = run(
      process.execPath,
      [
        "--check",
        join(targetRoot, relativePath),
      ],
      {
        cwd: targetRoot,
        allowFailure: true,
      },
    );

    if (result.status !== 0) {
      throw new Error(
        `Generated module failed syntax validation: ${relativePath}\n${result.stderr}`,
      );
    }
  }

  report.validation.push({
    check: "module-syntax",
    ok: true,
    message:
      `${modulePaths.length} server and test modules passed Node syntax checks.`,
  });

  const dependencyCheck = run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'await import("express");',
    ],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
  );

  if (dependencyCheck.status !== 0) {
    throw new Error(
      `Express dependency import failed:\n${
        dependencyCheck.stderr ||
        dependencyCheck.stdout
      }`,
    );
  }

  report.validation.push({
    check: "dependency-import",
    ok: true,
    message:
      "The pinned Express dependency can be imported.",
  });

  const tests = run(
    process.execPath,
    [
      join(
        targetRoot,
        "scripts",
        "tasks",
        "test-server.mjs",
      ),
    ],
    {
      cwd: targetRoot,
      allowFailure: true,
    },
  );

  if (tests.status !== 0) {
    throw new Error(
      `Express server tests failed:\n${
        tests.stderr || tests.stdout
      }`,
    );
  }

  report.validation.push({
    check: "server-tests",
    ok: true,
    message:
      "Health, capabilities, library, artefact preview, validation and error-envelope tests passed.",
  });

  for (const task of [
    "scripts/tasks/test-git.mjs",
    "scripts/tasks/test-validation.mjs",
    "scripts/tasks/test-export.mjs",
    "scripts/tasks/test-resolution.mjs",
    "scripts/tasks/test-library.mjs",
    "scripts/tasks/test-data.mjs",
    "scripts/tasks/test-office.mjs",
    "scripts/tasks/test-files.mjs",
    "scripts/tasks/test-cli.mjs",
    "scripts/tasks/validate.mjs",
  ]) {
    const result = run(
      process.execPath,
      [join(targetRoot, task)],
      {
        cwd: targetRoot,
        allowFailure: true,
      },
    );

    if (result.status !== 0) {
      throw new Error(
        `Regression command failed (${task}):\n${
          result.stderr ||
          result.stdout
        }`,
      );
    }
  }

  report.validation.push({
    check: "regression",
    ok: true,
    message:
      "Git, validation, export, resolution, library, data, Office, filesystem, CLI and contract tests still pass.",
  });
}

async function checkpoint(
  repoRoot,
  ownedAbsolutePaths,
) {
  const ownedPaths = uniquePaths(
    ownedAbsolutePaths
      .filter((path) =>
        isInside(repoRoot, path),
      )
      .map((path) =>
        relativeGitPath(repoRoot, path),
      ),
  );

  if (ownedPaths.length === 0) {
    report.warnings.push({
      code: "NO_CHECKPOINT_CHANGES",
      message:
        "The Express server was already present; there were no task-owned changes to commit.",
    });
    return;
  }

  const userName = run(
    "git",
    ["config", "user.name"],
    {
      cwd: repoRoot,
      allowFailure: true,
    },
  ).stdout;
  const userEmail = run(
    "git",
    ["config", "user.email"],
    {
      cwd: repoRoot,
      allowFailure: true,
    },
  ).stdout;

  if (!userName || !userEmail) {
    report.warnings.push({
      code: "GIT_IDENTITY_MISSING",
      message:
        "The server was created and tested, but no commit was made because Git user.name or user.email is missing.",
    });
    return;
  }

  run(
    "git",
    ["add", "--", ...ownedPaths],
    { cwd: repoRoot },
  );

  const stagedOwned = run(
    "git",
    [
      "diff",
      "--cached",
      "--name-only",
      "--",
      ...ownedPaths,
    ],
    { cwd: repoRoot },
  ).stdout
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  if (stagedOwned.length === 0) {
    report.warnings.push({
      code: "NO_COMMIT_NEEDED",
      message:
        "No task-owned changes remained to commit.",
    });
    return;
  }

  const commitResult = run(
    "git",
    [
      "commit",
      "--only",
      "-m",
      COMMIT_MESSAGE,
      "--",
      ...ownedPaths,
    ],
    {
      cwd: repoRoot,
      allowFailure: true,
    },
  );

  if (commitResult.status !== 0) {
    throw new Error(
      `Focused Git commit failed:\n${
        commitResult.stderr ||
        commitResult.stdout
      }`,
    );
  }

  const commitHash = run(
    "git",
    ["rev-parse", "--short", "HEAD"],
    { cwd: repoRoot },
  ).stdout;
  report.git.commit = commitHash;

  if (args.noPush) {
    report.warnings.push({
      code: "PUSH_DISABLED",
      message:
        `Committed locally as ${commitHash}; --no-push prevented remote push.`,
    });
    return;
  }

  const branch = run(
    "git",
    ["branch", "--show-current"],
    { cwd: repoRoot },
  ).stdout;
  const upstream = run(
    "git",
    [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ],
    {
      cwd: repoRoot,
      allowFailure: true,
    },
  );

  let pushResult;

  if (upstream.status === 0) {
    report.git.pushTarget =
      upstream.stdout;
    pushResult = run(
      "git",
      ["push"],
      {
        cwd: repoRoot,
        allowFailure: true,
      },
    );
  } else {
    const remotes = run(
      "git",
      ["remote"],
      {
        cwd: repoRoot,
        allowFailure: true,
      },
    ).stdout
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);

    if (
      !branch ||
      !remotes.includes("origin")
    ) {
      report.warnings.push({
        code: "NO_PUSH_TARGET",
        message:
          `Committed locally as ${commitHash}, but no upstream was configured and origin was unavailable.`,
      });
      return;
    }

    report.git.pushTarget =
      `origin/${branch}`;
    pushResult = run(
      "git",
      [
        "push",
        "-u",
        "origin",
        branch,
      ],
      {
        cwd: repoRoot,
        allowFailure: true,
      },
    );
  }

  if (pushResult.status === 0) {
    report.git.pushed = true;
  } else {
    report.warnings.push({
      code: "PUSH_FAILED",
      message:
        `Committed locally as ${commitHash}, but the push failed safely. ` +
        "No force-push was attempted. " +
        (pushResult.stderr ||
          pushResult.stdout),
    });
  }
}

function getRepositoryRoot(cwd) {
  const result = run(
    "git",
    ["rev-parse", "--show-toplevel"],
    {
      cwd,
      allowFailure: true,
    },
  );

  return result.status === 0
    ? resolve(result.stdout)
    : null;
}

function getDirtyPaths(repoRoot) {
  const result = run(
    "git",
    [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ],
    { cwd: repoRoot },
  );
  const entries = result.stdout
    ? result.stdout
        .split("\0")
        .filter(Boolean)
    : [];
  const paths = new Set();

  for (
    let index = 0;
    index < entries.length;
    index += 1
  ) {
    const entry = entries[index];
    if (entry.length < 4) continue;
    const statusCode =
      entry.slice(0, 2);
    paths.add(
      normaliseGitPath(
        entry.slice(3),
      ),
    );

    if (
      statusCode.includes("R") ||
      statusCode.includes("C")
    ) {
      const secondPath =
        entries[index + 1];
      if (secondPath) {
        paths.add(
          normaliseGitPath(
            secondPath,
          ),
        );
        index += 1;
      }
    }
  }

  return paths;
}

function run(
  command,
  commandArgs,
  options = {},
) {
  const result = spawnSync(
    command,
    commandArgs,
    {
      cwd:
        options.cwd ?? targetRoot,
      encoding: "utf8",
      stdio: "pipe",
      shell: false,
      maxBuffer:
        64 * 1024 * 1024,
    },
  );

  if (result.error) throw result.error;

  if (
    result.status !== 0 &&
    !options.allowFailure
  ) {
    const details = [
      result.stderr,
      result.stdout,
    ]
      .filter(Boolean)
      .map((value) =>
        value.trim(),
      )
      .filter(Boolean)
      .join("\n");

    throw new Error(
      `${command} ${commandArgs.join(" ")} failed with exit code ${result.status}` +
        (details
          ? `:\n${details}`
          : "."),
    );
  }

  return {
    status: result.status ?? 1,
    stdout:
      result.stdout?.trim() ?? "",
    stderr:
      result.stderr?.trim() ?? "",
  };
}

async function atomicWrite(
  path,
  content,
) {
  await mkdir(
    dirname(path),
    { recursive: true },
  );
  const temporaryPath =
    `${path}.tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(
      temporaryPath,
      content,
      "utf8",
    );
    await rename(
      temporaryPath,
      path,
    );
  } finally {
    await rm(
      temporaryPath,
      { force: true },
    ).catch(() => {});
  }
}

async function writeBinaryAtomic(
  path,
  content,
) {
  await mkdir(
    dirname(path),
    { recursive: true },
  );
  const temporaryPath =
    `${path}.tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(
      temporaryPath,
      content,
    );
    await rename(
      temporaryPath,
      path,
    );
  } finally {
    await rm(
      temporaryPath,
      { force: true },
    ).catch(() => {});
  }
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isInside(root, path) {
  const relationship = relative(
    root,
    path,
  );

  return (
    relationship === "" ||
    (!relationship.startsWith("..") &&
      !resolve(path).startsWith(
        `${resolve(root)}..`,
      ))
  );
}

function relativeGitPath(
  repoRoot,
  path,
) {
  return normaliseGitPath(
    relative(repoRoot, path),
  );
}

function normaliseGitPath(path) {
  return path.replaceAll("\\", "/");
}

function uniquePaths(paths) {
  return [...new Set(paths)];
}

function finish(exitCode) {
  if (args.json) {
    console.log(
      JSON.stringify(report, null, 2),
    );
    process.exit(exitCode);
  }

  console.log(
    "\nMy Dashboards — Express server foundation\n",
  );
  console.log(
    `Target: ${report.targetRoot}`,
  );
  console.log(
    `Result: ${
      report.ok ? "PASS" : "FAIL"
    }`,
  );
  console.log(
    `Mode: ${
      report.dryRun
        ? "dry-run"
        : "write"
    }`,
  );

  printSection(
    "Dependencies",
    report.dependencies,
  );
  printSection(
    "Created",
    report.created,
  );
  printSection(
    "Updated",
    report.updated,
  );
  printSection(
    "Preserved",
    report.preserved,
  );

  if (report.validation.length > 0) {
    console.log("\nValidation:");
    for (
      const item of report.validation
    ) {
      console.log(
        `  ${
          item.ok ? "✓" : "✗"
        } ${item.message}`,
      );
    }
  }

  console.log("\nGit:");
  console.log(
    `  Commit: ${
      report.git.commit ?? "none"
    }`,
  );
  console.log(
    `  Pushed: ${
      report.git.pushed
        ? "yes"
        : "no"
    }`,
  );

  if (report.git.pushTarget) {
    console.log(
      `  Push target: ${report.git.pushTarget}`,
    );
  }

  if (report.warnings.length > 0) {
    console.log("\nWarnings:");
    for (
      const warning of report.warnings
    ) {
      console.log(
        `  ! ${warning.message}`,
      );
    }
  }

  console.log("");
  process.exit(exitCode);
}

function printSection(title, items) {
  console.log(`\n${title}:`);

  if (items.length === 0) {
    console.log("  none");
    return;
  }

  for (const item of items) {
    console.log(`  ${item}`);
  }
}
