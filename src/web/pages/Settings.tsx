import { useRef, useState } from "react";
import { Icon } from "../components/icons";
import { Confirm, Notice } from "../components/ui";
import { downloadText } from "../lib/gpx";
import { actions, toast, useStore } from "../lib/store";
import { Link, useTitle } from "../router";

const CURRENCIES = ["AUD", "NZD", "USD", "CAD", "GBP", "EUR", "CHF", "JPY", "ISK", "NOK", "SEK", "DKK", "ZAR", "INR", "SGD", "NPR", "CLP", "ARS", "MXN", "BRL", "THB", "IDR"];

export function Settings() {
  useTitle("Settings");
  const s = useStore((st) => st.settings);
  const storage = useStore((st) => st.storage);
  const counts = useStore((st) => ({ trips: st.trips.length, gear: st.gear.length }));
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");

  return (
    <div className="wrap page" style={{ maxWidth: 860 }}>
      <h1>Settings</h1>

      <section className="card stack">
        <h2 style={{ fontSize: "1.4rem" }}>Units and formats</h2>
        <div className="grid grid-2">
          <div>
            <div className="small" style={{ fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
              Measurements
            </div>
            <div className="seg" role="group" aria-label="Measurements">
              <button aria-pressed={s.units === "metric"} onClick={() => actions.updateSettings({ units: "metric" })}>
                Metric (kg, km, °C)
              </button>
              <button aria-pressed={s.units === "imperial"} onClick={() => actions.updateSettings({ units: "imperial" })}>
                Imperial (lb, mi, °F)
              </button>
            </div>
          </div>
          <label className="field">
            Default currency for new trips
            <select className="input" value={s.currency} onChange={(e) => actions.updateSettings({ currency: e.target.value })}>
              {[...new Set([s.currency, ...CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Date and number format
            <select className="input" value={s.locale} onChange={(e) => actions.updateSettings({ locale: e.target.value })}>
              {[...new Set([s.locale ?? "en-AU", "en-AU", "en-NZ", "en-GB", "en-US", "en-CA", "de-DE", "fr-FR", "es-ES", "it-IT", "ja-JP", "is-IS", "nb-NO", "sv-SE"])].map((l) => (
                <option key={l} value={l}>
                  {l} — {new Intl.DateTimeFormat(l, { day: "numeric", month: "short", year: "numeric" }).format(new Date(2027, 0, 15))}
                </option>
              ))}
            </select>
          </label>
          <div>
            <div className="small" style={{ fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>
              Walking pace for time estimates
            </div>
            <div className="seg" role="group" aria-label="Walking pace">
              {(["relaxed", "average", "fast"] as const).map((p) => (
                <button key={p} aria-pressed={s.pace === p} onClick={() => actions.updateSettings({ pace: p })}>
                  {p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          Your time zone is {s.timezone}. Trip dates are shown in the destination's local calendar.
        </p>
      </section>

      <section className="card stack" style={{ marginTop: 20 }} aria-labelledby="acct">
        <h2 id="acct" style={{ fontSize: "1.4rem" }}>
          Account and sync
        </h2>
        <Notice tone="info">
          You're using Rovefern as a guest. Your {counts.trips} {counts.trips === 1 ? "trip" : "trips"} and {counts.gear} gear {counts.gear === 1 ? "item" : "items"} are saved in this browser on this device
          {storage === "local" ? " (in basic storage because this browser blocks the database)" : storage === "none" ? " — but this browser isn't allowing storage, so changes will be lost when you close the tab" : ""}. They don't sync to other devices automatically.
        </Notice>
        <p className="small" style={{ margin: 0 }}>
          Cloud accounts aren't switched on for this version of Rovefern yet. To move your trips and gear to another device, download a backup here and restore it there. When accounts arrive, you'll be able to bring your guest trips and gear straight across.
        </p>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              downloadText(`rovefern-backup-${new Date().toISOString().slice(0, 10)}.json`, actions.exportBackup(), "application/json");
              toast("Backup downloaded");
            }}
          >
            <Icon name="download" size={18} /> Download backup
          </button>
          <button className="btn secondary" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={18} /> Restore from backup
          </button>
          <select className="input sm" style={{ width: "auto" }} aria-label="Restore mode" value={importMode} onChange={(e) => setImportMode(e.target.value as typeof importMode)}>
            <option value="merge">Add to what's here</option>
            <option value="replace">Replace everything here</option>
          </select>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const r = actions.importBackup(await file.text(), importMode);
                toast(`Restored ${r.trips} trips and ${r.gear} gear items`, { undo: true });
              } catch (er) {
                toast((er as Error).message.includes("JSON") ? "That file couldn't be read." : (er as Error).message, { tone: "error" });
              }
              e.target.value = "";
            }}
          />
        </div>
      </section>

      <section className="card stack" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: "1.4rem" }}>Your data</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Rovefern doesn't sell your trip or gear information. When you use AI features, the text of your request and a summary of the relevant trip are sent to our AI provider to generate a response. See the <Link to="/privacy">privacy policy</Link>.
        </p>
        <div>
          <button className="btn danger" onClick={() => setConfirmErase(true)}>
            <Icon name="trash" size={18} /> Erase all trips and gear on this device
          </button>
        </div>
      </section>

      {confirmErase && (
        <Confirm
          title="Erase everything?"
          body="All trips, gear and assistant conversations stored in this browser will be deleted. Download a backup first if you might want them back. You can undo straight afterwards, but not once you leave this page."
          confirmLabel="Erase everything"
          danger
          onConfirm={() => actions.resetAll()}
          onClose={() => setConfirmErase(false)}
        />
      )}
    </div>
  );
}
