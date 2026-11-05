/**
 * Australia-wide trail search using OpenStreetMap (© OpenStreetMap contributors, ODbL).
 * - Nominatim finds the place or trail the user typed.
 * - Overpass finds hiking routes and named walking tracks around it, with geometry.
 * - Open-Meteo samples elevation along the route for a profile.
 * Requests run from the browser, are cached, and respect the services' light-use policies.
 */
import { kvGet, kvSet } from "./idb";
import { haversineKm, type GpxPoint } from "./gpx";

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors (ODbL)";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/** Rough bounding box of Australia (incl. Tasmania), used to keep searches in-country. */
export const AU_BBOX = { s: -44.2, w: 112.5, n: -9.9, e: 154.0 };

export interface OsmTrail {
  key: string; // "relation/123" or "way/456" or "ways/<name>@bbox"
  kind: "route" | "track";
  name: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  /** Distance from the route's geometry, km (null if not loaded). */
  lengthKm: number | null;
  /** Distance tagged by mappers, km. */
  taggedKm: number | null;
  wayIds?: number[];
}

export interface OsmPlace {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  bbox: { s: number; w: number; n: number; e: number };
  osmType?: string;
  osmId?: number;
  type?: string;
  class?: string;
}

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = await kvGet<{ at: number; v: T }>(`osm:${key}`);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v;
  const v = await fn();
  kvSet(`osm:${key}`, { at: Date.now(), v }).catch(() => {});
  return v;
}

export async function overpass<T = OverpassResponse>(query: string): Promise<T> {
  let lastErr: unknown;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(query), headers: { "content-type": "application/x-www-form-urlencoded" } });
      if (res.status === 429 || res.status === 504) {
        lastErr = new Error("The trail database is busy. Try again in a moment.");
        continue;
      }
      if (!res.ok) throw new Error(`Trail search failed (${res.status}).`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Couldn't reach the trail database.");
}

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  center?: { lat: number; lon: number };
  lat?: number;
  lon?: number;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[];
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
}
export interface OverpassResponse {
  elements: OverpassElement[];
}

