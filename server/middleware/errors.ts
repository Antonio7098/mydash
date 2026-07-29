import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
  ErrorRequestHandler,
} from "express";
import { CliError } from "../../cli/errors.js";
import { GitSafetyError } from "../../src/git/errors.js";
import { HttpError, sendError } from "../http.js";
import type { ServerLogger } from "../types.js";

export const notFoundHandler: RequestHandler = function notFoundHandlerMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  next(
    new HttpError(
      404,
      "ROUTE_NOT_FOUND",
      `No route matches ${request.method} ${request.originalUrl}.`,
    ),
  );
};

export interface ErrorHandlerOptions {
  logger?: ServerLogger;
}

export function errorHandler(
  options: ErrorHandlerOptions = {},
): ErrorRequestHandler {
  const logger = options.logger ?? (() => {});

  return function handleError(
    error: unknown,
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    if (response.headersSent) {
      next(error);
      return;
    }

    const mapped = mapError(error);

    if (mapped.status >= 500) {
      const message =
        error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : null;
      logger({
        timestamp: new Date().toISOString(),
        level: "error",
        event: "http.error",
        requestId: response.locals.requestId ?? null,
        method: request.method,
        path: request.originalUrl,
        code: mapped.code,
        message,
        stack,
      });
    }

    sendError(response, mapped);
  };
}

function mapError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (hasStringProperty(error, "type")) {
    const type = (error as { type: unknown }).type;
    if (type === "entity.parse.failed") {
      return new HttpError(
        400,
        "INVALID_JSON_BODY",
        "The request body is not valid JSON.",
      );
    }

    if (type === "entity.too.large") {
      return new HttpError(
        413,
        "REQUEST_BODY_TOO_LARGE",
        "The JSON request body exceeds 64 KiB.",
      );
    }
  }

  if (error instanceof CliError) {
    const status =
      /NOT_FOUND/.test(error.code)
        ? 404
        : error.exitCode === 3
          ? 422
          : 400;

    return new HttpError(
      status,
      error.code,
      error.message,
      {
        details: error.details,
      },
    );
  }

  if (error instanceof GitSafetyError) {
    return new HttpError(
      error.exitCode === 3 ? 422 : 409,
      error.code,
      error.message,
      {
        details: error.details,
      },
    );
  }

  if (
    hasStringProperty(error, "code") &&
    (error as { code: unknown }).code ===
      "WORKSPACE_CHANGED_DURING_READ"
  ) {
    return new HttpError(
      409,
      "WORKSPACE_CHANGED_DURING_READ",
      messageFromError(error),
    );
  }

  if (
    hasStringProperty(error, "code") &&
    ((error as { code: unknown }).code ===
      "STANDALONE_EXPORT_INVALID" ||
      (error as { code: unknown }).code ===
        "ARTIFACT_ENTRY_INVALID" ||
      (error as { code: unknown }).code ===
        "ARTIFACT_ENTRY_NOT_HTML")
  ) {
    const code = (error as { code: string }).code;
    const validation = (error as { validation?: unknown }).validation ?? null;
    return new HttpError(
      422,
      code,
      messageFromError(error),
      {
        details: { validation },
      },
    );
  }

  return new HttpError(
    500,
    "INTERNAL_SERVER_ERROR",
    "The server could not complete the request.",
    {
      expose: false,
    },
  );
}

function hasStringProperty(
  value: unknown,
  property: string,
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const candidate = (value as Record<string, unknown>)[property];
  return typeof candidate === "string";
}

function messageFromError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string") return value;
    return String(value);
  }
  return String(error);
}