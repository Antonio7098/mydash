import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  inspectPresentation,
  outlinePresentation,
  readPresentation,
} from "../../src/office/powerpoint.js";

const fixture = resolve(process.cwd(), "tests/fixtures/office/sample.pptx");

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
  const slide = result.slides[0];

  if (!slide) throw new Error("Expected extracted slide.");

  assert.deepEqual(slide.text, [
    "Agent Hub Overview",
    "Use cases in governance review",
  ]);
  assert.deepEqual(slide.notes, [
    "Explain the governance journey.",
  ]);

  const image = slide.images[0];

  if (!image) throw new Error("Expected extracted image.");

  assert.equal(image.fileName, "image1.png");
});
