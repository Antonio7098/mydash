import {
  clearApiCache,
  loadNavigatorSnapshot,
} from "./api.js";
import {
  activateArtifactPreviews,
  createArtifactGallery,
} from "./gallery.js";
import {
  artifactDownloadPath,
  categoryPathForKind,
  sortArtifacts,
} from "./gallery-model.js";
import {
  activateArtifactViewer,
  createArtifactViewer,
} from "./viewer.js";
import {
  activateLibraryBrowser,
  activateLibraryEntryView,
  createLibraryBrowser,
  createLibraryEntryShell,
} from "./library-browser.js";
import {
  navigate,
  routeForPath,
} from "./router.js";
import {
  createReadinessPanel,
} from "./onboarding.js";

const elements = {
  nav:
    document.querySelector(
      "#navigator-nav",
    ),
  navToggle:
    document.querySelector(
      "#nav-toggle",
    ),
  viewerDownload:
    document.querySelector(
      "#viewer-download",
    ),
  contextBack:
    document.querySelector(
      "#context-back",
    ),
  categoryTabs:
    document.querySelector(
      "#category-tabs",
    ),
  themeToggle:
    document.querySelector(
      "#theme-toggle",
    ),
  connection:
    document.querySelector(
      "#connection-status",
    ),
  connectionLabel:
    document.querySelector(
      "#connection-status-label",
    ),
  main:
    document.querySelector(
      "#page-content",
    ),
  footerRevision:
    document.querySelector(
      "#footer-revision",
    ),
};

const state = {
  snapshot: null,
  route: routeForPath(
    window.location.pathname,
  ),
  eventSource: null,
  loadingController: null,
  revisionId: null,
  deactivatePreviews: null,
  deactivateViewer: null,
  deactivateLibrary: null,
};

initialise().catch(
  renderFatalError,
);

async function initialise() {
  removeLegacyUserScopeFromUrl();
  bindNavigation();
  syncThemeControl();
  restoreNavigationState();
  updateRouteChrome();
  await refreshSnapshot({
    focus: false,
  });
  connectRevisionEvents();
}

function removeLegacyUserScopeFromUrl() {
  const url =
    new URL(window.location.href);
  const hadUser =
    url.searchParams.has("user") ||
    url.searchParams.has("userId");

  if (!hadUser) return;

  url.searchParams.delete("user");
  url.searchParams.delete("userId");
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function bindNavigation() {
  elements.themeToggle?.addEventListener(
    "click",
    toggleTheme,
  );

  elements.navToggle.addEventListener(
    "click",
    () => {
      setNavOpen(true, {
        persist: false,
      });
    },
  );

  elements.navToggle.addEventListener(
    "pointerenter",
    () => {
      setNavOpen(true, {
        persist: false,
      });
    },
  );

  elements.nav.addEventListener(
    "pointerleave",
    () => {
      setNavOpen(false, {
        persist: false,
      });
    },
  );

  document.addEventListener(
    "click",
    (event) => {
      const link =
        event.target.closest(
          "[data-navigator-link]",
        );

      if (link) {
        event.preventDefault();
        navigate(
          link.getAttribute("href"),
        );
        setNavOpen(false);
        return;
      }

      if (
        elements.nav.dataset.open ===
          "true" &&
        !elements.nav.contains(
          event.target,
        )
      ) {
        setNavOpen(false);
      }
    },
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape" &&
        elements.nav.dataset.open ===
          "true"
      ) {
        setNavOpen(false);
        elements.navToggle.focus();
      }
    },
  );

  window.addEventListener(
    "popstate",
    () => {
      state.route = routeForPath(
        window.location.pathname,
      );
      updateRouteChrome();
      renderCurrentRoute({
        focus: true,
      });
    },
  );
}

function toggleTheme() {
  const current =
    document.documentElement.dataset
      .theme === "dark"
      ? "dark"
      : "light";
  const next =
    current === "dark"
      ? "light"
      : "dark";
  document.documentElement.dataset.theme =
    next;
  try {
    window.localStorage.setItem(
      "mydash-theme",
      next,
    );
  } catch {
    // The theme still applies for this session.
  }
  syncThemeControl();
}

function syncThemeControl() {
  if (!elements.themeToggle) return;
  const dark =
    document.documentElement.dataset
      .theme === "dark";
  const label = dark
    ? "Switch to light theme"
    : "Switch to dark theme";
  elements.themeToggle.setAttribute(
    "aria-label",
    label,
  );
  elements.themeToggle.title = label;
  elements.themeToggle.dataset.theme =
    dark ? "dark" : "light";
}

