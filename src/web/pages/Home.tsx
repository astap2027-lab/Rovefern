import { useMemo, useState } from "react";
import { TRAILS, commonsImage, findTrail } from "../../lib/domain/trails";
import { computeGroupWeights } from "../../lib/engine/weight";
import { naismithHours } from "../../lib/engine/time";
import { BRAND } from "../brand";
import { Icon, type IconName } from "../components/icons";
import { TrailCard } from "../components/TrailCard";
import { Contours, PhotoCredit, useFormat, formatHoursSafe } from "../components/home-helpers";
import { navigate, Link, useTitle } from "../router";
import { useStore } from "../lib/store";
import { newGearItem } from "../lib/buildTrip";
import type { GearCategory } from "../../lib/domain/types";

const HERO_FILE = "Cradle Mountain Behind Dove Lake.jpg";

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "spark", title: "AI trip planning", body: "Describe the trip in your own words. Rovefern asks only what it needs, then builds a day-by-day plan you can edit." },
  { icon: "compass", title: "Every trail in Australia", body: "Search any mapped walking track, see its real route and elevation, and look up campgrounds, transport and permits." },
  { icon: "backpack", title: "Gear library", body: "Add your kit once with real weights, then reuse it on every trip." },
  { icon: "scale", title: "Pack weight", body: "Base, consumable, worn and total carried weight, updated the moment anything changes." },
  { icon: "checklist", title: "Packing assistant", body: "Where each of your items goes in the pack, and a checklist to tick off as you pack." },
  { icon: "wallet", title: "Budget", body: "Estimated versus actual spend, per-person costs and who owes whom, in any currency." },
  { icon: "cup", title: "Food and water", body: "Meals, quantities, fuel and a shopping list that rescale when the trip length or group changes." },
  { icon: "shield", title: "Weather and safety", body: "Forecasts or climate context with sources and times, plus a pre-trip safety checklist." },
];

const FAQ = [
  ["Do I need an account?", "No. Everything works in guest mode and is saved in this browser. You can back up your trips and gear to a file and restore them on another device from Settings."],
  ["Where do trail details come from?", "Routes and lengths come from OpenStreetMap. Trail details like campgrounds, transport and permits are researched by AI from park websites, with links to the sources. A handful of verified trails use official figures checked by hand. Everything is labelled so you know what to double-check."],
  ["Can I trust the pack weight and budget totals?", "Totals are calculated by the app from the numbers you enter, not by AI. If an item's weight is unknown, it's flagged rather than estimated silently."],
  ["Does it work offline?", "Saved trips, gear lists and checklists open without a connection once the app has loaded on your device. AI, maps and live weather need a connection, and Rovefern isn't a substitute for offline navigation."],
  ["Is Rovefern a safety service?", "No. Always check the official park authority, weather warnings and fire danger before you go, carry proper navigation and emergency communication, and leave your trip plan with someone you trust."],
];

