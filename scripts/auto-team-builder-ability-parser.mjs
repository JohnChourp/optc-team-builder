import { normalizeHtmlToText } from './lib/html-text.mjs';
import SPECIAL_ABILITY_DEFINITIONS from './data/special-ability-definitions.json' with { type: 'json' };
import CREWMATE_ABILITY_DEFINITIONS from './data/crewmate-ability-definitions.json' with { type: 'json' };
import POTENTIAL_ABILITY_DEFINITIONS from './data/potential-ability-definitions.json' with { type: 'json' };
import SUPPORT_ABILITY_DEFINITIONS from './data/support-ability-definitions.json' with { type: 'json' };
const SPECIAL_UNIQUE_ABILITY_SOURCES = {
  territory: ['specialText', 'superSpecialText'],
};
const POTENTIAL_UNIQUE_ABILITY_SOURCES = {
  potential_super_tandem: ['superTandemData'],
  potential_final_tap_sugo_special: ['finalTapData'],
  potential_rush_sugo_special: ['rushSugoSpecialData'],
  potential_super_tandem_boost: ['superTandemData'],
};
const STRUCTURED_ABILITY_DEFINITIONS = [
  ...SPECIAL_ABILITY_DEFINITIONS.map((definition) => ({
    ...definition,
    category: 'special',
    availableSources: SPECIAL_UNIQUE_ABILITY_SOURCES[definition.key] ?? ['specialText'],
  })),
  ...CREWMATE_ABILITY_DEFINITIONS.map((definition) => ({
    ...definition,
    category: 'crewmate',
    availableSources: ['sailorAbilities'],
  })),
  ...POTENTIAL_ABILITY_DEFINITIONS.map((definition) => ({
    ...definition,
    category: 'potential',
    availableSources: POTENTIAL_UNIQUE_ABILITY_SOURCES[definition.key] ?? ['potentialAbilities'],
  })),
  ...SUPPORT_ABILITY_DEFINITIONS.map((definition) => ({
    ...definition,
    category: 'support',
    availableSources: ['supportData'],
  })),
];
const STRUCTURED_ABILITY_METADATA_BY_KEY = new Map(
  STRUCTURED_ABILITY_DEFINITIONS.map((definition) => [definition.key, definition]),
);
const SLOT_ABILITY_KEY_SET = new Set(['remove_slot_bind', 'remove_slot_barrier']);
const DEFAULT_COVERAGE_MODE = 'explicit';
const PAIN_ABILITY_KEY = 'remove_pain';
const PAIN_ABILITY_LABEL = 'Remove Pain';
const CREWMATE_TYPES = ['STR', 'DEX', 'QCK', 'PSY', 'INT'];
const CREWMATE_CLASSES = [
  { slug: 'fighter', label: 'Fighter' },
  { slug: 'slasher', label: 'Slasher' },
  { slug: 'striker', label: 'Striker' },
  { slug: 'shooter', label: 'Shooter' },
  { slug: 'free_spirit', label: 'Free Spirit' },
  { slug: 'driven', label: 'Driven' },
  { slug: 'cerebral', label: 'Cerebral' },
  { slug: 'powerhouse', label: 'Powerhouse' },
];
const POTENTIAL_ABILITY_ALIASES = new Map(
  [
    ['Super Tandem', 'potential_super_tandem'],
    ['Final Tap Sugo Special', 'potential_final_tap_sugo_special'],
    ['Rush Sugo Special', 'potential_rush_sugo_special'],
    ['Super Tandem Boost', 'potential_super_tandem_boost'],
    ['Slot Bind Resistance', 'potential_slot_bind_resistance'],
    ['Reduce Slot Bind duration', 'potential_slot_bind_resistance'],
    ['Slot Changes Impossible Resistance', 'potential_slot_changes_impossible_resistance'],
    ['Bind Ship Ability Resistance', 'potential_bind_ship_ability_resistance'],
    ['Fear Resistance', 'potential_fear_resistance'],
    ['Limit Special Uses Resistance', 'potential_limit_special_uses_resistance'],
    ['RCV Bind Resistance', 'potential_rcv_bind_resistance'],
    ['Recoverable HP Amount Down Resistance', 'potential_recoverable_hp_amount_down_resistance'],
    ['Recovery ATK Boost/Hunger Resistance', 'potential_recovery_atk_boost_hunger_resistance'],
    [
      'Provoked ATK Boost/Received Damage Up Resistance',
      'potential_provoked_atk_boost_received_damage_up_resistance',
    ],
    ['Own Special Charge Time Reduced', 'potential_own_special_charge_time_reduced'],
    ['Special Double Launch', 'potential_special_double_launch'],
    ['Special Triple Launch', 'potential_special_triple_launch'],
    ['STR Damage Reduction', 'potential_str_damage_reduction'],
    ['[STR] Damage Reduction', 'potential_str_damage_reduction'],
    ['DEX Damage Reduction', 'potential_dex_damage_reduction'],
    ['[DEX] Damage Reduction', 'potential_dex_damage_reduction'],
    ['QCK Damage Reduction', 'potential_qck_damage_reduction'],
    ['[QCK] Damage Reduction', 'potential_qck_damage_reduction'],
    ['PSY Damage Reduction', 'potential_psy_damage_reduction'],
    ['[PSY] Damage Reduction', 'potential_psy_damage_reduction'],
    ['INT Damage Reduction', 'potential_int_damage_reduction'],
    ['[INT] Damage Reduction', 'potential_int_damage_reduction'],
    ['Pinch Healing', 'potential_pinch_healing'],
    ['Barrier Pierce', 'potential_barrier_pierce'],
    ['Barrier Penetration', 'potential_barrier_pierce'],
    ['Critical ATK', 'potential_critical_atk'],
    ['Critical Hit', 'potential_critical_atk'],
    ['Damage Limit Break: Type', 'potential_damage_limit_break_type'],
    ['Damage Limit Break: Class', 'potential_damage_limit_break_class'],
  ].map(([label, key]) => [normalizePotentialAbilityLabel(label), key]),
);
const SUPER_TANDEM_BOOST_PATTERNS = [
  /\braises?\s+boost level\b/i,
  /\bsuper tandem boost\b/i,
  /\bATK Boost \(Tandem\)\b/i,
];
const SUPPORT_TAP_TIMING_TRIGGER_PATTERNS = [
  /\bperfects?\b/i,
  /\btap-?timing\b/i,
  /\bafter scoring\b[^.]{0,80}\bperfects?\b/i,
  /\bafter landing\b[^.]{0,80}\bperfects?\b/i,
  /\bafter attacking\b/i,
  /\bwhen attacking\b/i,
  /\bon hit\b/i,
];
const SUPPORT_DESIGNATED_TURN_PATTERNS = [
  /\bon (?:the )?(?:final|boss|last) (?:battle|stage|turn)\b/i,
  /\bon battle \d+\b/i,
  /\bon stage \d+\b/i,
  /\bon turn \d+\b/i,
  /\bdesignated turn\b/i,
  /\bfollowing turn\b/i,
  /\bafter \d+ turns?\b/i,
];
const ABILITY_BRANCH_ACTION_PATTERN =
  /\b(?:deals?|boosts?|makes?|reduces?|changes?|adds?|delays?|locks?|recovers?|heals?|cuts?|transforms?|sets?)\b/gi;
