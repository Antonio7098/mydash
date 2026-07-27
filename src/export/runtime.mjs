import { escapeScriptText } from "./javascript.mjs";

export function createStandaloneRuntime(options) {
  const payload = Buffer.from(
    JSON.stringify({
      files: options.files,
      assetSlots: options.assetSlots,
      exportMetadata: options.exportMetadata,
      resources: options.resources,
    }),
    "utf8",
  ).toString("base64");

  return escapeScriptText(`(() => {
  "use strict";

  const decodeText = (base64) => {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return new TextDecoder().decode(bytes);
  };

  const payload = JSON.parse(decodeText("${payload}"));
  const files = new Map(Object.entries(payload.files));

  const normalise = (value) => {
    const raw =
      value instanceof Request
        ? value.url
        : value instanceof URL
          ? value.href
          : String(value);
    const clean = decodeURIComponent(raw.split(/[?#]/, 1)[0])
      .replaceAll("\\\\", "/");

    try {
      const url = new URL(clean, document.baseURI);
      return url.pathname.replace(/^\\/+/, "");
    } catch {
      return clean.replace(/^\\.\\//, "").replace(/^\\/+/, "");
    }
  };

  const findEntry = (input) => {
    const path = normalise(input);
    const direct = files.get(path);
    if (direct) return direct;

    for (const [key, entry] of files) {
      const comparable = key
        .replace(/^\\.\\.\\//, "")
        .replace(/^\\.\\//, "")
        .replace(/^\\/+/, "");

      if (
        path === comparable ||
        path.endsWith("/" + comparable)
      ) {
        return entry;
      }
    }

    return null;
  };

  const bytesFor = (entry) =>
    Uint8Array.from(atob(entry.base64), (character) =>
      character.charCodeAt(0),
    );

  window.fetch = async (input, init = {}) => {
    const method = String(init.method ?? "GET").toUpperCase();
    const entry = findEntry(input);

    if (!entry) {
      throw new Error(
        "Standalone export blocked an unavailable or external fetch: " +
          String(input),
      );
    }

    if (method !== "GET" && method !== "HEAD") {
      throw new Error(
        "Standalone embedded resources only support GET and HEAD.",
      );
    }

    return new Response(
      method === "HEAD" ? null : bytesFor(entry),
      {
        status: 200,
        headers: {
          "Content-Type": entry.mediaType,
          "Content-Length": String(entry.sizeBytes),
          "X-MyDash-Embedded": "true",
        },
      },
    );
  };

  const getEmbedded = (path) => {
    const entry = findEntry(path);
    if (!entry) return null;

    return {
      mediaType: entry.mediaType,
      sizeBytes: entry.sizeBytes,
      bytes: () => bytesFor(entry),
      text: () => decodeText(entry.base64),
      json: () => JSON.parse(decodeText(entry.base64)),
      dataUri: () =>
        "data:" +
        entry.mediaType +
        ";base64," +
        entry.base64,
    };
  };

  window.MyDash = Object.freeze({
    export: Object.freeze(payload.exportMetadata),
    resources: Object.freeze(payload.resources),
    assetSlots: Object.freeze(payload.assetSlots),
    embedded: Object.freeze({
      get: getEmbedded,
      has: (path) => Boolean(findEntry(path)),
      keys: () => [...files.keys()],
    }),
  });

  document.documentElement.dataset.mydashStandalone = "true";
})();`);
}
