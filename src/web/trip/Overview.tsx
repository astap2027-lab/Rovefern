import { useEffect, useState } from "react";
import type { TripStatus } from "../../lib/domain/types";
import { findTrail } from "../../lib/domain/trails";
import { addDaysISO, daysUntil } from "../../lib/engine/time";
import { Icon } from "../components/icons";
import { Meter, Notice, NumField, Stat, Term, useFormat } from "../components/ui";
import { Link } from "../router";
import { STATUS_LABEL } from "../pages/Adventures";
import { useTripActions, type TabProps } from "./TripPage";
import { WeatherCard } from "./WeatherCard";

export function Overview({ trip, d }: TabProps) {
  const f = useFormat();
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (location.hash === "#edit") setEditing(true);
  }, []);
  const trail = findTrail(trip.destination.trailId);
  const pack = d.weights.people;
  const avgCarry = pack.length ? pack.reduce((s, p) => s + p.totalCarriedStartGrams, 0) / pack.length : 0;
  const until = trip.startDate ? daysUntil(trip.startDate, new Date(), trip.destination.timezone) : null;
  const unknownWeights = [...new Set(pack.flatMap((p) => p.unknownWeightItems))];
  const toGet = d.weights.people.flatMap((p) => p.items).length;

  return (
    <div className="stack-lg">
      {trip.limitations.length > 0 && (
        <Notice tone="warn">
          <strong>Limitations of this plan</strong>
          <ul>
            {trip.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="stats">
        <Stat k="Dates" v={trip.startDate ? f.date(trip.startDate, { day: "numeric", month: "short" }) : "Not set"} sub={trip.startDate ? `to ${f.date(addDaysISO(trip.startDate, trip.durationDays - 1), { day: "numeric", month: "short", year: "numeric" })}${until != null && until > 0 ? ` · in ${until} days` : ""}` : "Add a start date for weather"} />
        <Stat k="Duration" v={`${trip.durationDays} ${trip.durationDays === 1 ? "day" : "days"}`} sub={`${trip.participants.length} ${trip.participants.length === 1 ? "person" : "people"}`} />
        <Stat k="Difficulty" term="Trail difficulty" v={<span style={{ fontSize: "1.15rem" }}>{trip.difficulty ?? "Not graded"}</span>} sub={trip.gradingSystem} />
        <Stat k="Distance" v={f.d(d.totals.distanceKm)} sub={d.totals.incomplete ? "Some days missing" : d.totals.containsEstimates ? "Includes estimates" : "Total"} />
        <Stat k="Elevation gain" term="Elevation gain" v={f.e(d.totals.ascentM)} sub={d.totals.ascentM == null ? "No reliable data" : d.totals.containsEstimates ? "Includes estimates" : undefined} />
        <Stat k="Estimated cost" v={d.budget.estimatedTotal ? f.money(d.budget.estimatedTotal, trip.currency) : "—"} sub={!trip.budget.length ? "No costs added yet" : d.budget.budgetMaxGroup != null ? (d.budget.overBudget ? "Over budget" : `${f.money(d.budget.remainingAgainstEstimate, trip.currency)} under budget`) : `${f.money(d.budget.estimatedPerPerson, trip.currency)} per person`} />
        <Stat k="Pack weight" term="Total carried" v={avgCarry ? f.w(avgCarry) : "—"} sub={avgCarry ? (trip.participants.length > 1 ? "Average carried at the start" : "Carried at the start") : "Add gear"} />
        <div className="stat">
          <div className="k">Preparation</div>
          <div className="v">{d.preparationPercent}%</div>
          <Meter value={d.preparationPercent} max={100} />
        </div>
      </div>

      {trip.summary && (
        <section>
          <h2>About this trip</h2>
          <p style={{ maxWidth: "70ch" }}>{trip.summary}</p>
          {trail && (
            <p>
              Built on the <Link to={`/explore/${trail.id}`}>{trail.name}</Link> trail page, with details from its official sources.
            </p>
          )}
        </section>
      )}

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <section className="card">
          <div className="card-head">
            <h3>Next steps</h3>
          </div>
          <ul className="zone-items">
            {[
              [!trip.startDate, "Set your start date to see the weather", "overview#edit"],
              [trip.days.some((x) => !x.from || !x.to), "Fill in the day-by-day route", "itinerary"],
              [trip.gear.length === 0, "Add gear from your library", "gear"],
              [unknownWeights.length > 0, `Add weights for ${unknownWeights.length} ${unknownWeights.length === 1 ? "item" : "items"}`, "gear"],
              [d.packing.total > 0 && d.packing.percent < 100, `Pack your bag (${d.packing.packed}/${d.packing.total} packed)`, "packing"],
              [trip.budget.length === 0, "Set up the budget", "budget"],
              [d.checklistDone < d.checklistTotal, `Work through the preparation checklist (${d.checklistDone}/${d.checklistTotal})`, "prep"],
            ]
              .filter(([show]) => show)
              .slice(0, 5)
              .map(([, label, tab]) => (
                <li key={label as string}>
                  <Icon name="flag" size={16} />
                  <Link
                    to={`/trip/${trip.id}/${tab}`}
                    onClick={() => {
                      if ((tab as string).endsWith("#edit")) setEditing(true);
                    }}
                  >
                    {label as string}
                  </Link>
                </li>
              ))}
            {toGet === 0 && trip.gear.length === 0 ? null : null}
          </ul>
        </section>
        <WeatherCard trip={trip} />
      </div>

      <section className="card" id="edit">
        <div className="card-head">
          <h3>Trip details</h3>
          {!editing && (
            <button className="btn secondary sm" onClick={() => setEditing(true)}>
              <Icon name="edit" size={16} /> Edit
            </button>
          )}
        </div>
        {editing ? <DetailsForm {...{ trip, d }} onDone={() => setEditing(false)} /> : (
          <dl className="kv">
            <dt>Destination</dt>
            <dd>{[trip.destination.name, trip.destination.region, trip.destination.country].filter(Boolean).join(", ") || "—"}</dd>
            <dt>Status</dt>
            <dd>{STATUS_LABEL[trip.status]}</dd>
            <dt>Group</dt>
            <dd>{trip.participants.map((p) => p.name).join(", ")}</dd>
            <dt>Budget</dt>
            <dd>{trip.budgetMax != null ? `${f.money(trip.budgetMax, trip.currency)} ${trip.budgetBasis === "per_person" ? "per person" : "for the group"}` : "No limit set"}</dd>
            <dt>Coordinates</dt>
            <dd>{trip.destination.lat != null ? `${trip.destination.lat.toFixed(3)}, ${trip.destination.lon?.toFixed(3)}` : "Not set (needed for weather)"}</dd>
          </dl>
        )}
      </section>
      <p className="tiny muted">
        <Term name="Walking time">Walking times</Term> use Naismith's rule at your {f.settings.pace} pace (change it in Settings).
      </p>
    </div>
  );
}

function DetailsForm({ trip, onDone }: Pick<TabProps, "trip" | "d"> & { onDone: () => void }) {
  const a = useTripActions(trip);
  const [title, setTitle] = useState(trip.title);
  const [dest, setDest] = useState(trip.destination.name);
  const [country, setCountry] = useState(trip.destination.country ?? "");
  const [region, setRegion] = useState(trip.destination.region ?? "");
  const [lat, setLat] = useState<number | null>(trip.destination.lat ?? null);
  const [lon, setLon] = useState<number | null>(trip.destination.lon ?? null);
  const [start, setStart] = useState(trip.startDate ?? "");
  const [days, setDays] = useState<number | null>(trip.durationDays);
  const [status, setStatus] = useState<TripStatus>(trip.status);
  const [difficulty, setDifficulty] = useState(trip.difficulty ?? "");
  const [grading, setGrading] = useState(trip.gradingSystem ?? "");
  const [budget, setBudget] = useState<number | null>(trip.budgetMax ?? null);
  const [basis, setBasis] = useState(trip.budgetBasis);
  const [currency, setCurrency] = useState(trip.currency);
  const [names, setNames] = useState(trip.participants.map((p) => ({ ...p })));
  const [newName, setNewName] = useState("");
  const [confirmShrink, setConfirmShrink] = useState(false);

  const save = () => {
    const ops: Parameters<typeof a.ops>[0] = [
      { op: "set_title", title },
      { op: "set_destination", name: dest || trip.destination.name || title, country: country || undefined, region: region || undefined, lat: lat ?? undefined, lon: lon ?? undefined },
      { op: "set_dates", startDate: start || null },
      { op: "set_status", status },
      { op: "set_budget", max: budget, basis, currency: currency.toUpperCase() },
    ];
    if (difficulty) ops.push({ op: "set_difficulty", difficulty, gradingSystem: grading });
    for (const p of names) {
      const orig = trip.participants.find((x) => x.id === p.id);
      if (orig && orig.name !== p.name && p.name.trim()) ops.push({ op: "rename_participant", participantId: p.id, name: p.name });
    }
    for (const orig of trip.participants) if (!names.some((n) => n.id === orig.id)) ops.push({ op: "remove_participant", participantId: orig.id });
    if (days && days !== trip.durationDays) ops.push({ op: "set_duration", days, overrideUserEdits: confirmShrink });
    const r = a.ops(ops, "edit trip details");
    if (r?.ok) onDone();
    else if (r?.errors.some((e) => e.includes("Confirm"))) setConfirmShrink(true);
  };

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid grid-3">
        <label className="field">
          Trip name
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="field">
          Destination or route
          <input className="input" value={dest} onChange={(e) => setDest(e.target.value)} />
        </label>
        <label className="field">
          Region
          <input className="input" value={region} onChange={(e) => setRegion(e.target.value)} />
        </label>
        <label className="field">
          Country
          <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} />
        </label>
        <NumField label="Latitude" value={lat} onChange={setLat} min={-90} max={90} />
        <NumField label="Longitude" value={lon} onChange={setLon} min={-180} max={180} />
        <label className="field">
          Start date
          <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <NumField label="Days" value={days} onChange={setDays} min={1} max={60} step={1} />
        <label className="field">
          Status
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as TripStatus)}>
            {(Object.keys(STATUS_LABEL) as TripStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Difficulty (local grade)
          <input className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} placeholder="e.g. Grade 4, T3, Hard" />
        </label>
        <label className="field">
          Grading system
          <input className="input" value={grading} onChange={(e) => setGrading(e.target.value)} placeholder="e.g. AS 2156.1 (Australia)" />
        </label>
        <NumField label="Maximum budget" value={budget} onChange={setBudget} min={0} max={10_000_000} />
        <label className="field">
          Budget applies to
          <select className="input" value={basis} onChange={(e) => setBasis(e.target.value as typeof basis)}>
            <option value="per_person">Each person</option>
            <option value="group">The whole group</option>
          </select>
        </label>
        <label className="field">
          Currency
          <input className="input" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} pattern="[A-Za-z]{3}" title="Three-letter currency code, e.g. AUD" />
        </label>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--ink-2)", marginBottom: 6 }}>Group</legend>
        <div className="stack">
          {names.map((p, i) => (
            <div className="row" key={p.id} style={{ flexWrap: "nowrap" }}>
              <input className="input" aria-label={`Name of person ${i + 1}`} value={p.name} onChange={(e) => setNames((n) => n.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))} />
              <button type="button" className="btn danger sm" disabled={names.length === 1} onClick={() => setNames((n) => n.filter((x) => x.id !== p.id))}>
                Remove
              </button>
            </div>
          ))}
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input className="input" placeholder="Add a person" aria-label="New person's name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button
              type="button"
              className="btn secondary sm"
              onClick={() => {
                const r = a.ops([{ op: "add_participant", name: newName || `Hiker ${trip.participants.length + 1}` }], "add person");
                if (r?.ok) {
                  setNames(r.trip.participants.map((p) => ({ ...p })));
                  setNewName("");
                }
              }}
            >
              Add
            </button>
          </div>
        </div>
      </fieldset>
      {confirmShrink && (
        <Notice tone="warn">
          Shortening the trip will remove days you've edited yourself. Save again to confirm.
        </Notice>
      )}
      <div className="row">
        <button className="btn" type="submit">
          Save details
        </button>
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
