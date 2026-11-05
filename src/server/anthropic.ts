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

const schemaCache = new WeakMap<z.ZodType, Record<string, unknown>>();
function toolSchema(schema: z.ZodType): Record<string, unknown> {
  const hit = schemaCache.get(schema);
  if (hit) return hit;
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  delete json.$schema;
  schemaCache.set(schema, json);
  return json;
}

/**
 * Ask the model to answer by calling a single tool whose input matches `schema`.
 * Returns the validated tool input.
 */
export interface Source {
  title: string;
  url: string;
}

/**
 * Ask the model to answer by calling a single tool whose input matches `schema`, optionally
 * letting it search the web first. Returns the validated tool input. Web pages it read are
 * pushed into `opts.sources` so the UI can link them.
 */
export async function structuredCall<S extends z.ZodType>(opts: {
  system: string;
  messages: ChatMessage[];
  toolName: string;
  toolDescription: string;
  schema: S;
  maxTokens?: number;
  webSearch?: { maxUses: number };
  sources?: Source[];
}): Promise<z.infer<S>> {
  const key = getEnv("ANTHROPIC_API_KEY");
  if (!key) throw new AIError("AI is not configured on this server.", 503);

  const system = `${opts.system}\n\nWhen you're ready, respond by calling the ${opts.toolName} tool exactly once with your complete answer. Don't reply with plain text.`;
  const messages: { role: string; content: unknown }[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));
  const tools: Record<string, unknown>[] = [{ name: opts.toolName, description: opts.toolDescription, input_schema: toolSchema(opts.schema) }];
  if (opts.webSearch && getEnv("DISABLE_WEB_SEARCH") !== "1") {
    tools.push({
      type: "web_search_20250305",
      name: "web_search",
      max_uses: opts.webSearch.maxUses,
      user_location: { type: "approximate", country: "AU", timezone: "Australia/Sydney" },
    });
  }

  let nudged = false;
  // Loop: the model may pause mid-search (pause_turn) or answer in text instead of the tool.
  for (let step = 0; step < 5; step++) {
    const data = await callApi(key, { model: MODEL(), max_tokens: opts.maxTokens ?? 4096, system, messages, tools, tool_choice: { type: "auto" } });
    collectSources(data.content ?? [], opts.sources);

    if (data.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: data.content });
      continue;
    }
    const block = data.content?.find((c) => c.type === "tool_use" && c.name === opts.toolName);
    let input: unknown = block?.input;
    if (!block) {
      const text = data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          input = JSON.parse(m[0]);
        } catch {
          /* not JSON */
        }
      }
      if (input === undefined) {
        if (data.stop_reason === "max_tokens") throw new AIError("The AI's answer was too long and got cut off. Try a shorter request.", 502);
        if (!nudged) {
          nudged = true;
          messages.push({ role: "assistant", content: data.content?.length ? data.content : "(no answer)" });
          messages.push({ role: "user", content: `Please give your answer now by calling the ${opts.toolName} tool.` });
          continue;
        }
        throw new AIError("The AI didn't return a usable answer. Try again.", 502);
      }
    }
    const parsed = opts.schema.safeParse(input);
    if (!parsed.success) {
      console.error("AI output failed validation", JSON.stringify(parsed.error.issues).slice(0, 1000));
      if (data.stop_reason === "max_tokens") throw new AIError("The AI's answer was too long and got cut off. Try a shorter request.", 502);
      throw new AIError("The AI's answer didn't pass validation, so nothing was changed. Try rephrasing.", 502);
    }
    return parsed.data;
  }
  throw new AIError("The AI took too many steps. Try a simpler request.", 502);
}

function collectSources(content: ApiContent[], sink?: Source[]) {
  if (!sink) return;
  for (const c of content) {
    if (c.type === "web_search_tool_result" && Array.isArray(c.content)) {
      for (const r of c.content as { type?: string; url?: string; title?: string }[]) {
        if (r.type === "web_search_result" && r.url && !sink.some((s) => s.url === r.url)) sink.push({ title: r.title || r.url, url: r.url });
      }
    }
  }
}

type ApiContent = { type: string; name?: string; input?: unknown; text?: string; content?: unknown };

async function callApi(key: string, body: Record<string, unknown>): Promise<{ content?: ApiContent[]; stop_reason?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let res: Response;
  try {
    res = await fetch(`${getEnv("ANTHROPIC_BASE_URL") || "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new AIError(controller.signal.aborted ? "The AI took too long to respond. Try again." : "Couldn't reach the AI service.", 504);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Anthropic error", res.status, text.slice(0, 500));
    if (res.status === 429) throw new AIError("The AI is busy right now. Wait a moment and try again.", 429);
    if (res.status === 401) throw new AIError("The server's AI key was rejected. Check the ANTHROPIC_API_KEY secret.", 502);
    if (res.status === 529) throw new AIError("The AI service is overloaded right now. Try again in a minute.", 503);
    // Anthropic's error messages explain the cause (low credit, unknown model, etc.) and contain no secrets.
    let detail = "";
    try {
      detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      /* not JSON */
    }
    throw new AIError(`The AI service returned an error (${res.status})${detail ? `: ${detail.slice(0, 300)}` : "."}`, 502);
  }
  return (await res.json()) as { content?: ApiContent[]; stop_reason?: string };
}

