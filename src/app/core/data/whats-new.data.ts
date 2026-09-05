/**
 * The player-facing release history, newest first.
 *
 * A TypeScript constant rather than a fetched JSON on purpose: every prefetched
 * asset in this repo is unhashed, and a mid-deploy window where ngsw.json is the
 * new build while an asset body is still the old one is exactly what makes a
 * service-worker install fail. Shipping this in the bundle removes that class of
 * problem for the changelog, and it is small enough that it costs nothing.
 *
 * Generated once from the full git history (121 releases, 780 commits). Each new
 * release appends ONE entry at the top - the past never changes, so nothing below
 * the newest entry is ever regenerated.
 */
export interface WhatsNewBullet {
  en: string;
  el: string;
}

export interface WhatsNewEntry {
  version: string;
  date: string;
  /** False when the release only touched tooling, tests, docs or dependencies. */
  userVisible: boolean;
  headline: WhatsNewBullet;
  summaryEn: string;
  summaryEl: string;
  added: WhatsNewBullet[];
  improved: WhatsNewBullet[];
  fixed: WhatsNewBullet[];
}

export const WHATS_NEW_ENTRIES: readonly WhatsNewEntry[] = [
  {
    version: '0.2.6',
    date: '2026-09-05',
    userVisible: true,
    headline: {
      en: 'The stray "null" tooltip is gone',
      el: 'Έφυγε το άσχετο tooltip που έγραφε «null»',
    },
    summaryEn:
      'If you hovered an "Add to team" button on Captain Coverage that was perfectly usable, a little box popped up saying the word "null". That was our mistake, introduced two releases ago while fixing the opposite problem - making the greyed-out version of that button explain itself. The explanation still appears when the button is refusing a character; a button that is not refusing anything now stays quiet, as it always should have. Nothing else you can see has changed.',
    summaryEl:
      'Αν περνούσες το ποντίκι πάνω από ένα «Προσθήκη στο team» στο Captain Coverage που δούλευε κανονικά, εμφανιζόταν ένα κουτάκι που έγραφε τη λέξη «null». Δικό μας λάθος, μπήκε δύο εκδόσεις πριν ενώ διορθώναμε το αντίθετο - να εξηγεί ο εαυτός του το γκριζαρισμένο κουμπί. Η εξήγηση εμφανίζεται ακόμη όταν το κουμπί αρνείται χαρακτήρα· ένα κουμπί που δεν αρνείται τίποτα μένει τώρα σιωπηλό, όπως έπρεπε από την αρχή. Τίποτε άλλο ορατό δεν άλλαξε.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'An "Add to team" button that is not refusing anything no longer shows a tooltip reading "null" when you hover it.',
        el: 'Ένα «Προσθήκη στο team» που δεν αρνείται τίποτα δεν δείχνει πια tooltip με τη λέξη «null» όταν περνάς το ποντίκι.',
      },
    ],
  },
  {
    version: '0.2.5',
    date: '2026-09-04',
    userVisible: true,
    headline: {
      en: 'Captain Coverage reads properly out loud',
      el: 'Το Captain Coverage διαβάζεται σωστά φωναχτά',
    },
    summaryEn:
      'A round of fixes for anyone using Captain Coverage with a screen reader or a keyboard, plus one thing everybody can see. Every result card used to announce the same six words - "Open character details" - so a list of forty cards read as forty identical links; each one now says the character it opens. The six team slots had the same problem and now name their seat: Captain, Friend Captain, Sub 1 and so on. Tabbing through the results no longer jumps backwards: the crown button is painted in a card\'s top corner but used to come last, so focus went to the bottom of a card and then back up to it before moving on. The two filter cards with a switch on them used to tell a screen reader they were the label for that switch, which they never were - only the switch itself ever responded. They stopped claiming it. And the "?" help beside a tier could open a panel that ran off the right edge of the screen if you pressed a "?" on the right-hand side; it now fits the row it belongs to.',
    summaryEl:
      'Ένας γύρος διορθώσεων για όποιον χρησιμοποιεί το Captain Coverage με αναγνώστη οθόνης ή πληκτρολόγιο, συν ένα που το βλέπουν όλοι. Κάθε κάρτα αποτελέσματος ανακοίνωνε τις ίδιες λέξεις - «Άνοιγμα λεπτομερειών χαρακτήρα» - οπότε μια λίστα σαράντα καρτών διαβαζόταν ως σαράντα πανομοιότυποι σύνδεσμοι· τώρα η καθεμία λέει ποιον χαρακτήρα ανοίγει. Τα έξι team slots είχαν το ίδιο πρόβλημα και τώρα λένε τη θέση τους: Captain, Friend Captain, Sub 1 και ούτω καθεξής. Το tab στα αποτελέσματα δεν πηδά πια προς τα πίσω: το κουμπί με το στέμμα ζωγραφίζεται στην πάνω γωνία της κάρτας αλλά ερχόταν τελευταίο, οπότε το focus πήγαινε στο κάτω μέρος μιας κάρτας και μετά πίσω πάνω της. Οι δύο κάρτες φίλτρων με διακόπτη έλεγαν στον αναγνώστη οθόνης ότι είναι η ετικέτα εκείνου του διακόπτη, κάτι που ποτέ δεν ίσχυε - μόνο ο ίδιος ο διακόπτης αντιδρούσε. Σταμάτησαν να το ισχυρίζονται. Και η βοήθεια «?» δίπλα σε ένα tier μπορούσε να ανοίξει πάνελ που έβγαινε έξω από τη δεξιά άκρη της οθόνης αν πατούσες ένα «?» στα δεξιά· τώρα χωράει στη σειρά που ανήκει.',
    added: [],
    improved: [
      {
        en: 'Each result card now tells a screen reader which character it opens, instead of every card in the list saying the same thing.',
        el: 'Κάθε κάρτα αποτελέσματος λέει τώρα στον αναγνώστη οθόνης ποιον χαρακτήρα ανοίγει, αντί να λένε όλες οι κάρτες το ίδιο πράγμα.',
      },
      {
        en: 'The six team slots name their seat - Captain, Friend Captain, Sub 1 and so on - instead of all six reading as the same button.',
        el: 'Τα έξι team slots λένε τη θέση τους - Captain, Friend Captain, Sub 1 και ούτω καθεξής - αντί να διαβάζονται και τα έξι ως το ίδιο κουμπί.',
      },
    ],
    fixed: [
      {
        en: 'The "?" tier help no longer runs off the right edge of the screen when you open it from a tier button on the right-hand side.',
        el: 'Η βοήθεια «?» των tiers δεν βγαίνει πια έξω από τη δεξιά άκρη της οθόνης όταν την ανοίγεις από κουμπί tier στα δεξιά.',
      },
      {
        en: 'Tabbing through the results no longer jumps back up to a card you have already passed, because the crown button now comes in the order it is drawn.',
        el: 'Το tab στα αποτελέσματα δεν γυρίζει πια πίσω σε κάρτα που έχεις ήδη προσπεράσει, γιατί το κουμπί με το στέμμα έρχεται τώρα με τη σειρά που ζωγραφίζεται.',
      },
      {
        en: "The two filter cards with a switch on them no longer tell a screen reader that the whole card is the switch's label. Nothing about how they look has changed.",
        el: 'Οι δύο κάρτες φίλτρων με διακόπτη δεν λένε πια στον αναγνώστη οθόνης ότι ολόκληρη η κάρτα είναι η ετικέτα του διακόπτη. Η εμφάνισή τους δεν άλλαξε σε τίποτα.',
      },
    ],
  },
  {
    version: '0.2.4',
    date: '2026-09-04',
    userVisible: true,
    headline: {
      en: 'The greyed-out button really does tell you why now',
      el: 'Το γκρι κουμπί όντως σου λέει τώρα γιατί',
    },
    summaryEn:
      'Last release promised that a greyed-out "Add to team" on Captain Coverage would tell you which of the three reasons it was. It told screen readers, but not you: hovering a greyed-out button gave you nothing, because a disabled button ignores the mouse entirely and the browser never showed the note attached to it. The note now sits just outside the button, so hovering it works. It also no longer replaces the button\'s own name when read aloud, and an enabled button has stopped showing you a tooltip that just repeats what it already says. One more thing from last release: if you typed a max total cost before picking anyone - which is the natural order, since the budget sits above the results - it was still being forgotten when you opened a character and came back. It is kept now, team or no team.',
    summaryEl:
      'Η προηγούμενη έκδοση υποσχέθηκε ότι το γκριζαρισμένο «Προσθήκη στο team» στο Captain Coverage θα σου έλεγε ποιος από τους τρεις λόγους ισχύει. Το έλεγε στους αναγνώστες οθόνης, όχι σε σένα: περνώντας το ποντίκι πάνω από το γκρι κουμπί δεν έβλεπες τίποτα, γιατί ένα ανενεργό κουμπί αγνοεί εντελώς το ποντίκι και ο browser δεν εμφάνιζε ποτέ τη σημείωση που ήταν κολλημένη πάνω του. Η σημείωση μετακόμισε λίγο έξω από το κουμπί, οπότε τώρα δουλεύει. Επίσης δεν αντικαθιστά πια το ίδιο το όνομα του κουμπιού όταν διαβάζεται φωναχτά, και ένα ενεργό κουμπί σταμάτησε να σου δείχνει tooltip που απλώς επαναλάμβανε αυτό που ήδη γράφει. Κάτι ακόμη από την προηγούμενη έκδοση: αν έγραφες μέγιστο συνολικό κόστος πριν διαλέξεις κανέναν - που είναι και η φυσική σειρά, αφού το όριο βρίσκεται πάνω από τα αποτελέσματα - ξεχνιόταν ακόμη όταν άνοιγες έναν χαρακτήρα και επέστρεφες. Τώρα κρατιέται, με ομάδα ή χωρίς.',
    added: [],
    improved: [
      {
        en: 'The reason a greyed-out "Add to team" is refusing a character now also reads aloud together with the button\'s own name, instead of replacing it.',
        el: 'Ο λόγος που το γκριζαρισμένο «Προσθήκη στο team» αρνείται έναν χαρακτήρα διαβάζεται τώρα μαζί με το όνομα του ίδιου του κουμπιού, αντί να το αντικαθιστά.',
      },
    ],
    fixed: [
      {
        en: 'Hovering a greyed-out "Add to team" on Captain Coverage now actually shows why it is refusing. The note was attached to the button itself, and a disabled button ignores the mouse, so it could never appear.',
        el: 'Περνώντας το ποντίκι πάνω από ένα γκριζαρισμένο «Προσθήκη στο team» στο Captain Coverage βλέπεις επιτέλους γιατί αρνείται. Η σημείωση ήταν κολλημένη στο ίδιο το κουμπί, και ένα ανενεργό κουμπί αγνοεί το ποντίκι, οπότε δεν μπορούσε ποτέ να εμφανιστεί.',
      },
      {
        en: 'A button that is not refusing anything has stopped showing a tooltip that just repeated its own label.',
        el: 'Ένα κουμπί που δεν αρνείται τίποτα σταμάτησε να δείχνει tooltip που απλώς επαναλάμβανε την ετικέτα του.',
      },
      {
        en: 'A max total cost typed before you pick any character is kept when you open a character and come back. Only a team with characters in it was being remembered before.',
        el: 'Το μέγιστο συνολικό κόστος που γράφεις πριν διαλέξεις χαρακτήρα κρατιέται όταν ανοίγεις έναν χαρακτήρα και επιστρέφεις. Πριν θυμόταν μόνο ομάδα που είχε ήδη χαρακτήρες.',
      },
      {
        en: 'The "?" tier help and the cost note stay closable with Escape even after you click inside them.',
        el: 'Η βοήθεια «?» των tiers και η σημείωση κόστους κλείνουν με Escape ακόμη κι αφού κάνεις κλικ μέσα τους.',
      },
    ],
  },
  {
    version: '0.2.3',
    date: '2026-09-04',
    userVisible: true,
    headline: {
      en: 'Captain Coverage stops keeping things to itself',
      el: 'Το Captain Coverage σταματά να κρατά πράγματα για τον εαυτό του',
    },
    summaryEn:
      'Five small things on Captain Coverage that were either cut off, forgotten or unexplained. The seat under your Captain said "Friend ..." instead of "Friend Captain", and the cost under each team slot was clipped the same way - both now wrap and show every letter, on a phone and on a wide screen alike, and the seat name is sized to sit under the character name rather than over it. The max total cost you type is remembered when you leave the page and come back, so a restored team no longer quietly refuses characters because the budget it was built against has vanished. When "Add to team" is greyed out it now tells you which of the three reasons it is: the same character is already in the team, no free slot fits it within the budget, or all four sub slots are taken. The "?" help next to each tier closes with Escape, and so does the little cost note on a result card. And jumping to the results from a team slot no longer parks the heading behind the top bar.',
    summaryEl:
      'Πέντε μικρά πράγματα στο Captain Coverage που ήταν είτε κομμένα, είτε ξεχασμένα, είτε ανεξήγητα. Η θέση κάτω από τον Captain έγραφε «Friend ...» αντί για «Friend Captain», και το cost κάτω από κάθε team slot κοβόταν με τον ίδιο τρόπο - τώρα αναδιπλώνονται και τα δύο και φαίνεται κάθε γράμμα, τόσο στο κινητό όσο και σε φαρδιά οθόνη, ενώ το όνομα της θέσης πήρε μέγεθος που το βάζει κάτω από το όνομα του χαρακτήρα αντί για πάνω του. Το μέγιστο συνολικό κόστος που πληκτρολογείς θυμάται όταν φεύγεις από τη σελίδα και επιστρέφεις, οπότε μια ομάδα που επανέρχεται δεν αρνείται πια σιωπηλά χαρακτήρες επειδή χάθηκε το όριο με το οποίο φτιάχτηκε. Όταν το «Προσθήκη στο team» είναι ανενεργό, σου λέει πλέον ποιος από τους τρεις λόγους ισχύει: ο ίδιος χαρακτήρας είναι ήδη στο team, καμία ελεύθερη θέση δεν τον χωράει μέσα στο όριο, ή είναι πιασμένες και οι τέσσερις θέσεις sub. Η βοήθεια «?» δίπλα σε κάθε tier κλείνει με Escape, το ίδιο και η μικρή σημείωση κόστους σε μια κάρτα αποτελέσματος. Και το άλμα στα αποτελέσματα από ένα team slot δεν κρύβει πια τον τίτλο πίσω από την πάνω μπάρα.',
    added: [],
    improved: [
      {
        en: 'The "?" help beside each Captain Ability tier now closes with Escape, as does the cost note that opens from the number on a result card. Both still close on a second press, exactly as before.',
        el: 'Η βοήθεια «?» δίπλα σε κάθε tier του Captain Ability κλείνει τώρα με Escape, όπως και η σημείωση κόστους που ανοίγει από τον αριθμό σε μια κάρτα αποτελέσματος. Και οι δύο κλείνουν ακόμη και με δεύτερο πάτημα, ακριβώς όπως πριν.',
      },
      {
        en: 'A greyed-out "Add to team" now says why: the same character is already in the team, no free slot fits it within the cost budget, or all four sub slots are taken. It used to just go grey for all three.',
        el: 'Το ανενεργό «Προσθήκη στο team» λέει τώρα γιατί: ο ίδιος χαρακτήρας είναι ήδη στο team, καμία ελεύθερη θέση δεν τον χωράει μέσα στο όριο κόστους, ή είναι πιασμένες και οι τέσσερις θέσεις sub. Πριν απλώς γκριζάριζε και για τους τρεις λόγους.',
      },
    ],
    fixed: [
      {
        en: 'The team slot under your Captain reads "Friend Captain" in full again instead of "Friend ...", and the cost under a slot is no longer clipped either. This was never only a phone problem - the slots hit the same narrow width on an 820px or 1024px screen, so it is fixed at every width.',
        el: 'Το team slot κάτω από τον Captain γράφει ξανά ολόκληρο «Friend Captain» αντί για «Friend ...», και ούτε το cost κάτω από ένα slot κόβεται πια. Δεν ήταν ποτέ μόνο θέμα κινητού - τα slots φτάνουν στο ίδιο στενό πλάτος και σε οθόνη 820px ή 1024px, οπότε διορθώθηκε σε κάθε πλάτος.',
      },
      {
        en: 'The max total cost you set is kept when you open a character and come back. Before, the team returned without it, and slots then turned characters away with nothing on screen explaining the limit they were failing.',
        el: 'Το μέγιστο συνολικό κόστος που ορίζεις κρατιέται όταν ανοίγεις έναν χαρακτήρα και επιστρέφεις. Πριν, η ομάδα γύριζε χωρίς αυτό, και μετά τα slots απέρριπταν χαρακτήρες χωρίς τίποτα στην οθόνη να εξηγεί το όριο που δεν περνούσαν.',
      },
      {
        en: 'Tapping a team slot to jump to the results now stops with the results heading in view, instead of scrolling it up behind the top bar.',
        el: 'Το πάτημα ενός team slot για μετάβαση στα αποτελέσματα σταματά τώρα με τον τίτλο των αποτελεσμάτων ορατό, αντί να τον στέλνει πίσω από την πάνω μπάρα.',
      },
      {
        en: 'The seat name in a team slot is no longer printed larger than the character name underneath it.',
        el: 'Το όνομα της θέσης σε ένα team slot δεν τυπώνεται πια μεγαλύτερο από το όνομα του χαρακτήρα από κάτω.',
      },
    ],
  },
  {
    version: '0.2.2',
    date: '2026-09-04',
    userVisible: true,
    headline: {
      en: 'Devil Oars joins the roster',
      el: 'Ο Devil Oars μπαίνει στη λίστα',
    },
    summaryEn:
      "The nightly check of the game's data found one new character and brought it in: Devil Oars, Legend Revived After 500 Years - an INT Powerhouse/Striker at 6 stars, cost 55, out of Thriller Bark. It is already everywhere the app lists characters: search, Characters, Captain Coverage, both team builders and the ability filters, with its Captain Ability, its special and its potentials read and sorted like every other card. Nothing else in the app changed in this release.",
    summaryEl:
      'Ο νυχτερινός έλεγχος των δεδομένων του παιχνιδιού βρήκε έναν καινούριο χαρακτήρα και τον έφερε: τον Devil Oars, Legend Revived After 500 Years - INT Powerhouse/Striker, 6 αστέρια, cost 55, από το Thriller Bark. Βρίσκεται ήδη παντού όπου η εφαρμογή δείχνει χαρακτήρες: στην αναζήτηση, στα Characters, στο Captain Coverage, και στους δύο team builders και στα φίλτρα ικανοτήτων, με το Captain Ability, το special και τα potentials του διαβασμένα και ταξινομημένα όπως κάθε άλλης κάρτας. Τίποτε άλλο δεν άλλαξε σε αυτή την έκδοση.',
    added: [
      {
        en: 'Devil Oars - Legend Revived After 500 Years, a 6-star INT Powerhouse/Striker at cost 55, with its Captain Ability, special, sailor ability, potentials and support all read in - so he turns up in the ability filters and in Captain Coverage the same way every other character does.',
        el: 'Ο Devil Oars - Legend Revived After 500 Years, 6άστερος INT Powerhouse/Striker με cost 55, με το Captain Ability, το special, το sailor ability, τα potentials και το support του διαβασμένα - οπότε εμφανίζεται στα φίλτρα ικανοτήτων και στο Captain Coverage όπως κάθε άλλος χαρακτήρας.',
      },
    ],
    improved: [],
    fixed: [],
  },
  {
    version: '0.2.1',
    date: '2026-09-03',
    userVisible: true,
    headline: {
      en: 'The Captain Coverage crown is properly round',
      el: 'Το στέμμα στο Captain Coverage έγινε επιτέλους στρογγυλό',
    },
    summaryEn:
      'The little crown button in the top-right corner of each Captain Coverage result card was not quite round: four pale, see-through triangles poked out past its edge, one at each corner, so it looked like a circle sitting inside a faint square box. Those corners were the shine across the top of the crown, which was being drawn square over a round button. It is a clean circle now, with the shine curving along the round edge. Pressing it still does exactly what it did — it asks whether you want that character as Captain or Friend Captain.',
    summaryEl:
      'Το κουμπί με το στέμμα, πάνω δεξιά σε κάθε κάρτα αποτελεσμάτων του Captain Coverage, δεν ήταν εντελώς στρογγυλό: σε κάθε γωνία ξεπεταγόταν κι από ένα χλωμό, ημιδιάφανο τριγωνάκι, σαν να κάθεται ο κύκλος μέσα σε ένα αχνό τετράγωνο πλαίσιο. Αυτά τα τριγωνάκια ήταν οι γωνίες της γυαλάδας στο πάνω μέρος του στέμματος, που σχεδιαζόταν τετράγωνη πάνω σε στρογγυλό κουμπί. Τώρα ο κύκλος είναι καθαρός και η γυαλάδα ακολουθεί τη στρογγυλή άκρη. Το κουμπί κάνει ακριβώς ό,τι έκανε: το πατάς και σε ρωτάει αν θέλεις τον χαρακτήρα ως Captain ή ως Friend Captain.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'On Captain Coverage, the crown button in the top-right corner of each result card is a clean circle — the four pale see-through triangles that poked out past its corners are gone, and the shine now curves along the round edge instead of squaring off at them.',
        el: 'Στο Captain Coverage, το κουμπί με το στέμμα πάνω δεξιά σε κάθε κάρτα αποτελεσμάτων είναι πλέον καθαρός κύκλος — τα τέσσερα χλωμά ημιδιάφανα τριγωνάκια που ξεπετάγονταν από τις γωνίες του έφυγαν, και η γυαλάδα ακολουθεί τώρα τη στρογγυλή άκρη αντί να αγκωνιάζει.',
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-09-03',
    userVisible: true,
    headline: {
      en: 'Every release in the menu, and an update notice that speaks up',
      el: 'Ιστορικό εκδόσεων, και ενημερώσεις που δεν κρύβονται',
    },
    summaryEn:
      "The side menu has a new \"What's new\" item, sitting just above Settings, and it opens the app's whole release history — every version back to the very first, newest first, in plain language in English or Greek. If you have been away a while you can keep scrolling until you reach a version you recognise. The update notice also got honest: if it ever appeared and then vanished a second later with nothing said, that was not the screen glitching — the new version had genuinely failed to download and the app said nothing. It now stays put, tells you the download failed, and retries shortly instead of leaving you waiting up to an hour. And when the app's own background check is the first thing to spot a new version, the notice's Update button now actually works — it used to be greyed out and unpressable.",
    summaryEl:
      'Στο πλαϊνό μενού μπήκε το «Τι νέο υπάρχει», ακριβώς πάνω από τις Ρυθμίσεις, και ανοίγει όλο το ιστορικό εκδόσεων της εφαρμογής — κάθε έκδοση μέχρι την πρώτη, από την πιο πρόσφατη, σε απλά λόγια, στα ελληνικά ή στα αγγλικά. Αν έλειπες καιρό, σκρολάρεις μέχρι να βρεις έκδοση που θυμάσαι. Έγινε πιο ειλικρινής και η ειδοποίηση ενημέρωσης: αν σου εμφανιζόταν και εξαφανιζόταν ένα δευτερόλεπτο μετά χωρίς να πει τίποτα, δεν έφταιγε η οθόνη — η νέα έκδοση είχε όντως αποτύχει να κατέβει και η εφαρμογή δεν σου έλεγε κουβέντα. Τώρα δεν εξαφανίζεται: σου λέει ότι η λήψη απέτυχε και ξαναπροσπαθεί σύντομα, αντί να περιμένεις έως και μία ώρα. Και όταν τη νέα έκδοση την πιάνει πρώτος ο αυτόματος έλεγχος του παρασκηνίου, το κουμπί «Ενημέρωση» δεν μένει πια ανενεργό — πατιέται και κάνει την ενημέρωση.',
    added: [
      {
        en: 'A "What\'s new" item in the side menu, just above Settings. It opens the app\'s full release history — every version, newest first, each with a headline, a short plain-language note, and what was added, improved and fixed.',
        el: 'Το «Τι νέο υπάρχει» στο πλαϊνό μενού, ακριβώς πάνω από τις Ρυθμίσεις. Ανοίγει όλο το ιστορικό εκδόσεων — κάθε έκδοση, από την πιο πρόσφατη, με έναν τίτλο, μια σύντομη περιγραφή σε απλά λόγια και τι προστέθηκε, τι βελτιώθηκε και τι διορθώθηκε.',
      },
      {
        en: 'The history reaches all the way back to the very first release, so you can keep scrolling until you hit a version you recognise. It reads in whichever language the app is set to, English or Greek.',
        el: 'Το ιστορικό φτάνει μέχρι την πρώτη κιόλας έκδοση, οπότε μπορείς να σκρολάρεις μέχρι να βρεις κάτι που θυμάσαι. Διαβάζεται στη γλώσσα που έχεις επιλέξει στην εφαρμογή, ελληνικά ή αγγλικά.',
      },
      {
        en: 'Releases that changed nothing you could see are listed too and say exactly that, rather than being quietly left out of the numbering.',
        el: 'Οι εκδόσεις που δεν άλλαξαν κάτι που να το βλέπεις μπαίνουν κι αυτές στη λίστα και το λένε ξεκάθαρα, αντί να λείπουν και να αφήνουν κενά στην αρίθμηση.',
      },
    ],
    improved: [
      {
        en: 'On a wide screen, the Tier Coverage filter on Captain Coverage now sits beside the Super Types and Classes filters instead of claiming a whole line to itself, so there is less empty space above your results. On a phone its label now sits above its chips instead of being squeezed to one word per line.',
        el: 'Σε μεγάλη οθόνη, το φίλτρο Tier Coverage στο Captain Coverage μπαίνει πλέον δίπλα στα Super Types και Classes, αντί να πιάνει μόνο του μια ολόκληρη γραμμή, οπότε μένει λιγότερο κενό πάνω από τα αποτελέσματα. Στο κινητό, η ετικέτα του μπαίνει πλέον πάνω από τα chips του και δεν κόβεται πια σε μία λέξη ανά γραμμή.',
      },
      {
        en: 'The crown button on a Captain Coverage result card — the one that picks the leader seat — is now a circle instead of a rounded square.',
        el: 'Το κουμπί με το στέμμα στις κάρτες αποτελεσμάτων του Captain Coverage — αυτό που διαλέγει τη θέση του leader — είναι πλέον στρογγυλό, αντί για τετράγωνο με στρογγυλεμένες γωνίες.',
      },
    ],
    fixed: [
      {
        en: 'The notice announcing a new version used to appear and then disappear a few seconds later with nothing said, which read as the screen flickering for no reason. It was not a flicker: the update had genuinely failed to download. The notice now stays put and tells you the download failed and that another attempt is coming. Its Update button stays greyed out while there is genuinely nothing installed to switch to.',
        el: 'Η ειδοποίηση για νέα έκδοση εμφανιζόταν και λίγα δευτερόλεπτα μετά εξαφανιζόταν χωρίς εξήγηση, κάτι που έμοιαζε με τρεμόπαιγμα της οθόνης χωρίς λόγο. Δεν ήταν τρεμόπαιγμα: η ενημέρωση είχε πραγματικά αποτύχει να κατέβει. Τώρα η ειδοποίηση μένει στη θέση της και σου λέει ότι η λήψη απέτυχε και ότι θα γίνει νέα προσπάθεια. Το κουμπί «Ενημέρωση» μένει ανενεργό όσο δεν υπάρχει πραγματικά κάτι εγκατεστημένο για να περάσεις.',
      },
      {
        en: 'After a failed download the app used to sit idle until its next check, up to an hour later. It now tries again a minute later and keeps retrying on a short backoff, so an update you have already been told about usually arrives almost straight away.',
        el: 'Μετά από αποτυχημένη λήψη, η εφαρμογή απλώς περίμενε τον επόμενο έλεγχο, έως και μία ώρα αργότερα. Τώρα ξαναπροσπαθεί μετά από ένα λεπτό και συνεχίζει να προσπαθεί σε σύντομα διαστήματα, οπότε η ενημέρωση για την οποία είχες πάρει ειδοποίηση συνήθως έρχεται σχεδόν αμέσως.',
      },
      {
        en: 'When the app\'s own background check was the first thing to spot a new version, you got the full "update ready" notice with an Update button that was greyed out and could never be pressed — the only way out was Later or refreshing the page yourself. That button now works and installs the update.',
        el: 'Όταν τη νέα έκδοση την εντόπιζε πρώτος ο έλεγχος που τρέχει μόνος του στο παρασκήνιο, έβλεπες κανονικά την ειδοποίηση ότι η ενημέρωση είναι έτοιμη, αλλά το κουμπί «Ενημέρωση» ήταν γκριζαρισμένο και δεν πατιόταν — σου έμενε μόνο το «Αργότερα» ή να ανανεώσεις μόνος σου τη σελίδα. Πλέον το κουμπί δουλεύει και εγκαθιστά την ενημέρωση.',
      },
    ],
  },
  {
    version: '0.1.20',
    date: '2026-09-03',
    headline: {
      en: 'Cleaner coverage cards, readable pop-ups',
      el: 'Καθαρότερες κάρτες, ευανάγνωστα παράθυρα',
    },
    summaryEn:
      'Captain Coverage result cards stop claiming things you have not asked about: the "Not boosted by this Captain" badge is gone, and HP and ATK appear only once you press a tier — pressing a tier is what narrows the list to the characters that actually qualify. The favourite crown moved into the card\'s own top-right corner and gave the button row its line back. And in dark mode, text inside pop-up dialogs — the options in a choice list especially — was almost the same colour as its background; every dialog on every screen now reads properly.',
    summaryEl:
      'Οι κάρτες αποτελεσμάτων στο Captain Coverage σταματούν να ισχυρίζονται πράγματα που δεν ρώτησες: το σήμα «Not boosted by this Captain» έφυγε, και τα HP/ATK εμφανίζονται μόνο αφού πατήσεις ένα tier — το πάτημα του tier είναι που περιορίζει τη λίστα σε όσους πραγματικά πληρούν την προϋπόθεση. Το στέμμα των αγαπημένων πήγε στην πάνω δεξιά γωνία της κάρτας κι έδωσε πίσω μια ολόκληρη γραμμή στα κουμπιά. Και στο σκούρο θέμα, τα κείμενα μέσα στα αναδυόμενα παράθυρα — κυρίως οι επιλογές σε λίστες — είχαν σχεδόν το ίδιο χρώμα με το φόντο τους· τώρα διαβάζονται κανονικά παντού.',
    added: [],
    improved: [
      {
        en: 'The "Not boosted by this Captain" badge is gone, and HP and ATK show only after you press a tier.',
        el: 'Το σήμα «Not boosted by this Captain» έφυγε, και τα HP και ATK εμφανίζονται μόνο αφού πατήσεις ένα tier.',
      },
      {
        en: "The favourite crown sits in the card's top-right corner over the portrait, so the action row is back to one line.",
        el: 'Το στέμμα των αγαπημένων κάθεται στην πάνω δεξιά γωνία της κάρτας πάνω από το πορτρέτο, οπότε η γραμμή ενεργειών ξαναγίνεται μονή.',
      },
      {
        en: 'The "Best ability matches first" sort option has been removed.',
        el: 'Η επιλογή ταξινόμησης «Best ability matches first» αφαιρέθηκε.',
      },
    ],
    fixed: [
      {
        en: 'In dark mode, the choices and message text inside pop-up dialogs were nearly invisible against their own background — every dialog on every screen is now readable.',
        el: 'Στο σκούρο θέμα, οι επιλογές και τα κείμενα μέσα στα αναδυόμενα παράθυρα ήταν σχεδόν αόρατα πάνω στο φόντο τους — πλέον κάθε παράθυρο σε κάθε οθόνη διαβάζεται.',
      },
      {
        en: 'The cost hint no longer pushes HP and ATK sideways when you press a tier; they stay in the same place.',
        el: 'Η ένδειξη κόστους δεν σπρώχνει πια τα HP και ATK στο πλάι όταν πατάς ένα tier· μένουν στη θέση τους.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.1.19',
    date: '2026-09-03',
    headline: {
      en: 'Captain Coverage: crown, cost, cleaner toolbar',
      el: 'Captain Coverage: στέμμα, κόστος, καθαρή μπάρα',
    },
    summaryEn:
      'Picking a character as Captain used to make it disappear from the results list; now nobody is removed, and one crown button asks which seat you want — Captain or Friend Captain — telling you whether the seat is empty, already holds that character, or who would be replaced. Cost is readable again on team slots and result cards, the rows of filter chips moved back inside their own pickers so the toolbar takes far less height, and each tier chip now has a help button instead of a permanent block of explanation.',
    summaryEl:
      'Παλιότερα, μόλις έβαζες έναν χαρακτήρα ως Captain, αυτός εξαφανιζόταν από τη λίστα αποτελεσμάτων· πλέον δεν φεύγει κανείς, και ένα κουμπί με στέμμα σε ρωτάει ποια θέση θες — Captain ή Friend Captain — λέγοντάς σου αν η θέση είναι άδεια, αν την έχει ήδη αυτός ο χαρακτήρας, ή ποιον θα αντικαταστήσει. Το κόστος διαβάζεται ξανά σε team slots και κάρτες αποτελεσμάτων, οι σειρές με τα chips των φίλτρων γύρισαν μέσα στα ίδια τα παράθυρα φίλτρων ώστε η μπάρα να πιάνει πολύ λιγότερο ύψος, και κάθε chip tier έχει τώρα κουμπί βοήθειας αντί για μόνιμο μπλοκ κειμένου.',
    added: [
      {
        en: 'One crown button per character asks which seat to fill, Captain or Friend Captain, and each option says what it would do — empty seat, already here, or replaces someone.',
        el: 'Ένα κουμπί με στέμμα ανά χαρακτήρα σε ρωτάει ποια θέση να γεμίσει, Captain ή Friend Captain, και κάθε επιλογή λέει τι θα κάνει — άδεια θέση, ήδη εκεί, ή αντικαθιστά κάποιον.',
      },
      {
        en: 'You can replace an occupied Captain or Friend Captain seat directly, without emptying it first.',
        el: 'Μπορείς να αντικαταστήσεις κατευθείαν μια κατειλημμένη θέση Captain ή Friend Captain, χωρίς να την αδειάσεις πρώτα.',
      },
      {
        en: "Each tier chip has a help button that opens that tier's conditions in a small popover, reachable by touch and by keyboard.",
        el: 'Κάθε chip tier έχει κουμπί βοήθειας που ανοίγει τους όρους εκείνου του tier σε μικρό popover, προσβάσιμο με αφή και με πληκτρολόγιο.',
      },
    ],
    improved: [
      {
        en: 'A character that conflicts with your team or that you cannot afford stays in the list — only its add button goes away.',
        el: 'Ένας χαρακτήρας που συγκρούεται με την ομάδα σου ή που δεν σου βγαίνει σε κόστος μένει στη λίστα — φεύγει μόνο το κουμπί προσθήκης.',
      },
      {
        en: 'Cost now has its own line on the team slot and sits next to HP and ATK on the result card, even before you pick a Captain.',
        el: 'Το κόστος έχει πια δική του γραμμή στο team slot και στέκεται δίπλα σε HP και ATK στην κάρτα αποτελέσματος, ακόμα και πριν διαλέξεις Captain.',
      },
      {
        en: 'The chip rows under the filters are gone — you manage the groups inside the filter window where you built them, and CLEAR still resets everything in one press.',
        el: 'Οι σειρές με τα chips κάτω από τα φίλτρα έφυγαν — διαχειρίζεσαι τις ομάδες μέσα στο παράθυρο φίλτρου όπου τις έφτιαξες, και το CLEAR εξακολουθεί να τα μηδενίζει όλα με ένα πάτημα.',
      },
      {
        en: "Captain and every other filled team slot links to the character's page, and your half-built team is waiting for you when you come back.",
        el: 'Ο Captain και κάθε άλλη γεμάτη θέση οδηγεί στη σελίδα του χαρακτήρα, και η μισοφτιαγμένη ομάδα σου σε περιμένει όταν γυρίσεις.',
      },
      {
        en: "Search moved to the end of the controls, Character Tags now sits beside the Ability filters, and each filter's explanation moved inside its own window.",
        el: 'Η αναζήτηση πήγε στο τέλος των χειριστηρίων, τα Character Tags κάθονται πλέον δίπλα στα φίλτρα Ability, και η επεξήγηση κάθε φίλτρου μπήκε μέσα στο δικό του παράθυρο.',
      },
    ],
    fixed: [
      {
        en: 'The same character can be both Captain and Friend Captain again — saved teams always allowed it, but the page refused to build it.',
        el: 'Ο ίδιος χαρακτήρας μπορεί ξανά να είναι και Captain και Friend Captain — τα αποθηκευμένα teams πάντα το επέτρεπαν, αλλά η σελίδα αρνιόταν να το φτιάξει.',
      },
      {
        en: 'Long names no longer cut the cost off the team slot — that was hitting four names out of five.',
        el: 'Τα μεγάλα ονόματα δεν κόβουν πια το κόστος από το team slot — αυτό συνέβαινε στα τέσσερα ονόματα στα πέντε.',
      },
      {
        en: 'With no Captain selected, tier chips no longer claim the selected Captain has no such tier.',
        el: 'Όταν δεν έχεις διαλέξει Captain, τα chips tier δεν ισχυρίζονται πια ότι ο επιλεγμένος Captain δεν έχει εκείνο το tier.',
      },
      {
        en: 'The Greek interface says "Κόστος" everywhere, including the labels that had shipped in English.',
        el: 'Το ελληνικό περιβάλλον λέει «Κόστος» παντού, ακόμα και στις ετικέτες που είχαν βγει στα αγγλικά.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.1.18',
    date: '2026-09-02',
    userVisible: true,
    headline: {
      en: 'Captain Coverage stops hiding characters',
      el: 'Το Captain Coverage δεν κρύβει πια χαρακτήρες',
    },
    summaryEn:
      'Picking a Captain used to quietly delete most of the list — half the catalogue and more, and with 449 captains, Nami and every Chopper among them, the page came back completely empty. Coverage is now written on each card instead of filtering it, so only the filters you choose narrow the results. The five filter chips became one button, results load a page at a time so the ability window opens in about a third of a second instead of nearly three, and adding a character to your team no longer throws you back to the first page.',
    summaryEl:
      'Μέχρι τώρα, μόλις διάλεγες Captain, η λίστα έσβηνε σιωπηλά τους περισσότερους χαρακτήρες — πάνω από τους μισούς, ενώ με 449 captains, ανάμεσά τους η Nami και όλοι οι Chopper, η σελίδα ερχόταν εντελώς άδεια. Πλέον το coverage γράφεται πάνω σε κάθε κάρτα αντί να τη φιλτράρει, οπότε τη λίστα τη στενεύουν μόνο τα φίλτρα που βάζεις εσύ. Τα πέντε chips των φίλτρων έγιναν ένα κουμπί, τα αποτελέσματα φορτώνουν σελίδα-σελίδα ώστε το παράθυρο των abilities να ανοίγει σε περίπου ένα τρίτο του δευτερολέπτου αντί για σχεδόν τρία, και όταν προσθέτεις χαρακτήρα στην ομάδα δεν σε πετάει πια πίσω στην πρώτη σελίδα.',
    added: [
      {
        en: 'A leader button on every result card: it fills the Captain, then the Friend Captain, then replaces the Captain, so you can re-lead a finished team without emptying a slot first',
        el: 'Κουμπί leader σε κάθε κάρτα αποτελέσματος: γεμίζει πρώτα τον Captain, μετά τον Friend Captain και μετά αντικαθιστά τον Captain, ώστε να αλλάζεις leader σε έτοιμη ομάδα χωρίς να αδειάσεις slot',
      },
      {
        en: 'That button is disabled with a reason for characters with no Captain Ability or that do not fit the cost budget',
        el: 'Το κουμπί είναι απενεργοποιημένο, με εξήγηση, για χαρακτήρες χωρίς Captain Ability ή που δεν χωράνε στο cost budget',
      },
    ],
    improved: [
      {
        en: 'One ability-filter button replaces the five chips, with a removable chip per active group and a clear-all',
        el: 'Ένα κουμπί ability filter αντικαθιστά τα πέντε chips, με ένα chip που αφαιρείται ανά ενεργό group και καθαρισμό όλων',
      },
      {
        en: 'Results show a page at a time with a show-more control; the heading still reports the true total',
        el: 'Τα αποτελέσματα δείχνονται σελίδα-σελίδα με κουμπί για περισσότερα, ενώ ο τίτλος συνεχίζει να δείχνει το πραγματικό σύνολο',
      },
      {
        en: 'Tapping a team slot scrolls you down to the results instead of opening a second picker',
        el: 'Το πάτημα σε team slot σε κατεβάζει στα αποτελέσματα αντί να ανοίγει δεύτερο picker',
      },
      {
        en: 'With every sub slot full the characters stay on screen with the add button greyed out, instead of the whole list vanishing',
        el: 'Όταν όλα τα sub slots είναι γεμάτα, οι χαρακτήρες μένουν στην οθόνη με το κουμπί προσθήκης ανενεργό, αντί να εξαφανίζεται όλη η λίστα',
      },
    ],
    fixed: [
      {
        en: 'Choosing a Captain no longer removes every character that Captain does not boost',
        el: 'Η επιλογή Captain δεν αφαιρεί πια κάθε χαρακτήρα που δεν τον boostάρει αυτός ο Captain',
      },
      {
        en: 'You keep your place in the list after adding a character to the team',
        el: 'Κρατάς τη θέση σου στη λίστα αφού προσθέσεις χαρακτήρα στην ομάδα',
      },
      {
        en: 'The Character Boxes cost field waits until you stop typing, so going for 10 no longer empties the list at 1',
        el: 'Το πεδίο cost στα Character Boxes περιμένει να σταματήσεις να πληκτρολογείς, οπότε όταν πας για 10 δεν αδειάζει η λίστα στο 1',
      },
    ],
  },
  {
    version: '0.1.17',
    date: '2026-08-28',
    userVisible: false,
    headline: {
      en: 'A version number and nothing else',
      el: 'Μόνο ένας αριθμός έκδοσης',
    },
    summaryEn:
      'This release carries no changes to the app. Nothing was added, fixed or moved, and everything works exactly as it did in the previous version.',
    summaryEl:
      'Αυτή η έκδοση δεν φέρνει καμία αλλαγή στην εφαρμογή. Δεν προστέθηκε, δεν διορθώθηκε και δεν μετακινήθηκε τίποτα, και όλα δουλεύουν ακριβώς όπως και στην προηγούμενη έκδοση.',
    added: [],
    improved: [],
    fixed: [],
  },
  {
    version: '0.1.16',
    date: '2026-08-23',
    headline: {
      en: 'Version marker, no app changes',
      el: 'Απλή σήμανση έκδοσης, χωρίς αλλαγές',
    },
    summaryEn:
      'This version carries no changes to the app. Nothing was added, removed or fixed for players.',
    summaryEl:
      'Αυτή η έκδοση δεν φέρνει καμία αλλαγή στην εφαρμογή. Δεν προστέθηκε, δεν αφαιρέθηκε και δεν διορθώθηκε τίποτα για τους παίκτες.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.1.15',
    date: '2026-08-19',
    headline: {
      en: 'Watch the update actually download',
      el: 'Δες την ενημέρωση να κατεβαίνει',
    },
    summaryEn:
      'The update banner used to show up only after a new version had finished downloading, so the whole wait looked like nothing was happening. It now appears the moment the download starts and carries a progress bar that measures real downloaded bytes - which matters, because the character database is most of the download and a simple file count would have raced to 96% and then frozen. The bar never runs backwards, and a full bar always means the update is ready to install.',
    summaryEl:
      'Το banner ενημέρωσης εμφανιζόταν μόνο αφού είχε κατέβει η νέα έκδοση, οπότε όλη η αναμονή έμοιαζε σαν να μη γίνεται τίποτα. Τώρα εμφανίζεται μόλις ξεκινήσει το κατέβασμα και έχει μπάρα προόδου που μετράει πραγματικά bytes - κάτι που μετράει, γιατί η βάση χαρακτήρων είναι το μεγαλύτερο μέρος του κατεβάσματος και μια απλή μέτρηση αρχείων θα πήγαινε στο 96% και μετά θα κόλλαγε. Η μπάρα δεν γυρίζει ποτέ πίσω, και όταν γεμίσει σημαίνει σίγουρα ότι η ενημέρωση είναι έτοιμη.',
    added: [
      {
        en: 'A live download progress bar in the update banner, starting the moment the new version begins downloading.',
        el: 'Ζωντανή μπάρα προόδου στο banner ενημέρωσης, από τη στιγμή που αρχίζει να κατεβαίνει η νέα έκδοση.',
      },
    ],
    improved: [
      {
        en: '"Later" works while the download is still running, and the same version does not pop the banner back up once you have snoozed it - though a newer one still will.',
        el: 'Το «Later» δουλεύει και όσο κατεβαίνει, και η ίδια έκδοση δεν ξαναβγάζει το banner αφού το αναβάλεις - μια νεότερη όμως ναι.',
      },
      {
        en: 'The reload button stays disabled until the download finishes, so a half-downloaded update cannot be thrown away by accident.',
        el: 'Το κουμπί ανανέωσης μένει ανενεργό μέχρι να ολοκληρωθεί το κατέβασμα, ώστε να μη χαθεί κατά λάθος μια μισοκατεβασμένη ενημέρωση.',
      },
    ],
    fixed: [
      {
        en: 'A slow but still-moving download is no longer given up on, while one that is genuinely stuck still resets.',
        el: 'Ένα αργό αλλά ενεργό κατέβασμα δεν εγκαταλείπεται πια, ενώ ένα πραγματικά κολλημένο εξακολουθεί να μηδενίζεται.',
      },
      {
        en: 'The bar no longer sits frozen at 99% when a finished download fails to announce itself.',
        el: 'Η μπάρα δεν μένει πια κολλημένη στο 99% όταν ένα ολοκληρωμένο κατέβασμα δεν το ανακοινώνει.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.1.14',
    date: '2026-08-17',
    userVisible: false,
    headline: {
      en: 'Maintenance only, nothing to see',
      el: 'Μόνο συντήρηση, τίποτα ορατό',
    },
    summaryEn:
      "This release only changed where the project's own checks run — on the maintainer's machine now, instead of automatically on GitHub every time. The app, its character data and the automatic data-update releases are untouched, so there is nothing new to see or do.",
    summaryEl:
      'Αυτό το release άλλαξε μόνο το πού τρέχουν οι εσωτερικοί έλεγχοι του project — τώρα τοπικά στον υπολογιστή, αντί αυτόματα στο GitHub κάθε φορά. Η εφαρμογή, τα δεδομένα των χαρακτήρων και τα αυτόματα releases με νέα δεδομένα μένουν ίδια, οπότε δεν υπάρχει κάτι καινούργιο να δεις.',
    added: [],
    improved: [],
    fixed: [],
  },
  {
    version: '0.1.13',
    date: '2026-08-14',
    headline: {
      en: 'Maintenance release, nothing new on screen',
      el: 'Έκδοση συντήρησης, τίποτα νέο στην οθόνη',
    },
    summaryEn:
      'This version carried no visible change. Nothing was added, changed or fixed in the app itself — it went out only to keep the release line moving.',
    summaryEl:
      'Αυτή η έκδοση δεν έφερε καμία ορατή αλλαγή. Δεν προστέθηκε, δεν άλλαξε και δεν διορθώθηκε τίποτα μέσα στην εφαρμογή — βγήκε μόνο για να συνεχιστεί η σειρά των εκδόσεων.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.1.12',
    date: '2026-08-07',
    headline: {
      en: 'Version update with no changes',
      el: 'Ενημέρωση έκδοσης χωρίς αλλαγές',
    },
    summaryEn:
      'No work landed in this release. It only moves the version number forward, so nothing looks or behaves differently.',
    summaryEl:
      'Σε αυτή την έκδοση δεν μπήκε καμία δουλειά. Απλώς προχωράει ο αριθμός έκδοσης, οπότε τίποτα δεν αλλάζει σε εμφάνιση ή συμπεριφορά.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.1.11',
    date: '2026-07-31',
    headline: {
      en: 'Maintenance update with no visible changes',
      el: 'Ενημέρωση συντήρησης χωρίς ορατές αλλαγές',
    },
    summaryEn:
      'This release only updated the building blocks the app is made of, keeping them current and secure. No screen, filter or team-building behaviour changed. Everything works exactly as it did in the previous version.',
    summaryEl:
      'Αυτή η έκδοση ενημέρωσε μόνο τα εργαλεία και τις βιβλιοθήκες πάνω στις οποίες στηρίζεται η εφαρμογή, ώστε να μένουν φρέσκα και ασφαλή. Καμία οθόνη, κανένα φίλτρο και καμία συμπεριφορά στο χτίσιμο ομάδων δεν άλλαξε. Όλα δουλεύουν ακριβώς όπως και στην προηγούμενη έκδοση.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.1.10',
    date: '2026-07-24',
    headline: {
      en: 'Version update with no visible changes',
      el: 'Ενημέρωση έκδοσης χωρίς ορατές αλλαγές',
    },
    summaryEn:
      'No player-facing changes in this release. It exists to keep the website and the Android build on the same version number.',
    summaryEl:
      'Σε αυτή την έκδοση δεν υπάρχει καμία αλλαγή για τους παίκτες. Βγήκε ώστε η ιστοσελίδα και το Android build να έχουν τον ίδιο αριθμό έκδοσης.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.1.9',
    date: '2026-07-23',
    headline: {
      en: 'Google Drive stays connected now',
      el: 'Το Google Drive μένει πια συνδεδεμένο',
    },
    summaryEn:
      'Your Google account for Drive backup used to quietly disconnect after about an hour, so coming back to the app showed you as signed out even though you never signed out. Your account now stays connected until you disconnect it yourself, and backing out of the Google prompt no longer logs you out either.',
    summaryEl:
      'Ο λογαριασμός Google για το backup στο Drive αποσυνδεόταν αθόρυβα μετά από περίπου μία ώρα, οπότε γυρνώντας στην εφαρμογή σε έδειχνε αποσυνδεδεμένο ενώ εσύ δεν είχες κάνει τίποτα. Πλέον ο λογαριασμός μένει συνδεδεμένος μέχρι να τον αποσυνδέσεις εσύ, και το να κλείσεις το παράθυρο της Google δεν σε βγάζει έξω.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Settings: the Google account no longer disconnects on its own roughly an hour after you connect it',
        el: 'Ρυθμίσεις: ο λογαριασμός Google δεν αποσυνδέεται πια μόνος του περίπου μία ώρα μετά τη σύνδεση',
      },
      {
        en: 'Cancelling or failing the Google sign-in prompt keeps you connected instead of signing you out',
        el: 'Αν ακυρώσεις ή αποτύχει η σύνδεση με τη Google, παραμένεις συνδεδεμένος αντί να βγαίνεις έξω',
      },
      {
        en: 'Only pressing sign out actually disconnects the account',
        el: 'Μόνο το πάτημα της αποσύνδεσης αποσυνδέει πραγματικά τον λογαριασμό',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.1.8',
    date: '2026-07-22',
    userVisible: true,
    headline: {
      en: 'Filter abilities by how many turns',
      el: 'Φιλτράρισμα ικανοτήτων με βάση τους γύρους',
    },
    summaryEn:
      'Any turn-based effect in the ability picker now carries a small "min turns" box - on Captain Coverage, Characters, character boxes and the manual Team Builder. Set a number and you only see characters whose effect lasts at least that long, plus the ones whose effect is permanent. It turns an unusable list into a short one: asking for Reduce Damage of 3 turns or more cuts 867 characters down to 48.',
    summaryEl:
      'Κάθε εφέ που μετριέται σε γύρους έχει τώρα ένα μικρό πεδίο "min turns" μέσα στον picker ικανοτήτων - στο Captain Coverage, στα Characters, στα character boxes και στον χειροκίνητο Team Builder. Βάζεις έναν αριθμό και βλέπεις μόνο χαρακτήρες που το εφέ τους κρατάει τουλάχιστον τόσο, μαζί με όσους το έχουν μόνιμο. Έτσι μια αδιάβαστη λίστα γίνεται σύντομη: με Reduce Damage 3 γύρων και πάνω, οι 867 χαρακτήρες γίνονται 48.',
    added: [
      {
        en: 'A minimum-turns setting on every ability chip whose effect is measured in turns',
        el: 'Ρύθμιση ελάχιστων γύρων σε κάθε ability chip που μετριέται σε γύρους',
      },
      {
        en: 'Effects that last forever show up as "Permanent" instead of an odd 99 or 999 turn count',
        el: 'Τα εφέ που κρατάνε για πάντα εμφανίζονται ως "Permanent" αντί για παράξενα 99 ή 999 γύρους',
      },
    ],
    improved: [
      {
        en: 'The turns box is hidden for abilities that have no turn information, so it can never empty your results by accident',
        el: 'Το πεδίο γύρων κρύβεται σε ικανότητες που δεν έχουν πληροφορία γύρων, οπότε δεν μπορεί να σου αδειάσει τα αποτελέσματα κατά λάθος',
      },
    ],
    fixed: [
      {
        en: 'Two chips for the same ability - one for Captain, one for the rest - no longer interfere with each other in the same filter set',
        el: 'Δύο chip για την ίδια ικανότητα, ένα για Captain και ένα για τα υπόλοιπα, δεν μπερδεύονται πια μεταξύ τους στο ίδιο σετ φίλτρων',
      },
    ],
  },
  {
    version: '0.1.7',
    date: '2026-07-22',
    headline: {
      en: 'Ability filters keep the section you picked',
      el: 'Τα φίλτρα ικανοτήτων κρατούν τη σωστή ενότητα',
    },
    summaryEn:
      'Some effects show up twice in the ability picker — once as a Captain requirement, once in their own category; Enemy Damage Reduction is one of 62. Picking one from the Special section wrongly turned it into a Captain-only requirement and lit both tiles, and the results collapsed from 351 matching characters to 11. Now the section you click decides, and the Captain version and the non-Captain version can be picked as two separate filters.',
    summaryEl:
      'Κάποια εφέ εμφανίζονται δύο φορές στον επιλογέα ικανοτήτων: μία ως απαίτηση Captain και μία στη δική τους κατηγορία — το Enemy Damage Reduction είναι ένα από τα 62. Αν το διάλεγες από την ενότητα Special, η εφαρμογή το μετέτρεπε λανθασμένα σε απαίτηση μόνο για Captain και άναβε και τα δύο πλακίδια, με αποτέλεσμα η λίστα να πέφτει από 351 χαρακτήρες σε 11. Πλέον μετράει η ενότητα που πάτησες, και η Captain και η μη-Captain εκδοχή διαλέγονται ως δύο ξεχωριστά φίλτρα.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Picking a shared effect from its own category no longer forces it to Captain scope, so the character list stops collapsing to a handful of results.',
        el: 'Η επιλογή ενός κοινού εφέ από τη δική του κατηγορία δεν το κλειδώνει πια σε Captain, οπότε η λίστα χαρακτήρων δεν καταρρέει σε μια χούφτα αποτελέσματα.',
      },
      {
        en: 'Only the tile you actually clicked lights up, instead of both copies of the same effect.',
        el: 'Ανάβει μόνο το πλακίδιο που πάτησες, όχι και τα δύο αντίγραφα του ίδιου εφέ.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.1.6',
    date: '2026-07-22',
    headline: {
      en: 'Ten dead potential filters now work',
      el: 'Δέκα νεκρά φίλτρα potential δουλεύουν πια',
    },
    summaryEn:
      "Ten Potential Ability filters on Captain Coverage returned nothing at all. Pick Enrage, Cooldown Reduction, Last Tap, Ship Bind resistance, Double or Triple Special Activation, Rush, Hunger resistance or Special Use Limit resistance and you got zero characters, every single time — they were searching for the app's own wording instead of the wording the character data actually uses. All ten now return real results, from 9 characters for Triple Special Activation up to 677 for Enrage.",
    summaryEl:
      'Δέκα φίλτρα Potential Ability στο Captain Coverage δεν έβγαζαν απολύτως τίποτα. Διάλεγες Enrage, Cooldown Reduction, Last Tap, αντοχή σε Ship Bind, Double ή Triple Special Activation, Rush, αντοχή σε Hunger ή σε Special Use Limit και έπαιρνες κάθε φορά μηδέν χαρακτήρες — έψαχναν τη διατύπωση της ίδιας της εφαρμογής αντί για τη διατύπωση που έχουν τα δεδομένα των χαρακτήρων. Και τα δέκα δίνουν πλέον πραγματικά αποτελέσματα, από 9 χαρακτήρες για το Triple Special Activation μέχρι 677 για το Enrage.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Enrage, Cooldown Reduction, Hunger resistance, Ship Bind resistance and Special Use Limit resistance now list the characters that have them instead of coming back empty.',
        el: 'Τα Enrage, Cooldown Reduction, αντοχή σε Hunger, αντοχή σε Ship Bind και αντοχή σε Special Use Limit δείχνουν πια τους χαρακτήρες που τα έχουν, αντί να γυρίζουν άδεια.',
      },
      {
        en: 'Last Tap and Rush were reading a data field that was empty for every character; they now read the real potential list — 105 and 21 characters.',
        el: 'Τα Last Tap και Rush διάβαζαν ένα πεδίο που ήταν άδειο για κάθε χαρακτήρα· τώρα διαβάζουν την πραγματική λίστα potential — 105 και 21 χαρακτήρες.',
      },
      {
        en: 'Double and Triple Special Activation return 82 and 9 characters instead of none.',
        el: 'Τα Double και Triple Special Activation επιστρέφουν 82 και 9 χαρακτήρες αντί για κανέναν.',
      },
      {
        en: 'Slot Bind resistance picked up 42 more characters that used a newer wording.',
        el: 'Η αντοχή σε Slot Bind κέρδισε 42 ακόμα χαρακτήρες που χρησιμοποιούσαν νεότερη διατύπωση.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.1.5',
    date: '2026-07-22',
    userVisible: true,
    headline: {
      en: 'Sailor ability filters finally return characters',
      el: 'Τα φίλτρα sailor ability επιτέλους βγάζουν χαρακτήρες',
    },
    summaryEn:
      'Filtering by a crewmate (sailor) ability was mostly giving you an empty page. Boosts written for a type, like "boosts base ATK of [STR] characters", matched nobody at all, and class lists, orb carry-over, special charge and status recovery all skipped characters that clearly have them. Sixty of those filters are fixed, so asking for a sailor effect now returns the units that really have it — including abilities a character only gets at max level.',
    summaryEl:
      'Το φιλτράρισμα με crewmate (sailor) ability σου έβγαζε τις περισσότερες φορές άδεια σελίδα. Τα boosts που γράφονται ανά type, όπως «boosts base ATK of [STR] characters», δεν έβρισκαν κανέναν, ενώ λίστες με classes, orb carry-over, special charge και status recovery προσπερνούσαν χαρακτήρες που προφανώς τα έχουν. Διορθώθηκαν 60 τέτοια φίλτρα, οπότε όταν ζητάς ένα sailor effect παίρνεις πλέον τους χαρακτήρες που πραγματικά το έχουν — μαζί με τα abilities που ένας χαρακτήρας αποκτά μόνο στο max level.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Sailor boosts aimed at a type ([STR], [DEX] and so on) now match characters instead of returning zero',
        el: 'Τα sailor boosts που στοχεύουν type ([STR], [DEX] κ.λπ.) βρίσκουν πλέον χαρακτήρες αντί για μηδέν',
      },
      {
        en: 'Boosts listing several classes, or scoped to cost or the top row, are read correctly',
        el: 'Τα boosts που αναφέρουν πολλά classes, ή αφορούν cost ή την πάνω σειρά, διαβάζονται σωστά',
      },
      {
        en: 'Orb carry-over, healing from [RCV] orbs, special charge triggers and type damage are matched',
        el: 'Πιάνονται orb carry-over, θεραπεία από [RCV] orbs, triggers για special charge και type damage',
      },
      {
        en: 'Paralysis and Burn recovery wordings that were missed are now included',
        el: 'Συμπεριλαμβάνονται πλέον διατυπώσεις για recovery από Paralysis και Burn που έλειπαν',
      },
      {
        en: 'Sailor abilities that only appear on a maxed character are no longer dropped',
        el: 'Δεν χάνονται πια τα sailor abilities που εμφανίζονται μόνο σε maxed χαρακτήρα',
      },
    ],
  },
  {
    version: '0.1.4',
    date: '2026-07-22',
    userVisible: true,
    headline: {
      en: 'Support abilities matched far more accurately',
      el: 'Πολύ πιο σωστό ταίριασμα στα support',
    },
    summaryEn:
      'All 67 support ability filters were checked one by one and 44 of them were wrong. Supports that boost base ATK, HP and RCV together only counted as ATK; supports that apply DEF Down, Delay, Poison or Increase Damage Taken were not detected at all. Search for a support effect now and you get the characters that really have it.',
    summaryEl:
      'Ελέγχθηκαν ένα προς ένα και τα 67 φίλτρα support ικανοτήτων και τα 44 ήταν λάθος. Τα support που ανεβάζουν μαζί base ATK, HP και RCV μετρούσαν μόνο ως ATK, ενώ όσα βάζουν DEF Down, Delay, Poison ή Increase Damage Taken δεν εντοπίζονταν καθόλου. Τώρα ψάχνεις ένα support εφέ και σου βγαίνουν οι χαρακτήρες που το έχουν όντως.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Supports that boost "base ATK, HP and RCV" now count for all three stats instead of piling everyone into the ATK filter.',
        el: 'Τα support που ανεβάζουν «base ATK, HP and RCV» μετρούν πλέον και στα τρία στατιστικά, αντί να στοιβάζονται όλα στο φίλτρο ATK.',
      },
      {
        en: 'Supports that apply DEF Down, Resistance Reduction, Delay, Increase Damage Taken or Poison to enemies are now detected.',
        el: 'Εντοπίζονται πλέον τα support που βάζουν στους εχθρούς DEF Down, Resistance Reduction, Delay, Increase Damage Taken ή Poison.',
      },
      {
        en: 'Status-recovery names now match the ones players know, including Chain Coefficient Reduction, Chain Multiplier Limit and Silence (Special Bind).',
        el: 'Τα ονόματα για status recovery ταιριάζουν πλέον με αυτά που ξέρουν οι παίκτες, όπως Chain Coefficient Reduction, Chain Multiplier Limit και Silence (Special Bind).',
      },
      {
        en: 'Supports that boost ATK against delayed or poisoned enemies are recognised, and a false [AUTO+] match on a DEF Up support is gone.',
        el: 'Αναγνωρίζονται τα support που ανεβάζουν ATK απέναντι σε delayed ή poisoned εχθρούς, και έφυγε ένα λανθασμένο ταίριασμα [AUTO+] σε support DEF Up.',
      },
    ],
  },
  {
    version: '0.1.3',
    date: '2026-07-22',
    headline: {
      en: 'Six special filters that found nothing now work',
      el: 'Έξι φίλτρα special που δεν έβρισκαν τίποτα δουλεύουν',
    },
    summaryEn:
      'A whole group of special-ability filters was returning an empty list, because the app was looking for wording the game never actually uses. Filtering by enemy DEF Down, orb chance boost, Critical Hit Damage, Critical Hit Rate, Chain Boundary and Switch Effect / VS Gauge reduction now brings up the characters that really have them. Set Target and class change now also count when a character only does it in their Super Special. On phones, the search bar on Characters moved to the bottom of the filters, right above the character grid.',
    summaryEl:
      'Μια ολόκληρη ομάδα φίλτρων για special abilities δεν επέστρεφε τίποτα, επειδή η εφαρμογή έψαχνε διατύπωση που το παιχνίδι δεν χρησιμοποιεί ποτέ. Το φιλτράρισμα για DEF Down στους εχθρούς, boost στην πιθανότητα orbs, Critical Hit Damage, Critical Hit Rate, Chain Boundary και μείωση Switch Effect / VS Gauge βγάζει πλέον τους χαρακτήρες που όντως τα έχουν. Το Set Target και η αλλαγή class μετράνε τώρα και όταν ο χαρακτήρας τα κάνει μόνο στο Super Special του. Στα κινητά, η μπάρα αναζήτησης στην οθόνη Characters πήγε στο τέλος των φίλτρων, ακριβώς πάνω από το πλέγμα των χαρακτήρων.',
    added: [],
    improved: [
      {
        en: 'On phones the Characters search bar now sits directly above the character grid instead of in the middle of the filters',
        el: 'Στα κινητά η μπάρα αναζήτησης στην οθόνη Characters είναι πλέον ακριβώς πάνω από το πλέγμα χαρακτήρων, αντί για ανάμεσα στα φίλτρα',
      },
    ],
    fixed: [
      {
        en: 'Filtering for specials that cut enemy defence returned nothing at all; it now lists every character whose special does it',
        el: 'Το φίλτρο για specials που μειώνουν την άμυνα των εχθρών δεν έβγαζε τίποτα· τώρα δείχνει κάθε χαρακτήρα που το κάνει',
      },
      {
        en: 'Filtering for orb chance boosts now returns results instead of an empty list',
        el: 'Το φίλτρο για boost στην πιθανότητα orbs βγάζει πλέον αποτελέσματα αντί για άδεια λίστα',
      },
      {
        en: 'The Critical Hit Damage and Critical Hit Rate filters now find the characters that grant those buffs',
        el: 'Τα φίλτρα Critical Hit Damage και Critical Hit Rate βρίσκουν πλέον τους χαρακτήρες που δίνουν αυτά τα buffs',
      },
      {
        en: 'The Chain Boundary filter now finds the characters that set chain boundaries',
        el: 'Το φίλτρο Chain Boundary βρίσκει πλέον τους χαρακτήρες που θέτουν chain boundaries',
      },
      {
        en: 'The Switch Effect and VS Gauge reduction filters now return the VS units that do it',
        el: 'Τα φίλτρα για μείωση Switch Effect και VS Gauge επιστρέφουν πλέον τα VS units που το κάνουν',
      },
      {
        en: 'Set Target and class change are now recognised on characters that only apply them in their Super Special',
        el: 'Το Set Target και η αλλαγή class αναγνωρίζονται πλέον και σε χαρακτήρες που τα κάνουν μόνο στο Super Special τους',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.1.2',
    date: '2026-07-21',
    headline: {
      en: 'Filter by several types and classes',
      el: 'Φιλτράρισμα σε πολλούς types και classes',
    },
    summaryEn:
      'Type and class filters now take more than one value at a time, on every screen that has them. Pick STR and QCK and say whether you want characters that are either one, or characters that are both. Since a character holds at most two types, the app blocks impossible combinations out loud instead of quietly handing you an empty list. Two old filtering bugs surfaced and were fixed along the way.',
    summaryEl:
      'Τα φίλτρα type και class δέχονται πλέον περισσότερες από μία τιμές, σε κάθε οθόνη που τα έχει. Διάλεξε STR και QCK και όρισε αν θέλεις χαρακτήρες που είναι είτε το ένα είτε το άλλο, ή χαρακτήρες που είναι και τα δύο. Επειδή ένας χαρακτήρας έχει το πολύ δύο types, η εφαρμογή μπλοκάρει φανερά τους αδύνατους συνδυασμούς αντί να σου δίνει σιωπηλά άδεια λίστα.',
    added: [
      {
        en: 'Multi-select type and class filters with Any / All matching, on every screen that filters characters.',
        el: 'Πολλαπλή επιλογή type και class με λογική Any / All, σε κάθε οθόνη που φιλτράρει χαρακτήρες.',
      },
    ],
    improved: [
      {
        en: 'Adding a third type switches the match mode to Any and tells you why, instead of returning nothing.',
        el: 'Αν προσθέσεις τρίτο type, η λογική γυρίζει σε Any και σου λέει γιατί, αντί να μη γυρίζει τίποτα.',
      },
      {
        en: 'The match mode only appears once you have picked two values, since with one it does nothing.',
        el: 'Η επιλογή λογικής εμφανίζεται μόνο αφού διαλέξεις δύο τιμές, αφού με μία δεν αλλάζει τίποτα.',
      },
    ],
    fixed: [
      {
        en: "Class filters now read a character's full class list, so units whose classes you edited locally are found.",
        el: 'Τα φίλτρα class διαβάζουν πλέον όλη τη λίστα class ενός χαρακτήρα, οπότε βρίσκονται και μονάδες που έχεις διορθώσει τοπικά.',
      },
      {
        en: 'Type filtering no longer matches on a text fragment, and dual-type characters are found no matter which order their two types are stored in.',
        el: 'Το φιλτράρισμα type δεν ταιριάζει πια με κομμάτι κειμένου, και οι χαρακτήρες διπλού type βρίσκονται όποια κι αν είναι η σειρά των δύο types τους.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.1.1',
    date: '2026-07-21',
    userVisible: true,
    headline: {
      en: 'Character tag filters in the last four pickers',
      el: 'Φίλτρα character tags και στους τελευταίους τέσσερις pickers',
    },
    summaryEn:
      'Every list of characters in the app now filters by crew and family tags the same way. The four pickers that were still missing it are done: the Auto Team Builder requirement-source picker, its manual-lock picker, its exclude-characters picker, and the Rumble manual slot picker. The difference is big — one picker dropped from 337 candidates to 7 once a tag was applied. Each of these filters only narrows the list in front of you, and a caption in the picker says so, so it is never confused with the tag requirements you set for the whole team.',
    summaryEl:
      'Κάθε λίστα χαρακτήρων στην εφαρμογή φιλτράρεται πλέον με tags πληρώματος και οικογένειας με τον ίδιο τρόπο. Οι τέσσερις pickers που έλειπαν μπήκαν κι αυτοί: ο requirement-source picker του Auto Team Builder, ο manual-lock picker, ο picker για exclude χαρακτήρων και ο manual slot picker στο Rumble. Η διαφορά είναι μεγάλη — ένας picker έπεσε από 337 υποψήφιους σε 7 μόλις μπήκε ένα tag. Αυτά τα φίλτρα στενεύουν μόνο τη λίστα που βλέπεις μπροστά σου, και μια σημείωση μέσα στον picker το λέει καθαρά, ώστε να μην μπερδεύεται με τα tag requirements που βάζεις για όλη την ομάδα.',
    added: [
      {
        en: 'Filter by character tags in the Auto Team Builder requirement-source picker, the manual-lock picker and the exclude-characters picker',
        el: 'Φιλτράρισμα με character tags στον requirement-source picker του Auto Team Builder, στον manual-lock picker και στον picker για exclude χαρακτήρων',
      },
      {
        en: "The same tag filter in the Rumble manual slot picker, applied before the grid's 80-result limit so you see the candidates you actually asked for",
        el: 'Το ίδιο φίλτρο tags και στον manual slot picker του Rumble, που εφαρμόζεται πριν το όριο των 80 αποτελεσμάτων, ώστε να βλέπεις τους υποψήφιους που πραγματικά ζήτησες',
      },
    ],
    improved: [],
    fixed: [],
  },
  {
    version: '0.1.0',
    date: '2026-07-20',
    headline: {
      en: 'Character tag filters on every list',
      el: 'Φίλτρα character tags σε όλες τις λίστες',
    },
    summaryEn:
      'The AND/OR tag filter that already worked for ability tags now works for character tags too, and it finally appears on the pages that were missing it: Characters, Character Boxes, Rumble Characters, and the character picker that opens inside other screens. Build groups of tags, combine them with AND or OR, and cut a 1716-entry Rumble list down to the handful you actually meant. Two annoying bugs around that button are fixed as well.',
    summaryEl:
      'Το φίλτρο tags με AND/OR που δούλευε ήδη για ability tags δουλεύει τώρα και για character tags, και εμφανίζεται επιτέλους στις σελίδες που δεν το είχαν: Characters, Character Boxes, Rumble Characters και τον character picker που ανοίγει μέσα σε άλλες οθόνες. Φτιάχνεις ομάδες από tags, τις συνδυάζεις με AND ή OR, και κόβεις μια λίστα 1716 Rumble χαρακτήρων στους λίγους που πραγματικά εννοούσες. Διορθώθηκαν και δύο ενοχλητικά προβλήματα γύρω από αυτό το κουμπί.',
    added: [
      {
        en: 'Character-tag filtering with AND/OR groups on Characters, Character Boxes and Rumble Characters.',
        el: 'Φιλτράρισμα με character tags και ομάδες AND/OR σε Characters, Character Boxes και Rumble Characters.',
      },
      {
        en: 'The same tag filter inside the character picker that other screens open in a window.',
        el: 'Το ίδιο φίλτρο tags και μέσα στον character picker που ανοίγουν άλλες οθόνες σε παράθυρο.',
      },
    ],
    improved: [],
    fixed: [
      {
        en: 'The tag filter button could stay greyed out forever after the page loaded; it now becomes usable as soon as the list is ready.',
        el: 'Το κουμπί του φίλτρου tags μπορούσε να μείνει για πάντα ανενεργό μετά τη φόρτωση· τώρα ενεργοποιείται μόλις ετοιμαστεί η λίστα.',
      },
      {
        en: 'If the tag list failed to load once, the button stayed dead; tapping it now tries again.',
        el: 'Αν η λίστα των tags αποτύγχανε μία φορά να φορτώσει, το κουμπί έμενε νεκρό· τώρα με ένα πάτημα ξαναπροσπαθεί.',
      },
      {
        en: 'The character tag window no longer animates at full speed for people whose device is set to reduce motion.',
        el: 'Το παράθυρο των character tags δεν κάνει πια κανονικό animation σε όσους έχουν ζητήσει λιγότερη κίνηση στη συσκευή τους.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.100',
    date: '2026-07-19',
    headline: {
      en: 'Ability filters now work in groups',
      el: 'Τα φίλτρα abilities δουλεύουν πλέον σε ομάδες',
    },
    summaryEn:
      'Ability filtering was rebuilt around tag groups: you put a few effects in a group and choose whether a character must have all of them or just one, and you can stack several groups together. The same picker is used everywhere you filter — Characters, Captain Coverage, Character Boxes, Manual Team Builder and the character image picker — so it works the same way on every screen. The picker itself also stopped misbehaving on phones, where the huge list of tags used to push everything out of reach.',
    summaryEl:
      'Το φιλτράρισμα abilities ξαναχτίστηκε γύρω από ομάδες tags: βάζεις κάποια effects σε μια ομάδα και διαλέγεις αν ο χαρακτήρας πρέπει να τα έχει όλα ή έστω ένα, και μπορείς να συνδυάσεις πολλές ομάδες μαζί. Ο ίδιος picker χρησιμοποιείται παντού όπου φιλτράρεις — Characters, Captain Coverage, Character Boxes, Manual Team Builder και στην επιλογή εικόνας χαρακτήρα — οπότε δουλεύει ίδια σε κάθε οθόνη. Επίσης, ο picker σταμάτησε να «ξεφεύγει» στο κινητό, όπου η τεράστια λίστα tags έσπρωχνε τα πάντα εκτός οθόνης.',
    added: [
      {
        en: 'Group ability tags and pick per group whether a character needs every tag or just one of them.',
        el: 'Ομαδοποίησε tags abilities και διάλεξε ανά ομάδα αν ο χαρακτήρας χρειάζεται όλα τα tags ή έστω ένα.',
      },
      {
        en: 'Combine several groups in one filter to describe exactly the character you are hunting for.',
        el: 'Συνδύασε πολλές ομάδες σε ένα φίλτρο για να περιγράψεις ακριβώς τον χαρακτήρα που ψάχνεις.',
      },
      {
        en: 'One shared filter picker across Characters, Captain Coverage, Character Boxes, Manual Team Builder and the character image picker.',
        el: 'Ένας κοινός picker φίλτρων σε Characters, Captain Coverage, Character Boxes, Manual Team Builder και στην επιλογή εικόνας χαρακτήρα.',
      },
    ],
    improved: [
      {
        en: 'Filter chips show how many requirements you have picked in that category across all your groups.',
        el: 'Τα chips των φίλτρων δείχνουν πόσες απαιτήσεις έχεις διαλέξει σε κάθε κατηγορία, από όλες τις ομάδες μαζί.',
      },
    ],
    fixed: [
      {
        en: 'On a phone the tag picker now scrolls inside its own panel instead of stretching the whole window, so a group you just added stays in view.',
        el: 'Στο κινητό ο picker των tags κάνει πλέον scroll μέσα στο δικό του πάνελ αντί να τεντώνει όλο το παράθυρο, οπότε μια ομάδα που μόλις πρόσθεσες μένει μπροστά στα μάτια σου.',
      },
      {
        en: 'The picker no longer says "0 characters match" while you have not added a single tag group yet.',
        el: 'Ο picker δεν λέει πια «0 χαρακτήρες ταιριάζουν» ενώ δεν έχεις προσθέσει ακόμα καμία ομάδα tags.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.99',
    date: '2026-07-19',
    headline: {
      en: 'Poison cure filter shows only real cures',
      el: 'Το φίλτρο Poison cure δείχνει μόνο πραγματικά cures',
    },
    summaryEn:
      'Removing Poison from the enemy is not the same as curing Poison on your own crew, but one character was slipping into the Poison cure filter for exactly that reason. Since Poison ignores barriers and kills straight through survive-at-1-HP, that was a bad character to be counting on. The filter now tells the two apart sentence by sentence, so abilities that hit enemies and crew in the same breath — like Monet or Shirahoshi — still count as the real cures they are.',
    summaryEl:
      "Το να αφαιρείς Poison από τον εχθρό δεν είναι το ίδιο με το να καθαρίζεις Poison από το δικό σου crew, όμως ένας χαρακτήρας τρύπωνε στο φίλτρο Poison cure ακριβώς γι' αυτόν τον λόγο. Κι επειδή το Poison αγνοεί τα barrier και σε σκοτώνει ακόμη κι όταν επιβιώνεις με 1 HP, ήταν κακή επιλογή για να βασιστείς. Πλέον το φίλτρο ξεχωρίζει τις δύο περιπτώσεις πρόταση προς πρόταση, οπότε abilities που πιάνουν και εχθρούς και crew μαζί — όπως της Monet ή της Shirahoshi — μετράνε κανονικά ως cures.",
    added: [],
    improved: [],
    fixed: [
      {
        en: 'A character who only strips Poison from enemies no longer counts as a Poison cure for your crew',
        el: 'Χαρακτήρας που αφαιρεί Poison μόνο από τους εχθρούς δεν μετράει πια ως Poison cure για το crew σου',
      },
      {
        en: 'Abilities that mention enemies and crew in the same line, like Monet and Shirahoshi, are still recognised as genuine cures',
        el: 'Abilities που αναφέρουν εχθρούς και crew στην ίδια γραμμή, όπως της Monet και της Shirahoshi, εξακολουθούν να αναγνωρίζονται ως πραγματικά cures',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.98',
    date: '2026-07-18',
    headline: {
      en: 'Ability filters get match counts and repairs',
      el: 'Τα φίλτρα ικανοτήτων: μετρητές και διορθώσεις',
    },
    summaryEn:
      'When you pick a requirement in the ability picker, it now tells you how many characters actually satisfy it, counted for the mode you are in — and warns you when the answer is five or fewer, which happens a lot in Captain mode ("Enemy Resilience" matches 137 characters overall but exactly one as a Captain). Several filters that were quietly broken were repaired as well, including one that returned nothing at all, and two confusing filter names were changed to say which side of the fight they belong to.',
    summaryEl:
      'Όταν διαλέγεις απαίτηση στον picker ικανοτήτων, σου λέει πλέον πόσοι χαρακτήρες την καλύπτουν πραγματικά, μετρημένοι για τη λειτουργία στην οποία βρίσκεσαι — και σε προειδοποιεί όταν είναι πέντε ή λιγότεροι, κάτι που συμβαίνει συχνά σε Captain mode (το «Enemy Resilience» ταιριάζει με 137 χαρακτήρες συνολικά, αλλά μόνο με έναν ως Captain). Διορθώθηκαν επίσης φίλτρα που δεν δούλευαν σωστά, ανάμεσά τους ένα που δεν επέστρεφε απολύτως τίποτα, και άλλαξαν δύο μπερδεμένα ονόματα φίλτρων ώστε να φαίνεται σε ποια πλευρά της μάχης ανήκουν.',
    added: [
      {
        en: 'Each requirement tile shows how many characters match it, counted for Captain mode when you are in Captain mode.',
        el: 'Κάθε απαίτηση δείχνει πόσοι χαρακτήρες την καλύπτουν, μετρημένοι για Captain mode όταν είσαι σε Captain mode.',
      },
      {
        en: 'A warning on requirements that almost nothing satisfies, so you know before you build.',
        el: 'Προειδοποίηση στις απαιτήσεις που σχεδόν κανείς δεν καλύπτει, ώστε να το ξέρεις πριν φτιάξεις ομάδα.',
      },
    ],
    improved: [
      {
        en: '"Resilience" is now "Protect from Defeat (Resilience)", so it is no longer confused with the enemy buff of the same name.',
        el: 'Το «Resilience» έγινε «Protect from Defeat (Resilience)», για να μην μπερδεύεται με το ομώνυμο buff του εχθρού.',
      },
      {
        en: 'The chain debuff cure is now findable by its in-game name, "Chain Coefficient Reduction", instead of a name that described the opposite effect.',
        el: 'Η θεραπεία του chain debuff βρίσκεται πλέον με το όνομά της στο παιχνίδι, «Chain Coefficient Reduction», αντί για ένα όνομα που περιέγραφε το αντίθετο εφέ.',
      },
    ],
    fixed: [
      {
        en: 'The Protect from Defeat filter returned zero characters; it now returns the 67 that actually have it.',
        el: 'Το φίλτρο Protect from Defeat δεν επέστρεφε κανέναν χαρακτήρα· τώρα επιστρέφει τους 67 που όντως το έχουν.',
      },
      {
        en: 'Asking for a high number of turns wiped out permanent cures: Remove Poison returned none of its 107, Remove Paralysis none of its 84 and Remove Stun none at all. A permanent removal now satisfies any turn requirement.',
        el: 'Ζητώντας μεγάλο αριθμό γύρων εξαφανίζονταν οι μόνιμες θεραπείες: το Remove Poison δεν επέστρεφε κανέναν από τους 107 του, το Remove Paralysis κανέναν από τους 84 και το Remove Stun κανέναν απολύτως. Πλέον μια μόνιμη αφαίρεση καλύπτει οποιαδήποτε απαίτηση γύρων.',
      },
      {
        en: 'Boosts against delayed enemies missed six Captains whose text lists Delay together with other statuses (122 to 128).',
        el: 'Τα boosts εναντίον delayed εχθρών έχαναν έξι Captains που αναφέρουν το Delay μαζί με άλλα statuses (από 122 σε 128).',
      },
      {
        en: 'Barrier duration reduction missed characters whose second effect is joined with "and" instead of a comma, such as Blackbeard and Caribou.',
        el: 'Η μείωση διάρκειας Barrier έχανε χαρακτήρες που το δεύτερο εφέ τους ενώνεται με «and» αντί για κόμμα, όπως ο Blackbeard και ο Caribou.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.97',
    date: '2026-07-18',
    headline: {
      en: 'Delayed-effect specials stop going missing',
      el: 'Δεν χάνονται πια τα specials με καθυστερημένο effect',
    },
    summaryEn:
      'Some specials describe their effect as landing "in the next turn" instead of "in the following turn" — the same thing, worded differently. Those were quietly skipped when you filtered for delayed effects. Doc Q and Blackbeard now show up in that filter where they always belonged.',
    summaryEl:
      'Κάποια specials γράφουν ότι το effect τους πέφτει «in the next turn» αντί για «in the following turn» — το ίδιο πράγμα, με άλλα λόγια. Αυτά έμεναν αθόρυβα εκτός όταν φιλτράριζες για καθυστερημένα effects. Ο Doc Q και ο Blackbeard εμφανίζονται πλέον εκεί που ανήκαν εξαρχής.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'The delayed-effect special filter now also catches specials worded "in the next turn", adding Doc Q and Blackbeard',
        el: 'Το φίλτρο για specials με καθυστερημένο effect πιάνει πλέον και τη διατύπωση «in the next turn», προσθέτοντας τον Doc Q και τον Blackbeard',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.96',
    date: '2026-07-18',
    userVisible: true,
    headline: {
      en: 'Three ability filters stop listing opposites',
      el: 'Τρία φίλτρα σταματούν να δείχνουν τα αντίθετα',
    },
    summaryEn:
      'Three filters in the ability picker were returning characters that do the opposite of what you asked for. "Increase Damage Taken" mixed in every character that removes the debuff alongside those that inflict it, and the buff-duration filter listed characters that shorten enemy buffs instead of extending your own. Both lists are much shorter and correct now, so what you pick is what you get.',
    summaryEl:
      'Τρία φίλτρα στον picker ικανοτήτων έβγαζαν χαρακτήρες που κάνουν ακριβώς το αντίθετο από αυτό που ζητούσες. Το "Increase Damage Taken" ανακάτευε όσους αφαιρούν το debuff μαζί με όσους το ρίχνουν, ενώ το φίλτρο για τη διάρκεια των buff έδειχνε χαρακτήρες που κόβουν τα buff των εχθρών αντί να επεκτείνουν τα δικά σου. Και οι δύο λίστες είναι τώρα πολύ πιο μικρές και σωστές, οπότε παίρνεις αυτό που διάλεξες.',
    added: [],
    improved: [],
    fixed: [
      {
        en: '"Increase Damage Taken" now lists only the 99 characters that actually inflict it, instead of 214 that included every debuff remover',
        el: 'Το "Increase Damage Taken" δείχνει πλέον μόνο τους 99 χαρακτήρες που πραγματικά το ρίχνουν, αντί για 214 που περιλάμβαναν και όσους το αφαιρούν',
      },
      {
        en: 'The buff-duration filter dropped from 264 to 213 characters, losing the ones that shorten enemy buffs rather than extend yours',
        el: 'Το φίλτρο διάρκειας buff έπεσε από 264 σε 213 χαρακτήρες, χάνοντας όσους κόβουν buff εχθρών αντί να επεκτείνουν τα δικά σου',
      },
      {
        en: "Charlotte Smoothie appears again under the filter for removing an enemy's Increase Defense, which a typo in the game's own text had hidden",
        el: 'Η Charlotte Smoothie εμφανίζεται ξανά στο φίλτρο για αφαίρεση του Increase Defense των εχθρών, που την έκρυβε ένα ορθογραφικό στο ίδιο το κείμενο του παιχνιδιού',
      },
    ],
  },
  {
    version: '0.0.95',
    date: '2026-07-17',
    headline: {
      en: 'PERFECT-timing abilities show up again',
      el: 'Οι ικανότητες με PERFECT εμφανίζονται ξανά',
    },
    summaryEn:
      'The tap-timing filter was blind to anything written in the plural — "3 PERFECTs in a row", "N consecutive PERFECTs" — which is exactly how most captains word it. Gear Third Luffy, Law, Akainu, Morley and roughly a hundred more were simply missing from it. Matches went from 331 to 436, and nothing wrong crept in: effects that only make PERFECTs easier to hit still stay out.',
    summaryEl:
      'Το φίλτρο για tap timing δεν έβλεπε τίποτα γραμμένο στον πληθυντικό — «3 PERFECTs in a row», «N consecutive PERFECTs» — που είναι ακριβώς ο τρόπος που το γράφουν οι περισσότεροι captains. Gear Third Luffy, Law, Akainu, Morley και άλλοι εκατό περίπου απλώς έλειπαν. Τα αποτελέσματα πήγαν από 331 σε 436, χωρίς να μπει τίποτα άσχετο: τα εφέ που απλώς κάνουν τα PERFECT πιο εύκολα μένουν εκτός.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Abilities that ask for consecutive PERFECTs are now matched by the tap-timing filter — 105 characters that were missing came back.',
        el: 'Οι ικανότητες που ζητούν συνεχόμενα PERFECT πιάνονται πλέον από το φίλτρο tap timing — 105 χαρακτήρες που έλειπαν επέστρεψαν.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.94',
    date: '2026-07-17',
    headline: {
      en: 'Special filters catch more characters',
      el: 'Τα φίλτρα special πιάνουν περισσότερους χαρακτήρες',
    },
    summaryEn:
      'Another pass over the Special filters on Captain Coverage. A handful of characters whose special is worded unusually were being missed, and one was filed under exactly the effect her special says it does not touch. The tap-timing filter was also renamed, because players search for "PERFECT" and the old name returned nothing.',
    summaryEl:
      'Ακόμα ένα πέρασμα στα φίλτρα Special του Captain Coverage. Λίγοι χαρακτήρες με ασυνήθιστη διατύπωση στο special τους έμεναν εκτός, ενώ μία καταχωρούνταν ακριβώς στο effect που το special της λέει ρητά ότι δεν αγγίζει. Το φίλτρο tap timing μετονομάστηκε κιόλας, γιατί οι παίκτες ψάχνουν «PERFECT» και το παλιό όνομα δεν έβγαζε τίποτα.',
    added: [],
    improved: [
      {
        en: 'The tap-timing filter is now called "Tap-Timing Requirement (PERFECT)", so searching for PERFECT actually finds it.',
        el: 'Το φίλτρο tap timing λέγεται πλέον «Tap-Timing Requirement (PERFECT)», ώστε η αναζήτηση για PERFECT να το βρίσκει.',
      },
    ],
    fixed: [
      {
        en: 'Characters who remove Damage Reduction from all enemies were missed by that filter and now show up.',
        el: 'Χαρακτήρες που αφαιρούν Damage Reduction από όλους τους εχθρούς έλειπαν από το φίλτρο και εμφανίζονται πια.',
      },
      {
        en: 'Saintess Gunko was listed under Threshold Damage Reduction removal, the one effect her special explicitly leaves alone. She is now under the effect she really removes.',
        el: 'Η Saintess Gunko εμφανιζόταν στην αφαίρεση Threshold Damage Reduction, το μοναδικό effect που το special της ρητά δεν πειράζει. Τώρα βρίσκεται στο effect που όντως αφαιρεί.',
      },
      {
        en: "Bobbin's special cures two debuffs in one sentence; the ATK DOWN half was being ignored and is now matched.",
        el: 'Το special του Bobbin καθαρίζει δύο debuffs σε μία πρόταση· το κομμάτι του ATK DOWN αγνοούνταν και πλέον αναγνωρίζεται.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.93',
    date: '2026-07-17',
    userVisible: true,
    headline: {
      en: 'Searching "Color Affinity" finds it now',
      el: 'Η αναζήτηση «Color Affinity» βρίσκει πλέον αποτέλεσμα',
    },
    summaryEn:
      'The buff the game normally calls Color Affinity was only listed as "Boost Type Effects", so typing color affinity in the ability filter returned nothing at all — even though 426 characters have it. It is now shown as Boost Type Effects (Color Affinity) and turns up under either name.',
    summaryEl:
      'Το buff που το παιχνίδι το λέει συνήθως Color Affinity ήταν καταχωρημένο μόνο ως «Boost Type Effects», οπότε αν έγραφες color affinity στο φίλτρο των abilities δεν έβγαινε τίποτα — παρότι το έχουν 426 χαρακτήρες. Πλέον εμφανίζεται ως Boost Type Effects (Color Affinity) και το βρίσκεις και με τα δύο ονόματα.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'The Color Affinity buff is findable by the name players actually use',
        el: 'Το buff Color Affinity βρίσκεται πλέον με το όνομα που χρησιμοποιούν οι παίκτες',
      },
    ],
  },
  {
    version: '0.0.92',
    date: '2026-07-17',
    userVisible: true,
    headline: {
      en: 'Special filters tell the truth about cures',
      el: 'Τα φίλτρα special λένε την αλήθεια για τα cures',
    },
    summaryEn:
      'A pass over 23 special-ability filters found that a lot of specials were being described wrongly. Cures that last a few turns were shown as clearing a status permanently, maxed characters were listed with their level 1 turn counts, and one filter was so broken it found almost nobody. All of that is corrected, so what a special filter promises is what the special does.',
    summaryEl:
      'Ένα πέρασμα σε 23 φίλτρα special ικανοτήτων έδειξε ότι πολλά special περιγράφονταν λάθος. Cures που κρατούν λίγους γύρους εμφανίζονταν σαν να καθαρίζουν μόνιμα το status, οι maxed χαρακτήρες καταγράφονταν με τους γύρους του level 1, και ένα φίλτρο ήταν τόσο χαλασμένο που δεν έβρισκε σχεδόν κανέναν. Όλα αυτά διορθώθηκαν, ώστε αυτό που υπόσχεται ένα φίλτρο special να είναι αυτό που κάνει το special.',
    added: [],
    improved: [],
    fixed: [
      {
        en: '50 characters advertised a permanent status clear for what is really a cure lasting a set number of turns. Kalifa, for example, showed a permanent Paralysis clear while her real Poison clear was missing.',
        el: '50 χαρακτήρες διαφήμιζαν μόνιμο καθάρισμα status ενώ στην πραγματικότητα κάνουν cure για συγκεκριμένους γύρους. Η Kalifa, π.χ., έδειχνε μόνιμο καθάρισμα Paralysis ενώ το πραγματικό της Poison clear έλειπε.',
      },
      {
        en: 'Maxed characters showed their level 1 turn counts. Gladius cures Despair for 2 turns but was listed as 1; 144 entries across 75 characters are now right.',
        el: 'Οι maxed χαρακτήρες έδειχναν τους γύρους του level 1. Ο Gladius κάνει cure στο Despair για 2 γύρους ενώ γραφόταν 1· 144 εγγραφές σε 75 χαρακτήρες είναι πλέον σωστές.',
      },
      {
        en: 'The Chain multiplier boost filter matched only 2 characters out of 312, because those specials always add a decimal ("Adds 0.5x to Chain multiplier") and the decimal point broke the match. It finds them now.',
        el: 'Το φίλτρο για boost στον Chain multiplier έβρισκε μόλις 2 χαρακτήρες από 312, γιατί αυτά τα special προσθέτουν πάντα δεκαδικό («Adds 0.5x to Chain multiplier») και η τελεία χαλούσε το ταίριασμα. Τώρα τους βρίσκει.',
      },
    ],
  },
  {
    version: '0.0.91',
    date: '2026-07-17',
    headline: {
      en: 'Version marker, no app changes',
      el: 'Απλή σήμανση έκδοσης, χωρίς αλλαγές',
    },
    summaryEn:
      'This version carries no changes to the app. Nothing was added, removed or fixed for players.',
    summaryEl:
      'Αυτή η έκδοση δεν φέρνει καμία αλλαγή στην εφαρμογή. Δεν προστέθηκε, δεν αφαιρέθηκε και δεν διορθώθηκε τίποτα για τους παίκτες.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.90',
    date: '2026-07-16',
    headline: {
      en: 'Ability filters finally find the right units',
      el: 'Τα φίλτρα ικανοτήτων βρίσκουν επιτέλους τις σωστές μονάδες',
    },
    summaryEn:
      "A long sweep through how the app reads ability text, and the effect on filters is big. Several filters had been missing most of the characters that belong in them: end-of-turn damage went from 19 captains to 127, boost against Poisoned enemies from 7 to 53, and removing an enemy's Percent Damage Reduction from 99 characters to 347. Others were catching units that never belonged, like Chain Lock being counted as an orb lock. Filter results in Captain Coverage and Auto Team Builder now line up far better with what the abilities actually say.",
    summaryEl:
      'Μια μεγάλη σάρωση στο πώς διαβάζει η εφαρμογή τα κείμενα των ικανοτήτων, με μεγάλη διαφορά στα φίλτρα. Αρκετά φίλτρα έχαναν τους περισσότερους χαρακτήρες που τους ανήκουν: το end-of-turn damage πήγε από 19 captain σε 127, το boost εναντίον δηλητηριασμένων εχθρών από 7 σε 53 και η αφαίρεση του Percent Damage Reduction του εχθρού από 99 χαρακτήρες σε 347. Άλλα πάλι έπιαναν μονάδες που δεν είχαν καμία σχέση, όπως το Chain Lock που μετρούσε ως orb lock. Τα αποτελέσματα σε Captain Coverage και Auto Team Builder ταιριάζουν πλέον πολύ καλύτερα με αυτό που λένε πραγματικά οι ικανότητες.',
    added: [],
    improved: [
      {
        en: "Effects written only in a character's super special, or only in the special's top level, are now read too - so maxed units stop looking weaker than they are.",
        el: "Εφέ που γράφονται μόνο στο super special ή μόνο στο ανώτατο επίπεδο του special διαβάζονται πλέον κι αυτά, οπότε οι maxed μονάδες σταματούν να φαίνονται πιο αδύναμες απ' ό,τι είναι.",
      },
      {
        en: 'Far more characters now show up under end-of-turn damage, boost against Poisoned enemies, boost against delayed enemies and boost against DEF-reduced enemies.',
        el: 'Πολύ περισσότεροι χαρακτήρες εμφανίζονται πλέον σε end-of-turn damage, boost εναντίον δηλητηριασμένων, boost εναντίον καθυστερημένων και boost εναντίον εχθρών με μειωμένο DEF.',
      },
      {
        en: "Enemy Percent Damage Reduction removal is found wherever it appears in a special's list, not only when it happens to be listed second.",
        el: 'Η αφαίρεση Percent Damage Reduction του εχθρού βρίσκεται όπου κι αν εμφανίζεται μέσα στη λίστα ενός special, όχι μόνο όταν τύχει να είναι δεύτερη.',
      },
      {
        en: 'Durations written as a range, like "reduces duration by 1-5 turns", are now understood.',
        el: 'Διάρκειες γραμμένες ως εύρος, όπως «μειώνει τη διάρκεια κατά 1-5 turns», γίνονται πλέον κατανοητές.',
      },
    ],
    fixed: [
      {
        en: 'Chain Lock no longer counts as an orb lock, and locking orbs no longer counts as locking the chain multiplier.',
        el: 'Το Chain Lock δεν μετράει πια ως orb lock, και το κλείδωμα orbs δεν μετράει ως κλείδωμα του chain multiplier.',
      },
      {
        en: 'Characters that merely mention "Additional Damage" or "Base ATK Boost" are no longer listed as granting it.',
        el: 'Χαρακτήρες που απλώς αναφέρουν «Additional Damage» ή «Base ATK Boost» δεν εμφανίζονται πια ως να το δίνουν.',
      },
      {
        en: '"Nullifies Remove Beneficial Effects", which protects your own buffs, is no longer read as stripping the enemy\'s.',
        el: 'Το «Nullifies Remove Beneficial Effects», που προστατεύει τα δικά σου buff, δεν διαβάζεται πια ως αφαίρεση των buff του εχθρού.',
      },
      {
        en: 'Class Change is no longer confused with an "Advantageous Class" damage boost, and "changes both Classes" is now recognised.',
        el: 'Το Class Change δεν μπερδεύεται πια με boost «Advantageous Class», και το «changes both Classes» αναγνωρίζεται πλέον.',
      },
      {
        en: 'The Weaken filter now finds the units that actually inflict Weaken, and is spelled the way the game spells it.',
        el: 'Το φίλτρο Weaken βρίσκει πλέον τις μονάδες που όντως ρίχνουν Weaken, και γράφεται όπως το γράφει το παιχνίδι.',
      },
      {
        en: 'The chain multiplier minimum/maximum filter stopped matching "MAX HP" and Minimum-Chain ATK Down.',
        el: 'Το φίλτρο ελάχιστου/μέγιστου chain multiplier σταμάτησε να πιάνει το «MAX HP» και το Minimum-Chain ATK Down.',
      },
      {
        en: '"Fixed True Typeless damage" is now recognised as fixed damage.',
        el: 'Το «Fixed True Typeless damage» αναγνωρίζεται πλέον ως fixed damage.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.89',
    date: '2026-07-14',
    userVisible: true,
    headline: {
      en: 'Poison filter stops listing the wrong Captains',
      el: 'Το φίλτρο Poison σταματά να δείχνει λάθος Captains',
    },
    summaryEn:
      'Searching for characters that poison enemies was handing back seven captains that poison nothing at all — Luffy VS Kaido, Master Caesar, Caesar, Hancock and Reiju only let poison from somewhere else get past enemy Debuff Protection. They are gone, and so are matches where the text was really about removing Poison or hitting enemies that are already poisoned. The filter now lists 4 genuine poison captains instead of 11 — Magellan and Reiju — and 64 characters overall instead of 77.',
    summaryEl:
      'Η αναζήτηση για χαρακτήρες που ρίχνουν Poison στους εχθρούς έβγαζε επτά captains που δεν ρίχνουν τίποτα — οι Luffy VS Kaido, Master Caesar, Caesar, Hancock και Reiju απλώς αφήνουν poison από αλλού να περάσει το Debuff Protection του εχθρού. Έφυγαν, μαζί με τα matches όπου το κείμενο μιλούσε στην πραγματικότητα για αφαίρεση Poison ή για χτύπημα σε ήδη δηλητηριασμένους εχθρούς. Το φίλτρο δείχνει τώρα 4 πραγματικούς poison captains αντί για 11 — Magellan και Reiju — και 64 χαρακτήρες συνολικά αντί για 77.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Captains that only let poison bypass enemy immunity no longer appear as characters that poison enemies',
        el: 'Οι captains που απλώς αφήνουν το poison να περάσει το immunity του εχθρού δεν εμφανίζονται πια σαν χαρακτήρες που ρίχνουν Poison',
      },
      {
        en: 'Abilities that remove Poison, or that boost damage against already poisoned enemies, no longer count as inflicting it',
        el: 'Τα abilities που αφαιρούν Poison, ή που ανεβάζουν damage σε ήδη δηλητηριασμένους εχθρούς, δεν μετράνε πια σαν να το ρίχνουν',
      },
    ],
  },
  {
    version: '0.0.88',
    date: '2026-07-14',
    headline: {
      en: 'Delayed-effect filter drops two wrong matches',
      el: 'Το φίλτρο delayed effect χωρίς δύο λάθος αποτελέσματα',
    },
    summaryEn:
      'The filter for effects that fire on a later turn was also catching characters whose ATK simply climbs each turn up to a cap "after 20 turns" — Elizabello II is the clear case, where nothing actually launches on turn 20 and the boost is already running from turn one. Those two entries no longer appear, so the filter shows only genuinely delayed effects.',
    summaryEl:
      'Το φίλτρο για effects που ενεργοποιούνται σε επόμενο γύρο έπιανε και χαρακτήρες που απλώς ανεβάζουν ATK κάθε γύρο μέχρι ένα ταβάνι «μετά από 20 γύρους» — χαρακτηριστική περίπτωση ο Elizabello II, όπου τίποτα δεν ενεργοποιείται στον 20ό γύρο και το boost δουλεύει ήδη από τον πρώτο. Αυτές οι δύο καταχωρήσεις δεν εμφανίζονται πια, οπότε το φίλτρο δείχνει μόνο πραγματικά καθυστερημένα effects.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Characters whose ATK only ramps up to a cap after a number of turns no longer show in the delayed-effect filter.',
        el: 'Χαρακτήρες που απλώς ανεβάζουν ATK μέχρι ένα ταβάνι μετά από κάποιους γύρους δεν εμφανίζονται πλέον στο φίλτρο delayed effect.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.87',
    date: '2026-07-14',
    headline: {
      en: 'Resistance-down filter finds more specials',
      el: 'Το φίλτρο Resistance-down βρίσκει περισσότερα specials',
    },
    summaryEn:
      "Some specials describe lowering an enemy's Type or Class Resistance with wording the filter did not recognise, so those characters were missing from the results. That wording is now understood, and characters like Caesar & Monet show up when you filter for a resistance-down effect. Nothing that was already listed changed.",
    summaryEl:
      'Κάποια specials περιγράφουν τη μείωση του Type ή Class Resistance ενός εχθρού με διατύπωση που το φίλτρο δεν αναγνώριζε, οπότε αυτοί οι χαρακτήρες έλειπαν από τα αποτελέσματα. Τώρα η διατύπωση αναγνωρίζεται και χαρακτήρες όπως ο Caesar & Monet εμφανίζονται όταν φιλτράρεις για resistance-down. Ό,τι έβγαινε ήδη παραμένει ίδιο.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Specials that lower enemy Type or Class Resistance are now picked up whatever wording the game uses for them.',
        el: 'Τα specials που ρίχνουν το Type ή Class Resistance των εχθρών πιάνονται πλέον όποια διατύπωση κι αν χρησιμοποιεί το παιχνίδι.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.86',
    date: '2026-07-14',
    headline: {
      en: 'ATK Down cures no longer over-counted',
      el: 'Πιο σωστά αποτελέσματα στα cure για ATK Down',
    },
    summaryEn:
      'Minimum-Chain ATK Down and Maximum-Chain ATK Down are separate debuffs from plain ATK Down, and a character that only clears the chain version will not save you from the plain one. Five Captains — the Ace and Burgess variants and Sanji & Reiju — used to show up when you filtered for ATK Down removal even though they only cure the chain variant. They no longer appear there, so the list you get is the list that will actually work in the fight.',
    summaryEl:
      'Το Minimum-Chain ATK Down και το Maximum-Chain ATK Down είναι ξεχωριστά debuff από το σκέτο ATK Down, και όποιος καθαρίζει μόνο την chain εκδοχή δεν σε σώζει από το κανονικό. Πέντε Captains — οι εκδοχές του Ace και του Burgess και οι Sanji & Reiju — εμφανίζονταν όταν φιλτράριζες για αφαίρεση ATK Down, ενώ καθαρίζουν μόνο την chain εκδοχή. Δεν βγαίνουν πια εκεί, οπότε η λίστα που βλέπεις είναι αυτή που θα δουλέψει στη μάχη.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Characters that only clear Minimum-Chain or Maximum-Chain ATK Down no longer appear in the plain ATK Down cure filter',
        el: 'Οι χαρακτήρες που καθαρίζουν μόνο Minimum-Chain ή Maximum-Chain ATK Down δεν εμφανίζονται πια στο φίλτρο για σκέτο ATK Down',
      },
      {
        en: 'Characters who cure both keep showing up, so nothing genuinely useful was lost',
        el: 'Όσοι καθαρίζουν και τα δύο παραμένουν στη λίστα, οπότε δεν χάθηκε κάτι πραγματικά χρήσιμο',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.85',
    date: '2026-07-14',
    headline: {
      en: 'Typeless damage specials are found correctly',
      el: 'Τα specials με typeless damage βρίσκονται σωστά',
    },
    summaryEn:
      'Looking for characters that deal "Other" (typeless) damage — the kind that hits every colour for the same amount — was missing everyone whose text adds True or Fixed in the middle, like "Typeless True damage" or "Typeless Fixed True damage". That was 94 characters, including Kizaru, Whitebeard and Cat Viper. They now appear. Plain True damage stays out of this filter on purpose: it ignores enemy DEF but still follows the colour matchup, so it is a different thing.',
    summaryEl:
      'Η αναζήτηση για χαρακτήρες με «Other» (typeless) damage — αυτό που χτυπάει το ίδιο σε κάθε χρώμα — έχανε όσους έχουν True ή Fixed ανάμεσα στις λέξεις, όπως «Typeless True damage» ή «Typeless Fixed True damage». Ήταν 94 χαρακτήρες, μεταξύ τους Kizaru, Whitebeard και Cat Viper. Πλέον εμφανίζονται κανονικά. Το σκέτο True damage μένει επίτηδες εκτός αυτού του φίλτρου: αγνοεί το DEF του εχθρού αλλά εξακολουθεί να ακολουθεί το matchup των χρωμάτων, οπότε είναι άλλο πράγμα.',
    added: [],
    improved: [],
    fixed: [
      {
        en: '94 characters with "Typeless True" or "Typeless Fixed True" damage now appear under the typeless damage filter.',
        el: '94 χαρακτήρες με «Typeless True» ή «Typeless Fixed True» damage εμφανίζονται πλέον στο φίλτρο typeless damage.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.84',
    date: '2026-07-14',
    headline: {
      en: 'Orb Effects filter now means Orb Effects',
      el: 'Το φίλτρο Orb Effects σημαίνει πλέον Orb Effects',
    },
    summaryEn:
      'Asking for captains that boost Orb Effects gave back 29 characters, but only 3 of them actually do it. The rest were captains that boost orb drop chances, make orbs beneficial, or work with Orb Amplification — different mechanics that happened to mention orbs. The filter now returns only the real Orb Effects boosters.',
    summaryEl:
      "Ζητώντας captains που ενισχύουν τα Orb Effects έπαιρνες 29 χαρακτήρες, ενώ μόνο οι 3 το κάνουν στ' αλήθεια. Οι υπόλοιποι ανέβαζαν την πιθανότητα για orbs, έκαναν τα orbs beneficial ή δούλευαν με Orb Amplification — άλλοι μηχανισμοί που απλώς ανέφεραν orbs. Πλέον το φίλτρο επιστρέφει μόνο τους πραγματικούς.",
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Captain Coverage: the Orb Effects boost filter dropped from 29 results to the 3 captains that genuinely grant it (Lucci & Kaku, Nami & Sanji, Vasco Shot)',
        el: 'Captain Coverage: το φίλτρο για boost σε Orb Effects πέρασε από 29 αποτελέσματα στους 3 captains που το δίνουν πραγματικά (Lucci & Kaku, Nami & Sanji, Vasco Shot)',
      },
      {
        en: 'Captains that only raise orb drop chances or make orbs beneficial, like Shanks, Rayleigh, Eneru and Jinbe, are no longer mixed in',
        el: 'Captains που απλώς ανεβάζουν την πιθανότητα για orbs ή τα κάνουν beneficial, όπως ο Shanks, ο Rayleigh, ο Eneru και ο Jinbe, δεν μπερδεύονται πια μέσα',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.83',
    date: '2026-07-14',
    userVisible: true,
    headline: {
      en: 'Percent damage keeps up with new wording',
      el: 'Το Percent Damage πιάνει και τη νέα διατύπωση',
    },
    summaryEn:
      'Some characters now describe their percent-HP damage as "reduces enemies\' HP by N%" rather than the older phrasing, and those were about to fall out of the Percent Damage filter the next time the game data refreshed. The filter recognises both wordings now, so units like Law - Finger-Controlled Boulder stay in the list. Specials that cost you your own HP are still correctly kept out of it.',
    summaryEl:
      'Κάποιοι χαρακτήρες περιγράφουν πλέον το percent-HP damage τους ως "reduces enemies\' HP by N%" αντί για την παλιότερη διατύπωση, και ήταν έτοιμοι να πέσουν έξω από το φίλτρο Percent Damage στην επόμενη ανανέωση δεδομένων. Το φίλτρο αναγνωρίζει τώρα και τις δύο διατυπώσεις, οπότε χαρακτήρες όπως ο Law - Finger-Controlled Boulder μένουν στη λίστα. Τα specials που σου κοστίζουν δικό σου HP σωστά εξακολουθούν να μην μπαίνουν εκεί.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Characters whose text says "reduces enemies\' HP by a percentage" keep their Percent Damage tag instead of silently disappearing from the filter',
        el: 'Χαρακτήρες που γράφουν "reduces enemies\' HP by a percentage" κρατάνε το tag Percent Damage αντί να εξαφανίζονται αθόρυβα από το φίλτρο',
      },
    ],
  },
  {
    version: '0.0.82',
    date: '2026-07-14',
    headline: {
      en: 'Defeat Enemy filter finds real executes only',
      el: 'Το Defeat Enemy βρίσκει μόνο πραγματικά execute',
    },
    summaryEn:
      'The Defeat Enemy filter had been lumping three unrelated things together: the genuine instant-KO effect, captains that merely gain ATK after you defeat an enemy, and characters that protect your crew from being defeated. It now matches only the real "instantly defeats" wording, so 34 captains that never had an execute have left that list.',
    summaryEl:
      'Το φίλτρο Defeat Enemy έβαζε στο ίδιο τσουβάλι τρία άσχετα πράγματα: το γνήσιο instant-KO, captains που απλώς παίρνουν ATK αφού νικήσεις έναν εχθρό, και χαρακτήρες που προστατεύουν την ομάδα από ήττα. Πλέον πιάνει μόνο το πραγματικό «instantly defeats», οπότε 34 captains που δεν είχαν ποτέ execute έφυγαν από αυτή τη λίστα.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Captains whose ability only stacks ATK after a defeated enemy no longer appear under Defeat Enemy.',
        el: 'Captains που απλώς μαζεύουν ATK αφού πέσει ένας εχθρός δεν εμφανίζονται πια στο Defeat Enemy.',
      },
      {
        en: 'Loss Prevention characters — the ones that stop your crew from being defeated — are no longer counted as the opposite effect.',
        el: 'Οι χαρακτήρες Loss Prevention — αυτοί που εμποδίζουν την ήττα της ομάδας σου — δεν μετράνε πια ως το αντίθετο εφέ.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.81',
    date: '2026-07-14',
    headline: {
      en: 'PERFECT filter now finds 193 Captains',
      el: 'Το φίλτρο PERFECT βρίσκει πια 193 Captains',
    },
    summaryEn:
      'The Captain Coverage filter for Captains whose boost depends on PERFECT tap timing was only catching the ones whose text literally said "PERFECT hits". Captains that ask for the third PERFECT in a row, or that keep the boost until your first non-PERFECT hit, or that reward each PERFECT you land, were all missing from the list. The filter now returns 193 Captains instead of 38.',
    summaryEl:
      'Το φίλτρο του Captain Coverage για Captains που το boost τους εξαρτάται από PERFECT tap timing έπιανε μόνο όσους έγραφαν κατά λέξη «PERFECT hits». Captains που ζητούν το τρίτο συνεχόμενο PERFECT, ή που κρατούν το boost μέχρι το πρώτο χτύπημα που δεν είναι PERFECT, ή που ανταμείβουν κάθε PERFECT, έλειπαν όλοι από τη λίστα. Πλέον το φίλτρο επιστρέφει 193 Captains αντί για 38.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'The PERFECT tap-timing filter now finds every Captain whose boost is gated on PERFECT hits, however the ability is worded — 193 Captains instead of 38.',
        el: 'Το φίλτρο PERFECT tap timing βρίσκει πλέον κάθε Captain που το boost του απαιτεί PERFECT, όπως κι αν είναι διατυπωμένο — 193 Captains αντί για 38.',
      },
      {
        en: 'The same fix reaches specials, which now match 149 characters instead of 139.',
        el: 'Η ίδια διόρθωση φτάνει και στα specials, που πιάνουν πια 149 χαρακτήρες αντί για 139.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.80',
    date: '2026-07-13',
    userVisible: true,
    headline: {
      en: 'Bind-curing Captains show up again',
      el: 'Ξαναβρίσκονται οι Captains που καθαρίζουν Bind',
    },
    summaryEn:
      'Captains whose ability removes Bind duration "completely" were not being tagged as Bind removers, so filtering for that effect never returned them. Four of them — Kizaru, both S-Shark versions and RRG — are now recognised, and enemy Percent Damage Reduction removals written the same way are picked up too.',
    summaryEl:
      'Οι Captains που το ability τους αφαιρεί το Bind duration «completely» δεν καταγράφονταν ως Bind removers, οπότε το φίλτρο για αυτό το effect δεν τους έβρισκε ποτέ. Τέσσερις από αυτούς — ο Kizaru, και οι δύο εκδοχές του S-Shark και ο RRG — αναγνωρίζονται πλέον, ενώ πιάνονται και οι αφαιρέσεις Percent Damage Reduction του εχθρού που είναι γραμμένες με τον ίδιο τρόπο.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Filtering for Bind removal now returns 4 more Captains that were being missed',
        el: 'Το φίλτρο για αφαίρεση Bind επιστρέφει πλέον 4 Captains ακόμη που έλειπαν',
      },
      {
        en: 'Captains that remove the enemy\'s Percent Damage Reduction "completely" are matched too',
        el: 'Πιάνονται και οι Captains που αφαιρούν «completely» το Percent Damage Reduction του εχθρού',
      },
    ],
  },
  {
    version: '0.0.79',
    date: '2026-07-13',
    userVisible: true,
    headline: {
      en: 'Color Affinity captains, only the real ones',
      el: 'Captain με Color Affinity, μόνο οι πραγματικοί',
    },
    summaryEn:
      'Filtering for captains that grant Color Affinity or Type Effects used to return far too many. Of the 56 captains it listed, only 25 actually hand you the buff. The other 31 merely mention it — they extend its duration, boost its effect, convert it, or require you to already have one — and they no longer show up under that filter.',
    summaryEl:
      "Το φίλτρο για Captain που δίνουν Color Affinity ή Type Effects έβγαζε πολύ περισσότερους απ' όσους έπρεπε. Από τους 56 που εμφάνιζε, μόνο οι 25 σου δίνουν όντως το buff. Οι υπόλοιποι 31 απλώς το αναφέρουν — επεκτείνουν τη διάρκειά του, ενισχύουν το εφέ του, το μετατρέπουν ή απαιτούν να το έχεις ήδη — και δεν εμφανίζονται πλέον σε αυτό το φίλτρο.",
    added: [],
    improved: [],
    fixed: [
      {
        en: 'The Color Affinity / Type Effects captain filter went from 56 matches down to the 25 captains that genuinely grant the buff.',
        el: 'Το φίλτρο Captain για Color Affinity / Type Effects έπεσε από 56 αποτελέσματα στους 25 Captain που πραγματικά δίνουν το buff.',
      },
      {
        en: 'Captains that only boost or lengthen an existing Color Affinity buff, such as Vegapunk Shaka, are no longer counted as granting one.',
        el: 'Οι Captain που απλώς ενισχύουν ή παρατείνουν ένα υπάρχον Color Affinity buff, όπως ο Vegapunk Shaka, δεν μετρούν πλέον σαν να το δίνουν.',
      },
    ],
  },
  {
    version: '0.0.78',
    date: '2026-07-13',
    headline: {
      en: 'Chain Multiplier Growth Rate filter corrected',
      el: 'Διόρθωση στο φίλτρο Chain Multiplier Growth Rate',
    },
    summaryEn:
      'Mostly routine internal updates. The one thing you will notice is on captain filtering: looking for captains that boost Chain Multiplier Growth Rate no longer returns two units that do not actually grant it — they only extend or amplify a growth-rate buff someone else gave you. Their specials are unaffected and still match as before.',
    summaryEl:
      'Κυρίως εσωτερικές ενημερώσεις ρουτίνας. Το ένα πράγμα που θα προσέξεις αφορά το φιλτράρισμα των captains: όταν ψάχνεις captains που δίνουν boost στο Chain Multiplier Growth Rate, δεν σου βγαίνουν πια δύο units που στην ουσία δεν το δίνουν — απλώς επεκτείνουν ή ενισχύουν ένα growth-rate buff που σου έδωσε κάποιος άλλος. Τα specials τους δεν επηρεάζονται και εξακολουθούν να ταιριάζουν κανονικά.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'The Chain Multiplier Growth Rate captain filter now lists only captains that genuinely grant it, not units that merely extend or amplify an existing buff',
        el: 'Το φίλτρο captain για Chain Multiplier Growth Rate δείχνει πλέον μόνο captains που το δίνουν πραγματικά, όχι units που απλώς επεκτείνουν ή ενισχύουν ένα υπάρχον buff',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.77',
    date: '2026-07-11',
    headline: {
      en: 'One captain no longer an orb changer',
      el: 'Ένας captain δεν είναι πια orb changer',
    },
    summaryEn:
      "A small correction to how Captain Abilities are read. Kaido & Big Mom's captain ability talks about changing an orb's multiplier, not its type, but the app was reading it as an orb change and listing the unit among orb-changing captains. It no longer does; the other 65 orb-changing captains are unaffected. The rest of this release was test maintenance with nothing to see.",
    summaryEl:
      'Μια μικρή διόρθωση στο πώς διαβάζονται τα Captain Abilities. Το captain ability των Kaido & Big Mom μιλάει για αλλαγή στο Orb Multiplier, όχι στον τύπο του orb, αλλά η εφαρμογή το διάβαζε ως αλλαγή orb και έβγαζε τη μονάδα ανάμεσα στους captain που αλλάζουν orbs. Πλέον όχι, ενώ οι υπόλοιποι 65 τέτοιοι captain μένουν ως έχουν. Τα υπόλοιπα της έκδοσης ήταν συντήρηση tests, χωρίς κάτι ορατό.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Kaido & Big Mom no longer show up when you filter for captains that change orbs.',
        el: 'Οι Kaido & Big Mom δεν εμφανίζονται πια όταν φιλτράρεις για captain που αλλάζουν orbs.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.76',
    date: '2026-07-11',
    userVisible: true,
    headline: {
      en: 'A missing Paralysis-reduction Captain found',
      el: 'Βρέθηκε ένας Captain που έλειπε από το Paralysis reduction',
    },
    summaryEn:
      'One captain was quietly missing from two ability searches. Luffy & Whitebeard\'s ability is written "reduces Paralysis and Despair duration 1 turn", without the usual "by", and the filter did not recognise that wording, so he never appeared. He does now: Paralysis-duration captains go from 63 to 64 and Despair-duration captains from 67 to 68. Nothing that already matched has changed.',
    summaryEl:
      'Ένας captain έλειπε αθόρυβα από δύο αναζητήσεις ability. Το ability του Luffy & Whitebeard γράφει "reduces Paralysis and Despair duration 1 turn", χωρίς το συνηθισμένο "by", και το φίλτρο δεν αναγνώριζε αυτή τη διατύπωση, οπότε δεν εμφανιζόταν ποτέ. Τώρα εμφανίζεται: οι captains για Paralysis duration πάνε από 63 σε 64 και για Despair duration από 67 σε 68. Ό,τι έβγαινε ήδη σωστά έμεινε ίδιο.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Luffy & Whitebeard now shows up under Paralysis and Despair duration reduction — the wording of his ability was slipping past the filter',
        el: 'Ο Luffy & Whitebeard εμφανίζεται πλέον στο Paralysis και Despair duration reduction — η διατύπωση του ability του ξέφευγε από το φίλτρο',
      },
    ],
  },
  {
    version: '0.0.75',
    date: '2026-07-11',
    headline: {
      en: 'Despair filters stop catching Sailor Despair',
      el: 'Τα φίλτρα Despair δεν πιάνουν πια Sailor Despair',
    },
    summaryEn:
      'Filtering for characters that remove Despair also returned characters that only shorten Sailor Despair — a completely different debuff that disables a sailor ability rather than the Captain Ability. The two are now kept apart. The Despair filter gives a slightly shorter but correct list (Zoro & Sanji and Basil Hawkins drop out, for example), and the separate Sailor Despair filter is untouched.',
    summaryEl:
      'Το φίλτρο για χαρακτήρες που καθαρίζουν Despair έβγαζε και χαρακτήρες που απλώς μειώνουν το Sailor Despair — ένα εντελώς άλλο debuff, που κλειδώνει τη sailor ability και όχι την Captain Ability. Τα δύο ξεχωρίζουν πλέον. Το φίλτρο Despair δίνει λίγο μικρότερη αλλά σωστή λίστα (φεύγουν π.χ. οι Zoro & Sanji και ο Basil Hawkins), ενώ το ξεχωριστό φίλτρο Sailor Despair μένει ως έχει.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Despair-removal filters no longer list characters whose text only reduces Sailor Despair.',
        el: 'Τα φίλτρα αφαίρεσης Despair δεν δείχνουν πια χαρακτήρες που το κείμενό τους μειώνει μόνο Sailor Despair.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.74',
    date: '2026-07-11',
    headline: {
      en: 'Chain Multiplier filter stops listing wrong characters',
      el: 'Το φίλτρο Chain Multiplier σταματάει τα λάθη',
    },
    summaryEn:
      'Filtering for a Chain Multiplier boost used to pull in 143 characters that do not actually have it: 63 whose Captain Ability boosts the chain multiplier growth rate, and 40 that only boost ATK at the start of the chain. Those are different effects and they no longer show up under this filter. The filter now matches only wording that really says the chain multiplier is boosted, which in the current data means it comes back empty instead of misleading you.',
    summaryEl:
      'Όταν φιλτράριζες για boost στο Chain Multiplier, έβγαιναν 143 χαρακτήρες που στην πραγματικότητα δεν το έχουν: 63 που η Captain Ability τους ανεβάζει το chain multiplier growth rate και 40 που απλώς ανεβάζουν ATK στην αρχή του chain. Είναι άλλα effects και δεν εμφανίζονται πια σε αυτό το φίλτρο. Πλέον πιάνει μόνο κείμενα που όντως λένε ότι ανεβαίνει το chain multiplier, που με τα σημερινά δεδομένα σημαίνει ότι γυρίζει άδειο αντί να σε παραπλανά.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'The Chain Multiplier boost filter no longer returns 143 characters that only boost the chain multiplier growth rate or ATK at the start of the chain.',
        el: 'Το φίλτρο για boost στο Chain Multiplier δεν γυρίζει πια 143 χαρακτήρες που απλώς ανεβάζουν το chain multiplier growth rate ή το ATK στην αρχή του chain.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.73',
    date: '2026-07-11',
    headline: {
      en: 'Special damage filter stops showing defensive captains',
      el: 'Το φίλτρο special damage δεν δείχνει πια αμυντικούς captains',
    },
    summaryEn:
      'When you filtered for Captains whose special deals damage, fifteen Captains turned up that do the exact opposite: they reduce the damage your crew takes from BOMB orbs. Eustass Kid, Franky, Vegapunk, S-Bear, S-Shark and the rest are out of that filter now. At the same time, nine genuine damage specials whose multiplier has a decimal point were being skipped, and they appear again.',
    summaryEl:
      'Όταν φιλτράριζες Captains με special που κάνει damage, εμφανίζονταν δεκαπέντε Captains που κάνουν ακριβώς το αντίθετο: μειώνουν το damage που τρώει το crew σου από BOMB orbs. Ο Eustass Kid, ο Franky, ο Vegapunk, ο S-Bear, ο S-Shark και οι υπόλοιποι έφυγαν από αυτό το φίλτρο. Παράλληλα, εννιά πραγματικά damage specials με δεκαδικό πολλαπλασιαστή τα προσπερνούσε το φίλτρο, και ξαναεμφανίζονται.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Captains who only cut the damage your crew takes from BOMB and SUPERBOMB orbs no longer count as damage-dealing specials',
        el: 'Οι Captains που απλώς μειώνουν το damage που τρώει το crew σου από BOMB και SUPERBOMB orbs δεν μετράνε πια ως specials που κάνουν damage',
      },
      {
        en: 'Specials whose damage multiplier is written with a decimal (like 1.5x) are found by the filter again',
        el: 'Τα specials με δεκαδικό πολλαπλασιαστή damage (π.χ. 1.5x) ξαναβρίσκονται από το φίλτρο',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.72',
    date: '2026-07-11',
    headline: {
      en: 'Healer Captains show up in the filters again',
      el: 'Οι healer Captains ξαναεμφανίζονται στα φίλτρα',
    },
    summaryEn:
      'Filtering for Captains that heal was quietly missing most of them. Any Captain whose text is written with a decimal — "recovers 1.5x character\'s RCV in HP at the end of each turn" — was skipped, which took out around 27 of the best-known healers, including Marco, Rayleigh, Shanks, Big Mom, Magellan and Cavendish. They are all matched now, and the older wording that says "health" instead of "HP" is recognised too. Captains found for end-of-turn healing went from 315 to 342.',
    summaryEl:
      "Το φίλτρο για Captains που κάνουν heal έχανε σιωπηλά τους περισσότερους. Όποιος Captain είχε δεκαδικό στο κείμενό του — «recovers 1.5x character's RCV in HP at the end of each turn» — απλώς προσπερνιόταν, κάτι που έκοβε περίπου 27 από τους πιο γνωστούς healers, ανάμεσά τους Marco, Rayleigh, Shanks, Big Mom, Magellan και Cavendish. Τώρα βρίσκονται όλοι, ενώ αναγνωρίζεται και η παλιότερη διατύπωση με «health» αντί για «HP». Οι Captains που βρίσκονται για heal στο τέλος του γύρου πήγαν από 315 σε 342.",
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Captains whose healing is written with a decimal multiplier (1.5x RCV) are found again — about 27 well-known healers were missing from the results.',
        el: 'Οι Captains που το heal τους γράφεται με δεκαδικό πολλαπλασιαστή (1.5x RCV) βρίσκονται ξανά — περίπου 27 γνωστοί healers έλειπαν από τα αποτελέσματα.',
      },
      {
        en: 'The older "recovers a small amount of health" wording counts as healing too.',
        el: 'Και η παλιότερη διατύπωση «recovers a small amount of health» μετράει πλέον ως heal.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.71',
    date: '2026-07-11',
    headline: {
      en: 'Damage reduction captains listed correctly',
      el: 'Σωστή λίστα για captains που μειώνουν damage',
    },
    summaryEn:
      'Searching for captains that reduce the damage you take was returning characters that do the exact opposite. Glass cannons whose ability increases damage received, counter captains that deal back the damage taken, and healers that recover a share of the damage taken were all being counted as damage reducers. Now only captains that genuinely reduce incoming damage come back.',
    summaryEl:
      'Η αναζήτηση για captains που μειώνουν το damage που τρως έβγαζε χαρακτήρες που κάνουν ακριβώς το αντίθετο. Glass cannons που αυξάνουν το damage received, counter captains που επιστρέφουν το damage, και healers που γιατρεύουν μέρος του damage μετρούσαν όλοι ως μείωση damage. Πλέον επιστρέφουν μόνο όσοι πραγματικά μειώνουν το damage που δέχεσαι.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Captain Coverage: the damage reduction filter no longer shows glass-cannon captains like Dellinger and Blackbeard, whose ability actually increases the damage you take',
        el: 'Captain Coverage: το φίλτρο μείωσης damage δεν δείχνει πια glass-cannon captains όπως ο Dellinger και ο Blackbeard, που στην πραγματικότητα αυξάνουν το damage που δέχεσαι',
      },
      {
        en: 'Counter captains such as Law and heal-from-damage captains such as Magellan are out of that filter too',
        el: 'Βγήκαν από το ίδιο φίλτρο και counter captains όπως ο Law, καθώς και όσοι γιατρεύουν με βάση το damage, όπως ο Magellan',
      },
      {
        en: 'The same mistake in the special filters is gone: 71 characters that appeared there wrongly no longer do',
        el: 'Το ίδιο λάθος διορθώθηκε και στα φίλτρα special: 71 χαρακτήρες που εμφανίζονταν λανθασμένα δεν εμφανίζονται πια',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.70',
    date: '2026-07-11',
    userVisible: true,
    headline: {
      en: 'Special cooldown filters tell the truth',
      el: 'Τα φίλτρα για το special cooldown λένε την αλήθεια',
    },
    summaryEn:
      'The Reduce Special Charge filter was picking up characters whose ability text only mentioned special cooldown in passing, so the list was longer than it should have been. It now matches only characters that genuinely cut special cooldown at the start of the fight, and about twenty wrongly-listed captains dropped out. There is also a new filter for the opposite family - characters that restore or advance special cooldown - and a misspelled filter label is fixed.',
    summaryEl:
      "Το φίλτρο Reduce Special Charge έπιανε και χαρακτήρες που απλώς ανέφεραν το special cooldown στο κείμενό τους, οπότε η λίστα ήταν μεγαλύτερη απ' ό,τι έπρεπε. Τώρα δείχνει μόνο χαρακτήρες που πραγματικά κόβουν special cooldown στην αρχή της μάχης, και έφυγαν περίπου είκοσι captains που δεν είχαν καμία δουλειά εκεί. Μπήκε επίσης ένα νέο φίλτρο για την αντίθετη κατηγορία, τους χαρακτήρες που επαναφέρουν ή προωθούν το special cooldown, και διορθώθηκε μια ορθογραφία σε ετικέτα φίλτρου.",
    added: [
      {
        en: 'New "Restore/Advance Special Cooldown" filter for characters that give special charge back or push it forward',
        el: 'Νέο φίλτρο "Restore/Advance Special Cooldown" για χαρακτήρες που επιστρέφουν ή προωθούν το special cooldown',
      },
    ],
    improved: [
      {
        en: 'Reduce Special Charge now lists only real holders - roughly twenty captains that only mentioned the words are gone',
        el: 'Το Reduce Special Charge δείχνει πλέον μόνο πραγματικούς κατόχους - έφυγαν περίπου είκοσι captains που απλώς ανέφεραν τις λέξεις',
      },
    ],
    fixed: [
      {
        en: 'The filter labels read "Reduce Special Charge" and "Reduce Ship Special Charge" instead of the misspelled "Change"',
        el: 'Οι ετικέτες των φίλτρων γράφουν πλέον "Reduce Special Charge" και "Reduce Ship Special Charge" αντί για το λανθασμένο "Change"',
      },
    ],
  },
  {
    version: '0.0.69',
    date: '2026-07-11',
    headline: {
      en: 'Character Tags filter on Captain Coverage',
      el: 'Φίλτρο Character Tags στο Captain Coverage',
    },
    summaryEn:
      'Captain Coverage results get a Character Tags filter, the same picker you know from Auto Team Builder: type to search, add as many tags as you like, and the list keeps everyone carrying at least one of them — so each tag you add widens the results rather than shrinking them. Two filters that had been quietly handing back wrong lists were repaired too.',
    summaryEl:
      'Τα αποτελέσματα στο Captain Coverage αποκτούν φίλτρο Character Tags, με τον ίδιο επιλογέα που ξέρεις από το Auto Team Builder: γράφεις για αναζήτηση, προσθέτεις όσα tags θέλεις, και η λίστα κρατάει όποιον έχει έστω ένα από αυτά — κάθε tag δηλαδή ανοίγει τη λίστα, δεν τη στενεύει. Διορθώθηκαν επίσης δύο φίλτρα που έβγαζαν σιωπηλά λάθος αποτελέσματα.',
    added: [
      {
        en: 'Character Tags filter on the Captain Coverage results, with search, suggestion chips and a Clear button.',
        el: 'Φίλτρο Character Tags στα αποτελέσματα του Captain Coverage, με αναζήτηση, προτεινόμενα chips και κουμπί καθαρισμού.',
      },
    ],
    improved: [],
    fixed: [
      {
        en: 'The "Remove SFX" special filter found nobody, because the data spells that effect "Blindness". It now returns 183 characters through specials, 123 through sailor abilities and 6 through support.',
        el: 'Το φίλτρο special «Remove SFX» δεν έβρισκε κανέναν, επειδή στα δεδομένα το εφέ γράφεται «Blindness». Τώρα επιστρέφει 183 χαρακτήρες από specials, 123 από sailor ικανότητες και 6 από support.',
      },
      {
        en: 'Captains who turn orbs favorable were missing from the lists — Snakeman, Kurozumi Orochi and Dr. Vegapunk among them, including the ones written with the [S. BOMB] orb.',
        el: 'Captains που κάνουν τα orbs ευνοϊκά έλειπαν από τις λίστες — ανάμεσά τους Snakeman, Kurozumi Orochi και Dr. Vegapunk, μαζί με όσους γράφονται με το [S. BOMB] orb.',
      },
      {
        en: 'Abilities with a second condition ("if your crew has 5 [STR] characters") were being dropped entirely; they now count for Sanji, Jabra, Caesar and others.',
        el: 'Ικανότητες με δεύτερη προϋπόθεση («αν η ομάδα σου έχει 5 [STR] χαρακτήρες») χάνονταν εντελώς· τώρα μετράνε κανονικά για Sanji, Jabra, Caesar και άλλους.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.68',
    date: '2026-07-10',
    headline: {
      en: 'Housekeeping release, nothing visible',
      el: 'Έκδοση συντήρησης, χωρίς ορατή αλλαγή',
    },
    summaryEn:
      'This release carried no changes you can see or use in the app. It exists only to move the version number forward.',
    summaryEl:
      'Αυτή η έκδοση δεν έφερε καμία αλλαγή που να τη δεις ή να τη χρησιμοποιήσεις μέσα στην εφαρμογή. Βγήκε μόνο για να προχωρήσει η αρίθμηση των εκδόσεων.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.67',
    date: '2026-07-08',
    userVisible: true,
    headline: {
      en: 'You get told when a new version is out',
      el: 'Ειδοποίηση όταν βγαίνει νέα έκδοση',
    },
    summaryEn:
      'A small banner now appears in the corner when a newer version of the app is ready. Update asks you to confirm, then installs it and reloads; Later hides the banner and brings it back after a while. On Android the same banner checks for a new release and takes you to its download page.',
    summaryEl:
      'Ένα μικρό banner εμφανίζεται πλέον στη γωνία όταν είναι έτοιμη νεότερη έκδοση της εφαρμογής. Το Update σου ζητάει επιβεβαίωση, μετά την εγκαθιστά και κάνει reload· το Later κρύβει το banner και το ξαναφέρνει αργότερα. Στο Android το ίδιο banner ελέγχει αν βγήκε νέα έκδοση και σε πάει στη σελίδα λήψης της.',
    added: [
      {
        en: 'New-version banner with Update and Later, on the web app and as a PWA',
        el: 'Banner νέας έκδοσης με Update και Later, στο web app και ως PWA',
      },
      {
        en: 'On Android the app checks for a newer release and opens its download page',
        el: 'Στο Android η εφαρμογή ελέγχει για νεότερη έκδοση και ανοίγει τη σελίδα λήψης της',
      },
    ],
    improved: [],
    fixed: [],
  },
  {
    version: '0.0.66',
    date: '2026-07-08',
    userVisible: true,
    headline: {
      en: 'Sharing works even when copying fails',
      el: 'Το share δουλεύει ακόμη κι όταν αποτυγχάνει η αντιγραφή',
    },
    summaryEn:
      'Almost all of this release is maintenance work you will never see: release checks, speed measurements and safety nets around the automatic data updates. The one thing you will notice is on Saved Teams, where sharing no longer dead-ends if your browser refuses clipboard access.',
    summaryEl:
      'Σχεδόν όλη αυτή η έκδοση είναι δουλειά συντήρησης που δεν θα δεις ποτέ: έλεγχοι έκδοσης, μετρήσεις ταχύτητας και δικλείδες γύρω από τις αυτόματες ενημερώσεις δεδομένων. Το μόνο που θα προσέξεις είναι στις Αποθηκευμένες ομάδες, όπου το share δεν κολλάει πια αν ο browser σου δεν επιτρέπει πρόσβαση στο πρόχειρο.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'When the browser blocks copying, Saved Teams now shows the share link and code on screen so you can select them by hand, and says exactly why the copy failed.',
        el: 'Όταν ο browser μπλοκάρει την αντιγραφή, οι Αποθηκευμένες ομάδες δείχνουν πλέον το share link και τον κωδικό στην οθόνη για να τα επιλέξεις με το χέρι, και σου λένε ακριβώς γιατί απέτυχε η αντιγραφή.',
      },
      {
        en: "On phones, sharing a team can go through the phone's own share sheet.",
        el: 'Στα κινητά, το μοίρασμα μιας ομάδας μπορεί να γίνει μέσω του κανονικού share της συσκευής.',
      },
    ],
  },
  {
    version: '0.0.65',
    date: '2026-07-04',
    headline: {
      en: 'Clear storage warnings, tidier Greek',
      el: 'Ξεκάθαρα μηνύματα αποθήκευσης, καλύτερα ελληνικά',
    },
    summaryEn:
      'Most of this release was behind-the-scenes checks and documentation. What you can actually see: when your browser is full or refuses to store anything, saving a team or a comparison now says so plainly and tells you what to do about it, instead of quietly failing. The Greek wording in the builders and Saved Teams was also tidied up so the same thing is called the same thing everywhere.',
    summaryEl:
      'Το μεγαλύτερο μέρος αυτής της έκδοσης ήταν έλεγχοι και τεκμηρίωση στο παρασκήνιο. Αυτό που θα δεις όντως: όταν ο browser σου είναι γεμάτος ή δεν επιτρέπει αποθήκευση, η αποθήκευση μιας ομάδας ή μιας σύγκρισης το λέει καθαρά και σου εξηγεί τι να κάνεις, αντί να αποτυγχάνει σιωπηλά. Επίσης τακτοποιήθηκαν τα ελληνικά στους builders και στα Saved Teams, ώστε το ίδιο πράγμα να λέγεται παντού με τον ίδιο τρόπο.',
    added: [],
    improved: [
      {
        en: "Greek wording in the Auto and Manual Team Builder and in Saved Teams now reads consistently, with the game's own terms kept as players say them",
        el: 'Τα ελληνικά στον Auto και τον Manual Team Builder και στα Saved Teams είναι πλέον συνεπή, κρατώντας τους όρους του παιχνιδιού όπως τους λένε οι παίκτες',
      },
    ],
    fixed: [
      {
        en: 'When browser storage is full or blocked, saving teams or a comparison draft now shows a clear message and a way out instead of failing silently',
        el: 'Όταν ο αποθηκευτικός χώρος του browser είναι γεμάτος ή κλειστός, η αποθήκευση ομάδων ή πρόχειρης σύγκρισης δείχνει πλέον καθαρό μήνυμα και λύση, αντί να αποτυγχάνει σιωπηλά',
      },
      {
        en: 'A damaged comparison draft is now cleared with a notice, instead of leaving the compare panel in a broken state',
        el: 'Μια χαλασμένη πρόχειρη σύγκριση καθαρίζεται πλέον με ειδοποίηση, αντί να αφήνει το panel σύγκρισης χαλασμένο',
      },
      {
        en: 'The reason chips on a picked character no longer say it was chosen for your filters or for being the newest unit when something else actually decided it',
        el: 'Τα chips εξήγησης σε έναν επιλεγμένο χαρακτήρα δεν λένε πια ότι μπήκε λόγω των φίλτρων σου ή επειδή είναι ο νεότερος, όταν στην πραγματικότητα τον έκρινε κάτι άλλο',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.64',
    date: '2026-07-03',
    headline: {
      en: 'Import errors that tell you what to do',
      el: 'Λάθη εισαγωγής που σου λένε τι να κάνεις',
    },
    summaryEn:
      'Most of this release went into behind-the-scenes checks, but two things changed on screen. When importing a saved team from a file, a link or a share code fails, the app now names the exact reason and tells you how to fix it, instead of a single generic "import failed". And Saved Teams, Saved Enemies, Captain Coverage, the manual builder and the pickers got proper labels and focus order, so they can be used with a screen reader and the keyboard.',
    summaryEl:
      'Το μεγαλύτερο μέρος αυτής της έκδοσης πήγε σε ελέγχους στο παρασκήνιο, αλλά δύο πράγματα άλλαξαν στην οθόνη. Όταν αποτυγχάνει η εισαγωγή αποθηκευμένης ομάδας από αρχείο, link ή share code, η εφαρμογή λέει τώρα τον ακριβή λόγο και πώς να το διορθώσεις, αντί για ένα γενικό «η εισαγωγή απέτυχε». Επίσης οι οθόνες Saved Teams, Saved Enemies, Captain Coverage, ο χειροκίνητος builder και τα picker απέκτησαν σωστές ετικέτες και σειρά εστίασης, ώστε να δουλεύουν με screen reader και πληκτρολόγιο.',
    added: [],
    improved: [
      {
        en: 'A failed team import now says what exactly went wrong - empty input, broken JSON, a mangled share code, or a payload with no team in it - and what to do about it.',
        el: 'Μια αποτυχημένη εισαγωγή ομάδας λέει πλέον τι ακριβώς πήγε στραβά - κενό περιεχόμενο, χαλασμένο JSON, κακοφορμισμένο share code ή περιεχόμενο χωρίς ομάδα - και τι να κάνεις.',
      },
      {
        en: 'The "Importing teams..." message appears right away, instead of after the team cards have been drawn.',
        el: 'Το μήνυμα «Γίνεται εισαγωγή ομάδων...» εμφανίζεται αμέσως, αντί αφού έχουν σχεδιαστεί οι κάρτες των ομάδων.',
      },
      {
        en: 'Screen-reader labels and keyboard focus on Saved Teams, Saved Enemies, Captain Coverage, the manual builder and the ability and character pickers.',
        el: 'Ετικέτες για screen reader και εστίαση με πληκτρολόγιο σε Saved Teams, Saved Enemies, Captain Coverage, τον χειροκίνητο builder και τα picker ικανοτήτων και χαρακτήρων.',
      },
    ],
    fixed: [
      {
        en: 'A rejected import no longer leaves a half-imported team behind in Saved Teams.',
        el: 'Μια εισαγωγή που απορρίπτεται δεν αφήνει πια μισοπερασμένη ομάδα στα Saved Teams.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.63',
    date: '2026-06-30',
    userVisible: true,
    headline: {
      en: 'Correct Captain multipliers, repaired saved teams',
      el: 'Σωστά Captain multipliers, επισκευή στα saved teams',
    },
    summaryEn:
      'Almost everything in this release is maintenance you cannot see — internal checks, tests, docs and dependency updates. Two things do show up. Captain abilities that give a bigger boost only under a condition ("2x, 2.5x if...") are read correctly now, so Captain Coverage shows the right multiplier and the right characters. And if your saved-teams storage on the device got damaged, Saved Teams repairs what it can, drops what it cannot, and tells you what happened instead of showing a broken or empty list.',
    summaryEl:
      'Σχεδόν όλο αυτό το release είναι συντήρηση που δεν φαίνεται — εσωτερικοί έλεγχοι, tests, docs και ενημερώσεις βιβλιοθηκών. Δύο πράγματα όμως φαίνονται. Τα captain abilities που δίνουν μεγαλύτερο boost μόνο υπό συνθήκη ("2x, 2.5x αν...") διαβάζονται πλέον σωστά, οπότε το Captain Coverage δείχνει το σωστό multiplier και τους σωστούς χαρακτήρες. Και αν τα αποθηκευμένα saved teams στη συσκευή χαλάσουν, η σελίδα Saved Teams φτιάχνει ό,τι μπορεί, πετάει ό,τι δεν σώζεται και σου λέει τι έγινε, αντί να δείχνει σπασμένη ή άδεια λίστα.',
    added: [],
    improved: [],
    fixed: [
      {
        en: 'Captain boosts with a conditional or alternative multiplier are read correctly, so Captain Coverage lists the right tier and the right characters',
        el: 'Τα captain boosts με υπό συνθήκη ή εναλλακτικό multiplier διαβάζονται σωστά, οπότε το Captain Coverage δείχνει το σωστό tier και τους σωστούς χαρακτήρες',
      },
      {
        en: 'Damaged saved-team records are repaired or removed with a clear message, instead of breaking the Saved Teams list',
        el: 'Τα χαλασμένα saved teams επισκευάζονται ή αφαιρούνται με ξεκάθαρο μήνυμα, αντί να χαλάει η λίστα των Saved Teams',
      },
    ],
  },
  {
    version: '0.0.62',
    date: '2026-06-26',
    headline: {
      en: 'Friend Captain slot and snappier filters',
      el: 'Θέση Friend Captain και πιο γρήγορα φίλτρα',
    },
    summaryEn:
      "The team you build inside Captain Coverage now has a real Friend Captain slot alongside the Captain and four subs, and it behaves the way the game does: the Friend Captain's cost does not eat your cost budget, and its picker is not cut down by whatever budget is left. The team condition summary also counts the Friend Captain now instead of ignoring it. Separately, tapping ability filter chips on Saved Teams, Saved Enemies and Manual Team Builder reacts much faster on long lists.",
    summaryEl:
      'Η ομάδα που χτίζεις μέσα στο Captain Coverage έχει πλέον κανονική θέση Friend Captain, δίπλα στον Captain και τα τέσσερα subs, και συμπεριφέρεται όπως στο παιχνίδι: το cost του Friend Captain δεν τρώει το cost budget σου και ο picker του δεν περιορίζεται από το budget που περισσεύει. Η σύνοψη των condition της ομάδας μετράει επίσης τον Friend Captain, αντί να τον αγνοεί. Ξεχωριστά, το πάτημα των ability chips σε Saved Teams, Saved Enemies και Manual Team Builder αντιδρά πολύ πιο γρήγορα σε μεγάλες λίστες.',
    added: [
      {
        en: 'Captain Coverage teams now have their own Friend Captain slot next to the Captain and four subs.',
        el: 'Οι ομάδες στο Captain Coverage έχουν πλέον δική τους θέση Friend Captain, δίπλα στον Captain και τα τέσσερα subs.',
      },
    ],
    improved: [
      {
        en: "The Friend Captain's cost no longer counts against your team cost budget, and its picker is not limited by the cost left over.",
        el: 'Το cost του Friend Captain δεν μετράει πια στο team cost budget, και ο picker του δεν περιορίζεται από το cost που έμεινε.',
      },
      {
        en: 'Ability filter chips on Saved Teams, Saved Enemies and Manual Team Builder respond noticeably faster.',
        el: 'Τα ability chips σε Saved Teams, Saved Enemies και Manual Team Builder αντιδρούν αισθητά πιο γρήγορα.',
      },
    ],
    fixed: [
      {
        en: "The Captain Coverage team summary now takes the Friend Captain into account when it says whether the team meets the Captain's conditions.",
        el: 'Η σύνοψη ομάδας στο Captain Coverage λαμβάνει πλέον υπόψη τον Friend Captain όταν λέει αν η ομάδα πληροί τα condition του Captain.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.61',
    date: '2026-06-25',
    headline: {
      en: 'Version update with no changes',
      el: 'Ενημέρωση έκδοσης χωρίς αλλαγές',
    },
    summaryEn:
      'No work landed in this release. It only moves the version number forward, so the app behaves exactly as in the previous one.',
    summaryEl:
      'Σε αυτή την έκδοση δεν μπήκε καμία δουλειά. Απλώς προχωράει ο αριθμός έκδοσης, οπότε η εφαρμογή συμπεριφέρεται ακριβώς όπως στην προηγούμενη.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.60',
    date: '2026-06-25',
    headline: {
      en: 'Version number only, no changes',
      el: 'Μόνο αλλαγή αριθμού έκδοσης, καμία αλλαγή',
    },
    summaryEn:
      'This release carries no changes at all. The version number moved forward on its own, with nothing added, improved or fixed. If you are already up to date, there is nothing new to look for.',
    summaryEl:
      'Αυτή η έκδοση δεν φέρνει καμία απολύτως αλλαγή. Ο αριθμός έκδοσης προχώρησε από μόνος του, χωρίς προσθήκες, βελτιώσεις ή διορθώσεις. Αν είσαι ήδη ενημερωμένος, δεν υπάρχει κάτι καινούργιο να ψάξεις.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.59',
    date: '2026-06-25',
    headline: {
      en: 'Version update with no visible changes',
      el: 'Ενημέρωση έκδοσης χωρίς ορατές αλλαγές',
    },
    summaryEn:
      'Nothing changed for players in this release. It was published only to keep the website and the Android build on the same version number.',
    summaryEl:
      'Σε αυτή την έκδοση δεν άλλαξε τίποτα για τους παίκτες. Βγήκε μόνο για να μείνουν η ιστοσελίδα και το Android build στον ίδιο αριθμό έκδοσης.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.58',
    date: '2026-06-25',
    headline: {
      en: 'Routine rebuild, no visible changes',
      el: 'Τυπική επανέκδοση, χωρίς ορατές αλλαγές',
    },
    summaryEn:
      'Another version with no changes behind it. Same app, new version number, so the web and Android builds stay in step.',
    summaryEl:
      'Άλλη μια έκδοση χωρίς καμία αλλαγή από πίσω. Ίδια εφαρμογή, νέος αριθμός έκδοσης, ώστε web και Android να παραμένουν συγχρονισμένα.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.57',
    date: '2026-06-25',
    userVisible: false,
    headline: {
      en: 'Version number only, no changes',
      el: 'Μόνο αλλαγή αριθμού έκδοσης',
    },
    summaryEn:
      'Nothing landed in this release beyond the version number itself. The app behaves exactly as it did in the previous one.',
    summaryEl:
      'Σε αυτή την έκδοση δεν μπήκε τίποτα πέρα από τον ίδιο τον αριθμό έκδοσης. Η εφαρμογή συμπεριφέρεται ακριβώς όπως και στην προηγούμενη.',
    added: [],
    improved: [],
    fixed: [],
  },
  {
    version: '0.0.56',
    date: '2026-06-25',
    headline: {
      en: 'Compare two Auto Team Builder teams',
      el: 'Σύγκριση δύο ομάδων στο Auto Team Builder',
    },
    summaryEn:
      'Auto Team Builder can now put two teams side by side: the one it just built, one you saved earlier, or one you import from a file. It marks slot by slot where they differ and shows the numbers for each, so you can tell whether a new suggestion is really an upgrade before you keep it.',
    summaryEl:
      'Το Auto Team Builder μπορεί τώρα να βάλει δύο ομάδες δίπλα δίπλα: αυτή που μόλις έφτιαξε, μία που είχες αποθηκεύσει ή μία που κάνεις εισαγωγή από αρχείο. Σου δείχνει θέση προς θέση πού διαφέρουν και τα νούμερα της καθεμιάς, ώστε να καταλάβεις αν η νέα πρόταση είναι όντως καλύτερη πριν την κρατήσεις.',
    added: [
      {
        en: 'A comparison panel in Auto Team Builder for the current result against a saved or imported team.',
        el: 'Πάνελ σύγκρισης στο Auto Team Builder, για το τρέχον αποτέλεσμα απέναντι σε μια αποθηκευμένη ή εισαγόμενη ομάδα.',
      },
      {
        en: 'Slot-by-slot differences are marked, with the key numbers shown for both teams.',
        el: 'Οι διαφορές σημειώνονται θέση προς θέση, με τα βασικά νούμερα και για τις δύο ομάδες.',
      },
      {
        en: 'The comparison stays open while you keep rebuilding, so you do not have to set it up again.',
        el: 'Η σύγκριση μένει ανοιχτή όσο συνεχίζεις να ξαναχτίζεις, ώστε να μην τη στήνεις από την αρχή.',
      },
    ],
    improved: [],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.55',
    date: '2026-06-24',
    headline: {
      en: 'See why a character was left out',
      el: 'Δες γιατί κόπηκε ένας χαρακτήρας',
    },
    summaryEn:
      'Every slot in an Auto Team Builder result can now tell you which characters were considered for it and why they were turned down. Instead of guessing why the unit you expected is missing, you get the actual reason next to the slot, in both languages.',
    summaryEl:
      "Κάθε θέση στο αποτέλεσμα του Auto Team Builder μπορεί πια να σου πει ποιοι χαρακτήρες εξετάστηκαν γι' αυτήν και γιατί απορρίφθηκαν. Αντί να μαντεύεις γιατί λείπει ο χαρακτήρας που περίμενες, βλέπεις τον πραγματικό λόγο δίπλα στη θέση, και στις δύο γλώσσες.",
    added: [
      {
        en: 'Each result slot can show the characters it rejected and the reason for each one.',
        el: 'Κάθε θέση του αποτελέσματος δείχνει ποιους χαρακτήρες απέρριψε και για ποιον λόγο τον καθένα.',
      },
    ],
    improved: [],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.54',
    date: '2026-06-24',
    userVisible: true,
    headline: {
      en: 'Auto Team Builder explains every pick',
      el: 'Ο Auto Team Builder εξηγεί κάθε επιλογή',
    },
    summaryEn:
      'Every slot in a generated team now comes with a reason. You get a short line saying why that character was chosen, the details behind it, and — when the builder had to loosen one of your requirements to fill the team — it tells you which one it relaxed instead of quietly handing you a team you did not ask for.',
    summaryEl:
      'Κάθε slot σε μια ομάδα που φτιάχνεται αυτόματα συνοδεύεται πλέον από εξήγηση. Βλέπεις μια σύντομη γραμμή για το γιατί μπήκε αυτός ο χαρακτήρας, τις λεπτομέρειες από πίσω και, όταν ο builder χρειάστηκε να χαλαρώσει κάποια απαίτησή σου για να γεμίσει την ομάδα, σου λέει ποια χαλάρωσε αντί να σου δίνει σιωπηλά μια ομάδα που δεν ζήτησες.',
    added: [
      {
        en: 'A summary and details for each slot explaining why that character was picked',
        el: 'Σύνοψη και λεπτομέρειες σε κάθε slot που εξηγούν γιατί επιλέχθηκε αυτός ο χαρακτήρας',
      },
      {
        en: 'The builder says which requirement it had to relax when it cannot fill the team strictly',
        el: 'Ο builder λέει ποια απαίτηση χαλάρωσε όταν δεν μπορεί να γεμίσει την ομάδα αυστηρά',
      },
    ],
    improved: [],
    fixed: [],
  },
  {
    version: '0.0.53',
    date: '2026-06-24',
    userVisible: true,
    headline: {
      en: 'Share a saved team with a link',
      el: 'Μοιράσου μια αποθηκευμένη ομάδα με link',
    },
    summaryEn:
      'Saved Teams can now leave your device. Every team has a Share button that copies a link or a short code, and anyone who pastes it gets that exact crew opened in the Manual Team Builder. You can also copy the plain JSON for one team or for a whole selection.',
    summaryEl:
      'Οι Αποθηκευμένες ομάδες μπορούν πλέον να φύγουν από τη συσκευή σου. Κάθε ομάδα έχει κουμπί Share που αντιγράφει ένα link ή έναν σύντομο κωδικό, και όποιος τον κάνει επικόλληση βλέπει ακριβώς αυτή την ομάδα να ανοίγει στο Manual Team Builder. Μπορείς επίσης να αντιγράψεις το σκέτο JSON για μία ομάδα ή για όσες έχεις επιλέξει.',
    added: [
      {
        en: 'Share button on every saved team: copies a link or a short share code.',
        el: 'Κουμπί Share σε κάθε αποθηκευμένη ομάδα: αντιγράφει link ή σύντομο κωδικό.',
      },
      {
        en: 'Paste a share link, a share code or saved-teams JSON to import a crew, without needing a file.',
        el: 'Κάνε επικόλληση share link, κωδικού ή JSON αποθηκευμένων ομάδων για να εισάγεις ομάδα, χωρίς να χρειάζεσαι αρχείο.',
      },
      {
        en: 'Copy the JSON of one team, or of all the teams you have selected.',
        el: 'Αντιγραφή του JSON μίας ομάδας ή όλων των ομάδων που έχεις επιλέξει.',
      },
      {
        en: 'A shared link opens the crew straight in the Manual Team Builder.',
        el: 'Ένα κοινόχρηστο link ανοίγει την ομάδα κατευθείαν στο Manual Team Builder.',
      },
    ],
    improved: [],
    fixed: [],
  },
  {
    version: '0.0.52',
    date: '2026-06-24',
    headline: {
      en: 'Project description only, nothing to see',
      el: 'Μόνο περιγραφή του project, τίποτα ορατό',
    },
    summaryEn:
      "This release only updated the project's own description and links. Nothing changed in the app itself.",
    summaryEl:
      'Αυτή η έκδοση ενημέρωσε μόνο την περιγραφή και τα links του project. Στην ίδια την εφαρμογή δεν άλλαξε τίποτα.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.51',
    date: '2026-06-24',
    headline: {
      en: 'Build your team one slot at a time',
      el: 'Χτίσε την ομάδα μία θέση τη φορά',
    },
    summaryEn:
      'Auto Team Builder gained an optional guided mode. With it on, each press of Build locks in one more slot instead of filling the whole team at once, so you can watch the team take shape and change course before it is finished. It is off by default and normal building works exactly as before. In guided mode the builder also refuses to quietly hand you a relaxed, watered-down team.',
    summaryEl:
      'Ο Auto Team Builder απέκτησε προαιρετικό guided mode. Όταν είναι ενεργό, κάθε πάτημα του Build κλειδώνει μία ακόμα θέση αντί να γεμίζει όλη την ομάδα μονομιάς, ώστε να βλέπεις την ομάδα να χτίζεται και να αλλάξεις πορεία πριν τελειώσει. Είναι απενεργοποιημένο εξ ορισμού και το κανονικό χτίσιμο δουλεύει ακριβώς όπως πριν. Στο guided mode ο builder αρνείται επίσης να σου δώσει σιωπηλά μια χαλαρωμένη, υποβαθμισμένη ομάδα.',
    added: [
      {
        en: 'Guided mode in Auto Team Builder: one slot locked per Build press, off by default.',
        el: 'Guided mode στον Auto Team Builder: μία θέση κλειδώνει σε κάθε πάτημα του Build, απενεργοποιημένο εξ ορισμού.',
      },
    ],
    improved: [
      {
        en: "The leader's chosen branch is remembered between guided steps, so the team stays consistent as it grows.",
        el: 'Το επιλεγμένο branch του leader θυμάται ανάμεσα στα βήματα, ώστε η ομάδα να μένει συνεπής καθώς μεγαλώνει.',
      },
      {
        en: 'A guided build will not settle for a relaxed fallback team behind your back.',
        el: 'Ένα guided build δεν συμβιβάζεται με χαλαρωμένη εναλλακτική ομάδα πίσω από την πλάτη σου.',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.50',
    date: '2026-06-24',
    userVisible: true,
    headline: {
      en: 'Ability filters everywhere, plus install to home screen',
      el: 'Ability filters παντού και εγκατάσταση στην αρχική οθόνη',
    },
    summaryEn:
      'The ability filter rail is now on every list of characters: Characters and character boxes, Saved Teams, Saved Enemies and the Manual Team Builder slot picker, so you can hunt for an effect wherever you happen to be looking. Captain Coverage no longer makes you pick a Captain before you can do anything — browse and filter freely, including by which Supers are present, and pick a Captain when you are ready. Captain stat boosts are sorted into clear tiers with a proper picker, and the site can be installed like a normal app.',
    summaryEl:
      'Το ability filter μπαίνει πλέον σε κάθε λίστα χαρακτήρων: Χαρακτήρες και character boxes, Saved Teams, Saved Enemies και ο slot picker του Manual Team Builder, οπότε ψάχνεις ένα effect όπου κι αν βρίσκεσαι. Το Captain Coverage δεν σε αναγκάζει πια να διαλέξεις πρώτα Captain — κάνεις browse και φιλτράρεις ελεύθερα, ακόμη και με βάση ποια Supers υπάρχουν, και βάζεις Captain όταν είσαι έτοιμος. Τα stat boosts των Captain μπαίνουν σε καθαρά tiers με κανονικό picker, και το site εγκαθίσταται σαν κανονική εφαρμογή.',
    added: [
      {
        en: 'Ability filters on Characters and character boxes, Saved Teams, Saved Enemies and the Manual Team Builder slot picker',
        el: 'Ability filters στους Χαρακτήρες και τα character boxes, στα Saved Teams, στα Saved Enemies και στον slot picker του Manual Team Builder',
      },
      {
        en: 'Browse and filter in Captain Coverage before choosing a Captain, including filtering by which Supers are present',
        el: 'Browse και φιλτράρισμα στο Captain Coverage πριν διαλέξεις Captain, με φίλτρο και για το ποια Supers υπάρχουν',
      },
      {
        en: 'Install the site as an app from a prompt on your phone',
        el: 'Εγκατάσταση του site σαν εφαρμογή, από ένα prompt στο κινητό',
      },
    ],
    improved: [
      {
        en: 'Captain stat boosts are grouped into strict tiers, and the Captain ability filters got a proper picker instead of a flat list',
        el: 'Τα stat boosts των Captain ομαδοποιούνται σε αυστηρά tiers, και τα Captain ability filters απέκτησαν κανονικό picker αντί για μια απλή λίστα',
      },
    ],
    fixed: [
      {
        en: "Text on a character's detail page can be selected and copied on mobile",
        el: 'Το κείμενο στη σελίδα χαρακτήρα επιλέγεται και αντιγράφεται και στο κινητό',
      },
    ],
  },
  {
    version: '0.0.49',
    date: '2026-06-23',
    headline: {
      en: 'Filter Characters by Captain Ability',
      el: 'Φίλτρο Captain Ability στη σελίδα Characters',
    },
    summaryEn:
      'The Characters page gets a Captain Ability filter: open the picker, choose the effects you care about, and only characters whose own Captain Ability provides them stay in the list. Everything else in this release was library and security updates with nothing to see on screen.',
    summaryEl:
      'Η σελίδα Characters αποκτά φίλτρο Captain Ability: ανοίγεις τον picker, διαλέγεις τα effects που σε ενδιαφέρουν και μένουν στη λίστα μόνο οι χαρακτήρες που τα έχουν στη δική τους Captain Ability. Τα υπόλοιπα σε αυτή την έκδοση ήταν ενημερώσεις βιβλιοθηκών και ασφάλειας, χωρίς κάτι ορατό στην οθόνη.',
    added: [
      {
        en: 'Captain Ability filter on the Characters page — pick effects and see only the characters whose own Captain Ability has them.',
        el: 'Φίλτρο Captain Ability στη σελίδα Characters — διαλέγεις effects και βλέπεις μόνο όσους τα έχουν στη δική τους Captain Ability.',
      },
    ],
    improved: [],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.48',
    date: '2026-06-04',
    headline: {
      en: 'Ship picker and filter panels look tidier',
      el: 'Πιο τακτοποιημένα ship picker και φίλτρα',
    },
    summaryEn:
      'The Ship picker and the ability requirement panels got a layout pass. Cards and options now line up in a proper grid and reflow instead of squeezing or overlapping, which mostly shows on phones and narrow windows.',
    summaryEl:
      'Το ship picker και τα πάνελ με τις απαιτήσεις abilities πήραν μια δουλειά στη διάταξη. Οι κάρτες και οι επιλογές μπαίνουν πλέον σε κανονικό grid και αναδιατάσσονται αντί να στριμώχνονται ή να πέφτουν η μία πάνω στην άλλη, κάτι που φαίνεται κυρίως σε κινητά και στενά παράθυρα.',
    added: [],
    improved: [
      {
        en: 'Ship picker options sit in a clean grid and adapt to the screen width.',
        el: 'Οι επιλογές του ship picker μπαίνουν σε καθαρό grid και προσαρμόζονται στο πλάτος της οθόνης.',
      },
      {
        en: 'Ability requirement panels keep their spacing and styling on small screens.',
        el: 'Τα πάνελ με τις απαιτήσεις abilities κρατούν τα κενά και το στιλ τους σε μικρές οθόνες.',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.47',
    date: '2026-06-02',
    headline: {
      en: 'Housekeeping release, nothing changed on screen',
      el: 'Έκδοση συντήρησης, τίποτα δεν άλλαξε στην οθόνη',
    },
    summaryEn:
      'This one was pure tidying up inside the app: the styling of the ability requirement picker, the ship picker and several other screens was reorganised into smaller pieces that are easier to maintain. Nothing you can see or do changed. Everything looks and behaves exactly as it did before.',
    summaryEl:
      'Αυτή η έκδοση ήταν καθαρά εσωτερική τακτοποίηση: τα στυλ του ability requirement picker, του ship picker και μερικών ακόμη οθονών ξαναμοιράστηκαν σε μικρότερα κομμάτια που συντηρούνται πιο εύκολα. Τίποτα από όσα βλέπεις ή κάνεις δεν άλλαξε. Όλα δείχνουν και λειτουργούν ακριβώς όπως πριν.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.46',
    date: '2026-06-02',
    headline: {
      en: 'The same filter bar on every character list',
      el: 'Η ίδια μπάρα φίλτρων σε κάθε λίστα χαρακτήρων',
    },
    summaryEn:
      'Characters, Captain Coverage and Character Boxes now share one filter row instead of three different toolbars: search, type, class, cost and favourites all sit in the same place and behave the same way, and each dropdown finally carries a label saying what it filters. Saved Enemies was reorganised into clear sections for the list, the editor, team association and importing.',
    summaryEl:
      'Οι σελίδες Characters, Captain Coverage και Character Boxes μοιράζονται πλέον μία μπάρα φίλτρων αντί για τρεις διαφορετικές: αναζήτηση, type, class, cost και αγαπημένα βρίσκονται στο ίδιο σημείο και λειτουργούν το ίδιο, ενώ κάθε λίστα επιλογής έχει επιτέλους ετικέτα που λέει τι φιλτράρει. Η σελίδα Saved Enemies χωρίστηκε σε καθαρές ενότητες για τη λίστα, την επεξεργασία, τη σύνδεση με ομάδες και το import.',
    added: [],
    improved: [
      {
        en: 'Characters, Captain Coverage and Character Boxes filter the same way, from the same row.',
        el: 'Οι σελίδες Characters, Captain Coverage και Character Boxes φιltράρουν με τον ίδιο τρόπο, από την ίδια μπάρα.',
      },
      {
        en: 'Every filter dropdown now shows a label — Type, Class, Favorites, Membership — instead of only a placeholder.',
        el: 'Κάθε φίλτρο δείχνει πλέον ετικέτα — Type, Class, Favorites, Membership — και όχι μόνο κείμενο μέσα στο πεδίο.',
      },
      {
        en: 'Saved Enemies is split into clear sections: overview, editor, team association and import.',
        el: 'Η σελίδα Saved Enemies χωρίστηκε σε καθαρές ενότητες: επισκόπηση, επεξεργασία, σύνδεση με ομάδες και import.',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.45',
    date: '2026-05-31',
    headline: {
      en: 'Routine rebuild, no visible changes',
      el: 'Τυπική επανέκδοση, χωρίς ορατές αλλαγές',
    },
    summaryEn:
      'This version went out with no changes at all. It is a routine rebuild that keeps the web app and the Android build on the same version number.',
    summaryEl:
      'Αυτή η έκδοση βγήκε χωρίς καμία αλλαγή. Είναι μια τυπική επανέκδοση, ώστε το web app και το Android build να μένουν στον ίδιο αριθμό έκδοσης.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.44',
    date: '2026-05-27',
    userVisible: true,
    headline: {
      en: 'Every character shows in the manual pickers',
      el: 'Όλοι οι χαρακτήρες φαίνονται στους χειροκίνητους pickers',
    },
    summaryEn:
      'The manual pick and exclude pickers used to hide characters that did not match the filters set on the page. Now every character is always there to choose, and both pickers open as a compact thumbnail grid with a List/Compact toggle, so you see far more at once. Picking a dual or VS captain asks which side you want locked into the slot instead of guessing for you.',
    summaryEl:
      'Οι pickers για χειροκίνητη επιλογή και για αποκλεισμό έκρυβαν χαρακτήρες που δεν ταίριαζαν με τα φίλτρα της σελίδας. Πλέον όλοι οι χαρακτήρες είναι πάντα διαθέσιμοι, και οι δύο pickers ανοίγουν σε συμπαγές πλέγμα με μικρογραφίες, με διακόπτη List/Compact, ώστε να βλέπεις πολύ περισσότερους μαζί. Όταν διαλέγεις dual ή VS captain, σε ρωτάει ποια πλευρά θέλεις να κλειδώσει στη θέση αντί να το μαντεύει.',
    added: [
      {
        en: 'Compact thumbnail grid in the manual and exclude pickers, with a List/Compact toggle',
        el: 'Συμπαγές πλέγμα με μικρογραφίες στους pickers χειροκίνητης επιλογής και αποκλεισμού, με διακόπτη List/Compact',
      },
      {
        en: 'Picking a dual or VS captain now asks for the side you want: the first character, the second, or both',
        el: 'Όταν διαλέγεις dual ή VS captain, σε ρωτάει ποια πλευρά θέλεις: τον πρώτο χαρακτήρα, τον δεύτερο ή και τους δύο',
      },
    ],
    improved: [
      {
        en: "The manual and exclude pickers list every character, whatever the page's filters say",
        el: 'Οι pickers χειροκίνητης επιλογής και αποκλεισμού δείχνουν όλους τους χαρακτήρες, ανεξάρτητα από τα φίλτρα της σελίδας',
      },
    ],
    fixed: [
      {
        en: 'The options in the dual/VS captain prompt were almost invisible on the dark theme; they now read white, with the selected one highlighted',
        el: 'Οι επιλογές στο παράθυρο για dual/VS captain ήταν σχεδόν αόρατες στο σκούρο θέμα· τώρα φαίνονται λευκές, με τονισμένη την επιλεγμένη',
      },
    ],
  },
  {
    version: '0.0.43',
    date: '2026-05-24',
    headline: {
      en: 'Internal maintenance only',
      el: 'Μόνο εσωτερική συντήρηση',
    },
    summaryEn:
      'Only an internal test check around Captain Coverage was corrected. Nothing you see or do in the app changed.',
    summaryEl:
      'Διορθώθηκε μόνο ένας εσωτερικός έλεγχος γύρω από το Captain Coverage. Τίποτα από όσα βλέπεις ή κάνεις στην εφαρμογή δεν άλλαξε.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.42',
    date: '2026-05-24',
    headline: {
      en: 'Auto Team Builder says what it gave up',
      el: 'Ο Auto Team Builder λέει τι θυσίασε',
    },
    summaryEn:
      'When the builder cannot find a team that meets everything you asked for, it no longer hands you a result in silence. A final team report now lists every requirement you set — types, classes, character tags, character names, Captain Ability tier coverage, Super Tandem and Super Special — and marks each one as passed, relaxed or not requested. For the relaxed ones it shows what you asked for next to what the team actually covers.',
    summaryEl:
      'Όταν ο builder δεν βρίσκει ομάδα που να καλύπτει όλα όσα ζήτησες, δεν σου δίνει πια σιωπηλά ένα αποτέλεσμα. Μια νέα αναφορά τελικής ομάδας απαριθμεί κάθε απαίτηση που έβαλες — types, classes, character tags, ονόματα, κάλυψη tier του Captain Ability, Super Tandem και Super Special — και τη σημειώνει ως καλυμμένη, χαλαρωμένη ή μη ζητούμενη. Για τις χαλαρωμένες δείχνει τι ζήτησες δίπλα σε αυτό που τελικά καλύπτει η ομάδα.',
    added: [
      {
        en: 'A final team report on each result, marking every requirement as Passed, Relaxed or Not applicable.',
        el: 'Αναφορά τελικής ομάδας σε κάθε αποτέλεσμα, με κάθε απαίτηση σημειωμένη ως καλυμμένη, χαλαρωμένη ή μη ζητούμενη.',
      },
      {
        en: 'For a relaxed requirement, the report shows what you requested against what the team really covers.',
        el: 'Για κάθε χαλαρωμένη απαίτηση, η αναφορά δείχνει τι ζήτησες σε σχέση με αυτό που πράγματι καλύπτει η ομάδα.',
      },
    ],
    improved: [
      {
        en: 'The team coverage summary is easier to read and matches what the report says.',
        el: 'Η σύνοψη κάλυψης της ομάδας διαβάζεται πιο εύκολα και συμφωνεί με όσα λέει η αναφορά.',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.41',
    date: '2026-05-23',
    userVisible: true,
    headline: {
      en: 'Faster Auto Team Builder, better teams',
      el: 'Πιο γρήγορος Auto Team Builder, καλύτερες ομάδες',
    },
    summaryEn:
      'Auto Team Builder got a serious pass over both how it picks and how fast it picks. Results come back noticeably quicker, and the teams it returns hold up better against the requirements you set. Captain Coverage also reads captain abilities more accurately, so the characters a Captain really boosts are counted correctly.',
    summaryEl:
      'Ο Auto Team Builder δέχτηκε σοβαρή δουλειά τόσο στο πώς διαλέγει όσο και στο πόσο γρήγορα διαλέγει. Τα αποτελέσματα βγαίνουν αισθητά πιο γρήγορα και οι ομάδες που επιστρέφει ταιριάζουν καλύτερα σε όσα έχεις ζητήσει. Επίσης το Captain Coverage διαβάζει πιο σωστά τα captain abilities, οπότε μετριούνται σωστά οι χαρακτήρες που πραγματικά boostάρει ένας Captain.',
    added: [],
    improved: [
      {
        en: 'Auto builds finish faster',
        el: 'Τα auto builds τελειώνουν πιο γρήγορα',
      },
      {
        en: 'The teams the builder returns match your requirements more closely',
        el: 'Οι ομάδες που επιστρέφει ο builder ταιριάζουν πιο πολύ σε αυτά που ζήτησες',
      },
      {
        en: 'Captain Coverage counts boosted characters more accurately, with clearer wording',
        el: 'Το Captain Coverage μετράει πιο σωστά τους boosted χαρακτήρες, με πιο ξεκάθαρη διατύπωση',
      },
    ],
    fixed: [],
  },
  {
    version: '0.0.40',
    date: '2026-05-21',
    userVisible: true,
    headline: {
      en: 'Captain Coverage now shows every tier',
      el: 'Το Captain Coverage δείχνει πλέον κάθε tier',
    },
    summaryEn:
      'Captains that boost different amounts for different rarities or cost brackets used to be squashed into one line. Now each band is its own tier, universal effects sit apart from the conditional ones, and your team pages show a summary of which crewmates each tier actually reaches. Captains that only give utility, like Special cooldown or damage reduction, finally appear too.',
    summaryEl:
      'Οι Captain που δίνουν διαφορετικό boost ανά rarity ή ανά cost στριμώχνονταν παλιά σε μία γραμμή. Τώρα κάθε ζώνη έχει το δικό της tier, τα καθολικά εφέ ξεχωρίζουν από τα υπό συνθήκη, και οι σελίδες της ομάδας σου δείχνουν σύνοψη με το ποιους crewmates πιάνει πραγματικά κάθε tier. Εμφανίζονται επιτέλους και οι Captain που δίνουν μόνο utility, όπως μείωση Special cooldown ή μείωση ζημιάς.',
    added: [
      {
        en: 'A team coverage summary on your team screens: which of your crew each Captain tier actually boosts.',
        el: 'Σύνοψη κάλυψης στις σελίδες της ομάδας σου: ποιους από την ομάδα σου boostάρει πραγματικά κάθε tier του Captain.',
      },
      {
        en: 'Separate tiers per rarity band and per cost range, each with its own multiplier and conditions.',
        el: 'Ξεχωριστά tiers ανά rarity και ανά εύρος cost, το καθένα με τον δικό του πολλαπλασιαστή και τις δικές του προϋποθέσεις.',
      },
      {
        en: 'Captains with a Powered Up or Gear state, and ones that trigger on consecutive PERFECTs, are shown as their own tiers.',
        el: 'Οι Captain με κατάσταση Powered Up ή Gear, και όσοι ενεργοποιούνται με συνεχόμενα PERFECT, εμφανίζονται ως δικά τους tiers.',
      },
    ],
    improved: [
      {
        en: 'A tier that mixes a universal HP boost with a conditional ATK boost is shown as one entry with both halves, instead of two confusing rows.',
        el: 'Ένα tier που συνδυάζει καθολικό HP boost με υπό συνθήκη ATK boost εμφανίζεται ως μία εγγραφή με τα δύο μέρη του, αντί για δύο μπερδεμένες γραμμές.',
      },
      {
        en: 'Captains that only offer utility, such as Special cooldown reduction or damage mitigation, now get a coverage entry instead of none.',
        el: 'Οι Captain που προσφέρουν μόνο utility, όπως μείωση Special cooldown ή μείωση ζημιάς, έχουν πλέον εγγραφή κάλυψης αντί για καμία.',
      },
      {
        en: 'Captains that share one multiplier across ATK and HP now keep both halves instead of losing one.',
        el: 'Οι Captain που μοιράζουν έναν πολλαπλασιαστή σε ATK και HP κρατούν πλέον και τα δύο μέρη αντί να χάνεται το ένα.',
      },
      {
        en: 'Auto Team Builder warns you clearly when it is searching your favourites only, so an empty result is not a mystery.',
        el: 'Ο Auto Team Builder σε προειδοποιεί καθαρά όταν ψάχνει μόνο στα αγαπημένα σου, ώστε ένα άδειο αποτέλεσμα να μη σου φαίνεται ανεξήγητο.',
      },
    ],
    fixed: [
      {
        en: 'Two dominant-type Captains with clashing types, such as an INT one next to a DEX one, returned an empty team. The type filter now stands down instead and you get real suggestions.',
        el: 'Δύο Captain με απαίτηση κυρίαρχου type που δεν ταίριαζαν μεταξύ τους, π.χ. ένας INT δίπλα σε έναν DEX, έβγαζαν άδεια ομάδα. Τώρα το φίλτρο type υποχωρεί και παίρνεις κανονικές προτάσεις.',
      },
      {
        en: 'Tiers that only unlock "if you defeated an enemy last turn" are no longer listed, because they said nothing about how to build the team.',
        el: 'Δεν εμφανίζονται πια tiers που ξεκλειδώνουν μόνο «αν νίκησες εχθρό τον προηγούμενο γύρο», γιατί δεν σου έλεγαν τίποτα για το πώς να στήσεις την ομάδα.',
      },
    ],
  },
  {
    version: '0.0.39',
    date: '2026-05-19',
    headline: {
      en: 'Manual builder filters, enemy-team links, box filter',
      el: 'Φίλτρα στον manual builder, σύνδεση enemy-ομάδας, φίλτρο box',
    },
    summaryEn:
      'The Manual Team Builder became a lot easier to work with: you can filter the character list by type, class and tag, drag characters straight into a slot or swap them between slots, and it warns you when a slot or the whole composition does not fit. Captain Coverage gained filters for a specific Captain Ability, for characters that have a Super Tandem, and for showing only what is in your character box. On Saved Enemies you can now link the teams that beat an enemy to that enemy and open them from its card, and typing an enemy name suggests matches.',
    summaryEl:
      'Ο Manual Team Builder έγινε πολύ πιο βολικός: μπορείς να φιλτράρεις τη λίστα χαρακτήρων ανά type, class και tag, να σύρεις χαρακτήρες κατευθείαν σε ένα slot ή να τους ανταλλάξεις μεταξύ slots, και σε προειδοποιεί όταν ένα slot ή όλη η σύνθεση δεν στέκει. Στο Captain Coverage προστέθηκαν φίλτρα για συγκεκριμένο Captain Ability, για χαρακτήρες που έχουν Super Tandem, και για να βλέπεις μόνο ό,τι υπάρχει στο character box σου. Στα Saved Enemies μπορείς πλέον να συνδέσεις με έναν εχθρό τις ομάδες που τον περνάνε και να τις ανοίγεις από την κάρτα του, ενώ όταν γράφεις όνομα εχθρού σου προτείνονται αντιστοιχίες.',
    added: [
      {
        en: 'Manual Team Builder: filter the character list by type, class and tag',
        el: 'Manual Team Builder: φιλτράρισμα της λίστας χαρακτήρων ανά type, class και tag',
      },
      {
        en: 'Manual Team Builder: drag a character into a slot or drag one slot onto another to swap',
        el: 'Manual Team Builder: σύρσιμο χαρακτήρα σε slot, ή slot πάνω σε slot για εναλλαγή',
      },
      {
        en: 'Manual Team Builder: warnings when a character does not fit the slot or the team composition is off',
        el: 'Manual Team Builder: προειδοποιήσεις όταν ένας χαρακτήρας δεν ταιριάζει στο slot ή η σύνθεση δεν στέκει',
      },
      {
        en: 'Captain Coverage: filter by a specific Captain Ability effect, and show only characters that have a Super Tandem',
        el: 'Captain Coverage: φίλτρο για συγκεκριμένο effect του Captain Ability, και εμφάνιση μόνο χαρακτήρων που έχουν Super Tandem',
      },
      {
        en: 'Captain Coverage: limit the results to one of your character boxes',
        el: 'Captain Coverage: περιορισμός των αποτελεσμάτων σε ένα από τα character boxes σου',
      },
      {
        en: 'Saved Enemies: attach saved teams to an enemy and open them from the enemy card',
        el: 'Saved Enemies: σύνδεση saved teams με έναν εχθρό και άνοιγμά τους από την κάρτα του',
      },
      {
        en: 'Saved Enemies: suggestions while you type enemy text',
        el: 'Saved Enemies: προτάσεις καθώς πληκτρολογείς το κείμενο του εχθρού',
      },
    ],
    improved: [
      {
        en: 'Crew Forge screenshot import now handles pictures of a different shape by scaling the slot layout to the image',
        el: 'Το import από screenshot στο Crew Forge δέχεται πλέον και εικόνες με άλλες αναλογίες, προσαρμόζοντας τη διάταξη των slots στην εικόνα',
      },
      {
        en: 'Layouts across the app fit narrow phone screens better',
        el: 'Οι διατάξεις σε όλη την εφαρμογή χωράνε καλύτερα σε στενές οθόνες κινητού',
      },
      {
        en: 'Every pop-up window now has a clear way to close it',
        el: 'Κάθε αναδυόμενο παράθυρο έχει πλέον ξεκάθαρο τρόπο να κλείσει',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.38',
    date: '2026-05-15',
    headline: {
      en: 'First Coverage and Second Coverage',
      el: 'First Coverage και Second Coverage',
    },
    summaryEn:
      'Captain coverage is now split into two clearly named levels. "First Coverage" is the Captain\'s plain HP/ATK boost scope; "Second Coverage" is the stricter check that every targetable part of the Captain Ability applies to a unit. The new names appear everywhere coverage does - Captain Coverage, Auto Team Builder and the character page - and the reading of Captain Ability text was rebuilt underneath, so the covered-character lists are more accurate.',
    summaryEl:
      'Το captain coverage χωρίζεται πλέον σε δύο ξεκάθαρα επίπεδα. Το «First Coverage» είναι το απλό scope του Captain για HP/ATK, ενώ το «Second Coverage» είναι ο αυστηρός έλεγχος ότι ισχύει για μια μονάδα κάθε στοχευμένο κομμάτι του Captain Ability. Τα νέα ονόματα εμφανίζονται παντού όπου υπάρχει coverage - Captain Coverage, Auto Team Builder και σελίδα χαρακτήρα - και από κάτω ξαναγράφτηκε ο τρόπος που διαβάζεται το κείμενο του Captain Ability, ώστε οι λίστες καλυμμένων χαρακτήρων να είναι πιο σωστές.',
    added: [],
    improved: [
      {
        en: '"Full Coverage" is now "Second Coverage" and "Captain Coverage Ability" is now "First Coverage", with help text that explains the difference.',
        el: 'Το «Full Coverage» έγινε «Second Coverage» και το «Captain Coverage Ability» έγινε «First Coverage», με επεξηγήσεις που δείχνουν τη διαφορά.',
      },
      {
        en: 'Captain Ability text is read more carefully, so the list of covered characters matches what the Captain really boosts.',
        el: 'Το κείμενο του Captain Ability διαβάζεται πιο προσεκτικά, οπότε η λίστα καλυμμένων χαρακτήρων ταιριάζει με αυτό που πραγματικά κάνει boost ο Captain.',
      },
      {
        en: 'Refreshed character data and thumbnails, including newly released units.',
        el: 'Ανανεωμένα δεδομένα χαρακτήρων και thumbnails, μαζί με μονάδες που μόλις βγήκαν.',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.37',
    date: '2026-05-12',
    userVisible: true,
    headline: {
      en: 'Save teams from Captain Coverage',
      el: 'Αποθήκευση ομάδας μέσα από το Captain Coverage',
    },
    summaryEn:
      "After putting a team together around a Captain in Captain Coverage, you can name it and save it on the spot, and it tells you straight away whether it worked. In Saved Teams, opening a team now asks where you want it — which builder it should load into — and Manual Team Builder can open a saved team from a link, clearing characters or ships you no longer have instead of failing. Ability filters also read a character's Super Special now, so effects that only appear there can be searched.",
    summaryEl:
      'Αφού στήσεις ομάδα γύρω από έναν Captain στο Captain Coverage, της δίνεις όνομα και την αποθηκεύεις επιτόπου, και βλέπεις αμέσως αν πέτυχε. Στα Saved Teams, όταν ανοίγεις μια ομάδα σε ρωτάει πού τη θέλεις — σε ποιον builder θα φορτώσει — και ο Manual Team Builder ανοίγει saved team κατευθείαν από link, καθαρίζοντας χαρακτήρες ή ships που δεν έχεις πια αντί να κολλάει. Τα ability filters διαβάζουν πλέον και το Super Special, οπότε ψάχνεις και effects που εμφανίζονται μόνο εκεί.',
    added: [
      {
        en: 'Name and save a team straight from Captain Coverage, with a clear success or error message',
        el: 'Δίνεις όνομα και αποθηκεύεις ομάδα κατευθείαν από το Captain Coverage, με ξεκάθαρο μήνυμα επιτυχίας ή λάθους',
      },
      {
        en: 'Choose which builder a saved team opens in, from Saved Teams',
        el: 'Διαλέγεις σε ποιον builder θα ανοίξει ένα saved team, μέσα από τα Saved Teams',
      },
      {
        en: 'Open a saved team from a link in Manual Team Builder; characters and ships you no longer have are cleared instead of breaking the load',
        el: 'Ανοίγεις saved team από link στον Manual Team Builder· χαρακτήρες και ships που δεν έχεις πια καθαρίζονται αντί να χαλάει το φόρτωμα',
      },
    ],
    improved: [
      {
        en: 'Ability filters now also look at Super Special text, so effects that only show up on a Super Special are searchable',
        el: 'Τα ability filters κοιτάνε πλέον και το κείμενο του Super Special, οπότε βρίσκεις effects που υπάρχουν μόνο εκεί',
      },
    ],
    fixed: [
      {
        en: 'The Auto Team Builder treats titled variants of the same character (a Gear Four Luffy and a Luffy dual unit) as one unit, so it will not put both on the same team',
        el: 'Ο Auto Team Builder βλέπει τις εκδοχές του ίδιου χαρακτήρα (έναν Gear Four Luffy και ένα dual unit με Luffy) ως τον ίδιο, οπότε δεν τους βάζει και τους δύο στην ίδια ομάδα',
      },
    ],
  },
  {
    version: '0.0.36',
    date: '2026-05-11',
    headline: {
      en: 'Back up your crews to Google Drive',
      el: 'Backup των crews σου στο Google Drive',
    },
    summaryEn:
      'Google Drive backup gets its own Drive Sync page instead of being buried in Settings. Sign in with Google in a popup, then — before anything is written anywhere — you get a review screen listing every saved team, favorite, character box, saved enemy, favorite ship and character override that would be added, changed, kept or removed, and you can flip any single row before confirming. You choose whether to merge both sides, replace Drive with this device, or replace this device with Drive.',
    summaryEl:
      'Το backup στο Google Drive αποκτά δική του σελίδα, τη Drive Sync, αντί να είναι χωμένο μέσα στα Settings. Κάνεις σύνδεση με Google σε popup και, πριν γραφτεί οτιδήποτε πουθενά, βλέπεις μια οθόνη ελέγχου με κάθε saved team, favorite, character box, saved enemy, αγαπημένο ship και character override που θα προστεθεί, θα αλλάξει, θα μείνει ή θα φύγει — και μπορείς να αλλάξεις μία μία τις γραμμές πριν πατήσεις επιβεβαίωση. Εσύ διαλέγεις αν θα συγχωνευτούν οι δύο πλευρές, αν το Drive θα γίνει αντίγραφο της συσκευής, ή η συσκευή αντίγραφο του Drive.',
    added: [
      {
        en: 'A dedicated Drive Sync page with Google sign-in, backup and restore in one place.',
        el: 'Ξεχωριστή σελίδα Drive Sync με σύνδεση Google, backup και restore σε ένα μέρος.',
      },
      {
        en: 'A review step before every sync: see exactly what will be added, changed, kept or removed, row by row.',
        el: 'Έλεγχος πριν από κάθε sync: βλέπεις ακριβώς τι θα προστεθεί, θα αλλάξει, θα μείνει ή θα φύγει, γραμμή γραμμή.',
      },
      {
        en: 'Override any single row of the plan before it runs — keep the device copy, take the Drive copy, or drop it.',
        el: 'Αλλάζεις όποια γραμμή θέλεις πριν εκτελεστεί — κρατάς τη συσκευή, παίρνεις το Drive, ή τη βγάζεις.',
      },
      {
        en: 'Pick merge, replace Drive, or replace this device.',
        el: 'Διαλέγεις merge, αντικατάσταση του Drive ή αντικατάσταση της συσκευής.',
      },
    ],
    improved: [],
    fixed: [
      {
        en: 'Google sign-in now opens in a popup and hands you back to the app properly instead of stalling on the redirect.',
        el: 'Η σύνδεση με Google ανοίγει πλέον σε popup και σε γυρίζει σωστά στην εφαρμογή, αντί να κολλάει στο redirect.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.35',
    date: '2026-05-09',
    headline: {
      en: 'Internal loading clean-up, nothing visible',
      el: 'Εσωτερική τακτοποίηση, τίποτα ορατό',
    },
    summaryEn:
      'This one only tidied up how pages wait for your saved data before they draw. Favorites, Character Boxes, Saved Teams and the rest behave exactly as they did, so there is no visible change.',
    summaryEl:
      'Εδώ τακτοποιήθηκε μόνο ο τρόπος που οι σελίδες περιμένουν τα αποθηκευμένα σου δεδομένα πριν εμφανιστούν. Favorites, Character Boxes, Saved Teams και τα υπόλοιπα δουλεύουν ακριβώς όπως πριν, οπότε δεν υπάρχει ορατή αλλαγή.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.34',
    date: '2026-05-09',
    headline: {
      en: 'Manual Team Builder arrives, smarter captain choices',
      el: 'Έρχεται ο Manual Team Builder, εξυπνότερες επιλογές captain',
    },
    summaryEn:
      "A Manual Team Builder page lets you put a crew together slot by slot: search for candidates, watch the cost as you go, pick a ship and see straight away whether your Captain's conditions are met. Automatic builds are stricter too, keeping only teams where the Captain Ability covers the whole crew. For VS and dual-character Captains you now choose which side of the ability to build around, and each character shows which branch it belongs to.",
    summaryEl:
      'Η σελίδα Manual Team Builder σού επιτρέπει να στήσεις crew θέση θέση: ψάχνεις υποψήφιους, βλέπεις το cost να ανεβαίνει, διαλέγεις ship και βλέπεις αμέσως αν πληρούνται οι όροι του Captain. Και οι αυτόματες ομάδες έγιναν πιο αυστηρές, κρατώντας μόνο όσες ο Captain Ability καλύπτει ολόκληρο το crew. Για VS και διπλούς Captain διαλέγεις πλέον σε ποιο σκέλος της ability θα στηριχτείς, και κάθε χαρακτήρας δείχνει σε ποιο σκέλος ανήκει.',
    added: [
      {
        en: 'Manual Team Builder: fill each slot yourself, search candidates, keep an eye on cost and pick your ship',
        el: 'Manual Team Builder: γεμίζεις μόνος σου κάθε θέση, ψάχνεις υποψήφιους, προσέχεις το cost και διαλέγεις ship',
      },
      {
        en: 'Choose which branch of a VS or dual-character Captain the team is built around, with a branch label on every character',
        el: 'Επιλέγεις σε ποιο branch ενός VS ή διπλού Captain στηρίζεται η ομάδα, με ετικέτα branch σε κάθε χαρακτήρα',
      },
      {
        en: 'A live Captain condition status while you build by hand',
        el: 'Ζωντανή ένδειξη για τους όρους του Captain όσο χτίζεις με το χέρι',
      },
    ],
    improved: [
      {
        en: 'Automatic teams must now have the Captain Ability covering every crew member, and leaders are chosen accordingly',
        el: 'Οι αυτόματες ομάδες πρέπει πλέον να έχουν Captain Ability που καλύπτει όλο το crew, και οι leaders επιλέγονται ανάλογα',
      },
      {
        en: 'Captain coverage reads VS and dual-character leaders correctly instead of mixing their two sides',
        el: 'Το captain coverage διαβάζει σωστά τους VS και διπλούς leaders αντί να μπερδεύει τα δύο τους σκέλη',
      },
      {
        en: 'Clearer, roomier action buttons on each manual candidate',
        el: 'Πιο καθαρά και πιο άνετα κουμπιά ενεργειών σε κάθε υποψήφιο στο manual',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.33',
    date: '2026-05-09',
    headline: {
      en: 'A lighter, smoother navigation menu',
      el: 'Πιο ελαφρύ και ομαλό μενού πλοήγησης',
    },
    summaryEn:
      'The side navigation menu was stripped of its heavy blur and glow effects, so it slides open smoothly even on slower phones. The whole menu now scrolls as one, which means the language flags at the bottom stay reachable on short screens instead of being trapped below an inner scroll area.',
    summaryEl:
      'Το πλαϊνό μενού πλοήγησης έχασε τα βαριά εφέ θολώματος και λάμψης, οπότε ανοίγει ομαλά ακόμα και σε πιο αργά κινητά. Πλέον κυλάει όλο μαζί, που σημαίνει ότι οι σημαίες γλώσσας στο κάτω μέρος φτάνονται πάντα σε μικρές οθόνες, αντί να μένουν κλεισμένες μέσα σε ξεχωριστή περιοχή κύλισης.',
    added: [],
    improved: [
      {
        en: 'The navigation menu opens and animates smoothly, without the heavy blur behind it.',
        el: 'Το μενού πλοήγησης ανοίγει και κινείται ομαλά, χωρίς το βαρύ θόλωμα από πίσω.',
      },
      {
        en: 'The menu scrolls as a whole, so the language flags at the bottom are always reachable on small screens.',
        el: 'Το μενού κυλάει ενιαία, οπότε οι σημαίες γλώσσας στο τέλος είναι πάντα προσβάσιμες σε μικρές οθόνες.',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.32',
    date: '2026-05-09',
    headline: {
      en: 'Behind-the-scenes tidy-up only',
      el: 'Μόνο τεχνική τακτοποίηση',
    },
    summaryEn:
      'Nothing changed on any screen in this one. It only cleaned up how the app is built and dropped some packages that were no longer used.',
    summaryEl:
      'Σε αυτή την έκδοση δεν άλλαξε τίποτα σε καμία οθόνη. Έγινε μόνο τακτοποίηση στον τρόπο που χτίζεται η εφαρμογή και αφαιρέθηκαν πακέτα που δεν χρησιμοποιούνταν πια.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.31',
    date: '2026-05-09',
    userVisible: false,
    headline: {
      en: 'Housekeeping release, nothing to see',
      el: 'Έκδοση συντήρησης, τίποτα ορατό',
    },
    summaryEn:
      'This one only touched the build setup and a few background libraries. Nothing changed in how the app looks or behaves.',
    summaryEl:
      'Αυτή η έκδοση άγγιξε μόνο τη διαδικασία build και μερικές βιβλιοθήκες που τρέχουν από πίσω. Τίποτα δεν άλλαξε στην εμφάνιση ή στη συμπεριφορά της εφαρμογής.',
    added: [],
    improved: [],
    fixed: [],
  },
  {
    version: '0.0.30',
    date: '2026-05-09',
    headline: {
      en: 'No visible change in this release',
      el: 'Καμία ορατή αλλαγή σε αυτή την έκδοση',
    },
    summaryEn:
      'This one only touched how the app gets built and published: character data is now refreshed before each new version goes out. Nothing changed in the app itself.',
    summaryEl:
      'Αυτή η έκδοση άγγιξε μόνο τον τρόπο που χτίζεται και δημοσιεύεται η εφαρμογή: τα δεδομένα των χαρακτήρων ανανεώνονται πλέον πριν βγει κάθε νέα έκδοση. Μέσα στην εφαρμογή δεν άλλαξε τίποτα.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.29',
    date: '2026-05-09',
    headline: {
      en: 'Housekeeping release, nothing visible',
      el: 'Έκδοση συντήρησης, χωρίς ορατή αλλαγή',
    },
    summaryEn:
      'This release carried no changes you can see or use in the app. It exists only to move the version number forward.',
    summaryEl:
      'Αυτή η έκδοση δεν έφερε καμία αλλαγή που να τη δεις ή να τη χρησιμοποιήσεις μέσα στην εφαρμογή. Βγήκε μόνο για να προχωρήσει η αρίθμηση των εκδόσεων.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.28',
    date: '2026-05-08',
    userVisible: true,
    headline: {
      en: 'Cost filter and bulk edits in Character Boxes',
      el: 'Φίλτρο cost και μαζικές ενέργειες στα Character Boxes',
    },
    summaryEn:
      'Character Boxes can now be narrowed by cost. Set a minimum and a maximum and only the units that fit show up, and the new bulk controls let you add or remove the whole filtered selection at once instead of tapping character after character.',
    summaryEl:
      'Τα Character Boxes φιλτράρονται πλέον και με βάση το cost. Βάζεις ελάχιστο και μέγιστο και βλέπεις μόνο όσους χωράνε, ενώ με τις νέες μαζικές ενέργειες προσθέτεις ή αφαιρείς όλη τη φιλτραρισμένη επιλογή με μια κίνηση, αντί για έναν-έναν.',
    added: [
      {
        en: 'Minimum and maximum cost filter in Character Boxes',
        el: 'Φίλτρο ελάχιστου και μέγιστου cost στα Character Boxes',
      },
      {
        en: 'Add or remove every filtered character in one action',
        el: 'Πρόσθεση ή αφαίρεση όλων των φιλτραρισμένων χαρακτήρων με μία ενέργεια',
      },
    ],
    improved: [],
    fixed: [],
  },
  {
    version: '0.0.27',
    date: '2026-05-07',
    userVisible: true,
    headline: {
      en: 'A tidier menu, grouped by what you do',
      el: 'Πιο τακτοποιημένο μενού, ανά χρήση',
    },
    summaryEn:
      'The side menu is no longer one long list. Its entries are now sorted into Browse, Build, and Saved & Sync, and only one group stays open at a time, so the screen you want is visible without scrolling.',
    summaryEl:
      'Το πλαϊνό μενού δεν είναι πια μία ατέλειωτη λίστα. Οι επιλογές του χωρίστηκαν σε Περιήγηση, Χτίσιμο και Αποθήκευση & Sync, και μένει ανοιχτή μία ομάδα κάθε φορά, ώστε να βλέπεις τη σελίδα που θέλεις χωρίς scroll.',
    added: [],
    improved: [
      {
        en: 'The side menu groups its screens into Browse, Build and Saved & Sync, opening one group at a time.',
        el: 'Το πλαϊνό μενού ομαδοποιεί τις σελίδες σε Περιήγηση, Χτίσιμο και Αποθήκευση & Sync, ανοίγοντας μία ομάδα τη φορά.',
      },
    ],
    fixed: [],
  },
  {
    version: '0.0.26',
    date: '2026-05-07',
    headline: {
      en: 'Stricter Auto Team Builder requirements',
      el: 'Πιο αυστηρές απαιτήσεις στον Auto Team Builder',
    },
    summaryEn:
      'The Auto Team Builder can now be told to respect more of what a fight actually asks for: Super Tandem criteria, Super Special criteria, and that both Captains cover the boost on their own rather than only as a pair. You can also narrow the search to specific character tags or names, with suggestions as you type, and save the whole setup to a file so you can reuse it later. While a build runs, the progress panel tells you which leader pair it is on, how many candidates it has checked and how long the current step has taken.',
    summaryEl:
      'Ο Auto Team Builder μπορεί πλέον να λάβει υπόψη πολύ περισσότερα από όσα ζητάει μια μάχη: Super Tandem criteria, Super Special criteria, αλλά και να απαιτεί να καλύπτουν και οι δύο Captain το boost από μόνοι τους, όχι μόνο σαν ζευγάρι. Μπορείς επίσης να περιορίσεις την αναζήτηση σε συγκεκριμένα tags ή ονόματα χαρακτήρων, με προτάσεις καθώς πληκτρολογείς, και να αποθηκεύσεις όλο το setup σε αρχείο για να το ξαναχρησιμοποιήσεις. Όσο τρέχει το build, το panel προόδου σου δείχνει σε ποιο leader pair βρίσκεται, πόσους υποψήφιους έχει ελέγξει και πόση ώρα κρατάει το τρέχον βήμα.',
    added: [
      {
        en: 'Require the team to cover the Super Tandem criteria',
        el: 'Απαίτηση η ομάδα να καλύπτει τα Super Tandem criteria',
      },
      {
        en: 'Require the team to cover the Super Special criteria',
        el: 'Απαίτηση η ομάδα να καλύπτει τα Super Special criteria',
      },
      {
        en: 'Option to demand full Captain Ability coverage from both leaders, not just from the pair combined',
        el: 'Επιλογή να ζητάς πλήρη κάλυψη Captain Ability και από τους δύο leaders, όχι μόνο από το ζευγάρι συνολικά',
      },
      {
        en: 'Narrow the search to specific character tags or names, with suggestions while you type',
        el: 'Περιορισμός της αναζήτησης σε συγκεκριμένα tags ή ονόματα χαρακτήρων, με προτάσεις καθώς γράφεις',
      },
      {
        en: 'Download your build setup as a file so you can load it again later',
        el: 'Κατέβασμα του setup σου σε αρχείο, για να το φορτώσεις ξανά αργότερα',
      },
    ],
    improved: [
      {
        en: 'The progress panel now shows the leader pair being tried, candidates checked, characters ruled out and time spent on the current step',
        el: 'Το panel προόδου δείχνει πλέον το leader pair που δοκιμάζεται, πόσοι υποψήφιοι ελέγχθηκαν, πόσοι αποκλείστηκαν και πόση ώρα κρατάει το τρέχον βήμα',
      },
    ],
    fixed: [
      {
        en: 'Captain Ability effects are no longer counted as special abilities, so asking for an effect no longer matches a character that only has it on their Captain Ability',
        el: 'Τα effects του Captain Ability δεν μετράνε πια ως special abilities, οπότε όταν ζητάς ένα effect δεν σου βγαίνει χαρακτήρας που το έχει μόνο στο Captain Ability του',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.25',
    date: '2026-05-03',
    headline: {
      en: "Build around the Captain's own ability",
      el: 'Χτίσε γύρω από το Captain Ability',
    },
    summaryEn:
      "Auto Team Builder learned to build around a Captain's own ability. You can ask for captain ability requirements, pin a specific character into a manual slot and have the builder respect it, and say how much leader boost a unit must actually receive. Teams now also show whether the Captain's conditions are really met. On top of that, the site gained readable guide pages on team building, Auto Team Builder and Pirate Rumble.",
    summaryEl:
      'Ο Auto Team Builder έμαθε να χτίζει γύρω από το ίδιο το Captain Ability. Μπορείς να ζητήσεις captain ability requirements, να καρφώσεις συγκεκριμένο χαρακτήρα σε μια χειροκίνητη θέση και να ορίσεις πόσο leader boost πρέπει όντως να παίρνει μια μονάδα. Οι ομάδες δείχνουν πλέον και αν πληρούνται πραγματικά οι προϋποθέσεις του Captain. Μπήκαν επίσης σελίδες-οδηγοί για team building, Auto Team Builder και Pirate Rumble.',
    added: [
      {
        en: 'Captain ability requirements in Auto Team Builder, with a picker and summary chips showing what you asked for.',
        el: 'Captain ability requirements στον Auto Team Builder, με picker και chips που δείχνουν τι ζήτησες.',
      },
      {
        en: 'Lock a specific character into a manual slot, and the builder keeps it there.',
        el: 'Κλείδωμα συγκεκριμένου χαρακτήρα σε χειροκίνητη θέση, που ο builder τη σέβεται.',
      },
      {
        en: 'Leader boost controls: pick the priority and the boost range a unit has to fall in.',
        el: 'Έλεγχοι leader boost: διαλέγεις προτεραιότητα και το εύρος boost που πρέπει να πιάνει μια μονάδα.',
      },
      {
        en: "A status line telling you whether your team satisfies the Captain's conditions.",
        el: 'Ένδειξη που σου λέει αν η ομάδα σου καλύπτει τις προϋποθέσεις του Captain.',
      },
      {
        en: 'Guide pages for team building, Auto Team Builder, Pirate Rumble and the character database.',
        el: 'Σελίδες-οδηγοί για team building, Auto Team Builder, Pirate Rumble και τη βάση χαρακτήρων.',
      },
    ],
    improved: [
      {
        en: 'When an exact team is possible the builder tries that first, and when it is not, it relaxes the search more sensibly.',
        el: 'Όταν υπάρχει ακριβής ομάδα, ο builder τη δοκιμάζει πρώτη, και όταν δεν υπάρχει, χαλαρώνει την αναζήτηση πιο λογικά.',
      },
      {
        en: 'Clearer messages when an ability or battle requirement cannot be satisfied.',
        el: 'Πιο καθαρά μηνύματα όταν μια απαίτηση ικανότητας ή μάχης δεν μπορεί να ικανοποιηθεί.',
      },
    ],
    fixed: [
      {
        en: 'Special Bind no longer counts as plain Bind, so Bind filters stop pulling in the wrong characters.',
        el: 'Το Special Bind δεν μετράει πια ως απλό Bind, οπότε τα φίλτρα Bind σταματούν να βγάζουν λάθος χαρακτήρες.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.24',
    date: '2026-05-01',
    userVisible: false,
    headline: {
      en: 'Site moves to its own address',
      el: 'Το site πάει στη δική του διεύθυνση',
    },
    summaryEn:
      'A housekeeping release. Links, the sitemap and the records search engines read now point at optcteambuilder.com instead of the old address. Nothing inside the app looks or behaves differently.',
    summaryEl:
      'Release συντήρησης. Τα links, το sitemap και όσα διαβάζουν οι μηχανές αναζήτησης δείχνουν πλέον στο optcteambuilder.com αντί για την παλιά διεύθυνση. Μέσα στην εφαρμογή δεν αλλάζει τίποτα.',
    added: [],
    improved: [],
    fixed: [],
  },
  {
    version: '0.0.23',
    date: '2026-05-01',
    headline: {
      en: 'Captain Coverage arrives, Auto Builder handles several battles',
      el: 'Έρχεται το Captain Coverage, ο Auto Builder πιάνει πολλές μάχες',
    },
    summaryEn:
      'Captain Coverage is the big new page: pick a Captain and see every character its Captain Ability actually boosts, with search, favorites-only, a team cost limit, sorting, and filters for Special, Crewmate, Potential and Support abilities. Auto Team Builder setups can now describe several battles in a row and demand groups of characters ("two units with this ability"), and Saved Enemies stores the whole thing. The old separate Team Builder page is gone — manual slot-by-slot building lives inside Auto Team Builder now.',
    summaryEl:
      'Το Captain Coverage είναι η μεγάλη νέα σελίδα: διαλέγεις έναν Captain και βλέπεις όλους τους χαρακτήρες που πραγματικά boostάρει η Captain Ability του, με αναζήτηση, μόνο favorites, όριο team cost, ταξινόμηση και φίλτρα για Special, Crewmate, Potential και Support abilities. Τα setup του Auto Team Builder μπορούν τώρα να περιγράφουν πολλές μάχες στη σειρά και να ζητούν ομάδες χαρακτήρων («δύο units με αυτή την ability»), και τα Saved Enemies τα κρατούν όλα. Η παλιά ξεχωριστή σελίδα Team Builder καταργήθηκε — το χτίσιμο slot προς slot γίνεται πλέον μέσα στον Auto Team Builder.',
    added: [
      {
        en: 'Captain Coverage page: choose a Captain and see everyone their Captain Ability boosts.',
        el: 'Σελίδα Captain Coverage: διαλέγεις Captain και βλέπεις ποιους boostάρει η Captain Ability του.',
      },
      {
        en: 'Filter Captain Coverage by Special, Crewmate, Potential and Support abilities.',
        el: 'Φιλτράρισμα στο Captain Coverage με Special, Crewmate, Potential και Support abilities.',
      },
      {
        en: 'Search, favorites-only, team cost limit and sorting on the Captain Coverage results.',
        el: 'Αναζήτηση, μόνο favorites, όριο team cost και ταξινόμηση στα αποτελέσματα του Captain Coverage.',
      },
      {
        en: 'An Auto Team Builder setup can hold several battles in a row, and Saved Enemies keeps all of them.',
        el: 'Ένα setup στον Auto Team Builder μπορεί να έχει πολλές μάχες στη σειρά, και τα Saved Enemies τις κρατούν όλες.',
      },
      {
        en: 'Required character groups: ask for a set number of characters carrying a given ability.',
        el: 'Required character groups: ζητάς συγκεκριμένο αριθμό χαρακτήρων που έχουν μια ability.',
      },
      {
        en: 'The character picker can show favorites only, or leave out hidden characters.',
        el: 'Ο character picker μπορεί να δείχνει μόνο favorites ή να αφήνει έξω τους κρυμμένους χαρακτήρες.',
      },
    ],
    improved: [
      {
        en: 'The same ability requirement can now be added twice and stays twice, instead of being silently merged.',
        el: 'Η ίδια ability requirement μπορεί πλέον να μπει δύο φορές και να μείνει δύο φορές, αντί να συγχωνεύεται στα κρυφά.',
      },
      {
        en: 'Manual slot-by-slot team building moved into Auto Team Builder; the standalone Team Builder page was retired.',
        el: 'Το χειροκίνητο χτίσιμο slot προς slot μεταφέρθηκε στον Auto Team Builder· η ξεχωριστή σελίδα Team Builder καταργήθηκε.',
      },
      {
        en: 'Analytics now run behind a consent choice you make yourself.',
        el: 'Τα analytics τρέχουν πλέον μόνο αν δώσεις εσύ τη συγκατάθεσή σου.',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.22',
    date: '2026-04-30',
    headline: {
      en: 'Separate cost limits for Captains and crew',
      el: 'Ξεχωριστά όρια cost για Captains και πλήρωμα',
    },
    summaryEn:
      'The Auto Team Builder can now treat your Captain slots differently from the rest of the crew. You set one cost range for the Captain and Friend Captain and another for the four crew slots, so you can leave room for an expensive Captain without the builder spending your whole budget on subs. Teams you had already saved keep working exactly as before.',
    summaryEl:
      'Ο Auto Team Builder μπορεί πλέον να ξεχωρίζει τις θέσεις των Captain από το υπόλοιπο πλήρωμα. Ορίζεις ένα εύρος cost για Captain και Friend Captain και ένα άλλο για τις τέσσερις θέσεις του πληρώματος, ώστε να μένει χώρος για έναν ακριβό Captain χωρίς να φεύγει όλο το budget στα subs. Ό,τι είχες ήδη αποθηκευμένο δουλεύει ακριβώς όπως πριν.',
    added: [
      {
        en: 'Separate cost ranges in the Auto Team Builder: one for the Captain and Friend Captain, one for the rest of the crew.',
        el: 'Ξεχωριστά εύρη cost στον Auto Team Builder: ένα για Captain και Friend Captain, ένα για το υπόλοιπο πλήρωμα.',
      },
      {
        en: 'You can also pick which characters are allowed to fill the Captain slots and which can fill the crew slots.',
        el: 'Μπορείς επίσης να διαλέξεις ποιοι χαρακτήρες επιτρέπεται να μπουν στις θέσεις Captain και ποιοι στις θέσεις του πληρώματος.',
      },
    ],
    improved: [
      {
        en: 'Older saved auto-build setups still load and build the same teams.',
        el: 'Οι παλιότερες αποθηκευμένες ρυθμίσεις auto-build φορτώνουν και βγάζουν τις ίδιες ομάδες.',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.21',
    date: '2026-04-30',
    headline: {
      en: 'New Rumble characters page and box filter',
      el: 'Νέα σελίδα Rumble characters και φίλτρο box',
    },
    summaryEn:
      'There is now a page just for Rumble characters, where you search by name and filter by type, class and role, and mark or hide favourites. The Auto Team Builder can also stick to the characters in your box, so it stops suggesting units you do not own. Special abilities are picked with turn controls you can edit before you apply them.',
    summaryEl:
      'Υπάρχει πλέον ξεχωριστή σελίδα για τους Rumble χαρακτήρες, όπου ψάχνεις με το όνομα και φιλτράρεις ανά type, class και role, ενώ βάζεις ή κρύβεις αγαπημένα. Ο Auto Team Builder μπορεί επίσης να μείνει μόνο στους χαρακτήρες του box σου, ώστε να μη σου προτείνει units που δεν έχεις. Τα special abilities επιλέγονται με πεδία turn που τα αλλάζεις πριν τα εφαρμόσεις.',
    added: [
      {
        en: 'Rumble characters page with search, type, class and role filters, favourites and a hide-favourites switch',
        el: 'Σελίδα Rumble characters με αναζήτηση, φίλτρα type, class και role, αγαπημένα και διακόπτη απόκρυψης αγαπημένων',
      },
      {
        en: 'Box filter in the Auto Team Builder, so teams are built only from characters you actually have',
        el: 'Φίλτρο box στον Auto Team Builder, ώστε οι ομάδες να χτίζονται μόνο από χαρακτήρες που έχεις',
      },
      {
        en: 'Special ability picker with editable turn values that you confirm before they apply',
        el: 'Special ability picker με πεδία turn που αλλάζεις και επιβεβαιώνεις πριν εφαρμοστούν',
      },
    ],
    improved: [],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.20',
    date: '2026-04-30',
    headline: {
      en: 'Pirate Rumble gets its own team builder',
      el: 'Ο Rumble αποκτά δικό του team builder',
    },
    summaryEn:
      "This is the big Rumble release. There is now a separate Auto Team Builder for Pirate Rumble: you enter the opponent's team, say which buffs matter most to you, keep the build inside the Rumble cost, and compare the teams it produces before you keep one. Finished teams go to a new Saved Rumble Teams page, and settings and teams can be exported and imported. The Characters page also filters faster, and there is a new Drive Sync page for keeping your data on Google Drive.",
    summaryEl:
      'Αυτή είναι η μεγάλη έκδοση για το Rumble. Υπάρχει πλέον ξεχωριστός Auto Team Builder για το Pirate Rumble: βάζεις την ομάδα του αντιπάλου, δηλώνεις ποια buffs σε ενδιαφέρουν περισσότερο, κρατάς το build μέσα στο Rumble cost και συγκρίνεις τις ομάδες που βγάζει πριν κρατήσεις μία. Οι έτοιμες ομάδες πάνε στη νέα σελίδα Saved Rumble Teams, ενώ ομάδες και ρυθμίσεις μπορούν να γίνουν export και import. Η σελίδα Characters φιλτράρει πιο γρήγορα και προστέθηκε σελίδα Drive Sync για να κρατάς τα δεδομένα σου στο Google Drive.',
    added: [
      {
        en: 'Auto Team Builder for Pirate Rumble, with export and import of teams and settings.',
        el: 'Auto Team Builder για το Pirate Rumble, με export και import ομάδων και ρυθμίσεων.',
      },
      {
        en: 'Saved Rumble Teams page: load, edit and delete your Rumble crews.',
        el: 'Σελίδα Saved Rumble Teams: φόρτωση, επεξεργασία και διαγραφή των Rumble ομάδων σου.',
      },
      {
        en: 'Buff focus: rank which stats you care about most, and which to ignore entirely.',
        el: 'Buff focus: βάζεις σειρά προτεραιότητας στα stats που σε νοιάζουν και ποια να αγνοηθούν τελείως.',
      },
      {
        en: 'Opponent awareness: enter the enemy team so debuffs are aimed at the active slots before the bench.',
        el: 'Opponent awareness: βάζεις την ομάδα του αντιπάλου ώστε τα debuffs να πηγαίνουν πρώτα στις ενεργές θέσεις και μετά στον πάγκο.',
      },
      {
        en: 'Optional bench slots, so you can build with or without reserves.',
        el: 'Προαιρετικές θέσεις πάγκου, για build με ή χωρίς ρεζέρβες.',
      },
      {
        en: 'Closest cost mode: get the strongest team that lands as close as possible to your Rumble cost.',
        el: 'Λειτουργία closest cost: βγάζει την πιο δυνατή ομάδα που πλησιάζει όσο γίνεται το Rumble cost σου.',
      },
      {
        en: 'Exclude characters you never want the builder to pick.',
        el: 'Εξαίρεση χαρακτήρων που δεν θέλεις να διαλέγει ποτέ ο builder.',
      },
      {
        en: 'A total buff summary for the team the builder produced.',
        el: 'Συνολική σύνοψη buffs για την ομάδα που έβγαλε ο builder.',
      },
      {
        en: 'Drive Sync page for storing your data on Google Drive.',
        el: 'Σελίδα Drive Sync για αποθήκευση των δεδομένων σου στο Google Drive.',
      },
    ],
    improved: [
      {
        en: 'Two generated teams can be compared side by side — score, Rumble cost, roles, types and buffs — while the build progress is shown as it runs.',
        el: 'Δύο ομάδες συγκρίνονται πλέον δίπλα δίπλα — σκορ, Rumble cost, ρόλοι, types και buffs — ενώ βλέπεις και την πρόοδο του build καθώς τρέχει.',
      },
      {
        en: 'The Characters page opens in compact view, and each active filter shows as a badge you can remove on its own or clear a whole category at once.',
        el: 'Η σελίδα Characters ανοίγει σε compact προβολή και κάθε ενεργό φίλτρο εμφανίζεται ως badge που το βγάζεις μεμονωμένα ή καθαρίζεις ολόκληρη την κατηγορία.',
      },
      {
        en: 'Replacing a slot by hand now suggests similar characters instead of leaving you to search blind.',
        el: 'Όταν αλλάζεις μια θέση με το χέρι, σου προτείνονται πλέον παρόμοιοι χαρακτήρες αντί να ψάχνεις στα τυφλά.',
      },
      {
        en: 'Buff tooltips are easier to read.',
        el: 'Τα tooltips των buffs διαβάζονται πιο εύκολα.',
      },
      {
        en: 'The home page shows real content immediately while the app is still loading.',
        el: 'Η αρχική σελίδα δείχνει κανονικό περιεχόμενο αμέσως, όσο η εφαρμογή ακόμα φορτώνει.',
      },
    ],
    fixed: [
      {
        en: '"Cora" is now recognised as the same person as Corazon / Donquixote Rosinante, so the builder stops putting two of him on one team.',
        el: 'Το «Cora» αναγνωρίζεται πλέον ως ο ίδιος με τον Corazon / Donquixote Rosinante, οπότε ο builder δεν βάζει δύο φορές τον ίδιο στην ομάδα.',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.19',
    date: '2026-04-28',
    headline: {
      en: 'Auto Team Builder gets real filters',
      el: 'Ο Auto Team Builder αποκτά πραγματικά φίλτρα',
    },
    summaryEn:
      'This is the release where you can finally tell the Auto Team Builder exactly what you want: a cost budget, a minimum and maximum leader ATK and HP boost, and whether a required ability has to sit on the Captain or on a crew slot. You can also exclude a whole Character Box in one move and copy your manual picks from one slot into others. On top of that, Characters, Character Boxes and Team Builder get sorting and a "hide favorites" filter, and the site opens on a proper homepage.',
    summaryEl:
      'Σε αυτή την έκδοση ο Auto Team Builder αρχίζει να ακούει τι ακριβώς ζητάς: όριο cost, ελάχιστο και μέγιστο leader boost σε ATK και HP, και αν μια ικανότητα πρέπει να βρίσκεται στον Captain ή σε crew slot. Μπορείς επίσης να κόψεις ολόκληρο Character Box με μία κίνηση και να αντιγράψεις τις χειροκίνητες επιλογές σου από ένα slot σε άλλα. Παράλληλα, οι Χαρακτήρες, τα Character Boxes και ο Team Builder αποκτούν ταξινόμηση και φίλτρο «κρύψε τα αγαπημένα», ενώ το site ανοίγει πια σε κανονική αρχική σελίδα.',
    added: [
      {
        en: 'Cost range in Auto Team Builder: set a minimum and maximum cost and only get teams that fit it',
        el: 'Εύρος cost στον Auto Team Builder: βάζεις ελάχιστο και μέγιστο και παίρνεις μόνο ομάδες που χωράνε',
      },
      {
        en: 'Ask for a specific leader boost: minimum and maximum ATK and HP multipliers, plus filtering and sorting captains by how much they boost',
        el: 'Ζητάς συγκεκριμένο leader boost: ελάχιστο και μέγιστο πολλαπλασιαστή σε ATK και HP, με φίλτρα και ταξινόμηση captains ανά boost',
      },
      {
        en: 'Ability requirements can now target a slot: Captain only, a crew slot only, or anywhere on the team',
        el: 'Οι απαιτήσεις ικανοτήτων μπορούν πλέον να στοχεύουν slot: μόνο Captain, μόνο crew slot, ή οπουδήποτε στην ομάδα',
      },
      {
        en: 'Exclude an entire Character Box at once instead of ticking characters one by one',
        el: 'Εξαιρείς ολόκληρο Character Box με μιας, αντί να τσεκάρεις χαρακτήρες έναν έναν',
      },
      {
        en: 'Copy manual picks from one slot into one or more other slots, with duplicates skipped',
        el: 'Αντιγράφεις χειροκίνητες επιλογές από ένα slot σε ένα ή περισσότερα άλλα, χωρίς διπλά',
      },
      {
        en: 'Sort Characters, Character Boxes and Team Builder by name A-Z or Z-A, by newest or oldest character, or by captain boost',
        el: 'Ταξινόμηση σε Χαρακτήρες, Character Boxes και Team Builder: όνομα Α-Ω ή Ω-Α, νεότεροι ή παλαιότεροι χαρακτήρες, ή captain boost',
      },
      {
        en: '"Hide favorites" filter, so the characters you already flagged stay out of the results',
        el: 'Φίλτρο «κρύψε τα αγαπημένα», για να μένουν εκτός αποτελεσμάτων όσοι χαρακτήρες έχεις ήδη σημειώσει',
      },
      {
        en: 'A real homepage that points at the main tools, with clearer page titles and descriptions throughout',
        el: 'Κανονική αρχική σελίδα που οδηγεί στα βασικά εργαλεία, με πιο καθαρούς τίτλους και περιγραφές παντού',
      },
    ],
    improved: [
      {
        en: 'Locking manual picks no longer strangles the search: the builder finds far more valid teams around the characters you insisted on',
        el: 'Το κλείδωμα χειροκίνητων επιλογών δεν στραγγαλίζει πια την αναζήτηση: ο builder βρίσκει πολύ περισσότερες έγκυρες ομάδες γύρω από τους χαρακτήρες που επέμεινες',
      },
      {
        en: 'Captain abilities are read more accurately, with ATK and HP boosts kept apart and conditional boosts understood (Brook among the ones that were wrong)',
        el: 'Οι captain abilities διαβάζονται πιο σωστά: τα boosts σε ATK και HP δεν μπερδεύονται μεταξύ τους και τα conditional boosts αναγνωρίζονται (ο Brook ήταν ένας από αυτούς που έβγαιναν λάθος)',
      },
      {
        en: 'When the same character exists in several versions, the builder now reaches for the newer one',
        el: 'Όταν ο ίδιος χαρακτήρας υπάρχει σε πολλές εκδοχές, ο builder πιάνει πλέον τη νεότερη',
      },
      {
        en: 'Super Type, Super Class and Super Special requirements are applied to every slot consistently',
        el: 'Οι απαιτήσεις Super Type, Super Class και Super Special εφαρμόζονται με συνέπεια σε κάθε slot',
      },
      {
        en: 'Google Drive backup in Settings asks clearer questions and the manual sync is simpler to follow',
        el: 'Το backup στο Google Drive στις Ρυθμίσεις ρωτάει πιο καθαρά και το χειροκίνητο sync είναι πιο απλό',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.18',
    date: '2026-04-26',
    userVisible: true,
    headline: {
      en: 'Send a suggested character to a manual slot',
      el: 'Στείλε προτεινόμενο χαρακτήρα σε χειροκίνητη θέση',
    },
    summaryEn:
      'When the builder suggests a team, you can now take any character from that result and drop it straight into a manual slot, then keep building the rest around it. Search and filters were regrouped on the Characters and Team Builder pages so the controls sit where you expect them, and a couple of duplicated pickers were taken off the character boxes page. The Team Builder page also opens with a short intro explaining what the tool does, and there is now a plain page listing every public page of the site.',
    summaryEl:
      'Όταν ο builder σου προτείνει μια ομάδα, μπορείς πλέον να πάρεις όποιον χαρακτήρα θέλεις από το αποτέλεσμα και να τον βάλεις κατευθείαν σε χειροκίνητη θέση, και μετά να χτίσεις τα υπόλοιπα γύρω του. Η αναζήτηση και τα φίλτρα αναδιατάχθηκαν στις σελίδες Characters και Team Builder ώστε τα κουμπιά να είναι εκεί που τα περιμένεις, ενώ έφυγαν και δύο διπλά picker από τη σελίδα με τα character boxes. Η σελίδα Team Builder ανοίγει τώρα με μια σύντομη εισαγωγή για το τι κάνει το εργαλείο, και υπάρχει και μια απλή σελίδα με όλες τις δημόσιες σελίδες.',
    added: [
      {
        en: "Add a character from the builder's result straight into a manual slot",
        el: 'Προσθήκη χαρακτήρα από το αποτέλεσμα του builder κατευθείαν σε χειροκίνητη θέση',
      },
      {
        en: 'A sitemap page listing every public page of the site',
        el: 'Σελίδα sitemap με όλες τις δημόσιες σελίδες του site',
      },
    ],
    improved: [
      {
        en: 'Search and filters regrouped on the Characters and Team Builder pages',
        el: 'Αναδιάταξη αναζήτησης και φίλτρων στις σελίδες Characters και Team Builder',
      },
      {
        en: 'A short intro on the Team Builder page explaining what it does',
        el: 'Σύντομη εισαγωγή στη σελίδα Team Builder που εξηγεί τι κάνει',
      },
      {
        en: 'Two unused pickers removed from the character boxes page, so there is less to scroll past',
        el: 'Αφαιρέθηκαν δύο αχρησιμοποίητα picker από τη σελίδα με τα character boxes, οπότε έχεις λιγότερο scroll',
      },
      {
        en: 'The app is easier to find through a search engine',
        el: 'Η εφαρμογή βρίσκεται πιο εύκολα μέσα από μηχανή αναζήτησης',
      },
    ],
    fixed: [],
  },
  {
    version: '0.0.17',
    date: '2026-04-24',
    headline: {
      en: 'See every ability a character has',
      el: 'Δες όλες τις ικανότητες ενός χαρακτήρα',
    },
    summaryEn:
      'In the team builder and in your Character Boxes, each character now shows their abilities grouped by where they come from — Captain, Special, sailor, support — with a count for each group. Abilities that match what you are filtering for are highlighted, so you can size a character up without opening their page.',
    summaryEl:
      'Στο team builder και στα Boxes χαρακτήρων, κάθε χαρακτήρας δείχνει τώρα τις ικανότητές του ομαδοποιημένες ανά προέλευση — Captain, Special, sailor, support — με το πλήθος της κάθε ομάδας. Όσες ταιριάζουν με το φίλτρο σου τονίζονται, οπότε κρίνεις τον χαρακτήρα χωρίς να ανοίξεις τη σελίδα του.',
    added: [
      {
        en: 'An ability breakdown on character cards in the team builder and Character Boxes, grouped by Captain, Special, sailor and support.',
        el: 'Ανάλυση ικανοτήτων στις κάρτες χαρακτήρων στο team builder και στα Boxes χαρακτήρων, χωρισμένη σε Captain, Special, sailor και support.',
      },
      {
        en: 'The abilities that match your current filter are highlighted inside that breakdown.',
        el: 'Οι ικανότητες που ταιριάζουν με το τρέχον φίλτρο σου τονίζονται μέσα σε αυτή την ανάλυση.',
      },
    ],
    improved: [],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.16',
    date: '2026-04-24',
    headline: {
      en: 'Character names become real links',
      el: 'Τα ονόματα χαρακτήρων γίνονται σύνδεσμοι',
    },
    summaryEn:
      "Character names on the Characters page and inside the team builder are now real links to the character's page, so opening a character is a single tap and the back button behaves the way you expect. The Auto Team Builder also got cleaner buttons and clearer feedback while a team is being put together.",
    summaryEl:
      'Τα ονόματα στη σελίδα Characters και μέσα στον team builder είναι πλέον κανονικοί σύνδεσμοι προς τη σελίδα του χαρακτήρα, οπότε ανοίγεις έναν χαρακτήρα με ένα πάτημα και το κουμπί επιστροφής δουλεύει όπως περιμένεις. Ο Auto Team Builder πήρε επίσης πιο καθαρά κουμπιά και σαφέστερη ενημέρωση όσο χτίζεται η ομάδα.',
    added: [],
    improved: [
      {
        en: 'Opening a character from Characters or the team builder is one tap on its name, and works with the back button and screen readers.',
        el: 'Ανοίγεις έναν χαρακτήρα από τα Characters ή τον team builder με ένα πάτημα στο όνομά του, και δουλεύει σωστά με το back και με τους αναγνώστες οθόνης.',
      },
      {
        en: 'Auto Team Builder buttons look tidier and say more clearly what is happening while a team is built.',
        el: 'Τα κουμπιά του Auto Team Builder είναι πιο τακτοποιημένα και λένε πιο καθαρά τι γίνεται όσο χτίζεται η ομάδα.',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.15',
    date: '2026-04-24',
    userVisible: true,
    headline: {
      en: 'Potential and support ability filters arrive',
      el: 'Έρχονται φίλτρα για potential και support abilities',
    },
    summaryEn:
      'You can now ask for more than a special: potential and support abilities join the ability picker, so a search can demand exactly the effects you need. Pasted enemy text is read better too — the app proposes the abilities it recognised and lets you choose which ones to apply, and it keeps the original text with the saved enemy. Auto Team Builder gains an option to accept any Friend Captain, and Settings lets you control how much of your device the build is allowed to use.',
    summaryEl:
      'Πλέον δεν ζητάς μόνο specials: στο picker των abilities μπαίνουν και potential και support, ώστε η αναζήτηση να ζητάει ακριβώς τα effects που χρειάζεσαι. Το enemy text που κάνεις paste διαβάζεται καλύτερα — η εφαρμογή σου προτείνει τα abilities που αναγνώρισε και διαλέγεις ποια θα εφαρμοστούν, ενώ κρατάει και το αρχικό κείμενο μαζί με τον αποθηκευμένο εχθρό. Ο Auto Team Builder αποκτά επιλογή να δέχεται οποιονδήποτε Friend Captain, και στα Settings ρυθμίζεις πόσο θα φορτώνει τη συσκευή σου το build.',
    added: [
      {
        en: 'Potential and support abilities can now be required in Saved Enemies and the Team Builder',
        el: 'Μπορείς πλέον να ζητάς potential και support abilities σε Saved Enemies και Team Builder',
      },
      {
        en: 'A window lists the abilities found in pasted enemy text so you pick which ones to apply',
        el: 'Ένα παράθυρο δείχνει τα abilities που βρέθηκαν στο enemy text, για να διαλέξεις ποια θα εφαρμοστούν',
      },
      {
        en: 'Auto Team Builder can fill the Friend Captain slot with any character',
        el: 'Ο Auto Team Builder μπορεί να γεμίσει το Friend Captain slot με οποιονδήποτε χαρακτήρα',
      },
      {
        en: 'Settings lets you set how many parallel workers the auto build uses',
        el: 'Στα Settings ορίζεις πόσους παράλληλους workers χρησιμοποιεί το auto build',
      },
    ],
    improved: [
      {
        en: 'Enemy text parsing understands more mechanics and more wordings',
        el: 'Η ανάγνωση του enemy text καταλαβαίνει περισσότερα mechanics και περισσότερες διατυπώσεις',
      },
      {
        en: 'Saved and exported enemies keep the original text you pasted',
        el: 'Οι αποθηκευμένοι και εξαγόμενοι εχθροί κρατούν το αρχικό κείμενο που έκανες paste',
      },
      {
        en: 'More character portraits available in the pickers',
        el: 'Περισσότερα portraits χαρακτήρων διαθέσιμα στα pickers',
      },
      {
        en: 'Character editing no longer asks for max level and max EXP, which nothing used',
        el: 'Η επεξεργασία χαρακτήρα δεν ζητάει πια max level και max EXP, που δεν χρησίμευαν πουθενά',
      },
    ],
    fixed: [
      {
        en: 'An ability requirement set to 0 turns is now accepted instead of being ignored',
        el: 'Ένα ability requirement με 0 turns γίνεται πλέον δεκτό αντί να αγνοείται',
      },
    ],
  },
  {
    version: '0.0.14',
    date: '2026-04-22',
    userVisible: true,
    headline: {
      en: 'Bring your own box into the app',
      el: 'Φέρε το box σου μέσα στην εφαρμογή',
    },
    summaryEn:
      'You can now load the characters and ships you actually own into the app, either from an OPTCbx export or straight from screenshots, and check the result before anything is saved. The Auto Team Builder also tells you much more while it works: how far along it is and how long the current step has been running. Settings gained a language switcher and a clearer picture of your Google Drive backup.',
    summaryEl:
      'Τώρα μπορείς να φορτώσεις μέσα στην εφαρμογή τους χαρακτήρες και τα πλοία που πραγματικά έχεις, είτε από export του OPTCbx είτε κατευθείαν από screenshots, και να ελέγξεις το αποτέλεσμα πριν αποθηκευτεί οτιδήποτε. Ο Auto Team Builder σου λέει επίσης πολύ περισσότερα όσο δουλεύει: πόσο έχει προχωρήσει και πόση ώρα τρέχει το τρέχον βήμα. Στις Ρυθμίσεις μπήκε αλλαγή γλώσσας και πιο καθαρή εικόνα για το backup σου στο Google Drive.',
    added: [
      {
        en: 'Import Inventory in Settings: read your box from an OPTCbx JSON or from screenshots, review what matched and what did not, then save it into a character box and your favourite ships.',
        el: 'Εισαγωγή Inventory στις Ρυθμίσεις: διαβάζει το box σου από OPTCbx JSON ή από screenshots, βλέπεις τι ταίριαξε και τι όχι, και μετά το αποθηκεύεις σε ένα box χαρακτήρων και στα αγαπημένα σου πλοία.',
      },
      {
        en: 'A language switcher in the top bar, so Greek and English are one tap apart.',
        el: 'Αλλαγή γλώσσας από την πάνω μπάρα, ώστε ελληνικά και αγγλικά να απέχουν ένα πάτημα.',
      },
      {
        en: 'Ready-made Crew Forge image layouts, so your crew pictures come out framed correctly.',
        el: 'Έτοιμα layouts εικόνας στο Crew Forge, ώστε οι φωτογραφίες της ομάδας σου να βγαίνουν σωστά καδραρισμένες.',
      },
      {
        en: 'A Terms of Service page, linked from Settings and the footer.',
        el: 'Σελίδα Όρων Χρήσης, με σύνδεσμο από τις Ρυθμίσεις και το υποσέλιδο.',
      },
    ],
    improved: [
      {
        en: 'Auto Team Builder now shows an overall percentage and a live timer for the step it is on, instead of a progress bar that told you nothing.',
        el: 'Ο Auto Team Builder δείχνει πλέον συνολικό ποσοστό και ζωντανό χρονόμετρο για το βήμα που τρέχει, αντί για μια μπάρα που δεν σου έλεγε τίποτα.',
      },
      {
        en: 'Team building uses at most four workers even on powerful phones, so the app stays responsive while it searches.',
        el: 'Το χτίσιμο ομάδας χρησιμοποιεί το πολύ τέσσερις workers ακόμη και σε δυνατά κινητά, ώστε η εφαρμογή να μένει ζωντανή όσο ψάχνει.',
      },
      {
        en: 'The character picker loads 48 characters at a time instead of 24, with search and filters right in the panel.',
        el: 'Ο επιλογέας χαρακτήρων φορτώνει 48 χαρακτήρες τη φορά αντί για 24, με αναζήτηση και φίλτρα μέσα στο ίδιο πάνελ.',
      },
      {
        en: 'Settings shows when your Drive backup was last checked and whether the backup file is really there, with a refresh button.',
        el: 'Οι Ρυθμίσεις δείχνουν πότε ελέγχθηκε τελευταία φορά το backup στο Drive και αν το αρχείο υπάρχει πραγματικά, με κουμπί ανανέωσης.',
      },
      {
        en: 'A back button in the top bar on detail screens, so you no longer have to hunt for the way out.',
        el: 'Κουμπί επιστροφής στην πάνω μπάρα στις σελίδες λεπτομερειών, ώστε να μην ψάχνεις πώς θα βγεις.',
      },
      {
        en: 'Two more characters now show their artwork instead of a blank frame.',
        el: 'Δύο ακόμη χαρακτήρες δείχνουν πλέον την εικόνα τους αντί για κενό πλαίσιο.',
      },
    ],
    fixed: [],
  },
  {
    version: '0.0.13',
    date: '2026-04-20',
    headline: {
      en: 'Crew Forge, Google sync and a side menu',
      el: 'Crew Forge, Google sync και πλαϊνό μενού',
    },
    summaryEn:
      'A new Crew Forge screen lets you put a crew together, and you can start it from a screenshot of your box: the app reads the characters off the picture and lets you correct any it picks wrong. You can also connect a Google account so your favourites, your character box and your saved teams follow you to another device. Navigation moved off the bottom tab bar into a side menu you open from the button in the header.',
    summaryEl:
      'Μια νέα οθόνη Crew Forge σου επιτρέπει να στήσεις crew, ακόμα και ξεκινώντας από screenshot του box σου: η εφαρμογή διαβάζει τους χαρακτήρες από την εικόνα και μπορείς να διορθώσεις όποιον δεν βρήκε σωστά. Μπορείς επίσης να συνδέσεις λογαριασμό Google, ώστε τα favorites, το character box και τα saved teams σου να σε ακολουθούν σε άλλη συσκευή. Η πλοήγηση έφυγε από το κάτω tab bar και πήγε σε πλαϊνό μενού που ανοίγει από το κουμπί στο header.',
    added: [
      {
        en: 'New Crew Forge screen for putting a crew together',
        el: 'Νέα οθόνη Crew Forge για να στήνεις crew',
      },
      {
        en: 'Import a crew from a screenshot of your box, then fix by hand any character the app read wrong',
        el: 'Import crew από screenshot του box σου, με δυνατότητα να διορθώσεις με το χέρι όποιον χαρακτήρα διάβασε λάθος',
      },
      {
        en: 'Connect a Google account and carry your favourites, character box and saved teams to another device',
        el: 'Σύνδεση με λογαριασμό Google, για να μεταφέρεις favorites, character box και saved teams σε άλλη συσκευή',
      },
    ],
    improved: [
      {
        en: 'Every screen is now reachable from a side menu in the header instead of the bottom tab bar',
        el: 'Όλες οι οθόνες ανοίγουν πλέον από πλαϊνό μενού στο header, αντί για το κάτω tab bar',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.12',
    date: '2026-04-20',
    headline: {
      en: 'Your own boxes and character edits',
      el: 'Δικά σου boxes και διορθώσεις χαρακτήρων',
    },
    summaryEn:
      'You can now keep your own character boxes and correct character data yourself. A new Character Boxes screen lets you group the units you actually own and search inside them, while a new character editor lets you add or fix a character, image included. Auto Team Builder also got quicker, stopped asking for confirmation on every filter, and now reaches for the strongest units first.',
    summaryEl:
      'Μπορείς πλέον να φτιάχνεις τα δικά σου character boxes και να διορθώνεις μόνος σου στοιχεία χαρακτήρων. Η νέα οθόνη Character Boxes σε αφήνει να ομαδοποιήσεις τις μονάδες που έχεις πραγματικά και να ψάχνεις μέσα τους, ενώ ο νέος επεξεργαστής χαρακτήρα σου επιτρέπει να προσθέσεις ή να διορθώσεις έναν χαρακτήρα, μαζί με την εικόνα του. Ο Auto Team Builder έγινε πιο γρήγορος, σταμάτησε να ζητάει επιβεβαίωση σε κάθε φίλτρο και πιάνει πρώτα τις πιο δυνατές μονάδες.',
    added: [
      {
        en: 'Character Boxes screen: create boxes, put characters in them, and search or filter inside each one.',
        el: 'Οθόνη Character Boxes: φτιάχνεις boxes, βάζεις μέσα χαρακτήρες και ψάχνεις ή φιλτράρεις μέσα στο καθένα.',
      },
      {
        en: 'A character editor for adding or correcting a character, with your own image upload.',
        el: 'Επεξεργαστής χαρακτήρα για προσθήκη ή διόρθωση, με ανέβασμα δικής σου εικόνας.',
      },
      {
        en: "Auto Team Builder can require every slot to fall inside the leader's super effect scope.",
        el: 'Ο Auto Team Builder μπορεί να απαιτεί κάθε θέση να πέφτει μέσα στο super effect scope του leader.',
      },
      {
        en: 'Super Tandem and Final Tap details on the character page.',
        el: 'Στοιχεία Super Tandem και Final Tap στη σελίδα του χαρακτήρα.',
      },
    ],
    improved: [
      {
        en: 'Auto Team Builder now goes for the strongest units first.',
        el: 'Ο Auto Team Builder διαλέγει πλέον πρώτα τις πιο δυνατές μονάδες.',
      },
      {
        en: 'Character lists open faster, because the catalog is kept ready instead of rebuilt each time.',
        el: 'Οι λίστες χαρακτήρων ανοίγουν πιο γρήγορα, γιατί ο κατάλογος μένει έτοιμος αντί να ξαναφτιάχνεται κάθε φορά.',
      },
      {
        en: 'Turning a filter on or off no longer asks you to confirm every time.',
        el: 'Το άναμμα ή το σβήσιμο ενός φίλτρου δεν σου ζητάει πια επιβεβαίωση κάθε φορά.',
      },
      {
        en: 'Characters with missing stats are now marked as incomplete, instead of showing blanks that read like zeros.',
        el: 'Οι χαρακτήρες με ελλιπή στοιχεία σημειώνονται πλέον ως ημιτελείς, αντί να δείχνουν κενά που μοιάζουν με μηδενικά.',
      },
      {
        en: 'The candidate limit in Auto Team Builder can be left empty for no limit at all.',
        el: 'Το όριο υποψηφίων στον Auto Team Builder μπορεί να μείνει κενό, χωρίς κανένα όριο.',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.11',
    date: '2026-04-13',
    userVisible: true,
    headline: {
      en: 'Privacy pages, cookie choice and full backup',
      el: 'Πολιτικές απορρήτου και πλήρες backup',
    },
    summaryEn:
      'Settings now links to a Privacy Policy and a Cookie Policy you can read inside the app, and a banner asks before anything about your visit is measured — say no and nothing is tracked, and you can change your answer later in Settings. Settings also gained a one-file backup: everything you keep on the device (favourite characters, favourite ships, saved teams and saved enemies) exports into a single file and imports back on another device.',
    summaryEl:
      'Στις Ρυθμίσεις μπήκαν η Πολιτική Απορρήτου και η Πολιτική Cookies, που τις διαβάζεις μέσα στην εφαρμογή, και ένα banner που ρωτάει πριν μετρηθεί οτιδήποτε — αν πεις όχι, δεν καταγράφεται τίποτα, και αλλάζεις γνώμη όποτε θες από τις Ρυθμίσεις. Μπήκε επίσης ενιαίο backup: όσα κρατάς στη συσκευή (αγαπημένοι χαρακτήρες, αγαπημένα ships, saved teams και saved enemies) βγαίνουν σε ένα αρχείο και μπαίνουν πίσω σε άλλη συσκευή.',
    added: [
      {
        en: 'Export everything you have saved in one file, and import it back on another device',
        el: 'Export όλων όσων έχεις αποθηκεύσει σε ένα αρχείο, και import τους σε άλλη συσκευή',
      },
      {
        en: 'Privacy Policy and Cookie Policy pages, opened from Settings',
        el: 'Σελίδες Privacy Policy και Cookie Policy, που ανοίγουν από τις Ρυθμίσεις',
      },
      {
        en: 'A consent banner: accept or reject analytics cookies, and change the answer later in Settings',
        el: 'Banner συγκατάθεσης: δέχεσαι ή απορρίπτεις τα analytics cookies, και το αλλάζεις μετά από τις Ρυθμίσεις',
      },
    ],
    improved: [],
    fixed: [],
  },
  {
    version: '0.0.10',
    date: '2026-04-13',
    headline: {
      en: 'Super types, cost limits, fuller character pages',
      el: 'Super types, όρια cost και πιο πλήρεις καρτέλες',
    },
    summaryEn:
      "Super type and Super class characters are now read correctly everywhere in the app, and each character's page shows their Super Special criteria and Support details. Auto Team Builder learned to respect a quest's leader cost restriction, lets you pick the extra drop mode, and can filter by the leader's Super Special criteria. The character page itself was rebuilt so stats, art and text are easier to read.",
    summaryEl:
      'Οι Super type και Super class χαρακτήρες αναγνωρίζονται πλέον σωστά σε όλη την εφαρμογή, και η καρτέλα του κάθε χαρακτήρα δείχνει τα criteria του Super Special και τα support στοιχεία του. Ο Auto Team Builder μαθαίνει το cost restriction του leader, σε αφήνει να διαλέξεις extra drop mode και μπορεί να φιλτράρει με βάση τα criteria του leader Super Special. Η ίδια η καρτέλα χαρακτήρα ξαναχτίστηκε ώστε stats, εικόνες και κείμενα να διαβάζονται πιο εύκολα.',
    added: [
      {
        en: 'Super type and Super class characters are recognised across the app.',
        el: 'Οι Super type και Super class χαρακτήρες αναγνωρίζονται σε όλη την εφαρμογή.',
      },
      {
        en: "Auto Team Builder can keep the team inside a quest's leader cost restriction.",
        el: 'Ο Auto Team Builder μπορεί να κρατά την ομάδα μέσα στο cost restriction του leader.',
      },
      {
        en: 'Extra drop mode can be chosen in Auto Team Builder.',
        el: 'Μπορείς να διαλέξεις extra drop mode μέσα στον Auto Team Builder.',
      },
      {
        en: "New Auto Team Builder filter for the leader's Super Special criteria.",
        el: 'Νέο φίλτρο στον Auto Team Builder για τα criteria του leader Super Special.',
      },
      {
        en: 'Character pages now show Super Special criteria, notes, and which characters a unit supports.',
        el: 'Η καρτέλα χαρακτήρα δείχνει πια τα criteria και τις σημειώσεις του Super Special, καθώς και ποιους χαρακτήρες κάνει support.',
      },
    ],
    improved: [
      {
        en: 'The character page was redesigned — spacing, portraits and stats are clearer.',
        el: 'Η καρτέλα χαρακτήρα ξαναχτίστηκε — πιο καθαρές αποστάσεις, εικόνες και stats.',
      },
      {
        en: 'Two rarely used Auto Team Builder switches are gone (require every special to support the team, and same Captain as Friend Captain), so the setup screen is shorter.',
        el: 'Έφυγαν δύο διακόπτες που σχεδόν κανείς δεν χρησιμοποιούσε στον Auto Team Builder (να υποστηρίζουν όλα τα specials την ομάδα, και ίδιος Captain με Friend Captain), οπότε η οθόνη ρυθμίσεων είναι πιο σύντομη.',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.9',
    date: '2026-04-13',
    headline: {
      en: 'Nothing new for players here',
      el: 'Καμία αλλαγή για τους παίκτες',
    },
    summaryEn:
      "This release only touched the project's own setup notes. Nothing changed in the app, so you will not see any difference on any screen.",
    summaryEl:
      'Αυτή η έκδοση άλλαξε μόνο τις εσωτερικές σημειώσεις του project. Τίποτα δεν άλλαξε στην εφαρμογή, οπότε δεν θα δεις καμία διαφορά σε καμία οθόνη.',
    added: [],
    improved: [],
    fixed: [],
    userVisible: false,
  },
  {
    version: '0.0.8',
    date: '2026-04-13',
    headline: {
      en: 'Faster Auto Team Builder, backups for favourites',
      el: 'Πιο γρήγορος Auto Team Builder, backup αγαπημένων',
    },
    summaryEn:
      'The Auto Team Builder now runs several searches at the same time, shows a progress bar while it works and tells you how long the worst case could take. In Settings you choose how hard it pushes your device, and you back up or restore your favourites and saved teams from the same place. Picking a ship got a search box, and a built team no longer comes back with the same character in two slots.',
    summaryEl:
      'Ο Auto Team Builder τρέχει πλέον πολλές αναζητήσεις μαζί, δείχνει μπάρα προόδου όσο δουλεύει και σου λέει πόσο μπορεί να κρατήσει στη χειρότερη περίπτωση. Από τα Settings διαλέγεις πόσο θα πιέσει τη συσκευή σου και από εκεί κάνεις backup ή επαναφορά στα αγαπημένα και στις αποθηκευμένες ομάδες. Η επιλογή ship απέκτησε αναζήτηση, και η ομάδα δεν βγάζει πια τον ίδιο χαρακτήρα σε δύο θέσεις.',
    added: [
      {
        en: 'Performance settings for the Auto Team Builder: pick how many searches run at once, or let the app decide for you',
        el: 'Ρυθμίσεις απόδοσης για τον Auto Team Builder: διαλέγεις πόσες αναζητήσεις τρέχουν ταυτόχρονα ή το αφήνεις στην εφαρμογή',
      },
      {
        en: 'Progress bar and a worst-case time estimate while a team is being built',
        el: 'Μπάρα προόδου και εκτίμηση χρόνου για τη χειρότερη περίπτωση όσο χτίζεται η ομάδα',
      },
      {
        en: 'Back up and restore your favourites and your saved teams, now all from Settings',
        el: 'Backup και επαναφορά για τα αγαπημένα και τις αποθηκευμένες ομάδες, όλα πλέον από τα Settings',
      },
      {
        en: 'Search a ship by name instead of scrolling the whole list, with quick actions on each result',
        el: 'Αναζήτηση ship με το όνομα αντί να σκρολάρεις όλη τη λίστα, με γρήγορες ενέργειες σε κάθε αποτέλεσμα',
      },
      {
        en: 'An enemy setup can now ask for a number of characters with the same mechanic, and that number survives export and import',
        el: 'Ένα enemy setup μπορεί τώρα να ζητά συγκεκριμένο αριθμό χαρακτήρων με το ίδιο mechanic, και ο αριθμός διατηρείται σε export και import',
      },
    ],
    improved: [
      {
        en: 'The Auto Team Builder asks for confirmation before you flip a switch that would throw away the team it just found, and keeps the old setting if you cancel',
        el: 'Ο Auto Team Builder ρωτάει πριν αλλάξεις διακόπτη που θα πετάξει την ομάδα που μόλις βρήκε, και κρατάει την παλιά ρύθμιση αν ακυρώσεις',
      },
      {
        en: 'The ship picker and the enemy mechanic picker fit properly on small screens, with headers and footers that stay put',
        el: 'Ο ship picker και ο enemy mechanic picker χωράνε σωστά σε μικρές οθόνες, με header και footer που μένουν στη θέση τους',
      },
    ],
    fixed: [
      {
        en: 'A built team can no longer contain the same character twice',
        el: 'Μια ομάδα δεν μπορεί πια να περιέχει τον ίδιο χαρακτήρα δύο φορές',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.7',
    date: '2026-04-12',
    headline: {
      en: 'Sharper ability reading, links that open',
      el: 'Πιο σωστές ικανότητες, links που ανοίγουν',
    },
    summaryEn:
      "The team builder now reads a character's ability text more carefully: when several effects are written one after the other, only the main one counts, so characters stop picking up tags they never had. A correction list was added for the characters whose ability was still read wrong. And a link to an inner page — shared or refreshed — now opens that page instead of an error screen.",
    summaryEl:
      'Ο builder διαβάζει πιο προσεκτικά το κείμενο των ικανοτήτων: όταν είναι γραμμένα πολλά εφέ στη σειρά, μετράει πλέον μόνο το κύριο, οπότε οι χαρακτήρες σταματούν να παίρνουν ικανότητες που δεν έχουν. Προστέθηκε και λίστα διορθώσεων για όσους χαρακτήρες συνέχιζαν να διαβάζονται λάθος. Τέλος, ένα link προς εσωτερική σελίδα ανοίγει πια κανονικά, είτε το μοιραστείς είτε κάνεις refresh.',
    added: [
      {
        en: 'A correction list that fixes specific characters whose ability was detected wrong.',
        el: 'Λίστα διορθώσεων που φτιάχνει συγκεκριμένους χαρακτήρες με λάθος ανίχνευση ικανότητας.',
      },
    ],
    improved: [
      {
        en: 'When an ability text chains several effects, only the main one is used for filtering.',
        el: 'Όταν το κείμενο μιας ικανότητας έχει πολλά εφέ στη σειρά, για το φιλτράρισμα χρησιμοποιείται μόνο το κύριο.',
      },
    ],
    fixed: [
      {
        en: 'Shared or refreshed links to an inner page no longer land on a "page not found".',
        el: 'Τα links προς εσωτερικές σελίδες δεν καταλήγουν πια σε «η σελίδα δεν βρέθηκε».',
      },
    ],
    userVisible: true,
  },
  {
    version: '0.0.6',
    date: '2026-04-11',
    headline: {
      en: 'Import a team from an empty list',
      el: 'Εισαγωγή ομάδας από την άδεια λίστα',
    },
    summaryEn:
      'If you have never saved a team, the Saved Teams page used to be a dead end. Now an import button sits right there on the empty page, so you can bring in a backup or a team someone shared with you without hunting for the option somewhere else.',
    summaryEl:
      'Μέχρι τώρα, αν δεν είχες καμία αποθηκευμένη ομάδα, η σελίδα Αποθηκευμένες ομάδες ήταν αδιέξοδο. Πλέον το κουμπί εισαγωγής βρίσκεται εκεί ακριβώς, στην άδεια σελίδα, ώστε να φέρεις ένα backup ή μια ομάδα που σου έστειλαν χωρίς να ψάχνεις την επιλογή αλλού.',
    added: [
      {
        en: 'Import button on the Saved Teams page when you have no teams saved yet',
        el: 'Κουμπί εισαγωγής στις Αποθηκευμένες ομάδες όταν δεν έχεις ακόμη καμία ομάδα',
      },
    ],
    improved: [],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.5',
    date: '2026-04-11',
    userVisible: true,
    headline: {
      en: 'Auto Team Builder gets real controls',
      el: 'Ο Auto Team Builder αποκτά πραγματικές ρυθμίσεις',
    },
    summaryEn:
      "The Auto Team Builder now lets you tell it what you actually own and what you want to see. You can keep it to your favourite ships only, block ships and characters you never want it to pick, force the Captain and Friend Captain to be the same character, and stop it filling a team with several versions of the same unit. Saved Enemies also gained tick boxes for deleting or exporting a batch at once, plus a way to paste an enemy's text and have its mechanics filled in for you.",
    summaryEl:
      'Ο Auto Team Builder σε αφήνει πλέον να του πεις τι πραγματικά έχεις και τι θέλεις να βλέπεις. Μπορείς να τον κρατήσεις μόνο στα αγαπημένα σου ships, να μπλοκάρεις ships και χαρακτήρες που δεν θέλεις να διαλέγει, να απαιτήσεις ο Captain και ο Friend Captain να είναι ο ίδιος χαρακτήρας, και να μην γεμίζει η ομάδα με πολλές εκδοχές του ίδιου χαρακτήρα. Στα Saved Enemies μπήκαν κουτάκια επιλογής για μαζική διαγραφή ή export, και μπορείς να κάνεις επικόλληση το κείμενο ενός εχθρού για να συμπληρωθούν μόνα τους τα mechanics του.',
    added: [
      {
        en: 'Limit the Auto Team Builder to your favourite ships only',
        el: 'Περιορισμός του Auto Team Builder μόνο στα αγαπημένα σου ships',
      },
      {
        en: 'Exclude specific ships and characters so results never include them',
        el: 'Αποκλεισμός συγκεκριμένων ships και χαρακτήρων ώστε να μην βγαίνουν ποτέ στα αποτελέσματα',
      },
      {
        en: 'Option to require the Captain and Friend Captain to be the same character',
        el: 'Επιλογή ώστε ο Captain και ο Friend Captain να είναι υποχρεωτικά ο ίδιος χαρακτήρας',
      },
      {
        en: 'Option to allow each base character only once in a team',
        el: 'Επιλογή ώστε κάθε βασικός χαρακτήρας να μπαίνει μόνο μία φορά στην ομάδα',
      },
      {
        en: 'Select several Saved Enemies and delete or export them in one go',
        el: 'Πολλαπλή επιλογή στα Saved Enemies για μαζική διαγραφή ή export',
      },
      {
        en: "Paste an enemy's text and have its mechanics and abilities read out of it",
        el: 'Επικόλληση του κειμένου ενός εχθρού για αυτόματη ανάγνωση των mechanics και των abilities του',
      },
    ],
    improved: [
      {
        en: 'Clearer layout for the candidate cards in the manual picker',
        el: 'Πιο ξεκάθαρη διάταξη στις κάρτες υποψηφίων της χειροκίνητης επιλογής',
      },
      {
        en: 'A ship thumbnail that was missing from the picker now shows up',
        el: 'Εμφανίζεται πλέον ένα ship thumbnail που έλειπε από τον picker',
      },
    ],
    fixed: [
      {
        en: 'Warning messages from the pasted enemy text are now readable instead of running together',
        el: 'Τα μηνύματα προειδοποίησης από το επικολλημένο κείμενο εχθρού διαβάζονται πλέον κανονικά, αντί να είναι όλα κολλημένα',
      },
    ],
  },
  {
    version: '0.0.4',
    date: '2026-04-04',
    headline: {
      en: 'Import saved enemies from a file',
      el: 'Μαζική εισαγωγή αποθηκευμένων εχθρών',
    },
    summaryEn:
      'On Saved Enemies you can now bring in a whole batch of enemy setups at once: pick a JSON file or just drag it onto the page. Enemies you already have get updated instead of duplicated, broken records are skipped, and a message tells you exactly what went in and what did not.',
    summaryEl:
      'Στους Αποθηκευμένους εχθρούς μπορείς πλέον να φέρεις πολλά setup εχθρών μαζί: διαλέγεις ένα αρχείο JSON ή απλώς το σέρνεις πάνω στη σελίδα. Όσοι εχθροί υπάρχουν ήδη ενημερώνονται αντί να διπλογραφτούν, οι χαλασμένες εγγραφές αγνοούνται, και ένα μήνυμα σου λέει ακριβώς τι μπήκε και τι όχι.',
    added: [
      {
        en: 'Bulk import on Saved Enemies, from a file picker or by dragging the file onto the page.',
        el: 'Μαζική εισαγωγή στους Αποθηκευμένους εχθρούς, από επιλογή αρχείου ή σέρνοντας το αρχείο πάνω στη σελίδα.',
      },
      {
        en: 'Enemies you already saved are updated by the import instead of appearing twice.',
        el: 'Οι εχθροί που έχεις ήδη αποθηκευμένους ενημερώνονται από την εισαγωγή αντί να εμφανιστούν δεύτερη φορά.',
      },
      {
        en: 'A result message after every import, including which records were rejected.',
        el: 'Μήνυμα αποτελέσματος μετά από κάθε εισαγωγή, μαζί με τις εγγραφές που απορρίφθηκαν.',
      },
    ],
    improved: [],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.3',
    date: '2026-04-04',
    headline: {
      en: 'Ship picker, exclusions and saved presets',
      el: 'Ship picker, αποκλεισμοί και presets',
    },
    summaryEn:
      'The Auto Team Builder gets a proper ship picker with artwork instead of a plain dropdown list, and you can now tell the builder which characters and ships to keep out of your team entirely. Saved Teams remember the ship each crew used, and you can load a saved team back into the builder as a starting point. The app also shows its version and a credits badge.',
    summaryEl:
      'Ο Auto Team Builder αποκτά κανονικό picker για το ship, με εικόνες αντί για απλή λίστα, και μπορείς πλέον να πεις στον builder ποιους χαρακτήρες και ποια ships να μη βάλει καθόλου στην ομάδα. Τα Saved Teams κρατάνε πια και το ship τους, ενώ μπορείς να φορτώσεις ένα αποθηκευμένο team ως αφετηρία. Η εφαρμογή δείχνει επίσης την έκδοσή της και ένα credits badge.',
    added: [
      {
        en: 'A ship picker with ship artwork, replacing the plain dropdown.',
        el: 'Παράθυρο επιλογής ship με εικόνες, στη θέση της απλής λίστας.',
      },
      {
        en: 'Exclude characters and ships so the builder never puts them in a team, with search and one-tap clearing.',
        el: 'Αποκλεισμός χαρακτήρων και ships, με αναζήτηση και καθάρισμα με ένα πάτημα, ώστε να μην μπαίνουν ποτέ σε ομάδα.',
      },
      {
        en: 'Load a saved team back into the builder and keep building from it.',
        el: 'Φόρτωμα αποθηκευμένου team μέσα στον builder, για να συνεχίσεις από εκεί.',
      },
      {
        en: 'Saved Teams now show the ship of each crew.',
        el: 'Τα Saved Teams δείχνουν πλέον και το ship κάθε ομάδας.',
      },
    ],
    improved: [
      {
        en: 'Ships you cannot use appear labelled and locked in the picker instead of silently missing.',
        el: 'Τα ships που δεν μπορείς να χρησιμοποιήσεις εμφανίζονται με ετικέτα και κλειδωμένα, αντί να λείπουν χωρίς εξήγηση.',
      },
      {
        en: 'The app now shows which version you are running, plus a credits badge.',
        el: 'Η εφαρμογή δείχνει πλέον ποια έκδοση τρέχεις, μαζί με ένα credits badge.',
      },
    ],
    fixed: [],
    userVisible: true,
  },
  {
    version: '0.0.2',
    date: '2026-04-04',
    userVisible: true,
    headline: {
      en: 'A searchable character picker with portraits',
      el: 'Νέο picker χαρακτήρων με εικόνες και αναζήτηση',
    },
    summaryEn:
      "Filling a team slot now opens a proper character picker instead of a plain list. It shows every character's portrait, has a search box and filters, so you can find the unit you want and drop it straight into the slot you were filling.",
    summaryEl:
      'Όταν γεμίζεις ένα team slot, ανοίγει πλέον ένα κανονικό picker χαρακτήρων αντί για μια απλή λίστα. Δείχνει το portrait κάθε χαρακτήρα, έχει πεδίο αναζήτησης και φίλτρα, ώστε να βρίσκεις αμέσως τη μονάδα που θες και να τη βάζεις κατευθείαν στο slot που συμπλήρωνες.',
    added: [
      {
        en: 'Character picker with portraits, search and filters when you fill a slot',
        el: 'Picker χαρακτήρων με portraits, αναζήτηση και φίλτρα όταν γεμίζεις ένα slot',
      },
    ],
    improved: [],
    fixed: [],
  },
  {
    version: '0.0.1',
    date: '2026-04-04',
    userVisible: true,
    headline: {
      en: 'The first release: build and save crews',
      el: 'Η πρώτη έκδοση: φτιάξε και αποθήκευσε ομάδες',
    },
    summaryEn:
      'This is where OPTC Team Builder starts. You can browse characters, let the Auto Team Builder put a crew together around a Captain and a cost budget, or pick every slot yourself, and then save the crews you like so they are there even without internet. Enemy presets, OPTCbx favourite imports and full Greek and English are in from day one.',
    summaryEl:
      'Από εδώ ξεκινάει το OPTC Team Builder. Ψάχνεις χαρακτήρες, αφήνεις τον Auto Team Builder να στήσει ομάδα γύρω από έναν Captain και ένα όριο cost, ή διαλέγεις μόνος σου κάθε θέση, και μετά αποθηκεύεις τις ομάδες που σου αρέσουν ώστε να τις έχεις και χωρίς ίντερνετ. Από την πρώτη μέρα υπάρχουν προεπιλογές εχθρών, εισαγωγή αγαπημένων από το OPTCbx και πλήρη ελληνικά και αγγλικά.',
    added: [
      {
        en: 'Auto Team Builder: choose your Captain first or let it decide, set the cost budget, and watch the progress while it searches.',
        el: 'Auto Team Builder: διαλέγεις πρώτος τον Captain σου ή τον αφήνεις να αποφασίσει, βάζεις όριο cost και βλέπεις την πρόοδο όσο ψάχνει.',
      },
      {
        en: 'Build a team only from your favourites, so it never suggests characters you do not own.',
        el: 'Χτίσιμο ομάδας μόνο από τα αγαπημένα σου, ώστε να μη σου προτείνει χαρακτήρες που δεν έχεις.',
      },
      {
        en: 'Manual picks with search and filters, plus your own ship choice for the run.',
        el: 'Χειροκίνητες επιλογές με αναζήτηση και φίλτρα, και δικό σου πλοίο για το run.',
      },
      {
        en: 'Saved enemies: build an enemy preset with the abilities and mechanics it needs, or load one from a JSON file.',
        el: 'Αποθηκευμένοι εχθροί: φτιάχνεις προεπιλογή εχθρού με τις ικανότητες και τα mechanics που χρειάζεται, ή τη φορτώνεις από αρχείο JSON.',
      },
      {
        en: 'Saved Teams: keep your crews offline, edit them, delete several at once, and import or export them.',
        el: 'Αποθηκευμένες ομάδες: κρατάς τις ομάδες σου offline, τις επεξεργάζεσαι, σβήνεις πολλές μαζί και τις κάνεις import ή export.',
      },
      {
        en: 'Import your favourites straight from OPTCbx.',
        el: 'Εισαγωγή των αγαπημένων σου απευθείας από το OPTCbx.',
      },
      {
        en: 'Download a finished team so you can keep it or share the file.',
        el: 'Κατέβασμα της έτοιμης ομάδας για να την κρατήσεις ή να μοιραστείς το αρχείο.',
      },
      {
        en: 'Tap any character in a team to open its full details.',
        el: 'Πατάς οποιονδήποτε χαρακτήρα μέσα σε μια ομάδα και ανοίγουν όλες οι λεπτομέρειές του.',
      },
      {
        en: 'The whole app in Greek and English.',
        el: 'Όλη η εφαρμογή σε ελληνικά και αγγλικά.',
      },
    ],
    improved: [],
    fixed: [],
  },
];
