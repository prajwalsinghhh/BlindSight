import { useCallback, useEffect, useRef, useState } from "react";
import { isValidLevel } from "../engine/severity";

// ============================================================================
// ESP32 -> phone data contract (PROPOSED - the hardware isn't finished yet).
// Transport: WebSocket (ws://host/ws, pushes JSON) or HTTP polling
// (http://host/status, returns JSON). Every field is optional; a missing
// field is shown as "Data unavailable". Nothing is ever invented.
//
// {
//   "device": { "name": "drishti-esp32", "fw": "0.1.0", "ip": "192.168.4.1", "uptime_s": 120 },
//   "tof":    { "status": "ok|init|out_of_range|error", "distance_mm": 1234 },
//   "imu":    { "status": "ok|init|error", "calibrated": true,
//               "accel": {"x":0.01,"y":0.02,"z":0.98},     // g
//               "gyro":  {"x":0.5,"y":-0.2,"z":0.1},       // deg/s
//               "pitch": 1.2, "roll": -0.4 },              // deg (optional)
//   "gps":    { "status": "fix|searching|unavailable|error",
//               "lat": 12.92, "lon": 77.50, "sats": 7 },
//   "alert":  "CLEAR|CAUTION|WARNING|DANGER"               // optional
// }
// The phone stamps its own receive time; the device clock is not trusted.
// ============================================================================

export const STALE_MS = 3000;
const POLL_MS = 500;
const POLL_TIMEOUT_MS = 2000;
const MAX_RETRY_MS = 10000;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === "string" ? v : null);
const vec = (o) => (o ? { x: num(o.x), y: num(o.y), z: num(o.z) } : null);

export function normalize(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    device: r.device
      ? { name: str(r.device.name), fw: str(r.device.fw), ip: str(r.device.ip), uptime: num(r.device.uptime_s) }
      : null,
    tof: r.tof ? { status: str(r.tof.status), distanceMm: num(r.tof.distance_mm) } : null,
    imu: r.imu
      ? {
          status: str(r.imu.status),
          calibrated: typeof r.imu.calibrated === "boolean" ? r.imu.calibrated : null,
          accel: vec(r.imu.accel),
          gyro: vec(r.imu.gyro),
          pitch: num(r.imu.pitch),
          roll: num(r.imu.roll),
        }
      : null,
    gps: r.gps
      ? { status: str(r.gps.status), lat: num(r.gps.lat), lon: num(r.gps.lon), sats: num(r.gps.sats) }
      : null,
    alert: isValidLevel(r.alert) ? r.alert : null,
  };
}

/** Link states: not-configured | connecting | connected | disconnected | error */
export function useSensors(url) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({
    link: "not-configured", error: null, data: null, lastMessageAt: null, retryInSec: null,
  });
  const retriesRef = useRef(0);

  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    setAttempt((a) => a + 1);
  }, []);

  useEffect(() => {
    if (!url) {
      setState({ link: "not-configured", error: null, data: null, lastMessageAt: null, retryInSec: null });
      return undefined;
    }

    let cancelled = false;
    let ws = null;
    let pollTimer = null;
    let retryTimer = null;
    let failures = 0;

    const onData = (raw) => {
      retriesRef.current = 0;
      failures = 0;
      setState({
        link: "connected", error: null, data: normalize(raw),
        lastMessageAt: Date.now(), retryInSec: null,
      });
    };

    const fail = (message) => {
      if (cancelled) return;
      const delay = Math.min(1000 * 2 ** retriesRef.current, MAX_RETRY_MS);
      retriesRef.current += 1;
      setState((s) => ({ ...s, link: "disconnected", error: message, retryInSec: Math.round(delay / 1000) }));
      retryTimer = setTimeout(() => !cancelled && setAttempt((a) => a + 1), delay);
    };

    setState((s) => ({ ...s, link: "connecting", error: null }));

    if (/^wss?:/i.test(url)) {
      try {
        ws = new WebSocket(url);
      } catch (e) {
        fail(`Invalid WebSocket address: ${e.message}`);
        return () => clearTimeout(retryTimer);
      }
      ws.onmessage = (ev) => {
        try { onData(JSON.parse(ev.data)); }
        catch { setState((s) => ({ ...s, error: "Received data that is not valid JSON" })); }
      };
      ws.onerror = () => {};
      ws.onclose = () => fail("Connection to the ESP32 closed");
    } else {
      const poll = async () => {
        if (cancelled) return;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), POLL_TIMEOUT_MS);
        try {
          const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          onData(await res.json());
        } catch (e) {
          failures += 1;
          if (failures >= 3) return fail(e.name === "AbortError" ? "ESP32 did not respond (timeout)" : `Cannot read sensor data: ${e.message}`);
        } finally {
          clearTimeout(t);
        }
        if (!cancelled && failures < 3) pollTimer = setTimeout(poll, POLL_MS);
      };
      poll();
    }

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
      clearTimeout(retryTimer);
      if (ws) { ws.onclose = null; ws.onmessage = null; ws.close(); }
    };
  }, [url, attempt]);

  return { ...state, reconnect };
}

/** Re-render every `ms` so "x s ago" and STALE badges stay current. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
