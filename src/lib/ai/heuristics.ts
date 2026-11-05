/**
 * Rule-based request parsing. Used when the AI service isn't configured or is down,
 * so the planner still works (with fewer smarts). It only extracts what is literally
 * in the text and never invents route details.
 */
import { TRAILS, type Trail } from "../domain/trails";

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, a: 1, an: 1,
};
const toNum = (s: string) => (/^\d+$/.test(s) ? parseInt(s, 10) : NUMBER_WORDS[s.toLowerCase()] ?? NaN);

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const PLACE_CURRENCY: [RegExp, string, string][] = [
  [/\b(tasmania|nsw|new south wales|victoria|queensland|blue mountains|australia|kosciuszko|grampians)\b/i, "AUD", "Australia"],
  [/\b(new zealand|nz|fiordland|tongariro|queenstown)\b/i, "NZD", "New Zealand"],
  [/\b(scotland|england|wales|uk|united kingdom|lake district)\b/i, "GBP", "United Kingdom"],
  [/\b(iceland)\b/i, "ISK", "Iceland"],
  [/\b(usa|united states|california|yosemite|colorado|washington state|utah)\b/i, "USD", "United States"],
  [/\b(canada|banff|jasper|british columbia)\b/i, "CAD", "Canada"],
  [/\b(france|italy|dolomites|austria|germany|spain|chamonix)\b/i, "EUR", ""],
  [/\b(switzerland|swiss)\b/i, "CHF", "Switzerland"],
  [/\b(japan)\b/i, "JPY", "Japan"],
  [/\b(nepal|annapurna|everest)\b/i, "NPR", "Nepal"],
  [/\b(chile|patagonia|torres del paine)\b/i, "CLP", "Chile"],
  [/\b(norway)\b/i, "NOK", "Norway"],
  [/\b(sweden)\b/i, "SEK", "Sweden"],
];

const SYMBOL_CURRENCY: Record<string, string> = { "€": "EUR", "£": "GBP", "¥": "JPY" };

export interface HeuristicRequirements {
  destination?: string;
  country?: string;
  trailId?: string;
  month?: string;
  durationDays?: number;
  groupSize?: number;
  budgetMax?: number;
  currency?: string;
  budgetBasis?: "group" | "per_person";
  experience?: "beginner" | "intermediate" | "experienced";
  desiredDifficulty?: string;
  scenery: string[];
  existingGear: string[];
  dietary: string[];
}

export function matchTrail(text: string): Trail | undefined {
  const t = text.toLowerCase();
  return TRAILS.find((tr) => t.includes(tr.name.toLowerCase()) || (tr.id === "john-muir-trail" && /\bjmt\b/.test(t)));
}

