import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildEntry,
  diffCharacters,
  generateWhatsNewEntry,
  hasEntryFor,
  insertEntry,
  parseSeedCharacters,
  renderEntry,
} from './generate-whats-new-entry.mjs';
import { inspectWhatsNew } from './check-whats-new.mjs';

const HEADER = `export interface WhatsNewBullet {
  en: string;
  el: string;
}

export interface WhatsNewEntry {
  version: string;
  date: string;
  userVisible: boolean;
  headline: WhatsNewBullet;
  summaryEn: string;
  summaryEl: string;
  added: WhatsNewBullet[];
  improved: WhatsNewBullet[];
  fixed: WhatsNewBullet[];
}

export const WHATS_NEW_ENTRIES: readonly WhatsNewEntry[] = [
  {
    version: '0.1.0',
    date: '2026-01-01',
    userVisible: false,
    headline: {
      en: 'The first one',
      el: 'Η πρώτη',
    },
    summaryEn: 'Nothing to see.',
    summaryEl: 'Τίποτα να δεις.',
    added: [],
    improved: [],
    fixed: [],
  },
];
`;

/** Shaped exactly like public/assets/data/optc-seed.sql, one scalar per line. */
function seedSql(characters: Array<Record<string, unknown>>) {
  return characters
    .map((character) => {
      const sql = (value: unknown) =>
        value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/gu, "''")}'`;

      return `
      INSERT INTO characters (
        id, name, is_incomplete, type, primary_class, secondary_class, classes_json, stars, stars_label, cost, combo,
        min_hp, min_atk, min_rcv, max_hp, max_atk, max_rcv, growth,
        captain_hp_boost, captain_atk_boost, captain_average_boost, region_json,
        assets_json, search_text
      ) VALUES (
        ${character.id},
        ${sql(character.name)},
        0,
        ${sql(character.type ?? null)},
        ${sql(character.primaryClass ?? null)},
        ${sql(character.secondaryClass ?? null)},
        '[]',
        ${character.stars ?? 'NULL'},
        '6',
        55,
        4
      );
`;
    })
    .join('\n');
}

const created: string[] = [];

function makeRepo({
  version = '0.1.0',
  previousCharacters,
  nextCharacters,
}: {
  version?: string;
  previousCharacters?: Array<Record<string, unknown>> | null;
  nextCharacters?: Array<Record<string, unknown>>;
}) {
  const root = mkdtempSync(path.join(tmpdir(), 'whats-new-gen-'));
  created.push(root);

  mkdirSync(path.join(root, 'src/app/core/data'), { recursive: true });
  mkdirSync(path.join(root, 'public/assets/data'), { recursive: true });
  writeFileSync(path.join(root, 'src/app/core/data/whats-new.data.ts'), HEADER, 'utf8');
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version }), 'utf8');

  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });

  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');

  if (previousCharacters !== null) {
    writeFileSync(
      path.join(root, 'public/assets/data/optc-seed.sql'),
      seedSql(previousCharacters ?? []),
      'utf8',
    );
  }

  git('add', '-A');
  git('commit', '-q', '-m', 'baseline');

  if (nextCharacters) {
    writeFileSync(
      path.join(root, 'public/assets/data/optc-seed.sql'),
      seedSql(nextCharacters),
      'utf8',
    );
  }

  return root;
}

function readData(root: string) {
  return readFileSync(path.join(root, 'src/app/core/data/whats-new.data.ts'), 'utf8');
}

afterEach(() => {
  while (created.length) {
    rmSync(created.pop() as string, { recursive: true, force: true });
  }
});

