import { resolve } from "node:path";
import {
  parseCommandArguments,
  requirePositionals,
} from "../command-options.mjs";
import { CliError, EXIT_USAGE } from "../errors.mjs";
import { findWorkspaceRoot } from "../../src/workspace/find-root.mjs";
import { resolveCommandPath } from "../../src/files/paths.mjs";
import { prepareOutputDirectory } from "../../src/files/directory-output.mjs";
import { writeFileAtomic } from "../../src/files/output.mjs";
import {
  extractPresentationImages,
  inspectPresentation,
  outlinePresentation,
  readPresentation,
} from "../../src/office/powerpoint.mjs";

const SUBCOMMANDS = new Set([
  "inspect",
  "outline",
  "extract",
  "images",
  "notes",
]);

export const powerpointCommand = {
  name: "powerpoint",
  summary: "Inspect and safely extract modern PowerPoint presentations.",
  usage: "mydash powerpoint <subcommand> <presentation.pptx> [options]",
  options: [
    "inspect <file>                 Inspect slides, notes, charts, tables and media.",
    "outline <file>                 Return the slide-title outline.",
    "extract <file>                 Extract structured slide JSON and notes.",
    "images <file>                  Extract embedded presentation images.",
    "notes <file>                   List speaker notes.",
    "--allow-outside                Permit read-only source access outside the workspace.",
    "--json                         Return structured JSON.",
  ],

  async run(invocation, context) {
    const [subcommand, ...rest] = invocation.args;

    if (!SUBCOMMANDS.has(subcommand)) {
      throw new CliError(
        "UNKNOWN_POWERPOINT_SUBCOMMAND",
        subcommand
          ? `Unknown PowerPoint subcommand: ${subcommand}`
          : "A PowerPoint subcommand is required.",
        {
          exitCode: EXIT_USAGE,
          details: {
            availableSubcommands: [...SUBCOMMANDS],
          },
          hint:
            "Run mydash help powerpoint to see available PowerPoint operations.",
        },
      );
    }

    const workspaceRoot = await findWorkspaceRoot(
      invocation.options.workspace ?? context.cwd,
    );

    switch (subcommand) {
      case "inspect":
        return runInspect(rest, context, workspaceRoot);
      case "outline":
        return runOutline(rest, context, workspaceRoot);
      case "extract":
        return runExtract(rest, context, workspaceRoot);
      case "images":
        return runImages(rest, context, workspaceRoot);
      case "notes":
        return runNotes(rest, context, workspaceRoot);
      default:
        throw new Error("Unreachable PowerPoint subcommand.");
    }
  },
};

async function runInspect(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash powerpoint inspect <file>",
  );
  const path = await resolvePresentation(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const data = await inspectPresentation(path, { workspaceRoot });

  return {
    ok: true,
    command: "powerpoint inspect",
    data,
    warnings: data.warnings,
    text: renderInspection(data),
  };
}

async function runOutline(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash powerpoint outline <file>",
  );
  const path = await resolvePresentation(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const data = await outlinePresentation(path, { workspaceRoot });

  return {
    ok: true,
    command: "powerpoint outline",
    data,
    text: data.slides
      .map(
        (slide) =>
          `${slide.number}. ${slide.title || "(untitled slide)"}`,
      )
      .join("\n"),
  };
}

