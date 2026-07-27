import {
  Router,
} from "express";
import {
  createRevisionEtag,
} from "../etag.mjs";
import {
  HttpError,
  asyncRoute,
  requireIdentifier,
  sendJson,
  stringQuery,
} from "../http.mjs";
import {
  publicLibraryEntry,
} from "../../src/library/catalogue.mjs";

export function createLibraryRouter(context) {
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
          entries: result.entries.map(publicLibraryEntry),
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

      if (result.matches.length > 1) {
        throw new HttpError(
          409,
          "AMBIGUOUS_LIBRARY_ENTRY",
          `Multiple library entries match ${kind}:${id}.`,
          {
            details: {
              matches: result.matches.map(publicLibraryEntry),
            },
          },
        );
      }

      const entry = result.matches[0];
      const consumers = context.services.library.consumersFor(entry, result.graph);
      const dependencies = context.services.library.dependenciesFor(entry, result.graph);
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
            ...publicLibraryEntry(entry),
            manifest: entry.manifest,
          },
          consumers,
          dependencies,
          summary: {
            consumerCount: consumers.length,
            dependencyCount: dependencies.length,
            resolvedDependencyCount: dependencies.filter((edge) => edge.resolved).length,
          },
          issues: result.scan.issues.filter(
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