export function extractRequirements(text: string, fallbackCurrency = "AUD"): HeuristicRequirements {
  const t = ` ${text.replace(/\s+/g, " ")} `;
  const lower = t.toLowerCase();
  const out: HeuristicRequirements = { scenery: [], existingGear: [], dietary: [] };

  const trail = matchTrail(t);
  if (trail) {
    out.trailId = trail.id;
    out.destination = trail.name;
    out.country = trail.country;
  }

  // Duration
  const dur = lower.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen|twenty)[- ](?:day|days)\b/);
  const nights = lower.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)[- ](?:night|nights)\b/);
  if (dur) out.durationDays = toNum(dur[1]);
  else if (nights) out.durationDays = toNum(nights[1]) + 1;
  else if (/\bweekend\b/.test(lower) || /\bovernight\b/.test(lower)) out.durationDays = 2;
  else if (/\b(a|one) week\b/.test(lower)) out.durationDays = 7;
  else if (/\bday hike\b/.test(lower)) out.durationDays = 1;

  // Group size
  const friends = lower.match(/\bwith (\d+|one|two|three|four|five|six|seven|eight|nine|ten|a) (?:friends?|mates?|others?|people|kids|children)\b/);
  const groupOf = lower.match(/\b(?:group of|party of|we are|there are|for) (\d+|two|three|four|five|six|seven|eight|nine|ten)(?: of us| people| hikers| friends)?\b/);
  const nOf = lower.match(/\b(\d+|two|three|four|five|six|seven|eight|nine|ten) (?:friends|people|hikers|of us)\b/);
  if (friends) out.groupSize = toNum(friends[1]) + 1;
  else if (groupOf) out.groupSize = toNum(groupOf[1]);
  else if (nOf) out.groupSize = toNum(nOf[1]);
  else if (/\bwith (?:my )?(?:partner|wife|husband|girlfriend|boyfriend|friend|mate|dad|mum|mom|brother|sister)\b/.test(lower)) out.groupSize = 2;
  else if (/\b(solo|alone|by myself|on my own)\b/.test(lower)) out.groupSize = 1;
  if (out.groupSize != null && !(out.groupSize >= 1 && out.groupSize <= 20)) delete out.groupSize;

  // Budget and currency
  const money =
    t.match(/(?:\b([A-Z]{3})\s?\$?|([$€£¥]))\s?(\d[\d,]*(?:\.\d+)?)(?:\s?([A-Z]{3})\b)?/) ||
    t.match(/\b(\d[\d,]*(?:\.\d+)?)\s?(AUD|NZD|USD|EUR|GBP|CAD|CHF|JPY|ISK|NOK|SEK|dollars|euros|pounds)\b/i);
  if (money) {
    let amount: number, code: string | undefined;
    if (money.length === 5) {
      amount = parseFloat(money[3].replace(/,/g, ""));
      code = money[1] || money[4] || (money[2] ? SYMBOL_CURRENCY[money[2]] : undefined);
    } else {
      amount = parseFloat(money[1].replace(/,/g, ""));
      const c = money[2].toUpperCase();
      code = c === "EUROS" ? "EUR" : c === "POUNDS" ? "GBP" : c === "DOLLARS" ? undefined : c;
    }
    if (Number.isFinite(amount) && amount > 0) {
      out.budgetMax = amount;
      out.currency = code;
      out.budgetBasis = /\b(per person|each|pp|a head|per head)\b/.test(lower) ? "per_person" : "group";
    }
  }
  for (const [re, cur, country] of PLACE_CURRENCY) {
    if (re.test(t)) {
      if (!out.currency) out.currency = cur;
      if (!out.country && country) out.country = country;
      if (!out.destination) out.destination = t.match(re)![0].trim().replace(/\b\w/g, (c) => c.toUpperCase());
      break;
    }
  }
  if (!out.currency && out.budgetMax != null) out.currency = fallbackCurrency;
  if (!out.destination) {
    const inPlace = t.match(/\b(?:in|to|around|near|at) (?:the )?([A-Z][\wÀ-ÿ'’-]+(?: [A-Z][\wÀ-ÿ'’-]+){0,3})/);
    if (inPlace && !MONTHS.includes(inPlace[1].toLowerCase())) out.destination = inPlace[1];
  }

  const month = MONTHS.find((m) => new RegExp(`\\b${m}\\b`).test(lower));
  if (month) out.month = month[0].toUpperCase() + month.slice(1);
  else if (/\b(summer|winter|spring|autumn|fall)\b/.test(lower)) out.month = lower.match(/\b(summer|winter|spring|autumn|fall)\b/)![1];

  if (/\b(first|beginner|never|new to|first-time|first time)\b/.test(lower)) out.experience = "beginner";
  else if (/\b(experienced|seasoned|advanced|many years)\b/.test(lower)) out.experience = "experienced";
  const diff = lower.match(/\b(easy|gentle|moderate(?:ly challenging)?|challenging|hard|difficult|strenuous)\b/);
  if (diff) out.desiredDifficulty = diff[1];

  for (const s of ["mountains", "lakes", "coast", "beaches", "forest", "rainforest", "waterfalls", "alpine", "glaciers", "desert", "rivers", "views", "volcanic"]) {
    if (lower.includes(s.replace(/s$/, ""))) out.scenery.push(s);
  }

  const owns = lower.match(/\b(?:already (?:own|have)|i (?:own|have)|got)\s+(?:a |an |my )?([^.;]+)/);
  if (owns) {
    out.existingGear = owns[1]
      .split(/,| and /)
      .map((s) => s.replace(/^(a|an|my|the)\s+/, "").replace(/\s+but.*$/, "").trim())
      .filter((s) => s.length > 1 && s.length < 60)
      .slice(0, 12);
  }
  for (const d of ["vegetarian", "vegan", "gluten-free", "gluten free", "dairy-free", "nut-free", "halal", "kosher"]) {
    if (lower.includes(d)) out.dietary.push(d.replace(" ", "-"));
  }
  return out;
}