function restoreNavigationState() {
  setNavOpen(false, {
    persist: false,
  });
}

function setNavOpen(
  open,
  options = {},
) {
  elements.nav.dataset.open =
    String(open);
  elements.navToggle.setAttribute(
    "aria-expanded",
    String(open),
  );

  if (options.persist !== false) {
    window.localStorage.setItem(
      "mydash.navigator.nav-open",
      String(open),
    );
  }
}

async function refreshSnapshot(
  options = {},
) {
  state.loadingController?.abort();
  state.loadingController =
    new AbortController();

  setConnection(
    "loading",
    state.snapshot
      ? "Refreshing"
      : "Connecting",
  );

  try {
    const snapshot =
      await loadNavigatorSnapshot({
        signal:
          state.loadingController.signal,
      });

    state.snapshot = snapshot;
    state.revisionId =
      snapshot.state?.revision?.id ??
      snapshot.health?.revision?.id ??
      null;
    updateRouteChrome();
    setConnection(
      "ready",
      "Workspace live",
    );
    updateRevisionLabel();
    renderCurrentRoute({
      focus:
        options.focus ?? false,
    });
  } catch (error) {
    if (
      error?.name === "AbortError"
    ) {
      return;
    }

    setConnection(
      state.snapshot
        ? "stale"
        : "error",
      state.snapshot
        ? "Showing cached state"
        : "Connection failed",
    );

    if (!state.snapshot) {
      renderFatalError(error);
    }
  }
}

function connectRevisionEvents() {
  state.eventSource?.close();

  const source =
    new EventSource("/api/events");
  state.eventSource = source;

  source.addEventListener(
    "workspace-revision",
    (event) => {
      let revision;

      try {
        revision =
          JSON.parse(event.data);
      } catch {
        return;
      }

      if (
        revision.id &&
        revision.id !==
          state.revisionId
      ) {
        state.revisionId =
          revision.id;
        clearApiCache();
        refreshSnapshot({
          focus: false,
        });
      }
    },
  );

  source.addEventListener(
    "open",
    () => {
      if (state.snapshot) {
        setConnection(
          "ready",
          "Workspace live",
        );
      }
    },
  );

  source.addEventListener(
    "error",
    () => {
      if (state.snapshot) {
        setConnection(
          "stale",
          "Reconnecting",
        );
      }
    },
  );
}

function updateRouteChrome() {
  document.body.dataset.route =
    state.route.id;
  const selectorPath =
    state.route.id === "home"
      ? "/dashboards"
      : state.route.id === "viewer"
      ? categoryPathForKind(state.route.params.kind)
      : state.route.id === "library-entry"
        ? "/components"
        : state.route.path;
  const categoryPaths = [
    "/dashboards",
    "/presentations",
    "/concepts",
    "/components",
  ];
  const selectedCategory =
    categoryPaths.indexOf(
      selectorPath,
    );
  elements.categoryTabs.dataset.selected =
    String(selectedCategory);

  const viewerArtifact =
    state.route.id === "viewer"
      ? currentViewerArtifact()
      : null;
  if (viewerArtifact) {
    elements.viewerDownload.href =
      artifactDownloadPath(
        viewerArtifact,
      );
    elements.viewerDownload.setAttribute(
      "download",
      viewerArtifact.exportFileName ??
        `${viewerArtifact.id}.html`,
    );
  } else {
    elements.viewerDownload.removeAttribute(
      "href",
    );
  }

  if (state.route.id === "viewer") {
    elements.contextBack.href =
      categoryPathForKind(
        state.route.params.kind,
      );
    elements.contextBack.setAttribute(
      "aria-label",
      `Back to ${state.route.params.kind} gallery`,
    );
  } else if (
    state.route.id ===
    "library-entry"
  ) {
    elements.contextBack.href =
      "/components";
    elements.contextBack.setAttribute(
      "aria-label",
      "Back to library",
    );
  } else {
    elements.contextBack.removeAttribute(
      "href",
    );
  }

  document.title =
    state.route.id === "home"
      ? "My Dashboards"
      : state.route.id === "viewer"
        ? "Viewer · My Dashboards"
        : `${state.route.title} · My Dashboards`;

  for (
    const link of document.querySelectorAll(
      "[data-navigator-link]",
    )
  ) {
    const linkRoute =
      link.dataset.route;
    const current =
      link.hasAttribute(
        "data-category-tab",
      )
        ? link.getAttribute("href") ===
          selectorPath
        : state.route.id === "viewer"
        ? routeMatchesKind(linkRoute, state.route.params.kind)
        : state.route.id === "library-entry"
          ? linkRoute === "components"
          : linkRoute === state.route.id;

    if (current) {
      link.setAttribute(
        "aria-current",
        "page",
      );
    } else {
      link.removeAttribute(
        "aria-current",
      );
    }
  }
}

