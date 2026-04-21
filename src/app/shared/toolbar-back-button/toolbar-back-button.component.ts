import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { IonButton, IonButtons, IonIcon } from '@ionic/angular/standalone';
import { chevronBackOutline } from 'ionicons/icons';

import { ToolbarBackNavigationService } from '../../core/services/toolbar-back-navigation.service';

@Component({
  selector: 'app-toolbar-back-button',
  standalone: true,
  imports: [IonButton, IonButtons, IonIcon, TranslocoPipe],
  templateUrl: './toolbar-back-button.component.html',
  styleUrl: './toolbar-back-button.component.scss',
})
export class ToolbarBackButtonComponent {
  public readonly backIcon = chevronBackOutline;

  public constructor(private readonly toolbarBackNavigation: ToolbarBackNavigationService) {}

  public goBack(): void {
    void this.toolbarBackNavigation.goBackOrFallback();
  }
}
