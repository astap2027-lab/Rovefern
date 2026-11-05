import { useMemo, useRef, useState } from "react";
import type { GearParse } from "../../server/schemas";
import { GEAR_CATEGORIES, GEAR_CATEGORY_LABELS, type GearCategory, type GearItem } from "../../lib/domain/types";
import { TYPICAL_WEIGHT_G, defaultShareable, defaultWeightClass, guessCategory } from "../../lib/domain/gearDefaults";
import { starterKit } from "../../lib/ai/heuristics";
import { librarySummary } from "../../lib/engine/weight";
import { gToOz, parseWeight, round } from "../../lib/engine/units";
import { prov } from "../../lib/engine/factory";
import { Icon } from "../components/icons";
import { Empty, Modal, Notice, NumField, ProvBadge, Spinner, Term, useFormat } from "../components/ui";
import { CATEGORY_COLORS, WeightBreakdown } from "../components/WeightBreakdown";
import { api } from "../lib/api";
import { newGearItem } from "../lib/buildTrip";
import { actions, toast, useStore } from "../lib/store";
import { useTitle } from "../router";

type Filter = "all" | "owned" | "to_get" | "favourites";

export function GearPage() {
  useTitle("My gear");
  const gear = useStore((s) => s.gear);
  const f = useFormat();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"" | GearCategory>("");
  const [filter, setFilter] = useState<Filter>("all");
  const [maxG, setMaxG] = useState<number | null>(null);
  const [sort, setSort] = useState<"category" | "heaviest" | "lightest" | "name">("category");
  const [editing, setEditing] = useState<GearItem | "new" | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [quick, setQuick] = useState("");

  const owned = gear.filter((g) => g.owned);
  const summary = useMemo(() => librarySummary(owned), [owned]);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    let l = gear.filter((g) => {
      if (n && ![g.name, g.brand, g.model, g.notes, GEAR_CATEGORY_LABELS[g.category]].join(" ").toLowerCase().includes(n)) return false;
      if (cat && g.category !== cat) return false;
      if (filter === "owned" && !g.owned) return false;
      if (filter === "to_get" && g.owned) return false;
      if (filter === "favourites" && !g.favourite) return false;
      if (maxG != null && (g.weightGrams == null || g.weightGrams > maxG)) return false;
      return true;
    });
    const w = (g: GearItem) => (g.weightGrams ?? -1) * g.quantity;
    if (sort === "heaviest") l = [...l].sort((a, b) => w(b) - w(a));
    if (sort === "lightest") l = [...l].sort((a, b) => w(a) - w(b));
    if (sort === "name") l = [...l].sort((a, b) => a.name.localeCompare(b.name));
    return l;
  }, [gear, q, cat, filter, maxG, sort]);

  const grouped = useMemo(() => {
    if (sort !== "category") return null;
    return GEAR_CATEGORIES.map((c) => ({ c, items: list.filter((g) => g.category === c) })).filter((x) => x.items.length);
  }, [list, sort]);

  const quickAdd = () => {
    const text = quick.trim();
    if (!text) return;
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*(kg|kgs|g|grams?|oz|lb|lbs)\b/i);
    const grams = m ? parseWeight(`${m[1]} ${m[2]}`) : null;
    const name = text.replace(m?.[0] ?? "", "").replace(/[,–-]\s*$/, "").trim() || text;
    const category = guessCategory(name);
    const item = newGearItem({
      name: name[0].toUpperCase() + name.slice(1),
      category,
      weightGrams: grams,
      essential: ["shelter", "sleeping_bag", "first_aid", "navigation", "safety", "water_filter", "lighting"].includes(category),
      weightProvenance: grams != null ? prov("user") : prov("unverified", { note: "Weight not entered" }),
    });
    actions.addGear([item]);
    setQuick("");
    toast(`Added ${item.name} to ${GEAR_CATEGORY_LABELS[category]}${grams == null ? " — add its weight when you can" : ""}`);
  };

  const addStarter = () => {
    const items = starterKit(3).map((k) => {
      const typical = TYPICAL_WEIGHT_G[k.category];
      return newGearItem({
        name: k.name,
        category: k.category,
        essential: k.essential,
        shareable: k.shareable,
        owned: false,
        notes: k.reason,
        weightGrams: typical?.typical ?? null,
        weightProvenance: typical ? prov("estimate", { note: `Typical for this category (${typical.range[0]}–${typical.range[1]} g)` }) : prov("unverified"),
      });
    });
    actions.addGear(items);
    toast(`Added ${items.length} items to your "to get" list`);
  };

  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <h1>My gear</h1>
          <p className="lede">Your equipment library. Add things once with their real weights, then reuse them on every trip.</p>
        </div>
        <div className="row">
          <button className="btn secondary" onClick={() => setAiOpen(true)}>
            <Icon name="spark" size={18} /> Describe or photograph gear
          </button>
          <button className="btn" onClick={() => setEditing("new")}>
            <Icon name="plus" size={18} /> Add item
          </button>
        </div>
      </div>

      {gear.length === 0 ? (
        <div className="grid grid-2">
          <Empty
            title="Your gear library is empty"
            action={
              <div className="row" style={{ justifyContent: "center" }}>
                <button className="btn" onClick={() => setEditing("new")}>
                  Add your first item
                </button>
                <button className="btn secondary" onClick={addStarter}>
                  Add a starter checklist
                </button>
              </div>
            }
          >
            New to hiking? The starter checklist adds the usual essentials as a "to get" list with typical weights, so you can see what you'll need.
          </Empty>
          <GearExplainer />
        </div>
      ) : (
        <>
          <div className="stats" style={{ marginBottom: 20 }}>
            <div className="stat">
              <div className="k">
                <Term name="Base weight">Base items</Term>
              </div>
              <div className="v">{f.w(summary.baseGrams)}</div>
              <div className="sub">Everything you own, not a single trip</div>
            </div>
            <div className="stat">
              <div className="k">
                <Term name="Worn weight" />
              </div>
              <div className="v">{f.w(summary.wornGrams)}</div>
            </div>
            <div className="stat">
              <div className="k">
                <Term name="Consumables" />
              </div>
              <div className="v">{f.w(summary.consumableGrams)}</div>
            </div>
            <div className="stat">
              <div className="k">Items</div>
              <div className="v">{gear.length}</div>
              <div className="sub">
                {gear.filter((g) => !g.owned).length} to get · {summary.unknownWeightItems.length} without a weight
              </div>
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr)", gap: 20 }}>
            <div className="card flat">
              <form
                className="row"
                style={{ flexWrap: "nowrap" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  quickAdd();
                }}
              >
                <label htmlFor="quick" className="sr-only">
                  Quick add
                </label>
                <input id="quick" className="input" placeholder='Quick add, e.g. "Titanium mug 110 g" or "Down jacket 12 oz"' value={quick} onChange={(e) => setQuick(e.target.value)} />
                <button className="btn" type="submit" disabled={!quick.trim()}>
                  Add
                </button>
              </form>
            </div>

            {summary.byCategory.length > 0 && (
              <details className="card">
                <summary style={{ cursor: "pointer", fontWeight: 650 }}>Weight by category (items you own)</summary>
                <div style={{ marginTop: 14 }}>
                  <WeightBreakdown rows={summary.byCategory.map((c) => ({ category: c.category, grams: c.grams, percent: c.percent }))} />
                </div>
              </details>
            )}

            <div className="row" style={{ gap: 8 }}>
              <input className="input" style={{ maxWidth: 260 }} placeholder="Search gear" aria-label="Search gear" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="input" style={{ width: "auto" }} aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value as GearCategory | "")}>
                <option value="">All categories</option>
                {GEAR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {GEAR_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
              <select className="input" style={{ width: "auto" }} aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="category">By category</option>
                <option value="heaviest">Heaviest first</option>
                <option value="lightest">Lightest first</option>
                <option value="name">A–Z</option>
              </select>
              <select className="input" style={{ width: "auto" }} aria-label="Maximum weight" value={maxG ?? ""} onChange={(e) => setMaxG(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Any weight</option>
                {[100, 250, 500, 1000, 2000].map((g) => (
                  <option key={g} value={g}>
                    Up to {f.w(g)}
                  </option>
                ))}
              </select>
              <div className="seg" role="group" aria-label="Show">
                {(
                  [
                    ["all", "All"],
                    ["owned", "Owned"],
                    ["to_get", "To get"],
                    ["favourites", "Favourites"],
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {list.length === 0 ? (
              <Empty title="Nothing matches" action={<button className="btn secondary" onClick={() => { setQ(""); setCat(""); setFilter("all"); setMaxG(null); }}>Clear filters</button>} />
            ) : grouped ? (
              <div>
                {grouped.map(({ c, items }) => (
                  <div className="gear-cat" key={c}>
                    <h4>
                      <span>{GEAR_CATEGORY_LABELS[c]}</span>
                      <span className="num">{f.w(items.filter((i) => i.owned).reduce((s, i) => s + (i.weightGrams ?? 0) * i.quantity, 0))}</span>
                    </h4>
                    <div className="gear-list">
                      {items.map((g) => (
                        <GearRow key={g.id} g={g} onEdit={() => setEditing(g)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="gear-list">
                {list.map((g) => (
                  <GearRow key={g.id} g={g} onEdit={() => setEditing(g)} showCat />
                ))}
              </div>
            )}
            <GearExplainer />
          </div>
        </>
      )}

      {editing && <GearForm item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {aiOpen && <AiGearAdd onClose={() => setAiOpen(false)} />}
    </div>
  );
}

function GearRow({ g, onEdit, showCat }: { g: GearItem; onEdit: () => void; showCat?: boolean }) {
  const f = useFormat();
  return (
    <div className="gear-row">
      <div>
        <div className="row" style={{ gap: 8 }}>
          <button className="icon-btn" style={{ width: 32, height: 32, color: g.favourite ? "#7a5a12" : undefined }} aria-label={g.favourite ? `Remove ${g.name} from favourites` : `Add ${g.name} to favourites`} aria-pressed={g.favourite} onClick={() => actions.updateGear(g.id, { favourite: !g.favourite })}>
            <Icon name="star" size={18} fill={g.favourite ? "currentColor" : "none"} />
          </button>
          {g.imageDataUrl && <img src={g.imageDataUrl} alt="" width={36} height={36} style={{ borderRadius: 8, objectFit: "cover" }} />}
          <span className="name">{g.name}</span>
          {!g.owned && <span className="badge ai">To get</span>}
        </div>
        <div className="meta" style={{ paddingLeft: 40 }}>
          {showCat && <span>{GEAR_CATEGORY_LABELS[g.category]}</span>}
          {(g.brand || g.model) && <span>{[g.brand, g.model].filter(Boolean).join(" ")}</span>}
          <span>{g.weightClass === "worn" ? "Worn" : g.weightClass === "consumable" ? "Consumable" : "Carried"}</span>
          {g.essential && <span>Essential</span>}
          {g.shareable && <span>Shareable</span>}
          {g.weightProvenance.kind !== "user" && <ProvBadge p={g.weightProvenance} compact />}
        </div>
      </div>
      <div className="row" style={{ gap: 4, justifyContent: "flex-end", flexWrap: "nowrap" }}>
        <span className="w" style={{ minWidth: 70 }}>
          {g.weightGrams == null ? <span className="badge unverified">No weight</span> : g.quantity > 1 ? `${g.quantity} × ${f.w(g.weightGrams)}` : f.w(g.weightGrams)}
        </span>
        <button className="icon-btn" aria-label={`Edit ${g.name}`} onClick={onEdit}>
          <Icon name="edit" size={18} />
        </button>
        <button className="icon-btn" aria-label={`Duplicate ${g.name}`} onClick={() => actions.duplicateGear(g.id)}>
          <Icon name="copy" size={18} />
        </button>
        <button className="icon-btn" aria-label={`Delete ${g.name}`} onClick={() => actions.deleteGear(g.id)}>
          <Icon name="trash" size={18} />
        </button>
      </div>
    </div>
  );
}

function GearExplainer() {
  return (
    <div className="card flat small">
      <h4>How weights are counted</h4>
      <p className="muted" style={{ margin: 0 }}>
        <strong>Carried</strong> items count toward <Term name="Base weight">base weight</Term>. <strong>Worn</strong> items (boots, the clothes you walk in) count as <Term name="Worn weight">worn weight</Term>. <strong>Consumables</strong> like food, fuel and sunscreen are tracked separately because they get lighter as you go. Totals are calculated by the app from the weights you enter.
      </p>
    </div>
  );
}

async function compressImage(file: File, max = 480): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That image couldn't be read."));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function GearForm({ item, onClose, onSaved }: { item: GearItem | null; onClose: () => void; onSaved?: (g: GearItem) => void }) {
  const settings = useStore((s) => s.settings);
  const [g, setG] = useState<GearItem>(() => item ?? newGearItem({ name: "", category: "misc", currency: settings.currency }));
  const imperial = settings.units === "imperial";
  const [weightText, setWeightText] = useState(() => (g.weightGrams == null ? "" : imperial ? `${round(gToOz(g.weightGrams), 1)} oz` : `${g.weightGrams} g`));
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (p: Partial<GearItem>) => setG((x) => ({ ...x, ...p }));

  const save = () => {
    const e: Record<string, string> = {};
    if (!g.name.trim()) e.name = "Give the item a name.";
    let grams: number | null = null;
    if (weightText.trim()) {
      const raw = weightText.trim();
      grams = /^\d+(?:[.,]\d+)?$/.test(raw) ? parseWeight(`${raw} ${imperial ? "oz" : "g"}`) : parseWeight(raw);
      if (grams == null || grams < 0 || grams > 50000) e.weight = 'Enter a weight like "650 g", "1.2 kg", "23 oz" or "1 lb 4 oz".';
    }
    if (!(g.quantity >= 1 && g.quantity <= 99)) e.qty = "Quantity must be 1–99.";
    setErr(e);
    if (Object.keys(e).length) return;
    const weightChanged = grams !== item?.weightGrams;
    const out: GearItem = {
      ...g,
      name: g.name.trim(),
      weightGrams: grams,
      weightProvenance: weightChanged ? (grams == null ? prov("unverified", { note: "Weight not entered" }) : prov("user")) : g.weightProvenance,
      updatedAt: new Date().toISOString(),
    };
    if (item) actions.updateGear(item.id, out);
    else actions.addGear([out]);
    toast(item ? `Saved ${out.name}` : `Added ${out.name}`);
    onSaved?.(out);
    onClose();
  };

  return (
    <Modal title={item ? "Edit item" : "Add item"} onClose={onClose} wide>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid grid-2">
          <label className="field">
            Name
            <input className="input" value={g.name} onChange={(e) => set({ name: e.target.value })} aria-invalid={err.name ? true : undefined} />
            {err.name && <span className="err">{err.name}</span>}
          </label>
          <label className="field">
            Category
            <select
              className="input"
              value={g.category}
              onChange={(e) => {
                const c = e.target.value as GearCategory;
                set({ category: c, weightClass: item ? g.weightClass : defaultWeightClass(c), shareable: item ? g.shareable : defaultShareable(c) });
              }}
            >
              {GEAR_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {GEAR_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Brand
            <input className="input" value={g.brand ?? ""} onChange={(e) => set({ brand: e.target.value || undefined })} />
          </label>
          <label className="field">
            Model
            <input className="input" value={g.model ?? ""} onChange={(e) => set({ model: e.target.value || undefined })} />
          </label>
          <label className="field">
            Weight of one
            <input className="input" value={weightText} placeholder={imperial ? "e.g. 23 oz or 1 lb 4 oz" : "e.g. 650 g or 1.2 kg"} onChange={(e) => setWeightText(e.target.value)} aria-invalid={err.weight ? true : undefined} />
            {err.weight ? <span className="err">{err.weight}</span> : <span className="tiny muted">A plain number is read as {imperial ? "ounces" : "grams"}. Weigh it yourself if you can — listed weights are often optimistic.</span>}
          </label>
          <NumField label="Quantity" value={g.quantity} onChange={(v) => set({ quantity: v ?? 1 })} min={1} max={99} step={1} />
          <NumField label="Purchase price (optional)" value={g.purchasePrice ?? null} onChange={(v) => set({ purchasePrice: v ?? undefined })} min={0} max={100000} />
          <label className="field">
            Currency
            <input className="input" value={g.currency ?? settings.currency} maxLength={3} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} />
          </label>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field" style={{ marginBottom: 6, fontWeight: 600, color: "var(--ink-2)", fontSize: "0.875rem" }}>
            How it's carried
          </legend>
          <div className="seg" role="group">
            {(
              [
                ["base", "Carried in the pack"],
                ["worn", "Worn"],
                ["consumable", "Consumable"],
              ] as const
            ).map(([k, l]) => (
              <button type="button" key={k} aria-pressed={g.weightClass === k} onClick={() => set({ weightClass: k })}>
                {l}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="row" style={{ gap: 20 }}>
          <label className="check">
            <input type="checkbox" checked={g.essential} onChange={(e) => set({ essential: e.target.checked })} /> Essential
          </label>
          <label className="check">
            <input type="checkbox" checked={g.shareable} onChange={(e) => set({ shareable: e.target.checked })} /> Usually shared in a group
          </label>
          <label className="check">
            <input type="checkbox" checked={g.owned} onChange={(e) => set({ owned: e.target.checked })} /> I own this
          </label>
          <label className="check">
            <input type="checkbox" checked={g.favourite} onChange={(e) => set({ favourite: e.target.checked })} /> Favourite
          </label>
        </div>
        <label className="field">
          Notes
          <textarea className="input" rows={2} value={g.notes ?? ""} onChange={(e) => set({ notes: e.target.value || undefined })} />
        </label>
        <div className="row">
          {g.imageDataUrl && <img src={g.imageDataUrl} alt="" width={64} height={64} style={{ borderRadius: 8, objectFit: "cover" }} />}
          <label className="btn secondary sm" style={{ cursor: "pointer" }}>
            <Icon name="camera" size={16} /> {g.imageDataUrl ? "Change photo" : "Add photo"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  set({ imageDataUrl: await compressImage(file) });
                } catch (er) {
                  toast((er as Error).message, { tone: "error" });
                }
              }}
            />
          </label>
          {g.imageDataUrl && (
            <button type="button" className="btn ghost sm" onClick={() => set({ imageDataUrl: undefined })}>
              Remove photo
            </button>
          )}
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" type="submit">
            {item ? "Save changes" : "Add to library"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type Parsed = GearParse["items"][number] & { keep: boolean };

export function AiGearAdd({ onClose, onAdded }: { onClose: () => void; onAdded?: (items: GearItem[]) => void }) {
  const f = useFormat();
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [items, setItems] = useState<Parsed[] | null>(null);
  const [mode, setMode] = useState<"live" | "offline">("live");
  const [reply, setReply] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!text.trim() && !image) return;
    setBusy(true);
    setErr("");
    try {
      const res = await api<GearParse & { mode: "live" | "offline" }>("gear", { text: text.trim() || "Identify this item.", image });
      setItems(res.items.map((i) => ({ ...i, keep: true })));
      setMode(res.mode);
      setReply(res.reply);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const chosen = (items ?? []).filter((i) => i.keep && i.name.trim());
    const out = chosen.map((i) =>
      newGearItem({
        name: i.name.trim(),
        brand: i.brand ?? undefined,
        model: i.model ?? undefined,
        category: i.category,
        weightGrams: i.weightGrams,
        quantity: i.quantity,
        weightClass: i.weightClass,
        essential: i.essential,
        shareable: i.shareable,
        notes: i.notes ?? undefined,
        imageDataUrl: chosen.length === 1 ? image : undefined,
        weightProvenance: i.weightGrams != null ? prov("user", { note: "From your description" }) : prov("unverified", { note: "Weight not given" }),
      }),
    );
    actions.addGear(out);
    toast(`Added ${out.length} ${out.length === 1 ? "item" : "items"}`);
    onAdded?.(out);
    onClose();
  };

  return (
    <Modal title="Add gear by description" onClose={onClose} wide>
      {!items ? (
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>
            Describe one or more items in your own words, with weights if you know them. You can attach a photo to help identify an item — you'll still need to confirm the details.
          </p>
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'e.g. "Add my Montbell sleeping bag. It weighs 650 grams. Also a Sea to Summit Ultralight mat, 395 g, and two 1 L Smartwater bottles."'} aria-label="Gear description" />
          <div className="row">
            <button type="button" className="btn secondary sm" onClick={() => fileRef.current?.click()}>
              <Icon name="camera" size={16} /> {image ? "Change photo" : "Attach a photo"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setImage(await compressImage(file, 1024));
              }}
            />
            {image && <img src={image} alt="Attached item" width={48} height={48} style={{ borderRadius: 8, objectFit: "cover" }} />}
          </div>
          {err && <Notice tone="warn">{err}</Notice>}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn" onClick={run} disabled={busy || (!text.trim() && !image)}>
              {busy ? <Spinner /> : <Icon name="spark" size={18} />} {busy ? "Reading…" : "Read my gear"}
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          {mode === "offline" && <Notice tone="info">AI isn't connected on this server, so these were picked out with simple rules. Check each one.</Notice>}
          {image && mode === "offline" && <Notice tone="warn">Photo recognition needs the AI service, so the photo wasn't used.</Notice>}
          {reply && <p className="muted" style={{ margin: 0 }}>{reply}</p>}
          {items.length === 0 && <p>No items found. Go back and add a bit more detail.</p>}
          {items.map((it, i) => (
            <div key={i} className="card" style={{ padding: 14, opacity: it.keep ? 1 : 0.55 }}>
              <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <label className="check" style={{ paddingTop: 10 }}>
                  <input type="checkbox" checked={it.keep} onChange={(e) => setItems((l) => l!.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} aria-label={`Include ${it.name}`} />
                </label>
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", flex: 1, gap: 8 }}>
                  <label className="field">
                    Name
                    <input className="input sm" value={it.name} onChange={(e) => setItems((l) => l!.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  </label>
                  <label className="field">
                    Category
                    <select className="input sm" value={it.category} onChange={(e) => setItems((l) => l!.map((x, j) => (j === i ? { ...x, category: e.target.value as GearCategory } : x)))}>
                      {GEAR_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {GEAR_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <NumField small label="Weight (g)" value={it.weightGrams} onChange={(v) => setItems((l) => l!.map((x, j) => (j === i ? { ...x, weightGrams: v } : x)))} max={50000} />
                  <NumField small label="Qty" value={it.quantity} onChange={(v) => setItems((l) => l!.map((x, j) => (j === i ? { ...x, quantity: v ?? 1 } : x)))} min={1} max={99} />
                </div>
              </div>
              <div className="tiny muted" style={{ marginTop: 6, paddingLeft: 30 }}>
                {it.weightGrams != null ? `${f.w(it.weightGrams)} each` : "No weight given — you can add it later."}
                {it.needsConfirmation.length > 0 && <> · Please check: {it.needsConfirmation.join(", ")}</>}
              </div>
            </div>
          ))}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn ghost" onClick={() => setItems(null)}>
              Back
            </button>
            <button className="btn" onClick={save} disabled={!items.some((i) => i.keep)}>
              Add {items.filter((i) => i.keep).length} to library
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export { CATEGORY_COLORS };
