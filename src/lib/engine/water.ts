import type { WaterPlan } from "../domain/types";
import { round } from "./units";

/**
 * Water estimates are deliberately expressed as RANGES with visible assumptions.
 * Needs vary hugely with body size, fitness, sweat rate, humidity, sun exposure
 * and altitude, so the app never presents a single number as "what you need".
 *
 * Assumptions (shown in the UI):
 * - Moderate hiking: roughly 0.4–0.75 L per hour of walking in mild conditions.
 * - Hot conditions (≥ 28 °C): upper bound rises to ~1 L/h.
 * - Very hot conditions (≥ 34 °C): lower bound rises to 0.6 L/h, upper ~1.25 L/h.
 * - Plus camp/cooking water from the food plan.
 * - A reserve of 0.5 L is suggested on top of every carry.
 */
export const WATER_RESERVE_L = 0.5;

export function hourlyRateRange(maxTempC?: number | null): [number, number] {
  if (maxTempC == null) return [0.4, 0.75];
  if (maxTempC >= 34) return [0.6, 1.25];
  if (maxTempC >= 28) return [0.5, 1.0];
  if (maxTempC <= 10) return [0.3, 0.6];
  return [0.4, 0.75];
}

export interface WaterEstimate {
  hourlyRangeL: [number, number];
  /** Drinking water while walking on the longest day, per person. */
  walkingRangeLPerPerson: [number, number];
  /** Camp & cooking water per person per day (from food plan). */
  campLitresPerPersonPerDay: number;
  /** What to carry for the longest dry stretch, per person (upper bound + reserve). */
  carryForDryStretchL: number | null;
  capacityL: number | null;
  capacityShortfallL: number | null;
  warnings: string[];
  assumptions: string[];
}

export function estimateWater(
  plan: WaterPlan,
  longestDayWalkingHours: number | null,
  cookingWaterLitresTotal: number,
  people: number,
  days: number,
): WaterEstimate {
  const [lo, hi] = hourlyRateRange(plan.expectedMaxTempC);
  const hours = longestDayWalkingHours ?? 0;
  const campPerPersonPerDay = days > 0 && people > 0 ? cookingWaterLitresTotal / people / days : 0;
  const warnings: string[] = [
    "Treat all natural water (filter, chemical or boil) unless an official source says it is safe to drink.",
  ];

  let carry: number | null = null;
  if (plan.longestDryStretchHours != null && plan.longestDryStretchHours >= 0) {
    carry = round(plan.longestDryStretchHours * hi + WATER_RESERVE_L, 1);
  }
  const capacity = plan.capacityLitresPerPerson ?? null;
  let shortfall: number | null = null;
  if (carry != null && capacity != null) {
    shortfall = round(Math.max(0, carry - capacity), 1);
    if (shortfall > 0) {
      warnings.push(
        `Your carrying capacity (${capacity} L) is below the suggested carry for the longest dry stretch (${carry} L). Consider another bottle or bladder.`,
      );
    }
  }
  if (plan.longestDryStretchHours == null) {
    warnings.push("Water sources along the route are not confirmed. Plan to carry more until you have verified refill points.");
  }

  return {
    hourlyRangeL: [lo, hi],
    walkingRangeLPerPerson: [round(lo * hours, 1), round(hi * hours, 1)],
    campLitresPerPersonPerDay: round(campPerPersonPerDay, 1),
    carryForDryStretchL: carry,
    capacityL: capacity,
    capacityShortfallL: shortfall,
    warnings,
    assumptions: [
      `Walking: about ${lo}–${hi} L per hour${plan.expectedMaxTempC != null ? ` at a forecast/expected max of ${plan.expectedMaxTempC} °C` : " in mild conditions"}.`,
      `Plus a ${WATER_RESERVE_L} L reserve on every carry.`,
      "Individual needs vary with body size, sweat rate, humidity, sun and altitude. Drink to thirst and watch for signs of dehydration.",
    ],
  };
}
