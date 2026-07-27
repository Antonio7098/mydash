import {
  CliError,
} from "../../cli/errors.mjs";
import {
  GitSafetyError,
} from "../../src/git/errors.mjs";
import {
  HttpError,
  sendError,
} from "../http.mjs";

export function notFoundHandler(
  request,
  response,
  next,
) {
  next(
    new HttpError(
      404,
      "ROUTE_NOT_FOUND",
      `No route matches ${request.method} ${request.originalUrl}.`,
    ),
  );
}

export function errorHandler(options = {}) {
  const logger = options.logger ?? (() => {});

  return function handleError(
    error,
    request,
    response,
    next,
  ) {
    if (response.headersSent) {
      next(error);
      return;
    }

    const mapped = mapError(error);

    if (mapped.status >= 500) {
      logger({
        timestamp: new Date().toISOString(),
        level: "error",
        event: "http.error",
        requestId:
          response.locals.requestId ?? null,
        method: request.method,
        path: request.originalUrl,
        code: mapped.code,
        message: error?.message ?? String(error),
        stack:
          error instanceof Error
            ? error.stack
            : null,
      });
    }

    sendError(response, mapped);
  };
}

function mapError(error) {
  if (error instanceof HttpError) {
    return error;
  }

  if (
    error?.type === "entity.parse.failed"
  ) {
    return new HttpError(
      400,
      "INVALID_JSON_BODY",
      "The request body is not valid JSON.",
    );
  }

  if (
    error?.type === "entity.too.large"
  ) {
    return new HttpError(
      413,
      "REQUEST_BODY_TOO_LARGE",
      "The JSON request body exceeds 64 KiB.",
    );
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
    error?.code ===
      "WORKSPACE_CHANGED_DURING_READ"
  ) {
    return new HttpError(
      409,
      error.code,
      error.message,
    );
  }

  if (
    error?.code ===
      "STANDALONE_EXPORT_INVALID" ||
    error?.code ===
      "ARTIFACT_ENTRY_INVALID" ||
    error?.code ===
      "ARTIFACT_ENTRY_NOT_HTML"
  ) {
    return new HttpError(
      422,
      error.code,
      error.message,
      {
        details:
          error.validation ?? null,
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
