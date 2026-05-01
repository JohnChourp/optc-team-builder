import { Component, Input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { IonIcon } from '@ionic/angular/standalone';
import {
  alertCircleOutline,
  checkmarkCircleOutline,
  helpCircleOutline,
  warningOutline,
} from 'ionicons/icons';

import { type CaptainTeamConditionStatus } from '../../core/services/captain-team-condition-status.utils';

@Component({
  selector: 'app-captain-team-condition-status',
  standalone: true,
  imports: [IonIcon, TranslocoDirective],
  templateUrl: './captain-team-condition-status.component.html',
  styleUrl: './captain-team-condition-status.component.scss',
})
export class CaptainTeamConditionStatusComponent {
  @Input() public status: CaptainTeamConditionStatus | null = null;
  @Input() public compact = false;

  public readonly fullIcon = checkmarkCircleOutline;
  public readonly partialIcon = warningOutline;
  public readonly noneIcon = alertCircleOutline;
  public readonly pendingIcon = helpCircleOutline;

  public iconName(status: CaptainTeamConditionStatus): string {
    switch (status.state) {
      case 'full':
        return this.fullIcon;
      case 'partial':
        return this.partialIcon;
      case 'none':
        return this.noneIcon;
      case 'pending':
      default:
        return this.pendingIcon;
    }
  }

  public titleKey(status: CaptainTeamConditionStatus): string {
    if (status.state === 'full') {
      return status.leaderStatuses.length > 1 ? 'title.fullDual' : 'title.fullSingle';
    }

    return `title.${status.state}`;
  }

  public detailKey(status: CaptainTeamConditionStatus): string {
    if (status.state === 'full') {
      return status.leaderStatuses.length > 1 ? 'detail.fullDual' : 'detail.fullSingle';
    }

    return `detail.${status.state}`;
  }

  public detailParams(status: CaptainTeamConditionStatus): Record<string, number | string> {
    return {
      filled: status.filledSlotCount,
      total: status.expectedSlotCount,
      passed: status.passedLeaderLabels.join(' / '),
      failed: status.failedLeaderLabels.join(' / '),
    };
  }
}
