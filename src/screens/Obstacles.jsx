import { SeverityBadge } from "../components/ui";

const SPOKEN = {
  CLEAR: "clear", CAUTION: "caution", WARNING: "warning", DANGER: "danger",
};

function Zone({ name, zone, active }) {
  const labels = zone.items.map((i) => i.className);
  const summary = !active ? "scanning off"
    : labels.length ? `${zone.level}: ${labels.join(", ")}` : "nothing detected";
  return (
    <div className={`zone ${active ? SPOKEN[zone.level] : "off"}`} role="group"
         aria-label={`${name}: ${summary}`}>
      <span className="zone-name">{name}</span>
      <SeverityBadge level={active ? zone.level : null} />
      <span className="zone-items" aria-hidden="true">{active ? (labels.slice(0, 2).join(", ") || "—") : "—"}</span>
    </div>
  );
}

export default function Obstacles({ analysis, overall, overallSource, headingRef, voiceOn }) {
  const { active, zones, items } = analysis;
  return (
    <>
      <h1 tabIndex={-1} ref={headingRef}>Obstacle Detection</h1>

      <div className={`hero ${overall ? SPOKEN[overall] : "off"}`}
           aria-live={voiceOn ? "off" : "polite"} aria-atomic="true">
        <span className="hero-label">Overall status</span>
        <SeverityBadge level={overall} big />
        <span className="hero-sub">
          {!active ? "Waiting for live camera and model"
            : overall === "CLEAR" ? "Scanning – path is clear"
            : `Scanning – ${items.length} object${items.length === 1 ? "" : "s"} detected`}
          {overallSource === "device" && " (wearable alert)"}
        </span>
      </div>

      <div className="zones">
        <Zone name="LEFT" zone={zones.LEFT} active={active} />
        <Zone name="CENTER" zone={zones.CENTER} active={active} />
        <Zone name="RIGHT" zone={zones.RIGHT} active={active} />
      </div>
      <Zone name="DOWNWARD (ground hazards)" zone={zones.DOWNWARD} active={active} />
      <p className="note">
        Downward shows ground hazards found by the pothole model. Dedicated downward
        sensing will appear here once the wearable supplies it.
      </p>

      <h2 className="section">Detected objects</h2>
      {!active || items.length === 0 ? (
        <p className="empty">{active ? "No objects detected." : "No data – camera or model not ready."}</p>
      ) : (
        <ul className="list">
          {items.map((d, i) => (
            <li key={i} className="item"
                aria-label={`${d.className}, ${Math.round(d.score * 100)} percent, ${d.direction.toLowerCase()}, ${d.pathStatus.toLowerCase()}, level ${d.severity.toLowerCase()}`}>
              <div>
                <strong>{d.className}</strong>
                <span className="muted"> {Math.round(d.score * 100)}% · {d.direction} · {d.pathStatus}</span>
              </div>
              <SeverityBadge level={d.severity} />
            </li>
          ))}
        </ul>
      )}
      <p className="note">Severity is estimated from path position and apparent size in the camera image.</p>
    </>
  );
}
