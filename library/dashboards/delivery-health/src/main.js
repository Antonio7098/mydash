import {
  GOVERNANCE_STAGES,
  calculateSummary,
  countByStage,
  filterUseCases,
  formatDate,
  normalisePortfolio,
  owners,
  riskTone,
  stageLabel,
  statusTone,
} from "./model.js";

const elements = {
  dataDate:
    document.querySelector("#data-date"),
  dataNotice:
    document.querySelector("#data-notice"),
  metricGrid:
    document.querySelector("#metric-grid"),
  pipeline:
    document.querySelector("#pipeline"),
  filters:
    document.querySelector("#filters"),
  search:
    document.querySelector("#search-filter"),
  stage:
    document.querySelector("#stage-filter"),
  owner:
    document.querySelector("#owner-filter"),
  reset:
    document.querySelector("#reset-filters"),
  resultCount:
    document.querySelector("#result-count"),
  queueBody:
    document.querySelector("#queue-body"),
  emptyState:
    document.querySelector("#empty-state"),
};

initialise().catch(renderFailure);

async function initialise() {
  const response = await fetch(
    "../data/use-cases.json",
  );

  if (!response.ok) {
    throw new Error(
      `Portfolio data could not be loaded (${response.status}).`,
    );
  }

  const portfolio =
    normalisePortfolio(
      await response.json(),
    );

  elements.dataDate.textContent =
    formatDate(portfolio.asOf);
  elements.dataNotice.textContent =
    portfolio.notice;

  populateFilters(
    portfolio.useCases,
  );
  renderSummary(
    portfolio.useCases,
  );
  renderPipeline(
    portfolio.useCases,
  );
  renderQueue(
    portfolio.useCases,
  );

  elements.filters.addEventListener(
    "input",
    () =>
      renderQueue(
        portfolio.useCases,
      ),
  );
  elements.filters.addEventListener(
    "change",
    () =>
      renderQueue(
        portfolio.useCases,
      ),
  );
  elements.reset.addEventListener(
    "click",
    () => {
      elements.filters.reset();
      renderQueue(
        portfolio.useCases,
      );
      elements.search.focus();
    },
  );

  document.documentElement.dataset
    .dashboardReady = "true";
}

function populateFilters(useCases) {
  for (
    const stage of GOVERNANCE_STAGES
  ) {
    elements.stage.append(
      option(
        stage.id,
        stage.label,
      ),
    );
  }

  for (const owner of owners(useCases)) {
    elements.owner.append(
      option(owner, owner),
    );
  }
}

function renderSummary(useCases) {
  const summary =
    calculateSummary(useCases);
  const metrics = [
    {
      label: "Portfolio total",
      value: String(summary.total),
      detail:
        `${summary.reviewCompletion}% of required reviews complete`,
      tone: "neutral",
    },
    {
      label: "Review backlog",
      value: String(
        summary.reviewBacklog,
      ),
      detail:
        "Use cases currently in control review",
      tone:
        summary.reviewBacklog > 3
          ? "warning"
          : "neutral",
    },
    {
      label: "Approved for pilot",
      value: String(
        summary.approvedForPilot,
      ),
      detail:
        "Ready for controlled adoption",
      tone: "positive",
    },
    {
      label: "High risk",
      value: String(summary.atRisk),
      detail:
        "Items requiring active attention",
      tone:
        summary.atRisk > 0
          ? "critical"
          : "neutral",
    },
  ];

  elements.metricGrid.replaceChildren(
    ...metrics.map(metricCard),
  );
}

function renderPipeline(useCases) {
  const stages =
    countByStage(useCases);
  const maximum = Math.max(
    1,
    ...stages.map(
      (stage) => stage.count,
    ),
  );

  elements.pipeline.replaceChildren(
    ...stages.map(
      (stage, index) => {
        const card = element(
          "article",
          "governance-pipeline__stage",
        );
        const topline = element(
          "div",
          "governance-pipeline__topline",
        );
        const position = element(
          "span",
          "governance-pipeline__index",
          `0${index + 1}`,
        );
        const status = element(
          "span",
          "mydash-status",
          `${stage.count} active`,
        );
        status.dataset.tone =
          stage.count === maximum
            ? "warning"
            : "neutral";
        topline.append(
          position,
          status,
        );

        const copy = element("div");
        copy.append(
          element(
            "p",
            "governance-pipeline__count",
            String(stage.count),
          ),
          element(
            "h3",
            "governance-pipeline__label",
            stage.label,
          ),
          element(
            "p",
            "governance-pipeline__description",
            stage.description,
          ),
        );

        const bar = element(
          "div",
          "governance-pipeline__bar",
        );
        const fill = element("span");
        fill.style.width =
          `${Math.max(
            stage.count === 0
              ? 0
              : 8,
            Math.round(
              (stage.count /
                maximum) *
                100,
            ),
          )}%`;
        bar.append(fill);

        card.append(
          topline,
          copy,
          bar,
        );

        return card;
      },
    ),
  );
}