export function Home() {
  useTitle("");
  const [prompt, setPrompt] = useState("");
  const [photoOk, setPhotoOk] = useState(true);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const trips = useStore((s) => s.trips.filter((t) => !t.archived && t.status !== "completed"));
  const start = () => navigate(prompt.trim() ? `/plan?q=${encodeURIComponent(prompt.trim())}` : "/plan");

  return (
    <>
      <section className="hero" aria-labelledby="hero-title" style={{ marginTop: "calc(var(--nav-h) * -1)", paddingTop: "var(--nav-h)" }}>
        {photoOk ? <img className="bg" src={commonsImage(HERO_FILE, 2000)} alt="" onLoad={() => setPhotoLoaded(true)} onError={() => setPhotoOk(false)} /> : <div style={{ position: "absolute", inset: 0, zIndex: -2 }}><Contours seed={3} /></div>}
        <span className="credit">
          {photoOk && photoLoaded && <><PhotoCredit file={HERO_FILE} /> · Cradle Mountain, Tasmania</>}
        </span>
        <div className="wrap">
          <h1 id="hero-title">{BRAND.tagline}</h1>
          <p className="lede">Discover trails, plan your route, optimise your gear and organise every detail of your next hiking adventure with AI.</p>
          <form
            className="register"
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <label htmlFor="home-prompt" className="sr-only">
              Describe your adventure
            </label>
            <textarea
              id="home-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  start();
                }
              }}
              placeholder="Where are you thinking of hiking? Tell us your destination, budget, trip duration and what kind of adventure you're looking for..."
            />
            <div className="bar">
              <span className="hint">Press Enter to start. You can refine everything after.</span>
              <Link to="/explore" className="btn ghost">
                Explore Trails
              </Link>
              <button className="btn" type="submit">
                Plan My Adventure
              </button>
            </div>
          </form>
        </div>
      </section>

      {trips.length > 0 && (
        <section className="wrap" style={{ paddingTop: 32 }}>
          <div className="row between">
            <h2 style={{ fontSize: "1.4rem", margin: 0 }}>Continue planning</h2>
            <Link to="/adventures">All adventures</Link>
          </div>
          <div className="grid grid-3" style={{ marginTop: 12 }}>
            {trips.slice(0, 3).map((t) => (
              <Link key={t.id} to={`/trip/${t.id}`} className="card" aria-current={undefined} style={{ textDecoration: "none", color: "inherit" }}>
                <span className={`status ${t.status}`}>{t.status[0].toUpperCase() + t.status.slice(1)}</span>
                <h3 style={{ marginTop: 8 }}>{t.title}</h3>
                <div className="small muted">
                  {t.durationDays} {t.durationDays === 1 ? "day" : "days"} · {t.participants.length} {t.participants.length === 1 ? "person" : "people"}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="wrap">
          <h2>Everything for the trip, in one place</h2>
          <p className="lede" style={{ marginBottom: 36 }}>
            Planning a multi-day hike usually means a dozen tabs. Rovefern keeps the route, kit, food, money and safety prep together, and keeps them in sync.
          </p>
          <div className="features">
            {FEATURES.map((f) => (
              <div className="feature" key={f.title}>
                <div className="ic">
                  <Icon name={f.icon} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ExampleAdventure />

      <section className="section">
        <div className="wrap">
          <h2>How it works</h2>
          <ol className="steps" style={{ marginTop: 28 }}>
            <li>
              <h3>Describe the trip</h3>
              <p className="muted">Where, when, who's coming, your budget and what you already own. Or start from a trail.</p>
            </li>
            <li>
              <h3>Review the plan</h3>
              <p className="muted">A day-by-day itinerary, gear list, meals and budget, each labelled with where its information came from.</p>
            </li>
            <li>
              <h3>Refine it</h3>
              <p className="muted">Edit anything directly, or ask the assistant: "make it seven days", "add a friend", "get my pack under 10 kg".</p>
            </li>
            <li>
              <h3>Pack and go</h3>
              <p className="muted">Tick off your packing list, check the weather and safety list, and take a printable trip pack with you.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="section alt">
        <div className="wrap">
          <div className="row between" style={{ alignItems: "flex-end", marginBottom: 24 }}>
            <div>
              <h2>Featured trails</h2>
              <p className="muted" style={{ margin: 0 }}>Or search any walking track in Australia.</p>
            </div>
            <Link to="/explore" className="btn secondary">
              Explore all trails
            </Link>
          </div>
          <div className="grid grid-3">
            {TRAILS.filter((t) => t.countryCode === "AU").concat(TRAILS.filter((t) => t.countryCode !== "AU")).slice(0, 3).map((t, i) => (
              <TrailCard key={t.id} trail={t} i={i} />
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap grid grid-3" style={{ gap: 32 }}>
          <div>
            <h3>Honest about what it knows</h3>
            <p className="muted">Official, third-party, your own input, AI suggestion or estimate: every important figure says which. If we can't verify something, we tell you instead of guessing.</p>
          </div>
          <div>
            <h3>Maths you can rely on</h3>
            <p className="muted">Weights, costs, food quantities and fuel are calculated by the app, never by a language model. Change one thing and everything that depends on it updates.</p>
          </div>
          <div>
            <h3>Made for Australia</h3>
            <p className="muted">Australian track grades, state park rules, public transport to trailheads, fishing licences and campground bookings. Metric or imperial, and any currency if you head overseas.</p>
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="wrap" style={{ maxWidth: 860 }}>
          <h2>Questions</h2>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="final-cta">
            <div>
              <h2>Where to next?</h2>
              <p style={{ margin: "6px 0 0", opacity: 0.85 }}>Start with a sentence. No sign-up needed.</p>
            </div>
            <Link to="/plan" className="btn light">
              Plan an adventure
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/** A worked example built from real Milford Track stage data and the app's own calculators. */
function ExampleAdventure() {
  const f = useFormat();
  const trail = findTrail("milford-track")!;
  const example = useMemo(() => {
    const mk = (id: string, name: string, category: GearCategory, g: number, worn = false) =>
      ({ ...newGearItem({ name, category, weightGrams: g, essential: true }), id, weightClass: worn ? ("worn" as const) : ("base" as const) });
    const lib = [
      mk("p", "50 L pack", "backpack", 1250),
      mk("b", "Sleeping bag", "sleeping_bag", 950),
      mk("m", "Inflatable mat", "sleeping_mat", 480),
      mk("r", "Rain jacket", "clothing", 380),
      mk("f", "Fleece", "clothing", 340),
      mk("s", "Stove + pot", "cooking", 420),
      mk("a", "First-aid kit", "first_aid", 280),
      mk("h", "Headlamp", "lighting", 80),
      mk("x", "Boots", "footwear", 1300, true),
    ];
    const people = [{ id: "you", name: "You" }];
    const entries = lib.map((g) => ({ id: g.id, gearId: g.id, scope: "each" as const, quantity: 1, packedBy: [] }));
    const w = computeGroupWeights(people, entries, new Map(lib.map((g) => [g.id, g])), {
      foodStartGramsPerPerson: 3400,
      foodEndGramsPerPerson: 700,
      waterStartLitresPerPerson: 1,
      waterEndLitresPerPerson: 0.5,
      estimatedFuelGrams: 110,
    });
    return w.people[0];
  }, []);
  return (
    <section className="section alt" aria-labelledby="example-title">
      <div className="wrap">
        <h2 id="example-title">What a plan looks like</h2>
        <p className="lede">An example four-day trip on the Milford Track, with stage distances from New Zealand's Department of Conservation and pack weights worked out by Rovefern's calculator from a sample gear list.</p>
        <div className="grid grid-2" style={{ marginTop: 28, alignItems: "start" }}>
          <div className="card">
            <div className="card-head">
              <h3>Itinerary</h3>
              <span className="badge official">Official: DOC</span>
            </div>
            {trail.stages.map((st, i) => (
              <div key={i} className="row between" style={{ padding: "10px 0", borderBottom: i < 3 ? "1px solid var(--line-2)" : 0, flexWrap: "nowrap" }}>
                <div>
                  <div className="tiny muted">Day {i + 1}</div>
                  <div style={{ fontWeight: 600 }}>
                    {st.from} to {st.to}
                  </div>
                </div>
                <div className="num" style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 650 }}>{f.d(st.distanceKm)}</div>
                  <div className="tiny muted">{formatHoursSafe(naismithHours(st.distanceKm ?? 0))} on the flat</div>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-head">
              <h3>Pack weight</h3>
              <span className="badge estimate">Example gear list</span>
            </div>
            <div className="stats" style={{ marginBottom: 14 }}>
              <div className="stat">
                <div className="k">Base weight</div>
                <div className="v">{f.w(example.baseGrams)}</div>
              </div>
              <div className="stat">
                <div className="k">Day 1 carry</div>
                <div className="v">{f.w(example.totalCarriedStartGrams)}</div>
              </div>
              <div className="stat">
                <div className="k">Last day</div>
                <div className="v">{f.w(example.totalCarriedEndGrams)}</div>
              </div>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Food, water and fuel get lighter as you go, so Rovefern shows both your starting and finishing weight. Huts on this track mean no tent is needed — one less kilogram or two.
            </p>
            <div style={{ marginTop: 16 }}>
              <Link to="/plan?trail=milford-track" className="btn secondary sm">
                Plan this trip
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
