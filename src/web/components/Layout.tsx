import { useEffect, useState, type ReactNode } from "react";
import { BRAND, Logo } from "../brand";
import { Link } from "../router";
import { Icon } from "./icons";
import { Toasts } from "./ui";

const NAV = [
  { to: "/", label: "Home", icon: "home" as const },
  { to: "/plan", label: "Plan a Trip", short: "Plan", icon: "plus" as const },
  { to: "/explore", label: "Explore Trails", short: "Explore", icon: "compass" as const },
  { to: "/gear", label: "My Gear", short: "Gear", icon: "backpack" as const },
  { to: "/adventures", label: "My Adventures", short: "Trips", icon: "map" as const },
];

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function Layout({ children }: { children: ReactNode }) {
  const online = useOnline();
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topnav">
        <div className="wrap">
          <Link to="/" className="brand" aria-current={undefined}>
            <Logo />
            {BRAND.name}
          </Link>
          <nav className="navlinks" aria-label="Main">
            {NAV.slice(1).map((n) => (
              <Link key={n.to} to={n.to}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="nav-utils">
            {!online && (
              <span className="badge unverified" title="You're offline. Saved trips still work; AI, maps and live data need a connection.">
                <Icon name="wifiOff" size={14} /> Offline
              </span>
            )}
            <Link to="/help" className="icon-btn" aria-label="Help and safety" title="Help and safety">
              <Icon name="help" />
            </Link>
            <Link to="/settings" className="icon-btn" aria-label="Settings and account" title="Settings and account">
              <Icon name="settings" />
            </Link>
            <Link to="/plan" className="btn sm nav-cta" aria-current={undefined}>
              <Icon name="plus" size={18} /> Plan an adventure
            </Link>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site">
        <div className="wrap row between">
          <span>
            {BRAND.name} is a planning tool, not an emergency service or a substitute for official park, weather and navigation information.
          </span>
          <span className="row">
            <Link to="/help">Help &amp; safety</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/settings">Settings</Link>
          </span>
        </div>
      </footer>
      <nav className="tabbar" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={n.to === "/plan" ? "plan-tab" : undefined}>
            <span className="ic">
              <Icon name={n.icon} size={20} />
            </span>
            {n.short ?? n.label}
          </Link>
        ))}
      </nav>
      <Toasts />
    </>
  );
}
