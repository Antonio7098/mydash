import { Router } from "express";
import { createRevisionEtag } from "../etag.js";
import {
  HttpError,
  asyncRoute,
  requireIdentifier,
  sendJson,
  stringQuery,
} from "../http.js";
import { publicLibraryEntry } from "../../src/library/catalogue.js";
import type { RouteContext } from "../types.js";

export function createLibraryRouter(context: RouteContext): Router {
  const router = Router();

  router.get(
    "/library",
    asyncRoute(async (request, response) => {
      const filters = {
        kind: stringQuery(request.query.kind, "kind"),
        level: stringQuery(request.query.level, "level"),
        collection: stringQuery(request.query.collection, "collection"),
      };
      const result = await context.services.library.list(filters);
      const etag = createRevisionEtag(
        result.revision.id,
        "library-list-v2",
        filters,
      );

      sendJson(
        response,
        {
          summary: result.scan.summary,
          filters,
          entries: result.entries.map((entry) =>
            publicLibraryEntry(entry as never),
          ),
          issues: result.scan.issues,
        },
        {
          etag,
          revisionId: result.revision.id,
        },
      );
    }),
  );

  router.get(
    "/library/:kind/:id",
    asyncRoute(async (request, response) => {
      const kind = requireIdentifier(request.params.kind, "kind");
      const id = requireIdentifier(request.params.id, "id");
      const result = await context.services.library.inspect(kind, id);

      if (result.matches.length === 0) {
        throw new HttpError(
          404,
          "LIBRARY_ENTRY_NOT_FOUND",
          `No library entry found for ${kind}:${id}.`,
        );
      }

      const entry =
        result.matches.find((candidate) => candidate.level === "local") ??
        result.matches.find((candidate) => candidate.level === "core") ??
        result.matches[0];
      if (!entry) {
        throw new HttpError(
          404,
          "LIBRARY_ENTRY_NOT_FOUND",
          `No library entry found for ${kind}:${id}.`,
        );
      }
      const consumers = context.services.library.consumersFor(
        entry,
        result.graph,
      );
      const dependencies = context.services.library.dependenciesFor(
        entry,
        result.graph,
      );
      const etag = createRevisionEtag(
        result.revision.id,
        "library-entry-v2",
        kind,
        id,
      );

      sendJson(
        response,
        {
          entry: {
            ...publicLibraryEntry(entry as never),
            manifest: entry.manifest,
          },
          consumers,
          dependencies,
          summary: {
            consumerCount: consumers.length,
            dependencyCount: dependencies.length,
            resolvedDependencyCount: dependencies.filter((edge) => edge.resolved).length,
          },
          issues: (result.scan.issues ?? []).filter(
            (issue) =>
              issue.manifestPath === entry.manifestPath ||
              issue.targetManifestPath === entry.manifestPath,
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

  return router;
}