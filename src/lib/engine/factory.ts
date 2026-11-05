import type {
  ChecklistItem,
  FoodPlan,
  ItineraryDay,
  MealOption,
  Participant,
  Provenance,
  Trip,
} from "../domain/types";

export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

export const nowISO = () => new Date().toISOString();

export const prov = (kind: Provenance["kind"], extra: Omit<Provenance, "kind"> = {}): Provenance => ({
  kind,
  retrievedAt: nowISO(),
  ...extra,
});

export function blankDay(dayNumber: number, from = "", to = ""): ItineraryDay {
  const unknown = prov("unverified", { note: "Not yet planned" });
  return {
    id: uid(),
    dayNumber,
    from,
    to,
    distanceKm: { value: null, provenance: unknown },
    ascentM: { value: null, provenance: unknown },
    descentM: { value: null, provenance: unknown },
    warnings: [],
  };
}

/**
 * Starter menu. Weights are typical packed weights for common backpacking foods and
 * are labelled as estimates in the UI — users should replace them with their own.
 */
export function starterMenu(): MealOption[] {
  const est = prov("estimate", { note: "Typical packed weight — check your own food's label" });
  const m = (o: Omit<MealOption, "id" | "costProvenance">): MealOption => ({ id: uid(), costProvenance: est, ...o });
  return [
    m({ slot: "breakfast", name: "Oats with powdered milk & dried fruit", gramsPerServing: 130, needsCooking: true, cookingWaterMl: 300, costPerServing: null, dietary: ["vegetarian"], ingredients: [{ name: "Rolled oats", gramsPerServing: 80 }, { name: "Powdered milk", gramsPerServing: 25 }, { name: "Dried fruit", gramsPerServing: 25 }] }),
    m({ slot: "breakfast", name: "Granola with powdered milk", gramsPerServing: 120, needsCooking: false, cookingWaterMl: 0, costPerServing: null, dietary: ["vegetarian"], ingredients: [{ name: "Granola", gramsPerServing: 95 }, { name: "Powdered milk", gramsPerServing: 25 }] }),
    m({ slot: "lunch", name: "Wraps with cheese & salami", gramsPerServing: 210, needsCooking: false, cookingWaterMl: 0, costPerServing: null, ingredients: [{ name: "Tortilla wraps", gramsPerServing: 90 }, { name: "Hard cheese", gramsPerServing: 60 }, { name: "Salami", gramsPerServing: 60 }] }),
    m({ slot: "lunch", name: "Crackers, tuna sachet & cheese", gramsPerServing: 200, needsCooking: false, cookingWaterMl: 0, costPerServing: null, ingredients: [{ name: "Crackers", gramsPerServing: 70 }, { name: "Tuna sachet", gramsPerServing: 75 }, { name: "Hard cheese", gramsPerServing: 55 }] }),
    m({ slot: "dinner", name: "Freeze-dried meal", gramsPerServing: 150, needsCooking: true, cookingWaterMl: 450, costPerServing: null }),
    m({ slot: "dinner", name: "Couscous with dehydrated veg & olive oil", gramsPerServing: 170, needsCooking: true, cookingWaterMl: 300, costPerServing: null, dietary: ["vegetarian", "vegan"], ingredients: [{ name: "Couscous", gramsPerServing: 110 }, { name: "Dehydrated vegetables", gramsPerServing: 30 }, { name: "Olive oil", gramsPerServing: 30 }] }),
    m({ slot: "snacks", name: "Trail mix, bars & chocolate", gramsPerServing: 250, needsCooking: false, cookingWaterMl: 0, costPerServing: null, ingredients: [{ name: "Trail mix", gramsPerServing: 120 }, { name: "Muesli/energy bars", gramsPerServing: 80 }, { name: "Chocolate", gramsPerServing: 50 }] }),
  ];
}

export function defaultFoodPlan(): FoodPlan {
  return { intensity: "moderate", dietary: [], menu: starterMenu(), overrides: {}, resupplyDays: [], spareDay: true };
}

export function defaultChecklist(multiDay: boolean): ChecklistItem[] {
  const c = (group: ChecklistItem["group"], label: string, detail?: string): ChecklistItem => ({
    id: uid(),
    group,
    label,
    done: false,
    detail,
  });
  return [
    c("permits", "Check whether permits, bookings or park passes are required", "Use the official park authority's website for this destination."),
    c("permits", "Book campsites or huts if required"),
    c("transport", "Arrange transport to the start and from the finish"),
    c("safety", "Leave a trip intentions plan with someone you trust", "Route, campsites, party members, and when to raise the alarm if you haven't checked in."),
    c("safety", "Check official park alerts and closures the day before", "No alerts found does not mean a trail is safe."),
    c("safety", "Check the official weather forecast and fire danger rating"),
    c("safety", "Pack a first-aid kit and know how to use it"),
    c("safety", "Carry navigation that works without phone signal", "Paper map and compass, or offline maps plus a power bank."),
    c("safety", "Carry emergency communication", "A personal locator beacon (PLB) or satellite messenger for areas without reliable coverage."),
    c("safety", "Save local emergency numbers and the nearest ranger station"),
    c("gear", "Pack warm and waterproof layers for the coldest expected conditions"),
    c("food", "Buy and pack food, plus a spare day's worth" + (multiDay ? "" : " for emergencies")),
    c("food", "Confirm water sources and pack water treatment"),
    c("admin", "Charge phone, headlamp, power bank and devices"),
    c("admin", "Download this trip's offline pack to your phone"),
  ];
}

export function createTrip(input: {
  title?: string;
  destinationName?: string;
  country?: string;
  durationDays?: number;
  participants?: string[];
  currency?: string;
}): Trip {
  const days = Math.min(60, Math.max(1, Math.floor(input.durationDays ?? 2)));
  const names = input.participants?.length ? input.participants : ["You"];
  const participants: Participant[] = names.map((name) => ({ id: uid(), name }));
  const t = nowISO();
  return {
    id: uid(),
    title: input.title ?? (input.destinationName ? `${input.destinationName} adventure` : "New adventure"),
    status: "planning",
    archived: false,
    destination: { name: input.destinationName ?? "", country: input.country },
    startDate: null,
    durationDays: days,
    participants,
    currency: input.currency ?? "AUD",
    budgetMax: null,
    budgetBasis: "per_person",
    requirements: {},
    days: Array.from({ length: days }, (_, i) => blankDay(i + 1)),
    waypoints: [],
    route: null,
    gear: [],
    budget: [],
    food: defaultFoodPlan(),
    water: {},
    checklist: defaultChecklist(days > 1),
    limitations: [],
    createdAt: t,
    updatedAt: t,
  };
}
