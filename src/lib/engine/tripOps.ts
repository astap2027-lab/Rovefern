/**
 * Controlled trip operations.
 *
 * This is the ONLY way the AI assistant can change a trip: it proposes a list of
 * operations, each is validated here, and the result is applied atomically (all or
 * nothing). The user sees a summary of what changed and can undo it.
 *
 * Derived values (food quantities, fuel, water, pack weights, budget totals) are not
 * stored, so changing duration or group size automatically updates them.
 */
import {
  BUDGET_CATEGORIES,
  GEAR_CATEGORIES,
  type BudgetLine,
  type ChecklistItem,
  type GearItem,
  type ItineraryDay,
  type MealOption,
  type MealSlot,
  type Provenance,
  type Trip,
  type TripGearEntry,
  type TripStatus,
} from "../domain/types";
import { blankDay, nowISO, prov, uid } from "./factory";

export const LIMITS = { maxDays: 60, maxPeople: 20, maxBudget: 10_000_000, maxGrams: 50_000 };

type DayPatch = Partial<{
  title: string;
  from: string;
  to: string;
  distanceKm: number | null;
  ascentM: number | null;
  descentM: number | null;
  walkingHoursOverride: number | null;
  terrain: string;
  breaks: string;
  overnight: string;
  water: string;
  resupply: string;
  warnings: string[];
  notes: string;
}>;

export type TripOp =
  | { op: "set_title"; title: string }
  | { op: "set_destination"; name: string; country?: string; region?: string; lat?: number; lon?: number; timezone?: string }
  | { op: "set_dates"; startDate: string | null }
  | { op: "set_duration"; days: number; overrideUserEdits?: boolean }
  | { op: "add_participant"; name: string }
  | { op: "remove_participant"; participantId: string }
  | { op: "rename_participant"; participantId: string; name: string }
  | { op: "set_budget"; max?: number | null; basis?: "group" | "per_person"; currency?: string }
  | { op: "set_difficulty"; difficulty: string; gradingSystem?: string }
  | { op: "update_day"; dayNumber: number; patch: DayPatch; source?: Provenance["kind"] }
  | { op: "replace_itinerary"; days: (DayPatch & { from: string; to: string })[]; source?: Provenance["kind"]; overrideUserEdits?: boolean }
  | { op: "add_library_gear_to_trip"; gearId: string; scope?: "each" | "assigned"; carrierId?: string; quantity?: number }
  | { op: "remove_trip_gear"; entryId: string }
  | { op: "assign_gear"; entryId: string; carrierId: string }
  | { op: "set_trip_gear_quantity"; entryId: string; quantity: number }
  | { op: "upsert_budget_line"; line: Partial<BudgetLine> & { label: string; category: BudgetLine["category"] } }
  | { op: "remove_budget_line"; lineId: string }
  | { op: "set_food"; intensity?: Trip["food"]["intensity"]; dietary?: string[]; preferences?: string; spareDay?: boolean; resupplyDays?: number[] }
  | { op: "set_menu"; menu: Omit<MealOption, "id">[] }
  | { op: "override_meal"; dayNumber: number; slot: MealSlot; mealId: string | "skip" | null }
  | { op: "set_water"; expectedMaxTempC?: number | null; longestDryStretchHours?: number | null; capacityLitresPerPerson?: number | null; treatment?: string; notes?: string }
  | { op: "add_checklist_item"; group: ChecklistItem["group"]; label: string; detail?: string }
  | { op: "set_checklist_done"; itemId: string; done: boolean }
  | { op: "set_status"; status: TripStatus }
  | { op: "set_summary"; summary: string }
  | { op: "add_limitation"; text: string };

export interface OpResult {
  ok: boolean;
  trip: Trip;
  changes: string[];
  errors: string[];
}

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const clampStr = (s: unknown, max = 500) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));

function nonNeg(name: string, v: number | null | undefined, max: number, errors: string[]) {
  if (v == null) return;
  if (!isNum(v) || v < 0 || v > max) errors.push(`${name} must be between 0 and ${max}.`);
}

