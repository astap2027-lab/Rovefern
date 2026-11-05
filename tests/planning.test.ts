import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRequirements, missingQuestions, starterKit } from "../src/lib/ai/heuristics";
import { offlinePlan } from "../src/server/routes/plan";
import { buildTripFromPlan, translateAssistantOps } from "../src/web/lib/buildTrip";
import { applyOps } from "../src/lib/engine/tripOps";
import { deriveTrip } from "../src/lib/engine/derive";
import { PlanResponseSchema, AssistantResponseSchema } from "../src/server/schemas";

const TAS = "I want to plan a five-day backpacking trip in Tasmania in January. I'm travelling with two friends, have a budget of $1,200 AUD per person and want a moderately challenging hike with beautiful mountains, lakes and camping opportunities. I already own a backpack, tent and sleeping bag but need help organising the rest of my equipment.";

test("extracts the brief's example prompt", () => {
  const r = extractRequirements(TAS);
  assert.equal(r.destination, "Tasmania");
  assert.equal(r.country, "Australia");
  assert.equal(r.durationDays, 5);
  assert.equal(r.groupSize, 3);
  assert.equal(r.budgetMax, 1200);
  assert.equal(r.currency, "AUD");
  assert.equal(r.budgetBasis, "per_person");
  assert.equal(r.month, "January");
  assert.deepEqual(r.existingGear, ["backpack", "tent", "sleeping bag"]);
  assert.ok(r.scenery.includes("mountains") && r.scenery.includes("lakes"));
});

test("scenario 4: strict budget and scenario 5: international currency", () => {
  const a = extractRequirements("Under $500 total for a weekend hike in the Blue Mountains, solo");
  assert.equal(a.budgetMax, 500);
  assert.equal(a.budgetBasis, "group");
  assert.equal(a.durationDays, 2);
  assert.equal(a.groupSize, 1);
  assert.equal(a.currency, "AUD");
  const b = extractRequirements("Four friends doing the Milford Track over 4 days, NZD 900 each");
  assert.equal(b.trailId, "milford-track");
  assert.equal(b.currency, "NZD");
  assert.equal(b.budgetMax, 900);
  assert.equal(b.groupSize, 4);
  const c = extractRequirements("Laugavegur in July, 4 days, €1500 for two of us");
  assert.equal(c.currency, "EUR");
  assert.equal(c.trailId, "laugavegur");
});

test("asks targeted questions only for missing essentials", () => {
  const q = missingQuestions(extractRequirements("Somewhere in New Zealand"));
  assert.equal(q.length, 2); // length and group, not destination
  assert.equal(missingQuestions(extractRequirements(TAS)).length, 0);
});

test("offline plan output passes the same schema as the AI's", () => {
  const p = offlinePlan([{ role: "user", content: TAS }], "AUD");
  assert.ok(PlanResponseSchema.safeParse(p).success, JSON.stringify(PlanResponseSchema.safeParse(p).error?.issues));
  assert.equal(p.ready, true);
});

test("scenario 1: beginner gets a starter kit including safety items", () => {
  const kit = starterKit(2);
  for (const c of ["first_aid", "navigation", "lighting", "shelter", "sleeping_bag"]) assert.ok(kit.some((k) => k.category === c), c);
});

test("trail overlay: official stages replace AI distances, AI notes kept", () => {
  const plan = PlanResponseSchema.parse({
    reply: "",
    ready: true,
    questions: [],
    extracted: { groupSize: 2, existingGear: ["tent"] },
    trip: {
      title: "Milford", trailId: "milford-track", isEstablishedTrail: true, destinationName: "Milford Track", currency: "NZD", summary: "", intensity: "moderate",
      days: [
        { from: "a", to: "b", distanceKm: 99, terrain: "valley" },
        { from: "b", to: "c" }, { from: "c", to: "d" }, { from: "d", to: "e" },
      ],
      gearSuggestions: [{ name: "Tent", category: "shelter", essential: false, shareable: true, alreadyOwned: true }],
      budgetLines: [{ category: "accommodation", label: "Huts", estimate: 100, basis: "per_person" }],
      checklistExtras: [], limitations: [],
    },
  });
  const { trip, newGear } = buildTripFromPlan(plan, [], "AUD");
  assert.equal(trip.days[0].distanceKm.value, 5);
  assert.equal(trip.days[0].distanceKm.provenance.kind, "official");
  assert.equal(trip.days[0].terrain, "valley");
  assert.equal(trip.days[0].from, "Glade Wharf");
  assert.equal(trip.participants.length, 2);
  assert.equal(newGear[0].owned, true);
  assert.equal(newGear[0].weightGrams, null); // never invented
  assert.equal(trip.gear[0].scope, "assigned"); // shared tent in a group
  assert.equal(trip.budget[0].provenance.kind, "ai");
  assert.equal(deriveTrip(trip, newGear).budget.estimatedTotal, 200);
});

test("non-catalogue AI route is flagged as unverified", () => {
  const plan = PlanResponseSchema.parse({
    reply: "", ready: true, questions: [], extracted: {},
    trip: { title: "X", isEstablishedTrail: false, destinationName: "Somewhere", currency: "AUD", summary: "", intensity: "easy", days: [{ from: "a", to: "b", distanceKm: 10 }], gearSuggestions: [], budgetLines: [], checklistExtras: [], limitations: [] },
  });
  const { trip } = buildTripFromPlan(plan, [], "AUD");
  assert.ok(trip.limitations.some((l) => l.includes("not an established trail")));
  assert.equal(trip.days[0].distanceKm.provenance.kind, "ai");
});

test("scenario 3: assistant ops for a group change validate and recalculate", () => {
  const plan = offlinePlan([{ role: "user", content: "Milford Track, 4 days, with three friends" }], "NZD");
  const { trip, newGear } = buildTripFromPlan(plan, [], "NZD");
  assert.equal(trip.participants.length, 4);
  const resp = AssistantResponseSchema.parse({ reply: "", ops: [{ op: "add_new_gear", name: "Tent", category: "shelter", weightGrams: 1200, owned: true }, { op: "add_participant", name: "Sam" }, { op: "set_duration", days: 5 }] });
  const { tripOps, newGear: ng } = translateAssistantOps(resp.ops, trip);
  const lib = [...newGear, ...ng];
  const before = deriveTrip(trip, lib);
  const r = applyOps(trip, tripOps, lib);
  assert.ok(r.ok, r.errors.join());
  const after = deriveTrip(r.trip, lib);
  assert.equal(r.trip.participants.length, 5);
  assert.ok(after.food.totalFoodGrams > before.food.totalFoodGrams);
  const tentEntry = r.trip.gear.find((g) => g.gearId === ng[0].id)!;
  assert.equal(tentEntry.scope, "assigned");
  assert.equal(after.weights.sharedGearGrams - before.weights.sharedGearGrams, 1200);
});
