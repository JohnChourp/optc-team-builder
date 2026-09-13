/**
 * 869f1935z. The three upstream files the importer never read, normalized into per-character
 * lookups: `cooldowns.js`, `evolutions.js` and `drops.js`.
 *
 * They were left out because nothing needed them, and the feasibility audit
 * (`optc-team-builder-brain/audits/2026-09-13-869f127fy-ideas-feasibility.md`) measured what they
 * would buy: the evolution graph touches **2,927 of 4,618 shipped characters** with **zero
 * unresolved ids**, drops reach **1,830** with exactly one id the seed does not carry, and
 * `cooldowns.js` has an entry for **every** shipped character.
 *
 * Everything here is a pure function over an already-evaluated `window.*` object, so the shapes
 * can be tested without the network. Two shapes cost real care and are the reason this is a module
 * rather than three inline loops:
 *
 *  - **an evolver is not always a character.** `evolvers` mixes ids with string tokens - `"ink"`,
 *    `'skullINT'`, `'2138-skull'` - which are Rainbow Ink and the type skulls. Dropping them loses
 *    half of what an evolution costs; treating them as ids invents characters.
 *  - **a drop stage's slot keys are free text.** 164 distinct keys across the file, mixing `'1'`
 *    with `'1st Stage'`, `'30 Stamina'`, `'All Bosses'` and boss names, alongside scalar metadata
 *    (`name`, `dropID`, `thumb`, `global`, `nakama`, `completion`, `gamewith`). A slot is
 *    identified by its VALUE being an array of numbers, never by its key matching a pattern.
 */

/** Stage metadata keys that are never a drop slot, whatever their value looks like. */
const STAGE_METADATA_KEYS = new Set([
  'name',
  'dropID',
  'thumb',
  'global',
  'nakama',
  'completion',
  'gamewith',
  'notes',
]);

function toCharacterId(value) {
  const id = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);

  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * `cooldowns.js` is `id: [maxCooldown, minCooldown]` - the special's cooldown at level 1 and when
 * fully levelled. Anything that is not a pair of positive integers is skipped rather than guessed.
 */
export function normalizeSpecialCooldowns(cooldownsWindow) {
  const cooldowns = new Map();

  for (const [rawId, value] of Object.entries(cooldownsWindow ?? {})) {
    const characterId = toCharacterId(rawId);

    if (characterId === null || !Array.isArray(value)) {
      continue;
    }

    const max = toCharacterId(value[0]);
    const min = toCharacterId(value[1]);

    if (max === null || min === null) {
      continue;
    }

    cooldowns.set(characterId, { max, min });
  }

  return cooldowns;
}

function normalizeEvolverGroup(value) {
  const materials = [];

  for (const entry of Array.isArray(value) ? value : [value]) {
    const characterId = toCharacterId(entry);

    if (characterId !== null) {
      materials.push({ characterId, token: null });
      continue;
    }

    const token = String(entry ?? '').trim();

    /*
     * The tokens are the whole reason this is not `.filter(Number.isInteger)`. `"ink"` and
     * `'skullQCK'` are real evolution materials a player has to farm; a chain that silently omits
     * them tells the reader an evolution is free when it is not.
     */
    if (token.length > 0) {
      materials.push({ characterId: null, token });
    }
  }

  return materials;
}

/**
 * `evolutions.js` is `id: { evolution, evolvers }`, where a branching evolution carries parallel
 * arrays: `evolution: [6, 7]` with `evolvers: [[115, 80], [116, 80, 97]]`.
 *
 * Returns both directions. The reverse edge is the one a player actually asks for - *"you already
 * own its base form"* turns a blocker into a task, which forward-only data cannot answer.
 */
