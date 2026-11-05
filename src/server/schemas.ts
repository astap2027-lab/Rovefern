/**
 * Structured schemas for every AI output. The model must answer through a tool whose
 * input_schema is generated from these, and every response is validated again before it
 * leaves the server. The client then applies trip changes only via `applyOps`, which
 * validates a second time against the current trip.
 */
import { z } from "zod/v4";
import { BUDGET_CATEGORIES, GEAR_CATEGORIES } from "../lib/domain/types";

const str = (max = 300) => z.string().max(max);
const optStr = (max = 300) => z.string().max(max).nullable().optional();
const num = (min: number, max: number) => z.number().min(min).max(max);

export const RequirementsSchema = z.object({
  destination: optStr(160),
  country: optStr(80),
  startLocation: optStr(160),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe("Only if the user gave an exact date"),
  month: optStr(40).describe("Month or season if no exact date"),
  durationDays: num(1, 60).nullable().optional(),
  groupSize: num(1, 20).nullable().optional(),
  budgetMax: num(0, 10_000_000).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
  budgetBasis: z.enum(["group", "per_person"]).nullable().optional(),
  experience: z.enum(["beginner", "intermediate", "experienced"]).nullable().optional(),
  desiredDifficulty: optStr(80),
  scenery: z.array(str(60)).max(10).optional(),
  terrain: z.array(str(60)).max(10).optional(),
  distancePreference: optStr(120),
  transport: optStr(200),
  camping: optStr(200),
  existingGear: z.array(str(120)).max(30).optional(),
  foodPreferences: optStr(300),
  dietary: z.array(str(60)).max(10).optional(),
  other: z.array(str(200)).max(10).optional(),
});

export const DaySchema = z.object({
  title: optStr(120),
  from: str(160),
  to: str(160),
  distanceKm: num(0, 200).nullable().optional().describe("null if you are not confident"),
  ascentM: num(0, 9000).nullable().optional(),
  descentM: num(0, 9000).nullable().optional(),
  terrain: optStr(300),
  breaks: optStr(300),
  overnight: optStr(200),
  water: optStr(300).describe("Only known, named water sources; otherwise say it is unverified"),
  resupply: optStr(300),
  warnings: z.array(str(300)).max(6).optional(),
  notes: optStr(800),
});

export const GearSuggestionSchema = z.object({
  name: str(120),
  category: z.enum(GEAR_CATEGORIES),
  essential: z.boolean(),
  shareable: z.boolean(),
  alreadyOwned: z.boolean().describe("True if the user said they already own this"),
  reason: optStr(300),
});

export const BudgetSuggestionSchema = z.object({
  category: z.enum(BUDGET_CATEGORIES),
  label: str(120),
  estimate: num(0, 1_000_000).nullable().describe("Rough estimate in trip currency, or null if you can't reasonably estimate"),
  basis: z.enum(["group", "per_person"]),
  note: optStr(300),
});

export const TripDraftSchema = z.object({
  title: str(120),
  trailId: z.string().max(60).nullable().optional().describe("Catalogue trail id if the trip is on one of the catalogue trails, else null"),
  isEstablishedTrail: z.boolean().describe("True only for a real, named, established trail"),
  destinationName: str(160),
  country: optStr(80),
  region: optStr(120),
  lat: num(-90, 90).nullable().optional(),
  lon: num(-180, 180).nullable().optional(),
  timezone: optStr(60).describe("IANA timezone of the destination"),
  currency: z.string().regex(/^[A-Z]{3}$/),
  difficulty: optStr(120),
  gradingSystem: optStr(160),
  summary: str(1200),
  intensity: z.enum(["easy", "moderate", "hard"]),
  days: z.array(DaySchema).min(1).max(60),
  gearSuggestions: z.array(GearSuggestionSchema).max(40),
  budgetLines: z.array(BudgetSuggestionSchema).max(20),
  checklistExtras: z
    .array(z.object({ group: z.enum(["gear", "permits", "transport", "safety", "food", "admin"]), label: str(200), detail: optStr(300) }))
    .max(12),
  limitations: z.array(str(400)).max(10),
});

export const PlanResponseSchema = z.object({
  reply: str(1500).describe("Short, friendly message to the user"),
  ready: z.boolean().describe("True when you have enough to build the trip"),
  questions: z
    .array(z.object({ question: str(200), options: z.array(str(80)).max(5).optional() }))
    .max(3)
    .describe("Targeted follow-up questions when important details are missing"),
  extracted: RequirementsSchema,
  trip: TripDraftSchema.nullable().optional(),
});
export type PlanResponse = z.infer<typeof PlanResponseSchema>;
export type TripDraft = z.infer<typeof TripDraftSchema>;

