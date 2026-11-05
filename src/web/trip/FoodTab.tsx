import { useState } from "react";
import type { MealOption, MealSlot } from "../../lib/domain/types";
import { MEAL_SLOTS, SKIP } from "../../lib/engine/food";
import { prov, uid } from "../../lib/engine/factory";
import { formatHours } from "../../lib/engine/units";
import { Icon } from "../components/icons";
import { Modal, Notice, NumField, Stat, Term, useFormat } from "../components/ui";
import { downloadText, slug } from "../lib/gpx";
import { toast } from "../lib/store";
import { useTripActions, type TabProps } from "./TripPage";

const SLOT_LABEL: Record<MealSlot, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snacks: "Snacks" };
const DIETS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "nut-free", "halal", "kosher"];

export function FoodTab({ trip, d }: TabProps) {
  const f = useFormat();
  const a = useTripActions(trip);
  const food = d.food;
  const [editMeal, setEditMeal] = useState<MealOption | "new" | null>(null);
  const [ref1, ref2] = food.referenceRangeGPerDay;
  const perDay = food.foodGramsPerPersonPerDay;

  const shoppingText = () =>
    [`Shopping list — ${trip.title}`, `${trip.participants.length} ${trip.participants.length === 1 ? "person" : "people"}, ${food.daysFed} days of food${trip.food.spareDay ? " (including a spare day)" : ""}`, "", ...food.shoppingList.map((l) => `- ${l.name}: ${f.w(l.grams)}${l.servings ? ` (${l.servings} servings)` : ""}`), "", `Fuel: about ${f.w(food.fuelGrams)} of canister gas`].join("\n");

  return (
    <div className="stack-lg">
      <div className="stats">
        <Stat k="Total food" v={f.w(food.totalFoodGrams)} sub={`${food.people} ${food.people === 1 ? "person" : "people"} × ${food.daysFed} days`} />
        <Stat k="Per person per day" v={f.w(perDay)} sub={`Typical range for ${trip.food.intensity} trips: ${f.w(ref1)}–${f.w(ref2)}`} />
        <Stat k="Carried at the start" v={f.w(food.startCarriedFoodGramsPerPerson)} sub={trip.food.resupplyDays.length ? "Each, until the first resupply" : "Each"} />
        <Stat k="Fuel" v={`~${f.w(food.fuelGrams)}`} sub={`To boil ${f.v(food.cookingWaterLitres)} of water`} />
      </div>
      {perDay > 0 && (perDay < ref1 * 0.85 || perDay > ref2 * 1.2) && (
        <Notice tone="info">
          {perDay < ref1 ? "This menu is lighter than typical for this kind of trip. Make sure it gives you enough energy — add snacks or bigger portions if needed." : "This menu is heavier than typical. You might be able to save weight with more calorie-dense food."}
        </Notice>
      )}
      <p className="tiny muted" style={{ marginTop: -12 }}>
        {food.fuelAssumption} Meal weights are starting estimates — replace them with the weights on your own food's packaging.
      </p>

      <section className="card">
        <h3>Plan settings</h3>
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <div className="stack">
            <div>
              <div className="small" style={{ fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
                Hiking intensity
              </div>
              <div className="seg" role="group" aria-label="Hiking intensity">
                {(["easy", "moderate", "hard"] as const).map((k) => (
                  <button key={k} aria-pressed={trip.food.intensity === k} onClick={() => a.ops([{ op: "set_food", intensity: k }])}>
                    {k[0].toUpperCase() + k.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={trip.food.spareDay} onChange={(e) => a.ops([{ op: "set_food", spareDay: e.target.checked }])} /> Carry a spare day of food for emergencies
            </label>
            <div>
              <div className="small" style={{ fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
                Dietary requirements
              </div>
              <div className="row">
                {DIETS.map((x) => (
                  <button key={x} className="chip" aria-pressed={trip.food.dietary.includes(x)} onClick={() => a.ops([{ op: "set_food", dietary: trip.food.dietary.includes(x) ? trip.food.dietary.filter((y) => y !== x) : [...trip.food.dietary, x] }])}>
                    {x}
                  </button>
                ))}
              </div>
              {trip.food.dietary.length > 0 && <p className="tiny muted" style={{ marginBottom: 0 }}>Check each meal below against these — the starter meals aren't all suitable.</p>}
            </div>
          </div>
          <div className="stack">
            {trip.durationDays > 1 && (
              <div>
                <div className="small" style={{ fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
                  <Term name="Water resupply">Resupply</Term> on the morning of day…
                </div>
                <div className="row">
                  {Array.from({ length: trip.durationDays - 1 }, (_, i) => i + 2).map((n) => (
                    <button key={n} className="chip" aria-pressed={trip.food.resupplyDays.includes(n)} onClick={() => a.ops([{ op: "set_food", resupplyDays: trip.food.resupplyDays.includes(n) ? trip.food.resupplyDays.filter((x) => x !== n) : [...trip.food.resupplyDays, n] }])}>
                      {n}
                    </button>
                  ))}
                </div>
                <p className="tiny muted" style={{ marginBottom: 0 }}>Food is only carried from one resupply to the next, which lowers your starting weight.</p>
              </div>
            )}
            <label className="field">
              Food preferences
              <input className="input" defaultValue={trip.food.preferences ?? ""} onBlur={(e) => e.target.value !== (trip.food.preferences ?? "") && a.ops([{ op: "set_food", preferences: e.target.value }])} placeholder="e.g. no mushrooms, likes spicy food" />
            </label>
          </div>
        </div>
      </section>

      <section>
        <div className="row between">
          <h2 style={{ margin: 0 }}>Menu</h2>
          <button className="btn secondary sm" onClick={() => setEditMeal("new")}>
            <Icon name="plus" size={16} /> Add a meal
          </button>
        </div>
        <p className="small muted">Meals rotate through each slot. Change any day in the plan below.</p>
        <div className="grid grid-4">
          {MEAL_SLOTS.map((slot) => (
            <div key={slot} className="card" style={{ padding: 16 }}>
              <h4>{SLOT_LABEL[slot]}</h4>
              {trip.food.menu.filter((m) => m.slot === slot).map((m) => (
                <div key={m.id} className="row between" style={{ padding: "6px 0", borderBottom: "1px solid var(--line-2)", flexWrap: "nowrap" }}>
                  <button className="term" style={{ textAlign: "left", textDecoration: "none" }} onClick={() => setEditMeal(m)}>
                    {m.name}
                  </button>
                  <span className="tiny muted num" style={{ whiteSpace: "nowrap" }}>
                    {f.w(m.gramsPerServing)}
                  </span>
                </div>
              ))}
              {!trip.food.menu.some((m) => m.slot === slot) && <p className="small muted">None — add one.</p>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Day by day</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Day</th>
                {MEAL_SLOTS.map((s) => (
                  <th key={s}>{SLOT_LABEL[s]}</th>
                ))}
                <th className="r">Per person</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: food.daysFed }, (_, i) => i + 1).map((day) => {
                const meals = food.meals.filter((m) => m.dayNumber === day);
                const spare = meals[0]?.isSpare;
                return (
                  <tr key={day}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {spare ? "Spare" : day}
                      {trip.food.resupplyDays.includes(day) && <span className="badge third_party" style={{ marginLeft: 6 }}>Resupply</span>}
                    </td>
                    {meals.map((m) =>
                      spare ? (
                        <td key={m.slot} className="small">{m.meal?.name ?? "—"}</td>
                      ) : (
                        <td key={m.slot}>
                          <select
                            className="input sm"
                            style={{ minWidth: 150 }}
                            aria-label={`Day ${day} ${m.slot}`}
                            value={trip.food.overrides[day]?.[m.slot] ?? ""}
                            onChange={(e) => a.ops([{ op: "override_meal", dayNumber: day, slot: m.slot, mealId: e.target.value || null }])}
                          >
                            <option value="">{m.meal && !trip.food.overrides[day]?.[m.slot] ? `${m.meal.name} (rotation)` : "Rotation"}</option>
                            {trip.food.menu.filter((x) => x.slot === m.slot).map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                            <option value={SKIP}>Skip (eating elsewhere)</option>
                          </select>
                        </td>
                      ),
                    )}
                    <td className="r small">{f.w(meals.reduce((s, m) => s + (m.meal?.gramsPerServing ?? 0), 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Shopping list</h3>
          <div className="row">
            <button
              className="btn ghost sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shoppingText());
                  toast("Shopping list copied");
                } catch {
                  toast("Couldn't copy — use Download instead.", { tone: "error" });
                }
              }}
            >
              <Icon name="copy" size={16} /> Copy
            </button>
            <button className="btn ghost sm" onClick={() => downloadText(`${slug(trip.title)}-shopping-list.txt`, shoppingText())}>
              <Icon name="download" size={16} /> Download
            </button>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          For {food.people} {food.people === 1 ? "person" : "people"} and {food.daysFed} days of food. Quantities update when you change the trip length, group size or menu.
        </p>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {food.shoppingList.map((l) => (
                <tr key={l.name}>
                  <td>{l.name}</td>
                  <td className="r">{f.w(l.grams)}</td>
                  <td className="r small muted">{l.servings ? `${l.servings} servings` : ""}</td>
                </tr>
              ))}
              <tr>
                <td>Canister gas (estimate)</td>
                <td className="r">{f.w(food.fuelGrams)}</td>
                <td className="r small muted">Round up to whole canisters</td>
              </tr>
            </tbody>
          </table>
        </div>
        {food.knownCost > 0 && <p className="small">Known food cost: {f.money(food.knownCost, trip.currency)}{food.servingsWithUnknownCost ? ` plus ${food.servingsWithUnknownCost} servings without a price` : ""}.</p>}
      </section>

      <WaterPlan {...{ trip, d }} />

      {editMeal && <MealEditor trip={trip} meal={editMeal === "new" ? null : editMeal} onClose={() => setEditMeal(null)} />}
    </div>
  );
}

function WaterPlan({ trip, d }: Pick<TabProps, "trip" | "d">) {
  const f = useFormat();
  const a = useTripActions(trip);
  const w = d.water;
  const imperial = f.units === "imperial";
  return (
    <section className="card" aria-labelledby="water-title">
      <h2 id="water-title" style={{ fontSize: "1.5rem" }}>
        Water
      </h2>
      <div className="grid grid-3">
        <NumField label={`Expected daytime high (${imperial ? "°F" : "°C"})`} value={trip.water.expectedMaxTempC == null ? null : imperial ? Math.round(trip.water.expectedMaxTempC * 1.8 + 32) : trip.water.expectedMaxTempC} onChange={(v) => a.ops([{ op: "set_water", expectedMaxTempC: v == null ? null : imperial ? Math.round(((v - 32) / 1.8) * 10) / 10 : v }])} min={imperial ? -76 : -60} max={imperial ? 140 : 60} />
        <NumField label="Longest stretch without reliable water (hours)" value={trip.water.longestDryStretchHours ?? null} onChange={(v) => a.ops([{ op: "set_water", longestDryStretchHours: v }])} max={72} />
        <NumField label="Water you can carry, per person (L)" value={trip.water.capacityLitresPerPerson ?? null} onChange={(v) => a.ops([{ op: "set_water", capacityLitresPerPerson: v }])} max={30} />
      </div>
      <label className="field" style={{ marginTop: 12 }}>
        Treatment method
        <input className="input" defaultValue={trip.water.treatment ?? ""} placeholder="e.g. Squeeze filter plus tablets as backup" onBlur={(e) => e.target.value !== (trip.water.treatment ?? "") && a.ops([{ op: "set_water", treatment: e.target.value }])} />
      </label>
      <div className="stats" style={{ marginTop: 16 }}>
        <Stat k="While walking, longest day" v={d.totals.longestDayHours ? `${f.v(w.walkingRangeLPerPerson[0])}–${f.v(w.walkingRangeLPerPerson[1])}` : "—"} sub={d.totals.longestDayHours ? `Per person, over ~${formatHours(d.totals.longestDayHours)}` : "Add day distances to estimate"} />
        <Stat k="Camp & cooking" v={f.v(w.campLitresPerPersonPerDay)} sub="Per person per day, from the menu" />
        <Stat k="Carry for the longest dry stretch" v={w.carryForDryStretchL != null ? f.v(w.carryForDryStretchL) : "—"} sub={w.carryForDryStretchL != null ? "Upper estimate plus reserve" : "Set the dry stretch above"} />
      </div>
      <div className="stack" style={{ marginTop: 16 }}>
        {w.warnings.map((x) => (
          <Notice key={x} tone="warn">
            {x}
          </Notice>
        ))}
        <ul className="tiny muted" style={{ paddingLeft: 18, margin: 0 }}>
          {w.assumptions.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p className="small" style={{ margin: 0 }}>
          Water sources listed in the itinerary are labelled with where the information came from. Only treat a source as reliable if a recent official or first-hand report confirms it, and always carry a way to treat water.
        </p>
      </div>
    </section>
  );
}

function MealEditor({ trip, meal, onClose }: { trip: TabProps["trip"]; meal: MealOption | null; onClose: () => void }) {
  const a = useTripActions(trip);
  const [m, setM] = useState<MealOption>(() => meal ?? { id: uid(), slot: "dinner", name: "", gramsPerServing: 150, needsCooking: true, cookingWaterMl: 400, costPerServing: null, costProvenance: prov("user") });
  const [err, setErr] = useState("");
  const set = (p: Partial<MealOption>) => setM((x) => ({ ...x, ...p }));
  const save = () => {
    if (!m.name.trim()) return setErr("Give the meal a name.");
    if (!(m.gramsPerServing > 0 && m.gramsPerServing <= 2000)) return setErr("Weight per serving must be 1–2000 g.");
    const next = { ...m, name: m.name.trim(), cookingWaterMl: m.needsCooking ? m.cookingWaterMl : 0, costProvenance: prov("user") };
    a.patch((t) => ({ ...t, food: { ...t.food, menu: meal ? t.food.menu.map((x) => (x.id === meal.id ? next : x)) : [...t.food.menu, next] } }), meal ? "edit meal" : "add meal");
    onClose();
  };
  return (
    <Modal title={meal ? "Edit meal" : "Add a meal"} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          Name
          <input className="input" value={m.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="field">
          Meal
          <select className="input" value={m.slot} onChange={(e) => set({ slot: e.target.value as MealSlot })}>
            {MEAL_SLOTS.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <NumField label="Packed weight per serving (g)" value={m.gramsPerServing} onChange={(v) => set({ gramsPerServing: v ?? 0 })} min={1} max={2000} />
        <label className="check">
          <input type="checkbox" checked={m.needsCooking} onChange={(e) => set({ needsCooking: e.target.checked })} /> Needs hot water or cooking
        </label>
        {m.needsCooking && <NumField label="Water to cook one serving (ml)" value={m.cookingWaterMl} onChange={(v) => set({ cookingWaterMl: v ?? 0 })} max={3000} />}
        <NumField label={`Cost per serving (${trip.currency}, optional)`} value={m.costPerServing ?? null} onChange={(v) => set({ costPerServing: v })} max={1000} />
        {err && <div className="err">{err}</div>}
        <div className="row between">
          {meal ? (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                a.patch((t) => {
                  const overrides = Object.fromEntries(Object.entries(t.food.overrides).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([, id]) => id !== meal.id))]));
                  return { ...t, food: { ...t.food, menu: t.food.menu.filter((x) => x.id !== meal.id), overrides } };
                }, "delete meal");
                toast(`Removed ${meal.name}`, { undo: true });
                onClose();
              }}
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="row">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn" type="submit">
              Save meal
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
