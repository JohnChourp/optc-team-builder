/**
 * 869f1328q. The Saved Enemies vocabulary, declared as data.
 *
 * Saved Enemies stores what a stage demands and the Auto Team Builder consumes it to shape a
 * search, so this is the only place where free player input reaches the engine. Nothing recorded
 * the closed set: which requirement kinds exist, what each MEANS, which ability answers it, and
 * what the engine does with one it cannot answer.
 *
 * The third of those is the one that matters. 15 of the 38 mechanics carry
 * `derivedAbilityKey: null`: ticking one produces no ability requirement, therefore no rule,
 * therefore nothing in the Final team report. 869f1935z already built the surface that breaks that
 * silence - the mechanic checklist, with `unanswerable` as its own state - so the behaviour is
 * correct. What was missing is the DECLARATION, and a check that a mechanic added tomorrow cannot
 * arrive without one.
 */

/**
 * What the enemy actually does, in the words a player would use.
 *
 * Deliberately not the `label`, which is a UI string and says only the name. A reader ticking
 * "Resilience" needs to know it means the enemy cannot be reduced below 1 HP, and a reader ticking
 * "Immunity" needs to know no shipped ability removes it.
 *
 * A mechanic missing from this map fails the lane. That is the whole point: the catalogue is
 * hand-maintained and grows, and a new entry with a label but no meaning is a term the app asks a
 * player to recognise without ever explaining it.
 */
export const ENEMY_MECHANIC_MEANINGS = Object.freeze({
  enemy_damage_reduction: 'The enemy takes reduced damage from every hit.',
  enemy_percent_damage_reduction: 'The enemy cuts incoming damage by a percentage.',
  enemy_threshold_damage_reduction:
    'The enemy cuts any hit above a damage threshold down to that threshold.',
  enemy_barrier: 'The enemy holds a barrier that absorbs whole hits until it is broken.',
  enemy_damage_nullification: 'The enemy nullifies damage entirely for a number of turns.',
  enemy_immunity: 'The enemy cannot be afflicted with the status effects you would normally apply.',
  enemy_resilience: 'The enemy cannot be reduced below 1 HP.',
  enemy_atk_up: 'The enemy raises its own attack.',
  enemy_enrage: 'The enemy enrages, sharply increasing the damage it deals.',
  enemy_increased_defense: 'The enemy raises its defense, so hits land for less.',
  enemy_end_of_turn_damage_percent_cut:
    'At the end of each turn the enemy cuts your crew HP by a percentage.',
  enemy_end_of_turn_heal: 'At the end of each turn the enemy heals itself.',
  enemy_orb_based_damage_reduction:
    'The enemy reduces damage from characters whose orb it does not like.',
  crew_bind: 'Your characters are bound and cannot attack for a number of turns.',
  crew_despair: 'Your Captain ability is disabled for a number of turns.',
  crew_paralysis: 'Your characters are randomly paralysed and may not attack.',
  crew_special_bind: 'Your specials are locked and cannot be used for a number of turns.',
  crew_chain_coefficient_reduction: 'Your chain multiplier grows more slowly than it should.',
  crew_chain_multiplier_limit: 'Your chain multiplier is capped at a fixed value.',
  crew_atk_down: 'Your crew attack is reduced.',
  crew_orb_boost_down: 'The bonus your matching orbs give is reduced.',
  crew_increase_damage_taken: 'Your crew takes more damage than normal.',
  crew_burn: 'Your crew takes damage at the end of every turn.',
  crew_healing_reduction: 'Healing your crew receives is reduced.',
  crew_stun: 'Your characters are stunned and skip their turn.',
  orb_block: 'Orbs are blocked, so they cannot be changed or swapped.',
  orb_bomb: 'Bomb orbs appear and damage your crew when they are used.',
  orb_negative: 'Your orbs are turned negative, so matching ones hurt rather than help.',
  orb_shuffle: 'Your orbs are shuffled between characters.',
  orb_slot_bind: 'Individual orb slots are bound and cannot be altered.',
  interrupt_special: 'The enemy acts in response to you using a special.',
  interrupt_atk_boost: 'The enemy acts in response to an attack boost on your crew.',
  interrupt_orb_boost: 'The enemy acts in response to an orb boost on your crew.',
  interrupt_delay: 'The enemy acts in response to being delayed.',
  interrupt_orb_change: 'The enemy acts in response to your orbs being changed.',
  condition_hp_threshold: 'The enemy changes behaviour when its HP crosses a threshold.',
  condition_turn_counter: 'The enemy changes behaviour on a fixed turn.',
  condition_revive: 'The enemy revives after being defeated.',
});

/**
 * What the ENGINE does with each kind, which is the part a player cannot see and a maintainer
 * keeps rediscovering.
 */
