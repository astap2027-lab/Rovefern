import { useMemo, useState } from "react";
import { BUDGET_CATEGORY_LABELS, GEAR_CATEGORY_LABELS } from "../../lib/domain/types";
import { authoritiesFor } from "../../lib/domain/authorities";
import { deriveTrip } from "../../lib/engine/derive";
import { MEAL_SLOTS } from "../../lib/engine/food";
import { dateForDay, dayWalkingHours } from "../../lib/engine/time";
import { formatHours } from "../../lib/engine/units";
import { BRAND } from "../brand";
import { Icon } from "../components/icons";
import { Empty, PROV_LABEL, useFormat } from "../components/ui";
import { downloadText, slug } from "../lib/gpx";
import { useStore, toast } from "../lib/store";
import { Link, useTitle } from "../router";
import { exportTripJson } from "../pages/Adventures";

type Section = "itinerary" | "gear" | "packing" | "food" | "budget" | "safety";
const SECTIONS: [Section, string][] = [
  ["itinerary", "Itinerary"],
  ["gear", "Gear & weights"],
  ["packing", "Packing checklist"],
  ["food", "Food & water"],
  ["budget", "Budget"],
  ["safety", "Safety & emergency"],
];

export function PrintTrip({ id }: { id: string }) {
  const trip = useStore((s) => s.trips.find((t) => t.id === id));
  const gear = useStore((s) => s.gear);
  const settings = useStore((s) => s.settings);
  const f = useFormat();
  useTitle(trip ? `${trip.title} — trip pack` : "Trip pack");
  const [detail, setDetail] = useState<"summary" | "full">("full");
  const [on, setOn] = useState<Record<Section, boolean>>({ itinerary: true, gear: true, packing: true, food: true, budget: true, safety: true });
  const d = useMemo(() => (trip ? deriveTrip(trip, gear, { pace: settings.pace }) : null), [trip, gear, settings.pace]);
  if (!trip || !d) return <div className="wrap page"><Empty title="Trip not found" action={<Link to="/adventures" className="btn">My adventures</Link>} /></div>;
  const lib = new Map(gear.map((g) => [g.id, g]));
  const auth = authoritiesFor(trip.destination.country, trip.destination.region, trip.destination.name);
  const full = detail === "full";

  const saveOffline = async () => {
    try {
      const css = await fetch("/styles.css").then((r) => r.text());
      const doc = document.querySelector(".print-doc")!.outerHTML;
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${trip.title} — trip pack</title><style>${css}</style></head><body>${doc}</body></html>`;
      downloadText(`${slug(trip.title)}-trip-pack.html`, html, "text/html");
      toast("Saved. Open the file on your phone to read it without a connection.");
    } catch {
      toast("Couldn't build the offline copy. Try Print instead.", { tone: "error" });
    }
  };

  return (
    <div style={{ background: "var(--paper)", minHeight: "100vh", paddingBottom: 40 }}>
      <div className="wrap no-print" style={{ padding: "20px var(--gutter)" }}>
        <Link to={`/trip/${trip.id}`} className="small row" style={{ gap: 4, textDecoration: "none" }}>
          <Icon name="arrowLeft" size={16} /> Back to trip
        </Link>
        <div className="card" style={{ marginTop: 12 }}>
          <h1 style={{ fontSize: "1.8rem" }}>Export trip pack</h1>
          <div className="row" style={{ gap: 20 }}>
            <div className="seg" role="group" aria-label="Detail level">
              <button aria-pressed={detail === "summary"} onClick={() => setDetail("summary")}>
                Summary
              </button>
              <button aria-pressed={detail === "full"} onClick={() => setDetail("full")}>
                Full detail
              </button>
            </div>
            {SECTIONS.map(([k, l]) => (
              <label key={k} className="check small">
                <input type="checkbox" checked={on[k]} onChange={(e) => setOn((o) => ({ ...o, [k]: e.target.checked }))} /> {l}
              </label>
            ))}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => window.print()}>
              <Icon name="print" size={18} /> Print or save as PDF
            </button>
            <button className="btn secondary" onClick={saveOffline}>
              <Icon name="download" size={18} /> Save offline copy
            </button>
            <button className="btn ghost" onClick={() => exportTripJson(trip)}>
              Download data (JSON)
            </button>
          </div>
          <p className="tiny muted" style={{ margin: "10px 0 0" }}>
            The offline copy is a single file with the details below. It doesn't include maps or live updates — carry proper offline navigation as well.
          </p>
        </div>
      </div>

      <article className="print-doc">
        <header>
          <div className="small muted">
            {BRAND.name} trip pack · printed {new Date().toLocaleDateString(settings.locale)}
          </div>
          <h1>{trip.title}</h1>
          <p>
            {[trip.destination.name, trip.destination.region, trip.destination.country].filter(Boolean).join(", ")}
            <br />
            {trip.startDate ? `${f.date(trip.startDate)} – ${f.date(dateForDay(trip.startDate, trip.durationDays))}` : "Dates not set"} · {trip.durationDays} days · {trip.participants.map((p) => p.name).join(", ")}
          </p>
          <table className="table">
            <tbody>
              <tr>
                <td>Distance</td>
                <td>{f.d(d.totals.distanceKm)}{d.totals.incomplete ? " (incomplete)" : ""}</td>
                <td>Elevation gain</td>
                <td>{f.e(d.totals.ascentM)}</td>
              </tr>
              <tr>
                <td>Difficulty</td>
                <td>{trip.difficulty ?? "—"} {trip.gradingSystem ? `(${trip.gradingSystem})` : ""}</td>
                <td>Estimated cost</td>
                <td>{f.money(d.budget.estimatedTotal, trip.currency)}</td>
              </tr>
            </tbody>
          </table>
          {trip.limitations.length > 0 && (
            <>
              <h2>Limitations</h2>
              <ul>
                {trip.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </>
          )}
        </header>

        {on.itinerary && (
          <section>
            <h2>Itinerary</h2>
            {trip.days.map((day) => (
              <div key={day.id} className="day" style={{ gridTemplateColumns: "44px 1fr" }}>
                <div className="n" style={{ fontSize: "1.6rem" }}>{day.dayNumber}</div>
                <div>
                  <strong>{day.from && day.to ? `${day.from} to ${day.to}` : day.title ?? "Not planned"}</strong>
                  <div className="small">
                    {f.d(day.distanceKm.value)} ({day.distanceKm.value != null ? PROV_LABEL[day.distanceKm.provenance.kind] : "unknown"}) · ↑ {f.e(day.ascentM.value)} ↓ {f.e(day.descentM.value)} · ~{formatHours(dayWalkingHours(day, settings.pace))}
                    {trip.startDate ? ` · ${f.date(dateForDay(trip.startDate, day.dayNumber), { weekday: "short", day: "numeric", month: "short" })}` : ""}
                  </div>
                  {full && (
                    <div className="small" style={{ marginTop: 4 }}>
                      {day.overnight && <div>Overnight: {day.overnight}</div>}
                      <div>Water: {day.water ?? "No confirmed sources — carry enough"}{day.water && day.waterProvenance?.kind !== "official" ? " (unconfirmed)" : ""}</div>
                      {day.terrain && <div>Terrain: {day.terrain}</div>}
                      {day.warnings?.map((w) => <div key={w}>⚠ {w}</div>)}
                      {day.notes && <div>{day.notes}</div>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {on.gear && (
          <section>
            <h2>Pack weights</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th className="r">Base</th>
                  <th className="r">Carried at start</th>
                  <th className="r">At end</th>
                  <th className="r">Worn</th>
                </tr>
              </thead>
              <tbody>
                {d.weights.people.map((p) => (
                  <tr key={p.participantId}>
                    <td>{p.name}</td>
                    <td className="r">{f.w(p.baseGrams)}</td>
                    <td className="r">{f.w(p.totalCarriedStartGrams)}</td>
                    <td className="r">{f.w(p.totalCarriedEndGrams)}</td>
                    <td className="r">{f.w(p.wornGrams)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {full && (
              <>
                <h2>Gear list</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Category</th>
                      <th>Carried by</th>
                      <th className="r">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trip.gear.map((e) => {
                      const g = lib.get(e.gearId);
                      if (!g) return null;
                      return (
                        <tr key={e.id}>
                          <td>
                            {g.name}
                            {e.quantity > 1 ? ` × ${e.quantity}` : ""}
                            {!g.owned ? " (to get)" : ""}
                          </td>
                          <td>{GEAR_CATEGORY_LABELS[g.category]}</td>
                          <td>{e.scope === "each" ? "Everyone" : trip.participants.find((p) => p.id === e.carrierId)?.name}</td>
                          <td className="r">{f.w(g.weightGrams == null ? null : g.weightGrams * e.quantity)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </section>
        )}

        {on.packing && (
          <section>
            <h2>Packing checklist</h2>
            {d.layouts.map(({ participantId, layout }) => (
              <div key={participantId}>
                {trip.participants.length > 1 && <h3>{trip.participants.find((p) => p.id === participantId)?.name}</h3>}
                {layout.zones
                  .filter((z) => z.items.length)
                  .map((z) => (
                    <p key={z.zone} className="small" style={{ margin: "0 0 6px" }}>
                      <strong>{z.zone === "core" ? "Middle" : z.zone[0].toUpperCase() + z.zone.slice(1)}:</strong> {z.items.map((i) => `☐ ${i.name}`).join("   ")}
                    </p>
                  ))}
              </div>
            ))}
          </section>
        )}

        {on.food && (
          <section>
            <h2>Food & water</h2>
            <p className="small">
              {f.w(d.food.totalFoodGrams)} of food in total ({f.w(d.food.foodGramsPerPersonPerDay)} per person per day). About {f.w(d.food.fuelGrams)} of fuel. Water while walking on the longest day: {f.v(d.water.walkingRangeLPerPerson[0])}–{f.v(d.water.walkingRangeLPerPerson[1])} per person.
            </p>
            {full && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Day</th>
                    {MEAL_SLOTS.map((s) => (
                      <th key={s}>{s[0].toUpperCase() + s.slice(1)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: d.food.daysFed }, (_, i) => i + 1).map((n) => (
                    <tr key={n}>
                      <td>{d.food.meals.find((m) => m.dayNumber === n)?.isSpare ? "Spare" : n}</td>
                      {d.food.meals.filter((m) => m.dayNumber === n).map((m) => (
                        <td key={m.slot} className="small">{m.meal?.name ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="small">Treat all natural water unless an official source says it's safe.</p>
          </section>
        )}

        {on.budget && (
          <section>
            <h2>Budget</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="r">Estimate</th>
                  <th className="r">Actual</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {trip.budget.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.label} <span className="muted">({BUDGET_CATEGORY_LABELS[l.category]}{l.basis === "per_person" ? ", per person" : ""})</span>
                    </td>
                    <td className="r">{f.money(l.estimate, l.currency)}</td>
                    <td className="r">{f.money(l.actual, l.currency)}</td>
                    <td>{PROV_LABEL[l.provenance.kind]}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="r">{f.money(d.budget.estimatedTotal, trip.currency)}</td>
                  <td className="r">{f.money(d.budget.actualTotal, trip.currency)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {on.safety && (
          <section>
            <h2>Safety & emergency</h2>
            <p>
              <strong>Emergency number:</strong> {auth.emergency}
            </p>
            {(trip.emergency?.contactName || trip.emergency?.checkInBy) && (
              <p>
                <strong>Trip contact:</strong> {trip.emergency?.contactName} {trip.emergency?.contactPhone}
                <br />
                <strong>Raise the alarm if no contact by:</strong> {trip.emergency?.checkInBy ?? "—"}
                {trip.emergency?.notes && (
                  <>
                    <br />
                    {trip.emergency.notes}
                  </>
                )}
              </p>
            )}
            <ul className="small">
              {trip.checklist
                .filter((c) => c.group === "safety" || c.group === "permits")
                .map((c) => (
                  <li key={c.id}>
                    {c.done ? "☑" : "☐"} {c.label}
                  </li>
                ))}
            </ul>
            <p className="small">
              Official sources: {[...auth.regional, ...auth.parks, auth.weather].map((s) => `${s.name} (${s.url})`).join("; ")}
            </p>
            <p className="tiny muted">This document is a planning aid. It is not a substitute for official park, weather and navigation information, and it may be out of date.</p>
          </section>
        )}
      </article>
    </div>
  );
}
