/**
 * What Sprig says.
 *
 * He is a stadium mascot, not a salesman: on the team's side, but here to
 * say hello and ask you things. So nothing in here tells anyone what to do,
 * nothing is about the product, nothing teases the reader, and no line
 * carries a number. If a line would feel odd said to a stranger at a match,
 * it does not belong here.
 */

/** Questions, in a speech bubble. */
export const QUESTIONS = [
  "Tea or coffee?",
  "Cats or dogs?",
  "How's your day going?",
  "What's for lunch today?",
  "Beach or mountains?",
  "Morning person or night owl?",
  "Seen any good films lately?",
  "Do you like my shoes?",
  "Pizza tonight, maybe?",
  "Favourite colour? Mine's green.",
  "Sweet or savoury?",
  "Summer or winter?",
];

/** Little remarks, on his sign. */
export const REMARKS = [
  "Nice to see you!",
  "I'm a herb. Hi!",
  "Thyme is related to mint!",
  "I practised this wave all week.",
  "You scroll beautifully.",
  "Hope you're having a lovely day.",
  "Just stretching my leaves.",
  "Nice to have company.",
  "Is it the weekend yet?",
  "I like it here.",
  "New shoes. Very bouncy.",
  "Go team!",
];

/** When a visitor hovers a big green button. Admiring, never pushing. */
export const BUTTON_LINES = ["Ooh, good choice.", "That's my favourite button!", "Nice, that one's fun."];

/** Waking up after a nap. */
export const WAKE_LINES = ["Oh! Hi again.", "I wasn't asleep. Honest.", "Welcome back!"];

/** A hello that knows the time of day, read from the visitor's own clock. */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Up late? Me too.";
  if (h < 12) return "Good morning!";
  if (h < 17) return "Good afternoon!";
  if (h < 22) return "Good evening!";
  return "Evening, night owl!";
}

/** The crew, one per desk. Herb names, because the brand grew out of thyme. */
export type Crew = "search" | "content" | "social" | "paid";
export const CREW: Record<Crew, { name: string; desk: string }> = {
  search: { name: "Sprig", desk: "Search" },
  content: { name: "Basil", desk: "Content" },
  social: { name: "Rosie", desk: "Social" },
  paid: { name: "Sage", desk: "Paid" },
};

/**
 * The CMO checks in on whoever is on duty. Each pair is one exchange: the
 * CMO first, the crew member second. {name} is the crew member's name.
 */
export const CMO_VISITS: [string, string][] = [
  ["Just checking in, {name}!", "All good here, boss!"],
  ["CMO here. How's our visitor?", "They seem lovely!"],
  ["Love the shoes, {name}.", "Thanks! They're new."],
  ["Checking in. Carry on!", "Nice glasses, boss!"],
];

export function pick<T>(list: T[], avoid?: T): T {
  if (list.length < 2) return list[0];
  let item = list[Math.floor(Math.random() * list.length)];
  while (item === avoid) item = list[Math.floor(Math.random() * list.length)];
  return item;
}
