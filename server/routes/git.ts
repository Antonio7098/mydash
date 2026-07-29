import { Router } from "express";
import { asyncRoute, sendJson } from "../http.js";
import type { RouteContext } from "../types.js";

export function createGitRouter(context: RouteContext): Router {
  const router = Router();

  router.get(
    "/git/status",
    asyncRoute(async (_request, response) => {
      const status = await context.services.git.status();

      sendJson(response, status, {
        cacheControl: "no-store",
      });
    }),
  );

  return router;
}