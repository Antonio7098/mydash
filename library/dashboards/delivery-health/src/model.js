export const GOVERNANCE_STAGES = Object.freeze([
  {
    id: "intake",
    label: "Intake",
    description: "Scope, users and benefit",
  },
  {
    id: "reviews",
    label: "Control reviews",
    description: "Data, cyber, cloud and model risk",
  },
  {
    id: "committee",
    label: "Committee",
    description: "Decision and evidence",
  },
  {
    id: "pilot",
    label: "Pilot",
    description: "Controlled adoption and measurement",
  },
  {
    id: "production",
    label: "Production",
    description: "Live controls and benefit tracking",
  },
]);

const RISK_ORDER = {
  High: 0,
  Medium: 1,
  Low: 2,
};

export function normalisePortfolio(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray(payload.useCases)
  ) {
    throw new TypeError(
      "Portfolio data must contain a useCases array.",
    );
  }

  return {
    schemaVersion: payload.schemaVersion ?? 1,
    asOf: requireDate(payload.asOf, "asOf"),
    notice:
      typeof payload.notice === "string"
        ? payload.notice
        : "",
    useCases: payload.useCases.map(
      normaliseUseCase,
    ),
  };
}

export function calculateSummary(useCases) {
  const total = useCases.length;
  const reviewBacklog = useCases.filter(
    (item) => item.stage === "reviews",
  ).length;
  const approvedForPilot = useCases.filter(
    (item) =>
      item.status ===
      "Approved for pilot",
  ).length;
  const atRisk = useCases.filter(
    (item) => item.risk === "High",
  ).length;
  const completedReviews = useCases.reduce(
    (sum, item) =>
      sum + item.reviews.complete,
    0,
  );
  const totalReviews = useCases.reduce(
    (sum, item) =>
      sum + item.reviews.total,
    0,
  );
  const reviewCompletion =
    totalReviews === 0
      ? 0
      : Math.round(
          (completedReviews /
            totalReviews) *
            100,
        );

  return {
    total,
    reviewBacklog,
    approvedForPilot,
    atRisk,
    reviewCompletion,
  };
}

export function countByStage(useCases) {
  const counts = Object.fromEntries(
    GOVERNANCE_STAGES.map(
      (stage) => [stage.id, 0],
    ),
  );

  for (const item of useCases) {
    if (Object.hasOwn(counts, item.stage)) {
      counts[item.stage] += 1;
    }
  }

  return GOVERNANCE_STAGES.map(
    (stage) => ({
      ...stage,
      count: counts[stage.id],
    }),
  );
}

export function filterUseCases(
  useCases,
  filters = {},
) {
  const search = String(
    filters.search ?? "",
  )
    .trim()
    .toLocaleLowerCase("en-GB");
  const stage = String(
    filters.stage ?? "",
  );
  const owner = String(
    filters.owner ?? "",
  );

  return useCases
    .filter((item) => {
      if (
        stage &&
        item.stage !== stage
      ) {
        return false;
      }

      if (
        owner &&
        item.owner !== owner
      ) {
        return false;
      }

      if (!search) return true;

      return [
        item.id,
        item.title,
        item.area,
        item.owner,
        item.status,
      ].some((value) =>
        value
          .toLocaleLowerCase("en-GB")
          .includes(search),
      );
    })
    .sort(compareWorkQueue);
}

export function owners(useCases) {
  return [
    ...new Set(
      useCases.map(
        (item) => item.owner,
      ),
    ),
  ].sort((left, right) =>
    left.localeCompare(
      right,
      "en-GB",
    ),
  );
}

export function stageLabel(stageId) {
  return (
    GOVERNANCE_STAGES.find(
      (stage) =>
        stage.id === stageId,
    )?.label ?? stageId
  );
}

export function statusTone(status) {
  if (
    status === "Production" ||
    status === "Approved for pilot"
  ) {
    return "positive";
  }

  if (
    /requested|review/i.test(status)
  ) {
    return "warning";
  }

  if (/scheduled/i.test(status)) {
    return "information";
  }

  return "neutral";
}

export function riskTone(risk) {
  return {
    High: "critical",
    Medium: "warning",
    Low: "positive",
  }[risk] ?? "neutral";
}

export function formatDate(
  value,
) {
  const date = new Date(
    `${requireDate(value, "date")}T00:00:00Z`,
  );

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(date);
}

function normaliseUseCase(
  item,
  index,
) {
  if (
    !item ||
    typeof item !== "object"
  ) {
    throw new TypeError(
      `Use case at index ${index} must be an object.`,
    );
  }

  const stage = requireString(
    item.stage,
    `useCases[${index}].stage`,
  );

  if (
    !GOVERNANCE_STAGES.some(
      (candidate) =>
        candidate.id === stage,
    )
  ) {
    throw new TypeError(
      `Use case ${item.id ?? index} has unknown stage ${stage}.`,
    );
  }

  const complete = requireInteger(
    item.reviews?.complete,
    `useCases[${index}].reviews.complete`,
  );
  const total = requireInteger(
    item.reviews?.total,
    `useCases[${index}].reviews.total`,
  );

  if (
    complete < 0 ||
    total < 0 ||
    complete > total
  ) {
    throw new TypeError(
      `Use case ${item.id ?? index} has invalid review progress.`,
    );
  }

  return {
    id: requireString(
      item.id,
      `useCases[${index}].id`,
    ),
    title: requireString(
      item.title,
      `useCases[${index}].title`,
    ),
    area: requireString(
      item.area,
      `useCases[${index}].area`,
    ),
    owner: requireString(
      item.owner,
      `useCases[${index}].owner`,
    ),
    stage,
    status: requireString(
      item.status,
      `useCases[${index}].status`,
    ),
    risk: requireString(
      item.risk,
      `useCases[${index}].risk`,
    ),
    daysInStage: requireInteger(
      item.daysInStage,
      `useCases[${index}].daysInStage`,
    ),
    reviews: {
      complete,
      total,
    },
    nextAction: requireString(
      item.nextAction,
      `useCases[${index}].nextAction`,
    ),
    updatedAt: requireDate(
      item.updatedAt,
      `useCases[${index}].updatedAt`,
    ),
    targetDate: requireDate(
      item.targetDate,
      `useCases[${index}].targetDate`,
    ),
  };
}

function compareWorkQueue(
  left,
  right,
) {
  return (
    (RISK_ORDER[left.risk] ?? 9) -
      (RISK_ORDER[right.risk] ?? 9) ||
    right.daysInStage -
      left.daysInStage ||
    left.id.localeCompare(
      right.id,
      "en-GB",
    )
  );
}

function requireString(
  value,
  label,
) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new TypeError(
      `${label} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function requireInteger(
  value,
  label,
) {
  if (!Number.isInteger(value)) {
    throw new TypeError(
      `${label} must be an integer.`,
    );
  }

  return value;
}

function requireDate(
  value,
  label,
) {
  const result = requireString(
    value,
    label,
  );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      result,
    ) ||
    Number.isNaN(
      Date.parse(`${result}T00:00:00Z`),
    )
  ) {
    throw new TypeError(
      `${label} must be an ISO date.`,
    );
  }

  return result;
}
