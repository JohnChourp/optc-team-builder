const AUTO_TEAM_BUILDER_TYPES = ['DEX', 'STR', 'QCK', 'PSY', 'INT'];
const AUTO_TEAM_BUILDER_CLASSES = [
  'Booster',
  'Cerebral',
  'Driven',
  'Evolver',
  'Fighter',
  'Free Spirit',
  'Powerhouse',
  'Shooter',
  'Slasher',
  'Striker',
];

const SUPER_CRITERIA_NAME_ALIASES = {
  aokiji: ['kuzan'],
  akainu: ['sakazuki'],
  'big mom': ['charlotte linlin'],
  'blackbeard': ['marshall d teach'],
  'bon clay': ['bentham'],
  corazon: ['donquixote rosinante'],
  'cat viper': ['nekomamushi'],
  dogstorm: ['inuarashi'],
  fujitora: ['issho'],
  'kizaru': ['borsalino'],
  komurasaki: ['kozuki hiyori'],
  'mr 1': ['daz bones'],
  'mr 2 bon clay': ['bentham'],
  'mr 3': ['galdino'],
  'mr 4': ['babe'],
  'mr 5': ['gem'],
  'miss doublefinger': ['zala'],
  'miss goldenweek': ['marianne'],
  'miss merry christmas': ['drophy'],
  'miss valentine': ['mikita'],
  'tenguyama hitetsu': ['kozuki sukiyaki'],
  'whitebeard': ['edward newgate'],
  violet: ['viola'],
  z: ['zephyr'],
};

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeWhitespace(String(value ?? ''))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildAcceptedCharacterKeys(label) {
  const normalizedLabel = normalizeWhitespace(label);
  const acceptedKeys = new Set();
  const labelWithoutBrackets = normalizeWhitespace(normalizedLabel.replace(/^\[([^\]]+)\]/, '$1'));
  const labelWithoutGenericSuffix = normalizeWhitespace(
    labelWithoutBrackets.replace(/\bcharacters?\b$/i, '').replace(/\bunits?\b$/i, ''),
  );
  const normalizedKey = normalizeKey(labelWithoutGenericSuffix);

  if (normalizedKey.length > 0) {
    acceptedKeys.add(normalizedKey);
  }

  const labelWithoutParentheses = normalizeWhitespace(
    labelWithoutGenericSuffix.replace(/\([^)]*\)/g, ' '),
  );
  const labelWithoutParenthesesKey = normalizeKey(labelWithoutParentheses);

  if (labelWithoutParenthesesKey.length > 0) {
    acceptedKeys.add(labelWithoutParenthesesKey);
  }

  const parentheticalValues = [...normalizedLabel.matchAll(/\(([^)]+)\)/g)]
    .map((match) => normalizeKey(match[1]))
    .filter((value) => value.length > 0);

  for (const value of parentheticalValues) {
    acceptedKeys.add(value);
  }

  const baseParts = labelWithoutParentheses
    .split(' ')
    .map((part) => normalizeKey(part))
    .filter((part) => part.length > 0);
  const [lastPart = ''] = baseParts.slice(-1);

  if (baseParts.length >= 2 && lastPart.length > 1) {
    acceptedKeys.add(lastPart);
  }

  for (const key of [...acceptedKeys]) {
    (SUPER_CRITERIA_NAME_ALIASES[key] ?? []).forEach((alias) => acceptedKeys.add(alias));
  }

  return [...acceptedKeys];
}

function splitListTokens(value) {
  return normalizeWhitespace(value)
    .replace(/\.\s*$/g, '')
    .replace(/;\s*or\s+/gi, ', ')
    .split(',')
    .flatMap((entry) => entry.split(/\s+\bor\b\s+|\s+\band\b\s+/gi))
    .map((entry) => normalizeWhitespace(entry.replace(/^or\s+/i, '')))
    .filter((entry) => entry.length > 0);
}

