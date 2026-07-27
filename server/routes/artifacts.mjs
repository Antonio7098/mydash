import { Router } from "express";
import {
  createRevisionEtag,
  etagMatches,
} from "../etag.mjs";
import {
  HttpError,
  asyncRoute,
  booleanQuery,
  integerQuery,
  requireIdentifier,
  sendJson,
  stringQuery,
} from "../http.mjs";
import {
  normaliseAppearanceInput,
  parseAppearanceQuery,
} from "../../src/appearance/controls.mjs";

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

export function createArtifactsRouter(context) {
  const router = Router();

  router.get(
    "/users",
    asyncRoute(async (_request, response) => {
      const result = await context.services.artifacts.users();
      const etag = createRevisionEtag(
        result.revision.id,
        "user-list-v1",
      );

      sendJson(
        response,
        {
          currentUserId: result.currentUserId,
          userIds: result.userIds,
        },
        {
          etag,
          revisionId: result.revision.id,
        },
      );
    }),
  );

  router.get(
    "/artifacts",
    asyncRoute(async (request, response) => {
      const userId = requestUserId(request, context);
      const result = await context.services.artifacts.list(userId);
      const etag = createRevisionEtag(
        result.revision.id,
        "artifact-list-v3",
        userId,
      );

      sendJson(
        response,
        {
          artifacts: result.artifacts.map(publicArtifact),
          count: result.artifacts.length,
          userId,
          librarySummary: result.scan.summary,
        },
        {
          etag,
          revisionId: result.revision.id,
        },
      );
    }),
  );

  router.get(
    "/artifacts/:kind/:id/appearance-options",
    asyncRoute(async (request, response) => {
      const kind = requireIdentifier(request.params.kind, "kind");
      const id = requireIdentifier(request.params.id, "id");
      const userId = requestUserId(request, context);
      const result =
        await context.services.artifacts.appearanceOptions(
          kind,
          id,
          userId,
        );
      const etag = createRevisionEtag(
        result.revision.id,
        "artifact-appearance-options-v1",
        kind,
        id,
        userId,
      );

      sendJson(
        response,
        {
          artifact: publicArtifact(result.sourceArtifact),
          current: result.controls.current,
          resolved: result.resolution,
          options: result.controls.options,
          slots: result.controls.slots,
          revision: result.revision,
        },
        {
          etag,
          revisionId: result.revision.id,
        },
      );
    }),
  );

  router.put(
    "/artifacts/:kind/:id/appearance",
    asyncRoute(async (request, response) => {
      requireSameOriginMutation(request);
      const kind = requireIdentifier(request.params.kind, "kind");
      const id = requireIdentifier(request.params.id, "id");
      const userId = requestUserId(request, context);
      const body = validateAppearanceBody(request.body);
      const result = await context.services.artifacts.saveAppearance(
        kind,
        id,
        body,
        userId,
      );

      sendJson(
        response,
        {
          artifact: publicArtifact(result.artifact),
          appearance: result.appearance,
          resolution: result.resolution,
          export: result.export,
          checkpoint: result.checkpoint,
          revision: result.revision,
        },
        {
          cacheControl: "no-store",
          revisionId: result.revision.id,
        },
      );
    }),
  );

  router.get(
    "/artifacts/:kind/:id",
    asyncRoute(async (request, response) => {
      const kind = requireIdentifier(request.params.kind, "kind");
      const id = requireIdentifier(request.params.id, "id");
      const userId = requestUserId(request, context);
      const result = await context.services.artifacts.get(
        kind,
        id,
        null,
        userId,
      );
      const etag = createRevisionEtag(
        result.revision.id,
        "artifact-detail-v3",
        kind,
        id,
        userId,
      );

      sendJson(
        response,
        {
          artifact: {
            ...publicArtifact(result.sourceArtifact),
            manifest: result.sourceArtifact.manifest,
          },
          resolution: result.resolution,
          relatedIssues: result.scan.issues.filter(
            (issue) =>
              issue.manifestPath === result.sourceArtifact.manifestPath,
          ),
          revision: result.revision,
        },
        {
          etag,
          revisionId: result.revision.id,
        },
      );
    }),
  );

  router.get(
    "/artifacts/:kind/:id/export-status",
    asyncRoute(async (request, response) => {
      const requestData = parseBuildRequest(request, context);
      const detail = await context.services.artifacts.get(
        requestData.kind,
        requestData.id,
        requestData.options.appearance,
        requestData.options.userId,
      );

      if (!detail.resolution.summary.valid) {
        const etag = createRevisionEtag(
          detail.revision.id,
          "artifact-export-status-v2",
          requestData.kind,
          requestData.id,
          requestData.options.appearance,
          requestData.options.userId,
          "invalid",
        );

        sendJson(
          response,
          {
            artifact: publicArtifact(detail.sourceArtifact),
            requestedAppearance: requestData.options.appearance,
            export: {
              ready: false,
              fileName: exportFileName(detail.sourceArtifact),
              sizeBytes: null,
              sha256: null,
              validation: {
                valid: false,
                issues: detail.resolution.issues,
              },
              resources: {},
              warnings: [],
            },
            resolution: detail.resolution.summary,
            revision: detail.revision,
          },
          {
            etag,
            revisionId: detail.revision.id,
          },
        );
        return;
      }

      const result = await context.services.artifacts.preview(
        requestData.kind,
        requestData.id,
        requestData.options,
      );
      const etag = createRevisionEtag(
        result.revision.id,
        "artifact-export-status-v2",
        requestData.kind,
        requestData.id,
        requestData.options.appearance,
        requestData.options.userId,
        result.built.sha256,
      );

      sendJson(
        response,
        {
          artifact: publicArtifact(result.sourceArtifact),
          requestedAppearance: requestData.options.appearance,
          export: {
            ready: true,
            fileName: exportFileName(result.sourceArtifact),
            sizeBytes: result.built.sizeBytes,
            sha256: result.built.sha256,
            validation: result.built.validation,
            resources: result.built.resources,
            warnings: result.built.warnings,
          },
          resolution: result.resolution.summary,
          revision: result.revision,
        },
        {
          etag,
          revisionId: result.revision.id,
        },
      );
    }),
  );

  router.get(
    "/artifacts/:kind/:id/preview",
    asyncRoute(async (request, response) => {
      const data = parseBuildRequest(request, context);
      const result = await context.services.artifacts.preview(
        data.kind,
        data.id,
        data.options,
      );

      sendStandalone(request, response, result, "inline");
    }),
  );

  router.get(
    "/artifacts/:kind/:id/download",
    asyncRoute(async (request, response) => {
      const data = parseBuildRequest(request, context);
      const result = await context.services.artifacts.preview(
        data.kind,
        data.id,
        data.options,
      );

      sendStandalone(request, response, result, "attachment");
    }),
  );

  return router;
}