const EXPLICIT_BUILDER_ABILITIES = [
  {
    key: 'extra_drop_any',
    label: 'Any Extra Drop',
    sources: ['captainAbility'],
    matcher: (text) =>
      /\b(?:gives?\s+chance\s+of|guarantees?)\s+duplicating a drop upon completion of the island\b/i.test(
        text,
      ),
  },
  {
    key: 'extra_drop_guaranteed',
    label: 'Guaranteed Extra Drop',
    sources: ['captainAbility'],
    matcher: (text) =>
      /\bguarantees?\s+duplicating a drop upon completion of the island\b/i.test(text),
  },
  {
    key: 'ignore_normal_attack_only',
    label: 'Ignore Normal Attack Only (NAO)',
    matcher: (text) => /\bignoring normal attack only\b/i.test(text),
  },
  {
    key: 'deal_fixed_damage',
    label: 'Deal Fixed Damage',
    matcher: (text) => /\bdeals?\b[^.]*\bfixed(?: true)? damage\b/i.test(text),
  },
  {
    key: 'inflict_poison',
    label: 'Inflict Poison',
    matcher: (text) =>
      /\binflicts?\b[^.]*\b(?:poison|strong poison|toxic|venom)\b/i.test(text) ||
      /\bpoisons?\b[^.]*\benemies?\b/i.test(text),
  },
];
const EXPLICIT_BUILDER_ABILITY_KEY_SET = new Set(
  EXPLICIT_BUILDER_ABILITIES.map((ability) => ability.key),
);
const TERRITORY_PROVIDER_PATTERNS = [
  /\bapplies\b[^.;]{0,120}\b["“]?\s*Territory\s*:\s*(?:\[[^\]]+\]|[A-Za-z][A-Za-z ]*)\s*["”]?[^.;]{0,120}\b(?:field|crew)\b/i,
  /\bapplies\b[^.;]{0,120}\b(?:field|crew)[^.;]{0,120}\b["“]?\s*Territory\s*:\s*(?:\[[^\]]+\]|[A-Za-z][A-Za-z ]*)\s*["”]?/i,
];
const SPECIAL_ABILITY_MATCHERS = [
  // The captain/crew DEALING damage to enemies ("deals <amount> [in TYPE] damage
  // to enemies"). The negative lookbehind rejects DEFENSIVE "damage": "[BOMB]/
  // [SUPERBOMB] orbs will deal N% less damage to the crew" (orb self-damage cut)
  // and bridges into "reduces damage received" — neither deals damage. `(?:[^.]|
  // \.\d)` also lets the gap span decimals so decimal-multiplier damage specials
  // ("deals 3.5x character's RCV/ATK ... damage") are not lost at the ".".
  ['special_damage', [/\bdeals?\b(?:[^.]|\.\d){0,160}(?<!\b(?:less|more|reduces?|reduced)\s)damage\b/i]],
  ['special_damage_other', [/\bdeals?\b[^.]{0,160}\btypeless damage\b/i]],
  [
    'percent_damage',
    [
      // Canonical OPTC-DB wording (588 upstream occurrences): "Deals N% of enemies'
      // current HP in [True] damage to all/one enem(y/ies) [at the end of each turn /
      // at the start of every stage]". Possessor is always plural "enemies'", scope is
      // always "current HP", verb is always "deals" — the tokens appear in-order in a
      // tiny window, so this catches every canonical/embedded/captain form.
      /\bdeals?\b[^.]{0,160}\b\d+%\s+of\b[^.]{0,100}\bHP\b[^.]{0,80}\bdamage\b/i,
      // Newer OPTC-DB wording that omits "deals"/"damage": "Reduces (one) enem(y's|ies')
      // HP by N% [(ignoring all defensive effects)]" — still a genuine percent-HP damage
      // TO ENEMIES (e.g. Law - Finger-Controlled Boulder #4185, whose upstream text was
      // updated away from the older "Deals N% of enemies' current HP in True damage ..."
      // form; without this the unit silently loses its Percent Damage tag on re-import).
      // Scoped to enem(y's|ies') so it never catches the SELF HP-cost "Cutting special,
      // reduces crew's current HP by N%". Replaces the former /cuts? ... HP ... by N%/
      // alternative, which matched nothing in OPTC-DB crew text ("cut" only appears in
      // enemy-debuff names and that self-cost, never as a crew percent-damage effect).
      /\breduces?\b[^.]{0,20}\benem(?:y'?s?|ies'?)\b[^.]{0,20}\bHP\b[^.]{0,10}\bby\s+\d+%/i,
    ],
  ],
  [
    'percent_damage_ignore_defensive_effects',
    [
      /\b\d+%\s+of\b[^.]{0,100}\bHP\b[^.]{0,120}\bignoring\b[^.]{0,120}\b(?:defensive effects|normal attack only|damage reduction|barrier|defense)\b/i,
    ],
  ],
  ['boost_atk', [/\bboosts?\b[^.]{0,120}\bATK\b[^.]{0,80}\bby\s+\d+(?:\.\d+)?x/i]],
  [
    'boost_slot_effects',
    [
      // "Boost Orb Effects" (community "Orb Boost"; the resulting buff state is
      // "Orb Amplification") amplifies the damage multiplier a matching/beneficial
      // orb grants. OPTC-DB ALWAYS words it with the literal "Orb Effects" (legacy
      // "Slot Effects"), incl. lowercase and the possessive "characters' slot
      // effects by Nx" — all caught case-insensitively. The former bare `orbs?`
      // alternative produced NO true positives, only false positives by bridging
      // to distinct orb mechanics: orb DROP RATE ("boosts chances of getting [X]
      // orbs"), "makes [X] orbs beneficial ... boosts ATK by Nx", "Orb
      // Amplification" conditionals, and the RCV-orb HEAL boost "boosts the amount
      // healed by [RCV] orbs by Nx" (a heal boost — already carried by `boost_rcv`,
      // and this key is grouped under Boost Damage). Dropping `orbs?` narrows the
      // captain matches from 29 (26 false) to the 3 genuine "Boosts Orb Effects"
      // grants and removes the analogous special-side false positives.
      /\bboosts?\b[^.]{0,120}\b(?:Orb Effects|Slot Effects)\b[^.]{0,80}\bby\s+\d+(?:\.\d+)?x/i,
    ],
  ],
  [
    'boost_against_delayed_enemies',
    [/\bboosts?\b[^.]{0,120}\bdamage\b[^.]{0,120}\bdelayed enemies\b/i],
  ],
  [
    'boost_against_def_reduced_enemies',
    [/\bboosts?\b[^.]{0,120}\bdamage\b[^.]{0,120}\b(?:DEF|defense) reduced enemies\b/i],
  ],
  [
    'boost_against_poisoned_enemies',
    [/\bboosts?\b[^.]{0,120}\bdamage\b[^.]{0,120}\bpoisoned enemies\b/i],
  ],
  ['other_damage_boosts', [/\bboosts?\b[^.]{0,120}\bdamage dealt\b/i, /\bdamage boost\b/i]],
  [
    'boost_type_effects',
    // A genuine Type-Effects / Color Affinity BOOST grant — not any mention of
    // the buff. Keep the verb-anchored "boosts ... Type Effects" (covers "boosts
    // [the] [Super] Type Effects of [scope]"). The old bare `/color affinity/`
    // literal over-matched every reference to the buff: effect_boost ("increases
    // boost effects of Color Affinity buffs"), buff-duration extenders
    // ("increases duration of any Color Affinity buffs"), conditions ("uses a
    // special with / to boost a Color Affinity buff", "if your crew has Color
    // Affinity", "you gain a Color Affinity buff"), converts ("converts Color
    // Affinity into a Stackable Color Affinity"), and enhance-enablers. Require
    // the clause to actually grant Color Affinity: "boosts [the] Color Affinity
    // of [scope]" or possessive "their|its Color Affinity by Nx". Captain
    // 56->25; special 437->410, superSpecial 36->23, sailor 7->0 (all drops are
    // non-grant references; Super Type Effects grants stay via the type-effects
    // pattern).
    [
      /\bboosts?\b[^.]{0,120}\btype effects?\b/i,
      /\bboosts?\s+(?:the\s+)?color affinity\s+of\b/i,
      /\b(?:their|its)\s+color affinity\s+by\s+[+]?\d/i,
    ],
  ],
  ['additional_damage_boost', [/\badds?\b[^.]{0,120}\bdamage\b/i, /\badditional damage\b/i]],
  ['chain_multiplier_lock', [/\blocks?\b[^.]{0,120}\bchain\b/i]],
  ['chain_multiplier_lock_min_max', [/\bchain\b[^.]{0,80}\b(?:minimum|maximum|min|max)\b/i]],
  [
    'chain_multiplier_additive_boost',
    [/\badds?\b[^.]{0,80}\bto\b[^.]{0,40}\bchain\b/i, /\bchain\b[^.]{0,80}\b\+\d/i],
  ],
  [
    'chain_multiplier_multiplicative_boost',
    // Require the genuine multiplicative wording "boosts (the) chain multiplier by
    // Nx" (the "Chain Multiplication" buff category). The old loose "boosts ...
    // chain ... by Nx" mis-tagged the growth-rate effect ("boosts Chain Multiplier
    // Growth Rate by Nx" → chain_multiplier_growth_rate) and conditional ATK boosts
    // ("boosts ATK ... at the start of the chain, by Nx"). This yields 0 matches on
    // captainAbility/specialText today (the effect is currently support-side only)
    // but stays correct for any future captain/special that uses this wording.
    [/\bboosts?\s+(?:the\s+)?chain multiplier by\s+\d+(?:\.\d+)?x/i],
  ],
  [
    'chain_multiplier_growth_rate',
    // Genuine GRANT only: "(Boosts|Increases) [the] Chain Multiplier Growth Rate
    // by [+]Nx" — the canonical OPTC-DB wording (every real grant uses "Boosts
    // Chain Multiplier Growth Rate by Nx"; the "by <multiplier>x" fingerprint is
    // what makes it a grant). The old loose `boosts?/increases? ... chain ...
    // growth rate` bridge over-matched growth-rate BUFF AMPLIFIERS that grant no
    // growth rate themselves — "increases duration of any Chain Multiplier Growth
    // Rate buffs ... by N turns" (Edward Newgate #4216) and "increases boost
    // effects of Chain Multiplier Growth Rate buffs by +Nx" / "uses a special to
    // boost Chain Multiplier Growth Rate" (Roger & Rayleigh & Gaban #4387) — and
    // the trigger condition "you gain a Chain Multiplier Growth Rate buff" (Dorry
    // & Broggy #4436). Requiring "by [+]Nx" to directly follow the phrase keeps
    // all 63 captain / 42 special grants and drops those non-grant forms.
    [/\b(?:boosts?|increases?)\s+(?:the\s+)?chain\s+multiplier\s+growth\s+rate\s+by\s+\+?\d+(?:\.\d+)?x/i],
  ],
  ['boost_base_atk', [/\bboosts?\b[^.]{0,120}\bbase ATK\b/i, /\badds?\b[^.]{0,120}\bbase ATK\b/i]],
  ['effect_boost', [/\bincreases?\b[^.]{0,120}\bboost effects?\b/i, /\beffect boost\b/i]],
  ['critical_damage_boost', [/\bcritical damage\b/i]],
  ['final_tap_atk_boost', [/\bfinal tap\b[^.]{0,120}\bATK\b/i]],
  // Require "reduces" to directly govern "damage received/taken" (canonical
  // OPTC-DB "reduces damage received/taken by N%"; "take" handles an upstream
  // typo, e.g. Sanji "reduces damage take by 10%"). A wide `[^.]{0,120}` bridge
  // previously mis-tagged debuff cures ("reduces Increase Damage Taken"),
  // counters ("deals Nx the damage taken"), and glass-cannon downsides
  // ("increases damage received") as reduce_damage.
  ['reduce_damage', [/\breduces?\s+(?:any\s+)?damage (?:received|taken|take)\b/i]],
  [
    'reduce_damage_over_threshold',
    [/\breduces?\b[^.]{0,120}\bdamage\b[^.]{0,120}\bover\b[^.]{0,80}\bHP\b/i],
  ],
  ['nullify_damage', [/\bnullif(?:y|ies)\b[^.]{0,120}\bdamage\b/i]],
  ['lock_slots', [/\blocks?\b[^.]{0,80}\b(?:orbs?|slots?)\b/i]],
  [
    'make_slots_favorable',
    [/\bmakes?\b[^.]{0,160}\b(?:orbs?|slots?)\b[^.]{0,80}\b(?:beneficial|matching|favorable)\b/i],
  ],
  [
    'change_slot_chance',
    [/\b(?:changes?|boosts?|increases?)\b[^.]{0,120}\b(?:orb|slot)\b[^.]{0,80}\bchance\b/i],
  ],
  ['swap_slots', [/\bswaps?\b[^.]{0,80}\b(?:orbs?|slots?)\b/i]],
  [
    'change_slots',
    [
      // Exclude orb-EFFECT changes ("changes the Orb Multiplier / Amplification /
      // Effects ... of [X] orbs"): those alter an orb's multiplier/effect, not its
      // type, so they are not a slot/orb-type change (e.g. Kaido & Big Mom #4477
      // "change the Orb Multiplier of specific orbs"). Genuine changes name an orb
      // type or "the orb(s)" as the object, not the "Orb <effect>" noun.
      /\bchanges?\b(?!\s+(?:the\s+)?Orb\s+(?:Multiplier|Amplification|Effects?)\b)[^.]{0,160}\b(?:orbs?|slots?)\b/i,
      /\btransforms?\b[^.]{0,160}\b(?:orbs?|slots?)\b/i,
    ],
  ],
  [
    'change_block_slots',
    [
      /\bchanges?\b[^.]{0,180}\[BLOCK\][^.]{0,160}\b(?:orbs?|slots?)\b/i,
      /\bincluding\s+\[BLOCK\]/i,
    ],
  ],
  ['consume_slots', [/\bconsumes?\b[^.]{0,80}\b(?:orbs?|slots?)\b/i]],
  [
    'auto_change_slots',
    [
      /\bautomatically\b[^.]{0,120}\bchanges?\b[^.]{0,120}\b(?:orbs?|slots?)\b/i,
      /\bauto changes?\b/i,
    ],
  ],
  ['remove_silence', [/\breduces?\b[^.]{0,80}\bsilence\b[^.]{0,80}\bby\s+\d+\s+turns?/i]],
  ['apply_delay', [/\bdelays?\b[^.]{0,120}\benemies\b/i]],
  [
    'apply_def_reduction',
    [
      /\breduces?\b[^.]{0,120}\benem(?:y|ies)[^.]{0,80}\bDEF\b/i,
      /\binflicts?\b[^.]{0,120}\bDEF Down\b/i,
    ],
  ],
  ['apply_increase_damage_taken', [/\bincreases?\b[^.]{0,120}\bdamage taken\b/i]],
  ['apply_unique_effect', [/\bunique effect\b/i]],
  [
    'apply_resistance_reduction',
    [/\bresistance reduction\b/i, /\breduces?\b[^.]{0,120}\bresistance\b/i],
  ],
  ['apply_set_target', [/\bsets?\b[^.]{0,80}\btarget\b/i]],
  ['apply_weakened', [/\bweakened\b/i]],
  [
    'reduce_ship_special_charge',
    [/\breduces?\b[^.]{0,120}\bship special\b[^.]{0,80}\b(?:charge|cooldown|turns?)\b/i],
  ],
  ['reduce_switch_effect_use', [/\breduces?\b[^.]{0,120}\bswitch effect\b[^.]{0,80}\buse/i]],
  ['reduce_vs_effect_gauge', [/\breduces?\b[^.]{0,120}\bVS effect gauge\b/i]],
  [
    'reduce_special_charge',
    // Require "reduces" to directly govern "special cooldown" — the canonical
    // OPTC-DB wording "Reduces Special Cooldown of <scope> by N turn(s) at the
    // start of the fight" (community name "Reduce Special Charge Time"). A wide
    // `[^.]{0,120}` bridge previously mis-scoped clauses such as "reduces Bind
    // duration ... and restores/advances Special Cooldown" — the "restores (when
    // rewinded)" / "advances to MAX" beneficial charge is a DISTINCT mechanic and
    // must not be reported here. The former "special charge" alternative matched
    // zero characters across every source, so it is dropped.
    [/\breduces?\s+(?:the\s+)?special cooldown\b/i],
  ],
  [
    'restore_advance_special_charge',
    // The beneficial-but-distinct special-charge family that is NOT the canonical
    // start-of-fight `reduce_special_charge`: "restores Special Cooldown of <scope>
    // by N turns when they are rewinded" (Rewind/Time recovery) and "advances
    // Special Cooldown of <scope> to MAX / by N turns" (proactive charge). "restores"
    // / "advances" must directly govern "special cooldown". The negative lookahead
    // excludes "Special Cooldown of Ship" — the ship special cooldown is a separate
    // mechanic (see `reduce_ship_special_charge`), not a crew/character effect.
    [/\b(?:restores?|advances?)\s+(?:the\s+)?special cooldown\b(?!\s+of\s+ship\b)/i],
  ],
  // `(?:[^.]|\.\d)` lets the gap span decimals (e.g. "recovers 1.5x character's
  // RCV in HP") without crossing a real sentence boundary (a period followed by a
  // space, not a digit) — a bare `[^.]` stopped at the "." in "1.5x" and missed
  // ~30 RCV-scaled healer captains (Marco, Rayleigh, Big Mom, Shanks, ...).
  // "health" tolerates the legacy wording in Marguerite "recovers a small amount
  // of health at the end of each turn".
  ['heal_hp', [/\b(?:recovers?|heals?)\b(?:[^.]|\.\d){0,120}\b(?:HP|health)\b/i]],
  ['boost_rcv', [/\bboosts?\b[^.]{0,120}\bRCV\b/i]],
  [
    'apply_resilience',
    [/\bapplies?\b[^.]{0,120}\bresilience\b/i, /\bresilience\b[^.]{0,120}\bcrew\b/i],
  ],
  [
    'defeat_enemy',
    // The instant-KO / execute mechanic only. OPTC-DB canonical wording:
    // "Instantly defeats all enemies with [current] HP [equal to or]
    // below/less than N% [their MAX HP]" (also the ATK-scaled threshold
    // "instantly defeats all enemies with HP equal to or below Nx character's
    // ATK", the chance forms "chance to instantly defeat each enemy", and the
    // conditional "instantly defeats them/all enemies otherwise"). Every
    // genuine execute string in OPTC-DB contains the literal "instantly" and
    // appears ONLY on specials — 0 captain fields across the full upstream
    // details.js — so this key is specialText-only in practice.
    //
    // The former broad `/\bdefeats?\b[^.]{0,120}\benem/` alternative conflated
    // two UNRELATED families and is dropped:
    //   (1) the conditional kill-streak captain boost "If you defeat an enemy,
    //       increases ATK boost slightly" — a stacking ATK trigger, not an
    //       execute (captainAbility 34->0), and
    //   (2) the defensive guard "Protects from defeat ... to one enemy" (Loss
    //       Prevention / endure), the OPPOSITE effect.
    // specialText 51->24; captainAbility 34->0.
    [/\binstantly defeats?\b/i],
  ],
  ['end_of_turn_additional_damage', [/\bend of (?:each )?turn\b[^.]{0,120}\bdamage\b/i]],
  [
    'tap_timing_requirement',
    // A tap-timing-gated captain/special BOOST — the effect depends on PERFECT
    // tap timing (chains of PERFECT, "after the Nth PERFECT in a row", "until
    // the first hit other than PERFECT", "each time you hit a PERFECT"). The old
    // `PERFECT hits?` only caught the "... perfect hits" chain wording and missed
    // the majority (~155 captains that gate their boost on PERFECT). Broadened to
    // any `PERFECT` mention — in captain/special text PERFECT is always a
    // tap-timing signal — EXCLUDING the ubiquitous orb-keep form "hit a PERFECT
    // with <char>, keep <char>'s orb" (a conditional orb-keep, not a boost
    // requirement — sailor orb-keeps and captain #4135), which is intentionally
    // out of scope. Captain 38->193, specialText 139->149; sailor stays 0.
    [/\bPERFECT\b(?![^.]{0,45}\bkeep\b[^.]{0,20}\borbs?\b)/i, /\btap-?timing\b/i],
  ],
  [
    'extend_turn_duration',
    [/\bextends?\b[^.]{0,120}\bduration\b/i, /\bincreases?\b[^.]{0,120}\bduration\b/i],
  ],
  ['delayed_effect_launch', [/\bfollowing turn\b/i, /\bafter\s+\d+\s+turns?\b/i]],
  ['boost_max_hp', [/\bboosts?\b[^.]{0,120}\bmax HP\b/i]],
  [
    'apply_ally_status_effect',
    [/\bapplies?\b[^.]{0,120}\b(?:to|for)\b[^.]{0,80}\b(?:crew|characters|allies)\b/i],
  ],
  ['swap_captains', [/\bswaps?\b[^.]{0,120}\bcaptains?\b/i]],
  ['remove_beneficial_effect', [/\bremoves?\b[^.]{0,120}\bbeneficial effects?\b/i]],
  ['class_change', [/\bclass change\b/i, /\bchanges?\b[^.]{0,120}\bclass\b/i]],
  ['critical_hit_chance_boost', [/\bcritical hit chance\b/i]],
  ['territory', TERRITORY_PROVIDER_PATTERNS],
].map(([key, patterns]) => ({
  key,
  patterns,
}));
const CAPTAIN_ABILITY_SPECIAL_MATCHER_EXCLUDED_KEYS = new Set([
  'boost_atk',
  'boost_rcv',
  'boost_max_hp',
  'reduce_damage',
  'make_slots_favorable',
]);
const CAPTAIN_STRUCTURED_EFFECT_KEYS = new Set(['reduce_damage', 'make_slots_favorable']);
const CREWMATE_STAT_SCOPE_MATCHERS = {
  crew: [/\b(?:crew|all characters?)\b/i],
  self: [/\b(?:this character|self|own)\b/i],
  position: [
    /\b(?:position|positions?|1st|2nd|3rd|4th|5th|6th|first|second|third|fourth|fifth|sixth)\b/i,
  ],
  cost: [/\bcost\b/i, /\bcost of \d+(?: or less)?\b/i],
};

