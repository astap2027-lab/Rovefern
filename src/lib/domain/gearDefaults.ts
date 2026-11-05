import type { GearCategory, WeightClass } from "./types";

/**
 * Typical weight ranges by category, in grams, for *planning before you own the item*.
 * These are broad, category-level ranges — not product specifications — and are always
 * shown with the "Estimate" label. Users should replace them with their item's real weight.
 */
export const TYPICAL_WEIGHT_G: Partial<Record<GearCategory, { typical: number; range: [number, number] }>> = {
  backpack: { typical: 1500, range: [700, 2500] },
  shelter: { typical: 1800, range: [500, 3000] },
  sleeping_bag: { typical: 1200, range: [500, 2000] },
  sleeping_mat: { typical: 500, range: [250, 900] },
  cooking: { typical: 250, range: [50, 450] },
  cookware: { typical: 250, range: [100, 600] },
  water_bottle: { typical: 150, range: [30, 400] },
  water_filter: { typical: 100, range: [40, 350] },
  lighting: { typical: 90, range: [30, 150] },
  first_aid: { typical: 300, range: [150, 600] },
  navigation: { typical: 150, range: [50, 300] },
  electronics: { typical: 250, range: [100, 500] },
  toiletries: { typical: 200, range: [80, 400] },
  safety: { typical: 200, range: [100, 400] },
};

export function defaultWeightClass(category: GearCategory): WeightClass {
  if (category === "food" || category === "fuel") return "consumable";
  if (category === "footwear") return "worn";
  return "base";
}

export function defaultShareable(category: GearCategory): boolean {
  return ["shelter", "cooking", "cookware", "water_filter", "first_aid", "navigation"].includes(category);
}

/** Keyword → category guesses for quick-add and the offline AI fallback. */
export const CATEGORY_KEYWORDS: [RegExp, GearCategory][] = [
  [/\b(backpack|pack|rucksack)\b/i, "backpack"],
  [/\b(tent|tarp|bivy|bivvy|shelter|hammock|fly)\b/i, "shelter"],
  [/\b(sleeping bag|quilt|down bag)\b/i, "sleeping_bag"],
  [/\b(mat|pad|sleeping mat|thermarest|neoair)\b/i, "sleeping_mat"],
  [/\b(boot|boots|shoe|shoes|trail runner|runners|sandal|gaiter)/i, "footwear"],
  [/\b(stove|burner|lighter|matches)\b/i, "cooking"],
  [/\b(pot|pan|mug|cup|spork|spoon|bowl|kettle|cookset)\b/i, "cookware"],
  [/\b(bottle|bladder|reservoir|hydration|flask)\b/i, "water_bottle"],
  [/\b(filter|purifier|steripen|aquatabs|tablets|lifestraw|sawyer)\b/i, "water_filter"],
  [/\b(headlamp|head torch|torch|lantern|flashlight)\b/i, "lighting"],
  [/\b(map|compass|gps)\b/i, "navigation"],
  [/\b(first aid|bandage|blister)\b/i, "first_aid"],
  [/\b(plb|beacon|inreach|whistle|emergency blanket|space blanket|satellite)\b/i, "safety"],
  [/\b(phone|power ?bank|battery|charger|cable|camera|watch)\b/i, "electronics"],
  [/\b(gas|canister|fuel|butane|isobutane|metho)\b/i, "fuel"],
  [/\b(toothbrush|toothpaste|sunscreen|soap|trowel|toilet|sanitiser|sanitizer|towel)\b/i, "toiletries"],
  [/\b(jacket|fleece|shirt|pants|trousers|shorts|beanie|gloves|socks|thermal|base ?layer|puffer|down jacket|rain|shell|hat|undies|underwear|boardies)\b/i, "clothing"],
  [/\b(food|snack|bar|meal|oats|noodles)\b/i, "food"],
];

export function guessCategory(text: string): GearCategory {
  for (const [re, cat] of CATEGORY_KEYWORDS) if (re.test(text)) return cat;
  return "misc";
}
