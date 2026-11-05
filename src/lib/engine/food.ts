import type { FoodPlan, MealOption, MealSlot } from "../domain/types";
import { round } from "./units";

export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snacks"];
export const SKIP = "skip";

/**
 * Typical packed-food weight ranges used as a *reference*, not a prescription.
 * Commonly cited backpacking guidance is roughly 0.7–0.9 kg (1.5–2 lb) of dry
 * food per person per day; lighter for easy trips, heavier for hard ones.
 */
export const FOOD_REFERENCE_G_PER_DAY: Record<FoodPlan["intensity"], [number, number]> = {
  easy: [550, 700],
  moderate: [680, 850],
  hard: [800, 1000],
};

/**
 * Fuel assumption for canister (butane/propane) stoves: roughly 10–15 g of gas to bring
 * 1 L of water to the boil in mild conditions. We use 13 g/L and add a 25% margin for
 * wind, cold and simmering. Shown to users as an estimate with these assumptions.
 */
export const FUEL_G_PER_LITRE_BOILED = 13;
export const FUEL_MARGIN = 1.25;

export interface PlannedMeal {
  dayNumber: number; // spare day is durationDays + 1
  slot: MealSlot;
  meal: MealOption | null; // null = skipped / none on menu
  servings: number;
  isSpare: boolean;
}

export interface ShoppingLine {
  name: string;
  grams: number;
  /** How many servings of the parent meal this line is for (if not ingredient-level). */
  servings?: number;
}

export interface FoodSummary {
  meals: PlannedMeal[];
  people: number;
  daysFed: number; // including spare
  totalFoodGrams: number;
  foodGramsPerPersonPerDay: number;
  referenceRangeGPerDay: [number, number];
  /** Packed food weight per person at trip start (until first resupply, incl. spare). */
  startCarriedFoodGramsPerPerson: number;
  /** Food left per person at the end (spare day, assumed uneaten). */
  endCarriedFoodGramsPerPerson: number;
  /** Max food carried per person after any resupply. */
  maxCarriedFoodGramsPerPerson: number;
  cookingWaterLitres: number;
  fuelGrams: number;
  fuelAssumption: string;
  knownCost: number;
  servingsWithUnknownCost: number;
  shoppingList: ShoppingLine[];
}

function pickMeal(plan: FoodPlan, slot: MealSlot, dayNumber: number): MealOption | null {
  const override = plan.overrides[dayNumber]?.[slot];
  if (override === SKIP) return null;
  if (override) {
    const m = plan.menu.find((x) => x.id === override);
    if (m) return m;
  }
  const options = plan.menu.filter((m) => m.slot === slot);
  if (options.length === 0) return null;
  // Rotate through options so a 5-day trip doesn't eat the same dinner every night.
  return options[(dayNumber - 1) % options.length];
}

/** Grams of food (per person) eaten on the given days. */
function gramsForDays(meals: PlannedMeal[], days: Set<number>): number {
  return meals
    .filter((m) => days.has(m.dayNumber) && m.meal)
    .reduce((sum, m) => sum + (m.meal as MealOption).gramsPerServing, 0);
}

