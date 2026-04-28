const skippedElementNames = new Set(['SCRIPT', 'STYLE', 'TEMPLATE']);
const sentenceBreakElementNames = new Set(['P', 'DIV', 'LI', 'UL', 'OL']);
const htmlEntities = {
  amp: '&',
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

export function normalizeHtmlToText(value) {
  return normalizeExtractedText(parseHtmlText(String(value ?? '')));
}

function normalizeExtractedText(value) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/(?:\s*\.\s*){2,}/g, '. ')
    .trim();
}

function parseHtmlText(value) {
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
    const isClosingTag = tagContent.trimStart().startsWith('/');

    if (skippedElementNames.has(tagName) && !isClosingTag) {
      index = findSkippedElementEnd(value, tagName, tagEndIndex + 1);
      continue;
    }

    if (tagName === 'BR') {
      text += '. ';
    } else if (tagName === 'LI' && !isClosingTag) {
      text += ' ';
    } else if (sentenceBreakElementNames.has(tagName) && isClosingTag) {
      text += '. ';
    }

    index = tagEndIndex + 1;
  }

  return decodeHtmlEntitiesOnce(text);
}

function readTagName(tagContent) {
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

function isTagNameCharacter(value) {
  return Boolean(value && /[a-z0-9]/i.test(value));
}

function findSkippedElementEnd(value, tagName, startIndex) {
  const closingTagStart = value.toLowerCase().indexOf(`</${tagName.toLowerCase()}`, startIndex);

  if (closingTagStart === -1) {
    return value.length;
  }

  const closingTagEnd = value.indexOf('>', closingTagStart + 2);

  return closingTagEnd === -1 ? value.length : closingTagEnd + 1;
}

function decodeHtmlEntitiesOnce(value) {
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z][\da-z]+));/gi, (
    match,
    decimalValue,
    hexValue,
    entityName,
  ) => {
    const codePoint = decimalValue
      ? Number(decimalValue)
      : hexValue
        ? Number.parseInt(hexValue, 16)
        : null;

    if (codePoint !== null) {
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return entityName ? (htmlEntities[entityName.toLowerCase()] ?? match) : match;
  });
}
