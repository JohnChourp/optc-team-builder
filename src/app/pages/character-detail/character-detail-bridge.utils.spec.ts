import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { type CharacterDetailRecord } from '../../core/models/optc.models';
import { hasCaptainAbility, resolveCharacterBridge } from './character-detail-bridge.utils';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

function character(
  id: number,
  captainAbility: string | null,
  rumbleData: CharacterDetailRecord['detail']['rumbleData'],
): Pick<CharacterDetailRecord, 'id' | 'detail'> {
  return { id, detail: { captainAbility, rumbleData } as CharacterDetailRecord['detail'] };
}

const rumbleStats = { stats: { rumbleType: 'BAL', def: 50, spd: 100 } } as unknown as CharacterDetailRecord['detail']['rumbleData'];

/*
 * 869f13c5c. One character per shape the dataset holds, measured on 2026-09-19 over 4,622:
 * a Captain Ability and Rumble data (4,238, e.g. #2), a Captain Ability only (20, e.g. #3134),
 * Rumble data only (362, e.g. #1) and neither (2, e.g. #4645).
 */
describe('character page bridge, one per shape', () => {
  it.each([
    ['Captain Ability and Rumble data', character(2, 'Boosts ATK of Fighter characters by 1.2x', rumbleStats)],
    ['Captain Ability only', character(3134, 'Boosts HP of all characters by 1.2x', null)],
  ])('%s: See who this Captain boosts, into Captain Coverage with itself as Captain', (_shape, record) => {
    expect(resolveCharacterBridge(record)).toEqual({
      kind: 'captain-coverage',
      route: '/tabs/captain-coverage',
      queryParams: { captain: record.id },
      labelKey: 'hero.seeCaptainBoosts',
    });
  });

  it.each([
    ['Rumble data only', character(1, null, rumbleStats)],
    ['neither', character(4645, null, null)],
    ['a Captain Ability that is only whitespace', character(47, '   ', rumbleStats)],
  ])('%s: Open Auto Team Builder, which takes no character', (_shape, record) => {
    expect(resolveCharacterBridge(record)).toEqual({
      kind: 'auto-team-builder',
      route: '/tabs/auto-team-builder',
      queryParams: null,
      labelKey: 'hero.openTeamBuilder',
    });
  });

  it('uses the rule Captain Coverage lists its Captains by, so every bridge is accepted there', () => {
    const coverage = read('src/app/pages/captain-coverage/captain-coverage.page.ts');

    expect(coverage).toContain("typeof record.detail.captainAbility === 'string' &&");
    expect(coverage).toContain('record.detail.captainAbility.trim().length > 0');
    expect(coverage).toContain('this.allCaptains().find((record) => record.id === captainId)');
    expect(hasCaptainAbility(character(2, ' x ', null))).toBe(true);
  });
});

describe('character page hero actions', () => {
  const template = read('src/app/pages/character-detail/character-detail.page.html');

  it('renders the bridge as the one solid button', () => {
    expect(template.match(/fill="solid"/gu)).toHaveLength(1);
    expect(template).toMatch(/fill="solid"\s+color="warning"\s+data-test="character-bridge"/u);
    expect(template).toContain('[queryParams]="bridgeAction.queryParams"');
  });

  it('keeps favourite as an outline, after the bridge', () => {
    const bridgeAt = template.indexOf('data-test="character-bridge"');
    const favouriteAt = template.indexOf('(click)="toggleFavorite(current.id)"');

    expect(bridgeAt).toBeGreaterThan(-1);
    expect(favouriteAt).toBeGreaterThan(bridgeAt);
    expect(template).toContain('<ion-button fill="outline" color="light" (click)="toggleFavorite(current.id)">');
  });

  it('keeps the local-edit tools behind a toggle, but never hides Reset from a reader with changes', () => {
    expect(template).toContain('@if (localToolsOpen() || hasLocalOverride())');
    expect(template).toContain('@if (!hasLocalOverride())');
    // A native button: ion-button copies aria-* into its shadow once, and aria-expanded went stale.
    expect(template).toMatch(
      /<button\s+type="button"\s+class="section-details-toggle"\s+aria-controls="character-local-tools"\s+\[attr\.aria-expanded\]="localToolsOpen\(\) \? 'true' : 'false'"/u,
    );
    expect(template).toContain('id="character-local-tools"');
    expect(template.indexOf('(click)="resetLocalChanges(current.id)"')).toBeGreaterThan(
      template.indexOf('@if (localToolsOpen() || hasLocalOverride())'),
    );
  });

  it('labels both new actions in English and Greek', () => {
    for (const locale of ['en', 'el']) {
      const hero = JSON.parse(read(`public/i18n/character-detail/${locale}.json`)).hero;

      expect(hero.seeCaptainBoosts, `${locale} seeCaptainBoosts`).toMatch(/Captain/u);
      expect(hero.localTools, `${locale} localTools`).toBeTruthy();
    }
  });
});
