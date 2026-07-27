import {
  Router,
} from "express";
import {
  asyncRoute,
  sendJson,
} from "../http.mjs";

export function createStateRouter(context) {
  const router = Router();

  router.get(
    "/state",
    asyncRoute(async (request, response) => {
      const state =
        await context.services.state();

      sendJson(response, state, {
        cacheControl: "no-store",
      });
    }),
  );

  router.get(
    "/events",
    asyncRoute(async (request, response) => {
      response.status(200);
      response.setHeader(
        "Content-Type",
        "text/event-stream",
      );
      response.setHeader(
        "Cache-Control",
        "no-store",
      );
      response.setHeader(
        "Connection",
        "keep-alive",
      );
      response.setHeader(
        "X-Accel-Buffering",
        "no",
      );
      response.flushHeaders();

      const current =
        await context.services.revision.current();
      writeEvent(
        response,
        "workspace-revision",
        current,
      );

      const unsubscribe =
        context.services.revision.onChange(
          (event) => {
            writeEvent(
              response,
              "workspace-revision",
              event.current,
            );
          },
        );
      const heartbeat = setInterval(() => {
        response.write(
          `: heartbeat ${Date.now()}\n\n`,
        );
      }, 25_000);
      heartbeat.unref();

      const close = () => {
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
  response,
  event,
  data,
) {
  response.write(`event: ${event}\n`);
  response.write(
    `data: ${JSON.stringify(data)}\n\n`,
  );
}