function createCrewmateTypeDamageMatcher(type) {
  return new RegExp(
    String.raw`\b(?:boosts?|increases?)\b[^.]{0,160}\bdamage\b[^.]{0,160}\b(?:against|to)\s+${type}\s+enemies\b|\bdamage dealt to\s+${type}\s+enemies\b`,
    'i',
  );
}

function createCrewmateStatMatchers(stat, scopePatterns) {
  return scopePatterns.map(
    (scopePattern) =>
      new RegExp(
        String.raw`\b(?:boosts?|adds?|increases?)\b[^.]{0,120}\b${stat}\b[^.]{0,160}${scopePattern.source}|${scopePattern.source}[^.]{0,160}\b${stat}\b`,
        'i',
      ),
  );
}

function createCrewmateStatScopePatterns(scope) {
  if (scope in CREWMATE_STAT_SCOPE_MATCHERS) {
    return CREWMATE_STAT_SCOPE_MATCHERS[scope];
  }

  if (CREWMATE_TYPES.includes(scope.toUpperCase())) {
    return [new RegExp(String.raw`\b${scope.toUpperCase()}\s+characters?\b`, 'i')];
  }

  const classEntry = CREWMATE_CLASSES.find((entry) => entry.slug === scope);

  return classEntry ? [new RegExp(String.raw`\b${classEntry.label}\s+characters?\b`, 'i')] : [];
}

const CREWMATE_ABILITY_MATCHERS = [
  ...CREWMATE_TYPES.map((type) => ({
    key: `crewmate_damage_boost_${type.toLowerCase()}_enemy`,
    patterns: [createCrewmateTypeDamageMatcher(type)],
  })),
  {
    key: 'crewmate_tap_timing_bonus',
    patterns: [
      /\badds?\b[^.]{0,160}\badditional damage\b[^.]{0,80}\bafter timing\b/i,
      /\btap-?timing bonus\b/i,
      /\bafter timing\b[^.]{0,120}\bdamage\b/i,
    ],
  },
  {
    key: 'crewmate_recover_special_bind',
    patterns: [/\b(?:reduces?|removes?)\b[^.]{0,160}\bspecial bind\b/i],
  },
  {
    key: 'crewmate_recover_special_reverse',
    patterns: [/\b(?:reduces?|removes?)\b[^.]{0,160}\bspecial reverse\b/i],
  },
  {
    // "Remove SFX" debuff == OPTC-DB "Blindness" in sailor ability text
    // (e.g. "Reduces Blindness duration by 3 turns").
    key: 'crewmate_recover_remove_sfx',
    patterns: [/\b(?:reduces?|removes?)\b[^.]{0,160}\b(?:blindness|SFX)\b/i],
  },
  {
    key: 'crewmate_recover_paralysis',
    patterns: [/\b(?:reduces?|removes?)\b[^.]{0,160}\bparalysis\b/i],
  },
  {
    key: 'crewmate_recover_burn',
    patterns: [/\b(?:reduces?|removes?)\b[^.]{0,160}\bburn\b/i],
  },
  {
    key: 'crewmate_recover_poisons',
    patterns: [/\b(?:reduces?|removes?)\b[^.]{0,160}\b(?:poison|poisons|toxic)\b/i],
  },
  {
    key: 'crewmate_recover_blow_away',
    patterns: [/\b(?:reduces?|removes?)\b[^.]{0,160}\bblow away\b/i],
  },
  {
    key: 'crewmate_recover_stun',
    patterns: [/\b(?:reduces?|removes?)\b[^.]{0,160}\bstun\b/i],
  },
  {
    key: 'crewmate_make_slots_favorable',
    patterns: [
      /\bmakes?\b[^.]{0,160}\b(?:orbs?|slots?)\b[^.]{0,80}\b(?:beneficial|matching|favorable)\b/i,
    ],
  },
  {
    key: 'crewmate_boost_slot_effect_rcv',
    patterns: [
      /\bboosts?\b[^.]{0,160}\b(?:slot|orb) effects?\b[^.]{0,80}\bRCV\b/i,
      /\bRCV\b[^.]{0,80}\b(?:slot|orb) effects?\b/i,
    ],
  },
  {
    key: 'crewmate_slot_carry_over',
    patterns: [
      /\b(?:orbs?|slots?)\b[^.]{0,160}\bcarry over\b/i,
      /\b(?:orbs?|slots?)\b[^.]{0,160}\bcarried over\b/i,
      /\b(?:orbs?|slots?)\b[^.]{0,160}\bremain\b[^.]{0,80}\bnext stage\b/i,
    ],
  },
  {
    key: 'crewmate_slot_change',
    patterns: [
      /\bchanges?\b[^.]{0,160}\b(?:orbs?|slots?)\b/i,
      /\btransforms?\b[^.]{0,160}\b(?:orbs?|slots?)\b/i,
    ],
  },
  {
    key: 'crewmate_tap_requirement_certain_slots',
    patterns: [/\bcertain slots?\b/i, /\btap-?timing\b[^.]{0,120}\bslots?\b/i],
  },
  {
    key: 'crewmate_special_charge_when_specials_used_by_others',
    patterns: [
      /\breduces?\b[^.]{0,160}\bspecial (?:cooldown|charge)\b[^.]{0,160}\bwhen another character uses? a special\b/i,
      /\bwhen specials? used by others\b/i,
    ],
  },
  {
    key: 'crewmate_special_charge_when_taking_damage',
    patterns: [
      /\breduces?\b[^.]{0,160}\bspecial (?:cooldown|charge)\b[^.]{0,160}\bwhen taking damage\b/i,
    ],
  },
  {
    key: 'crewmate_special_charge_start_of_quest',
    patterns: [
      /\breduces?\b[^.]{0,160}\bspecial (?:cooldown|charge)\b[^.]{0,160}\b(?:at start of quest|at the start of the fight|at the start of the quest)\b/i,
    ],
  },
  {
    key: 'crewmate_special_charge_when_afflicted_by_paralysis',
    patterns: [
      /\breduces?\b[^.]{0,160}\bspecial (?:cooldown|charge)\b[^.]{0,160}\bwhen afflict(?:ed)? by paralysis\b/i,
      /\breduces?\b[^.]{0,160}\bspecial (?:cooldown|charge)\b[^.]{0,160}\bwhen inflicted with paralysis\b/i,
    ],
  },
  ...['atk', 'rcv', 'hp'].flatMap((stat) =>
    [
      'crew',
      'self',
      'position',
      'cost',
      ...CREWMATE_TYPES.map((type) => type.toLowerCase()),
      ...CREWMATE_CLASSES.map((entry) => entry.slug),
    ].map((scope) => ({
      key: `crewmate_${stat}_boost_${scope}`,
      patterns: createCrewmateStatMatchers(
        stat.toUpperCase(),
        createCrewmateStatScopePatterns(scope),
      ),
    })),
  ),
  {
    key: 'crewmate_hp_recovery_eot',
    patterns: [
      /\bend of (?:each )?turn\b[^.]{0,160}\b(?:recovers?|heals?)\b[^.]{0,80}\bHP\b/i,
      /\b(?:recovers?|heals?)\b[^.]{0,160}\bHP\b[^.]{0,80}\bend of (?:each )?turn\b/i,
    ],
  },
].filter((entry) => entry.patterns.length > 0);
const IGNORED_TARGET_PATTERNS = [
  'special cooldown',
  'cooldown',
  'captain effect',
  'captain ability',
];

const TARGET_ALIASES = [
  {
    key: 'remove_slot_barrier',
    label: 'Remove Slot Barrier',
    matcher: (target) => target.includes('slot barrier') || target.includes('orb barrier'),
  },
  {
    key: 'remove_slot_bind',
    label: 'Remove Slot Bind',
    matcher: (target) => target.includes('slot bind') || target.includes('orb bind'),
  },
  {
    key: 'remove_ship_bind',
    label: 'Remove Ship Bind',
    matcher: (target) => target.includes('ship bind'),
  },
  {
    key: 'remove_sailor_despair',
    label: 'Remove Sailor Despair',
    matcher: (target) => target.includes('sailor despair'),
  },
  {
    key: 'remove_special_bind',
    label: 'Remove Special Bind',
    matcher: (target) => target.includes('special bind') || target.includes('silence'),
  },
  {
    key: 'remove_bind',
    label: 'Remove Bind',
    matcher: (target) =>
      (target === 'bind' || target.endsWith(' bind')) &&
      !target.includes('special bind') &&
      !target.includes('slot bind') &&
      !target.includes('orb bind') &&
      !target.includes('ship bind'),
  },
  {
    key: 'remove_despair',
    label: 'Remove Despair',
    // "Sailor Despair" is a DISTINCT debuff (it disables sailor abilities, not
    // the Captain ability that ordinary Despair disables) and is handled by
    // `remove_sailor_despair`. The bare substring 'despair' must not swallow it,
    // otherwise a Sailor-Despair-only cure is miscounted as a Despair cure
    // (mirrors the `remove_bind` exclusion of special/slot/orb/ship bind).
    matcher: (target) => target.includes('despair') && !target.includes('sailor despair'),
  },
  {
    key: 'remove_paralysis',
    label: 'Remove Paralysis',
    matcher: (target) => target.includes('paralysis'),
  },
  {
    // The enemy debuff surfaced in the picker as "Remove SFX" (it hides the
    // tap-timing SFX rings, making PERFECTs harder) is written as "Blindness"
    // in OPTC-DB ability text. Map that wording to the picker-visible
    // `remove_sfx` key so the Special filter matches these cleanse specials.
    // The `sfx` clause future-proofs against upstream renaming Blindness -> SFX.
    key: 'remove_sfx',
    label: 'Remove SFX',
    matcher: (target) =>
      target.includes('blindness') || target === 'blind' || target.includes('sfx'),
  },
  {
    key: 'remove_atk_down',
    label: 'Remove ATK Down',
    matcher: (target) => target.includes('atk down') || target.includes('attack down'),
  },
  {
    key: 'remove_damage_reduction',
    label: 'Remove Damage Reduction',
    matcher: (target) => target === 'damage reduction' || target === 'percent damage reduction',
  },
  {
    key: 'remove_enemy_orb_based_damage_reduction',
    label: 'Remove Orb-Based Damage Reduction',
    matcher: (target) =>
      target.includes('orb-based damage reduction') ||
      target.includes('orb based damage reduction'),
  },
  {
    key: 'remove_threshold_damage_reduction',
    label: 'Remove Threshold Damage Reduction',
    matcher: (target) => target.includes('threshold damage reduction'),
  },
  {
    key: 'remove_resilience',
    label: 'Remove Resilience',
    matcher: (target) => target.includes('resilience'),
  },
  {
    key: 'remove_enemy_increased_defense',
    label: 'Remove Increased Defense',
    matcher: (target) =>
      target.includes('increased defense') ||
      target === 'def up' ||
      target === 'defense up' ||
      target.endsWith(' def up') ||
      target.endsWith(' defense up'),
  },
  {
    key: 'remove_enemy_barrier',
    label: 'Remove Enemy Barrier',
    matcher: (target) =>
      target.includes('barrier') &&
      !target.includes('slot barrier') &&
      !target.includes('orb barrier'),
  },
  {
    key: 'remove_enemy_damage_nullification',
    label: 'Remove Damage Nullification',
    matcher: (target) => target.includes('damage nullification'),
  },
  {
    key: 'remove_enemy_atk_up',
    label: 'Remove ATK Up',
    matcher: (target) => target.includes('atk up') || target.includes('attack up'),
  },
  {
    key: 'remove_enemy_enrage',
    label: 'Remove Enrage',
    matcher: (target) => target.includes('enrage'),
  },
  {
    key: 'remove_enemy_end_of_turn_damage_percent_cut',
    label: 'Remove End of Turn Damage/Percent Cut',
    matcher: (target) =>
      target.includes('end of turn damage/percent cut') ||
      target.includes('end of turn damage percent cut') ||
      target.includes('end of turn damage') ||
      target.includes('percent cut'),
  },
  {
    key: 'remove_enemy_end_of_turn_heal',
    label: 'Remove End of Turn Heal',
    matcher: (target) => target.includes('end of turn heal'),
  },
  {
    key: 'remove_no_healing',
    label: 'Remove No Healing',
    matcher: (target) => target.includes('no healing'),
  },
  {
    key: 'remove_burn',
    label: 'Remove Burn',
    matcher: (target) => target.includes('burn'),
  },
  {
    key: 'remove_poison',
    label: 'Remove Poison',
    matcher: (target) => target === 'poison' || target === 'toxic' || target.includes('poison'),
  },
  {
    key: PAIN_ABILITY_KEY,
    label: PAIN_ABILITY_LABEL,
    matcher: (target) => target.includes('pain'),
  },
  {
    key: 'remove_chain_coefficient_reduction',
    label: 'Remove Chain Coefficient Reduction',
    matcher: (target) =>
      target.includes('chain coefficient reduction') ||
      target.includes('decrease chain multiplier growth rate'),
  },
  {
    key: 'remove_chain_multiplier_limit',
    label: 'Remove Chain Multiplier Limit',
    matcher: (target) => target.includes('chain multiplier limit') || target.includes('chain lock'),
  },
  {
    key: 'remove_increase_damage_taken',
    label: 'Remove Increase Damage Taken',
    matcher: (target) => target.includes('increase damage taken'),
  },
  {
    key: 'remove_healing_reduction',
    label: 'Remove Healing Reduction',
    matcher: (target) => target.includes('healing reduction'),
  },
  {
    key: 'remove_stun',
    label: 'Remove Stun',
    matcher: (target) => target.includes('stun'),
  },
];

