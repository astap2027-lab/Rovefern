import type { PlanResponse, TripDraft, AssistantOp } from "../../server/schemas";
import { TYPICAL_WEIGHT_G, defaultShareable, defaultWeightClass } from "../../lib/domain/gearDefaults";
import { findTrail, type Trail } from "../../lib/domain/trails";
import type { BudgetLine, GearItem, ItineraryDay, Provenance, Trip } from "../../lib/domain/types";
import { blankDay, createTrip, nowISO, prov, uid } from "../../lib/engine/factory";
import type { TripOp } from "../../lib/engine/tripOps";
import type { DerivedTrip } from "../../lib/engine/derive";

export function trailProv(trail: Trail, sourceIdx: number | null | undefined): Provenance {
  if (sourceIdx == null) return prov("unverified");
  const s = trail.sources[sourceIdx];
  return prov(s.kind, { sourceName: s.name, sourceUrl: s.url, retrievedAt: trail.checkedAt });
}

type DraftDay = TripDraft["days"][number];

function dayFromDraft(n: number, d: DraftDay, kind: Provenance["kind"]): ItineraryDay {
  const p = prov(kind);
  const day = blankDay(n, d.from ?? "", d.to ?? "");
  day.title = d.title ?? undefined;
  if (d.distanceKm != null) day.distanceKm = { value: d.distanceKm, provenance: p };
  if (d.ascentM != null) day.ascentM = { value: d.ascentM, provenance: p };
  if (d.descentM != null) day.descentM = { value: d.descentM, provenance: p };
  day.terrain = d.terrain ?? undefined;
  day.breaks = d.breaks ?? undefined;
  if (d.overnight) {
    day.overnight = d.overnight;
    day.overnightProvenance = p;
  }
  if (d.water) {
    day.water = d.water;
    day.waterProvenance = p;
  }
  day.resupply = d.resupply ?? undefined;
  day.warnings = d.warnings ?? [];
  day.notes = d.notes ?? undefined;
  return day;
}

/**
 * Overlay verified catalogue facts on the AI's day plan. Official stage data wins over
 * AI numbers; AI notes (terrain, breaks, warnings) are kept and labelled.
 */
export function daysForTrail(trail: Trail, draftDays: DraftDay[], aiKind: Provenance["kind"] = "ai"): { days: ItineraryDay[]; notes: string[] } {
  const notes: string[] = [];
  const n = draftDays.length;
  const stops = trail.overnightStops.value;
  if (trail.stages.length && trail.stages.length === n) {
    return {
      days: trail.stages.map((st, i) => {
        const d = dayFromDraft(i + 1, draftDays[i] ?? { from: st.from, to: st.to }, aiKind);
        d.from = st.from;
        d.to = st.to;
        d.distanceKm = { value: st.distanceKm, provenance: trailProv(trail, st.source) };
        d.overnight = i < n - 1 ? st.to : d.overnight;
        if (i < n - 1) d.overnightProvenance = trailProv(trail, st.source);
        return d;
      }),
      notes,
    };
  }
  if (stops && stops.length === n - 1) {
    const points = [trail.start, ...stops, trail.finish];
    return {
      days: draftDays.map((dd, i) => {
        const d = dayFromDraft(i + 1, dd, aiKind);
        d.from = points[i];
        d.to = points[i + 1];
        if (i < n - 1) {
          d.overnight = stops[i];
          d.overnightProvenance = trailProv(trail, trail.overnightStops.source);
        }
        return d;
      }),
      notes,
    };
  }
  if (trail.stages.length || stops) {
    notes.push(
      `Your ${n}-day plan doesn't match the ${trail.name}'s usual stages, so the daily breakdown is a suggestion. Check stage lengths and overnight stops with the official source.`,
    );
  }
  const days = draftDays.map((dd, i) => dayFromDraft(i + 1, dd, aiKind));
  if (days[0] && !days[0].from) days[0].from = trail.start;
  if (days[n - 1] && !days[n - 1].to) days[n - 1].to = trail.finish;
  return { days, notes };
}

function matchesOwned(name: string, library: GearItem[], category: GearItem["category"]): GearItem | undefined {
  const words = name.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  // For "one of" categories, any owned item of that category covers the suggestion.
  const single = ["backpack", "shelter", "sleeping_bag", "sleeping_mat", "cooking", "water_filter"].includes(category);
  return library.find(
    (g) => g.owned && g.category === category && (single || words.some((w) => g.name.toLowerCase().includes(w))),
  );
}

