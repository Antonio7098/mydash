import {
  validateWorkspace,
} from "../../src/validation/workspace-validation.mjs";
import {
  stableStringify,
} from "../etag.mjs";

export function createValidationService(
  options,
) {
  const {
    workspaceRoot,
    revision,
    cache,
    now,
  } = options;

  async function validate(
    validationOptions,
  ) {
    const key = stableStringify(
      validationOptions,
    );

    for (
      let attempt = 0;
      attempt < 2;
      attempt += 1
    ) {
      const before =
        await revision.current();
      const report = await cache.get(
        key,
        before.id,
        () =>
          validateWorkspace({
            workspaceRoot,
            ...validationOptions,
            now,
          }),
      );
      const after =
        await revision.current({
          force: true,
          reason:
            "validation-consistency-check",
        });

      if (before.id === after.id) {
        return {
          revision: after,
          report,
          cacheKey: key,
        };
      }

      cache.delete(key);
    }

    const error = new Error(
      "The workspace changed repeatedly while validation was running.",
    );
    error.code =
      "WORKSPACE_CHANGED_DURING_READ";
    throw error;
  }

  return {
    validate,
  };
}
