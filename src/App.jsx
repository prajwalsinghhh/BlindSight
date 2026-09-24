import { useEffect, useRef, useState } from "react";

import * as ort from "onnxruntime-web";

import { NAVIGATION_CLASSES } from "./constants/classes";

import { preprocessImage } from "./vision/preprocess";

import { processOutput } from "./vision/postprocess";

import { addDirections } from "./navigation/direction";

import { getPathGeometry, addPathStatus } from "./navigation/pathAnalysis";

const MODEL_PATH = "/models/yolo11n.onnx";

const DETECTION_INTERVAL = 150;

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const sessionRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  const [cameraActive, setCameraActive] = useState(false);

  const [modelLoaded, setModelLoaded] = useState(false);

  const [status, setStatus] = useState("Loading YOLO11n...");

  const [objectCount, setObjectCount] = useState(0);

  const [fps, setFps] = useState(0);

  // ----------------------------------------
  // INITIALIZATION
  // ----------------------------------------

  useEffect(() => {
    mountedRef.current = true;

    const initialize = async () => {
      try {
        // --------------------------------
        // Load YOLO model
        // --------------------------------

        setStatus("Loading YOLO11n...");

        const session = await ort.InferenceSession.create(MODEL_PATH);

        if (!mountedRef.current) {
          session.release();
          return;
        }

        sessionRef.current = session;

        console.log("YOLO loaded");

        console.log("Inputs:", session.inputNames);

        console.log("Outputs:", session.outputNames);

        setModelLoaded(true);

        // --------------------------------
        // Start camera
        // --------------------------------

        setStatus("Starting camera...");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            facingMode: "environment",
          },
          audio: false,
        });

        streamRef.current = stream;

        if (!videoRef.current) {
          stream.getTracks().forEach((track) => track.stop());

          return;
        }

        videoRef.current.srcObject = stream;

        await videoRef.current.play();

        if (!mountedRef.current) {
          return;
        }

        setCameraActive(true);

        setStatus("YOLO11n ready");

        detectFrame();
      } catch (error) {
        console.error(error);

        if (mountedRef.current) {
          setStatus("Error: " + error.message);
        }
      }
    };

    initialize();

    // --------------------------------
    // Cleanup
    // --------------------------------

    return () => {
      mountedRef.current = false;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (sessionRef.current) {
        sessionRef.current.release();

        sessionRef.current = null;
      }
    };
  }, []);

  // ----------------------------------------
  // DETECTION LOOP
  // ----------------------------------------

  const detectFrame = async () => {
    if (!mountedRef.current) {
      return;
    }

    if (
      !sessionRef.current ||
      !videoRef.current ||
      videoRef.current.readyState < 2 ||
      busyRef.current
    ) {
      scheduleNextDetection();

      return;
    }

    busyRef.current = true;

    const startTime = performance.now();

    try {
      // --------------------------------
      // Preprocess image
      // --------------------------------

      const { tensor, scale, padX, padY } = preprocessImage(videoRef.current);

      // --------------------------------
      // YOLO inference
      // --------------------------------

      const feeds = {};

      feeds[sessionRef.current.inputNames[0]] = tensor;

      const results = await sessionRef.current.run(feeds);

      const output = results[sessionRef.current.outputNames[0]];

      // --------------------------------
      // Process YOLO output
      // --------------------------------

      const detections = processOutput(
        output,
        videoRef.current.videoWidth,
        videoRef.current.videoHeight,
        scale,
        padX,
        padY,
      );

      // --------------------------------
      // Keep navigation objects
      // --------------------------------

      const navigationObjects = detections.filter((detection) =>
        NAVIGATION_CLASSES.has(detection.className),
      );

      // --------------------------------
      // Calculate direction
      // --------------------------------

      const directedObjects = addDirections(
        navigationObjects,
        videoRef.current.videoWidth,
      );

      // --------------------------------
      // Calculate walking-path relevance
      // --------------------------------

      const pathDetections = addPathStatus(
        directedObjects,
        videoRef.current.videoWidth,
        videoRef.current.videoHeight,
      );

      // --------------------------------
      // Draw detections
      // --------------------------------

      drawDetections(pathDetections);

      // --------------------------------
      // Object count
      // --------------------------------

      if (mountedRef.current) {
        setObjectCount(pathDetections.length);
      }

      // --------------------------------
      // FPS
      // --------------------------------

      const inferenceTime = performance.now() - startTime;

      const currentFPS = 1000 / inferenceTime;

      if (mountedRef.current) {
        setFps(Math.round(currentFPS * 10) / 10);
      }
    } catch (error) {
      console.error("Detection error:", error);
    }

    busyRef.current = false;

    scheduleNextDetection();
  };

  // ----------------------------------------
  // TIMER
  // ----------------------------------------

  const scheduleNextDetection = () => {
    if (!mountedRef.current) {
      return;
    }

    timerRef.current = setTimeout(detectFrame, DETECTION_INTERVAL);
  };

  // ----------------------------------------
  // DRAW
  // ----------------------------------------

  const drawDetections = (detections) => {
    const canvas = canvasRef.current;

    const video = videoRef.current;

    if (!canvas || !video) {
      return;
    }

    canvas.width = video.videoWidth;

    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const frameWidth = canvas.width;

    const frameHeight = canvas.height;

    // --------------------------------
    // WALKING PATH
    // --------------------------------

    const path = getPathGeometry(frameWidth, frameHeight);

    // Draw path fill

    ctx.beginPath();

    ctx.moveTo(path.topLeft, path.topY);

    ctx.lineTo(path.topRight, path.topY);

    ctx.lineTo(path.bottomRight, path.bottomY);

    ctx.lineTo(path.bottomLeft, path.bottomY);

    ctx.closePath();

    ctx.fillStyle = "rgba(0,255,0,0.08)";

    ctx.fill();

    // Draw path outline

    ctx.strokeStyle = "rgba(0,255,0,0.7)";

    ctx.lineWidth = 2;

    ctx.stroke();

    // --------------------------------
    // DIRECTION ZONES
    // --------------------------------

    const leftBoundary = frameWidth * 0.33;

    const rightBoundary = frameWidth * 0.67;

    ctx.lineWidth = 1;

    ctx.strokeStyle = "rgba(255,255,255,0.25)";

    // Left boundary

    ctx.beginPath();

    ctx.moveTo(leftBoundary, 0);

    ctx.lineTo(leftBoundary, frameHeight);

    ctx.stroke();

    // Right boundary

    ctx.beginPath();

    ctx.moveTo(rightBoundary, 0);

    ctx.lineTo(rightBoundary, frameHeight);

    ctx.stroke();

    // --------------------------------
    // CAMERA CENTER
    // --------------------------------

    const center = frameWidth / 2;

    ctx.strokeStyle = "rgba(255,255,255,0.5)";

    ctx.beginPath();

    ctx.moveTo(center, 0);

    ctx.lineTo(center, frameHeight);

    ctx.stroke();

    // --------------------------------
    // DETECTION BOXES
    // --------------------------------

    ctx.lineWidth = 3;

    ctx.font = "bold 15px Arial";

    detections.forEach((detection) => {
      const width = detection.x2 - detection.x1;

      const height = detection.y2 - detection.y1;

      // --------------------------------
      // Box color based on path status
      // --------------------------------

      let boxColor = "#ffffff";

      if (detection.pathStatus === "IN PATH") {
        boxColor = "#00ff66";
      } else if (detection.pathStatus === "PARTIAL") {
        boxColor = "#ffaa00";
      }

      // --------------------------------
      // Bounding box
      // --------------------------------

      ctx.strokeStyle = boxColor;

      ctx.strokeRect(detection.x1, detection.y1, width, height);

      // --------------------------------
      // Object center
      // --------------------------------

      const centerX = (detection.x1 + detection.x2) / 2;

      const centerY = (detection.y1 + detection.y2) / 2;

      // Center point

      ctx.beginPath();

      ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);

      ctx.fillStyle = "#ff0000";

      ctx.fill();

      // --------------------------------
      // Label
      // --------------------------------

      const label =
        `${detection.className} ` +
        `${(detection.score * 100).toFixed(0)}% ` +
        `${detection.direction} • ` +
        `${detection.pathStatus}`;

      const textWidth = ctx.measureText(label).width;

      const labelHeight = 27;

      const labelY = Math.max(0, detection.y1 - labelHeight);

      // Label background

      ctx.fillStyle = boxColor;

      ctx.fillRect(detection.x1, labelY, textWidth + 10, labelHeight);

      // Label text

      ctx.fillStyle = "black";

      ctx.fillText(label, detection.x1 + 5, Math.max(18, detection.y1 - 7));
    });
  };

  // ----------------------------------------
  // UI
  // ----------------------------------------

  return (
    <div style={styles.container}>
      <h1>AI Vision Assistant</h1>

      <div style={styles.status}>
        <span>
          Camera: <strong>{cameraActive ? "Active" : "Inactive"}</strong>
        </span>

        <span>
          Model:{" "}
          <strong>{modelLoaded ? "YOLO11n Loaded" : "Loading..."}</strong>
        </span>

        <span>
          Objects: <strong>{objectCount}</strong>
        </span>

        <span>
          Inference: <strong>{fps} FPS</strong>
        </span>
      </div>

      <div style={styles.cameraContainer}>
        <video ref={videoRef} autoPlay playsInline muted style={styles.video} />

        <canvas ref={canvasRef} style={styles.canvas} />
      </div>

      <p>{status}</p>

      <p style={styles.info}>LEFT ← &nbsp;&nbsp; CENTER &nbsp;&nbsp; → RIGHT</p>

      <div style={styles.legend}>
        <span>🟢 IN PATH</span>

        <span>🟠 PARTIAL</span>

        <span>⚪ OUTSIDE PATH</span>
      </div>
    </div>
  );
}

// ----------------------------------------
// STYLES
// ----------------------------------------

const styles = {
  container: {
    minHeight: "100vh",
    background: "#111",
    color: "white",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    paddingTop: "30px",
    fontFamily: "Arial, sans-serif",
  },

  status: {
    display: "flex",
    gap: "30px",
    marginBottom: "20px",
    flexWrap: "wrap",
    justifyContent: "center",
  },

  cameraContainer: {
    position: "relative",
    width: "640px",
    height: "480px",
    background: "#222",
    overflow: "hidden",
    borderRadius: "12px",
  },

  video: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    objectFit: "fill",
  },

  canvas: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  },

  info: {
    color: "#888",
    fontSize: "14px",
  },

  legend: {
    display: "flex",
    gap: "25px",
    marginTop: "10px",
    fontSize: "14px",
  },
};

export default App;
