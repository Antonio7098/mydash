import { extname, posix, relative, resolve } from "node:path";
import { writeFileAtomic } from "../files/output.js";
import { prepareOutputDirectory } from "../files/directory-output.js";
import {
  asArray,
  attributeByLocalName,
  childByLocalName,
  descendantsByLocalName,
  readOoxmlPackage,
  relationships,
  textValues,
} from "./ooxml.js";

const MODERN_POWERPOINT_EXTENSIONS = new Set([".pptx", ".pptm"]);
const EMU_PER_INCH = 914400;

export interface PresentationWarning {
  code: string;
  message: string;
}

export interface PresentationImage {
  relationshipId: string | undefined;
  packagePath: string | null;
  fileName: string | null;
}

export interface PresentationChart {
  relationshipId: string | undefined;
  packagePath: string | null;
}

export interface PresentationSlide {
  number: number;
  slideId: string | null;
  part: string;
  title: string | null;
  text: string[];
  notes: string[];
  hidden: boolean;
  images: PresentationImage[];
  charts: PresentationChart[];
  tableCount: number;
  shapeCount: number;
}

export interface PresentationDimensions {
  widthEmu: number;
  heightEmu: number;
  widthInches: number;
  heightInches: number;
}

export interface PresentationSummary {
  source: string;
  displayPath: string;
  slideCount: number;
  dimensions: PresentationDimensions;
  slidesWithNotes: number;
  imageCount: number;
  chartCount: number;
  tableCount: number;
  slideMasterCount: number;
  hasMacros: boolean;
}

export interface PresentationReading {
  summary: PresentationSummary;
  slides: PresentationSlide[];
}

export interface PresentationInspection extends PresentationSummary {
  warnings: PresentationWarning[];
}

export interface PresentationOutlineResult {
  source: string;
  displayPath: string;
  slides: { number: number; title: string | null; hidden: boolean }[];
}

export interface PresentationImageExtractionResult {
  source: string;
  outputDirectory: string;
  files: { entry: string; fileName: string; path: string }[];
}

export async function inspectPresentation(
  path: string,
  options: { workspaceRoot?: string } = {},
): Promise<PresentationInspection> {
  const presentation = await readPresentation(path, options);
  const warnings: PresentationWarning[] = [];

  if (presentation.summary.hasMacros) {
    warnings.push({
      code: "MACROS_PRESENT",
      message:
        "The presentation contains a VBA project. My Dashboards will never execute presentation macros.",
    });
  }

  return {
    ...presentation.summary,
    warnings,
  };
}

export async function outlinePresentation(
  path: string,
  options: { workspaceRoot?: string } = {},
): Promise<PresentationOutlineResult> {
  const presentation = await readPresentation(path, options);

  return {
    source: presentation.summary.source,
    displayPath: presentation.summary.displayPath,
    slides: presentation.slides.map((slide) => ({
      number: slide.number,
      title: slide.title,
      hidden: slide.hidden,
    })),
  };
}

