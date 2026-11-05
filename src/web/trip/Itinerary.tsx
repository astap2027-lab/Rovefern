import { useState } from "react";
import type { ItineraryDay } from "../../lib/domain/types";
import { dateForDay, dayWalkingHours } from "../../lib/engine/time";
import { formatHours } from "../../lib/engine/units";
import { Icon } from "../components/icons";
import { Modal, Notice, NumField, ProvBadge, Term, useFormat } from "../components/ui";
import { useStore } from "../lib/store";
import { useTripActions, type TabProps } from "./TripPage";

export function Itinerary({ trip, d }: TabProps) {
  const f = useFormat();
  const pace = useStore((s) => s.settings.pace);
  const a = useTripActions(trip);
  const [edit, setEdit] = useState<ItineraryDay | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const imperial = f.units === "imperial";

  return (
    <div className="stack-lg">
      <div className="row between">
        <div>
          <h2 style={{ margin: 0 }}>Day by day</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {f.d(d.totals.distanceKm)} total · {f.e(d.totals.ascentM)} up · {f.e(d.totals.descentM)} down · about {formatHours(d.totals.walkingHours)} of walking
            {d.totals.incomplete && " (some days incomplete)"}
          </p>
        </div>
        <div className="row">
          <button className="btn secondary sm" onClick={() => a.ops([{ op: "set_duration", days: trip.durationDays + 1 }], "add a day")}>
            <Icon name="plus" size={16} /> Add a day
          </button>
          {trip.durationDays > 1 && (
            <button
              className="btn ghost sm"
              onClick={() => {
                const last = trip.days[trip.days.length - 1];
                if (last.userEdited && !confirmRemove) return setConfirmRemove(true);
                a.ops([{ op: "set_duration", days: trip.durationDays - 1, overrideUserEdits: true }], "remove last day");
                setConfirmRemove(false);
              }}
            >
              {confirmRemove ? "Confirm: remove your edited last day" : "Remove last day"}
            </button>
          )}
        </div>
      </div>

      {d.totals.containsEstimates && (
        <Notice tone="info">
          Figures labelled <span className="badge ai">AI suggestion</span> or <span className="badge estimate">Estimate</span> haven't been verified. Check them against the park authority's information or your own GPX route, and edit any day to correct them.
        </Notice>
      )}

      <div>
        {trip.days.map((day) => {
          const hrs = dayWalkingHours(day, pace);
          const date = dateForDay(trip.startDate, day.dayNumber);
          return (
            <article className="day" key={day.id} aria-labelledby={`day-${day.dayNumber}`}>
              <div className="n">
                {day.dayNumber}
                <small>{date ? f.date(date, { weekday: "short", day: "numeric", month: "short" }) : `Day ${day.dayNumber}`}</small>
              </div>
              <div>
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <h3 id={`day-${day.dayNumber}`}>{day.from && day.to ? `${day.from} to ${day.to}` : day.title ?? "Route not planned yet"}</h3>
                  <button className="btn ghost sm" onClick={() => setEdit(day)} aria-label={`Edit day ${day.dayNumber}`}>
                    <Icon name="edit" size={16} /> Edit
                  </button>
                </div>
                {day.title && day.from && <div className="small muted" style={{ marginTop: -4 }}>{day.title}</div>}
                <div className="day-figs">
                  <span>
                    <Icon name="route" size={16} /> {day.distanceKm.value != null ? f.d(day.distanceKm.value) : "Distance unknown"} {day.distanceKm.value != null && <ProvBadge p={day.distanceKm.provenance} compact />}
                  </span>
                  <span>
                    <Icon name="mountain" size={16} /> <Term name="Elevation gain">↑</Term> {f.e(day.ascentM.value)} <Term name="Elevation loss">↓</Term> {f.e(day.descentM.value)} {(day.ascentM.value != null || day.descentM.value != null) && <ProvBadge p={day.ascentM.provenance} compact />}
                  </span>
                  <span>
                    <Icon name="calendar" size={16} /> <Term name="Walking time">{hrs != null ? `~${formatHours(hrs)}` : "Time unknown"}</Term>
                    {day.walkingHoursOverride != null ? <span className="badge user">Your estimate</span> : hrs != null ? <span className="badge estimate">Naismith</span> : null}
                  </span>
                </div>
                <dl className="kv">
                  {day.terrain && (
                    <>
                      <dt>Terrain</dt>
                      <dd>{day.terrain}</dd>
                    </>
                  )}
                  {day.breaks && (
                    <>
                      <dt>Breaks</dt>
                      <dd>{day.breaks}</dd>
                    </>
                  )}
                  <dt>Overnight</dt>
                  <dd>
                    {day.dayNumber === trip.durationDays && !day.overnight ? "Finish" : day.overnight ?? <span className="muted">Not set</span>} {day.overnight && <ProvBadge p={day.overnightProvenance} compact />}
                  </dd>
                  <dt>
                    <Term name="Water resupply">Water</Term>
                  </dt>
                  <dd>
                    {day.water ? (
                      <>
                        {day.water} <ProvBadge p={day.waterProvenance} compact />
                        {day.waterProvenance?.kind !== "official" && <div className="tiny muted">Unconfirmed — treat all natural water and carry enough to reach the next reliable source.</div>}
                      </>
                    ) : (
                      <span className="muted">No confirmed water sources. Carry enough for the day.</span>
                    )}
                  </dd>
                  {day.resupply && (
                    <>
                      <dt>Food & resupply</dt>
                      <dd>{day.resupply}</dd>
                    </>
                  )}
                  {day.notes && (
                    <>
                      <dt>Notes</dt>
                      <dd style={{ whiteSpace: "pre-wrap" }}>{day.notes}</dd>
                    </>
                  )}
                </dl>
                {day.warnings && day.warnings.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <Notice tone="warn">
                      <ul style={{ margin: 0 }}>
                        {day.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </Notice>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {edit && <DayEditor day={edit} imperial={imperial} onClose={() => setEdit(null)} onSave={(patch) => a.ops([{ op: "update_day", dayNumber: edit.dayNumber, patch, source: "user" }], `edit day ${edit.dayNumber}`)} />}
    </div>
  );
}

type Patch = Parameters<ReturnType<typeof useTripActions>["ops"]>[0][number] & { op: "update_day" };

function DayEditor({ day, onClose, onSave, imperial }: { day: ItineraryDay; onClose: () => void; onSave: (p: Patch["patch"]) => unknown; imperial: boolean }) {
  // Edit in the user's units, store metric.
  const toDisp = (km: number | null) => (km == null ? null : imperial ? +(km / 1.609344).toFixed(2) : km);
  const toDispE = (m: number | null) => (m == null ? null : imperial ? Math.round(m / 0.3048) : m);
  const [v, setV] = useState({
    title: day.title ?? "",
    from: day.from,
    to: day.to,
    dist: toDisp(day.distanceKm.value),
    up: toDispE(day.ascentM.value),
    down: toDispE(day.descentM.value),
    hrs: day.walkingHoursOverride ?? null,
    terrain: day.terrain ?? "",
    breaks: day.breaks ?? "",
    overnight: day.overnight ?? "",
    water: day.water ?? "",
    resupply: day.resupply ?? "",
    warnings: (day.warnings ?? []).join("\n"),
    notes: day.notes ?? "",
  });
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const save = () => {
    const patch: Patch["patch"] = {
      title: v.title,
      from: v.from,
      to: v.to,
      terrain: v.terrain,
      breaks: v.breaks,
      resupply: v.resupply,
      warnings: v.warnings.split("\n").map((s) => s.trim()).filter(Boolean),
      notes: v.notes,
      walkingHoursOverride: v.hrs,
    };
    // Only re-label figures the user actually changed, so official data keeps its source.
    const km = v.dist == null ? null : imperial ? v.dist * 1.609344 : v.dist;
    const up = v.up == null ? null : imperial ? v.up * 0.3048 : v.up;
    const down = v.down == null ? null : imperial ? v.down * 0.3048 : v.down;
    if (v.dist !== toDisp(day.distanceKm.value)) patch.distanceKm = km == null ? null : +km.toFixed(2);
    if (v.up !== toDispE(day.ascentM.value)) patch.ascentM = up == null ? null : Math.round(up);
    if (v.down !== toDispE(day.descentM.value)) patch.descentM = down == null ? null : Math.round(down);
    if (v.overnight !== (day.overnight ?? "")) patch.overnight = v.overnight;
    if (v.water !== (day.water ?? "")) patch.water = v.water;
    const r = onSave(patch) as { ok: boolean } | null;
    if (r?.ok) onClose();
  };
  return (
    <Modal title={`Edit day ${day.dayNumber}`} onClose={onClose} wide>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid grid-3">
          <label className="field">
            From
            <input className="input" value={v.from} onChange={(e) => set({ from: e.target.value })} />
          </label>
          <label className="field">
            To
            <input className="input" value={v.to} onChange={(e) => set({ to: e.target.value })} />
          </label>
          <label className="field">
            Title (optional)
            <input className="input" value={v.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <NumField label={`Distance (${imperial ? "mi" : "km"})`} value={v.dist} onChange={(x) => set({ dist: x })} max={imperial ? 125 : 200} />
          <NumField label={`Elevation gain (${imperial ? "ft" : "m"})`} value={v.up} onChange={(x) => set({ up: x })} max={imperial ? 29500 : 9000} />
          <NumField label={`Elevation loss (${imperial ? "ft" : "m"})`} value={v.down} onChange={(x) => set({ down: x })} max={imperial ? 29500 : 9000} />
          <NumField label="Walking hours (leave blank to estimate)" value={v.hrs} onChange={(x) => set({ hrs: x })} max={24} />
          <label className="field">
            Overnight (campsite, hut or accommodation)
            <input className="input" value={v.overnight} onChange={(e) => set({ overnight: e.target.value })} />
          </label>
          <label className="field">
            Food & resupply
            <input className="input" value={v.resupply} onChange={(e) => set({ resupply: e.target.value })} />
          </label>
        </div>
        <label className="field">
          Terrain
          <input className="input" value={v.terrain} onChange={(e) => set({ terrain: e.target.value })} />
        </label>
        <label className="field">
          Suggested breaks
          <input className="input" value={v.breaks} onChange={(e) => set({ breaks: e.target.value })} />
        </label>
        <label className="field">
          Water sources
          <input className="input" value={v.water} onChange={(e) => set({ water: e.target.value })} placeholder="Where you can refill, and how reliable it is" />
        </label>
        <label className="field">
          Warnings (one per line)
          <textarea className="input" rows={2} value={v.warnings} onChange={(e) => set({ warnings: e.target.value })} />
        </label>
        <label className="field">
          Notes
          <textarea className="input" rows={3} value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
        <p className="tiny muted" style={{ margin: 0 }}>
          Anything you change here is labelled as your input. Unchanged figures keep their original source.
        </p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" type="submit">
            Save day
          </button>
        </div>
      </form>
    </Modal>
  );
}
