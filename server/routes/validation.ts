import { Router } from "express";
import {
  HttpError,
  asyncRoute,
  sendJson,
} from "../http.js";
import type { RouteContext } from "../types.js";

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

interface ValidationOptions {
  artifactId: string | null;
  artifactKind: string | null;
  validateExports: boolean;
  validateRecipes: boolean;
  minify: boolean;
  maxBytes: number;
  failOnWarning: boolean;
}

export function createValidationRouter(context: RouteContext): Router {
  const router = Router();

  router.post(
    "/validation",
    asyncRoute(async (request, response) => {
      const body =
        request.body &&
        typeof request.body === "object" &&
        !Array.isArray(request.body)
          ? request.body
          : {};
      const options = validateBody(body);
      const result = await context.services.validation.validate(options);

      sendJson(
        response,
        result.report,
        {
          cacheControl: "no-store",
          revisionId: result.revision.id,
        },
      );
    }),
  );

  return router;
}

function validateBody(body: unknown): ValidationOptions {
  const record = body as Record<string, unknown>;
  const allowed = new Set([
    "artifactId",
    "artifactKind",
    "validateExports",
    "validateRecipes",
    "minify",
    "maxBytes",
    "failOnWarning",
  ]);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));

  if (unknown.length > 0) {
    throw new HttpError(
      400,
      "UNKNOWN_VALIDATION_OPTIONS",
      `Unknown validation options: ${unknown.join(", ")}.`,
    );
  }

  return {
    artifactId: optionalIdentifier(record.artifactId, "artifactId"),
    artifactKind: optionalIdentifier(record.artifactKind, "artifactKind"),
    validateExports: optionalBoolean(record.validateExports, "validateExports", true),
    validateRecipes: optionalBoolean(record.validateRecipes, "validateRecipes", true),
    minify: optionalBoolean(record.minify, "minify", false),
    maxBytes: optionalInteger(record.maxBytes, "maxBytes", DEFAULT_MAX_BYTES),
    failOnWarning: optionalBoolean(record.failOnWarning, "failOnWarning", false),
  };
}

function optionalIdentifier(value: unknown, name: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(value)
  ) {
    throw new HttpError(
      400,
      "INVALID_VALIDATION_OPTION",
      `${name} must be a kebab-case identifier.`,
    );
  }

  return value;
}

function optionalBoolean(
  value: unknown,
  name: string,
  defaultValue: boolean,
): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "boolean") {
    throw new HttpError(
      400,
      "INVALID_VALIDATION_OPTION",
      `${name} must be a boolean.`,
    );
  }

  return value;
}

function optionalInteger(
  value: unknown,
  name: string,
  defaultValue: number,
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (
    value === null ||
    !Number.isInteger(value) ||
    typeof value !== "number" ||
    value < 1024 ||
    value > 200 * 1024 * 1024
  ) {
    throw new HttpError(
      400,
      "INVALID_VALIDATION_OPTION",
      `${name} must be an integer between 1024 and ${200 * 1024 * 1024}.`,
    );
  }

  return value;
}