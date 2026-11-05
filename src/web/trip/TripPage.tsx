import { useEffect, useMemo, useRef, useState } from "react";
import type { AssistantResponse } from "../../server/schemas";
import type { GearItem, Trip } from "../../lib/domain/types";
import { deriveTrip, type DerivedTrip } from "../../lib/engine/derive";
import { Icon } from "../components/icons";
import { Empty, Spinner } from "../components/ui";
import { api, todayISO } from "../lib/api";
import { translateAssistantOps, tripSnapshot } from "../lib/buildTrip";
import { getRates } from "../lib/external";
import type { RateTable } from "../../lib/engine/budget";
import { actions, peekUndo, setState, toast, undo, useStore } from "../lib/store";
import { Link, useTitle } from "../router";
import { STATUS_LABEL } from "../pages/Adventures";
import { Overview } from "./Overview";
import { Itinerary } from "./Itinerary";
import { MapTab } from "./MapTab";
import { GearTab } from "./GearTab";
import { Packing } from "./Packing";
import { FoodTab } from "./FoodTab";
import { BudgetTab } from "./BudgetTab";
import { Prep } from "./Prep";

export interface TabProps {
  trip: Trip;
  d: DerivedTrip;
  gear: GearItem[];
  rates: RateTable | null;
  setRates: (r: RateTable | null) => void;
}

const TABS = [
  ["overview", "Overview"],
  ["itinerary", "Itinerary"],
  ["map", "Map"],
  ["gear", "Gear"],
  ["packing", "Packing"],
  ["food", "Food & water"],
  ["budget", "Budget"],
  ["prep", "Preparation"],
] as const;

