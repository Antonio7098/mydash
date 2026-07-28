import {
  loadLibraryEntry,
} from "./api.js";
import {
  RESOURCE_KINDS,
  consumerTargetPath,
  dependencyTargetPath,
  filterLibraryEntries,
  libraryEntryPath,
  libraryFacetValues,
  lifecycleLabel,
  presetMappingRows,
  propRows,
  resourceKindLabel,
  themeTokenRows,
  variantGroups,
} from "./library-model.js";

export function createLibraryBrowser(entries, issues = []) {
  const resources = entries.filter((entry) => RESOURCE_KINDS.includes(entry.kind));
  const facets = libraryFacetValues(resources);
  const fragment = document.createDocumentFragment();

  const browseModes = element(
    "nav",
    "library-browse-modes",
  );
  browseModes.setAttribute(
    "aria-label",
    "Browse library by lifecycle",
  );
  browseModes.dataset.selected = "-1";
  browseModes.append(
    element(
      "span",
      "library-browse-modes__indicator",
    ),
  );
  for (const [mode, label] of [
    ["core", "Core"],
    ["collection", "Collections"],
    ["local", "Local"],
  ]) {
    const button = element(
      "button",
      "library-browse-mode",
      label,
    );
    button.type = "button";
    button.dataset.libraryBrowseMode = mode;
    button.setAttribute(
      "aria-pressed",
      "false",
    );
    browseModes.append(button);
  }
  const scopeOverview = element(
    "section",
    "library-scope-overview",
  );
  const scopeBody = element(
    "div",
    "library-scope-overview__body",
  );
  const scopeTitle = element(
    "h1",
    "library-scope-overview__title",
    "All",
  );
  scopeTitle.dataset.libraryScopeTitle = "";
  const scopeStats = element(
    "div",
    "library-scope-overview__stats",
  );
  scopeStats.dataset.libraryScopeStats = "";
  scopeBody.append(
    scopeTitle,
    scopeStats,
  );
  scopeOverview.append(
    browseModes,
    scopeBody,
  );

  const controls = element("section", "library-controls");
  controls.dataset.libraryControls = "";
  const search = field("Search", "input");
  search.wrapper.classList.add(
    "library-filter--search",
  );
  search.control.type = "search";
  search.control.placeholder = "Search library";
  search.control.dataset.librarySearch = "";
  search.control.autocomplete = "off";

  const kind = field("Type", "select");
  kind.control.multiple = true;
  kind.control.dataset.libraryKind = "";
  kind.control.append(option("", "All types"));
  for (const value of facets.kinds) kind.control.append(option(value, resourceKindLabel(value, 2)));

  const level = field("Lifecycle", "select");
  level.control.multiple = true;
  level.control.dataset.libraryLevel = "";
  level.control.append(option("", "All levels"));
  for (const value of facets.levels) level.control.append(option(value, titleCase(value)));

  const slot = field("Slot", "select");
  slot.control.multiple = true;
  slot.control.dataset.librarySlot = "";
  slot.control.append(option("", "All slots"));
  for (const value of facets.slots) slot.control.append(option(value, value));

  for (const item of [kind, level, slot]) {
    enhanceSelect(item.wrapper, item.control);
  }

  const filterMenu = element(
    "div",
    "library-filter-menu",
  );
  const filterToggle = element(
    "button",
    "library-filter-toggle",
  );
  filterToggle.type = "button";
  filterToggle.dataset.libraryFilterToggle = "";
  filterToggle.setAttribute(
    "aria-label",
    "Filter library",
  );
  filterToggle.setAttribute(
    "aria-expanded",
    "false",
  );
  filterToggle.append(
    element(
      "span",
      "library-filter-toggle__icon",
    ),
  );
  const filterCount = element(
    "span",
    "library-filter-toggle__count",
    "0",
  );
  filterCount.dataset.libraryFilterCount = "";
  filterCount.hidden = true;
  filterToggle.append(filterCount);

  const filterPanel = element(
    "div",
    "library-filter-panel",
  );
  filterPanel.dataset.libraryFilterPanel = "";
  const selectedFilters = element(
    "div",
    "library-selected-filters",
  );
  selectedFilters.dataset.librarySelectedFilters = "";
  selectedFilters.hidden = true;
  filterPanel.append(
    selectedFilters,
    kind.wrapper,
    level.wrapper,
    slot.wrapper,
  );
  filterMenu.append(
    filterToggle,
    filterPanel,
  );
  controls.append(
    search.wrapper,
    filterMenu,
  );

  const results = element("div", "library-results-summary");
  results.dataset.libraryResultsSummary = "";
  results.setAttribute("role", "status");
  results.setAttribute("aria-live", "polite");

  const browser = element(
    "section",
    "library-browser-content",
  );
  browser.dataset.libraryBrowserContent = "";

  const empty = element("div", "library-empty");
  empty.dataset.libraryEmpty = "";
  empty.hidden = true;
  empty.append(
    element("strong", "", "No resources match"),
    element("span", "", "Clear a filter or search for a different contract, slot or reference."),
  );

  results.textContent = `${resources.length} ${resources.length === 1 ? "resource" : "resources"}`;

  fragment.append(
    scopeOverview,
    controls,
    results,
    browser,
    empty,
  );

  return fragment;
}

