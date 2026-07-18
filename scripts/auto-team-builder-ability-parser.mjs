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
    // "Normal Attack Only" is an enemy defensive buff that limits the crew to
    // normal attacks (nullifying special damage/effects). Units whose attacks
    // ignore/bypass it penetrate that buff. Besides the adjacent "ignoring
    // Normal Attack Only" phrasing, OPTC-DB also lists NAO among the defensive
    // effects a special "bypass[es]" (e.g. "bypass all defensive Buffs,
    // Barriers, Defense and Normal Attack Only"), so accept ignore/bypass verbs
    // with a bounded, ReDoS-safe [^.]{0,80} bridge (kept within one sentence so
    // the "if your crew has Normal Attack Only" condition wording is excluded).
    matcher: (text) =>
      /\b(?:ignor(?:e|es|ing)|bypass(?:es|ing)?)\b[^.]{0,80}\bnormal attack only\b/i.test(
        text,
      ),
  },
  {
    key: 'deal_fixed_damage',
    label: 'Deal Fixed Damage',
    // "Deals Nx ATK in Fixed [True] [Typeless] damage". The Fixed-damage
    // modifiers (True = also ignores damage reduction, Typeless = type-neutral)
    // can appear in any order between "Fixed" and "damage" — the old
    // `fixed(?: true)? damage` required "damage" to immediately follow the
    // optional "True", so the "Fixed True Typeless damage" ordering (Typeless
    // wedged before "damage") was missed (#3785, #4038, #4039). Allow up to two
    // True/Typeless modifier tokens between "Fixed" and "damage". Bounded
    // [^.]{0,160} bridge (max observed deals→fixed gap is <70) keeps it
    // ReDoS-safe. "Typeless Fixed True damage" (Typeless before Fixed) already
    // matches via the adjacent "Fixed True damage".
    matcher: (text) =>
      /\bdeals?\b[^.]{0,160}\bfixed(?:\s+(?:true|typeless)){0,2}\s+damage\b/i.test(text),
  },
  {
    key: 'inflict_poison',
    label: 'Inflict Poison',
    // "allows effects that inflict Poison to ignore Debuff Protection" is a
    // debuff-protection / immunity-piercing ENABLER, not an infliction — the
    // captain applies no Poison itself, it only lets separately-sourced poison
    // effects bypass enemy Immunity (optc-db `ignoreImmunities`). Strip that
    // clause before matching (mirrors remove_atk_down excluding the analogous
    // ATK-Down enabler). Also bound the bridge so the verb and the
    // "poison"/"enemies" noun stay near-adjacent within one clause: the old
    // unbounded [^.]* wrongly bridged a poison CURE / condition to a later
    // "enemies" clause (e.g. "removes Poison duration completely ... reduces the
    // defense of all enemies"; "boosts ATK against enemies inflicted with Poison").
    matcher: (text) => {
      const stripped = text.replace(
        /\ballows?\b[^.]*?\beffects?\b[^.]*?\binflicts?\b[^.]*?\b(?:poison|strong poison|toxic|venom)\b[^.]*?\b(?:ignore|bypass)\b[^.]*?\b(?:debuff protection|immunit(?:y|ies))\b/gi,
        ' ',
      );
      return (
        /\binflicts?\b[^.]{0,60}\b(?:poison|strong poison|toxic|venom)\b/i.test(stripped) ||
        /\bpoisons?\b[^.]{0,40}\benemies?\b/i.test(stripped)
      );
    },
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
  [
    'special_damage_other',
    // "Other" damage = TYPELESS damage (the type-matchup multiplier is forced to
    // x1 — same damage vs every enemy color). This is the axis-A "non-typed"
    // property and is DISTINCT from "True" damage (an axis-B property that ignores
    // enemy DEF / reductions but is still typed, e.g. "[STR] True damage" respects
    // the matchup) — so pure typed True/Fixed-True damage is intentionally NOT
    // included here (it stays under generic special_damage / deal_fixed_damage).
    // The former /typeless damage/ required the two words to be adjacent and so
    // MISSED the 100+ typeless hits that carry a True/Fixed modifier between them:
    // "Typeless True damage" (Kizaru, Whitebeard), "Typeless Fixed True damage"
    // (Cat Viper), "Typeless True Fixed damage". Allow up to three Fixed/True
    // tokens between "typeless" and "damage"; still anchored on "typeless" so it
    // never catches pure "[STR] True damage" or "Fixed True damage".
    //
    // The gap is `(?:[^.]|\.\d)` rather than a bare `[^.]`, for the same reason
    // special_damage's is: a bare `[^.]` dies at the "." of a DECIMAL multiplier,
    // so the whole "Deals 0.5x the damage dealt in the previous turn in Typeless
    // damage" family was missed (Mihawk #717/#718/#1881, Eneru #3244/#3245/#4579,
    // Doflamingo #3550, Ulti #3588, S-Hawk #4109, Sakazuki #4217). Widening only
    // ever crosses a period followed by a DIGIT, so it still cannot run past a
    // sentence boundary into an unrelated clause.
    // The `(?<!\badditional\s)` guard keeps the gap from reaching out of one clause
    // and into a NEIGHBOURING "adds Nx character's ATK as Additional Typeless
    // Damage" buff grant, which is a different mechanic (owned by
    // additional_damage_boost) and says nothing about the type of the damage this
    // special DEALS. Seven characters were tagged purely through that bridge while
    // their own damage was typed, percent, or not even theirs: Dogstorm #1570
    // "deals 60x character's ATK in [STR] damage to one enemy and adds 80x
    // character's ATK as Additional Typeless Damage" is [STR]-TYPED, so the matchup
    // is not x1 at all; Z #2329 deals percent damage; Akainu #4297/#4298 have no
    // "deals" of their own — the bridged verb belongs to the ENEMY's Burn ("Burn
    // that will deal 30x enemies' ATK in damage"). Also #1571, #2330, #2372.
    // Without the guard the boundary is decided by PUNCTUATION rather than meaning:
    // identical grammar lands in the key when the clauses are joined by "and"
    // (#1570) and out of it when a period intervenes (Koala #1241).
    [
      /\bdeals?\b(?:[^.]|\.\d){0,160}(?<!\badditional\s)\btypeless\b(?:\s+(?:Fixed|True)){0,3}\s+damage\b/i,
    ],
  ],
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
  [
    // Grants an ATK MULTIPLIER: OPTC-DB "boosts ATK of <scope> by Nx" (1,185
    // clauses) and its conditional twin "boosts ATK against <enemy state> by Nx"
    // (320). Flat/base grants ("boosts base ATK ... by 1,000") and percent ones
    // ("boosts Final Tap ATK ... by 30%") are other keys — they carry no "Nx", so
    // the multiplier requirement already separates them.
    //
    // `(?!\s+effects?)` rejects the AMPLIFIER: "increases boost effects of ATK Up
    // buffs by 1.5x" satisfies \bboosts?\b through the NOUN in "boost effects",
    // then reaches the ATK inside the buff NAME. That grants no ATK at all — it
    // scales OTHER characters' ATK Up buffs — and all 20 such units are already
    // (correctly) effect_boost. Same defect `boost_base_atk` fixed for "boost
    // effects of Base ATK Boost buffs".
    //
    // Neither gap may span another effect verb, which is what actually stops a
    // bridge — e.g. Garp & Coby #4521 "boosts Final Tap ATK ... by 50%; boosts
    // Color Affinity ... by 3.25x", where the multiplier belongs to a different
    // effect one clause later. The verb list deliberately EXCLUDES increases/
    // sets/adds: those collide with buff NAMES ("Increase Damage Taken"), and
    // guarding on them silently deleted 16 genuine "boosts ATK against enemies
    // inflicted with Increase Damage Taken by 2x" units. "inflicts" is safe —
    // \binflicts?\b cannot match the participle "inflicted".
    //
    // With the guard doing that work, the ATK->multiplier window is 160 rather
    // than 80: the old bound was blunt collateral that dropped 11 genuine grants
    // whose enemy-state list is simply long ("boosts ATK against Poisoned
    // enemies, Strongly Poisoned enemies and enemies inflicted with Toxic by
    // 1.75x").
    'boost_atk',
    [
      /\bboosts?\b(?!\s+effects?\b)(?:(?!\b(?:reduces?|removes?|changes?|makes?|locks?|randomizes?|recovers?|deals?|inflicts?|swaps?|consumes?|switches|transforms?|boosts?)\b)[^.]){0,120}?\bATK\b(?:(?!\b(?:reduces?|removes?|changes?|makes?|locks?|randomizes?|recovers?|deals?|inflicts?|swaps?|consumes?|switches|transforms?|boosts?)\b)[^.]){0,160}?\bby\s+\d+(?:\.\d+)?x/i,
    ],
  ],
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
      // The trailing "x" is optional ONLY when the number cannot be a turn or
      // percent count: Yamato #4212 "boosts Orb Effects of Free Spirit characters
      // by 1.75" is a genuine grant whose multiplier upstream simply wrote
      // without the "x" (same class as the "recieved"/"take" typo tolerances).
      // The lookahead adds exactly that one character and drops none.
      // ("Slot Effects" is legacy tolerance from the captain audit and currently
      // matches nothing — 0 occurrences in any field, any case — but it is a
      // literal with no bridge risk, so it stays as cheap future-proofing.)
      /\bboosts?\b[^.]{0,120}\b(?:Orb Effects|Slot Effects)\b[^.]{0,80}\bby\s+\d+(?:\.\d+)?(?:x|(?!\s*(?:turns?|%|\d)))/i,
      // The SET-TO grant form, which the multiply-by wording alone cannot see:
      // "increases Orb Effects of beneficial [TND] orbs TO 2.75x for 3 turns"
      // scopes by ORB TYPE and sets the multiplier, where "boosts Orb Effects of
      // [INT] characters BY 2.75x" scopes by CHARACTER and multiplies. Both
      // amplify the same Orb Effects stat, so both belong here — 21 characters
      // carried only the set-to form and were invisible to this filter.
      // `(?!\s+boost\s+effects?)` keeps the amplifier ("increases boost effects
      // of ... buffs") out on principle, as it did for boost_atk; upstream names
      // that buff "Orb Amplification" rather than "Orb Effects", so the shape
      // currently matches nothing here — the guard is cheap future-proofing.
      /\bincreases?\b(?!\s+boost\s+effects?\b)[^.;]{0,40}?\b(?:Orb Effects|Slot Effects)\b[^.;]{0,120}?\bto\s+\d+(?:\.\d+)?x/i,
    ],
  ],
  [
    'boost_against_delayed_enemies',
    // Conditional ATK boost vs Delayed enemies: "boosts [scope] ATK against
    // [targets ...] delayed enemies by Nx". Anchor on "against ... delayed
    // enemies" (no "damage" token). Like boost_against_poisoned_enemies, the old
    // `boosts? ... damage ... delayed enemies` only matched when a "damage" token
    // (e.g. "Increase Damage Taken") preceded the target in the list, missing
    // ~112 genuine units. The "against" anchor also excludes the trigger condition
    // "If there are delayed enemies ..." (Kaya #4180 etc.), which is not a
    // boost-against target. Two bounded [^.]{0,N} gaps between fixed anchors ->
    // ReDoS-safe.
    //
    // The second pattern covers the 2024+ upstream vocabulary shift, where the same
    // exploit clause names the enemy state as a STATUS NOUN in a multi-status list
    // ("boosts damage dealt to enemies inflicted with Increase Damage Taken, Delay,
    // Poison, Strong Poison, Toxic, DEF Reduction, or Paralysis by 1.2x" — #4123/
    // #4124/#4125/#4126/#4127/#4128). It is byte-parallel to the sibling pattern on
    // boost_against_def_reduced_enemies below, deliberately: #4125-#4128 ALREADY
    // match that key through the identical enumeration via "DEF Reduction", so not
    // deriving Delay from the same list was an internal inconsistency, not merely a
    // coverage gap. 122 -> 128.
    //
    // The governing frame "boosts ... (against|damage dealt to) ... enemies
    // (inflicted with|affected by)" is load-bearing. A bare "Delay" token would
    // sweep in the APPLY side ("delays all enemies by N turns", apply_delay, 273),
    // the enemy IMMUNITY ("Delay Debuff Protection", 45 carriers) and the AMPLIFIER
    // ("increases boost effects of Delay Status ATK Boost buffs", effect_boost).
    // Do NOT relax it. \bDelay\b cannot reach the participle "delayed", so the
    // applier/consumer split stays structural: the applier is always the finite
    // verb "delays", the consumer always the participle "delayed".
    [
      /\bboosts?\b[^.]{0,160}\bagainst\b[^.]{0,160}\bdelayed enemies\b/i,
      /\bboosts?\b[^.]{0,160}\b(?:against|damage dealt to)\b[^.]{0,200}\benemies (?:inflicted with|affected by)\b[^.]{0,120}\bDelay\b/i,
    ],
  ],
  [
    'boost_against_def_reduced_enemies',
    // Conditional ATK boost vs DEF-reduced enemies: "boosts [scope] ATK against
    // [targets ...] enemies with reduced defense by Nx". The old matcher targeted
    // the phrase "(DEF|defense) reduced enemies" -- which NEVER appears upstream
    // (the canonical wording is "enemies with reduced defense") -- AND required a
    // "damage" token, so it matched 0. Re-anchored on "against ... enemies with
    // reduced defense" (all 140 such tokens are boost-against targets, 0 non-boost
    // uses). Two bounded [^.]{0,N} gaps between fixed anchors -> ReDoS-safe.
    //
    // The second pattern covers the 2024+ upstream vocabulary shift, where the same
    // exploit clause names the enemy state as a STATUS NOUN in a multi-status list
    // ("boosts damage dealt to enemies inflicted with Increase Damage Taken, Delay,
    // Poison, ..., DEF Reduction, or Paralysis by 1.2x" — #4116/#4125/#4126/#4127/
    // #4128) or with the newer "Defense Down" spelling ("boosts ATK against enemies
    // inflicted with Defense Down by 2.25x for 2 turns" — #4140). 143 -> 149.
    //
    // The governing frame "boosts ... (against|damage dealt to) ... enemies (inflicted
    // with|affected by)" is load-bearing: it is what keeps the APPLY-side and
    // IMMUNITY-side characters out, since those read "reduces the defense of all
    // enemies by N%" (apply_def_reduction) or "Defense Reduction Debuff Protection"
    // (the enemy's immunity to it) and never place the status in a boost-TARGET
    // position. Do NOT relax the frame to a bare "Defense Reduction" token — on its
    // own that noun is overwhelmingly apply-side.
    [
      /\bboosts?\b[^.]{0,160}\bagainst\b[^.]{0,160}\benemies with reduced defense\b/i,
      /\bboosts?\b[^.]{0,160}\b(?:against|damage dealt to)\b[^.]{0,200}\benemies (?:inflicted with|affected by)\b[^.]{0,120}\b(?:Defense Down|DEF Down|DEF Reduction|Defense Reduction)\b/i,
    ],
  ],
  [
    'boost_against_poisoned_enemies',
    // Conditional ATK boost vs Poison-inflicted enemies: "boosts [scope] ATK
    // against [targets ...] Poisoned enemies by Nx" (also the verbose "against
    // enemies inflicted with Poison [/ Strong Poison / Toxic]"). The old
    // `boosts? ... damage ... poisoned enemies` required a "damage" token between
    // "boosts" and the target, which only happened to work when "Increase Damage
    // Taken" appeared earlier in the boost-against list — it MISSED ~46 genuine
    // boost-against-Poison units whose list has no "damage" token (e.g. "against
    // Poisoned and Strongly Poisoned enemies", Blazing General Zombie #827;
    // Boa Sandersonia #1055; Magellan / Caesar / Reiju). Every "poisoned enemies"
    // token in the corpus is a boost-against target (0 non-boost uses), so anchor
    // on "against ... poisoned enemies" (no "damage" token). Two bounded [^.]{0,N}
    // gaps between fixed anchors → ReDoS-safe.
    [
      /\bboosts?\b[^.]{0,160}\bagainst\b[^.]{0,160}\bpoisoned enemies\b/i,
      /\bboosts?\b[^.]{0,120}\bagainst enemies inflicted with poison\b/i,
    ],
  ],
  [
    'other_damage_boosts',
    // Catch-all conditional damage boost: "boosts [the] damage dealt to enemies
    // inflicted with <status>" (a status-conditional damage multiplier). Require
    // "boosts" to DIRECTLY govern "damage dealt" (adjacent) — the old
    // `boosts? ... damage dealt` (120-char bridge) mis-tagged the scaling
    // CONDITION "boosts ATK of all characters by Nx ... depending on the amount of
    // normal attack damage dealt before this special" (Gol D. Roger #3176/#3177),
    // where "damage dealt" is the scaling INPUT, not the boosted object. The dead
    // `/damage boost/` literal (0 matches, and a latent false-positive risk against
    // "Additional Damage Boost") is removed.
    [/\bboosts?\s+(?:the\s+)?damage dealt\b/i],
  ],
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
    //
    // The "Type Effects" alternative requires the verb to DIRECTLY govern the noun
    // rather than spanning a wide gap: a bare [^.]{0,120} let the infinitive "boost"
    // in "If crew uses a Special to boost slot or type effects, further increases the
    // effect" (Vivi #4613) bridge 120 chars to "type effects", tagging an
    // enhance-ENABLER condition as a grant. #4613 is correctly effect_boost. The four
    // genuine grants stay ("boosts [the] [Super] Type Effects ..." — #3970, #3971,
    // #4063, #4611).
    [
      /\bboosts?\s+(?:the\s+)?(?:super\s+)?type effects?\b/i,
      /\bboosts?\s+(?:the\s+)?color affinity\s+of\b/i,
      /\b(?:their|its)\s+color affinity\s+by\s+[+]?\d/i,
    ],
  ],
  [
    'additional_damage_boost',
    // The "Additional Damage" post-attack buff GRANT: "adds Nx character's ATK as
    // Additional [Typeless] Damage for N turns" (extra flat damage after each
    // attack). Anchor on "adds ... as Additional ... damage" (two bounded gaps
    // with fixed anchors → ReDoS-safe). The old pair — a loose `adds? ... damage`
    // (matched only genuine grants here, but was a latent chain-addition bridge)
    // and a bare `additional damage` literal — over-matched every REFERENCE to the
    // buff by name: conditions ("if your crew has Additional Damage buff", "N turns
    // or more of Additional Damage"), the duration extender "increases duration of
    // any Additional Damage buffs" (Curly Dadan #4296), the buff-list reference
    // (Jinbe #4202), and the replace-trigger "if a crew member uses a special with
    // an Additional Damage buff, replaces those buffs" (Garp #4239/#4240). Those
    // are not grants and are dropped.
    [/\badds?\b[^.]{0,80}\bas\s+additional\b[^.]{0,30}\bdamage\b/i],
  ],
  // Chain Lock GRANT = "locks [the] chain multiplier at Nx" (fixes the chain
  // multiplier at a value regardless of tap timing). Require "locks" to directly
  // govern "chain multiplier": the old `locks? ... chain` 120-char bridge
  // mis-tagged (a) "locks all orbs ..." specials whose LATER clause merely
  // mentions "chain" (Chain Coefficient Reduction removal, Chain Multiplier
  // Limit, "after the Nth chain", boosts Chain Multiplier Growth Rate) — the lock
  // is on ORBS (lock_slots), not the chain multiplier; and (b) every reference to
  // the "Chain Lock" buff by name that is not a grant — "increases boost effects
  // of Chain Lock buffs" (effect_boost), "if your crew has Chain Lock" (condition),
  // "increases duration of any Chain Lock buffs" (extender), "enables Chain Lock …
  // to be enhanced", "Chain Lock and Chain Boundary buffs". All 3 captainAbility
  // matches (#4267/#4268/#4289) were such references, so captain 3→0.
  ['chain_multiplier_lock', [/\blocks?\s+(?:the\s+)?chain\s+multiplier\b/i]],
  // Chain Multiplier min/max lock ("Chain Boundary") sets a floor/ceiling on the
  // chain multiplier — the canonical object is the "minimum/maximum chain
  // multiplier". The old `chain … (min|max)` 80-char bridge over-matched every
  // clause where a "chain" word sat near an unrelated "MAX"/"min": "…Chain
  // Coefficient Reduction … recovers 30% of crew's MAX HP" (#3293/#3776/#4429/
  // #4430 — MAX from MAX HP) and "Chain Coefficient Reduction and Minimum-Chain
  // ATK Down …" (#4067/#4068 — Minimum belongs to the separate Minimum-Chain ATK
  // Down debuff), so ALL 6 detections (incl. the entire captain count) were false
  // positives. Anchor on the real locked object "(minimum|maximum) chain
  // multiplier"; the only "Chain Boundary" mention in the corpus (#3742 "boost
  // effects of Chain Lock and Chain Boundary buffs") is an effect_boost REFERENCE,
  // not a grant — so no genuine grant exists yet and the key correctly resolves to
  // 0, while staying ready for a real future "locks the minimum/maximum chain
  // multiplier at Nx" grant. ReDoS-safe (fixed adjacency, no unbounded bridge).
  ['chain_multiplier_lock_min_max', [/\b(?:minimum|maximum)\s+chain\s+multiplier\b/i]],
  [
    'chain_multiplier_additive_boost',
    // A chain ADDITION is always fractional — "Adds 0.5x to Chain multiplier for 2
    // turns" (Kizaru #977), "Adds 0.1x to ..." (#1066), "Adds 0.2x to ..." (Binz
    // #1105). The former pair of loose gap-matchers therefore died at the decimal:
    // a bare `[^.]` cannot cross the "." of "0.5x", which sits between "adds" and
    // "to", so the key matched 2 of 312 — and the only 2 survivors were the only
    // two with an INTEGER amount. It was a dead filter.
    //
    // This anchors on ADJACENCY instead of spanning a gap: adds → amount → optional
    // range/parenthetical → optional "to (the)" → optional "base" → the literal
    // "chain multiplier". That covers every wording in the corpus — canonical (288),
    // enhanceable ("Adds 1.8x, can be enhanced up to 2 times, to Chain multiplier",
    // Vegapunk #4136), range ("adds 1.5x-2.5x to Chain multiplier", Nami #3789),
    // parenthetical ("adds 2.0x, preventing buff clears, to Chain multiplier", King
    // #3897), x-less (#2296, #4344), "Base Chain multiplier" (Ace #3829/#3830), and
    // the "to"-less typo "adds 0.8x Chain multiplier" (Belo Betty #3406, the only
    // one) — while requiring the word "multiplier" keeps it out of the neighbouring
    // chain mechanics, which are separate keys (Chain Multiplier LIMIT, Chain
    // Coefficient REDUCTION, Chain Multiplier GROWTH RATE, Chain Lock, Chain
    // Boundaries, Chain Tap Timing Bonus). Safe: across all 319 real matches the
    // matched "chain" is followed by "multiplier" every time.
    //
    // The old second alternative /\bchain\b[^.]{0,80}\b\+\d/i is DELETED rather than
    // kept: it was structurally dead and always had been. `\b` before `+` requires a
    // WORD character immediately before it, but upstream always writes a space
    // (" +0.2x"), so it could never fire — 0 matches corpus-wide. Repairing it
    // instead would inject 90 false positives from five other chain concepts.
    [
      /\badds?\s+\d+(?:\.\d+)?x?(?:-\d+(?:\.\d+)?x?)?(?:,(?:[^.]|\.\d){0,45},)?\s*(?:to\s+(?:the\s+)?)?(?:base\s+)?chain multiplier/i,
    ],
  ],
  [
    'chain_multiplier_multiplicative_boost',
    // Require the genuine multiplicative wording "boosts (the) chain multiplier by
    // Nx" (the "Chain Multiplication" buff category). The old loose "boosts ...
    // chain ... by Nx" mis-tagged the growth-rate effect ("boosts Chain Multiplier
    // Growth Rate by Nx" → chain_multiplier_growth_rate) and conditional ATK boosts
    // ("boosts ATK ... at the start of the chain, by Nx").
    //
    // This comment once claimed the key matched 0 "because the effect is currently
    // support-side only". That justification was false — the wording did not occur in
    // supportData either — but the key is no longer at 0 anyway: St. Shamrock #4611
    // arrived in an upstream refresh with "boosts the chain multiplier by 3x for 3
    // turns", the first genuine use of this grammar in the dataset, and the regex
    // matched it correctly with no change. So the key was never wrong, only rare, and
    // it is now live at 1.
    //
    // Do not re-assert an absolute "occurs zero times anywhere" here: that claim was
    // true when measured and false one upstream import later. Count it when you need
    // it. Whether the key earns its place belongs to its own audit.
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
  [
    'boost_base_atk',
    // Require the grant verb to DIRECTLY govern "base ATK" ("boosts base ATK of
    // <scope> by N ..." — the canonical OPTC-DB Base ATK Boost grant wording).
    // The old loose `boosts? ... base ATK` bridge mis-tagged non-grant forms that
    // merely NAME the "Base ATK Boost" buff:
    //   - the amplifier "increases boost effects of Base ATK Boost buffs by +N"
    //     (effect_boost) — "boost" in "boost effects" bridged to a later "Base
    //     ATK"; captains Dr. Vegapunk York #4135, Law & Bepo #4140, Whitebeard &
    //     Ace #4293 were tagged base-ATK granters this way;
    //   - the duration extender "increases duration of any Base ATK Boost buffs by
    //     N turns" (extend_turn_duration) and the "enables Base ATK Boost buffs to
    //     be enhanced" form — the noun "Boost" bridged to a later "Base ATK".
    // Requiring the verb to abut "base ATK" keeps all genuine grants (e.g. Big Mom
    // #2535 "Boosts base ATK of all characters by 1-1,000", Rodo #4589 "boosts base
    // ATK of [Giant] characters by 750") while dropping those buff-referencing
    // forms. The old `adds? ... base ATK` branch matched nothing beyond this and is
    // removed.
    [/\bboosts?\s+base ATK\b/i],
  ],
  ['effect_boost', [/\bincreases?\b[^.]{0,120}\bboost effects?\b/i, /\beffect boost\b/i]],
  ['critical_damage_boost', [/\bcritical damage\b/i]],
  ['final_tap_atk_boost', [/\bfinal tap\b[^.]{0,120}\bATK\b/i]],
  // Require "reduces" to directly govern "damage received/taken" (canonical
  // OPTC-DB "reduces damage received/taken by N%"; "take" handles an upstream
  // typo, e.g. Sanji "reduces damage take by 10%"). A wide `[^.]{0,120}` bridge
  // previously mis-tagged debuff cures ("reduces Increase Damage Taken"),
  // counters ("deals Nx the damage taken"), and glass-cannon downsides
  // ("increases damage received") as reduce_damage.
  [
    'reduce_damage',
    [
      // "reduces" must directly govern "damage received/taken" — see the
      // 2026-07-11 captain audit. "take"/"recieved" tolerate upstream typos
      // (Sanji #1447 "reduces damage take by 10%"; Makino & Luffy & Uta #4021 and
      // Galdino #4112 "Reduces damage recieved by 60%").
      /\breduces?\s+(?:any\s+)?damage\s+(?:received|recieved|taken|take)\b/i,
      // The threshold form sometimes drops "received" entirely — Akainu #1848 /
      // Sakazuki #1849 "reduces any damage above 3,000 by 80% for 1 turn" is a
      // genuine crew reduction that the received/taken requirement alone missed.
      /\breduces?\s+any\s+damage\s+above\s+[\d,]+/i,
    ],
  ],
  [
    // Threshold Damage Reduction: only the damage EXCEEDING the threshold is
    // reduced ("reduces a portion of ... damage ... exceeding 3000"), which is a
    // different mechanic from a flat percentage cut — the corpus itself names
    // them as separate buffs ("a Percent Damage Reduction, Threshold Damage
    // Reduction or Damage Nullification buff", Blackbeard #3279).
    //
    // The old matcher demanded "over ... HP". OPTC-DB never writes "over": the
    // wording is "reduces any damage received ABOVE 5,000 HP by 97%" (and #1848
    // drops both "received" and "HP"), so this key sat dead at 0 while its 67
    // characters were reported only as generic reduce_damage. Same
    // spelled-like-players-say-it failure as remove_sfx / reduce_ship_special_charge
    // / swap_slots. Kept INSIDE reduce_damage as a subset (mirrors
    // change_slots_matching): 39 of the 57 threshold-only characters have no
    // other reduction clause, so excluding them would delete their coverage.
    'reduce_damage_over_threshold',
    [/\breduces?\s+any\s+damage\s+(?:received\s+|recieved\s+)?above\s+[\d,]+/i],
  ],
  [
    // Damage Nullification (Fandom's crew-side "Damage Negation"): OPTC-DB has NO
    // "nullifies ... damage" verb — the old matcher's wording does not exist, so
    // the key sat dead at 0. The provider wording is always a 100% reduction, and
    // upstream equates the two itself: Jinbe #3774 captainAbility "reduces damage
    // received by 100% for 1 attack" + captainNotes "Damage Nullification
    // activates on the first instance of damage taken"; Komurasaki #3217
    // specialText "Reduces damage received by 70%-100%" + specialNotes "3rd time
    // or more: 100% nullification".
    //
    // Matching the literal "Damage Nullification" noun instead would be wrong on
    // both sides: 87% of those clauses are the ENEMY buff (already
    // remove_enemy_damage_nullification), and every crew-side one is a META clause
    // (duration extender / buff replacer / note), never a provider.
    //
    // The typed form "reduces damage received FROM [X] enemies by 100%" is
    // included (Fandom: "sometimes only a single type, such as all QCK damage
    // received"). The "any ... above N HP by 100%" threshold form is excluded by
    // requiring "damage received" to abut "reduces" — a 100% THRESHOLD cut is
    // Threshold DR, which the corpus lists as a distinct buff. The gap forbids a
    // second "damage" so a later clause's "by 100%" cannot be claimed.
    'nullify_damage',
    [/\breduces?\s+damage\s+(?:received|recieved)\b(?:(?!\bdamage\b)[^.;]){0,60}?\bby\s+100%/i],
  ],
  [
    'lock_slots',
    // Orb Lock: "locks <scope> orbs/slots" so the crew's slots stay fixed for N
    // turns. Require "locks" to DIRECTLY govern an orb/slot object (bounded scope
    // whitelist: all / own / the / your Captain's / [Type] / N). The old loose
    // `locks? ... (orbs?|slots?)` (80-char bridge) mis-tagged two Chain-related
    // families whose "orbs" came from a LATER, unrelated clause:
    //   - "locks the chain multiplier at Nx ... boosts Orb Effects / randomizes
    //     all orbs" (the object of "locks" is the CHAIN MULTIPLIER, not orbs) —
    //     Rayleigh #1882/#1883/#3018, Sabo #2440/#2441, Boa Hancock #2682; and
    //   - the "Chain Lock" buff referenced by name ("increases duration of any
    //     Chain Lock buffs ... changes/boosts orbs", "Chain Lock and Orb
    //     Amplification") — Vivi&co #3943/#3944, Trafalgar Law #4185, Luffy VS
    //     Kaido #4210/#4211, Stussy #4228, Hack #4421.
    // Because the scope whitelist has no bare "and"/"the chain", "Chain Lock and
    // Orb ..." and "locks the chain multiplier" no longer reach an orb object.
    // Scope is a BOUNDED run ({0,4}) of non-overlapping single scope words each
    // ending in whitespace (no nested quantifiers → no exponential backtracking);
    // "and"/"the chain" are deliberately absent so the Chain families can't reach
    // an orb object. ("[Type] orbs" locks don't exist upstream, so no [T] token.)
    [
      /\blocks?\s+(?:(?:all|own|the|your|selected|adjacent|top|bottom|left|right|row|column|[a-z]+['’]s|[\d,]+)\s+){0,4}(?:orbs?|slots?)\b/i,
    ],
  ],
  [
    'make_slots_favorable',
    // OPTC-DB canonical: "makes [X] orbs beneficial for <scope>" (1,017 of the
    // 1,019 hits have the term flush against "orbs"; "orbs matching for all
    // characters" — Brook #3665 — is the same effect worded differently, and
    // "makes ... orbs that the Captain has beneficial" is the one long variant).
    //
    // Neither gap may span another effect verb, or "makes" bridges across a
    // comma into an unrelated clause and reports a slot effect that is not
    // there: Hyouzou #1435/#1436 "MAKES PERFECTs harder to hit for 1 turn,
    // CHANGES [STR] ... orbs of Powerhouse characters into MATCHING orbs" is a
    // tap-timing debuff plus a slot CHANGE (already `change_slots`), and Perona
    // #4263 "makes Badly Matching and [BLOCK] orbs NOT REDUCE DAMAGE ... changes
    // ... into Matching orbs" only removes a penalty. The "favorable" alternative
    // is dropped: it matched zero characters on any source, because "favorable"
    // /"advantageous" is never the verb upstream (the app label was the only
    // place that word appeared — see the label note in the definitions file).
    [
      /\bmakes?\b(?:(?!\b(?:changes?|boosts?|locks?|randomizes?|delays?|recovers?|reduces?|removes?|sets?|deals?|inflicts?|increases?)\b)[^.]){0,160}?\b(?:orbs?|slots?)\b(?:(?!\b(?:changes?|boosts?|locks?|randomizes?|delays?|recovers?|reduces?|removes?|sets?|deals?|inflicts?|increases?)\b)[^.]){0,80}?\b(?:beneficial|matching)\b/i,
    ],
  ],
  [
    'change_slot_chance',
    [/\b(?:changes?|boosts?|increases?)\b[^.]{0,120}\b(?:orb|slot)\b[^.]{0,80}\bchance\b/i],
  ],
  [
    // Position-only orb movement ("Slot Swap" on the wiki — explicitly NOT a
    // Slot Change: orb types are untouched, they trade places). OPTC-DB's only
    // wording for it is "switches orbs between slots N time(s)" — the verb is
    // ALWAYS "switches", never "swaps": upstream reserves "swaps" for
    // unit/captain swaps ("swaps this unit with your captain") and the Swap
    // debuff. The old /swaps? ... orbs?/ matcher therefore matched ZERO real
    // orb-swaps; its 3 hits were captain-swap and Swap-cure clauses bridging
    // into a later "Orb Effects"/"ATK Up, Orb ..." noun, while all ~73 genuine
    // "switches orbs between slots" units went undetected. "Switch Effect"
    // (the VS/switch-gauge mechanic) never fits this shape, so it stays out.
    'swap_slots',
    [/\bswitch(?:es)?\b[^.]{0,40}\borbs?\b[^.]{0,40}\bbetween\b[^.]{0,30}\bslots?\b/i],
  ],
  [
    'change_slots',
    [
      // Exclude orb-EFFECT changes ("changes the Orb Multiplier / Amplification /
      // Effects ... of [X] orbs"): those alter an orb's multiplier/effect, not its
      // type, so they are not a slot/orb-type change (e.g. Kaido & Big Mom #4477
      // "change the Orb Multiplier of specific orbs"). Genuine changes name an orb
      // type or "the orb(s)" as the object, not the "Orb <effect>" noun.
      //
      // The lookbehind rejects the RESTRICTION clause "becomes unable to change
      // to [X] orbs for N turns" — a self-limitation, not an orb change; Dr.
      // Vegapunk #4423 was matched ONLY through it (his real orb effect is an
      // undirected randomize, which is deliberately not this key — OPTC-DB
      // filters "Randomizes all orbs" as its own "Orb randomizers" family).
      //
      // No "transforms" alternative: zero of the 1,820 change-clauses in the
      // corpus use it for orbs — upstream reserves "transforms" for CHARACTER
      // transformations ("transforms [STR] characters into Super [STR]
      // characters"), so keeping it was pure bridge risk with no coverage.
      /(?<!\bunable to )\bchanges?\b(?!\s+(?:the\s+)?Orb\s+(?:Multiplier|Amplification|Effects?)\b)[^.]{0,160}\b(?:orbs?|slots?)\b/i,
    ],
  ],
  [
    // The type-ADAPTIVE subfamily ("Favorable Slot Change" on the wiki —
    // "matches the orb to whatever type the character is", its own category,
    // rainbow-team oriented): OPTC-DB words it "changes ... into (a) Matching
    // orb(s)". A strict subset of `change_slots` (umbrella membership is kept,
    // mirroring how `change_block_slots` overlaps it), split out because 649
    // characters carry it and a fixed-type change is useless to a rainbow team.
    // "into Badly Matching orbs" (sabotage) does not match — "Badly" sits
    // between "into" and "Matching".
    'change_slots_matching',
    [/\bchanges?\b[^.]{0,160}\binto\s+(?:a\s+)?Matching\s+orbs?\b/i],
  ],
  [
    // [BLOCK] orbs "cannot be changed by most specials unless they say so
    // specifically" (Fandom glossary), so an effect only touches them when the
    // text SAYS it does. That is why the bare "including [BLOCK]" pattern below
    // needs no verb: the phrase IS upstream's block-immunity-piercing marker,
    // not a loose substring. The glossary's own named example of a special that
    // can change block orbs — "Jerry Cipher Pol No. 6" — is #722, whose entire
    // special is "Randomizes all orbs, including [BLOCK] orbs", and it reaches
    // this key through exactly that pattern. (This is also why randomizers count
    // here while `change_slots` excludes them: that key is about type CHANGES,
    // this one is about the capability to touch BLOCK at all.)
    'change_block_slots',
    [
      /\bchanges?\b[^.]{0,180}\[BLOCK\][^.]{0,160}\b(?:orbs?|slots?)\b/i,
      /\bincluding\s+\[BLOCK\]/i,
      // Two further ways upstream clears BLOCK without saying "changes": a
      // DIRECTED randomize ("Randomizes [BLOCK] orbs into either [QCK] or [DEX]
      // orbs", Zoro #579/#580; "Randomizes [TND], [RCV], [EMPTY], [BLOCK] and
      // [BOMB] orbs into ...", Berry Good #774, Mr. 2 #801/#802) and the "turns"
      // verb (Blugori #931 "Turns [BLOCK] orbs into [RCV] orbs"). The gaps allow
      // commas because the orb LIST contains them, so an effect verb is excluded
      // instead to stop a bridge; requiring "into" AFTER [BLOCK] keeps this to
      // the FROM-block direction only.
      /\b(?:randomiz\w*|turns?)\b(?:(?!\b(?:boosts?|reduces?|removes?|makes?|locks?|recovers?|deals?|inflicts?|adds?|increases?|sets?|swaps?|consumes?|switches)\b)[^.;]){0,80}?\[BLOCK\](?:(?!\b(?:boosts?|reduces?|removes?|makes?|locks?|recovers?|deals?|inflicts?|adds?|increases?|sets?|swaps?|consumes?|switches)\b)[^.;]){0,60}?\binto\b/i,
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
  // NOTE: there is deliberately NO `remove_silence` matcher. "Silence" is the
  // IN-GAME label for the debuff OPTC-DB otherwise words as "Special Bind" (it
  // greys out the special gauge and locks specials) — the same effect seen under
  // two names, exactly like Blindness/Remove SFX. It is NOT Despair: Despair is
  // shown in-game as "Gloom" and OPTC-DB words it "Despair". Upstream is simply
  // inconsistent — only 5 units (#4197/#4262/#4288/#4426/#4502) say "Silence"
  // while 356 say "Special Bind", interleaved across the same id range (the
  // newest units of all, #5031/#5032, still say "Special Bind"), so this is
  // transcription drift, not a rename or a distinct mechanic. The `silence`
  // alias on `remove_special_bind` in TARGET_ALIASES already routes these units
  // to the single canonical key WITH their turn count; a separate matcher here
  // only produced a duplicate turn-less picker entry. See TARGET_ALIASES.
  ['apply_delay', [/\bdelays?\b[^.]{0,120}\benemies\b/i]],
  [
    'apply_def_reduction',
    [
      /\breduces?\b[^.]{0,120}\benem(?:y|ies)[^.]{0,80}\bDEF\b/i,
      /\binflicts?\b[^.]{0,120}\bDEF Down\b/i,
    ],
  ],
  // The crew INFLICTS the "Increase Damage Taken" (IDT) debuff ON ENEMIES so they
  // take Nx more damage: OPTC-DB "Inflicts all enemies with Increase Damage Taken by
  // Nx for M turn(s)" (dominant) and the rare "increases all enemies' damage taken by
  // Nx" (#4603). Anchor on the APPLY verb (or the "all enemies' damage taken" grant):
  // the old /increases?..damage taken/ 120-char bridge keyed on the word "Increase"
  // inside the debuff NAME and could not tell direction, so 115 of 214 were false
  // positives — 49 CURE clauses ("reduces/removes Increase Damage Taken duration",
  // 100% owned by remove_increase_damage_taken, the OPPOSITE mechanic), plus
  // "boosts ATK against enemies inflicted with Increase Damage Taken" (participle
  // "inflicted", not "inflicts"), "increases boost effects of ... Increase Damage
  // Taken debuffs" (effect_boost amplifier), "Increase Damage Taken Immunity" (an
  // ally buff), and "increases duration of ... IDT debuffs" (extend_turn_duration).
  // 214 -> 99. ("Increased Damage Taken" past-tense never tripped \bincreases?\b.)
  [
    'apply_increase_damage_taken',
    [
      /\b(?:inflicts?|afflicts?)\b[^.]{0,60}\bincrease damage taken\b/i,
      /\bincreases?\s+(?:the\s+)?all\s+enemies['’]?\s+damage taken\b/i,
    ],
  ],
  ['apply_unique_effect', [/\bunique effect\b/i]],
  [
    'apply_resistance_reduction',
    [
      /\bresistance reduction\b/i,
      /\breduces?\b[^.]{0,120}\bresistance\b/i,
      // Same type/class damage-resistance-down debuff written with the verb
      // "applies -N% <Type/Class> Resistance to enemies" (e.g. Caesar & Monet
      // #4126 "applies -10% [QCK] Resistance to all enemies for 1 turn"). The
      // "reduces" branch misses it because the verb is "applies" and never
      // precedes "resistance". OPTC never phrases a crew-side resistance GAIN
      // with "applies" (those use "boosts ... Resistance"), so this stays safe.
      /\bapplies?\b[^.]{0,60}\bresistance\b/i,
    ],
  ],
  ['apply_set_target', [/\bsets?\b[^.]{0,80}\btarget\b/i]],
  // "Weaken" is an enemy damage-increasing debuff (like ATK Down / Increase
  // Damage Taken); OPTC-DB applies it as "inflicts (all) enemies with Weaken by
  // X.Xx". The old bare /\bweakened\b/ required the "-ed" suffix, which the debuff
  // NEVER uses, so it matched 0 genuine appliers and instead only fired on the
  // unrelated transform-form name "otherwise transforms into Weakened" (#3895/
  // #3896 — 2 false positives). Anchor on the applier verb "inflicts … Weaken"
  // (bounded, ReDoS-safe; max observed inflicts→Weaken gap is 18) and exclude the
  // "-ed" transform name via a negative lookahead. Non-applier references stay
  // out because they use different verbs: "boosts ATK against enemies inflicted
  // with Weaken" (a boost-against condition — "inflicted", not "inflicts") and
  // "allows … Weaken … to ignore Debuff Protection" (an immunity-pierce enabler).
  ['apply_weakened', [/\binflicts?\b[^.]{0,60}\bweaken\b(?!ed)/i]],
  [
    'reduce_ship_special_charge',
    // The SHIP's own Special has its own cooldown, distinct from the crew's (it
    // is what Ship Bind disables). OPTC-DB words it "reduces Special Cooldown of
    // Ship by N turn(s)" — the ship is a TRAILING qualifier, never the adjacent
    // phrase "ship special". The old matcher required that "ship special"
    // adjacency, which occurs ZERO times in the corpus, so this picker key
    // matched nothing while its 16 real characters were silently absorbed by the
    // crew-facing `reduce_special_charge` (same Remove-SFX-vs-Blindness failure:
    // a key spelled the way players say it, not the way OPTC-DB writes it).
    [/\breduces?\s+(?:the\s+)?special cooldown\s+of\s+ship\b/i],
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
    //
    // The negative lookahead excludes "Special Cooldown of Ship" — the SHIP's own
    // special cooldown is a separate mechanic (`reduce_ship_special_charge`), not
    // a crew head-start. It mirrors the identical guard on
    // `restore_advance_special_charge`, whose absence here let 4 ship-only units
    // (#4257/#4345/#4384/#4385) report as crew special-cooldown reducers.
    [/\breduces?\s+(?:the\s+)?special cooldown\b(?!\s+of\s+ship\b)/i],
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
  [
    'heal_hp',
    [
      // Canonical: "Recovers N HP", "Recovers N% of crew's MAX HP", "Recovers Nx
      // character's RCV in HP", "recovers all missing HP", plus Marguerite #918's
      // legacy "a small amount of health". `(?:[^.]|\.\d)` lets the gap span the
      // decimal in "1.5x character's RCV" while still stopping at a real sentence
      // boundary (period+space, not period+digit) — without it ~27 RCV-scaled
      // healer captains were silently missed (fixed by the 2026-07-11 captain
      // audit).
      /\b(?:recovers?|heals?)\b(?:[^.]|\.\d){0,120}\b(?:HP|health)\b/i,
      // The SAME RCV-scaled heal, but upstream often omits the "in HP" tail:
      // "recovers 1x character's RCV at the end of each turn" (Nami #2675,
      // Tsuru #1319, Rayleigh #1619 ...). Requiring an HP token hid 62 healers —
      // the identical failure shape as the decimal bug, via a different tail.
      // (A decimal-BLIND probe undercounts these as 26, because [^.;] stops at
      // the "." in "recovers 0.75x" — the very trap the comment above warns
      // about, so measure this family with the decimal-tolerant construct.)
      // All 7 distinct span shapes in the corpus are "recovers <amount>
      // character's RCV", i.e. always an HP recovery; the boosts guard and the
      // comma-blocked gap keep it from reaching a neighbouring "boosts ... RCV"
      // clause, which is boost_rcv's territory and not a heal.
      /\brecovers?\b(?:(?!\bboosts?\b)(?:[^.,;]|\.\d)){0,40}\bRCV\b/i,
      // Damage-taken heals: "Recovers 50% of damage taken from enemies"
      // (Katakuri #2364, Magellan #3277, Hawkins #2981) restore HP without ever
      // naming HP. Note the reduce_damage audit correctly REJECTS this same
      // phrasing — it is a heal, not a damage reduction.
      /\brecovers?\b(?:[^.,;]|\.\d){0,30}\bof\s+(?:the\s+)?damage\s+taken\b/i,
    ],
  ],
  ['boost_rcv', [/\bboosts?\b[^.]{0,120}\bRCV\b/i]],
  [
    // Crew-side survival ("Loss Prevention" / "Zombie"): for a stated window the
    // crew cannot be dropped below 1 HP by a killing blow. OPTC-DB files it under
    // `Survivability` as "Zombies (Protect from Defeat)" — a MIRROR of, not the
    // same thing as, the enemy buff `remove_resilience` strips (upstream category
    // `Reduce Enemy Effects`). A third system shares the word and is unreachable
    // here: the Resilience socket, which lives outside all ability text.
    //
    // The two former patterns matched 0 because OPTC-DB never writes "applies
    // Resilience" crew-side — every literal "Resilience" in ability text is the
    // ENEMY buff. The crew effect is always written "protects from defeat" (72
    // occurrences) or "prevents defeat" (2, Brook #3575/#3576, whose captainNotes
    // name the mechanic: "Resilience activates when taking damage from an enemy
    // that would kill you").
    //
    // Adjacency is exact in all 74 occurrences, so this needs no [^.]{0,N} gap —
    // and must not grow one. Widening it to the usual decimal-tolerant hatch
    // (?:[^.]|\.\d) on the OLD pattern 2 was measured to cross "1.2x" and bridge
    // an enemy-Resilience strip into an unrelated crew heal, yielding two pure
    // false positives (#4429/#4430 Kizaru). Gap widths {0,10}..{0,200} all return
    // the identical 67 ids, so the gap buys nothing and only risks that class.
    //
    // Deliberately NOT in DURATION_TURN_KEYS: the population is mixed —
    // "protects from defeat for N turns" (specialText, 37) carries a duration but
    // "Protects from defeat as long as HP is above N%" (captainAbility, 30) is a
    // PERMANENT passive the schema cannot express. Enabling turns erases every
    // null-turn record from the buckets, dropping 28 of 67 overall and 30 of 32
    // in captain mode, to separate just 2 characters. See the audit record.
    'apply_resilience',
    [/\b(?:protects?|prevents?)\s+(?:from\s+)?defeat\b/i],
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
  [
    'end_of_turn_additional_damage',
    // The character/captain DEALS additional damage TO ENEMIES at the end of a turn
    // (recurring "at the end of each turn", or one-off "at the end of the turn").
    // Anchor on the canonical tail "damage to <scope> enem(y|ies) at [the] end of
    // [each|every|the] turn" — the damage OBJECT bound to the end-of-turn timing.
    // The old `/end of (?:each )?turn ... damage/` assumed the timing preceded
    // "damage" and therefore both:
    //   (1) MISSED the real wording "deals Nx ATK in [Type] damage to all enemies at
    //       the end of each turn" (damage BEFORE the timing) — ~180 genuine captains/
    //       specials (Kaido, Magellan, Eneru, Big Mom, Franky, King, ...), and
    //   (2) OVER-MATCHED non-dealing forms where an unrelated end-of-turn clause (a
    //       heal) bridged to a later "damage": "reduces damage received", the enemy-
    //       buff removal "removes/reduces enemies' End of Turn Damage/Percent Cut"
    //       (the ENEMY dealing damage to your crew), "attacks will ignore damage",
    //       and "deals ... damage ... at the start of every stage".
    // Requiring "damage to <scope> enemies" to ABUT the end-of-turn timing keeps only
    // genuine end-of-turn damage dealers (incl. the "at end of each turn" no-"the"
    // wording and the "in Typeless damage to all enemies at the end of each turn"
    // damage-taken retaliation form).
    [/\bdamage\s+to\b[^.]{0,30}\benem(?:y|ies)\b\s+at (?:the )?end of (?:each |every |the )?turn\b/i],
  ],
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
    //
    // The bare \bPERFECT\b cannot match the PLURAL "PERFECTs"/"PERFECTS" (\b needs a
    // non-word char after "PERFECT", but "s" is a word char), and that plural is the
    // DOMINANT captain gate wording — so ~100 genuine gates were missed ("after
    // scoring 3 PERFECTs in a row", Gear Third Luffy #217; "after N consecutive
    // PERFECTs", Law #2001; "depending on how many PERFECTs scored", Akainu #2022;
    // "If you score 2 PERFECTS", Morley #2568). The added alternatives target those
    // gate shapes PRECISELY rather than broadening to \bPERFECTs?\b — the broad form
    // would also pull in the out-of-scope "makes PERFECTs easier/harder to hit"
    // (tap-difficulty modifier) and "makes PERFECTs consume [RCV] orbs" (orb
    // mechanic), neither of which gates an effect on tap timing.
    [
      /\bPERFECT\b(?![^.]{0,45}\bkeep\b[^.]{0,20}\borbs?\b)/i,
      /\btap-?timing\b/i,
      /PERFECTs?\s+in a row/i,
      /consecutive\s+PERFECTs?/i,
      /how many\s+PERFECTs?/i,
      /\b(?:hit|score)s?\s+\d+\s+PERFECTs?\b/i,
    ],
  ],
  [
    'extend_turn_duration',
    // The crew BUFF-DURATION EXTENDER: OPTC-DB "Increases duration of any <buff>
    // buffs by N turn(s)" (also "... Delay debuffs", a crew-beneficial enemy debuff)
    // and the lone "extends the duration of crew's <buff> by N turns" (#4613). Anchor
    // the verb DIRECTLY on "duration of": the old loose /increases?..duration/ 120-char
    // bridge latched onto the word "Increase" inside the DEBUFF NAMES "Increase Damage
    // Taken" (50) and "Increase Defense" (1, #3935 Smoothie) and bridged to a later
    // "duration" even though the sentence verb is "reduces" — tagging the debuff-CURE
    // family (remove_increase_damage_taken etc.), the exact OPPOSITE of an extender,
    // as an extender. 264 -> 213 (drops 51 pure false positives; every genuine
    // "increases/extends [the] duration of ..." extender is retained). Past-tense buff
    // names "Increased Damage Taken"/"Increased Defense" never tripped \bincreases?\b.
    [/\b(?:increases?|extends?|prolongs?)\s+(?:the\s+)?duration\s+of\b/i],
  ],
  // "Delayed Effect Launch" = an effect scheduled to activate on a LATER turn
  // ("activates <Special> in the following turn"; "boosts ... for 1 turn in the
  // following turn"; "After N turns, <effect>"; "launches ... after N turn: ...").
  // The "after N turns" branch must be comma/colon-terminated: every genuine
  // delayed launch reads "After N turns, <effect>" or "launches ... after N turn:
  // <effect>", whereas the ONLY non-launch uses are period-terminated ramp caps
  // and cooldowns ("... at the end of each turn until it reaches a maximum Nx
  // after 20 turns." — Elizabello II #2423/#2424, a per-turn ramp active from
  // turn 1, nothing launches on turn 20). Requiring the delimiter drops those
  // ramp caps and zero genuine launches (corpus-wide those two ids are the ONLY
  // non-delimited "after N turns" occurrences).
  //
  // "in the next turn" is the rare twin of "in the following turn" — same deferral,
  // different upstream wording — and was silently missed: Doc Q #4105 ("... for 1
  // turn in the next turn.") and Blackbeard #4146 ("... inflicts all enemies with
  // Increase Damage Taken by 1.75x for 1 turn in the next turn."). 182 -> 184.
  //
  // The deferral branch is anchored on "in the" rather than a bare "following turn"
  // /"next turn". That is output-identical today, but the leading preposition is what
  // separates the DEFERRAL from two non-launch uses of the same nouns: the condition
  // form "if during the following turn you score N PERFECT hits" (6 occurrences, all
  // on recent ids 3831+, a growing shape) and the Chain carry-over "carries over Nx of
  // Chain Multiplier on this turn to the next turn" (#3829/#3830). Both describe a
  // later turn without scheduling anything to launch on it.
  [
    'delayed_effect_launch',
    [/\bin the following turn\b/i, /\bafter\s+\d+\s+turns?\s*[,:]/i, /\bin the next turn\b/i],
  ],
  ['boost_max_hp', [/\bboosts?\b[^.]{0,120}\bmax HP\b/i]],
  [
    // "Apply Status Effect (Ally)" = applying a beneficial status to your OWN
    // crew. The two canonical OPTC-DB wordings that have no dedicated key are the
    // crew debuff-immunity buff ("applies <Status> Immunity for N turns" — Burn /
    // ATK DOWN / Increase Damage Taken / Chain Coefficient Reduction / Blindness /
    // Tap Limit Immunity) and "Applies a Turn Progress Effect for N turns". The
    // old `applies … to/for … crew|characters` bridge mostly matched FALSE
    // POSITIVES where "characters" was an unrelated boost target: "applies
    // Territory: X to the field … boosts ATK of <scope> characters" (Territory-to-
    // field, own `territory` key — 14 hits) and "applies the following: Deals …
    // damage to all enemies" (end-of-turn damage — #4081/#4082). Anchor on the
    // applied status itself instead (ReDoS-safe; max applies→status gap is 56).
    'apply_ally_status_effect',
    [/\bapplies?\b[^.]{0,80}\b(?:immunity|turn progress effect)\b/i],
  ],
  ['swap_captains', [/\bswaps?\b[^.]{0,120}\bcaptains?\b/i]],
  // Remove Beneficial Effect = an OFFENSIVE debuff that strips the ENEMY's
  // beneficial effects. The negative lookbehind excludes the DEFENSIVE
  // "Nullif(y|ies) Remove Beneficial Effects ..." self-protection captain
  // ability (Gol D. Roger #3176/#3177, #3786, #4057/#4058), where "Remove
  // Beneficial Effects" is a NAMED enemy attack the crew nullifies — not the
  // crew removing enemy buffs. The old `removes? ... beneficial effects`
  // matched the "Remove" inside that named buff, mis-tagging all 5. No genuine
  // "removes enemies' beneficial effects" wording exists in the corpus, so this
  // key correctly resolves to 0; the guard keeps future genuine removals
  // (e.g. "Nullifies Bind and removes enemies' beneficial effects") matching.
  ['remove_beneficial_effect', [/(?<!\bnullif(?:y|ies|ied)\s)\bremoves?\b[^.]{0,120}\bbeneficial effects?\b/i]],
  // In-battle Class Change reassigns a character's Class 1 / Class 2 (each unit
  // has up to two of the 8 classes) — "changes Class 1/Class 2 of all non-<X>
  // characters to <Y> class for N turns" and self-reclass "Changes own Type and
  // both Classes to any selected combination". The old `changes? … class` used a
  // 120-char bridge to ANY "class", so a "changes orbs … boosts Advantageous
  // Class" clause (Advantageous Class is a damage boost, not a reclass) bridged
  // into false positives — #4372 (specialText) and #4477 (captainAbility, the
  // lone captain match). Require the changed object to be the class itself
  // ("Class 1" / "Class 2" / "both Classes"), which also fixes the plural-form
  // miss "both Classes" (#3522/#3523). (9 further genuine reclass specials carry
  // the wording only in superSpecialText and stay undetected under the pre-
  // existing territory-only super limitation for SPECIAL_ABILITY_MATCHERS.)
  ['class_change', [/\bclass change\b/i, /\bchanges?\b[^.]{0,40}\b(?:class\s*[12]\b|both classes\b)/i]],
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
    // "Special Bind" (OPTC-DB's house wording, 356 units) and "Silence" (the
    // in-game label, 5 units) are the SAME debuff — specials locked, special
    // gauge greyed out — so both wordings must resolve to this one key. The
    // Fandom glossary states it directly ("Special bind - also known as silence
    // or numbness ... note it is called silence here" on the in-game
    // visualisation) and the Special Bind Reduction category is worded
    // "Special Bind/Silence Reduction" throughout.
    //
    // The `silence` alias must NOT be read as Despair even though the community
    // sometimes says "silence" for Despair: in-game Despair is labelled "Gloom",
    // and OPTC-DB words it "Despair" (476 units) — no unit ever pairs "Silence"
    // with "Despair" in the same field, and every "Silence" unit's cure sits
    // alongside ordinary cleanses (ATK Down, Blindness), not captain-only ones.
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
    // "Minimum-Chain ATK Down" and "Maximum-Chain ATK Down" are DISTINCT
    // chain-conditional debuffs, NOT plain ATK Down: OPTC-DB models them as
    // separate matchers/filter checkboxes ("Sets minimum|maximum Chain
    // multiplier ATK reduction to Nx") alongside the plain "ATK DOWN"
    // ("Reduces ATK of ... characters"), and a cure must name the chain
    // variant to clear it. The bare "atk down" substring must not swallow
    // them — mirrors remove_bind excluding special/slot/orb/ship bind and
    // remove_despair excluding sailor despair. Excluding "chain atk down"
    // drops the chain-only cures (e.g. Ace #4067/#4068 & Burgess #4101/#4102
    // "reduces Minimum-Chain ATK Down duration", Sanji & Reiju #4483
    // "reduces Maximum-Chain ATK Down duration") without affecting any plain
    // ATK-Down cure (plain wording never contains the "chain atk down" adjacency).
    key: 'remove_atk_down',
    label: 'Remove ATK Down',
    matcher: (target) =>
      (target.includes('atk down') || target.includes('attack down')) &&
      !target.includes('chain atk down'),
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
    // "thredhold" is upstream's sole misspelling of "threshold" (1 of 955 uses,
    // Nefeltari Vivi #3667 "reduces enemies' Thredhold Damage Reduction duration by
    // 1 turn"). Accepting it here is scoped to this key and cannot leak elsewhere:
    // the exact-match remove_damage_reduction already rejects it (it is not one of
    // its two strings). Same one-off-typo class as remove_despair's "reducess".
    matcher: (target) =>
      target.includes('threshold damage reduction') ||
      target.includes('thredhold damage reduction'),
  },
  {
    key: 'remove_resilience',
    label: 'Remove Resilience',
    matcher: (target) => target.includes('resilience'),
  },
  {
    key: 'remove_enemy_increased_defense',
    label: 'Remove Increased Defense',
    // Spelling-tolerant on the trailing "d": OPTC-DB usually writes the enemy buff
    // "Increased Defense", but Charlotte Smoothie #3935 carries the upstream typo
    // "Increase Defense" ("Reduces enemies' Increase Defense, Percent Damage
    // Reduction and Threshold Damage Reduction duration by 4 turns"). The target is
    // already pre-scoped by TURN_PATTERNS to the reduced enemy-buff name, so this
    // cannot reach a crew self-buff "increases defense" or DEF-DOWN "reduces DEF of
    // enemies" (a different mechanic, apply_def_reduction).
    matcher: (target) =>
      /increased?\s+defense/.test(target) ||
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
    // The ENEMY's auto-heal buff is named "End of Turn Heal"; the CREW's own
    // regen buff is "End of Turn HealING". Upstream keeps the two spellings
    // perfectly separate in removal targets — all 14 genuine enemy strips read
    // "reduces enemies' ... End of Turn Heal ... duration", and every "End of
    // Turn Healing" removal target is the crew CONSUMING its own buff (Garp
    // #4239/#4240, Hibari #4523, Zoro VS Nusjuro #4529 all gate on "If your crew
    // has End of Turn Healing" and then spend it), which is not an enemy strip.
    //
    // The possessive cannot be used here: normalizeTargetText deliberately
    // strips "enemies'" before an alias ever sees the target, so the spelling is
    // the only signal available at this layer. The `\b` also drops Garp &
    // Tashigi #4553, whose target bridges a whole clause ("enemies' damage
    // received by 50% for 3 turns, increases duration of any End of Turn
    // Healing") — an EXTENDER, the opposite of a strip.
    //
    // If upstream ever writes "reduces enemies' End of Turn Healing duration",
    // this misses it; that costs a miss rather than a wrong tag, and today the
    // split is 14/14 vs 4/4 clean.
    key: 'remove_enemy_end_of_turn_heal',
    label: 'Remove End of Turn Heal',
    matcher: (target) => /\bend of turn heal\b/.test(target),
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
    // "Chain Multiplier Limit" is the ENEMY debuff that caps the crew's chain
    // multiplier; removing it is "reduces/removes Chain Multiplier Limit duration
    // by N turns". The old `|| target.includes('chain lock')` alias conflated it
    // with the FRIENDLY "Chain Lock" buff (which locks YOUR chain multiplier at a
    // value — the opposite, carried by chain_multiplier_lock): every corpus
    // "chain lock" removal-target actually comes from "increases duration of any
    // Chain Lock/Limit/Boundary buffs" (a friendly-buff EXTENSION), so all 3
    // "chain lock"-only matches (#4000/#4128/#4289 — the entire captainAbility
    // count) were false positives, and ZERO genuine enemy removals use "Chain
    // Lock" without "Chain Multiplier Limit". Require the real debuff name.
    matcher: (target) => target.includes('chain multiplier limit'),
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
    // A RANGE turn count "by N-M turns" (e.g. X Drake #2823 "reduces enemies'
    // Barrier duration by 1-5 turns", Chaka #3644 "reduces Bind duration by 1-5
    // turns") records the FIRST number as minTurns — the guaranteed minimum
    // reduction (a "1-5" range guarantees at least 1). The optional "-M" tail is
    // non-capturing so match[2] stays the min; a range whose min is 0 ("by 0-10
    // turns") guarantees nothing and so resolves to null, NOT 0 — see resolveTurns
    // below. Returning 0 made the downstream `minTurns <= 0` guard drop the whole
    // match, tag included, which denied membership rather than just withholding
    // the turn guarantee.
    // The target excludes a second "reduce(s)/remove(s)" verb so it cannot bridge
    // a first no-turn-count clause into a later "by N turns" clause — e.g. Zeus &
    // Prometheus & Big Mom #3902 "reduce Paralysis duration by half and reduces
    // Special Cooldown ... by 1-99 turns" must NOT tag remove_paralysis via the
    // special-cooldown range ("by half" is an uncountable partial reduction).
    // "Reduction"/"reduced" are unaffected (\breduces?\b matches only the verb).
    // `completely` is in the guard for the mirror-image reason: a target that
    // crosses a finished "... duration completely" clause is reaching into a
    // LATER clause's turn count through a verb the guard does not list, e.g.
    // Luffy #4129 "removes enemies' ATK Up and Enrage duration completely, and
    // delays all enemies by 2 turns" captured "...completely, and delays all
    // enemies" + "by 2 turns" and published a bogus 2-turn ATK Up removal beside
    // the correct permanent one. A genuine "by N turns" target never contains
    // "completely", so this only ever drops bridges (6 records, 0 replacements).
    pattern:
      /(?:reduces{0,2}|removes?)\s+((?:(?!\breduces{0,2}\b|\bremoves?\b|\bcompletely\b)[^.;])+?)\s+(?:duration\s+(?:by\s+)?|by\s+)(\d+)(?:\s*-\s*\d+)?\s+turns?/gi,
    // A range publishes its LOWER bound, because minTurns means "guaranteed at
    // least this many" ("by 1-99 turns" -> 1). A ZERO floor therefore guarantees
    // nothing, and returning 0 made the consumer's `minTurns <= 0` check discard
    // the whole match - tag included - so Boa Hancock #4398/#4399 ("reduces Bind
    // duration by 0-10 turns depending on the number of [RCV] orbs used in normal
    // attacks") cured Bind but was absent from remove_bind entirely, unfilterable
    // even with no turn requirement. null means "real cure, no guaranteed floor":
    // the same shape the parser already uses for turn-less abilities, so she is
    // matched by an unfiltered search and correctly skipped by any "N+ turns" one.
    // This is the corpus's only zero-floor range (the other 17 all start at 1+),
    // and there is no literal "by 0 turns" anywhere, so nothing else changes.
    resolveTurns: (match) => (Number(match[2]) > 0 ? Number(match[2]) : null),
  },
  {
    isCompleteRemoval: false,
    // Comma-continuation: one leading "Reduces" can govern a SECOND
    // "<target> duration by N turns" clause that follows the first one after it
    // already closed with "... turns," and WITHOUT repeating the verb. Bobbin
    // #2118/#2119 "Reduces enemies' Threshold Damage Reduction, ... duration by 5
    // turns, crew's ATK DOWN duration by 5 turns and changes orbs ..." — the
    // verb-anchored pattern above and the "and reduces" ellipsis both require a
    // verb before the target, so the verbless "crew's ATK DOWN duration by 5
    // turns" continuation went untagged.
    //
    // The lookbehind anchors on a completed "turns" clause, so it cannot re-read
    // the first clause, and the body excludes verbs/duration/turns/comma so it
    // captures exactly one self-contained continuation segment. The reduces{0,2}
    // guard also keeps it off the typo "reducess" continuation (Makino #3844,
    // already handled by the verb pattern).
    //
    // TWO punctuations of the same shape occur upstream and both must be read:
    // the comma form "... by 5 turns, crew's ATK DOWN duration by 5 turns"
    // (Bobbin #2118/#2119) and the COMMA-LESS conjunction "... duration by 5
    // turns and Barrier duration by 1 turn" (Blackbeard #2402/#2403 -> Barrier,
    // Caribou #1841/#1842 -> ATK Up). The lookbehind originally required the
    // literal comma, so the conjunction form went untagged. Corpus-wide these are
    // the ONLY 4 occurrences of the comma-less shape, so the blast radius is
    // fully enumerated: +2 remove_enemy_barrier, +2 remove_enemy_atk_up, 0
    // collateral on every other key.
    //
    // Keep the alternation EXPLICIT. The looser `turns,?\s*(?:and\s)?` would also
    // admit any target directly following a bare "turns ", which re-opens the
    // bridge this pattern's guards exist to prevent.
    pattern:
      /(?<=turns(?:,\s{0,3}(?:and\s)?|\s{1,3}and\s))((?:(?!\breduces{0,2}\b|\bremoves?\b|\bcompletely\b|\bduration\b|\bturns?\b|,)[^.;])+?)\s+duration\s+by\s+(\d+)\s+turns?/gi,
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
    // The `(?!reduces|removes)` guard is the same one the "by N turns" pattern
    // above carries, and is required for the same reason: without it the lazy
    // target starts at the FIRST verb in the sentence and swallows every clause
    // up to a distant "completely", so "Reduces Paralysis duration by 3 turns,
    // removes Poison duration completely" (Kalifa #1295) captured "Paralysis
    // duration by 3 turns, removes Poison" and published a PERMANENT Paralysis
    // clear (minTurns 99) for what is really a 3-turn cure — while the actual
    // "completely" target, Poison, went unrecorded. 50 characters were bridged
    // this way; the guard makes each capture start at its own verb.
    pattern:
      /(?:reduces{0,2}|removes?)\s+((?:(?!\breduces{0,2}\b|\bremoves?\b)[^.;])+?)\s+(?:duration\s+)?completely/gi,
    resolveTurns: () => 99,
  },
  {
    isCompleteRemoval: false,
    // Upstream's ELLIPSIS: "reduces Bind and reduces enemies' Percent Damage
    // Reduction duration by 3 turns" (Monet #2010/#2011). The first target has no
    // duration of its own - the trailing "by 3 turns" distributes across BOTH -
    // so the anti-bridge guard (correctly) refused to cross the second "reduces"
    // and the Bind cure was dropped. Fandom confirms the intent: Monet's skill is
    // "reduces Bind duration by 3 turns, and reduces all enemies damage reduction
    // duration ... for 3 turns", and the page carries [[Category:Bind Reduction]].
    //
    // This is NOT the bridge case the guard exists to stop: there, the first
    // clause has its OWN "duration by N turns" and the swallowed verb starts a
    // genuinely separate effect. Here the conjunction is "and reduces" with no
    // intervening duration, which is one clause listing two targets. Requiring a
    // trailing "duration by N turns" keeps the verb-less "Remove Beneficial
    // Effects and Remove Accumulated Value effects once per ..." family (Roger
    // #3176 et al) out. Group 1 spans both targets; the second segment keeps its
    // "reduces" prefix and simply matches no alias, which is harmless.
    //
    // The FIRST target additionally may not contain "duration" or "turns": that
    // is what separates an ellipsis from the bridge. Without it, Dogstorm #2168
    // "Reduces Special Bind duration by 4 turns and reduces enemies' Threshold
    // Damage Reduction duration by 3 turns" would swallow its own 4-turn clause
    // and republish Special Bind as a 3-turn cure - the exact defect the guards
    // above exist to stop.
    pattern:
      /(?:reduces{0,2})\s+((?:(?!\breduces{0,2}\b|\bremoves?\b|\bduration\b|\bturns?\b)[^.;])+?\s+and\s+reduces{0,2}\s+(?:(?!\breduces{0,2}\b|\bremoves?\b)[^.;])+?)\s+duration\s+by\s+(\d+)\s+turns?/gi,
    resolveTurns: (match) => Number(match[2]),
  },
  {
    isCompleteRemoval: false,
    // Upstream's INVERTED cure grammar: "Recovers 2 turns of Paralysis on self"
    // (Squard #642/#643). The verb is "recovers", the amount PRECEDES the status,
    // and there is no "duration" keyword at all, so neither pattern above can see
    // it — those two were the only Paralysis cures tagged by nothing.
    //
    // The lookahead leaves " on self" unconsumed so resolveCureEffectTargetScope
    // still reads the scope from the clause tail. The turn count is re-parsed out
    // of match[0] rather than captured, which keeps group 1 as the target and so
    // needs no change to the shared consumer.
    //
    // Deliberately narrow: this grammar occurs exactly twice corpus-wide and only
    // for Paralysis, so it is an upstream one-off rather than a family.
    pattern: /\brecovers?\s+\d+\s+turns?\s+of\s+([^.;,]+?)(?=\s+on\b|[.,;]|$)/gi,
    resolveTurns: (match) => Number(/(\d+)\s+turns?/i.exec(match[0])?.[1] ?? Number.NaN),
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

// Returns the FINAL same-fingerprint activation branch of a multi-tier special
// (the max special level), plus any trailing non-independent clauses that belong
// to it. extractPrimaryAbilityBranchText intentionally keeps only the FIRST tier
// to avoid double-counting restated tiers, but a maxed character's special IS the
// last (strongest) tier, so effects that only appear there — e.g. Zoro & Sanji
// #4061 reduces enemies' Threshold Damage Reduction only from its max tier — were
// invisible. Returns the whole text unchanged when there is no later independent
// tier (so callers can cheaply detect "single tier" via strict inequality).
export function extractMaxLevelAbilityBranchText(value) {
  const normalizedText = canonicalizeOrbTokens(normalizeLegacyAbilityText(value));

  if (!normalizedText.length) {
    return '';
  }

  const sentences = splitAbilityTextIntoSentences(normalizedText);

  if (sentences.length <= 1) {
    return normalizedText;
  }

  const primaryFingerprint = createBranchStarterFingerprint(sentences[0]);

  if (!primaryFingerprint.length) {
    return normalizedText;
  }

  let lastBranchStart = 0;
  for (let index = 1; index < sentences.length; index += 1) {
    if (
      createBranchStarterFingerprint(sentences[index]) === primaryFingerprint &&
      looksLikeIndependentAbilityBranch(sentences[index])
    ) {
      lastBranchStart = index;
    }
  }

  if (lastBranchStart === 0) {
    return normalizedText;
  }

  return sentences.slice(lastBranchStart).join('. ');
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

export function analyzeBuilderAbilityText(value, source, foldMaxLevelTier = true) {
  const normalizedText = extractPrimaryAbilityBranchText(value);

  if (!normalizedText.length) {
    return [];
  }

  const abilities = [];
  const seen = new Set();

  if (source === 'superSpecialText') {
    // Super specials contribute their territory-provider effects (kept
    // restricted to the 'territory' group so the broader special-ability
    // matchers do not double-tag effects the base special already carries),
    // and then FALL THROUGH to the shared TURN_PATTERNS / SELECTED_DEBUFF /
    // EXPLICIT_BUILDER_ABILITIES pipeline below. Without the fall-through, no
    // duration-removal key (remove_* "reduces enemies' <buff> duration by N
    // turns", "removes <status> duration completely"), fixed-damage, or
    // inflict-status effect was ever derived from super text, even for genuine
    // clauses — e.g. 7 units reduce enemies' Threshold Damage Reduction
    // duration only in their super special. The line-1335 `specialText ||
    // captainAbility` guard keeps the FULL special-ability matcher set from
    // running on super text, so this only adds the shared structured pipeline
    // (identical logic already validated for specialText), not the whole
    // special catalog. extractPrimaryAbilityBranchText still bounds parsing to
    // the primary activation branch.
    addSpecialAbilityMatches(abilities, seen, normalizedText, source, new Set(['territory']));
  }

  TURN_PATTERNS.forEach(({ pattern, resolveTurns, isCompleteRemoval }) => {
    for (const match of normalizedText.matchAll(pattern)) {
      const rawTarget = String(match[1] ?? '').trim();
      const minTurns = resolveTurns(match);

      // An explicit null is a pattern SIGNALLING "this is a real effect with no
      // guaranteed turn floor" (a zero-floor range), and must keep its record.
      // Anything else non-finite or <= 0 is a failed parse and is dropped.
      if (minTurns !== null && (!Number.isFinite(minTurns) || minTurns <= 0)) {
        continue;
      }

      // Scope is read from the text right after THIS clause, so a character
      // carrying both a self-scoped sailor cure and a crew-wide special cure
      // records both (buildAbilityIdentity includes the scope, so the two
      // entries do not collapse into one).
      const effectTargetScope = resolveCureEffectTargetScope(
        normalizedText,
        match.index + match[0].length,
      );

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
            ...(ENEMY_TARGETED_REMOVAL_ABILITY_KEYS.has(normalized.key)
              ? {}
              : { effectTargetScope }),
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

  // Fold in the MAX-LEVEL (last) activation tier of a multi-tier special: a maxed
  // character's special is its final tier, so effects introduced only there
  // (e.g. Zoro & Sanji #4061 reducing enemies' Threshold Damage Reduction duration
  // only from its max tier) would otherwise be missed. We add every max-tier record
  // the primary tier did not already yield, never touching intermediate tiers —
  // everything added comes from the last tier, so this cannot over-claim an
  // intermediate-only effect.
  //
  // Dedupe is on the FULL identity (key+source+minTurns+scope), NOT key+source. The
  // narrower check reasoned only about MEMBERSHIP, so it silently discarded the max
  // tier's record whenever the same key already existed at a DIFFERENT turn count —
  // publishing the weaker LEVEL-1 count for a maxed character, whose special IS its
  // final tier. Gladius #1400 ("reduces Bind and Despair duration by 1 turn ... by
  // 2 turns") published 1; Machvise #1627 (tiers 1/3/5) published 1. Both now also
  // publish their max, while the intermediate tier still stays out. This adds 144
  // records across 75 characters and 22 keys, every one at a turn count >= its own
  // tier-1 count, and changes no key's membership.
  // Scoped to specialText, where multi-level
  // specials occur. The `foldMaxLevelTier = false` argument on the inner call
  // disables re-folding, so this cannot recurse more than one level even when the
  // extracted max-level text itself still contains nested tier restatements.
  if (foldMaxLevelTier && source === 'specialText') {
    const maxLevelText = extractMaxLevelAbilityBranchText(value);

    if (maxLevelText && maxLevelText !== normalizedText) {
      const identity = (ability) =>
        `${ability.key}|${ability.source}|${ability.minTurns}|${ability.effectTargetScope ?? ''}`;
      const existingKeySources = new Set(abilities.map(identity));

      for (const ability of analyzeBuilderAbilityText(maxLevelText, source, false)) {
        const keySource = identity(ability);

        if (!existingKeySources.has(keySource)) {
          existingKeySources.add(keySource);
          addAbility(abilities, seen, ability);
        }
      }
    }
  }

  return abilities;
}

// Matcher-based keys whose effect is a BUFF WITH A DURATION ("... for N turns"),
// so the picker can answer "an ATK boost lasting at least 3 turns". Limited to
// keys whose clause shape has been audited, because the duration must be read
// from the matched clause's OWN window (see resolveClauseDurationTurns).
//
// Deliberately EXCLUDES reduce_special_charge / reduce_ship_special_charge: their
// "by N turns" is the AMOUNT of cooldown removed at the start of the fight, not
// how long anything lasts — a different quantity that would be wrong to compare
// against a buff duration.
const DURATION_TURN_KEYS = new Set([
  'boost_atk',
  // boost_base_atk is the FLAT twin of boost_atk and shares its grammar exactly
  // ("boosts base ATK of <scope> by N for M turns"), so it belongs here for the same
  // reason: 100% of its specialText grants carry an explicit duration (1t x106,
  // 2t x45, 3t x26, 5t x1), and the 13 without one are permanent captain passives.
  // It was the odd one out — its multiplier twin boost_atk and its support-source
  // counterpart support_base_atk_boost_damage both expose a turn control while it
  // did not, so the picker omitted a turn filter the data genuinely supports.
  'boost_base_atk',
  'boost_slot_effects',
  'reduce_damage',
  'reduce_damage_over_threshold',
  'nullify_damage',
]);

// Turn count of the buff granted by THIS clause.
//
// It must not be read from the whole text: specialText is multi-effect, and the
// existing whole-text helper (resolveMaxDurationTurnCountFromText, correct for
// single-effect support text) takes the MAX "for N turns" anywhere in the
// sentence — which is wrong for 250 of boost_atk's 1,359 durationed characters.
// Usopp #572 "Boosts ATK of Fighter characters by 2x FOR 1 TURN, binds himself
// FOR 15 TURNS" would report a 15-turn ATK boost.
//
// So the window runs from the end of the matched clause to the next effect verb.
// A RANGE records its FIRST number as the guaranteed minimum ("for 1-6 turns" =>
// at least 1), matching the convention TURN_PATTERNS already uses for
// "reduces ... by 1-5 turns"; "for 0-6 turns" therefore yields 0 and is dropped
// by the caller's > 0 guard. "99+"/"6 or more" take the leading number.
const CLAUSE_DURATION_PATTERN = /\bfor\s+(\d+)(?:\s*-\s*\d+|\+|\s+or\s+more)?\s+turns?\b/i;
const CLAUSE_DURATION_STOP_PATTERN =
  /\b(?:boosts?|reduces?|removes?|changes?|makes?|locks?|randomizes?|recovers?|deals?|inflicts?|adds?|increases?|sets?|applies|swaps?|consumes?|switches|transforms?)\b/i;

function resolveClauseDurationTurns(patterns, normalizedText) {
  const durations = [];

  patterns.forEach((pattern) => {
    const scanner = new RegExp(
      pattern.source,
      pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
    );

    for (const match of normalizedText.matchAll(scanner)) {
      const tail = normalizedText.slice(match.index + match[0].length);
      const stop = tail.match(CLAUSE_DURATION_STOP_PATTERN);
      const window = stop ? tail.slice(0, stop.index) : tail;
      const duration = window.match(CLAUSE_DURATION_PATTERN);

      if (!duration) {
        continue;
      }

      const turns = Number(duration[1]);

      if (Number.isFinite(turns) && turns > 0) {
        durations.push(Math.floor(turns));
      }
    }
  });

  // A character granting both a 1-turn and a 3-turn boost genuinely has a 3-turn
  // boost, so the longest clause wins — the filter reads it as "at least N".
  return durations.length > 0 ? Math.max(...durations) : null;
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
      minTurns: DURATION_TURN_KEYS.has(key)
        ? resolveClauseDurationTurns(patterns, normalizedText)
        : resolveStructuredTurnMinTurns(key, normalizedText),
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

// Removal keys whose target is the ENEMY ("reduces enemies' Barrier duration by
// 3 turns"), not your crew. The captains/subs/crew/self scopes describe which of
// YOUR team-roles an effect lands on, so they are meaningless here — an enemy
// debuff stripped "for the crew" is not a thing. These keys therefore carry no
// scope at all, which also keeps the picker from offering a crew/self choice on
// an enemy-facing filter. Mirrors the "Reduce Enemy Effect Duration" picker
// group, plus the legacy keys that group does not list.
const ENEMY_TARGETED_REMOVAL_ABILITY_KEYS = new Set([
  'remove_damage_reduction',
  'remove_enemy_atk_up',
  'remove_enemy_barrier',
  'remove_enemy_damage_nullification',
  'remove_enemy_end_of_turn_damage_percent_cut',
  'remove_enemy_end_of_turn_heal',
  'remove_enemy_enrage',
  'remove_enemy_increased_defense',
  'remove_enemy_orb_based_damage_reduction',
  'remove_resilience',
  'remove_threshold_damage_reduction',
]);

// Team-role scope of a CURE/REMOVAL clause ("reduces <target> duration by N
// turns"), resolved from the text immediately FOLLOWING the matched clause.
//
// Deliberately not `resolveCaptainEffectTargetScope`: that one scans a whole
// clause for captain/sub/crew wording, which on cure text reads scope off the
// NEIGHBOURING clause and mislabels. In "Boosts ATK of Slasher characters by
// 1.3x for 2 turns, reduces Bind duration by 2 turns" the class wording belongs
// to the ATK boost, and in "If your Captain is a Free Spirit character, removes
// Blindness duration completely" the captain wording is a CONDITION, not a
// target.
//
// A corpus sweep of all 3,526 cure clauses found exactly one scope qualifier
// that ever attaches to a cure — a trailing "on this character" (457 clauses) —
// and zero captain-scoped or sub-scoped cures, so this is a two-way rule. The
// qualifier is required to be ADJACENT to the clause (not merely nearby): every
// one of the 457 sits flush against it, and requiring adjacency stops a later
// clause's "on this character" from leaking onto an earlier crew-wide cure.
function resolveCureEffectTargetScope(text, clauseEndIndex) {
  // "on this character" is the dominant qualifier (499 occurrences); "on self"
  // is the same scope worded differently and occurs exactly twice, on the
  // inverted "Recovers N turns of Paralysis on self" grammar (Squard #642/#643).
  return /^\s*on\s+(?:this character|self)\b/i.test(String(text).slice(clauseEndIndex))
    ? 'self'
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
  // GRANT of end-of-turn additional damage to the supported character: "deals
  // [N% / Nx] ... damage to <scope> enemies at [the] end of [each|the] turn".
  // Anchor on the tail (the damage OBJECT bound to the end-of-turn timing) --
  // mirrors the captain/special `end_of_turn_additional_damage` fix. The old
  // `/end of (?:each )?turn ... damage/` over-matched supportData that only
  // REFERENCES the ENEMY's "End of Turn Damage" buff (a debuff on your crew):
  // "when the enemy enables an End of Turn Damage buff, reduces Increase Damage
  // Taken ..." (Elizabello II #1564) and "removes/reduces enemies' End of Turn
  // Damage/Percent Cut duration" (Dagama #2435, Helmeppo #5056 -- the latter is
  // support_reduce_enemy_effect_turns_end_of_turn_damage), and MISSED genuine
  // grants "deals N% of enemies' current HP in damage to all enemies at the end
  // of the turn for N turns" (Tsuru, Mihawk, Denjiro, Raizo, Eneru, Momonosuke,
  // Katakuri & Oven).
  if (
    /\bdamage\s+to\b[^.]{0,30}\benem(?:y|ies)\b\s+at (?:the )?end of (?:each |every |the )?turn\b/i.test(
      text,
    )
  ) {
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

        // Team-role scope index. 'any' means "this ability carries no scope
        // information", which is not a selectable scope — only real scopes are
        // recorded, so the picker can offer exactly the populated ones and the
        // filter can resolve ids per scope. Indexed per (scope, minTurns) rather
        // than intersecting two flat lists: a character can cure at one turn
        // count on itself and a different one crew-wide, and intersecting would
        // wrongly match it for the crew scope at the self clause's turn count.
        //
        // Captain structured effects are excluded: they are scoped ONLY on their
        // captainAbility branch, so indexing them here would describe a fraction
        // of the key's matches as if it were the whole (make_slots_favorable is
        // scoped on 364 of its 996 matches) and a scope filter in non-captain
        // mode would silently drop the rest. They keep resolving through
        // captainAbilityEffectMatches, which is captain-scoped by construction.
        const effectTargetScope = normalizeEffectTargetScope(ability.effectTargetScope);

        if (effectTargetScope !== 'any' && !isCaptainStructuredEffectAbility(ability)) {
          current.availableEffectTargetScopes.add(effectTargetScope);

          const scopeEntry = current.effectTargetScopeMatches.get(effectTargetScope) ?? {
            matchingCharacterIds: new Set(),
            turnMatchingCharacterIds: new Map(),
            completeRemovalCharacterIds: new Set(),
          };

          scopeEntry.matchingCharacterIds.add(character.id);

          if (ability.isCompleteRemoval) {
            scopeEntry.completeRemovalCharacterIds.add(character.id);
          }

          if (Number.isFinite(ability.minTurns) && ability.minTurns > 0) {
            const scopeMinTurns = Math.floor(ability.minTurns);
            const scopeTurnCharacterIds =
              scopeEntry.turnMatchingCharacterIds.get(scopeMinTurns) ?? new Set();

            scopeTurnCharacterIds.add(character.id);
            scopeEntry.turnMatchingCharacterIds.set(scopeMinTurns, scopeTurnCharacterIds);
          }

          current.effectTargetScopeMatches.set(effectTargetScope, scopeEntry);
        }

        if (!current.matchingCharacterIds.has(character.id)) {
          current.matchingCharacterIds.add(character.id);
          current.matchCount = current.matchingCharacterIds.size;
        }

        if (ability.isCompleteRemoval) {
          current.completeRemovalCharacterIds.add(character.id);

          if (ability.source === 'captainAbility') {
            current.captainAbilityCompleteRemovalCharacterIds.add(character.id);
          }
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
        // Omitted entirely for abilities that carry no scope data, so the picker
        // shows no scope control for them and untouched keys keep their exact
        // current serialization.
        ...(entry.availableEffectTargetScopes.size
          ? {
              availableEffectTargetScopes: [...entry.availableEffectTargetScopes].sort(
                (left, right) => left.localeCompare(right),
              ),
              effectTargetScopeMatchingCharacterIds: [...entry.effectTargetScopeMatches.entries()]
                .sort(([leftScope], [rightScope]) => leftScope.localeCompare(rightScope))
                .map(([effectTargetScope, scopeEntry]) => ({
                  effectTargetScope,
                  characterIds: [...scopeEntry.matchingCharacterIds].sort(
                    (left, right) => left - right,
                  ),
                  turnMatchingCharacterIds: [...scopeEntry.turnMatchingCharacterIds.entries()]
                    .sort(([leftTurns], [rightTurns]) => leftTurns - rightTurns)
                    .map(([minTurns, characterIds]) => ({
                      minTurns,
                      characterIds: [...characterIds].sort((left, right) => left - right),
                    })),
                  ...(scopeEntry.completeRemovalCharacterIds.size
                    ? {
                        completeRemovalCharacterIds: [
                          ...scopeEntry.completeRemovalCharacterIds,
                        ].sort((left, right) => left - right),
                      }
                    : {}),
                })),
            }
          : {}),
        matchCount: entry.matchCount,
        matchingCharacterIds: [...entry.matchingCharacterIds].sort((left, right) => left - right),
        turnMatchingCharacterIds: [...entry.turnMatchingCharacterIds.entries()]
          .sort(([leftTurns], [rightTurns]) => leftTurns - rightTurns)
          .map(([minTurns, characterIds]) => ({
            minTurns,
            characterIds: [...characterIds].sort((left, right) => left - right),
          })),
        // Emitted only when the ability has complete removals, so every other key
        // keeps its exact current serialization.
        ...(entry.completeRemovalCharacterIds.size
          ? {
              completeRemovalCharacterIds: [...entry.completeRemovalCharacterIds].sort(
                (left, right) => left - right,
              ),
            }
          : {}),
        ...(entry.captainAbilityMatchingCharacterIds.size
          ? {
              captainAbilityMatchingCharacterIds: [...entry.captainAbilityMatchingCharacterIds].sort(
                (left, right) => left - right,
              ),
            }
          : {}),
        ...(entry.captainAbilityCompleteRemovalCharacterIds.size
          ? {
              captainAbilityCompleteRemovalCharacterIds: [
                ...entry.captainAbilityCompleteRemovalCharacterIds,
              ].sort((left, right) => left - right),
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
  // The effect-target scope is part of an ability's dedupe identity, so a stored
  // entry whose scope differs from (or is missing against) the freshly derived
  // one is a DIFFERENT identity and a plain merge would keep both — silently
  // doubling the entry, 5,124 times when cure scopes were introduced.
  //
  // Whenever the derived set already covers the same ability modulo scope, the
  // derived entries are authoritative: they are a complete re-derivation of that
  // ability from the raw text, including every scope variant the text supports.
  // Dropping the stored copy in that case is symmetric — it self-heals a scope
  // being added, changed, or removed — so no one-off seed migration is needed
  // per parser change.
  const derivedScopeBlindIdentities = new Set(derivedAbilities.map(buildScopeBlindAbilityIdentity));
  const retainedExistingAbilities = normalizeExistingBuilderAbilities(existingAbilities).filter(
    (ability) => !derivedScopeBlindIdentities.has(buildScopeBlindAbilityIdentity(ability)),
  );

  [...retainedExistingAbilities, ...derivedAbilities].forEach((ability) => {
    addAbility(mergedAbilities, seen, ability);
  });

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
    availableEffectTargetScopes: new Set(),
    effectTargetScopeMatches: new Map(),
    matchCount: 0,
    matchingCharacterIds: new Set(),
    turnMatchingCharacterIds: new Map(),
    // Characters whose record clears the effect COMPLETELY rather than for a
    // number of turns. They live in the minTurns:99 bucket too, but 99 is not a
    // usable discriminator: upstream also writes literal "for 99+ turns" and
    // "for 999 turns" as its own way of saying "effectively permanent", so the
    // integer collides with genuine counts (5 characters carry both). A complete
    // removal satisfies ANY turn requirement, so it is indexed separately and
    // unioned in by the filter. See special-ability-filter.utils.ts.
    completeRemovalCharacterIds: new Set(),
    captainAbilityMatchingCharacterIds: new Set(),
    captainAbilityTurnMatchingCharacterIds: new Map(),
    captainAbilityCompleteRemovalCharacterIds: new Set(),
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

// Identity WITHOUT the effect-target scope. Used to spot a stored ability that
// a freshly derived one supersedes by adding a scope (see mergeBuilderAbilities).
function buildScopeBlindAbilityIdentity(ability) {
  return [
    ability.key,
    ability.minTurns ?? 'none',
    normalizeSlotTokens(ability.slotTokens).join(','),
    ability.source,
    resolveCoverageMode(ability),
    normalizeEffectValue(ability.minEffectValue) ?? 'none',
  ].join('|');
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

  const segments = normalizedTarget
    .split(/\s*,\s*|\s+and\s+/gi)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => ({
      target: segment,
      slotTokens: [],
    }));

  // A slot-scoped target is emitted WHOLE and first, so it keeps the slot tokens
  // that the split path drops. It must still emit its segments too, though:
  // isSlotScopedTarget fires on a SUBSTRING, so a LIST that merely contains a
  // slot-scoped entry took the whole-only path and hid every other cure in it.
  // "Reduces Bind and Slot Bind duration by 5 turns" (Romy & Yorueka #4031)
  // produced only the unsplit "bind and slot bind" - which remove_bind matches on
  // endsWith(' bind') but then vetoes via its own !includes('slot bind')
  // exclusion - so a genuine 5-turn Bind cure vanished. A lone slot-scoped target
  // splits to itself, making this a no-op there; addAbility dedupes the overlap.
  const candidates = isSlotScopedTarget(normalizedTarget)
    ? [{ target: normalizedTarget, slotTokens }, ...segments]
    : [
        ...segments,
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
    // Strip the "enemies" / "enemies'" possessive scope. The trailing apostrophe
    // must be consumed HERE: a bare \b after the optional apostrophe fails
    // (apostrophe->space is non-word to non-word, no boundary), so the old
    // /\benemies'?s?\b/ backtracked and matched only "enemies", leaving a stray
    // "'" glued to the first buff name. A leading "' percent damage reduction"
    // segment then failed the exact-match removal matchers, so only a NON-first
    // buff in a list ("Threshold Damage Reduction, Percent Damage Reduction …")
    // was ever detected. Consume the possessive apostrophe and bound the tail
    // with a not-a-letter lookahead instead of \b (ReDoS-safe, no backtracking).
    .replace(/\benemies(?:['’]s?)?(?![a-z])/g, ' ')
    .replace(/\benemy\b/g, ' ')
    // Strip the "all" quantifier the same way "the" is stripped: "reduces all
    // enemies' Percent Damage Reduction duration by 2 turns" (Bepo #4224/#4225)
    // normalized to "all percent damage reduction", which failed the EXACT-match
    // removal alias (target === 'percent damage reduction'). The includes/endsWith
    // aliases already tolerated the prefix, so this only affects exact-match keys;
    // simulated corpus-wide it is +2 (Bepo) / -0, touching no other key.
    .replace(/\ball\b/g, ' ')
    // Strip an "(except <buff>)" exclusion so a removal that EXCLUDES a buff is not
    // tagged as removing it. Saintess Gunko #4612 "reduces all enemies' damage
    // reduction (except Threshold Damage Reduction) duration by 15 turns" was tagged
    // remove_threshold_damage_reduction because that key's includes() fired on the
    // exclusion substring. Removing the parenthetical leaves the segment "damage
    // reduction", so she is correctly tagged remove_damage_reduction instead - the
    // buff she actually reduces. This is the corpus's ONLY "(except …)" clause, so
    // the blast radius is exactly this one character.
    .replace(/\s*\(except[^)]*\)/g, ' ')
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