async function runExtract(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside", "overwrite", "include-images"],
    values: ["output"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash powerpoint extract <file> --output <directory>",
  );

  if (!parsed.options.output) {
    throw new CliError(
      "MISSING_OUTPUT",
      "PowerPoint extraction requires --output <directory>.",
      { exitCode: EXIT_USAGE },
    );
  }

  const path = await resolvePresentation(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const presentation = await readPresentation(path, { workspaceRoot });
  const outputDirectory = await prepareOutputDirectory(
    resolveWorkspaceOutput(parsed.options.output, workspaceRoot),
    {
      workspaceRoot,
      overwrite: parsed.options.overwrite ?? false,
    },
  );

  await writeFileAtomic(
    resolve(outputDirectory, "presentation.json"),
    `${JSON.stringify(presentation.summary, null, 2)}\n`,
    {
      workspaceRoot,
      overwrite: true,
      encoding: "utf8",
    },
  );

  const slidesDirectory = await prepareOutputDirectory(
    resolve(outputDirectory, "slides"),
    { workspaceRoot, overwrite: true },
  );

  for (const slide of presentation.slides) {
    const fileName = `${String(slide.number).padStart(3, "0")}.json`;
    await writeFileAtomic(
      resolve(slidesDirectory, fileName),
      `${JSON.stringify(slide, null, 2)}\n`,
      {
        workspaceRoot,
        overwrite: true,
        encoding: "utf8",
      },
    );
  }

  const notesWithContent = presentation.slides.filter(
    (slide) => slide.notes.length > 0,
  );

  if (notesWithContent.length > 0) {
    const notesDirectory = await prepareOutputDirectory(
      resolve(outputDirectory, "notes"),
      { workspaceRoot, overwrite: true },
    );

    for (const slide of notesWithContent) {
      const fileName = `${String(slide.number).padStart(3, "0")}.txt`;
      await writeFileAtomic(
        resolve(notesDirectory, fileName),
        `${slide.notes.join("\n")}\n`,
        {
          workspaceRoot,
          overwrite: true,
          encoding: "utf8",
        },
      );
    }
  }

  let images = null;
  if (parsed.options.includeImages) {
    images = await extractPresentationImages(path, {
      workspaceRoot,
      outputDirectory: resolve(outputDirectory, "images"),
      overwrite: true,
    });
  }

  return {
    ok: true,
    command: "powerpoint extract",
    data: {
      outputDirectory,
      slideCount: presentation.slides.length,
      noteFileCount: notesWithContent.length,
      imageCount: images?.files.length ?? 0,
    },
    text: `Extracted ${presentation.slides.length} slides to ${displayPath(outputDirectory, workspaceRoot)}.`,
  };
}

async function runImages(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside", "overwrite"],
    values: ["output"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash powerpoint images <file> --output <directory>",
  );

  if (!parsed.options.output) {
    throw new CliError(
      "MISSING_OUTPUT",
      "Image extraction requires --output <directory>.",
      { exitCode: EXIT_USAGE },
    );
  }

  const path = await resolvePresentation(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const data = await extractPresentationImages(path, {
    workspaceRoot,
    outputDirectory: resolveWorkspaceOutput(
      parsed.options.output,
      workspaceRoot,
    ),
    overwrite: parsed.options.overwrite ?? false,
  });

  return {
    ok: true,
    command: "powerpoint images",
    data,
    text:
      data.files.length > 0
        ? `Extracted ${data.files.length} images to ${displayPath(data.outputDirectory, workspaceRoot)}.`
        : "The presentation contains no embedded images.",
  };
}

async function runNotes(args, context, workspaceRoot) {
  const parsed = parseCommandArguments(args, {
    booleans: ["allow-outside"],
  });
  requirePositionals(
    parsed.positionals,
    1,
    "mydash powerpoint notes <file>",
  );
  const path = await resolvePresentation(
    parsed.positionals[0],
    parsed.options,
    context,
    workspaceRoot,
  );
  const presentation = await readPresentation(path, { workspaceRoot });
  const slides = presentation.slides
    .filter((slide) => slide.notes.length > 0)
    .map((slide) => ({
      number: slide.number,
      title: slide.title,
      notes: slide.notes,
    }));

  return {
    ok: true,
    command: "powerpoint notes",
    data: {
      source: presentation.summary.source,
      slides,
    },
    text:
      slides.length > 0
        ? slides
            .map(
              (slide) =>
                `Slide ${slide.number} — ${slide.title || "Untitled"}\n${slide.notes.join("\n")}`,
            )
            .join("\n\n")
        : "No speaker notes found.",
  };
}

async function resolvePresentation(input, options, context, workspaceRoot) {
  return resolveCommandPath(input, {
    cwd: context.cwd,
    workspaceRoot,
    allowOutside: options.allowOutside ?? false,
    mustExist: true,
    requireFile: true,
  });
}

function resolveWorkspaceOutput(input, workspaceRoot) {
  if (!workspaceRoot) {
    throw new CliError(
      "WORKSPACE_REQUIRED_FOR_WRITE",
      "PowerPoint extraction outputs require a My Dashboards workspace.",
      { exitCode: 5 },
    );
  }

  return resolve(workspaceRoot, input);
}

function renderInspection(data) {
  return [
    `Presentation: ${data.displayPath}`,
    `Slides: ${data.slideCount}`,
    `Dimensions: ${data.dimensions.widthInches} × ${data.dimensions.heightInches} inches`,
    `Slides with notes: ${data.slidesWithNotes}`,
    `Images: ${data.imageCount}`,
    `Charts: ${data.chartCount}`,
    `Tables: ${data.tableCount}`,
    `Macros detected: ${data.hasMacros ? "yes" : "no"}`,
  ].join("\n");
}

function displayPath(path, workspaceRoot) {
  if (!workspaceRoot) return path;
  return path.startsWith(workspaceRoot)
    ? path.slice(workspaceRoot.length + 1).replaceAll("\\", "/")
    : path;
}
