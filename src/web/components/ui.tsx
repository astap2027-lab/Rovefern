import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Provenance } from "../../lib/domain/types";
import { commonsImage, commonsPage } from "../../lib/domain/trails";
import { GLOSSARY } from "../lib/glossary";
import { dismissToast, undo, useStore, useToasts } from "../lib/store";
import { formatDistance, formatElevation, formatTemp, formatVolume, formatWeight } from "../../lib/engine/units";
import { formatMoney } from "../../lib/engine/budget";
import { Icon, type IconName } from "./icons";

export const PROV_LABEL: Record<Provenance["kind"], string> = {
  official: "Official",
  third_party: "Third-party",
  user: "Your input",
  ai: "AI suggestion",
  estimate: "Estimate",
  unverified: "Unverified",
};

const PROV_HELP: Record<Provenance["kind"], string> = {
  official: "From an official park authority, government agency or trail body.",
  third_party: "From a recognised third-party source such as a mapping provider or reference guide.",
  user: "Something you entered or imported.",
  ai: "Suggested by AI. Check it against an official source before relying on it.",
  estimate: "Calculated from stated assumptions. Treat as a rough guide.",
  unverified: "We couldn't verify this. Don't rely on it without checking.",
};

export function ProvBadge({ p, compact }: { p?: Provenance | null; compact?: boolean }) {
  if (!p) return null;
  const title = [PROV_HELP[p.kind], p.sourceName && `Source: ${p.sourceName}`, p.retrievedAt && `Checked ${new Date(p.retrievedAt).toLocaleDateString()}`, p.note]
    .filter(Boolean)
    .join(" · ");
  const body = (
    <>
      {PROV_LABEL[p.kind]}
      {!compact && p.sourceName ? `: ${p.sourceName.split(" — ")[0]}` : ""}
    </>
  );
  return p.sourceUrl ? (
    <a className={`badge ${p.kind}`} href={p.sourceUrl} target="_blank" rel="noreferrer" title={title}>
      {body}
    </a>
  ) : (
    <span className={`badge ${p.kind}`} title={title}>
      {body}
    </span>
  );
}