function renderCurrentRoute(
  options = {},
) {
  if (!state.snapshot) return;

  state.deactivatePreviews?.();
  state.deactivatePreviews = null;
  state.deactivateViewer?.();
  state.deactivateViewer = null;
  state.deactivateLibrary?.();
  state.deactivateLibrary = null;

  const view = {
    home: renderHome,
    dashboards: () =>
      renderCategory({
        kind: "dashboard",
        singular: "dashboard",
        plural: "dashboards",
        title: "Dashboards",
        description:
          "Operational views, decision support and live portfolio summaries.",
      }),
    presentations: () =>
      renderCategory({
        kind: "presentation",
        singular: "presentation",
        plural: "presentations",
        title: "Presentations",
        description:
          "Narrative artefacts designed to explain evidence, implications and action.",
      }),
    concepts: () =>
      renderCategory({
        kind: "concept",
        singular: "concept",
        plural: "concepts",
        title: "Concepts",
        description:
          "Lightweight prototypes for exploring an idea before it becomes shared architecture.",
      }),
    components:
      renderComponents,
    "library-entry":
      renderLibraryEntry,
    viewer:
      renderViewer,
  }[state.route.id];

  elements.main.replaceChildren(
    view(),
  );

  state.deactivatePreviews =
    activateArtifactPreviews(
      elements.main,
    );

  if (state.route.id === "components") {
    state.deactivateLibrary = activateLibraryBrowser(
      elements.main,
      state.snapshot.library.filter(isLibraryResource),
    );
  }

  if (state.route.id === "library-entry") {
    state.deactivateLibrary = activateLibraryEntryView(
      elements.main,
      state.route.params,
    );
  }

  if (
    state.route.id ===
    "viewer"
  ) {
    const artifact =
      currentViewerArtifact();

    if (artifact) {
      state.deactivateViewer =
        activateArtifactViewer(
          elements.main,
          {
            artifact,
            revisionId:
              state.revisionId,
            onAppearanceSaved() {
              clearApiCache();
              refreshSnapshot({
                focus: false,
              });
            },
          },
        );
    }
  }

  if (options.focus) {
    elements.main.focus({
      preventScroll: true,
    });
  }
}

function renderHome() {
  return renderCategory({
    kind: "dashboard",
    singular: "dashboard",
    plural: "dashboards",
    title: "Dashboards",
  });
}

function renderCategory(config) {
  const matching =
    sortArtifacts(
      state.snapshot.artefacts.filter(
        (item) =>
          item.kind === config.kind,
      ),
    );
  const fragment =
    document.createDocumentFragment();

  fragment.append(
    createArtifactGallery(
      matching,
      {
        name: config.plural,
        label:
          `${config.title} gallery`,
        previewOnly: true,
      },
    ),
  );

  return fragment;
}

function renderViewer() {
  const artifact =
    currentViewerArtifact();

  if (!artifact) {
    const missing = element(
      "section",
      "navigator-error",
    );
    missing.append(
      element(
        "p",
        "navigator-eyebrow",
        "Artefact not found",
      ),
      element(
        "h1",
        "",
        "This artefact is no longer available.",
      ),
      element(
        "p",
        "",
        "It may have been renamed, removed or changed while the navigator was open.",
      ),
    );
    const back = element(
      "a",
      "secondary-action",
      "Return to library",
    );
    back.href =
      categoryPathForKind(
        state.route.params.kind,
      );
    back.dataset.navigatorLink =
      "";
    missing.append(back);
    return missing;
  }

  document.title =
    `${artifact.title} · My Dashboards`;

  return createArtifactViewer(
    artifact,
    {
      revisionId:
        state.revisionId,
    },
  );
}

function currentViewerArtifact() {
  if (
    state.route.id !== "viewer"
  ) {
    return null;
  }

  return (
    state.snapshot.artefacts.find(
      (item) =>
        item.kind ===
          state.route.params.kind &&
        item.id ===
          state.route.params.id,
    ) ?? null
  );
}

function renderComponents() {
  return createLibraryBrowser(
    state.snapshot.library,
    state.snapshot.libraryIssues,
  );
}

