import { useEffect, useRef, useState } from "react";
import type { PlanResponse } from "../../server/schemas";
import { findTrail } from "../../lib/domain/trails";
import { createTrip } from "../../lib/engine/factory";
import { Icon } from "../components/icons";
import { Notice, NumField, Spinner, useFormat } from "../components/ui";
import { api, todayISO } from "../lib/api";
import { buildTripFromPlan } from "../lib/buildTrip";
import { actions, getState, toast, useStore, type ChatTurn } from "../lib/store";
import { Link, navigate, useLocation, useTitle } from "../router";
import { chainSegments, loadTrail, osmUrl } from "../lib/osm";
import { prov, uid } from "../../lib/engine/factory";

type PlanResult = PlanResponse & { mode: "live" | "offline"; sources?: { title: string; url: string }[] };

const OPENER = "Where would you like to go hiking? A country, a region, or a trail you've had your eye on.";

export function Plan() {
  useTitle("Plan a trip");
  const { query } = useLocation();
  const planner = useStore((s) => s.planner);
  const settings = useStore((s) => s.settings);
  const [mode, setMode] = useState<"quick" | "chat">(planner.mode ?? "quick");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const last = planner.last as PlanResult | undefined;
  const messages = planner.messages;
  const started = useRef(false);

  const send = async (text: string, history: ChatTurn[] = messages) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: ChatTurn[] = [...history, { role: "user", content: t, at: new Date().toISOString() }];
    actions.setPlanner({ messages: next, last, mode });
    setInput("");
    setAnswers({});
    setBusy(true);
    setError("");
    try {
      const res = await api<PlanResult>("plan", {
        messages: next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
        settings: { currency: settings.currency, units: settings.units, locale: settings.locale },
        today: todayISO(),
      });
      const reply = [res.reply, ...(res.questions ?? []).map((q) => `• ${q.question}`)].join("\n");
      actions.setPlanner({ messages: [...next, { role: "assistant", content: reply, at: new Date().toISOString() }], last: res, mode });
    } catch (e) {
      setError((e as Error).message);
      actions.setPlanner({ messages: next, last, mode });
    } finally {
      setBusy(false);
    }
  };

  // Deep links: /plan?q=... from the homepage, /plan?trail=id from Explore.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const q = query.get("q");
    const trail = findTrail(query.get("trail"));
    const osmKey = query.get("osm");
    if (osmKey) {
      navigate("/plan", { replace: true });
      const name = query.get("name") ?? "this trail";
      const km = query.get("km");
      actions.setPlanner({ messages: [], last: undefined, osm: { key: osmKey, name } });
      setMode("quick");
      setInput(`I'd like to hike ${name}${query.get("region") ? ` near ${query.get("region")}` : ""}${km ? ` (about ${km} km on the map)` : ""}. `);
      return;
    }
    if (q || trail) {
      navigate("/plan", { replace: true });
      const text = q ?? `I'd like to hike the ${trail!.name} in ${trail!.region}, ${trail!.country}.`;
      if (trail && !q) {
        setMode("quick");
        setInput(text + " ");
        return;
      }
      send(text, []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    actions.setPlanner({ messages: [], last: undefined, mode, osm: undefined });
    setAnswers({});
    setError("");
  };

  const createFromPlan = () => {
    if (!last?.trip) return;
    const { trip, newGear } = buildTripFromPlan(last, getState().gear, settings.currency);
    trip.requirements.rawPrompt = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    if (newGear.length) actions.addGear(newGear);
    const osm = planner.osm;
    actions.addTrip(trip);
    actions.setPlanner({ messages: [], last: undefined, mode, osm: undefined });
    toast(`Created ${trip.title}`);
    navigate(`/trip/${trip.id}`);
    if (osm) attachOsmRoute(trip.id, osm.key, osm.name);
  };

  const submitAnswers = () => {
    const parts = (last?.questions ?? []).map((q, i) => (answers[i] ? `${q.question} ${answers[i]}` : "")).filter(Boolean);
    if (parts.length) send(parts.join("\n"));
  };

  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <h1>Plan a trip</h1>
          <p className="lede">Tell Rovefern about the hike you have in mind. You can change anything afterwards.</p>
        </div>
        <div className="seg" role="group" aria-label="Planning style">
          <button aria-pressed={mode === "quick"} onClick={() => setMode("quick")}>
            Describe it
          </button>
          <button aria-pressed={mode === "chat"} onClick={() => setMode("chat")}>
            Chat with a guide
          </button>
        </div>
      </div>

      {last?.mode === "offline" && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="info">
            AI planning isn't connected on this server, so Rovefern is reading your request with simple rules. It will pick out dates, group size, budget and known trails, but won't suggest routes.
          </Notice>
        </div>
      )}

      <div className="planner">
        <div className="stack-lg">
          {mode === "quick" ? (
            <div className="card">
              {messages.length > 0 && (
                <div className="chat" style={{ marginBottom: 16 }}>
                  {messages.map((m, i) => (
                    <div key={i} className={`msg ${m.role}`}>
                      {m.content}
                    </div>
                  ))}
                </div>
              )}
              {last && !last.ready && last.questions?.length > 0 && !busy ? (
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitAnswers();
                  }}
                >
                  {last.questions.map((q, i) => (
                    <div key={i}>
                      <label className="field" htmlFor={`q${i}`}>
                        {q.question}
                      </label>
                      {q.options?.length ? (
                        <div className="row" style={{ marginTop: 6 }}>
                          {q.options.map((o) => (
                            <button type="button" key={o} className="chip" aria-pressed={answers[i] === o} onClick={() => setAnswers((a) => ({ ...a, [i]: o }))}>
                              {o}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <input id={`q${i}`} className="input" style={{ marginTop: 6 }} placeholder={q.options?.length ? "Or type your own answer" : "Your answer"} value={q.options?.includes(answers[i]) ? "" : answers[i] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="row">
                    <button className="btn" type="submit" disabled={!Object.values(answers).some(Boolean)}>
                      Continue
                    </button>
                    <button type="button" className="btn ghost" onClick={reset}>
                      Start over
                    </button>
                  </div>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(input);
                  }}
                >
                  <label htmlFor="plan-input" className="field" style={{ marginBottom: 8 }}>
                    {messages.length ? "Anything to add or change?" : "Describe your adventure"}
                  </label>
                  <textarea
                    id="plan-input"
                    className="input"
                    rows={messages.length ? 3 : 6}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(input);
                    }}
                    placeholder="e.g. A five-day backpacking trip in Tasmania in January with two friends. Budget about $1,200 AUD each, moderately challenging, mountains and lakes. I already own a backpack, tent and sleeping bag."
                  />
                  <div className="row" style={{ marginTop: 12 }}>
                    <button className="btn" type="submit" disabled={busy || !input.trim()}>
                      {busy ? <Spinner label="Planning" /> : <Icon name="spark" size={18} />}
                      {busy ? "Planning…" : messages.length ? "Update plan" : "Plan my adventure"}
                    </button>
                    {messages.length > 0 && (
                      <button type="button" className="btn ghost" onClick={reset}>
                        Start over
                      </button>
                    )}
                  </div>
                  {!messages.length && <Examples onPick={(t) => setInput(t)} />}
                </form>
              )}
              {busy && messages.length > 0 && (
                <p className="small muted row" style={{ marginTop: 12 }}>
                  <Spinner /> Working on it. A full plan can take up to a minute.
                </p>
              )}
            </div>
          ) : (
            <ChatPlanner messages={messages} busy={busy} onSend={(t) => send(t)} onReset={reset} lastQuestions={last && !last.ready ? last.questions : []} />
          )}

          {error && (
            <Notice tone="warn">
              {error}{" "}
              <button className="btn sm secondary" style={{ marginLeft: 8 }} onClick={() => send(messages.filter((m) => m.role === "user").pop()?.content ?? "", messages.slice(0, -1))}>
                Try again
              </button>
            </Notice>
          )}

          {last && <PlanExtras plan={last} busy={busy} onPick={(o) => send(`Let's go with ${o.title} (${o.region}).`)} />}
          {last?.ready && last.trip && <PlanPreview plan={last} onCreate={createFromPlan} busy={busy} />}
        </div>

        <aside className="stack-lg">
          <Understood plan={last} />
          <ManualStart />
        </aside>
      </div>
    </div>
  );
}

function Examples({ onPick }: { onPick: (t: string) => void }) {
  const ex = [
    "My first overnight hike, somewhere near Sydney, two of us, I own almost no gear",
    "Seven days on the Overland Track in February, solo, experienced, want to get my base weight down",
    "Four friends, 4-day hut trek in New Zealand in March, budget NZ$900 each",
    "Under $500 total for a weekend hike in the Blue Mountains",
  ];
  return (
    <div style={{ marginTop: 18 }}>
      <div className="small muted" style={{ marginBottom: 8 }}>
        Or start from an example:
      </div>
      <div className="row">
        {ex.map((e) => (
          <button type="button" className="chip" key={e} onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatPlanner({ messages, busy, onSend, onReset, lastQuestions }: { messages: ChatTurn[]; busy: boolean; onSend: (t: string) => void; onReset: () => void; lastQuestions?: { question: string; options?: string[] }[] }) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, busy]);
  const opts = lastQuestions?.flatMap((q) => q.options ?? []).slice(0, 6) ?? [];
  return (
    <div className="card">
      <div className="chat" aria-live="polite">
        <div className="msg assistant">{OPENER}</div>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <Spinner label="Thinking" />
          </div>
        )}
        <div ref={end} />
      </div>
      {!busy && opts.length > 0 && (
        <div className="row" style={{ marginTop: 12 }}>
          {opts.map((o) => (
            <button key={o} className="chip" onClick={() => onSend(o)}>
              {o}
            </button>
          ))}
        </div>
      )}
      <form
        className="composer"
        style={{ marginTop: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          onSend(text);
          setText("");
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-input"
          className="input"
          rows={1}
          value={text}
          placeholder="Type your answer…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend(text);
              setText("");
            }
          }}
        />
        <button className="btn" type="submit" disabled={busy || !text.trim()} aria-label="Send">
          <Icon name="send" size={18} />
        </button>
      </form>
      {messages.length > 0 && (
        <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={onReset}>
          Start over
        </button>
      )}
    </div>
  );
}

