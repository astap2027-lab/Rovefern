import { useState } from "react";
import type { GearItem } from "../../lib/domain/types";
import { estimateMissingWeights } from "../lib/aiWeights";
import { toast } from "../lib/store";
import { Icon } from "./icons";
import { Spinner } from "./ui";

export function EstimateButton({ items }: { items: GearItem[] }) {
  const [busy, setBusy] = useState(false);
  if (!items.length) return null;
  return (
    <button
      className="btn secondary sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await estimateMissingWeights(items);
        } catch (e) {
          toast((e as Error).message, { tone: "error" });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner /> : <Icon name="spark" size={16} />} Estimate {items.length} {items.length === 1 ? "weight" : "weights"} with AI
    </button>
  );
}