const TURN_PATTERNS = [
  {
    isCompleteRemoval: false,
    // Accept "<target> duration by N turns", "<target> by N turns", and the
    // "by"-less "<target> duration N turns" form. The last covers an upstream
    // OPTC-DB wording quirk (e.g. Luffy & Whitebeard #3728 "reduces Paralysis
    // and Despair duration 1 turn") where the "by" is dropped; making "by"
    // optional only after the literal "duration" keeps the match tight.
    pattern: /(?:reduces?|removes?)\s+([^.;]+?)\s+(?:duration\s+(?:by\s+)?|by\s+)(\d+)\s+turns?/gi,
    resolveTurns: (match) => Number(match[2]),
  },
  {
    isCompleteRemoval: true,
    // Strip a trailing "duration" keyword the same way the "by N turns" pattern
    // above does, so "reduces <target> duration completely" captures "<target>"
    // rather than "<target> duration". Without this, targets matched by an exact
    // or endsWith rule (e.g. `remove_bind` requires target === 'bind', and
    // `remove_damage_reduction` requires target === 'percent damage reduction')
    // were missed on the "... duration completely" wording — e.g. RRG #4257 /
    // S-Shark #4311/#4312 / Kizaru #4544 "reduces Bind duration completely".
    // `includes`-based aliases are unaffected (the substring still matches).
    pattern: /(?:reduces?|removes?)\s+([^.;]+?)\s+(?:duration\s+)?completely/gi,
    resolveTurns: () => 99,
  },
];
const SELECTED_DEBUFF_PAIN_PATTERNS = [
  /(?:reduces?|removes?)\s+(?:\d+\s+)?selected\s+debuffs?\s+(?:duration\s+)?by\s+(\d+)\s+turns?/gi,
];
const STRUCTURED_TURN_SOURCE_ALIASES = new Map([
  ['crewmate_recover_special_bind', ['remove_special_bind']],
  ['crewmate_recover_special_reverse', ['reduce_special_charge']],
  ['crewmate_recover_remove_sfx', ['remove_sfx']],
  ['crewmate_recover_paralysis', ['remove_paralysis']],
  ['crewmate_recover_burn', ['remove_burn']],
  ['crewmate_recover_poisons', ['remove_poison']],
  ['crewmate_recover_stun', ['remove_stun']],
  ['crewmate_special_charge_start_of_quest', ['reduce_special_charge']],
  ['crewmate_special_charge_when_specials_used_by_others', ['reduce_special_charge']],
  ['crewmate_special_charge_when_taking_damage', ['reduce_special_charge']],
  ['crewmate_special_charge_when_afflicted_by_paralysis', ['reduce_special_charge']],
  ['support_status_effect_recovery_despair', ['remove_despair']],
  ['support_status_effect_recovery_bind', ['remove_bind']],
  ['support_status_effect_recovery_paralysis', ['remove_paralysis']],
  ['support_status_effect_recovery_special_bind', ['remove_special_bind']],
  ['support_status_effect_recovery_poisons', ['remove_poison']],
  ['support_status_effect_recovery_burn', ['remove_burn']],
  ['support_status_effect_recovery_increased_damage_taken', ['remove_increase_damage_taken']],
  ['support_status_effect_recovery_atk_down', ['remove_atk_down']],
  [
    'support_status_effect_recovery_reduce_chain_multiplier_growth_rate',
    ['remove_chain_coefficient_reduction'],
  ],
  ['support_status_effect_recovery_lock_chain_multiplier', ['remove_chain_multiplier_limit']],
  ['support_status_effect_recovery_remove_sfx', ['remove_sfx']],
  ['support_reduce_enemy_effect_turns_def_up', ['remove_enemy_increased_defense']],
  ['support_reduce_enemy_effect_turns_def_up_tap_timing', ['remove_enemy_increased_defense']],
  ['support_reduce_enemy_effect_turns_damage_reduction', ['remove_damage_reduction']],
  ['support_reduce_enemy_effect_turns_damage_reduction_tap_timing', ['remove_damage_reduction']],
  ['support_reduce_enemy_effect_turns_damage_threshold', ['remove_threshold_damage_reduction']],
  [
    'support_reduce_enemy_effect_turns_damage_threshold_tap_timing',
    ['remove_threshold_damage_reduction'],
  ],
  [
    'support_reduce_enemy_effect_turns_end_of_turn_damage',
    ['remove_enemy_end_of_turn_damage_percent_cut'],
  ],
  [
    'support_reduce_enemy_effect_turns_end_of_turn_damage_tap_timing',
    ['remove_enemy_end_of_turn_damage_percent_cut'],
  ],
  ['support_reduce_enemy_effect_turns_enrage', ['remove_enemy_enrage']],
  ['support_reduce_enemy_effect_turns_atk_boost', ['remove_enemy_atk_up']],
  ['support_reduce_enemy_effect_turns_resilience', ['remove_resilience']],
  ['support_reduce_enemy_effect_turns_barrier', ['remove_enemy_barrier']],
]);
const STRUCTURED_GENERIC_TURN_KEYS = new Set([
  'crewmate_special_charge_start_of_quest',
  'crewmate_special_charge_when_specials_used_by_others',
  'crewmate_special_charge_when_taking_damage',
  'crewmate_special_charge_when_afflicted_by_paralysis',
]);
const SUPPORT_GENERIC_TURN_KEYS = new Set([
  'support_atk_boost',
  'support_type_effect_boost',
  'support_slot_effect_boost',
  'support_chain_multiplier_boost',
  'support_chain_multiplier_lock',
  'support_additional_damage_boost',
  'support_base_atk_boost_damage',
  'support_damage_boost_against_certain_enemies',
  'support_damage_boost_delay',
  'support_damage_boost_def_down',
  'support_damage_boost_poison',
  'support_damage_boost_venom',
  'support_damage_boost_progressive_poison',
  'support_damage_boost_other',
  'support_damage_reduction_turn',
  'support_damage_reduction_nullification',
  'support_apply_status_effect_def_down',
  'support_apply_status_effect_unique_effect',
  'support_apply_status_effect_poison',
  'support_apply_status_effect_increased_damage_taken',
  'support_apply_status_effect_reduce_resistance',
  'support_apply_status_effect_delay',
]);

export function normalizeLegacyAbilityText(value) {
  const fragments = [...new Set(extractTextFragments(value))].filter(Boolean);
  return fragments.join('. ');
}

function normalizeHtmlAbilityText(value) {
  return normalizeHtmlToText(value);
}

// Orb-token spellings that carry inner punctuation/whitespace break sentence and
// clause splitting (a `. ` inside `[S. BOMB]` reads as a sentence boundary) and the
// `[^.;]`-bounded effect matchers. Canonicalize them to their bracketed slot-token
// form up front so every downstream matcher and slot-token extractor sees a clean,
// period-free token. `[S. BOMB]` (the Super Bomb orb) is currently the only such
// spelling in upstream data; add future aliases here.
const ORB_TOKEN_TEXT_ALIASES = [[/\[\s*S\.\s*BOMB\s*\]/gi, '[SUPERBOMB]']];

function canonicalizeOrbTokens(text) {
  return ORB_TOKEN_TEXT_ALIASES.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  );
}

export function extractPrimaryAbilityBranchText(value) {
  const normalizedText = canonicalizeOrbTokens(normalizeLegacyAbilityText(value));

  if (!normalizedText.length) {
    return '';
  }

  const sentences = splitAbilityTextIntoSentences(normalizedText);

  if (sentences.length <= 1) {
    return normalizedText;
  }

  const primaryFingerprint = createBranchStarterFingerprint(sentences[0]);
  const selectedSentences = [sentences[0]];

  for (let index = 1; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const fingerprint = createBranchStarterFingerprint(sentence);

    if (
      primaryFingerprint.length &&
      fingerprint === primaryFingerprint &&
      looksLikeIndependentAbilityBranch(sentence)
    ) {
      break;
    }

    selectedSentences.push(sentence);
  }

  return selectedSentences.join('. ');
}

function resolveStructuredTurnMinTurns(key, normalizedText) {
  const aliases = STRUCTURED_TURN_SOURCE_ALIASES.get(key) ?? [key];
  const minTurns = [];

  TURN_PATTERNS.forEach(({ pattern, resolveTurns }) => {
    for (const match of normalizedText.matchAll(pattern)) {
      const rawTarget = String(match[1] ?? '').trim();
      const turns = resolveTurns(match);

      if (!Number.isFinite(turns) || turns <= 0) {
        continue;
      }

      normalizeTargetSegments(rawTarget).forEach((segment) => {
        resolveAbilityDefinitions(segment).forEach((normalized) => {
          if (aliases.includes(normalized.key)) {
            minTurns.push(Math.floor(turns));
          }
        });
      });
    }
  });

  if (aliases.includes(PAIN_ABILITY_KEY)) {
    SELECTED_DEBUFF_PAIN_PATTERNS.forEach((pattern) => {
      for (const match of normalizedText.matchAll(pattern)) {
        const turns = Number(match[1]);

        if (Number.isFinite(turns) && turns > 0) {
          minTurns.push(Math.floor(turns));
        }
      }
    });
  }

  if (minTurns.length > 0) {
    return Math.max(...minTurns);
  }

  return STRUCTURED_GENERIC_TURN_KEYS.has(key) ? resolveMaxTurnCountFromText(normalizedText) : null;
}

function resolveMaxTurnCountFromText(value) {
  const normalizedText = extractPrimaryAbilityBranchText(value);
  const minTurns = [...normalizedText.matchAll(/\b(?:by|for)\s+(\d+)\s+turns?\b/gi)]
    .map((match) => Number(match[1]))
    .filter((turns) => Number.isFinite(turns) && turns > 0)
    .map((turns) => Math.floor(turns));

  return minTurns.length > 0 ? Math.max(...minTurns) : null;
}

function resolveMaxDurationTurnCountFromText(value) {
  const normalizedText = extractPrimaryAbilityBranchText(value);
  const minTurns = [...normalizedText.matchAll(/\bfor\s+(\d+)\s+turns?\b/gi)]
    .map((match) => Number(match[1]))
    .filter((turns) => Number.isFinite(turns) && turns > 0)
    .map((turns) => Math.floor(turns));

  return minTurns.length > 0 ? Math.max(...minTurns) : null;
}

