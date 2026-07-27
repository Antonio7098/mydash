import { Router } from "express";
import { asyncRoute, sendJson } from "../http.mjs";

export function createReadinessRouter(context) {
  const router = Router();

  router.get(
    "/readiness",
    asyncRoute(async (request, response) => {
      const result = await context.services.readiness();
      sendJson(response, result.report, {
        cacheControl: "no-store",
        revisionId: result.revision.id,
      });
    }),
  );

  return router;
}
