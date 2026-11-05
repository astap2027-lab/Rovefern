/** GPX 1.1 import/export. Imported tracks are labelled user-supplied; nothing is presented as verified. */
export interface GpxPoint {
  lat: number;
  lon: number;
  ele?: number;
}
export interface GpxData {
  name?: string;
  track: GpxPoint[];
  waypoints: (GpxPoint & { name: string })[];
}

const R = 6371.0088; // mean Earth radius, km
export function haversineKm(a: GpxPoint, b: GpxPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function trackStats(track: GpxPoint[]) {
  let dist = 0;
  let up = 0;
  let down = 0;
  const profile: { km: number; ele: number }[] = [];
  let hasEle = track.some((p) => p.ele != null);
  // Light smoothing threshold to avoid counting GPS noise as climbing.
  const THRESH = 3;
  let lastEle = track[0]?.ele;
  for (let i = 0; i < track.length; i++) {
    if (i > 0) dist += haversineKm(track[i - 1], track[i]);
    const e = track[i].ele;
    if (e != null) {
      profile.push({ km: dist, ele: e });
      if (lastEle != null) {
        const d = e - lastEle;
        if (Math.abs(d) >= THRESH) {
          if (d > 0) up += d;
          else down -= d;
          lastEle = e;
        }
      } else lastEle = e;
    }
  }
  if (profile.length < 2) hasEle = false;
  return { distanceKm: dist, ascentM: hasEle ? up : null, descentM: hasEle ? down : null, profile: hasEle ? profile : [] };
}

export function parseGpx(xml: string): GpxData {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("This file isn't valid XML.");
  const root = doc.documentElement;
  if (!root || root.localName !== "gpx") throw new Error("This doesn't look like a GPX file.");
  const pt = (el: Element): GpxPoint | null => {
    const lat = parseFloat(el.getAttribute("lat") ?? "");
    const lon = parseFloat(el.getAttribute("lon") ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const eleEl = el.getElementsByTagName("ele")[0];
    const ele = eleEl ? parseFloat(eleEl.textContent ?? "") : NaN;
    return { lat, lon, ele: Number.isFinite(ele) ? ele : undefined };
  };
  let track = [...doc.getElementsByTagName("trkpt")].map(pt).filter((p): p is GpxPoint => !!p);
  if (!track.length) track = [...doc.getElementsByTagName("rtept")].map(pt).filter((p): p is GpxPoint => !!p);
  const waypoints = [...doc.getElementsByTagName("wpt")]
    .map((el) => {
      const p = pt(el);
      if (!p) return null;
      return { ...p, name: el.getElementsByTagName("name")[0]?.textContent?.trim() || "Waypoint" };
    })
    .filter((p): p is GpxPoint & { name: string } => !!p);
  if (track.length < 2 && !waypoints.length) throw new Error("No track, route or waypoints found in this GPX file.");
  if (track.length > 100_000) throw new Error("This track has too many points (over 100,000).");
  const name = doc.getElementsByTagName("name")[0]?.textContent?.trim() || undefined;
  return { name, track, waypoints };
}

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export function toGpx(name: string, track: GpxPoint[], waypoints: (GpxPoint & { name: string })[]): string {
  const wpts = waypoints.map((w) => `  <wpt lat="${w.lat}" lon="${w.lon}">${w.ele != null ? `<ele>${w.ele}</ele>` : ""}<name>${esc(w.name)}</name></wpt>`).join("\n");
  const trk = track.length
    ? `  <trk><name>${esc(name)}</name><trkseg>\n${track.map((p) => `    <trkpt lat="${p.lat}" lon="${p.lon}">${p.ele != null ? `<ele>${p.ele}</ele>` : ""}</trkpt>`).join("\n")}\n  </trkseg></trk>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Rovefern" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(name)}</name><desc>Exported from Rovefern. Route data is user-supplied unless stated otherwise; check it against official sources.</desc></metadata>
${wpts}
${trk}
</gpx>`;
}

export function downloadText(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "trip";
