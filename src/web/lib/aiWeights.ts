import type { WeightEstimate } from "../../server/schemas";
import type { GearItem } from "../../lib/domain/types";
import { prov } from "../../lib/engine/factory";
import { api } from "./api";
import { actions, toast } from "./store";

/**
 * Ask the AI to estimate weights for items that have none. Estimates are labelled
 * "AI suggestion" with the basis, and totals are still calculated by the app.
 */
export async function estimateMissingWeights(items: GearItem[]): Promise<number> {
  const missing = items.filter((g) => g.weightGrams == null || g.weightProvenance.kind === "estimate" || g.weightProvenance.kind === "unverified").slice(0, 60);
  if (!missing.length) {
    toast("Every item already has a weight.");
    return 0;
  }
  const res = await api<WeightEstimate & { mode: string }>("weights", {
    items: missing.map((g) => ({ gearId: g.id, name: g.name, brand: g.brand, model: g.model, category: g.category })),
  });
  if (res.mode === "offline") {
    toast("Weight estimates need the AI service, which isn't connected on this server.", { tone: "error" });
    return 0;
  }
  for (const e of res.estimates) {
    actions.updateGear(e.gearId, {
      weightGrams: Math.round(e.weightGrams),
      weightProvenance: prov("ai", { note: `${e.basis} (${e.confidence} confidence). Weigh yours to make totals exact.` }),
    });
  }
  toast(`Estimated weights for ${res.estimates.length} ${res.estimates.length === 1 ? "item" : "items"}`);
  return res.estimates.length;
}
