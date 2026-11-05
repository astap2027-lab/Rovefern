import { GEAR_CATEGORY_LABELS, type GearCategory } from "../../lib/domain/types";
import { useFormat } from "./ui";

/** Muted, distinguishable earthy palette for weight categories. */
export const CATEGORY_COLORS: Record<GearCategory, string> = {
  backpack: "#1f3b2c",
  shelter: "#2e5440",
  sleeping_bag: "#5a5f2e",
  sleeping_mat: "#8a9467",
  clothing: "#a8875a",
  footwear: "#6b5139",
  cooking: "#93441f",
  cookware: "#b86c42",
  water_bottle: "#34556a",
  water_filter: "#5f8398",
  electronics: "#4d4a63",
  lighting: "#c2a23f",
  navigation: "#3f6b5c",
  first_aid: "#a3423f",
  safety: "#7a2e2b",
  food: "#c9a46b",
  fuel: "#7a5a12",
  toiletries: "#9aa38a",
  misc: "#7a7d73",
};

export function WeightBreakdown({ rows }: { rows: { category: GearCategory; grams: number; percent: number }[] }) {
  const f = useFormat();
  const total = rows.reduce((s, r) => s + r.grams, 0);
  if (!total) return <p className="small muted">Add weights to your items to see the breakdown.</p>;
  return (
    <div>
      <div className="stackbar" role="img" aria-label={rows.map((r) => `${GEAR_CATEGORY_LABELS[r.category]} ${r.percent}%`).join(", ")}>
        {rows.map((r) => (
          <span key={r.category} style={{ width: `${(r.grams / total) * 100}%`, background: CATEGORY_COLORS[r.category] }} title={`${GEAR_CATEGORY_LABELS[r.category]}: ${f.w(r.grams)}`} />
        ))}
      </div>
      <table className="table" style={{ marginTop: 12 }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.category}>
              <td>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: CATEGORY_COLORS[r.category], marginRight: 8 }} />
                {GEAR_CATEGORY_LABELS[r.category]}
              </td>
              <td className="r">{f.w(r.grams)}</td>
              <td className="r muted">{r.percent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
