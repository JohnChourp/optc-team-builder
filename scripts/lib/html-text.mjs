import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
const htmlParser = new dom.window.DOMParser();
const elementNodeType = 1;
const textNodeType = 3;
const skippedElementNames = new Set(['SCRIPT', 'STYLE', 'TEMPLATE']);
const sentenceBreakElementNames = new Set(['P', 'DIV', 'LI', 'UL', 'OL']);

export function normalizeHtmlToText(value) {
  const document = htmlParser.parseFromString(String(value ?? ''), 'text/html');
  const parts = [];

  appendNodeText(document.body, parts);

  return normalizeExtractedText(parts.join(''));
}

function appendNodeText(node, parts) {
  if (node.nodeType === textNodeType) {
    parts.push(node.textContent ?? '');
    return;
  }

  if (node.nodeType !== elementNodeType) {
    return;
  }

  const elementName = node.nodeName.toUpperCase();

  if (skippedElementNames.has(elementName)) {
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

  if (sentenceBreakElementNames.has(elementName)) {
    parts.push('. ');
  }
}

function normalizeExtractedText(value) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/(?:\s*\.\s*){2,}/g, '. ')
    .trim();
}
