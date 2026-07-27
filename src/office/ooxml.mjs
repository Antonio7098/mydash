import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  parseTagValue: false,
  trimValues: false,
  processEntities: false,
});

export async function readOoxmlPackage(path) {
  const source = await readFile(path);
  let archive;

  try {
    archive = unzipSync(new Uint8Array(source));
  } catch (error) {
    throw new Error(
      `The Office file is not a readable OOXML package: ${error.message}`,
    );
  }

  const entries = new Map(
    Object.entries(archive).map(([name, value]) => [
      normalisePackagePath(name),
      Buffer.from(value),
    ]),
  );

  return {
    path,
    entries,

    has(name) {
      return entries.has(normalisePackagePath(name));
    },

    names(prefix = "") {
      const normalisedPrefix = normalisePackagePath(prefix);
      return [...entries.keys()]
        .filter((name) => name.startsWith(normalisedPrefix))
        .sort();
    },

    binary(name) {
      const key = normalisePackagePath(name);
      const value = entries.get(key);
      if (!value) {
        throw new Error(`OOXML package entry not found: ${key}`);
      }
      return value;
    },

    text(name) {
      return this.binary(name).toString("utf8");
    },

    xml(name) {
      return parser.parse(this.text(name));
    },
  };
}

export function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function childByLocalName(node, localName) {
  if (!isObject(node)) return undefined;

  const entry = Object.entries(node).find(
    ([key]) => !key.startsWith("@") && localPart(key) === localName,
  );

  return entry?.[1];
}

export function attributeByLocalName(node, localName) {
  if (!isObject(node)) return undefined;

  const entry = Object.entries(node).find(
    ([key]) => key.startsWith("@") && localPart(key.slice(1)) === localName,
  );

  return entry?.[1];
}

export function descendantsByLocalName(node, localName) {
  const matches = [];
  visit(node);
  return matches;

  function visit(value) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    if (!isObject(value)) return;

    for (const [key, child] of Object.entries(value)) {
      if (!key.startsWith("@") && localPart(key) === localName) {
        for (const item of asArray(child)) matches.push(item);
      }
      visit(child);
    }
  }
}

export function textValues(node) {
  const values = [];

  for (const item of descendantsByLocalName(node, "t")) {
    if (typeof item === "string") {
      const value = item.trim();
      if (value) values.push(value);
    } else if (
      isObject(item) &&
      typeof item["#text"] === "string" &&
      item["#text"].trim()
    ) {
      values.push(item["#text"].trim());
    }
  }

  return values;
}

export function relationships(packageFile, sourcePart) {
  const relsPath = relationshipPartPath(sourcePart);
  if (!packageFile.has(relsPath)) return [];

  const document = packageFile.xml(relsPath);
  const root = childByLocalName(document, "Relationships");
  const entries = asArray(childByLocalName(root, "Relationship"));

  return entries.map((entry) => ({
    id: attributeByLocalName(entry, "Id"),
    type: attributeByLocalName(entry, "Type"),
    target: attributeByLocalName(entry, "Target"),
    targetMode: attributeByLocalName(entry, "TargetMode") ?? null,
    resolvedTarget:
      attributeByLocalName(entry, "TargetMode") === "External"
        ? attributeByLocalName(entry, "Target")
        : resolveRelationshipTarget(
            sourcePart,
            attributeByLocalName(entry, "Target"),
          ),
  }));
}

export function relationshipPartPath(sourcePart) {
  const normalised = normalisePackagePath(sourcePart);
  return posix.join(
    posix.dirname(normalised),
    "_rels",
    `${posix.basename(normalised)}.rels`,
  );
}

export function resolveRelationshipTarget(sourcePart, target) {
  if (!target) return null;
  if (target.startsWith("/")) {
    return normalisePackagePath(target.slice(1));
  }

  return normalisePackagePath(
    posix.normalize(posix.join(posix.dirname(sourcePart), target)),
  );
}

export function normalisePackagePath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\/+/, "");
}

function localPart(value) {
  return value.split(":").at(-1);
}

function isObject(value) {
  return value !== null && typeof value === "object";
}
