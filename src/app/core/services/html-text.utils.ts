const ELEMENT_NODE_TYPE = 1;
const TEXT_NODE_TYPE = 3;
const SKIPPED_ELEMENT_NAMES = new Set(['SCRIPT', 'STYLE', 'TEMPLATE']);
const SENTENCE_BREAK_ELEMENT_NAMES = new Set(['P', 'DIV', 'LI', 'UL', 'OL']);
const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

export function normalizeHtmlToText(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return '';
  }

  const parsedDocument = parseHtmlDocument(value);

  if (!parsedDocument) {
    return normalizeExtractedText(parseHtmlTextWithoutDom(value));
  }

  const parts: string[] = [];
  appendNodeText(parsedDocument.body, parts);

  return normalizeExtractedText(parts.join(''));
}

function parseHtmlDocument(value: string): Document | null {
  if (typeof DOMParser === 'undefined') {
    return null;
  }

  return new DOMParser().parseFromString(value, 'text/html');
}

function appendNodeText(node: Node, parts: string[]): void {
  if (node.nodeType === TEXT_NODE_TYPE) {
    parts.push(node.textContent ?? '');
    return;
  }

  if (node.nodeType !== ELEMENT_NODE_TYPE) {
    return;
  }

  const elementName = node.nodeName.toUpperCase();

  if (SKIPPED_ELEMENT_NAMES.has(elementName)) {
    return;
  }

  if (elementName === 'BR') {
    parts.push('. ');
    return;
  }

  if (elementName === 'LI') {
    parts.push(' ');
  }

  node.childNodes.forEach((childNode) => appendNodeText(childNode, parts));

  if (SENTENCE_BREAK_ELEMENT_NAMES.has(elementName)) {
    parts.push('. ');
  }
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/(?:\s*\.\s*){2,}/g, '. ')
    .trim();
}

function parseHtmlTextWithoutDom(value: string): string {
  let index = 0;
  let text = '';

  while (index < value.length) {
    if (value[index] !== '<') {
      text += value[index];
      index += 1;
      continue;
    }

    const tagEndIndex = value.indexOf('>', index + 1);

    if (tagEndIndex === -1) {
      text += value.slice(index);
      break;
    }

    const tagContent = value.slice(index + 1, tagEndIndex);
    const tagName = readTagName(tagContent);

    if (SKIPPED_ELEMENT_NAMES.has(tagName) && !tagContent.trimStart().startsWith('/')) {
      index = findSkippedElementEnd(value, tagName, tagEndIndex + 1);
      continue;
    }

    if (tagName === 'BR') {
      text += '. ';
    } else if (tagName === 'LI' && !tagContent.trimStart().startsWith('/')) {
      text += ' ';
    } else if (
      SENTENCE_BREAK_ELEMENT_NAMES.has(tagName) &&
      tagContent.trimStart().startsWith('/')
    ) {
      text += '. ';
    }

    index = tagEndIndex + 1;
  }

  return decodeHtmlEntitiesOnce(text);
}

function readTagName(tagContent: string): string {
  const trimmedTag = tagContent.trimStart();
  let index = trimmedTag.startsWith('/') ? 1 : 0;

  while (index < trimmedTag.length && trimmedTag[index] === ' ') {
    index += 1;
  }

  const startIndex = index;

  while (index < trimmedTag.length && isTagNameCharacter(trimmedTag[index])) {
    index += 1;
  }

  return trimmedTag.slice(startIndex, index).toUpperCase();
}

function isTagNameCharacter(value: string | undefined): boolean {
  return Boolean(value && /[a-z0-9]/i.test(value));
}

function findSkippedElementEnd(value: string, tagName: string, startIndex: number): number {
  const closingTagStart = value.toLowerCase().indexOf(`</${tagName.toLowerCase()}`, startIndex);

  if (closingTagStart === -1) {
    return value.length;
  }

  const closingTagEnd = value.indexOf('>', closingTagStart + 2);

  return closingTagEnd === -1 ? value.length : closingTagEnd + 1;
}

function decodeHtmlEntitiesOnce(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z][\da-z]+));/gi,
    (
      match,
      decimalValue: string | undefined,
      hexValue: string | undefined,
      entityName: string | undefined,
    ) => {
      const codePoint = decimalValue
        ? Number(decimalValue)
        : hexValue
          ? Number.parseInt(hexValue, 16)
          : null;

      if (codePoint !== null) {
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }

      return entityName ? (HTML_ENTITIES[entityName.toLowerCase()] ?? match) : match;
    },
  );
}