export async function readPresentation(
  path: string,
  options: { workspaceRoot?: string } = {},
): Promise<PresentationReading> {
  assertSupportedPresentation(path);
  const packageFile = await readOoxmlPackage(path);
  const presentationPart = "ppt/presentation.xml";

  if (!packageFile.has(presentationPart)) {
    throw new Error(
      "The OOXML package does not contain ppt/presentation.xml.",
    );
  }

  const presentationDocument = packageFile.xml(presentationPart);
  const presentationRoot = childByLocalName(
    presentationDocument,
    "presentation",
  );
  const slideIdList = childByLocalName(presentationRoot, "sldIdLst");
  const slideIds = asArray(childByLocalName(slideIdList, "sldId"));
  const presentationRelationships = relationships(
    packageFile,
    presentationPart,
  );
  const relationshipById = new Map(
    presentationRelationships.map((relationship) => [
      relationship.id,
      relationship,
    ]),
  );

  const slides: PresentationSlide[] = [];

  for (let index = 0; index < slideIds.length; index += 1) {
    const slideId = slideIds[index];
    const relationshipId =
      (slideId as { "@r:id"?: string } | undefined)?.["@r:id"] ??
      attributeByLocalName(slideId, "id");
    const relationship = relationshipById.get(relationshipId);

    if (!relationship?.resolvedTarget) continue;

    slides.push(
      readSlide(
        packageFile,
        relationship.resolvedTarget,
        index + 1,
        slideId,
      ),
    );
  }

  const dimensions = readDimensions(presentationRoot);
  const names = packageFile.names();
  const summary: PresentationSummary = {
    source: path,
    displayPath: displayPath(path, options.workspaceRoot),
    slideCount: slides.length,
    dimensions,
    slidesWithNotes: slides.filter((slide) => slide.notes.length > 0).length,
    imageCount: names.filter((name) => name.startsWith("ppt/media/")).length,
    chartCount: names.filter(
      (name) => /^ppt\/charts\/chart\d+\.xml$/i.test(name),
    ).length,
    tableCount: slides.reduce(
      (total, slide) => total + slide.tableCount,
      0,
    ),
    slideMasterCount: names.filter(
      (name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(name),
    ).length,
    hasMacros: names.some(
      (name) => name.toLowerCase() === "ppt/vbaproject.bin",
    ),
  };

  return {
    summary,
    slides,
  };
}

export async function extractPresentationImages(
  path: string,
  options: { outputDirectory: string; workspaceRoot?: string; overwrite?: boolean },
): Promise<PresentationImageExtractionResult> {
  assertSupportedPresentation(path);
  const packageFile = await readOoxmlPackage(path);
  const outputDirectory = await prepareOutputDirectory(
    options.outputDirectory,
    {
      workspaceRoot: options.workspaceRoot,
      overwrite: options.overwrite ?? false,
    },
  );
  const imageEntries = packageFile
    .names("ppt/media/")
    .filter((name) => !name.endsWith("/"));
  const files: PresentationImageExtractionResult["files"] = [];

  for (const entry of imageEntries) {
    const fileName = posix.basename(entry);
    const outputPath = resolve(outputDirectory, fileName);
    await writeFileAtomic(outputPath, packageFile.binary(entry), {
      workspaceRoot: options.workspaceRoot,
      overwrite: true,
    });
    files.push({
      entry,
      fileName,
      path: outputPath,
    });
  }

  return {
    source: path,
    outputDirectory,
    files,
  };
}

function readSlide(
  packageFile: ReturnType<typeof readOoxmlPackage> extends Promise<infer T> ? T : never,
  slidePart: string,
  number: number,
  slideId: unknown,
): PresentationSlide {
  const slideDocument = packageFile.xml(slidePart);
  const slideRoot = childByLocalName(slideDocument, "sld");
  const slideRelationships = relationships(packageFile, slidePart);
  const text = textValues(slideRoot);
  const title = extractTitle(slideRoot) ?? text[0] ?? null;
  const notesRelationship = slideRelationships.find((relationship) =>
    relationship.type?.endsWith("/notesSlide"),
  );
  const notes =
    notesRelationship?.resolvedTarget &&
    packageFile.has(notesRelationship.resolvedTarget)
      ? textValues(packageFile.xml(notesRelationship.resolvedTarget))
      : [];
  const images = slideRelationships
    .filter((relationship) => relationship.type?.endsWith("/image"))
    .map((relationship) => ({
      relationshipId: relationship.id,
      packagePath: relationship.resolvedTarget,
      fileName: relationship.resolvedTarget
        ? posix.basename(relationship.resolvedTarget)
        : null,
    }));
  const charts = slideRelationships
    .filter((relationship) => relationship.type?.endsWith("/chart"))
    .map((relationship) => ({
      relationshipId: relationship.id,
      packagePath: relationship.resolvedTarget,
    }));

  return {
    number,
    slideId: attributeByLocalName(slideId, "id") ?? null,
    part: slidePart,
    title,
    text,
    notes,
    hidden:
      attributeByLocalName(slideId, "show") === "0" ||
      attributeByLocalName(slideRoot, "show") === "0",
    images,
    charts,
    tableCount: descendantsByLocalName(slideRoot, "tbl").length,
    shapeCount: descendantsByLocalName(slideRoot, "sp").length,
  };
}

function extractTitle(slideRoot: unknown): string | null {
  for (const shape of descendantsByLocalName(slideRoot, "sp")) {
    const nonVisual = childByLocalName(shape, "nvSpPr");
    const nonVisualProperties = childByLocalName(nonVisual, "nvPr");
    const placeholder = childByLocalName(nonVisualProperties, "ph");
    const type = attributeByLocalName(placeholder, "type");

    if (type === "title" || type === "ctrTitle") {
      const values = textValues(shape);
      if (values.length > 0) return values.join(" ");
    }
  }

  return null;
}

function readDimensions(presentationRoot: unknown): PresentationDimensions {
  const slideSize = childByLocalName(presentationRoot, "sldSz");
  const widthEmu = Number(attributeByLocalName(slideSize, "cx") ?? 0);
  const heightEmu = Number(attributeByLocalName(slideSize, "cy") ?? 0);

  return {
    widthEmu,
    heightEmu,
    widthInches: round(widthEmu / EMU_PER_INCH),
    heightInches: round(heightEmu / EMU_PER_INCH),
  };
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function assertSupportedPresentation(path: string): void {
  const extension = extname(path).toLowerCase();

  if (!MODERN_POWERPOINT_EXTENSIONS.has(extension)) {
    throw new Error(
      `Unsupported PowerPoint format ${extension || "(none)"}. Convert legacy .ppt files to .pptx before analysis.`,
    );
  }
}

function displayPath(path: string, workspaceRoot?: string): string {
  if (!workspaceRoot) return path;

  const value = relative(workspaceRoot, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value || ".";
}