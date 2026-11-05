import { test } from "node:test";
import assert from "node:assert/strict";
import type { GearItem } from "../src/lib/domain/types";
import { formatWeight, parseWeight, round } from "../src/lib/engine/units";
import { naismithHours, itineraryTotals, dateForDay } from "../src/lib/engine/time";
import { planFood } from "../src/lib/engine/food";
import { estimateWater } from "../src/lib/engine/water";
import { computeGroupWeights, librarySummary } from "../src/lib/engine/weight";
import { summariseBudget, convert } from "../src/lib/engine/budget";
import { createTrip, prov, uid } from "../src/lib/engine/factory";
import { applyOps } from "../src/lib/engine/tripOps";
import { deriveTrip } from "../src/lib/engine/derive";
import { layoutPack } from "../src/lib/engine/packing";

const gear = (o: Partial<GearItem> & Pick<GearItem, "name" | "category">): GearItem => ({
  id: uid(),
  weightGrams: 0,
  quantity: 1,
  essential: false,
  weightClass: "base",
  shareable: false,
  favourite: false,
  owned: true,
  weightProvenance: prov("user"),
  createdAt: "",
  updatedAt: "",
  ...o,
});

test("units: parse and format weights", () => {
  assert.equal(parseWeight("650g"), 650);
  assert.equal(parseWeight("1.2 kg"), 1200);
  assert.equal(parseWeight("1,2kg"), 1200);
  assert.equal(parseWeight("16 oz"), 453.6);
  assert.equal(parseWeight("1 lb 4 oz"), 567);
  assert.equal(parseWeight("heavy"), null);
  assert.equal(formatWeight(650, "metric"), "650 g");
  assert.equal(formatWeight(1234, "metric"), "1.23 kg");
  assert.equal(formatWeight(453.59237, "imperial"), "1 lb 0 oz");
  assert.equal(formatWeight(100, "imperial"), "3.5 oz");
  // rounding up to 16 oz must roll over
  assert.equal(formatWeight(907.15, "imperial"), "2 lb 0 oz");
});

test("time: Naismith estimate", () => {
  assert.equal(naismithHours(10), 2);
  assert.equal(naismithHours(10, 600), 3);
  assert.equal(naismithHours(10, 600, 300), round(3 + 10 / 60, 2));
  assert.equal(dateForDay("2027-01-30", 4), "2027-02-02");
  assert.equal(dateForDay(null, 1), null);
});

test("time: totals flag incomplete and estimated data", () => {
  const t = createTrip({ durationDays: 2 });
  const r = applyOps(t, [{ op: "update_day", dayNumber: 1, patch: { distanceKm: 12, ascentM: 400, descentM: 200 }, source: "ai" }], []);
  const totals = itineraryTotals(r.trip.days);
  assert.equal(totals.distanceKm, 12);
  assert.equal(totals.incomplete, true); // day 2 unknown
  assert.equal(totals.containsEstimates, true);
});

test("food: quantities scale with days and people; spare day; resupply", () => {
  const t = createTrip({ durationDays: 4, participants: ["A", "B"] });
  const f = planFood(t.food, 4, 2);
  const perDay = (slotGrams: number[]) => slotGrams.reduce((a, b) => a + b, 0);
  assert.equal(f.daysFed, 5);
  assert.equal(f.meals.length, 5 * 4);
  // total = per-person sum × 2
  const perPerson = f.meals.reduce((s, m) => s + (m.meal?.gramsPerServing ?? 0), 0);
  assert.equal(f.totalFoodGrams, perPerson * 2);
  // fuel is deterministic and positive with cooked meals
  assert.ok(f.fuelGrams > 0);
  // with a resupply on day 3, start carry is days 1-2 + spare
  const withResupply = planFood({ ...t.food, resupplyDays: [3] }, 4, 2);
  assert.ok(withResupply.startCarriedFoodGramsPerPerson < f.startCarriedFoodGramsPerPerson);
  assert.equal(withResupply.endCarriedFoodGramsPerPerson, f.endCarriedFoodGramsPerPerson);
  assert.ok(perDay([1]) === 1);
  // shopping list aggregates oats across rotating breakfasts
  const oats = f.shoppingList.find((l) => l.name === "Rolled oats");
  assert.ok(oats && oats.grams > 0);
});

test("food: skip override removes a meal", () => {
  const t = createTrip({ durationDays: 1 });
  const base = planFood({ ...t.food, spareDay: false }, 1, 1);
  const skipped = planFood({ ...t.food, spareDay: false, overrides: { 1: { breakfast: "skip" } } }, 1, 1);
  assert.ok(skipped.totalFoodGrams < base.totalFoodGrams);
});