export function newGearItem(partial: Partial<GearItem> & Pick<GearItem, "name" | "category">): GearItem {
  const t = nowISO();
  return {
    id: uid(),
    quantity: 1,
    weightGrams: null,
    essential: false,
    weightClass: defaultWeightClass(partial.category),
    shareable: defaultShareable(partial.category),
    favourite: false,
    owned: true,
    weightProvenance: prov("user"),
    createdAt: t,
    updatedAt: t,
    ...partial,
  };
}

export function buildTripFromPlan(
  plan: PlanResponse,
  library: GearItem[],
  fallbackCurrency: string,
): { trip: Trip; newGear: GearItem[] } {
  const draft = plan.trip!;
  const ex = plan.extracted;
  const trail = findTrail(draft.trailId);
  const people = Math.max(1, Math.min(20, Math.round(ex.groupSize ?? 1)));
  const names = Array.from({ length: people }, (_, i) => (i === 0 ? "You" : `Hiker ${i + 1}`));
  const trip = createTrip({
    title: draft.title,
    destinationName: draft.destinationName,
    country: draft.country ?? undefined,
    durationDays: draft.days.length,
    participants: names,
    currency: draft.currency ?? ex.currency ?? fallbackCurrency,
  });

  trip.destination = {
    name: draft.destinationName,
    country: draft.country ?? trail?.country,
    region: draft.region ?? trail?.region,
    lat: trail?.lat ?? draft.lat ?? undefined,
    lon: trail?.lon ?? draft.lon ?? undefined,
    timezone: trail?.timezone ?? draft.timezone ?? undefined,
    trailId: trail?.id,
  };
  trip.startDate = ex.startDate ?? null;
  trip.difficulty = trail?.grade.value ?? draft.difficulty ?? undefined;
  trip.gradingSystem = trail?.gradingSystem ?? draft.gradingSystem ?? undefined;
  trip.summary = draft.summary;
  trip.budgetMax = ex.budgetMax ?? null;
  trip.budgetBasis = ex.budgetBasis ?? "per_person";
  trip.requirements = {
    rawPrompt: undefined,
    startLocation: ex.startLocation ?? undefined,
    experience: ex.experience ?? undefined,
    desiredDifficulty: ex.desiredDifficulty ?? undefined,
    scenery: ex.scenery,
    terrain: ex.terrain,
    distancePreference: ex.distancePreference ?? undefined,
    transport: ex.transport ?? undefined,
    camping: ex.camping ?? undefined,
    existingGear: ex.existingGear,
    foodPreferences: ex.foodPreferences ?? undefined,
    dietary: ex.dietary,
    other: ex.other,
  };

  const aiKind: Provenance["kind"] = "ai";
  if (trail) {
    const { days, notes } = daysForTrail(trail, draft.days, aiKind);
    trip.days = days;
    trip.limitations.push(...notes);
  } else {
    trip.days = draft.days.map((d, i) => dayFromDraft(i + 1, d, aiKind));
    if (!draft.isEstablishedTrail) {
      trip.limitations.push(
        "This route is an AI suggestion, not an established trail from a verified source. Confirm the route, distances, campsites and water with the local park authority, or import a GPX file of your planned route.",
      );
    } else {
      trip.limitations.push("Route details come from AI knowledge, not an official source. Check distances, campsites and rules with the managing park authority.");
    }
  }
  trip.durationDays = trip.days.length;
  trip.limitations.push(...draft.limitations.filter((l) => !trip.limitations.includes(l)));

  // Food
  trip.food.intensity = draft.intensity;
  trip.food.dietary = ex.dietary ?? [];
  trip.food.preferences = ex.foodPreferences ?? undefined;
  if (trip.food.dietary.some((d) => /vegan|vegetarian/i.test(d))) {
    const veg = trip.food.menu.filter((m) => m.dietary?.some((d) => /vegan|vegetarian/i.test(d)));
    const vegSlots = new Set(veg.map((m) => m.slot));
    trip.food.menu = trip.food.menu.filter((m) => !vegSlots.has(m.slot) || veg.includes(m));
    trip.limitations.push("Check the starter menu against your dietary needs — lunches and snacks may need swapping.");
  }
  trip.food.spareDay = trip.durationDays > 1;

  // Gear: use owned library items where they match, otherwise add "to get" items with typical estimates.
  const newGear: GearItem[] = [];
  const multi = people > 1;
  const usedLibrary = new Set<string>();
  for (const s of draft.gearSuggestions) {
    const owned = matchesOwned(s.name, library.filter((g) => !usedLibrary.has(g.id)), s.category);
    let item = owned;
    if (!item) {
      const typical = TYPICAL_WEIGHT_G[s.category];
      const ai = s.estimatedWeightGrams;
      item = newGearItem({
        name: s.name,
        category: s.category,
        essential: s.essential,
        shareable: s.shareable,
        owned: s.alreadyOwned,
        weightGrams: ai ?? typical?.typical ?? null,
        weightProvenance:
          ai != null
            ? prov("ai", { note: "AI estimate of a typical weight. Weigh yours to make totals exact." })
            : typical
              ? prov("estimate", { note: `Typical for this category (${typical.range[0]}–${typical.range[1]} g).` })
              : prov("unverified", { note: "Weight unknown" }),
        notes: s.reason ?? undefined,
      });
      newGear.push(item);
    }
    usedLibrary.add(item.id);
    const share = item.shareable && multi;
    trip.gear.push({
      id: uid(),
      gearId: item.id,
      scope: share ? "assigned" : "each",
      carrierId: share ? trip.participants[trip.gear.filter((g) => g.scope === "assigned").length % people].id : undefined,
      quantity: 1,
      packedBy: [],
    });
  }

  // Budget
  trip.budget = draft.budgetLines.map(
    (b): BudgetLine => ({
      id: uid(),
      category: b.category,
      label: b.label,
      estimate: b.estimate,
      actual: null,
      currency: trip.currency,
      basis: b.basis,
      provenance: prov("ai", { note: b.note ?? "AI planning estimate — check real prices" }),
    }),
  );

  for (const c of draft.checklistExtras) trip.checklist.push({ id: uid(), group: c.group, label: c.label, detail: c.detail ?? undefined, done: false });
  if (trail) {
    const official = trail.sources.find((s) => s.kind === "official");
    if (official) trip.checklist.unshift({ id: uid(), group: "permits", label: `Read the official ${trail.name} page`, detail: official.url, done: false });
  }
  return { trip, newGear };
}