function applyDayPatch(day: ItineraryDay, patch: DayPatch, kind: Provenance["kind"], errors: string[]): ItineraryDay {
  nonNeg("Distance", patch.distanceKm, 200, errors);
  nonNeg("Ascent", patch.ascentM, 9000, errors);
  nonNeg("Descent", patch.descentM, 9000, errors);
  nonNeg("Walking hours", patch.walkingHoursOverride, 24, errors);
  const p = prov(kind);
  const next: ItineraryDay = { ...day };
  if (patch.title !== undefined) next.title = clampStr(patch.title, 120);
  if (patch.from !== undefined) next.from = clampStr(patch.from, 160);
  if (patch.to !== undefined) next.to = clampStr(patch.to, 160);
  if (patch.distanceKm !== undefined) next.distanceKm = { value: patch.distanceKm, provenance: p };
  if (patch.ascentM !== undefined) next.ascentM = { value: patch.ascentM, provenance: p };
  if (patch.descentM !== undefined) next.descentM = { value: patch.descentM, provenance: p };
  if (patch.walkingHoursOverride !== undefined) next.walkingHoursOverride = patch.walkingHoursOverride;
  if (patch.terrain !== undefined) next.terrain = clampStr(patch.terrain);
  if (patch.breaks !== undefined) next.breaks = clampStr(patch.breaks);
  if (patch.overnight !== undefined) {
    next.overnight = clampStr(patch.overnight, 200);
    next.overnightProvenance = p;
  }
  if (patch.water !== undefined) {
    next.water = clampStr(patch.water);
    next.waterProvenance = p;
  }
  if (patch.resupply !== undefined) next.resupply = clampStr(patch.resupply);
  if (patch.warnings !== undefined) next.warnings = patch.warnings.map((w) => clampStr(w, 300)).filter(Boolean).slice(0, 10);
  if (patch.notes !== undefined) next.notes = clampStr(patch.notes, 2000);
  if (kind === "user") next.userEdited = true;
  return next;
}

