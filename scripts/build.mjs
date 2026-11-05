// Builds the static web app into public/assets and the API routes into api/*.js (Vercel functions).
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const watch = process.argv.includes("--watch");
const r = (...p) => path.join(root, ...p);

const leafletPlugin = {
  name: "leaflet-src",
  setup(b) {
    // Leaflet's package points at a dist file; bundle its ES module source instead.
    b.onResolve({ filter: /^leaflet$/ }, () => ({ path: r("node_modules/leaflet/src/Leaflet.js") }));
  },
};

mkdirSync(r("public/assets"), { recursive: true });
cpSync(r("node_modules/leaflet/dist/leaflet.css"), r("public/assets/leaflet.css"));
cpSync(r("node_modules/leaflet/dist/images"), r("public/assets/images"), { recursive: true });

const web = {
  entryPoints: [r("src/web/main.tsx")],
  bundle: true,
  outfile: r("public/assets/app.js"),
  format: "esm",
  target: ["es2020", "chrome90", "firefox90", "safari15"],
  jsx: "automatic",
  minify: !watch && !process.env.NOMINIFY,
  sourcemap: watch ? "inline" : false,
  define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production") },
  plugins: [leafletPlugin],
  logLevel: "info",
  legalComments: "none",
};

const routes = readdirSync(r("src/server/routes")).filter((f) => f.endsWith(".ts"));
rmSync(r("api"), { recursive: true, force: true });
mkdirSync(r("api"));
const api = {
  entryPoints: routes.map((f) => r("src/server/routes", f)),
  bundle: true,
  outdir: r("api"),
  platform: "node",
  target: "node20",
  format: "cjs",
  footer: { js: "module.exports = module.exports.default;" },
  logLevel: "info",
  legalComments: "none",
};

// Cloudflare Worker bundle (Web-standard runtime, no Node APIs).
const worker = {
  entryPoints: [r("src/worker.ts")],
  bundle: true,
  outfile: r("worker/index.js"),
  format: "esm",
  platform: "browser",
  conditions: ["worker", "browser"],
  target: "es2022",
  minify: !watch && !process.env.NOMINIFY,
  logLevel: "info",
  legalComments: "none",
};

function stampServiceWorker() {
  // Bump the cache name whenever the app bundle changes so clients pick up new versions.
  const hash = createHash("sha1").update(readFileSync(r("public/assets/app.js"))).update(readFileSync(r("public/styles.css"))).digest("hex").slice(0, 10);
  const sw = readFileSync(r("scripts/sw.template.js"), "utf8").replace("__VERSION__", hash);
  writeFileSync(r("public/sw.js"), sw);
}

if (watch) {
  const c1 = await esbuild.context(web);
  const c2 = await esbuild.context(api);
  const c3 = await esbuild.context(worker);
  await Promise.all([c1.watch(), c2.watch(), c3.watch()]);
} else {
  await Promise.all([esbuild.build(web), esbuild.build(api), esbuild.build(worker)]);
  stampServiceWorker();
}
