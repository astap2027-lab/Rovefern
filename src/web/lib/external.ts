/**
 * External data adapters. Each returns data with its source and retrieval time so the UI
 * can show freshness. Swap a provider by replacing one function.
 */
import type { RateTable } from "../../lib/engine/budget";
import { kvGet, kvSet } from "./idb";

// ---- Currency: Frankfurter (European Central Bank reference rates) ----------------
export async function getRates(base = "EUR"): Promise<RateTable> {
  const key = `fx:${base}`;
  const cached = await kvGet<RateTable>(key);
  if (cached && Date.now() - Date.parse(cached.retrievedAt) < 12 * 3600_000) return cached;
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${base}`);
    if (!res.ok) throw new Error();
    const data = (await res.json()) as { base: string; date: string; rates: Record<string, number> };
    const table: RateTable = { base: data.base, rates: data.rates, source: "Frankfurter (European Central Bank reference rates)", retrievedAt: new Date().toISOString(), asOf: data.date };
    await kvSet(key, table);
    return table;
  } catch {
    if (cached) return cached;
    throw new Error("Exchange rates are unavailable right now.");
  }
}

// ---- Weather: Open-Meteo ------------------------------------------------------------
export interface DailyWeather {
  date: string;
  maxC: number | null;
  minC: number | null;
  precipMm: number | null;
  precipProb: number | null;
  windKmh: number | null;
  code: number | null;
}
export interface WeatherResult {
  kind: "forecast" | "climate";
  days: DailyWeather[];
  source: string;
  sourceUrl: string;
  retrievedAt: string;
  period: string;
  note: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

export async function getWeather(lat: number, lon: number, startDate: string | null | undefined, days: number, timezone = "auto"): Promise<WeatherResult> {
  const today = iso(new Date());
  const start = startDate ?? today;
  const end = addDays(start, Math.max(0, days - 1));
  const horizon = addDays(today, 15);
  const tz = encodeURIComponent(timezone);
  const daily = "temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code";

  if (start <= horizon && end >= today) {
    const s = start < today ? today : start;
    const e = end > horizon ? horizon : end;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=${daily},precipitation_probability_max&timezone=${tz}&start_date=${s}&end_date=${e}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("The weather service didn't respond.");
    const d = await res.json();
    return {
      kind: "forecast",
      days: d.daily.time.map((date: string, i: number) => ({
        date,
        maxC: d.daily.temperature_2m_max[i],
        minC: d.daily.temperature_2m_min[i],
        precipMm: d.daily.precipitation_sum[i],
        precipProb: d.daily.precipitation_probability_max?.[i] ?? null,
        windKmh: d.daily.wind_speed_10m_max[i],
        code: d.daily.weather_code[i],
      })),
      source: "Open-Meteo forecast (blend of national weather models)",
      sourceUrl: "https://open-meteo.com/",
      retrievedAt: new Date().toISOString(),
      period: `${s} to ${e}`,
      note:
        e < end
          ? "Forecasts only reach about 16 days ahead; later trip days aren't covered. Check the official national weather service before you go."
          : "Model forecast. Check the official national weather service and any warnings before you go.",
    };
  }

  // Too far ahead (or in the past): show what the same dates were like last year, clearly as climate context.
  // Shift the dates back whole years until they are safely in the past (archive lags ~5 days).
  let k = start > today ? 1 : 0;
  const shift = (x: string, n: number) => `${parseInt(x.slice(0, 4)) - n}${x.slice(4)}`.replace(/-02-29$/, "-02-28");
  while (shift(end, k) >= addDays(today, -6)) k++;
  const hs = shift(start, k);
  const he = shift(end, k);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&daily=${daily}&timezone=${tz}&start_date=${hs}&end_date=${he}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Historical weather is unavailable right now.");
  const d = await res.json();
  return {
    kind: "climate",
    days: d.daily.time.map((date: string, i: number) => ({
      date,
      maxC: d.daily.temperature_2m_max[i],
      minC: d.daily.temperature_2m_min[i],
      precipMm: d.daily.precipitation_sum[i],
      precipProb: null,
      windKmh: d.daily.wind_speed_10m_max[i],
      code: d.daily.weather_code[i],
    })),
    source: "Open-Meteo historical weather (ERA5 reanalysis)",
    sourceUrl: "https://open-meteo.com/en/docs/historical-weather-api",
    retrievedAt: new Date().toISOString(),
    period: `${hs} to ${he}`,
    note: `This is what the same dates were like in ${he.slice(0, 4)} — climate context, not a forecast. A single year can be unusual.`,
  };
}

export function weatherLabel(code: number | null): string {
  if (code == null) return "—";
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorms";
}
