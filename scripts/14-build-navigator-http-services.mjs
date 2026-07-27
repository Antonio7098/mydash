#!/usr/bin/env node

/**
 * My Dashboards — Bootstrap 14: Build navigator HTTP services and caching
 *
 * Adds:
 *
 *   - filesystem revision detection;
 *   - revision-aware library scan caching;
 *   - standalone preview caching;
 *   - validation result caching;
 *   - ETags and If-None-Match support;
 *   - deterministic cache invalidation;
 *   - GET /api/state;
 *   - GET /api/events server-sent events.
 *
 * Usage:
 *   node scripts/14-build-navigator-http-services.mjs
 *   node scripts/14-build-navigator-http-services.mjs --dry-run
 *   node scripts/14-build-navigator-http-services.mjs --no-commit
 *   node scripts/14-build-navigator-http-services.mjs --no-push
 *   node scripts/14-build-navigator-http-services.mjs --json
 *   node scripts/14-build-navigator-http-services.mjs --target /path/to/my-dashboards
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
import {
  dirname,
  join,
  relative,
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";
import {
  spawnSync,
} from "node:child_process";
import process from "node:process";

const SCRIPT_NAME =
  "14-build-navigator-http-services";
const COMMIT_MESSAGE =
  "Add live server caching and invalidation";
const MIN_NODE_MAJOR = 20;
const FILES = {"src/files/workspace-fingerprint.mjs": {"content": "import {\n  createHash,\n} from \"node:crypto\";\nimport {\n  lstat,\n  readlink,\n  readdir,\n} from \"node:fs/promises\";\nimport {\n  isAbsolute,\n  relative,\n  resolve,\n} from \"node:path\";\n\nconst DEFAULT_PATHS = [\n  \"config\",\n  \"library\",\n  \"recipes\",\n  \"package.json\",\n];\n\nconst DEFAULT_IGNORED_DIRECTORIES = new Set([\n  \".git\",\n  \"node_modules\",\n  \".my-dashboards\",\n  \"exports\",\n]);\n\nconst DEFAULT_MAX_ENTRIES = 100_000;\n\nexport async function fingerprintWorkspace(\n  workspaceRoot,\n  options = {},\n) {\n  const root = resolve(workspaceRoot);\n  const includePaths =\n    options.includePaths ?? DEFAULT_PATHS;\n  const ignoredDirectories =\n    options.ignoredDirectories ??\n    DEFAULT_IGNORED_DIRECTORIES;\n  const maxEntries =\n    options.maxEntries ?? DEFAULT_MAX_ENTRIES;\n  const hash = createHash(\"sha256\");\n  const summary = {\n    fileCount: 0,\n    directoryCount: 0,\n    symbolicLinkCount: 0,\n    missingPathCount: 0,\n    totalBytes: 0,\n    entryCount: 0,\n  };\n\n  for (const input of [...includePaths].sort()) {\n    const path = resolve(root, input);\n    assertInside(root, path);\n    await visit(path);\n  }\n\n  return {\n    id: hash.digest(\"hex\"),\n    ...summary,\n    computedAt: new Date().toISOString(),\n  };\n\n  async function visit(path) {\n    if (summary.entryCount >= maxEntries) {\n      const error = new Error(\n        `Workspace fingerprint exceeded ${maxEntries} filesystem entries.`,\n      );\n      error.code =\n        \"WORKSPACE_FINGERPRINT_ENTRY_LIMIT\";\n      throw error;\n    }\n\n    let metadata;\n\n    try {\n      metadata = await lstat(path, {\n        bigint: true,\n      });\n    } catch (error) {\n      if (error?.code === \"ENOENT\") {\n        const display = displayPath(\n          path,\n          root,\n        );\n        hash.update(`missing:${display}\\0`);\n        summary.missingPathCount += 1;\n        summary.entryCount += 1;\n        return;\n      }\n\n      throw error;\n    }\n\n    const display = displayPath(path, root);\n    summary.entryCount += 1;\n\n    if (metadata.isSymbolicLink()) {\n      const target = await readlink(path);\n      hash.update(\n        `link:${display}:${target}:${metadata.mtimeNs}\\0`,\n      );\n      summary.symbolicLinkCount += 1;\n      return;\n    }\n\n    if (metadata.isDirectory()) {\n      hash.update(\n        `directory:${display}:${metadata.mtimeNs}:${metadata.mode}\\0`,\n      );\n      summary.directoryCount += 1;\n\n      const children = await readdir(path, {\n        withFileTypes: true,\n      });\n      children.sort((left, right) =>\n        left.name.localeCompare(\n          right.name,\n          \"en\",\n        ),\n      );\n\n      for (const child of children) {\n        if (\n          child.isDirectory() &&\n          ignoredDirectories.has(child.name)\n        ) {\n          continue;\n        }\n\n        await visit(resolve(path, child.name));\n      }\n\n      return;\n    }\n\n    if (metadata.isFile()) {\n      hash.update(\n        `file:${display}:${metadata.size}:${metadata.mtimeNs}:${metadata.mode}\\0`,\n      );\n      summary.fileCount += 1;\n      summary.totalBytes += Number(metadata.size);\n      return;\n    }\n\n    hash.update(\n      `other:${display}:${metadata.mode}:${metadata.mtimeNs}\\0`,\n    );\n  }\n}\n\nfunction displayPath(path, root) {\n  const value = relative(root, path)\n    .replaceAll(\"\\\\\", \"/\");\n\n  return value || \".\";\n}\n\nfunction assertInside(root, candidate) {\n  const relationship = relative(\n    root,\n    candidate,\n  );\n\n  if (\n    relationship.startsWith(\"..\") ||\n    isAbsolute(relationship)\n  ) {\n    const error = new Error(\n      `Fingerprint path escapes the workspace: ${candidate}`,\n    );\n    error.code =\n      \"WORKSPACE_FINGERPRINT_UNSAFE_PATH\";\n    throw error;\n  }\n}\n"}, "src/workspace/capabilities.mjs": {"content": "export function getWorkspaceCapabilities(options = {}) {\n  return {\n    schemaVersion: 1,\n    product: {\n      name: options.name ?? \"My Dashboards\",\n      version: options.version ?? \"0.0.0\",\n    },\n    runtime: {\n      node: process.versions.node,\n      readOnlyHttp: true,\n    },\n    features: [\n      {\n        id: \"office.excel\",\n        title: \"Excel inspection\",\n        available: true,\n        formats: [\"xlsx\", \"xlsm\"],\n      },\n      {\n        id: \"office.powerpoint\",\n        title: \"PowerPoint inspection\",\n        available: true,\n        formats: [\"pptx\", \"pptm\"],\n      },\n      {\n        id: \"data.utilities\",\n        title: \"CSV, JSON and NDJSON utilities\",\n        available: true,\n        formats: [\"csv\", \"json\", \"ndjson\", \"jsonl\"],\n      },\n      {\n        id: \"library.discovery\",\n        title: \"Filesystem library discovery\",\n        available: true,\n      },\n      {\n        id: \"appearance.resolution\",\n        title: \"Appearance and dependency resolution\",\n        available: true,\n      },\n      {\n        id: \"artifact.standalone-export\",\n        title: \"Standalone HTML export\",\n        available: true,\n        fileProtocolCompatible: true,\n      },\n      {\n        id: \"workspace.validation\",\n        title: \"Consolidated validation\",\n        available: true,\n      },\n      {\n        id: \"navigator.live-state\",\n        title: \"Live filesystem revision detection\",\n        available: true,\n        serverSentEvents: true,\n        conditionalRequests: true,\n      },\n      {\n        id: \"server.cache\",\n        title: \"Revision-aware scan and preview caching\",\n        available: true,\n        exposedOverHttp: true,\n      },\n      {\n        id: \"git.checkpoint\",\n        title: \"Constrained Git checkpoints\",\n        available: true,\n        exposedOverHttp: false,\n      },\n    ],\n  };\n}\n", "allowedPrevious": ["export function getWorkspaceCapabilities(options = {}) {\n  return {\n    schemaVersion: 1,\n    product: {\n      name: options.name ?? \"My Dashboards\",\n      version: options.version ?? \"0.0.0\",\n    },\n    runtime: {\n      node: process.versions.node,\n      readOnlyHttp: true,\n    },\n    features: [\n      {\n        id: \"office.excel\",\n        title: \"Excel inspection\",\n        available: true,\n        formats: [\"xlsx\", \"xlsm\"],\n      },\n      {\n        id: \"office.powerpoint\",\n        title: \"PowerPoint inspection\",\n        available: true,\n        formats: [\"pptx\", \"pptm\"],\n      },\n      {\n        id: \"data.utilities\",\n        title: \"CSV, JSON and NDJSON utilities\",\n        available: true,\n        formats: [\"csv\", \"json\", \"ndjson\", \"jsonl\"],\n      },\n      {\n        id: \"library.discovery\",\n        title: \"Filesystem library discovery\",\n        available: true,\n      },\n      {\n        id: \"appearance.resolution\",\n        title: \"Appearance and dependency resolution\",\n        available: true,\n      },\n      {\n        id: \"artifact.standalone-export\",\n        title: \"Standalone HTML export\",\n        available: true,\n        fileProtocolCompatible: true,\n      },\n      {\n        id: \"workspace.validation\",\n        title: \"Consolidated validation\",\n        available: true,\n      },\n      {\n        id: \"git.checkpoint\",\n        title: \"Constrained Git checkpoints\",\n        available: true,\n        exposedOverHttp: false,\n      },\n    ],\n  };\n}\n"]}, "server/etag.mjs": {"content": "import {\n  createHash,\n} from \"node:crypto\";\n\nexport function createEtag(value) {\n  const hash = createHash(\"sha256\")\n    .update(\n      Buffer.isBuffer(value)\n        ? value\n        : String(value),\n    )\n    .digest(\"hex\");\n\n  return `\"sha256-${hash}\"`;\n}\n\nexport function createRevisionEtag(\n  revisionId,\n  ...parts\n) {\n  return createEtag(\n    [\n      revisionId,\n      ...parts.map(stablePart),\n    ].join(\"\\0\"),\n  );\n}\n\nexport function etagMatches(\n  requestHeader,\n  currentEtag,\n) {\n  if (!requestHeader || !currentEtag) {\n    return false;\n  }\n\n  if (requestHeader.trim() === \"*\") {\n    return true;\n  }\n\n  const expected = stripWeak(currentEtag);\n\n  return requestHeader\n    .split(\",\")\n    .map((value) => stripWeak(value.trim()))\n    .some((value) => value === expected);\n}\n\nexport function stableStringify(value) {\n  return JSON.stringify(sortValue(value));\n}\n\nfunction stablePart(value) {\n  if (typeof value === \"string\") {\n    return value;\n  }\n\n  return stableStringify(value);\n}\n\nfunction stripWeak(value) {\n  return value.startsWith(\"W/\")\n    ? value.slice(2)\n    : value;\n}\n\nfunction sortValue(value) {\n  if (Array.isArray(value)) {\n    return value.map(sortValue);\n  }\n\n  if (\n    value !== null &&\n    typeof value === \"object\"\n  ) {\n    return Object.fromEntries(\n      Object.keys(value)\n        .sort()\n        .map((key) => [\n          key,\n          sortValue(value[key]),\n        ]),\n    );\n  }\n\n  return value;\n}\n"}, "server/http.mjs": {"content": "import {\n  etagMatches,\n} from \"./etag.mjs\";\n\nexport class HttpError extends Error {\n  constructor(status, code, message, options = {}) {\n    super(message);\n    this.name = \"HttpError\";\n    this.status = status;\n    this.code = code;\n    this.details = options.details ?? null;\n    this.expose = options.expose ?? status < 500;\n  }\n}\n\nexport function asyncRoute(handler) {\n  return function wrappedRoute(request, response, next) {\n    Promise.resolve(handler(request, response, next)).catch(next);\n  };\n}\n\nexport function sendJson(response, data, options = {}) {\n  const durationMs = elapsedMilliseconds(\n    response.locals.requestStartedAt,\n  );\n\n  if (options.cacheControl) {\n    response.setHeader(\n      \"Cache-Control\",\n      options.cacheControl,\n    );\n  }\n\n  if (options.revisionId) {\n    response.setHeader(\n      \"X-MyDash-Revision\",\n      options.revisionId,\n    );\n  }\n\n  if (options.etag) {\n    response.setHeader(\n      \"ETag\",\n      options.etag,\n    );\n\n    if (\n      isConditionalMethod(response.req.method) &&\n      etagMatches(\n        response.req.get(\"if-none-match\"),\n        options.etag,\n      )\n    ) {\n      response.status(304).end();\n      return false;\n    }\n  }\n\n  response.status(options.status ?? 200).json({\n    ok: true,\n    data,\n    meta: {\n      requestId: response.locals.requestId,\n      durationMs,\n      ...(options.revisionId\n        ? {\n            revisionId:\n              options.revisionId,\n          }\n        : {}),\n    },\n  });\n\n  return true;\n}\n\nexport function sendError(response, error) {\n  const durationMs = elapsedMilliseconds(\n    response.locals.requestStartedAt,\n  );\n\n  response.status(error.status).json({\n    ok: false,\n    error: {\n      code: error.code,\n      message: error.message,\n      ...(error.details ? { details: error.details } : {}),\n    },\n    meta: {\n      requestId: response.locals.requestId,\n      durationMs,\n    },\n  });\n}\n\nexport function stringQuery(value, name, options = {}) {\n  if (value === undefined) return options.defaultValue;\n\n  if (Array.isArray(value) || typeof value !== \"string\") {\n    throw new HttpError(\n      400,\n      \"INVALID_QUERY_PARAMETER\",\n      `Query parameter ${name} must be a single string.`,\n    );\n  }\n\n  const result = value.trim();\n\n  if (!result && options.allowEmpty !== true) {\n    throw new HttpError(\n      400,\n      \"INVALID_QUERY_PARAMETER\",\n      `Query parameter ${name} cannot be empty.`,\n    );\n  }\n\n  return result;\n}\n\nexport function booleanQuery(value, name, defaultValue = false) {\n  if (value === undefined) return defaultValue;\n  const text = stringQuery(value, name).toLowerCase();\n\n  if ([\"true\", \"1\", \"yes\"].includes(text)) return true;\n  if ([\"false\", \"0\", \"no\"].includes(text)) return false;\n\n  throw new HttpError(\n    400,\n    \"INVALID_QUERY_PARAMETER\",\n    `Query parameter ${name} must be true or false.`,\n  );\n}\n\nexport function integerQuery(\n  value,\n  name,\n  options = {},\n) {\n  if (value === undefined) return options.defaultValue;\n\n  const text = stringQuery(value, name);\n  if (!/^\\d+$/.test(text)) {\n    throw new HttpError(\n      400,\n      \"INVALID_QUERY_PARAMETER\",\n      `Query parameter ${name} must be an integer.`,\n    );\n  }\n\n  const parsed = Number.parseInt(text, 10);\n  const minimum = options.minimum ?? 0;\n  const maximum =\n    options.maximum ?? Number.MAX_SAFE_INTEGER;\n\n  if (parsed < minimum || parsed > maximum) {\n    throw new HttpError(\n      400,\n      \"INVALID_QUERY_PARAMETER\",\n      `Query parameter ${name} must be between ${minimum} and ${maximum}.`,\n    );\n  }\n\n  return parsed;\n}\n\nexport function requireIdentifier(value, name) {\n  if (\n    typeof value !== \"string\" ||\n    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(value)\n  ) {\n    throw new HttpError(\n      400,\n      \"INVALID_PATH_PARAMETER\",\n      `Path parameter ${name} must be a kebab-case identifier.`,\n    );\n  }\n\n  return value;\n}\n\nfunction isConditionalMethod(method) {\n  return method === \"GET\" || method === \"HEAD\";\n}\n\nfunction elapsedMilliseconds(startedAt) {\n  if (typeof startedAt !== \"bigint\") return 0;\n  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;\n}\n", "allowedPrevious": ["export class HttpError extends Error {\n  constructor(status, code, message, options = {}) {\n    super(message);\n    this.name = \"HttpError\";\n    this.status = status;\n    this.code = code;\n    this.details = options.details ?? null;\n    this.expose = options.expose ?? status < 500;\n  }\n}\n\nexport function asyncRoute(handler) {\n  return function wrappedRoute(request, response, next) {\n    Promise.resolve(handler(request, response, next)).catch(next);\n  };\n}\n\nexport function sendJson(response, data, options = {}) {\n  const durationMs = elapsedMilliseconds(\n    response.locals.requestStartedAt,\n  );\n\n  response.status(options.status ?? 200).json({\n    ok: true,\n    data,\n    meta: {\n      requestId: response.locals.requestId,\n      durationMs,\n    },\n  });\n}\n\nexport function sendError(response, error) {\n  const durationMs = elapsedMilliseconds(\n    response.locals.requestStartedAt,\n  );\n\n  response.status(error.status).json({\n    ok: false,\n    error: {\n      code: error.code,\n      message: error.message,\n      ...(error.details ? { details: error.details } : {}),\n    },\n    meta: {\n      requestId: response.locals.requestId,\n      durationMs,\n    },\n  });\n}\n\nexport function stringQuery(value, name, options = {}) {\n  if (value === undefined) return options.defaultValue;\n\n  if (Array.isArray(value) || typeof value !== \"string\") {\n    throw new HttpError(\n      400,\n      \"INVALID_QUERY_PARAMETER\",\n      `Query parameter ${name} must be a single string.`,\n    );\n  }\n\n  const result = value.trim();\n\n  if (!result && options.allowEmpty !== true) {\n    throw new HttpError(\n      400,\n      \"INVALID_QUERY_PARAMETER\",\n      `Query parameter ${name} cannot be empty.`,\n    );\n  }\n\n  return result;\n}\n\nexport function booleanQuery(value, name, defaultValue = false) {\n  if (value === undefined) return defaultValue;\n  const text = stringQuery(value, name).toLowerCase();\n\n  if ([\"true\", \"1\", \"yes\"].includes(text)) return true;\n  if ([\"false\", \"0\", \"no\"].includes(text)) return false;\n\n  throw new HttpError(\n    400,\n    \"INVALID_QUERY_PARAMETER\",\n    `Query parameter ${name} must be true or false.`,\n  );\n}\n\nexport function integerQuery(\n  value,\n  name,\n  options = {},\n) {\n  if (value === undefined) return options.defaultValue;\n\n  const text = stringQuery(value, name);\n  if (!/^\\d+$/.test(text)) {\n    throw new HttpError(\n      400,\n      \"INVALID_QUERY_PARAMETER\",\n      `Query parameter ${name} must be an integer.`,\n    );\n  }\n\n  const parsed = Number.parseInt(text, 10);\n  const minimum = options.minimum ?? 0;\n  const maximum =\n    options.maximum ?? Number.MAX_SAFE_INTEGER;\n\n  if (parsed < minimum || parsed > maximum) {\n    throw new HttpError(\n      400,\n      \"INVALID_QUERY_PARAMETER\",\n      `Query parameter ${name} must be between ${minimum} and ${maximum}.`,\n    );\n  }\n\n  return parsed;\n}\n\nexport function requireIdentifier(value, name) {\n  if (\n    typeof value !== \"string\" ||\n    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(value)\n  ) {\n    throw new HttpError(\n      400,\n      \"INVALID_PATH_PARAMETER\",\n      `Path parameter ${name} must be a kebab-case identifier.`,\n    );\n  }\n\n  return value;\n}\n\nfunction elapsedMilliseconds(startedAt) {\n  if (typeof startedAt !== \"bigint\") return 0;\n  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;\n}\n"]}, "server/middleware/security.mjs": {"content": "export function securityHeaders(\n  request,\n  response,\n  next,\n) {\n  response.setHeader(\n    \"X-Content-Type-Options\",\n    \"nosniff\",\n  );\n  response.setHeader(\n    \"Referrer-Policy\",\n    \"no-referrer\",\n  );\n  response.setHeader(\n    \"Cross-Origin-Resource-Policy\",\n    \"same-origin\",\n  );\n\n  if (request.path.startsWith(\"/api\")) {\n    const cacheControl =\n      request.method === \"GET\" ||\n      request.method === \"HEAD\"\n        ? \"private, no-cache, must-revalidate\"\n        : \"no-store\";\n\n    response.setHeader(\n      \"Cache-Control\",\n      cacheControl,\n    );\n  }\n\n  next();\n}\n", "allowedPrevious": ["export function securityHeaders(\n  request,\n  response,\n  next,\n) {\n  response.setHeader(\n    \"X-Content-Type-Options\",\n    \"nosniff\",\n  );\n  response.setHeader(\n    \"Referrer-Policy\",\n    \"no-referrer\",\n  );\n  response.setHeader(\n    \"Cross-Origin-Resource-Policy\",\n    \"same-origin\",\n  );\n\n  if (request.path.startsWith(\"/api\")) {\n    response.setHeader(\n      \"Cache-Control\",\n      \"no-store\",\n    );\n  }\n\n  next();\n}\n"]}, "server/middleware/errors.mjs": {"content": "import {\n  CliError,\n} from \"../../cli/errors.mjs\";\nimport {\n  GitSafetyError,\n} from \"../../src/git/errors.mjs\";\nimport {\n  HttpError,\n  sendError,\n} from \"../http.mjs\";\n\nexport function notFoundHandler(\n  request,\n  response,\n  next,\n) {\n  next(\n    new HttpError(\n      404,\n      \"ROUTE_NOT_FOUND\",\n      `No route matches ${request.method} ${request.originalUrl}.`,\n    ),\n  );\n}\n\nexport function errorHandler(options = {}) {\n  const logger = options.logger ?? (() => {});\n\n  return function handleError(\n    error,\n    request,\n    response,\n    next,\n  ) {\n    if (response.headersSent) {\n      next(error);\n      return;\n    }\n\n    const mapped = mapError(error);\n\n    if (mapped.status >= 500) {\n      logger({\n        timestamp: new Date().toISOString(),\n        level: \"error\",\n        event: \"http.error\",\n        requestId:\n          response.locals.requestId ?? null,\n        method: request.method,\n        path: request.originalUrl,\n        code: mapped.code,\n        message: error?.message ?? String(error),\n        stack:\n          error instanceof Error\n            ? error.stack\n            : null,\n      });\n    }\n\n    sendError(response, mapped);\n  };\n}\n\nfunction mapError(error) {\n  if (error instanceof HttpError) {\n    return error;\n  }\n\n  if (\n    error?.type === \"entity.parse.failed\"\n  ) {\n    return new HttpError(\n      400,\n      \"INVALID_JSON_BODY\",\n      \"The request body is not valid JSON.\",\n    );\n  }\n\n  if (\n    error?.type === \"entity.too.large\"\n  ) {\n    return new HttpError(\n      413,\n      \"REQUEST_BODY_TOO_LARGE\",\n      \"The JSON request body exceeds 64 KiB.\",\n    );\n  }\n\n  if (error instanceof CliError) {\n    const status =\n      /NOT_FOUND/.test(error.code)\n        ? 404\n        : error.exitCode === 3\n          ? 422\n          : 400;\n\n    return new HttpError(\n      status,\n      error.code,\n      error.message,\n      {\n        details: error.details,\n      },\n    );\n  }\n\n  if (error instanceof GitSafetyError) {\n    return new HttpError(\n      error.exitCode === 3 ? 422 : 409,\n      error.code,\n      error.message,\n      {\n        details: error.details,\n      },\n    );\n  }\n\n  if (\n    error?.code ===\n      \"WORKSPACE_CHANGED_DURING_READ\"\n  ) {\n    return new HttpError(\n      409,\n      error.code,\n      error.message,\n    );\n  }\n\n  if (\n    error?.code ===\n      \"STANDALONE_EXPORT_INVALID\" ||\n    error?.code ===\n      \"ARTIFACT_ENTRY_INVALID\" ||\n    error?.code ===\n      \"ARTIFACT_ENTRY_NOT_HTML\"\n  ) {\n    return new HttpError(\n      422,\n      error.code,\n      error.message,\n      {\n        details:\n          error.validation ?? null,\n      },\n    );\n  }\n\n  return new HttpError(\n    500,\n    \"INTERNAL_SERVER_ERROR\",\n    \"The server could not complete the request.\",\n    {\n      expose: false,\n    },\n  );\n}\n", "allowedPrevious": ["import {\n  CliError,\n} from \"../../cli/errors.mjs\";\nimport {\n  GitSafetyError,\n} from \"../../src/git/errors.mjs\";\nimport {\n  HttpError,\n  sendError,\n} from \"../http.mjs\";\n\nexport function notFoundHandler(\n  request,\n  response,\n  next,\n) {\n  next(\n    new HttpError(\n      404,\n      \"ROUTE_NOT_FOUND\",\n      `No route matches ${request.method} ${request.originalUrl}.`,\n    ),\n  );\n}\n\nexport function errorHandler(options = {}) {\n  const logger = options.logger ?? (() => {});\n\n  return function handleError(\n    error,\n    request,\n    response,\n    next,\n  ) {\n    if (response.headersSent) {\n      next(error);\n      return;\n    }\n\n    const mapped = mapError(error);\n\n    if (mapped.status >= 500) {\n      logger({\n        timestamp: new Date().toISOString(),\n        level: \"error\",\n        event: \"http.error\",\n        requestId:\n          response.locals.requestId ?? null,\n        method: request.method,\n        path: request.originalUrl,\n        code: mapped.code,\n        message: error?.message ?? String(error),\n        stack:\n          error instanceof Error\n            ? error.stack\n            : null,\n      });\n    }\n\n    sendError(response, mapped);\n  };\n}\n\nfunction mapError(error) {\n  if (error instanceof HttpError) {\n    return error;\n  }\n\n  if (\n    error?.type === \"entity.parse.failed\"\n  ) {\n    return new HttpError(\n      400,\n      \"INVALID_JSON_BODY\",\n      \"The request body is not valid JSON.\",\n    );\n  }\n\n  if (\n    error?.type === \"entity.too.large\"\n  ) {\n    return new HttpError(\n      413,\n      \"REQUEST_BODY_TOO_LARGE\",\n      \"The JSON request body exceeds 64 KiB.\",\n    );\n  }\n\n  if (error instanceof CliError) {\n    const status =\n      /NOT_FOUND/.test(error.code)\n        ? 404\n        : error.exitCode === 3\n          ? 422\n          : 400;\n\n    return new HttpError(\n      status,\n      error.code,\n      error.message,\n      {\n        details: error.details,\n      },\n    );\n  }\n\n  if (error instanceof GitSafetyError) {\n    return new HttpError(\n      error.exitCode === 3 ? 422 : 409,\n      error.code,\n      error.message,\n      {\n        details: error.details,\n      },\n    );\n  }\n\n  if (\n    error?.code ===\n      \"STANDALONE_EXPORT_INVALID\" ||\n    error?.code ===\n      \"ARTIFACT_ENTRY_INVALID\" ||\n    error?.code ===\n      \"ARTIFACT_ENTRY_NOT_HTML\"\n  ) {\n    return new HttpError(\n      422,\n      error.code,\n      error.message,\n      {\n        details:\n          error.validation ?? null,\n      },\n    );\n  }\n\n  return new HttpError(\n    500,\n    \"INTERNAL_SERVER_ERROR\",\n    \"The server could not complete the request.\",\n    {\n      expose: false,\n    },\n  );\n}\n"]}, "server/services/revision-cache.mjs": {"content": "export class RevisionCache {\n  constructor(name, options = {}) {\n    this.name = name;\n    this.maxEntries =\n      options.maxEntries ?? 32;\n    this.entries = new Map();\n    this.metrics = {\n      hits: 0,\n      misses: 0,\n      loads: 0,\n      loadErrors: 0,\n      evictions: 0,\n      invalidations: 0,\n    };\n    this.lastInvalidationReason = null;\n  }\n\n  async get(key, revisionId, loader) {\n    const existing = this.entries.get(key);\n\n    if (\n      existing &&\n      existing.revisionId === revisionId\n    ) {\n      this.metrics.hits += 1;\n      existing.lastAccessedAt = Date.now();\n      this.touch(key, existing);\n      return existing.promise;\n    }\n\n    this.metrics.misses += 1;\n    this.metrics.loads += 1;\n\n    const entry = {\n      key,\n      revisionId,\n      createdAt: Date.now(),\n      lastAccessedAt: Date.now(),\n      promise: null,\n    };\n\n    entry.promise = Promise.resolve()\n      .then(loader)\n      .catch((error) => {\n        if (this.entries.get(key) === entry) {\n          this.entries.delete(key);\n        }\n        this.metrics.loadErrors += 1;\n        throw error;\n      });\n\n    this.entries.set(key, entry);\n    this.evictIfNeeded();\n\n    return entry.promise;\n  }\n\n  delete(key) {\n    return this.entries.delete(key);\n  }\n\n  clear(reason = \"manual\") {\n    if (this.entries.size > 0) {\n      this.metrics.invalidations += 1;\n    }\n\n    this.entries.clear();\n    this.lastInvalidationReason = reason;\n  }\n\n  snapshot() {\n    return {\n      name: this.name,\n      size: this.entries.size,\n      maxEntries: this.maxEntries,\n      metrics: {\n        ...this.metrics,\n      },\n      lastInvalidationReason:\n        this.lastInvalidationReason,\n      entries: [...this.entries.values()].map(\n        (entry) => ({\n          key: entry.key,\n          revisionId: entry.revisionId,\n          ageMs:\n            Date.now() - entry.createdAt,\n          idleMs:\n            Date.now() -\n            entry.lastAccessedAt,\n        }),\n      ),\n    };\n  }\n\n  touch(key, entry) {\n    this.entries.delete(key);\n    this.entries.set(key, entry);\n  }\n\n  evictIfNeeded() {\n    while (\n      this.entries.size > this.maxEntries\n    ) {\n      const oldest =\n        this.entries.keys().next().value;\n      this.entries.delete(oldest);\n      this.metrics.evictions += 1;\n    }\n  }\n}\n"}, "server/services/workspace-revision.mjs": {"content": "import {\n  EventEmitter,\n} from \"node:events\";\nimport {\n  fingerprintWorkspace,\n} from \"../../src/files/workspace-fingerprint.mjs\";\n\nexport function createWorkspaceRevisionService(\n  options,\n) {\n  const emitter = new EventEmitter();\n  const workspaceRoot =\n    options.workspaceRoot;\n  const pollIntervalMs =\n    options.pollIntervalMs ?? 1_000;\n  const minimumCheckIntervalMs =\n    options.minimumCheckIntervalMs ?? 200;\n  const now =\n    options.now ?? (() => new Date());\n  const logger =\n    options.logger ?? (() => {});\n  let state = null;\n  let inFlight = null;\n  let timer = null;\n  let lastCheckedAtMs = 0;\n  let pendingReason = \"initial\";\n\n  async function current(\n    currentOptions = {},\n  ) {\n    const currentTime = now().getTime();\n\n    if (\n      !currentOptions.force &&\n      state &&\n      currentTime - lastCheckedAtMs <\n        minimumCheckIntervalMs\n    ) {\n      return state;\n    }\n\n    if (inFlight) return inFlight;\n\n    inFlight = detectChange(\n      currentOptions.reason ??\n        pendingReason,\n    ).finally(() => {\n      inFlight = null;\n    });\n\n    return inFlight;\n  }\n\n  async function detectChange(reason) {\n    const fingerprint =\n      await fingerprintWorkspace(\n        workspaceRoot,\n      );\n    const previous = state;\n    lastCheckedAtMs = now().getTime();\n    pendingReason = \"poll\";\n\n    if (\n      previous &&\n      previous.id === fingerprint.id\n    ) {\n      state = {\n        ...previous,\n        checkedAt: now().toISOString(),\n      };\n      return state;\n    }\n\n    state = {\n      id: fingerprint.id,\n      sequence:\n        (previous?.sequence ?? 0) + 1,\n      detectedAt: now().toISOString(),\n      checkedAt: now().toISOString(),\n      reason,\n      fingerprint,\n    };\n\n    if (previous) {\n      const event = {\n        previous,\n        current: state,\n        reason,\n      };\n      emitter.emit(\"change\", event);\n      logger({\n        timestamp: now().toISOString(),\n        level: \"info\",\n        event:\n          \"workspace.revision.changed\",\n        previousRevision: previous.id,\n        revision: state.id,\n        sequence: state.sequence,\n        reason,\n      });\n    } else {\n      emitter.emit(\"ready\", state);\n    }\n\n    return state;\n  }\n\n  async function start() {\n    await current({\n      force: true,\n      reason: \"startup\",\n    });\n\n    if (!timer) {\n      timer = setInterval(() => {\n        current({\n          force: true,\n          reason: \"poll\",\n        }).catch((error) => {\n          logger({\n            timestamp: now().toISOString(),\n            level: \"error\",\n            event:\n              \"workspace.revision.failed\",\n            message: error.message,\n            code: error.code ?? null,\n          });\n        });\n      }, pollIntervalMs);\n      timer.unref();\n    }\n\n    return state;\n  }\n\n  function stop() {\n    if (timer) {\n      clearInterval(timer);\n      timer = null;\n    }\n  }\n\n  function invalidate(\n    reason = \"explicit-invalidation\",\n  ) {\n    lastCheckedAtMs = 0;\n    pendingReason = reason;\n  }\n\n  function onChange(listener) {\n    emitter.on(\"change\", listener);\n\n    return () => {\n      emitter.off(\"change\", listener);\n    };\n  }\n\n  return {\n    current,\n    start,\n    stop,\n    invalidate,\n    onChange,\n    get pollIntervalMs() {\n      return pollIntervalMs;\n    },\n  };\n}\n"}, "server/services/library.mjs": {"content": "import {\n  buildConsumerGraph,\n  consumersForEntry,\n  dependenciesForEntry,\n} from \"../../src/library/consumers.mjs\";\nimport {\n  findLibraryEntries,\n  scanWorkspaceLibrary,\n} from \"../../src/library/scan.mjs\";\n\nexport function createLibraryService(\n  options,\n) {\n  const {\n    workspaceRoot,\n    revision,\n    cache,\n  } = options;\n\n  async function snapshot() {\n    for (\n      let attempt = 0;\n      attempt < 2;\n      attempt += 1\n    ) {\n      const before =\n        await revision.current();\n      const scan = await cache.get(\n        \"workspace-scan\",\n        before.id,\n        () =>\n          scanWorkspaceLibrary(\n            workspaceRoot,\n          ),\n      );\n      const after =\n        await revision.current({\n          force: true,\n          reason:\n            \"scan-consistency-check\",\n        });\n\n      if (before.id === after.id) {\n        return {\n          revision: after,\n          scan,\n        };\n      }\n\n      cache.clear(\n        \"workspace-changed-during-scan\",\n      );\n    }\n\n    const error = new Error(\n      \"The workspace changed repeatedly while the library was being scanned.\",\n    );\n    error.code =\n      \"WORKSPACE_CHANGED_DURING_READ\";\n    throw error;\n  }\n\n  async function list(filters = {}) {\n    const value = await snapshot();\n\n    return {\n      ...value,\n      entries: findLibraryEntries(\n        value.scan.entries,\n        filters,\n      ),\n      filters,\n    };\n  }\n\n  async function inspect(kind, id) {\n    const value = await snapshot();\n    const matches =\n      value.scan.entries.filter(\n        (entry) =>\n          entry.id === id &&\n          (entry.kind === kind ||\n            entry.category === kind),\n      );\n\n    return {\n      ...value,\n      matches,\n      graph: buildConsumerGraph(\n        value.scan,\n      ),\n    };\n  }\n\n  return {\n    snapshot,\n    list,\n    inspect,\n    consumersFor(entry, graph) {\n      return consumersForEntry(\n        entry,\n        graph,\n      );\n    },\n    dependenciesFor(entry, graph) {\n      return dependenciesForEntry(\n        entry,\n        graph,\n      );\n    },\n  };\n}\n"}, "server/services/artifacts.mjs": {"content": "import {\n  buildStandaloneArtifact,\n} from \"../../src/export/export-artifact.mjs\";\nimport {\n  findArtifact,\n} from \"../../src/resolution/find-artifact.mjs\";\nimport {\n  resolveArtifactAppearance,\n} from \"../../src/resolution/resolve.mjs\";\nimport {\n  stableStringify,\n} from \"../etag.mjs\";\n\nexport function createArtifactService(\n  options,\n) {\n  const {\n    library,\n    revision,\n    previewCache,\n    workspaceRoot,\n  } = options;\n\n  async function list() {\n    const snapshot =\n      await library.snapshot();\n\n    return {\n      ...snapshot,\n      artifacts: snapshot.scan.entries\n        .filter(\n          (entry) =>\n            entry.category ===\n            \"artifact\",\n        ),\n    };\n  }\n\n  async function get(kind, id) {\n    const snapshot =\n      await library.snapshot();\n    const artifact = findArtifact(\n      snapshot.scan,\n      id,\n      kind,\n    );\n    const resolution =\n      resolveArtifactAppearance(\n        snapshot.scan,\n        artifact,\n      );\n\n    return {\n      ...snapshot,\n      artifact,\n      resolution,\n    };\n  }\n\n  async function preview(\n    kind,\n    id,\n    previewOptions = {},\n  ) {\n    const cacheKey = stableStringify({\n      kind,\n      id,\n      minify:\n        previewOptions.minify ?? false,\n      maxBytes:\n        previewOptions.maxBytes,\n    });\n\n    for (\n      let attempt = 0;\n      attempt < 2;\n      attempt += 1\n    ) {\n      const snapshot =\n        await get(kind, id);\n      const built =\n        await previewCache.get(\n          cacheKey,\n          snapshot.revision.id,\n          () =>\n            buildStandaloneArtifact({\n              workspaceRoot,\n              scan: snapshot.scan,\n              artifact:\n                snapshot.artifact,\n              resolution:\n                snapshot.resolution,\n              minify:\n                previewOptions.minify ??\n                false,\n              maxBytes:\n                previewOptions.maxBytes,\n            }),\n        );\n      const after =\n        await revision.current({\n          force: true,\n          reason:\n            \"preview-consistency-check\",\n        });\n\n      if (\n        snapshot.revision.id === after.id\n      ) {\n        return {\n          ...snapshot,\n          revision: after,\n          built,\n          cacheKey,\n        };\n      }\n\n      previewCache.delete(cacheKey);\n    }\n\n    const error = new Error(\n      \"The workspace changed repeatedly while the preview was being built.\",\n    );\n    error.code =\n      \"WORKSPACE_CHANGED_DURING_READ\";\n    throw error;\n  }\n\n  return {\n    list,\n    get,\n    preview,\n  };\n}\n"}, "server/services/validation.mjs": {"content": "import {\n  validateWorkspace,\n} from \"../../src/validation/workspace-validation.mjs\";\nimport {\n  stableStringify,\n} from \"../etag.mjs\";\n\nexport function createValidationService(\n  options,\n) {\n  const {\n    workspaceRoot,\n    revision,\n    cache,\n    now,\n  } = options;\n\n  async function validate(\n    validationOptions,\n  ) {\n    const key = stableStringify(\n      validationOptions,\n    );\n\n    for (\n      let attempt = 0;\n      attempt < 2;\n      attempt += 1\n    ) {\n      const before =\n        await revision.current();\n      const report = await cache.get(\n        key,\n        before.id,\n        () =>\n          validateWorkspace({\n            workspaceRoot,\n            ...validationOptions,\n            now,\n          }),\n      );\n      const after =\n        await revision.current({\n          force: true,\n          reason:\n            \"validation-consistency-check\",\n        });\n\n      if (before.id === after.id) {\n        return {\n          revision: after,\n          report,\n          cacheKey: key,\n        };\n      }\n\n      cache.delete(key);\n    }\n\n    const error = new Error(\n      \"The workspace changed repeatedly while validation was running.\",\n    );\n    error.code =\n      \"WORKSPACE_CHANGED_DURING_READ\";\n    throw error;\n  }\n\n  return {\n    validate,\n  };\n}\n"}, "server/services/navigator-services.mjs": {"content": "import {\n  getRepositoryStatus,\n} from \"../../src/git/status.mjs\";\nimport {\n  RevisionCache,\n} from \"./revision-cache.mjs\";\nimport {\n  createArtifactService,\n} from \"./artifacts.mjs\";\nimport {\n  createLibraryService,\n} from \"./library.mjs\";\nimport {\n  createValidationService,\n} from \"./validation.mjs\";\nimport {\n  createWorkspaceRevisionService,\n} from \"./workspace-revision.mjs\";\n\nexport function createNavigatorServices(\n  options,\n) {\n  const {\n    workspaceRoot,\n    now,\n    logger,\n  } = options;\n  const revision =\n    createWorkspaceRevisionService({\n      workspaceRoot,\n      now,\n      logger,\n      pollIntervalMs:\n        options.pollIntervalMs,\n      minimumCheckIntervalMs:\n        options.minimumCheckIntervalMs,\n    });\n  const caches = {\n    library: new RevisionCache(\n      \"library\",\n      { maxEntries: 2 },\n    ),\n    previews: new RevisionCache(\n      \"previews\",\n      { maxEntries: 24 },\n    ),\n    validation: new RevisionCache(\n      \"validation\",\n      { maxEntries: 12 },\n    ),\n  };\n  const library =\n    createLibraryService({\n      workspaceRoot,\n      revision,\n      cache: caches.library,\n    });\n  const artifacts =\n    createArtifactService({\n      workspaceRoot,\n      revision,\n      library,\n      previewCache:\n        caches.previews,\n    });\n  const validation =\n    createValidationService({\n      workspaceRoot,\n      revision,\n      cache: caches.validation,\n      now,\n    });\n  const unsubscribe =\n    revision.onChange((event) => {\n      for (const cache of Object.values(\n        caches,\n      )) {\n        cache.clear(\n          `revision:${event.current.id}`,\n        );\n      }\n    });\n\n  async function start() {\n    return revision.start();\n  }\n\n  async function close() {\n    unsubscribe();\n    revision.stop();\n\n    for (const cache of Object.values(\n      caches,\n    )) {\n      cache.clear(\"service-close\");\n    }\n  }\n\n  async function state() {\n    const current =\n      await revision.current();\n\n    return {\n      revision: current,\n      pollIntervalMs:\n        revision.pollIntervalMs,\n      caches: Object.fromEntries(\n        Object.entries(caches).map(\n          ([name, cache]) => [\n            name,\n            cache.snapshot(),\n          ],\n        ),\n      ),\n    };\n  }\n\n  return {\n    revision,\n    library,\n    artifacts,\n    validation,\n    git: {\n      status() {\n        return getRepositoryStatus(\n          workspaceRoot,\n        );\n      },\n    },\n    state,\n    start,\n    close,\n  };\n}\n"}, "server/routes/health.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  asyncRoute,\n  sendJson,\n} from \"../http.mjs\";\n\nexport function createHealthRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/health\",\n    asyncRoute(async (request, response) => {\n      const state =\n        await context.services.state();\n\n      sendJson(\n        response,\n        {\n          status: \"ok\",\n          service: \"my-dashboards\",\n          version:\n            context.packageMetadata.version,\n          workspace: {\n            id: context.config.id,\n            name: context.config.name,\n          },\n          startedAt:\n            context.startedAt.toISOString(),\n          currentTime:\n            context.now().toISOString(),\n          uptimeSeconds:\n            Math.max(\n              0,\n              Math.floor(\n                (context.now().getTime() -\n                  context.startedAt.getTime()) /\n                  1000,\n              ),\n            ),\n          revision: {\n            id: state.revision.id,\n            sequence:\n              state.revision.sequence,\n            detectedAt:\n              state.revision.detectedAt,\n          },\n        },\n        {\n          cacheControl: \"no-store\",\n          revisionId:\n            state.revision.id,\n        },\n      );\n    }),\n  );\n\n  return router;\n}\n", "allowedPrevious": ["import {\n  Router,\n} from \"express\";\nimport {\n  asyncRoute,\n  sendJson,\n} from \"../http.mjs\";\n\nexport function createHealthRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/health\",\n    asyncRoute(async (request, response) => {\n      sendJson(response, {\n        status: \"ok\",\n        service: \"my-dashboards\",\n        version:\n          context.packageMetadata.version,\n        workspace: {\n          id: context.config.id,\n          name: context.config.name,\n        },\n        startedAt:\n          context.startedAt.toISOString(),\n        currentTime:\n          context.now().toISOString(),\n        uptimeSeconds:\n          Math.max(\n            0,\n            Math.floor(\n              (context.now().getTime() -\n                context.startedAt.getTime()) /\n                1000,\n            ),\n          ),\n      });\n    }),\n  );\n\n  return router;\n}\n"]}, "server/routes/capabilities.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  asyncRoute,\n  sendJson,\n} from \"../http.mjs\";\nimport {\n  createEtag,\n} from \"../etag.mjs\";\nimport {\n  getWorkspaceCapabilities,\n} from \"../../src/workspace/capabilities.mjs\";\n\nexport function createCapabilitiesRouter(\n  context,\n) {\n  const router = Router();\n  const capabilities =\n    getWorkspaceCapabilities({\n      name: context.config.name,\n      version:\n        context.packageMetadata.version,\n    });\n  const capabilitiesEtag =\n    createEtag(\n      JSON.stringify(capabilities),\n    );\n\n  router.get(\n    \"/\",\n    asyncRoute(async (request, response) => {\n      sendJson(\n        response,\n        {\n          service: {\n            name: \"My Dashboards API\",\n            version:\n              context.packageMetadata.version,\n          },\n          links: {\n            health: \"/api/health\",\n            capabilities:\n              \"/api/capabilities\",\n            state: \"/api/state\",\n            events: \"/api/events\",\n            library: \"/api/library\",\n            artifacts: \"/api/artifacts\",\n            validation: \"/api/validation\",\n            gitStatus: \"/api/git/status\",\n          },\n        },\n        {\n          etag: createEtag(\n            `${context.packageMetadata.version}:api-index-v2`,\n          ),\n        },\n      );\n    }),\n  );\n\n  router.get(\n    \"/capabilities\",\n    asyncRoute(async (request, response) => {\n      sendJson(\n        response,\n        capabilities,\n        {\n          etag: capabilitiesEtag,\n        },\n      );\n    }),\n  );\n\n  return router;\n}\n", "allowedPrevious": ["import {\n  Router,\n} from \"express\";\nimport {\n  asyncRoute,\n  sendJson,\n} from \"../http.mjs\";\nimport {\n  getWorkspaceCapabilities,\n} from \"../../src/workspace/capabilities.mjs\";\n\nexport function createCapabilitiesRouter(\n  context,\n) {\n  const router = Router();\n\n  router.get(\n    \"/\",\n    asyncRoute(async (request, response) => {\n      sendJson(response, {\n        service: {\n          name: \"My Dashboards API\",\n          version:\n            context.packageMetadata.version,\n        },\n        links: {\n          health: \"/api/health\",\n          capabilities:\n            \"/api/capabilities\",\n          library: \"/api/library\",\n          artifacts: \"/api/artifacts\",\n          validation: \"/api/validation\",\n          gitStatus: \"/api/git/status\",\n        },\n      });\n    }),\n  );\n\n  router.get(\n    \"/capabilities\",\n    asyncRoute(async (request, response) => {\n      sendJson(\n        response,\n        getWorkspaceCapabilities({\n          name: context.config.name,\n          version:\n            context.packageMetadata.version,\n        }),\n      );\n    }),\n  );\n\n  return router;\n}\n"]}, "server/routes/state.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  asyncRoute,\n  sendJson,\n} from \"../http.mjs\";\n\nexport function createStateRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/state\",\n    asyncRoute(async (request, response) => {\n      const state =\n        await context.services.state();\n\n      sendJson(response, state, {\n        cacheControl: \"no-store\",\n      });\n    }),\n  );\n\n  router.get(\n    \"/events\",\n    asyncRoute(async (request, response) => {\n      response.status(200);\n      response.setHeader(\n        \"Content-Type\",\n        \"text/event-stream\",\n      );\n      response.setHeader(\n        \"Cache-Control\",\n        \"no-store\",\n      );\n      response.setHeader(\n        \"Connection\",\n        \"keep-alive\",\n      );\n      response.setHeader(\n        \"X-Accel-Buffering\",\n        \"no\",\n      );\n      response.flushHeaders();\n\n      const current =\n        await context.services.revision.current();\n      writeEvent(\n        response,\n        \"workspace-revision\",\n        current,\n      );\n\n      const unsubscribe =\n        context.services.revision.onChange(\n          (event) => {\n            writeEvent(\n              response,\n              \"workspace-revision\",\n              event.current,\n            );\n          },\n        );\n      const heartbeat = setInterval(() => {\n        response.write(\n          `: heartbeat ${Date.now()}\\n\\n`,\n        );\n      }, 25_000);\n      heartbeat.unref();\n\n      const close = () => {\n        clearInterval(heartbeat);\n        unsubscribe();\n      };\n\n      request.once(\"close\", close);\n      response.once(\"close\", close);\n    }),\n  );\n\n  return router;\n}\n\nfunction writeEvent(\n  response,\n  event,\n  data,\n) {\n  response.write(`event: ${event}\\n`);\n  response.write(\n    `data: ${JSON.stringify(data)}\\n\\n`,\n  );\n}\n"}, "server/routes/library.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  createRevisionEtag,\n} from \"../etag.mjs\";\nimport {\n  HttpError,\n  asyncRoute,\n  requireIdentifier,\n  sendJson,\n  stringQuery,\n} from \"../http.mjs\";\n\nexport function createLibraryRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/library\",\n    asyncRoute(async (request, response) => {\n      const filters = {\n        kind: stringQuery(\n          request.query.kind,\n          \"kind\",\n        ),\n        level: stringQuery(\n          request.query.level,\n          \"level\",\n        ),\n        collection: stringQuery(\n          request.query.collection,\n          \"collection\",\n        ),\n      };\n      const result =\n        await context.services.library.list(\n          filters,\n        );\n      const etag = createRevisionEtag(\n        result.revision.id,\n        \"library-list\",\n        filters,\n      );\n\n      sendJson(\n        response,\n        {\n          summary: result.scan.summary,\n          filters,\n          entries:\n            result.entries.map(publicEntry),\n          issues: result.scan.issues,\n        },\n        {\n          etag,\n          revisionId:\n            result.revision.id,\n        },\n      );\n    }),\n  );\n\n  router.get(\n    \"/library/:kind/:id\",\n    asyncRoute(async (request, response) => {\n      const kind = requireIdentifier(\n        request.params.kind,\n        \"kind\",\n      );\n      const id = requireIdentifier(\n        request.params.id,\n        \"id\",\n      );\n      const result =\n        await context.services.library.inspect(\n          kind,\n          id,\n        );\n\n      if (result.matches.length === 0) {\n        throw new HttpError(\n          404,\n          \"LIBRARY_ENTRY_NOT_FOUND\",\n          `No library entry found for ${kind}:${id}.`,\n        );\n      }\n\n      if (result.matches.length > 1) {\n        throw new HttpError(\n          409,\n          \"AMBIGUOUS_LIBRARY_ENTRY\",\n          `Multiple library entries match ${kind}:${id}.`,\n          {\n            details: {\n              matches:\n                result.matches.map(\n                  publicEntry,\n                ),\n            },\n          },\n        );\n      }\n\n      const entry = result.matches[0];\n      const etag = createRevisionEtag(\n        result.revision.id,\n        \"library-entry\",\n        kind,\n        id,\n      );\n\n      sendJson(\n        response,\n        {\n          entry: {\n            ...publicEntry(entry),\n            manifest: entry.manifest,\n          },\n          consumers:\n            context.services.library\n              .consumersFor(\n                entry,\n                result.graph,\n              ),\n          dependencies:\n            context.services.library\n              .dependenciesFor(\n                entry,\n                result.graph,\n              ),\n          issues: result.scan.issues.filter(\n            (issue) =>\n              issue.manifestPath ===\n                entry.manifestPath ||\n              issue.targetManifestPath ===\n                entry.manifestPath,\n          ),\n        },\n        {\n          etag,\n          revisionId:\n            result.revision.id,\n        },\n      );\n    }),\n  );\n\n  return router;\n}\n\nfunction publicEntry(entry) {\n  return {\n    id: entry.id,\n    kind: entry.kind,\n    category: entry.category,\n    title: entry.title,\n    level: entry.level,\n    collection: entry.collection,\n    ownerArtifact:\n      entry.ownerArtifact,\n    displayPath: entry.displayPath,\n    manifestPath: entry.manifestPath,\n  };\n}\n", "allowedPrevious": ["import {\n  Router,\n} from \"express\";\nimport {\n  buildConsumerGraph,\n  consumersForEntry,\n  dependenciesForEntry,\n} from \"../../src/library/consumers.mjs\";\nimport {\n  findLibraryEntries,\n  scanWorkspaceLibrary,\n} from \"../../src/library/scan.mjs\";\nimport {\n  HttpError,\n  asyncRoute,\n  requireIdentifier,\n  sendJson,\n  stringQuery,\n} from \"../http.mjs\";\n\nexport function createLibraryRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/library\",\n    asyncRoute(async (request, response) => {\n      const scan =\n        await scanWorkspaceLibrary(\n          context.workspaceRoot,\n        );\n      const filters = {\n        kind: stringQuery(\n          request.query.kind,\n          \"kind\",\n        ),\n        level: stringQuery(\n          request.query.level,\n          \"level\",\n        ),\n        collection: stringQuery(\n          request.query.collection,\n          \"collection\",\n        ),\n      };\n      const entries = findLibraryEntries(\n        scan.entries,\n        filters,\n      );\n\n      sendJson(response, {\n        summary: scan.summary,\n        filters,\n        entries: entries.map(publicEntry),\n        issues: scan.issues,\n      });\n    }),\n  );\n\n  router.get(\n    \"/library/:kind/:id\",\n    asyncRoute(async (request, response) => {\n      const kind = requireIdentifier(\n        request.params.kind,\n        \"kind\",\n      );\n      const id = requireIdentifier(\n        request.params.id,\n        \"id\",\n      );\n      const scan =\n        await scanWorkspaceLibrary(\n          context.workspaceRoot,\n        );\n      const matches = scan.entries.filter(\n        (entry) =>\n          entry.id === id &&\n          (entry.kind === kind ||\n            entry.category === kind),\n      );\n\n      if (matches.length === 0) {\n        throw new HttpError(\n          404,\n          \"LIBRARY_ENTRY_NOT_FOUND\",\n          `No library entry found for ${kind}:${id}.`,\n        );\n      }\n\n      if (matches.length > 1) {\n        throw new HttpError(\n          409,\n          \"AMBIGUOUS_LIBRARY_ENTRY\",\n          `Multiple library entries match ${kind}:${id}.`,\n          {\n            details: {\n              matches: matches.map(publicEntry),\n            },\n          },\n        );\n      }\n\n      const entry = matches[0];\n      const graph =\n        buildConsumerGraph(scan);\n\n      sendJson(response, {\n        entry: {\n          ...publicEntry(entry),\n          manifest: entry.manifest,\n        },\n        consumers:\n          consumersForEntry(entry, graph),\n        dependencies:\n          dependenciesForEntry(entry, graph),\n        issues: scan.issues.filter(\n          (issue) =>\n            issue.manifestPath ===\n              entry.manifestPath ||\n            issue.targetManifestPath ===\n              entry.manifestPath,\n        ),\n      });\n    }),\n  );\n\n  return router;\n}\n\nfunction publicEntry(entry) {\n  return {\n    id: entry.id,\n    kind: entry.kind,\n    category: entry.category,\n    title: entry.title,\n    level: entry.level,\n    collection: entry.collection,\n    ownerArtifact:\n      entry.ownerArtifact,\n    displayPath: entry.displayPath,\n    manifestPath: entry.manifestPath,\n  };\n}\n"]}, "server/routes/artifacts.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  createRevisionEtag,\n  etagMatches,\n} from \"../etag.mjs\";\nimport {\n  HttpError,\n  asyncRoute,\n  booleanQuery,\n  integerQuery,\n  requireIdentifier,\n  sendJson,\n} from \"../http.mjs\";\n\nconst DEFAULT_MAX_BYTES =\n  50 * 1024 * 1024;\n\nexport function createArtifactsRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/artifacts\",\n    asyncRoute(async (request, response) => {\n      const result =\n        await context.services.artifacts.list();\n      const etag = createRevisionEtag(\n        result.revision.id,\n        \"artifact-list\",\n      );\n\n      sendJson(\n        response,\n        {\n          artifacts:\n            result.artifacts.map(\n              publicArtifact,\n            ),\n          count:\n            result.artifacts.length,\n          librarySummary:\n            result.scan.summary,\n        },\n        {\n          etag,\n          revisionId:\n            result.revision.id,\n        },\n      );\n    }),\n  );\n\n  router.get(\n    \"/artifacts/:kind/:id\",\n    asyncRoute(async (request, response) => {\n      const kind = requireIdentifier(\n        request.params.kind,\n        \"kind\",\n      );\n      const id = requireIdentifier(\n        request.params.id,\n        \"id\",\n      );\n      const result =\n        await context.services.artifacts.get(\n          kind,\n          id,\n        );\n      const etag = createRevisionEtag(\n        result.revision.id,\n        \"artifact-detail\",\n        kind,\n        id,\n      );\n\n      sendJson(\n        response,\n        {\n          artifact: {\n            ...publicArtifact(\n              result.artifact,\n            ),\n            manifest:\n              result.artifact.manifest,\n          },\n          resolution:\n            result.resolution,\n          relatedIssues:\n            result.scan.issues.filter(\n              (issue) =>\n                issue.manifestPath ===\n                result.artifact\n                  .manifestPath,\n            ),\n        },\n        {\n          etag,\n          revisionId:\n            result.revision.id,\n        },\n      );\n    }),\n  );\n\n  router.get(\n    \"/artifacts/:kind/:id/preview\",\n    asyncRoute(async (request, response) => {\n      const kind = requireIdentifier(\n        request.params.kind,\n        \"kind\",\n      );\n      const id = requireIdentifier(\n        request.params.id,\n        \"id\",\n      );\n      const minify = booleanQuery(\n        request.query.minify,\n        \"minify\",\n        false,\n      );\n      const maxBytes = integerQuery(\n        request.query.maxBytes,\n        \"maxBytes\",\n        {\n          minimum: 1024,\n          maximum:\n            200 * 1024 * 1024,\n          defaultValue:\n            DEFAULT_MAX_BYTES,\n        },\n      );\n      const result =\n        await context.services.artifacts.preview(\n          kind,\n          id,\n          {\n            minify,\n            maxBytes,\n          },\n        );\n\n      if (!result.resolution.summary.valid) {\n        throw new HttpError(\n          422,\n          \"APPEARANCE_INVALID\",\n          `Artefact ${result.artifact.kind}:${result.artifact.id} has unresolved appearance errors.`,\n          {\n            details: {\n              issues:\n                result.resolution.issues,\n            },\n          },\n        );\n      }\n\n      const etag =\n        `\"sha256-${result.built.sha256}\"`;\n      response.setHeader(\"ETag\", etag);\n      response.setHeader(\n        \"X-MyDash-Revision\",\n        result.revision.id,\n      );\n\n      if (\n        etagMatches(\n          request.get(\"if-none-match\"),\n          etag,\n        )\n      ) {\n        response.status(304).end();\n        return;\n      }\n\n      response.status(200);\n      response.type(\"html\");\n      response.setHeader(\n        \"Content-Disposition\",\n        `inline; filename=\"${safeFilename(\n          result.artifact.id,\n        )}.html\"`,\n      );\n      response.setHeader(\n        \"X-MyDash-SHA256\",\n        result.built.sha256,\n      );\n      response.setHeader(\n        \"X-MyDash-Artifact\",\n        `${result.artifact.kind}:${result.artifact.id}`,\n      );\n      response.send(result.built.html);\n    }),\n  );\n\n  return router;\n}\n\nfunction publicArtifact(entry) {\n  return {\n    id: entry.id,\n    kind: entry.kind,\n    title: entry.title,\n    displayPath: entry.displayPath,\n    manifestPath: entry.manifestPath,\n  };\n}\n\nfunction safeFilename(value) {\n  return value.replace(\n    /[^a-z0-9-]/gi,\n    \"-\",\n  );\n}\n", "allowedPrevious": ["import {\n  Router,\n} from \"express\";\nimport {\n  scanWorkspaceLibrary,\n} from \"../../src/library/scan.mjs\";\nimport {\n  findArtifact,\n} from \"../../src/resolution/find-artifact.mjs\";\nimport {\n  resolveArtifactAppearance,\n} from \"../../src/resolution/resolve.mjs\";\nimport {\n  buildStandaloneArtifact,\n} from \"../../src/export/export-artifact.mjs\";\nimport {\n  HttpError,\n  asyncRoute,\n  booleanQuery,\n  integerQuery,\n  requireIdentifier,\n  sendJson,\n} from \"../http.mjs\";\n\nconst DEFAULT_MAX_BYTES =\n  50 * 1024 * 1024;\n\nexport function createArtifactsRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/artifacts\",\n    asyncRoute(async (request, response) => {\n      const scan =\n        await scanWorkspaceLibrary(\n          context.workspaceRoot,\n        );\n      const artifacts = scan.entries\n        .filter(\n          (entry) =>\n            entry.category === \"artifact\",\n        )\n        .map(publicArtifact);\n\n      sendJson(response, {\n        artifacts,\n        count: artifacts.length,\n        librarySummary: scan.summary,\n      });\n    }),\n  );\n\n  router.get(\n    \"/artifacts/:kind/:id\",\n    asyncRoute(async (request, response) => {\n      const { scan, artifact, resolution } =\n        await loadArtifact(\n          context,\n          request.params,\n        );\n\n      sendJson(response, {\n        artifact: {\n          ...publicArtifact(artifact),\n          manifest: artifact.manifest,\n        },\n        resolution,\n        relatedIssues: scan.issues.filter(\n          (issue) =>\n            issue.manifestPath ===\n              artifact.manifestPath,\n        ),\n      });\n    }),\n  );\n\n  router.get(\n    \"/artifacts/:kind/:id/preview\",\n    asyncRoute(async (request, response) => {\n      const { scan, artifact, resolution } =\n        await loadArtifact(\n          context,\n          request.params,\n        );\n\n      if (!resolution.summary.valid) {\n        throw new HttpError(\n          422,\n          \"APPEARANCE_INVALID\",\n          `Artefact ${artifact.kind}:${artifact.id} has unresolved appearance errors.`,\n          {\n            details: {\n              issues: resolution.issues,\n            },\n          },\n        );\n      }\n\n      const minify = booleanQuery(\n        request.query.minify,\n        \"minify\",\n        false,\n      );\n      const maxBytes = integerQuery(\n        request.query.maxBytes,\n        \"maxBytes\",\n        {\n          minimum: 1024,\n          maximum:\n            200 * 1024 * 1024,\n          defaultValue:\n            DEFAULT_MAX_BYTES,\n        },\n      );\n      const built =\n        await buildStandaloneArtifact({\n          workspaceRoot:\n            context.workspaceRoot,\n          scan,\n          artifact,\n          resolution,\n          minify,\n          maxBytes,\n        });\n\n      response.status(200);\n      response.type(\"html\");\n      response.setHeader(\n        \"Content-Disposition\",\n        `inline; filename=\"${safeFilename(\n          artifact.id,\n        )}.html\"`,\n      );\n      response.setHeader(\n        \"ETag\",\n        `\"sha256-${built.sha256}\"`,\n      );\n      response.setHeader(\n        \"X-MyDash-SHA256\",\n        built.sha256,\n      );\n      response.setHeader(\n        \"X-MyDash-Artifact\",\n        `${artifact.kind}:${artifact.id}`,\n      );\n      response.send(built.html);\n    }),\n  );\n\n  return router;\n}\n\nasync function loadArtifact(\n  context,\n  params,\n) {\n  const kind = requireIdentifier(\n    params.kind,\n    \"kind\",\n  );\n  const id = requireIdentifier(\n    params.id,\n    \"id\",\n  );\n  const scan =\n    await scanWorkspaceLibrary(\n      context.workspaceRoot,\n    );\n  const artifact = findArtifact(\n    scan,\n    id,\n    kind,\n  );\n  const resolution =\n    resolveArtifactAppearance(\n      scan,\n      artifact,\n    );\n\n  return {\n    scan,\n    artifact,\n    resolution,\n  };\n}\n\nfunction publicArtifact(entry) {\n  return {\n    id: entry.id,\n    kind: entry.kind,\n    title: entry.title,\n    displayPath: entry.displayPath,\n    manifestPath: entry.manifestPath,\n  };\n}\n\nfunction safeFilename(value) {\n  return value.replace(\n    /[^a-z0-9-]/gi,\n    \"-\",\n  );\n}\n"]}, "server/routes/validation.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  HttpError,\n  asyncRoute,\n  sendJson,\n} from \"../http.mjs\";\n\nconst DEFAULT_MAX_BYTES =\n  50 * 1024 * 1024;\n\nexport function createValidationRouter(context) {\n  const router = Router();\n\n  router.post(\n    \"/validation\",\n    asyncRoute(async (request, response) => {\n      const body =\n        request.body &&\n        typeof request.body === \"object\" &&\n        !Array.isArray(request.body)\n          ? request.body\n          : {};\n      const options =\n        validateBody(body);\n      const result =\n        await context.services.validation.validate(\n          options,\n        );\n\n      sendJson(\n        response,\n        result.report,\n        {\n          cacheControl: \"no-store\",\n          revisionId:\n            result.revision.id,\n        },\n      );\n    }),\n  );\n\n  return router;\n}\n\nfunction validateBody(body) {\n  const allowed = new Set([\n    \"artifactId\",\n    \"artifactKind\",\n    \"validateExports\",\n    \"validateRecipes\",\n    \"minify\",\n    \"maxBytes\",\n    \"failOnWarning\",\n  ]);\n  const unknown =\n    Object.keys(body).filter(\n      (key) => !allowed.has(key),\n    );\n\n  if (unknown.length > 0) {\n    throw new HttpError(\n      400,\n      \"UNKNOWN_VALIDATION_OPTIONS\",\n      `Unknown validation options: ${unknown.join(\", \")}.`,\n    );\n  }\n\n  return {\n    artifactId: optionalIdentifier(\n      body.artifactId,\n      \"artifactId\",\n    ),\n    artifactKind: optionalIdentifier(\n      body.artifactKind,\n      \"artifactKind\",\n    ),\n    validateExports: optionalBoolean(\n      body.validateExports,\n      \"validateExports\",\n      true,\n    ),\n    validateRecipes: optionalBoolean(\n      body.validateRecipes,\n      \"validateRecipes\",\n      true,\n    ),\n    minify: optionalBoolean(\n      body.minify,\n      \"minify\",\n      false,\n    ),\n    maxBytes: optionalInteger(\n      body.maxBytes,\n      \"maxBytes\",\n      DEFAULT_MAX_BYTES,\n    ),\n    failOnWarning: optionalBoolean(\n      body.failOnWarning,\n      \"failOnWarning\",\n      false,\n    ),\n  };\n}\n\nfunction optionalIdentifier(value, name) {\n  if (value === undefined || value === null) {\n    return null;\n  }\n\n  if (\n    typeof value !== \"string\" ||\n    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(\n      value,\n    )\n  ) {\n    throw new HttpError(\n      400,\n      \"INVALID_VALIDATION_OPTION\",\n      `${name} must be a kebab-case identifier.`,\n    );\n  }\n\n  return value;\n}\n\nfunction optionalBoolean(\n  value,\n  name,\n  defaultValue,\n) {\n  if (value === undefined) {\n    return defaultValue;\n  }\n\n  if (typeof value !== \"boolean\") {\n    throw new HttpError(\n      400,\n      \"INVALID_VALIDATION_OPTION\",\n      `${name} must be a boolean.`,\n    );\n  }\n\n  return value;\n}\n\nfunction optionalInteger(\n  value,\n  name,\n  defaultValue,\n) {\n  if (value === undefined) {\n    return defaultValue;\n  }\n\n  if (\n    !Number.isInteger(value) ||\n    value < 1024 ||\n    value > 200 * 1024 * 1024\n  ) {\n    throw new HttpError(\n      400,\n      \"INVALID_VALIDATION_OPTION\",\n      `${name} must be an integer between 1024 and ${200 * 1024 * 1024}.`,\n    );\n  }\n\n  return value;\n}\n", "allowedPrevious": ["import {\n  Router,\n} from \"express\";\nimport {\n  validateWorkspace,\n} from \"../../src/validation/workspace-validation.mjs\";\nimport {\n  HttpError,\n  asyncRoute,\n  sendJson,\n} from \"../http.mjs\";\n\nconst DEFAULT_MAX_BYTES =\n  50 * 1024 * 1024;\n\nexport function createValidationRouter(context) {\n  const router = Router();\n\n  router.post(\n    \"/validation\",\n    asyncRoute(async (request, response) => {\n      const body =\n        request.body &&\n        typeof request.body === \"object\" &&\n        !Array.isArray(request.body)\n          ? request.body\n          : {};\n\n      const options =\n        validateBody(body);\n      const report =\n        await validateWorkspace({\n          workspaceRoot:\n            context.workspaceRoot,\n          artifactId:\n            options.artifactId,\n          artifactKind:\n            options.artifactKind,\n          validateExports:\n            options.validateExports,\n          validateRecipes:\n            options.validateRecipes,\n          minify: options.minify,\n          maxBytes: options.maxBytes,\n          failOnWarning:\n            options.failOnWarning,\n          now: context.now,\n        });\n\n      sendJson(response, report);\n    }),\n  );\n\n  return router;\n}\n\nfunction validateBody(body) {\n  const allowed = new Set([\n    \"artifactId\",\n    \"artifactKind\",\n    \"validateExports\",\n    \"validateRecipes\",\n    \"minify\",\n    \"maxBytes\",\n    \"failOnWarning\",\n  ]);\n  const unknown =\n    Object.keys(body).filter(\n      (key) => !allowed.has(key),\n    );\n\n  if (unknown.length > 0) {\n    throw new HttpError(\n      400,\n      \"UNKNOWN_VALIDATION_OPTIONS\",\n      `Unknown validation options: ${unknown.join(\", \")}.`,\n    );\n  }\n\n  return {\n    artifactId: optionalIdentifier(\n      body.artifactId,\n      \"artifactId\",\n    ),\n    artifactKind: optionalIdentifier(\n      body.artifactKind,\n      \"artifactKind\",\n    ),\n    validateExports: optionalBoolean(\n      body.validateExports,\n      \"validateExports\",\n      true,\n    ),\n    validateRecipes: optionalBoolean(\n      body.validateRecipes,\n      \"validateRecipes\",\n      true,\n    ),\n    minify: optionalBoolean(\n      body.minify,\n      \"minify\",\n      false,\n    ),\n    maxBytes: optionalInteger(\n      body.maxBytes,\n      \"maxBytes\",\n      DEFAULT_MAX_BYTES,\n    ),\n    failOnWarning: optionalBoolean(\n      body.failOnWarning,\n      \"failOnWarning\",\n      false,\n    ),\n  };\n}\n\nfunction optionalIdentifier(value, name) {\n  if (value === undefined || value === null) {\n    return null;\n  }\n\n  if (\n    typeof value !== \"string\" ||\n    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(\n      value,\n    )\n  ) {\n    throw new HttpError(\n      400,\n      \"INVALID_VALIDATION_OPTION\",\n      `${name} must be a kebab-case identifier.`,\n    );\n  }\n\n  return value;\n}\n\nfunction optionalBoolean(\n  value,\n  name,\n  defaultValue,\n) {\n  if (value === undefined) {\n    return defaultValue;\n  }\n\n  if (typeof value !== \"boolean\") {\n    throw new HttpError(\n      400,\n      \"INVALID_VALIDATION_OPTION\",\n      `${name} must be a boolean.`,\n    );\n  }\n\n  return value;\n}\n\nfunction optionalInteger(\n  value,\n  name,\n  defaultValue,\n) {\n  if (value === undefined) {\n    return defaultValue;\n  }\n\n  if (\n    !Number.isInteger(value) ||\n    value < 1024 ||\n    value > 200 * 1024 * 1024\n  ) {\n    throw new HttpError(\n      400,\n      \"INVALID_VALIDATION_OPTION\",\n      `${name} must be an integer between 1024 and ${200 * 1024 * 1024}.`,\n    );\n  }\n\n  return value;\n}\n"]}, "server/routes/git.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  asyncRoute,\n  sendJson,\n} from \"../http.mjs\";\n\nexport function createGitRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/git/status\",\n    asyncRoute(async (request, response) => {\n      const status =\n        await context.services.git.status();\n\n      sendJson(response, status, {\n        cacheControl: \"no-store\",\n      });\n    }),\n  );\n\n  return router;\n}\n", "allowedPrevious": ["import {\n  Router,\n} from \"express\";\nimport {\n  getRepositoryStatus,\n} from \"../../src/git/status.mjs\";\nimport {\n  asyncRoute,\n  sendJson,\n} from \"../http.mjs\";\n\nexport function createGitRouter(context) {\n  const router = Router();\n\n  router.get(\n    \"/git/status\",\n    asyncRoute(async (request, response) => {\n      const status =\n        await getRepositoryStatus(\n          context.workspaceRoot,\n        );\n\n      sendJson(response, status);\n    }),\n  );\n\n  return router;\n}\n"]}, "server/routes/index.mjs": {"content": "import {\n  Router,\n} from \"express\";\nimport {\n  createArtifactsRouter,\n} from \"./artifacts.mjs\";\nimport {\n  createCapabilitiesRouter,\n} from \"./capabilities.mjs\";\nimport {\n  createGitRouter,\n} from \"./git.mjs\";\nimport {\n  createHealthRouter,\n} from \"./health.mjs\";\nimport {\n  createLibraryRouter,\n} from \"./library.mjs\";\nimport {\n  createStateRouter,\n} from \"./state.mjs\";\nimport {\n  createValidationRouter,\n} from \"./validation.mjs\";\n\nexport function createApiRouter(context) {\n  const router = Router();\n\n  router.use(\n    createCapabilitiesRouter(context),\n  );\n  router.use(\n    createHealthRouter(context),\n  );\n  router.use(\n    createStateRouter(context),\n  );\n  router.use(\n    createLibraryRouter(context),\n  );\n  router.use(\n    createArtifactsRouter(context),\n  );\n  router.use(\n    createValidationRouter(context),\n  );\n  router.use(\n    createGitRouter(context),\n  );\n\n  return router;\n}\n", "allowedPrevious": ["import {\n  Router,\n} from \"express\";\nimport {\n  createArtifactsRouter,\n} from \"./artifacts.mjs\";\nimport {\n  createCapabilitiesRouter,\n} from \"./capabilities.mjs\";\nimport {\n  createGitRouter,\n} from \"./git.mjs\";\nimport {\n  createHealthRouter,\n} from \"./health.mjs\";\nimport {\n  createLibraryRouter,\n} from \"./library.mjs\";\nimport {\n  createValidationRouter,\n} from \"./validation.mjs\";\n\nexport function createApiRouter(context) {\n  const router = Router();\n\n  router.use(\n    createCapabilitiesRouter(context),\n  );\n  router.use(\n    createHealthRouter(context),\n  );\n  router.use(\n    createLibraryRouter(context),\n  );\n  router.use(\n    createArtifactsRouter(context),\n  );\n  router.use(\n    createValidationRouter(context),\n  );\n  router.use(\n    createGitRouter(context),\n  );\n\n  return router;\n}\n"]}, "server/app.mjs": {"content": "import express from \"express\";\nimport {\n  loadWorkspaceConfig,\n} from \"../src/workspace/load-config.mjs\";\nimport {\n  loadPackageMetadata,\n} from \"../src/workspace/package-metadata.mjs\";\nimport {\n  errorHandler,\n  notFoundHandler,\n} from \"./middleware/errors.mjs\";\nimport {\n  requestContext,\n} from \"./middleware/request-context.mjs\";\nimport {\n  securityHeaders,\n} from \"./middleware/security.mjs\";\nimport {\n  createApiRouter,\n} from \"./routes/index.mjs\";\nimport {\n  createNavigatorServices,\n} from \"./services/navigator-services.mjs\";\n\nexport async function createApplication(\n  options,\n) {\n  const workspaceRoot =\n    options.workspaceRoot;\n  const now =\n    options.now ?? (() => new Date());\n  const logger =\n    options.logger ?? defaultLogger;\n  const config =\n    options.config ??\n    (await loadWorkspaceConfig(\n      workspaceRoot,\n    ));\n  const packageMetadata =\n    options.packageMetadata ??\n    (await loadPackageMetadata(\n      workspaceRoot,\n    ));\n  const startedAt =\n    options.startedAt ?? now();\n  const services =\n    options.services ??\n    createNavigatorServices({\n      workspaceRoot,\n      now,\n      logger,\n      pollIntervalMs:\n        options.revisionPollIntervalMs,\n      minimumCheckIntervalMs:\n        options.minimumRevisionCheckIntervalMs,\n    });\n\n  await services.start();\n\n  const context = {\n    workspaceRoot,\n    config,\n    packageMetadata,\n    now,\n    startedAt,\n    logger,\n    services,\n  };\n  const app = express();\n\n  app.disable(\"x-powered-by\");\n  app.set(\"query parser\", \"simple\");\n  app.use(\n    requestContext({\n      now,\n      logger,\n    }),\n  );\n  app.use(securityHeaders);\n  app.use(\n    \"/api\",\n    express.json({\n      limit: \"64kb\",\n      strict: true,\n      type: \"application/json\",\n    }),\n  );\n\n  app.get(\"/\", (request, response) => {\n    response.redirect(307, \"/api\");\n  });\n  app.use(\n    \"/api\",\n    createApiRouter(context),\n  );\n  app.use(notFoundHandler);\n  app.use(\n    errorHandler({ logger }),\n  );\n\n  let closed = false;\n\n  return {\n    app,\n    context,\n    async close() {\n      if (closed) return;\n      closed = true;\n      await services.close();\n    },\n  };\n}\n\nfunction defaultLogger(record) {\n  process.stdout.write(\n    `${JSON.stringify(record)}\\n`,\n  );\n}\n", "allowedPrevious": ["import express from \"express\";\nimport {\n  loadWorkspaceConfig,\n} from \"../src/workspace/load-config.mjs\";\nimport {\n  loadPackageMetadata,\n} from \"../src/workspace/package-metadata.mjs\";\nimport {\n  errorHandler,\n  notFoundHandler,\n} from \"./middleware/errors.mjs\";\nimport {\n  requestContext,\n} from \"./middleware/request-context.mjs\";\nimport {\n  securityHeaders,\n} from \"./middleware/security.mjs\";\nimport {\n  createApiRouter,\n} from \"./routes/index.mjs\";\n\nexport async function createApplication(\n  options,\n) {\n  const workspaceRoot =\n    options.workspaceRoot;\n  const now =\n    options.now ?? (() => new Date());\n  const logger =\n    options.logger ?? defaultLogger;\n  const config =\n    options.config ??\n    (await loadWorkspaceConfig(\n      workspaceRoot,\n    ));\n  const packageMetadata =\n    options.packageMetadata ??\n    (await loadPackageMetadata(\n      workspaceRoot,\n    ));\n  const startedAt =\n    options.startedAt ?? now();\n  const context = {\n    workspaceRoot,\n    config,\n    packageMetadata,\n    now,\n    startedAt,\n    logger,\n  };\n  const app = express();\n\n  app.disable(\"x-powered-by\");\n  app.set(\"query parser\", \"simple\");\n  app.use(\n    requestContext({\n      now,\n      logger,\n    }),\n  );\n  app.use(securityHeaders);\n  app.use(\n    \"/api\",\n    express.json({\n      limit: \"64kb\",\n      strict: true,\n      type: \"application/json\",\n    }),\n  );\n\n  app.get(\"/\", (request, response) => {\n    response.redirect(307, \"/api\");\n  });\n  app.use(\n    \"/api\",\n    createApiRouter(context),\n  );\n  app.use(notFoundHandler);\n  app.use(\n    errorHandler({ logger }),\n  );\n\n  return {\n    app,\n    context,\n  };\n}\n\nfunction defaultLogger(record) {\n  process.stdout.write(\n    `${JSON.stringify(record)}\\n`,\n  );\n}\n"]}, "server/start.mjs": {"content": "import {\n  createServer,\n} from \"node:http\";\nimport process from \"node:process\";\nimport {\n  resolve,\n} from \"node:path\";\nimport {\n  createApplication,\n} from \"./app.mjs\";\n\nexport async function startApplicationServer(\n  options = {},\n) {\n  const workspaceRoot = resolve(\n    options.workspaceRoot ??\n      process.cwd(),\n  );\n  const created =\n    await createApplication({\n      workspaceRoot,\n      logger:\n        options.logger,\n      now: options.now,\n      revisionPollIntervalMs:\n        options.revisionPollIntervalMs,\n      minimumRevisionCheckIntervalMs:\n        options.minimumRevisionCheckIntervalMs,\n    });\n  const host =\n    options.host ??\n    process.env.MYDASH_HOST ??\n    created.context.config.preview.host ??\n    \"127.0.0.1\";\n  const port = parsePort(\n    options.port ??\n      process.env.MYDASH_PORT ??\n      created.context.config.preview.port ??\n      4173,\n  );\n  const server = createServer(\n    created.app,\n  );\n\n  server.requestTimeout = 120_000;\n  server.headersTimeout = 15_000;\n  server.keepAliveTimeout = 5_000;\n\n  try {\n    await new Promise(\n      (resolvePromise, reject) => {\n        server.once(\"error\", reject);\n        server.listen(\n          port,\n          host,\n          () => {\n            server.off(\"error\", reject);\n            resolvePromise();\n          },\n        );\n      },\n    );\n  } catch (error) {\n    await created.close();\n    throw error;\n  }\n\n  const address = server.address();\n  const actualPort =\n    typeof address === \"object\" &&\n    address\n      ? address.port\n      : port;\n  const logger =\n    options.logger ??\n    ((record) =>\n      process.stdout.write(\n        `${JSON.stringify(record)}\\n`,\n      ));\n  let closing = false;\n\n  async function close(signal = \"explicit\") {\n    if (closing) return;\n    closing = true;\n\n    logger({\n      timestamp: new Date().toISOString(),\n      level: \"info\",\n      event: \"server.stopping\",\n      signal,\n    });\n\n    const timer = setTimeout(() => {\n      server.closeAllConnections?.();\n    }, 10_000);\n    timer.unref();\n\n    try {\n      await new Promise(\n        (resolvePromise, reject) => {\n          server.close((error) => {\n            if (error) reject(error);\n            else resolvePromise();\n          });\n        },\n      );\n      await created.close();\n      logger({\n        timestamp:\n          new Date().toISOString(),\n        level: \"info\",\n        event: \"server.stopped\",\n      });\n    } finally {\n      clearTimeout(timer);\n    }\n  }\n\n  logger({\n    timestamp: new Date().toISOString(),\n    level: \"info\",\n    event: \"server.started\",\n    host,\n    port: actualPort,\n    workspaceRoot,\n  });\n\n  if (options.installSignalHandlers !== false) {\n    process.once(\n      \"SIGINT\",\n      () => {\n        close(\"SIGINT\").catch(\n          handleShutdownError,\n        );\n      },\n    );\n    process.once(\n      \"SIGTERM\",\n      () => {\n        close(\"SIGTERM\").catch(\n          handleShutdownError,\n        );\n      },\n    );\n  }\n\n  return {\n    server,\n    app: created.app,\n    context: created.context,\n    host,\n    port: actualPort,\n    url: `http://${formatHost(host)}:${actualPort}`,\n    close,\n  };\n\n  function handleShutdownError(error) {\n    logger({\n      timestamp:\n        new Date().toISOString(),\n      level: \"error\",\n      event: \"server.stop.failed\",\n      message: error.message,\n    });\n    process.exitCode = 1;\n  }\n}\n\nfunction parsePort(value) {\n  const text = String(value);\n\n  if (!/^\\d+$/.test(text)) {\n    throw new Error(\n      `Server port must be an integer. Received: ${value}`,\n    );\n  }\n\n  const port = Number.parseInt(text, 10);\n\n  if (port < 0 || port > 65535) {\n    throw new Error(\n      `Server port must be between 0 and 65535. Received: ${value}`,\n    );\n  }\n\n  return port;\n}\n\nfunction formatHost(host) {\n  return host.includes(\":\")\n    ? `[${host}]`\n    : host;\n}\n\nif (\n  import.meta.url ===\n  `file://${process.argv[1]}`\n) {\n  await startApplicationServer();\n}\n", "allowedPrevious": ["import {\n  createServer,\n} from \"node:http\";\nimport process from \"node:process\";\nimport {\n  resolve,\n} from \"node:path\";\nimport {\n  createApplication,\n} from \"./app.mjs\";\n\nexport async function startApplicationServer(\n  options = {},\n) {\n  const workspaceRoot = resolve(\n    options.workspaceRoot ??\n      process.cwd(),\n  );\n  const created =\n    await createApplication({\n      workspaceRoot,\n      logger:\n        options.logger,\n      now: options.now,\n    });\n  const host =\n    options.host ??\n    process.env.MYDASH_HOST ??\n    created.context.config.preview.host ??\n    \"127.0.0.1\";\n  const port = parsePort(\n    options.port ??\n      process.env.MYDASH_PORT ??\n      created.context.config.preview.port ??\n      4173,\n  );\n  const server = createServer(\n    created.app,\n  );\n\n  server.requestTimeout = 120_000;\n  server.headersTimeout = 15_000;\n  server.keepAliveTimeout = 5_000;\n\n  await new Promise(\n    (resolvePromise, reject) => {\n      server.once(\"error\", reject);\n      server.listen(\n        port,\n        host,\n        () => {\n          server.off(\"error\", reject);\n          resolvePromise();\n        },\n      );\n    },\n  );\n\n  const address = server.address();\n  const actualPort =\n    typeof address === \"object\" &&\n    address\n      ? address.port\n      : port;\n  const logger =\n    options.logger ??\n    ((record) =>\n      process.stdout.write(\n        `${JSON.stringify(record)}\\n`,\n      ));\n\n  logger({\n    timestamp: new Date().toISOString(),\n    level: \"info\",\n    event: \"server.started\",\n    host,\n    port: actualPort,\n    workspaceRoot,\n  });\n\n  if (options.installSignalHandlers !== false) {\n    installShutdownHandlers(\n      server,\n      logger,\n    );\n  }\n\n  return {\n    server,\n    app: created.app,\n    context: created.context,\n    host,\n    port: actualPort,\n    url: `http://${formatHost(host)}:${actualPort}`,\n  };\n}\n\nfunction installShutdownHandlers(\n  server,\n  logger,\n) {\n  let closing = false;\n\n  const shutdown = (signal) => {\n    if (closing) return;\n    closing = true;\n\n    logger({\n      timestamp: new Date().toISOString(),\n      level: \"info\",\n      event: \"server.stopping\",\n      signal,\n    });\n\n    const timer = setTimeout(() => {\n      server.closeAllConnections?.();\n    }, 10_000);\n    timer.unref();\n\n    server.close((error) => {\n      clearTimeout(timer);\n\n      if (error) {\n        logger({\n          timestamp:\n            new Date().toISOString(),\n          level: \"error\",\n          event: \"server.stop.failed\",\n          message: error.message,\n        });\n        process.exitCode = 1;\n      } else {\n        logger({\n          timestamp:\n            new Date().toISOString(),\n          level: \"info\",\n          event: \"server.stopped\",\n        });\n      }\n    });\n  };\n\n  process.once(\n    \"SIGINT\",\n    () => shutdown(\"SIGINT\"),\n  );\n  process.once(\n    \"SIGTERM\",\n    () => shutdown(\"SIGTERM\"),\n  );\n}\n\nfunction parsePort(value) {\n  const text = String(value);\n\n  if (!/^\\d+$/.test(text)) {\n    throw new Error(\n      `Server port must be an integer. Received: ${value}`,\n    );\n  }\n\n  const port = Number.parseInt(text, 10);\n\n  if (port < 0 || port > 65535) {\n    throw new Error(\n      `Server port must be between 0 and 65535. Received: ${value}`,\n    );\n  }\n\n  return port;\n}\n\nfunction formatHost(host) {\n  return host.includes(\":\")\n    ? `[${host}]`\n    : host;\n}\n\nif (\n  import.meta.url ===\n  `file://${process.argv[1]}`\n) {\n  await startApplicationServer();\n}\n"]}, "server/README.md": {"content": "# HTTP server\n\nThe server is a thin Express interface over the same shared services used by the\nCLI. It does not reimplement discovery, resolution, export, validation or Git\nlogic.\n\n## Start\n\n```text\nnpm start\n```\n\nThe default address comes from `config/workspace.json`:\n\n```text\nhttp://127.0.0.1:4173\n```\n\nEnvironment overrides:\n\n```text\nMYDASH_HOST=127.0.0.1\nMYDASH_PORT=4173\n```\n\n## API\n\n```text\nGET  /api\nGET  /api/health\nGET  /api/capabilities\n\nGET  /api/library\nGET  /api/library/:kind/:id\n\nGET  /api/artifacts\nGET  /api/artifacts/:kind/:id\nGET  /api/artifacts/:kind/:id/preview\n\nPOST /api/validation\n\nGET  /api/git/status\n```\n\nThe server is deliberately read-only at this stage. Preview and validation\nbuilds happen in memory. It does not expose file writes, recipe refreshes,\nexports to disk, Git commits or pushes.\n\n## Response envelope\n\nJSON responses use:\n\n```json\n{\n  \"ok\": true,\n  \"data\": {},\n  \"meta\": {\n    \"requestId\": \"uuid\",\n    \"durationMs\": 3\n  }\n}\n```\n\nErrors use the same metadata with an `error` object.\n\n## Security\n\n- `X-Powered-By` is disabled.\n- API responses are not cached.\n- JSON request bodies are limited to 64 KiB.\n- Request IDs are validated before reuse.\n- The default host is loopback-only.\n- No CORS middleware is installed.\n- Preview HTML is generated through the standalone export validator.\n\n\n## Live state and caching\n\nBootstrap 14 adds a revision-aware service layer:\n\n```text\nGET /api/state\nGET /api/events\n```\n\nThe workspace revision is calculated from filesystem metadata beneath\n`config/`, `library/`, `recipes/` and `package.json`. The poller does not read\nor execute artefact code.\n\nLibrary scans, standalone previews and validation reports are cached against the\ncurrent revision. A detected change clears every revision-bound cache.\n\nRead-only GET routes return ETags. Clients may send `If-None-Match`; unchanged\nresponses return `304 Not Modified`.\n\nThe event stream emits:\n\n```text\nevent: workspace-revision\ndata: {\"id\":\"...\",\"sequence\":2}\n```\n\nThe future navigator can invalidate its own state immediately instead of\npolling every endpoint.\n", "allowedPrevious": ["# HTTP server\n\nThe server is a thin Express interface over the same shared services used by the\nCLI. It does not reimplement discovery, resolution, export, validation or Git\nlogic.\n\n## Start\n\n```text\nnpm start\n```\n\nThe default address comes from `config/workspace.json`:\n\n```text\nhttp://127.0.0.1:4173\n```\n\nEnvironment overrides:\n\n```text\nMYDASH_HOST=127.0.0.1\nMYDASH_PORT=4173\n```\n\n## API\n\n```text\nGET  /api\nGET  /api/health\nGET  /api/capabilities\n\nGET  /api/library\nGET  /api/library/:kind/:id\n\nGET  /api/artifacts\nGET  /api/artifacts/:kind/:id\nGET  /api/artifacts/:kind/:id/preview\n\nPOST /api/validation\n\nGET  /api/git/status\n```\n\nThe server is deliberately read-only at this stage. Preview and validation\nbuilds happen in memory. It does not expose file writes, recipe refreshes,\nexports to disk, Git commits or pushes.\n\n## Response envelope\n\nJSON responses use:\n\n```json\n{\n  \"ok\": true,\n  \"data\": {},\n  \"meta\": {\n    \"requestId\": \"uuid\",\n    \"durationMs\": 3\n  }\n}\n```\n\nErrors use the same metadata with an `error` object.\n\n## Security\n\n- `X-Powered-By` is disabled.\n- API responses are not cached.\n- JSON request bodies are limited to 64 KiB.\n- Request IDs are validated before reuse.\n- The default host is loopback-only.\n- No CORS middleware is installed.\n- Preview HTML is generated through the standalone export validator.\n"]}, "tests/unit/server-cache.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  mkdir,\n  mkdtemp,\n  rm,\n  writeFile,\n} from \"node:fs/promises\";\nimport {\n  join,\n  resolve,\n} from \"node:path\";\nimport test from \"node:test\";\nimport {\n  RevisionCache,\n} from \"../../server/services/revision-cache.mjs\";\nimport {\n  fingerprintWorkspace,\n} from \"../../src/files/workspace-fingerprint.mjs\";\n\ntest(\"revision cache coalesces concurrent loads\", async () => {\n  const cache = new RevisionCache(\n    \"test\",\n    { maxEntries: 2 },\n  );\n  let loads = 0;\n  let release;\n  const gate = new Promise(\n    (resolvePromise) => {\n      release = resolvePromise;\n    },\n  );\n\n  const first = cache.get(\n    \"scan\",\n    \"revision-1\",\n    async () => {\n      loads += 1;\n      await gate;\n      return { value: 1 };\n    },\n  );\n  const second = cache.get(\n    \"scan\",\n    \"revision-1\",\n    async () => {\n      loads += 1;\n      return { value: 2 };\n    },\n  );\n\n  release();\n\n  assert.deepEqual(\n    await Promise.all([first, second]),\n    [\n      { value: 1 },\n      { value: 1 },\n    ],\n  );\n  assert.equal(loads, 1);\n  assert.equal(\n    cache.snapshot().metrics.hits,\n    1,\n  );\n});\n\ntest(\"revision cache reloads after the revision changes\", async () => {\n  const cache = new RevisionCache(\n    \"test\",\n  );\n  let loads = 0;\n\n  await cache.get(\n    \"entry\",\n    \"revision-1\",\n    async () => ++loads,\n  );\n  await cache.get(\n    \"entry\",\n    \"revision-2\",\n    async () => ++loads,\n  );\n\n  assert.equal(loads, 2);\n  assert.equal(\n    cache.snapshot().metrics.misses,\n    2,\n  );\n});\n\ntest(\"workspace fingerprint changes after a source edit\", async () => {\n  const root = await mkdtemp(\n    resolve(\n      process.cwd(),\n      \".my-dashboards-fingerprint-\",\n    ),\n  );\n\n  try {\n    await mkdir(\n      join(root, \"config\"),\n      { recursive: true },\n    );\n    await mkdir(\n      join(root, \"library\"),\n      { recursive: true },\n    );\n    await writeFile(\n      join(\n        root,\n        \"config\",\n        \"workspace.json\",\n      ),\n      \"{}\\n\",\n    );\n    const sourcePath = join(\n      root,\n      \"library\",\n      \"source.js\",\n    );\n    await writeFile(\n      sourcePath,\n      \"export const value = 1;\\n\",\n    );\n\n    const first =\n      await fingerprintWorkspace(root);\n    await writeFile(\n      sourcePath,\n      \"export const value = 200;\\n\",\n    );\n    const second =\n      await fingerprintWorkspace(root);\n\n    assert.notEqual(\n      first.id,\n      second.id,\n    );\n  } finally {\n    await rm(root, {\n      recursive: true,\n      force: true,\n    });\n  }\n});\n"}, "tests/integration/server.test.mjs": {"content": "import assert from \"node:assert/strict\";\nimport {\n  cp,\n  mkdtemp,\n  readFile,\n  rm,\n  writeFile,\n} from \"node:fs/promises\";\nimport {\n  createServer,\n} from \"node:http\";\nimport {\n  dirname,\n  join,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport test from \"node:test\";\nimport {\n  createApplication,\n} from \"../../server/app.mjs\";\n\nconst testDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  testDirectory,\n  \"../..\",\n);\nconst fixtureWorkspace = resolve(\n  projectRoot,\n  \"tests\",\n  \"fixtures\",\n  \"export-workspace\",\n);\nconst tempRoot = resolve(\n  projectRoot,\n  \".my-dashboards\",\n  \"temp\",\n  \"server-cache-tests\",\n);\n\ntest(\"health and capabilities expose live server state\", async () => {\n  await withServer(\n    fixtureWorkspace,\n    async (baseUrl) => {\n      const health = await getJson(\n        `${baseUrl}/api/health`,\n      );\n      const capabilities = await getJson(\n        `${baseUrl}/api/capabilities`,\n      );\n      const state = await getJson(\n        `${baseUrl}/api/state`,\n      );\n\n      assert.equal(\n        health.response.status,\n        200,\n      );\n      assert.equal(health.body.ok, true);\n      assert.equal(\n        health.body.data.status,\n        \"ok\",\n      );\n      assert.match(\n        health.body.data.revision.id,\n        /^[a-f0-9]{64}$/,\n      );\n      assert.match(\n        health.response.headers.get(\n          \"x-request-id\",\n        ),\n        /^[A-Za-z0-9._-]+$/,\n      );\n      assert.equal(\n        capabilities.body.data.runtime\n          .readOnlyHttp,\n        true,\n      );\n      assert.equal(\n        capabilities.body.data.features.some(\n          (feature) =>\n            feature.id ===\n            \"navigator.live-state\",\n        ),\n        true,\n      );\n      assert.equal(\n        state.body.data.caches.library\n          .name,\n        \"library\",\n      );\n    },\n  );\n});\n\ntest(\"library and artefact routes reuse cached shared services\", async () => {\n  await withServer(\n    fixtureWorkspace,\n    async (baseUrl) => {\n      const first = await fetch(\n        `${baseUrl}/api/library?kind=component`,\n      );\n      const firstBody =\n        await first.json();\n      const etag =\n        first.headers.get(\"etag\");\n      const second = await fetch(\n        `${baseUrl}/api/library?kind=component`,\n        {\n          headers: {\n            \"if-none-match\": etag,\n          },\n        },\n      );\n      const artifact = await getJson(\n        `${baseUrl}/api/artifacts/dashboard/use-case-pipeline`,\n      );\n      const state = await getJson(\n        `${baseUrl}/api/state`,\n      );\n\n      assert.equal(first.status, 200);\n      assert.equal(\n        firstBody.data.entries.length,\n        2,\n      );\n      assert.match(\n        etag,\n        /^\"sha256-[a-f0-9]{64}\"$/,\n      );\n      assert.equal(second.status, 304);\n      assert.equal(\n        artifact.body.data.artifact.id,\n        \"use-case-pipeline\",\n      );\n      assert.equal(\n        artifact.body.data.resolution\n          .selections.components[\n            \"metric-summary\"\n          ].entry.level,\n        \"local\",\n      );\n      assert.equal(\n        state.body.data.caches.library\n          .metrics.hits > 0,\n        true,\n      );\n    },\n  );\n});\n\ntest(\"preview route returns and conditionally reuses standalone HTML\", async () => {\n  await withServer(\n    fixtureWorkspace,\n    async (baseUrl) => {\n      const response = await fetch(\n        `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/preview`,\n      );\n      const html = await response.text();\n      const etag =\n        response.headers.get(\"etag\");\n      const cached = await fetch(\n        `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/preview`,\n        {\n          headers: {\n            \"if-none-match\": etag,\n          },\n        },\n      );\n\n      assert.equal(response.status, 200);\n      assert.match(\n        response.headers.get(\n          \"content-type\",\n        ),\n        /^text\\/html/,\n      );\n      assert.match(\n        response.headers.get(\n          \"x-mydash-sha256\",\n        ),\n        /^[a-f0-9]{64}$/,\n      );\n      assert.match(\n        html,\n        /data-mydash-standalone/,\n      );\n      assert.match(\n        html,\n        /Use Case Pipeline/,\n      );\n      assert.equal(cached.status, 304);\n    },\n  );\n});\n\ntest(\"filesystem edits advance the revision and invalidate previews\", async () => {\n  await rm(tempRoot, {\n    recursive: true,\n    force: true,\n  });\n  const workspace = await mkdtemp(\n    join(tempRoot, \"workspace-\"),\n  );\n  await cp(\n    fixtureWorkspace,\n    workspace,\n    {\n      recursive: true,\n      filter(path) {\n        return !path.includes(\".tmp-\");\n      },\n    },\n  );\n\n  try {\n    await withServer(\n      workspace,\n      async (baseUrl) => {\n        const beforeState = await getJson(\n          `${baseUrl}/api/state`,\n        );\n        const beforePreview = await fetch(\n          `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/preview`,\n        );\n        const beforeEtag =\n          beforePreview.headers.get(\"etag\");\n        const sourcePath = resolve(\n          workspace,\n          \"library\",\n          \"dashboards\",\n          \"use-case-pipeline\",\n          \"src\",\n          \"index.html\",\n        );\n        const source =\n          await readFile(\n            sourcePath,\n            \"utf8\",\n          );\n        await writeFile(\n          sourcePath,\n          source.replace(\n            \"Use Case Pipeline\",\n            \"Use Case Pipeline Updated\",\n          ),\n        );\n\n        const afterState =\n          await waitForRevisionChange(\n            baseUrl,\n            beforeState.body.data\n              .revision.id,\n          );\n        const afterPreview = await fetch(\n          `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/preview`,\n        );\n        const afterHtml =\n          await afterPreview.text();\n\n        assert.notEqual(\n          afterState.revision.id,\n          beforeState.body.data\n            .revision.id,\n        );\n        assert.notEqual(\n          afterPreview.headers.get(\"etag\"),\n          beforeEtag,\n        );\n        assert.match(\n          afterHtml,\n          /Use Case Pipeline Updated/,\n        );\n      },\n      {\n        revisionPollIntervalMs: 20,\n        minimumRevisionCheckIntervalMs: 0,\n      },\n    );\n  } finally {\n    await rm(tempRoot, {\n      recursive: true,\n      force: true,\n    });\n  }\n});\n\ntest(\"validation route returns an in-memory report\", async () => {\n  await withServer(\n    fixtureWorkspace,\n    async (baseUrl) => {\n      const response = await fetch(\n        `${baseUrl}/api/validation`,\n        {\n          method: \"POST\",\n          headers: {\n            \"content-type\":\n              \"application/json\",\n          },\n          body: JSON.stringify({\n            validateExports: false,\n            validateRecipes: true,\n          }),\n        },\n      );\n      const body = await response.json();\n\n      assert.equal(response.status, 200);\n      assert.equal(body.ok, true);\n      assert.equal(\n        body.data.summary.valid,\n        true,\n      );\n      assert.equal(\n        body.data.stages.exports.status,\n        \"skipped\",\n      );\n    },\n  );\n});\n\ntest(\"event stream emits the current workspace revision\", async () => {\n  await withServer(\n    fixtureWorkspace,\n    async (baseUrl) => {\n      const controller =\n        new AbortController();\n      const response = await fetch(\n        `${baseUrl}/api/events`,\n        {\n          signal: controller.signal,\n        },\n      );\n      const reader =\n        response.body.getReader();\n      const first = await reader.read();\n      const text = new TextDecoder().decode(\n        first.value,\n      );\n\n      controller.abort();\n\n      assert.equal(response.status, 200);\n      assert.match(\n        response.headers.get(\n          \"content-type\",\n        ),\n        /^text\\/event-stream/,\n      );\n      assert.match(\n        text,\n        /event: workspace-revision/,\n      );\n    },\n  );\n});\n\ntest(\"unknown routes and malformed JSON use the error envelope\", async () => {\n  await withServer(\n    fixtureWorkspace,\n    async (baseUrl) => {\n      const missing = await getJson(\n        `${baseUrl}/api/not-here`,\n      );\n      const malformed = await fetch(\n        `${baseUrl}/api/validation`,\n        {\n          method: \"POST\",\n          headers: {\n            \"content-type\":\n              \"application/json\",\n          },\n          body: \"{ invalid\",\n        },\n      );\n      const malformedBody =\n        await malformed.json();\n\n      assert.equal(\n        missing.response.status,\n        404,\n      );\n      assert.equal(\n        missing.body.error.code,\n        \"ROUTE_NOT_FOUND\",\n      );\n      assert.equal(\n        malformed.status,\n        400,\n      );\n      assert.equal(\n        malformedBody.error.code,\n        \"INVALID_JSON_BODY\",\n      );\n    },\n  );\n});\n\nasync function withServer(\n  workspaceRoot,\n  callback,\n  options = {},\n) {\n  const logs = [];\n  const created =\n    await createApplication({\n      workspaceRoot,\n      logger(record) {\n        logs.push(record);\n      },\n      revisionPollIntervalMs:\n        options.revisionPollIntervalMs ??\n        50,\n      minimumRevisionCheckIntervalMs:\n        options.minimumRevisionCheckIntervalMs ??\n        0,\n    });\n  const server = createServer(\n    created.app,\n  );\n\n  await new Promise(\n    (resolvePromise, reject) => {\n      server.once(\"error\", reject);\n      server.listen(\n        0,\n        \"127.0.0.1\",\n        () => {\n          server.off(\"error\", reject);\n          resolvePromise();\n        },\n      );\n    },\n  );\n\n  const address = server.address();\n  const baseUrl =\n    `http://127.0.0.1:${address.port}`;\n\n  try {\n    await callback(baseUrl, logs);\n  } finally {\n    server.closeAllConnections?.();\n    await new Promise(\n      (resolvePromise, reject) => {\n        server.close((error) => {\n          if (error) reject(error);\n          else resolvePromise();\n        });\n      },\n    );\n    await created.close();\n  }\n}\n\nasync function getJson(url) {\n  const response = await fetch(url);\n  return {\n    response,\n    body: await response.json(),\n  };\n}\n\nasync function waitForRevisionChange(\n  baseUrl,\n  previousRevision,\n) {\n  const deadline = Date.now() + 5_000;\n\n  while (Date.now() < deadline) {\n    const result = await getJson(\n      `${baseUrl}/api/state`,\n    );\n\n    if (\n      result.body.data.revision.id !==\n      previousRevision\n    ) {\n      return result.body.data;\n    }\n\n    await new Promise((resolvePromise) =>\n      setTimeout(resolvePromise, 25),\n    );\n  }\n\n  throw new Error(\n    \"Workspace revision did not change within the test deadline.\",\n  );\n}\n", "allowedPrevious": ["import assert from \"node:assert/strict\";\nimport {\n  createServer,\n} from \"node:http\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport test from \"node:test\";\nimport {\n  createApplication,\n} from \"../../server/app.mjs\";\n\nconst testDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  testDirectory,\n  \"../..\",\n);\nconst workspaceRoot = resolve(\n  projectRoot,\n  \"tests\",\n  \"fixtures\",\n  \"export-workspace\",\n);\n\ntest(\"health and capabilities expose the server foundation\", async () => {\n  await withServer(async (baseUrl) => {\n    const health = await getJson(\n      `${baseUrl}/api/health`,\n    );\n    const capabilities = await getJson(\n      `${baseUrl}/api/capabilities`,\n    );\n\n    assert.equal(health.response.status, 200);\n    assert.equal(health.body.ok, true);\n    assert.equal(\n      health.body.data.status,\n      \"ok\",\n    );\n    assert.match(\n      health.response.headers.get(\n        \"x-request-id\",\n      ),\n      /^[A-Za-z0-9._-]+$/,\n    );\n    assert.equal(\n      capabilities.body.data.runtime\n        .readOnlyHttp,\n      true,\n    );\n    assert.equal(\n      capabilities.body.data.features.some(\n        (feature) =>\n          feature.id ===\n          \"artifact.standalone-export\",\n      ),\n      true,\n    );\n  });\n});\n\ntest(\"library and artefact routes reuse discovery and resolution services\", async () => {\n  await withServer(async (baseUrl) => {\n    const library = await getJson(\n      `${baseUrl}/api/library?kind=component`,\n    );\n    const artifact = await getJson(\n      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline`,\n    );\n\n    assert.equal(\n      library.body.data.entries.length,\n      2,\n    );\n    assert.equal(\n      artifact.body.data.artifact.id,\n      \"use-case-pipeline\",\n    );\n    assert.equal(\n      artifact.body.data.resolution\n        .selections.components[\n          \"metric-summary\"\n        ].entry.level,\n      \"local\",\n    );\n  });\n});\n\ntest(\"preview route returns validated standalone HTML\", async () => {\n  await withServer(async (baseUrl) => {\n    const response = await fetch(\n      `${baseUrl}/api/artifacts/dashboard/use-case-pipeline/preview`,\n    );\n    const html = await response.text();\n\n    assert.equal(response.status, 200);\n    assert.match(\n      response.headers.get(\n        \"content-type\",\n      ),\n      /^text\\/html/,\n    );\n    assert.match(\n      response.headers.get(\n        \"x-mydash-sha256\",\n      ),\n      /^[a-f0-9]{64}$/,\n    );\n    assert.match(\n      html,\n      /data-mydash-standalone/,\n    );\n    assert.match(\n      html,\n      /Use Case Pipeline/,\n    );\n  });\n});\n\ntest(\"validation route returns an in-memory report\", async () => {\n  await withServer(async (baseUrl) => {\n    const response = await fetch(\n      `${baseUrl}/api/validation`,\n      {\n        method: \"POST\",\n        headers: {\n          \"content-type\":\n            \"application/json\",\n        },\n        body: JSON.stringify({\n          validateExports: false,\n          validateRecipes: true,\n        }),\n      },\n    );\n    const body = await response.json();\n\n    assert.equal(response.status, 200);\n    assert.equal(body.ok, true);\n    assert.equal(\n      body.data.summary.valid,\n      true,\n    );\n    assert.equal(\n      body.data.stages.exports.status,\n      \"skipped\",\n    );\n  });\n});\n\ntest(\"unknown routes and malformed JSON use the error envelope\", async () => {\n  await withServer(async (baseUrl) => {\n    const missing = await getJson(\n      `${baseUrl}/api/not-here`,\n    );\n    const malformed = await fetch(\n      `${baseUrl}/api/validation`,\n      {\n        method: \"POST\",\n        headers: {\n          \"content-type\":\n            \"application/json\",\n        },\n        body: \"{ invalid\",\n      },\n    );\n    const malformedBody =\n      await malformed.json();\n\n    assert.equal(\n      missing.response.status,\n      404,\n    );\n    assert.equal(\n      missing.body.error.code,\n      \"ROUTE_NOT_FOUND\",\n    );\n    assert.equal(\n      malformed.status,\n      400,\n    );\n    assert.equal(\n      malformedBody.error.code,\n      \"INVALID_JSON_BODY\",\n    );\n  });\n});\n\nasync function withServer(callback) {\n  const logs = [];\n  const created =\n    await createApplication({\n      workspaceRoot,\n      logger(record) {\n        logs.push(record);\n      },\n      now: () =>\n        new Date(\n          \"2026-07-26T12:00:00.000Z\",\n        ),\n      startedAt: new Date(\n        \"2026-07-26T11:00:00.000Z\",\n      ),\n    });\n  const server = createServer(\n    created.app,\n  );\n\n  await new Promise(\n    (resolvePromise, reject) => {\n      server.once(\"error\", reject);\n      server.listen(\n        0,\n        \"127.0.0.1\",\n        () => {\n          server.off(\"error\", reject);\n          resolvePromise();\n        },\n      );\n    },\n  );\n\n  const address = server.address();\n  const baseUrl =\n    `http://127.0.0.1:${address.port}`;\n\n  try {\n    await callback(baseUrl, logs);\n  } finally {\n    await new Promise(\n      (resolvePromise, reject) => {\n        server.close((error) => {\n          if (error) reject(error);\n          else resolvePromise();\n        });\n      },\n    );\n  }\n}\n\nasync function getJson(url) {\n  const response = await fetch(url);\n  return {\n    response,\n    body: await response.json(),\n  };\n}\n"]}, "scripts/tasks/test-server.mjs": {"content": "#!/usr/bin/env node\n\nimport {\n  spawnSync,\n} from \"node:child_process\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  scriptDirectory,\n  \"../..\",\n);\n\nconst tests = [\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"unit\",\n    \"server-cache.test.mjs\",\n  ),\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"integration\",\n    \"server.test.mjs\",\n  ),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n    maxBuffer:\n      64 * 1024 * 1024,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode = result.status ?? 1;\n", "allowedPrevious": ["#!/usr/bin/env node\n\nimport {\n  spawnSync,\n} from \"node:child_process\";\nimport {\n  dirname,\n  resolve,\n} from \"node:path\";\nimport {\n  fileURLToPath,\n} from \"node:url\";\nimport process from \"node:process\";\n\nconst scriptDirectory = dirname(\n  fileURLToPath(import.meta.url),\n);\nconst projectRoot = resolve(\n  scriptDirectory,\n  \"../..\",\n);\n\nconst tests = [\n  resolve(\n    projectRoot,\n    \"tests\",\n    \"integration\",\n    \"server.test.mjs\",\n  ),\n];\n\nconst result = spawnSync(\n  process.execPath,\n  [\"--test\", ...tests],\n  {\n    cwd: projectRoot,\n    stdio: \"inherit\",\n    shell: false,\n    maxBuffer:\n      64 * 1024 * 1024,\n  },\n);\n\nif (result.error) throw result.error;\nprocess.exitCode = result.status ?? 1;\n"]}};

const args = parseBootstrapArgs(
  process.argv.slice(2),
);
const targetRoot = resolve(
  args.target ?? process.cwd(),
);
const selfPath = resolve(
  fileURLToPath(import.meta.url),
);

const report = {
  ok: false,
  script: SCRIPT_NAME,
  targetRoot,
  dryRun: args.dryRun,
  created: [],
  updated: [],
  preserved: [],
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

  const repoRoot =
    getRepositoryRoot(targetRoot);

  if (
    !repoRoot ||
    resolve(repoRoot) !== targetRoot
  ) {
    throw new Error(
      "Bootstrap 14 must run from the root of the My Dashboards Git repository.",
    );
  }

  const dirtyBefore =
    getDirtyPaths(repoRoot);
  const ownedAbsolutePaths = [];

  for (
    const [
      relativePath,
      descriptor,
    ] of Object.entries(FILES)
  ) {
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
    "14-build-navigator-http-services.mjs",
  );

  if (
    selfPath === expectedSelfPath &&
    (await pathExists(selfPath))
  ) {
    ownedAbsolutePaths.push(selfPath);
  }

  if (
    !args.noCommit &&
    !args.dryRun
  ) {
    await checkpoint(
      repoRoot,
      uniquePaths(
        ownedAbsolutePaths,
      ),
    );
  } else if (args.noCommit) {
    report.warnings.push({
      code: "COMMIT_DISABLED",
      message:
        "Navigator HTTP services were created and tested, but --no-commit disabled the Git checkpoint.",
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
My Dashboards — Bootstrap 14

Usage:
  node scripts/14-build-navigator-http-services.mjs [options]

Options:
  --target <path>  Build HTTP services in a specific repository root.
  --dry-run        Report intended changes without writing or committing.
  --no-commit      Write and validate without committing or pushing.
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
    "node_modules/express",
    "server/app.mjs",
    "server/start.mjs",
    "server/http.mjs",
    "server/middleware/errors.mjs",
    "server/middleware/security.mjs",
    "server/routes/index.mjs",
    "server/routes/health.mjs",
    "server/routes/capabilities.mjs",
    "server/routes/library.mjs",
    "server/routes/artifacts.mjs",
    "server/routes/validation.mjs",
    "server/routes/git.mjs",
    "tests/integration/server.test.mjs",
    "scripts/tasks/test-server.mjs",
    "scripts/tasks/test-git.mjs",
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
        "Bootstrap 13 has not been completed.",
        `Missing required paths: ${missing.join(", ")}`,
      ].join("\n"),
    );
  }
}

async function writeManagedFile({
  absolutePath,
  content,
  allowedPrevious,
  dirtyBefore,
  repoRoot,
}) {
  const gitPath =
    relativeGitPath(
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
      code:
        "PREEXISTING_FILE_CHANGES",
      message:
        `Preserved pre-existing changes in ${gitPath}.`,
    });
    return "preserved";
  }

  if (exists) {
    const current =
      await readFile(
        absolutePath,
        "utf8",
      );

    if (current === content) {
      report.preserved.push(gitPath);
      return "preserved";
    }

    if (
      !allowedPrevious.includes(
        current,
      )
    ) {
      report.preserved.push(gitPath);
      report.warnings.push({
        code:
          "EXISTING_FILE_PRESERVED",
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
        "The live HTTP service layer was calculated without writing it.",
    });
    return;
  }

  const modulePaths = [
    "src/files/workspace-fingerprint.mjs",
    "src/workspace/capabilities.mjs",
    "server/etag.mjs",
    "server/http.mjs",
    "server/middleware/security.mjs",
    "server/middleware/errors.mjs",
    "server/services/revision-cache.mjs",
    "server/services/workspace-revision.mjs",
    "server/services/library.mjs",
    "server/services/artifacts.mjs",
    "server/services/validation.mjs",
    "server/services/navigator-services.mjs",
    "server/routes/health.mjs",
    "server/routes/capabilities.mjs",
    "server/routes/state.mjs",
    "server/routes/library.mjs",
    "server/routes/artifacts.mjs",
    "server/routes/validation.mjs",
    "server/routes/git.mjs",
    "server/routes/index.mjs",
    "server/app.mjs",
    "server/start.mjs",
    "tests/unit/server-cache.test.mjs",
    "tests/integration/server.test.mjs",
    "scripts/tasks/test-server.mjs",
  ];

  for (
    const relativePath of modulePaths
  ) {
    const result = run(
      process.execPath,
      [
        "--check",
        join(
          targetRoot,
          relativePath,
        ),
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
      `${modulePaths.length} live-state, cache, route and test modules passed Node syntax checks.`,
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
      `Navigator HTTP service tests failed:\n${
        tests.stderr ||
        tests.stdout
      }`,
    );
  }

  report.validation.push({
    check: "server-tests",
    ok: true,
    message:
      "Revision detection, scan caching, preview caching, ETags, invalidation and event-stream tests passed.",
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
      [
        join(
          targetRoot,
          task,
        ),
      ],
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
        relativeGitPath(
          repoRoot,
          path,
        ),
      ),
  );

  if (ownedPaths.length === 0) {
    report.warnings.push({
      code:
        "NO_CHECKPOINT_CHANGES",
      message:
        "Navigator HTTP services were already present; there were no task-owned changes to commit.",
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
      code:
        "GIT_IDENTITY_MISSING",
      message:
        "HTTP services were created and tested, but no commit was made because Git user.name or user.email is missing.",
    });
    return;
  }

  run(
    "git",
    [
      "add",
      "--",
      ...ownedPaths,
    ],
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
    .map((value) =>
      value.trim(),
    )
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
    [
      "rev-parse",
      "--short",
      "HEAD",
    ],
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
    [
      "branch",
      "--show-current",
    ],
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
      .map((value) =>
        value.trim(),
      )
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
    [
      "rev-parse",
      "--show-toplevel",
    ],
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
        options.cwd ??
        targetRoot,
      encoding: "utf8",
      stdio: "pipe",
      shell: false,
      maxBuffer:
        64 * 1024 * 1024,
    },
  );

  if (result.error) {
    throw result.error;
  }

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
    status:
      result.status ?? 1,
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
      JSON.stringify(
        report,
        null,
        2,
      ),
    );
    process.exit(exitCode);
  }

  console.log(
    "\nMy Dashboards — navigator HTTP services\n",
  );
  console.log(
    `Target: ${report.targetRoot}`,
  );
  console.log(
    `Result: ${
      report.ok
        ? "PASS"
        : "FAIL"
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

  if (
    report.validation.length > 0
  ) {
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

  if (
    report.warnings.length > 0
  ) {
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

function printSection(
  title,
  items,
) {
  console.log(`\n${title}:`);

  if (items.length === 0) {
    console.log("  none");
    return;
  }

  for (const item of items) {
    console.log(`  ${item}`);
  }
}
