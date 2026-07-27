import {
  Router,
} from "express";
import {
  HttpError,
  asyncRoute,
  sendJson,
} from "../http.mjs";

const DEFAULT_MAX_BYTES =
  50 * 1024 * 1024;

export function createValidationRouter(context) {
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
      const options =
        validateBody(body);
      const result =
        await context.services.validation.validate(
          options,
        );

      sendJson(
        response,
        result.report,
        {
          cacheControl: "no-store",
          revisionId:
            result.revision.id,
        },
      );
    }),
  );

  return router;
}

function validateBody(body) {
  const allowed = new Set([
    "artifactId",
    "artifactKind",
    "validateExports",
    "validateRecipes",
    "minify",
    "maxBytes",
    "failOnWarning",
  ]);
  const unknown =
    Object.keys(body).filter(
      (key) => !allowed.has(key),
    );

  if (unknown.length > 0) {
    throw new HttpError(
      400,
      "UNKNOWN_VALIDATION_OPTIONS",
      `Unknown validation options: ${unknown.join(", ")}.`,
    );
  }

  return {
    artifactId: optionalIdentifier(
      body.artifactId,
      "artifactId",
    ),
    artifactKind: optionalIdentifier(
      body.artifactKind,
      "artifactKind",
    ),
    validateExports: optionalBoolean(
      body.validateExports,
      "validateExports",
      true,
    ),
    validateRecipes: optionalBoolean(
      body.validateRecipes,
      "validateRecipes",
      true,
    ),
    minify: optionalBoolean(
      body.minify,
      "minify",
      false,
    ),
    maxBytes: optionalInteger(
      body.maxBytes,
      "maxBytes",
      DEFAULT_MAX_BYTES,
    ),
    failOnWarning: optionalBoolean(
      body.failOnWarning,
      "failOnWarning",
      false,
    ),
  };
}

function optionalIdentifier(value, name) {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(
      value,
    )
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
  value,
  name,
  defaultValue,
) {
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
  value,
  name,
  defaultValue,
) {
  if (value === undefined) {
    return defaultValue;
  }

  if (
    !Number.isInteger(value) ||
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
