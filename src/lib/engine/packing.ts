import type { PackZone } from "../domain/types";
import type { ResolvedItem } from "./weight";

export const ZONE_INFO: Record<PackZone, { title: string; guidance: string }> = {
  bottom: {
    title: "Bottom",
    guidance:
      "Bulky, light things you won't need until camp — sleeping bag, inflatable mat, sleep clothes. They form a soft base and keep weight off the bottom of your spine.",
  },
  core: {
    title: "Middle, against your back",
    guidance:
      "The heaviest items — food bag, cook kit, water reservoir, tent body. Keep them close to your spine and between your shoulder blades so the load sits over your hips instead of pulling you backwards.",
  },
  top: {
    title: "Top",
    guidance:
      "Things you might need during the day — insulating layer, first aid kit, water treatment, toilet kit, headlamp.",
  },
  outer: {
    title: "Outer & hip-belt pockets",
    guidance:
      "Grab-without-stopping items — water bottles, snacks, map and compass, phone, sunscreen, rain jacket.",
  },
  dry: {
    title: "Dry bags & separate storage",
    guidance:
      "Electronics, spare batteries and anything that must stay dry go in a dry bag. Keep a wet tent fly or rain gear separate from dry insulation.",
  },
  worn: { title: "Worn", guidance: "Worn while walking — not packed." },
  pack: { title: "The pack itself", guidance: "Your backpack." },
};

export const ZONE_ORDER: PackZone[] = ["bottom", "core", "top", "outer", "dry"];

/** Default zone for an item based on category, weight class and weight. */
export function defaultZone(item: Pick<ResolvedItem, "category" | "weightClass" | "unitGrams" | "name">): PackZone {
  if (item.weightClass === "worn") return "worn";
  const name = item.name.toLowerCase();
  switch (item.category) {
    case "backpack":
      return "pack";
    case "sleeping_bag":
      return "bottom";
    case "sleeping_mat":
      // Closed-cell foam mats usually ride outside; inflatables go in the bottom.
      return /foam|z.?lite|ccf|closed.?cell/.test(name) ? "outer" : "bottom";
    case "food":
    case "cooking":
    case "cookware":
    case "fuel":
    case "shelter":
      return "core";
    case "water_bottle":
      return /bladder|reservoir|hydration/.test(name) ? "core" : "outer";
    case "navigation":
      return "outer";
    case "electronics":
      return /phone|gps|watch|beacon|plb|inreach|satellite/.test(name) ? "outer" : "dry";
    case "clothing":
      return /rain|shell|waterproof/.test(name) ? "outer" : /sleep|thermal|base ?layer/.test(name) ? "bottom" : "top";
    case "first_aid":
    case "water_filter":
    case "lighting":
    case "toiletries":
      return "top";
    case "safety":
      return /plb|beacon|whistle|inreach/.test(name) ? "outer" : "top";
    default:
      return (item.unitGrams ?? 0) >= 800 ? "core" : "top";
  }
}

export interface PackLayout {
  zones: { zone: PackZone; items: (ResolvedItem & { zone: PackZone })[]; grams: number }[];
  /** Share of carried base weight in the core zone; higher is better for stability. */
  corePercent: number;
  tips: string[];
}

export function layoutPack(items: ResolvedItem[], overrides: Record<string, PackZone | undefined> = {}): PackLayout {
  const placed = items.map((it) => ({ ...it, zone: overrides[it.entryId] ?? defaultZone(it) }));
  const zones = ZONE_ORDER.map((zone) => {
    const zi = placed.filter((p) => p.zone === zone).sort((a, b) => b.totalGrams - a.totalGrams);
    return { zone, items: zi, grams: zi.reduce((s, i) => s + i.totalGrams, 0) };
  });
  const packedGrams = zones.reduce((s, z) => s + z.grams, 0);
  const core = zones.find((z) => z.zone === "core")?.grams ?? 0;
  const corePercent = packedGrams > 0 ? Math.round((core / packedGrams) * 100) : 0;

  const tips: string[] = [];
  const heavyOutside = placed.filter((p) => (p.zone === "top" || p.zone === "outer") && p.totalGrams >= 700);
  for (const h of heavyOutside) {
    tips.push(`${h.name} is heavy (${Math.round(h.totalGrams)} g) for the ${ZONE_INFO[h.zone].title.toLowerCase()} — consider moving it to the middle, close to your back.`);
  }
  if (placed.some((p) => p.category === "fuel") && placed.some((p) => p.category === "food")) {
    tips.push("Store fuel upright and below or away from food so a leak can't contaminate it.");
  }
  if (!placed.some((p) => p.category === "first_aid")) tips.push("No first-aid kit on this list yet.");
  if (!placed.some((p) => p.category === "lighting")) tips.push("No headlamp or torch on this list yet.");
  tips.push("Tighten compression straps after packing so the load can't shift while you walk.");
  return { zones, corePercent, tips };
}

export function packingProgress(items: { packed: boolean }[]): { packed: number; total: number; percent: number } {
  const total = items.length;
  const packed = items.filter((i) => i.packed).length;
  return { packed, total, percent: total ? Math.round((packed / total) * 100) : 0 };
}
