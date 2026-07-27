import {
  loadAppearanceOptions,
  saveArtifactAppearance,
} from "./api.js";
import {
  artifactDownloadPath,
  artifactPreviewPath,
} from "./gallery-model.js";
import {
  appearanceEqual,
  clearPersonalAppearance,
  collectAppearanceFromForm,
  normaliseBrowserAppearance,
  readPersonalAppearance,
  withAppearanceQuery,
  writePersonalAppearance,
} from "./appearance-model.js";

export function createAppearancePanel() {
  const panel = el("section", "appearance-panel");
  panel.id = "artifact-appearance-panel";
  panel.hidden = true;
  panel.dataset.appearancePanel = "";
  panel.setAttribute("aria-label", "Appearance controls");

  const heading = el("header", "appearance-panel__heading");
  const copy = el("div");
  copy.append(
    el("p", "appearance-panel__eyebrow", "Appearance"),
    el("h2", "", "Preview, personalise or update the artefact."),
    el(
      "p",
      "",
      "Theme and preset are primary. Advanced layout and slot mappings remain optional.",
    ),
  );
  const active = el("span", "appearance-active", "Loading options");
  active.dataset.appearanceActive = "";
  active.dataset.state = "loading";
  heading.append(copy, active);

  const scope = el("fieldset", "appearance-scope");
  scope.append(
    el("legend", "", "Save scope"),
    scopeChoice(
      "preview",
      "Preview only",
      "Temporary until this viewer closes.",
      true,
    ),
    scopeChoice(
      "personal",
      "Personal",
      "Stored in this browser for this artefact.",
    ),
    scopeChoice(
      "artifact",
      "Artefact default",
      "Validate, commit and push artifact.json.",
    ),
  );

  const form = el("form", "appearance-form");
  form.dataset.appearanceForm = "";
  form.append(
    messageBlock(
      "Loading appearance options",
      "Scanning themes, presets and reusable UI.",
      "loading",
    ),
  );

  const status = el("div", "appearance-message");
  status.dataset.appearanceMessage = "";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;

  panel.append(heading, scope, form, status);
  return panel;
}