export const ENEMY_MECHANIC_ENGINE_BEHAVIOURS = Object.freeze({
  constrains:
    'Ticking it derives an ability requirement, so the search will only return teams that answer it, and the Final team report names the rule.',
  checklistOnly:
    'No shipped ability answers it, so ticking it derives no requirement and constrains nothing. The search is unaffected and the Final team report is structurally incapable of mentioning it; the mechanic checklist reports it as `unanswerable` so the silence is visible.',
});

export function parseEnemyMechanicCatalog(source) {
  const start = source.indexOf('const ENEMY_MECHANIC_CATALOG');
  const end = source.indexOf('function cloneEnemyMechanicCatalogItem');

  if (start < 0 || end < 0) {
    throw new Error('Could not find the enemy mechanic catalogue in the draft utils.');
  }

  return source
    .slice(start, end)
    .split('createEnemyMechanicCatalogItem({')
    .slice(1)
    .map((raw) => {
      const item = raw.slice(0, raw.indexOf('}),'));
      const read = (field) => item.match(new RegExp(`${field}: '([^']*)'`, 'u'))?.[1] ?? null;
      const derivedMatch = item.match(/derivedAbilityKey:\s*(null|'[a-z_]+')/u);

      return {
        key: read('key'),
        label: read('label'),
        category: read('category'),
        derivedAbilityKey:
          !derivedMatch || derivedMatch[1] === 'null' ? null : derivedMatch[1].slice(1, -1),
      };
    })
    .filter((item) => item.key);
}

export function buildEnemyMechanicVocabulary({ draftSource, generatedAt }) {
  const catalog = parseEnemyMechanicCatalog(draftSource);
  const mechanics = catalog.map((item) => ({
    ...item,
    meaning: ENEMY_MECHANIC_MEANINGS[item.key] ?? null,
    engineBehaviour: item.derivedAbilityKey
      ? ENEMY_MECHANIC_ENGINE_BEHAVIOURS.constrains
      : ENEMY_MECHANIC_ENGINE_BEHAVIOURS.checklistOnly,
  }));

  return {
    generatedAt,
    note: 'Generated by scripts/generate-enemy-vocabulary.mjs from the catalogue in src/app/core/services/enemy-mechanic-draft.utils.ts and the meanings declared in scripts/lib/enemy-mechanic-vocabulary.mjs. Do not edit by hand.',
    mechanicCount: mechanics.length,
    constrainingCount: mechanics.filter((item) => item.derivedAbilityKey).length,
    checklistOnlyCount: mechanics.filter((item) => !item.derivedAbilityKey).length,
    mechanics,
  };
}

export function findVocabularyFailures(vocabulary) {
  const failures = [];

  for (const mechanic of vocabulary.mechanics) {
    if (!mechanic.meaning) {
      failures.push(
        `${mechanic.key}: no meaning declared. Add one to ENEMY_MECHANIC_MEANINGS - a term the app asks a player to recognise has to be explainable.`,
      );
    }
  }

  const declaredKeys = new Set(Object.keys(ENEMY_MECHANIC_MEANINGS));
  const catalogKeys = new Set(vocabulary.mechanics.map((mechanic) => mechanic.key));

  for (const key of declaredKeys) {
    if (!catalogKeys.has(key)) {
      failures.push(
        `${key}: a meaning is declared for a mechanic that is no longer in the catalogue. Remove it.`,
      );
    }
  }

  return failures;
}

/**
 * The stale-number guard. `auto-team-builder-mechanic-checklist.utils.ts` explains itself with a
 * written-out count of the unanswerable mechanics, and that number was **wrong** when this was
 * built: the prose said fourteen and the catalogue held fifteen. This project has paid for a
 * carried-forward figure in a comment before, so the figure is now checked against the thing it
 * describes.
 */
const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty',
];

export function findChecklistProseDrift(checklistSource, vocabulary) {
  const failures = [];
  const match = checklistSource.match(
    /([A-Za-z]+) of the catalogue's (\d+) mechanics carry `derivedAbilityKey: null`/u,
  );

  if (!match) {
    failures.push(
      "auto-team-builder-mechanic-checklist.utils.ts no longer states how many mechanics carry `derivedAbilityKey: null`. Keep the sentence, or this guard protects nothing.",
    );
    return failures;
  }

  const spelledCount = NUMBER_WORDS.indexOf(match[1].toLowerCase());
  const totalInProse = Number(match[2]);

  if (spelledCount !== vocabulary.checklistOnlyCount) {
    failures.push(
      `auto-team-builder-mechanic-checklist.utils.ts says "${match[1]}" mechanics carry \`derivedAbilityKey: null\`; the catalogue holds ${vocabulary.checklistOnlyCount}.`,
    );
  }

  if (totalInProse !== vocabulary.mechanicCount) {
    failures.push(
      `auto-team-builder-mechanic-checklist.utils.ts says the catalogue holds ${totalInProse} mechanics; it holds ${vocabulary.mechanicCount}.`,
    );
  }

  return failures;
}
