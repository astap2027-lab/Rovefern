import type { GearCategory, GearItem, Participant, TripGearEntry, WeightClass } from "../domain/types";
import { round } from "./units";

/**
 * Pack weight definitions (shown verbatim in the UI glossary):
 * - Base weight: everything carried in or on the pack except consumables. Excludes worn items.
 * - Consumable weight: food, water, fuel and anything else used up on the trip.
 * - Worn weight: clothing/footwear/gear worn while walking (not carried).
 * - Total carried weight: base + consumables. What's actually on your back.
 * - All-up weight: total carried + worn. What you and your kit weigh together, minus you.
 */

export interface ResolvedItem {
  entryId: string;
  gearId: string;
  name: string;
  category: GearCategory;
  weightClass: WeightClass;
  quantity: number;
  unitGrams: number | null;
  totalGrams: number; // 0 when unknown
  shared: boolean;
  packed: boolean;
}

export interface PersonWeights {
  participantId: string;
  name: string;
  items: ResolvedItem[];
  baseGrams: number;
  wornGrams: number;
  /** Consumable gear from the library (sunscreen, gas canisters…). */
  consumableGearGrams: number;
  foodStartGrams: number;
  foodEndGrams: number;
  waterStartGrams: number;
  waterEndGrams: number;
  fuelStartGrams: number; // computed fuel estimate assigned to this person
  consumableStartGrams: number;
  consumableEndGrams: number;
  totalCarriedStartGrams: number;
  totalCarriedEndGrams: number;
  allUpStartGrams: number;
  baseByCategory: { category: GearCategory; grams: number; percentOfBase: number }[];
  unknownWeightItems: string[];
  packedCount: number;
  itemCount: number;
}

export interface GroupWeights {
  people: PersonWeights[];
  groupBaseGrams: number;
  groupTotalCarriedStartGrams: number;
  sharedGearGrams: number;
  /** Heaviest minus lightest carried start weight — signals uneven sharing. */
  imbalanceGrams: number;
}

export interface ConsumableInputs {
  /** Food per person at start and end (from food engine). */
  foodStartGramsPerPerson: number;
  foodEndGramsPerPerson: number;
  /** Water each person carries leaving a refill point, litres. */
  waterStartLitresPerPerson: number;
  waterEndLitresPerPerson: number;
  /** Estimated fuel (gas) for the group, grams; ignored if trip gear includes fuel items. */
  estimatedFuelGrams: number;
}

export function resolveEntries(
  entries: TripGearEntry[],
  library: Map<string, GearItem>,
  participant: Participant,
): ResolvedItem[] {
  const out: ResolvedItem[] = [];
  for (const e of entries) {
    const item = library.get(e.gearId);
    if (!item) continue;
    const mine = e.scope === "each" || e.carrierId === participant.id;
    if (!mine) continue;
    const qty = Math.max(0, e.quantity);
    const unit = item.weightGrams;
    out.push({
      entryId: e.id,
      gearId: item.id,
      name: item.name,
      category: item.category,
      weightClass: item.weightClass,
      quantity: qty,
      unitGrams: unit,
      totalGrams: unit == null ? 0 : unit * qty,
      shared: e.scope === "assigned",
      packed: e.packedBy.includes(participant.id),
    });
  }
  return out;
}

/** Who carries the computed fuel: whoever carries a stove, else the first participant. */
export function fuelCarrierId(entries: TripGearEntry[], library: Map<string, GearItem>, participants: Participant[]): string | undefined {
  const stove = entries.find((e) => e.scope === "assigned" && library.get(e.gearId)?.category === "cooking");
  return stove?.carrierId ?? participants[0]?.id;
}

