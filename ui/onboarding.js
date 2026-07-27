import {
  prioritisedReadinessChecks,
  readinessProgress,
  readinessTitle,
  readinessTone,
} from "./readiness-model.js";

export function createFirstRunGuide() {
  const section = element("section", "first-run-guide");
  const heading = element("div", "first-run-guide__heading");
  heading.append(
    element("p", "navigator-eyebrow", "First run"),
    element("h2", "", "Create one artefact. Let the filesystem do the rest."),
    element("p", "", "There is no registry to update and no database to seed. Add a valid folder and MyDash discovers it."),
  );

  const steps = element("ol", "first-run-steps");
  steps.append(
    step("1", "Choose a format", "Use /dashboard, /presentation or /concept with Claude Code, or copy an existing artefact folder."),
    step("2", "Write into the library", "Place the artefact under library/dashboards, library/presentations or library/concepts."),
    step("3", "Validate and open", "Run npm run validate. The navigator refreshes automatically when the files change."),
  );

  const structure = element("pre", "first-run-structure");
  structure.textContent = `library/dashboards/my-dashboard/\n├── artifact.json\n├── src/\n│   ├── index.html\n│   ├── styles.css\n│   └── main.js\n└── data/`;

  section.append(heading, steps, structure);
  return section;
}

export function createReadinessPanel(report, options = {}) {
  const section = element("section", options.compact ? "readiness-panel readiness-panel--compact" : "readiness-panel");
  section.dataset.tone = readinessTone(report);
  const progress = readinessProgress(report);
  const heading = element("header", "readiness-panel__heading");
  const copy = element("div");
  copy.append(
    element("p", "navigator-eyebrow", "Release readiness"),
    element("h2", "", readinessTitle(report)),
    element(
      "p",
      "",
      report?.status === "ready"
        ? "Discovery, resolution and standalone export checks are passing."
        : report?.status === "first-run"
          ? "The foundation is healthy. Add a real artefact when you are ready."
          : "Resolve the required checks before relying on generated exports.",
    ),
  );
  const score = element("div", "readiness-score");
  score.append(element("strong", "", `${progress.percentage}%`), element("span", "", `${progress.passed} of ${progress.total} checks`));
  heading.append(copy, score);
  section.append(heading);

  const checks = prioritisedReadinessChecks(report);
  const visible = options.compact ? checks.filter((item) => item.state !== "passed").slice(0, 4) : checks;
  const list = element("div", "readiness-checks");
  for (const item of visible.length ? visible : checks.slice(0, options.compact ? 4 : checks.length)) {
    const row = element("article", "readiness-check");
    row.dataset.state = item.state;
    row.append(
      element("span", "readiness-check__icon", stateIcon(item.state)),
      element("strong", "", item.title),
      element("span", "", item.message),
      item.required ? element("small", "", "Required") : element("small", "", "Recommended"),
    );
    list.append(row);
  }
  section.append(list);

  return section;
}

function step(number, title, text) {
  const item = element("li");
  item.append(element("span", "first-run-step-number", number), element("strong", "", title), element("p", "", text));
  return item;
}

function stateIcon(state) {
  return { passed: "✓", warning: "!", failed: "×" }[state] ?? "·";
}

function element(tagName, className = "", text = null) {
  const result = document.createElement(tagName);
  if (className) result.className = className;
  if (text !== null) result.textContent = text;
  return result;
}
