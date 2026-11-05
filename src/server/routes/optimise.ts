import { z } from "zod/v4";
import { aiEnabled, structuredCall } from "../anthropic";
import { nodeHandler } from "../http";
import { optimiseSystem } from "../prompts";
import { OptimiseSchema } from "../schemas";

const Body = z.object({ snapshot: z.unknown() });

export async function run(input: unknown): Promise<unknown> {
  const body = Body.parse(input);
  if (!aiEnabled()) return ({ mode: "offline", summary: "", suggestions: [] });
  const result = await structuredCall({
    system: optimiseSystem(),
    messages: [{ role: "user", content: `Trip and gear (JSON):\n${JSON.stringify(body.snapshot ?? {}).slice(0, 50_000)}` }],
    toolName: "gear_suggestions",
    toolDescription: "Weight-saving suggestions for this trip's gear.",
    schema: OptimiseSchema,
    maxTokens: 5000,
  });
  return { mode: "live", ...result };
}

export default nodeHandler(run);
