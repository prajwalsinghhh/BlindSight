// Small shared pieces. State is always conveyed by TEXT + SHAPE + colour.

const sv = (d) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

export const Icons = {
  live: sv(<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  obstacle: sv(<><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18h.01" /></>),
  sensors: sv(<><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>),
  voice: sv(<><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14" /></>),
};

// Severity: icon glyph + word + colour class.
const SEV = {
  CLEAR: { glyph: "✓", cls: "clear" },
  CAUTION: { glyph: "!", cls: "caution" },
  WARNING: { glyph: "▲", cls: "warning" },
  DANGER: { glyph: "✕", cls: "danger" },
};

export function SeverityBadge({ level, big = false }) {
  const s = SEV[level];
  if (!s) return <span className="badge off" role="img" aria-label="Scanning off">– SCANNING OFF</span>;
  return (
    <span className={`badge ${s.cls} ${big ? "big" : ""}`} role="img" aria-label={`Warning level ${level}`}>
      <span aria-hidden="true">{s.glyph}</span> {level}
    </span>
  );
}

// Connection kinds -> glyph + label (never colour alone)
const KIND = {
  connected: { glyph: "●", label: "Connected", cls: "clear" },
  initialising: { glyph: "◐", label: "Initialising", cls: "caution" },
  disconnected: { glyph: "○", label: "Disconnected", cls: "danger" },
  error: { glyph: "✕", label: "Error", cls: "danger" },
  unavailable: { glyph: "–", label: "Data unavailable", cls: "off" },
};

export function Status({ kind, label }) {
  const k = KIND[kind] || KIND.unavailable;
  return (
    <span className={`status ${k.cls}`}>
      <span aria-hidden="true">{k.glyph}</span> {label || k.label}
    </span>
  );
}

export function Card({ title, status, children, id }) {
  return (
    <section className="card" aria-labelledby={id}>
      <header className="card-head">
        <h2 id={id}>{title}</h2>
        {status}
      </header>
      {children}
    </section>
  );
}

export function Metric({ label, value, unit, stale }) {
  const shown = value === null || value === undefined ? "—" : value;
  return (
    <div className={`metric ${stale ? "stale" : ""}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">
        {shown}
        {value !== null && value !== undefined && unit ? <small> {unit}</small> : null}
      </span>
    </div>
  );
}

export function ago(ts, now) {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  const clock = new Date(ts).toLocaleTimeString();
  return `${clock} (${s} s ago)`;
}
