import type { Trail } from "../../lib/domain/trails";
import { Link } from "../router";
import { CommonsPhoto, useFormat } from "./ui";

export function TrailCard({ trail, i = 0 }: { trail: Trail; i?: number }) {
  const f = useFormat();
  return (
    <Link to={`/explore/${trail.id}`} className="trail-card" aria-current={undefined}>
      <div className="img">
        <CommonsPhoto file={trail.photo?.file} alt={trail.photo?.alt ?? ""} seed={i + 2} width={700} />
      </div>
      <div className="body">
        <div className="where">
          {trail.region}, {trail.country}
        </div>
        <h3>{trail.name}</h3>
        <p className="small muted" style={{ margin: 0 }}>
          {trail.blurb}
        </p>
        <div className="facts">
          <span>
            <b>{trail.distanceKm.value != null ? f.d(trail.distanceKm.value) : "Distance unverified"}</b>
          </span>
          <span>
            <b>{trail.days.value ?? `~${trail.daysTypical} days`}</b>
            {trail.days.value && /^\d+$/.test(trail.days.value) ? " days" : ""}
          </span>
          <span className="cap">{trail.experience === "experienced" ? "Experienced hikers" : trail.experience === "beginner" ? "Beginner friendly" : "Some experience"}</span>
          <span>{trail.camping === "huts" ? "Huts" : trail.camping === "campsites" ? "Campsites" : trail.camping === "huts_and_campsites" ? "Huts & campsites" : "Varied accommodation"}</span>
        </div>
      </div>
    </Link>
  );
}
