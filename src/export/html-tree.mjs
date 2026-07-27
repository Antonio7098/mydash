import {
  parse,
  parseFragment,
  serialize,
} from "parse5";

export function parseHtmlDocument(source) {
  return parse(String(source), {
    sourceCodeLocationInfo: false,
  });
}

export function serialiseHtml(node) {
  return serialize(node);
}

export function walkHtml(node, visitor) {
  visitor(node);

  for (const child of [...(node.childNodes ?? [])]) {
    walkHtml(child, visitor);
  }

  if (node.content) {
    walkHtml(node.content, visitor);
  }
}

export function findElement(root, tagName) {
  let match = null;

  walkHtml(root, (node) => {
    if (!match && node.tagName === tagName) {
      match = node;
    }
  });

  return match;
}

export function elementsByTag(root, tagName) {
  const matches = [];

  walkHtml(root, (node) => {
    if (node.tagName === tagName) matches.push(node);
  });

  return matches;
}

export function getAttribute(node, name) {
  return node.attrs?.find((attribute) => attribute.name === name)
    ?.value;
}

export function hasAttribute(node, name) {
  return node.attrs?.some((attribute) => attribute.name === name);
}

export function setAttribute(node, name, value) {
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

export function removeAttribute(node, name) {
  if (!node.attrs) return;
  node.attrs = node.attrs.filter(
    (attribute) => attribute.name !== name,
  );
}

export function textContent(node) {
  return (node.childNodes ?? [])
    .map((child) =>
      child.nodeName === "#text"
        ? child.value
        : textContent(child),
    )
    .join("");
}

export function setTextContent(node, value) {
  node.childNodes = [
    {
      nodeName: "#text",
      value: String(value),
      parentNode: node,
    },
  ];
}

export function createNodes(fragment) {
  return parseFragment(String(fragment)).childNodes ?? [];
}

export function prependNodes(parent, nodes) {
  parent.childNodes ??= [];

  for (const node of [...nodes].reverse()) {
    node.parentNode = parent;
    parent.childNodes.unshift(node);
  }
}

export function appendNodes(parent, nodes) {
  parent.childNodes ??= [];

  for (const node of nodes) {
    node.parentNode = parent;
    parent.childNodes.push(node);
  }
}

export function replaceNode(node, replacements) {
  const parent = node.parentNode;
  if (!parent?.childNodes) return;

  const index = parent.childNodes.indexOf(node);
  if (index < 0) return;

  for (const replacement of replacements) {
    replacement.parentNode = parent;
  }

  parent.childNodes.splice(index, 1, ...replacements);
}

export function removeNode(node) {
  replaceNode(node, []);
}
