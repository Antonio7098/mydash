import type { Request, Response, NextFunction, RequestHandler } from "express";
import { etagMatches } from "./etag.js";
import type { HttpErrorShape, RequestContextLocals } from "./types.js";

type Locals = Response["locals"] & RequestContextLocals;

export class HttpError extends Error implements HttpErrorShape {
  public readonly status: number;
  public readonly code: string;
  public readonly details: unknown;
  public readonly hint: string | null;
  public readonly expose: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    options: { details?: unknown; hint?: string | null; expose?: boolean } = {},
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = options.details ?? null;
    this.hint = options.hint ?? null;
    this.expose = options.expose ?? status < 500;
  }
}

type AsyncRouteHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<unknown> | unknown;

export function asyncRoute(handler: AsyncRouteHandler): RequestHandler {
  return function wrappedRoute(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export interface SendJsonOptions {
  status?: number;
  cacheControl?: string;
  revisionId?: string;
  etag?: string;
}

export function sendJson<T>(
  response: Response,
  data: T,
  options: SendJsonOptions = {},
): boolean {
  const locals = response.locals as Locals;
  const durationMs = elapsedMilliseconds(
    locals?.requestStartedAt,
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
      isConditionalMethod(requestMethod(response)) &&
      etagMatches(
        ifNoneMatchHeader(response),
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
      requestId: locals?.requestId ?? null,
      durationMs,
      ...(options.revisionId
        ? {
            revisionId: options.revisionId,
          }
        : {}),
    },
  });

  return true;
}

export function sendError(
  response: Response,
  error: HttpError,
): void {
  const locals = response.locals as Locals;
  const durationMs = elapsedMilliseconds(
    locals?.requestStartedAt,
  );

  response.status(error.status).json({
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
    meta: {
      requestId: locals?.requestId ?? null,
      durationMs,
    },
  });
}

export interface StringQueryOptions {
  defaultValue?: string;
  allowEmpty?: boolean;
}

export function stringQuery(
  value: unknown,
  name: string,
  options: StringQueryOptions = {},
): string | undefined {
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

export function booleanQuery(
  value: unknown,
  name: string,
  defaultValue = false,
): boolean {
  if (value === undefined) return defaultValue;
  const text = stringQuery(value, name);
  if (text === undefined) return defaultValue;

  const normalised = text.toLowerCase();

  if (["true", "1", "yes"].includes(normalised)) return true;
  if (["false", "0", "no"].includes(normalised)) return false;

  throw new HttpError(
    400,
    "INVALID_QUERY_PARAMETER",
    `Query parameter ${name} must be true or false.`,
  );
}

export interface IntegerQueryOptions {
  defaultValue?: number;
  minimum?: number;
  maximum?: number;
}

export function integerQuery(
  value: unknown,
  name: string,
  options: IntegerQueryOptions = {},
): number | undefined {
  if (value === undefined) return options.defaultValue;

  const text = stringQuery(value, name);
  if (text === undefined) return options.defaultValue;

  if (!/^\d+$/.test(text)) {
    throw new HttpError(
      400,
      "INVALID_QUERY_PARAMETER",
      `Query parameter ${name} must be an integer.`,
    );
  }

  const parsed = Number.parseInt(text, 10);
  const minimum = options.minimum ?? 0;
  const maximum = options.maximum ?? Number.MAX_SAFE_INTEGER;

  if (parsed < minimum || parsed > maximum) {
    throw new HttpError(
      400,
      "INVALID_QUERY_PARAMETER",
      `Query parameter ${name} must be between ${minimum} and ${maximum}.`,
    );
  }

  return parsed;
}

export function requireIdentifier(value: unknown, name: string): string {
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

function isConditionalMethod(method: string | undefined): boolean {
  return method === "GET" || method === "HEAD";
}

function requestMethod(response: Response): string | undefined {
  const req = response.req as Request;
  return req?.method;
}

function ifNoneMatchHeader(response: Response): string | undefined {
  const req = response.req as Request;
  return req?.get("if-none-match");
}

function elapsedMilliseconds(startedAt: bigint | undefined): number {
  if (typeof startedAt !== "bigint") return 0;
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}