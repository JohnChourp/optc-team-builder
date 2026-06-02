import { Component } from '@angular/core';

const projectedTemplate = '<ng-content></ng-content>';
const panelHost = { class: 'character-detail-style-panel', style: 'display: contents;' };
const stylePanelsTemplate = `
  <app-character-detail-shell-panel>
    <app-character-detail-hero-panel>
      <app-character-detail-hero-meta-panel>
        <app-character-detail-ability-summary-panel>
          <app-character-detail-captain-tier-panel>
            <app-character-detail-card-panel>
              <app-character-detail-chip-panel>
                <app-character-detail-responsive-panel>
                  <ng-content></ng-content>
                </app-character-detail-responsive-panel>
              </app-character-detail-chip-panel>
            </app-character-detail-card-panel>
          </app-character-detail-captain-tier-panel>
        </app-character-detail-ability-summary-panel>
      </app-character-detail-hero-meta-panel>
    </app-character-detail-hero-panel>
  </app-character-detail-shell-panel>
`;

@Component({
  selector: 'app-character-detail-shell-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-detail-shell-panel.component.scss',
  host: panelHost,
})
export class CharacterDetailShellPanelComponent {}

@Component({
  selector: 'app-character-detail-hero-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-detail-hero-panel.component.scss',
  host: panelHost,
})
export class CharacterDetailHeroPanelComponent {}

@Component({
  selector: 'app-character-detail-hero-meta-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-detail-hero-meta-panel.component.scss',
  host: panelHost,
})
export class CharacterDetailHeroMetaPanelComponent {}

@Component({
  selector: 'app-character-detail-ability-summary-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-detail-ability-summary-panel.component.scss',
  host: panelHost,
})
export class CharacterDetailAbilitySummaryPanelComponent {}

@Component({
  selector: 'app-character-detail-captain-tier-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-detail-captain-tier-panel.component.scss',
  host: panelHost,
})
export class CharacterDetailCaptainTierPanelComponent {}

@Component({
  selector: 'app-character-detail-card-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-detail-card-panel.component.scss',
  host: panelHost,
})
export class CharacterDetailCardPanelComponent {}

@Component({
  selector: 'app-character-detail-chip-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-detail-chip-panel.component.scss',
  host: panelHost,
})
export class CharacterDetailChipPanelComponent {}

@Component({
  selector: 'app-character-detail-responsive-panel',
  standalone: true,
  template: projectedTemplate,
  styleUrl: './character-detail-responsive-panel.component.scss',
  host: panelHost,
})
export class CharacterDetailResponsivePanelComponent {}

@Component({
  selector: 'app-character-detail-style-panels',
  standalone: true,
  imports: [
    CharacterDetailAbilitySummaryPanelComponent,
    CharacterDetailCaptainTierPanelComponent,
    CharacterDetailCardPanelComponent,
    CharacterDetailChipPanelComponent,
    CharacterDetailHeroMetaPanelComponent,
    CharacterDetailHeroPanelComponent,
    CharacterDetailResponsivePanelComponent,
    CharacterDetailShellPanelComponent,
  ],
  template: stylePanelsTemplate,
  host: panelHost,
})
export class CharacterDetailStylePanelsComponent {}
