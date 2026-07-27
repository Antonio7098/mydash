import {
  lstat,
  realpath,
  stat,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";

export async function resolveExportSourcePath(
  baseFile,
  reference,
  workspaceRoot,
  options = {},
) {
  const parsed = splitReference(reference);

  if (
    parsed.path.startsWith("data:") ||
    parsed.path.startsWith("#")
  ) {
    return {
      kind: "embedded",
      reference,
      path: null,
      suffix: parsed.suffix,
    };
  }

  if (isExternalReference(parsed.path)) {
    throw exportPathError(
      "EXTERNAL_RESOURCE_NOT_ALLOWED",
      `External resource is not allowed in a standalone export: ${reference}`,
    );
  }

  if (
    parsed.path.startsWith("blob:") ||
    parsed.path.startsWith("javascript:")
  ) {
    throw exportPathError(
      "UNSAFE_RESOURCE_REFERENCE",
      `Unsupported resource reference: ${reference}`,
    );
  }

  const candidate = resolve(
    dirname(baseFile),
    decodeURIComponent(parsed.path),
  );
  const canonicalWorkspace = await realpath(resolve(workspaceRoot));
  const metadata = await safeLstat(candidate);

  if (!metadata) {
    throw exportPathError(
      "RESOURCE_NOT_FOUND",
      `Referenced resource does not exist: ${reference} from ${baseFile}`,
    );
  }

  if (metadata.isSymbolicLink()) {
    throw exportPathError(
      "SYMLINK_RESOURCE_REFUSED",
      `Symbolic-link resources are refused during export: ${candidate}`,
    );
  }

  const canonicalCandidate = await realpath(candidate);

  if (!isInside(canonicalWorkspace, canonicalCandidate)) {
    throw exportPathError(
      "RESOURCE_OUTSIDE_WORKSPACE",
      `Referenced resource escapes the workspace: ${reference}`,
    );
  }

  if (options.requireFile !== false) {
    const canonicalMetadata = await stat(canonicalCandidate);

    if (!canonicalMetadata.isFile()) {
      throw exportPathError(
        "RESOURCE_NOT_FILE",
        `Referenced resource is not a file: ${reference}`,
      );
    }
  }

  return {
    kind: "file",
    reference,
    path: canonicalCandidate,
    suffix: parsed.suffix,
  };
}

export function isExternalReference(value) {
  return (
    /^https?:/i.test(value) ||
    /^\/\//.test(value) ||
    /^(?:ftp|file|ws|wss):/i.test(value)
  );
}

export function isInlineSafeReference(value) {
  return (
    value.startsWith("data:") ||
    value.startsWith("#") ||
    value === ""
  );
}

export function splitReference(value) {
  const text = String(value).trim();
  const match = text.match(/^([^?#]*)(.*)$/);

  return {
    path: match?.[1] ?? text,
    suffix: match?.[2] ?? "",
  };
}

export function workspaceDisplayPath(path, workspaceRoot) {
  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}

function isInside(root, candidate) {
  const relationship = relative(root, candidate);

  return (
    relationship === "" ||
    (!relationship.startsWith("..") && !isAbsolute(relationship))
  );
}

function exportPathError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function safeLstat(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
