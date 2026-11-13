import * as ort from "onnxruntime-web";

export const MODEL_SIZE = 640;

// One reusable canvas (the original created a new canvas for every frame).
let canvas = null;
let ctx = null;

function getContext() {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = MODEL_SIZE;
    canvas.height = MODEL_SIZE;
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  return ctx;
}

/** Works for <video> (phone camera) and <img> (MJPEG stream from the ESP32-CAM). */
export function getFrameSize(el) {
  return {
    width: el.videoWidth || el.naturalWidth || 0,
    height: el.videoHeight || el.naturalHeight || 0,
  };
}

export function preprocessImage(source) {
  const { width: videoWidth, height: videoHeight } = getFrameSize(source);
  if (!videoWidth || !videoHeight) throw new Error("No frame available yet");

  const c = getContext();

  // Preserve aspect ratio (letterbox) - unchanged from the original.
  const scale = Math.min(MODEL_SIZE / videoWidth, MODEL_SIZE / videoHeight);
  const newWidth = videoWidth * scale;
  const newHeight = videoHeight * scale;
  const padX = (MODEL_SIZE - newWidth) / 2;
  const padY = (MODEL_SIZE - newHeight) / 2;

  c.fillStyle = "black";
  c.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE);
  c.drawImage(source, padX, padY, newWidth, newHeight);

  // Throws SecurityError if a cross-origin stream has no CORS header.
  const imageData = c.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE);
  const data = imageData.data;
  const area = MODEL_SIZE * MODEL_SIZE;

  const input = new Float32Array(3 * area);
  for (let i = 0; i < area; i++) {
    const p = i * 4;
    input[i] = data[p] / 255;
    input[area + i] = data[p + 1] / 255;
    input[2 * area + i] = data[p + 2] / 255;
  }

  // Cheap checksum of sampled pixels: if it never changes, the stream is frozen.
  let signature = 0;
  for (let i = 0; i < data.length; i += 4 * 997) {
    signature = (signature * 31 + data[i] + data[i + 1] + data[i + 2]) | 0;
  }

  const tensor = new ort.Tensor("float32", input, [1, 3, MODEL_SIZE, MODEL_SIZE]);
  return { tensor, scale, padX, padY, signature, width: videoWidth, height: videoHeight };
}
