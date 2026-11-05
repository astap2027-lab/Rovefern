import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") window.addEventListener("popstate", notify);

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  notify();
  if (!to.includes("#")) window.scrollTo({ top: 0 });
}

export function useLocation() {
  const href = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => location.pathname + location.search,
    () => "/",
  );
  const [path, search = ""] = href.split("?");
  return { path, query: new URLSearchParams(search) };
}

export function Link({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { path } = useLocation();
  const current = rest["aria-current"] ?? (path === to || (to !== "/" && path.startsWith(to + "/")) ? "page" : undefined);
  return (
    <a
      href={to}
      aria-current={current}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    />
  );
}

/** Match "/trip/:id/:tab?" style patterns. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  const out: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i];
    if (seg.startsWith(":")) {
      const optional = seg.endsWith("?");
      const key = seg.slice(1, optional ? -1 : undefined);
      if (s[i] == null) {
        if (optional) continue;
        return null;
      }
      out[key] = decodeURIComponent(s[i]);
    } else if (seg !== s[i]) return null;
  }
  if (s.length > p.length) return null;
  return out;
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Rovefern` : "Rovefern — Your next adventure, organised";
  }, [title]);
}
