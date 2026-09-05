import { Component, Input, computed, signal } from '@angular/core';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';

import { type CharacterDetailRecord, type CharacterListItem } from '../../core/models/optc.models';
import {
  type TeamCoverageSummary,
  resolveTeamCoverageSummary,
} from '../../core/services/team-coverage-summary.utils';

@Component({
  selector: 'app-team-coverage-summary',
  standalone: true,
  imports: [TranslocoDirective, TranslocoPipe],
  templateUrl: './team-coverage-summary.component.html',
  styleUrl: './team-coverage-summary.component.scss',
})
export class TeamCoverageSummaryComponent {
  private readonly captainSignal = signal<CharacterDetailRecord | null>(null);
  private readonly friendCaptainSignal = signal<CharacterDetailRecord | null>(null);
  private readonly membersSignal = signal<ReadonlyArray<CharacterListItem | null>>([]);

  @Input() public set captain(value: CharacterDetailRecord | null | undefined) {
    this.captainSignal.set(value ?? null);
  }

  @Input() public set friendCaptain(value: CharacterDetailRecord | null | undefined) {
    this.friendCaptainSignal.set(value ?? null);
  }

  @Input() public set members(value: ReadonlyArray<CharacterListItem | null | undefined>) {
    this.membersSignal.set(value.map((member) => member ?? null));
  }

  public readonly summary = computed<TeamCoverageSummary>(() =>
    resolveTeamCoverageSummary({
      captain: this.captainSignal(),
      friendCaptain: this.friendCaptainSignal(),
      members: this.membersSignal(),
    }),
  );

  public readonly hasAnyTiers = computed(() => this.summary().tiers.length > 0);

  public statusKey(captureSource: string): string {
    switch (captureSource) {
      case 'both':
        return 'tierStatus.both';
      case 'captain-only':
        return 'tierStatus.captainOnly';
      case 'friend-only':
        return 'tierStatus.friendOnly';
      default:
        return 'tierStatus.none';
    }
  }
}
