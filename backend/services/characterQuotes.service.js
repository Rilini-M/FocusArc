/*
  Personality-based motivational quotes for imported characters.

  No AI service is used. The AniList description is scanned for personality keywords
  (brave, genius, calm, ...), the strongest traits are picked, and quotes are chosen from
  hand-written study-motivation lines for those traits. The same character always gets the
  same quotes. Quotes are generated once, at import time, and saved in the quotes table.
*/

// Keywords that suggest each trait. A personality word ("brave", "genius") adds 1 point; a weak
// hint such as a role or job title ("student", "captain") adds half a point.
const TRAIT_KEYWORDS = {
  brave: {
    strong: /\b(brave|bravery|courage|courageous|fearless|bold|daring|reckless|heroic|hero|heroes|valiant)\b/gi,
    weak: /\b(fighter|warrior|soldier|bounty hunter|hunter|pilot|slayer|sorcerer|ninja|samurai|knight)\b/gi,
  },
  hardworking: {
    strong: /\b(hard[- ]?working|hard work|works hard|worked hard|diligent|industrious|effort|trains|trained|training|practice|practices|practiced)\b/gi,
    weak: /\b(student|studies|studying|apprentice)\b/gi,
  },
  intelligent: {
    strong: /\b(genius|intelligent|intelligence|smart|brilliant|clever|intellect|intellectual|analytical|detective|deduction|deduce|prodigy|scientist|logical|wise|wisdom|knowledgeable)\b/gi,
  },
  calm: {
    strong: /\b(calm|composed|stoic|cool[- ]headed|collected|quiet|serene|laid[- ]back|aloof|expressionless|reserved|level[- ]headed|unflappable|patient|shy|timid|introverted)\b/gi,
  },
  disciplined: {
    strong: /\b(discipline|disciplined|strict|serious|rigorous|meticulous|organi[sz]ed|punctual|perfectionist|self[- ]control|methodical|responsible)\b/gi,
  },
  determined: {
    strong: /\b(determined|determination|never gives? up|persever\w*|persistent|persistence|stubborn|relentless|resolve|resolute|unwavering|tenacious|won'?t give up)\b/gi,
  },
  ambitious: {
    strong: /\b(ambition|ambitious|aspires?|aspiring|dreams? (of|to)|aims? to|goal|goals|strives?|wants? to become|to become the)\b/gi,
  },
  kind: {
    strong: /\b(kind(?! of)|kindness|kind-hearted|kindhearted|gentle|caring|cares for|compassion|compassionate|warm[- ]hearted|sweet|selfless|empathetic|cheerful|optimistic|friendly)\b/gi,
  },
  strategic: {
    strong: /\b(strategy|strategic|strategist|tactic|tactics|tactical|tactician|mastermind|cunning|calculating|devious|deceitful|unpredictable|anticipat\w*|manipulat\w*|schemes?)\b/gi,
    weak: /\b(plans?|planning)\b/gi,
  },
  confident: {
    strong: /\b(confident|confidence|arrogant|arrogance|proud|pride|cocky|self[- ]assured|self[- ]proclaimed|egotistical|narcissistic|overconfident|strongest)\b/gi,
  },
  loyal: {
    strong: /\b(loyal|loyalty|devoted|devotion|faithful|protective|protects?|protecting|comrades|companions|nakama|trustworthy)\b/gi,
  },
  resilient: {
    strong: /\b(resilient|resilience|inner strength|overcome|overcomes|overcame|survive[sd]?|survivor|surviving|hardship|hardships|endure[sd]?|tragic|tragedy|struggles?|despite|bullied)\b/gi,
  },
  curious: {
    strong: /\b(curious|curiosity|inquisitive|fascinated|intrigued|explore|explorer|exploring|adventure|adventurous|adventurer|eager to learn|loves? (books|reading|learning))\b/gi,
  },
  leadership: {
    strong: /\b(leader|leaders|leadership|leads)\b/gi,
    weak: /\b(captain|commander|president|chairman|chief|general|head of|king|queen|heir|lord|kage|hokage|mentor|teacher|teachings|sensei|boss)\b/gi,
  },
  competitive: {
    strong: /\b(competitive|competition|compete|competes|rival|rivals|rivalry|tournament|champion|championship|athlete|ace|challenge|challenges)\b/gi,
    weak: /\b(sports?|team|player|match)\b/gi,
  },
};

// When scores tie, the earlier trait wins (personality words before role/situation words).
const TRAIT_ORDER = [
  'intelligent', 'brave', 'calm', 'kind', 'determined', 'hardworking', 'disciplined', 'confident',
  'ambitious', 'strategic', 'loyal', 'curious', 'resilient', 'competitive', 'leadership',
];

// Used when a description has no useful keywords at all.
const FALLBACK_TRAITS = ['determined', 'hardworking', 'resilient', 'calm'];

// Shown under the name on the Character Guide, like the built-in characters' traits.
const TRAIT_LABELS = {
  brave: 'Brave', hardworking: 'Hardworking', intelligent: 'Intelligent', calm: 'Calm',
  disciplined: 'Disciplined', determined: 'Determined', ambitious: 'Ambitious', kind: 'Kind',
  strategic: 'Strategic', confident: 'Confident', loyal: 'Loyal', resilient: 'Resilient',
  curious: 'Curious', leadership: 'Commanding', competitive: 'Competitive',
};

// Short study-motivation lines written in the voice of each personality type.
const TRAIT_QUOTES = {
  brave: [
    "Being afraid of a hard subject isn't failure. Open the book and face it anyway.",
    "Courage isn't waiting until you feel ready. Start the difficult chapter now.",
    "Don't run from the questions you got wrong. Face them, learn from them, and come back stronger.",
    'A brave heart asks the question everyone else is too afraid to ask.',
    'Every tough problem looks scary until you face it. Take the first step.',
  ],
  hardworking: [
    "You don't need to be the best today. You only need to keep improving.",
    'Talent opens the door, but hard work is what carries you through it.',
    'Put in the hours nobody sees. The results will speak for you later.',
    "One more page, one more problem. That's how real progress is made.",
    'Effort is never wasted. Every session you finish makes the next one easier.',
  ],
  intelligent: [
    "Don't fear a difficult problem. Break it down, think carefully, and find the answer.",
    'Understanding beats memorizing. Keep asking why until it makes sense.',
    'A sharp mind is trained, not born. Keep feeding it new questions.',
    'Mistakes are just information. Study them, and your next answer will be better.',
    'Think first, then act. A minute of careful thought saves an hour of confusion.',
  ],
  calm: [
    'Focus on what is in front of you. One task at a time.',
    'Breathe. Panic solves nothing, but a steady mind solves almost everything.',
    'When the work piles up, stay calm. Quiet, steady effort clears it faster than worry.',
    "Don't rush. A clear head reads the question correctly the first time.",
    'Let the noise fade. Right now, there is only this page.',
  ],
  disciplined: [
    'Stay consistent. Small effort repeated every day becomes strength.',
    'Motivation comes and goes. Discipline gets you to your desk anyway.',
    'Set your schedule, then keep it. Your future self will thank you.',
    'Finish what you started before you reach for something new.',
    'Order your time, and the work becomes far less frightening.',
  ],
  determined: [
    'Fall down seven times, stand up eight. Keep going until the work is done.',
    "Don't stop until you understand it. The answer is closer than you think.",
    "The goal hasn't moved. Keep walking toward it, one step at a time.",
    'Giving up is the only way to truly fail. So keep going.',
    "Hard days don't last. Determined people do.",
  ],
  ambitious: [
    'Aim higher than feels comfortable. Big goals are reached through small steps taken today.',
    'If you want to reach the top, start climbing now. Every study session is another step up.',
    "Don't settle for good enough. Decide who you want to become and work toward it.",
    'Dreams stay dreams until you put in the work. Make today count.',
    'The top is reached by those who keep going when everyone else stops.',
  ],
  kind: [
    'Be kind to yourself on hard days. Rest if you need to, then try again.',
    "Learning together makes everyone stronger. Don't be afraid to ask for help, or to offer it.",
    "Every small step forward counts. Be proud of the progress you've made.",
    "You're doing better than you think. Keep going, gently and steadily.",
    'Study for the people you want to help one day. That reason will carry you far.',
  ],
  strategic: [
    "Every exam can be won with the right plan. Know what's coming and prepare for it.",
    'Plan your moves before the test begins. Preparation is the best strategy.',
    'Work smarter, not just harder. Find the pattern, and the problem gets easier.',
    "Think a few steps ahead. Today's revision wins tomorrow's exam.",
    'A good plan turns an impossible workload into a series of manageable steps.',
  ],
  confident: [
    'Know your worth, set your goal, and pursue it with absolute confidence.',
    "Doubt is just noise. You've prepared, so trust yourself.",
    'Walk into every exam like you already belong at the top.',
    'Confidence is built, not given. Earn it, one finished task at a time.',
    'Never shrink your goals to fit your doubts.',
  ],
  loyal: [
    "Keep the promises you make to yourself. Show up and do the work.",
    'Stay loyal to your goals, even on the days they feel far away.',
    'The people who believe in you are worth working hard for.',
    'Stand by your commitments. Finishing what you promised is its own kind of strength.',
    'Good friends push each other forward. Be that friend, and study together.',
  ],
  resilient: [
    'A bad grade is not the end of the story. Learn from it and write a better chapter.',
    'Setbacks are part of the path. What matters is that you get back up.',
    "You've made it through every hard day so far. This one is no different.",
    'Pressure can break you or build you. Let it build you.',
    'Even after failing, you can start again. That is where real strength comes from.',
  ],
  curious: [
    'Stay curious. Every question you ask opens a new door.',
    'Treat each subject like a new world waiting to be explored.',
    "Asking 'why?' is the first step to truly understanding something.",
    "There's always something more to discover. Turn the page and find out.",
    'Learning is an adventure. Enjoy the journey, not just the result.',
  ],
  leadership: [
    'Lead yourself first. Set the example, even when no one is watching.',
    'A leader takes responsibility. Own your goals and your progress.',
    "People follow those who keep going. Be the one who doesn't quit.",
    'Take charge of your time. Nobody else will plan your success for you.',
    'Leading means doing the hard part first. Start with your toughest task.',
  ],
  competitive: [
    'Your only real rival is who you were yesterday. Beat that person today.',
    'Every practice problem is a match. Win enough of them and the exam is yours.',
    'Champions are made in the hours of practice no one sees.',
    "Don't fear a challenge. Welcome it. That's how you get stronger.",
    'Keep track of your progress, and keep raising the bar.',
  ],
};

const QUOTES_PER_CHARACTER = 3;

// Removes spoilers and Markdown so only readable text is scanned.
function plainText(raw) {
  return (raw || '')
    .replace(/~!([\s\S]*?)!~/g, ' ') // spoilers
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/__|\*\*|~~/g, '');
}

