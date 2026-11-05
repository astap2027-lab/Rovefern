import type { GearItem, Trip } from "../domain/types";
import { summariseBudget, type RateTable } from "./budget";
import { planFood } from "./food";
import { layoutPack, packingProgress } from "./packing";
import { itineraryTotals, type Pace } from "./time";
import { estimateWater, WATER_RESERVE_L } from "./water";
import { computeGroupWeights } from "./weight";

/** Everything the dashboard shows that is computed rather than stored. */
export function deriveTrip(trip: Trip, library: GearItem[], opts: { rates?: RateTable | null; pace?: Pace } = {}) {
  const lib = new Map(library.map((g) => [g.id, g]));
  const people = trip.participants.length;
  const totals = itineraryTotals(trip.days, opts.pace);
  const food = planFood(trip.food, trip.durationDays, people);
  const water = estimateWater(trip.water, totals.longestDayHours, food.cookingWaterLitres, people, trip.durationDays);

  // Water carried leaving a refill: the dry-stretch carry if known (capped at capacity),
  // otherwise capacity, otherwise a conservative 2 L placeholder clearly labelled.
  let waterStartL = 2;
  let waterAssumption = "Assumes 2 L carried leaving each refill point. Set your longest dry stretch to refine this.";
  if (water.carryForDryStretchL != null) {
    waterStartL = water.capacityL != null ? Math.min(water.capacityL, water.carryForDryStretchL) : water.carryForDryStretchL;
    waterAssumption = `Carrying ${waterStartL} L for the longest stretch between water.`;
  } else if (water.capacityL != null) {
    waterStartL = water.capacityL;
    waterAssumption = `Assumes bottles filled to your ${water.capacityL} L capacity.`;
  }

  const weights = computeGroupWeights(trip.participants, trip.gear, lib, {
    foodStartGramsPerPerson: food.startCarriedFoodGramsPerPerson,
    foodEndGramsPerPerson: food.endCarriedFoodGramsPerPerson,
    waterStartLitresPerPerson: waterStartL,
    waterEndLitresPerPerson: Math.min(waterStartL, WATER_RESERVE_L),
    estimatedFuelGrams: food.fuelGrams,
  });

  const overrides = Object.fromEntries(trip.gear.map((g) => [g.id, g.zoneOverride]));
  const layouts = weights.people.map((p) => ({ participantId: p.participantId, layout: layoutPack(p.items, overrides) }));

  const allPackItems = weights.people.flatMap((p) => p.items.filter((i) => i.weightClass !== "worn"));
  const packing = packingProgress(allPackItems);
  const checklistDone = trip.checklist.filter((c) => c.done).length;
  const checklistTotal = trip.checklist.length;
  // Preparation progress weights checklist and packing equally when both exist.
  const parts: number[] = [];
  if (checklistTotal) parts.push(checklistDone / checklistTotal);
  if (packing.total) parts.push(packing.packed / packing.total);
  const preparationPercent = parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : 0;

  const budget = summariseBudget({
    lines: trip.budget,
    participants: trip.participants,
    days: trip.durationDays,
    currency: trip.currency,
    budgetMax: trip.budgetMax,
    budgetBasis: trip.budgetBasis,
    rates: opts.rates,
  });

  return { totals, food, water, waterStartL, waterAssumption, weights, layouts, packing, checklistDone, checklistTotal, preparationPercent, budget };
}

export type DerivedTrip = ReturnType<typeof deriveTrip>;
