import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  relative,
  resolve,
} from "node:path";
import {
  buildStandaloneArtifact,
} from "../../src/export/export-artifact.mjs";
import {
  checkpointWorkspace,
} from "../../src/git/checkpoint.mjs";
import {
  runGit,
} from "../../src/git/run.mjs";
import {
  getRepositoryStatus,
} from "../../src/git/status.mjs";
import {
  findArtifact,
} from "../../src/resolution/find-artifact.mjs";
import {
  resolveArtifactAppearance,
} from "../../src/resolution/resolve.mjs";
import {
  applyAppearanceInput,
  buildAppearanceOptions,
  normaliseAppearanceInput,
  validateAppearanceReferences,
} from "../../src/appearance/controls.mjs";
import {
  HttpError,
} from "../http.mjs";
import {
  stableStringify,
} from "../etag.mjs";

export function createArtifactService(options) {
  const {
    library,
    revision,
    previewCache,
    workspaceRoot,
    now,
  } = options;

  async function list() {
    const snapshot = await library.snapshot();

    return {
      ...snapshot,
      artifacts: snapshot.scan.entries.filter(
        (entry) => entry.category === "artifact",
      ),
    };
  }

  async function get(kind, id, appearance = null) {
    const snapshot = await library.snapshot();
    const sourceArtifact = findArtifact(snapshot.scan, id, kind);
    const artifact = appearance
      ? applyAppearanceInput(sourceArtifact, appearance)
      : sourceArtifact;
    const resolution = resolveArtifactAppearance(snapshot.scan, artifact);

    return {
      ...snapshot,
      sourceArtifact,
      artifact,
      appearance: normaliseAppearanceInput(artifact.manifest.appearance),
      resolution,
    };
  }

  async function appearanceOptions(kind, id) {
    const snapshot = await get(kind, id);

    return {
      ...snapshot,
      controls: buildAppearanceOptions(
        snapshot.scan,
        snapshot.sourceArtifact,
      ),
    };
  }

  async function preview(kind, id, previewOptions = {}) {
    const appearance = previewOptions.appearance
      ? normaliseAppearanceInput(previewOptions.appearance)
      : null;
    const cacheKey = stableStringify({
      kind,
      id,
      appearance,
      minify: previewOptions.minify ?? false,
      maxBytes: previewOptions.maxBytes,
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const snapshot = await get(kind, id, appearance);
      const built = await previewCache.get(
        cacheKey,
        snapshot.revision.id,
        () =>
          buildStandaloneArtifact({
            workspaceRoot,
            scan: snapshot.scan,
            artifact: snapshot.artifact,
            resolution: snapshot.resolution,
            minify: previewOptions.minify ?? false,
            maxBytes: previewOptions.maxBytes,
          }),
      );
      const after = await revision.current({
        force: true,
        reason: "preview-consistency-check",
      });

      if (snapshot.revision.id === after.id) {
        return {
          ...snapshot,
          revision: after,
          built,
          cacheKey,
        };
      }

      previewCache.delete(cacheKey);
    }

    const error = new Error(
      "The workspace changed repeatedly while the preview was being built.",
    );
    error.code = "WORKSPACE_CHANGED_DURING_READ";
    throw error;
  }

  async function saveAppearance(kind, id, request) {
    const before = await get(kind, id);

    if (
      !request.expectedRevision ||
      request.expectedRevision !== before.revision.id
    ) {
      throw new HttpError(
        409,
        "APPEARANCE_REVISION_CONFLICT",
        "The workspace changed after the appearance panel opened. Refresh before saving.",
        {
          details: {
            expectedRevision: request.expectedRevision ?? null,
            currentRevision: before.revision.id,
          },
        },
      );
    }

    const status = await getRepositoryStatus(workspaceRoot);

    if (resolve(status.root) !== resolve(workspaceRoot)) {
      throw new HttpError(
        409,
        "WORKSPACE_GIT_ROOT_MISMATCH",
        "Artefact-default changes require the workspace to be the Git repository root.",
      );
    }

    const manifestPath = before.sourceArtifact.manifestPath;
    const relativeManifest = relative(status.root, manifestPath).replaceAll(
      "\\",
      "/",
    );
    const existing = status.changes.find(
      (change) =>
        change.path === relativeManifest ||
        change.originalPath === relativeManifest,
    );

    if (existing) {
      throw new HttpError(
        409,
        "ARTEFACT_MANIFEST_ALREADY_CHANGED",
        `${relativeManifest} already contains uncommitted changes and was not modified.`,
        { details: { change: existing } },
      );
    }

    const references = validateAppearanceReferences(
      before.scan,
      before.sourceArtifact,
      request.appearance,
    );

    if (!references.valid) {
      throw new HttpError(
        422,
        "APPEARANCE_REFERENCES_INVALID",
        "The proposed appearance contains unavailable or ambiguous resources.",
        { details: { issues: references.issues } },
      );
    }

    const proposed = applyAppearanceInput(
      before.sourceArtifact,
      references.appearance,
    );
    const resolution = resolveArtifactAppearance(before.scan, proposed);

    if (!resolution.summary.valid) {
      throw new HttpError(
        422,
        "APPEARANCE_RESOLUTION_INVALID",
        "The proposed appearance could not be resolved.",
        { details: { issues: resolution.issues } },
      );
    }

    const built = await buildStandaloneArtifact({
      workspaceRoot,
      scan: before.scan,
      artifact: proposed,
      resolution,
      minify: false,
      maxBytes: 50 * 1024 * 1024,
    });
    const original = await readFile(manifestPath, "utf8");
    const next = `${JSON.stringify(proposed.manifest, null, 2)}\n`;
    const headBefore = status.head;

    if (original === next) {
      return {
        artifact: before.sourceArtifact,
        appearance: before.appearance,
        resolution,
        export: {
          ready: true,
          sizeBytes: built.sizeBytes,
          sha256: built.sha256,
          validation: built.validation,
          warnings: built.warnings,
        },
        checkpoint: null,
        revision: before.revision,
      };
    }

    await atomicWrite(manifestPath, next);
    await revision.current({
      force: true,
      reason: "appearance-default-write",
    });

    let checkpoint;

    try {
      checkpoint = await checkpointWorkspace({
        workspaceRoot,
        paths: [relativeManifest],
        message: `Update ${before.sourceArtifact.title} appearance`,
        push: true,
        acknowledgeImpact: false,
        failOnWarning: false,
        now,
      });
    } catch (error) {
      const after = await getRepositoryStatus(workspaceRoot);

      if (after.head === headBefore) {
        runGit(
          ["reset", "--quiet", "HEAD", "--", relativeManifest],
          { cwd: workspaceRoot, allowFailure: true },
        );
        await atomicWrite(manifestPath, original);
        await revision.current({
          force: true,
          reason: "appearance-default-rollback",
        });
      }

      throw error;
    }

    previewCache.clear("appearance-default-saved");
    const after = await get(kind, id);

    return {
      artifact: after.sourceArtifact,
      appearance: after.appearance,
      resolution: after.resolution,
      export: {
        ready: true,
        sizeBytes: built.sizeBytes,
        sha256: built.sha256,
        validation: built.validation,
        warnings: built.warnings,
      },
      checkpoint,
      revision: after.revision,
    };
  }

  return {
    list,
    get,
    appearanceOptions,
    preview,
    saveAppearance,
  };
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;

  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}