export function normalizeEvolutions(evolutionsWindow) {
  const forward = new Map();
  const reverse = new Map();

  for (const [rawId, entry] of Object.entries(evolutionsWindow ?? {})) {
    const fromId = toCharacterId(rawId);

    if (fromId === null || !entry || typeof entry !== 'object') {
      continue;
    }

    const targets = Array.isArray(entry.evolution) ? entry.evolution : [entry.evolution];
    const evolverGroups = Array.isArray(entry.evolution)
      ? (Array.isArray(entry.evolvers) ? entry.evolvers : [])
      : [entry.evolvers];

    const branches = [];

    targets.forEach((target, index) => {
      const toId = toCharacterId(target);

      if (toId === null) {
        return;
      }

      branches.push({ toId, materials: normalizeEvolverGroup(evolverGroups[index]) });

      const sources = reverse.get(toId) ?? [];
      sources.push(fromId);
      reverse.set(toId, sources);
    });

    if (branches.length > 0) {
      forward.set(fromId, branches);
    }
  }

  return { forward, reverse };
}

/**
 * `drops.js` is `group -> [stage]`, and a stage holds scalar metadata plus one array of character
 * ids per slot. Returns `characterId -> [{ group, stage, dropId, slot, global }]`, which is the
 * direction the question is asked in: *"where does THIS character drop?"*.
 */
export function normalizeDropSources(dropsWindow) {
  const sourcesById = new Map();

  for (const [group, stages] of Object.entries(dropsWindow ?? {})) {
    if (!Array.isArray(stages)) {
      continue;
    }

    for (const stage of stages) {
      if (!stage || typeof stage !== 'object') {
        continue;
      }

      for (const [slot, value] of Object.entries(stage)) {
        if (STAGE_METADATA_KEYS.has(slot) || !Array.isArray(value)) {
          continue;
        }

        for (const entry of value) {
          const characterId = toCharacterId(entry);

          if (characterId === null) {
            continue;
          }

          const sources = sourcesById.get(characterId) ?? [];

          sources.push({
            group,
            stage: typeof stage.name === 'string' ? stage.name : '',
            dropId: typeof stage.dropID === 'string' ? stage.dropID : '',
            slot,
            global: stage.global === true,
          });

          sourcesById.set(characterId, sources);
        }
      }
    }
  }

  return sourcesById;
}

/**
 * Attaches the three lookups onto already-built character objects, in place of a fourth argument
 * to `createSqlSeed` - which `manual-character-apply.mjs` also calls, and which would then have to
 * carry data a manually added character never has.
 */
export function attachProgressionData(characters, { cooldowns, evolutions, dropSources }) {
  return characters.map((character) => {
    const forward = evolutions.forward.get(character.id) ?? [];
    const reverse = evolutions.reverse.get(character.id) ?? [];
    const cooldown = cooldowns.get(character.id) ?? null;
    const drops = dropSources.get(character.id) ?? [];

    return {
      ...character,
      specialCooldownMax: cooldown?.max ?? null,
      specialCooldownMin: cooldown?.min ?? null,
      evolvesTo: forward,
      evolvesFrom: reverse,
      dropSources: drops,
    };
  });
}

/**
 * Where each field `attachProgressionData` writes actually comes from, and where it lands.
 *
 * Declared here rather than in the provenance generator, because this is the module that does the
 * reading - a rename should break the map next to the code that caused it. `optc-upstream-progression.spec.ts`
 * binds every row to a field this module really writes and to a column the seed really ships, so
 * the map cannot quietly drift into fiction the way a hand-written provenance table would.
 */
export const PROGRESSION_UPSTREAM_SOURCES = Object.freeze({
  specialCooldownMax: {
    upstream: 'cooldowns.js [0]',
    table: 'characters',
    column: 'special_cooldown_max',
  },
  specialCooldownMin: {
    upstream: 'cooldowns.js [1]',
    table: 'characters',
    column: 'special_cooldown_min',
  },
  evolvesTo: {
    upstream: 'evolutions.js .evolution + .evolvers',
    table: 'character_evolutions',
    column: 'evolves_to_json',
  },
  evolvesFrom: {
    upstream: 'evolutions.js .evolution, reversed',
    table: 'character_evolutions',
    column: 'evolves_from_json',
  },
  dropSources: {
    upstream: 'drops.js <group>[].<slot>',
    table: 'character_drops',
    column: 'sources_json',
  },
});
