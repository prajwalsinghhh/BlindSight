import { useState } from "react";
import { useDetection } from "../engine/DetectionProvider";
import { Status } from "../components/ui";

const CAMERA_STATUS = {
  idle: ["unavailable", "Camera idle"],
  "not-configured": ["unavailable", "No camera address set"],
  connecting: ["initialising", "Camera connecting"],
  live: ["connected", "Camera live"],
  error: ["error", "Camera error"],
};

export default function LiveVision({ source, setSource, headingRef }) {
  const { videoRef, imgRef, canvasRef, camera, models, frame, fps, detections, reconnect } = useDetection();
  const [draftUrl, setDraftUrl] = useState(source.url);

  const [camKind, camLabel] = CAMERA_STATUS[camera.state] || CAMERA_STATUS.idle;
  const modelKind = models.main === "ready" ? "connected" : models.main === "error" ? "error" : "initialising";
  const modelLabel = models.main === "ready"
    ? models.pothole === "error" ? "Model ready (pothole model failed)" : "Model ready"
    : models.main === "error" ? "Model failed" : "Model loading";
  const isEsp = source.mode === "esp32";

  return (
    <>
      <h1 tabIndex={-1} ref={headingRef}>Live Vision</h1>

      <div className="camera" style={{ aspectRatio: `${frame.w} / ${frame.h}` }}
           role="img"
           aria-label={`Live camera view. ${detections.length} object${detections.length === 1 ? "" : "s"} detected.`}>
        <video ref={videoRef} playsInline muted hidden={isEsp} />
        <img ref={imgRef} crossOrigin="anonymous" alt="" hidden={!isEsp} />
        <canvas ref={canvasRef} />
        {camera.state !== "live" && (
          <div className="camera-overlay">
            <strong>{camLabel}</strong>
            {camera.message && <span>{camera.message}</span>}
            {camera.state === "connecting" && <span>Please wait…</span>}
          </div>
        )}
      </div>

      <div className="chips" aria-label="Status">
        <Status kind={camKind} label={camLabel} />
        <Status kind={modelKind} label={modelLabel} />
        <span className="status off">{fps ? `${fps} FPS` : "FPS: n/a"}</span>
      </div>
      {models.error && <p className="note err" role="alert">{models.error}</p>}

      <div className="controls">
        <div className="seg" role="group" aria-label="Camera source">
          <button className={source.mode === "esp32" ? "on" : ""} aria-pressed={source.mode === "esp32"}
                  onClick={() => setSource({ ...source, mode: "esp32" })}>ESP32-CAM</button>
          <button className={source.mode === "phone" ? "on" : ""} aria-pressed={source.mode === "phone"}
                  onClick={() => setSource({ ...source, mode: "phone" })}>Phone camera</button>
        </div>
        <button className="btn" onClick={reconnect}>Reconnect camera</button>
      </div>

      {isEsp && (
        <div className="field">
          <label htmlFor="cam-url">ESP32-CAM stream address (MJPEG)</label>
          <div className="row">
            <input id="cam-url" inputMode="url" autoCapitalize="off" autoCorrect="off"
                   placeholder="http://192.168.4.1:81/stream" value={draftUrl}
                   onChange={(e) => setDraftUrl(e.target.value.trim())} />
            <button className="btn primary" onClick={() => setSource({ ...source, url: draftUrl })}>Save</button>
          </div>
        </div>
      )}
      {!isEsp && <p className="note">Phone camera is a testing source until the wearable is ready.</p>}
    </>
  );
}