describe('generate-whats-new-entry', () => {
  it('names the characters an automated data release brought in', () => {
    const root = makeRepo({
      previousCharacters: [{ id: 1, name: 'Luffy' }],
      nextCharacters: [
        { id: 1, name: 'Luffy' },
        {
          id: 4640,
          name: 'Devil Oars',
          type: 'INT',
          primaryClass: 'Powerhouse',
          secondaryClass: 'Striker',
          stars: 6,
        },
      ],
    });

    const result = generateWhatsNewEntry({ appRoot: root, version: '0.2.0', date: '2026-09-04' });

    expect(result.written).toBe(true);
    expect(result.added).toEqual(['Devil Oars']);

    const data = readData(root);

    expect(data).toContain("version: '0.2.0'");
    expect(data).toContain('Devil Oars');
    expect(data).toContain('userVisible: true');
    // Newest first: the generated entry must precede the pre-existing one.
    expect(data.indexOf("version: '0.2.0'")).toBeLessThan(data.indexOf("version: '0.1.0'"));
  });

  /*
   * The whole point: a human who wrote a proper release note always wins. The
   * generator is the fallback for the nightly chain, never an overwrite.
   */
  it('leaves a version that already has an entry completely alone', () => {
    const root = makeRepo({ previousCharacters: [], nextCharacters: [{ id: 9, name: 'New' }] });
    const before = readData(root);

    const result = generateWhatsNewEntry({ appRoot: root, version: '0.1.0', date: '2026-09-04' });

    expect(result.written).toBe(false);
    expect(result.reason).toBe('already-described');
    expect(readData(root)).toBe(before);
  });

  it('writes a quiet entry when the data changed but no character appeared', () => {
    const root = makeRepo({
      previousCharacters: [{ id: 1, name: 'Luffy' }],
      nextCharacters: [{ id: 1, name: 'Luffy' }],
    });

    const result = generateWhatsNewEntry({ appRoot: root, version: '0.2.0', date: '2026-09-04' });

    expect(result.written).toBe(true);
    expect(result.userVisible).toBe(false);
    expect(readData(root)).toContain('userVisible: false');
  });

  /*
   * No committed baseline means we cannot tell a new character from an existing
   * one. Announcing the entire roster as new would be worse than saying nothing,
   * and failing the release would be worse still.
   */
  it('stays quiet rather than announcing the whole roster when there is no baseline', () => {
    const root = makeRepo({
      previousCharacters: null,
      nextCharacters: [
        { id: 1, name: 'Luffy' },
        { id: 2, name: 'Zoro' },
      ],
    });

    const result = generateWhatsNewEntry({ appRoot: root, version: '0.2.0', date: '2026-09-04' });

    expect(result.written).toBe(true);
    expect(result.reason).toBe('no-baseline');
    expect(result.added).toEqual([]);
    expect(readData(root)).not.toContain('Zoro');
  });

  it('caps how many characters it names and counts the rest', () => {
    const many = Array.from({ length: 9 }, (_value, index) => ({
      id: 100 + index,
      name: `Char ${index}`,
    }));
    const root = makeRepo({ previousCharacters: [], nextCharacters: many });

    generateWhatsNewEntry({ appRoot: root, version: '0.2.0', date: '2026-09-04' });

    const data = readData(root);

    expect(data).toContain('9 new characters join the roster');
    expect(data).toContain('They are already everywhere');
    expect(data).toContain('Βρίσκονται ήδη παντού');
    expect(data).toContain('and 3 more');
    expect(data).toContain('Char 5');
    expect(data).not.toContain('Char 6');
  });

  /*
   * The generated entry has to satisfy the very checker whose failure it exists
   * to prevent - including the quiet-release and visible-release bullet rules.
   */
  it('produces entries that pass check-whats-new for both shapes', () => {
    for (const characters of [[{ id: 7, name: 'Solo', type: 'QCK', stars: 5 }], []]) {
      const root = makeRepo({
        version: '0.2.0',
        previousCharacters: [],
        nextCharacters: characters,
      });

      generateWhatsNewEntry({ appRoot: root, version: '0.2.0', date: '2026-09-04' });

      const result = inspectWhatsNew({ appRoot: root });

      expect(result.findings).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });

  it('escapes a name that would otherwise break the generated TypeScript', () => {
    const root = makeRepo({
      previousCharacters: [],
      nextCharacters: [{ id: 5, name: "O'Hara's Scholar" }],
    });

    generateWhatsNewEntry({ appRoot: root, version: '0.2.0', date: '2026-09-04' });

    const result = inspectWhatsNew({ appRoot: root });

    expect(result.findings).toEqual([]);
    expect(readData(root)).toContain("O\\'Hara\\'s Scholar");
  });

  /*
   * The generator's only notion of "what changed" is the character roster, so on
   * a code release it would publish "nothing changed on any screen" in both
   * languages - and turn the loud red lane that catches a forgotten entry into a
   * green one telling players a falsehood. The nightly chain releases off an
   * unchanged main; anything with commits behind it is somebody shipping code.
   */
  it('refuses to write for a release that follows commits', () => {
    const root = makeRepo({ previousCharacters: [], nextCharacters: [{ id: 5, name: 'Solo' }] });
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });

    git('tag', 'v0.1.0');
    writeFileSync(path.join(root, 'CODE.md'), 'a code change', 'utf8');
    git('add', '-A');
    git('commit', '-q', '-m', 'feat: something a player would notice');

    const result = generateWhatsNewEntry({
      appRoot: root,
      version: '0.2.0',
      date: '2026-09-04',
      previousTag: 'v0.1.0',
    });

    expect(result.written).toBe(false);
    expect(result.reason).toBe('code-release');
    expect(result.commitsSince).toBe(1);
    expect(readData(root)).not.toContain("version: '0.2.0'");
  });

  it('still writes when the release follows no commits at all', () => {
    const root = makeRepo({
      previousCharacters: [{ id: 1, name: 'Luffy' }],
      nextCharacters: [
        { id: 1, name: 'Luffy' },
        { id: 2, name: 'Newcomer' },
      ],
    });

    execFileSync('git', ['tag', 'v0.1.0'], { cwd: root, stdio: 'ignore' });

    const result = generateWhatsNewEntry({
      appRoot: root,
      version: '0.2.0',
      date: '2026-09-04',
      previousTag: 'v0.1.0',
    });

    expect(result.written).toBe(true);
    expect(result.added).toEqual(['Newcomer']);
  });

  it('writes when no previous tag is known rather than refusing', () => {
    const root = makeRepo({ previousCharacters: [], nextCharacters: [{ id: 5, name: 'Solo' }] });

    const result = generateWhatsNewEntry({
      appRoot: root,
      version: '0.2.0',
      date: '2026-09-04',
      previousTag: '',
    });

    expect(result.written).toBe(true);
  });

  /*
   * release-and-tag.sh runs under `set -euo pipefail`. An unguarded generator
   * that threw would abort an otherwise-good release, unattended, mid-bump.
   */
  it('is invoked non-fatally from the release script', () => {
    // Anchored to this spec, not to cwd: the scripts specs run under a vitest
    // config whose root is not the app root.
    const script = readFileSync(
      fileURLToPath(new URL('./release-and-tag.sh', import.meta.url)),
      'utf8',
    ).replace(/\r\n/g, '\n');

    expect(script).toContain('if ! node "${PROJECT_ROOT}/scripts/generate-whats-new-entry.mjs"');
    expect(script).toContain('--previous-tag "${PREVIOUS_TAG}"');
    expect(script).toContain("WARNING: could not write a What's New entry");
  });

  it('rejects a version that is not X.Y.Z', () => {
    const root = makeRepo({ previousCharacters: [], nextCharacters: [] });

    expect(() =>
      generateWhatsNewEntry({ appRoot: root, version: 'latest', date: '2026-09-04' }),
    ).toThrow(/--version must be X\.Y\.Z/u);
  });

  describe('units', () => {
    it('diffs by id and counts removals without announcing them', () => {
      const diff = diffCharacters(
        [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' },
        ],
        [
          { id: 1, name: 'A' },
          { id: 3, name: 'C' },
        ],
      );

      expect(diff.added.map((c: { name: string }) => c.name)).toEqual(['C']);
      expect(diff.removedCount).toBe(1);
    });

    it('renders a single-character headline in both languages', () => {
      const entry = buildEntry({
        version: '1.0.0',
        date: '2026-09-04',
        added: [{ id: 1, name: 'Solo', type: 'STR', primaryClass: 'Fighter', stars: 6 }],
      });

      expect(entry.headline.en).toBe('Solo joins the roster');
      // Singular subject, singular verb - in both languages.
      expect(entry.summaryEn).toContain('It is already everywhere');
      expect(entry.summaryEl).toContain('Βρίσκεται ήδη παντού');
      expect(entry.headline.el).toContain('Solo');
      expect(entry.added).toHaveLength(1);
      expect(entry.added[0].en).toContain('6-star STR Fighter');
    });

    it('parses the seed shape, including a doubled-quote name and NULL columns', () => {
      const parsed = parseSeedCharacters(
        seedSql([
          {
            id: 1,
            name: "Laboon - (Luffy's drawing)",
            type: 'STR',
            primaryClass: 'Fighter',
            stars: 2,
          },
          { id: 2, name: 'No Second Class', type: 'INT', primaryClass: 'Striker', stars: 6 },
        ]),
      );

      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe("Laboon - (Luffy's drawing)");
      expect(parsed[0].secondaryClass).toBeNull();
      expect(parsed[1].stars).toBe(6);
    });

    it('detects an existing entry only for the exact version', () => {
      expect(hasEntryFor("version: '0.2.10',", '0.2.10')).toBe(true);
      expect(hasEntryFor("version: '0.2.10',", '0.2.1')).toBe(false);
    });

    it('inserts at the top and refuses a file with no anchor', () => {
      expect(insertEntry(HEADER, '  { placeholder: true },\n')).toContain(
        'WhatsNewEntry[] = [\n  { placeholder: true },',
      );
      expect(() => insertEntry('nothing here', 'x')).toThrow(/anchor/u);
    });

    it('renders a bullet-free quiet entry as empty arrays', () => {
      const rendered = renderEntry(buildEntry({ version: '1.0.0', date: '2026-09-04', added: [] }));

      expect(rendered).toContain('added: [],');
      expect(rendered).toContain('improved: [],');
      expect(rendered).toContain('fixed: [],');
    });
  });
});