function parseClassOrTypeDescriptor(token) {
  const normalizedToken = normalizeWhitespace(token)
    .replace(/characters?$/i, '')
    .replace(/units?$/i, '')
    .trim();
  const lowerToken = normalizedToken.toLowerCase();
  const matchedClasses = AUTO_TEAM_BUILDER_CLASSES.filter((characterClass) =>
    lowerToken.includes(characterClass.toLowerCase()),
  );
  const matchedTypes = AUTO_TEAM_BUILDER_TYPES.filter(
    (type) =>
      lowerToken.includes(type.toLowerCase()) || lowerToken.includes(`[${type.toLowerCase()}]`),
  );
  const strippedToken = normalizeKey(
    normalizedToken
      .replace(/\[(str|dex|qck|psy|int)\]/gi, ' ')
      .replace(/\b(str|dex|qck|psy|int)\b/gi, ' ')
      .replace(
        /\b(booster|cerebral|driven|evolver|fighter|free spirit|powerhouse|shooter|slasher|striker)\b/gi,
        ' ',
      )
      .replace(/\bcharacters?\b/gi, ' ')
      .replace(/\bunits?\b/gi, ' ')
      .replace(/\bor\b/gi, ' ')
      .replace(/\band\b/gi, ' '),
  );

  if (!matchedClasses.length && !matchedTypes.length) {
    return null;
  }

  return strippedToken.length === 0
    ? {
        classes: matchedClasses,
        types: matchedTypes,
      }
    : null;
}

function parseFollowingBranch(text, fullMatch, rawCount, rawList) {
  const requiredCount = Number(rawCount);
  const tokens = splitListTokens(rawList);

  if (!Number.isInteger(requiredCount) || requiredCount <= 0 || tokens.length === 0) {
    return null;
  }

  const classOrTypeDescriptors = tokens.map((token) => parseClassOrTypeDescriptor(token));
  const isClassOrTypeOnly = classOrTypeDescriptors.every((descriptor) => descriptor !== null);

  if (isClassOrTypeOnly) {
    const allowedClasses = [
      ...new Set(classOrTypeDescriptors.flatMap((descriptor) => descriptor.classes)),
    ];
    const allowedTypes = [
      ...new Set(classOrTypeDescriptors.flatMap((descriptor) => descriptor.types)),
    ];

    return {
      matchedText: fullMatch,
      branch: {
        branchType: 'class_or_type_count_any',
        requiredCount,
        allowedClasses,
        allowedTypes,
      },
    };
  }

  if (tokens.some((token) => parseClassOrTypeDescriptor(token))) {
    return null;
  }

  return {
    matchedText: fullMatch,
    branch: {
      branchType: 'character_count_any',
      requiredCount,
      matchMode: tokens.every((token) => /^\s*\[[^\]]+\]/.test(token))
        ? 'any_candidate'
        : 'unique_options',
      options: tokens.map((token) => ({
        label: token,
        acceptedKeys: buildAcceptedCharacterKeys(token),
      })),
    },
  };
}

function parseCrewConsistCountBranch(text, fullMatch, rawCount, rawDescriptor) {
  const requiredCount = Number(rawCount);
  const descriptor = parseClassOrTypeDescriptor(rawDescriptor);

  if (!Number.isInteger(requiredCount) || requiredCount <= 0 || !descriptor) {
    return null;
  }

  return {
    matchedText: fullMatch,
    branch: {
      branchType: 'class_or_type_count_any',
      requiredCount,
      allowedClasses: descriptor.classes,
      allowedTypes: descriptor.types,
    },
  };
}

function parseAllOfFollowingBranch(text, fullMatch, rawList) {
  const descriptors = splitListTokens(rawList).map((token) => parseClassOrTypeDescriptor(token));

  if (!descriptors.length || descriptors.some((descriptor) => descriptor === null)) {
    return null;
  }

  return {
    matchedText: fullMatch,
    branch: {
      branchType: 'class_or_type_presence_all',
      requiredClasses: [...new Set(descriptors.flatMap((descriptor) => descriptor.classes))],
      requiredTypes: [...new Set(descriptors.flatMap((descriptor) => descriptor.types))],
    },
  };
}

function stripMatchedText(sourceText, matchedTexts) {
  return matchedTexts.reduce((currentText, matchedText) => currentText.replace(matchedText, ' '), sourceText);
}