function Understood({ plan }: { plan?: PlanResult }) {
  const f = useFormat();
  const ex = plan?.extracted;
  const rows: [string, string | null | undefined][] = ex
    ? [
        ["Where", [ex.destination, ex.country].filter(Boolean).join(", ") || null],
        ["When", ex.startDate ? f.date(ex.startDate) : ex.month],
        ["Length", ex.durationDays ? `${ex.durationDays} ${ex.durationDays === 1 ? "day" : "days"}` : null],
        ["Group", ex.groupSize ? `${ex.groupSize} ${ex.groupSize === 1 ? "person" : "people"}` : null],
        ["Budget", ex.budgetMax != null ? `${f.money(ex.budgetMax, ex.currency ?? f.settings.currency)}${ex.budgetBasis === "per_person" ? " each" : " total"}` : null],
        ["Experience", ex.experience],
        ["Difficulty", ex.desiredDifficulty],
        ["Scenery", ex.scenery?.join(", ")],
        ["You own", ex.existingGear?.join(", ")],
        ["Diet", ex.dietary?.join(", ")],
      ]
    : [];
  const shown = rows.filter(([, v]) => v);
  return (
    <div className="card flat understood">
      <h4>What I've understood</h4>
      {shown.length ? (
        <dl>
          {shown.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          Details from your description will appear here as you go: destination, dates, group, budget and gear you already own.
        </p>
      )}
    </div>
  );
}

function PlanPreview({ plan, onCreate, busy }: { plan: PlanResult; onCreate: () => void; busy: boolean }) {
  const f = useFormat();
  const t = plan.trip!;
  const trail = findTrail(t.trailId);
  return (
    <div className="card" style={{ borderColor: "var(--forest-2)" }}>
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t.title}</h2>
        {trail ? <span className="badge official">Verified trail</span> : t.isEstablishedTrail ? <span className="badge ai">AI-described trail</span> : <span className="badge unverified">Suggested route</span>}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        {[t.region, t.country].filter(Boolean).join(", ")} · {t.days.length} {t.days.length === 1 ? "day" : "days"}
      </p>
      {t.summary && <p>{t.summary}</p>}
      <ol style={{ paddingLeft: 20, margin: "0 0 16px" }}>
        {t.days.slice(0, 10).map((d, i) => (
          <li key={i} style={{ marginBottom: 4 }}>
            {d.from && d.to ? `${d.from} to ${d.to}` : d.title ?? `Day ${i + 1}`}
            {d.distanceKm != null && <span className="muted"> · {f.d(d.distanceKm)}</span>}
          </li>
        ))}
        {t.days.length > 10 && <li className="muted">and {t.days.length - 10} more days</li>}
      </ol>
      {t.limitations.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="warn">
            <strong>Check before you rely on this</strong>
            <ul>
              {t.limitations.slice(0, 4).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}
      <div className="row">
        <button className="btn" onClick={onCreate} disabled={busy}>
          <Icon name="check" size={18} /> Create this trip
        </button>
        <span className="small muted">You'll get the full dashboard: itinerary, gear, food, budget and preparation.</span>
      </div>
    </div>
  );
}

function ManualStart() {
  const settings = useStore((s) => s.settings);
  const [name, setName] = useState("");
  const [dest, setDest] = useState("");
  const [days, setDays] = useState<number | null>(2);
  const [people, setPeople] = useState<number | null>(1);
  const [err, setErr] = useState("");
  return (
    <details className="card">
      <summary style={{ cursor: "pointer", fontWeight: 650 }}>Start a blank trip instead</summary>
      <form
        className="stack"
        style={{ marginTop: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!dest.trim()) return setErr("Add a destination or route name.");
          if (!days || days < 1 || days > 60) return setErr("Trip length must be 1–60 days.");
          const trip = createTrip({
            title: name.trim() || `${dest.trim()} hike`,
            destinationName: dest.trim(),
            durationDays: days,
            participants: Array.from({ length: Math.max(1, Math.min(20, people ?? 1)) }, (_, i) => (i === 0 ? "You" : `Hiker ${i + 1}`)),
            currency: settings.currency,
          });
          trip.limitations.push("You're planning this route yourself. Add stages manually or import a GPX file of your route.");
          actions.addTrip(trip);
          toast(`Created ${trip.title}`);
          navigate(`/trip/${trip.id}/itinerary`);
        }}
      >
        <label className="field">
          Trip name (optional)
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Destination or route
          <input className="input" value={dest} onChange={(e) => setDest(e.target.value)} aria-invalid={err && !dest ? true : undefined} />
        </label>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <NumField label="Days" value={days} onChange={setDays} min={1} max={60} step={1} />
          <NumField label="People" value={people} onChange={setPeople} min={1} max={20} step={1} />
        </div>
        {err && <div className="err">{err}</div>}
        <button className="btn secondary" type="submit">
          Create blank trip
        </button>
        <p className="tiny muted" style={{ margin: 0 }}>
          Or <Link to="/explore">start from an established trail</Link>.
        </p>
      </form>
    </details>
  );
}

