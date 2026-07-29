import { Router } from "express";
import { asyncRoute, sendJson } from "../http.js";
import type { RouteContext } from "../types.js";

export function createReadinessRouter(context: RouteContext): Router {
  const router = Router();

  router.get(
    "/readiness",
    asyncRoute(async (_request, response) => {
      const result = await context.services.readiness();
      sendJson(response, result.report, {
        cacheControl: "no-store",
        revisionId: result.revision.id,
      });
    }),
  );

  return router;
}