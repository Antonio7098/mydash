import {
  loadArtifactViewerData,
} from "./api.js";
import {
  activateAppearanceControls,
  createAppearancePanel,
} from "./appearance.js";
import {
  artifactDownloadPath,
  artifactPreviewPath,
  categoryPathForKind,
  kindLabel,
} from "./gallery-model.js";
import {
  VIEWER_SHORTCUTS,
  dependencyGroups,
  exportReadiness,
  exportResourceRows,
  formatBytes,
  selectedAppearance,
  shortHash,
  viewerShortcutAction,
} from "./viewer-model.js";

const PREVIEW_TIMEOUT_MS =
  20_000;

export function createArtifactViewer(
  artifact,
  options = {},
) {
  const section = element(
    "section",
    "artifact-viewer",
  );
  section.dataset.viewer =
    `${artifact.kind}:${artifact.id}`;

  const toolbar = element(
    "header",
    "artifact-viewer__toolbar",
  );
  const identity = element(
    "div",
    "artifact-viewer__identity",
  );
  const back = element(
    "a",
    "artifact-viewer__back",
    `← ${kindLabel(
      artifact.kind,
    )} library`,
  );
  back.href =
    categoryPathForKind(
      artifact.kind,
    );
  back.dataset.navigatorLink =
    "";

  identity.append(
    back,
    element(
      "p",
      "artifact-viewer__kind",
      kindLabel(
        artifact.kind,
      ),
    ),
    element(
      "h1",
      "artifact-viewer__title",
      artifact.title,
    ),
  );

  const toolbarRight = element(
    "div",
    "artifact-viewer__toolbar-right",
  );
  const readiness = element(
    "span",
    "viewer-export-status",
    "Checking export",
  );
  readiness.dataset.viewerExportStatus =
    "";
  readiness.dataset.state =
    "loading";

  const controls = element(
    "div",
    "artifact-viewer__controls",
  );
  controls.append(
    controlButton(
      "Reload",
      "R",
      "viewerReload",
    ),
    controlButton(
      "Full screen",
      "F",
      "viewerFullscreen",
    ),
    controlButton(
      "Details",
      "I",
      "viewerDetails",
    ),
    controlButton(
      "Appearance",
      "A",
      "viewerAppearance",
    ),
    controlButton(
      "Shortcuts",
      "?",
      "viewerShortcuts",
    ),
  );

  const actions = element(
    "div",
    "artifact-viewer__actions",
  );
  const standalone = element(
    "a",
    "secondary-action",
    "Open standalone",
  );
  standalone.href =
    artifactPreviewPath(
      artifact,
    );
  standalone.dataset
    .viewerStandalone = "";
  standalone.target = "_blank";
  standalone.rel = "noreferrer";

  const download = element(
    "a",
    "primary-action",
    "Download HTML",
  );
  download.href =
    artifactDownloadPath(
      artifact,
    );
  download.dataset
    .viewerDownload = "";
  download.setAttribute(
    "download",
    artifact.exportFileName ??
      `${artifact.id}.html`,
  );

  actions.append(
    standalone,
    download,
  );
  toolbarRight.append(
    readiness,
    controls,
    actions,
  );
  toolbar.append(
    identity,
    toolbarRight,
  );

  const appearance =
    createAppearancePanel();

  const details = element(
    "section",
    "artifact-viewer__details",
  );
  details.id =
    "artifact-viewer-details";
  details.hidden = true;
  details.dataset.viewerDetailsPanel =
    "";
  details.setAttribute(
    "aria-label",
    "Artefact details",
  );
  details.append(
    loadingDetails(),
  );

  const mount = element(
    "div",
    "artifact-viewer__mount",
  );
  mount.dataset.kind =
    artifact.kind;
  mount.dataset.viewerMount =
    "";

  const status = element(
    "div",
    "artifact-viewer__status",
    "Loading interactive preview",
  );
  status.dataset.viewerStatus =
    "";
  status.setAttribute(
    "role",
    "status",
  );
  status.setAttribute(
    "aria-live",
    "polite",
  );

  const frame =
    document.createElement(
      "iframe",
    );
  frame.title =
    `${artifact.title} interactive preview`;
  frame.dataset.viewerSrc =
    artifactPreviewPath(
      artifact,
    );
  frame.sandbox =
    "allow-scripts allow-forms";
  frame.referrerPolicy =
    "no-referrer";
  frame.dataset.viewerFrame =
    "";
  frame.dataset.state =
    "loading";

  const fullscreenHud = element(
    "div",
    "viewer-fullscreen-hud",
  );
  fullscreenHud.dataset.viewerFullscreenHud =
    "";
  fullscreenHud.hidden = true;
  fullscreenHud.append(
    element(
      "span",
      "",
      "Full screen · press Escape to exit",
    ),
  );
  const fullscreenExit = element(
    "button",
    "viewer-fullscreen-hud__exit",
    "Exit full screen",
  );
  fullscreenExit.type = "button";
  fullscreenExit.dataset.viewerFullscreenExit =
    "";
  fullscreenHud.append(
    fullscreenExit,
  );

  mount.append(
    frame,
    status,
    fullscreenHud,
  );

  const footer = element(
    "div",
    "artifact-viewer__footer",
  );
  footer.append(
    element(
      "p",
      "artifact-viewer__description",
      artifact.description ??
        "No artefact description is available.",
    ),
    element(
      "p",
      "artifact-viewer__revision",
      options.revisionId
        ? `Workspace revision ${shortHash(
            options.revisionId,
            8,
          )}`
        : "Workspace revision unavailable",
    ),
  );

  const shortcutDialog =
    createShortcutDialog();

  section.append(
    toolbar,
    appearance,
    details,
    mount,
    footer,
    shortcutDialog,
  );

  return section;
}

