import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import * as ort from "onnxruntime-web";

import { NAVIGATION_CLASSES } from "../constants/classes";
import { preprocessImage, getFrameSize } from "../vision/preprocess";
import { processOutput } from "../vision/postprocess";
import { processPotholeOutput } from "../vision/potholePostprocess";
import { addDirections } from "../navigation/direction";
import { getPathGeometry, addPathStatus } from "../navigation/pathAnalysis";
import { analyze } from "./severity";

// Bundle the ONNX WASM files locally (scripts/copy-ort.mjs). The phone may be
// connected only to the wearable's Wi-Fi with no internet, so a CDN fetch
// would fail. Single-threaded: WebView is not cross-origin isolated.
ort.env.wasm.wasmPaths = new URL(`${import.meta.env.BASE_URL}ort/`, window.location.href).href;
ort.env.wasm.numThreads = 1;

const MODEL_PATH = "/models/yolo11n.onnx";
const POTHOLE_MODEL_PATH = "/models/pothole_yolo11n.onnx";
const DETECTION_INTERVAL = 150; // unchanged from the original
const STALL_MS = 6000;          // identical frames for this long => stream frozen
const MAX_RETRY_MS = 10000;

const DetectionContext = createContext(null);
export const useDetection = () => useContext(DetectionContext);

