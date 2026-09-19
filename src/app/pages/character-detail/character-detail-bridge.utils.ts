import { type CharacterDetailRecord } from '../../core/models/optc.models';

/**
 * 869f13c5c. The one primary action on a character page: its bridge into a tool.
 *
 * A character page is where most visitors arrive from a search, asking about one unit. A character
 * with a Captain Ability answers best as "who does this Captain boost", so its bridge opens Captain
 * Coverage with it as Captain (`?captain=<id>`, read by `CaptainCoveragePage.applyCaptainFromRoute`).
 * One without - 364 of 4,622 on 2026-09-19, mostly evolvers and low-rarity units - opens Auto Team
 * Builder, which takes no character yet.
 *
 * The rule is the one Captain Coverage uses to list its Captains, so every bridge it builds is one
 * the handoff accepts. `scripts/generate-seo-pages.mjs` applies the same rule to the crawlable copy.
 */
export interface CharacterBridge {
  readonly kind: 'captain-coverage' | 'auto-team-builder';
  readonly route: string;
  readonly queryParams: Readonly<Record<string, number>> | null;
  /** Key in the `character-detail` scope. */
  readonly labelKey: string;
}

export function hasCaptainAbility(character: Pick<CharacterDetailRecord, 'detail'>): boolean {
  const captainAbility = character.detail?.captainAbility;

  return typeof captainAbility === 'string' && captainAbility.trim().length > 0;
}

export function resolveCharacterBridge(
  character: Pick<CharacterDetailRecord, 'id' | 'detail'>,
): CharacterBridge {
  return hasCaptainAbility(character)
    ? {
        kind: 'captain-coverage',
        route: '/tabs/captain-coverage',
        queryParams: { captain: character.id },
        labelKey: 'hero.seeCaptainBoosts',
      }
    : {
        kind: 'auto-team-builder',
        route: '/tabs/auto-team-builder',
        queryParams: null,
        labelKey: 'hero.openTeamBuilder',
      };
}
