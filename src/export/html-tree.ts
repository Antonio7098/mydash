import { parse, parseFragment, serialize } from "parse5";

export function parseHtmlDocument(source: string): unknown {
  return parse(String(source), {
    sourceCodeLocationInfo: false,
  });
}

export function serialiseHtml(node: unknown): string {
  return serialize(node as never);
}

export function walkHtml(node: unknown, visitor: (node: HtmlNode) => void): void {
  visitor(node as HtmlNode);

  for (const child of [...((node as { childNodes?: HtmlNode[] }).childNodes ?? [])]) {
    walkHtml(child, visitor);
  }

  const content = (node as { content?: HtmlNode }).content;
  if (content) {
    walkHtml(content, visitor);
  }
}

export function findElement(root: unknown, tagName: string): HtmlNode | null {
  let match: HtmlNode | null = null;

  walkHtml(root, (node) => {
    if (!match && node.tagName === tagName) {
      match = node;
    }
  });

  return match;
}

export function elementsByTag(root: unknown, tagName: string): HtmlNode[] {
  const matches: HtmlNode[] = [];

  walkHtml(root, (node) => {
    if (node.tagName === tagName) matches.push(node);
  });

  return matches;
}

export function getAttribute(node: HtmlNode, name: string): string | undefined {
  return node.attrs?.find((attribute) => attribute.name === name)?.value;
}

export function hasAttribute(node: HtmlNode, name: string): boolean {
  return node.attrs?.some((attribute) => attribute.name === name) ?? false;
}

export function setAttribute(node: HtmlNode, name: string, value: string): void {
  node.attrs ??= [];
  const existing = node.attrs.find(
    (attribute) => attribute.name === name,
  );

  if (existing) {
    existing.value = String(value);
  } else {
    node.attrs.push({
      name,
      value: String(value),
    });
  }
}

export function removeAttribute(node: HtmlNode, name: string): void {
  if (!node.attrs) return;
  node.attrs = node.attrs.filter(
    (attribute) => attribute.name !== name,
  );
}

export function textContent(node: HtmlNode): string {
  return (node.childNodes ?? [])
    .map((child) =>
      child.nodeName === "#text"
        ? child.value
        : textContent(child),
    )
    .join("");
}

export function setTextContent(node: HtmlNode, value: string): void {
  node.childNodes = [
    {
      nodeName: "#text",
      value: String(value),
      parentNode: node,
    },
  ];
}

export function createNodes(html: string): HtmlNode[] {
  const fragment = parseFragment(html);
  return fragment.childNodes as HtmlNode[];
}

export function appendNodes(target: HtmlNode, nodes: HtmlNode[]): void {
  target.childNodes ??= [];
  for (const node of nodes) {
    target.childNodes.push(node);
  }
}

export function prependNodes(target: HtmlNode, nodes: HtmlNode[]): void {
  target.childNodes ??= [];
  target.childNodes = [...nodes, ...target.childNodes];
}

export function removeNode(node: HtmlNode): void {
  if (node.parentNode) {
    const index = node.parentNode.childNodes?.indexOf(node) ?? -1;
    if (index >= 0) {
      node.parentNode.childNodes?.splice(index, 1);
    }
  }
}

export function replaceNode(node: HtmlNode, replacement: HtmlNode[]): void {
  if (!node.parentNode) return;
  const index = node.parentNode.childNodes?.indexOf(node) ?? -1;
  if (index < 0) return;
  node.parentNode.childNodes?.splice(index, 1, ...replacement);
}

export interface HtmlAttribute {
  name: string;
  value: string;
}

export interface HtmlNode {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: HtmlAttribute[];
  childNodes?: HtmlNode[];
  parentNode?: HtmlNode;
  content?: HtmlNode;
}