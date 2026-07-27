import assert from "node:assert/strict";
import {
  dirname,
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";
import test from "node:test";
import {
  parseSkillMarkdown,
} from "../../src/skills/frontmatter.mjs";
import {
  validateProjectSkills,
} from "../../src/skills/validate.mjs";

const testDirectory = dirname(
  fileURLToPath(import.meta.url),
);
const projectRoot = resolve(
  testDirectory,
  "../..",
);

test("skill frontmatter parser reads scalar metadata", () => {
  const parsed = parseSkillMarkdown(`---
name: "Example"
description: "Does useful work"
disable-model-invocation: true
---

Use the repository.
`);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.frontmatter.name, "Example");
  assert.equal(
    parsed.frontmatter.description,
    "Does useful work",
  );
  assert.equal(
    parsed.frontmatter["disable-model-invocation"],
    true,
  );
  assert.equal(parsed.body, "Use the repository.");
});

test("skill frontmatter parser reports missing delimiters", () => {
  const parsed = parseSkillMarkdown(
    "No frontmatter here.",
  );

  assert.equal(parsed.ok, false);
  assert.equal(
    parsed.errors[0].code,
    "SKILL_FRONTMATTER_MISSING",
  );
});

test("installed project skills satisfy the catalogue contract", async () => {
  const result = await validateProjectSkills(
    projectRoot,
  );

  assert.equal(
    result.summary.valid,
    true,
    JSON.stringify(result.issues, null, 2),
  );
  assert.equal(
    result.summary.logicalSkillCount,
    9,
  );
  assert.equal(
    result.summary.commandCount,
    10,
  );
  assert.equal(
    result.entries.some(
      (entry) =>
        entry.command === "component",
    ),
    true,
  );
});
