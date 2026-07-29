import { createHash } from "node:crypto";

export function createEtag(value: string | Buffer): string {
  const hash = createHash("sha256")
    .update(
      Buffer.isBuffer(value)
        ? value
        : String(value),
    )
    .digest("hex");

  return `"sha256-${hash}"`;
}

export function createRevisionEtag(
  revisionId: string,
  ...parts: unknown[]
): string {
  return createEtag(
    [
      revisionId,
      ...parts.map(stablePart),
    ].join("\0"),
  );
}

export function etagMatches(
  requestHeader: string | undefined,
  currentEtag: string | undefined,
): boolean {
  if (!requestHeader || !currentEtag) {
    return false;
  }

  if (requestHeader.trim() === "*") {
    return true;
  }

  const expected = stripWeak(currentEtag);

  return requestHeader
    .split(",")
    .map((value) => stripWeak(value.trim()))
    .some((value) => value === expected);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function stablePart(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return stableStringify(value);
}

function stripWeak(value: string): string {
  return value.startsWith("W/")
    ? value.slice(2)
    : value;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    const entries: [string, unknown][] = [];
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      entries.push([key, sortValue((value as Record<string, unknown>)[key])]);
    }
    return Object.fromEntries(entries);
  }

  return value;
}