export function DetectionProvider({ source, children }) {
  const videoRef = useRef(null);
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const sessionRef = useRef(null);
  const potholeSessionRef = useRef(null);
  const sourceRef = useRef(source);
  const pausedRef = useRef(false);
  const stallRef = useRef({ signature: null, since: 0 });
  const retriesRef = useRef(0);
  const cameraStateRef = useRef("idle");
  const lastDoneRef = useRef(0);

  const [attempt, setAttempt] = useState(0);
  const [models, setModels] = useState({ main: "loading", pothole: "loading", error: null });
  const [camera, setCameraRaw] = useState({ state: "idle", message: "" });
  const [frame, setFrame] = useState({ w: 640, h: 480 });
  const [detections, setDetections] = useState([]);
  const [fps, setFps] = useState(0);

  sourceRef.current = source;

  const setCamera = useCallback((state, message = "") => {
    if (cameraStateRef.current === state) return;
    cameraStateRef.current = state;
    setCameraRaw({ state, message });
  }, []);

  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    setAttempt((a) => a + 1);
  }, []);

  // ---------- models (existing YOLO11n + pothole model, loaded in-browser) ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const session = await ort.InferenceSession.create(MODEL_PATH);
        if (!alive) return void session.release();
        sessionRef.current = session;
        setModels((m) => ({ ...m, main: "ready" }));
      } catch (e) {
        console.error("YOLO load failed:", e);
        if (alive) setModels({ main: "error", pothole: "error", error: e.message });
        return;
      }
      try {
        const pothole = await ort.InferenceSession.create(POTHOLE_MODEL_PATH);
        if (!alive) return void pothole.release();
        potholeSessionRef.current = pothole;
        setModels((m) => ({ ...m, pothole: "ready" }));
      } catch (e) {
        console.error("Pothole model load failed:", e);
        if (alive) setModels((m) => ({ ...m, pothole: "error", error: e.message }));
      }
    })();
    return () => {
      alive = false;
      sessionRef.current?.release();
      potholeSessionRef.current?.release();
      sessionRef.current = null;
      potholeSessionRef.current = null;
    };
  }, []);

  // ---------- camera source ----------
  useEffect(() => {
    let cancelled = false;
    let stream = null;
    let retryTimer = null;
    const video = videoRef.current;
    const img = imgRef.current;

    const scheduleRetry = (message) => {
      setCamera("error", message);
      const delay = Math.min(1000 * 2 ** retriesRef.current, MAX_RETRY_MS);
      retriesRef.current += 1;
      retryTimer = setTimeout(() => !cancelled && setAttempt((a) => a + 1), delay);
    };

    if (source.mode === "phone") {
      setCamera("connecting");
      (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: "environment" },
            audio: false,
          });
          if (cancelled) return stream.getTracks().forEach((t) => t.stop());
          video.srcObject = stream;
          await video.play();
          setCamera("connecting", "Waiting for first frame");
        } catch (e) {
          if (!cancelled) setCamera("error", `Phone camera unavailable: ${e.message}`);
        }
      })();
    } else if (!source.url) {
      setCamera("not-configured");
    } else {
      setCamera("connecting");
      const sep = source.url.includes("?") ? "&" : "?";
      img.onerror = () => !cancelled && scheduleRetry("Cannot reach the camera stream");
      img.src = `${source.url}${sep}_=${Date.now()}`;
    }

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (img) {
        img.onerror = null;
        img.removeAttribute("src"); // closes the MJPEG connection
      }
      if (video) video.srcObject = null;
      stream?.getTracks().forEach((t) => t.stop());
      cameraStateRef.current = "idle";
      stallRef.current = { signature: null, since: 0 };
    };
  }, [source.mode, source.url, attempt, setCamera]);

  // ---------- foreground / background / network ----------
  useEffect(() => {
    const onVisibility = () => {
      pausedRef.current = document.hidden;
      if (!document.hidden) reconnect();
    };
    const onOnline = () => cameraStateRef.current === "error" && reconnect();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [reconnect]);

  // ---------- drawing (ported from the original drawDetections) ----------
  const draw = useCallback((list, width, height) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    const path = getPathGeometry(width, height);
    ctx.beginPath();
    ctx.moveTo(path.topLeft, path.topY);
    ctx.lineTo(path.topRight, path.topY);
    ctx.lineTo(path.bottomRight, path.bottomY);
    ctx.lineTo(path.bottomLeft, path.bottomY);
    ctx.closePath();
    ctx.fillStyle = "rgba(0,255,0,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,255,0,0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    [0.33, 0.67].forEach((p) => {
      ctx.beginPath();
      ctx.moveTo(width * p, 0);
      ctx.lineTo(width * p, height);
      ctx.stroke();
    });

    const fontPx = Math.max(14, Math.round(width / 38));
    ctx.font = `bold ${fontPx}px Arial`;
    ctx.lineWidth = Math.max(3, Math.round(width / 200));

    list.forEach((d) => {
      const isPothole = d.className?.toLowerCase().includes("pothole");
      let color = isPothole ? "#ff3b30" : "#ffffff";
      if (d.pathStatus === "IN PATH") color = isPothole ? "#ff3b30" : "#00ff66";
      else if (d.pathStatus === "PARTIAL") color = "#ffaa00";

      ctx.strokeStyle = color;
      ctx.strokeRect(d.x1, d.y1, d.x2 - d.x1, d.y2 - d.y1);

      const label = `${d.className} ${(d.score * 100).toFixed(0)}% ${d.direction}`;
      const w = ctx.measureText(label).width + 10;
      const h = fontPx + 10;
      const y = Math.max(0, d.y1 - h);
      ctx.fillStyle = color;
      ctx.fillRect(d.x1, y, w, h);
      ctx.fillStyle = "black";
      ctx.fillText(label, d.x1 + 5, y + fontPx + 1);
    });
  }, []);

  // ---------- the ONE inference loop ----------
  useEffect(() => {
    let alive = true;
    let timer = null;

    const tick = async () => {
      if (!alive) return;
      const next = () => alive && (timer = setTimeout(tick, DETECTION_INTERVAL));

      const isPhone = sourceRef.current.mode === "phone";
      const el = isPhone ? videoRef.current : imgRef.current;
      const ready = el && (isPhone ? el.readyState >= 2 : el.naturalWidth > 0);

      // Never mark the camera live again while it is in the error state: an <img>
      // keeps its last frame after a dropped stream. Recovery happens when the
      // source effect restarts the connection.
      if (
        !sessionRef.current || !ready || pausedRef.current ||
        cameraStateRef.current === "error"
      ) return next();

      let tensor;
      try {
        const pre = preprocessImage(el);
        tensor = pre.tensor;
        const { scale, padX, padY, width, height, signature } = pre;

        // Frozen-stream detection (ESP32 stream only)
        if (!isPhone) {
          const now = performance.now();
          if (stallRef.current.signature !== signature) {
            stallRef.current = { signature, since: now };
          } else if (now - stallRef.current.since > STALL_MS) {
            setCamera("error", "Stream stalled - frames stopped updating");
            stallRef.current = { signature: null, since: now };
            retriesRef.current = 0;
            setAttempt((a) => a + 1);
            return; // finally{} schedules the next tick
          }
        }

        const main = sessionRef.current;
        const out = await main.run({ [main.inputNames[0]]: tensor });
        const mainDetections = processOutput(
          out[main.outputNames[0]], width, height, scale, padX, padY
        ).filter((d) => NAVIGATION_CLASSES.has(d.className));

        let potholes = [];
        if (potholeSessionRef.current) {
          const p = potholeSessionRef.current;
          const pOut = await p.run({ [p.inputNames[0]]: tensor });
          potholes = processPotholeOutput(
            pOut[p.outputNames[0]], width, height, scale, padX, padY
          );
        }

        const combined = [...mainDetections, ...potholes];
        const result = addPathStatus(addDirections(combined, width), width, height);

        if (!alive) return;
        draw(result, width, height);
        setCamera("live");
        retriesRef.current = 0;
        setFrame((f) => (f.w === width && f.h === height ? f : { w: width, h: height }));
        setDetections(result);

        const now = performance.now();
        if (lastDoneRef.current) {
          const inst = 1000 / (now - lastDoneRef.current);
          setFps((prev) => Math.round((prev ? prev * 0.7 + inst * 0.3 : inst) * 10) / 10);
        }
        lastDoneRef.current = now;
      } catch (e) {
        if (e.name === "SecurityError") {
          setCamera(
            "error",
            "Stream blocked by CORS. The ESP32 must send 'Access-Control-Allow-Origin: *'."
          );
        } else {
          console.error("Detection error:", e);
        }
      } finally {
        tensor?.dispose?.();
        next();
      }
    };

    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [draw, setCamera]);

  // When the camera is not live, drop stale detections and clear the overlay.
  useEffect(() => {
    if (camera.state !== "live") {
      setDetections([]);
      setFps(0);
      lastDoneRef.current = 0;
      const c = canvasRef.current;
      c?.getContext("2d").clearRect(0, 0, c.width, c.height);
    }
  }, [camera.state]);

  const active = camera.state === "live" && models.main === "ready";
  const analysis = useMemo(() => analyze(detections, frame, active), [detections, frame, active]);

  const value = useMemo(
    () => ({
      videoRef, imgRef, canvasRef, camera, models, frame, fps,
      detections, analysis, reconnect,
    }),
    [camera, models, frame, fps, detections, analysis, reconnect]
  );

  return <DetectionContext.Provider value={value}>{children}</DetectionContext.Provider>;
}