export async function geocode(q: string): Promise<OsmPlace[]> {
  const query = q.trim();
  if (!query) return [];
  return cached(`geo:${query.toLowerCase()}`, 30 * 86400_000, async () => {
    const url = `${NOMINATIM}?format=jsonv2&countrycodes=au&limit=6&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { "accept-language": "en" } });
    if (!res.ok) throw new Error("Place search is unavailable right now.");
    const data = (await res.json()) as {
      name?: string;
      display_name: string;
      lat: string;
      lon: string;
      boundingbox: [string, string, string, string];
      osm_type?: string;
      osm_id?: number;
      type?: string;
      category?: string;
    }[];
    return data.map((d) => ({
      name: d.name || d.display_name.split(",")[0],
      displayName: d.display_name,
      lat: +d.lat,
      lon: +d.lon,
      bbox: { s: +d.boundingbox[0], n: +d.boundingbox[1], w: +d.boundingbox[2], e: +d.boundingbox[3] },
      osmType: d.osm_type,
      osmId: d.osm_id,
      type: d.type,
      class: d.category,
    }));
  });
}

/** Grow a bbox so it is at least `minKm` across, and clip to Australia. */
export function expandBbox(b: OsmPlace["bbox"], minKm = 30) {
  const latSpan = minKm / 111;
  const midLat = (b.s + b.n) / 2;
  const lonSpan = minKm / (111 * Math.cos((midLat * Math.PI) / 180));
  const cLat = (b.s + b.n) / 2;
  const cLon = (b.w + b.e) / 2;
  const s = Math.min(b.s, cLat - latSpan / 2);
  const n = Math.max(b.n, cLat + latSpan / 2);
  const w = Math.min(b.w, cLon - lonSpan / 2);
  const e = Math.max(b.e, cLon + lonSpan / 2);
  return { s: Math.max(s, AU_BBOX.s), w: Math.max(w, AU_BBOX.w), n: Math.min(n, AU_BBOX.n), e: Math.min(e, AU_BBOX.e) };
}

/** Limit very large areas (e.g. a whole state) so Overpass queries stay quick. */
export function capBbox(b: OsmPlace["bbox"], maxDeg = 1.6) {
  const cLat = (b.s + b.n) / 2;
  const cLon = (b.w + b.e) / 2;
  const h = Math.min(b.n - b.s, maxDeg) / 2;
  const w = Math.min(b.e - b.w, maxDeg) / 2;
  return { s: cLat - h, n: cLat + h, w: cLon - w, e: cLon + w };
}

const TRACK_NAME = "(track|walk|trail|circuit|loop|way|traverse|pass|lookout)";

export function parseTaggedKm(v?: string): number | null {
  if (!v) return null;
  const m = v.replace(",", ".").match(/([\d.]+)\s*(km|mi|m)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = (m[2] ?? "km").toLowerCase();
  return u === "mi" ? n * 1.609344 : u === "m" ? n / 1000 : n;
}

function lineKm(pts: { lat: number; lon: number }[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversineKm(pts[i - 1], pts[i]);
  return d;
}

/** Turn Overpass results into trails: hiking route relations, plus named tracks grouped by name. */
export function trailsFromOverpass(data: OverpassResponse): OsmTrail[] {
  const out: OsmTrail[] = [];
  const memberWays = new Set<number>();
  for (const el of data.elements) {
    if (el.type !== "relation" || !el.tags?.name) continue;
    el.members?.forEach((m) => m.type === "way" && memberWays.add(m.ref));
    out.push({
      key: `relation/${el.id}`,
      kind: "route",
      name: el.tags.name,
      lat: el.center?.lat ?? (el.bounds ? (el.bounds.minlat + el.bounds.maxlat) / 2 : 0),
      lon: el.center?.lon ?? (el.bounds ? (el.bounds.minlon + el.bounds.maxlon) / 2 : 0),
      tags: el.tags,
      lengthKm: null,
      taggedKm: parseTaggedKm(el.tags.distance),
    });
  }
  const groups = new Map<string, OverpassElement[]>();
  for (const el of data.elements) {
    if (el.type !== "way" || !el.tags?.name || memberWays.has(el.id)) continue;
    const k = el.tags.name.trim();
    groups.set(k, [...(groups.get(k) ?? []), el]);
  }
  for (const [name, ways] of groups) {
    if (out.some((t) => t.name.toLowerCase() === name.toLowerCase())) continue;
    const pts = ways.flatMap((w) => w.geometry ?? []);
    if (!pts.length) continue;
    const km = ways.reduce((s, w) => s + lineKm(w.geometry ?? []), 0);
    if (km < 0.3) continue; // skip tiny paths
    const mid = pts[Math.floor(pts.length / 2)];
    const tags = { ...(ways[0].tags ?? {}) };
    out.push({ key: `ways/${ways.map((w) => w.id).slice(0, 60).join(",")}`, kind: "track", name, lat: mid.lat, lon: mid.lon, tags, lengthKm: km, taggedKm: null, wayIds: ways.map((w) => w.id) });
  }
  return out;
}

export function rankTrails(trails: OsmTrail[], q: string, near?: { lat: number; lon: number }): OsmTrail[] {
  const ql = q.toLowerCase().trim();
  const score = (t: OsmTrail) => {
    let s = 0;
    const n = t.name.toLowerCase();
    if (ql && n === ql) s += 100;
    else if (ql && n.includes(ql)) s += 50;
    if (t.kind === "route") s += 20;
    if (t.tags.network === "nwn" || t.tags.network === "rwn") s += 10;
    if (t.tags.operator || t.tags.website) s += 5;
    const km = t.lengthKm ?? t.taggedKm ?? 0;
    s += Math.min(15, km);
    if (near) s -= Math.min(20, haversineKm(near, t) / 5);
    return s;
  };
  return [...trails].sort((a, b) => score(b) - score(a));
}

export async function searchTrails(q: string): Promise<{ place: OsmPlace | null; trails: OsmTrail[]; bbox: OsmPlace["bbox"] }> {
  const places = await geocode(q);
  const place = places[0] ?? null;
  if (!place) return { place: null, trails: [], bbox: AU_BBOX };
  const bbox = capBbox(expandBbox(place.bbox, 25));
  const b = `${bbox.s},${bbox.w},${bbox.n},${bbox.e}`;
  // Relations: tags, centre and member ids (no geometry, to stay light). Named tracks: geometry for length.
  const query = `[out:json][timeout:25];
relation["route"~"^(hiking|foot|walking)$"]["name"](${b});
out body center 150;
way["highway"~"^(path|footway|track|bridleway)$"]["name"~"${TRACK_NAME}",i](${b});
out tags geom 400;`;
  const data = await cached(`area:${b}`, 7 * 86400_000, () => overpass(query));
  const trails = trailsFromOverpass(data);
  return { place, trails: rankTrails(trails, q, place).slice(0, 40), bbox };
}

export interface TrailGeometry {
  segments: GpxPoint[][];
  lengthKm: number;
  tags: Record<string, string>;
  name: string;
}

/** Load full geometry for a trail key. */
export async function loadTrail(key: string): Promise<TrailGeometry> {
  return cached(`trail:${key}`, 7 * 86400_000, async () => {
    const [type, ids] = key.split("/");
    let q: string;
    if (type === "relation") q = `[out:json][timeout:25];relation(${+ids});out tags geom;`;
    else if (type === "way") q = `[out:json][timeout:25];way(${+ids});out tags geom;`;
    else if (type === "ways") q = `[out:json][timeout:25];way(id:${ids.split(",").map(Number).filter(Boolean).join(",")});out tags geom;`;
    else throw new Error("Unknown trail.");
    const data = await overpass(q);
    const segments: GpxPoint[][] = [];
    let tags: Record<string, string> = {};
    let name = "";
    for (const el of data.elements) {
      if (el.type === "relation") {
        tags = el.tags ?? {};
        name = tags.name ?? name;
        for (const m of el.members ?? []) if (m.type === "way" && m.geometry?.length) segments.push(m.geometry.map((p) => ({ lat: p.lat, lon: p.lon })));
      } else if (el.type === "way" && el.geometry?.length) {
        if (!name) {
          tags = el.tags ?? {};
          name = tags.name ?? "";
        }
        segments.push(el.geometry.map((p) => ({ lat: p.lat, lon: p.lon })));
      }
    }
    if (!segments.length) throw new Error("This trail has no mapped path.");
    const lengthKm = segments.reduce((s, seg) => s + lineKm(seg), 0);
    return { segments, lengthKm, tags, name };
  });
}

/** Join segments end-to-end (greedy nearest neighbour) into one ordered line for profiles and GPX. */
export function chainSegments(segments: GpxPoint[][]): GpxPoint[] {
  if (!segments.length) return [];
  const left = segments.map((s) => [...s]);
  const line = left.shift()!;
  while (left.length) {
    const end = line[line.length - 1];
    let best = 0;
    let bestD = Infinity;
    let flip = false;
    left.forEach((s, i) => {
      const d1 = haversineKm(end, s[0]);
      const d2 = haversineKm(end, s[s.length - 1]);
      if (d1 < bestD) [bestD, best, flip] = [d1, i, false];
      if (d2 < bestD) [bestD, best, flip] = [d2, i, true];
    });
    const seg = left.splice(best, 1)[0];
    line.push(...(flip ? seg.reverse() : seg));
  }
  return line;
}

/** Evenly resample a line to n points. */
export function resample(line: GpxPoint[], n: number): GpxPoint[] {
  if (line.length <= n) return line;
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + haversineKm(line[i - 1], line[i]));
  const total = cum[cum.length - 1];
  const out: GpxPoint[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const span = cum[j + 1] - cum[j] || 1;
    const f = (target - cum[j]) / span;
    out.push({ lat: line[j].lat + (line[j + 1].lat - line[j].lat) * f, lon: line[j].lon + (line[j + 1].lon - line[j].lon) * f });
  }
  return out;
}

/** Elevation for up to 100 points per request (Open-Meteo, Copernicus 90 m DEM). */
export async function sampleElevation(points: GpxPoint[]): Promise<GpxPoint[]> {
  const pts = points.slice(0, 100);
  const lat = pts.map((p) => p.lat.toFixed(5)).join(",");
  const lon = pts.map((p) => p.lon.toFixed(5)).join(",");
  const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
  if (!res.ok) throw new Error("Elevation data is unavailable.");
  const data = (await res.json()) as { elevation: number[] };
  return pts.map((p, i) => ({ ...p, ele: data.elevation[i] }));
}

/** Plain-language labels for common OSM hiking tags. */
export function describeTags(tags: Record<string, string>): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const sac: Record<string, string> = {
    hiking: "Easy hiking (T1)",
    mountain_hiking: "Mountain hiking (T2)",
    demanding_mountain_hiking: "Demanding mountain hiking (T3)",
    alpine_hiking: "Alpine hiking (T4)",
    demanding_alpine_hiking: "Demanding alpine hiking (T5)",
    difficult_alpine_hiking: "Difficult alpine hiking (T6)",
  };
  const net: Record<string, string> = { iwn: "International", nwn: "National", rwn: "Regional", lwn: "Local" };
  if (tags.operator) out.push({ label: "Managed by", value: tags.operator });
  if (tags.network && net[tags.network]) out.push({ label: "Route network", value: net[tags.network] });
  if (tags.from || tags.to) out.push({ label: "Start / end", value: [tags.from, tags.to].filter(Boolean).join(" to ") });
  if (tags.roundtrip === "yes") out.push({ label: "Type", value: "Loop" });
  if (tags.sac_scale && sac[tags.sac_scale]) out.push({ label: "Difficulty (mapper's rating)", value: sac[tags.sac_scale] });
  if (tags.trail_visibility) out.push({ label: "Trail visibility", value: tags.trail_visibility });
  if (tags.surface) out.push({ label: "Surface", value: tags.surface });
  if (tags.description) out.push({ label: "Description", value: tags.description });
  return out;
}

export function osmUrl(key: string): string {
  const [type, ids] = key.split("/");
  const first = ids.split(",")[0];
  return `https://www.openstreetmap.org/${type === "ways" ? "way" : type}/${first}`;
}