export function Term({ name, children }: { name: keyof typeof GLOSSARY | string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useEffect(() => {
    if (!open) return;
    const r = ref.current!.getBoundingClientRect();
    setPos({ left: Math.max(16, Math.min(r.left + window.scrollX, window.innerWidth - 316)), top: r.bottom + window.scrollY + 6 });
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [open]);
  const text = GLOSSARY[name as string];
  if (!text) return <>{children ?? name}</>;
  return (
    <>
      <button ref={ref} type="button" className="term" aria-describedby={open ? id : undefined} aria-expanded={open} onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
        {children ?? name}
      </button>
      {open && (
        <div role="tooltip" id={id} className="pop" style={{ left: pos.left, top: pos.top }}>
          {text}
        </div>
      )}
    </>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not(.icon-btn)");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>("a, button, input, select, textarea")].filter((el) => !el.hasAttribute("disabled"));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: "1.5rem" }}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Confirm({ title, body, confirmLabel, danger, onConfirm, onClose }: { title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="muted" style={{ marginBottom: 20 }}>{body}</div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className={`btn ${danger ? "" : ""}`}
          style={danger ? { background: "var(--rust)" } : undefined}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function Toasts() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone === "error" ? "error" : ""}`}>
          <span style={{ flex: 1 }}>{t.text}</span>
          {t.undo && (
            <button
              onClick={() => {
                undo();
                dismissToast(t.id);
              }}
            >
              Undo
            </button>
          )}
          <button aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Contour-line placeholder, also used when a photo fails to load. */
export function Contours({ seed = 1, dark = true }: { seed?: number; dark?: boolean }) {
  const lines = Array.from({ length: 14 }, (_, i) => {
    const y = 10 + i * 7;
    const a = 3 + ((seed * (i + 3)) % 5);
    const p = (seed * 37 + i * 13) % 100;
    return `M-5 ${y} C 25 ${y - a}, 40 ${y + a + (p % 4)}, 60 ${y} S 95 ${y - a}, 105 ${y + 1}`;
  });
  return (
    <svg className="photo-fallback" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <rect width="100" height="100" fill={dark ? "#2e5440" : "#e6dcc8"} />
      {lines.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={dark ? "#7d8a5c" : "#c9bc9e"} strokeWidth={i % 4 === 0 ? 0.5 : 0.25} opacity={0.8} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

export function CommonsPhoto({ file, alt, width = 900, seed = 1, className, onLoad }: { file?: string; alt: string; width?: number; seed?: number; className?: string; onLoad?: () => void }) {
  const [failed, setFailed] = useState(false);
  if (!file || failed) return <Contours seed={seed} />;
  return <img className={className} src={commonsImage(file, width)} alt={alt} loading="lazy" onLoad={onLoad} onError={() => setFailed(true)} />;
}

export function PhotoCredit({ file }: { file?: string }) {
  if (!file) return null;
  return (
    <a href={commonsPage(file)} target="_blank" rel="noreferrer">
      Photo: Wikimedia Commons
    </a>
  );
}

export function Notice({ tone = "info", icon, children }: { tone?: "info" | "warn" | "ok" | "plain"; icon?: IconName; children: ReactNode }) {
  return (
    <div className={`notice ${tone}`} role={tone === "warn" ? "note" : undefined}>
      <Icon name={icon ?? (tone === "warn" ? "alert" : tone === "ok" ? "check" : "info")} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function Meter({ value, max, over }: { value: number; max: number; over?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={`meter ${over ? "over" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

/** Number input that allows empty (null) values and validates range. */
export function NumField({
  label,
  value,
  onChange,
  min = 0,
  max = 1e9,
  step = "any",
  suffix,
  placeholder,
  small,
}: {
  label?: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number | "any";
  suffix?: string;
  placeholder?: string;
  small?: boolean;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const [err, setErr] = useState("");
  useEffect(() => {
    const cur = text.trim() === "" ? null : Number(text);
    if (cur !== value) setText(value == null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const input = (
    <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
      <input
        className={`input num ${small ? "sm" : ""}`}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={err ? true : undefined}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (t.trim() === "") {
            setErr("");
            onChange(null);
            return;
          }
          const n = Number(t.replace(",", "."));
          if (!Number.isFinite(n)) return setErr("Enter a number");
          if (n < min || n > max) return setErr(`Between ${min} and ${max}`);
          setErr("");
          onChange(n);
        }}
      />
      {suffix && <span className="small muted">{suffix}</span>}
    </span>
  );
  if (!label) return input;
  return (
    <label className="field">
      {label}
      {input}
      {err && <span className="err">{err}</span>}
    </label>
  );
}

export function useFormat() {
  const s = useStore((st) => st.settings);
  return {
    w: (g: number | null | undefined) => (g == null ? "—" : formatWeight(g, s.units)),
    d: (km: number | null | undefined) => formatDistance(km, s.units),
    e: (m: number | null | undefined) => formatElevation(m, s.units),
    t: (c: number | null | undefined) => formatTemp(c, s.units),
    v: (l: number) => formatVolume(l, s.units),
    money: (n: number | null | undefined, cur: string) => formatMoney(n, cur, s.locale),
    date: (iso?: string | null, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" }) =>
      iso ? new Intl.DateTimeFormat(s.locale, { ...opts, timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z")) : "—",
    units: s.units,
    settings: s,
  };
}

export function Stat({ k, v, sub, term }: { k: string; v: ReactNode; sub?: ReactNode; term?: string }) {
  return (
    <div className="stat">
      <div className="k">{term ? <Term name={term}>{k}</Term> : k}</div>
      <div className="v">{v}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
