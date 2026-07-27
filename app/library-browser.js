import {
  loadLibraryEntry,
} from "./api.js";
import {
  RESOURCE_KINDS,
  consumerTargetPath,
  dependencyTargetPath,
  filterLibraryEntries,
  libraryCounts,
  libraryEntryPath,
  libraryFacetValues,
  lifecycleLabel,
  presetMappingRows,
  propRows,
  resourceKindLabel,
  themeTokenRows,
  variantCount,
  variantGroups,
} from "./library-model.js";

export function createLibraryBrowser(entries, issues = []) {
  const resources = entries.filter((entry) => RESOURCE_KINDS.includes(entry.kind));
  const counts = libraryCounts(resources);
  const facets = libraryFacetValues(resources);
  const fragment = document.createDocumentFragment();

  fragment.append(
    pageHeading({
      eyebrow: "Visual library",
      title: "Shared UI, with its contracts visible.",
      summary:
        "Search Core, Collection and Local resources. See what each resource expects, depends on and powers.",
      asideValue: String(counts.total),
      asideLabel: counts.total === 1 ? "resource" : "resources",
    }),
  );

  const overview = element("section", "library-lifecycle-overview");
  for (const level of ["core", "collection", "local"]) {
    const card = element("article", "library-lifecycle-card");
    card.dataset.level = level;
    card.append(
      element("span", "", level === "core" ? "Core" : level === "collection" ? "Collection" : "Local"),
      element("strong", "", String(counts.byLevel[level] ?? 0)),
      element(
        "small",
        "",
        level === "core"
          ? "Stable defaults used across artefacts."
          : level === "collection"
            ? "Shared within a proven domain or family."
            : "Owned by one artefact until reuse is demonstrated.",
      ),
    );
    overview.append(card);
  }
  fragment.append(overview);

  const controls = element("section", "library-controls");
  controls.dataset.libraryControls = "";
  const search = field("Search", "input");
  search.control.type = "search";
  search.control.placeholder = "Name, ID, reference, slot or description";
  search.control.dataset.librarySearch = "";
  search.control.autocomplete = "off";

  const kind = field("Type", "select");
  kind.control.dataset.libraryKind = "";
  kind.control.append(option("", "All types"));
  for (const value of facets.kinds) kind.control.append(option(value, resourceKindLabel(value, 2)));

  const level = field("Lifecycle", "select");
  level.control.dataset.libraryLevel = "";
  level.control.append(option("", "All levels"));
  for (const value of facets.levels) level.control.append(option(value, titleCase(value)));

  const slot = field("Slot", "select");
  slot.control.dataset.librarySlot = "";
  slot.control.append(option("", "All slots"));
  for (const value of facets.slots) slot.control.append(option(value, value));

  controls.append(search.wrapper, kind.wrapper, level.wrapper, slot.wrapper);

  const results = element("div", "library-results-summary");
  results.dataset.libraryResultsSummary = "";
  results.setAttribute("role", "status");
  results.setAttribute("aria-live", "polite");

  const grid = element("section", "library-resource-grid");
  grid.dataset.libraryGrid = "";
  grid.setAttribute("aria-label", "Library resources");

  const empty = element("div", "library-empty");
  empty.dataset.libraryEmpty = "";
  empty.hidden = true;
  empty.append(
    element("strong", "", "No resources match"),
    element("span", "", "Clear a filter or search for a different contract, slot or reference."),
  );

  renderCards(grid, resources);
  results.textContent = `${resources.length} ${resources.length === 1 ? "resource" : "resources"}`;

  fragment.append(controls, results, grid, empty);

  if (issues.length > 0) {
    const diagnostics = element("section", "library-browser-diagnostics");
    diagnostics.append(
      element("strong", "", `${issues.length} discovery ${issues.length === 1 ? "diagnostic" : "diagnostics"}`),
      element("span", "", "Open Settings for the complete workspace state. Resource-specific issues appear on detail pages."),
    );
    fragment.append(diagnostics);
  }

  return fragment;
}