function normalizeRemainder(value) {
  return normalizeWhitespace(
    value
      .replace(/this character must be captain/gi, ' ')
      .replace(/when this character is in combined form from super swap effect/gi, ' ')
      .replace(/\bcan be launched as crewmate\b/gi, ' ')
      .replace(/at the final stage/gi, ' ')
      .replace(/\b(?:not\s+including|excluding)\s+self\b/gi, ' ')
      .replace(/\b(your crew|the crew|your team|team)\b/gi, ' ')
      .replace(/\bmust\b/gi, ' ')
      .replace(/\bconsist\b/gi, ' ')
      .replace(/\bof\b/gi, ' ')
      .replace(/\bany\b/gi, ' ')
      .replace(/\ball\b/gi, ' ')
      .replace(/\bthe following\b/gi, ' ')
      .replace(/\bexcluding supports?\b/gi, ' ')
      .replace(/\bcounting only 1 per unit\b/gi, ' ')
      .replace(/\bcharacters?\b/gi, ' ')
      .replace(/\bunits?\b/gi, ' ')
      .replace(/\bor\b/gi, ' ')
      .replace(/\band\b/gi, ' ')
      .replace(/[:.,;]/g, ' '),
  );
}

export function parseSuperSpecialCriteria(rawText) {
  const text = normalizeWhitespace(rawText);

  if (!text.length) {
    return null;
  }

  const matches = [];
  const excludesSelf = /\b(?:not\s+including|excluding)\s+self\b/i.test(text);
  const followingPatterns = [
    /(?:your crew|the crew)\s+must\s+consist\s+of\s+any\s+(\d+)(?:\s+or\s+\d+)?\s+of\s+the\s+following,[^:]*:\s*(.+)$/i,
    /when\s+any\s+of\s+the\s+following\s+characters\s+are\s+on\s+the\s+crew[^:]*:\s*(.+)$/i,
    /when\s+any\s+(\d+)\s+(.+?)\s+characters?\s+are\s+on\s+the\s+crew\b[^.]*\.?$/i,
  ];

  for (const pattern of followingPatterns) {
    const matched = text.match(pattern);

    if (!matched) {
      continue;
    }

    const parsed =
      matched.length >= 3
        ? parseFollowingBranch(text, matched[0], matched[1], matched[2])
        : parseFollowingBranch(text, matched[0], '1', matched[1]);

    if (parsed) {
      matches.push(parsed);
    }
  }

  const crewConsistMatch = text.match(
    /the\s+crew\s+must\s+consist\s+of\s+(\d+)\s+([^.;]+?)\s+characters\b/i,
  );

  if (crewConsistMatch) {
    const parsed = parseCrewConsistCountBranch(
      text,
      crewConsistMatch[0],
      crewConsistMatch[1],
      crewConsistMatch[2],
    );

    if (parsed) {
      matches.push(parsed);
    }
  }

  const allOfFollowingMatch = text.match(
    /your\s+crew\s+must\s+consist\s+of\s+all\s+of\s+the\s+following,[^:]*:\s*(.+)$/i,
  );

  if (allOfFollowingMatch) {
    const parsed = parseAllOfFollowingBranch(text, allOfFollowingMatch[0], allOfFollowingMatch[1]);

    if (parsed) {
      matches.push(parsed);
    }
  }

  const matchedTexts = [...new Set(matches.map((match) => match.matchedText))];
  const strippedText = normalizeRemainder(stripMatchedText(text, matchedTexts));
  const rosterBranches = matches.map((match) => match.branch);
  const hasNonRosterBranches = strippedText.length > 0;
  const parserStatus =
    rosterBranches.length === 0
      ? hasNonRosterBranches
        ? 'non_roster_only'
        : 'unsupported'
      : hasNonRosterBranches
        ? 'mixed'
        : 'roster_only';

  return {
    rawText: text,
    requiresCaptain: /must be captain/i.test(text),
    excludesSelf,
    rosterBranches,
    hasNonRosterBranches,
    parserStatus,
  };
}
