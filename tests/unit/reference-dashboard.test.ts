import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  calculateSummary,
  countByStage,
  filterUseCases,
  formatDate,
  normalisePortfolio,
  owners,
  riskTone,
  statusTone,
} from "../../library/dashboards/ai-use-case-governance/src/model.js";

const projectRoot = resolve(process.cwd());
const dataPath = resolve(
  projectRoot,
  "library",
  "dashboards",
  "ai-use-case-governance",
  "data",
  "use-cases.json",
);

async function portfolio() {
  return normalisePortfolio(
    JSON.parse(
      await readFile(
        dataPath,
        "utf8",
      ),
    ),
  );
}

test("reference portfolio produces the intended summary", async () => {
  const value = await portfolio();
  const summary =
    calculateSummary(
      value.useCases,
    );

  assert.deepEqual(summary, {
    total: 14,
    reviewBacklog: 4,
    approvedForPilot: 2,
    atRisk: 3,
    reviewCompletion: 63,
  });
});

test("stage counts cover the complete governance journey", async () => {
  const value = await portfolio();
  const counts =
    countByStage(
      value.useCases,
    );

  assert.deepEqual(
    counts.map(
      (stage) => [
        stage.id,
        stage.count,
      ],
    ),
    [
      ["intake", 3],
      ["reviews", 4],
      ["committee", 3],
      ["pilot", 2],
      ["production", 2],
    ],
  );
});

test("work queue filters and sorts high-risk items first", async () => {
  const value = await portfolio();
  const filtered =
    filterUseCases(
      value.useCases,
      {
        search: "engineering",
        owner: "",
        stage: "",
      },
    );

  assert.equal(
    filtered.length,
    5,
  );
  assert.equal(
    filtered[0].risk,
    "Medium",
  );

  const reviews =
    filterUseCases(
      value.useCases,
      {
        stage: "reviews",
      },
    );

  assert.deepEqual(
    reviews.slice(0, 3).map(
      (item: unknown) => {
        if (!item || typeof item !== "object" || !("id" in item)) {
          throw new Error("Expected use case.");
        }

        return item.id;
      },
    ),
    [
      "UC-106",
      "UC-109",
      "UC-102",
    ],
  );
});

test("owners, tones and dates are deterministic", async () => {
  const value = await portfolio();

  assert.equal(
    owners(value.useCases)[0],
    "AI Controls",
  );
  assert.equal(
    riskTone("High"),
    "critical",
  );
  assert.equal(
    statusTone("Approved for pilot"),
    "positive",
  );
  assert.equal(
    statusTone("Cyber review"),
    "warning",
  );
  assert.equal(
    formatDate("2026-07-26"),
    "26 Jul 2026",
  );
});

test("portfolio validation rejects unknown stages", () => {
  assert.throws(
    () =>
      normalisePortfolio({
        asOf: "2026-07-26",
        useCases: [
          {
            id: "UC-X",
            title: "Invalid",
            area: "Test",
            owner: "Test",
            stage: "unknown",
            status: "Draft",
            risk: "Low",
            daysInStage: 1,
            reviews: {
              complete: 0,
              total: 1,
            },
            nextAction: "Fix stage",
            updatedAt: "2026-07-26",
            targetDate: "2026-07-27",
          },
        ],
      }),
    /unknown stage/,
  );
});