// Returns up to three traits, strongest first, e.g. ['brave', 'loyal'].
function detectTraits(description) {
  const text = plainText(description);
  const count = (re) => (re ? (text.match(re) || []).length : 0);
  const scores = TRAIT_ORDER.map((trait) => ({
    trait,
    score: count(TRAIT_KEYWORDS[trait].strong) + 0.5 * count(TRAIT_KEYWORDS[trait].weak),
  }));

  return scores
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || TRAIT_ORDER.indexOf(a.trait) - TRAIT_ORDER.indexOf(b.trait))
    .slice(0, 3)
    .map((s) => s.trait);
}

// Small stable number from the character id, so a character always gets the same quotes.
function seedOf(id, salt) {
  let h = (Number(id) || 0) + salt * 7919;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

// { traits, traitLine, quotes } for one character. `traits` may be empty; then safe
// fallback traits are used so every character still gets clean, sensible quotes.
function buildPersonality({ id, traits }) {
  let chosen = (traits || []).filter((t) => TRAIT_QUOTES[t]);
  if (chosen.length === 0) {
    const first = FALLBACK_TRAITS[seedOf(id, 1) % FALLBACK_TRAITS.length];
    const second = FALLBACK_TRAITS.filter((t) => t !== first)[seedOf(id, 2) % (FALLBACK_TRAITS.length - 1)];
    chosen = [first, second];
  }

  // Two quotes from the strongest trait, one from the next (or a fallback trait).
  const plan = [chosen[0], chosen[0], chosen[1] || FALLBACK_TRAITS.find((t) => t !== chosen[0])];
  const quotes = [];
  plan.forEach((trait, i) => {
    const options = TRAIT_QUOTES[trait];
    let index = seedOf(id, i + 3) % options.length;
    while (quotes.includes(options[index])) index = (index + 1) % options.length;
    quotes.push(options[index]);
  });

  const labels = chosen.slice(0, 2).map((t) => TRAIT_LABELS[t]);
  const traitLine = labels.length === 2 ? `${labels[0]} and ${labels[1].toLowerCase()}.` : `${labels[0]}.`;

  return { traits: chosen, traitLine, quotes: quotes.slice(0, QUOTES_PER_CHARACTER) };
}

module.exports = { detectTraits, buildPersonality, TRAIT_QUOTES };
