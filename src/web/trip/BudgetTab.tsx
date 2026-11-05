import { useState } from "react";
import { BUDGET_CATEGORIES, BUDGET_CATEGORY_LABELS, type BudgetCategory, type BudgetLine } from "../../lib/domain/types";
import { prov } from "../../lib/engine/factory";
import { Icon } from "../components/icons";
import { Empty, Meter, Modal, Notice, NumField, ProvBadge, Stat, useFormat } from "../components/ui";
import { getRates } from "../lib/external";
import { toast } from "../lib/store";
import { useTripActions, type TabProps } from "./TripPage";

export function BudgetTab({ trip, d, rates, setRates }: TabProps) {
  const f = useFormat();
  const a = useTripActions(trip);
  const b = d.budget;
  const cur = trip.currency;
  const [adding, setAdding] = useState(false);
  const multi = trip.participants.length > 1;
  const name = (id: string) => trip.participants.find((p) => p.id === id)?.name ?? "?";

  const update = (line: BudgetLine, patch: Partial<BudgetLine>, markUser = true) =>
    a.ops([{ op: "upsert_budget_line", line: { ...line, ...patch, provenance: markUser && ("estimate" in patch || "label" in patch) ? prov("user") : line.provenance } }]);

  const refreshRates = async () => {
    try {
      setRates(await getRates());
      toast("Exchange rates updated");
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };

  const addCommon = () => {
    const have = new Set(trip.budget.map((l) => l.category));
    const lines: { category: BudgetCategory; label: string; basis: BudgetLine["basis"]; estimate: number | null }[] = [
      { category: "public_transport", label: "Transport to and from the trailhead", basis: "per_person", estimate: null },
      { category: "campsite_fees", label: "Campsite or hut fees", basis: "per_person", estimate: null },
      { category: "permits", label: "Permits and park fees", basis: "per_person", estimate: null },
      { category: "food", label: "Trail food", basis: "group", estimate: d.food.knownCost || null },
      { category: "insurance", label: "Travel insurance", basis: "per_person", estimate: null },
      { category: "emergency_reserve", label: "Emergency reserve", basis: "group", estimate: null },
    ];
    const ops = lines.filter((l) => !have.has(l.category)).map((l) => ({ op: "upsert_budget_line" as const, line: { ...l, currency: cur, provenance: prov("user", { note: "Add your own figure" }) } }));
    if (!ops.length) return toast("The common categories are already in your budget.");
    a.ops(ops, "add budget lines");
  };

  return (
    <div className="stack-lg">
      <div className="stats">
        <Stat k="Estimated total" v={f.money(b.estimatedTotal, cur)} sub={`${f.money(b.estimatedPerPerson, cur)} per person`} />
        <Stat k="Per day" v={f.money(b.estimatedPerDay, cur)} sub={`Over ${trip.durationDays} ${trip.durationDays === 1 ? "day" : "days"}`} />
        <Stat k="Spent so far" v={f.money(b.actualTotal, cur)} sub={`${f.money(b.actualPerPerson, cur)} per person`} />
        <div className="stat">
          <div className="k">Remaining</div>
          <div className="v" style={{ color: b.overBudget ? "var(--rust)" : undefined }}>{b.budgetMaxGroup != null ? f.money(b.remainingAgainstEstimate, cur) : "No limit"}</div>
          {b.budgetMaxGroup != null && (
            <>
              <Meter value={b.estimatedTotal} max={b.budgetMaxGroup} over={b.overBudget} />
              <div className="sub">
                of {f.money(b.budgetMaxGroup, cur)} {multi ? "group budget" : "budget"}
              </div>
            </>
          )}
        </div>
      </div>

      {b.overBudget && (
        <Notice tone="warn">
          The estimate is {f.money(-(b.remainingAgainstEstimate ?? 0), cur)} over budget. Ask the assistant for cheaper options, or look at the biggest categories below.
        </Notice>
      )}
      {(b.unverifiedEstimate > 0 || b.unestimatedLines.length > 0) && (
        <Notice tone="info">
          {b.unverifiedEstimate > 0 && (
            <>
              {f.money(b.unverifiedEstimate, cur)} of the estimate is from AI or rough estimates, not confirmed prices. Replace them with real quotes as you book.{" "}
            </>
          )}
          {b.unestimatedLines.length > 0 && <>No amount yet for: {b.unestimatedLines.join(", ")}.</>}
        </Notice>
      )}

      <section className="card">
        <div className="card-head">
          <h3>Budget settings</h3>
        </div>
        <div className="grid grid-3">
          <NumField label="Maximum budget" value={trip.budgetMax ?? null} onChange={(v) => a.ops([{ op: "set_budget", max: v }])} max={10_000_000} />
          <label className="field">
            Applies to
            <select className="input" value={trip.budgetBasis} onChange={(e) => a.ops([{ op: "set_budget", basis: e.target.value as BudgetLine["basis"] }])}>
              <option value="per_person">Each person</option>
              <option value="group">The whole group</option>
            </select>
          </label>
          <label className="field">
            Trip currency
            <input className="input" defaultValue={cur} maxLength={3} onBlur={(e) => /^[A-Za-z]{3}$/.test(e.target.value) && e.target.value.toUpperCase() !== cur && a.ops([{ op: "set_budget", currency: e.target.value.toUpperCase() }])} />
          </label>
        </div>
      </section>

      <section>
        <div className="row between">
          <h2 style={{ margin: 0 }}>Costs</h2>
          <div className="row">
            <button className="btn ghost sm" onClick={addCommon}>
              Add common costs
            </button>
            <button className="btn sm" onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} /> Add a cost
            </button>
          </div>
        </div>
        {trip.budget.length === 0 ? (
          <div style={{ marginTop: 12 }}>
            <Empty title="No costs yet" action={<button className="btn" onClick={addCommon}>Add common costs</button>}>
              Add what you expect to spend, then record what you actually pay as you go.
            </Empty>
          </div>
        ) : (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Basis</th>
                  <th className="r">Estimate</th>
                  <th className="r">Actual</th>
                  {multi && <th>Paid by</th>}
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {trip.budget.map((l) => (
                  <tr key={l.id}>
                    <td style={{ minWidth: 160 }}>
                      <input className="input sm" aria-label="Cost name" defaultValue={l.label} onBlur={(e) => e.target.value.trim() && e.target.value !== l.label && update(l, { label: e.target.value.trim() })} />
                      <div className="tiny muted">
                        {BUDGET_CATEGORY_LABELS[l.category]}
                        {l.currency !== cur ? ` · in ${l.currency}` : ""}
                      </div>
                    </td>
                    <td>
                      <select className="input sm" aria-label="Basis" value={l.basis} onChange={(e) => update(l, { basis: e.target.value as BudgetLine["basis"] }, false)}>
                        <option value="group">Group</option>
                        <option value="per_person">Per person</option>
                      </select>
                    </td>
                    <td className="r" style={{ minWidth: 110 }}>
                      <NumField small value={l.estimate} onChange={(v) => update(l, { estimate: v })} max={1_000_000} />
                    </td>
                    <td className="r" style={{ minWidth: 110 }}>
                      <NumField small value={l.actual ?? null} onChange={(v) => update(l, { actual: v }, false)} max={1_000_000} />
                    </td>
                    {multi && (
                      <td>
                        <select className="input sm" aria-label="Paid by" value={l.paidBy ?? ""} onChange={(e) => update(l, { paidBy: e.target.value || undefined }, false)}>
                          <option value="">—</option>
                          {trip.participants.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td>
                      <ProvBadge p={l.provenance} compact />
                    </td>
                    <td className="r">
                      <button
                        className="icon-btn"
                        aria-label={`Remove ${l.label}`}
                        onClick={() => {
                          a.ops([{ op: "remove_budget_line", lineId: l.id }], `remove ${l.label}`);
                          toast(`Removed ${l.label}`, { undo: true });
                        }}
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="tiny muted">Per-person amounts are multiplied by {trip.participants.length} in the totals. Amounts you type are labelled as your input.</p>
          </div>
        )}
      </section>

      {(b.unconvertibleLines.length > 0 || b.conversionNote || trip.budget.some((l) => l.currency !== cur)) && (
        <Notice tone="info">
          {b.conversionNote ?? "Some costs are in another currency."}{" "}
          {b.unconvertibleLines.length > 0 && <>Not included until rates load: {b.unconvertibleLines.join(", ")}. </>}
          <button className="btn ghost sm" onClick={refreshRates}>
            Refresh exchange rates
          </button>
          {rates && <span className="tiny"> Rates: {rates.source}, for {rates.asOf}.</span>}
        </Notice>
      )}

      {b.byCategory.length > 0 && (
        <section className="card">
          <h3>By category</h3>
          {b.byCategory.map((c) => (
            <div key={c.category} style={{ marginBottom: 10 }}>
              <div className="row between small">
                <span>{BUDGET_CATEGORY_LABELS[c.category]}</span>
                <span className="num">
                  {f.money(c.estimated, cur)}
                  {c.actual ? <span className="muted"> · spent {f.money(c.actual, cur)}</span> : null}
                </span>
              </div>
              <Meter value={c.estimated} max={Math.max(...b.byCategory.map((x) => x.estimated), 1)} />
            </div>
          ))}
        </section>
      )}

      {multi && b.actualTotal > 0 && (
        <section className="card">
          <h3>Settling up</h3>
          <p className="small muted" style={{ marginTop: 0 }}>
            Based on actual spending split equally. Set "Paid by" on each cost.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th className="r">Paid</th>
                <th className="r">Share</th>
                <th className="r">Balance</th>
              </tr>
            </thead>
            <tbody>
              {b.balances.map((x) => (
                <tr key={x.participantId}>
                  <td>{x.name}</td>
                  <td className="r">{f.money(x.paid, cur)}</td>
                  <td className="r">{f.money(x.share, cur)}</td>
                  <td className="r" style={{ color: x.balance < 0 ? "var(--rust)" : "var(--forest)" }}>
                    {x.balance >= 0 ? "+" : ""}
                    {f.money(x.balance, cur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {b.settlements.length > 0 && (
            <ul style={{ paddingLeft: 18, marginBottom: 0 }}>
              {b.settlements.map((s, i) => (
                <li key={i}>
                  {name(s.from)} pays {name(s.to)} {f.money(s.amount, cur)}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="tiny muted">Rovefern doesn't check live prices or availability. All totals are calculated by the app from the amounts listed above.</p>

      {adding && <AddCost trip={trip} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddCost({ trip, onClose }: { trip: TabProps["trip"]; onClose: () => void }) {
  const a = useTripActions(trip);
  const [category, setCategory] = useState<BudgetCategory>("misc");
  const [label, setLabel] = useState("");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [actual, setActual] = useState<number | null>(null);
  const [basis, setBasis] = useState<BudgetLine["basis"]>("group");
  const [currency, setCurrency] = useState(trip.currency);
  const [err, setErr] = useState("");
  return (
    <Modal title="Add a cost" onClose={onClose}>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return setErr("Describe the cost.");
            if (!/^[A-Za-z]{3}$/.test(currency)) return setErr("Currency must be a three-letter code like AUD.");
            const r = a.ops([{ op: "upsert_budget_line", line: { category, label: label.trim(), estimate, actual, basis, currency: currency.toUpperCase(), provenance: prov("user") } }], "add cost");
            if (r?.ok) onClose();
          }}
        >
          <label className="field">
            Category
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value as BudgetCategory)}>
              {BUDGET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {BUDGET_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Description
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <NumField label="Estimate" value={estimate} onChange={setEstimate} max={1_000_000} />
            <NumField label="Actual (if paid)" value={actual} onChange={setActual} max={1_000_000} />
          </div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label className="field">
              Basis
              <select className="input" value={basis} onChange={(e) => setBasis(e.target.value as BudgetLine["basis"])}>
                <option value="group">For the group</option>
                <option value="per_person">Per person</option>
              </select>
            </label>
            <label className="field">
              Currency
              <input className="input" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            </label>
          </div>
          {err && <div className="err">{err}</div>}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn" type="submit">
              Add cost
            </button>
          </div>
        </form>
    </Modal>
  );
}
