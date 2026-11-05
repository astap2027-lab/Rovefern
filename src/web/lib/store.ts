import { useRef, useSyncExternalStore } from "react";
import type { GearItem, Trip, UserSettings } from "../../lib/domain/types";
import { nowISO, uid } from "../../lib/engine/factory";
import { applyOps, type OpResult, type TripOp } from "../../lib/engine/tripOps";
import type { Pace } from "../../lib/engine/time";
import { kvGet, kvSet } from "./idb";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  at: string;
  changes?: string[];
  error?: boolean;
}

export interface Settings extends UserSettings {
  pace: Pace;
  showAllUp: boolean;
}

export interface AppState {
  version: 1;
  settings: Settings;
  gear: GearItem[];
  trips: Trip[];
  /** Assistant conversation per trip, so context stays with the trip. */
  chats: Record<string, ChatTurn[]>;
  planner: { messages: ChatTurn[]; last?: unknown; mode?: "quick" | "chat" };
  storage: "idb" | "local" | "none" | "loading";
}

export interface Toast {
  id: string;
  text: string;
  undo?: boolean;
  tone?: "ok" | "error";
}

function localeDefaults(): Settings {
  const locale = typeof navigator !== "undefined" ? navigator.language : "en-AU";
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const region = (locale.split("-")[1] ?? "").toUpperCase();
  const imperial = ["US", "LR", "MM"].includes(region);
  const currencyByRegion: Record<string, string> = {
    AU: "AUD", NZ: "NZD", US: "USD", GB: "GBP", CA: "CAD", IE: "EUR", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR",
    AT: "EUR", CH: "CHF", JP: "JPY", IS: "ISK", NO: "NOK", SE: "SEK", DK: "DKK", ZA: "ZAR", IN: "INR", SG: "SGD",
  };
  return { units: imperial ? "imperial" : "metric", currency: currencyByRegion[region] ?? "AUD", locale, timezone: tz, pace: "average", showAllUp: false };
}

const initial: AppState = {
  version: 1,
  settings: localeDefaults(),
  gear: [],
  trips: [],
  chats: {},
  planner: { messages: [] },
  storage: "loading",
};

let state: AppState = initial;
let toasts: Toast[] = [];
const undoStack: { state: AppState; label: string }[] = [];
const listeners = new Set<() => void>();
const toastListeners = new Set<() => void>();
let hydrated = false;

function emit() {
  for (const l of listeners) l();
}

let saveQueued = false;
let saving: Promise<void> = Promise.resolve();

/** Save on the next microtask so a burst of changes becomes one write, without a delay that a quick reload could lose. */
function persist() {
  if (!hydrated || saveQueued) return;
  saveQueued = true;
  queueMicrotask(() => {
    saveQueued = false;
    const { storage: _s, ...data } = state;
    saving = saving.then(async () => {
      const where = await kvSet("state", data);
      if (where !== state.storage) {
        state = { ...state, storage: where };
        emit();
      }
    });
  });
}

export function getState() {
  return state;
}

export function setState(next: AppState | ((s: AppState) => AppState), undoLabel?: string) {
  const prev = state;
  state = typeof next === "function" ? next(state) : next;
  if (undoLabel) {
    undoStack.push({ state: prev, label: undoLabel });
    if (undoStack.length > 20) undoStack.shift();
  }
  emit();
  persist();
}

/** Label of the change that undo() would revert, if any. */
export function peekUndo(): string | undefined {
  return undoStack[undoStack.length - 1]?.label;
}

export function undo() {
  const last = undoStack.pop();
  if (!last) return;
  state = { ...last.state, storage: state.storage };
  emit();
  persist();
  toast(`Undone: ${last.label.replace(/ [0-9a-f-]{36}$/, "")}`);
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * Subscribe to a slice of state. Results are compared shallowly, so selectors may
 * return new arrays/objects (e.g. filters) without causing render loops.
 */
export function useStore<T>(selector: (s: AppState) => T): T {
  const cache = useRef<{ v: T } | null>(null);
  const get = () => {
    const v = selector(state);
    if (cache.current && shallowEqual(cache.current.v, v)) return cache.current.v;
    cache.current = { v };
    return v;
  };
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    get,
    get,
  );
}

