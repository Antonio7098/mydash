import { Router, type Response } from "express";
import { asyncRoute, sendJson } from "../http.js";
import type { RouteContext, WorkspaceRevision } from "../types.js";

export function createStateRouter(context: RouteContext): Router {
  const router = Router();

  router.get(
    "/state",
    asyncRoute(async (_request, response) => {
      const state = await context.services.state();

      sendJson(response, state, {
        cacheControl: "no-store",
      });
    }),
  );

  router.get(
    "/events",
    asyncRoute(async (request, response) => {
      response.status(200);
      response.setHeader("Content-Type", "text/event-stream");
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Connection", "keep-alive");
      response.setHeader("X-Accel-Buffering", "no");
      response.flushHeaders();

      const current = await context.services.revision.current();
      writeEvent(response, "workspace-revision", current);

      const unsubscribe = context.services.revision.onChange(
        (event) => {
          writeEvent(response, "workspace-revision", event.current);
        },
      );
      const heartbeat = setInterval(() => {
        response.write(`: heartbeat ${Date.now()}\n\n`);
      }, 25_000);
      heartbeat.unref();

      const close = (): void => {
        clearInterval(heartbeat);
        unsubscribe();
      };

      request.once("close", close);
      response.once("close", close);
    }),
  );

  return router;
}

function writeEvent(
  response: Response,
  event: string,
  data: WorkspaceRevision,
): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}