// Operations the assistant may propose (validated again client-side by applyOps).
const DayPatchSchema = DaySchema.partial();
export const AssistantOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_title"), title: str(120) }),
  z.object({ op: z.literal("set_destination"), name: str(160), country: optStr(80), region: optStr(120), lat: num(-90, 90).optional(), lon: num(-180, 180).optional() }),
  z.object({ op: z.literal("set_dates"), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }),
  z.object({ op: z.literal("set_duration"), days: num(1, 60) }),
  z.object({ op: z.literal("add_participant"), name: str(60) }),
  z.object({ op: z.literal("remove_participant"), participantId: str(80) }),
  z.object({ op: z.literal("set_budget"), max: num(0, 10_000_000).nullable().optional(), basis: z.enum(["group", "per_person"]).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional() }),
  z.object({ op: z.literal("set_difficulty"), difficulty: str(120), gradingSystem: optStr(160) }),
  z.object({ op: z.literal("update_day"), dayNumber: num(1, 60), patch: DayPatchSchema }),
  z.object({ op: z.literal("replace_itinerary"), days: z.array(DaySchema).min(1).max(60) }),
  z.object({ op: z.literal("add_library_gear_to_trip"), gearId: str(80), carrierId: optStr(80), quantity: num(1, 99).optional() }),
  z.object({
    op: z.literal("add_new_gear"),
    name: str(120),
    category: z.enum(GEAR_CATEGORIES),
    weightGrams: num(0, 50_000).nullable().describe("Only a weight the USER stated; otherwise null"),
    quantity: num(1, 99).optional(),
    owned: z.boolean(),
    essential: z.boolean().optional(),
    shareable: z.boolean().optional(),
  }),
  z.object({ op: z.literal("remove_trip_gear"), entryId: str(80) }),
  z.object({ op: z.literal("assign_gear"), entryId: str(80), carrierId: str(80) }),
  z.object({ op: z.literal("set_trip_gear_quantity"), entryId: str(80), quantity: num(1, 99) }),
  z.object({
    op: z.literal("upsert_budget_line"),
    id: optStr(80),
    category: z.enum(BUDGET_CATEGORIES),
    label: str(120),
    estimate: num(0, 1_000_000).nullable().optional(),
    actual: num(0, 1_000_000).nullable().optional(),
    basis: z.enum(["group", "per_person"]).optional(),
    userStatedAmount: z.boolean().describe("True if the user gave this amount; false if it's your estimate"),
  }),
  z.object({ op: z.literal("remove_budget_line"), lineId: str(80) }),
  z.object({ op: z.literal("set_food"), intensity: z.enum(["easy", "moderate", "hard"]).optional(), dietary: z.array(str(60)).max(10).optional(), preferences: optStr(300), spareDay: z.boolean().optional(), resupplyDays: z.array(num(2, 60)).max(20).optional() }),
  z.object({
    op: z.literal("set_menu"),
    menu: z
      .array(
        z.object({
          slot: z.enum(["breakfast", "lunch", "dinner", "snacks"]),
          name: str(120),
          gramsPerServing: num(1, 2000),
          needsCooking: z.boolean(),
          cookingWaterMl: num(0, 3000),
          ingredients: z.array(z.object({ name: str(80), gramsPerServing: num(0, 2000) })).max(12).optional(),
          dietary: z.array(str(40)).max(6).optional(),
        }),
      )
      .min(1)
      .max(40),
  }),
  z.object({ op: z.literal("set_water"), expectedMaxTempC: num(-60, 60).nullable().optional(), longestDryStretchHours: num(0, 72).nullable().optional(), capacityLitresPerPerson: num(0, 30).nullable().optional(), treatment: optStr(200), notes: optStr(1000) }),
  z.object({ op: z.literal("add_checklist_item"), group: z.enum(["gear", "permits", "transport", "safety", "food", "admin"]), label: str(200), detail: optStr(300) }),
  z.object({ op: z.literal("set_status"), status: z.enum(["planning", "preparing", "ready", "completed"]) }),
  z.object({ op: z.literal("add_limitation"), text: str(400) }),
]);
export type AssistantOp = z.infer<typeof AssistantOpSchema>;

export const AssistantResponseSchema = z.object({
  reply: str(2500),
  ops: z.array(AssistantOpSchema).max(40),
});
export type AssistantResponse = z.infer<typeof AssistantResponseSchema>;

export const GearParseSchema = z.object({
  items: z
    .array(
      z.object({
        name: str(120),
        brand: optStr(80),
        model: optStr(80),
        category: z.enum(GEAR_CATEGORIES),
        weightGrams: num(0, 50_000).nullable().describe("Only if the user stated it (convert units to grams). Never guess."),
        quantity: num(1, 99),
        weightClass: z.enum(["base", "worn", "consumable"]),
        essential: z.boolean(),
        shareable: z.boolean(),
        notes: optStr(300),
        needsConfirmation: z.array(str(120)).max(5).describe("Details the user should double-check"),
      }),
    )
    .max(20),
  reply: str(600),
});
export type GearParse = z.infer<typeof GearParseSchema>;

export const OptimiseSchema = z.object({
  summary: str(800),
  suggestions: z
    .array(
      z.object({
        kind: z.enum(["replace", "remove", "share", "duplicate", "overlap", "unsuitable", "add_missing"]),
        gearIds: z.array(str(80)).max(5).describe("Library ids of the items this is about"),
        title: str(140),
        proposal: str(300).describe("The alternative, described generically (e.g. 'a closed-cell foam mat') unless the user named a product"),
        alternativeWeightGrams: num(0, 50_000).nullable().describe("Typical weight for that type of item, or null. This is an estimate, not a product spec."),
        explanation: str(600),
        suitability: str(400).describe("Suitability for the trip's expected conditions"),
        safetyCritical: z.boolean(),
      }),
    )
    .max(12),
});
export type Optimise = z.infer<typeof OptimiseSchema>;