test("water: range rises with heat; shortfall flagged", () => {
  const mild = estimateWater({}, 5, 2, 1, 2);
  const hot = estimateWater({ expectedMaxTempC: 35, longestDryStretchHours: 4, capacityLitresPerPerson: 3 }, 5, 2, 1, 2);
  assert.ok(hot.walkingRangeLPerPerson[1] > mild.walkingRangeLPerPerson[1]);
  assert.equal(hot.carryForDryStretchL, 5.5);
  assert.equal(hot.capacityShortfallL, 2.5);
  assert.ok(mild.warnings.some((w) => w.includes("not confirmed")));
});

test("weight: base/worn/consumable split, shared gear, unknown weights", () => {
  const tent = gear({ name: "Tent", category: "shelter", weightGrams: 1200, shareable: true });
  const bag = gear({ name: "Sleeping bag", category: "sleeping_bag", weightGrams: 650 });
  const boots = gear({ name: "Boots", category: "footwear", weightGrams: 900, weightClass: "worn" });
  const mystery = gear({ name: "Mystery", category: "misc", weightGrams: null });
  const lib = new Map([tent, bag, boots, mystery].map((g) => [g.id, g]));
  const A = { id: "a", name: "A" };
  const B = { id: "b", name: "B" };
  const entries = [
    { id: "e1", gearId: tent.id, scope: "assigned" as const, carrierId: "a", quantity: 1, packedBy: ["a"] },
    { id: "e2", gearId: bag.id, scope: "each" as const, quantity: 1, packedBy: [] },
    { id: "e3", gearId: boots.id, scope: "each" as const, quantity: 1, packedBy: [] },
    { id: "e4", gearId: mystery.id, scope: "assigned" as const, carrierId: "b", quantity: 2, packedBy: [] },
  ];
  const w = computeGroupWeights([A, B], entries, lib, {
    foodStartGramsPerPerson: 1000,
    foodEndGramsPerPerson: 200,
    waterStartLitresPerPerson: 1.5,
    waterEndLitresPerPerson: 0.5,
    estimatedFuelGrams: 100,
  });
  const [a, b] = w.people;
  assert.equal(a.baseGrams, 1850);
  assert.equal(b.baseGrams, 650);
  assert.equal(a.wornGrams, 900);
  // fuel goes to first participant (no stove assigned)
  assert.equal(a.consumableStartGrams, 1000 + 1500 + 100);
  assert.equal(a.totalCarriedStartGrams, 1850 + 2600);
  assert.equal(a.totalCarriedEndGrams, 1850 + 200 + 500);
  assert.equal(a.allUpStartGrams, 1850 + 2600 + 900);
  assert.deepEqual(b.unknownWeightItems, ["Mystery"]);
  assert.equal(w.sharedGearGrams, 1200);
  assert.equal(w.groupBaseGrams, 2500);
  assert.equal(a.packedCount, 1);
  const pct = a.baseByCategory.reduce((s, c) => s + c.percentOfBase, 0);
  assert.ok(Math.abs(pct - 100) < 0.2);
});

test("weight: library summary honours quantity", () => {
  const s = librarySummary([
    gear({ name: "Pegs", category: "shelter", weightGrams: 10, quantity: 8 }),
    gear({ name: "Jacket", category: "clothing", weightGrams: 300, weightClass: "worn" }),
  ]);
  assert.equal(s.baseGrams, 80);
  assert.equal(s.wornGrams, 300);
  assert.equal(s.totalGrams, 380);
});

test("budget: totals, per person, remaining, settle-up, no float drift", () => {
  const people = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ];
  const p = prov("user");
  const s = summariseBudget({
    lines: [
      { id: "1", category: "campsite_fees", label: "Camp", estimate: 0.1, actual: 0.1, currency: "AUD", basis: "per_person", paidBy: "a", provenance: p },
      { id: "2", category: "food", label: "Food", estimate: 0.2, actual: 90, currency: "AUD", basis: "group", paidBy: "b", provenance: prov("ai") },
      { id: "3", category: "permits", label: "Permit", estimate: null, currency: "AUD", basis: "group", provenance: p },
      { id: "4", category: "misc", label: "Euro thing", estimate: 10, currency: "EUR", basis: "group", provenance: p },
    ],
    participants: people,
    days: 3,
    currency: "AUD",
    budgetMax: 100,
    budgetBasis: "per_person",
    rates: null,
  });
  assert.equal(s.estimatedTotal, 0.5); // 0.1*3 + 0.2, exactly
  assert.equal(s.verifiedEstimate, 0.3);
  assert.equal(s.unverifiedEstimate, 0.2);
  assert.deepEqual(s.unestimatedLines, ["Permit"]);
  assert.deepEqual(s.unconvertibleLines, ["Euro thing"]);
  assert.equal(s.budgetMaxGroup, 300);
  assert.equal(s.remainingAgainstEstimate, 299.5);
  assert.equal(s.actualTotal, 90.3);
  const balanceSum = s.balances.reduce((x, b) => x + Math.round(b.balance * 100), 0);
  assert.equal(balanceSum, 0);
  const settledToB = s.settlements.filter((x) => x.to === "b").reduce((x, y) => x + y.amount, 0);
  assert.ok(settledToB > 0);
});

