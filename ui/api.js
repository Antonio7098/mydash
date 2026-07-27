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
  const artifactsPath = withUserId(
    "/api/artifacts",
    options.userId,
  );

  const [
    health,
    users,
    artefacts,
    library,
    state,
    git,
    readiness,
  ] = await Promise.all([
    getJson("/api/health", { signal }),
    getJson("/api/users", { signal }),
    getJson(artifactsPath, { signal }),
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
    users,
    selectedUserId:
      artefacts.userId ??
      users.currentUserId,
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
  const scopedBase = withUserId(base, options.userId);
  const [
    detail,
    exportStatus,
  ] = await Promise.all([
    getJson(scopedBase, {
      signal: options.signal,
    }),
    getJson(
      withUserId(`${base}/export-status`, options.userId),
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
    withUserId(`/api/artifacts/${encodeURIComponent(kind)}/${encodeURIComponent(
      id,
    )}/appearance-options`, options.userId),
    { signal: options.signal },
  );
}

export async function saveArtifactAppearance(
  kind,
  id,
  payload,
  options = {},
) {
  return sendJson(
    withUserId(`/api/artifacts/${encodeURIComponent(kind)}/${encodeURIComponent(
      id,
    )}/appearance`, options.userId),
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

function withUserId(path, userId) {
  if (!userId) return path;
  return `${path}${
    path.includes("?") ? "&" : "?"
  }userId=${encodeURIComponent(userId)}`;
}