export async function hydrate() {
  const saved = await kvGet<Omit<AppState, "storage">>("state");
  if (saved && saved.version === 1) {
    state = {
      ...initial,
      ...saved,
      settings: { ...initial.settings, ...saved.settings },
      gear: (saved.gear ?? []).map((g) => ({ ...g, owned: g.owned ?? true })),
      storage: "idb",
    };
  } else {
    state = { ...state, storage: "idb" };
  }
  hydrated = true;
  emit();
  // Ask the browser not to evict our data under storage pressure.
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* not supported */
  }
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
export function toast(text: string, opts: { undo?: boolean; tone?: Toast["tone"] } = {}) {
  const t: Toast = { id: uid(), text, ...opts };
  toasts = [...toasts, t].slice(-3);
  for (const l of toastListeners) l();
  setTimeout(() => dismissToast(t.id), opts.undo ? 7000 : 4000);
}
export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  for (const l of toastListeners) l();
}
export function useToasts() {
  return useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
    () => toasts,
    () => toasts,
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
export const actions = {
  updateSettings(patch: Partial<Settings>) {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  },

  addGear(items: GearItem[]) {
    setState((s) => ({ ...s, gear: [...items, ...s.gear] }));
  },
  updateGear(id: string, patch: Partial<GearItem>) {
    setState((s) => ({ ...s, gear: s.gear.map((g) => (g.id === id ? { ...g, ...patch, updatedAt: nowISO() } : g)) }));
  },
  deleteGear(id: string) {
    const item = state.gear.find((g) => g.id === id);
    if (!item) return;
    setState(
      (s) => ({
        ...s,
        gear: s.gear.filter((g) => g.id !== id),
        trips: s.trips.map((t) => ({ ...t, gear: t.gear.filter((e) => e.gearId !== id) })),
      }),
      `delete ${item.name}`,
    );
    toast(`Deleted ${item.name}`, { undo: true });
  },
  duplicateGear(id: string) {
    const item = state.gear.find((g) => g.id === id);
    if (!item) return;
    const copy = { ...item, id: uid(), name: `${item.name} (copy)`, createdAt: nowISO(), updatedAt: nowISO() };
    setState((s) => ({ ...s, gear: [copy, ...s.gear] }));
    toast(`Duplicated ${item.name}`);
  },

  addTrip(trip: Trip) {
    setState((s) => ({ ...s, trips: [trip, ...s.trips] }));
  },
  /** Apply validated operations to a trip. Returns the result so callers can show errors. */
  applyTripOps(tripId: string, ops: TripOp[], undoLabel = "trip change"): OpResult | null {
    const trip = state.trips.find((t) => t.id === tripId);
    if (!trip) return null;
    const result = applyOps(trip, ops, state.gear);
    if (result.ok) setState((s) => ({ ...s, trips: s.trips.map((t) => (t.id === tripId ? result.trip : t)) }), undoLabel);
    return result;
  },
  /** Direct edits that don't need op validation (packing ticks, zone overrides, etc.). */
  patchTrip(tripId: string, fn: (t: Trip) => Trip, undoLabel?: string) {
    setState((s) => ({ ...s, trips: s.trips.map((t) => (t.id === tripId ? { ...fn(structuredClone(t)), updatedAt: nowISO() } : t)) }), undoLabel);
  },
  deleteTrip(tripId: string) {
    const trip = state.trips.find((t) => t.id === tripId);
    if (!trip) return;
    setState((s) => {
      const chats = { ...s.chats };
      delete chats[tripId];
      return { ...s, trips: s.trips.filter((t) => t.id !== tripId), chats };
    }, `delete ${trip.title}`);
    toast(`Deleted ${trip.title}`, { undo: true });
  },
  duplicateTrip(tripId: string): string | undefined {
    const trip = state.trips.find((t) => t.id === tripId);
    if (!trip) return;
    const copy: Trip = {
      ...structuredClone(trip),
      id: uid(),
      title: `${trip.title} (copy)`,
      status: "planning",
      archived: false,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    copy.gear = copy.gear.map((g) => ({ ...g, id: uid(), packedBy: [] }));
    copy.checklist = copy.checklist.map((c) => ({ ...c, id: uid(), done: false }));
    copy.budget = copy.budget.map((b) => ({ ...b, id: uid(), actual: null, paidBy: undefined }));
    setState((s) => ({ ...s, trips: [copy, ...s.trips] }));
    toast(`Duplicated ${trip.title}`);
    return copy.id;
  },

  appendChat(tripId: string, turn: ChatTurn) {
    setState((s) => ({ ...s, chats: { ...s.chats, [tripId]: [...(s.chats[tripId] ?? []), turn].slice(-60) } }));
  },
  clearChat(tripId: string) {
    setState((s) => ({ ...s, chats: { ...s.chats, [tripId]: [] } }));
  },
  setPlanner(planner: AppState["planner"]) {
    setState((s) => ({ ...s, planner }));
  },

  exportBackup(): string {
    const { storage: _s, ...data } = state;
    return JSON.stringify({ app: "rovefern", exportedAt: nowISO(), ...data }, null, 2);
  },
  importBackup(json: string, mode: "merge" | "replace"): { trips: number; gear: number } {
    const data = JSON.parse(json);
    if (data?.app !== "rovefern" || data.version !== 1 || !Array.isArray(data.trips) || !Array.isArray(data.gear)) {
      throw new Error("That file isn't a Rovefern backup.");
    }
    const trips: Trip[] = data.trips;
    const gear: GearItem[] = data.gear.map((g: GearItem) => ({ ...g, owned: g.owned ?? true }));
    setState((s) => {
      if (mode === "replace") return { ...s, trips, gear, chats: data.chats ?? {}, settings: { ...s.settings, ...data.settings } };
      const tripIds = new Set(s.trips.map((t) => t.id));
      const gearIds = new Set(s.gear.map((g) => g.id));
      return {
        ...s,
        trips: [...s.trips, ...trips.filter((t) => !tripIds.has(t.id))],
        gear: [...s.gear, ...gear.filter((g) => !gearIds.has(g.id))],
        chats: { ...(data.chats ?? {}), ...s.chats },
      };
    }, "import backup");
    return { trips: trips.length, gear: gear.length };
  },
  resetAll() {
    setState((s) => ({ ...initial, settings: s.settings, storage: s.storage }), "erase all data");
    toast("All trips and gear erased", { undo: true });
  },
};
