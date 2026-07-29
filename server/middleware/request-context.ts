import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ServerLogger } from "../types.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export interface RequestContextOptions {
  now?: () => Date;
  logger?: ServerLogger;
}

export function requestContext(
  options: RequestContextOptions = {},
): RequestHandler {
  const now = options.now ?? (() => new Date());
  const logger = options.logger ?? (() => {});

  return function requestContextMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    const candidate = request.get("x-request-id");
    const requestId =
      candidate && REQUEST_ID_PATTERN.test(candidate)
        ? candidate
        : randomUUID();
    const startedAt = process.hrtime.bigint();

    (response.locals as Record<string, unknown>).requestId = requestId;
    (response.locals as Record<string, unknown>).requestStartedAt = startedAt;
    response.setHeader("X-Request-Id", requestId);

    response.on("finish", () => {
      logger({
        timestamp: now().toISOString(),
        level:
          response.statusCode >= 500
            ? "error"
            : "info",
        event: "http.request",
        requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs:
          Number(process.hrtime.bigint() - startedAt) / 1_000_000,
      });
    });

    next();
  };
}