/** Convert assistant ops to engine ops; `add_new_gear` creates a library item first. */
export function translateAssistantOps(ops: AssistantOp[], trip: Trip): { tripOps: TripOp[]; newGear: GearItem[] } {
  const tripOps: TripOp[] = [];
  const newGear: GearItem[] = [];
  for (const op of ops) {
    switch (op.op) {
      case "add_new_gear": {
        const item = newGearItem({
          name: op.name,
          category: op.category,
          weightGrams: op.weightGrams,
          quantity: op.quantity ?? 1,
          owned: op.owned,
          essential: op.essential ?? false,
          shareable: op.shareable ?? defaultShareable(op.category),
          weightProvenance: op.weightGrams != null ? prov("user", { note: "Stated in chat" }) : prov("unverified", { note: "Weight unknown" }),
        });
        newGear.push(item);
        tripOps.push({ op: "add_library_gear_to_trip", gearId: item.id, quantity: op.quantity ?? 1 });
        break;
      }
      case "upsert_budget_line":
        tripOps.push({
          op: "upsert_budget_line",
          line: {
            id: op.id ?? undefined,
            category: op.category,
            label: op.label,
            estimate: op.estimate,
            actual: op.actual,
            basis: op.basis,
            provenance: op.userStatedAmount ? prov("user", { note: "Stated in chat" }) : prov("ai", { note: "AI planning estimate — check real prices" }),
          },
        });
        break;
      case "update_day":
        tripOps.push({ op: "update_day", dayNumber: op.dayNumber, patch: nullsToUndefined(op.patch), source: "ai" });
        break;
      case "replace_itinerary":
        tripOps.push({ op: "replace_itinerary", days: op.days.map((d) => ({ ...nullsToUndefined(d), from: d.from, to: d.to })), source: "ai" });
        break;
      case "add_library_gear_to_trip":
        tripOps.push({ op: "add_library_gear_to_trip", gearId: op.gearId, carrierId: op.carrierId ?? undefined, quantity: op.quantity });
        break;
      case "set_destination":
        tripOps.push({ op: "set_destination", name: op.name, country: op.country ?? undefined, region: op.region ?? undefined, lat: op.lat, lon: op.lon });
        break;
      case "set_difficulty":
        tripOps.push({ op: "set_difficulty", difficulty: op.difficulty, gradingSystem: op.gradingSystem ?? undefined });
        break;
      case "set_food":
        tripOps.push({ ...op, preferences: op.preferences ?? undefined });
        break;
      case "set_water":
        tripOps.push({ ...op, treatment: op.treatment ?? undefined, notes: op.notes ?? undefined });
        break;
      case "add_checklist_item":
        tripOps.push({ ...op, detail: op.detail ?? undefined });
        break;
      case "set_menu":
        tripOps.push({ op: "set_menu", menu: op.menu.map((m) => ({ ...m, costPerServing: null, costProvenance: prov("ai") })) });
        break;
      case "set_budget":
        tripOps.push({ op: "set_budget", max: op.max, basis: op.basis, currency: op.currency });
        break;
      default:
        tripOps.push(op as TripOp);
    }
  }
  void trip;
  return { tripOps, newGear };
}

