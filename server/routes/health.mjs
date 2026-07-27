import {
  Router,
} from "express";
import {
  asyncRoute,
  sendJson,
} from "../http.mjs";

export function createHealthRouter(context) {
  const router = Router();

  router.get(
    "/health",
    asyncRoute(async (request, response) => {
      const state =
        await context.services.state();

      sendJson(
        response,
        {
          status: "ok",
          service: "my-dashboards",
          version:
            context.packageMetadata.version,
          workspace: {
            id: context.config.id,
            name: context.config.name,
          },
          startedAt:
            context.startedAt.toISOString(),
          currentTime:
            context.now().toISOString(),
          uptimeSeconds:
            Math.max(
              0,
              Math.floor(
                (context.now().getTime() -
                  context.startedAt.getTime()) /
                  1000,
              ),
            ),
          revision: {
            id: state.revision.id,
            sequence:
              state.revision.sequence,
            detectedAt:
              state.revision.detectedAt,
          },
        },
        {
          cacheControl: "no-store",
          revisionId:
            state.revision.id,
        },
      );
    }),
  );

  return router;
}
