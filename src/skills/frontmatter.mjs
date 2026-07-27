export function parseSkillMarkdown(source, options = {}) {
  const normalised = String(source)
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n");
  const lines = normalised.split("\n");
  const errors = [];

  if (lines[0] !== "---") {
    return {
      ok: false,
      frontmatter: {},
      body: normalised,
      lineCount: lines.length,
      errors: [
        {
          code: "SKILL_FRONTMATTER_MISSING",
          message:
            `${options.path ?? "SKILL.md"} must start with YAML frontmatter.`,
        },
      ],
    };
  }

  const closingIndex = lines.indexOf("---", 1);

  if (closingIndex < 0) {
    return {
      ok: false,
      frontmatter: {},
      body: normalised,
      lineCount: lines.length,
      errors: [
        {
          code: "SKILL_FRONTMATTER_UNCLOSED",
          message:
            `${options.path ?? "SKILL.md"} has no closing frontmatter marker.`,
        },
      ],
    };
  }

  const frontmatter = {};

  for (let index = 1; index < closingIndex; index += 1) {
    const line = lines[index];

    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }

    const match = line.match(/^([a-z][a-z0-9-]*):\s*(.*)$/);

    if (!match) {
      errors.push({
        code: "SKILL_FRONTMATTER_INVALID_LINE",
        message:
          `${options.path ?? "SKILL.md"} contains unsupported frontmatter at line ${index + 1}.`,
      });
      continue;
    }

    const [, key, rawValue] = match;

    if (Object.hasOwn(frontmatter, key)) {
      errors.push({
        code: "SKILL_FRONTMATTER_DUPLICATE_KEY",
        message:
          `${options.path ?? "SKILL.md"} repeats frontmatter key ${key}.`,
      });
      continue;
    }

    frontmatter[key] = parseScalar(rawValue, {
      path: options.path,
      line: index + 1,
      errors,
    });
  }

  const body = lines
    .slice(closingIndex + 1)
    .join("\n")
    .trim();

  return {
    ok: errors.length === 0,
    frontmatter,
    body,
    lineCount: lines.length,
    errors,
  };
}

function parseScalar(rawValue, context) {
  const value = rawValue.trim();

  if (!value) return "";

  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      context.errors.push({
        code: "SKILL_FRONTMATTER_INVALID_STRING",
        message:
          `${context.path ?? "SKILL.md"} has an invalid quoted value at line ${context.line}.`,
      });
      return value;
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }

  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === "true";
  }

  return value;
}
