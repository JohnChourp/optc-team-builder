/**
 * 869f2608x. What each ability term in the filter bar actually means, in the player's words.
 *
 * **Why this exists.** The app speaks fluent OPTC - beneficial orb, slot bind, pinch healing - and a
 * returning or newer player meets a filter bar of terms they half-know. The cost is not confusion:
 * it is that they do not use the filter, and then the tool does nothing for them.
 *
 * **Why it lives here and not in a glossary screen.** The definition is shown at the point of use,
 * beside the match count on the picker tile, because a glossary somewhere else is a second thing to
 * find and a second thing to keep in step with the parser's vocabulary.
 *
 * **Why it is a TypeScript constant rather than a translation file.** Same reason as
 * `whats-new.data.ts`: it is keyed by ability-tag key rather than by screen, so a per-screen
 * transloco scope would have to mirror 263 tag keys and could drift from them silently. Here the
 * key IS the tag key, and `scripts/generate-ability-tag-catalogue.mjs` fails when a term the
 * players meet most often has no entry.
 *
 * **Scope, set by measurement rather than taste.** The terms are ranked by how many of the 4,618
 * shipped characters carry each - see `docs/ability-tag-catalogue.json` - and the entries here
 * cover the top of that ranking. The 22 tags no shipped character carries need no copy at all.
 *
 * **The Greek keeps the game's own English terms.** Captain, Friend Captain, orb, slot, Rumble,
 * sugo stay untranslated, because that is how players actually say them.
 *
 * One or two sentences each. Not a strategy guide, and not a second FAQ: say what the effect IS,
 * never whether it is good.
 */
export interface AbilityTagDefinition {
  en: string;
  el: string;
}

export const ABILITY_TAG_GLOSSARY: Readonly<Record<string, AbilityTagDefinition>> = {
  special_damage: {
    en: 'The special deals damage to enemies when you use it.',
    el: 'Το special κάνει damage στους εχθρούς όταν το χρησιμοποιείς.',
  },
  change_slots: {
    en: 'Changes the orbs on your characters into different orbs.',
    el: 'Αλλάζει τα orbs στους χαρακτήρες σου σε άλλα orbs.',
  },
  boost_atk: {
    en: 'Raises your crew attack for a number of turns.',
    el: 'Αυξάνει το attack του πληρώματός σου για κάποιους γύρους.',
  },
  crewmate_make_slots_favorable: {
    en: 'The sailor ability treats the character orbs as matching, so they hit as if the orb were favourable.',
    el: 'Η sailor ability μετράει τα orbs του χαρακτήρα ως matching, οπότε χτυπά σαν να ήταν ευνοϊκό το orb.',
  },
  make_slots_favorable: {
    en: 'Makes orbs count as beneficial, so characters hit harder without the orb itself changing.',
    el: 'Κάνει τα orbs να μετρούν ως ευνοϊκά, οπότε οι χαρακτήρες χτυπούν πιο δυνατά χωρίς να αλλάξει το ίδιο το orb.',
  },
  reduce_special_charge: {
    en: 'Shortens how many turns your specials need before they can be used.',
    el: 'Μειώνει τους γύρους που χρειάζονται τα specials σου πριν μπορέσουν να χρησιμοποιηθούν.',
  },
  reduce_damage: {
    en: 'Cuts the damage your crew takes for a number of turns.',
    el: 'Μειώνει το damage που δέχεται το πλήρωμά σου για κάποιους γύρους.',
  },
  heal_hp: {
    en: 'Restores crew HP.',
    el: 'Επαναφέρει HP στο πλήρωμα.',
  },
  boost_slot_effects: {
    en: 'Increases how much your matching orbs are worth, on top of the orbs themselves.',
    el: 'Αυξάνει πόσο μετράνε τα matching orbs σου, πέρα από τα ίδια τα orbs.',
  },
  potential_critical_atk: {
    en: 'A potential ability that adds extra damage when you hit a PERFECT.',
    el: 'Μια potential ability που προσθέτει επιπλέον damage όταν πετυχαίνεις PERFECT.',
  },
  potential_slot_bind_resistance: {
    en: 'A potential ability that reduces or blocks having the character orb slot bound.',
    el: 'Μια potential ability που μειώνει ή εμποδίζει το slot bind στο orb του χαρακτήρα.',
  },
  potential_provoked_atk_boost_received_damage_up_resistance: {
    en: 'A potential ability that resists being provoked and taking increased damage.',
    el: 'Μια potential ability που αντιστέκεται στο provoke και στο αυξημένο damage που δέχεσαι.',
  },
  support_base_hp_boost_additional: {
    en: 'Support the character gives to another: extra base HP for whoever they are supporting.',
    el: 'Support που δίνει ο χαρακτήρας σε άλλον: επιπλέον base HP σε όποιον υποστηρίζει.',
  },
  support_base_atk_boost_additional: {
    en: 'Support the character gives to another: extra base ATK for whoever they are supporting.',
    el: 'Support που δίνει ο χαρακτήρας σε άλλον: επιπλέον base ATK σε όποιον υποστηρίζει.',
  },
  change_block_slots: {
    en: 'Changes [BLOCK] orbs, which cannot otherwise be changed, into usable orbs.',
    el: 'Αλλάζει τα [BLOCK] orbs, που αλλιώς δεν αλλάζουν, σε orbs που μπορείς να χρησιμοποιήσεις.',
  },
  change_slots_matching: {
    en: 'Changes orbs specifically into ones that match your characters.',
    el: 'Αλλάζει τα orbs ειδικά σε αυτά που ταιριάζουν στους χαρακτήρες σου.',
  },
  support_base_rcv_boost_additional: {
    en: 'Support the character gives to another: extra base RCV for whoever they are supporting.',
    el: 'Support που δίνει ο χαρακτήρας σε άλλον: επιπλέον base RCV σε όποιον υποστηρίζει.',
  },
  remove_paralysis: {
    en: 'Removes or shortens paralysis, which stops your characters attacking at random.',
    el: 'Αφαιρεί ή μειώνει το paralysis, που σταματά τυχαία τους χαρακτήρες σου από το να επιτεθούν.',
  },
  remove_bind: {
    en: 'Removes or shortens bind, which stops a character attacking for a number of turns.',
    el: 'Αφαιρεί ή μειώνει το bind, που σταματά έναν χαρακτήρα από το να επιτεθεί για κάποιους γύρους.',
  },
  potential_pinch_healing: {
    en: 'A potential ability that heals at the end of the turn while your crew HP is low.',
    el: 'Μια potential ability που κάνει heal στο τέλος του γύρου όσο το HP του πληρώματός σου είναι χαμηλά.',
  },
};

/**
 * The definition for a tag in the reader's language, or null when the term has none.
 *
 * Null is the honest answer for the long tail: 263 tags ship and only the ones a player actually
 * meets are worth explaining. A caller renders nothing rather than a placeholder, because an empty
 * definition line is a promise the glossary does not keep.
 */
export function resolveAbilityTagDefinition(
  abilityKey: string,
  language: 'en' | 'el',
): string | null {
  return ABILITY_TAG_GLOSSARY[abilityKey]?.[language] ?? null;
}
