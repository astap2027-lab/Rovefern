/**
 * Cloudflare Worker entry. Static files in public/ are served by Cloudflare's asset
 * handling (with single-page-app fallback); only /api/* reaches this code.
 */
import { setRuntimeEnv } from "./server/anthropic";
import { webHandler, type Run } from "./server/http";
import { run as assistant } from "./server/routes/assistant";
import { run as gear } from "./server/routes/gear";
import { run as health } from "./server/routes/health";
import { run as optimise } from "./server/routes/optimise";
import { run as plan } from "./server/routes/plan";

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  [key: string]: unknown;
}

const ROUTES: Record<string, Run> = { assistant, gear, health, optimise, plan };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const route = ROUTES[url.pathname.slice(5).replace(/\/$/, "")];
      if (!route) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "content-type": "application/json" } });
      setRuntimeEnv(env);
      return webHandler(route, request);
    }
    return env.ASSETS.fetch(request);
  },
};
