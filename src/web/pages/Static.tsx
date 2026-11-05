import { GLOSSARY } from "../lib/glossary";
import { Notice } from "../components/ui";
import { Link, useTitle } from "../router";
import { BRAND } from "../brand";

export function Help() {
  useTitle("Help and safety");
  return (
    <div className="wrap page" style={{ maxWidth: 860 }}>
      <h1>Help and safety</h1>
      <Notice tone="warn">
        <strong>{BRAND.name} is a planning tool, not an emergency service.</strong> It can't see current conditions on the ground and doesn't replace official park information, weather warnings, a map and compass, or emergency communication. In an emergency, call your local emergency number.
      </Notice>

      <h2 style={{ marginTop: 32 }}>Before every trip</h2>
      <ul>
        <li>Check the managing park authority for closures, alerts, fire danger, permits and booking rules.</li>
        <li>Check the official national weather service and any warnings the day before you leave and again on the morning.</li>
        <li>Carry navigation that works without phone signal, and know how to use it.</li>
        <li>Carry a first-aid kit, warm and waterproof layers, a headlamp, water treatment and enough food and water.</li>
        <li>For remote areas, carry a personal locator beacon (PLB) or satellite messenger.</li>
        <li>Leave your trip intentions with someone you trust, including when to raise the alarm.</li>
        <li>Be ready to turn back. The trail will still be there next time.</li>
      </ul>

      <h2 style={{ marginTop: 32 }}>How to read information in {BRAND.name}</h2>
      <p>Every important figure carries a label showing where it came from:</p>
      <dl className="kv">
        <dt>
          <span className="badge official">Official</span>
        </dt>
        <dd>From a national park authority, government agency or official trail body, with a link and the date we checked it.</dd>
        <dt>
          <span className="badge third_party">Third-party</span>
        </dt>
        <dd>From a recognised provider such as a mapping or weather service, or a reference guide.</dd>
        <dt>
          <span className="badge user">Your input</span>
        </dt>
        <dd>Something you entered or imported, such as a GPX route.</dd>
        <dt>
          <span className="badge ai">AI suggestion</span>
        </dt>
        <dd>Suggested by AI. Useful for planning, but check it before you rely on it.</dd>
        <dt>
          <span className="badge estimate">Estimate</span>
        </dt>
        <dd>Calculated from stated assumptions, such as walking times or typical gear weights.</dd>
        <dt>
          <span className="badge unverified">Unverified</span>
        </dt>
        <dd>We couldn't verify it. Treat with caution.</dd>
      </dl>
      <p>Pack weights, budget totals, food quantities and fuel are always calculated by the app from the numbers shown, never by AI.</p>

      <h2 style={{ marginTop: 32 }}>Glossary</h2>
      <dl className="kv">
        {Object.entries(GLOSSARY).map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <h2 style={{ marginTop: 32 }}>Using {BRAND.name} offline</h2>
      <p>
        Once {BRAND.name} has loaded on your device, your saved trips, gear and checklists open without a connection. AI features, maps and weather need a connection. For a copy you can open anywhere, use <strong>Export trip pack → Save offline copy</strong> on any trip. {BRAND.name} doesn't provide offline maps: use a dedicated navigation app or a paper map.
      </p>

      <h2 style={{ marginTop: 32 }}>Your data</h2>
      <p>
        As a guest, everything is saved in this browser. Download a backup from <Link to="/settings">Settings</Link> to keep a copy or move it to another device. Read the <Link to="/privacy">privacy policy</Link>.
      </p>
    </div>
  );
}

export function Privacy() {
  useTitle("Privacy");
  return (
    <div className="wrap page" style={{ maxWidth: 760 }}>
      <h1>Privacy policy</h1>
      <p className="muted">Last updated 5 November 2026</p>
      <h2>The short version</h2>
      <p>Your trips and gear are stored in your own browser. We don't sell your trip or equipment data, and we don't use it for advertising.</p>
      <h2>What's stored and where</h2>
      <p>
        In guest mode, trips, gear, settings and assistant conversations are stored in your browser's local storage (IndexedDB) on your device. They aren't sent to our servers except as described below. Clearing your browser data deletes them; download a backup from Settings to keep a copy.
      </p>
      <h2>AI features</h2>
      <p>
        When you use the planner, the trip assistant, gear reading or gear analysis, the text you type, any photo you attach, and a summary of the relevant trip are sent through our server to our AI provider (Anthropic) to generate a response. We don't keep these requests after the response is returned, apart from short-lived error logs used to fix problems. Don't include sensitive personal information in AI requests.
      </p>
      <h2>Third-party services</h2>
      <p>To show maps, weather and exchange rates, your browser requests data directly from:</p>
      <ul>
        <li>OpenStreetMap and OpenTopoMap (map tiles) — they receive the map area you view.</li>
        <li>Open-Meteo (weather) — it receives the coordinates and dates of your trip.</li>
        <li>Frankfurter (exchange rates) — it receives no trip information.</li>
        <li>Wikimedia Commons (photos) and Google Fonts (typefaces).</li>
      </ul>
      <p>Each service has its own privacy policy and may log your IP address.</p>
      <h2>Accounts</h2>
      <p>Cloud accounts aren't available yet. When they are, this policy will be updated before any data is stored on our servers, and you'll be able to export or delete your account and data at any time.</p>
      <h2>Your choices</h2>
      <p>
        You can export all your data or erase it from this device at any time in <Link to="/settings">Settings</Link>.
      </p>
    </div>
  );
}

export function NotFound() {
  useTitle("Page not found");
  return (
    <div className="wrap page">
      <h1>Off the map</h1>
      <p className="lede">There's no page here. It may have moved, or the link may be wrong.</p>
      <div className="row">
        <Link to="/" className="btn">
          Go home
        </Link>
        <Link to="/adventures" className="btn secondary">
          My adventures
        </Link>
      </div>
    </div>
  );
}