function renderLibraryEntry() {
  return createLibraryEntryShell(
    state.route.params,
  );
}

function renderSettings() {
  const fragment =
    document.createDocumentFragment();
  const git = state.snapshot.git ?? {};
  const revision =
    state.snapshot.state?.revision ??
    {};
  const caches =
    state.snapshot.state?.caches ??
    {};

  fragment.append(
    pageHeading({
      eyebrow: "Workspace",
      title:
        "Settings and runtime state.",
      summary:
        "Inspect release readiness, Git availability, caches and the constrained appearance-default mutation boundary.",
      asideValue:
        git.available === false
          ? "Local"
          : git.clean === true
            ? "Clean"
            : "Live",
      asideLabel:
        git.available === false
          ? "Git not initialised"
          : git.branch
            ? `Branch ${git.branch}`
            : "Repository status",
    }),
  );

  fragment.append(
    createReadinessPanel(
      state.snapshot.readiness,
    ),
  );

  const grid = element(
    "section",
    "settings-grid",
  );
  grid.append(
    definitionPanel(
      "Workspace",
      [
        [
          "Name",
          state.snapshot.health
            ?.workspace?.name ??
            "My Dashboards",
        ],
        [
          "Revision",
          revision.id ??
            "Unavailable",
        ],
        [
          "Sequence",
          String(
            revision.sequence ?? "—",
          ),
        ],
        [
          "Detected",
          formatTimestamp(
            revision.detectedAt,
          ),
        ],
      ],
      "settings-card",
    ),
    definitionPanel(
      "Git",
      [
        [
          "Branch",
          git.branch ??
            "Unavailable",
        ],
        [
          "Clean",
          git.clean === true
            ? "Yes"
            : git.clean === false
              ? "No"
              : "Unknown",
        ],
        [
          "Upstream",
          git.upstream ??
            "Not configured",
        ],
        [
          "Changes",
          String(
            git.changes?.length ??
            git.changeCount ??
            0,
          ),
        ],
      ],
      "settings-card",
    ),
    definitionPanel(
      "Server caches",
      Object.entries(caches).map(
        ([name, value]) => [
          titleCase(name),
          `${value.size ?? 0} / ${value.maxEntries ?? "—"} entries`,
        ],
      ),
      "settings-card",
    ),
    definitionPanel(
      "Runtime",
      [
        [
          "Service",
          state.snapshot.health
            ?.service ??
            "my-dashboards",
        ],
        [
          "Version",
          state.snapshot.health
            ?.version ??
            "Unknown",
        ],
        [
          "Uptime",
          formatDuration(
            state.snapshot.health
              ?.uptimeSeconds,
          ),
        ],
        [
          "HTTP mode",
          "Read-mostly; appearance defaults only",
        ],
      ],
      "settings-card",
    ),
  );

  fragment.append(grid);
  return fragment;
}

function pageHeading(config) {
  const section = element(
    "header",
    "page-heading",
  );
  const copy = element("div");
  copy.append(
    element(
      "p",
      "navigator-eyebrow",
      config.eyebrow,
    ),
    element(
      "h1",
      "",
      config.title,
    ),
    element(
      "p",
      "page-heading__summary",
      config.summary,
    ),
  );

  const aside = element(
    "div",
    "page-heading__aside",
  );
  aside.append(
    element(
      "strong",
      "",
      config.asideValue,
    ),
    element(
      "span",
      "",
      config.asideLabel,
    ),
  );

  section.append(copy, aside);
  return section;
}

function overviewCard(item) {
  const card = element(
    "a",
    "overview-card",
  );
  card.href = item.route;
  card.dataset.navigatorLink = "";

  const label = element("div");
  label.append(
    element(
      "span",
      "overview-card__label",
      item.label,
    ),
    element(
      "strong",
      "overview-card__count",
      String(item.count),
    ),
  );

  card.append(
    label,
    element(
      "span",
      "overview-card__action",
      "Open section →",
    ),
  );

  return card;
}

function workspaceStatusPanel() {
  const panel = element(
    "article",
    "status-panel",
  );
  const top = element(
    "div",
    "status-panel__topline",
  );
  top.append(
    element(
      "h3",
      "",
      "Repository",
    ),
    element(
      "span",
      "status-badge",
      "Live",
    ),
  );

  const list =
    definitionList([
      [
        "Workspace",
        state.snapshot.health
          ?.workspace?.name ??
          "My Dashboards",
      ],
      [
        "Branch",
        state.snapshot.git?.branch ??
          "Unknown",
      ],
      [
        "Revision",
        shortRevision(),
      ],
    ]);

  panel.append(top, list);
  return panel;
}

