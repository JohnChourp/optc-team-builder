import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { countSavedTeamsWithCharacter } from './character-detail-saved-teams.utils';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

/*
 * 869f13c8r. Character Detail says how many of the reader's saved teams use the character, from their
 * own local data, and says nothing when the answer is none.
 */
describe('countSavedTeamsWithCharacter', () => {
  const team = (...slots: Array<number | null>) => ({ slots });

  it('counts the teams that hold the character', () => {
    expect(
      countSavedTeamsWithCharacter([team(1, 2, 3, 4, 5, 6), team(7, 1, null, null, null, null), team(8, 9)], 1),
    ).toBe(2);
  });

  it('counts a team once when the character is both Captain and Friend Captain', () => {
    expect(countSavedTeamsWithCharacter([team(4000, 4000, 12, null, null, null)], 4000)).toBe(1);
  });

  it('matches no character on an empty seat', () => {
    expect(countSavedTeamsWithCharacter([team(null, null, null, null, null, null)], 0)).toBe(0);
    expect(countSavedTeamsWithCharacter([team(5, null, null, null, null, null)], 6)).toBe(0);
  });

  it('is 0 with no saved teams', () => {
    expect(countSavedTeamsWithCharacter([], 1)).toBe(0);
  });
});

describe('character detail: the saved-team count', () => {
  const template = read('src/app/pages/character-detail/character-detail.page.html');
  const page = read('src/app/pages/character-detail/character-detail.page.ts');

  it('shows the line only when the count is above 0', () => {
    const at = template.indexOf('data-test="character-saved-team-count"');

    expect(at).toBeGreaterThan(-1);
    expect(template.slice(0, at)).toMatch(/@if \(savedTeamCount\(\) > 0\) \{\s*<p[^>]*$/u);
    expect(template.slice(at, template.indexOf('</p>', at))).toContain(
      "t('hero.savedTeamCount', { count: savedTeamCount() })",
    );
  });

  it('counts from the saved teams the page loads, without making the character wait for them', () => {
    expect(page).toContain('countSavedTeamsWithCharacter(this.userState.savedTeams(), currentCharacter.id)');
    expect(page).toContain('void this.userState.readySavedTeams().catch(() => undefined);');
  });

  it.each(['en', 'el'])('has %s copy that carries the count', (language) => {
    const copy = JSON.parse(read(`public/i18n/character-detail/${language}.json`)) as {
      hero: Record<string, string>;
    };

    expect(copy.hero['savedTeamCount']).toMatch(/\{\{count\}\}/u);
  });
});
