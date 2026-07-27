import { extname } from "node:path";

export function createSafeName(input, options = {}) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error("A non-empty name is required.");
  }

  const trimmed = input.trim();
  const inferredExtension = extname(trimmed);
  const baseInput = inferredExtension
    ? trimmed.slice(0, -inferredExtension.length)
    : trimmed;
  const extension = normaliseExtension(
    options.extension ?? inferredExtension,
  );

  let base = baseInput
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!base) {
    base = "untitled";
  }

  const safeName = `${base}${extension}`;

  return {
    input,
    safeName,
    base,
    extension,
  };
}

function normaliseExtension(value) {
  if (!value) return "";

  const cleaned = String(value)
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/[^a-z0-9]+/g, "");

  return cleaned ? `.${cleaned}` : "";
}