type Option = NonNullable<PlanResponse["options"]>[number];

function PlanExtras({ plan, busy, onPick }: { plan: PlanResult; busy: boolean; onPick: (o: Option) => void }) {
  const answers = plan.answers ?? [];
  const options = plan.options ?? [];
  const sources = plan.sources ?? [];
  if (!answers.length && !options.length && !sources.length) return null;
  return (
    <div className="stack-lg">
      {options.length > 0 && (
        <section aria-labelledby="opts">
          <h2 id="opts" style={{ fontSize: "1.5rem" }}>
            Pick a destination
          </h2>
          <div className="grid grid-3">
            {options.map((o) => (
              <article key={o.title} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="small muted">{o.region}</div>
                <h3 style={{ margin: 0 }}>{o.title}</h3>
                <p className="small" style={{ margin: 0 }}>
                  {o.summary}
                </p>
                <dl className="kv small" style={{ gridTemplateColumns: "1fr" }}>
                  <dt>Why it fits</dt>
                  <dd>{o.whyItFits}</dd>
                  <dt>Getting there</dt>
                  <dd>{o.gettingThere}</dd>
                  <dt>Walking</dt>
                  <dd>{o.walking}</dd>
                  <dt>Camping</dt>
                  <dd>{o.camping}</dd>
                  {o.highlights.length > 0 && (
                    <>
                      <dt>Highlights</dt>
                      <dd>{o.highlights.join(" · ")}</dd>
                    </>
                  )}
                  {o.watchOutFor && (
                    <>
                      <dt>Watch out for</dt>
                      <dd>{o.watchOutFor}</dd>
                    </>
                  )}
                </dl>
                <button className="btn sm" style={{ marginTop: "auto" }} disabled={busy} onClick={() => onPick(o)}>
                  Choose this
                </button>
              </article>
            ))}
          </div>
          <p className="tiny muted">Suggested by AI using web search. Check details with the park's official page before you go.</p>
        </section>
      )}
      {answers.length > 0 && (
        <section className="card" aria-labelledby="answers">
          <h3 id="answers">Your questions, answered</h3>
          <dl className="kv" style={{ gridTemplateColumns: "1fr" }}>
            {answers.map((a) => (
              <div key={a.question} style={{ marginBottom: 10 }}>
                <dt>{a.question}</dt>
                <dd>{a.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {sources.length > 0 && <SourceList sources={sources} />}
    </div>
  );
}

export function SourceList({ sources }: { sources: { title: string; url: string }[] }) {
  return (
    <details className="card flat small">
      <summary style={{ cursor: "pointer", fontWeight: 650 }}>Sources checked ({sources.length})</summary>
      <ul style={{ paddingLeft: 18, margin: "8px 0 0" }}>
        {sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>{" "}
            <span className="muted">{(() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return ""; } })()}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** When a trip was planned from an OpenStreetMap trail, add its mapped route to the trip. */
async function attachOsmRoute(tripId: string, key: string, name: string) {
  try {
    const g = await loadTrail(key);
    const line = chainSegments(g.segments);
    if (line.length < 2) return;
    const p = prov("third_party", { sourceName: "OpenStreetMap", sourceUrl: osmUrl(key), note: `${name} as mapped on OpenStreetMap` });
    actions.patchTrip(tripId, (t) => {
      t.route = { coordinates: line.map((x) => [x.lat, x.lon]), provenance: p };
      if (!t.waypoints.some((w) => w.kind === "start")) {
        t.waypoints.push({ id: uid(), name: "Start", kind: "start", lat: line[0].lat, lon: line[0].lon, provenance: p });
        t.waypoints.push({ id: uid(), name: "Finish", kind: "finish", lat: line[line.length - 1].lat, lon: line[line.length - 1].lon, provenance: p });
      }
      if (t.destination.lat == null) {
        t.destination.lat = line[0].lat;
        t.destination.lon = line[0].lon;
      }
      return t;
    });
  } catch {
    /* route is a bonus; the trip still works without it */
  }
}