function cacheStatusPanel() {
  const caches =
    state.snapshot.state?.caches ??
    {};
  const values =
    Object.values(caches);
  const hits = values.reduce(
    (sum, value) =>
      sum +
      (value.metrics?.hits ?? 0),
    0,
  );
  const loads = values.reduce(
    (sum, value) =>
      sum +
      (value.metrics?.loads ?? 0),
    0,
  );

  return definitionPanel(
    "Shared services",
    [
      [
        "Cache hits",
        String(hits),
      ],
      [
        "Loads",
        String(loads),
      ],
      [
        "Library issues",
        String(
          state.snapshot
            .libraryIssues.length,
        ),
      ],
    ],
  );
}

function definitionPanel(
  title,
  rows,
  className = "status-panel",
) {
  const panel = element(
    "article",
    className,
  );
  panel.append(
    element(
      "h2",
      "",
      title,
    ),
    definitionList(rows),
  );
  return panel;
}

function definitionList(rows) {
  const list = element(
    "dl",
    "status-list",
  );

  for (const [term, value] of rows) {
    const item = element("div");
    item.append(
      element(
        "dt",
        "",
        term,
      ),
      element(
        "dd",
        "",
        value,
      ),
    );
    list.append(item);
  }

  return list;
}

function sectionHeading(
  title,
  supporting,
) {
  const heading = element(
    "header",
    "section-heading",
  );
  heading.append(
    element(
      "h2",
      "",
      title,
    ),
    element(
      "p",
      "",
      supporting,
    ),
  );
  return heading;
}

function artifactCounts() {
  return countBy(
    state.snapshot.artefacts,
    (item) => item.kind,
  );
}

function countBy(items, selector) {
  const result = {};

  for (const item of items) {
    const key = selector(item);
    result[key] =
      (result[key] ?? 0) + 1;
  }

  return result;
}

function isLibraryResource(item) {
  return [
    "primitive",
    "component",
    "layout",
    "theme",
    "preset",
    "asset",
  ].includes(item.kind);
}

function isUiResource(item) {
  return [
    "primitive",
    "component",
    "layout",
  ].includes(item.kind);
}

function routeMatchesKind(
  routeId,
  kind,
) {
  return (
    (routeId === "dashboards" &&
      kind === "dashboard") ||
    (routeId ===
      "presentations" &&
      kind ===
        "presentation") ||
    (routeId === "concepts" &&
      kind === "concept")
  );
}

function setConnection(
  mode,
  label,
) {
  elements.connection.dataset.state =
    mode;
  elements.connectionLabel.textContent =
    label;
}

function updateRevisionLabel() {
  elements.footerRevision.textContent =
    state.revisionId
      ? `Revision ${shortRevision()}`
      : "Revision unavailable";
}

function shortRevision() {
  return (
    state.revisionId?.slice(0, 8) ??
    "unknown"
  );
}

function formatTimestamp(value) {
  if (!value) return "Unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}

function formatDuration(value) {
  if (
    !Number.isFinite(value)
  ) {
    return "Unknown";
  }

  if (value < 60) {
    return `${Math.floor(value)} sec`;
  }

  if (value < 3600) {
    return `${Math.floor(
      value / 60,
    )} min`;
  }

  return `${Math.floor(
    value / 3600,
  )} hr ${Math.floor(
    (value % 3600) / 60,
  )} min`;
}

function pluralise(
  count,
  singular,
  plural,
) {
  return count === 1
    ? singular
    : plural;
}

function titleCase(value) {
  return String(value)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function element(
  tagName,
  className = "",
  text = null,
) {
  const result =
    document.createElement(tagName);

  if (className) {
    result.className = className;
  }

  if (text !== null) {
    result.textContent = text;
  }

  return result;
}

function renderFatalError(error) {
  console.error(error);
  setConnection(
    "error",
    "Connection failed",
  );

  const section = element(
    "section",
    "navigator-error",
  );
  const retry = element(
    "button",
    "primary-action",
    "Retry connection",
  );
  retry.type = "button";
  retry.addEventListener("click", () => {
    refreshSnapshot({ focus: true });
  });
  section.append(
    element("p", "navigator-eyebrow", "Workspace unavailable"),
    element("h1", "", "The navigator could not open"),
    element(
      "p",
      "",
      error instanceof Error ? error.message : String(error),
    ),
    retry,
  );
  elements.main.replaceChildren(section);
}
