import { useMemo, useState } from "react";
import type { Optimise } from "../../server/schemas";
import { GEAR_CATEGORY_LABELS, type GearItem, type TripGearEntry } from "../../lib/domain/types";
import { baseWeightBand } from "../../lib/engine/weight";
import { prov, uid } from "../../lib/engine/factory";
import { Icon } from "../components/icons";
import { Empty, Modal, Notice, ProvBadge, Spinner, Term, useFormat } from "../components/ui";
import { WeightBreakdown } from "../components/WeightBreakdown";
import { api } from "../lib/api";
import { newGearItem } from "../lib/buildTrip";
import { actions, toast, useStore } from "../lib/store";
import { AiGearAdd, GearForm } from "../pages/Gear";
import { Link } from "../router";
import { useTripActions, type TabProps } from "./TripPage";

const SAFETY_CATS = new Set(["first_aid", "safety", "navigation"]);

export function GearTab({ trip, d, gear }: TabProps) {
  const f = useFormat();
  const a = useTripActions(trip);
  const showAllUp = useStore((s) => s.settings.showAllUp);
  const lib = useMemo(() => new Map(gear.map((g) => [g.id, g])), [gear]);
  const [picker, setPicker] = useState(false);
  const [newItem, setNewItem] = useState(false);
  const [aiAdd, setAiAdd] = useState(false);
  const [editItem, setEditItem] = useState<GearItem | null>(null);
  const multi = trip.participants.length > 1;

  const addToTrip = (items: GearItem[]) => {
    const r = a.ops(items.map((g) => ({ op: "add_library_gear_to_trip" as const, gearId: g.id })), "add gear");
    if (r?.ok) toast(`Added ${items.length} ${items.length === 1 ? "item" : "items"} to the trip`);
  };

  return (
    <div className="stack-lg">
      <section>
        <div className="row between">
          <h2 style={{ margin: 0 }}>Pack weight</h2>
          <label className="check small">
            <input type="checkbox" checked={showAllUp} onChange={(e) => actions.updateSettings({ showAllUp: e.target.checked })} /> Show <Term name="All-up weight">all-up weight</Term>
          </label>
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>{multi ? "Person" : ""}</th>
                <th className="r">
                  <Term name="Base weight" />
                </th>
                <th className="r">
                  <Term name="Consumables" /> at start
                </th>
                <th className="r">
                  <Term name="Total carried">Carried at start</Term>
                </th>
                <th className="r">Carried at end</th>
                <th className="r">
                  <Term name="Worn weight">Worn</Term>
                </th>
                {showAllUp && <th className="r">All-up</th>}
              </tr>
            </thead>
            <tbody>
              {d.weights.people.map((p) => (
                <tr key={p.participantId}>
                  <td>{multi ? p.name : "You"}</td>
                  <td className="r">{f.w(p.baseGrams)}</td>
                  <td className="r">
                    {f.w(p.consumableStartGrams)}
                    <div className="tiny muted">
                      food {f.w(p.foodStartGrams)} · water {f.w(p.waterStartGrams)}
                      {p.fuelStartGrams ? ` · fuel ${f.w(p.fuelStartGrams)}` : ""}
                    </div>
                  </td>
                  <td className="r" style={{ fontWeight: 700 }}>{f.w(p.totalCarriedStartGrams)}</td>
                  <td className="r">{f.w(p.totalCarriedEndGrams)}</td>
                  <td className="r">{f.w(p.wornGrams)}</td>
                  {showAllUp && <td className="r">{f.w(p.allUpStartGrams)}</td>}
                </tr>
              ))}
            </tbody>
            {multi && (
              <tfoot>
                <tr>
                  <td>Group</td>
                  <td className="r">{f.w(d.weights.groupBaseGrams)}</td>
                  <td />
                  <td className="r">{f.w(d.weights.groupTotalCarriedStartGrams)}</td>
                  <td colSpan={showAllUp ? 3 : 2} className="small muted">
                    Shared gear: {f.w(d.weights.sharedGearGrams)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="tiny muted">
          Food and fuel come from the food plan. Water: {d.waterAssumption} The end weight assumes food is eaten (except the spare day), fuel is used and you're carrying a 0.5 L reserve.
        </p>
        {d.weights.people[0]?.baseGrams > 0 && d.weights.people[0].unknownWeightItems.length === 0 && (
          <p className="small">
            Your base weight puts you in the <strong>{baseWeightBand(d.weights.people[0].baseGrams).label.toLowerCase()}</strong> range ({baseWeightBand(d.weights.people[0].baseGrams).description.toLowerCase()}) — a common way hikers compare kit, not a target you have to hit.
          </p>
        )}
        {multi && d.weights.imbalanceGrams > 2000 && (
          <Notice tone="info">
            Carried weights differ by {f.w(d.weights.imbalanceGrams)} across the group. Reassign shared items below to even things out.
          </Notice>
        )}
        {d.weights.people.some((p) => p.unknownWeightItems.length) && (
          <Notice tone="warn">
            These items have no weight, so they aren't in the totals: {[...new Set(d.weights.people.flatMap((p) => p.unknownWeightItems))].join(", ")}.
          </Notice>
        )}
      </section>

      <section>
        <div className="row between">
          <h2 style={{ margin: 0 }}>Gear for this trip</h2>
          <div className="row">
            <button className="btn secondary sm" onClick={() => setAiAdd(true)}>
              <Icon name="spark" size={16} /> Describe gear
            </button>
            <button className="btn secondary sm" onClick={() => setNewItem(true)}>
              <Icon name="plus" size={16} /> New item
            </button>
            <button className="btn sm" onClick={() => setPicker(true)}>
              <Icon name="backpack" size={16} /> Add from library
            </button>
          </div>
        </div>
        {trip.gear.length === 0 ? (
          <div style={{ marginTop: 16 }}>
            <Empty title="No gear on this trip yet" action={<button className="btn" onClick={() => setPicker(true)}>Add from your library</button>}>
              Add items from <Link to="/gear">My Gear</Link>, or create new ones here. Weights and packing lists update as you go.
            </Empty>
          </div>
        ) : (
          <div className="gear-list" style={{ marginTop: 12 }}>
            {[...trip.gear]
              .sort((x, y) => (lib.get(x.gearId)?.category ?? "").localeCompare(lib.get(y.gearId)?.category ?? ""))
              .map((e) => (
                <TripGearRow key={e.id} e={e} g={lib.get(e.gearId)} trip={trip} onEdit={(g) => setEditItem(g)} />
              ))}
          </div>
        )}
      </section>

      {d.weights.people.map((p) =>
        p.baseByCategory.length ? (
          <details key={p.participantId} className="card">
            <summary style={{ cursor: "pointer", fontWeight: 650 }}>{multi && p.name !== "You" ? `${p.name}'s base weight by category` : "Your base weight by category"}</summary>
            <div style={{ marginTop: 12 }}>
              <WeightBreakdown rows={p.baseByCategory.map((c) => ({ category: c.category, grams: c.grams, percent: c.percentOfBase }))} />
            </div>
          </details>
        ) : null,
      )}

      <Optimiser {...{ trip, d, gear }} />

      {picker && <LibraryPicker trip={trip} gear={gear} onClose={() => setPicker(false)} onAdd={addToTrip} />}
      {newItem && <GearForm item={null} onClose={() => setNewItem(false)} onSaved={(g) => addToTrip([g])} />}
      {aiAdd && <AiGearAdd onClose={() => setAiAdd(false)} onAdded={addToTrip} />}
      {editItem && <GearForm item={editItem} onClose={() => setEditItem(null)} />}
    </div>
  );
}

function TripGearRow({ e, g, trip, onEdit }: { e: TripGearEntry; g?: GearItem; trip: TabProps["trip"]; onEdit: (g: GearItem) => void }) {
  const f = useFormat();
  const a = useTripActions(trip);
  if (!g) return null;
  const multi = trip.participants.length > 1;
  return (
    <div className="gear-row">
      <div>
        <div className="row" style={{ gap: 8 }}>
          <span className="name">{g.name}</span>
          {!g.owned && <span className="badge ai">To get</span>}
          {g.weightProvenance.kind !== "user" && <ProvBadge p={g.weightProvenance} compact />}
        </div>
        <div className="meta">
          <span>{GEAR_CATEGORY_LABELS[g.category]}</span>
          <span>{g.weightClass === "worn" ? "Worn" : g.weightClass === "consumable" ? "Consumable" : "Carried"}</span>
          {multi && (
            <select
              className="input sm"
              style={{ width: "auto", minHeight: 30, padding: "2px 6px" }}
              aria-label={`Who carries ${g.name}`}
              value={e.scope === "each" ? "each" : e.carrierId}
              onChange={(ev) => {
                const v = ev.target.value;
                if (v === "each") a.patch((t) => ({ ...t, gear: t.gear.map((x) => (x.id === e.id ? { ...x, scope: "each", carrierId: undefined, packedBy: [] } : x)) }), "change carrier");
                else a.ops([{ op: "assign_gear", entryId: e.id, carrierId: v }], "change carrier");
              }}
            >
              <option value="each">Everyone brings their own</option>
              {trip.participants.map((p) => (
                <option key={p.id} value={p.id}>
                  Carried by {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <span className="qty" aria-label={`Quantity of ${g.name}`}>
          <button aria-label="Fewer" onClick={() => e.quantity > 1 && a.ops([{ op: "set_trip_gear_quantity", entryId: e.id, quantity: e.quantity - 1 }])}>
            −
          </button>
          <span>{e.quantity}</span>
          <button aria-label="More" onClick={() => a.ops([{ op: "set_trip_gear_quantity", entryId: e.id, quantity: e.quantity + 1 }])}>
            +
          </button>
        </span>
        <span className="w" style={{ minWidth: 72 }}>
          {g.weightGrams == null ? <button className="badge unverified" style={{ border: 0, cursor: "pointer" }} onClick={() => onEdit(g)}>Add weight</button> : f.w(g.weightGrams * e.quantity)}
        </span>
        <button className="icon-btn" aria-label={`Edit ${g.name}`} onClick={() => onEdit(g)}>
          <Icon name="edit" size={18} />
        </button>
        <button
          className="icon-btn"
          aria-label={`Remove ${g.name} from this trip`}
          onClick={() => {
            a.ops([{ op: "remove_trip_gear", entryId: e.id }], `remove ${g.name}`);
            toast(`Removed ${g.name} from the trip`, { undo: true });
          }}
        >
          <Icon name="x" size={18} />
        </button>
      </div>
    </div>
  );
}

function LibraryPicker({ trip, gear, onClose, onAdd }: { trip: TabProps["trip"]; gear: GearItem[]; onClose: () => void; onAdd: (g: GearItem[]) => void }) {
  const f = useFormat();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const onTrip = new Set(trip.gear.map((e) => e.gearId));
  const avail = gear.filter((g) => !onTrip.has(g.id) && (!q || `${g.name} ${g.brand ?? ""} ${GEAR_CATEGORY_LABELS[g.category]}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <Modal title="Add from your library" onClose={onClose} wide>
      {gear.length === 0 ? (
        <Empty title="Your library is empty" action={<Link to="/gear" className="btn">Go to My Gear</Link>} />
      ) : (
        <div className="stack">
          <input className="input" placeholder="Search" aria-label="Search library" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ maxHeight: "50vh", overflow: "auto" }}>
            {avail.length === 0 ? (
              <p className="muted">Everything in your library is already on this trip.</p>
            ) : (
              avail.map((g) => (
                <label key={g.id} className="gear-row check" style={{ display: "grid", gridTemplateColumns: "auto 1fr auto" }}>
                  <input type="checkbox" checked={sel.has(g.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(g.id); else n.delete(g.id); return n; })} />
                  <span>
                    {g.name} <span className="small muted">· {GEAR_CATEGORY_LABELS[g.category]}</span> {!g.owned && <span className="badge ai">To get</span>}
                  </span>
                  <span className="w">{f.w(g.weightGrams)}</span>
                </label>
              ))
            )}
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button className="btn ghost sm" onClick={() => setSel(new Set(avail.map((g) => g.id)))} disabled={!avail.length}>
              Select all
            </button>
            <div className="row">
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn"
                disabled={!sel.size}
                onClick={() => {
                  onAdd(gear.filter((g) => sel.has(g.id)));
                  onClose();
                }}
              >
                Add {sel.size || ""} to trip
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

type Suggestion = Optimise["suggestions"][number] & { id: string; state: "open" | "accepted" | "rejected" };

function Optimiser({ trip, d, gear }: Pick<TabProps, "trip" | "d" | "gear">) {
  const f = useFormat();
  const a = useTripActions(trip);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [summary, setSummary] = useState("");
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const lib = new Map(gear.map((g) => [g.id, g]));

  const run = async () => {
    setBusy(true);
    setErr("");
    try {
      const snapshot = {
        destination: trip.destination,
        startDate: trip.startDate,
        durationDays: trip.durationDays,
        participants: trip.participants.length,
        expectedMaxTempC: trip.water.expectedMaxTempC,
        experience: trip.requirements.experience,
        overnights: trip.days.map((x) => x.overnight).filter(Boolean),
        packs: d.weights.people.map((p) => ({ name: p.name, baseGrams: p.baseGrams })),
        gear: trip.gear.map((e) => {
          const g = lib.get(e.gearId)!;
          return { gearId: g.id, name: g.name, brand: g.brand, model: g.model, category: g.category, weightGrams: g.weightGrams, quantity: e.quantity, essential: g.essential, weightClass: g.weightClass, sharedInGroup: e.scope === "assigned", carriedBy: e.carrierId };
        }),
      };
      const res = await api<Optimise & { mode: string }>("optimise", { snapshot });
      if (res.mode === "offline") {
        setErr("Gear analysis needs the AI service, which isn't connected on this server. The weight breakdown above still shows where your weight is.");
        setItems(null);
      } else {
        setSummary(res.summary);
        setItems(res.suggestions.map((s) => ({ ...s, id: uid(), state: "open" })));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const existingWeight = (s: Suggestion) => s.gearIds.reduce((sum, id) => {
    const g = lib.get(id);
    const e = trip.gear.find((x) => x.gearId === id);
    return sum + (g?.weightGrams ?? 0) * (e?.quantity ?? 1);
  }, 0);

  const accept = (s: Suggestion) => {
    const entries = trip.gear.filter((e) => s.gearIds.includes(e.gearId));
    const protectedItem = entries.map((e) => lib.get(e.gearId)).find((g) => g && g.essential && SAFETY_CATS.has(g.category));
    if ((s.kind === "remove" || s.kind === "duplicate") && protectedItem) {
      toast(`${protectedItem.name} is essential safety gear, so Rovefern won't remove it.`, { tone: "error" });
      return;
    }
    if (s.kind === "replace" && entries[0]) {
      const old = lib.get(entries[0].gearId)!;
      const alt = newGearItem({
        name: s.proposal.slice(0, 120),
        category: old.category,
        owned: false,
        essential: old.essential,
        shareable: old.shareable,
        weightClass: old.weightClass,
        weightGrams: s.alternativeWeightGrams,
        weightProvenance: s.alternativeWeightGrams != null ? prov("ai", { note: "Typical weight suggested by AI — check the real product" }) : prov("unverified"),
        notes: s.explanation,
      });
      actions.addGear([alt]);
      a.patch((t) => ({ ...t, gear: t.gear.map((e) => (e.id === entries[0].id ? { ...e, gearId: alt.id, packedBy: [] } : e)) }), "accept gear suggestion");
    } else if (s.kind === "remove" || s.kind === "duplicate") {
      const drop = s.kind === "duplicate" ? entries.slice(1) : entries;
      a.ops(drop.map((e) => ({ op: "remove_trip_gear" as const, entryId: e.id })), "accept gear suggestion");
    } else if (s.kind === "share" && trip.participants.length > 1) {
      const [keep, ...rest] = entries;
      if (keep) a.patch((t) => ({ ...t, gear: t.gear.filter((e) => !rest.some((r) => r.id === e.id)).map((e) => (e.id === keep.id ? { ...e, scope: "assigned", carrierId: e.carrierId ?? t.participants[0].id, quantity: 1 } : e)) }), "accept gear suggestion");
    }
    setItems((l) => l!.map((x) => (x.id === s.id ? { ...x, state: "accepted" } : x)));
    toast("Suggestion applied", { undo: true });
  };

  return (
    <section className="card" aria-labelledby="opt-title">
      <div className="card-head">
        <h3 id="opt-title">Lighten your pack</h3>
        <button className="btn sm" onClick={run} disabled={busy || trip.gear.length === 0}>
          {busy ? <Spinner /> : <Icon name="spark" size={16} />} {items ? "Analyse again" : "Analyse my gear"}
        </button>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        AI looks for heavy items, duplicates, overlaps and things to share, with this trip's conditions in mind. It never suggests dropping essential safety gear. Alternative weights are typical figures for that type of item, not product specs. Savings are calculated by the app.
      </p>
      {err && <Notice tone="warn">{err}</Notice>}
      {summary && <p>{summary}</p>}
      {items && items.length === 0 && <p className="muted">No changes suggested — your kit already looks well matched to this trip.</p>}
      {items && (
        <div className="stack">
          {items.map((s) => {
            const existing = existingWeight(s);
            const saving = s.alternativeWeightGrams != null && s.kind === "replace" ? existing - s.alternativeWeightGrams : s.kind === "remove" ? existing : null;
            const names = s.gearIds.map((id) => lib.get(id)?.name).filter(Boolean).join(", ");
            return (
              <div key={s.id} className="card" style={{ padding: 16, opacity: s.state === "rejected" ? 0.5 : 1 }}>
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <h4 style={{ margin: 0 }}>{s.title}</h4>
                  {s.safetyCritical && <span className="badge unverified">Safety trade-off</span>}
                </div>
                <dl className="kv small" style={{ marginTop: 8 }}>
                  {names && (
                    <>
                      <dt>Current</dt>
                      <dd>
                        {names} · {f.w(existing)}
                      </dd>
                    </>
                  )}
                  <dt>Proposal</dt>
                  <dd>
                    {s.proposal}
                    {s.alternativeWeightGrams != null && (
                      <>
                        {" "}
                        · typically around {f.w(s.alternativeWeightGrams)} <span className="badge ai">AI estimate</span>
                      </>
                    )}
                  </dd>
                  {saving != null && saving > 0 && (
                    <>
                      <dt>Saving</dt>
                      <dd style={{ fontWeight: 650 }}>about {f.w(saving)}</dd>
                    </>
                  )}
                  <dt>Why</dt>
                  <dd>{s.explanation}</dd>
                  <dt>Suitability</dt>
                  <dd>{s.suitability}</dd>
                  <dt>Cost</dt>
                  <dd className="muted">Not shown — Rovefern doesn't have verified prices. Check retailers.</dd>
                </dl>
                {s.state === "open" ? (
                  <div className="row" style={{ marginTop: 10 }}>
                    {["replace", "remove", "duplicate", "share"].includes(s.kind) ? (
                      <button className="btn sm" onClick={() => accept(s)}>
                        Accept
                      </button>
                    ) : (
                      <button className="btn sm secondary" onClick={() => setItems((l) => l!.map((x) => (x.id === s.id ? { ...x, state: "accepted" } : x)))}>
                        Noted
                      </button>
                    )}
                    <button className="btn ghost sm" onClick={() => setItems((l) => l!.map((x) => (x.id === s.id ? { ...x, state: "rejected" } : x)))}>
                      Reject
                    </button>
                  </div>
                ) : (
                  <p className="small muted" style={{ margin: "8px 0 0" }}>{s.state === "accepted" ? "Accepted" : "Rejected"}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