export function activateAppearanceControls(root, options) {
  const artifact = options.artifact;
  const panel = root.querySelector("[data-appearance-panel]");
  const toggle = root.querySelector("[data-viewer-appearance]");
  const form = root.querySelector("[data-appearance-form]");
  const status = root.querySelector("[data-appearance-message]");
  const active = root.querySelector("[data-appearance-active]");
  const standalone = root.querySelector("[data-viewer-standalone]");
  const download = root.querySelector("[data-viewer-download]");
  const scopeInputs = [
    ...root.querySelectorAll('input[name="appearance-scope"]'),
  ];
  const controller = new AbortController();

  let optionsData = null;
  let baseline = null;
  let current = null;
  let disposed = false;

  toggle.addEventListener("click", togglePanel);
  form.addEventListener("submit", submit);
  form.addEventListener("click", action);
  scopeInputs.forEach((input) =>
    input.addEventListener("change", updateSubmitLabel),
  );

  loadAppearanceOptions(artifact.kind, artifact.id, {
    signal: controller.signal,
  })
    .then((data) => {
      if (disposed) return;
      optionsData = data;
      baseline = normaliseBrowserAppearance(data.current);
      current = baseline;
      renderForm(form, data, baseline);
      updateSubmitLabel();

      const personal = readPersonalAppearance(
        window.localStorage,
        artifact,
      );

      if (personal) {
        setFormAppearance(form, personal);
        apply(personal, "personal", "Personal appearance applied.");
      } else {
        updateLinks(null);
        setActive("default", "Artefact default");
      }
    })
    .catch((error) => {
      if (error?.name === "AbortError") return;
      form.replaceChildren(
        messageBlock(
          "Appearance controls unavailable",
          error instanceof Error ? error.message : String(error),
          "error",
        ),
      );
      setActive("error", "Appearance unavailable");
    });

  return {
    toggle: togglePanel,

    reload() {
      if (current && baseline && !appearanceEqual(current, baseline)) {
        options.setPreviewUrl(
          withAppearanceQuery(artifactPreviewPath(artifact), current),
          { message: "Reloading appearance preview" },
        );
      } else {
        options.setPreviewUrl(artifactPreviewPath(artifact), {
          message: "Reloading interactive preview",
        });
      }
    },

    cleanup() {
      disposed = true;
      controller.abort();
      toggle.removeEventListener("click", togglePanel);
      form.removeEventListener("submit", submit);
      form.removeEventListener("click", action);
    },
  };

  function togglePanel() {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.dataset.active = String(open);

    if (open) {
      panel.scrollIntoView({
        block: "nearest",
        behavior: reducedMotion() ? "auto" : "smooth",
      });
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!optionsData) return;

    let appearance;

    try {
      appearance = collectAppearanceFromForm(form);
    } catch (error) {
      show("error", error.message);
      return;
    }

    const scope = selectedScope(scopeInputs);

    if (scope === "preview") {
      apply(appearance, "preview", "Temporary preview applied.");
      return;
    }

    if (scope === "personal") {
      writePersonalAppearance(window.localStorage, artifact, appearance);
      apply(
        appearance,
        "personal",
        "Personal appearance saved in this browser.",
      );
      return;
    }

    setBusy(true);
    show(
      "loading",
      "Validating, checkpointing and pushing the artefact default…",
    );

    try {
      const result = await saveArtifactAppearance(
        artifact.kind,
        artifact.id,
        {
          appearance,
          expectedRevision: options.revisionId,
        },
      );
      baseline = normaliseBrowserAppearance(result.appearance);
      current = baseline;
      clearPersonalAppearance(window.localStorage, artifact);
      setFormAppearance(form, baseline);
      updateLinks(null);
      options.setPreviewUrl(artifactPreviewPath(artifact), {
        message: "Loading saved artefact default",
      });
      setActive("artifact", "Artefact default saved");

      const suffix = result.checkpoint?.push?.pushed
        ? " and pushed"
        : result.checkpoint?.commit
          ? "; committed locally"
          : "";
      show("success", `Artefact default saved${suffix}.`);
      options.onSaved?.(result);
    } catch (error) {
      show("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  function action(event) {
    const name = event.target.closest("[data-appearance-action]")
      ?.dataset.appearanceAction;
    if (!name) return;
    event.preventDefault();

    if (name === "reset-default") {
      current = baseline;
      setFormAppearance(form, baseline);
      updateLinks(null);
      options.setPreviewUrl(artifactPreviewPath(artifact), {
        message: "Restoring artefact default",
      });
      setActive("default", "Artefact default");
      show("success", "Artefact default restored for this preview.");
    }

    if (name === "clear-personal") {
      clearPersonalAppearance(window.localStorage, artifact);
      current = baseline;
      setFormAppearance(form, baseline);
      updateLinks(null);
      options.setPreviewUrl(artifactPreviewPath(artifact), {
        message: "Restoring artefact default",
      });
      setActive("default", "Artefact default");
      show("success", "Personal appearance removed.");
    }
  }

  function apply(appearance, scope, text) {
    current = normaliseBrowserAppearance(appearance);
    const preview = withAppearanceQuery(
      artifactPreviewPath(artifact),
      current,
    );
    options.setPreviewUrl(preview, {
      message: "Loading appearance preview",
    });
    updateLinks(current);
    setActive(
      scope,
      scope === "personal" ? "Personal appearance" : "Preview override",
    );
    show("success", text);
  }

  function updateLinks(appearance) {
    const preview = artifactPreviewPath(artifact);
    const downloadPath = artifactDownloadPath(artifact);

    standalone.href = appearance
      ? withAppearanceQuery(preview, appearance)
      : preview;
    download.href = appearance
      ? withAppearanceQuery(downloadPath, appearance)
      : downloadPath;
  }

  function updateSubmitLabel() {
    const button = form.querySelector("[data-appearance-submit]");
    if (!button) return;

    button.textContent = {
      preview: "Apply temporary preview",
      personal: "Save personal appearance",
      artifact: "Save, validate & checkpoint",
    }[selectedScope(scopeInputs)];
  }

  function setBusy(busy) {
    for (const control of form.elements) control.disabled = busy;
  }

  function setActive(mode, text) {
    active.dataset.state = mode;
    active.textContent = text;
  }

  function show(mode, text) {
    status.hidden = false;
    status.dataset.state = mode;
    status.textContent = text;
  }
}

function renderForm(form, data, appearance) {
  const basic = el("div", "appearance-basic");
  basic.append(
    selectField("Theme", "theme", data.options.themes, {
      value: appearance.theme,
      inherit: "Workspace default",
    }),
    selectField("Preset", "preset", data.options.presets, {
      value: appearance.preset,
      inherit: "Workspace default",
    }),
  );

  const advanced = document.createElement("details");
  advanced.className = "appearance-advanced";
  advanced.append(
    el("summary", "", "Advanced layout and slot overrides"),
  );
  const grid = el("div", "appearance-advanced__grid");
  grid.append(
    selectField("Layout", "layout", data.options.layouts, {
      value: appearance.overrides.layout,
      inherit: "Use preset layout",
    }),
  );
  appendSlots(
    grid,
    "Components",
    "components",
    data.slots.components,
    data.options.components,
    appearance.overrides.components,
    "Use preset component",
  );
  appendSlots(
    grid,
    "Primitives",
    "primitives",
    data.slots.primitives,
    data.options.primitives,
    appearance.overrides.primitives,
    "Use preset primitive",
  );
  appendAssets(
    grid,
    data.slots.assets,
    data.options.assets,
    appearance.overrides.assets,
  );
  advanced.append(grid);

  const actions = el("div", "appearance-actions");
  const submit = el(
    "button",
    "appearance-submit",
    "Apply temporary preview",
  );
  submit.type = "submit";
  submit.dataset.appearanceSubmit = "";

  const reset = el(
    "button",
    "appearance-secondary",
    "Restore artefact default",
  );
  reset.type = "button";
  reset.dataset.appearanceAction = "reset-default";

  const clear = el(
    "button",
    "appearance-secondary",
    "Clear personal",
  );
  clear.type = "button";
  clear.dataset.appearanceAction = "clear-personal";
  actions.append(submit, reset, clear);

  form.replaceChildren(basic, advanced, actions);
}

function appendSlots(
  parent,
  title,
  prefix,
  slots,
  choices,
  current,
  inherit,
) {
  if (slots.length === 0) return;

  const group = el("fieldset", "appearance-slot-group");
  group.append(el("legend", "", title));

  for (const slot of slots) {
    group.append(
      selectField(titleCase(slot), `${prefix}.${slot}`, choices[slot] ?? [], {
        value: current[slot] ?? null,
        inherit,
        supporting: slot,
      }),
    );
  }

  parent.append(group);
}

function appendAssets(parent, slots, choices, current) {
  if (slots.length === 0) return;

  const group = el("fieldset", "appearance-slot-group");
  group.append(el("legend", "", "Assets"));

  for (const slot of slots) {
    group.append(
      selectField(titleCase(slot), `assets.${slot}`, choices, {
        value: current[slot] ?? null,
        inherit: "Use theme or preset asset",
        supporting: slot,
      }),
    );
  }

  parent.append(group);
}

function selectField(label, name, choices, config) {
  const field = el("label", "appearance-field");
  const copy = el("span", "appearance-field__copy");
  copy.append(el("strong", "", label));

  if (config.supporting) {
    copy.append(el("small", "", config.supporting));
  }

  const select = document.createElement("select");
  select.name = name;
  select.append(option("", config.inherit));

  for (const item of choices) {
    select.append(
      option(
        item.reference,
        [item.name, scopeLabel(item)].filter(Boolean).join(" · "),
      ),
    );
  }

  select.value = config.value ?? "";
  field.append(copy, select);
  return field;
}

function setFormAppearance(form, appearance) {
  const value = normaliseBrowserAppearance(appearance);

  for (const select of form.querySelectorAll("select[name]")) {
    const [group, slot] = select.name.split(".");

    if (group === "theme" || group === "preset") {
      select.value = value[group] ?? "";
    } else if (group === "layout") {
      select.value = value.overrides.layout ?? "";
    } else {
      select.value = value.overrides[group]?.[slot] ?? "";
    }
  }
}

function scopeChoice(value, label, supporting, checked = false) {
  const wrapper = el("label", "appearance-scope__choice");
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "appearance-scope";
  input.value = value;
  input.checked = checked;
  const copy = el("span");
  copy.append(
    el("strong", "", label),
    el("small", "", supporting),
  );
  wrapper.append(input, copy);
  return wrapper;
}

function selectedScope(inputs) {
  return inputs.find((input) => input.checked)?.value ?? "preview";
}

function scopeLabel(item) {
  if (item.level === "core") return "Core";
  if (item.level === "local") return "Local";
  if (item.level === "collection") {
    return item.collection ? `Collection ${item.collection}` : "Collection";
  }
  return "";
}

function messageBlock(title, detail, mode) {
  const block = el("div", `appearance-form-${mode}`);
  block.append(el("strong", "", title), el("span", "", detail));
  return block;
}

function option(value, label) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function titleCase(value) {
  return String(value)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function el(tag, className = "", text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}
