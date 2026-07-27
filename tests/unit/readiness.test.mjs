import assert from "node:assert/strict";
import test from "node:test";
import { buildReadinessReport, unavailableGit } from "../../src/workspace/readiness.mjs";
import { readinessProgress, readinessTitle } from "../../app/readiness-model.js";

function input(overrides = {}) {
  return {
    config: { id: "mydash", name: "MyDash" },
    scan: { summary: { entryCount: 9, artifactCount: 1, resourceCount: 8, errorCount: 0 } },
    core: { summary: { valid: true, discoveredResourceCount: 8 } },
    validation: { stages: { appearance: { status: "passed" }, exports: { status: "passed" } }, summary: { exportValidatedCount: 1, errorCount: 0, warningCount: 0 } },
    git: { available: true, branch: "main", summary: { conflicted: 0 }, identity: { configured: true }, remotes: [{ name: "origin" }] },
    generatedAt: "2026-07-27T00:00:00.000Z",
    ...overrides,
  };
}

test("healthy workspace is ready", () => {
  const report = buildReadinessReport(input());
  assert.equal(report.status, "ready");
  assert.equal(report.ready, true);
  assert.equal(report.summary.requiredFailureCount, 0);
  assert.equal(readinessTitle(report), "Workspace ready");
});

test("empty workspace is a healthy first run", () => {
  const value = input();
  value.scan.summary.artifactCount = 0;
  value.validation.stages.exports.status = "passed";
  const report = buildReadinessReport(value);
  assert.equal(report.status, "first-run");
  assert.equal(report.ready, true);
  assert.equal(report.phase, "authoring-not-started");
});

test("Git is optional for browsing and export", () => {
  const report = buildReadinessReport(input({ git: unavailableGit("not initialised") }));
  assert.equal(report.status, "ready");
  assert.equal(report.checks.find((item) => item.id === "git").state, "warning");
});

test("required validation failure blocks readiness", () => {
  const value = input();
  value.validation.stages.exports.status = "failed";
  value.validation.summary.errorCount = 1;
  const report = buildReadinessReport(value);
  assert.equal(report.status, "needs-attention");
  assert.equal(report.ready, false);
  assert.equal(report.nextActions[0].required, true);
});

test("readiness progress stays bounded", () => {
  const progress = readinessProgress(buildReadinessReport(input()));
  assert.equal(progress.total, 10);
  assert.equal(progress.percentage <= 100, true);
});