export function activateLibraryBrowser(root, entries) {
  const controls = root.querySelector("[data-library-controls]");
  const grid = root.querySelector("[data-library-grid]");
  if (!controls || !grid) return () => {};

  const search = root.querySelector("[data-library-search]");
  const kind = root.querySelector("[data-library-kind]");
  const level = root.querySelector("[data-library-level]");
  const slot = root.querySelector("[data-library-slot]");
  const summary = root.querySelector("[data-library-results-summary]");
  const empty = root.querySelector("[data-library-empty]");

  let updateFrame = null;
  const update = () => {
    updateFrame = null;
    const filtered = filterLibraryEntries(entries, {
      query: search.value,
      kind: kind.value,
      level: level.value,
      slot: slot.value,
    });
    renderCards(grid, filtered);
    summary.textContent = `${filtered.length} ${filtered.length === 1 ? "resource" : "resources"}`;
    empty.hidden = filtered.length !== 0;
    grid.hidden = filtered.length === 0;
  };

  const scheduleUpdate = () => {
    if (updateFrame !== null) return;
    updateFrame = window.requestAnimationFrame(update);
  };

  search.addEventListener("input", scheduleUpdate);
  kind.addEventListener("change", scheduleUpdate);
  level.addEventListener("change", scheduleUpdate);
  slot.addEventListener("change", scheduleUpdate);

  return () => {
    if (updateFrame !== null) window.cancelAnimationFrame(updateFrame);
    search.removeEventListener("input", scheduleUpdate);
    kind.removeEventListener("change", scheduleUpdate);
    level.removeEventListener("change", scheduleUpdate);
    slot.removeEventListener("change", scheduleUpdate);
  };
}

export function createLibraryEntryShell(params) {
  const section = element("section", "library-entry-view");
  section.dataset.libraryEntryView = "";
  section.dataset.kind = params.kind;
  section.dataset.id = params.id;
  section.append(
    element("p", "navigator-eyebrow", "Visual library"),
    element("h1", "library-entry-loading-title", "Opening resource"),
    element("p", "library-entry-loading-copy", "Loading contract, dependency and consumer information."),
  );
  return section;
}

export function activateLibraryEntryView(root, params) {
  const target = root.querySelector("[data-library-entry-view]");
  if (!target) return () => {};
  const controller = new AbortController();

  loadLibraryEntry(params.kind, params.id, { signal: controller.signal })
    .then((data) => renderLibraryEntry(target, data))
    .catch((error) => {
      if (error?.name === "AbortError") return;
      target.replaceChildren(
        element("p", "navigator-eyebrow", "Resource unavailable"),
        element("h1", "", "The library entry could not be opened."),
        element("p", "library-entry-loading-copy", error.message),
        navigatorLink("/components", "Return to library", "secondary-action"),
      );
    });

  return () => controller.abort();
}

function renderCards(grid, entries) {
  grid.replaceChildren(...entries.map(resourceCard));
}

function resourceCard(entry) {
  const card = element("article", "library-resource-card");
  card.dataset.level = entry.level ?? "unscoped";
  card.dataset.kind = entry.kind;

  const visual = element("div", "library-resource-card__visual");
  visual.dataset.mode = entry.visual?.mode ?? "resource";
  visual.append(resourceVisual(entry));

  const body = element("div", "library-resource-card__body");
  const meta = element("div", "library-resource-card__meta");
  meta.append(
    pill(resourceKindLabel(entry.kind), "kind"),
    pill(lifecycleLabel(entry), entry.level),
  );
  body.append(
    meta,
    element("h2", "library-resource-card__title", entry.name ?? entry.title),
    element("p", "library-resource-card__description", entry.description ?? "No description provided."),
  );

  const details = element("dl", "library-resource-card__facts");
  if (entry.slot) details.append(fact("Slot", entry.slot));
  details.append(fact("Reference", entry.reference));
  if (entry.contractVersion) details.append(fact("Contract", `v${entry.contractVersion}`));
  if (variantCount(entry) > 0) details.append(fact("Variants", String(variantCount(entry))));
  body.append(details);

  const link = navigatorLink(libraryEntryPath(entry), "Inspect resource →", "library-resource-card__link");
  body.append(link);
  card.append(visual, body);
  return card;
}

function resourceVisual(entry) {
  if (entry.visual?.mode === "theme" && entry.visual.swatches?.length) {
    const swatches = element("div", "library-theme-swatches");
    for (const swatch of entry.visual.swatches) {
      const item = element("span", "library-theme-swatch");
      item.style.setProperty("--resource-swatch", swatch.value);
      item.title = `${swatch.name}: ${swatch.value}`;
      swatches.append(item);
    }
    return swatches;
  }

  const glyph = element("div", "library-resource-glyph");
  glyph.dataset.kind = entry.kind;
  glyph.append(
    element("strong", "", glyphText(entry.kind)),
    element(
      "span",
      "",
      entry.visual?.mode === "ui"
        ? `${entry.visual.propCount ?? 0} props · ${entry.visual.variantCount ?? 0} variants`
        : entry.visual?.mode === "preset"
          ? `${entry.visual.mappingCount ?? 0} mappings`
          : entry.visual?.mode === "asset"
            ? entry.visual.assetCategory ?? "asset"
            : entry.slot ?? entry.kind,
    ),
  );
  return glyph;
}

