import { readFile } from 'node:fs/promises';

export async function loadBuilderAbilityCorrections(correctionsPath) {
  try {
    const rawCorrections = JSON.parse(await readFile(correctionsPath, 'utf8'));

    if (!rawCorrections || typeof rawCorrections !== 'object' || Array.isArray(rawCorrections)) {
      throw new Error(`Invalid builder ability corrections JSON in ${correctionsPath}.`);
    }

    const corrections = new Map();

    Object.entries(rawCorrections).forEach(([rawCharacterId, value]) => {
      const characterId = Number(rawCharacterId);

      if (!Number.isInteger(characterId) || characterId <= 0) {
        throw new Error(`Invalid builder ability correction key "${rawCharacterId}".`);
      }

      corrections.set(characterId, value);
    });

    return corrections;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return new Map();
    }

    throw error;
  }
}
