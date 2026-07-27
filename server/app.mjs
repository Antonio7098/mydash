import express from "express";
import {
  dirname,
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";
import {
  loadWorkspaceConfig,
} from "../src/workspace/load-config.mjs";
import {
  loadPackageMetadata,
} from "../src/workspace/package-metadata.mjs";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/errors.mjs";
import {
  requestContext,
} from "./middleware/request-context.mjs";
import {
  securityHeaders,
} from "./middleware/security.mjs";
import {
  createApiRouter,
} from "./routes/index.mjs";
import {
  createNavigatorRouter,
} from "./routes/navigator.mjs";
import {
  createNavigatorServices,
} from "./services/navigator-services.mjs";

const DEFAULT_NAVIGATOR_ROOT = resolve(
  dirname(
    fileURLToPath(import.meta.url),
  ),
  "../ui",
);

export async function createApplication(
  options,
) {
  const workspaceRoot =
    options.workspaceRoot;
  const now =
    options.now ?? (() => new Date());
  const logger =
    options.logger ?? defaultLogger;
  const config =
    options.config ??
    (await loadWorkspaceConfig(
      workspaceRoot,
    ));
  const packageMetadata =
    options.packageMetadata ??
    (await loadPackageMetadata(
      workspaceRoot,
    ));
  const startedAt =
    options.startedAt ?? now();
  const services =
    options.services ??
    createNavigatorServices({
      workspaceRoot,
      now,
      logger,
      pollIntervalMs:
        options.revisionPollIntervalMs,
      minimumCheckIntervalMs:
        options.minimumRevisionCheckIntervalMs,
    });

  await services.start();

  const context = {
    workspaceRoot,
    navigatorRoot:
      options.navigatorRoot ??
      DEFAULT_NAVIGATOR_ROOT,
    config,
    packageMetadata,
    now,
    startedAt,
    logger,
    services,
  };
  const app = express();

  app.disable("x-powered-by");
  app.set("query parser", "simple");
  app.use(
    requestContext({
      now,
      logger,
    }),
  );
  app.use(securityHeaders);
  app.use(
    "/api",
    express.json({
      limit: "64kb",
      strict: true,
      type: "application/json",
    }),
  );
  app.use(
    "/api",
    createApiRouter(context),
  );
  app.use(
    createNavigatorRouter(context),
  );
  app.use(notFoundHandler);
  app.use(
    errorHandler({ logger }),
  );

  let closed = false;

  return {
    app,
    context,
    async close() {
      if (closed) return;
      closed = true;
      await services.close();
    },
  };
}

function defaultLogger(record) {
  process.stdout.write(
    `${JSON.stringify(record)}\n`,
  );
}