export function analyzeBuilderAbilityText(value, source) {
  const normalizedText = extractPrimaryAbilityBranchText(value);

  if (!normalizedText.length) {
    return [];
  }

  const abilities = [];
  const seen = new Set();

  if (source === 'superSpecialText') {
    addSpecialAbilityMatches(abilities, seen, normalizedText, source, new Set(['territory']));

    return abilities;
  }

  TURN_PATTERNS.forEach(({ pattern, resolveTurns, isCompleteRemoval }) => {
    for (const match of normalizedText.matchAll(pattern)) {
      const rawTarget = String(match[1] ?? '').trim();
      const minTurns = resolveTurns(match);

      if (!Number.isFinite(minTurns) || minTurns <= 0) {
        continue;
      }

      normalizeTargetSegments(rawTarget).forEach((segment) => {
        resolveAbilityDefinitions(segment).forEach((normalized) => {
          const ability = {
            key: normalized.key,
            label: normalized.label,
            minTurns,
            isCompleteRemoval,
            slotTokens: normalized.slotTokens,
            source,
            coverageMode: DEFAULT_COVERAGE_MODE,
          };
          addAbility(abilities, seen, ability);
        });
      });
    }
  });

  SELECTED_DEBUFF_PAIN_PATTERNS.forEach((pattern) => {
    for (const match of normalizedText.matchAll(pattern)) {
      const minTurns = Number(match[1]);

      if (!Number.isFinite(minTurns) || minTurns <= 0) {
        continue;
      }

      addAbility(abilities, seen, {
        key: PAIN_ABILITY_KEY,
        label: PAIN_ABILITY_LABEL,
        minTurns,
        isCompleteRemoval: false,
        slotTokens: [],
        source,
        coverageMode: 'selectedDebuff',
      });
    }
  });

  EXPLICIT_BUILDER_ABILITIES.forEach((definition) => {
    if (Array.isArray(definition.sources) && !definition.sources.includes(source)) {
      return;
    }

    if (!definition.matcher(normalizedText)) {
      return;
    }

    const ability = {
      key: definition.key,
      label: definition.label,
      minTurns: null,
      isCompleteRemoval: false,
      slotTokens: [],
      source,
      coverageMode: DEFAULT_COVERAGE_MODE,
    };
    addAbility(abilities, seen, ability);
  });

  if (source === 'specialText' || source === 'captainAbility') {
    addSpecialAbilityMatches(abilities, seen, normalizedText, source);
  }

  if (source === 'captainAbility') {
    addCaptainAbilityStructuredEffectMatches(abilities, seen, normalizedText);
  }

  if (source === 'sailorAbilities') {
    CREWMATE_ABILITY_MATCHERS.forEach(({ key, patterns }) => {
      const definition = STRUCTURED_ABILITY_METADATA_BY_KEY.get(key);

      if (!definition || !patterns.some((pattern) => pattern.test(normalizedText))) {
        return;
      }

      addAbility(abilities, seen, {
        key,
        label: definition.label,
        minTurns: resolveStructuredTurnMinTurns(key, normalizedText),
        isCompleteRemoval: false,
        slotTokens: [],
        source,
        coverageMode: DEFAULT_COVERAGE_MODE,
      });
    });
  }

  return abilities;
}

function addSpecialAbilityMatches(abilities, seen, normalizedText, source, allowedKeys = null) {
  SPECIAL_ABILITY_MATCHERS.forEach(({ key, patterns }) => {
    const definition = STRUCTURED_ABILITY_METADATA_BY_KEY.get(key);

    if (
      !definition ||
      (allowedKeys && !allowedKeys.has(key)) ||
      (source === 'captainAbility' && CAPTAIN_ABILITY_SPECIAL_MATCHER_EXCLUDED_KEYS.has(key)) ||
      !patterns.some((pattern) => pattern.test(normalizedText))
    ) {
      return;
    }

    addAbility(abilities, seen, {
      key,
      label: definition.label,
      minTurns: resolveStructuredTurnMinTurns(key, normalizedText),
      isCompleteRemoval: false,
      slotTokens: [],
      source,
      coverageMode: DEFAULT_COVERAGE_MODE,
    });
  });
}

function addCaptainAbilityStructuredEffectMatches(abilities, seen, normalizedText) {
  addCaptainDamageReductionMatches(abilities, seen, normalizedText);
  addCaptainFavorableSlotMatches(abilities, seen, normalizedText);
}

function addCaptainDamageReductionMatches(abilities, seen, normalizedText) {
  const definition = STRUCTURED_ABILITY_METADATA_BY_KEY.get('reduce_damage');

  if (!definition) {
    return;
  }

  for (const clause of extractCaptainEffectClauses(normalizedText)) {
    // "reduces" must directly govern "damage received/taken" — clauses like
    // "reduces HP ..., Increases damage received" (glass-cannon downside),
    // "reduces Despair ... and deals Nx the damage taken" (counter), and
    // "reduces Paralysis ... and recovers N% of damage taken" (heal) are NOT
    // crew damage reduction and must not match. ("take" tolerates the upstream
    // typo in Sanji "reduces damage take by 10%".)
    const damageReductionMatch = clause.match(
      /\breduces?\s+(?:any\s+)?damage (?:received|taken|take)\b/i,
    );

    if (!damageReductionMatch) {
      continue;
    }

    const match = clause.match(
      /\breduces?\s+(?:any\s+)?damage (?:received|taken|take)\b[^.;]{0,80}\bby\s+(\d+(?:\.\d+)?)%/i,
    );
    const minEffectValue = match ? normalizeEffectValue(match[1]) : null;

    const ability = {
      key: 'reduce_damage',
      label: definition.label,
      minTurns: null,
      isCompleteRemoval: false,
      slotTokens: [],
      source: 'captainAbility',
      coverageMode: DEFAULT_COVERAGE_MODE,
      effectTargetScope: resolveCaptainDamageReductionTargetScope(clause),
    };

    if (minEffectValue !== null) {
      ability.minEffectValue = minEffectValue;
    }

    addAbility(abilities, seen, ability);
  }
}

function addCaptainFavorableSlotMatches(abilities, seen, normalizedText) {
  const definition = STRUCTURED_ABILITY_METADATA_BY_KEY.get('make_slots_favorable');

  if (!definition) {
    return;
  }

  for (const clause of extractCaptainEffectClauses(normalizedText)) {
    if (!/\bmakes?\b[^.;]{0,160}\b(?:orbs?|slots?)\b[^.;]{0,80}\b(?:beneficial|matching|favorable)\b/i.test(clause)) {
      continue;
    }

    const effectSegment = extractFavorableSlotEffectSegment(clause);
    const slotTokens = extractSlotTokens(extractFavorableSlotTokenSegment(effectSegment));

    addAbility(abilities, seen, {
      key: 'make_slots_favorable',
      label: definition.label,
      minTurns: null,
      isCompleteRemoval: false,
      slotTokens,
      source: 'captainAbility',
      coverageMode: DEFAULT_COVERAGE_MODE,
      effectTargetScope: resolveCaptainEffectTargetScope(effectSegment, 'any'),
    });
  }
}

function extractFavorableSlotEffectSegment(clause) {
  const match = clause.match(
    /\bmakes?\b[^.;]{0,160}\b(?:orbs?|slots?)\b[^.;]{0,80}\b(?:beneficial|matching|favorable)\b(?:\s+(?:for|to|of)\s+[^,.;]*?(?:all characters?|characters?|crew|allies|subs?|crewmates?|non-?captains?|captains?|this character|self|own)\b)?/i,
  );

  return match ? match[0] : clause;
}

function extractFavorableSlotTokenSegment(effectSegment) {
  const match = effectSegment.match(
    /^(.*?\b(?:orbs?|slots?)\b[^.;]{0,80}\b(?:beneficial|matching|favorable)\b)/i,
  );

  return match ? match[1] : effectSegment;
}

function extractCaptainEffectClauses(normalizedText) {
  return normalizedText
    .split(/\.\s+|;\s+/g)
    .flatMap((sentence) =>
      sentence.split(/,\s+(?=(?:and\s+)?(?:reduces?|makes?)\b)|\s+and\s+(?=(?:reduces?|makes?)\b)/gi),
    )
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function resolveCaptainEffectTargetScope(text, fallback = 'any') {
  if (/\b(?:this character|self|own)\b/i.test(text)) {
    return 'self';
  }

  if (/\b(?:subs?|crewmates?|non-?captains?)\b/i.test(text)) {
    return 'subs';
  }

  if (/\b(?:captains?)\b/i.test(text)) {
    return 'captains';
  }

  if (/\b(?:all characters?|crew|allies)\b/i.test(text)) {
    return 'crew';
  }

  return fallback;
}

function resolveCaptainDamageReductionTargetScope(clause) {
  const match = clause.match(
    /\bdamage (?:received|taken)\b[^.;]{0,100}\bby\s+\d+(?:\.\d+)?%([^.;]*)/i,
  );
  const explicitTargetMatch = String(match?.[1] ?? '').match(
    /^\s*(?:for|to|of)\s+((?:all characters?|crew|allies|captains?|this character|self|own|subs?|crewmates?|non-?captains?)(?:\b[^.;]*)?)/i,
  );

  return explicitTargetMatch
    ? resolveCaptainEffectTargetScope(explicitTargetMatch[1], 'crew')
    : 'crew';
}

function normalizeEffectValue(value) {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null;
}

export function analyzeSpecialText(value) {
  return analyzeBuilderAbilityText(value, 'specialText');
}

function normalizePotentialAbilityLabel(value) {
  return String(value ?? '')
    .replace(/\[[^\]]+\]/g, (match) => match.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function resolvePotentialAbilityKey(name) {
  return POTENTIAL_ABILITY_ALIASES.get(normalizePotentialAbilityLabel(name)) ?? null;
}

function addStructuredPotentialAbility(abilities, seen, key, source, minTurns = null) {
  const definition = STRUCTURED_ABILITY_METADATA_BY_KEY.get(key);

  if (!definition) {
    return;
  }

  addAbility(abilities, seen, {
    key,
    label: definition.label,
    minTurns,
    isCompleteRemoval: false,
    slotTokens: [],
    source,
    coverageMode: DEFAULT_COVERAGE_MODE,
  });
}

function extractPotentialBuilderAbilities(character) {
  const abilities = [];
  const seen = new Set();
  const potentialEntries = Array.isArray(character.detail?.potentialAbilities)
    ? character.detail.potentialAbilities
    : [];

  potentialEntries.forEach((entry) => {
    const key = resolvePotentialAbilityKey(entry?.Name);

    if (!key) {
      return;
    }

    addStructuredPotentialAbility(abilities, seen, key, 'potentialAbilities');
  });

  if (character.detail?.superTandemData) {
    addStructuredPotentialAbility(abilities, seen, 'potential_super_tandem', 'superTandemData');

    if (isSuperTandemBoostData(character.detail.superTandemData)) {
      const minTurns = resolveMaxDurationTurnCountFromText(character.detail.superTandemData);

      addStructuredPotentialAbility(
        abilities,
        seen,
        'potential_super_tandem_boost',
        'superTandemData',
        minTurns,
      );
    }
  }

  if (character.detail?.finalTapData) {
    const minTurns = resolveMaxDurationTurnCountFromText(character.detail.finalTapData);

    addStructuredPotentialAbility(
      abilities,
      seen,
      'potential_final_tap_sugo_special',
      'finalTapData',
      minTurns,
    );
  }

  if (character.detail?.rushSugoSpecialData) {
    addStructuredPotentialAbility(
      abilities,
      seen,
      'potential_rush_sugo_special',
      'rushSugoSpecialData',
    );
  }

  return abilities;
}

function isSuperTandemBoostData(value) {
  return extractTextFragments(value).some((fragment) =>
    SUPER_TANDEM_BOOST_PATTERNS.some((pattern) => pattern.test(fragment)),
  );
}

function resolvePotentialSampleText(character) {
  const fragments = [
    ...extractTextFragments(character.detail?.potentialAbilities ?? []),
    ...extractTextFragments(character.detail?.superTandemData ?? null),
    ...extractTextFragments(character.detail?.finalTapData ?? null),
    ...extractTextFragments(character.detail?.rushSugoSpecialData ?? null),
  ]
    .map((fragment) => String(fragment).trim())
    .filter(Boolean);

  return fragments.join('. ');
}

function addStructuredSupportAbility(abilities, seen, key, minTurns = null) {
  const definition = STRUCTURED_ABILITY_METADATA_BY_KEY.get(key);

  if (!definition) {
    return;
  }

  addAbility(abilities, seen, {
    key,
    label: definition.label,
    minTurns,
    isCompleteRemoval: false,
    slotTokens: [],
    source: 'supportData',
    coverageMode: DEFAULT_COVERAGE_MODE,
  });
}

function extractSupportBuilderAbilities(character) {
  const abilities = [];
  const seen = new Set();
  const supportEntries = Array.isArray(character.detail?.supportData)
    ? character.detail.supportData
    : [];

  supportEntries.forEach((entry) => {
    const canonicalText = resolveSupportCanonicalText(entry);

    if (!canonicalText) {
      return;
    }

    collectSupportAbilityKeys(canonicalText).forEach((key) =>
      addStructuredSupportAbility(
        abilities,
        seen,
        key,
        resolveSupportAbilityMinTurns(key, canonicalText),
      ),
    );
  });

  return abilities;
}

function resolveSupportAbilityMinTurns(key, text) {
  const aliasedMinTurns = resolveStructuredTurnMinTurns(key, text);

  if (aliasedMinTurns !== null) {
    return aliasedMinTurns;
  }

  return SUPPORT_GENERIC_TURN_KEYS.has(key) ? resolveMaxDurationTurnCountFromText(text) : null;
}

function resolveSupportCanonicalText(entry) {
  if (!entry || typeof entry !== 'object') {
    return '';
  }

  const levelDescriptions = Array.isArray(entry.levelDescriptions)
    ? entry.levelDescriptions
    : Array.isArray(entry.description)
      ? entry.description
      : [];

  return (
    [...levelDescriptions]
      .map((value) => String(value).trim())
      .filter(Boolean)
      .at(-1) ?? ''
  );
}

function resolveSupportSampleText(character) {
  const fragments = (
    Array.isArray(character.detail?.supportData) ? character.detail.supportData : []
  )
    .map((entry) => {
      const supportedCharactersText = String(
        entry?.supportedCharactersText ?? entry?.Characters ?? '',
      ).trim();
      const canonicalText = resolveSupportCanonicalText(entry);

      if (!canonicalText.length) {
        return '';
      }

      return supportedCharactersText.length
        ? `${supportedCharactersText}: ${canonicalText}`
        : canonicalText;
    })
    .filter(Boolean);

  return fragments.join('. ');
}

function collectSupportAbilityKeys(value) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text.length) {
    return [];
  }

  const keys = new Set();

  addSupportPassiveBaseStatKeys(keys, text);
  addSupportDamageReductionKeys(keys, text);
  addSupportEnemyEffectReductionKeys(keys, text);
  addSupportSlotKeys(keys, text);
  addSupportBoostKeys(keys, text);
  addSupportStatusRecoveryKeys(keys, text);
  addSupportOtherKeys(keys, text);
  addSupportApplyStatusEffectKeys(keys, text);

  return [...keys];
}