function renderLibraryEntry(target, data) {
  const entry = data.entry;
  document.title = `${entry.name ?? entry.title} · My Dashboards`;

  const header = element("header", "library-entry-header");
  const copy = element("div", "library-entry-header__copy");
  copy.append(
    navigatorLink("/components", "← Visual library", "library-entry-back"),
    element("p", "navigator-eyebrow", resourceKindLabel(entry.kind)),
    element("h1", "", entry.name ?? entry.title),
    element("p", "library-entry-description", entry.description ?? "No description provided."),
  );

  const actions = element("div", "library-entry-actions");
  const reference = element("code", "library-reference", entry.reference);
  const copyButton = element("button", "library-copy-button", "Copy reference");
  copyButton.type = "button";
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(entry.reference);
      copyButton.textContent = "Copied";
    } catch {
      copyButton.textContent = "Copy unavailable";
    }
  });
  actions.append(reference, copyButton);
  header.append(copy, actions);

  const overview = element("section", "library-entry-overview");
  overview.append(
    detailCard("Lifecycle", [
      ["Level", lifecycleLabel(entry)],
      ["Owner", entry.ownerArtifact ?? entry.collection ?? "Workspace Core"],
      ["Source", entry.displayPath],
    ]),
    detailCard("Contract", [
      ["Slot", entry.slot ?? "Not applicable"],
      ["Version", entry.contractVersion ? `v${entry.contractVersion}` : "Not versioned"],
      ["Entry", entry.entryFile ?? "Manifest-defined"],
    ]),
    detailCard("Usage", [
      ["Consumers", String(data.summary?.consumerCount ?? data.consumers.length)],
      ["Dependencies", String(data.summary?.dependencyCount ?? data.dependencies.length)],
      ["Themes", (entry.supportedThemes ?? []).join(", ") || "Not constrained"],
    ]),
  );

  const body = element("div", "library-entry-body");
  const contract = renderContract(entry);
  if (contract) body.append(contract);
  body.append(
    renderDependencies(data.dependencies),
    renderConsumers(data.consumers),
    renderDiagnostics(data.issues),
  );

  target.replaceChildren(header, overview, body);
}

function renderContract(entry) {
  if (["component", "primitive", "layout"].includes(entry.kind)) {
    const section = detailSection("Contract and variants", "Inputs and supported presentation choices.");
    const props = propRows(entry.manifest);
    if (props.length) {
      const table = element("div", "library-contract-table");
      table.setAttribute("role", "table");
      for (const prop of props) {
        const row = element("div", "library-contract-row");
        row.setAttribute("role", "row");
        row.append(
          element("code", "", prop.name),
          element("span", "", prop.type),
          pill(prop.required ? "Required" : "Optional", prop.required ? "required" : "optional"),
          element("span", "", prop.description ?? "No description."),
        );
        table.append(row);
      }
      section.append(table);
    } else {
      section.append(emptyCopy("No declared props."));
    }

    const groups = variantGroups(entry.manifest);
    if (groups.length) {
      const variants = element("div", "library-variant-groups");
      for (const group of groups) {
        const block = element("section", "library-variant-group");
        block.append(element("h3", "", titleCase(group.name)));
        const values = element("div", "library-chip-row");
        for (const value of group.values) values.append(pill(value, "variant"));
        block.append(values);
        variants.append(block);
      }
      section.append(variants);
    }
    return section;
  }

  if (entry.kind === "theme") {
    const section = detailSection("Theme tokens", "Resolved design values available to compatible UI resources.");
    const grid = element("div", "library-token-grid");
    for (const token of themeTokenRows(entry.manifest)) {
      const item = element("article", "library-token");
      if (token.colour) {
        const swatch = element("span", "library-token__swatch");
        swatch.style.setProperty("--resource-swatch", token.value);
        item.append(swatch);
      }
      item.append(element("code", "", token.name), element("span", "", token.value));
      grid.append(item);
    }
    section.append(grid);
    return section;
  }

  if (entry.kind === "preset") {
    const section = detailSection("Preset mappings", "Semantic slots mapped to concrete library references.");
    const list = element("div", "library-mapping-list");
    for (const row of presetMappingRows(entry.manifest)) {
      const item = element("div", "library-mapping-row");
      item.append(pill(row.group, "kind"), element("code", "", row.slot), element("span", "", "→"), element("code", "", row.reference));
      list.append(item);
    }
    section.append(list);
    return section;
  }

  if (entry.kind === "asset") {
    return detailSectionWithRows("Asset contract", "Approved usage and provenance.", [
      ["Media type", entry.manifest.mediaType],
      ["Category", entry.manifest.category ?? "other"],
      ["Approved", entry.manifest.approved === true ? "Yes" : "No"],
      ["Usage", entry.manifest.usage],
      ["Attribution", entry.manifest.attribution ?? "Not specified"],
    ]);
  }

  return null;
}

