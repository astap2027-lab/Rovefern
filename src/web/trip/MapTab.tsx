import { useMemo, useRef, useState } from "react";
import type { Waypoint } from "../../lib/domain/types";
import { prov, uid } from "../../lib/engine/factory";
import { Icon } from "../components/icons";
import { ElevationProfile, MapView, type MapMarker } from "../components/MapView";
import { Empty, Modal, Notice, NumField, ProvBadge, Term, useFormat } from "../components/ui";
import { downloadText, parseGpx, slug, toGpx, trackStats, type GpxData } from "../lib/gpx";
import { toast } from "../lib/store";
import { useTripActions, type TabProps } from "./TripPage";

const KIND_LABEL: Record<Waypoint["kind"], string> = {
  start: "Start",
  finish: "Finish",
  camp: "Campsite",
  hut: "Hut",
  water: "Water",
  resupply: "Resupply",
  access: "Access point",
  landmark: "Landmark",
};

export function MapTab({ trip }: TabProps) {
  const f = useFormat();
  const a = useTripActions(trip);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<(GpxData & { fileName: string }) | null>(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  const markers: MapMarker[] = useMemo(() => {
    const m: MapMarker[] = trip.waypoints.map((w) => ({ lat: w.lat, lon: w.lon, label: w.name, kind: w.kind, detail: `${KIND_LABEL[w.kind]} · ${w.provenance.kind === "user" ? "your input" : w.provenance.kind}` }));
    if (!m.length && trip.destination.lat != null && trip.destination.lon != null) m.push({ lat: trip.destination.lat, lon: trip.destination.lon, label: trip.destination.name, kind: "area", detail: "General area only" });
    return m;
  }, [trip.waypoints, trip.destination]);
  const track = useMemo(() => trip.route?.coordinates.map((c) => [c[0], c[1]] as [number, number]), [trip.route]);
  const stats = useMemo(() => (trip.route ? trackStats(trip.route.coordinates.map((c) => ({ lat: c[0], lon: c[1], ele: c[2] }))) : null), [trip.route]);

  const onFile = async (file: File) => {
    setErr("");
    if (file.size > 25 * 1024 * 1024) return setErr("That file is over 25 MB.");
    try {
      const data = parseGpx(await file.text());
      setPreview({ ...data, fileName: file.name });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const applyGpx = () => {
    if (!preview) return;
    const p = prov("user", { sourceName: `GPX: ${preview.fileName}`, note: "Imported route — not verified by Rovefern" });
    a.patch((t) => {
      if (preview.track.length > 1) t.route = { coordinates: preview.track.map((x) => [x.lat, x.lon, x.ele]), provenance: p };
      const wps: Waypoint[] = preview.waypoints.map((w) => ({ id: uid(), name: w.name, kind: /water|spring|tank|creek/i.test(w.name) ? "water" : /camp|site/i.test(w.name) ? "camp" : /hut/i.test(w.name) ? "hut" : "landmark", lat: w.lat, lon: w.lon, provenance: p }));
      if (preview.track.length > 1 && !t.waypoints.some((w) => w.kind === "start")) {
        const s = preview.track[0];
        const e = preview.track[preview.track.length - 1];
        wps.unshift({ id: uid(), name: "Start", kind: "start", lat: s.lat, lon: s.lon, provenance: p });
        wps.push({ id: uid(), name: "Finish", kind: "finish", lat: e.lat, lon: e.lon, provenance: p });
      }
      t.waypoints = [...t.waypoints, ...wps];
      if (t.destination.lat == null && preview.track[0]) {
        t.destination.lat = preview.track[0].lat;
        t.destination.lon = preview.track[0].lon;
      }
      return t;
    }, "import GPX");
    toast("Route imported", { undo: true });
    setPreview(null);
  };

  const exportGpx = () => {
    const track = trip.route?.coordinates.map((c) => ({ lat: c[0], lon: c[1], ele: c[2] })) ?? [];
    const wps = trip.waypoints.map((w) => ({ lat: w.lat, lon: w.lon, name: `${w.name} (${KIND_LABEL[w.kind]})` }));
    if (!track.length && !wps.length) return toast("There's no route or waypoints to export yet.", { tone: "error" });
    downloadText(`${slug(trip.title)}.gpx`, toGpx(trip.title, track, wps), "application/gpx+xml");
  };

  return (
    <div className="stack-lg">
      <div className="row between">
        <div>
          <h2 style={{ margin: 0 }}>Route map</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Zoom, pan and select a marker for details. Switch between topographic and street maps in the corner.
          </p>
        </div>
        <div className="row">
          <button className="btn secondary sm" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> Import <Term name="GPX file">GPX</Term>
          </button>
          <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button className="btn secondary sm" onClick={exportGpx}>
            <Icon name="download" size={16} /> Export GPX
          </button>
          <button className="btn secondary sm" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> Add a point
          </button>
        </div>
      </div>
      {err && <Notice tone="warn">{err}</Notice>}

      {markers.length || track?.length ? (
        <MapView label={`Map of ${trip.title}`} markers={markers} track={track} />
      ) : (
        <Empty title="Nothing to map yet" action={<button className="btn" onClick={() => fileRef.current?.click()}>Import a GPX route</button>}>
          Import a GPX file of your route, add points yourself, or set the destination's coordinates in trip details.
        </Empty>
      )}

      {trip.route ? (
        <section className="card">
          <div className="card-head">
            <h3>Your route</h3>
            <ProvBadge p={trip.route.provenance} />
          </div>
          {stats && (
            <>
              <p className="small" style={{ marginTop: 0 }}>
                {f.d(stats.distanceKm)} · {stats.ascentM != null ? `${f.e(stats.ascentM)} up, ${f.e(stats.descentM)} down` : "no elevation data in this file"}. Calculated from the GPX track points.
              </p>
              {stats.profile.length > 1 && <ElevationProfile profile={stats.profile} units={f.units} />}
            </>
          )}
          <button className="btn ghost sm" onClick={() => a.patch((t) => ({ ...t, route: null }), "remove route")}>
            Remove route
          </button>
        </section>
      ) : (
        <Notice tone="info">
          Rovefern only draws a route line from data you supply (a GPX file) or verified sources. It never turns AI-suggested locations into a route, because they could be wrong.
        </Notice>
      )}

      {trip.waypoints.length > 0 && (
        <section>
          <h3>Points</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Coordinates</th>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {trip.waypoints.map((w) => (
                  <tr key={w.id}>
                    <td>{w.name}</td>
                    <td>{KIND_LABEL[w.kind]}</td>
                    <td className="num small">
                      {w.lat.toFixed(5)}, {w.lon.toFixed(5)}
                    </td>
                    <td>
                      <ProvBadge p={w.provenance} compact />
                    </td>
                    <td className="r">
                      <button className="icon-btn" aria-label={`Remove ${w.name}`} onClick={() => a.patch((t) => ({ ...t, waypoints: t.waypoints.filter((x) => x.id !== w.id) }), "remove point")}>
                        <Icon name="trash" size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {preview && <GpxPreview data={preview} onCancel={() => setPreview(null)} onApply={applyGpx} />}
      {adding && <AddPoint onClose={() => setAdding(false)} onAdd={(w) => a.patch((t) => ({ ...t, waypoints: [...t.waypoints, w] }), "add point")} />}
    </div>
  );
}

function GpxPreview({ data, onCancel, onApply }: { data: GpxData & { fileName: string }; onCancel: () => void; onApply: () => void }) {
  const f = useFormat();
  const s = trackStats(data.track);
  return (
    <Modal title="Check this route" onClose={onCancel} wide>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          {data.name ?? data.fileName}: {data.track.length.toLocaleString()} track points, {data.waypoints.length} waypoints.
        </p>
        <MapView label="GPX preview" markers={data.waypoints.map((w) => ({ lat: w.lat, lon: w.lon, label: w.name, kind: "landmark" }))} track={data.track.map((p) => [p.lat, p.lon])} height={300} />
        {data.track.length > 1 && (
          <p className="small" style={{ margin: 0 }}>
            {f.d(s.distanceKm)}
            {s.ascentM != null ? ` · ${f.e(s.ascentM)} up · ${f.e(s.descentM)} down` : " · no elevation data"}
          </p>
        )}
        {s.profile.length > 1 && <ElevationProfile profile={s.profile} units={f.units} />}
        <Notice tone="info">This route will be labelled as your input. Rovefern doesn't verify imported routes, so make sure it's the right file before you rely on it.</Notice>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn" onClick={onApply}>
            Add to trip
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddPoint({ onClose, onAdd }: { onClose: () => void; onAdd: (w: Waypoint) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Waypoint["kind"]>("camp");
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [err, setErr] = useState("");
  return (
    <Modal title="Add a point" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return setErr("Give the point a name.");
          if (lat == null || lon == null) return setErr("Enter both latitude and longitude, in decimal degrees.");
          onAdd({ id: uid(), name: name.trim(), kind, lat, lon, provenance: prov("user") });
          onClose();
        }}
      >
        <label className="field">
          Name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Type
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Waypoint["kind"])}>
            {Object.entries(KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <NumField label="Latitude" value={lat} onChange={setLat} min={-90} max={90} placeholder="-41.6375" />
          <NumField label="Longitude" value={lon} onChange={setLon} min={-180} max={180} placeholder="145.9497" />
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>Copy coordinates from an official map or your mapping app.</p>
        {err && <div className="err">{err}</div>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" type="submit">
            Add point
          </button>
        </div>
      </form>
    </Modal>
  );
}
