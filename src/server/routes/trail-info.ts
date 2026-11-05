import { z } from "zod/v4";
import { aiEnabled, structuredCall, type Source } from "../anthropic";
import { nodeHandler } from "../http";
import { TRAIL_INFO_SYSTEM } from "../prompts";
import { TrailInfoSchema } from "../schemas";

const Body = z.object({
  name: z.string().min(1).max(160),
  region: z.string().max(200).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  lengthKm: z.number().min(0).max(5000).nullable().optional(),
  tags: z.record(z.string(), z.string().max(500)).optional(),
});

export async function run(input: unknown): Promise<unknown> {
  const body = Body.parse(input);
  if (!aiEnabled()) return { mode: "offline", info: null, sources: [] };
  const sources: Source[] = [];
  const facts = [
    `Trail: ${body.name}`,
    body.region && `Area: ${body.region}`,
    body.lat != null && `Location: ${body.lat.toFixed(4)}, ${body.lon?.toFixed(4)}`,
    body.lengthKm != null && `Mapped length on OpenStreetMap: ${body.lengthKm.toFixed(1)} km`,
    body.tags && `OpenStreetMap tags: ${JSON.stringify(body.tags).slice(0, 1500)}`,
  ]
    .filter(Boolean)
    .join("\n");
  const info = await structuredCall({
    system: TRAIL_INFO_SYSTEM,
    messages: [{ role: "user", content: facts }],
    toolName: "trail_info",
    toolDescription: "A practical planning summary of this trail.",
    schema: TrailInfoSchema,
    maxTokens: 5000,
    webSearch: { maxUses: 4 },
    sources,
  });
  return { mode: "live", info, sources: sources.slice(0, 10), retrievedAt: new Date().toISOString() };
}

export default nodeHandler(run);