function addSupportPassiveBaseStatKeys(keys, text) {
  const targetStats = new Set(
    (
      text
        .match(
          /supported character'?s\s+base\s+([A-Z]+)(?:\s+and\s+([A-Z]+))?(?:\s+and\s+([A-Z]+))?/i,
        )
        ?.slice(1) ?? []
    )
      .map((value) =>
        String(value ?? '')
          .trim()
          .toUpperCase(),
      )
      .filter((value) => ['ATK', 'HP', 'RCV'].includes(value)),
  );

  if (targetStats.size === 0 || !/this character'?s\s+base/i.test(text)) {
    return;
  }

  const suffix = targetStats.size > 1 ? '_additional' : '';

  if (targetStats.has('ATK')) {
    keys.add(`support_base_atk_boost${suffix}`);
  }

  if (targetStats.has('HP')) {
    keys.add(`support_base_hp_boost${suffix}`);
  }

  if (targetStats.has('RCV')) {
    keys.add(`support_base_rcv_boost${suffix}`);
  }
}

function addSupportDamageReductionKeys(keys, text) {
  if (
    /\breduce(?:s|d)?\b[^.]{0,160}\bdamage\b[^.]{0,160}\bover\b/i.test(text) ||
    /\breduce damage over certain amount\b/i.test(text) ||
    /\bdamage threshold\b/i.test(text)
  ) {
    keys.add('support_damage_reduction_reduce_damage_over_certain_amount');
    return;
  }

  if (/\bnullif(?:y|ies)\b[^.]{0,120}\bdamage\b/i.test(text)) {
    keys.add('support_damage_reduction_nullification');
    return;
  }

  if (
    /\breduce(?:s|d)?\b[^.]{0,160}\bdamage (?:received|taken)\b[^.]{0,80}\bfor \d+ turns?\b/i.test(
      text,
    ) ||
    /\bdamage reduction\b[^.]{0,80}\bfor \d+ turns?\b/i.test(text)
  ) {
    keys.add('support_damage_reduction_turn');
    return;
  }

  if (
    /\breduce(?:s|d)?\b[^.]{0,160}\bdamage (?:received|taken)\b/i.test(text) ||
    /\bdamage reduction\b/i.test(text)
  ) {
    keys.add('support_damage_reduction_permanent');
  }
}

function addSupportEnemyEffectReductionKeys(keys, text) {
  if (
    !/\b(?:reduce(?:s|d)?|remove(?:s|d)?)\b/i.test(text) ||
    !/\b(?:duration|turns?)\b/i.test(text)
  ) {
    return;
  }

  const isTapTiming = SUPPORT_TAP_TIMING_TRIGGER_PATTERNS.some((pattern) => pattern.test(text));
  const entries = [
    {
      key: isTapTiming
        ? 'support_reduce_enemy_effect_turns_def_up_tap_timing'
        : 'support_reduce_enemy_effect_turns_def_up',
      pattern: /\b(?:DEF Up|defense up|increased defense)\b/i,
    },
    {
      key: isTapTiming
        ? 'support_reduce_enemy_effect_turns_damage_reduction_tap_timing'
        : 'support_reduce_enemy_effect_turns_damage_reduction',
      pattern: /\b(?:damage reduction|percent damage reduction)\b/i,
      exclude: /\bthreshold damage reduction\b/i,
    },
    {
      key: isTapTiming
        ? 'support_reduce_enemy_effect_turns_damage_threshold_tap_timing'
        : 'support_reduce_enemy_effect_turns_damage_threshold',
      pattern: /\b(?:damage threshold|threshold damage reduction)\b/i,
    },
    {
      key: isTapTiming
        ? 'support_reduce_enemy_effect_turns_end_of_turn_damage_tap_timing'
        : 'support_reduce_enemy_effect_turns_end_of_turn_damage',
      pattern: /\bend of turn damage\b|\bpercent cut\b/i,
    },
    {
      key: 'support_reduce_enemy_effect_turns_enrage',
      pattern: /\benrage\b/i,
    },
    {
      key: 'support_reduce_enemy_effect_turns_atk_boost',
      pattern: /\b(?:ATK Up|attack up|ATK boost|attack boost)\b/i,
    },
    {
      key: 'support_reduce_enemy_effect_turns_resilience',
      pattern: /\bresilience\b/i,
    },
    {
      key: 'support_reduce_enemy_effect_turns_barrier',
      pattern: /\bbarrier\b/i,
    },
  ];

  entries.forEach((entry) => {
    if (!entry.pattern.test(text) || entry.exclude?.test(text)) {
      return;
    }

    keys.add(entry.key);
  });
}

function addSupportSlotKeys(keys, text) {
  if (/\blocks?\b[^.]{0,120}\b(?:slots?|orbs?)\b/i.test(text)) {
    keys.add('support_lock_slots');
  }

  if (
    /\bmakes?\b[^.]{0,160}\b(?:slots?|orbs?)\b[^.]{0,80}\b(?:beneficial|matching|favorable)\b/i.test(
      text,
    )
  ) {
    keys.add('support_favorable_slots');
  }

  if (
    /\b(?:changes?|boosts?|increases?)\b[^.]{0,120}\b(?:slot|orb)\b[^.]{0,80}\bchance\b/i.test(text)
  ) {
    keys.add('support_change_slot_chance');
  }

  if (/\bswaps?\b[^.]{0,120}\b(?:slots?|orbs?)\b/i.test(text)) {
    keys.add('support_swap_slots');
  }

  if (
    /\bnullif(?:y|ies)\b[^.]{0,160}\bATK reduction\b[^.]{0,80}\b(?:from|of)\b[^.]{0,40}\b(?:slots?|orbs?)\b/i.test(
      text,
    ) ||
    /\bnullif(?:y|ies)\b[^.]{0,160}\b(?:slots?|orbs?)\b[^.]{0,80}\bATK reduction\b/i.test(text)
  ) {
    keys.add('support_nullify_atk_reduction_effect_from_slots');
  }

  if (
    /\b(?:changes?|transforms?)\b[^.]{0,180}\[BLOCK\][^.]{0,160}\b(?:slots?|orbs?)\b/i.test(text) ||
    /\bchange\b[^.]{0,160}\[BLOCK\][^.]{0,160}\b(?:slots?|orbs?)\b/i.test(text)
  ) {
    keys.add('support_change_block_slots');
  } else if (/\b(?:changes?|transforms?)\b[^.]{0,160}\b(?:slots?|orbs?)\b/i.test(text)) {
    keys.add('support_slot_change_normal');
  }
}

function addSupportBoostKeys(keys, text) {
  if (/\bend of (?:each )?turn\b[^.]{0,120}\bdamage\b/i.test(text)) {
    keys.add('support_end_of_turn_additional_damage');
  }

  if (
    /\bboosts?\b[^.]{0,120}\badditional damage\b/i.test(text) ||
    /\badditional damage boost\b/i.test(text)
  ) {
    keys.add('support_additional_damage_boost');
  }

  if (/\bboosts?\b[^.]{0,120}\bATK\b/i.test(text) && !/\bbase ATK\b/i.test(text)) {
    keys.add('support_atk_boost');
  }

  if (/\b(?:type effects?|color affinity)\b/i.test(text)) {
    keys.add('support_type_effect_boost');
  }

  if (
    /\bboosts?\b[^.]{0,120}\b(?:slot|orb) effects?\b/i.test(text) ||
    /\bslot effect boost\b/i.test(text)
  ) {
    keys.add('support_slot_effect_boost');
  }

  if (
    /\blocks?\b[^.]{0,120}\bchain(?: multiplier)?\b/i.test(text) ||
    /\bchain multiplier lock\b/i.test(text)
  ) {
    keys.add('support_chain_multiplier_lock');
  } else if (/\b(?:adds?|boosts?|increases?)\b[^.]{0,120}\bchain(?: multiplier)?\b/i.test(text)) {
    keys.add('support_chain_multiplier_boost');
  }

  if (
    /\b(?:boosts?|adds?|increases?)\b[^.]{0,120}\bbase ATK\b/i.test(text) &&
    !/this character'?s\s+base ATK/i.test(text)
  ) {
    keys.add('support_base_atk_boost_damage');
  }

  const isDamageBoostText =
    /\bboosts?\b[^.]{0,160}\bdamage\b/i.test(text) ||
    /\bdamage boost\b/i.test(text) ||
    /\bdamage dealt to\b/i.test(text);

  if (!isDamageBoostText) {
    return;
  }

  if (/\bdelayed enemies?\b|\bdelay\b/i.test(text)) {
    keys.add('support_damage_boost_delay');
    return;
  }

  if (/\b(?:DEF Down|defense down|defense reduced|DEF reduced)\b/i.test(text)) {
    keys.add('support_damage_boost_def_down');
    return;
  }

  if (/\bprogressive poison\b/i.test(text)) {
    keys.add('support_damage_boost_progressive_poison');
    return;
  }

  if (/\bvenom\b|\btoxic\b/i.test(text)) {
    keys.add('support_damage_boost_venom');
    return;
  }

  if (/\bpoison(?:ed)?\b/i.test(text)) {
    keys.add('support_damage_boost_poison');
    return;
  }

  if (
    /\b(?:damage dealt to|damage against|boosts? damage (?:against|to))\b[^.]{0,120}(?:\[?(?:STR|DEX|QCK|PSY|INT)\]?|fighter|slasher|striker|shooter|free spirit|driven|cerebral|powerhouse)\s+enemies?\b/i.test(
      text,
    ) ||
    /\bcertain enemies\b/i.test(text)
  ) {
    keys.add('support_damage_boost_against_certain_enemies');
    return;
  }

  keys.add('support_damage_boost_other');
}

function addSupportStatusRecoveryKeys(keys, text) {
  const entries = [
    [
      'support_status_effect_recovery_despair',
      /\b(?:reduce(?:s|d)?|remove(?:s|d)?)\b[^.]{0,160}\bdespair\b/i,
    ],
    [
      'support_status_effect_recovery_bind',
      /\b(?:reduce(?:s|d)?|remove(?:s|d)?)\b[^.]{0,160}(?<!\bspecial\s)(?<!\bslot\s)(?<!\borb\s)(?<!\bship\s)\bbind\b/i,
    ],
    [
      'support_status_effect_recovery_paralysis',
      /\b(?:reduce(?:s|d)?|remove(?:s|d)?)\b[^.]{0,160}\bparalysis\b/i,
    ],
    [
      'support_status_effect_recovery_special_bind',
      /\b(?:reduce(?:s|d)?|remove(?:s|d)?)\b[^.]{0,160}\bspecial bind\b/i,
    ],
    [
      'support_status_effect_recovery_poisons',
      /\b(?:reduce(?:s|d)?|remove(?:s|d)?)\b[^.]{0,160}\b(?:poison|venom|toxic)\b/i,
    ],
    [
      'support_status_effect_recovery_burn',
      /\b(?:reduce(?:s|d)?|remove(?:s|d)?)\b[^.]{0,160}\bburn\b/i,
    ],
    [
      'support_status_effect_recovery_increased_damage_taken',
      /\b(?:reduce(?:s|d)?|remove(?:s|d)?)\b[^.]{0,160}\bincreased damage taken\b/i,
    ],
    [
      'support_status_effect_recovery_atk_down',
      /\b(?:reduce(?:s|d)?|remove(?:s|d)?)\b[^.]{0,160}\b(?:ATK Down|attack down)\b/i,
    ],
    [
      'support_status_effect_recovery_reduce_chain_multiplier_growth_rate',
      /\b(?:reduce(?:s|d)?|remove(?:s|d)?)\b[^.]{0,160}\b(?:reduce|decrease)\s+chain multiplier growth rate\b/i,
    ],
    [
      'support_status_effect_recovery_lock_chain_multiplier',
      /\b(?:reduce(?:s|d)?|remove(?:s|d)?)\b[^.]{0,160}\block chain multiplier\b/i,
    ],
    [
      // "Remove SFX" debuff == OPTC-DB "Blindness" in support ability text.
      'support_status_effect_recovery_remove_sfx',
      /\b(?:reduce(?:s|d)?|remove(?:s|d)?)\b[^.]{0,160}\b(?:blindness|SFX)\b/i,
    ],
  ];

  entries.forEach(([key, pattern]) => {
    if (pattern.test(text)) {
      keys.add(key);
    }
  });
}

