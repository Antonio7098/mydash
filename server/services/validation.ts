import { validateWorkspace } from "../../src/validation/workspace-validation.js";
import { stableStringify } from "../etag.js";
import { RevisionCache } from "./revision-cache.js";
import type {
  RevisionService,
  ValidationService,
  ValidationServiceOptions,
  ValidationServiceResult,
  WorkspaceRevision,
} from "../types.js";

export interface ValidationCacheOptions {
  workspaceRoot: string;
  revision: RevisionService;
  cache: RevisionCache<unknown>;
  now: () => Date;
}

export function createValidationService(
  options: ValidationCacheOptions,
): ValidationService {
  const { workspaceRoot, revision, cache, now } = options;

  async function validate(
    validationOptions: ValidationServiceOptions,
  ): Promise<ValidationServiceResult> {
    const key = stableStringify(validationOptions);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before: WorkspaceRevision = await revision.current();
      const report = await cache.get(
        key,
        before.id,
        () =>
          validateWorkspace({
            workspaceRoot,
            ...validationOptions,
            now,
          } as never),
      );
      const after: WorkspaceRevision = await revision.current({
        force: true,
        reason: "validation-consistency-check",
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
    ) as Error & { code: string };
    error.code = "WORKSPACE_CHANGED_DURING_READ";
    throw error;
  }

  return {
    validate,
  };
}