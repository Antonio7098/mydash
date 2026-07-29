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

export interface OoxmlPackage {
  path: string;
  entries: Map<string, Buffer>;
  has(name: string): boolean;
  names(prefix?: string): string[];
  binary(name: string): Buffer;
  text(name: string): string;
  xml(name: string): unknown;
}

export async function readOoxmlPackage(path: string): Promise<OoxmlPackage> {
  const source = await readFile(path);
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(new Uint8Array(source));
  } catch (error) {
    throw new Error(
      `The Office file is not a readable OOXML package: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const entries = new Map(
    Object.entries(archive).map(([name, value]) => [
      normalisePackagePath(name),
      Buffer.from(value),
    ]),
  );

  const packageFile: OoxmlPackage = {
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
  return packageFile;
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function childByLocalName(
  node: unknown,
  localName: string,
): unknown {
  if (!isObject(node)) return undefined;

  const entry = Object.entries(node).find(
    ([key]) => !key.startsWith("@") && localPart(key) === localName,
  );

  return entry?.[1];
}

export function attributeByLocalName(
  node: unknown,
  localName: string,
): string | undefined {
  if (!isObject(node)) return undefined;

  const entry = Object.entries(node).find(
    ([key]) => key.startsWith("@") && localPart(key.slice(1)) === localName,
  );

  return entry?.[1] as string | undefined;
}

export function descendantsByLocalName(
  node: unknown,
  localName: string,
): unknown[] {
  const matches: unknown[] = [];
  visit(node);
  return matches;

  function visit(value: unknown): void {
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

export function textValues(node: unknown): string[] {
  const values: string[] = [];

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

export interface OoxmlRelationship {
  id: string | undefined;
  type: string | undefined;
  target: string | undefined;
  targetMode: string | null;
  resolvedTarget: string | null;
}

export function relationships(
  packageFile: OoxmlPackage,
  sourcePart: string,
): OoxmlRelationship[] {
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
        ? (attributeByLocalName(entry, "Target") ?? null)
        : resolveRelationshipTarget(
            sourcePart,
            attributeByLocalName(entry, "Target") ?? "",
          ),
  }));
}

export function relationshipPartPath(sourcePart: string): string {
  const normalised = normalisePackagePath(sourcePart);
  return posix.join(
    posix.dirname(normalised),
    "_rels",
    `${posix.basename(normalised)}.rels`,
  );
}

export function resolveRelationshipTarget(
  sourcePart: string,
  target: string,
): string | null {
  if (!target) return null;
  if (target.startsWith("/")) {
    return normalisePackagePath(target.slice(1));
  }

  return normalisePackagePath(
    posix.normalize(posix.join(posix.dirname(sourcePart), target)),
  );
}

export function normalisePackagePath(value: string): string {
  return String(value).replaceAll("\\", "/").replace(/^\/+/, "");
}

function localPart(value: string): string | undefined {
  return value.split(":").at(-1);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}