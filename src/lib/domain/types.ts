/**
 * Rovefern domain model.
 *
 * Design rule: the Trip stores *inputs* (what the user or a verified source said).
 * Everything that can be computed — pack weights, food quantities, fuel, water,
 * budget totals, progress — is *derived* by the deterministic engine in
 * `src/lib/engine`. That way, changing trip length or group size automatically
 * flows through to food, fuel, costs and packing without anyone (human or AI)
 * having to remember to update them.
 */

// ---------------------------------------------------------------------------
// Provenance — every fact that can be wrong carries where it came from.
// ---------------------------------------------------------------------------

export type ProvenanceKind =
  | "official" // national park authority, government agency, official trail body
  | "third_party" // recognised provider (OpenStreetMap, Open-Meteo, Frankfurter…)
  | "user" // the user typed or imported it
  | "ai" // AI suggestion — needs checking
  | "estimate" // computed estimate from stated assumptions
  | "unverified"; // we could not verify it

export interface Provenance {
  kind: ProvenanceKind;
  sourceName?: string;
  sourceUrl?: string;
  /** ISO timestamp of when the information was retrieved or entered. */
  retrievedAt?: string;
  note?: string;
}

/** A value plus where it came from. `value` is null when unknown. */
export interface Sourced<T> {
  value: T | null;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export type UnitSystem = "metric" | "imperial";

export interface UserSettings {
  units: UnitSystem;
  currency: string; // ISO 4217, e.g. "AUD"
  locale?: string; // BCP-47, e.g. "en-AU"
  timezone?: string; // IANA, e.g. "Australia/Sydney"
}

// ---------------------------------------------------------------------------
// Gear
// ---------------------------------------------------------------------------

export const GEAR_CATEGORIES = [
  "backpack",
  "shelter",
  "sleeping_bag",
  "sleeping_mat",
  "clothing",
  "footwear",
  "cooking",
  "cookware",
  "water_bottle",
  "water_filter",
  "electronics",
  "lighting",
  "navigation",
  "first_aid",
  "safety",
  "food",
  "fuel",
  "toiletries",
  "misc",
] as const;

export type GearCategory = (typeof GEAR_CATEGORIES)[number];

export const GEAR_CATEGORY_LABELS: Record<GearCategory, string> = {
  backpack: "Backpacks",
  shelter: "Tents & shelters",
  sleeping_bag: "Sleeping bags",
  sleeping_mat: "Sleeping mats",
  clothing: "Clothing",
  footwear: "Footwear",
  cooking: "Cooking equipment",
  cookware: "Cookware",
  water_bottle: "Water bottles",
  water_filter: "Water treatment",
  electronics: "Electronics",
  lighting: "Lighting",
  navigation: "Navigation",
  first_aid: "First aid",
  safety: "Safety",
  food: "Food",
  fuel: "Fuel",
  toiletries: "Toiletries",
  misc: "Miscellaneous",
};

/** How an item contributes to weight. */
export type WeightClass = "base" | "worn" | "consumable";

export interface GearItem {
  id: string;
  name: string;
  brand?: string;
  model?: string;
  category: GearCategory;
  /** Weight of ONE unit, in grams. Null = unknown (excluded from totals, flagged). */
  weightGrams: number | null;
  quantity: number;
  purchasePrice?: number;
  currency?: string;
  imageDataUrl?: string;
  notes?: string;
  essential: boolean;
  weightClass: WeightClass;
  /** Typically shared within a group (tent, stove, filter). */
  shareable: boolean;
  favourite: boolean;
  /** False for items the user still needs to buy, borrow or rent. */
  owned: boolean;
  /** Where the weight figure came from. */
  weightProvenance: Provenance;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Trip
// ---------------------------------------------------------------------------

export type TripStatus = "planning" | "preparing" | "ready" | "completed";

export interface Participant {
  id: string;
  name: string;
}

export interface Destination {
  name: string;
  country?: string;
  region?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  /** If the trip is built on a catalogue trail. */
  trailId?: string;
}

export interface Waypoint {
  id: string;
  name: string;
  kind: "start" | "finish" | "camp" | "water" | "resupply" | "access" | "landmark" | "hut";
  lat: number;
  lon: number;
  provenance: Provenance;
}

export interface ItineraryDay {
  id: string;
  dayNumber: number; // 1-based
  title?: string;
  from: string;
  to: string;
  distanceKm: Sourced<number>;
  ascentM: Sourced<number>;
  descentM: Sourced<number>;
  /** Optional override; otherwise computed with Naismith-style estimate. */
  walkingHoursOverride?: number | null;
  terrain?: string;
  breaks?: string;
  overnight?: string; // campsite/hut/accommodation name
  overnightProvenance?: Provenance;
  water?: string;
  waterProvenance?: Provenance;
  resupply?: string;
  warnings?: string[];
  notes?: string;
  /** True once a person has edited this day — AI edits must preserve it unless asked. */
  userEdited?: boolean;
}

/** A gear item used on a specific trip. */
export interface TripGearEntry {
  id: string;
  gearId: string; // references GearItem in the library
  /**
   * "each": every participant brings their own (e.g. sleeping bag).
   * "assigned": one carrier carries it for the group (e.g. tent, stove).
   */
  scope: "each" | "assigned";
  carrierId?: string; // required for "assigned"
  quantity: number; // per participant for "each", total for "assigned"
  /** Participant ids who have packed it (for "each"), or [carrierId] for "assigned". */
  packedBy: string[];
  /** Manual override of where it goes in the pack. */
  zoneOverride?: PackZone;
}

export type PackZone = "bottom" | "core" | "top" | "outer" | "dry" | "worn" | "pack";

export const BUDGET_CATEGORIES = [
  "flights",
  "fuel",
  "car_hire",
  "public_transport",
  "campsite_fees",
  "accommodation",
  "permits",
  "food",
  "gear_purchase",
  "gear_rental",
  "activities",
  "insurance",
  "emergency_reserve",
  "misc",
] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  flights: "Flights",
  fuel: "Fuel",
  car_hire: "Car hire",
  public_transport: "Public transport",
  campsite_fees: "Campsite fees",
  accommodation: "Accommodation",
  permits: "Permits & park fees",
  food: "Food",
  gear_purchase: "Gear to buy",
  gear_rental: "Gear rental",
  activities: "Activities",
  insurance: "Insurance",
  emergency_reserve: "Emergency reserve",
  misc: "Miscellaneous",
};

export interface BudgetLine {
  id: string;
  category: BudgetCategory;
  label: string;
  /** Estimated amount in `currency`. Null = not yet estimated. */
  estimate: number | null;
  /** What was actually spent, in `currency`. */
  actual?: number | null;
  currency: string;
  /** "group" = one cost for everyone, "per_person" = multiplied by group size. */
  basis: "group" | "per_person";
  /** Who paid, for settling up. */
  paidBy?: string;
  provenance: Provenance;
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snacks";

export interface MealOption {
  id: string;
  slot: MealSlot;
  name: string;
  /** Dry/packed weight of one serving, grams. */
  gramsPerServing: number;
  /** Whether it needs boiling water / cooking. */
  needsCooking: boolean;
  /** Water needed to rehydrate/cook one serving, ml. */
  cookingWaterMl: number;
  ingredients?: { name: string; gramsPerServing: number }[];
  /** Optional cost per serving if the user knows it. */
  costPerServing?: number | null;
  costProvenance?: Provenance;
  dietary?: string[]; // e.g. ["vegetarian", "gluten-free"]
}

export interface FoodPlan {
  intensity: "easy" | "moderate" | "hard";
  dietary: string[];
  preferences?: string;
  /** Menu options used in rotation, by slot. */
  menu: MealOption[];
  /** Per-day overrides: dayNumber -> slot -> mealOption id. */
  overrides: Record<number, Partial<Record<MealSlot, string>>>;
  /** Days where food can be bought/collected (resets carried food). */
  resupplyDays: number[];
  /** Extra emergency day of food, recommended for remote trips. */
  spareDay: boolean;
}

export interface WaterPlan {
  /** Expected maximum daytime temperature, °C (user or forecast). */
  expectedMaxTempC?: number | null;
  /** Longest stretch between reliable water, in hours of walking. */
  longestDryStretchHours?: number | null;
  /** Total carrying capacity per person, litres (from bottles/bladders). */
  capacityLitresPerPerson?: number | null;
  treatment?: string;
  notes?: string;
}

export interface ChecklistItem {
  id: string;
  group: "gear" | "permits" | "transport" | "safety" | "food" | "admin";
  label: string;
  done: boolean;
  detail?: string;
}

export interface TripRequirements {
  rawPrompt?: string;
  startLocation?: string;
  experience?: "beginner" | "intermediate" | "experienced";
  desiredDifficulty?: string;
  scenery?: string[];
  terrain?: string[];
  distancePreference?: string;
  transport?: string;
  camping?: string;
  existingGear?: string[];
  foodPreferences?: string;
  dietary?: string[];
  other?: string[];
}

export interface Trip {
  id: string;
  title: string;
  status: TripStatus;
  archived: boolean;
  destination: Destination;
  startDate?: string | null; // ISO date (YYYY-MM-DD), in destination's local time
  durationDays: number;
  participants: Participant[];
  difficulty?: string; // free text in the local grading system
  gradingSystem?: string; // e.g. "AS 2156.1 (Australia)", "SAC T-scale (Switzerland)"
  currency: string;
  budgetMax?: number | null;
  budgetBasis: "group" | "per_person";
  requirements: TripRequirements;
  days: ItineraryDay[];
  waypoints: Waypoint[];
  route?: { coordinates: [number, number, number?][]; provenance: Provenance } | null;
  gear: TripGearEntry[];
  budget: BudgetLine[];
  food: FoodPlan;
  water: WaterPlan;
  checklist: ChecklistItem[];
  /** Short summary of the route / why the AI chose it. */
  summary?: string;
  /** Caveats the user must know (data gaps, unverified items). */
  limitations: string[];
  /** Trip intentions: who knows where you are and when to raise the alarm. */
  emergency?: { contactName?: string; contactPhone?: string; checkInBy?: string; notes?: string };
  createdAt: string;
  updatedAt: string;
}
