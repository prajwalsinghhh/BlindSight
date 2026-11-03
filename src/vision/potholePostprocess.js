const CONFIDENCE_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;
const MODEL_SIZE = 640;

/**
 * Decode Ultralytics YOLO11 single-class ONNX output.
 *
 * Expected output shape: [1, 5, 8400]
 * Channels: center_x, center_y, width, height, pothole_confidence
 *
 * Coordinates are in the 640x640 letterboxed model-input space.
 */
export function processPotholeOutput(
  output,
  originalWidth,
  originalHeight,
  scale,
  padX,
  padY
) {
  const data = output.data;
  const dims = output.dims;

  if (!data || !dims || dims.length !== 3) {
    throw new Error(`Unexpected pothole output dimensions: ${dims}`);
  }

  const channels = dims[1];
  const candidates = dims[2];

  if (channels !== 5) {
    throw new Error(
      `Expected pothole model output [1, 5, N], received [${dims.join(", ")}]`
    );
  }

  const boxes = [];

  for (let i = 0; i < candidates; i++) {
    const score = data[4 * candidates + i];
    if (score < CONFIDENCE_THRESHOLD) continue;

    const centerX = data[i];
    const centerY = data[candidates + i];
    const boxWidth = data[2 * candidates + i];
    const boxHeight = data[3 * candidates + i];

    // Undo letterboxing and map coordinates back to the camera frame.
    let x1 = (centerX - boxWidth / 2 - padX) / scale;
    let y1 = (centerY - boxHeight / 2 - padY) / scale;
    let x2 = (centerX + boxWidth / 2 - padX) / scale;
    let y2 = (centerY + boxHeight / 2 - padY) / scale;

    x1 = Math.max(0, Math.min(originalWidth, x1));
    y1 = Math.max(0, Math.min(originalHeight, y1));
    x2 = Math.max(0, Math.min(originalWidth, x2));
    y2 = Math.max(0, Math.min(originalHeight, y2));

    if (x2 <= x1 || y2 <= y1) continue;

    boxes.push({
      x1,
      y1,
      x2,
      y2,
      score,
      className: "Pothole",
    });
  }

  return classAwareNms(boxes, IOU_THRESHOLD);
}

function classAwareNms(boxes, iouThreshold) {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept = [];

  while (sorted.length > 0) {
    const current = sorted.shift();
    kept.push(current);

    for (let i = sorted.length - 1; i >= 0; i--) {
      if (intersectionOverUnion(current, sorted[i]) > iouThreshold) {
        sorted.splice(i, 1);
      }
    }
  }

  return kept;
}

function intersectionOverUnion(a, b) {
  const intersectionX1 = Math.max(a.x1, b.x1);
  const intersectionY1 = Math.max(a.y1, b.y1);
  const intersectionX2 = Math.min(a.x2, b.x2);
  const intersectionY2 = Math.min(a.y2, b.y2);

  const intersectionWidth = Math.max(0, intersectionX2 - intersectionX1);
  const intersectionHeight = Math.max(0, intersectionY2 - intersectionY1);
  const intersectionArea = intersectionWidth * intersectionHeight;

  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  const unionArea = areaA + areaB - intersectionArea;

  return unionArea > 0 ? intersectionArea / unionArea : 0;
}
