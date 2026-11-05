import type { UnitSystem } from "../domain/types";

export const G_PER_OZ = 28.349523125;
export const G_PER_LB = 453.59237;
export const M_PER_FT = 0.3048;
export const KM_PER_MI = 1.609344;
export const ML_PER_FL_OZ = 29.5735295625;

/** Round to a given number of decimal places without floating noise. */
export function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export const gToOz = (g: number) => g / G_PER_OZ;
export const gToLb = (g: number) => g / G_PER_LB;
export const ozToG = (oz: number) => oz * G_PER_OZ;
export const lbToG = (lb: number) => lb * G_PER_LB;
export const kmToMi = (km: number) => km / KM_PER_MI;
export const miToKm = (mi: number) => mi * KM_PER_MI;
export const mToFt = (m: number) => m / M_PER_FT;
export const ftToM = (ft: number) => ft * M_PER_FT;
export const cToF = (c: number) => (c * 9) / 5 + 32;
export const lToFlOz = (l: number) => (l * 1000) / ML_PER_FL_OZ;

/**
 * Format a weight. Metric: g under 1 kg, kg (2 dp) above.
 * Imperial: oz under 1 lb, lb + oz above.
 */
export function formatWeight(grams: number, units: UnitSystem): string {
  if (!Number.isFinite(grams)) return "—";
  if (units === "metric") {
    if (Math.abs(grams) < 1000) return `${round(grams)} g`;
    return `${round(grams / 1000, 2).toFixed(2)} kg`;
  }
  const totalOz = gToOz(grams);
  if (Math.abs(totalOz) < 16) return `${round(totalOz, 1)} oz`;
  const sign = totalOz < 0 ? "-" : "";
  const abs = Math.abs(totalOz);
  let lb = Math.floor(abs / 16);
  let oz = round(abs - lb * 16, 1);
  if (oz >= 16) {
    lb += 1;
    oz = 0;
  }
  return `${sign}${lb} lb ${oz} oz`;
}

export function formatDistance(km: number | null | undefined, units: UnitSystem, dp = 1): string {
  if (km == null || !Number.isFinite(km)) return "—";
  return units === "metric" ? `${round(km, dp)} km` : `${round(kmToMi(km), dp)} mi`;
}

export function formatElevation(m: number | null | undefined, units: UnitSystem): string {
  if (m == null || !Number.isFinite(m)) return "—";
  return units === "metric"
    ? `${round(m).toLocaleString("en")} m`
    : `${round(mToFt(m)).toLocaleString("en")} ft`;
}

export function formatTemp(c: number | null | undefined, units: UnitSystem): string {
  if (c == null || !Number.isFinite(c)) return "—";
  return units === "metric" ? `${round(c)}°C` : `${round(cToF(c))}°F`;
}

export function formatVolume(litres: number, units: UnitSystem): string {
  if (!Number.isFinite(litres)) return "—";
  return units === "metric" ? `${round(litres, 1)} L` : `${round(lToFlOz(litres))} fl oz`;
}

export function formatHours(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Parse a user-typed weight like "650g", "1.2 kg", "23 oz", "1 lb 4 oz". Returns grams or null. */
export function parseWeight(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/,/g, ".");
  const lbOz = s.match(/^(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds?)\s*(\d+(?:\.\d+)?)\s*(?:oz|ounces?)$/);
  if (lbOz) return round(lbToG(parseFloat(lbOz[1])) + ozToG(parseFloat(lbOz[2])), 1);
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(g|grams?|gm|kg|kgs|kilograms?|kilos?|oz|ounces?|lb|lbs|pounds?)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2] ?? "g";
  if (unit.startsWith("k")) return round(n * 1000, 1);
  if (unit.startsWith("o")) return round(ozToG(n), 1);
  if (unit.startsWith("l") || unit.startsWith("p")) return round(lbToG(n), 1);
  return round(n, 1);
}
