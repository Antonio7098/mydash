import {
  artifactDownloadPath,
  artifactPreviewPath,
  artifactViewerPath,
  galleryVariantForArtifact,
  kindLabel,
  sortArtifacts,
} from "./gallery-model.js";

const BASE_PREVIEW_WIDTH = 1440;
const BASE_PREVIEW_HEIGHT = 900;
const PREVIEW_TIMEOUT_MS = 20_000;

export function createArtifactGallery(
  artifacts,
  options = {},
) {
  const section = element(
    "section",
    "artifact-gallery",
  );
  const grid = element(
    "div",
    "artifact-gallery__grid",
  );
  const sorted = sortArtifacts(
    artifacts,
  );

  section.dataset.gallery =
    options.name ?? "artefacts";
  grid.setAttribute(
    "aria-label",
    options.label ??
      "Artefact gallery",
  );

  for (const artifact of sorted) {
    grid.append(
      createArtifactCard(
        artifact,
      ),
    );
  }

  section.append(grid);
  return section;
}

export function activateArtifactPreviews(
  root,
) {
  const frames = [
    ...root.querySelectorAll(
      "iframe[data-preview-src]",
    ),
  ];

  if (frames.length === 0) {
    return () => {};
  }

  const resizeObserver =
    typeof ResizeObserver ===
    "function"
      ? new ResizeObserver(
          (entries) => {
            for (const entry of entries) {
              fitPreview(
                entry.target,
              );
            }
          },
        )
      : null;
  const intersectionObserver =
    typeof IntersectionObserver ===
    "function"
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (
                entry.isIntersecting ||
                entry.intersectionRatio > 0
              ) {
                loadPreview(
                  entry.target,
                );
                intersectionObserver.unobserve(
                  entry.target,
                );
              }
            }
          },
          {
            rootMargin:
              "320px 0px",
            threshold: 0.01,
          },
        )
      : null;

  for (const frame of frames) {
    resizeObserver?.observe(
      frame.parentElement,
    );

    if (intersectionObserver) {
      intersectionObserver.observe(
        frame,
      );
    } else {
      loadPreview(frame);
    }

    fitPreview(frame.parentElement);
  }

  return () => {
    intersectionObserver?.disconnect();
    resizeObserver?.disconnect();
  };
}

export function activateViewer(
  root,
) {
  const frame =
    root.querySelector(
      "iframe[data-viewer-frame]",
    );

  if (!frame) return;

  const status =
    root.querySelector(
      "[data-viewer-status]",
    );
  const timeout = window.setTimeout(
    () => {
      if (
        frame.dataset.state !==
        "ready"
      ) {
        setFrameState(
          frame,
          status,
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
      window.clearTimeout(timeout);
      setFrameState(
        frame,
        status,
        "ready",
        "Preview loaded",
      );
    },
    { once: true },
  );
}

function createArtifactCard(
  artifact,
) {
  const card = element(
    "article",
    "artifact-card",
  );
  const variant =
    galleryVariantForArtifact(
      artifact,
    );
  card.dataset.kind =
    artifact.kind;
  card.dataset.variant =
    variant;

  const mount = element(
    "div",
    "artifact-preview-mount",
  );
  mount.dataset.variant =
    variant;

  const viewport = element(
    "div",
    "artifact-preview-viewport",
  );
  const frame =
    document.createElement("iframe");
  frame.title =
    `${artifact.title} miniature preview`;
  frame.loading = "lazy";
  frame.tabIndex = -1;
  frame.sandbox =
    "allow-scripts";
  frame.referrerPolicy =
    "no-referrer";
  frame.dataset.previewSrc =
    artifactPreviewPath(
      artifact,
    );
  frame.dataset.state =
    "idle";
  frame.setAttribute(
    "aria-hidden",
    "true",
  );
  frame.width =
    String(BASE_PREVIEW_WIDTH);
  frame.height =
    String(BASE_PREVIEW_HEIGHT);

  const loading = element(
    "div",
    "artifact-preview-status",
  );
  loading.dataset.previewStatus =
    "";
  loading.append(
    element(
      "span",
      "artifact-preview-status__spinner",
    ),
    element(
      "span",
      "",
      "Preview waiting",
    ),
  );

  const overlay = element(
    "a",
    "artifact-preview-link",
  );
  overlay.href =
    artifactViewerPath(
      artifact,
    );
  overlay.dataset.navigatorLink =
    "";
  overlay.setAttribute(
    "aria-label",
    `View ${artifact.title}`,
  );

  viewport.append(
    frame,
    loading,
    overlay,
  );
  mount.append(viewport);

  const panel = element(
    "div",
    "artifact-card__panel",
  );
  const copy = element(
    "div",
    "artifact-card__copy",
  );
  copy.append(
    element(
      "p",
      "artifact-card__kind",
      kindLabel(
        artifact.kind,
      ),
    ),
    element(
      "h3",
      "artifact-card__title",
      artifact.title,
    ),
  );

  if (artifact.description) {
    copy.append(
      element(
        "p",
        "artifact-card__description",
        artifact.description,
      ),
    );
  }

  const actions = element(
    "div",
    "artifact-card__actions",
  );
  const view = element(
    "a",
    "artifact-card__view",
    "View",
  );
  view.href =
    artifactViewerPath(
      artifact,
    );
  view.dataset.navigatorLink = "";

  const download = element(
    "a",
    "artifact-card__download",
    "Download",
  );
  download.href =
    artifactDownloadPath(
      artifact,
    );
  download.setAttribute(
    "download",
    artifact.exportFileName ??
      `${artifact.id}.html`,
  );

  actions.append(
    view,
    download,
  );
  panel.append(copy, actions);
  card.append(mount, panel);

  return card;
}

function loadPreview(frame) {
  if (
    frame.dataset.state !==
    "idle"
  ) {
    return;
  }

  const status =
    frame.parentElement.querySelector(
      "[data-preview-status]",
    );
  const statusText =
    status?.querySelector(
      "span:last-child",
    );
  frame.dataset.state =
    "loading";

  if (statusText) {
    statusText.textContent =
      "Loading preview";
  }

  const timeout = window.setTimeout(
    () => {
      if (
        frame.dataset.state ===
        "loading"
      ) {
        setFrameState(
          frame,
          status,
          "error",
          "Preview unavailable",
        );
      }
    },
    PREVIEW_TIMEOUT_MS,
  );

  frame.addEventListener(
    "load",
    () => {
      window.clearTimeout(timeout);
      setFrameState(
        frame,
        status,
        "ready",
        "Preview loaded",
      );
    },
    { once: true },
  );

  frame.addEventListener(
    "error",
    () => {
      window.clearTimeout(timeout);
      setFrameState(
        frame,
        status,
        "error",
        "Preview unavailable",
      );
    },
    { once: true },
  );

  frame.src =
    frame.dataset.previewSrc;
}

function fitPreview(viewport) {
  const frame =
    viewport?.querySelector(
      "iframe[data-preview-src]",
    );

  if (!frame) return;

  const width =
    viewport.clientWidth;

  if (!width) return;

  const scale =
    width /
    BASE_PREVIEW_WIDTH;
  frame.style.setProperty(
    "--preview-scale",
    String(scale),
  );
}

function setFrameState(
  frame,
  status,
  mode,
  message,
) {
  frame.dataset.state = mode;

  if (!status) return;

  status.dataset.state = mode;
  const label =
    status.querySelector(
      "span:last-child",
    );

  if (label) {
    label.textContent =
      message;
  }
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
