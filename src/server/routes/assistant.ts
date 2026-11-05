import { z } from "zod/v4";
import { aiEnabled, structuredCall, type ChatMessage, type Source } from "../anthropic";
import { clip, nodeHandler } from "../http";
import { assistantSystem } from "../prompts";
import { AssistantResponseSchema } from "../schemas";

const Body = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(3000) })).max(20).default([]),
  snapshot: z.unknown(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function run(input: unknown): Promise<unknown> {
  const body = Body.parse(input);
  if (!aiEnabled()) {
    return ({
      mode: "offline",
      reply: "The AI assistant isn't connected on this server, so I can't make changes from chat. You can still edit every part of the trip directly — the totals update automatically.",
      ops: [],
    });
  }
  const snapshot = JSON.stringify(body.snapshot ?? {}).slice(0, 60_000);
  const history: ChatMessage[] = body.history.map((m) => ({ role: m.role, content: clip(m.content, 3000) }));
  while (history.length && history[0].role !== "user") history.shift();
  const messages: ChatMessage[] = [
    ...history,
    { role: "user", content: `Current trip snapshot (JSON):\n${snapshot}\n\nRequest: ${body.message}` },
  ];
  // Collapse consecutive same-role messages (API requires alternation).
  const merged: ChatMessage[] = [];
  for (const m of messages) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content;
    else merged.push({ ...m });
  }
  const sources: Source[] = [];
  const result = await structuredCall({
    system: assistantSystem(body.today ?? new Date().toISOString().slice(0, 10)),
    messages: merged,
    toolName: "update_trip",
    toolDescription: "Reply to the user and list the validated operations to apply to their trip.",
    schema: AssistantResponseSchema,
    maxTokens: 10000,
    webSearch: { maxUses: 3 },
    sources,
  });
  return { mode: "live", ...result, sources: sources.slice(0, 8) };
}

export default nodeHandler(run);