function renderDependencies(edges) {
  const section = detailSection("Dependencies", "Resources this item resolves and consumes.");
  if (!edges.length) {
    section.append(emptyCopy("No declared dependencies."));
    return section;
  }
  const list = element("div", "library-edge-list");
  for (const edge of edges) {
    const path = dependencyTargetPath(edge);
    const item = element("article", "library-edge");
    item.dataset.resolved = String(edge.resolved);
    const target = edge.target;
    item.append(
      element("code", "", edge.field),
      path
        ? navigatorLink(path, `${target.kind}:${target.id}`, "library-edge__target")
        : element("span", "library-edge__target", `${edge.target?.kind ?? "resource"}:${edge.reference}`),
      pill(edge.resolved ? "Resolved" : "Unresolved", edge.resolved ? "resolved" : "error"),
    );
    list.append(item);
  }
  section.append(list);
  return section;
}

function renderConsumers(edges) {
  const section = detailSection("Consumers", "Artefacts and resources that currently reference this item.");
  if (!edges.length) {
    section.append(emptyCopy("No current consumers. Promotion should be earned through real reuse."));
    return section;
  }
  const list = element("div", "library-edge-list");
  for (const edge of edges) {
    const path = consumerTargetPath(edge);
    const source = edge.source;
    const item = element("article", "library-edge");
    item.append(
      element("code", "", edge.field),
      path
        ? navigatorLink(path, source.title ?? `${source.kind}:${source.id}`, "library-edge__target")
        : element("span", "library-edge__target", source.title ?? `${source.kind}:${source.id}`),
      pill(source.category === "artifact" ? "Artefact" : resourceKindLabel(source.kind), "consumer"),
    );
    list.append(item);
  }
  section.append(list);
  return section;
}

function renderDiagnostics(issues) {
  const section = detailSection("Diagnostics", "Discovery and reference findings scoped to this resource.");
  if (!issues.length) {
    section.append(element("p", "library-diagnostics-clear", "No resource-specific diagnostics."));
    return section;
  }
  const list = element("ul", "library-diagnostics-list");
  for (const issue of issues) {
    const item = element("li");
    item.dataset.severity = issue.severity ?? "error";
    item.append(element("strong", "", issue.code ?? "DIAGNOSTIC"), element("span", "", issue.message));
    list.append(item);
  }
  section.append(list);
  return section;
}

function detailSection(title, supporting) {
  const section = element("section", "library-detail-section");
  const heading = element("header", "library-detail-section__heading");
  heading.append(element("h2", "", title), element("p", "", supporting));
  section.append(heading);
  return section;
}

function detailSectionWithRows(title, supporting, rows) {
  const section = detailSection(title, supporting);
  section.append(detailCard("Details", rows));
  return section;
}

function detailCard(title, rows) {
  const card = element("article", "library-detail-card");
  card.append(element("h2", "", title));
  const list = element("dl", "library-detail-list");
  for (const [term, value] of rows) list.append(fact(term, value ?? "Unavailable"));
  card.append(list);
  return card;
}

function pageHeading(config) {
  const section = element("header", "page-heading");
  const copy = element("div");
  copy.append(
    element("p", "navigator-eyebrow", config.eyebrow),
    element("h1", "", config.title),
    element("p", "page-heading__summary", config.summary),
  );
  const aside = element("div", "page-heading__aside");
  aside.append(element("strong", "", config.asideValue), element("span", "", config.asideLabel));
  section.append(copy, aside);
  return section;
}

function field(label, type) {
  const wrapper = element("label", "library-filter");
  wrapper.append(element("span", "", label));
  const control = document.createElement(type);
  wrapper.append(control);
  return { wrapper, control };
}

function fact(term, value) {
  const item = element("div");
  item.append(element("dt", "", term), element("dd", "", value));
  return item;
}

function pill(text, tone) {
  const item = element("span", "library-pill", text);
  item.dataset.tone = tone ?? "neutral";
  return item;
}

function emptyCopy(text) {
  return element("p", "library-detail-empty", text);
}

function navigatorLink(path, text, className) {
  const link = element("a", className, text);
  link.href = path;
  link.dataset.navigatorLink = "";
  return link;
}

function option(value, label) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function glyphText(kind) {
  return { theme: "Aa", preset: "Ps", layout: "Ly", component: "Cp", primitive: "Pr", asset: "As" }[kind] ?? "UI";
}

function titleCase(value) {
  return String(value).replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function element(tagName, className = "", text = null) {
  const result = document.createElement(tagName);
  if (className) result.className = className;
  if (text !== null) result.textContent = text;
  return result;
}
