import { useState } from "react";
import type { PackZone } from "../../lib/domain/types";
import { ZONE_INFO, ZONE_ORDER, layoutPack, packingProgress } from "../../lib/engine/packing";
import { Empty, Meter, Notice, useFormat } from "../components/ui";
import { Link } from "../router";
import { useTripActions, type TabProps } from "./TripPage";

const ZONE_FILL: Record<string, string> = { bottom: "#8a9467", core: "#1f3b2c", top: "#5a5f2e", outer: "#c9a46b", dry: "#34556a" };

export function Packing({ trip, d }: TabProps) {
  const f = useFormat();
  const a = useTripActions(trip);
  const [who, setWho] = useState(trip.participants[0]?.id);
  const [active, setActive] = useState<PackZone | null>(null);
  const person = d.weights.people.find((p) => p.participantId === who) ?? d.weights.people[0];
  if (!person || person.items.length === 0)
    return <Empty title="Nothing to pack yet" action={<Link to={`/trip/${trip.id}/gear`} className="btn">Add gear to this trip</Link>}>The packing guide uses the actual items on this trip.</Empty>;

  const overrides = Object.fromEntries(trip.gear.map((g) => [g.id, g.zoneOverride]));
  const layout = layoutPack(person.items, overrides);
  const worn = person.items.filter((i) => i.weightClass === "worn");
  const prog = packingProgress(person.items.filter((i) => i.weightClass !== "worn"));

  const toggle = (entryId: string, packed: boolean) =>
    a.patch((t) => ({ ...t, gear: t.gear.map((g) => (g.id === entryId ? { ...g, packedBy: packed ? [...new Set([...g.packedBy, person.participantId])] : g.packedBy.filter((x) => x !== person.participantId) } : g)) }));
  const move = (entryId: string, zone: PackZone) => a.patch((t) => ({ ...t, gear: t.gear.map((g) => (g.id === entryId ? { ...g, zoneOverride: zone } : g)) }), "move item");

  return (
    <div className="stack-lg">
      <div className="row between">
        <div>
          <h2 style={{ margin: 0 }}>Packing guide</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Where each item goes, and a checklist to tick off as you pack.
          </p>
        </div>
        {trip.participants.length > 1 && (
          <label className="field" style={{ minWidth: 180 }}>
            Packing for
            <select className="input" value={person.participantId} onChange={(e) => setWho(e.target.value)}>
              {trip.participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="card flat">
        <div className="row between small">
          <strong>
            {prog.packed} of {prog.total} packed
          </strong>
          <span className="muted">{prog.percent}%</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <Meter value={prog.packed} max={prog.total} />
        </div>
      </div>

      <div className="pack-layout">
        <div>
          <PackDiagram layout={layout} active={active} onSelect={(z) => setActive((x) => (x === z ? null : z))} />
          <p className="tiny muted" style={{ textAlign: "center" }}>
            {layout.corePercent}% of your packed weight sits in the middle, close to your back. Select a zone to filter.
          </p>
        </div>
        <div className="stack-lg">
          {layout.zones
            .filter((z) => !active || z.zone === active)
            .map((z) => (
              <section key={z.zone}>
                <div className="row between">
                  <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: ZONE_FILL[z.zone], display: "inline-block" }} />
                    {ZONE_INFO[z.zone].title}
                  </h3>
                  <span className="small muted num">{f.w(z.grams)}</span>
                </div>
                <p className="small muted" style={{ margin: "4px 0 6px" }}>
                  {ZONE_INFO[z.zone].guidance}
                </p>
                {z.items.length ? (
                  <ul className="zone-items">
                    {z.items.map((it) => (
                      <li key={it.entryId} className={it.packed ? "packed" : ""}>
                        <label className="check" style={{ flex: 1 }}>
                          <input type="checkbox" checked={it.packed} onChange={(e) => toggle(it.entryId, e.target.checked)} />
                          <span className="nm">
                            {it.name}
                            {it.quantity > 1 ? ` × ${it.quantity}` : ""}
                          </span>
                        </label>
                        <span className="small muted num">{it.unitGrams == null ? "No weight" : f.w(it.totalGrams)}</span>
                        <select className="input sm" style={{ width: "auto", minHeight: 30, padding: "2px 6px" }} aria-label={`Move ${it.name}`} value={z.zone} onChange={(e) => move(it.entryId, e.target.value as PackZone)}>
                          {ZONE_ORDER.map((k) => (
                            <option key={k} value={k}>
                              {ZONE_INFO[k].title}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted">Nothing here.</p>
                )}
              </section>
            ))}
          {worn.length > 0 && !active && (
            <section>
              <h3>Wear these</h3>
              <ul className="zone-items">
                {worn.map((it) => (
                  <li key={it.entryId} className={it.packed ? "packed" : ""}>
                    <label className="check" style={{ flex: 1 }}>
                      <input type="checkbox" checked={it.packed} onChange={(e) => toggle(it.entryId, e.target.checked)} />
                      <span className="nm">{it.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <section className="card">
          <h3>Tips for this pack</h3>
          <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
            {layout.tips.map((t) => (
              <li key={t} style={{ marginBottom: 6 }}>
                {t}
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3>First time packing a backpack?</h3>
          <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
            <li>Line the pack with a pack liner or a large bin bag so everything stays dry.</li>
            <li>Stuff the sleeping bag in first, then soft things like sleep clothes around it.</li>
            <li>Put the heaviest things — food, water bladder, cook kit, tent — in the middle, against your back.</li>
            <li>Fill gaps with clothing so nothing shifts.</li>
            <li>Things you'll want during the day go on top or in outside pockets: rain jacket, snacks, water, map, first aid, headlamp.</li>
            <li>Keep a wet tent fly or rain gear in an outside pocket or a separate bag, away from your sleeping bag and warm layers.</li>
            <li>Put it on, tighten the hip belt so it carries most of the weight, then the shoulder straps, then the load lifters.</li>
          </ol>
        </section>
      </div>
      <Notice tone="info">Phones, batteries, paper maps and anything that must stay dry belong in a dry bag, even if your pack is waterproof.</Notice>
    </div>
  );
}

function PackDiagram({ layout, active, onSelect }: { layout: ReturnType<typeof layoutPack>; active: PackZone | null; onSelect: (z: PackZone) => void }) {
  const grams = Object.fromEntries(layout.zones.map((z) => [z.zone, z.grams]));
  const max = Math.max(1, ...Object.values(grams));
  const zone = (z: PackZone, d: string, label: string, lx: number, ly: number) => (
    <g className={`zone ${active === z ? "active" : ""}`} role="button" tabIndex={0} aria-label={`${ZONE_INFO[z].title}: ${layout.zones.find((x) => x.zone === z)?.items.length ?? 0} items`} onClick={() => onSelect(z)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(z))}>
      <path d={d} fill={ZONE_FILL[z]} opacity={0.35 + 0.65 * ((grams[z] ?? 0) / max)} stroke="#fffefb" strokeWidth="3" />
      <text x={lx} y={ly} textAnchor="middle" fill="#fffefb" fontSize="13" fontWeight="650" style={{ pointerEvents: "none" }}>
        {label}
      </text>
    </g>
  );
  return (
    <svg className="pack-svg" viewBox="0 0 240 340" role="group" aria-label="Backpack zones">
      {/* Straps */}
      <path d="M70 40 C 40 60, 40 120, 52 160" stroke="#a8a08a" strokeWidth="8" fill="none" strokeLinecap="round" />
      <path d="M170 40 C 200 60, 200 120, 188 160" stroke="#a8a08a" strokeWidth="8" fill="none" strokeLinecap="round" />
      {zone("top", "M70 20 Q120 0 170 20 L176 92 L64 92 Z", "Top", 120, 62)}
      {zone("core", "M64 96 L176 96 L180 214 L60 214 Z", "Middle", 120, 160)}
      {zone("bottom", "M60 218 L180 218 L178 286 Q120 306 62 286 Z", "Bottom", 120, 262)}
      {zone("outer", "M182 120 L226 126 L222 236 L184 232 Z", "Outer", 204, 182)}
      {zone("dry", "M14 126 L56 120 L58 232 L18 236 Z", "Dry", 36, 182)}
      <rect x="72" y="292" width="96" height="14" rx="7" fill="#a8a08a" />
      <text x="120" y="330" textAnchor="middle" fontSize="11" fill="#7a7d73">
        Hip belt
      </text>
    </svg>
  );
}
