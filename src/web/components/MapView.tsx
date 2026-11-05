import { useEffect, useRef } from "react";
import * as L from "leaflet";

export interface MapMarker {
  lat: number;
  lon: number;
  label: string;
  kind: "start" | "finish" | "camp" | "water" | "resupply" | "access" | "landmark" | "hut" | "area";
  detail?: string;
}

const COLORS: Record<MapMarker["kind"], string> = {
  start: "#1f3b2c",
  finish: "#93441f",
  camp: "#5a5f2e",
  hut: "#5a5f2e",
  water: "#34556a",
  resupply: "#7a5a12",
  access: "#565a52",
  landmark: "#7d8a5c",
  area: "#1f3b2c",
};

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/**
 * Interactive map (Leaflet). Base maps: OpenStreetMap and OpenTopoMap, both with attribution
 * as their licences require. Swap providers in TILE_LAYERS.
 */
const TILE_LAYERS = {
  Topographic: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    options: { maxZoom: 17, attribution: 'Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' },
  },
  Streets: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
  },
};

export function MapView({ markers, track, segments, height, label }: { markers: MapMarker[]; track?: [number, number][]; segments?: [number, number][][]; height?: number | string; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false, zoomControl: true });
    const bases = Object.fromEntries(Object.entries(TILE_LAYERS).map(([k, v]) => [k, L.tileLayer(v.url, v.options)]));
    bases.Topographic.addTo(m);
    L.control.layers(bases, undefined, { position: "topright" }).addTo(m);
    L.control.scale({ imperial: true, metric: true }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    m.on("focus", () => m.scrollWheelZoom.enable());
    m.on("blur", () => m.scrollWheelZoom.disable());
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: L.LatLngExpression[] = [];
    if (track && track.length > 1) {
      L.polyline(track, { color: "#1f3b2c", weight: 4, opacity: 0.9 }).addTo(g);
      pts.push(...track);
    }
    if (segments?.length) {
      L.polyline(segments, { color: "#1f3b2c", weight: 4, opacity: 0.9 }).addTo(g);
      for (const s of segments) pts.push(...s);
    }
    for (const mk of markers) {
      const c = COLORS[mk.kind];
      const icon = L.divIcon({
        className: "",
        html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${c};border:3px solid #fffefb;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      L.marker([mk.lat, mk.lon], { icon, title: mk.label, keyboard: true, alt: mk.label })
        .bindPopup(`<strong>${esc(mk.label)}</strong>${mk.detail ? `<br><span style="color:#565a52">${esc(mk.detail)}</span>` : ""}`)
        .addTo(g);
      pts.push([mk.lat, mk.lon]);
    }
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts as L.LatLngTuple[]), { padding: [30, 30], maxZoom: 13 });
    else if (pts.length === 1) m.setView(pts[0], 10);
    else m.setView([20, 0], 2);
    setTimeout(() => m.invalidateSize(), 50);
  }, [markers, track, segments]);

  return <div ref={el} className="map" style={height ? { height } : undefined} role="region" aria-label={label} />;
}

export function ElevationProfile({ profile, units }: { profile: { km: number; ele: number }[]; units: "metric" | "imperial" }) {
  if (profile.length < 2) return null;
  const W = 800;
  const H = 180;
  const P = { l: 44, r: 10, t: 10, b: 26 };
  const maxKm = profile[profile.length - 1].km || 1;
  let lo = Math.min(...profile.map((p) => p.ele));
  let hi = Math.max(...profile.map((p) => p.ele));
  if (hi - lo < 50) {
    hi += 25;
    lo -= 25;
  }
  // Downsample for rendering.
  const step = Math.max(1, Math.floor(profile.length / 600));
  const pts = profile.filter((_, i) => i % step === 0 || i === profile.length - 1);
  const x = (km: number) => P.l + (km / maxKm) * (W - P.l - P.r);
  const y = (e: number) => P.t + (1 - (e - lo) / (hi - lo)) * (H - P.t - P.b);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.km).toFixed(1)},${y(p.ele).toFixed(1)}`).join("");
  const area = `${line}L${x(maxKm)},${H - P.b}L${x(0)},${H - P.b}Z`;
  const fmtE = (m: number) => (units === "metric" ? `${Math.round(m)} m` : `${Math.round(m / 0.3048)} ft`);
  const fmtD = (km: number) => (units === "metric" ? `${km.toFixed(km < 10 ? 1 : 0)} km` : `${(km / 1.609344).toFixed(1)} mi`);
  return (
    <figure className="profile" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Elevation profile from ${fmtE(profile[0].ele)} to ${fmtE(profile[profile.length - 1].ele)}, between ${fmtE(lo)} and ${fmtE(hi)}`}>
        {[lo, (lo + hi) / 2, hi].map((e) => (
          <g key={e}>
            <line x1={P.l} x2={W - P.r} y1={y(e)} y2={y(e)} stroke="#e7e2d6" />
            <text x={P.l - 6} y={y(e) + 4} fontSize="11" textAnchor="end" fill="#7a7d73">
              {fmtE(e)}
            </text>
          </g>
        ))}
        <path d={area} fill="#dfe7dc" />
        <path d={line} fill="none" stroke="#1f3b2c" strokeWidth="2" />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={x(maxKm * f)} y={H - 8} fontSize="11" textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"} fill="#7a7d73">
            {fmtD(maxKm * f)}
          </text>
        ))}
      </svg>
    </figure>
  );
}
