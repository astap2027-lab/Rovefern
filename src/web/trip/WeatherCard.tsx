import { useEffect, useState } from "react";
import type { Trip } from "../../lib/domain/types";
import { Notice, Spinner, useFormat } from "../components/ui";
import { getWeather, weatherLabel, type WeatherResult } from "../lib/external";
import { Link } from "../router";
import { authoritiesFor } from "../../lib/domain/authorities";

export function WeatherCard({ trip }: { trip: Trip }) {
  const f = useFormat();
  const { lat, lon, timezone } = trip.destination;
  const [w, setW] = useState<WeatherResult | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const auth = authoritiesFor(trip.destination.country, trip.destination.region, trip.destination.name);

  useEffect(() => {
    if (lat == null || lon == null) return;
    let cancelled = false;
    setLoading(true);
    setErr("");
    getWeather(lat, lon, trip.startDate, Math.min(trip.durationDays, 16), timezone ?? "auto")
      .then((r) => !cancelled && setW(r))
      .catch((e) => !cancelled && setErr((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [lat, lon, trip.startDate, trip.durationDays, timezone]);

  const coldest = w ? Math.min(...w.days.map((d) => d.minC ?? Infinity)) : null;
  const hottest = w ? Math.max(...w.days.map((d) => d.maxC ?? -Infinity)) : null;
  const wettest = w ? Math.max(...w.days.map((d) => d.precipMm ?? 0)) : 0;

  return (
    <section className="card">
      <div className="card-head">
        <h3>{w?.kind === "climate" ? "Climate context" : "Weather"}</h3>
        {w && <span className={`badge ${w.kind === "forecast" ? "third_party" : "estimate"}`}>{w.kind === "forecast" ? "Forecast" : "Not a forecast"}</span>}
      </div>
      {lat == null || lon == null ? (
        <p className="small muted">
          Add the destination's coordinates in <Link to={`/trip/${trip.id}/overview#edit`}>trip details</Link>, or import a GPX route, to see weather here.
        </p>
      ) : loading ? (
        <Spinner label="Loading weather" />
      ) : err ? (
        <Notice tone="warn">{err} Check the official forecast below instead.</Notice>
      ) : w ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Conditions</th>
                  <th className="r">High</th>
                  <th className="r">Low</th>
                  <th className="r">Rain</th>
                  <th className="r">Wind</th>
                </tr>
              </thead>
              <tbody>
                {w.days.map((d) => (
                  <tr key={d.date}>
                    <td>{f.date(d.date, { weekday: "short", day: "numeric", month: "short" })}</td>
                    <td>{weatherLabel(d.code)}</td>
                    <td className="r">{f.t(d.maxC)}</td>
                    <td className="r">{f.t(d.minC)}</td>
                    <td className="r">
                      {d.precipMm != null ? `${d.precipMm.toFixed(1)} mm` : "—"}
                      {d.precipProb != null ? <span className="muted"> ({d.precipProb}%)</span> : null}
                    </td>
                    <td className="r">{d.windKmh != null ? (f.units === "metric" ? `${Math.round(d.windKmh)} km/h` : `${Math.round(d.windKmh / 1.609)} mph`) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {coldest != null && Number.isFinite(coldest) && (
            <ul className="small" style={{ paddingLeft: 18, marginTop: 10 }}>
              {coldest <= 5 && <li>Overnight lows around {f.t(coldest)}: check your sleeping bag's comfort rating and pack a warm layer and beanie for camp.</li>}
              {coldest <= 0 && <li>Below freezing: water filters can crack if they freeze — keep yours in your sleeping bag overnight.</li>}
              {hottest != null && hottest >= 28 && <li>Highs around {f.t(hottest)}: start early, carry more water and plan shade breaks.</li>}
              {wettest >= 10 && <li>Heavy rain expected on at least one day: pack a reliable rain shell, keep insulation in a dry bag, and check for flooded crossings.</li>}
            </ul>
          )}
          <p className="tiny muted" style={{ margin: "8px 0 0" }}>
            {w.note} Source:{" "}
            <a href={w.sourceUrl} target="_blank" rel="noreferrer">
              {w.source}
            </a>
            , {w.period}, retrieved {new Date(w.retrievedAt).toLocaleString(f.settings.locale)}.
          </p>
        </>
      ) : null}
      <p className="small" style={{ marginTop: 12, marginBottom: 0 }}>
        Official forecasts and warnings:{" "}
        <a href={auth.weather.url} target="_blank" rel="noreferrer">
          {auth.weather.name}
        </a>
      </p>
    </section>
  );
}