export function missingQuestions(r: HeuristicRequirements): { question: string; options?: string[] }[] {
  const q: { question: string; options?: string[] }[] = [];
  if (!r.destination) q.push({ question: "Where would you like to hike? A country, region or a trail you have in mind." });
  if (!r.durationDays) q.push({ question: "How many days are you thinking?", options: ["Day hike", "Overnight", "3–4 days", "A week or more"] });
  if (!r.groupSize) q.push({ question: "Who's coming?", options: ["Just me", "Two of us", "A group of 3–4", "5 or more"] });
  return q.slice(0, 3);
}

/** Map quick-reply options to text the parser understands. */
export function normaliseAnswer(answer: string): string {
  const map: Record<string, string> = {
    "Day hike": "a day hike",
    Overnight: "overnight",
    "3–4 days": "4 days",
    "A week or more": "7 days",
    "Just me": "solo",
    "Two of us": "2 people",
    "A group of 3–4": "4 people",
    "5 or more": "5 people",
  };
  return map[answer] ?? answer;
}

export interface KitItem {
  name: string;
  category: import("../domain/types").GearCategory;
  essential: boolean;
  shareable: boolean;
  reason: string;
}

/** A conventional starting kit list, scaled to the trip type. Generic item types only. */
export function starterKit(days: number): KitItem[] {
  const overnight = days > 1;
  const k = (name: string, category: KitItem["category"], essential: boolean, shareable: boolean, reason: string): KitItem => ({ name, category, essential, shareable, reason });
  const list: KitItem[] = [
    k("Backpack", "backpack", true, false, overnight ? "Usually 40–65 L for overnight and multi-day trips." : "A 15–30 L daypack is plenty."),
    k("Rain jacket", "clothing", true, false, "Weather can change quickly anywhere in the hills."),
    k("Warm insulating layer", "clothing", true, false, "For breaks, camp and emergencies."),
    k("Hiking shoes or boots", "footwear", true, false, "Worn, so they count toward worn weight, not base weight."),
    k("Headlamp", "lighting", true, false, "Even on day hikes, in case you finish late."),
    k("First-aid kit", "first_aid", true, true, "Include blister care and any personal medication."),
    k("Map and compass or offline maps", "navigation", true, true, "Phone signal isn't reliable in the backcountry."),
    k("Water bottles or bladder", "water_bottle", true, false, "Enough capacity for the longest stretch without water."),
    k("Water treatment", "water_filter", true, true, "Filter, tablets or a way to boil — never assume natural water is safe."),
    k("Sun protection", "toiletries", true, false, "Sunscreen, hat and sunglasses."),
  ];
  if (overnight) {
    list.push(
      k("Tent or shelter", "shelter", true, true, "Check the campsite rules for where you can pitch."),
      k("Sleeping bag", "sleeping_bag", true, false, "Choose a comfort rating suited to the expected overnight low."),
      k("Sleeping mat", "sleeping_mat", true, false, "Insulates you from the cold ground as much as it cushions."),
      k("Stove", "cooking", false, true, "Check fire restrictions; some areas ban open fires."),
      k("Cook pot and utensils", "cookware", false, true, "One pot per two people is usually enough."),
      k("Toilet trowel and kit", "toiletries", true, true, "Follow local rules on human waste."),
    );
  }
  if (days > 3) list.push(k("Personal locator beacon (PLB) or satellite messenger", "safety", true, true, "Strongly recommended for remote multi-day trips."));
  return list;
}
