export const NAVIGATOR_ROUTES = Object.freeze([
  {
    id: "home",
    path: "/",
    title: "Home",
    category: null,
  },
  {
    id: "dashboards",
    path: "/dashboards",
    title: "Dashboards",
    category: "dashboard",
  },
  {
    id: "presentations",
    path: "/presentations",
    title: "Presentations",
    category: "presentation",
  },
  {
    id: "concepts",
    path: "/concepts",
    title: "Concepts",
    category: "concept",
  },
  {
    id: "components",
    path: "/components",
    title: "Library",
    category: "library",
  },
  {
    id: "settings",
    path: "/settings",
    title: "Settings",
    category: "settings",
  },
]);

const ROUTE_BY_PATH = new Map(
  NAVIGATOR_ROUTES.map(
    (route) => [route.path, route],
  ),
);
const VIEWER_PATTERN =
  /^\/view\/([a-z0-9][a-z0-9-]{0,127})\/([a-z0-9][a-z0-9-]{0,127})$/;
const LIBRARY_ENTRY_PATTERN =
  /^\/components\/([a-z0-9][a-z0-9-]{0,127})\/([a-z0-9][a-z0-9-]{0,127})$/;

export function normaliseNavigatorPath(
  value,
) {
  const pathname = String(
    value ?? "/",
  )
    .split(/[?#]/, 1)[0]
    .replace(/\/{2,}/g, "/");

  if (pathname === "/") return "/";

  return pathname
    .replace(/\/+$/, "") ||
    "/";
}

export function routeForPath(
  value,
) {
  const path =
    normaliseNavigatorPath(
      value,
    );
  const staticRoute =
    ROUTE_BY_PATH.get(path);

  if (staticRoute) {
    return staticRoute;
  }

  const libraryEntry = path.match(LIBRARY_ENTRY_PATTERN);

  if (libraryEntry) {
    return {
      id: "library-entry",
      path,
      title: "Library resource",
      category: "library",
      params: {
        kind: libraryEntry[1],
        id: libraryEntry[2],
      },
    };
  }

  const viewer = path.match(VIEWER_PATTERN);

  if (viewer) {
    return {
      id: "viewer",
      path,
      title: "Viewer",
      category: viewer[1],
      params: {
        kind: viewer[1],
        id: viewer[2],
      },
    };
  }

  return ROUTE_BY_PATH.get("/");
}

export function routeForId(id) {
  return (
    NAVIGATOR_ROUTES.find(
      (route) => route.id === id,
    ) ??
    NAVIGATOR_ROUTES[0]
  );
}

export function isNavigatorPath(value) {
  const path =
    normaliseNavigatorPath(
      value,
    );

  return (
    ROUTE_BY_PATH.has(path) ||
    VIEWER_PATTERN.test(path) ||
    LIBRARY_ENTRY_PATTERN.test(path)
  );
}

export function navigate(
  path,
  options = {},
) {
  const requested = new URL(
    path,
    window.location.origin,
  );
  const next =
    normaliseNavigatorPath(
      requested.pathname,
    );

  if (!isNavigatorPath(next)) {
    throw new TypeError(
      `Unsupported navigator route: ${path}`,
    );
  }

  const method =
    options.replace
      ? "replaceState"
      : "pushState";

  window.history[method](
    {},
    "",
    `${next}${
      requested.search ||
      window.location.search
    }`,
  );
  window.dispatchEvent(
    new PopStateEvent("popstate"),
  );
}