export function planFood(
  plan: FoodPlan,
  durationDays: number,
  people: number,
  opts: { hotDrinkMlPerPersonPerDay?: number } = {},
): FoodSummary {
  const days = Math.max(0, Math.floor(durationDays));
  const ppl = Math.max(1, Math.floor(people));
  const meals: PlannedMeal[] = [];

  for (let d = 1; d <= days; d++) {
    for (const slot of MEAL_SLOTS) {
      meals.push({ dayNumber: d, slot, meal: pickMeal(plan, slot, d), servings: ppl, isSpare: false });
    }
  }
  if (plan.spareDay && days > 0) {
    const spare = days + 1;
    for (const slot of MEAL_SLOTS) {
      // Spare food is the lightest, no-cook-preferred option for the slot.
      const options = plan.menu.filter((m) => m.slot === slot);
      const choice =
        [...options].sort(
          (a, b) => Number(a.needsCooking) - Number(b.needsCooking) || a.gramsPerServing - b.gramsPerServing,
        )[0] ?? null;
      meals.push({ dayNumber: spare, slot, meal: choice, servings: ppl, isSpare: true });
    }
  }

  const perPersonTotal = meals.reduce((s, m) => s + (m.meal?.gramsPerServing ?? 0), 0);
  const totalFoodGrams = perPersonTotal * ppl;
  const regularPerPerson = meals.filter((m) => !m.isSpare).reduce((s, m) => s + (m.meal?.gramsPerServing ?? 0), 0);

  // Carried food per segment: a resupply on day k means food for days k.. is collected that morning.
  const resupplies = [...new Set(plan.resupplyDays)]
    .filter((d) => d > 1 && d <= days)
    .sort((a, b) => a - b);
  const boundaries = [1, ...resupplies, days + 1];
  const spareGrams = plan.spareDay ? gramsForDays(meals, new Set([days + 1])) : 0;
  const segmentGrams: number[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const set = new Set<number>();
    for (let d = boundaries[i]; d < boundaries[i + 1]; d++) set.add(d);
    segmentGrams.push(gramsForDays(meals, set) + spareGrams);
  }
  const start = segmentGrams[0] ?? spareGrams;

  const cookingWaterMl =
    meals.reduce((s, m) => s + (m.meal?.needsCooking ? m.meal.cookingWaterMl * m.servings : 0), 0) +
    (opts.hotDrinkMlPerPersonPerDay ?? 0) * ppl * days;
  const cookingWaterLitres = cookingWaterMl / 1000;
  const fuelGrams = Math.ceil(cookingWaterLitres * FUEL_G_PER_LITRE_BOILED * FUEL_MARGIN);

  let knownCost = 0;
  let unknown = 0;
  for (const m of meals) {
    if (!m.meal) continue;
    if (m.meal.costPerServing != null) knownCost += m.meal.costPerServing * m.servings;
    else unknown += m.servings;
  }

  // Shopping list: ingredient-level where known, else whole meal.
  const lines = new Map<string, ShoppingLine>();
  for (const m of meals) {
    if (!m.meal) continue;
    if (m.meal.ingredients?.length) {
      for (const ing of m.meal.ingredients) {
        const key = ing.name.trim().toLowerCase();
        const prev = lines.get(key) ?? { name: ing.name.trim(), grams: 0 };
        prev.grams += ing.gramsPerServing * m.servings;
        lines.set(key, prev);
      }
    } else {
      const key = `meal:${m.meal.name.trim().toLowerCase()}`;
      const prev = lines.get(key) ?? { name: m.meal.name.trim(), grams: 0, servings: 0 };
      prev.grams += m.meal.gramsPerServing * m.servings;
      prev.servings = (prev.servings ?? 0) + m.servings;
      lines.set(key, prev);
    }
  }

  return {
    meals,
    people: ppl,
    daysFed: days + (plan.spareDay && days > 0 ? 1 : 0),
    totalFoodGrams,
    foodGramsPerPersonPerDay: days > 0 ? round(regularPerPerson / days) : 0,
    referenceRangeGPerDay: FOOD_REFERENCE_G_PER_DAY[plan.intensity],
    startCarriedFoodGramsPerPerson: start,
    endCarriedFoodGramsPerPerson: spareGrams,
    maxCarriedFoodGramsPerPerson: segmentGrams.length ? Math.max(...segmentGrams) : spareGrams,
    cookingWaterLitres: round(cookingWaterLitres, 2),
    fuelGrams,
    fuelAssumption: `About ${FUEL_G_PER_LITRE_BOILED} g of canister gas per litre boiled, plus ${round(
      (FUEL_MARGIN - 1) * 100,
    )}% for wind, cold and simmering. Check your stove's own figures.`,
    knownCost: round(knownCost, 2),
    servingsWithUnknownCost: unknown,
    shoppingList: [...lines.values()]
      .map((l) => ({ ...l, grams: round(l.grams) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
