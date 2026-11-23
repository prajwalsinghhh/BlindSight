import { useState } from "react";
import { Card, Metric, Status, ago } from "../components/ui";
import { STALE_MS, useNow } from "../hardware/sensorClient";

const deg = (r) => (r * 180) / Math.PI;
const r2 = (v, d = 2) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);

// Component state from the sensor's own status string + link freshness.
function componentKind(link, fresh, section, okValues) {
  if (link === "not-configured") return "unavailable";
  if (!section) return link === "connected" ? "unavailable" : "disconnected";
  if (!fresh) return "disconnected";
  const s = (section.status || "").toLowerCase();
  if (s === "init") return "initialising";
  if (s === "error") return "error";
  if (okValues.includes(s)) return "connected";
  return "unavailable";
}

export default function Sensors({ sensors, endpoint, setEndpoint, headingRef }) {
  const now = useNow(1000);
  const [draft, setDraft] = useState(endpoint.url);
  const { link, data, lastMessageAt, error, retryInSec, reconnect } = sensors;

  const fresh = link === "connected" && lastMessageAt && now - lastMessageAt < STALE_MS;
  const stale = !fresh;
  const age = ago(lastMessageAt, now);

  const linkKind = link === "connected" ? (fresh ? "connected" : "error")
    : link === "connecting" ? "initialising"
    : link === "not-configured" ? "unavailable" : "disconnected";
  const linkLabel = {
    "not-configured": "Not configured", connecting: "Connecting",
    connected: fresh ? "Connected" : "Connected – data stale",
    disconnected: retryInSec ? `Disconnected – retrying in ${retryInSec} s` : "Disconnected",
    error: "Error",
  }[link];

  const tof = data?.tof;
  const imu = data?.imu;
  const gps = data?.gps;

  // Pitch/roll: use the firmware's values; otherwise derive from the accelerometer
  // (clearly labelled) - this is a calculation, not an invented reading.
  let pitch = imu?.pitch ?? null, roll = imu?.roll ?? null, derived = false;
  const a = imu?.accel;
  if ((pitch === null || roll === null) && a && [a.x, a.y, a.z].every((v) => v !== null)) {
    pitch = pitch ?? deg(Math.atan2(-a.x, Math.hypot(a.y, a.z)));
    roll = roll ?? deg(Math.atan2(a.y, a.z));
    derived = true;
  }

  const tofStatus = (tof?.status || "").toLowerCase();
  const tofMeasurement = !tof ? "Data unavailable"
    : tofStatus === "ok" ? "Valid reading"
    : tofStatus === "out_of_range" ? "Out of range"
    : tofStatus === "init" ? "Initialising"
    : tofStatus === "error" ? "Invalid reading" : "Unknown";

  const gpsKind = !gps ? (link === "connected" ? "unavailable" : "disconnected")
    : stale ? "disconnected"
    : gps.status === "fix" ? "connected" : gps.status === "searching" ? "initialising"
    : gps.status === "error" ? "error" : "unavailable";
  const gpsLabel = { fix: "Location acquired", searching: "Acquiring location",
    unavailable: "GPS unavailable", error: "GPS error" }[gps?.status] || null;

  return (
    <>
      <h1 tabIndex={-1} ref={headingRef}>Sensor Dashboard</h1>
      <p className="note">Values are shown exactly as received from the wearable. Dimmed values are stale.</p>

      <Card id="c-esp" title="ESP32 connection" status={<Status kind={linkKind} label={linkLabel} />}>
        <div className="grid2">
          <Metric label="Device" value={data?.device?.name ?? null} stale={stale} />
          <Metric label="Firmware" value={data?.device?.fw ?? null} stale={stale} />
          <Metric label="Device IP" value={data?.device?.ip ?? null} stale={stale} />
          <Metric label="Uptime" value={data?.device?.uptime ?? null} unit="s" stale={stale} />
        </div>
        <p className="meta">Last successful update: {age}</p>
        {error && <p className="note err" role="alert">Error: {error}</p>}
        <div className="field">
          <label htmlFor="sensor-url">Sensor data address (ws:// or http://)</label>
          <div className="row">
            <input id="sensor-url" inputMode="url" autoCapitalize="off" autoCorrect="off"
                   placeholder="ws://192.168.4.1/ws" value={draft}
                   onChange={(e) => setDraft(e.target.value.trim())} />
            <button className="btn primary" onClick={() => setEndpoint({ url: draft })}>Save</button>
          </div>
          <button className="btn" onClick={reconnect} disabled={link === "not-configured"}>Reconnect</button>
        </div>
      </Card>

      <Card id="c-tof" title="VL53L1X distance sensor"
            status={<Status kind={componentKind(link, fresh, tof, ["ok", "out_of_range"])} />}>
        <div className="grid2">
          <Metric label="Distance" value={tofStatus === "ok" ? tof?.distanceMm : null} unit="mm" stale={stale} />
          <Metric label="Measurement" value={tofMeasurement} stale={stale} />
        </div>
        <p className="meta">Last update: {age}</p>
      </Card>

      <Card id="c-imu" title="MPU6050 motion"
            status={<Status kind={componentKind(link, fresh, imu, ["ok"])} />}>
        <h3>Accelerometer (g)</h3>
        <div className="grid3">
          <Metric label="X" value={r2(a?.x)} stale={stale} />
          <Metric label="Y" value={r2(a?.y)} stale={stale} />
          <Metric label="Z" value={r2(a?.z)} stale={stale} />
        </div>
        <h3>Gyroscope (°/s)</h3>
        <div className="grid3">
          <Metric label="X" value={r2(imu?.gyro?.x)} stale={stale} />
          <Metric label="Y" value={r2(imu?.gyro?.y)} stale={stale} />
          <Metric label="Z" value={r2(imu?.gyro?.z)} stale={stale} />
        </div>
        <h3>Orientation</h3>
        <div className="grid2">
          <Metric label="Pitch" value={r2(pitch, 1)} unit="°" stale={stale} />
          <Metric label="Roll" value={r2(roll, 1)} unit="°" stale={stale} />
        </div>
        {derived && <p className="meta">Pitch/roll computed from the accelerometer.</p>}
        <p className="meta">
          Calibration: {imu?.calibrated === null || imu?.calibrated === undefined ? "not reported"
            : imu.calibrated ? "calibrated" : "not calibrated"} · Last update: {age}
        </p>
      </Card>

      <Card id="c-gps" title="GPS status" status={<Status kind={gpsKind} label={gpsLabel} />}>
        <div className="grid2">
          <Metric label="Latitude" value={gps?.lat !== null && gps?.lat !== undefined ? r2(gps.lat, 6) : null} stale={stale} />
          <Metric label="Longitude" value={gps?.lon !== null && gps?.lon !== undefined ? r2(gps.lon, 6) : null} stale={stale} />
          <Metric label="Satellites" value={gps?.sats ?? null} stale={stale} />
        </div>
        <p className="meta">Last update: {age}. GPS is optional – obstacle detection does not depend on it.</p>
      </Card>
    </>
  );
}
