import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  inspectPresentation,
  outlinePresentation,
  readPresentation,
} from "../../src/office/powerpoint.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(
  testDirectory,
  "../fixtures/office/sample.pptx",
);

test("PowerPoint inspection reports slides, notes and media", async () => {
  const result = await inspectPresentation(fixture);

  assert.equal(result.slideCount, 1);
  assert.equal(result.slidesWithNotes, 1);
  assert.equal(result.imageCount, 1);
  assert.equal(result.dimensions.widthInches, 13.33);
});

test("PowerPoint outline uses title placeholders", async () => {
  const result = await outlinePresentation(fixture);

  assert.deepEqual(result.slides, [
    {
      number: 1,
      title: "Agent Hub Overview",
      hidden: false,
    },
  ]);
});

test("PowerPoint structured extraction retains text and notes", async () => {
  const result = await readPresentation(fixture);

  assert.deepEqual(result.slides[0].text, [
    "Agent Hub Overview",
    "Use cases in governance review",
  ]);
  assert.deepEqual(result.slides[0].notes, [
    "Explain the governance journey.",
  ]);
  assert.equal(result.slides[0].images[0].fileName, "image1.png");
});
