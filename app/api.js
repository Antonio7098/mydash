const responseCache = new Map();

export class NavigatorApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "NavigatorApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "NAVIGATOR_API_ERROR";
    this.details = options.details ?? null;
  }
}

export async function loadNavigatorSnapshot(
  options = {},
) {
  const signal = options.signal;

  const [
    health,
    artefacts,
    library,
    state,
    git,
    readiness,
  ] = await Promise.all([
    getJson("/api/health", { signal }),
    getJson("/api/artifacts", { signal }),
    getJson("/api/library", { signal }),
    getJson("/api/state", {
      signal,
      cache: false,
    }),
    getJson("/api/git/status", {
      signal,
      cache: false,
    }),
    getJson("/api/readiness", {
      signal,
      cache: false,
    }),
  ]);

  return {
    health,
    artefacts:
      artefacts.artifacts ?? [],
    library:
      library.entries ?? [],
    librarySummary:
      library.summary ?? {},
    libraryIssues:
      library.issues ?? [],
    state,
    git,
    readiness,
  };
}

export async function loadLibraryEntry(kind, id, options = {}) {
  return getJson(
    `/api/library/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
    { signal: options.signal },
  );
}

export async function loadArtifactViewerData(
  kind,
  id,
  options = {},
) {
  const base =
    `/api/artifacts/${encodeURIComponent(
      kind,
    )}/${encodeURIComponent(id)}`;
  const [
    detail,
    exportStatus,
  ] = await Promise.all([
    getJson(base, {
      signal: options.signal,
    }),
    getJson(
      `${base}/export-status`,
      {
        signal: options.signal,
      },
    ),
  ]);

  return {
    artifact: detail.artifact,
    resolution: detail.resolution,
    relatedIssues:
      detail.relatedIssues ?? [],
    exportStatus,
  };
}

export async function loadAppearanceOptions(
  kind,
  id,
  options = {},
) {
  return getJson(
    `/api/artifacts/${encodeURIComponent(kind)}/${encodeURIComponent(
      id,
    )}/appearance-options`,
    { signal: options.signal },
  );
}

export async function saveArtifactAppearance(kind, id, payload) {
  return sendJson(
    `/api/artifacts/${encodeURIComponent(kind)}/${encodeURIComponent(
      id,
    )}/appearance`,
    {
      method: "PUT",
      body: payload,
    },
  );
}

export async function sendJson(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(options.body ?? {}),
    signal: options.signal,
    credentials: "same-origin",
  });

  let envelope;

  try {
    envelope = await response.json();
  } catch {
    throw new NavigatorApiError(
      `The server returned an unreadable response for ${path}.`,
      {
        status: response.status,
        code: "NAVIGATOR_RESPONSE_INVALID",
      },
    );
  }

  if (!response.ok || envelope.ok !== true) {
    throw new NavigatorApiError(
      envelope.error?.message ?? `Request failed for ${path}.`,
      {
        status: response.status,
        code: envelope.error?.code ?? "NAVIGATOR_REQUEST_FAILED",
        details: envelope.error?.details ?? null,
      },
    );
  }

  return envelope.data;
}

export async function getJson(
  path,
  options = {},
) {
  const cached =
    responseCache.get(path);
  const headers = new Headers(
    options.headers,
  );

  if (
    options.cache !== false &&
    cached?.etag
  ) {
    headers.set(
      "If-None-Match",
      cached.etag,
    );
  }

  const response = await fetch(
    path,
    {
      method: "GET",
      headers,
      signal: options.signal,
      credentials: "same-origin",
    },
  );

  if (
    response.status === 304 &&
    cached
  ) {
    return cached.data;
  }

  let envelope;

  try {
    envelope =
      await response.json();
  } catch {
    throw new NavigatorApiError(
      `The server returned an unreadable response for ${path}.`,
      {
        status: response.status,
        code:
          "NAVIGATOR_RESPONSE_INVALID",
      },
    );
  }

  if (
    !response.ok ||
    envelope.ok !== true
  ) {
    throw new NavigatorApiError(
      envelope.error?.message ??
        `Request failed for ${path}.`,
      {
        status: response.status,
        code:
          envelope.error?.code ??
          "NAVIGATOR_REQUEST_FAILED",
        details:
          envelope.error?.details ??
          null,
      },
    );
  }

  const data = envelope.data;
  const etag =
    response.headers.get("etag");

  if (
    options.cache !== false &&
    etag
  ) {
    responseCache.set(path, {
      etag,
      data,
    });
  }

  return data;
}

export function clearApiCache() {
  responseCache.clear();
}