function parseBuildRequest(request, context) {
  const kind = requireIdentifier(request.params.kind, "kind");
  const id = requireIdentifier(request.params.id, "id");
  const minify = booleanQuery(request.query.minify, "minify", false);
  const maxBytes = integerQuery(request.query.maxBytes, "maxBytes", {
    minimum: 1024,
    maximum: 200 * 1024 * 1024,
    defaultValue: DEFAULT_MAX_BYTES,
  });
  let appearance;

  try {
    appearance = parseAppearanceQuery(request.query.appearance);
  } catch (error) {
    throw new HttpError(
      400,
      error.code ?? "APPEARANCE_QUERY_INVALID",
      error.message,
      { details: error.details },
    );
  }

  return {
    kind,
    id,
    options: {
      minify,
      maxBytes,
      appearance,
      userId: requestUserId(request, context),
    },
  };
}

function requestUserId(request, context) {
  const value = stringQuery(
    request.query.userId,
    "userId",
    {
      defaultValue:
        context.config.userId,
    },
  );

  return requireIdentifier(value, "userId");
}

function validateAppearanceBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(
      400,
      "APPEARANCE_BODY_INVALID",
      "The request body must be an object.",
    );
  }

  const allowed = new Set(["appearance", "expectedRevision"]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));

  if (unknown.length > 0) {
    throw new HttpError(
      400,
      "APPEARANCE_BODY_UNKNOWN_PROPERTIES",
      `Unknown appearance-save properties: ${unknown.join(", ")}.`,
    );
  }

  if (
    typeof value.expectedRevision !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.expectedRevision)
  ) {
    throw new HttpError(
      400,
      "APPEARANCE_REVISION_INVALID",
      "expectedRevision must be a 64-character lowercase revision.",
    );
  }

  let appearance;

  try {
    appearance = normaliseAppearanceInput(value.appearance);
  } catch (error) {
    throw new HttpError(
      400,
      error.code ?? "APPEARANCE_INPUT_INVALID",
      error.message,
      { details: error.details },
    );
  }

  return {
    appearance,
    expectedRevision: value.expectedRevision,
  };
}

function requireSameOriginMutation(request) {
  const origin = request.get("origin");
  if (!origin) return;

  let parsed;

  try {
    parsed = new URL(origin);
  } catch {
    throw new HttpError(
      403,
      "MUTATION_ORIGIN_INVALID",
      "The request Origin header is invalid.",
    );
  }

  if (parsed.host !== request.get("host")) {
    throw new HttpError(
      403,
      "MUTATION_ORIGIN_FORBIDDEN",
      "Artefact changes are accepted only from the same-origin navigator.",
    );
  }
}

function sendStandalone(request, response, result, disposition) {
  if (!result.resolution.summary.valid) {
    throw new HttpError(
      422,
      "APPEARANCE_INVALID",
      `Artefact ${result.sourceArtifact.kind}:${result.sourceArtifact.id} has unresolved appearance errors.`,
      { details: { issues: result.resolution.issues } },
    );
  }

  const etag = `"sha256-${result.built.sha256}"`;
  const fileName = safeFilename(exportFileName(result.sourceArtifact));

  response.setHeader("ETag", etag);
  response.setHeader("X-MyDash-Revision", result.revision.id);
  response.setHeader(
    "Cache-Control",
    "private, no-cache, must-revalidate",
  );

  if (etagMatches(request.get("if-none-match"), etag)) {
    response.status(304).end();
    return;
  }

  response.status(200);
  response.type("html");
  response.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${fileName}"`,
  );
  response.setHeader("X-MyDash-SHA256", result.built.sha256);
  response.setHeader(
    "X-MyDash-Artifact",
    `${result.sourceArtifact.kind}:${result.sourceArtifact.id}`,
  );
  response.send(result.built.html);
}

function publicArtifact(entry) {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    userId: entry.userId,
    description: entry.manifest.description ?? null,
    tags: entry.manifest.tags ?? [],
    exportFileName: exportFileName(entry),
    displayPath: entry.displayPath,
    manifestPath: entry.manifestPath,
  };
}

function exportFileName(entry) {
  return entry.manifest.export?.fileName ?? `${entry.id}.html`;
}

function safeFilename(value) {
  const name = String(value)
    .replaceAll("\\", "-")
    .replaceAll("/", "-")
    .replace(/[^a-z0-9._-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 180);

  return name.toLowerCase().endsWith(".html")
    ? name
    : `${name || "artifact"}.html`;
}
