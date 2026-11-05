import { z } from "zod/v4";
import { aiEnabled, structuredCall } from "../anthropic";
import { nodeHandler } from "../http";
import { WEIGHT_ESTIMATE_SYSTEM } from "../prompts";
import { WeightEstimateSchema } from "../schemas";

const Body = z.object({
  items: z
    .array(z.object({ gearId: z.string().max(80), name: z.string().max(160), brand: z.string().max(80).optional(), model: z.string().max(80).optional(), category: z.string().max(40) }))
    .min(1)
    .max(60),
});

export async function run(input: unknown): Promise<unknown> {
  const body = Body.parse(input);
  if (!aiEnabled()) return { mode: "offline", estimates: [] };
  const result = await structuredCall({
    system: WEIGHT_ESTIMATE_SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(body.items) }],
    toolName: "weight_estimates",
    toolDescription: "Estimated weight for each item.",
    schema: WeightEstimateSchema,
    maxTokens: 4000,
  });
  const ids = new Set(body.items.map((i) => i.gearId));
  return { mode: "live", estimates: result.estimates.filter((e) => ids.has(e.gearId)) };
}

export default nodeHandler(run);
