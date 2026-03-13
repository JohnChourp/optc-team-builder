export interface CharacterStatsRange {
  hp: number;
  atk: number;
  rcv: number;
}

export interface CharacterStats {
  min: CharacterStatsRange;
  max: CharacterStatsRange;
  growth: number;
}

export interface RegionAvailability {
  exactLocal: boolean;
  thumbnailGlobal: boolean;
  thumbnailJapan: boolean;
  fullTransparent: boolean;
}

export interface CharacterAssets {
  exactLocal: string | null;
  thumbnailGlobal: string | null;
  thumbnailJapan: string | null;
  fullTransparent: string | null;
}

export interface CharacterRecord {
  id: number;
  name: string;
  type: string;
  classes: string[];
  primaryClass: string;
  secondaryClass: string | null;
  stars: number;
  cost: number;
  combo: number;
  maxLevel: number;
  maxExperience: number;
  stats: CharacterStats;
  regionAvailability: RegionAvailability;
  assets: CharacterAssets;
}

export interface CharacterDetail {
  characterId: number;
  captainAbility: string | null;
  specialName: string | null;
  specialText: string | null;
  specialNotes: string | null;
  sailorAbilities: string[];
  sailorNotes: string | null;
  limitBreak: Array<{ description: string }>;
  potentialAbilities: Array<{ Name?: string; description?: string[] }>;
  supportData: Array<Record<string, unknown>>;
  swapData: Record<string, unknown> | null;
  vsSpecial: Record<string, unknown> | null;
  superType: Record<string, unknown> | null;
  superClass: Record<string, unknown> | null;
  rumbleData: Record<string, unknown> | null;
}

export interface CharacterListItem extends CharacterRecord {
  imageUrl: string;
}

export interface CharacterDetailRecord extends CharacterListItem {
  detail: CharacterDetail;
  detailImageUrl: string;
}

export interface ShipRecord {
  id: number;
  name: string;
  thumb: string | null;
  description: string;
}

export interface SavedTeam {
  id: string;
  name: string;
  slots: Array<number | null>;
  shipId: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfflinePackSummary {
  key: string;
  id: string;
  label: string;
  localBasePath: string;
  fileCount: number;
  totalBytes: number;
  installed: boolean;
}

export interface DatasetManifest {
  generatedAt: string;
  sourceVersion: string;
  characterCount: number;
  detailCount: number;
  shipCount: number;
  rumbleCount: number;
  availableTypes: string[];
  availableClasses: string[];
  packs: OfflinePackSummary[];
}

export interface CharacterSearchQuery {
  searchTerm: string;
  typeFilter: string;
  classFilter: string;
  limit: number;
  offset: number;
}
