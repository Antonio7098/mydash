import express, { type Express } from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkspaceConfig } from "../src/workspace/load-config.js";
import { loadPackageMetadata } from "../src/workspace/package-metadata.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { requestContext } from "./middleware/request-context.js";
import { securityHeaders } from "./middleware/security.js";
import { createApiRouter } from "./routes/index.js";
import { createNavigatorRouter } from "./routes/navigator.js";
import { createNavigatorServices } from "./services/navigator-services.js";
import type {
  Application,
  ApplicationOptions,
  RouteContext,
  ServiceBundle,
} from "./types.js";

const DEFAULT_NAVIGATOR_ROOT = resolve(
  dirname(
    fileURLToPath(import.meta.url),
  ),
  "../../ui",
);

export async function createApplication(
  options: ApplicationOptions,
): Promise<Application> {
  const workspaceRoot = options.workspaceRoot;
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? defaultLogger;
  const config =
    options.config ??
    (await loadWorkspaceConfig(workspaceRoot));
  const packageMetadata =
    options.packageMetadata ??
    (await loadPackageMetadata(workspaceRoot));
  const startedAt = options.startedAt ?? now();
  const services: ServiceBundle =
    options.services ??
    createNavigatorServices({
      workspaceRoot,
      now,
      logger,
      pollIntervalMs: options.revisionPollIntervalMs,
      minimumCheckIntervalMs: options.minimumRevisionCheckIntervalMs,
    });

  await services.start();

  const context: RouteContext = {
    workspaceRoot,
    navigatorRoot: options.navigatorRoot ?? DEFAULT_NAVIGATOR_ROOT,
    config: config as RouteContext["config"],
    packageMetadata,
    now,
    startedAt,
    logger,
    services,
  };
  const app: Express = express();

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
  app.use("/api", createApiRouter(context));
  app.use(createNavigatorRouter(context));
  app.use(notFoundHandler);
  app.use(errorHandler({ logger }));

  let closed = false;

  return {
    app,
    context,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await services.close();
    },
  };
}

function defaultLogger(record: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}