export function TripPage({ id, tab }: { id: string; tab: string }) {
  const trip = useStore((s) => s.trips.find((t) => t.id === id));
  const gear = useStore((s) => s.gear);
  const settings = useStore((s) => s.settings);
  const [rates, setRates] = useState<RateTable | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  useTitle(trip?.title ?? "Trip not found");
  const d = useMemo(() => (trip ? deriveTrip(trip, gear, { rates, pace: settings.pace }) : null), [trip, gear, rates, settings.pace]);

  // Load exchange rates only when a budget line uses another currency.
  useEffect(() => {
    if (!trip || rates) return;
    if (trip.budget.some((b) => b.currency !== trip.currency)) getRates().then(setRates).catch(() => {});
  }, [trip, rates]);

  if (!trip || !d)
    return (
      <div className="wrap page">
        <Empty title="This trip isn't here" action={<Link to="/adventures" className="btn">My adventures</Link>}>
          It may have been deleted, or it's saved in a different browser or device.
        </Empty>
      </div>
    );

  const props: TabProps = { trip, d, gear, rates, setRates };
  const current = TABS.some(([k]) => k === tab) ? tab : "overview";

  return (
    <div className="wrap">
      <div className="trip-head">
        <Link to="/adventures" className="small row" style={{ gap: 4, textDecoration: "none", marginBottom: 6 }}>
          <Icon name="arrowLeft" size={16} /> My adventures
        </Link>
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div>
            <h1>{trip.title}</h1>
            <div className="trip-meta">
              <span className={`status ${trip.status}`}>{STATUS_LABEL[trip.status]}</span>
              <span>{[trip.destination.region, trip.destination.country].filter(Boolean).join(", ") || trip.destination.name || "No destination yet"}</span>
              <span>
                {trip.durationDays} {trip.durationDays === 1 ? "day" : "days"}
              </span>
              <span>
                {trip.participants.length} {trip.participants.length === 1 ? "person" : "people"}
              </span>
              {trip.archived && <span className="badge">Archived</span>}
            </div>
          </div>
          <div className="row no-print">
            <Link to={`/trip/${trip.id}/print`} className="btn secondary sm">
              <Icon name="download" size={16} /> Export trip pack
            </Link>
            <button className="btn sm" onClick={() => setChatOpen(true)}>
              <Icon name="chat" size={16} /> Ask the assistant
            </button>
          </div>
        </div>
      </div>
      <nav className="tabs" aria-label="Trip sections">
        {TABS.map(([k, label]) => (
          <Link key={k} to={`/trip/${trip.id}/${k}`} aria-current={current === k ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <div style={{ paddingBottom: 40 }}>
        {current === "overview" && <Overview {...props} />}
        {current === "itinerary" && <Itinerary {...props} />}
        {current === "map" && <MapTab {...props} />}
        {current === "gear" && <GearTab {...props} />}
        {current === "packing" && <Packing {...props} />}
        {current === "food" && <FoodTab {...props} />}
        {current === "budget" && <BudgetTab {...props} />}
        {current === "prep" && <Prep {...props} />}
      </div>
      {!chatOpen && (
        <button className="btn fab no-print" onClick={() => setChatOpen(true)} aria-label="Ask the trip assistant">
          <Icon name="chat" size={18} /> <span className="hide-sm">Assistant</span>
        </button>
      )}
      {chatOpen && <Assistant trip={trip} d={d} gear={gear} onClose={() => setChatOpen(false)} />}
    </div>
  );
}

const SUGGESTIONS = [
  "Make this route less challenging",
  "Change the trip to seven days",
  "Add another person to the group",
  "I already own a 1.2 kg tent",
  "Reduce my pack weight by one kilogram",
  "I want to spend less than $800",
  "Create a shopping list for all my meals",
  "Find a different destination with similar scenery",
];

function Assistant({ trip, d, gear, onClose }: { trip: Trip; d: DerivedTrip; gear: GearItem[]; onClose: () => void }) {
  const chat = useStore((s) => s.chats[trip.id] ?? []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [chat.length, busy]);
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async (msg: string) => {
    const m = msg.trim();
    if (!m || busy) return;
    setText("");
    actions.appendChat(trip.id, { role: "user", content: m, at: new Date().toISOString() });
    setBusy(true);
    try {
      const history = chat.filter((c) => !c.error).slice(-12).map((c) => ({ role: c.role, content: c.content + (c.changes?.length ? `\n[Applied: ${c.changes.join(" ")}]` : "") }));
      const res = await api<AssistantResponse & { mode: string }>("assistant", { message: m, history, snapshot: tripSnapshot(trip, gear, d), today: todayISO() });
      let changes: string[] = [];
      if (res.ops.length) {
        const { tripOps, newGear } = translateAssistantOps(res.ops, trip);
        if (newGear.length) actions.addGear(newGear);
        const result = actions.applyTripOps(trip.id, tripOps, `assistant changes ${trip.id}`);
        if (!result?.ok) {
          if (newGear.length) {
            const ids = new Set(newGear.map((g) => g.id));
            setState((s) => ({ ...s, gear: s.gear.filter((g) => !ids.has(g.id)) }));
          }
          actions.appendChat(trip.id, {
            role: "assistant",
            content: `${res.reply}\n\nI couldn't apply those changes, so nothing was changed: ${result?.errors.join(" ") ?? "unknown error"}`,
            at: new Date().toISOString(),
            error: true,
          });
          return;
        }
        changes = result.changes;
      }
      actions.appendChat(trip.id, { role: "assistant", content: res.reply, at: new Date().toISOString(), changes });
    } catch (e) {
      actions.appendChat(trip.id, { role: "assistant", content: (e as Error).message, at: new Date().toISOString(), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="overlay" style={{ background: "rgba(30,36,30,.2)" }} onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Trip assistant">
        <div className="drawer-head">
          <Icon name="spark" />
          <strong style={{ flex: 1 }}>Trip assistant</strong>
          {chat.length > 0 && (
            <button className="btn ghost sm" onClick={() => actions.clearChat(trip.id)}>
              Clear
            </button>
          )}
          <button className="icon-btn" onClick={onClose} aria-label="Close assistant">
            <Icon name="x" />
          </button>
        </div>
        <div className="drawer-body">
          <div className="chat" aria-live="polite">
            <div className="msg assistant">
              Ask me to change anything about this trip. I'll update the plan and the app will recalculate food, water, weights and costs. You can undo any change.
            </div>
            {chat.map((c, i) => (
              <div key={i} className={`msg ${c.role} ${c.error ? "error" : ""}`}>
                {c.content}
                {c.changes && c.changes.length > 0 && (
                  <>
                    <ul className="changes">
                      {c.changes.map((ch, j) => (
                        <li key={j}>{ch}</li>
                      ))}
                    </ul>
                    {i === chat.length - 1 && peekUndo() === `assistant changes ${trip.id}` && (
                      <button
                        className="btn ghost sm"
                        style={{ marginTop: 6 }}
                        onClick={() => {
                          undo();
                          actions.appendChat(trip.id, { role: "assistant", content: "Undone. The trip is back to how it was.", at: new Date().toISOString() });
                        }}
                      >
                        <Icon name="undo" size={16} /> Undo these changes
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
            {busy && (
              <div className="msg assistant">
                <Spinner label="Thinking" />
              </div>
            )}
            <div ref={end} />
          </div>
          {chat.length === 0 && (
            <div className="row" style={{ marginTop: 16 }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="drawer-foot">
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <label className="sr-only" htmlFor="assistant-input">
              Message the assistant
            </label>
            <textarea
              id="assistant-input"
              ref={inputRef}
              className="input"
              rows={1}
              value={text}
              placeholder="Ask for a change…"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(text);
                }
              }}
            />
            <button className="btn" type="submit" disabled={busy || !text.trim()} aria-label="Send">
              <Icon name="send" size={18} />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

export function useTripActions(trip: Trip) {
  return {
    ops: (ops: Parameters<typeof actions.applyTripOps>[1], label?: string) => {
      const r = actions.applyTripOps(trip.id, ops, label);
      if (r && !r.ok) toast(r.errors.join(" "), { tone: "error" });
      return r;
    },
    patch: (fn: (t: Trip) => Trip, label?: string) => actions.patchTrip(trip.id, fn, label),
  };
}