test("budget: currency conversion with rate table", () => {
  const rates = { base: "EUR", rates: { AUD: 1.6, NZD: 1.8 }, source: "Test", retrievedAt: "now" };
  assert.equal(convert(10, "EUR", "AUD", rates), 16);
  assert.equal(round(convert(16, "AUD", "NZD", rates)!, 2), 18);
  assert.equal(convert(1, "XXX", "AUD", rates), null);
  assert.equal(convert(5, "AUD", "AUD", null), 5);
});

test("ops: changing duration preserves edits and updates derived food", () => {
  const t = createTrip({ durationDays: 3 });
  const r1 = applyOps(t, [{ op: "update_day", dayNumber: 3, patch: { notes: "My note" } }], []);
  assert.ok(r1.trip.days[2].userEdited);
  const before = deriveTrip(r1.trip, []);
  const r2 = applyOps(r1.trip, [{ op: "set_duration", days: 5 }], []);
  assert.ok(r2.ok);
  assert.equal(r2.trip.days.length, 5);
  assert.equal(r2.trip.days[2].notes, "My note");
  const after = deriveTrip(r2.trip, []);
  assert.ok(after.food.totalFoodGrams > before.food.totalFoodGrams);
  assert.ok(after.food.fuelGrams > before.food.fuelGrams);
  // shrinking over a user-edited day is refused without explicit override
  const r3 = applyOps(r2.trip, [{ op: "set_duration", days: 2 }], []);
  assert.equal(r3.ok, false);
  assert.equal(r3.trip, r2.trip);
  const r4 = applyOps(r2.trip, [{ op: "set_duration", days: 2, overrideUserEdits: true }], []);
  assert.ok(r4.ok);
  assert.equal(r4.trip.durationDays, 2);
});

test("ops: atomic — one bad op rejects the batch", () => {
  const t = createTrip({ durationDays: 2 });
  const r = applyOps(t, [{ op: "set_title", title: "New" }, { op: "set_duration", days: 999 }], []);
  assert.equal(r.ok, false);
  assert.equal(r.trip.title, t.title);
});

test("ops: adding a person increases food and moves gear on removal", () => {
  const tent = gear({ name: "Tent", category: "shelter", weightGrams: 1500, shareable: true });
  let t = createTrip({ durationDays: 2, participants: ["A", "B"] });
  let r = applyOps(t, [{ op: "add_library_gear_to_trip", gearId: tent.id, carrierId: t.participants[1].id }], [tent]);
  assert.ok(r.ok, r.errors.join());
  t = r.trip;
  const f1 = deriveTrip(t, [tent]).food.totalFoodGrams;
  r = applyOps(t, [{ op: "add_participant", name: "C" }], [tent]);
  assert.ok(deriveTrip(r.trip, [tent]).food.totalFoodGrams > f1);
  r = applyOps(r.trip, [{ op: "remove_participant", participantId: t.participants[1].id }], [tent]);
  assert.equal(r.trip.gear[0].carrierId, t.participants[0].id);
});

test("ops: AI itinerary replacement keeps user-edited days", () => {
  let t = createTrip({ durationDays: 2 });
  t = applyOps(t, [{ op: "update_day", dayNumber: 1, patch: { from: "My start", to: "My camp" } }], []).trip;
  const r = applyOps(t, [{ op: "replace_itinerary", days: [{ from: "X", to: "Y", distanceKm: 10 }, { from: "Y", to: "Z", distanceKm: 8 }, { from: "Z", to: "W" }] }], []);
  assert.ok(r.ok);
  assert.equal(r.trip.days[0].from, "My start");
  assert.equal(r.trip.days[1].from, "Y");
  assert.equal(r.trip.durationDays, 3);
  assert.equal(r.trip.days[1].distanceKm.provenance.kind, "ai");
});

test("packing: heavy items go to the core and tips flag misplacements", () => {
  const items = [
    { entryId: "1", gearId: "1", name: "Sleeping bag", category: "sleeping_bag" as const, weightClass: "base" as const, quantity: 1, unitGrams: 900, totalGrams: 900, shared: false, packed: false },
    { entryId: "2", gearId: "2", name: "Food bag", category: "food" as const, weightClass: "base" as const, quantity: 1, unitGrams: 2000, totalGrams: 2000, shared: false, packed: false },
    { entryId: "3", gearId: "3", name: "Down jacket", category: "clothing" as const, weightClass: "base" as const, quantity: 1, unitGrams: 900, totalGrams: 900, shared: false, packed: false },
  ];
  const l = layoutPack(items);
  assert.equal(l.zones.find((z) => z.zone === "bottom")!.items[0].name, "Sleeping bag");
  assert.equal(l.zones.find((z) => z.zone === "core")!.grams, 2000);
  assert.ok(l.tips.some((t) => t.includes("Down jacket")));
  const moved = layoutPack(items, { "3": "core" });
  assert.equal(moved.zones.find((z) => z.zone === "core")!.grams, 2900);
});
