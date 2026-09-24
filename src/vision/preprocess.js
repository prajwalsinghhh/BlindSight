import * as ort from "onnxruntime-web";

export const MODEL_SIZE = 640;

export function preprocessImage(video) {
  const canvas = document.createElement("canvas");

  canvas.width = MODEL_SIZE;
  canvas.height = MODEL_SIZE;

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;

  // Preserve aspect ratio
  const scale = Math.min(
    MODEL_SIZE / videoWidth,
    MODEL_SIZE / videoHeight
  );

  const newWidth = videoWidth * scale;
  const newHeight = videoHeight * scale;

  const padX = (MODEL_SIZE - newWidth) / 2;
  const padY = (MODEL_SIZE - newHeight) / 2;

  // Black letterbox
  ctx.fillStyle = "black";

  ctx.fillRect(
    0,
    0,
    MODEL_SIZE,
    MODEL_SIZE
  );

  // Draw webcam image
  ctx.drawImage(
    video,
    padX,
    padY,
    newWidth,
    newHeight
  );

  const imageData = ctx.getImageData(
    0,
    0,
    MODEL_SIZE,
    MODEL_SIZE
  );

  const area = MODEL_SIZE * MODEL_SIZE;

  // CHW format:
  // [R...][G...][B...]

  const input = new Float32Array(
    3 * area
  );

  for (let i = 0; i < area; i++) {
    const pixel = i * 4;

    input[i] =
      imageData.data[pixel] / 255;

    input[area + i] =
      imageData.data[pixel + 1] / 255;

    input[2 * area + i] =
      imageData.data[pixel + 2] / 255;
  }

  const tensor = new ort.Tensor(
    "float32",
    input,
    [
      1,
      3,
      MODEL_SIZE,
      MODEL_SIZE,
    ]
  );

  return {
    tensor,
    scale,
    padX,
    padY,
  };
}