export function activateArtifactViewer(
  root,
  options,
) {
  const artifact =
    options.artifact;
  const frame =
    root.querySelector(
      "iframe[data-viewer-frame]",
    );

  if (!frame) {
    return () => {};
  }

  const controller =
    new AbortController();
  const mount =
    root.querySelector(
      "[data-viewer-mount]",
    );
  const status =
    root.querySelector(
      "[data-viewer-status]",
    );
  const reloadButton =
    root.querySelector(
      "[data-viewer-reload]",
    );
  const fullscreenButton =
    root.querySelector(
      "[data-viewer-fullscreen]",
    );
  const fullscreenExit =
    root.querySelector(
      "[data-viewer-fullscreen-exit]",
    );
  const fullscreenHud =
    root.querySelector(
      "[data-viewer-fullscreen-hud]",
    );
  const detailsButton =
    root.querySelector(
      "[data-viewer-details]",
    );
  const detailsPanel =
    root.querySelector(
      "[data-viewer-details-panel]",
    );
  const shortcutsButton =
    root.querySelector(
      "[data-viewer-shortcuts]",
    );
  const shortcutsDialog =
    root.querySelector(
      "[data-viewer-shortcut-dialog]",
    );
  const shortcutClose =
    root.querySelector(
      "[data-viewer-shortcut-close]",
    );
  const exportStatus =
    root.querySelector(
      "[data-viewer-export-status]",
    );

  let reloadSequence = 0;
  let loadTimer = null;
  let disposed = false;

  const setPreviewUrl = (
    path,
    setOptions = {},
  ) => {
    reloadSequence += 1;
    const url = new URL(
      path,
      window.location.origin,
    );
    url.searchParams.set(
      "viewerReload",
      String(reloadSequence),
    );
    setPreviewState(
      "loading",
      setOptions.message ??
        "Loading interactive preview",
    );
    bindFrameLoad();
    frame.src =
      `${url.pathname}${url.search}`;
  };

  const appearanceController =
    activateAppearanceControls(
      root,
      {
        artifact,
        revisionId:
          options.revisionId,
        setPreviewUrl,
        onSaved:
          options.onAppearanceSaved,
      },
    );

  setPreviewUrl(
    frame.dataset.viewerSrc,
    {
      message:
        "Loading interactive preview",
    },
  );

  const reload = () => {
    appearanceController.reload();
  };

  const toggleFullscreen =
    async () => {
      if (
        document.fullscreenElement ===
        mount
      ) {
        await document.exitFullscreen();
        return;
      }

      if (
        typeof mount
          ?.requestFullscreen !==
        "function"
      ) {
        announce(
          status,
          "Full screen is not supported by this browser.",
        );
        return;
      }

      await mount.requestFullscreen();
  };

  const toggleDetails = () => {
    const open =
      detailsPanel.hidden;
    detailsPanel.hidden = !open;
    detailsButton.setAttribute(
      "aria-expanded",
      String(open),
    );
    detailsButton.dataset.active =
      String(open);

    if (open) {
      detailsPanel.scrollIntoView({
        block: "nearest",
        behavior:
          prefersReducedMotion()
            ? "auto"
            : "smooth",
      });
    }
  };

  const openShortcuts = () => {
    if (
      typeof shortcutsDialog
        ?.showModal ===
      "function"
    ) {
      shortcutsDialog.showModal();
    } else {
      shortcutsDialog.hidden =
        false;
    }
  };

  const closeShortcuts = () => {
    if (
      typeof shortcutsDialog
        ?.close ===
      "function" &&
      shortcutsDialog.open
    ) {
      shortcutsDialog.close();
    } else {
      shortcutsDialog.hidden =
        true;
    }
  };

  const onFullscreenChange = () => {
    const active =
      document.fullscreenElement ===
      mount;
    fullscreenButton.textContent =
      active
        ? "Exit full screen"
        : "Full screen";
    fullscreenButton.setAttribute(
      "aria-pressed",
      String(active),
    );
    fullscreenHud.hidden =
      !active;
  };

  const onKeydown = (event) => {
    const action =
      viewerShortcutAction(
        event,
      );

    if (!action) return;

    event.preventDefault();

    if (action === "reload") {
      reload();
    } else if (
      action === "fullscreen"
    ) {
      toggleFullscreen().catch(
        handleControlError,
      );
    } else if (
      action === "details"
    ) {
      toggleDetails();
    } else if (
      action === "appearance"
    ) {
      appearanceController.toggle();
    } else if (
      action === "shortcuts"
    ) {
      openShortcuts();
    }
  };

  reloadButton.addEventListener(
    "click",
    reload,
  );
  fullscreenButton.addEventListener(
    "click",
    () =>
      toggleFullscreen().catch(
        handleControlError,
      ),
  );
  fullscreenExit.addEventListener(
    "click",
    () =>
      toggleFullscreen().catch(
        handleControlError,
      ),
  );
  detailsButton.addEventListener(
    "click",
    toggleDetails,
  );
  shortcutsButton.addEventListener(
    "click",
    openShortcuts,
  );
  shortcutClose.addEventListener(
    "click",
    closeShortcuts,
  );
  document.addEventListener(
    "fullscreenchange",
    onFullscreenChange,
  );
  document.addEventListener(
    "keydown",
    onKeydown,
  );

  loadArtifactViewerData(
    artifact.kind,
    artifact.id,
    {
      signal:
        controller.signal,
    },
  )
    .then((data) => {
      if (disposed) return;
      renderViewerDetails(
        detailsPanel,
        data,
        options.revisionId,
      );
      const readiness =
        exportReadiness(
          data.exportStatus,
        );
      exportStatus.textContent =
        readiness.label;
      exportStatus.dataset.state =
        readiness.mode;
    })
    .catch((error) => {
      if (
        error?.name ===
        "AbortError"
      ) {
        return;
      }

      exportStatus.textContent =
        "Export status unavailable";
      exportStatus.dataset.state =
        "error";
      renderDetailsFailure(
        detailsPanel,
        error,
      );
    });

  return () => {
    disposed = true;
    controller.abort();
    window.clearTimeout(
      loadTimer,
    );
    reloadButton.removeEventListener(
      "click",
      reload,
    );
    detailsButton.removeEventListener(
      "click",
      toggleDetails,
    );
    appearanceController.cleanup();
    shortcutsButton.removeEventListener(
      "click",
      openShortcuts,
    );
    shortcutClose.removeEventListener(
      "click",
      closeShortcuts,
    );
    document.removeEventListener(
      "fullscreenchange",
      onFullscreenChange,
    );
    document.removeEventListener(
      "keydown",
      onKeydown,
    );

    if (
      document.fullscreenElement ===
      mount
    ) {
      document.exitFullscreen()
        .catch(() => {});
    }
  };

  function bindFrameLoad() {
    window.clearTimeout(
      loadTimer,
    );
    loadTimer = window.setTimeout(
      () => {
        if (
          frame.dataset.state !==
          "ready"
        ) {
          setPreviewState(
            "error",
            "Preview is taking longer than expected",
          );
        }
      },
      PREVIEW_TIMEOUT_MS,
    );

    frame.addEventListener(
      "load",
      () => {
        window.clearTimeout(
          loadTimer,
        );
        setPreviewState(
          "ready",
          "Interactive preview loaded",
        );
      },
      { once: true },
    );

    frame.addEventListener(
      "error",
      () => {
        window.clearTimeout(
          loadTimer,
        );
        setPreviewState(
          "error",
          "Interactive preview unavailable",
        );
      },
      { once: true },
    );
  }

  function setPreviewState(
    mode,
    message,
  ) {
    frame.dataset.state =
      mode;
    status.dataset.state =
      mode;
    status.textContent =
      message;
  }

  function handleControlError(
    error,
  ) {
    console.error(error);
    announce(
      status,
      error instanceof Error
        ? error.message
        : String(error),
    );
  }
}