function renderQueue(useCases) {
  const filtered = filterUseCases(
    useCases,
    {
      search:
        elements.search.value,
      stage:
        elements.stage.value,
      owner:
        elements.owner.value,
    },
  );

  elements.resultCount.textContent =
    `${filtered.length} of ${useCases.length} use cases shown`;
  elements.queueBody.replaceChildren(
    ...filtered.map(queueRow),
  );
  elements.emptyState.hidden =
    filtered.length > 0;
  elements.queueBody.closest(
    ".dashboard-table-wrap",
  ).hidden =
    filtered.length === 0;
}

function metricCard(metric) {
  const card = element(
    "article",
    "mydash-metric-card",
  );

  if (metric.tone !== "neutral") {
    card.dataset.tone =
      metric.tone;
  }

  card.append(
    element(
      "p",
      "mydash-metric-card__label",
      metric.label,
    ),
    element(
      "p",
      "mydash-metric-card__value",
      metric.value,
    ),
    element(
      "p",
      "mydash-metric-card__detail",
      metric.detail,
    ),
  );

  return card;
}

function queueRow(item) {
  const row = element("tr");

  const useCaseCell = element("td");
  const useCase = element(
    "div",
    "dashboard-use-case",
  );
  useCase.append(
    element(
      "strong",
      "",
      item.title,
    ),
    element(
      "span",
      "",
      `${item.id} · ${item.area} · ${item.owner}`,
    ),
  );
  useCaseCell.append(useCase);

  const stageCell = element("td");
  const stage = element(
    "span",
    "mydash-status",
    stageLabel(item.stage),
  );
  stage.dataset.tone =
    statusTone(item.status);
  stageCell.append(
    stage,
    element(
      "small",
      "dashboard-cell-detail",
      item.status,
    ),
  );

  const riskCell = element("td");
  const risk = element(
    "span",
    "mydash-status",
    `${item.risk} risk`,
  );
  risk.dataset.tone =
    riskTone(item.risk);
  riskCell.append(risk);

  const reviewCell = element("td");
  const review = element(
    "div",
    "dashboard-review-progress",
  );
  const progress = element(
    "progress",
  );
  progress.max =
    item.reviews.total;
  progress.value =
    item.reviews.complete;
  progress.setAttribute(
    "aria-label",
    `${item.reviews.complete} of ${item.reviews.total} reviews complete`,
  );
  review.append(
    progress,
    element(
      "span",
      "",
      `${item.reviews.complete} / ${item.reviews.total} complete`,
    ),
  );
  reviewCell.append(review);

  const daysCell = element(
    "td",
    "",
    String(item.daysInStage),
  );

  const nextCell = element(
    "td",
    "dashboard-next-action",
  );
  nextCell.append(
    document.createTextNode(
      item.nextAction,
    ),
    element(
      "small",
      "",
      `Target ${formatDate(
        item.targetDate,
      )} · Updated ${formatDate(
        item.updatedAt,
      )}`,
    ),
  );

  row.append(
    useCaseCell,
    stageCell,
    riskCell,
    reviewCell,
    daysCell,
    nextCell,
  );

  return row;
}

function option(value, label) {
  const result = element(
    "option",
    "",
    label,
  );
  result.value = value;
  return result;
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

function renderFailure(error) {
  console.error(error);
  elements.metricGrid.replaceChildren(
    failurePanel(
      "Dashboard unavailable",
      "The representative portfolio data could not be rendered.",
    ),
  );
  elements.pipeline.replaceChildren(
    failurePanel(
      "Pipeline unavailable",
      "Refresh the page after checking the artefact data file.",
    ),
  );
  elements.queueBody.closest(
    ".dashboard-table-wrap",
  ).hidden = true;
  elements.emptyState.hidden = false;
  elements.emptyState.querySelector(
    "h3",
  ).textContent =
    "The work queue could not be loaded";
  elements.emptyState.querySelector(
    "p",
  ).textContent =
    error instanceof Error
      ? error.message
      : String(error);
  elements.resultCount.textContent =
    "No use cases shown";
  document.documentElement.dataset
    .dashboardReady = "error";
}

function failurePanel(title, detail) {
  const panel = element(
    "article",
    "mydash-metric-card",
  );
  panel.dataset.tone = "critical";
  panel.append(
    element(
      "p",
      "mydash-metric-card__label",
      title,
    ),
    element(
      "p",
      "mydash-metric-card__detail",
      detail,
    ),
  );
  return panel;
}
