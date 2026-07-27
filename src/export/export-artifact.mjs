import {
  createHash,
} from "node:crypto";
import {
  readFile,
} from "node:fs/promises";
import {
  extname,
  resolve,
} from "node:path";
import {
  buildStandaloneArtifactDocument,
} from "./rewrite-html.mjs";
import {
  validateStandaloneHtml,
} from "./validate-html.mjs";
import {
  writeFileAtomic,
} from "../files/output.mjs";
import {
  resolveExportSourcePath,
  workspaceDisplayPath,
} from "./paths.mjs";

export async function buildStandaloneArtifact(options) {
  const entryPath = await resolveArtifactEntry(options);
  const source = await readFile(entryPath, "utf8");
  const rewritten = await buildStandaloneArtifactDocument({
    ...options,
    entryPath,
    source,
  });
  const validation = validateStandaloneHtml(rewritten.html, {
    maxBytes: options.maxBytes,
  });

  if (!validation.valid) {
    const error = new Error(
      `Standalone export validation failed: ${validation.issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join("; ")}`,
    );
    error.code = "STANDALONE_EXPORT_INVALID";
    error.validation = validation;
    throw error;
  }

  const sha256 = createHash("sha256")
    .update(rewritten.html)
    .digest("hex");

  return {
    artifact: {
      id: options.artifact.id,
      kind: options.artifact.kind,
      title: options.artifact.title,
      source: options.artifact.displayPath,
      entry: workspaceDisplayPath(
        entryPath,
        options.workspaceRoot,
      ),
    },
    html: rewritten.html,
    sizeBytes: validation.sizeBytes,
    sha256,
    validation,
    resources: rewritten.resources,
    warnings: rewritten.warnings,
    sourceEntryPath: entryPath,
  };
}

export async function exportStandaloneArtifact(options) {
  const built = await buildStandaloneArtifact(options);
  if (resolve(options.outputPath) === built.sourceEntryPath) {
    const error = new Error(
      "Export output cannot overwrite the artefact source entry.",
    );
    error.code = "OUTPUT_OVERWRITES_SOURCE";
    throw error;
  }

  const outputPath = await writeFileAtomic(
    options.outputPath,
    built.html,
    {
      workspaceRoot: options.workspaceRoot,
      overwrite: options.overwrite ?? false,
      encoding: "utf8",
    },
  );

  return {
    artifact: built.artifact,
    output: {
      path: outputPath,
      displayPath: workspaceDisplayPath(
        outputPath,
        options.workspaceRoot,
      ),
    },
    sizeBytes: built.sizeBytes,
    sha256: built.sha256,
    validation: built.validation,
    resources: built.resources,
    warnings: built.warnings,
  };
}

async function resolveArtifactEntry(options) {
  const entry = options.artifact.manifest.entry;

  if (
    typeof entry !== "string" ||
    extname(entry).toLowerCase() !== ".html"
  ) {
    const error = new Error(
      `Artefact entry must be an HTML file: ${entry ?? "(missing)"}`,
    );
    error.code = "ARTIFACT_ENTRY_NOT_HTML";
    throw error;
  }

  const resolved = await resolveExportSourcePath(
    options.artifact.manifestPath,
    entry,
    options.workspaceRoot,
  );

  if (resolved.kind !== "file") {
    const error = new Error(
      `Artefact entry is not a local file: ${entry}`,
    );
    error.code = "ARTIFACT_ENTRY_INVALID";
    throw error;
  }

  return resolved.path;
}