function addSupportOtherKeys(keys, text) {
  if (/\b(?:recover(?:s|ed)?|heal(?:s|ed)?)\b[^.]{0,120}\bHP\b/i.test(text)) {
    keys.add('support_hp_recovery');
  }

  if (
    /\bapplies?\b[^.]{0,160}\b(?:status effect|beneficial effect|effect)\b[^.]{0,160}\b(?:crew|characters|allies)\b/i.test(
      text,
    )
  ) {
    keys.add('support_apply_status_effects_crew');
  }

  if (/\bperfect\b|\btap-?timing\b/i.test(text)) {
    keys.add('support_tap_timing_requirement');
  }

  if (SUPPORT_DESIGNATED_TURN_PATTERNS.some((pattern) => pattern.test(text))) {
    keys.add('support_effect_activation_on_designated_turn');
  }

  if (
    /\b(?:reduce(?:s|d)?|shorten(?:s|ed)?)\b[^.]{0,160}\b(?:special cooldown|special charge|special charge time)\b[^.]{0,120}\b(?:this character|self|own)\b/i.test(
      text,
    ) ||
    /\b(?:this character|self|own)\b[^.]{0,120}\b(?:special cooldown|special charge|special charge time)\b[^.]{0,120}\b(?:reduce(?:s|d)?|shorten(?:s|ed)?)\b/i.test(
      text,
    )
  ) {
    keys.add('support_reduce_special_charge_time_self');
  }

  if (
    /\b(?:reduce(?:s|d)?|cut(?:s)?)\b[^.]{0,160}\bcurrent HP\b[^.]{0,120}\b(?:crew|all characters|characters)\b/i.test(
      text,
    )
  ) {
    keys.add('support_reduce_current_hp_crew');
  }
}

function addSupportApplyStatusEffectKeys(keys, text) {
  const entries = [
    [
      'support_apply_status_effect_def_down',
      /\b(?:inflict(?:s|ed)?|apply|applies|reduce(?:s|d)?)\b[^.]{0,160}\b(?:DEF Down|defense down)\b/i,
    ],
    ['support_apply_status_effect_unique_effect', /\bunique effect\b/i],
    [
      'support_apply_status_effect_poison',
      /\b(?:inflict(?:s|ed)?|poisons?|apply|applies)\b[^.]{0,160}\b(?:poison|venom|toxic)\b/i,
    ],
    [
      'support_apply_status_effect_increased_damage_taken',
      /\b(?:increase(?:s|d)?|inflict(?:s|ed)?|apply|applies)\b[^.]{0,160}\bdamage taken\b/i,
    ],
    [
      'support_apply_status_effect_reduce_resistance',
      /\b(?:resistance reduction|reduce(?:s|d)? resistance)\b/i,
    ],
    ['support_apply_status_effect_delay', /\bdelay(?:s|ed)?\b[^.]{0,120}\benem/i],
  ];

  entries.forEach(([key, pattern]) => {
    if (pattern.test(text) && !/\b(?:duration|turns?)\b/i.test(text)) {
      keys.add(key);
    }
  });
}

function resolveCaptainAbilityTexts(character) {
  const captainAbilityVariants = Array.isArray(character.detail?.captainAbilityVariants)
    ? character.detail.captainAbilityVariants
    : [];

  if (captainAbilityVariants.length > 0) {
    return captainAbilityVariants
      .map((entry) => (typeof entry?.text === 'string' ? entry.text.trim() : ''))
      .filter(Boolean);
  }

  return typeof character.detail?.captainAbility === 'string' &&
    character.detail.captainAbility.length
    ? [character.detail.captainAbility]
    : [];
}

function resolveSailorAbilityText(character) {
  const sailorAbilities = Array.isArray(character.detail?.sailorAbilities)
    ? character.detail.sailorAbilities
    : [];

  return sailorAbilities
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .join(' ');
}

export async function enrichCharactersWithBuilderAbilities(
  characters,
  { batchSize = 200, logger = console.log, abilityCorrections = null } = {},
) {
  const catalogMap = new Map();
  STRUCTURED_ABILITY_DEFINITIONS.forEach((definition) => {
    catalogMap.set(definition.key, createCatalogAccumulator(definition.key, definition.label));
  });
  const total = characters.length;

  for (let start = 0; start < total; start += batchSize) {
    const batch = characters.slice(start, start + batchSize);

    batch.forEach((character) => {
      const captainAbilityTexts = resolveCaptainAbilityTexts(character);
      const sailorAbilityText = resolveSailorAbilityText(character);
      const derivedBuilderAbilities = [
        ...analyzeBuilderAbilityText(character.detail?.specialText ?? null, 'specialText'),
        ...analyzeBuilderAbilityText(
          character.detail?.superSpecialText ?? null,
          'superSpecialText',
        ),
        ...captainAbilityTexts.flatMap((text) => analyzeBuilderAbilityText(text, 'captainAbility')),
        ...analyzeBuilderAbilityText(sailorAbilityText, 'sailorAbilities'),
        ...extractPotentialBuilderAbilities(character),
        ...extractSupportBuilderAbilities(character),
      ];
      const builderAbilities = mergeBuilderAbilities(
        character.detail?.builderAbilities ?? [],
        derivedBuilderAbilities,
      );
      const correctedBuilderAbilities = applyBuilderAbilityCorrection(
        builderAbilities,
        resolveBuilderAbilityCorrection(character.id, abilityCorrections),
      );
      character.detail.builderAbilities = correctedBuilderAbilities;

      correctedBuilderAbilities.forEach((ability) => {
        const current =
          catalogMap.get(ability.key) ?? createCatalogAccumulator(ability.key, ability.label);

        current.supportsTurns ||= ability.minTurns !== null;
        current.supportsSlotTokens ||= ability.slotTokens.length > 0;
        current.availableSources.add(ability.source);
        current.availableCoverageModes.add(resolveCoverageMode(ability));
        ability.slotTokens.forEach((token) => current.availableSlotTokens.add(token));

        if (!current.matchingCharacterIds.has(character.id)) {
          current.matchingCharacterIds.add(character.id);
          current.matchCount = current.matchingCharacterIds.size;
        }

        if (Number.isFinite(ability.minTurns) && ability.minTurns > 0) {
          const minTurns = Math.floor(ability.minTurns);
          const turnCharacterIds = current.turnMatchingCharacterIds.get(minTurns) ?? new Set();

          turnCharacterIds.add(character.id);
          current.turnMatchingCharacterIds.set(minTurns, turnCharacterIds);
        }

        if (ability.source === 'captainAbility') {
          current.captainAbilityMatchingCharacterIds.add(character.id);

          if (isCaptainStructuredEffectAbility(ability)) {
            const effectMatch = {
              characterId: character.id,
              ...(normalizeEffectValue(ability.minEffectValue) !== null
                ? { minEffectValue: normalizeEffectValue(ability.minEffectValue) }
                : {}),
              ...(normalizeEffectTargetScope(ability.effectTargetScope) !== 'any'
                ? { effectTargetScope: normalizeEffectTargetScope(ability.effectTargetScope) }
                : {}),
              slotTokens: normalizeSlotTokens(ability.slotTokens),
            };
            const effectMatchIdentity = [
              effectMatch.characterId,
              effectMatch.minEffectValue ?? 'none',
              effectMatch.effectTargetScope ?? 'any',
              effectMatch.slotTokens.join(','),
            ].join('|');

            current.captainAbilityEffectMatches.set(effectMatchIdentity, effectMatch);
          }

          if (Number.isFinite(ability.minTurns) && ability.minTurns > 0) {
            const minTurns = Math.floor(ability.minTurns);
            const turnCharacterIds =
              current.captainAbilityTurnMatchingCharacterIds.get(minTurns) ?? new Set();

            turnCharacterIds.add(character.id);
            current.captainAbilityTurnMatchingCharacterIds.set(minTurns, turnCharacterIds);
          }
        }

        if (
          current.sampleCharacterIds.length < 5 &&
          !current.sampleCharacterIds.includes(character.id)
        ) {
          current.sampleCharacterIds.push(character.id);
        }

        const sampleText =
          ability.source === 'captainAbility'
            ? (captainAbilityTexts[0] ?? character.detail?.captainAbility)
            : ability.source === 'superSpecialText'
              ? character.detail?.superSpecialText
              : ability.source === 'sailorAbilities'
                ? sailorAbilityText
                : ability.source === 'potentialAbilities' ||
                    ability.source === 'superTandemData' ||
                    ability.source === 'finalTapData' ||
                    ability.source === 'rushSugoSpecialData'
                  ? resolvePotentialSampleText(character)
                  : ability.source === 'supportData'
                    ? resolveSupportSampleText(character)
                    : character.detail?.specialText;

        if (current.sampleTexts.length < 5 && typeof sampleText === 'string' && sampleText.length) {
          current.sampleTexts.push(sampleText);
        }

        catalogMap.set(ability.key, current);
      });
    });

    const processedCount = Math.min(start + batch.length, total);
    logger?.(
      `[auto-builder-abilities] processed ${processedCount}/${total} characters, catalog size ${catalogMap.size}`,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const abilities = [...catalogMap.values()]
    .map((entry) => {
      const metadata = STRUCTURED_ABILITY_METADATA_BY_KEY.get(entry.key);

      return {
        key: entry.key,
        label: metadata?.label ?? entry.label,
        category: metadata?.category ?? 'legacy',
        groupLabel: metadata?.groupLabel ?? null,
        groupOrder: metadata?.groupOrder ?? null,
        effectOrder: metadata?.effectOrder ?? null,
        supportsTurns: entry.supportsTurns,
        supportsSlotTokens: metadata?.supportsSlotTokens === true
          ? entry.supportsSlotTokens
          : metadata
            ? false
            : entry.supportsSlotTokens,
        availableSlotTokens: metadata?.supportsSlotTokens === true || !metadata
          ? [...entry.availableSlotTokens].sort((left, right) => left.localeCompare(right))
          : [],
        availableSources: [...entry.availableSources].length
          ? [...entry.availableSources].sort((left, right) => left.localeCompare(right))
          : metadata
            ? [...metadata.availableSources]
            : [],
        availableCoverageModes: [...entry.availableCoverageModes].length
          ? [...entry.availableCoverageModes].sort(compareCoverageModes)
          : [DEFAULT_COVERAGE_MODE],
        matchCount: entry.matchCount,
        matchingCharacterIds: [...entry.matchingCharacterIds].sort((left, right) => left - right),
        turnMatchingCharacterIds: [...entry.turnMatchingCharacterIds.entries()]
          .sort(([leftTurns], [rightTurns]) => leftTurns - rightTurns)
          .map(([minTurns, characterIds]) => ({
            minTurns,
            characterIds: [...characterIds].sort((left, right) => left - right),
          })),
        ...(entry.captainAbilityMatchingCharacterIds.size
          ? {
              captainAbilityMatchingCharacterIds: [...entry.captainAbilityMatchingCharacterIds].sort(
                (left, right) => left - right,
              ),
            }
          : {}),
        ...(entry.captainAbilityTurnMatchingCharacterIds.size
          ? {
              captainAbilityTurnMatchingCharacterIds: [
                ...entry.captainAbilityTurnMatchingCharacterIds.entries(),
              ]
                .sort(([leftTurns], [rightTurns]) => leftTurns - rightTurns)
                .map(([minTurns, characterIds]) => ({
                  minTurns,
                  characterIds: [...characterIds].sort((left, right) => left - right),
                })),
            }
          : {}),
        ...(entry.captainAbilityEffectMatches.size
          ? {
              captainAbilityEffectMatches: [...entry.captainAbilityEffectMatches.values()].sort(
                compareCaptainAbilityEffectMatches,
              ),
            }
          : {}),
        sampleCharacterIds: [...entry.sampleCharacterIds],
        sampleTexts: [...entry.sampleTexts],
      };
    })
    .sort(compareCatalogAbilities);

  return abilities;
}

export function applyBuilderAbilityCorrection(abilities, correction) {
  const normalizedAbilities = normalizeExistingBuilderAbilities(abilities);
  const normalizedCorrection = normalizeBuilderAbilityCorrection(correction);

  if (!normalizedCorrection) {
    return normalizedAbilities;
  }

  let nextAbilities = normalizedAbilities;

  if (normalizedCorrection.removeAbilityKeys.length > 0) {
    nextAbilities = nextAbilities.filter(
      (ability) =>
        !(
          normalizedCorrection.removeAbilityKeys.includes(ability.key) &&
          correctionSourceMatches(ability, normalizedCorrection.sourceScopes)
        ),
    );
  }

  if (normalizedCorrection.replaceAbilities !== null) {
    nextAbilities = nextAbilities.filter(
      (ability) => !correctionSourceMatches(ability, normalizedCorrection.sourceScopes),
    );

    const replacedAbilities = [];
    const seen = new Set();

    [...nextAbilities, ...normalizedCorrection.replaceAbilities].forEach((ability) => {
      addAbility(replacedAbilities, seen, ability);
    });

    return replacedAbilities;
  }

  return nextAbilities;
}

function mergeBuilderAbilities(existingAbilities, derivedAbilities) {
  const mergedAbilities = [];
  const seen = new Set();

  [...normalizeExistingBuilderAbilities(existingAbilities), ...derivedAbilities].forEach(
    (ability) => {
      addAbility(mergedAbilities, seen, ability);
    },
  );

  return mergedAbilities;
}

function normalizeExistingBuilderAbilities(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeExistingBuilderAbility(entry))
    .filter((entry) => entry !== null);
}

function normalizeExistingBuilderAbility(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const key = typeof value.key === 'string' ? value.key.trim() : '';

  if (!key.length) {
    return null;
  }

  const rawMinTurns =
    value.minTurns === null || value.minTurns === undefined || value.minTurns === ''
      ? null
      : Number.isFinite(Number(value.minTurns))
        ? Number(value.minTurns)
        : null;
  const minTurns =
    rawMinTurns !== null && rawMinTurns <= 0 && EXPLICIT_BUILDER_ABILITY_KEY_SET.has(key)
      ? null
      : rawMinTurns;

  return {
    key,
    label: typeof value.label === 'string' && value.label.trim().length ? value.label.trim() : key,
    minTurns,
    isCompleteRemoval: Boolean(value.isCompleteRemoval),
    slotTokens: normalizeSlotTokens(value.slotTokens),
    source:
      value.source === 'captainAbility'
        ? 'captainAbility'
        : value.source === 'superSpecialText'
          ? 'superSpecialText'
          : value.source === 'sailorAbilities'
            ? 'sailorAbilities'
            : value.source === 'potentialAbilities'
              ? 'potentialAbilities'
              : value.source === 'supportData'
                ? 'supportData'
                : value.source === 'superTandemData'
                  ? 'superTandemData'
                  : value.source === 'finalTapData'
                    ? 'finalTapData'
                    : value.source === 'rushSugoSpecialData'
                      ? 'rushSugoSpecialData'
                      : 'specialText',
    coverageMode:
      value.coverageMode === 'selectedDebuff' ? 'selectedDebuff' : DEFAULT_COVERAGE_MODE,
    ...(normalizeEffectValue(value.minEffectValue) !== null
      ? { minEffectValue: normalizeEffectValue(value.minEffectValue) }
      : {}),
    ...(normalizeEffectTargetScope(value.effectTargetScope) !== 'any'
      ? { effectTargetScope: normalizeEffectTargetScope(value.effectTargetScope) }
      : {}),
  };
}

function createCatalogAccumulator(key, label) {
  return {
    key,
    label,
    supportsTurns: false,
    supportsSlotTokens: false,
    availableSlotTokens: new Set(),
    availableSources: new Set(),
    availableCoverageModes: new Set(),
    matchCount: 0,
    matchingCharacterIds: new Set(),
    turnMatchingCharacterIds: new Map(),
    captainAbilityMatchingCharacterIds: new Set(),
    captainAbilityTurnMatchingCharacterIds: new Map(),
    captainAbilityEffectMatches: new Map(),
    sampleCharacterIds: [],
    sampleTexts: [],
  };
}

function compareCatalogAbilities(left, right) {
  const categoryOrder = new Map([
    ['special', 0],
    ['crewmate', 1],
    ['potential', 2],
    ['support', 3],
    ['legacy', 4],
  ]);
  const leftCategoryOrder = categoryOrder.get(left.category ?? 'legacy') ?? Number.MAX_SAFE_INTEGER;
  const rightCategoryOrder =
    categoryOrder.get(right.category ?? 'legacy') ?? Number.MAX_SAFE_INTEGER;

  if (leftCategoryOrder !== rightCategoryOrder) {
    return leftCategoryOrder - rightCategoryOrder;
  }

  if (leftCategoryOrder < 4) {
    return (
      (left.groupOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.groupOrder ?? Number.MAX_SAFE_INTEGER) ||
      (left.effectOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.effectOrder ?? Number.MAX_SAFE_INTEGER) ||
      left.label.localeCompare(right.label)
    );
  }

  return left.label.localeCompare(right.label);
}

function buildAbilityIdentity(ability) {
  return [
    ability.key,
    ability.minTurns ?? 'none',
    normalizeSlotTokens(ability.slotTokens).join(','),
    ability.source,
    resolveCoverageMode(ability),
    normalizeEffectValue(ability.minEffectValue) ?? 'none',
    normalizeEffectTargetScope(ability.effectTargetScope),
  ].join('|');
}

function addAbility(abilities, seen, ability) {
  const identity = buildAbilityIdentity(ability);

  if (seen.has(identity)) {
    return;
  }

  seen.add(identity);
  abilities.push(ability);
}

function resolveCoverageMode(ability) {
  return ability.coverageMode ?? DEFAULT_COVERAGE_MODE;
}

function isCaptainStructuredEffectAbility(ability) {
  return (
    ability.source === 'captainAbility' &&
    CAPTAIN_STRUCTURED_EFFECT_KEYS.has(ability.key) &&
    (normalizeEffectValue(ability.minEffectValue) !== null ||
      normalizeEffectTargetScope(ability.effectTargetScope) !== 'any' ||
      normalizeSlotTokens(ability.slotTokens).length > 0)
  );
}

function compareCaptainAbilityEffectMatches(left, right) {
  return (
    left.characterId - right.characterId ||
    (left.minEffectValue ?? -1) - (right.minEffectValue ?? -1) ||
    (left.effectTargetScope ?? 'any').localeCompare(right.effectTargetScope ?? 'any') ||
    left.slotTokens.join(',').localeCompare(right.slotTokens.join(','))
  );
}

function normalizeEffectTargetScope(value) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';

  return normalizedValue === 'crew' ||
    normalizedValue === 'captains' ||
    normalizedValue === 'self' ||
    normalizedValue === 'subs'
    ? normalizedValue
    : 'any';
}