export function computeGroupWeights(
  participants: Participant[],
  entries: TripGearEntry[],
  library: Map<string, GearItem>,
  consumables: ConsumableInputs,
): GroupWeights {
  const tripHasFuelItems = entries.some((e) => library.get(e.gearId)?.category === "fuel");
  const fuelCarrier = tripHasFuelItems ? undefined : fuelCarrierId(entries, library, participants);

  const people: PersonWeights[] = participants.map((p) => {
    const items = resolveEntries(entries, library, p);
    let base = 0,
      worn = 0,
      consGear = 0;
    const byCat = new Map<GearCategory, number>();
    const unknown: string[] = [];
    for (const it of items) {
      if (it.unitGrams == null) unknown.push(it.name);
      if (it.weightClass === "worn") worn += it.totalGrams;
      else if (it.weightClass === "consumable") consGear += it.totalGrams;
      else {
        base += it.totalGrams;
        byCat.set(it.category, (byCat.get(it.category) ?? 0) + it.totalGrams);
      }
    }
    const fuel = p.id === fuelCarrier ? Math.max(0, consumables.estimatedFuelGrams) : 0;
    const foodStart = Math.max(0, consumables.foodStartGramsPerPerson);
    const foodEnd = Math.max(0, consumables.foodEndGramsPerPerson);
    const waterStart = Math.max(0, consumables.waterStartLitresPerPerson) * 1000; // 1 L water ≈ 1 kg
    const waterEnd = Math.max(0, consumables.waterEndLitresPerPerson) * 1000;
    const consStart = consGear + foodStart + waterStart + fuel;
    const consEnd = consGear + foodEnd + waterEnd; // fuel assumed used
    return {
      participantId: p.id,
      name: p.name,
      items,
      baseGrams: round(base),
      wornGrams: round(worn),
      consumableGearGrams: round(consGear),
      foodStartGrams: round(foodStart),
      foodEndGrams: round(foodEnd),
      waterStartGrams: round(waterStart),
      waterEndGrams: round(waterEnd),
      fuelStartGrams: round(fuel),
      consumableStartGrams: round(consStart),
      consumableEndGrams: round(consEnd),
      totalCarriedStartGrams: round(base + consStart),
      totalCarriedEndGrams: round(base + consEnd),
      allUpStartGrams: round(base + consStart + worn),
      baseByCategory: [...byCat.entries()]
        .map(([category, grams]) => ({ category, grams: round(grams), percentOfBase: base > 0 ? round((grams / base) * 100, 1) : 0 }))
        .sort((a, b) => b.grams - a.grams),
      unknownWeightItems: unknown,
      packedCount: items.filter((i) => i.packed).length,
      itemCount: items.length,
    };
  });

  const shared = entries
    .filter((e) => e.scope === "assigned")
    .reduce((s, e) => s + (library.get(e.gearId)?.weightGrams ?? 0) * Math.max(0, e.quantity), 0);
  const carried = people.map((p) => p.totalCarriedStartGrams);

  return {
    people,
    groupBaseGrams: round(people.reduce((s, p) => s + p.baseGrams, 0)),
    groupTotalCarriedStartGrams: round(carried.reduce((s, n) => s + n, 0)),
    sharedGearGrams: round(shared),
    imbalanceGrams: carried.length ? round(Math.max(...carried) - Math.min(...carried)) : 0,
  };
}

/**
 * Library-only weight summary (My Gear page): sums the whole library or a selection,
 * honouring quantity and weight class. Unknown weights are reported, never guessed.
 */
export function librarySummary(items: GearItem[]) {
  let base = 0,
    worn = 0,
    cons = 0;
  const byCat = new Map<GearCategory, number>();
  const unknown: string[] = [];
  for (const it of items) {
    if (it.weightGrams == null) {
      unknown.push(it.name);
      continue;
    }
    const g = it.weightGrams * Math.max(0, it.quantity);
    if (it.weightClass === "worn") worn += g;
    else if (it.weightClass === "consumable") cons += g;
    else base += g;
    byCat.set(it.category, (byCat.get(it.category) ?? 0) + g);
  }
  const total = base + worn + cons;
  return {
    baseGrams: round(base),
    wornGrams: round(worn),
    consumableGrams: round(cons),
    totalGrams: round(total),
    byCategory: [...byCat.entries()]
      .map(([category, grams]) => ({ category, grams: round(grams), percent: total > 0 ? round((grams / total) * 100, 1) : 0 }))
      .sort((a, b) => b.grams - a.grams),
    unknownWeightItems: unknown,
  };
}

/** Base-weight bands commonly used in the backpacking community (for context only). */
export function baseWeightBand(grams: number): { label: string; description: string } {
  const kg = grams / 1000;
  if (kg < 4.5) return { label: "Ultralight", description: "Under about 4.5 kg (10 lb) base weight." };
  if (kg < 9) return { label: "Lightweight", description: "About 4.5–9 kg (10–20 lb) base weight." };
  return { label: "Traditional", description: "Over about 9 kg (20 lb) base weight." };
}
