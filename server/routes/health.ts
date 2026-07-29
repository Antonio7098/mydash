import { Router } from "express";
import { asyncRoute, sendJson } from "../http.js";
import type { RouteContext } from "../types.js";

export function createHealthRouter(context: RouteContext): Router {
  const router = Router();

  router.get(
    "/health",
    asyncRoute(async (_request, response) => {
      const state = await context.services.state();

      sendJson(
        response,
        {
          status: "ok",
          service: "my-dashboards",
          version: context.packageMetadata.version,
          workspace: {
            id: context.config.id ?? null,
            name: context.config.name,
          },
          startedAt: context.startedAt.toISOString(),
          currentTime: context.now().toISOString(),
          uptimeSeconds: Math.max(
            0,
            Math.floor(
              (context.now().getTime() - context.startedAt.getTime()) / 1000,
            ),
          ),
          revision: {
            id: state.revision.id,
            sequence: state.revision.sequence,
            detectedAt: state.revision.detectedAt,
          },
        },
        {
          cacheControl: "no-store",
          revisionId: state.revision.id,
        },
      );
    }),
  );

  return router;
}