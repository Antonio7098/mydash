import {
  createHash,
} from "node:crypto";

export function createEtag(value) {
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
  revisionId,
  ...parts
) {
  return createEtag(
    [
      revisionId,
      ...parts.map(stablePart),
    ].join("\0"),
  );
}

export function etagMatches(
  requestHeader,
  currentEtag,
) {
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

export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function stablePart(value) {
  if (typeof value === "string") {
    return value;
  }

  return stableStringify(value);
}

function stripWeak(value) {
  return value.startsWith("W/")
    ? value.slice(2)
    : value;
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          sortValue(value[key]),
        ]),
    );
  }

  return value;
}