export function activateLibraryBrowser(root, entries) {
  const controls = root.querySelector("[data-library-controls]");
  const browser = root.querySelector(
    "[data-library-browser-content]",
  );
  if (!controls || !browser) return () => {};

  const search = root.querySelector("[data-library-search]");
  const kind = root.querySelector("[data-library-kind]");
  const level = root.querySelector("[data-library-level]");
  const slot = root.querySelector("[data-library-slot]");
  const summary = root.querySelector("[data-library-results-summary]");
  const empty = root.querySelector("[data-library-empty]");
  const selectedFilters = root.querySelector(
    "[data-library-selected-filters]",
  );
  const filterCount = root.querySelector(
    "[data-library-filter-count]",
  );
  const filterToggle =
    root.querySelector(
      "[data-library-filter-toggle]",
    );
  const filterMenu =
    filterToggle?.closest(
      ".library-filter-menu",
    );
  const browseModes = root.querySelector(
    ".library-browse-modes",
  );
  const scopeTitle = root.querySelector(
    "[data-library-scope-title]",
  );
  const scopeStats = root.querySelector(
    "[data-library-scope-stats]",
  );
  const customSelects = [
    ...root.querySelectorAll(
      "[data-custom-select]",
    ),
  ];

  let updateFrame = null;
  let browseMode = "all";
  let selectedGroup = null;
  let expandedKind = null;

  const selectedValues = (control) =>
    [...control.selectedOptions]
      .map((item) => item.value)
      .filter(Boolean);

  const scopedEntries = () => {
    if (browseMode === "core") {
      return entries.filter(
        (entry) => entry.level === "core",
      );
    }
    if (browseMode === "collection") {
      return entries.filter(
        (entry) =>
          entry.level === "collection" &&
          (!selectedGroup ||
            entry.collection ===
              selectedGroup),
      );
    }
    if (browseMode === "local") {
      return entries.filter(
        (entry) =>
          entry.level === "local" &&
          (!selectedGroup ||
            entry.ownerArtifact ===
              selectedGroup),
      );
    }
    return entries;
  };

  const update = () => {
    updateFrame = null;
    renderSelectedFilters();
    const scope = scopedEntries();
    renderScopeSummary(
      scopeTitle,
      scopeStats,
      scope,
      {
        browseMode,
        selectedGroup,
      },
    );
    const filtered = filterLibraryEntries(scope, {
      query: search.value,
      kind: selectedValues(kind),
      level: selectedValues(level),
      slot: selectedValues(slot),
    });
    renderBrowseContent(
      browser,
      filtered,
      {
        browseMode,
        selectedGroup,
        expandedKind,
        unfilteredScope: scopedEntries(),
      },
    );
    summary.textContent = `${filtered.length} ${filtered.length === 1 ? "resource" : "resources"}`;
    const choosingGroup =
      ["collection", "local"].includes(
        browseMode,
      ) && !selectedGroup;
    empty.hidden =
      filtered.length !== 0 ||
      choosingGroup;
    browser.hidden =
      filtered.length === 0 &&
      !choosingGroup;
  };

  const renderSelectedFilters = () => {
    const active = [
      ["kind", "Type", kind],
      ["level", "Lifecycle", level],
      ["slot", "Slot", slot],
    ].flatMap(([key, label, control]) =>
      [...control.selectedOptions]
        .filter((item) => item.value)
        .map((item) => [
          key,
          label,
          control,
          item,
        ]),
    );
    selectedFilters.replaceChildren(
      ...active.map(
        ([key, label, , selected]) => {
          const pill = element(
            "button",
            "library-selected-filter",
          );
          pill.type = "button";
          pill.dataset.filterKey = key;
          pill.dataset.filterValue =
            selected.value;
          pill.setAttribute(
            "aria-label",
            `Remove ${label} filter: ${selected.textContent}`,
          );
          pill.append(
            element(
              "span",
              "",
              selected.textContent,
            ),
            element(
              "span",
              "library-selected-filter__remove",
              "×",
            ),
          );
          return pill;
        },
      ),
    );
    selectedFilters.hidden =
      active.length === 0;
    filterCount.textContent =
      String(active.length);
    filterCount.hidden =
      active.length === 0;
  };

  const scheduleUpdate = () => {
    if (updateFrame !== null) return;
    updateFrame = window.requestAnimationFrame(update);
  };

  search.addEventListener("input", scheduleUpdate);
  kind.addEventListener("change", scheduleUpdate);
  level.addEventListener("change", scheduleUpdate);
  slot.addEventListener("change", scheduleUpdate);
  const toggleFilters = () => {
    const open =
      filterMenu.dataset.open !==
      "true";
    filterMenu.dataset.open =
      String(open);
    filterToggle.setAttribute(
      "aria-expanded",
      String(open),
    );
  };
  const closeFilters = () => {
    filterMenu.dataset.open = "false";
    filterToggle.setAttribute(
      "aria-expanded",
      "false",
    );
  };
  filterToggle.addEventListener(
    "click",
    toggleFilters,
  );
  filterMenu.addEventListener(
    "pointerleave",
    closeFilters,
  );
  const clearSelectedFilter = (event) => {
    const pill = event.target.closest(
      "[data-filter-key]",
    );
    if (!pill) return;
    const controlsByKey = {
      kind,
      level,
      slot,
    };
    const control =
      controlsByKey[pill.dataset.filterKey];
    if (!control) return;
    const selectedOption = [
      ...control.options,
    ].find(
      (item) =>
        item.value ===
        pill.dataset.filterValue,
    );
    if (selectedOption) {
      selectedOption.selected = false;
    }
    syncCustomSelect(control);
    scheduleUpdate();
  };
  selectedFilters.addEventListener(
    "click",
    clearSelectedFilter,
  );
  const changeBrowseView = (event) => {
    const modeButton = event.target.closest(
      "[data-library-browse-mode]",
    );
    if (modeButton) {
      const requested =
        modeButton.dataset.libraryBrowseMode;
      browseMode =
        browseMode === requested
          ? "all"
          : requested;
      selectedGroup = null;
      expandedKind = null;
      for (
        const button of browseModes.querySelectorAll(
          "[data-library-browse-mode]",
        )
      ) {
        button.setAttribute(
          "aria-pressed",
          String(
            button.dataset.libraryBrowseMode ===
            browseMode,
          ),
        );
      }
      browseModes.dataset.selected =
        String(
          [
            "core",
            "collection",
            "local",
          ].indexOf(browseMode),
        );
      scheduleUpdate();
      return;
    }
    const groupButton = event.target.closest(
      "[data-library-group]",
    );
    if (groupButton) {
      selectedGroup =
        groupButton.dataset.libraryGroup;
      expandedKind = null;
      scheduleUpdate();
      return;
    }
    const expandButton = event.target.closest(
      "[data-library-expand-kind]",
    );
    if (expandButton) {
      expandedKind =
        expandButton.dataset.libraryExpandKind;
      scheduleUpdate();
      return;
    }
    if (
      event.target.closest(
        "[data-library-section-back]",
      )
    ) {
      expandedKind = null;
      scheduleUpdate();
      return;
    }
    if (
      event.target.closest(
        "[data-library-group-back]",
      )
    ) {
      selectedGroup = null;
      expandedKind = null;
      scheduleUpdate();
    }
  };
  root.addEventListener(
    "click",
    changeBrowseView,
  );
  const cleanups = customSelects.map(
    activateCustomSelect,
  );
  update();

  return () => {
    if (updateFrame !== null) window.cancelAnimationFrame(updateFrame);
    search.removeEventListener("input", scheduleUpdate);
    kind.removeEventListener("change", scheduleUpdate);
    level.removeEventListener("change", scheduleUpdate);
    slot.removeEventListener("change", scheduleUpdate);
    filterToggle.removeEventListener(
      "click",
      toggleFilters,
    );
    filterMenu.removeEventListener(
      "pointerleave",
      closeFilters,
    );
    selectedFilters.removeEventListener(
      "click",
      clearSelectedFilter,
    );
    root.removeEventListener(
      "click",
      changeBrowseView,
    );
    for (const cleanup of cleanups) {
      cleanup();
    }
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

function renderScopeSummary(
  title,
  stats,
  entries,
  state,
) {
  const labels = {
    all: "All",
    core: "Core",
    collection: "Collections",
    local: "Local",
  };
  title.textContent =
    state.selectedGroup
      ? titleCase(state.selectedGroup)
      : labels[state.browseMode] ??
        labels.all;

  const componentCount = entries.filter(
    (entry) =>
      ["component", "primitive"].includes(
        entry.kind,
      ),
  ).length;
  const themeCount = entries.filter(
    (entry) => entry.kind === "theme",
  ).length;
  const categoryCount = new Set(
    entries.map((entry) => entry.kind),
  ).size;
  const values = [
    [
      entries.length,
      entries.length === 1
        ? "resource"
        : "resources",
    ],
    [
      componentCount,
      componentCount === 1
        ? "component"
        : "components",
    ],
    [
      themeCount,
      themeCount === 1
        ? "theme"
        : "themes",
    ],
    [
      categoryCount,
      categoryCount === 1
        ? "category"
        : "categories",
    ],
  ];
  stats.replaceChildren(
    ...values.map(([value, label]) => {
      const item = element(
        "div",
        "library-scope-stat",
      );
      item.append(
        element(
          "strong",
          "",
          String(value),
        ),
        element("span", "", label),
      );
      return item;
    }),
  );
}

function renderBrowseContent(
  container,
  entries,
  state,
) {
  container.dataset.browseView =
    state.browseMode;
  container.dataset.expanded =
    String(Boolean(state.expandedKind));

  if (
    ["collection", "local"].includes(
      state.browseMode,
    ) &&
    !state.selectedGroup
  ) {
    renderGroupChooser(
      container,
      entries,
      state.browseMode,
    );
    return;
  }

  if (state.expandedKind) {
    const matching = entries.filter(
      (entry) =>
        entry.kind === state.expandedKind,
    );
    const heading = element(
      "header",
      "library-expanded-heading",
    );
    const back = element(
      "button",
      "library-inline-back",
      "← Back to sections",
    );
    back.type = "button";
    back.dataset.librarySectionBack = "";
    heading.append(
      back,
      element(
        "h2",
        "",
        resourceKindLabel(
          state.expandedKind,
          2,
        ),
      ),
    );
    const grid = element(
      "div",
      "library-resource-grid",
    );
    renderCards(grid, matching);
    container.replaceChildren(
      heading,
      grid,
    );
    return;
  }

  if (state.browseMode === "all") {
    const grid = element(
      "div",
      "library-resource-grid",
    );
    renderCards(grid, entries);
    container.replaceChildren(grid);
    return;
  }

  const content =
    document.createDocumentFragment();
  if (
    ["collection", "local"].includes(
      state.browseMode,
    )
  ) {
    const back = element(
      "button",
      "library-inline-back",
      state.browseMode === "collection"
        ? "← All collections"
        : "← All local owners",
    );
    back.type = "button";
    back.dataset.libraryGroupBack = "";
    content.append(back);
  }

  for (const kind of RESOURCE_KINDS) {
    const matching = entries.filter(
      (entry) => entry.kind === kind,
    );
    if (matching.length === 0) continue;
    const section = element(
      "section",
      "library-shelf",
    );
    section.dataset.compact =
      String(matching.length <= 2);
    section.dataset.itemCount =
      String(matching.length);
    const heading = element(
      "header",
      "library-shelf__heading",
    );
    heading.append(
      element(
        "h2",
        "",
        resourceKindLabel(kind, 2),
      ),
    );
    const expand = element(
      "button",
      "library-shelf__expand",
      "View all →",
    );
    expand.type = "button";
    expand.dataset.libraryExpandKind =
      kind;
    heading.append(expand);
    const rail = element(
      "div",
      "library-shelf__rail",
    );
    renderCards(rail, matching);
    section.append(heading, rail);
    content.append(section);
  }
  container.replaceChildren(content);
}

function renderGroupChooser(
  container,
  entries,
  mode,
) {
  const key =
    mode === "collection"
      ? "collection"
      : "ownerArtifact";
  const groups = new Map();
  for (const entry of entries) {
    const value = entry[key];
    if (!value) continue;
    if (!groups.has(value)) {
      groups.set(value, []);
    }
    groups.get(value).push(entry);
  }

  const heading = element(
    "div",
    "library-group-heading",
  );
  heading.append(
    element(
      "h2",
      "",
      mode === "collection"
        ? "Collections"
        : "Local libraries",
    ),
  );

  const grid = element(
    "div",
    "library-group-grid",
  );
  for (
    const [name, resources] of [
      ...groups.entries(),
    ].sort(([left], [right]) =>
      left.localeCompare(right, "en-GB"),
    )
  ) {
    const button = element(
      "button",
      "library-group-card",
    );
    button.type = "button";
    button.dataset.libraryGroup = name;
    button.append(
      element("strong", "", titleCase(name)),
      element(
        "span",
        "",
        `${resources.length} ${
          resources.length === 1
            ? "resource"
            : "resources"
        }`,
      ),
      element(
        "small",
        "",
        [
          ...new Set(
            resources.map(
              (entry) =>
                resourceKindLabel(
                  entry.kind,
                  2,
                ),
            ),
          ),
        ].join(" · "),
      ),
    );
    grid.append(button);
  }

  if (groups.size === 0) {
    grid.append(
      element(
        "p",
        "library-group-empty",
        mode === "collection"
          ? "No collections have been created yet."
          : "No local libraries are available.",
      ),
    );
  }
  container.replaceChildren(heading, grid);
}

function resourceCard(entry) {
  const card = element("a", "library-resource-card");
  card.href = libraryEntryPath(entry);
  card.dataset.navigatorLink = "";
  card.setAttribute(
    "aria-label",
    `Open ${entry.name ?? entry.title}`,
  );
  card.dataset.level = entry.level ?? "unscoped";
  card.dataset.kind = entry.kind;

  const visual = element("div", "library-resource-card__visual");
  visual.dataset.mode = entry.visual?.mode ?? "resource";
  visual.append(resourceVisual(entry));

  const body = element("div", "library-resource-card__body");
  body.append(
    element("h2", "library-resource-card__title", entry.name ?? entry.title),
    element("p", "library-resource-card__description", entry.description ?? "No description provided."),
  );

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

  if (entry.kind === "layout") {
    return layoutExample();
  }

  if (
    entry.kind === "asset" &&
    entry.id === "mydash-brand-mark"
  ) {
    return brandMarkExample();
  }

  if (
    entry.kind === "component" ||
    entry.kind === "primitive"
  ) {
    return componentExample(entry);
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

  const preview = renderEntryPreview(entry);
  const header = element("header", "library-entry-header");
  const copy = element("div", "library-entry-header__copy");
  copy.append(
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

  const information = element(
    "section",
    "library-entry-information",
  );
  information.append(
    header,
    overview,
    body,
  );

  target.replaceChildren(
    preview,
    information,
  );
}

function renderEntryPreview(entry) {
  const panel = element(
    "section",
    "library-component-preview",
  );
  panel.dataset.level =
    entry.level ?? "core";
  panel.setAttribute(
    "aria-label",
    `${entry.name ?? entry.title} rendered preview`,
  );

  const stage = element(
    "div",
    "library-component-preview__stage",
  );
  stage.append(componentExample(entry));
  panel.append(stage);
  return panel;
}

function componentExample(entry) {
  if (entry.kind === "layout") {
    return layoutExample();
  }

  if (
    entry.kind === "asset" &&
    entry.id === "mydash-brand-mark"
  ) {
    return brandMarkExample();
  }

  if (entry.id === "metric-card") {
    const card = element(
      "article",
      "library-demo-metric",
    );
    const top = element(
      "div",
      "library-demo-metric__top",
    );
    top.append(
      element("span", "", "Active portfolio"),
      element(
        "span",
        "library-demo-status",
        "On track",
      ),
    );
    card.append(
      top,
      element(
        "strong",
        "library-demo-metric__value",
        "24",
      ),
      element(
        "span",
        "library-demo-metric__detail",
        "Three added this month",
      ),
    );
    return card;
  }

  if (entry.id === "section-heading") {
    const heading = element(
      "div",
      "library-demo-heading",
    );
    const copy = element("div");
    copy.append(
      element("strong", "", "Portfolio overview"),
      element(
        "span",
        "",
        "Current position and priority actions.",
      ),
    );
    heading.append(
      copy,
      element(
        "button",
        "library-demo-button",
        "View details",
      ),
    );
    return heading;
  }

  if (entry.id === "button") {
    const row = element(
      "div",
      "library-demo-actions",
    );
    row.append(
      element(
        "button",
        "library-demo-button library-demo-button--primary",
        "Primary action",
      ),
      element(
        "button",
        "library-demo-button",
        "Secondary",
      ),
    );
    return row;
  }

  if (entry.id === "status-badge") {
    const row = element(
      "div",
      "library-demo-actions",
    );
    for (const label of [
      "Ready",
      "In review",
      "Needs attention",
    ]) {
      row.append(
        element(
          "span",
          "library-demo-status",
          label,
        ),
      );
    }
    return row;
  }

  if (entry.id === "text-input") {
    const field = element(
      "label",
      "library-demo-field",
    );
    field.append(
      element(
        "span",
        "",
        "Project name",
      ),
    );
    const input =
      document.createElement("input");
    input.type = "text";
    input.value = "North star";
    input.readOnly = true;
    field.append(input);
    return field;
  }

  if (entry.id === "governance-pipeline") {
    const pipeline = element(
      "div",
      "library-demo-pipeline",
    );
    const stages = [
      ["01", "Intake", "8", "72%"],
      ["02", "Review", "5", "48%"],
      ["03", "Approve", "3", "30%"],
    ];
    for (const [
      index,
      label,
      count,
      width,
    ] of stages) {
      const stage = element(
        "article",
        "library-demo-pipeline__stage",
      );
      const top = element("div");
      top.append(
        element("span", "", index),
        element("strong", "", count),
      );
      const bar = element(
        "span",
        "library-demo-pipeline__bar",
      );
      const fill = element("i");
      fill.style.width = width;
      bar.append(fill);
      stage.append(
        top,
        element("b", "", label),
        bar,
      );
      pipeline.append(stage);
    }
    return pipeline;
  }

  const sample = element(
    "article",
    "library-demo-generic",
  );
  sample.append(
    element(
      "span",
      "library-demo-generic__eyebrow",
      resourceKindLabel(entry.kind),
    ),
    element(
      "strong",
      "",
      entry.name ?? entry.title,
    ),
    element(
      "span",
      "",
      entry.description ??
        "Rendered resource preview",
    ),
  );
  return sample;
}

function layoutExample() {
  const shell = element(
    "div",
    "library-demo-layout",
  );
  const header = element(
    "div",
    "library-demo-layout__header",
  );
  header.append(
    element(
      "span",
      "library-demo-layout__brand",
    ),
    element(
      "span",
      "library-demo-layout__nav",
    ),
    element(
      "span",
      "library-demo-layout__nav library-demo-layout__nav--short",
    ),
  );
  const hero = element(
    "div",
    "library-demo-layout__hero",
  );
  hero.append(
    element("span"),
    element("span"),
  );
  const grid = element(
    "div",
    "library-demo-layout__grid",
  );
  for (let index = 0; index < 3; index += 1) {
    const card = element(
      "span",
      "library-demo-layout__card",
    );
    card.append(
      element("i"),
      element("i"),
      element("i"),
    );
    grid.append(card);
  }
  shell.append(header, hero, grid);
  return shell;
}

function brandMarkExample() {
  const mark = element(
    "div",
    "library-demo-brand",
  );
  mark.append(
    element(
      "span",
      "library-demo-brand__accent",
    ),
    element(
      "strong",
      "",
      "MY DASHBOARDS",
    ),
  );
  return mark;
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

function field(label, type) {
  const wrapper = element("div", "library-filter");
  const labelElement = element("span", "", label);
  const control = document.createElement(type);
  const id = `library-filter-${label.toLowerCase()}`;
  labelElement.id = `${id}-label`;
  control.id = id;
  control.setAttribute(
    "aria-labelledby",
    labelElement.id,
  );
  wrapper.append(labelElement, control);
  return { wrapper, control };
}

function enhanceSelect(wrapper, select) {
  select.classList.add(
    "library-native-select",
  );

  const custom = element(
    "div",
    "library-custom-select",
  );
  custom.dataset.customSelect = "";

  const trigger = element(
    "button",
    "library-custom-select__trigger",
  );
  trigger.type = "button";
  trigger.dataset.customSelectTrigger = "";
  trigger.setAttribute(
    "aria-haspopup",
    "listbox",
  );
  trigger.setAttribute(
    "aria-expanded",
    "false",
  );
  trigger.setAttribute(
    "aria-labelledby",
    `${select.getAttribute("aria-labelledby")} ${select.id}-value`,
  );

  const value = element(
    "span",
    "library-custom-select__value",
    select.options[select.selectedIndex]?.textContent ?? "",
  );
  value.id = `${select.id}-value`;
  const chevron = element(
    "span",
    "library-custom-select__chevron",
  );
  chevron.setAttribute(
    "aria-hidden",
    "true",
  );
  trigger.append(value, chevron);

  const list = element(
    "div",
    "library-custom-select__options",
  );
  list.dataset.customSelectOptions = "";
  list.setAttribute("role", "listbox");
  list.setAttribute(
    "aria-labelledby",
    select.getAttribute("aria-labelledby"),
  );

  for (const source of select.options) {
    const item = element(
      "button",
      "library-custom-select__option",
      source.textContent,
    );
    item.type = "button";
    item.dataset.value = source.value;
    item.setAttribute("role", "option");
    item.setAttribute(
      "aria-selected",
      String(source.selected),
    );
    list.append(item);
  }

  custom.append(trigger, list);
  wrapper.append(custom);
}

function activateCustomSelect(custom) {
  const select =
    custom.previousElementSibling;
  const trigger = custom.querySelector(
    "[data-custom-select-trigger]",
  );
  const value = custom.querySelector(
    ".library-custom-select__value",
  );
  const options = [
    ...custom.querySelectorAll(
      ".library-custom-select__option",
    ),
  ];

  const setOpen = (open) => {
    custom.dataset.open = String(open);
    trigger.setAttribute(
      "aria-expanded",
      String(open),
    );
  };
  const selectOption = (item) => {
    if (select.multiple) {
      if (!item.dataset.value) {
        for (
          const sourceOption of select.options
        ) {
          sourceOption.selected = false;
        }
      } else {
        const sourceOption = [
          ...select.options,
        ].find(
          (candidate) =>
            candidate.value ===
            item.dataset.value,
        );
        if (sourceOption) {
          sourceOption.selected =
            !sourceOption.selected;
        }
      }
      syncCustomSelect(select);
    } else {
      select.value = item.dataset.value;
      value.textContent = item.textContent;
      for (const optionItem of options) {
        optionItem.setAttribute(
          "aria-selected",
          String(optionItem === item),
        );
      }
    }
    select.dispatchEvent(
      new Event("change", {
        bubbles: true,
      }),
    );
    if (!select.multiple) {
      setOpen(false);
      trigger.focus();
    }
  };
  const onTriggerClick = () => {
    setOpen(
      custom.dataset.open !== "true",
    );
  };
  const onOptionClick = (event) => {
    const item = event.target.closest(
      ".library-custom-select__option",
    );
    if (item) selectOption(item);
  };
  const onKeyDown = (event) => {
    const selectedIndex = options.findIndex(
      (item) =>
        item.getAttribute("aria-selected") ===
        "true",
    );
    const focusedIndex = options.indexOf(
      document.activeElement,
    );
    const current =
      focusedIndex >= 0
        ? focusedIndex
        : selectedIndex;
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp"
    ) {
      event.preventDefault();
      const direction =
        event.key === "ArrowDown" ? 1 : -1;
      const next =
        (current + direction + options.length) %
        options.length;
      if (custom.dataset.open === "true") {
        options[next].focus();
      } else {
        setOpen(true);
        options[Math.max(selectedIndex, 0)].focus();
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      trigger.focus();
    }
  };
  const onFocusOut = (event) => {
    if (
      !custom.contains(event.relatedTarget)
    ) {
      setOpen(false);
    }
  };
  const onPointerLeave = (event) => {
    setOpen(false);
    if (
      event.pointerType !== "touch" &&
      custom.contains(
        document.activeElement,
      )
    ) {
      document.activeElement.blur();
    }
  };

  trigger.addEventListener(
    "click",
    onTriggerClick,
  );
  custom.addEventListener(
    "click",
    onOptionClick,
  );
  custom.addEventListener(
    "keydown",
    onKeyDown,
  );
  custom.addEventListener(
    "focusout",
    onFocusOut,
  );
  custom.addEventListener(
    "pointerleave",
    onPointerLeave,
  );

  return () => {
    trigger.removeEventListener(
      "click",
      onTriggerClick,
    );
    custom.removeEventListener(
      "click",
      onOptionClick,
    );
    custom.removeEventListener(
      "keydown",
      onKeyDown,
    );
    custom.removeEventListener(
      "focusout",
      onFocusOut,
    );
    custom.removeEventListener(
      "pointerleave",
      onPointerLeave,
    );
  };
}

function syncCustomSelect(select) {
  const custom =
    select.nextElementSibling;
  if (
    !custom?.matches(
      "[data-custom-select]",
    )
  ) {
    return;
  }
  const selected = [
    ...select.selectedOptions,
  ].filter((item) => item.value);
  const placeholder =
    [...select.options].find(
      (item) => !item.value,
    )?.textContent ?? "All";
  const value = custom.querySelector(
    ".library-custom-select__value",
  );
  if (value) {
    value.textContent =
      selected.length === 0
        ? placeholder
        : selected.length === 1
          ? selected[0].textContent
          : `${selected.length} selected`;
  }
  for (
    const optionItem of custom.querySelectorAll(
      ".library-custom-select__option",
    )
  ) {
    optionItem.setAttribute(
      "aria-selected",
      String(
        optionItem.dataset.value
          ? selected.some(
              (item) =>
                item.value ===
                optionItem.dataset.value,
            )
          : selected.length === 0,
      ),
    );
  }
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
