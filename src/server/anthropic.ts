/**
 * Minimal Anthropic Messages API client (no SDK dependency).
 * The API key is read from server-side environment variables only.
 */
import { z } from "zod/v4";

type Env = Record<string, unknown>;
let runtimeEnv: Env | null = null;

/** Cloudflare Workers pass configuration per request instead of through process.env. */
export function setRuntimeEnv(env: Env) {
  runtimeEnv = env;
}

function getEnv(key: string): string | undefined {
  const v = runtimeEnv?.[key] ?? (typeof process !== "undefined" ? process.env?.[key] : undefined);
  return typeof v === "string" && v ? v : undefined;
}

export const MODEL = () => getEnv("ANTHROPIC_MODEL") || "claude-sonnet-5-5";
export const aiEnabled = () => Boolean(getEnv("ANTHROPIC_API_KEY"));

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export class AIError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

function toolSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/**
 * Ask the model to answer by calling a single tool whose input matches `schema`.
 * Returns the validated tool input.
 */
export async function structuredCall<S extends z.ZodType>(opts: {
  system: string;
  messages: ChatMessage[];
  toolName: string;
  toolDescription: string;
  schema: S;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const key = getEnv("ANTHROPIC_API_KEY");
  if (!key) throw new AIError("AI is not configured on this server.", 503);

  const body = {
    model: MODEL(),
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
    tools: [{ name: opts.toolName, description: opts.toolDescription, input_schema: toolSchema(opts.schema) }],
    tool_choice: { type: "tool", name: opts.toolName },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  let res: Response;
  try {
    res = await fetch(`${getEnv("ANTHROPIC_BASE_URL") || "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    throw new AIError(controller.signal.aborted ? "The AI took too long to respond. Try again." : "Couldn't reach the AI service.", 504);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Anthropic error", res.status, text.slice(0, 500));
    if (res.status === 429) throw new AIError("The AI is busy right now. Wait a moment and try again.", 429);
    if (res.status === 401) throw new AIError("The server's AI key was rejected.", 502);
    throw new AIError("The AI service returned an error.", 502);
  }

  const data = (await res.json()) as { content?: { type: string; name?: string; input?: unknown }[]; stop_reason?: string };
  const block = data.content?.find((c) => c.type === "tool_use" && c.name === opts.toolName);
  if (!block) throw new AIError("The AI didn't return a usable answer.", 502);
  const parsed = opts.schema.safeParse(block.input);
  if (!parsed.success) {
    console.error("AI output failed validation", JSON.stringify(parsed.error.issues).slice(0, 1000));
    if (data.stop_reason === "max_tokens") throw new AIError("The AI's answer was too long and got cut off. Try a shorter request.", 502);
    throw new AIError("The AI's answer didn't pass validation, so nothing was changed. Try rephrasing.", 502);
  }
  return parsed.data;
}
