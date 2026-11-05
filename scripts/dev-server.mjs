// Local server: serves public/ with SPA fallback and runs api/*.js like Vercel would.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(import.meta.url);
const PORT = Number(process.env.PORT || 3000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };

// Load .env.local if present (ANTHROPIC_API_KEY etc.)
const envFile = path.join(root, ".env.local");
if (existsSync(envFile)) for (const line of readFileSync(envFile, "utf8").split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5).replace(/[^a-z-]/g, "");
    const file = path.join(root, "api", `${name}.js`);
    if (!existsSync(file)) { res.statusCode = 404; return res.end('{"error":"Not found"}'); }
    delete require.cache[file];
    return require(file)(req, res);
  }
  let p = path.join(root, "public", decodeURIComponent(url.pathname));
  if (!p.startsWith(path.join(root, "public"))) { res.statusCode = 403; return res.end(); }
  if (!existsSync(p) || statSync(p).isDirectory()) p = path.join(root, "public", "index.html");
  res.setHeader("content-type", TYPES[path.extname(p)] ?? "application/octet-stream");
  res.end(readFileSync(p));
}).listen(PORT, () => console.log(`Rovefern on http://localhost:${PORT} (AI: ${process.env.ANTHROPIC_API_KEY ? "live" : "offline"})`));
