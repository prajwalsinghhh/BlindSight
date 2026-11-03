import { useEffect, useRef, useState } from "react";
import * as ort from "onnxruntime-web";

import { NAVIGATION_CLASSES } from "./constants/classes";
import { preprocessImage } from "./vision/preprocess";
import { processOutput } from "./vision/postprocess";
import { processPotholeOutput } from "./vision/potholePostprocess";
import { addDirections } from "./navigation/direction";
import { getPathGeometry, addPathStatus } from "./navigation/pathAnalysis";

const MODEL_PATH = "/models/yolo11n.onnx";
const POTHOLE_MODEL_PATH = "/models/pothole_yolo11n.onnx";
const DETECTION_INTERVAL = 150;

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const sessionRef = useRef(null);
  const potholeSessionRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  const [cameraActive, setCameraActive] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [potholeModelLoaded, setPotholeModelLoaded] = useState(false);
  const [status, setStatus] = useState("Loading YOLO models...");
  const [objectCount, setObjectCount] = useState(0);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    mountedRef.current = true;

    const initialize = async () => {
      try {
        setStatus("Loading existing YOLO11n model...");
        const session = await ort.InferenceSession.create(MODEL_PATH);

        if (!mountedRef.current) {
          await session.release();
          return;
        }

        sessionRef.current = session;
        console.log("Existing YOLO loaded", session.inputNames, session.outputNames);
        setModelLoaded(true);

        // Load the pothole detector independently. If it fails, the original
        // navigation detector and camera can still run.
        try {
          setStatus("Loading pothole detector...");
          const potholeSession = await ort.InferenceSession.create(POTHOLE_MODEL_PATH);

          if (!mountedRef.current) {
            await potholeSession.release();
            return;
          }

          potholeSessionRef.current = potholeSession;
          console.log(
            "Pothole model loaded",
            potholeSession.inputNames,
            potholeSession.outputNames
          );
          setPotholeModelLoaded(true);
        } catch (error) {
          console.error("Pothole model failed to load:", error);
          if (mountedRef.current) {
            setStatus(`Original model loaded; pothole model unavailable: ${error.message}`);
          }
        }

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

        if (!mountedRef.current) return;

        setCameraActive(true);
        setStatus(
          potholeSessionRef.current
            ? "YOLO11n and pothole detector ready"
            : "YOLO11n ready (pothole detector unavailable)"
        );
        detectFrame();
      } catch (error) {
        console.error(error);
        if (mountedRef.current) setStatus("Error: " + error.message);
      }
    };

    initialize();

    return () => {
      mountedRef.current = false;

      if (timerRef.current) clearTimeout(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (sessionRef.current) {
        sessionRef.current.release();
        sessionRef.current = null;
      }
      if (potholeSessionRef.current) {
        potholeSessionRef.current.release();
        potholeSessionRef.current = null;
      }
    };
  }, []);

  const detectFrame = async () => {
    if (!mountedRef.current) return;

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
    let tensor;

    try {
      const { tensor: inputTensor, scale, padX, padY } = preprocessImage(videoRef.current);
      tensor = inputTensor;
      const videoWidth = videoRef.current.videoWidth;
      const videoHeight = videoRef.current.videoHeight;

      // Existing 80-class detector.
      const existingFeeds = {
        [sessionRef.current.inputNames[0]]: tensor,
      };
      const existingResults = await sessionRef.current.run(existingFeeds);
      const existingOutput = existingResults[sessionRef.current.outputNames[0]];

      const existingDetections = processOutput(
        existingOutput,
        videoWidth,
        videoHeight,
        scale,
        padX,
        padY
      );

      const navigationObjects = existingDetections.filter((detection) =>
        NAVIGATION_CLASSES.has(detection.className)
      );

      // New one-class pothole detector. Its output is [1, 5, 8400],
      // so it must use its own decoder rather than the 80-class decoder.
      let potholeDetections = [];
      if (potholeSessionRef.current) {
        const potholeFeeds = {
          [potholeSessionRef.current.inputNames[0]]: tensor,
        };
        const potholeResults = await potholeSessionRef.current.run(potholeFeeds);
        const potholeOutput = potholeResults[potholeSessionRef.current.outputNames[0]];

        potholeDetections = processPotholeOutput(
          potholeOutput,
          videoWidth,
          videoHeight,
          scale,
          padX,
          padY
        );
      }

      const combinedDetections = [...navigationObjects, ...potholeDetections];
      const directedObjects = addDirections(combinedDetections, videoWidth);
      const pathDetections = addPathStatus(directedObjects, videoWidth, videoHeight);

      drawDetections(pathDetections);

      if (mountedRef.current) {
        setObjectCount(pathDetections.length);
        const inferenceTime = performance.now() - startTime;
        setFps(Math.round((1000 / inferenceTime) * 10) / 10);
      }
    } catch (error) {
      console.error("Detection error:", error);
      if (mountedRef.current) setStatus(`Detection error: ${error.message}`);
    } finally {
      // Release the input tensor after both models have finished using it.
      if (tensor && typeof tensor.dispose === "function") tensor.dispose();
      busyRef.current = false;
      scheduleNextDetection();
    }
  };

  const scheduleNextDetection = () => {
    if (!mountedRef.current) return;
    timerRef.current = setTimeout(detectFrame, DETECTION_INTERVAL);
  };

  const drawDetections = (detections) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const frameWidth = canvas.width;
    const frameHeight = canvas.height;
    const path = getPathGeometry(frameWidth, frameHeight);

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

    const leftBoundary = frameWidth * 0.33;
    const rightBoundary = frameWidth * 0.67;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";

    ctx.beginPath();
    ctx.moveTo(leftBoundary, 0);
    ctx.lineTo(leftBoundary, frameHeight);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rightBoundary, 0);
    ctx.lineTo(rightBoundary, frameHeight);
    ctx.stroke();

    const center = frameWidth / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.moveTo(center, 0);
    ctx.lineTo(center, frameHeight);
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.font = "bold 15px Arial";

    detections.forEach((detection) => {
      const width = detection.x2 - detection.x1;
      const height = detection.y2 - detection.y1;
      const isPothole =
        detection.className?.toLowerCase().includes("pothole");

      let boxColor = isPothole ? "#ff3b30" : "#ffffff";
      if (detection.pathStatus === "IN PATH") {
        boxColor = isPothole ? "#ff3b30" : "#00ff66";
      } else if (detection.pathStatus === "PARTIAL") {
        boxColor = "#ffaa00";
      }

      ctx.strokeStyle = boxColor;
      ctx.strokeRect(detection.x1, detection.y1, width, height);

      const centerX = (detection.x1 + detection.x2) / 2;
      const centerY = (detection.y1 + detection.y2) / 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#ff0000";
      ctx.fill();

      const label =
        `${detection.className} ` +
        `${(detection.score * 100).toFixed(0)}% ` +
        `${detection.direction} • ${detection.pathStatus}`;

      const textWidth = ctx.measureText(label).width;
      const labelHeight = 27;
      const labelY = Math.max(0, detection.y1 - labelHeight);

      ctx.fillStyle = boxColor;
      ctx.fillRect(detection.x1, labelY, textWidth + 10, labelHeight);
      ctx.fillStyle = "black";
      ctx.fillText(label, detection.x1 + 5, Math.max(18, detection.y1 - 7));
    });
  };

  return (
    <div style={styles.container}>
      <h1>AI Vision Assistant</h1>

      <div style={styles.status}>
        <span>
          Camera: <strong>{cameraActive ? "Active" : "Inactive"}</strong>
        </span>
        <span>
          Existing model: <strong>{modelLoaded ? "Loaded" : "Loading..."}</strong>
        </span>
        <span>
          Pothole model:{" "}
          <strong>{potholeModelLoaded ? "Loaded" : "Unavailable / loading"}</strong>
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
        <span>🔴 POTHOLE</span>
      </div>
    </div>
  );
}

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
    flexWrap: "wrap",
    justifyContent: "center",
  },
};

export default App;
