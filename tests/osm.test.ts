import { test } from "node:test";
import assert from "node:assert/strict";
import { capBbox, chainSegments, expandBbox, parseTaggedKm, rankTrails, resample, trailsFromOverpass, osmUrl } from "../src/web/lib/osm";

test("parses tagged distances", () => {
  assert.equal(parseTaggedKm("26"), 26);
  assert.equal(parseTaggedKm("26 km"), 26);
  assert.equal(parseTaggedKm("4,5 km"), 4.5);
  assert.equal(parseTaggedKm("800 m"), 0.8);
  assert.ok(Math.abs(parseTaggedKm("10 mi")! - 16.09) < 0.01);
  assert.equal(parseTaggedKm(undefined), null);
});

test("builds trails from Overpass: routes plus named tracks, without double counting", () => {
  const data = {
    elements: [
      { type: "relation" as const, id: 1, tags: { name: "The Coast Track", route: "hiking", network: "rwn", distance: "26" }, center: { lat: -34.1, lon: 151.1 }, members: [{ type: "way", ref: 10, role: "" }] },
      { type: "way" as const, id: 10, tags: { name: "The Coast Track", highway: "path" }, geometry: [{ lat: -34.1, lon: 151.1 }, { lat: -34.11, lon: 151.1 }] },
      { type: "way" as const, id: 20, tags: { name: "Wattamolla Walk", highway: "path" }, geometry: [{ lat: -34.13, lon: 151.11 }, { lat: -34.14, lon: 151.11 }] },
      { type: "way" as const, id: 21, tags: { name: "Wattamolla Walk", highway: "path" }, geometry: [{ lat: -34.14, lon: 151.11 }, { lat: -34.15, lon: 151.11 }] },
      { type: "way" as const, id: 30, tags: { name: "Tiny Path", highway: "path" }, geometry: [{ lat: -34.2, lon: 151.1 }, { lat: -34.2001, lon: 151.1 }] },
    ],
  };
  const trails = trailsFromOverpass(data as unknown as Parameters<typeof trailsFromOverpass>[0]);
  assert.equal(trails.length, 2);
  const route = trails.find((t) => t.kind === "route")!;
  assert.equal(route.taggedKm, 26);
  const track = trails.find((t) => t.kind === "track")!;
  assert.equal(track.name, "Wattamolla Walk");
  assert.ok(Math.abs(track.lengthKm! - 2.22) < 0.05);
  assert.equal(track.key, "ways/20,21");
  assert.equal(osmUrl(track.key), "https://www.openstreetmap.org/way/20");
  assert.equal(rankTrails(trails, "coast track")[0].name, "The Coast Track");
});

test("chains unordered, reversed segments into one line and resamples", () => {
  const a = [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }];
  const b = [{ lat: 0, lon: 3 }, { lat: 0, lon: 2 }]; // reversed and out of order
  const c = [{ lat: 0, lon: 1 }, { lat: 0, lon: 2 }];
  const line = chainSegments([a, b, c]);
  assert.deepEqual(line.map((p) => p.lon), [0, 1, 1, 2, 2, 3]);
  const r = resample(line, 4);
  assert.equal(r.length, 4);
  assert.ok(Math.abs(r[3].lon - 3) < 1e-9);
});

test("bounding boxes are widened, capped and kept in Australia", () => {
  const small = expandBbox({ s: -33.71, n: -33.70, w: 150.30, e: 150.31 }, 25);
  assert.ok(small.n - small.s > 0.2);
  const big = capBbox({ s: -38, n: -28, w: 140, e: 154 });
  assert.ok(big.n - big.s <= 1.6 + 1e-9);
});
