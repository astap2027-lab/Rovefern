import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Layout } from "./components/Layout";
import { hydrate, useStore } from "./lib/store";
import { match, useLocation } from "./router";
import { Home } from "./pages/Home";
import { Plan } from "./pages/Plan";
import { Explore, TrailDetail } from "./pages/Explore";
import { OsmTrailDetail } from "./pages/TrailSearch";
import { GearPage } from "./pages/Gear";
import { Adventures } from "./pages/Adventures";
import { TripPage } from "./trip/TripPage";
import { PrintTrip } from "./trip/PrintTrip";
import { Settings } from "./pages/Settings";
import { Help, Privacy, NotFound } from "./pages/Static";
import { Spinner } from "./components/ui";

function Routes() {
  const { path } = useLocation();
  const loading = useStore((s) => s.storage === "loading");
  useEffect(() => {
    // Move focus to main content on navigation for screen-reader users.
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [path]);
  if (loading)
    return (
      <div className="wrap page" style={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
        <Spinner />
      </div>
    );
  let m: Record<string, string> | null;
  if (path === "/") return <Home />;
  if (path === "/plan") return <Plan />;
  if (path === "/explore") return <Explore />;
  if ((m = match("/explore/osm/:key", path))) return <OsmTrailDetail trailKey={m.key} />;
  if ((m = match("/explore/:id", path))) return <TrailDetail id={m.id} />;
  if (path === "/gear") return <GearPage />;
  if (path === "/adventures") return <Adventures />;
  if ((m = match("/trip/:id/print", path))) return <PrintTrip id={m.id} />;
  if ((m = match("/trip/:id/:tab?", path))) return <TripPage id={m.id} tab={m.tab ?? "overview"} />;
  if (path === "/settings") return <Settings />;
  if (path === "/help") return <Help />;
  if (path === "/privacy") return <Privacy />;
  return <NotFound />;
}

function App() {
  const { path } = useLocation();
  if (path.endsWith("/print")) return <Routes />;
  return (
    <Layout>
      <Routes />
    </Layout>
  );
}

hydrate();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && location.hostname !== "localhost") {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
