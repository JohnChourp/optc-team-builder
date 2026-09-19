import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const projectRoot = path.resolve(import.meta.dirname, '..');
const siteBaseUrl = 'https://optcteambuilder.com';

/*
 * 869f13c5c. One generated character page per shape the dataset holds, measured on 2026-09-19 over
 * 4,622 characters: a Captain Ability and Rumble data (4,238, e.g. #2), a Captain Ability only (20,
 * e.g. #3134), Rumble data only (362, e.g. #1) and neither (2, e.g. #4645). The generator runs for
 * real, over a four-character seed in the format `optc-seed.sql` uses, and the audit that runs in
 * `build:pages` then checks the same output.
 */
const shapes = [
  {
    id: 2,
    name: 'Fixture Captain with Rumble',
    captainAbility: 'Boosts ATK of Fighter characters by 1.2x',
    rumbleData: { stats: { rumbleType: 'BAL', def: 50, spd: 100 } },
  },
  { id: 3134, name: 'Fixture Captain without Rumble', captainAbility: 'Boosts HP of all characters by 1.2x', rumbleData: null },
  {
    id: 1,
    name: 'Fixture Rumble only',
    captainAbility: null,
    // The structured shape 1,289 characters carry: effects in arrays, and a cooldown beside them.
    rumbleData: {
      ability: [{ effects: [{ attributes: ['SPD'], effect: 'buff', level: 5 }] }],
      special: [{ cooldown: 23, effects: [{ amount: 5, effect: 'damage', type: 'fixed' }] }],
      stats: { rumbleType: 'ATK', def: 40, spd: 110 },
    },
  },
  { id: 4645, name: 'Fixture with neither', captainAbility: null, rumbleData: null },
] as const;

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildSeed(): string {
  return shapes
    .map((shape) => {
      const detail = {
        characterId: shape.id,
        captainAbility: shape.captainAbility,
        specialName: null,
        specialText: null,
        supportData: [],
        partyConflictKeys: [],
        rumbleData: shape.rumbleData,
      };

      return `INSERT INTO characters (id, name, is_incomplete, type, primary_class, secondary_class, classes_json, stars, cost, assets_json)
VALUES (${shape.id}, ${sqlString(shape.name)}, 0, 'STR', 'Fighter', 'Slasher', ${sqlString('["Fighter","Slasher"]')}, 5, 30, '{}');
INSERT INTO character_details (character_id, detail_json)
VALUES (${shape.id}, ${sqlString(JSON.stringify(detail))});`;
    })
    .join('\n');
}

let outputDir = '';
let auditOutput = '';

beforeAll(async () => {
  outputDir = await mkdtemp(path.join(os.tmpdir(), 'optc-seo-pages-'));
  const seedPath = path.join(outputDir, 'fixture-seed.sql');
  await writeFile(
    path.join(outputDir, 'index.html'),
    '<!doctype html>\n<html lang="en">\n<head>\n  <title>Shell</title>\n</head>\n<body>\n  <app-root></app-root>\n</body>\n</html>\n',
  );
  await writeFile(seedPath, buildSeed());

  const env = { ...process.env, SEO_OUTPUT_DIR: outputDir, SEO_SEED_PATH: seedPath, SEO_SITE_BASE_URL: siteBaseUrl };
  execFileSync(process.execPath, ['scripts/generate-seo-pages.mjs'], { cwd: projectRoot, env, encoding: 'utf8' });
  auditOutput = execFileSync(process.execPath, ['scripts/audit-seo-pages.mjs'], { cwd: projectRoot, env, encoding: 'utf8' });
}, 120_000);

afterAll(async () => {
  if (outputDir) {
    await rm(outputDir, { recursive: true, force: true });
  }
});

async function readCharacterPage(id: number) {
  const html = await readFile(path.join(outputDir, 'characters', String(id), 'index.html'), 'utf8');
  const nav = html.match(/<nav aria-label="OPTC Team Builder character tools">([\s\S]*?)<\/nav>/u)?.[1] ?? '';
  const links = [...nav.matchAll(/<a href="([^"]*)">([^<]*)<\/a>/gu)].map((match) => ({
    href: match[1],
    label: match[2],
  }));

  return { html, links };
}

describe('generated character pages, one per shape', () => {
  it('passes the audit build:pages runs, on all four shapes', () => {
    expect(auditOutput).toContain('checked 24 sitemap URLs');
  });

  it.each([2, 3134])('#%i, with a Captain Ability, leads with Captain Coverage and itself as Captain', async (id) => {
    const { links } = await readCharacterPage(id);

    expect(links[0]).toEqual({
      href: `${siteBaseUrl}/tabs/captain-coverage/?captain=${id}`,
      label: 'See who this Captain boosts',
    });
    expect(links.map((link) => link.label)).toEqual([
      'See who this Captain boosts',
      'Open Auto Team Builder',
      'Browse OPTC characters',
      'Rank Rumble characters',
    ]);
  });

  it.each([1, 4645])('#%i, with no Captain Ability, leads with Auto Team Builder and has no Captain link', async (id) => {
    const { links, html } = await readCharacterPage(id);

    expect(links.map((link) => link.label)).toEqual([
      'Open Auto Team Builder',
      'Browse OPTC characters',
      'Rank Rumble characters',
    ]);
    expect(html).not.toContain('captain-coverage/?captain=');
  });

  it.each(shapes.map((shape) => shape.id))('#%i links no destination twice', async (id) => {
    const { links } = await readCharacterPage(id);

    expect(new Set(links.map((link) => link.href)).size).toBe(links.length);
    expect(links.some((link) => /^Browse (?:STR|Fighter|Slasher) characters$/u.test(link.label))).toBe(false);
  });

  it('labels Rumble stats as stats, and prints no passive it cannot read', async () => {
    const { html: statsOnly } = await readCharacterPage(2);
    const { html: structured } = await readCharacterPage(1);

    expect(statsOnly).toContain('<p>Pirate Rumble stats: Rumble type BAL, DEF 50, SPD 100</p>');
    expect(structured).toContain('<p>Pirate Rumble stats: Rumble type ATK, DEF 40, SPD 110</p>');
    expect(statsOnly).not.toContain('Pirate Rumble passive');
    expect(structured).not.toContain('Pirate Rumble passive');
  });

  it('prints no Rumble special that would only say its cooldown', async () => {
    const { html } = await readCharacterPage(1);

    expect(html).not.toContain('Pirate Rumble special');
    expect(html).not.toContain('Cooldown');
  });

  it.each([3134, 4645])('#%i, with no Rumble data, prints no Rumble line', async (id) => {
    const { html } = await readCharacterPage(id);

    expect(html).not.toContain('Pirate Rumble');
  });
});
