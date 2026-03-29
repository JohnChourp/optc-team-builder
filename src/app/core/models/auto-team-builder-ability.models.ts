export type AutoBuildAbilitySource = 'specialText' | 'captainAbility';
export type AutoBuildAbilityCoverageMode = 'explicit' | 'selectedDebuff';

export interface NormalizedBuilderAbility {
  key: string;
  label: string;
  minTurns: number | null;
  isCompleteRemoval: boolean;
  slotTokens: string[];
  source: AutoBuildAbilitySource;
  coverageMode?: AutoBuildAbilityCoverageMode;
}

export interface AutoBuildAbilityCatalogItem {
  key: string;
  label: string;
  supportsTurns: boolean;
  supportsSlotTokens: boolean;
  availableSlotTokens: string[];
  availableSources: AutoBuildAbilitySource[];
  availableCoverageModes?: AutoBuildAbilityCoverageMode[];
  matchCount: number;
  sampleCharacterIds: number[];
  sampleTexts: string[];
}

export interface AutoBuildAbilityCatalog {
  generatedAt: string;
  sourceVersion: string;
  abilityCount: number;
  abilities: AutoBuildAbilityCatalogItem[];
}

export interface AutoBuildAbilityRequirement {
  abilityKey: string;
  minTurns: number | null;
  slotTokens: string[];
  requiredCharacterCount: number;
}
