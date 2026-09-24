import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  alertCircleOutline,
  checkmarkCircleOutline,
  helpCircleOutline,
  warningOutline,
} from 'ionicons/icons';
import { describe, expect, it, vi } from 'vitest';

import { type CaptainTeamConditionStatus } from '../../core/services/captain-team-condition-status.utils';
import { CaptainTeamConditionStatusComponent } from './captain-team-condition-status.component';

vi.mock('@ionic/angular', () => ({
  IonIcon: class {},
}));

/**
 * 869f1zxuy. Which state a team is in is decided by `resolveCaptainTeamConditionStatus`, which has
 * its own spec. This pins what the badge SHOWS for each state - the icon and the words - and that it
 * shows nothing at all until it is handed a status.
 *
 * No TestBed, like every component spec here (docs/suite-environments.json): the component is built
 * with `new`, and the keys it picks are resolved against the real copy the way the template's `t()`
 * resolves them, so a key with nothing behind it fails here instead of rendering as a raw key.
 */

const template = readFileSync(
  resolve(process.cwd(), 'src/app/shared/captain-team-condition-status/captain-team-condition-status.component.html'),
  'utf8',
);
const copy = {
  en: JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/captain-team-condition-status/en.json'), 'utf8')),
  el: JSON.parse(readFileSync(resolve(process.cwd(), 'public/i18n/captain-team-condition-status/el.json'), 'utf8')),
};

/** What `t(key, params)` shows: the scope's copy for the key, with its `{{params}}` filled in. */
function shown(language: keyof typeof copy, key: string, params: Record<string, number | string> = {}) {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), copy[language]);

  return typeof value === 'string'
    ? value.replace(/\{\{\s*(\w+)\s*\}\}/gu, (placeholder, name: string) => String(params[name] ?? placeholder))
    : undefined;
}

type Leader = CaptainTeamConditionStatus['leaderStatuses'][number];

function leader(role: Leader['role'], label: string, passed: boolean): Leader {
  return {
    role,
    label,
    characterId: role === 'captain' ? 1 : 2,
    characterName: label,
    hasCaptainAbility: true,
    matchesAllSlots: passed,
    matchingSlotCount: passed ? 6 : 3,
    missingSlotLabels: passed ? [] : ['Slot 3'],
    tagConditionsSatisfied: true,
    tagConditionCount: 0,
    passed,
  };
}

function status(state: CaptainTeamConditionStatus['state'], leaders: Leader[], filledSlotCount = 6): CaptainTeamConditionStatus {
  return {
    state,
    expectedSlotCount: 6,
    filledSlotCount,
    isComplete: filledSlotCount === 6,
    leaderStatuses: leaders,
    passedLeaderLabels: leaders.filter((entry) => entry.passed).map((entry) => entry.label),
    failedLeaderLabels: leaders.filter((entry) => !entry.passed).map((entry) => entry.label),
  };
}

const captainPasses = leader('captain', 'Captain', true);
const captainFails = leader('captain', 'Captain', false);
const friendPasses = leader('friendCaptain', 'Friend Captain', true);
const friendFails = leader('friendCaptain', 'Friend Captain', false);

describe('CaptainTeamConditionStatusComponent', () => {
  it.each([
    {
      when: 'the Captain alone passes',
      input: status('full', [captainPasses]),
      icon: checkmarkCircleOutline,
      title: 'Captain condition met',
      detail: 'The Captain fully covers this team.',
    },
    {
      when: 'both leaders pass',
      input: status('full', [captainPasses, friendPasses]),
      icon: checkmarkCircleOutline,
      title: 'Both leaders pass',
      detail: 'Captain and Friend Captain fully cover this team.',
    },
    {
      when: 'only one of two leaders passes',
      input: status('partial', [captainPasses, friendFails]),
      icon: warningOutline,
      title: 'Only one leader passes',
      detail: 'Captain passes. Check Friend Captain before relying on this team.',
    },
    {
      when: 'no leader passes',
      input: status('none', [captainFails]),
      icon: alertCircleOutline,
      title: 'Captain condition not met',
      detail: 'No selected leader fully covers the complete team.',
    },
    {
      when: 'the team is not complete yet',
      input: status('pending', [captainPasses], 4),
      icon: helpCircleOutline,
      title: 'Condition check pending',
      detail: '4 / 6 slots filled. Complete the team to verify captain conditions.',
    },
  ])('shows its icon and words when $when', ({ input, icon, title, detail }) => {
    const component = new CaptainTeamConditionStatusComponent();
    component.status = input;

    expect(component.iconName(input)).toBe(icon);
    expect(shown('en', component.titleKey(input))).toBe(title);
    expect(shown('en', component.detailKey(input), component.detailParams(input))).toBe(detail);

    // The Greek reader gets words too, with every placeholder filled.
    const greek = [shown('el', component.titleKey(input)), shown('el', component.detailKey(input), component.detailParams(input))];
    expect(greek.every((text) => typeof text === 'string' && text.length > 0 && !text.includes('{{'))).toBe(true);
  });

  it('shows nothing until it is handed a status, and then announces it politely', () => {
    expect(new CaptainTeamConditionStatusComponent().status).toBeNull();

    // Everything the badge draws sits inside the guard.
    const guard = template.indexOf('@if (status; as currentStatus) {');
    expect(guard).toBeGreaterThan(-1);
    expect(template.indexOf('<div')).toBeGreaterThan(guard);
    expect(template).toContain('role="status"');
    expect(template).toContain('aria-live="polite"');
    expect(template).toContain('<ion-icon [icon]="iconName(currentStatus)" aria-hidden="true"></ion-icon>');
    expect(template).toContain('{{ t(titleKey(currentStatus)) }}');
    expect(template).toContain('{{ t(detailKey(currentStatus), detailParams(currentStatus)) }}');
  });

  it('colours itself by state, and shrinks only when asked to', () => {
    for (const state of ['full', 'partial', 'none', 'pending']) {
      expect(template).toContain(`[class.captain-team-condition-status--${state}]="currentStatus.state === '${state}'"`);
    }

    expect(new CaptainTeamConditionStatusComponent().compact).toBe(false);
    expect(template).toContain('[class.captain-team-condition-status--compact]="compact"');
  });
});
