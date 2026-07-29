import { Buffer } from "node:buffer";
import {
  getAttribute,
  parseHtmlDocument,
  textContent,
  walkHtml,
} from "./html-tree.js";
import { isInlineSafeReference } from "./paths.js";

const RESOURCE_ATTRIBUTES = new Map<string, string[]>([
  ["audio", ["src"]],
  ["embed", ["src"]],
  ["iframe", ["src"]],
  ["img", ["src", "srcset"]],
  ["input", ["src"]],
  ["link", ["href"]],
  ["object", ["data"]],
  ["script", ["src"]],
  ["source", ["src", "srcset"]],
  ["track", ["src"]],
  ["video", ["src", "poster"]],
]);

export interface StandaloneValidationIssue {
  code: string;
  message: string;
}

export interface StandaloneValidationResult {
  valid: boolean;
  sizeBytes: number;
  issues: StandaloneValidationIssue[];
}

export function validateStandaloneHtml(
  source: string,
  options: { maxBytes?: number } = {},
): StandaloneValidationResult {
  const issues: StandaloneValidationIssue[] = [];
  const sizeBytes = Buffer.byteLength(source);
  const maxBytes = options.maxBytes ?? 50 * 1024 * 1024;

  if (sizeBytes > maxBytes) {
    issues.push({
      code: "EXPORT_TOO_LARGE",
      message: `Export is ${sizeBytes} bytes; maximum is ${maxBytes}.`,
    });
  }

  const document = parseHtmlDocument(source);
  let runtimeFound = false;
  let cspFound = false;

  walkHtml(document, (node) => {
    if (node.tagName === "script") {
      const sourceReference = getAttribute(node, "src");
      if (sourceReference) {
        issues.push({
          code: "SCRIPT_SOURCE_REMAINS",
          message: `Script source remains: ${sourceReference}`,
        });
      }

      if (
        textContent(node).includes(
          'document.documentElement.dataset.mydashStandalone = "true"',
        )
      ) {
        runtimeFound = true;
      }
    }

    if (node.tagName === "meta") {
      const equivalent = getAttribute(node, "http-equiv");
      if (equivalent?.toLowerCase() === "content-security-policy") {
        cspFound = true;
      }
    }

    if (node.tagName === "style") {
      validateCss(textContent(node), issues);
    }

    const attributes = RESOURCE_ATTRIBUTES.get(node.tagName ?? "") ?? [];

    for (const attribute of attributes) {
      const value = getAttribute(node, attribute);
      if (!value) continue;

      if (
        node.tagName === "link" &&
        attribute === "href" &&
        !isResourceLink(node)
      ) {
        continue;
      }

      if (attribute === "srcset") {
        for (const candidate of parseSrcset(value)) {
          if (!isInlineSafeReference(candidate)) {
            issues.push({
              code: "RESOURCE_REFERENCE_REMAINS",
              message: `${node.tagName}[${attribute}] still references ${candidate}.`,
            });
          }
        }
      } else if (!isInlineSafeReference(value)) {
        issues.push({
          code: "RESOURCE_REFERENCE_REMAINS",
          message: `${node.tagName}[${attribute}] still references ${value}.`,
        });
      }
    }
  });

  if (!runtimeFound) {
    issues.push({
      code: "STANDALONE_RUNTIME_MISSING",
      message: "The standalone embedded-resource runtime is missing.",
    });
  }

  if (!cspFound) {
    issues.push({
      code: "EXPORT_CSP_MISSING",
      message: "The standalone Content Security Policy is missing.",
    });
  }

  return {
    valid: issues.length === 0,
    sizeBytes,
    issues,
  };
}

function validateCss(
  source: string,
  issues: StandaloneValidationIssue[],
): void {
  if (/@import\s/i.test(source)) {
    issues.push({
      code: "CSS_IMPORT_REMAINS",
      message: "An unresolved CSS @import remains.",
    });
  }

  const pattern =
    /url\(\s*(?:"([^"]+)"|'([^']+)'|([^)"']+))\s*\)/gi;

  for (const match of source.matchAll(pattern)) {
    const reference = (
      match[1] ??
      match[2] ??
      match[3] ??
      ""
    ).trim();

    if (!isInlineSafeReference(reference)) {
      issues.push({
        code: "CSS_RESOURCE_REMAINS",
        message: `CSS still references ${reference}.`,
      });
    }
  }
}

function isResourceLink(node: { attrs?: { name: string; value: string }[] }): boolean {
  const relation = (
    node.attrs?.find((attribute) => attribute.name === "rel")?.value ?? ""
  ).toLowerCase();

  return [
    "stylesheet",
    "icon",
    "shortcut icon",
    "apple-touch-icon",
    "manifest",
    "preload",
    "modulepreload",
    "prefetch",
  ].some((value) => relation.includes(value));
}

function parseSrcset(value: string): string[] {
  return value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/, 1)[0])
    .filter((value): value is string => Boolean(value));
}