function renderViewerDetails(
  panel,
  data,
  revisionId,
) {
  const artifact =
    data.artifact;
  const manifest =
    artifact.manifest ?? {};
  const resolution =
    data.resolution ?? {};
  const exportData =
    data.exportStatus?.export ??
    {};
  const appearance =
    selectedAppearance(
      resolution,
    );

  panel.replaceChildren(
    detailsCard(
      "Artefact",
      [
        ["ID", artifact.id],
        [
          "Kind",
          kindLabel(
            artifact.kind,
          ),
        ],
        [
          "Owner",
          manifest.owner ??
            "Not specified",
        ],
        [
          "Entry",
          manifest.entry ??
            "Unavailable",
        ],
        [
          "Manifest",
          artifact.displayPath ??
            artifact.manifestPath ??
            "Unavailable",
        ],
        [
          "Tags",
          (artifact.tags ?? [])
            .join(", ") ||
            "None",
        ],
      ],
    ),
    detailsCard(
      "Appearance",
      [
        [
          "Theme",
          appearance.theme,
        ],
        [
          "Preset",
          appearance.preset,
        ],
        [
          "Layout",
          appearance.layout,
        ],
        [
          "Dependencies",
          String(
            resolution.summary
              ?.dependencyCount ??
            0,
          ),
        ],
        [
          "Valid",
          resolution.summary
            ?.valid
            ? "Yes"
            : "No",
        ],
        [
          "Revision",
          revisionId
            ? shortHash(
                revisionId,
                12,
              )
            : "Unavailable",
        ],
      ],
    ),
    detailsCard(
      "Standalone export",
      [
        [
          "Ready",
          exportData.ready
            ? "Yes"
            : "No",
        ],
        [
          "File",
          exportData.fileName ??
            artifact.exportFileName ??
            `${artifact.id}.html`,
        ],
        [
          "Size",
          formatBytes(
            exportData.sizeBytes,
          ),
        ],
        [
          "SHA-256",
          shortHash(
            exportData.sha256,
            16,
          ),
        ],
        [
          "Validation",
          exportData.validation
            ?.valid
            ? "Passed"
            : "Needs attention",
        ],
        [
          "Warnings",
          String(
            exportData.warnings
              ?.length ?? 0,
          ),
        ],
      ],
    ),
    detailsCard(
      "Embedded resources",
      exportResourceRows(
        exportData.resources,
      ),
    ),
    dependencyCard(
      resolution,
    ),
    issuesCard(
      [
        ...(data.relatedIssues ?? []),
        ...(resolution.issues ?? []),
        ...(exportData.validation
          ?.issues ?? []),
      ],
    ),
  );
}

