import {
  Router,
} from "express";
import {
  asyncRoute,
  sendJson,
} from "../http.mjs";

export function createGitRouter(context) {
  const router = Router();

  router.get(
    "/git/status",
    asyncRoute(async (request, response) => {
      const status =
        await context.services.git.status();

      sendJson(response, status, {
        cacheControl: "no-store",
      });
    }),
  );

  return router;
}
