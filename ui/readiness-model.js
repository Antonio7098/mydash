export function readinessTone(report) {
  return {
    ready: "positive",
    "first-run": "information",
    "needs-attention": "critical",
  }[report?.status] ?? "neutral";
}

export function readinessTitle(report) {
  return {
    ready: "Workspace ready",
    "first-run": "Ready for your first artefact",
    "needs-attention": "Workspace needs attention",
  }[report?.status] ?? "Workspace state unavailable";
}

export function readinessProgress(report) {
  const passed = report?.summary?.passedCount ?? 0;
  const total = report?.summary?.checkCount ?? 0;
  return {
    passed,
    total,
    percentage: total > 0 ? Math.round((passed / total) * 100) : 0,
  };
}

export function prioritisedReadinessChecks(report) {
  return [...(report?.checks ?? [])].sort(
    (left, right) =>
      stateOrder(left.state) - stateOrder(right.state) ||
      Number(right.required) - Number(left.required) ||
      left.title.localeCompare(right.title, "en-GB"),
  );
}

function stateOrder(state) {
  return { failed: 0, warning: 1, passed: 2 }[state] ?? 9;
}
