import { useMemo, useState } from "react";
import { TRAILS, findTrail, type Trail } from "../../lib/domain/trails";
import { Icon } from "../components/icons";
import { MapView } from "../components/MapView";
import { TrailCard } from "../components/TrailCard";
import { CommonsPhoto, Empty, Notice, PhotoCredit, ProvBadge, useFormat } from "../components/ui";
import { trailProv } from "../lib/buildTrip";
import { Link, useTitle } from "../router";
import { TrailSearch } from "./TrailSearch";

const DURATIONS = [
  { k: "any", label: "Any length" },
  { k: "short", label: "1–2 days", test: (d: number) => d <= 2 },
  { k: "mid", label: "3–5 days", test: (d: number) => d >= 3 && d <= 5 },
  { k: "long", label: "6–10 days", test: (d: number) => d >= 6 && d <= 10 },
  { k: "xl", label: "Over 10 days", test: (d: number) => d > 10 },
];

export function Explore() {
  useTitle("Explore trails");
  const f = useFormat();
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [exp, setExp] = useState("");
  const [dur, setDur] = useState("any");
  const [maxKm, setMaxKm] = useState<number>(400);
  const [camping, setCamping] = useState("");
  const [scenery, setScenery] = useState<string[]>([]);
  const countries = [...new Set(TRAILS.map((t) => t.country))].sort();
  const allScenery = [...new Set(TRAILS.flatMap((t) => t.scenery))].sort();

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return TRAILS.filter((t) => {
      if (needle && ![t.name, t.region, t.country, t.blurb, t.start, t.finish, ...t.terrain, ...t.scenery].join(" ").toLowerCase().includes(needle)) return false;
      if (country && t.country !== country) return false;
      if (exp && t.experience !== exp) return false;
      const d = DURATIONS.find((x) => x.k === dur);
      if (d?.test && !d.test(t.daysTypical)) return false;
      if (t.distanceKm.value != null && t.distanceKm.value > maxKm) return false;
      if (camping && !t.camping.includes(camping)) return false;
      if (scenery.length && !scenery.every((s) => t.scenery.includes(s))) return false;
      return true;
    });
  }, [q, country, exp, dur, maxKm, camping, scenery]);

  const clear = () => {
    setQ("");
    setCountry("");
    setExp("");
    setDur("any");
    setMaxKm(400);
    setCamping("");
    setScenery([]);
  };

  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <h1>Explore trails</h1>
          <p className="lede">Search every mapped walking track in Australia, or start from one of our verified multi-day trails.</p>
        </div>
      </div>

      <TrailSearch />

      <div className="row between" style={{ margin: "40px 0 12px", alignItems: "flex-end" }}>
        <div>
          <h2 style={{ margin: 0 }}>Verified trails</h2>
          <p className="small muted" style={{ margin: 0 }}>Figures checked against each trail's official managing authority.</p>
        </div>
      </div>
      <div className="card flat" style={{ marginBottom: 24 }}>
        <div className="grid grid-4">
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            Search
            <span className="row" style={{ flexWrap: "nowrap" }}>
              <input className="input" placeholder="Trail, region, country or terrain" value={q} onChange={(e) => setQ(e.target.value)} />
            </span>
          </label>
          <label className="field">
            Country
            <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Suits
            <select className="input" value={exp} onChange={(e) => setExp(e.target.value)}>
              <option value="">Any experience</option>
              <option value="beginner">Beginners</option>
              <option value="intermediate">Some experience</option>
              <option value="experienced">Experienced hikers</option>
            </select>
          </label>
          <label className="field">
            Duration
            <select className="input" value={dur} onChange={(e) => setDur(e.target.value)}>
              {DURATIONS.map((d) => (
                <option key={d.k} value={d.k}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Overnight
            <select className="input" value={camping} onChange={(e) => setCamping(e.target.value)}>
              <option value="">Any</option>
              <option value="huts">Huts</option>
              <option value="campsites">Campsites</option>
              <option value="mixed">Towns & mixed</option>
            </select>
          </label>
          <label className="field" style={{ gridColumn: "span 2" }}>
            Maximum distance: {maxKm >= 400 ? "any" : f.d(maxKm)}
            <input type="range" min={10} max={400} step={5} value={maxKm} onChange={(e) => setMaxKm(Number(e.target.value))} style={{ accentColor: "var(--forest)" }} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <span className="small muted">Scenery:</span>
          {allScenery.map((s) => (
            <button key={s} className="chip" aria-pressed={scenery.includes(s)} onClick={() => setScenery((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <p className="small muted" aria-live="polite">
        {results.length} {results.length === 1 ? "trail" : "trails"}
      </p>
      {results.length ? (
        <div className="grid grid-3">
          {results.map((t, i) => (
            <TrailCard key={t.id} trail={t} i={i} />
          ))}
        </div>
      ) : (
        <Empty title="No trails match those filters" action={<button className="btn secondary" onClick={clear}>Clear filters</button>}>
          Try widening the distance or duration.
        </Empty>
      )}

      <div className="panel grid grid-2">
        <div>
          <h2>Can't find your route?</h2>
          <p className="muted">
            Some tracks aren't mapped as a named trail. Describe where you want to go and the planner will suggest options, or import a GPX file of your route.
          </p>
        </div>
        <div className="row" style={{ alignItems: "center" }}>
          <Link to="/plan" className="btn">
            Plan any destination
          </Link>
          <Link to="/plan" className="btn secondary">
            Start a blank trip
          </Link>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, trail, source }: { label: string; value: React.ReactNode; trail: Trail; source: number | null }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {value ?? <span className="muted">Not stated by the official source</span>}{" "}
        {value != null && <ProvBadge p={trailProv(trail, source)} compact />}
      </dd>
    </>
  );
}

export function TrailDetail({ id }: { id: string }) {
  const trail = findTrail(id);
  const f = useFormat();
  const [photoLoaded, setPhotoLoaded] = useState(false);
  useTitle(trail?.name ?? "Trail not found");
  if (!trail)
    return (
      <div className="wrap page">
        <Empty title="Trail not found" action={<Link to="/explore" className="btn">Back to Explore</Link>} />
      </div>
    );
  const official = trail.sources.filter((s) => s.kind === "official");
  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <div style={{ position: "relative", height: "clamp(220px, 40vh, 420px)", overflow: "hidden", background: "var(--forest-2)" }}>
        <CommonsPhoto file={trail.photo?.file} alt={trail.photo?.alt ?? ""} width={1600} className="cover" seed={5} onLoad={() => setPhotoLoaded(true)} />
        <style>{`.cover{width:100%;height:100%;object-fit:cover}`}</style>
        {trail.photo && photoLoaded && (
          <span className="tiny" style={{ position: "absolute", right: 12, bottom: 8, color: "#fff", textShadow: "0 1px 2px #000" }}>
            <PhotoCredit file={trail.photo.file} />
          </span>
        )}
      </div>
      <div className="wrap" style={{ paddingTop: 28 }}>
        <Link to="/explore" className="small row" style={{ gap: 4, textDecoration: "none", marginBottom: 8 }}>
          <Icon name="arrowLeft" size={16} /> All trails
        </Link>
        <div className="page-head">
          <div>
            <div className="muted" style={{ fontWeight: 550 }}>
              {trail.region}, {trail.country}
            </div>
            <h1 style={{ marginBottom: 8 }}>{trail.name}</h1>
            <p className="lede">{trail.blurb}</p>
          </div>
          <Link to={`/plan?trail=${trail.id}`} className="btn">
            <Icon name="plus" size={18} /> Plan this trip
          </Link>
        </div>

        <div className="stats" style={{ marginBottom: 28 }}>
          <div className="stat">
            <div className="k">Distance</div>
            <div className="v">{f.d(trail.distanceKm.value)}</div>
            <div className="sub">{trail.type === "point_to_point" ? "One way" : trail.type === "loop" ? "Loop" : "Return"}</div>
          </div>
          <div className="stat">
            <div className="k">Typical length</div>
            <div className="v">{trail.days.value ?? `~${trail.daysTypical} days`}</div>
            <div className="sub">{trail.days.value ? "Per official source" : "Common itinerary"}</div>
          </div>
          <div className="stat">
            <div className="k">Highest point</div>
            <div className="v">{f.e(trail.highPointM.value)}</div>
          </div>
          <div className="stat">
            <div className="k">Grade</div>
            <div className="v" style={{ fontSize: "1.2rem" }}>{trail.grade.value ?? "Not graded"}</div>
            <div className="sub">{trail.gradingSystem}</div>
          </div>
        </div>

        <div className="grid grid-2" style={{ alignItems: "start", gap: 28 }}>
          <div className="stack-lg">
            <section>
              <h2>Key facts</h2>
              <dl className="kv">
                <Fact label="Start" value={trail.start} trail={trail} source={trail.sources.findIndex((s) => s.kind === "official")} />
                <Fact label="Finish" value={trail.finish} trail={trail} source={trail.sources.findIndex((s) => s.kind === "official")} />
                <Fact label="Distance" value={trail.distanceKm.value != null ? f.d(trail.distanceKm.value) : null} trail={trail} source={trail.distanceKm.source} />
                <Fact label="Season" value={trail.season.value} trail={trail} source={trail.season.source} />
                <Fact label="Permits & bookings" value={trail.permits.value} trail={trail} source={trail.permits.source} />
                <Fact label="Getting there" value={trail.access.value} trail={trail} source={trail.access.source} />
                <Fact label="Water" value={trail.water.value} trail={trail} source={trail.water.source} />
              </dl>
            </section>

            {(trail.stages.length > 0 || trail.overnightStops.value) && (
              <section>
                <h2>Stages</h2>
                {trail.stages.length > 0 && (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Stage</th>
                          <th>Route</th>
                          <th className="r">Distance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trail.stages.map((s, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td>
                              {s.from} to {s.to}
                            </td>
                            <td className="r">{f.d(s.distanceKm)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="tiny muted">
                      <ProvBadge p={trailProv(trail, trail.stages[0].source)} />
                    </p>
                  </div>
                )}
                {trail.overnightStops.value && (
                  <>
                    <h4 style={{ marginTop: 16 }}>Overnight stops</h4>
                    <p>
                      {trail.overnightStops.value.join(", ")} <ProvBadge p={trailProv(trail, trail.overnightStops.source)} compact />
                    </p>
                  </>
                )}
                {!trail.stages.length && <p className="small muted">Stage-by-stage distances aren't listed by the official source, so Rovefern doesn't show them.</p>}
              </section>
            )}

            {trail.hazards.length > 0 && (
              <section>
                <h2>Hazards and conditions</h2>
                <ul style={{ paddingLeft: 18 }}>
                  {trail.hazards.map((h) => (
                    <li key={h.text} style={{ marginBottom: 6 }}>
                      {h.text} {h.source != null && <ProvBadge p={trailProv(trail, h.source)} compact />}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="stack-lg">
            <MapView label={`Map around ${trail.name}`} markers={[{ lat: trail.lat, lon: trail.lon, label: trail.name, kind: "area", detail: "Approximate location of the trail area" }]} height={340} />
            <Notice tone="info">
              The marker shows the general area only. Rovefern doesn't have a verified route line for this trail, so it doesn't draw one. Use the official map, or import a GPX file of your route into your trip.
            </Notice>
            <Notice tone="warn">
              <strong>Before you go</strong>
              <p>Conditions, closures and rules change. Check the official source for current alerts, fire danger and bookings. No alerts showing here doesn't mean the trail is safe or open.</p>
            </Notice>
            <section className="card">
              <h3>Sources</h3>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {trail.sources.map((s) => (
                  <li key={s.url} style={{ marginBottom: 6 }}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.name}
                    </a>{" "}
                    <span className={`badge ${s.kind}`}>{s.kind === "official" ? "Official" : "Third-party"}</span>
                  </li>
                ))}
              </ul>
              <p className="tiny muted" style={{ margin: "10px 0 0" }}>
                Checked {f.date(trail.checkedAt, { day: "numeric", month: "long", year: "numeric" })}.{official.length ? "" : " No official source was available for some details."}
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
