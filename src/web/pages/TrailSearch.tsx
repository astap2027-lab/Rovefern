import { useEffect, useMemo, useState } from "react";
import type { TrailInfo } from "../../server/schemas";
import { Icon } from "../components/icons";
import { ElevationProfile, MapView, type MapMarker } from "../components/MapView";
import { Empty, Notice, Spinner, useFormat } from "../components/ui";
import { api } from "../lib/api";
import { downloadText, slug, toGpx, trackStats } from "../lib/gpx";
import { kvGet, kvSet } from "../lib/idb";
import { OSM_ATTRIBUTION, chainSegments, describeTags, loadTrail, osmUrl, resample, sampleElevation, searchTrails, type OsmPlace, type OsmTrail, type TrailGeometry } from "../lib/osm";
import { Link, navigate, useLocation, useTitle } from "../router";
import { SourceList } from "./Plan";

const SUGGESTED = ["Royal National Park", "Blue Mountains", "Kosciuszko", "Grampians", "Cradle Mountain", "Larapinta", "Lamington", "Wilsons Promontory"];

export function TrailSearch() {
  const f = useFormat();
  const { query } = useLocation();
  const [q, setQ] = useState(query.get("q") ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<{ place: OsmPlace | null; trails: OsmTrail[] } | null>(null);
  const [kind, setKind] = useState<"all" | "route" | "track">("all");
  const [minKm, setMinKm] = useState(0);

  const run = async (text: string) => {
    const t = text.trim();
    if (!t) return;
    setQ(t);
    setBusy(true);
    setErr("");
    history.replaceState(null, "", `/explore?q=${encodeURIComponent(t)}`);
    try {
      setRes(await searchTrails(t));
    } catch (e) {
      setErr((e as Error).message || "Trail search failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (query.get("q")) run(query.get("q")!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(
    () => (res?.trails ?? []).filter((t) => (kind === "all" || t.kind === kind) && (minKm === 0 || (t.lengthKm ?? t.taggedKm ?? 0) >= minKm)),
    [res, kind, minKm],
  );
  const markers: MapMarker[] = useMemo(() => shown.slice(0, 40).map((t) => ({ lat: t.lat, lon: t.lon, label: t.name, kind: t.kind === "route" ? "start" : "landmark", detail: t.kind === "route" ? "Mapped hiking route" : "Named walking track" })), [shown]);

  return (
    <section aria-labelledby="search-title" className="stack">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          run(q);
        }}
      >
        <label id="search-title" htmlFor="trail-q" className="field" style={{ fontSize: "1rem", color: "var(--forest)" }}>
          Search trails anywhere in Australia
        </label>
        <div className="row" style={{ flexWrap: "nowrap", marginTop: 8 }}>
          <input id="trail-q" className="input" placeholder="A trail, park, town or region — e.g. Coast Track, Katoomba, Mount Buffalo" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn" type="submit" disabled={busy || !q.trim()}>
            {busy ? <Spinner /> : <Icon name="search" size={18} />} Search
          </button>
        </div>
        {!res && (
          <div className="row" style={{ marginTop: 12 }}>
            <span className="small muted">Try:</span>
            {SUGGESTED.map((s) => (
              <button type="button" key={s} className="chip" onClick={() => run(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </form>

      {err && <Notice tone="warn">{err}</Notice>}
      {busy && (
        <p className="small muted row">
          <Spinner /> Searching OpenStreetMap for walking tracks…
        </p>
      )}

      {res && !busy && (
        <>
          {!res.place ? (
            <Empty title="No place found">Try a park, town or trail name in Australia.</Empty>
          ) : (
            <>
              <div className="row between">
                <p className="small muted" style={{ margin: 0 }}>
                  {shown.length} {shown.length === 1 ? "trail" : "trails"} around <strong>{res.place.displayName.split(",").slice(0, 3).join(",")}</strong>
                </p>
                <div className="row">
                  <div className="seg" role="group" aria-label="Trail type">
                    {(
                      [
                        ["all", "All"],
                        ["route", "Hiking routes"],
                        ["track", "Named tracks"],
                      ] as const
                    ).map(([k, l]) => (
                      <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <select className="input sm" style={{ width: "auto" }} aria-label="Minimum length" value={minKm} onChange={(e) => setMinKm(Number(e.target.value))}>
                    <option value={0}>Any length</option>
                    {[2, 5, 10, 20, 40].map((k) => (
                      <option key={k} value={k}>
                        {f.d(k)}+
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {shown.length ? (
                <div className="grid grid-2" style={{ alignItems: "start" }}>
                  <div className="gear-list" style={{ maxHeight: 560, overflow: "auto" }}>
                    {shown.map((t) => (
                      <Link key={t.key} to={`/explore/osm/${encodeURIComponent(t.key)}?name=${encodeURIComponent(t.name)}`} className="gear-row" style={{ textDecoration: "none", color: "inherit" }} aria-current={undefined}>
                        <div>
                          <div className="name">{t.name}</div>
                          <div className="meta">
                            <span>{t.kind === "route" ? "Hiking route" : "Walking track"}</span>
                            {t.tags.operator && <span>{t.tags.operator}</span>}
                            {t.tags.sac_scale && <span>{t.tags.sac_scale.replace(/_/g, " ")}</span>}
                          </div>
                        </div>
                        <span className="w">{t.lengthKm != null ? f.d(t.lengthKm) : t.taggedKm != null ? f.d(t.taggedKm) : <span className="muted small">View</span>}</span>
                      </Link>
                    ))}
                  </div>
                  <MapView label="Trails found" markers={markers} height={560} />
                </div>
              ) : (
                <Empty title="No mapped trails here">
                  Try a nearby park or a wider area. Some walks aren't mapped as a named track — the planner can still suggest options.
                </Empty>
              )}
              <p className="tiny muted">
                Trail data {OSM_ATTRIBUTION}. Volunteer-mapped: check the park's official page before you go.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

type InfoResult = { mode: "live" | "offline"; info: TrailInfo | null; sources: { title: string; url: string }[]; retrievedAt?: string };

export function OsmTrailDetail({ trailKey }: { trailKey: string }) {
  const f = useFormat();
  const { query } = useLocation();
  const [g, setG] = useState<TrailGeometry | null>(null);
  const [err, setErr] = useState("");
  const [profile, setProfile] = useState<{ km: number; ele: number }[] | null>(null);
  const [eleStats, setEleStats] = useState<{ up: number; down: number; max: number } | null>(null);
  const [info, setInfo] = useState<InfoResult | null>(null);
  const [infoBusy, setInfoBusy] = useState(false);
  const [infoErr, setInfoErr] = useState("");
  const name = g?.name || query.get("name") || "Trail";
  useTitle(name);

  useEffect(() => {
    let off = false;
    loadTrail(trailKey)
      .then(async (geo) => {
        if (off) return;
        setG(geo);
        kvGet<InfoResult>(`trailinfo:${trailKey}`).then((c) => !off && c && setInfo(c));
        try {
          const line = chainSegments(geo.segments);
          const pts = await sampleElevation(resample(line, 100));
          const st = trackStats(pts);
          if (!off && st.profile.length > 1) {
            // Rescale profile distance to the mapped length.
            const scale = st.distanceKm > 0 ? geo.lengthKm / st.distanceKm : 1;
            setProfile(st.profile.map((p) => ({ km: p.km * Math.min(scale, 1.5), ele: p.ele })));
            setEleStats({ up: st.ascentM ?? 0, down: st.descentM ?? 0, max: Math.max(...pts.map((p) => p.ele ?? 0)) });
          }
        } catch {
          /* profile is optional */
        }
      })
      .catch((e) => !off && setErr((e as Error).message));
    return () => {
      off = true;
    };
  }, [trailKey]);

  const lookUp = async () => {
    if (!g) return;
    setInfoBusy(true);
    setInfoErr("");
    try {
      const line = chainSegments(g.segments);
      const mid = line[Math.floor(line.length / 2)];
      const r = await api<InfoResult>("trail-info", { name, lat: mid.lat, lon: mid.lon, lengthKm: g.lengthKm, tags: Object.fromEntries(Object.entries(g.tags).slice(0, 30)) });
      if (r.mode === "offline") setInfoErr("Trail look-ups need the AI service, which isn't connected on this server.");
      else {
        setInfo(r);
        kvSet(`trailinfo:${trailKey}`, r).catch(() => {});
      }
    } catch (e) {
      setInfoErr((e as Error).message);
    } finally {
      setInfoBusy(false);
    }
  };

  const markers: MapMarker[] = useMemo(() => {
    if (!g) return [];
    const line = chainSegments(g.segments);
    return [
      { lat: line[0].lat, lon: line[0].lon, label: "One end", kind: "start" },
      { lat: line[line.length - 1].lat, lon: line[line.length - 1].lon, label: "Other end", kind: "finish" },
    ];
  }, [g]);
  const segments = useMemo(() => g?.segments.map((s) => s.map((p) => [p.lat, p.lon] as [number, number])), [g]);

  if (err)
    return (
      <div className="wrap page">
        <Empty title="Couldn't load this trail" action={<Link to="/explore" className="btn">Back to Explore</Link>}>
          {err}
        </Empty>
      </div>
    );
  if (!g)
    return (
      <div className="wrap page row">
        <Spinner /> Loading trail from OpenStreetMap…
      </div>
    );

  const facts = describeTags(g.tags);
  const i = info?.info;
  const planUrl = `/plan?osm=${encodeURIComponent(trailKey)}&name=${encodeURIComponent(name)}&km=${g.lengthKm.toFixed(1)}`;

  return (
    <div className="wrap page">
      <Link to="/explore" className="small row" style={{ gap: 4, textDecoration: "none", marginBottom: 8 }}>
        <Icon name="arrowLeft" size={16} /> Explore
      </Link>
      <div className="page-head">
        <div>
          <h1 style={{ marginBottom: 6 }}>{name}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {g.tags.operator ? `${g.tags.operator} · ` : ""}Mapped on OpenStreetMap
          </p>
        </div>
        <div className="row">
          <button
            className="btn secondary"
            onClick={() => downloadText(`${slug(name)}.gpx`, toGpx(name, chainSegments(g.segments), []), "application/gpx+xml")}
          >
            <Icon name="download" size={18} /> GPX
          </button>
          <button className="btn" onClick={() => navigate(planUrl)}>
            <Icon name="plus" size={18} /> Plan this trip
          </button>
        </div>
      </div>

      <div className="stats" style={{ marginBottom: 24 }}>
        <div className="stat">
          <div className="k">Mapped length</div>
          <div className="v">{f.d(g.lengthKm)}</div>
          <div className="sub">{g.segments.length > 1 ? "All mapped sections added up" : "From the mapped path"}</div>
        </div>
        <div className="stat">
          <div className="k">Climb (estimate)</div>
          <div className="v">{eleStats ? f.e(eleStats.up) : "—"}</div>
          <div className="sub">{eleStats ? `${f.e(eleStats.down)} descent` : "Loading elevation…"}</div>
        </div>
        <div className="stat">
          <div className="k">Highest point</div>
          <div className="v">{eleStats ? f.e(eleStats.max) : "—"}</div>
        </div>
        <div className="stat">
          <div className="k">Grade</div>
          <div className="v" style={{ fontSize: "1.15rem" }}>{i?.difficulty ?? "—"}</div>
          <div className="sub">{i?.difficulty ? "From web sources (AI summary)" : "Look up details below"}</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start", gap: 28 }}>
        <div className="stack-lg">
          <MapView label={`Map of ${name}`} markers={markers} segments={segments} height={420} />
          {profile && (
            <section>
              <h3>Elevation profile</h3>
              <ElevationProfile profile={profile} units={f.units} />
              <p className="tiny muted">Estimated by sampling 90 m terrain data (Open-Meteo) along the mapped path. If the trail has several separate sections, the profile joins them in order.</p>
            </section>
          )}
          {facts.length > 0 && (
            <section>
              <h3>From the map</h3>
              <dl className="kv">
                {facts.map((x) => (
                  <div key={x.label} style={{ display: "contents" }}>
                    <dt>{x.label}</dt>
                    <dd>{x.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <p className="tiny muted">
            Route data {OSM_ATTRIBUTION}.{" "}
            <a href={osmUrl(trailKey)} target="_blank" rel="noreferrer">
              View on OpenStreetMap
            </a>
            {g.tags.website && (
              <>
                {" · "}
                <a href={g.tags.website} target="_blank" rel="noreferrer">
                  Trail website
                </a>
              </>
            )}
          </p>
        </div>

        <div className="stack-lg">
          {!i ? (
            <section className="card">
              <h3>Trail details</h3>
              <p className="small muted">
                Rovefern can search the web for this trail's park page and summarise what you need: grade, campgrounds and bookings, water, getting there by public transport, permits and hazards.
              </p>
              {infoErr && <Notice tone="warn">{infoErr}</Notice>}
              <button className="btn" onClick={lookUp} disabled={infoBusy}>
                {infoBusy ? <Spinner /> : <Icon name="spark" size={18} />} {infoBusy ? "Researching… (up to a minute)" : "Look up trail details"}
              </button>
            </section>
          ) : (
            <section className="card stack">
              <div className="row between">
                <h3 style={{ margin: 0 }}>Trail details</h3>
                <span className="badge ai">AI summary of web sources</span>
              </div>
              <p style={{ margin: 0 }}>{i.summary}</p>
              <dl className="kv">
                {(
                  [
                    ["Managed by", i.managedBy],
                    ["Typical duration", i.typicalDuration],
                    ["Distance", i.distanceKm != null ? f.d(i.distanceKm) : null],
                    ["Elevation gain", i.elevationGainM != null ? f.e(i.elevationGainM) : null],
                    ["Best season", i.bestSeason],
                    ["Getting there", i.gettingThere],
                    ["Water", i.water],
                    ["Permits & fees", i.permitsAndFees],
                    ["Fishing", i.fishing],
                  ] as [string, string | null | undefined][]
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} style={{ display: "contents" }}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
              {i.camping && i.camping.length > 0 && (
                <>
                  <h4>Camping</h4>
                  <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
                    {i.camping.map((c) => (
                      <li key={c.name}>
                        <strong>{c.name}</strong>
                        {c.bookingRequired ? " (booking required)" : ""}
                        {c.notes ? ` — ${c.notes}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {i.currentAlerts && <Notice tone="warn">{i.currentAlerts}</Notice>}
              {i.hazards && i.hazards.length > 0 && (
                <>
                  <h4>Hazards</h4>
                  <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
                    {i.hazards.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </>
              )}
              {i.highlights && i.highlights.length > 0 && <p className="small">Highlights: {i.highlights.join(" · ")}</p>}
              {i.officialUrl && (
                <a href={i.officialUrl} target="_blank" rel="noreferrer" className="btn secondary sm" style={{ alignSelf: "flex-start" }}>
                  Official page
                </a>
              )}
              {info!.sources.length > 0 && <SourceList sources={info!.sources} />}
              <div className="row">
                <span className="tiny muted">Looked up {info!.retrievedAt ? new Date(info!.retrievedAt).toLocaleDateString(f.settings.locale) : ""}.</span>
                <button className="btn ghost sm" onClick={lookUp} disabled={infoBusy}>
                  {infoBusy ? <Spinner /> : null} Refresh
                </button>
              </div>
            </section>
          )}
          <Notice tone="warn">Always check the park's official page for closures, fire bans and bookings right before you go.</Notice>
        </div>
      </div>
    </div>
  );
}
