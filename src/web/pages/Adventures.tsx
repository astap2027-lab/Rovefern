import { useMemo, useRef, useState } from "react";
import type { Trip, TripStatus } from "../../lib/domain/types";
import { deriveTrip } from "../../lib/engine/derive";
import { Icon } from "../components/icons";
import { Confirm, Empty, useFormat } from "../components/ui";
import { downloadText, slug } from "../lib/gpx";
import { actions, getState, toast, useStore } from "../lib/store";
import { Link, navigate, useTitle } from "../router";

const STATUSES: TripStatus[] = ["planning", "preparing", "ready", "completed"];
export const STATUS_LABEL: Record<TripStatus, string> = { planning: "Planning", preparing: "Preparing", ready: "Ready", completed: "Completed" };

export function exportTripJson(trip: Trip) {
  // Include the library items this trip uses, so the export is self-contained.
  const ids = new Set(trip.gear.map((g) => g.gearId));
  const gear = getState().gear.filter((g) => ids.has(g.id));
  downloadText(`${slug(trip.title)}.rovefern.json`, JSON.stringify({ app: "rovefern", kind: "trip", version: 1, exportedAt: new Date().toISOString(), trip, gear }, null, 2), "application/json");
}

export function Adventures() {
  useTitle("My adventures");
  const trips = useStore((s) => s.trips);
  const gear = useStore((s) => s.gear);
  const [view, setView] = useState<"active" | "completed" | "archived">("active");
  const [confirmDelete, setConfirmDelete] = useState<Trip | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const shown = trips.filter((t) => (view === "archived" ? t.archived : !t.archived && (view === "completed" ? t.status === "completed" : t.status !== "completed")));
  const counts = {
    active: trips.filter((t) => !t.archived && t.status !== "completed").length,
    completed: trips.filter((t) => !t.archived && t.status === "completed").length,
    archived: trips.filter((t) => t.archived).length,
  };

  const importTrip = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== "rovefern" || data.kind !== "trip" || !data.trip?.id) throw new Error("That file isn't a Rovefern trip export.");
      const existing = new Set(gear.map((g) => g.id));
      const newGear = (data.gear ?? []).filter((g: { id: string }) => !existing.has(g.id));
      if (newGear.length) actions.addGear(newGear);
      const trip: Trip = trips.some((t) => t.id === data.trip.id) ? { ...data.trip, id: crypto.randomUUID(), title: `${data.trip.title} (imported)` } : data.trip;
      actions.addTrip(trip);
      toast(`Imported ${trip.title}`);
    } catch (e) {
      toast((e as Error).message.startsWith("Unexpected") ? "That file couldn't be read." : (e as Error).message, { tone: "error" });
    }
  };

  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <h1>My adventures</h1>
          <p className="lede">Trips you're planning and ones you've done.</p>
        </div>
        <div className="row">
          <button className="btn secondary" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> Import trip
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && importTrip(e.target.files[0])} />
          <Link to="/plan" className="btn">
            <Icon name="plus" size={18} /> New trip
          </Link>
        </div>
      </div>

      <div className="seg" role="group" aria-label="Show trips" style={{ marginBottom: 20 }}>
        {(["active", "completed", "archived"] as const).map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {v[0].toUpperCase() + v.slice(1)} ({counts[v]})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        view === "active" ? (
          <Empty title="No trips yet" action={<Link to="/plan" className="btn">Plan an adventure</Link>}>
            Describe a trip and Rovefern will build the itinerary, gear list, meals and budget for you.
          </Empty>
        ) : (
          <Empty title={`No ${view} trips`} />
        )
      ) : (
        <div className="grid grid-3">
          {shown.map((t) => (
            <TripCard key={t.id} trip={t} onDelete={() => setConfirmDelete(t)} />
          ))}
        </div>
      )}

      {confirmDelete && (
        <Confirm
          title="Delete this trip?"
          body={`“${confirmDelete.title}” and its assistant conversation will be removed. Your gear library isn't affected. You can undo straight afterwards.`}
          confirmLabel="Delete trip"
          danger
          onConfirm={() => actions.deleteTrip(confirmDelete.id)}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function TripCard({ trip, onDelete }: { trip: Trip; onDelete: () => void }) {
  const f = useFormat();
  const gear = useStore((s) => s.gear);
  const d = useMemo(() => deriveTrip(trip, gear), [trip, gear]);
  const [menu, setMenu] = useState(false);
  const pack = d.weights.people[0];
  const end = trip.startDate ? new Date(Date.parse(trip.startDate) + (trip.durationDays - 1) * 86400000).toISOString().slice(0, 10) : null;
  return (
    <article className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row between">
        <span className={`status ${trip.status}`}>{STATUS_LABEL[trip.status]}</span>
        <div style={{ position: "relative" }}>
          <button className="icon-btn" aria-label={`Actions for ${trip.title}`} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <Icon name="more" />
          </button>
          {menu && (
            <div className="card" role="menu" style={{ position: "absolute", right: 0, top: 44, zIndex: 10, padding: 6, minWidth: 200, boxShadow: "var(--shadow)" }} onMouseLeave={() => setMenu(false)}>
              {[
                ["Open", () => navigate(`/trip/${trip.id}`)],
                ["Edit details", () => navigate(`/trip/${trip.id}/overview#edit`)],
                ["Duplicate", () => {
                  const id = actions.duplicateTrip(trip.id);
                  if (id) navigate(`/trip/${id}`);
                }],
                ...(trip.status !== "completed" ? [["Mark completed", () => actions.applyTripOps(trip.id, [{ op: "set_status", status: "completed" }], "mark completed")] as const] : []),
                [trip.archived ? "Unarchive" : "Archive", () => {
                  actions.patchTrip(trip.id, (t) => ({ ...t, archived: !t.archived }), trip.archived ? "unarchive" : "archive");
                  toast(trip.archived ? `Restored ${trip.title}` : `Archived ${trip.title}`, { undo: true });
                }],
                ["Export / print", () => navigate(`/trip/${trip.id}/print`)],
                ["Delete", onDelete],
              ].map(([label, fn]) => (
                <button
                  key={label as string}
                  role="menuitem"
                  className="btn ghost sm block"
                  style={{ justifyContent: "flex-start", color: label === "Delete" ? "var(--rust)" : undefined }}
                  onClick={() => {
                    setMenu(false);
                    (fn as () => void)();
                  }}
                >
                  {label as string}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <Link to={`/trip/${trip.id}`} style={{ textDecoration: "none", color: "inherit" }} aria-current={undefined}>
        <h3 style={{ margin: 0 }}>{trip.title}</h3>
        <div className="small muted">{[trip.destination.region, trip.destination.country].filter(Boolean).join(", ") || trip.destination.name}</div>
      </Link>
      <dl className="kv small" style={{ gridTemplateColumns: "auto 1fr" }}>
        <dt>Dates</dt>
        <dd>{trip.startDate ? `${f.date(trip.startDate, { day: "numeric", month: "short" })} – ${f.date(end, { day: "numeric", month: "short", year: "numeric" })}` : "Not set"}</dd>
        <dt>Length</dt>
        <dd>
          {trip.durationDays} {trip.durationDays === 1 ? "day" : "days"}, {trip.participants.length} {trip.participants.length === 1 ? "person" : "people"}
        </dd>
        <dt>Difficulty</dt>
        <dd>{trip.difficulty ?? "—"}</dd>
        <dt>Est. cost</dt>
        <dd className="num">{d.budget.estimatedTotal ? f.money(d.budget.estimatedTotal, trip.currency) : "—"}</dd>
        <dt>Pack</dt>
        <dd className="num">{pack && pack.itemCount ? `${f.w(pack.totalCarriedStartGrams)} carried` : "No gear yet"}</dd>
      </dl>
      <div className="row" style={{ marginTop: "auto" }}>
        <select
          className="input sm"
          style={{ width: "auto" }}
          aria-label="Status"
          value={trip.status}
          onChange={(e) => actions.applyTripOps(trip.id, [{ op: "set_status", status: e.target.value as TripStatus }], "status change")}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <Link to={`/trip/${trip.id}`} className="btn sm secondary" style={{ marginLeft: "auto" }}>
          Open
        </Link>
      </div>
    </article>
  );
}