function normalizeSlotTokens(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((entry) => String(entry).trim().toUpperCase()).filter(Boolean))].sort(
        (left, right) => left.localeCompare(right),
      )
    : [];
}

function resolveBuilderAbilityCorrection(characterId, abilityCorrections) {
  if (!abilityCorrections) {
    return null;
  }

  if (abilityCorrections instanceof Map) {
    return (
      abilityCorrections.get(characterId) ?? abilityCorrections.get(String(characterId)) ?? null
    );
  }

  if (typeof abilityCorrections === 'object') {
    return abilityCorrections[characterId] ?? abilityCorrections[String(characterId)] ?? null;
  }

  return null;
}

function compareCoverageModes(left, right) {
  const order = new Map([
    ['explicit', 0],
    ['selectedDebuff', 1],
  ]);

  return (
    (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER)
  );
}

function extractTextFragments(value) {
  if (typeof value === 'string') {
    const normalized = normalizeHtmlAbilityText(value);
    return normalized.length ? [normalized] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractTextFragments(entry));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const record = value;
  const preferredKeys = [
    'description',
    'base',
    'llbbase',
    'level1',
    'llblevel1',
    'level2',
    'llblevel2',
    'level3',
    'llblevel3',
    'level4',
    'llblevel4',
    'level5',
    'llblevel5',
  ];
  const fragments = [];
  const seenKeys = new Set();

  preferredKeys.forEach((key) => {
    if (key in record) {
      fragments.push(...extractTextFragments(record[key]));
      seenKeys.add(key);
    }
  });

  const fallbackFragments = Object.entries(record)
    .filter(([key]) => !seenKeys.has(key))
    .flatMap(([, entry]) => extractTextFragments(entry));

  if (fragments.length || fallbackFragments.length) {
    return [...fragments, ...fallbackFragments];
  }

  return Object.values(record).flatMap((entry) => extractTextFragments(entry));
}

function splitAbilityTextIntoSentences(text) {
  return text
    .replace(/\.\.+/g, '.')
    .split(/\.\s+/)
    .map((sentence) => sentence.trim().replace(/\.+$/g, ''))
    .filter(Boolean);
}

const CONDITIONAL_BRANCH_STARTER_PATTERN = /^\s*(?:if|when|while|unless)\b/i;

function createBranchStarterFingerprint(sentence) {
  // Conditional branches ("If your crew has 6 Driven characters, ...") are only
  // distinguished by their CONDITION, which extends past the first few words and
  // hinges on type/class tokens that the default fingerprint strips. Two genuinely
  // different conditions ("6 Driven characters" vs "5 [STR] characters") both
  // collapse to "if your crew", so a real cumulative second clause gets mistaken
  // for a restated duplicate branch and dropped (e.g. Kurozumi Orochi 3571/3572,
  // which lose their conditional HP boost and make_slots_favorable). For these,
  // fingerprint the whole leading condition (up to the first comma) and preserve
  // the bracketed type tokens, so different conditions no longer collide while a
  // same-condition powered-up restatement still shares a fingerprint and dedups.
  if (CONDITIONAL_BRANCH_STARTER_PATTERN.test(sentence)) {
    const conditionText = sentence.split(',')[0];
    const normalizedCondition = conditionText
      .toLowerCase()
      .replace(/\[([^\]]+)\]/g, (_match, token) => ` ${token.replace(/[^a-z]/gi, '')} `)
      .replace(/\b\d+(?:\.\d+)?x?\b/g, ' ')
      .replace(/[^a-z\s']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (normalizedCondition.length) {
      return `if:${normalizedCondition}`;
    }
  }

  const normalizedSentence = sentence
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\b\d+(?:\.\d+)?x?\b/g, ' ')
    .replace(/[^a-z\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalizedSentence.length) {
    return '';
  }

  return normalizedSentence.split(/\s+/).slice(0, 3).join(' ');
}

function looksLikeIndependentAbilityBranch(sentence) {
  return (sentence.match(ABILITY_BRANCH_ACTION_PATTERN) ?? []).length >= 2;
}

function normalizeBuilderAbilityCorrection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const sourceScopes = Array.isArray(value.sourceScopes)
    ? [...new Set(value.sourceScopes.filter(isAbilitySource))]
    : ['specialText', 'captainAbility'];
  const removeAbilityKeys = Array.isArray(value.removeAbilityKeys)
    ? [...new Set(value.removeAbilityKeys.map((entry) => String(entry).trim()).filter(Boolean))]
    : [];
  const replaceAbilities =
    'replaceAbilities' in value ? normalizeExistingBuilderAbilities(value.replaceAbilities) : null;

  return {
    sourceScopes: sourceScopes.length > 0 ? sourceScopes : ['specialText', 'captainAbility'],
    removeAbilityKeys,
    replaceAbilities,
  };
}

function isAbilitySource(value) {
  return value === 'specialText' || value === 'captainAbility';
}

function correctionSourceMatches(ability, sourceScopes) {
  return sourceScopes.includes(ability.source);
}

function normalizeTargetSegments(targetText) {
  const slotTokens = extractSlotTokens(targetText);
  const normalizedTarget = normalizeTargetText(targetText);

  if (!normalizedTarget.length) {
    return [];
  }

  if (isSlotScopedTarget(normalizedTarget)) {
    return [
      {
        target: normalizedTarget,
        slotTokens,
      },
    ];
  }

  const candidates = [
    ...normalizedTarget
      .split(/\s*,\s*|\s+and\s+/gi)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => ({
        target: segment,
        slotTokens: [],
      })),
    {
      target: normalizedTarget,
      slotTokens: [],
    },
  ];

  const seen = new Set();

  return candidates.filter((candidate) => {
    const identity = `${candidate.target}|${candidate.slotTokens.join(',')}`;

    if (seen.has(identity)) {
      return false;
    }

    seen.add(identity);
    return true;
  });
}

function extractSlotTokens(targetText) {
  return [...targetText.matchAll(/\[([^\]]+)\]/g)]
    .flatMap((match) => String(match[1] ?? '').split(/\s*,\s*|\s+and\s+|\s+or\s+/gi))
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean)
    .filter((token, index, tokens) => tokens.indexOf(token) === index);
}

function normalizeTargetText(targetText) {
  return targetText
    .toLowerCase()
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/\bthe\b/g, ' ')
    .replace(/\benemies'?s?\b/g, ' ')
    .replace(/\benemy\b/g, ' ')
    .replace(/\bbuffs?\b/g, ' ')
    .replace(/\bstatuses?\b/g, ' ')
    .replace(/\bof the crew\b/g, ' ')
    .replace(/\bcrew\b/g, ' ')
    .replace(/^(?:and|or)\s+/g, ' ')
    .replace(/\s+(?:and|or)$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSlotScopedTarget(target) {
  return (
    target.includes('slot bind') ||
    target.includes('slot barrier') ||
    target.includes('orb bind') ||
    target.includes('orb barrier')
  );
}

function resolveAbilityDefinitions(segment) {
  const target = segment.target.trim();

  if (!target.length || IGNORED_TARGET_PATTERNS.some((pattern) => target.includes(pattern))) {
    return [];
  }

  return TARGET_ALIASES.filter((entry) => entry.matcher(target)).map((alias) => ({
    key: alias.key,
    label: alias.label,
    slotTokens: SLOT_ABILITY_KEY_SET.has(alias.key) ? [...segment.slotTokens] : [],
  }));
}