function applyOne(trip: Trip, op: TripOp, library: Map<string, GearItem>, changes: string[], errors: string[]): Trip {
  const t: Trip = structuredClone(trip);
  switch (op.op) {
    case "set_title": {
      const title = clampStr(op.title, 120);
      if (!title) errors.push("Title can't be empty.");
      t.title = title;
      changes.push(`Renamed trip to “${title}”.`);
      break;
    }
    case "set_destination": {
      const name = clampStr(op.name, 160);
      if (!name) errors.push("Destination can't be empty.");
      if (op.lat != null && (!isNum(op.lat) || Math.abs(op.lat) > 90)) errors.push("Latitude out of range.");
      if (op.lon != null && (!isNum(op.lon) || Math.abs(op.lon) > 180)) errors.push("Longitude out of range.");
      t.destination = { ...t.destination, name, country: op.country ?? t.destination.country, region: op.region ?? t.destination.region, lat: op.lat ?? t.destination.lat, lon: op.lon ?? t.destination.lon, timezone: op.timezone ?? t.destination.timezone };
      changes.push(`Destination set to ${name}${op.country ? `, ${op.country}` : ""}.`);
      break;
    }
    case "set_dates": {
      if (op.startDate && !validDate(op.startDate)) errors.push("Start date must be YYYY-MM-DD.");
      t.startDate = op.startDate;
      changes.push(op.startDate ? `Start date set to ${op.startDate}.` : "Cleared the start date.");
      break;
    }
    case "set_duration": {
      const n = Math.floor(op.days);
      if (!isNum(op.days) || n < 1 || n > LIMITS.maxDays) {
        errors.push(`Trip length must be 1–${LIMITS.maxDays} days.`);
        break;
      }
      const old = t.durationDays;
      if (n < old) {
        const dropped = t.days.filter((d) => d.dayNumber > n);
        if (dropped.some((d) => d.userEdited) && !op.overrideUserEdits) {
          errors.push(`Days ${dropped.filter((d) => d.userEdited).map((d) => d.dayNumber).join(", ")} contain your own edits. Confirm before removing them.`);
          break;
        }
        t.days = t.days.filter((d) => d.dayNumber <= n);
      } else {
        for (let d = old + 1; d <= n; d++) t.days.push(blankDay(d, t.days[t.days.length - 1]?.to ?? ""));
      }
      t.durationDays = n;
      t.food.resupplyDays = t.food.resupplyDays.filter((d) => d <= n);
      for (const k of Object.keys(t.food.overrides)) if (+k > n) delete t.food.overrides[+k];
      changes.push(`Trip length changed from ${old} to ${n} days. Food, fuel and water quantities recalculated.`);
      if (t.budget.some((b) => b.category === "campsite_fees" || b.category === "accommodation")) {
        changes.push("Review campsite and accommodation costs — they may depend on the number of nights.");
      }
      break;
    }
    case "add_participant": {
      const name = clampStr(op.name, 60) || `Hiker ${t.participants.length + 1}`;
      if (t.participants.length >= LIMITS.maxPeople) {
        errors.push(`Groups are limited to ${LIMITS.maxPeople} people.`);
        break;
      }
      t.participants.push({ id: uid(), name });
      changes.push(`Added ${name} to the group (${t.participants.length} people). Food, per-person costs and personal gear updated.`);
      break;
    }
    case "remove_participant": {
      const p = t.participants.find((x) => x.id === op.participantId);
      if (!p) {
        errors.push("That person isn't in this trip.");
        break;
      }
      if (t.participants.length === 1) {
        errors.push("A trip needs at least one person.");
        break;
      }
      t.participants = t.participants.filter((x) => x.id !== p.id);
      const heir = t.participants[0];
      for (const g of t.gear) {
        if (g.carrierId === p.id) g.carrierId = heir.id;
        g.packedBy = g.packedBy.filter((id) => id !== p.id);
      }
      for (const b of t.budget) if (b.paidBy === p.id) b.paidBy = undefined;
      changes.push(`Removed ${p.name}. Their shared gear is now carried by ${heir.name}.`);
      break;
    }
    case "rename_participant": {
      const p = t.participants.find((x) => x.id === op.participantId);
      const name = clampStr(op.name, 60);
      if (!p || !name) errors.push("Couldn't rename that person.");
      else {
        changes.push(`Renamed ${p.name} to ${name}.`);
        p.name = name;
      }
      break;
    }
    case "set_budget": {
      if (op.max != null && (!isNum(op.max) || op.max < 0 || op.max > LIMITS.maxBudget)) errors.push("Budget must be a positive amount.");
      if (op.currency && !/^[A-Z]{3}$/.test(op.currency)) errors.push("Currency must be a 3-letter ISO code like AUD or EUR.");
      if (op.max !== undefined) t.budgetMax = op.max;
      if (op.basis) t.budgetBasis = op.basis;
      if (op.currency) t.currency = op.currency;
      changes.push(`Budget set to ${t.budgetMax ?? "no limit"} ${t.currency}${t.budgetBasis === "per_person" ? " per person" : " for the group"}.`);
      break;
    }
    case "set_difficulty": {
      t.difficulty = clampStr(op.difficulty, 120);
      if (op.gradingSystem !== undefined) t.gradingSystem = clampStr(op.gradingSystem, 160);
      changes.push(`Difficulty set to ${t.difficulty}.`);
      break;
    }
    case "update_day": {
      const idx = t.days.findIndex((d) => d.dayNumber === op.dayNumber);
      if (idx < 0) {
        errors.push(`Day ${op.dayNumber} doesn't exist.`);
        break;
      }
      t.days[idx] = applyDayPatch(t.days[idx], op.patch, op.source ?? "user", errors);
      changes.push(`Updated day ${op.dayNumber}.`);
      break;
    }
    case "replace_itinerary": {
      if (!Array.isArray(op.days) || op.days.length < 1 || op.days.length > LIMITS.maxDays) {
        errors.push("Itinerary must have between 1 and 60 days.");
        break;
      }
      const kind = op.source ?? "ai";
      const kept: number[] = [];
      t.days = op.days.map((patch, i) => {
        const existing = t.days[i];
        if (existing?.userEdited && !op.overrideUserEdits) {
          kept.push(existing.dayNumber);
          return { ...existing, dayNumber: i + 1 };
        }
        return applyDayPatch(blankDay(i + 1), patch, kind, errors);
      });
      if (t.durationDays !== t.days.length) {
        changes.push(`Trip length is now ${t.days.length} days.`);
        t.durationDays = t.days.length;
        t.food.resupplyDays = t.food.resupplyDays.filter((d) => d <= t.durationDays);
      }
      changes.push(`Rebuilt the itinerary (${t.days.length} days).`);
      if (kept.length) changes.push(`Kept your own edits on day ${kept.join(", ")}.`);
      break;
    }
    case "add_library_gear_to_trip": {
      const item = library.get(op.gearId);
      if (!item) {
        errors.push("That item isn't in your gear library.");
        break;
      }
      const scope = op.scope ?? (item.shareable && t.participants.length > 1 ? "assigned" : "each");
      const carrierId = scope === "assigned" ? op.carrierId ?? t.participants[0].id : undefined;
      if (carrierId && !t.participants.some((p) => p.id === carrierId)) {
        errors.push("Carrier isn't in this trip.");
        break;
      }
      const quantity = op.quantity ?? item.quantity ?? 1;
      if (!isNum(quantity) || quantity < 1 || quantity > 99) {
        errors.push("Quantity must be 1–99.");
        break;
      }
      if (t.gear.some((g) => g.gearId === item.id)) {
        changes.push(`${item.name} is already on this trip.`);
        break;
      }
      const entry: TripGearEntry = { id: uid(), gearId: item.id, scope, carrierId, quantity, packedBy: [] };
      t.gear.push(entry);
      changes.push(`Added ${item.name} to the trip${carrierId ? ` (carried by ${t.participants.find((p) => p.id === carrierId)?.name})` : ""}.`);
      break;
    }
    case "remove_trip_gear": {
      const e = t.gear.find((g) => g.id === op.entryId);
      if (!e) {
        errors.push("That item isn't on this trip.");
        break;
      }
      const item = library.get(e.gearId);
      if (item && item.essential && (item.category === "first_aid" || item.category === "safety" || item.category === "navigation")) {
        changes.push(`Note: ${item.name} is marked as essential safety gear.`);
      }
      t.gear = t.gear.filter((g) => g.id !== op.entryId);
      changes.push(`Removed ${item?.name ?? "item"} from the trip.`);
      break;
    }
    case "assign_gear": {
      const e = t.gear.find((g) => g.id === op.entryId);
      const p = t.participants.find((x) => x.id === op.carrierId);
      if (!e || !p) {
        errors.push("Couldn't reassign that item.");
        break;
      }
      e.scope = "assigned";
      e.carrierId = p.id;
      e.packedBy = e.packedBy.filter((id) => id === p.id);
      changes.push(`${library.get(e.gearId)?.name ?? "Item"} is now carried by ${p.name}.`);
      break;
    }
    case "set_trip_gear_quantity": {
      const e = t.gear.find((g) => g.id === op.entryId);
      if (!e || !isNum(op.quantity) || op.quantity < 1 || op.quantity > 99) errors.push("Quantity must be 1–99.");
      else {
        e.quantity = Math.floor(op.quantity);
        changes.push(`Quantity of ${library.get(e.gearId)?.name ?? "item"} set to ${e.quantity}.`);
      }
      break;
    }
    case "upsert_budget_line": {
      const l = op.line;
      if (!BUDGET_CATEGORIES.includes(l.category)) {
        errors.push(`Unknown budget category: ${l.category}`);
        break;
      }
      for (const [k, v] of [["Estimate", l.estimate], ["Actual", l.actual]] as const) {
        if (v != null && (!isNum(v) || v < 0 || v > LIMITS.maxBudget)) errors.push(`${k} must be a positive amount.`);
      }
      if (l.currency && !/^[A-Z]{3}$/.test(l.currency)) errors.push("Currency must be a 3-letter ISO code.");
      if (l.paidBy && !t.participants.some((p) => p.id === l.paidBy)) errors.push("Payer isn't in this trip.");
      const existing = l.id ? t.budget.find((b) => b.id === l.id) : undefined;
      const merged: BudgetLine = {
        id: existing?.id ?? uid(),
        category: l.category,
        label: clampStr(l.label, 120) || "Expense",
        estimate: l.estimate !== undefined ? l.estimate : existing?.estimate ?? null,
        actual: l.actual !== undefined ? l.actual : existing?.actual ?? null,
        currency: l.currency ?? existing?.currency ?? t.currency,
        basis: l.basis ?? existing?.basis ?? "group",
        paidBy: l.paidBy ?? existing?.paidBy,
        provenance: l.provenance ?? existing?.provenance ?? prov("user"),
      };
      if (existing) Object.assign(existing, merged);
      else t.budget.push(merged);
      changes.push(`${existing ? "Updated" : "Added"} budget line “${merged.label}”.`);
      break;
    }
    case "remove_budget_line": {
      const b = t.budget.find((x) => x.id === op.lineId);
      if (!b) errors.push("That budget line doesn't exist.");
      else {
        t.budget = t.budget.filter((x) => x.id !== op.lineId);
        changes.push(`Removed budget line “${b.label}”.`);
      }
      break;
    }
    case "set_food": {
      if (op.intensity) t.food.intensity = op.intensity;
      if (op.dietary) t.food.dietary = op.dietary.map((d) => clampStr(d, 40)).filter(Boolean);
      if (op.preferences !== undefined) t.food.preferences = clampStr(op.preferences);
      if (op.spareDay !== undefined) t.food.spareDay = op.spareDay;
      if (op.resupplyDays) {
        const bad = op.resupplyDays.filter((d) => !Number.isInteger(d) || d < 2 || d > t.durationDays);
        if (bad.length) errors.push(`Resupply days must be between 2 and ${t.durationDays}.`);
        t.food.resupplyDays = [...new Set(op.resupplyDays)].sort((a, b) => a - b);
      }
      changes.push("Updated the food plan settings.");
      break;
    }
    case "set_menu": {
      if (!Array.isArray(op.menu) || op.menu.length === 0 || op.menu.length > 60) {
        errors.push("Menu must have 1–60 options.");
        break;
      }
      const menu: MealOption[] = [];
      for (const m of op.menu) {
        if (!["breakfast", "lunch", "dinner", "snacks"].includes(m.slot)) errors.push(`Bad meal slot: ${m.slot}`);
        if (!isNum(m.gramsPerServing) || m.gramsPerServing <= 0 || m.gramsPerServing > 2000) errors.push(`${m.name}: grams per serving must be 1–2000.`);
        if (!isNum(m.cookingWaterMl) || m.cookingWaterMl < 0 || m.cookingWaterMl > 3000) errors.push(`${m.name}: cooking water must be 0–3000 ml.`);
        menu.push({ ...m, id: uid(), name: clampStr(m.name, 120), costProvenance: m.costProvenance ?? prov("estimate") });
      }
      t.food.menu = menu;
      t.food.overrides = {};
      changes.push(`Replaced the menu (${menu.length} options). Quantities recalculated.`);
      break;
    }
    case "override_meal": {
      if (op.dayNumber < 1 || op.dayNumber > t.durationDays) {
        errors.push("That day isn't in the trip.");
        break;
      }
      if (op.mealId && op.mealId !== "skip" && !t.food.menu.some((m) => m.id === op.mealId && m.slot === op.slot)) {
        errors.push("That meal isn't on the menu for this slot.");
        break;
      }
      const day = { ...(t.food.overrides[op.dayNumber] ?? {}) };
      if (op.mealId == null) delete day[op.slot];
      else day[op.slot] = op.mealId;
      t.food.overrides[op.dayNumber] = day;
      changes.push(`Changed day ${op.dayNumber} ${op.slot}.`);
      break;
    }
    case "set_water": {
      if (op.expectedMaxTempC != null && (!isNum(op.expectedMaxTempC) || op.expectedMaxTempC < -60 || op.expectedMaxTempC > 60))
        errors.push("Expected max temperature must be between -60 and 60 °C.");
      nonNeg("Longest dry stretch", op.longestDryStretchHours, 72, errors);
      nonNeg("Carrying capacity", op.capacityLitresPerPerson, 30, errors);
      const w = t.water;
      if (op.expectedMaxTempC !== undefined) w.expectedMaxTempC = op.expectedMaxTempC;
      if (op.longestDryStretchHours !== undefined) w.longestDryStretchHours = op.longestDryStretchHours;
      if (op.capacityLitresPerPerson !== undefined) w.capacityLitresPerPerson = op.capacityLitresPerPerson;
      if (op.treatment !== undefined) w.treatment = clampStr(op.treatment, 200);
      if (op.notes !== undefined) w.notes = clampStr(op.notes, 1000);
      changes.push("Updated the water plan.");
      break;
    }
    case "add_checklist_item": {
      const label = clampStr(op.label, 200);
      if (!label) errors.push("Checklist item needs a label.");
      else {
        t.checklist.push({ id: uid(), group: op.group, label, done: false, detail: op.detail ? clampStr(op.detail) : undefined });
        changes.push(`Added “${label}” to the checklist.`);
      }
      break;
    }
    case "set_checklist_done": {
      const c = t.checklist.find((x) => x.id === op.itemId);
      if (!c) errors.push("Checklist item not found.");
      else c.done = op.done;
      break;
    }
    case "set_status": {
      if (!["planning", "preparing", "ready", "completed"].includes(op.status)) errors.push("Unknown status.");
      t.status = op.status;
      changes.push(`Status set to ${op.status}.`);
      break;
    }
    case "set_summary":
      t.summary = clampStr(op.summary, 2000);
      break;
    case "add_limitation": {
      const text = clampStr(op.text, 400);
      if (text && !t.limitations.includes(text)) t.limitations.push(text);
      break;
    }
    default:
      errors.push(`Unknown operation: ${(op as { op: string }).op}`);
  }
  return t;
}

/** Apply operations atomically. If any fails validation, the original trip is returned unchanged. */
export function applyOps(trip: Trip, ops: TripOp[], library: GearItem[] | Map<string, GearItem>): OpResult {
  const lib = library instanceof Map ? library : new Map(library.map((g) => [g.id, g]));
  const changes: string[] = [];
  const errors: string[] = [];
  let t = trip;
  for (const op of ops) {
    const before = errors.length;
    t = applyOne(t, op, lib, changes, errors);
    if (errors.length > before) return { ok: false, trip, changes: [], errors };
  }
  if (t !== trip) t = { ...t, updatedAt: nowISO() };
  return { ok: true, trip: t, changes, errors };
}

export { GEAR_CATEGORIES };
