/**
 * Runtime adapters. Each API route exports `run(input)`, which knows nothing about the
 * hosting platform. These helpers wrap it for Node (local dev server, Vercel) and for
 * Web-standard runtimes (Cloudflare Workers).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { AIError } from "./anthropic";

export type Run = (input: unknown) => Promise<unknown>;
const MAX_BODY = 200_000;

/** Map any thrown error to an HTTP status and a safe message. */
export function errorResponse(e: unknown): { status: number; body: { error: string } } {
  if (e instanceof AIError) return { status: e.status, body: { error: e.message } };
  if (e instanceof SyntaxError) return { status: 400, body: { error: "Invalid JSON." } };
  if (e instanceof z.ZodError) return { status: 400, body: { error: "The request was missing something or had an invalid value." } };
  console.error(e);
  return { status: 500, body: { error: "Something went wrong on the server." } };
}

// Best-effort per-instance rate limit to protect the API key from abuse.
const hits = new Map<string, number[]>();
export function rateLimited(ip: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > limit;
}

const TOO_MANY = { error: "Too many requests. Wait a minute and try again." };

// ---- Node (dev server, Vercel) --------------------------------------------------
type Req = IncomingMessage & { body?: unknown };

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

async function readNodeJson(req: Req): Promise<unknown> {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Uint8Array).length;
    if (size > MAX_BODY) throw new AIError("Request is too large.", 413);
    chunks.push(c as Uint8Array);
  }
  const raw = new TextDecoder().decode(Buffer.concat(chunks));
  return raw ? JSON.parse(raw) : {};
}

export function nodeHandler(run: Run) {
  return async (req: Req, res: ServerResponse) => {
    try {
      if (req.method !== "POST" && req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
      const fwd = req.headers["x-forwarded-for"];
      const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
      if (rateLimited(ip)) return send(res, 429, TOO_MANY);
      const input = req.method === "POST" ? await readNodeJson(req) : {};
      send(res, 200, await run(input));
    } catch (e) {
      const r = errorResponse(e);
      send(res, r.status, r.body);
    }
  };
}

// ---- Web standard (Cloudflare Workers) -----------------------------------------
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function webHandler(run: Run, request: Request): Promise<Response> {
  try {
    if (request.method !== "POST" && request.method !== "GET") return json(405, { error: "Method not allowed" });
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    if (rateLimited(ip)) return json(429, TOO_MANY);
    let input: unknown = {};
    if (request.method === "POST") {
      const raw = await request.text();
      if (raw.length > MAX_BODY) throw new AIError("Request is too large.", 413);
      input = raw ? JSON.parse(raw) : {};
    }
    return json(200, await run(input));
  } catch (e) {
    const r = errorResponse(e);
    return json(r.status, r.body);
  }
}

export const clip = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