function nullsToUndefined<T extends Record<string, unknown>>(o: T): { [K in keyof T]: Exclude<T[K], null> } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null && !["distanceKm", "ascentM", "descentM"].includes(k)) continue;
    out[k] = v;
  }
  return out as { [K in keyof T]: Exclude<T[K], null> };
}

/** Compact trip description for the assistant. Includes computed totals so it can reason, labelled as app-calculated. */
export function tripSnapshot(trip: Trip, library: GearItem[], derived: DerivedTrip) {
  const lib = new Map(library.map((g) => [g.id, g]));
  return {
    id: trip.id,
    title: trip.title,
    status: trip.status,
    destination: trip.destination,
    startDate: trip.startDate,
    durationDays: trip.durationDays,
    participants: trip.participants,
    difficulty: trip.difficulty,
    gradingSystem: trip.gradingSystem,
    currency: trip.currency,
    budgetMax: trip.budgetMax,
    budgetBasis: trip.budgetBasis,
    requirements: trip.requirements,
    days: trip.days.map((d) => ({
      dayNumber: d.dayNumber,
      title: d.title,
      from: d.from,
      to: d.to,
      distanceKm: d.distanceKm.value,
      ascentM: d.ascentM.value,
      descentM: d.descentM.value,
      overnight: d.overnight,
      water: d.water,
      userEdited: d.userEdited ?? false,
    })),
    tripGear: trip.gear.map((e) => {
      const g = lib.get(e.gearId);
      return {
        entryId: e.id,
        gearId: e.gearId,
        name: g?.name,
        category: g?.category,
        weightGrams: g?.weightGrams,
        weightSource: g?.weightProvenance.kind,
        owned: g?.owned,
        essential: g?.essential,
        weightClass: g?.weightClass,
        scope: e.scope,
        carrierId: e.carrierId,
        quantity: e.quantity,
      };
    }),
    libraryNotOnTrip: library
      .filter((g) => !trip.gear.some((e) => e.gearId === g.id))
      .slice(0, 80)
      .map((g) => ({ gearId: g.id, name: g.name, category: g.category, weightGrams: g.weightGrams, owned: g.owned })),
    budget: trip.budget.map((b) => ({ id: b.id, category: b.category, label: b.label, estimate: b.estimate, actual: b.actual, basis: b.basis, source: b.provenance.kind })),
    food: { intensity: trip.food.intensity, dietary: trip.food.dietary, menu: trip.food.menu.map((m) => ({ id: m.id, slot: m.slot, name: m.name, gramsPerServing: m.gramsPerServing })), resupplyDays: trip.food.resupplyDays, spareDay: trip.food.spareDay },
    water: trip.water,
    appCalculated: {
      note: "Calculated by the app. Do not recalculate.",
      totalDistanceKm: derived.totals.distanceKm,
      totalAscentM: derived.totals.ascentM,
      packs: derived.weights.people.map((p) => ({ participant: p.name, baseGrams: p.baseGrams, totalCarriedStartGrams: p.totalCarriedStartGrams })),
      estimatedTotal: derived.budget.estimatedTotal,
      budgetMaxGroup: derived.budget.budgetMaxGroup,
      foodGrams: derived.food.totalFoodGrams,
    },
    limitations: trip.limitations,
  };
}
