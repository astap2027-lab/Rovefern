import { useState } from "react";
import type { ChecklistItem } from "../../lib/domain/types";
import { authoritiesFor } from "../../lib/domain/authorities";
import { findTrail } from "../../lib/domain/trails";
import { uid } from "../../lib/engine/factory";
import { Icon } from "../components/icons";
import { Meter, Notice, Term } from "../components/ui";
import { toast } from "../lib/store";
import { useTripActions, type TabProps } from "./TripPage";

const GROUPS: { k: ChecklistItem["group"]; label: string }[] = [
  { k: "safety", label: "Safety" },
  { k: "permits", label: "Permits & bookings" },
  { k: "transport", label: "Transport" },
  { k: "gear", label: "Gear & clothing" },
  { k: "food", label: "Food & water" },
  { k: "admin", label: "Before you leave" },
];

export function Prep({ trip, d }: TabProps) {
  const a = useTripActions(trip);
  const [newLabel, setNewLabel] = useState("");
  const [newGroup, setNewGroup] = useState<ChecklistItem["group"]>("admin");
  const auth = authoritiesFor(trip.destination.country, trip.destination.region, trip.destination.name);
  const trail = findTrail(trip.destination.trailId);
  const em = trip.emergency ?? {};
  const setEm = (p: Partial<NonNullable<typeof trip.emergency>>) => a.patch((t) => ({ ...t, emergency: { ...t.emergency, ...p } }));

  const toggle = (id: string, done: boolean) => a.ops([{ op: "set_checklist_done", itemId: id, done }]);

  return (
    <div className="stack-lg">
      <div className="card flat">
        <div className="row between small">
          <strong>
            {d.checklistDone} of {d.checklistTotal} done
          </strong>
          <span className="muted">Overall preparation {d.preparationPercent}% (checklist and packing)</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <Meter value={d.checklistDone} max={d.checklistTotal} />
        </div>
      </div>

      <Notice tone="warn">
        <strong>Rovefern isn't an emergency service.</strong> It doesn't monitor your trip or raise the alarm. In an emergency call {auth.emergency}. Check official alerts and weather right before you leave — no alerts showing here doesn't mean a trail is safe or open.
      </Notice>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack-lg">
          {GROUPS.map(({ k, label }) => {
            const items = trip.checklist.filter((c) => c.group === k);
            if (!items.length) return null;
            return (
              <section key={k}>
                <h3>{label}</h3>
                <ul className="zone-items">
                  {items.map((c) => (
                    <li key={c.id} className={c.done ? "packed" : ""}>
                      <label className="check" style={{ flex: 1, alignItems: "flex-start" }}>
                        <input type="checkbox" checked={c.done} onChange={(e) => toggle(c.id, e.target.checked)} style={{ marginTop: 2 }} />
                        <span>
                          <span className="nm">{c.label}</span>
                          {c.detail && (
                            <span className="tiny muted" style={{ display: "block" }}>
                              {/^https?:\/\//.test(c.detail) ? (
                                <a href={c.detail} target="_blank" rel="noreferrer">
                                  {c.detail}
                                </a>
                              ) : (
                                c.detail
                              )}
                            </span>
                          )}
                        </span>
                      </label>
                      <button
                        className="icon-btn"
                        aria-label={`Remove “${c.label}”`}
                        onClick={() => {
                          a.patch((t) => ({ ...t, checklist: t.checklist.filter((x) => x.id !== c.id) }), "remove checklist item");
                          toast("Removed from checklist", { undo: true });
                        }}
                      >
                        <Icon name="x" size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          <form
            className="row"
            style={{ flexWrap: "nowrap" }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!newLabel.trim()) return;
              a.patch((t) => ({ ...t, checklist: [...t.checklist, { id: uid(), group: newGroup, label: newLabel.trim(), done: false }] }));
              setNewLabel("");
            }}
          >
            <select className="input" style={{ width: "auto" }} aria-label="Section" value={newGroup} onChange={(e) => setNewGroup(e.target.value as ChecklistItem["group"])}>
              {GROUPS.map((g) => (
                <option key={g.k} value={g.k}>
                  {g.label}
                </option>
              ))}
            </select>
            <input className="input" placeholder="Add a task" aria-label="New task" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            <button className="btn" type="submit" disabled={!newLabel.trim()}>
              Add
            </button>
          </form>
        </div>

        <div className="stack-lg">
          <section className="card">
            <h3>Official information to check</h3>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {trail?.sources
                .filter((s) => s.kind === "official")
                .map((s) => (
                  <li key={s.url} style={{ marginBottom: 6 }}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.name}
                    </a>
                  </li>
                ))}
              {[...auth.regional, ...auth.parks].map((s) => (
                <li key={s.url} style={{ marginBottom: 6 }}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.name}
                  </a>
                  <div className="tiny muted">{s.covers}</div>
                </li>
              ))}
              <li style={{ marginBottom: 6 }}>
                <a href={auth.weather.url} target="_blank" rel="noreferrer">
                  {auth.weather.name}
                </a>
                <div className="tiny muted">{auth.weather.covers}</div>
              </li>
              {auth.fire && (
                <li style={{ marginBottom: 6 }}>
                  <a href={auth.fire.url} target="_blank" rel="noreferrer">
                    {auth.fire.name}
                  </a>
                  <div className="tiny muted">{auth.fire.covers}</div>
                </li>
              )}
            </ul>
            {!trip.destination.country && <p className="small muted">Add the destination country in trip details to see the right authorities.</p>}
            <p className="tiny muted" style={{ marginBottom: 0 }}>
              Rovefern links to these sources instead of showing live alerts, because no single source covers every park. {auth.notes ?? ""}
            </p>
            {trip.gradingSystem && (
              <p className="tiny muted" style={{ marginBottom: 0 }}>
                <Term name="Trail difficulty">Difficulty</Term> on this trip uses the {trip.gradingSystem}.
              </p>
            )}
          </section>

          <section className="card">
            <h3>Trip intentions</h3>
            <p className="small muted" style={{ marginTop: 0 }}>
              Leave your plan with someone you trust, and agree when they should raise the alarm if they haven't heard from you. The printed trip pack includes these details.
            </p>
            <div className="stack">
              <label className="field">
                Emergency contact
                <input className="input" defaultValue={em.contactName ?? ""} onBlur={(e) => setEm({ contactName: e.target.value })} />
              </label>
              <label className="field">
                Their phone number
                <input className="input" type="tel" defaultValue={em.contactPhone ?? ""} onBlur={(e) => setEm({ contactPhone: e.target.value })} />
              </label>
              <label className="field">
                Raise the alarm if no contact by
                <input className="input" placeholder="e.g. 8 pm Sunday 17 January" defaultValue={em.checkInBy ?? ""} onBlur={(e) => setEm({ checkInBy: e.target.value })} />
              </label>
              <label className="field">
                Notes for them
                <textarea className="input" rows={3} placeholder="Car rego and where it's parked, medical conditions, what emergency gear you carry" defaultValue={em.notes ?? ""} onBlur={(e) => setEm({ notes: e.target.value })} />
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
