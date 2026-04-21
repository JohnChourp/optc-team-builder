import {
  type CrewForgeImageProfile,
  type CrewForgeImageSlotDefinition,
} from '../models/optc.models';

const BUILT_IN_PROFILE_TIMESTAMP = '2026-04-21T00:00:00.000Z';
const ANDROID_RECRUITMENT_SLOT_SIZE = 179;
const ANDROID_RECRUITMENT_COLUMN_X = [149, 348, 545, 740] as const;
const ANDROID_RECRUITMENT_CAPTAIN_Y = 856;
const ANDROID_RECRUITMENT_CREWMATE_ROW_Y = [1179, 1384] as const;

function createSlot(
  key: string,
  label: string,
  role: 'leader' | 'sub',
  x: number,
  y: number,
): CrewForgeImageSlotDefinition {
  return {
    key,
    label,
    role,
    x,
    y,
    width: ANDROID_RECRUITMENT_SLOT_SIZE,
    height: ANDROID_RECRUITMENT_SLOT_SIZE,
  };
}

export const BUILT_IN_CREW_FORGE_IMAGE_PROFILES: CrewForgeImageProfile[] = [
  {
    id: 'crew-forge-default-android-1080x2400-character-recruitment',
    name: 'Android 1080×2400 Recruitment',
    source: 'built-in',
    imageWidth: 1080,
    imageHeight: 2400,
    slotDefinitions: [
      createSlot('leader-1', 'Leader 1', 'leader', ANDROID_RECRUITMENT_COLUMN_X[0], ANDROID_RECRUITMENT_CAPTAIN_Y),
      createSlot('leader-2', 'Leader 2', 'leader', ANDROID_RECRUITMENT_COLUMN_X[1], ANDROID_RECRUITMENT_CAPTAIN_Y),
      createSlot('leader-3', 'Leader 3', 'leader', ANDROID_RECRUITMENT_COLUMN_X[2], ANDROID_RECRUITMENT_CAPTAIN_Y),
      createSlot('leader-4', 'Leader 4', 'leader', ANDROID_RECRUITMENT_COLUMN_X[3], ANDROID_RECRUITMENT_CAPTAIN_Y),
      createSlot('sub-1', 'Sub 1', 'sub', ANDROID_RECRUITMENT_COLUMN_X[0], ANDROID_RECRUITMENT_CREWMATE_ROW_Y[0]),
      createSlot('sub-2', 'Sub 2', 'sub', ANDROID_RECRUITMENT_COLUMN_X[1], ANDROID_RECRUITMENT_CREWMATE_ROW_Y[0]),
      createSlot('sub-3', 'Sub 3', 'sub', ANDROID_RECRUITMENT_COLUMN_X[2], ANDROID_RECRUITMENT_CREWMATE_ROW_Y[0]),
      createSlot('sub-4', 'Sub 4', 'sub', ANDROID_RECRUITMENT_COLUMN_X[3], ANDROID_RECRUITMENT_CREWMATE_ROW_Y[0]),
      createSlot('sub-5', 'Sub 5', 'sub', ANDROID_RECRUITMENT_COLUMN_X[0], ANDROID_RECRUITMENT_CREWMATE_ROW_Y[1]),
      createSlot('sub-6', 'Sub 6', 'sub', ANDROID_RECRUITMENT_COLUMN_X[1], ANDROID_RECRUITMENT_CREWMATE_ROW_Y[1]),
      createSlot('sub-7', 'Sub 7', 'sub', ANDROID_RECRUITMENT_COLUMN_X[2], ANDROID_RECRUITMENT_CREWMATE_ROW_Y[1]),
      createSlot('sub-8', 'Sub 8', 'sub', ANDROID_RECRUITMENT_COLUMN_X[3], ANDROID_RECRUITMENT_CREWMATE_ROW_Y[1]),
    ],
    preprocess: {
      fingerprintSize: 16,
      contrast: 1,
      brightness: 0,
      grayscale: true,
      invert: false,
      blurRadius: 0,
      matchThreshold: 0.92,
      emptyVarianceThreshold: 0.005,
    },
    examples: [],
    exemplars: [],
    createdAt: BUILT_IN_PROFILE_TIMESTAMP,
    updatedAt: BUILT_IN_PROFILE_TIMESTAMP,
  },
];

export const BUILT_IN_CREW_FORGE_IMAGE_PROFILE_IDS = new Set(
  BUILT_IN_CREW_FORGE_IMAGE_PROFILES.map((profile) => profile.id),
);
