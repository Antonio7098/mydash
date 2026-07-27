import {
  etagMatches,
} from "./etag.mjs";

export class HttpError extends Error {
  constructor(status, code, message, options = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = options.details ?? null;
    this.expose = options.expose ?? status < 500;
  }
}

export function asyncRoute(handler) {
  return function wrappedRoute(request, response, next) {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function sendJson(response, data, options = {}) {
  const durationMs = elapsedMilliseconds(
    response.locals.requestStartedAt,
  );

  if (options.cacheControl) {
    response.setHeader(
      "Cache-Control",
      options.cacheControl,
    );
  }

  if (options.revisionId) {
    response.setHeader(
      "X-MyDash-Revision",
      options.revisionId,
    );
  }

  if (options.etag) {
    response.setHeader(
      "ETag",
      options.etag,
    );

    if (
      isConditionalMethod(response.req.method) &&
      etagMatches(
        response.req.get("if-none-match"),
        options.etag,
      )
    ) {
      response.status(304).end();
      return false;
    }
  }

  response.status(options.status ?? 200).json({
    ok: true,
    data,
    meta: {
      requestId: response.locals.requestId,
      durationMs,
      ...(options.revisionId
        ? {
            revisionId:
              options.revisionId,
          }
        : {}),
    },
  });

  return true;
}

export function sendError(response, error) {
  const durationMs = elapsedMilliseconds(
    response.locals.requestStartedAt,
  );

  response.status(error.status).json({
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
    meta: {
      requestId: response.locals.requestId,
      durationMs,
    },
  });
}

export function stringQuery(value, name, options = {}) {
  if (value === undefined) return options.defaultValue;

  if (Array.isArray(value) || typeof value !== "string") {
    throw new HttpError(
      400,
      "INVALID_QUERY_PARAMETER",
      `Query parameter ${name} must be a single string.`,
    );
  }

  const result = value.trim();

  if (!result && options.allowEmpty !== true) {
    throw new HttpError(
      400,
      "INVALID_QUERY_PARAMETER",
      `Query parameter ${name} cannot be empty.`,
    );
  }

  return result;
}

export function booleanQuery(value, name, defaultValue = false) {
  if (value === undefined) return defaultValue;
  const text = stringQuery(value, name).toLowerCase();

  if (["true", "1", "yes"].includes(text)) return true;
  if (["false", "0", "no"].includes(text)) return false;

  throw new HttpError(
    400,
    "INVALID_QUERY_PARAMETER",
    `Query parameter ${name} must be true or false.`,
  );
}

export function integerQuery(
  value,
  name,
  options = {},
) {
  if (value === undefined) return options.defaultValue;

  const text = stringQuery(value, name);
  if (!/^\d+$/.test(text)) {
    throw new HttpError(
      400,
      "INVALID_QUERY_PARAMETER",
      `Query parameter ${name} must be an integer.`,
    );
  }

  const parsed = Number.parseInt(text, 10);
  const minimum = options.minimum ?? 0;
  const maximum =
    options.maximum ?? Number.MAX_SAFE_INTEGER;

  if (parsed < minimum || parsed > maximum) {
    throw new HttpError(
      400,
      "INVALID_QUERY_PARAMETER",
      `Query parameter ${name} must be between ${minimum} and ${maximum}.`,
    );
  }

  return parsed;
}

export function requireIdentifier(value, name) {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(value)
  ) {
    throw new HttpError(
      400,
      "INVALID_PATH_PARAMETER",
      `Path parameter ${name} must be a kebab-case identifier.`,
    );
  }

  return value;
}

function isConditionalMethod(method) {
  return method === "GET" || method === "HEAD";
}

function elapsedMilliseconds(startedAt) {
  if (typeof startedAt !== "bigint") return 0;
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}
