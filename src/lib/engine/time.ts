import type { ItineraryDay } from "../domain/types";
import { round } from "./units";

/**
 * Naismith's rule (Scottish Mountaineering Club, 1892) with the common descent
 * extension: 5 km/h on the flat, +1 h per 600 m ascent, +10 min per 300 m of
 * steep descent. We apply a pace factor and exclude breaks. Always an estimate:
 * terrain, pack weight and fitness change it a lot.
 */
export const NAISMITH = { flatKmh: 5, ascentMPerHour: 600, descentMPer10Min: 300 };

export type Pace = "relaxed" | "average" | "fast";
const PACE_FACTOR: Record<Pace, number> = { relaxed: 1.3, average: 1.0, fast: 0.85 };

export function naismithHours(distanceKm: number, ascentM = 0, descentM = 0, pace: Pace = "average"): number {
  if (!(distanceKm >= 0)) return NaN;
  const flat = distanceKm / NAISMITH.flatKmh;
  const up = Math.max(0, ascentM) / NAISMITH.ascentMPerHour;
  const down = (Math.max(0, descentM) / NAISMITH.descentMPer10Min) * (10 / 60);
  return round((flat + up + down) * PACE_FACTOR[pace], 2);
}

/** Walking hours for a day: user override if set, else Naismith estimate, else null. */
export function dayWalkingHours(day: ItineraryDay, pace: Pace = "average"): number | null {
  if (day.walkingHoursOverride != null) return day.walkingHoursOverride;
  const d = day.distanceKm.value;
  if (d == null) return null;
  return naismithHours(d, day.ascentM.value ?? 0, day.descentM.value ?? 0, pace);
}

export interface ItineraryTotals {
  distanceKm: number | null;
  ascentM: number | null;
  descentM: number | null;
  walkingHours: number | null;
  longestDayHours: number | null;
  /** True when some days lack data, so totals are partial. */
  incomplete: boolean;
  /** True when any figure is AI/estimate rather than official/third-party/user. */
  containsEstimates: boolean;
}

export function itineraryTotals(days: ItineraryDay[], pace: Pace = "average"): ItineraryTotals {
  let dist = 0,
    up = 0,
    down = 0,
    hrs = 0,
    longest = 0;
  let anyDist = false,
    anyUp = false,
    anyDown = false,
    anyHrs = false,
    incomplete = false,
    estimates = false;
  for (const day of days) {
    const fields = [day.distanceKm, day.ascentM, day.descentM];
    for (const f of fields) {
      if (f.value == null) incomplete = true;
      else if (f.provenance.kind === "ai" || f.provenance.kind === "estimate" || f.provenance.kind === "unverified")
        estimates = true;
    }
    if (day.distanceKm.value != null) {
      dist += day.distanceKm.value;
      anyDist = true;
    }
    if (day.ascentM.value != null) {
      up += day.ascentM.value;
      anyUp = true;
    }
    if (day.descentM.value != null) {
      down += day.descentM.value;
      anyDown = true;
    }
    const h = dayWalkingHours(day, pace);
    if (h != null) {
      hrs += h;
      anyHrs = true;
      longest = Math.max(longest, h);
    }
  }
  return {
    distanceKm: anyDist ? round(dist, 1) : null,
    ascentM: anyUp ? round(up) : null,
    descentM: anyDown ? round(down) : null,
    walkingHours: anyHrs ? round(hrs, 2) : null,
    longestDayHours: anyHrs ? round(longest, 2) : null,
    incomplete,
    containsEstimates: estimates,
  };
}

/** Add days to an ISO date (YYYY-MM-DD) without timezone drift. */
export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Calendar date for itinerary day `dayNumber` (1-based). */
export function dateForDay(startDate: string | null | undefined, dayNumber: number): string | null {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
  return addDaysISO(startDate, dayNumber - 1);
}

/** Whole days between today (in a given IANA zone) and the trip start. Negative if past. */
export function daysUntil(startDate: string, now: Date = new Date(), timeZone?: string): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+startDate.slice(0, 4), +startDate.slice(5, 7) - 1, +startDate.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}