function detailsCard(
  title,
  rows,
) {
  const card = element(
    "article",
    "viewer-details-card",
  );
  card.append(
    element(
      "h2",
      "",
      title,
    ),
  );
  const list = element(
    "dl",
    "viewer-details-list",
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
        value ?? "Unavailable",
      ),
    );
    list.append(item);
  }

  card.append(list);
  return card;
}

function dependencyCard(
  resolution,
) {
  const card = element(
    "article",
    "viewer-details-card viewer-details-card--wide",
  );
  card.append(
    element(
      "h2",
      "",
      "Resolved dependencies",
    ),
  );

  const groups =
    dependencyGroups(
      resolution,
    );

  if (groups.length === 0) {
    card.append(
      element(
        "p",
        "viewer-details-empty",
        "No resolved appearance dependencies.",
      ),
    );
    return card;
  }

  const container = element(
    "div",
    "viewer-dependency-groups",
  );

  for (const group of groups) {
    const section = element(
      "section",
      "viewer-dependency-group",
    );
    section.append(
      element(
        "h3",
        "",
        titleCase(group.kind),
      ),
    );
    const list = element(
      "ul",
      "viewer-dependency-list",
    );

    for (
      const dependency of
        group.entries
    ) {
      const item = element("li");
      item.append(
        element(
          "strong",
          "",
          dependency.id,
        ),
        element(
          "span",
          "",
          [
            dependency.level ??
              dependency.category,
            dependency.slot,
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      );
      list.append(item);
    }

    section.append(list);
    container.append(section);
  }

  card.append(container);
  return card;
}

function issuesCard(issues) {
  const card = element(
    "article",
    "viewer-details-card viewer-details-card--wide",
  );
  card.append(
    element(
      "h2",
      "",
      "Diagnostics",
    ),
  );

  if (issues.length === 0) {
    const clear = element(
      "p",
      "viewer-diagnostics-clear",
      "No discovery, resolution or export issues.",
    );
    card.append(clear);
    return card;
  }

  const list = element(
    "ul",
    "viewer-diagnostics-list",
  );

  for (const issue of issues) {
    const item = element("li");
    item.dataset.severity =
      issue.severity ??
      "error";
    item.append(
      element(
        "strong",
        "",
        issue.code ??
          "DIAGNOSTIC",
      ),
      element(
        "span",
        "",
        issue.message ??
          "An issue was reported.",
      ),
    );
    list.append(item);
  }

  card.append(list);
  return card;
}

function loadingDetails() {
  const card = element(
    "article",
    "viewer-details-card viewer-details-card--loading",
  );
  card.append(
    element(
      "h2",
      "",
      "Loading artefact details",
    ),
    element(
      "p",
      "",
      "Resolving metadata, dependencies and standalone export status.",
    ),
  );
  return card;
}

function renderDetailsFailure(
  panel,
  error,
) {
  const card = element(
    "article",
    "viewer-details-card viewer-details-card--error",
  );
  card.append(
    element(
      "h2",
      "",
      "Details unavailable",
    ),
    element(
      "p",
      "",
      error instanceof Error
        ? error.message
        : String(error),
    ),
  );
  panel.replaceChildren(card);
}

function createShortcutDialog() {
  const dialog =
    document.createElement(
      "dialog",
    );
  dialog.className =
    "viewer-shortcut-dialog";
  dialog.dataset
    .viewerShortcutDialog = "";
  const heading = element(
    "div",
    "viewer-shortcut-dialog__heading",
  );
  heading.append(
    element(
      "h2",
      "",
      "Viewer shortcuts",
    ),
  );
  const close = element(
    "button",
    "viewer-shortcut-dialog__close",
    "Close",
  );
  close.type = "button";
  close.dataset
    .viewerShortcutClose = "";
  heading.append(close);

  const list = element(
    "dl",
    "viewer-shortcut-list",
  );

  for (
    const shortcut of
      VIEWER_SHORTCUTS
  ) {
    const item = element("div");
    item.append(
      element(
        "dt",
        "",
        shortcut.key,
      ),
      element(
        "dd",
        "",
        shortcut.label,
      ),
    );
    list.append(item);
  }

  dialog.append(
    heading,
    list,
  );
  return dialog;
}

function controlButton(
  label,
  shortcut,
  datasetName,
) {
  const button = element(
    "button",
    "viewer-control",
    label,
  );
  button.type = "button";
  button.title =
    `${label} (${shortcut})`;
  button.dataset[
    datasetName
  ] = "";

  if (
    datasetName ===
    "viewerDetails"
  ) {
    button.setAttribute(
      "aria-controls",
      "artifact-viewer-details",
    );
    button.setAttribute(
      "aria-expanded",
      "false",
    );
  }

  if (
    datasetName ===
    "viewerAppearance"
  ) {
    button.setAttribute(
      "aria-controls",
      "artifact-appearance-panel",
    );
    button.setAttribute(
      "aria-expanded",
      "false",
    );
  }

  if (
    datasetName ===
    "viewerFullscreen"
  ) {
    button.setAttribute(
      "aria-pressed",
      "false",
    );
  }

  const key = element(
    "kbd",
    "",
    shortcut,
  );
  button.append(key);
  return button;
}

function announce(
  region,
  message,
) {
  region.dataset.state =
    "error";
  region.textContent =
    message;
}

function prefersReducedMotion() {
  return window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches === true;
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
